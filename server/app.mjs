import { createHash, timingSafeEqual } from "node:crypto";
import { createReadStream, existsSync, realpathSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, relative as relativePath, resolve, sep } from "node:path";
import { pipeline } from "node:stream/promises";
import { PRACTICE_PACK_SYSTEM_PROMPT, TEACHING_AGENTS, publicAgentList } from "./agents.mjs";
import { RevisionConflictError } from "./db.mjs";
import { ModelUnavailableError, ModelUpstreamError } from "./model-client.mjs";

const MIME = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".woff2", "font/woff2"],
]);

class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function sendJson(res, status, payload, headers = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
    ...headers,
  });
  res.end(body);
}

function fail(status, code, message, details) {
  throw new HttpError(status, code, message, details);
}

async function readJson(req, limitBytes) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limitBytes) fail(413, "PAYLOAD_TOO_LARGE", `请求体不能超过 ${limitBytes} 字节`);
    chunks.push(chunk);
  }
  if (!chunks.length) fail(400, "EMPTY_BODY", "请求体为空");
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    fail(400, "INVALID_JSON", "请求体不是有效 JSON");
  }
}

function hashState(state) {
  return createHash("sha256").update(JSON.stringify(state)).digest("hex");
}

function parseBaseRevision(req, body) {
  const ifMatch = req.headers["if-match"];
  const candidate = ifMatch != null ? String(ifMatch).replace(/^W\//, "").replaceAll('"', "") : body.baseRevision;
  if (candidate == null || candidate === "") {
    fail(428, "REVISION_REQUIRED", "更新状态时必须提供 If-Match 或 baseRevision");
  }
  const revision = Number(candidate);
  if (!Number.isInteger(revision) || revision < 0) fail(400, "INVALID_REVISION", "baseRevision 必须是非负整数");
  return revision;
}

function validateWorkspaceId(value) {
  if (!/^[a-zA-Z0-9._-]{1,64}$/.test(value)) fail(400, "INVALID_WORKSPACE_ID", "workspaceId 格式无效");
  return value;
}

function validateChat(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) fail(400, "INVALID_BODY", "请求体必须是对象");
  const agent = TEACHING_AGENTS[body.agentId];
  if (!agent) fail(400, "UNKNOWN_AGENT", "agentId 不存在");
  if (!Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > 40) {
    fail(400, "INVALID_MESSAGES", "messages 需包含 1–40 条消息");
  }
  let inputChars = 0;
  const messages = body.messages.map((message, index) => {
    if (!message || !["user", "assistant"].includes(message.role) || typeof message.content !== "string") {
      fail(400, "INVALID_MESSAGE", `messages[${index}] 仅支持 user/assistant 文本消息`);
    }
    const content = message.content.trim();
    if (!content) fail(400, "INVALID_MESSAGE", `messages[${index}].content 不能为空`);
    inputChars += content.length;
    return { role: message.role, content };
  });
  if (inputChars > 60_000) fail(413, "CHAT_TOO_LARGE", "对话文本总长度不能超过 60000 字符");
  const temperature = body.temperature == null ? 0.3 : Number(body.temperature);
  if (!Number.isFinite(temperature) || temperature < 0 || temperature > 1) {
    fail(400, "INVALID_TEMPERATURE", "temperature 必须在 0–1 之间");
  }
  const maxTokens = body.maxTokens == null ? 1_200 : Number(body.maxTokens);
  if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 4_096) {
    fail(400, "INVALID_MAX_TOKENS", "maxTokens 必须在 1–4096 之间");
  }
  return {
    agent,
    messages: [{ role: "system", content: agent.systemPrompt }, ...messages],
    inputChars,
    stream: body.stream === true,
    temperature,
    maxTokens,
  };
}

const PRACTICE_PACK_KEYS = Object.freeze([
  "env01", "env02", "env03", "env04", "env05", "env06", "env07", "env08", "env09",
]);

function textField(value, name, { max = 240, required = true } = {}) {
  if (value == null && !required) return "";
  if (typeof value !== "string") fail(400, "INVALID_PRACTICE_CONTEXT", `${name} 必须是文本`);
  const text = value.trim();
  if (required && !text) fail(400, "INVALID_PRACTICE_CONTEXT", `${name} 不能为空`);
  if (text.length > max) fail(400, "INVALID_PRACTICE_CONTEXT", `${name} 不能超过 ${max} 字符`);
  return text;
}

function validatePracticePackRequest(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    fail(400, "INVALID_BODY", "请求体必须是对象");
  }
  const context = body.context;
  if (!context || typeof context !== "object" || Array.isArray(context)) {
    fail(400, "INVALID_PRACTICE_CONTEXT", "context 必须是对象");
  }
  const studentCount = Number(context.studentCount);
  const durationMinutes = Number(context.durationMinutes);
  if (!Number.isInteger(studentCount) || studentCount < 1 || studentCount > 500) {
    fail(400, "INVALID_PRACTICE_CONTEXT", "studentCount 必须是 1–500 的整数");
  }
  if (!Number.isInteger(durationMinutes) || durationMinutes < 10 || durationMinutes > 600) {
    fail(400, "INVALID_PRACTICE_CONTEXT", "durationMinutes 必须是 10–600 的整数");
  }

  const normalizedContext = {
    chapterId: textField(context.chapterId, "context.chapterId", { max: 80 }),
    courseTitle: textField(context.courseTitle, "context.courseTitle"),
    courseLevel: textField(context.courseLevel, "context.courseLevel", { max: 40, required: false }),
    classTitle: textField(context.classTitle, "context.classTitle"),
    studentCount,
    sessionTitle: textField(context.sessionTitle, "context.sessionTitle"),
    durationMinutes,
    chapterTitle: textField(context.chapterTitle, "context.chapterTitle"),
    topic: textField(context.topic, "context.topic"),
  };

  const currentPack = body.currentPack;
  if (!currentPack || typeof currentPack !== "object" || Array.isArray(currentPack)) {
    fail(400, "INVALID_PRACTICE_PACK", "currentPack 必须包含九个教学环节");
  }
  const normalizedPack = {};
  let inputChars = JSON.stringify(normalizedContext).length;
  for (const key of PRACTICE_PACK_KEYS) {
    normalizedPack[key] = textField(currentPack[key], `currentPack.${key}`, { max: 1_200 });
    inputChars += normalizedPack[key].length;
  }
  return { context: normalizedContext, currentPack: normalizedPack, inputChars };
}

function extractFirstJsonObject(content) {
  if (typeof content !== "string") return null;
  const start = content.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < content.length; index += 1) {
    const char = content[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return content.slice(start, index + 1);
    }
  }
  return null;
}

function parsePracticePackResponse(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  const jsonText = extractFirstJsonObject(content);
  if (!jsonText) fail(502, "MODEL_OUTPUT_INVALID", "本地模型没有返回实践包 JSON");
  let parsed;
  try { parsed = JSON.parse(jsonText); }
  catch { fail(502, "MODEL_OUTPUT_INVALID", "本地模型返回的实践包 JSON 无法解析"); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    fail(502, "MODEL_OUTPUT_INVALID", "本地模型返回的实践包格式无效");
  }
  const pack = {};
  for (const key of PRACTICE_PACK_KEYS) {
    if (typeof parsed[key] !== "string" || !parsed[key].trim()) {
      fail(502, "MODEL_OUTPUT_INVALID", `本地模型返回的 ${key} 为空`);
    }
    const value = parsed[key].trim();
    if (value.length > 1_200) fail(502, "MODEL_OUTPUT_INVALID", `本地模型返回的 ${key} 过长`);
    pack[key] = value;
  }
  return pack;
}

function buildPracticePackMessages(input) {
  return [
    { role: "system", content: PRACTICE_PACK_SYSTEM_PROMPT },
    {
      role: "user",
      content: `请基于以下数据生成新的课堂实践包。\n<teaching_context>\n${JSON.stringify(input.context, null, 2)}\n</teaching_context>\n<current_pack>\n${JSON.stringify(input.currentPack, null, 2)}\n</current_pack>`,
    },
  ];
}

function authorized(req, expectedToken) {
  if (!expectedToken) return true;
  const bearer = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : "";
  const supplied = bearer || req.headers["x-pharmaco-token"] || "";
  const left = Buffer.from(String(supplied));
  const right = Buffer.from(expectedToken);
  return left.length === right.length && timingSafeEqual(left, right);
}

// 后端迁入仓库根后,webRoot 与源码/依赖/状态库同级。静态路由使用正向白名单,
// 只暴露正式站点入口和运行时资源;新增仓库文件默认不可下载,避免黑名单漏项或
// macOS 大小写不敏感文件系统上的目录名变体绕过。
const PUBLIC_ROOT_FILES = new Set([
  "index.html", "login.html", "nav-detail.html", "data-detail.html",
  "practice-detail.html", "opening-story.html", "nav-3d.html",
]);
const PUBLIC_DIR_EXTENSIONS = new Map([
  ["assets", new Set([".svg", ".png", ".jpg", ".jpeg", ".webp", ".woff2"])],
  ["dist", new Set([".css", ".js", ".json"])],
  ["shared", new Set([".css", ".js", ".json", ".svg", ".png", ".jpg", ".jpeg", ".webp", ".woff2"])],
]);
function staticAllowed(relative) {
  const segments = relative.split(/[\\/]+/).filter(Boolean);
  if (!segments.length || segments.some((segment) => segment.startsWith("."))) return false;
  if (segments.length === 1) return PUBLIC_ROOT_FILES.has(segments[0]);
  const extensions = PUBLIC_DIR_EXTENSIONS.get(segments[0]);
  return extensions?.has(extname(segments.at(-1)).toLowerCase()) === true;
}

async function serveStatic(req, res, pathname, webRoot) {
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  let decoded;
  try { decoded = decodeURIComponent(pathname); }
  catch { fail(400, "INVALID_PATH", "URL 路径编码无效"); }
  if (decoded.includes("\0")) fail(400, "INVALID_PATH", "URL 路径无效");
  const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  if (!staticAllowed(relative)) fail(403, "PATH_FORBIDDEN", "拒绝访问");
  const filePath = resolve(webRoot, relative);
  if (filePath !== webRoot && !filePath.startsWith(webRoot + sep)) fail(403, "PATH_FORBIDDEN", "拒绝访问");
  if (!existsSync(filePath) || !statSync(filePath).isFile()) return false;

  // 即使公开目录里误放了指向仓库内部文件的符号链接,也不能借此绕过白名单。
  const canonicalRoot = realpathSync(webRoot);
  const canonicalFile = realpathSync(filePath);
  const canonicalRelative = relativePath(canonicalRoot, canonicalFile);
  if (canonicalRelative.startsWith(`..${sep}`) || canonicalRelative === ".." || !staticAllowed(canonicalRelative)) {
    fail(403, "PATH_FORBIDDEN", "拒绝访问");
  }

  const stat = statSync(canonicalFile);
  res.writeHead(200, {
    "content-type": MIME.get(extname(filePath).toLowerCase()) || "application/octet-stream",
    "content-length": stat.size,
    "cache-control": extname(filePath) === ".html" ? "no-cache" : "public, max-age=300",
  });
  if (req.method === "HEAD") res.end();
  else await pipeline(createReadStream(canonicalFile), res);
  return true;
}

export function createPharmacoServer({ config, database, modelClient, logger = console }) {
  async function handleApi(req, res, url) {
    if (!authorized(req, config.apiToken)) {
      sendJson(res, 401, { error: { code: "UNAUTHORIZED", message: "API token 无效" } }, { "www-authenticate": "Bearer" });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/health") {
      sendJson(res, 200, {
        ok: true,
        service: "pharmaco-backend",
        database: database.ping() ? "ready" : "unavailable",
        model: { endpoint: config.modelBaseUrl, name: config.modelName, status: "check /api/model/status" },
        now: new Date().toISOString(),
      });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/model/status") {
      const status = await modelClient.status();
      sendJson(res, status.ready ? 200 : 503, status);
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/agents") {
      sendJson(res, 200, { agents: publicAgentList() });
      return;
    }

    const stateMatch = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/state$/);
    if (stateMatch) {
      const workspaceId = validateWorkspaceId(stateMatch[1]);
      if (req.method === "GET") {
        const current = database.getState(workspaceId);
        sendJson(res, 200, current, { etag: `"${current.revision}"` });
        return;
      }
      if (req.method === "PUT") {
        const body = await readJson(req, config.bodyLimitBytes);
        if (!body.state || typeof body.state !== "object" || Array.isArray(body.state)) {
          fail(400, "INVALID_STATE", "state 必须是 JSON 对象");
        }
        const baseRevision = parseBaseRevision(req, body);
        const saved = database.putState(workspaceId, baseRevision, body.state, hashState(body.state));
        sendJson(res, 200, saved, { etag: `"${saved.revision}"` });
        return;
      }
      fail(405, "METHOD_NOT_ALLOWED", "该状态接口仅支持 GET/PUT");
    }

    if (req.method === "POST" && url.pathname === "/api/chat") {
      const body = await readJson(req, config.bodyLimitBytes);
      const chat = validateChat(body);
      const started = performance.now();
      const abortController = new AbortController();
      const abort = () => abortController.abort();
      req.once("aborted", abort);
      res.once("close", () => { if (!res.writableEnded) abort(); });
      let status = "error";
      try {
        const upstream = await modelClient.chat({ ...chat, signal: abortController.signal });
        if (!chat.stream) {
          const payload = await upstream.json();
          status = "ok";
          sendJson(res, 200, payload);
          return;
        }

        res.writeHead(200, {
          "content-type": upstream.headers.get("content-type") || "text/event-stream; charset=utf-8",
          "cache-control": "no-cache, no-transform",
          connection: "keep-alive",
          "x-accel-buffering": "no",
        });
        for await (const chunk of upstream.body) res.write(chunk);
        status = "ok";
        res.end();
      } finally {
        database.recordInference({
          agentId: chat.agent.id,
          modelName: config.modelName,
          status,
          latencyMs: performance.now() - started,
          inputChars: chat.inputChars,
        });
      }
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/practice/generate") {
      const body = await readJson(req, config.bodyLimitBytes);
      const input = validatePracticePackRequest(body);
      const started = performance.now();
      const abortController = new AbortController();
      const abort = () => abortController.abort();
      req.once("aborted", abort);
      res.once("close", () => { if (!res.writableEnded) abort(); });
      let status = "error";
      try {
        const upstream = await modelClient.chat({
          messages: buildPracticePackMessages(input),
          stream: false,
          temperature: 0.25,
          maxTokens: 1_200,
          signal: abortController.signal,
        });
        let payload;
        try { payload = await upstream.json(); }
        catch { fail(502, "MODEL_OUTPUT_INVALID", "本地模型返回的响应不是有效 JSON"); }
        const pack = parsePracticePackResponse(payload);
        status = "ok";
        sendJson(res, 200, {
          source: "local-model",
          model: payload?.model || config.modelName,
          chapterId: input.context.chapterId,
          generatedAt: new Date().toISOString(),
          pack,
        });
      } finally {
        database.recordInference({
          agentId: "practice-pack-generator",
          modelName: config.modelName,
          status,
          latencyMs: performance.now() - started,
          inputChars: input.inputChars,
        });
      }
      return;
    }

    fail(404, "API_NOT_FOUND", "API 路径不存在");
  }

  const server = createServer(async (req, res) => {
    res.setHeader("x-content-type-options", "nosniff");
    res.setHeader("referrer-policy", "same-origin");
    res.setHeader("x-frame-options", "SAMEORIGIN");
    try {
      const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
      if (url.pathname.startsWith("/api/")) {
        await handleApi(req, res, url);
        return;
      }
      if (await serveStatic(req, res, url.pathname, config.webRoot)) return;
      sendJson(res, 404, { error: { code: "NOT_FOUND", message: "页面不存在" } });
    } catch (error) {
      if (res.headersSent) {
        if (!res.writableEnded) res.end();
        return;
      }
      if (error instanceof RevisionConflictError) {
        sendJson(res, 409, {
          error: { code: "REVISION_CONFLICT", message: error.message },
          current: error.current,
        }, { etag: `"${error.current.revision}"` });
        return;
      }
      if (error instanceof ModelUnavailableError) {
        sendJson(res, 503, { error: { code: "MODEL_UNAVAILABLE", message: error.message } });
        return;
      }
      if (error instanceof ModelUpstreamError) {
        sendJson(res, 502, { error: { code: "MODEL_UPSTREAM_ERROR", message: error.message, detail: error.detail } });
        return;
      }
      if (error instanceof HttpError) {
        sendJson(res, error.status, { error: { code: error.code, message: error.message, details: error.details } });
        return;
      }
      logger.error?.("[pharmaco] unhandled request error", error);
      sendJson(res, 500, { error: { code: "INTERNAL_ERROR", message: "服务器内部错误" } });
    }
  });
  return server;
}
