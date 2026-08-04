import { createHash, timingSafeEqual } from "node:crypto";
import { createReadStream, existsSync, realpathSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, relative as relativePath, resolve, sep } from "node:path";
import { pipeline } from "node:stream/promises";
import {
  PRACTICE_PACK_SYSTEM_PROMPT,
  PRACTICE_REVIEWERS,
  TEACHING_AGENTS,
  publicAgentList,
} from "./agents.mjs";
import { RevisionConflictError } from "./db.mjs";
import { ModelUnavailableError, ModelUpstreamError } from "./model-client.mjs";
import { anchorAnnotation, anchorCrossReferences } from "../tools/anchor-gate.mjs";
import { listEvidenceLinks, listS1Claims } from "./product-core/claims.mjs";
import {
  getEffectiveDecision,
  listDecisionRecords,
  recordClaimId,
  submitTeacherDecision,
} from "./product-core/decisions.mjs";
import { appendAuditEvent } from "./product-core/audit.mjs";
import { failCode, ProductCoreError } from "./product-core/errors.mjs";
import { newId, nowIso } from "./product-core/ids.mjs";
import { searchKnowledge } from "./product-core/knowledge-retrieval-service.mjs";
import { setUnitReviewStatus } from "./product-core/knowledge-unit-service.mjs";
import {
  computeFactsAndAdvance,
  enterTeacherReview,
  generateClaimsAndAdvance,
  importPretestAndAdvance,
  insertCohort,
  insertCourse,
  insertLesson,
  publish,
  reviewAndAdvance,
  startS1Workflow,
  validateAndAdvance,
} from "./product-core/s1-service.mjs";
import { SchemaValidationError } from "./product-core/schemas.mjs";
import { getWorkflow, TERMINAL_STATES, TRANSITIONS } from "./product-core/workflow.mjs";

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

// 产品内核错误 → HTTP 状态码(docs/product-core/s1-state-machine.md §5);
// code 原样进入 {error:{code,message,details}},找不到类错误归 404,其余 400。
const PRODUCT_CORE_HTTP_STATUS = new Map([
  ["WF_ILLEGAL_TRANSITION", 409],
  ["WF_VERSION_CONFLICT", 409],
  ["IMMUTABLE_RECORD", 409],
  ["SCHEMA_VALIDATION_FAILED", 422],
  ["GATE_VALIDATION_FAILED", 422],
  ["PUBLISH_NO_TEACHER_DECISION", 422],
  ["PUBLISH_REJECTED_CONTENT", 422],
  ["EVIDENCE_ANCHOR_INVALID", 422],
  ["OBSERVATION_RECALC_MISMATCH", 422],
  ["CROSS_SCOPE_REFERENCE", 422],
  ["PRETEST_FIXTURE_INVALID", 422],
  ["TEACHER_DECISION_INVALID", 422],
  ["PROVIDER_NOT_ENABLED", 422],
  ["PROVIDER_CONTRACT_VIOLATION", 422],
  ["WF_INSTANCE_NOT_FOUND", 404],
  ["DECISION_RECORD_NOT_FOUND", 404],
]);
function productCoreHttpStatus(code) {
  if (PRODUCT_CORE_HTTP_STATUS.has(code)) return PRODUCT_CORE_HTTP_STATUS.get(code);
  return typeof code === "string" && code.endsWith("_NOT_FOUND") ? 404 : 400;
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

  const currentPack = body.designBriefs || body.currentPack;
  if (!currentPack || typeof currentPack !== "object" || Array.isArray(currentPack)) {
    fail(400, "INVALID_PRACTICE_PACK", "designBriefs 必须包含九个教学环节");
  }
  const normalizedPack = {};
  let inputChars = JSON.stringify(normalizedContext).length;
  for (const key of PRACTICE_PACK_KEYS) {
    normalizedPack[key] = textField(currentPack[key], `designBriefs.${key}`, { max: 4_000 });
    inputChars += normalizedPack[key].length;
  }
  const targetEnv = body.targetEnv == null || body.targetEnv === ""
    ? null
    : textField(body.targetEnv, "targetEnv", { max: 5 });
  if (targetEnv && !PRACTICE_PACK_KEYS.includes(targetEnv)) {
    fail(400, "INVALID_TARGET_ENV", "targetEnv 必须是 env01–env09");
  }
  let generatedPack = null;
  if (body.generatedPack != null) {
    if (!body.generatedPack || typeof body.generatedPack !== "object" || Array.isArray(body.generatedPack)) {
      fail(400, "INVALID_GENERATED_PACK", "generatedPack 必须包含九个教学环节");
    }
    generatedPack = {};
    for (const key of PRACTICE_PACK_KEYS) {
      generatedPack[key] = textField(body.generatedPack[key], `generatedPack.${key}`, { max: 4_000 });
      inputChars += generatedPack[key].length;
    }
  }
  if (targetEnv && !generatedPack) {
    fail(400, "INVALID_GENERATED_PACK", "重新生成指定环节时必须提供当前 generatedPack");
  }
  return {
    context: normalizedContext,
    currentPack: normalizedPack,
    designBriefs: normalizedPack,
    generatedPack,
    targetEnv,
    inputChars,
  };
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

// 部分本地模型会把多行结构直接放进 JSON 字符串，形成未转义换行。
// 只修复字符串内部的控制字符，不改键、括号、逗号或任何教学内容。
function escapeControlCharsInsideJsonStrings(value) {
  let output = "";
  let inString = false;
  let escaped = false;
  for (const char of String(value || "")) {
    if (escaped) {
      output += char;
      escaped = false;
      continue;
    }
    if (char === "\\" && inString) {
      output += char;
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      output += char;
      continue;
    }
    if (inString && char === "\n") output += "\\n";
    else if (inString && char === "\r") output += "\\r";
    else if (inString && char === "\t") output += "\\t";
    else output += char;
  }
  return output;
}

function parsePracticePackResponse(payload, targetEnv = null) {
  const content = payload?.choices?.[0]?.message?.content;
  const jsonText = extractFirstJsonObject(content);
  if (!jsonText) fail(502, "MODEL_OUTPUT_INVALID", "本地模型没有返回实践包 JSON");
  let parsed;
  try { parsed = JSON.parse(jsonText); }
  catch {
    try { parsed = JSON.parse(escapeControlCharsInsideJsonStrings(jsonText)); }
    catch { fail(502, "MODEL_OUTPUT_INVALID", "本地模型返回的实践包 JSON 无法解析"); }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    fail(502, "MODEL_OUTPUT_INVALID", "本地模型返回的实践包格式无效");
  }
  const pack = {};
  const expectedKeys = targetEnv ? [targetEnv] : PRACTICE_PACK_KEYS;
  for (const key of expectedKeys) {
    if (typeof parsed[key] !== "string" || !parsed[key].trim()) {
      fail(502, "MODEL_OUTPUT_INVALID", `本地模型返回的 ${key} 为空`);
    }
    const value = parsed[key].trim();
    if (value.length > 4_000) fail(502, "MODEL_OUTPUT_INVALID", `本地模型返回的 ${key} 过长`);
    pack[key] = value;
  }
  return pack;
}

function buildPracticePackMessages(input) {
  return [
    { role: "system", content: PRACTICE_PACK_SYSTEM_PROMPT },
    {
      role: "user",
      content: `请基于以下数据生成课堂实践包。\n<requested_env>\n${input.targetEnv || ""}\n</requested_env>\n<teaching_context>\n${JSON.stringify(input.context, null, 2)}\n</teaching_context>\n<design_briefs>\n${JSON.stringify(input.designBriefs, null, 2)}\n</design_briefs>\n<current_generated_pack>\n${JSON.stringify(input.generatedPack || {}, null, 2)}\n</current_generated_pack>`,
    },
  ];
}

const PRACTICE_REVIEW_TEMPERATURE = 0.2;
const PRACTICE_REVIEW_MAX_TOKENS = 900;
// 凝练上限与审校 prompt 的表达规则一致；超长不进入锚定，交给修正环重写一次。
const PRACTICE_REVIEW_ISSUE_MAX_CHARS = 60;
const PRACTICE_REVIEW_SUGGESTION_MAX_CHARS = 70;
// 进入缓存键，确保编排语义变化后不复用旧批次结果。当前版本只承诺：
// 批量请求共享“批次开始前已存在的锚点快照”，不宣称批内完成顺序会驱动避让。
const PRACTICE_REVIEW_ORCHESTRATION_VERSION = "preexisting-anchor-snapshot-v1";

function validatePracticeReviewRequest(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    fail(400, "INVALID_BODY", "请求体必须是对象");
  }
  const reviewer = PRACTICE_REVIEWERS[body.reviewerId];
  if (!reviewer) fail(400, "UNKNOWN_PRACTICE_REVIEWER", "reviewerId 不存在");
  const input = validatePracticePackRequest(body);
  const sourceRevision = Number(body.sourceRevision);
  if (!Number.isInteger(sourceRevision) || sourceRevision < 0) {
    fail(400, "INVALID_SOURCE_REVISION", "sourceRevision 必须是非负整数");
  }
  // 同段避让：五路并发时把已锚定批注占用的段落传给后续请求，属提示不属门禁。
  const avoidAnchors = [];
  if (body.avoidAnchors !== undefined) {
    if (!Array.isArray(body.avoidAnchors) || body.avoidAnchors.length > 8) {
      fail(400, "INVALID_AVOID_ANCHORS", "avoidAnchors 必须是不超过 8 项的数组");
    }
    for (const item of body.avoidAnchors) {
      const targetEnv = typeof item?.targetEnv === "string" ? item.targetEnv : "";
      const sourceExcerpt = typeof item?.sourceExcerpt === "string" ? item.sourceExcerpt.trim() : "";
      if (!PRACTICE_PACK_KEYS.includes(targetEnv) || !sourceExcerpt || sourceExcerpt.length > 400) {
        fail(400, "INVALID_AVOID_ANCHORS", "avoidAnchors 每项需要合法 targetEnv 与非空 sourceExcerpt（不超过 400 字）");
      }
      avoidAnchors.push({ targetEnv, sourceExcerpt });
    }
  }
  const canonicalAvoidAnchors = [...new Map(avoidAnchors
    .map((item) => [`${item.targetEnv}\u0000${item.sourceExcerpt}`, item])).values()]
    .sort((left, right) => left.targetEnv.localeCompare(right.targetEnv)
      || left.sourceExcerpt.localeCompare(right.sourceExcerpt));
  return { ...input, reviewer, sourceRevision, avoidAnchors: canonicalAvoidAnchors };
}

function reviewText(value, name, { max = 1_200, required = true } = {}) {
  if (typeof value !== "string") return { ok: false, reason: `${name}_not_text` };
  const text = value.trim();
  if (required && !text) return { ok: false, reason: `${name}_empty` };
  if (text.length > max) return { ok: false, reason: `${name}_too_long` };
  return { ok: true, value: text };
}

function parsePracticeReviewResponse(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  const jsonText = extractFirstJsonObject(content);
  if (!jsonText) return { ok: false, reason: "missing_json", raw: String(content || "").slice(0, 8_000) };
  let parsed;
  try { parsed = JSON.parse(jsonText); }
  catch { return { ok: false, reason: "invalid_json", raw: String(content || "").slice(0, 8_000) }; }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, reason: "invalid_object", raw: String(content || "").slice(0, 8_000) };
  }
  const targetEnv = reviewText(parsed.targetEnv, "targetEnv", { max: 16 });
  const sourceExcerpt = reviewText(parsed.sourceExcerpt, "sourceExcerpt");
  const issue = reviewText(parsed.issue, "issue");
  const suggestion = reviewText(parsed.suggestion, "suggestion");
  const invalid = [targetEnv, sourceExcerpt, issue, suggestion].find((field) => !field.ok);
  if (invalid) return { ok: false, reason: invalid.reason, raw: String(content || "").slice(0, 8_000) };
  if (!PRACTICE_PACK_KEYS.includes(targetEnv.value)) {
    return { ok: false, reason: "unknown_target_env", raw: String(content || "").slice(0, 8_000) };
  }
  if (!Array.isArray(parsed.crossReferences) || parsed.crossReferences.length > 3) {
    return { ok: false, reason: "invalid_cross_references", raw: String(content || "").slice(0, 8_000) };
  }
  const crossReferences = [];
  for (const [index, ref] of parsed.crossReferences.entries()) {
    const envKey = reviewText(ref?.envKey, `crossReferences_${index}_envKey`, { max: 16 });
    const excerpt = reviewText(ref?.sourceExcerpt, `crossReferences_${index}_sourceExcerpt`);
    if (!envKey.ok || !excerpt.ok || !PRACTICE_PACK_KEYS.includes(envKey.value)) {
      return { ok: false, reason: !envKey.ok ? envKey.reason : !excerpt.ok ? excerpt.reason : "unknown_cross_reference_env", raw: String(content || "").slice(0, 8_000) };
    }
    crossReferences.push({ envKey: envKey.value, sourceExcerpt: excerpt.value });
  }
  return {
    ok: true,
    raw: String(content || "").slice(0, 8_000),
    annotation: {
      targetEnv: targetEnv.value,
      sourceExcerpt: sourceExcerpt.value,
      issue: issue.value,
      suggestion: suggestion.value,
      crossReferences,
    },
  };
}

function gatePracticeReview(parsed, input) {
  if (!parsed.ok) return { ok: false, reason: parsed.reason, parseFailed: true };
  if (!input.reviewer.scope.includes(parsed.annotation.targetEnv)) {
    return { ok: false, reason: "out_of_scope", targetEnv: parsed.annotation.targetEnv };
  }
  if (parsed.annotation.issue.length > PRACTICE_REVIEW_ISSUE_MAX_CHARS) {
    return { ok: false, reason: "issue_too_long", chars: parsed.annotation.issue.length };
  }
  if (parsed.annotation.suggestion.length > PRACTICE_REVIEW_SUGGESTION_MAX_CHARS) {
    return { ok: false, reason: "suggestion_too_long", chars: parsed.annotation.suggestion.length };
  }
  const primary = anchorAnnotation(parsed.annotation, input.currentPack, input.sourceRevision);
  if (!primary.ok) return { ok: false, reason: primary.reason, primary };
  const cross = anchorCrossReferences(parsed.annotation.crossReferences, input.currentPack, input.sourceRevision);
  if (!cross.allOk) {
    return { ok: false, reason: "cross_reference_unanchored", primary, crossReferences: cross.results };
  }
  return { ok: true, primary, crossReferences: cross.results };
}

function buildPracticeReviewMessages(input, correction = null) {
  const avoidBlock = input.avoidAnchors?.length
    ? `\n<occupied_anchors>\n${input.avoidAnchors.map((item) => `${item.targetEnv} · ${item.sourceExcerpt}`).join("\n")}\n</occupied_anchors>\n以上段落已被其他学科审校的批注占用。请优先选择其它段落或环节；只有当该处存在你职责内必须指出、且与已有批注不同的问题时，才可再次选择同一段。`
    : "";
  const base = [
    { role: "system", content: input.reviewer.systemPrompt },
    {
      role: "user",
      content: `请审校以下当前稿件。\n<teaching_context>\n${JSON.stringify(input.context, null, 2)}\n</teaching_context>\n<current_pack source_revision="${input.sourceRevision}">\n${JSON.stringify(input.currentPack, null, 2)}\n</current_pack>${avoidBlock}`,
    },
  ];
  if (!correction) return base;
  return [
    ...base,
    { role: "assistant", content: correction.raw || "上一次输出未形成有效 JSON。" },
    {
      role: "user",
      content: `上一次输出未通过机械门禁（${correction.reason}）。请重新输出完整 JSON。targetEnv 必须在 ${input.reviewer.scope.join("、")} 中；所有摘录必须逐字复制当前稿件，并优先复制完整分隔段。issue 不超过 60 字，suggestion 不超过 70 字。不要解释。`,
    },
  ];
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
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
  "s1-workspace.html",
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
  const extension = extname(filePath).toLowerCase();
  if (extension === ".html") {
    const source = await readFile(canonicalFile, "utf8");
    const html = source.replace(/<body\b(?![^>]*\bdata-backend-enabled=)/i, '<body data-backend-enabled="true"');
    const body = Buffer.from(html);
    res.writeHead(200, {
      "content-type": MIME.get(extension),
      "content-length": body.length,
      "cache-control": "no-cache",
    });
    if (req.method === "HEAD") res.end();
    else res.end(body);
    return true;
  }
  res.writeHead(200, {
    "content-type": MIME.get(extension) || "application/octet-stream",
    "content-length": stat.size,
    "cache-control": "public, max-age=300",
  });
  if (req.method === "HEAD") res.end();
  else await pipeline(createReadStream(canonicalFile), res);
  return true;
}

export function createPharmacoServer({ config, database, modelClient, logger = console }) {
  // 仅缓存通过锚定门禁的结果；失败与未定位建议不能因缓存被误当成稳定产物。
  // L1 内存 + SQLite 持久层：答辩前在真页面对演示章节跑一遍五路审校，
  // 之后即使后端重启，相同稿件+修订号+审校者仍然秒回。
  const practiceReviewCache = new Map();

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

    // 产品内核 S1:路由层只做参数校验与编排调用,状态字段一律经服务层转移。
    if (url.pathname.startsWith("/api/product-core/")) {
      await handleProductCoreApi(req, res, url);
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
          maxTokens: 4_096,
          signal: abortController.signal,
        });
        let payload;
        try { payload = await upstream.json(); }
        catch { fail(502, "MODEL_OUTPUT_INVALID", "本地模型返回的响应不是有效 JSON"); }
        const pack = parsePracticePackResponse(payload, input.targetEnv);
        status = "ok";
        sendJson(res, 200, {
          source: "local-model",
          model: payload?.model || config.modelName,
          chapterId: input.context.chapterId,
          generatedAt: new Date().toISOString(),
          targetEnv: input.targetEnv,
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

    if (req.method === "POST" && url.pathname === "/api/practice/reviews") {
      const body = await readJson(req, config.bodyLimitBytes);
      const input = validatePracticeReviewRequest(body);
      const manuscriptHash = createHash("sha256").update(JSON.stringify(input.currentPack)).digest("hex");
      const cacheKey = createHash("sha256").update(JSON.stringify({
        manuscriptHash,
        sourceRevision: input.sourceRevision,
        reviewerId: input.reviewer.id,
        promptVersion: input.reviewer.promptVersion,
        orchestrationVersion: PRACTICE_REVIEW_ORCHESTRATION_VERSION,
        avoidAnchors: input.avoidAnchors,
        model: config.modelName,
        temperature: PRACTICE_REVIEW_TEMPERATURE,
        maxTokens: PRACTICE_REVIEW_MAX_TOKENS,
      })).digest("hex");
      const cached = practiceReviewCache.get(cacheKey) || database.getPracticeReview(cacheKey);
      if (cached) {
        practiceReviewCache.set(cacheKey, cloneJson(cached));
        const payload = cloneJson(cached);
        payload.cache = { hit: true, key: cacheKey.slice(0, 16) };
        sendJson(res, 200, payload);
        return;
      }

      const started = performance.now();
      const abortController = new AbortController();
      const abort = () => abortController.abort();
      req.once("aborted", abort);
      res.once("close", () => { if (!res.writableEnded) abort(); });
      let status = "error";
      let correction = null;
      let lastParsed = null;
      let lastGate = null;
      let lastModel = config.modelName;
      try {
        for (let attempt = 1; attempt <= 2; attempt += 1) {
          const messages = buildPracticeReviewMessages(input, correction);
          const upstream = await modelClient.chat({
            messages,
            stream: false,
            temperature: PRACTICE_REVIEW_TEMPERATURE,
            maxTokens: PRACTICE_REVIEW_MAX_TOKENS,
            signal: abortController.signal,
          });
          let modelPayload;
          try { modelPayload = await upstream.json(); }
          catch { modelPayload = null; }
          lastModel = modelPayload?.model || lastModel;
          lastParsed = parsePracticeReviewResponse(modelPayload);
          lastGate = gatePracticeReview(lastParsed, input);
          if (lastParsed.ok && lastGate.ok) {
            const payload = {
              source: "local-model",
              status: "anchored",
              reviewer: {
                id: input.reviewer.id,
                expertId: input.reviewer.expertId,
                name: input.reviewer.name,
                scope: [...input.reviewer.scope],
              },
              model: lastModel,
              generatedAt: new Date().toISOString(),
              sourceRevision: input.sourceRevision,
              manuscriptHash,
              promptVersion: input.reviewer.promptVersion,
              orchestrationVersion: PRACTICE_REVIEW_ORCHESTRATION_VERSION,
              attempts: attempt,
              cache: { hit: false, key: cacheKey.slice(0, 16) },
              annotation: {
                issue: lastParsed.annotation.issue,
                suggestion: lastParsed.annotation.suggestion,
                targetEnv: lastGate.primary.targetEnv,
                segmentKey: lastGate.primary.segmentKey,
                sourceExcerpt: lastGate.primary.sourceExcerpt,
                sourceRevision: lastGate.primary.sourceRevision,
                sourceHash: lastGate.primary.sourceHash,
                anchorMethod: lastGate.primary.anchorMethod,
                anchorBasis: lastGate.primary.anchorBasis,
                normalizationVersion: lastGate.primary.normalizationVersion,
                crossReferences: lastGate.crossReferences,
              },
            };
            practiceReviewCache.set(cacheKey, cloneJson(payload));
            database.savePracticeReview(cacheKey, cloneJson(payload));
            status = "ok";
            sendJson(res, 200, payload);
            return;
          }
          correction = {
            reason: lastGate?.reason || lastParsed?.reason || "unknown_gate_failure",
            raw: lastParsed?.raw,
          };
        }

        // 两次都无法定位时仍返回可解释的 200 降级态，前端保留固定种子，
        // 绝不把模型建议标成“已锚定”。
        status = "unanchored";
        sendJson(res, 200, {
          source: "local-model",
          status: "unanchored",
          reviewer: {
            id: input.reviewer.id,
            expertId: input.reviewer.expertId,
            name: input.reviewer.name,
            scope: [...input.reviewer.scope],
          },
          model: lastModel,
          generatedAt: new Date().toISOString(),
          sourceRevision: input.sourceRevision,
          manuscriptHash,
          promptVersion: input.reviewer.promptVersion,
          orchestrationVersion: PRACTICE_REVIEW_ORCHESTRATION_VERSION,
          attempts: 2,
          cache: { hit: false, key: cacheKey.slice(0, 16) },
          gate: {
            reason: lastGate?.reason || lastParsed?.reason || "unknown_gate_failure",
            targetEnv: lastParsed?.annotation?.targetEnv || null,
          },
          // 未定位意见与已锚定批注明确分轨。这里保留模型声称的正文，供教师在
          // “未定位篮”中审阅；任何字段都不得被前端当作机械锚点或进入候选。
          unlocatedReview: lastParsed?.ok ? {
            reviewerId: input.reviewer.id,
            expertId: input.reviewer.expertId,
            issue: lastParsed.annotation.issue,
            suggestion: lastParsed.annotation.suggestion,
            claimedTargetEnv: lastParsed.annotation.targetEnv,
            claimedSourceExcerpt: lastParsed.annotation.sourceExcerpt,
            claimedCrossReferences: lastParsed.annotation.crossReferences,
            gateReason: lastGate?.reason || "unknown_gate_failure",
            sourceRevision: input.sourceRevision,
            manuscriptHash,
            model: lastModel,
            promptVersion: input.reviewer.promptVersion,
            orchestrationVersion: PRACTICE_REVIEW_ORCHESTRATION_VERSION,
            generatedAt: new Date().toISOString(),
          } : null,
        });
      } finally {
        database.recordInference({
          agentId: `practice-review:${input.reviewer.id}`,
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

  // ---------- 产品内核 S1 API(/api/product-core/) ----------
  // 只做:参数校验 -> 服务层编排调用 -> 视图组装。绝不直接 UPDATE 任何状态字段(B8)。
  const pcdb = database.db;

  function pcText(value, name, { max = 200 } = {}) {
    if (typeof value !== "string" || !value.trim()) {
      fail(400, "INVALID_PRODUCT_CORE_BODY", `${name} 必填且必须是非空文本`);
    }
    const text = value.trim();
    if (text.length > max) fail(400, "INVALID_PRODUCT_CORE_BODY", `${name} 不能超过 ${max} 字符`);
    return text;
  }

  function pcActor(body, field = "actorId") {
    return { actorType: "teacher", actorId: pcText(body?.[field], field, { max: 80 }) };
  }

  function pcGetWorkflowOr404(workflowId) {
    const workflow = getWorkflow(pcdb, workflowId);
    if (!workflow) {
      fail(404, "WF_INSTANCE_NOT_FOUND", `工作流实例不存在: ${workflowId}`, { workflowInstanceId: workflowId });
    }
    return workflow;
  }

  function pcWorkflowSummary(workflow) {
    return {
      id: workflow.id,
      currentState: workflow.current_state,
      stateVersion: workflow.state_version,
      courseId: workflow.course_id,
      classId: workflow.class_id,
      lessonId: workflow.lesson_id,
      createdBy: workflow.created_by,
      createdAt: workflow.created_at,
      updatedAt: workflow.updated_at,
    };
  }

  function pcAvailableActions(state) {
    const actions = Object.keys(TRANSITIONS).filter((action) => TRANSITIONS[action].from.includes(state));
    if (!TERMINAL_STATES.has(state)) actions.push("cancel");
    return actions;
  }

  // fixture 两种来源:请求体内嵌 fixture 对象,或 fixturePath(仅限 server/product-core/fixtures 内)。
  async function pcLoadFixture(body) {
    if (body?.fixture !== undefined) {
      if (!body.fixture || typeof body.fixture !== "object" || Array.isArray(body.fixture)) {
        fail(400, "INVALID_FIXTURE", "fixture 必须是 JSON 对象");
      }
      return body.fixture;
    }
    if (typeof body?.fixturePath === "string" && body.fixturePath.trim()) {
      const relative = body.fixturePath.trim();
      if (relative.includes("\0") || !relative.endsWith(".json")) {
        fail(400, "INVALID_FIXTURE_PATH", "fixturePath 必须是 .json 文件路径");
      }
      const fixturesDir = resolve(config.rootDir, "server/product-core/fixtures");
      const filePath = resolve(config.rootDir, relative);
      if (filePath !== fixturesDir && !filePath.startsWith(fixturesDir + sep)) {
        fail(403, "FIXTURE_PATH_FORBIDDEN", "fixturePath 仅允许 server/product-core/fixtures 内的文件");
      }
      try {
        return JSON.parse(await readFile(filePath, "utf8"));
      } catch {
        fail(400, "INVALID_FIXTURE", `fixture 文件无法读取或不是有效 JSON: ${relative}`);
      }
    }
    fail(400, "INVALID_FIXTURE", "必须提供 fixture 对象或 fixturePath");
  }

  function pcClaimView(claim) {
    return {
      id: claim.id,
      claimType: claim.claim_type,
      statement: claim.statement,
      targetStageId: claim.target_stage_id,
      confidenceStatus: claim.confidence_status,
      validationStatus: claim.validation_status,
      semanticReviewStatus: claim.semantic_review_status,
      createdBy: claim.created_by,
      supersedesClaimId: claim.supersedes_claim_id,
      evidenceLinks: listEvidenceLinks(pcdb, claim.id).map((link) => ({
        id: link.id,
        evidenceType: link.evidence_type,
        sourceId: link.source_id,
        sourceVersionId: link.source_version_id,
        contentBlockId: link.content_block_id,
        runtimeObservationId: link.runtime_observation_id,
        pageIndex: link.page_index,
        pageLabel: link.page_label,
        verbatimQuote: link.verbatim_quote,
        sourceStatus: link.source_status,
      })),
      mechanicalReport: claim.mechanical_report_json ? JSON.parse(claim.mechanical_report_json) : null,
      semanticReport: claim.semantic_report_json ? JSON.parse(claim.semantic_report_json) : null,
    };
  }

  // 教师工作区聚合视图:当前状态、observations、按类型分组的 claim、TDR 与生效裁决、可用动作。
  function pcWorkspaceView(workflowId) {
    const workflow = pcGetWorkflowOr404(workflowId);
    const observations = pcdb
      .prepare(
        `SELECT id, metric, value, unit, numerator, denominator, calculation_rule,
                calculation_version, aggregation_level, calculated_at
         FROM runtime_observations WHERE lesson_id = ? ORDER BY metric`,
      )
      .all(workflow.lesson_id)
      .map((row) => ({
        id: row.id,
        metric: row.metric,
        value: row.value,
        unit: row.unit,
        numerator: row.numerator,
        denominator: row.denominator,
        calculationRule: row.calculation_rule,
        calculationVersion: row.calculation_version,
        aggregationLevel: row.aggregation_level,
        calculatedAt: row.calculated_at,
      }));
    const claimsByType = { factual: [], inference: [], recommendation: [] };
    for (const claim of listS1Claims(pcdb, workflow.lesson_id, { workflowInstanceId: workflowId })) {
      const view = pcClaimView(claim);
      if (claim.claim_type === "factual_claim") claimsByType.factual.push(view);
      else if (claim.claim_type === "diagnostic_inference") claimsByType.inference.push(view);
      else if (claim.claim_type === "teaching_recommendation") claimsByType.recommendation.push(view);
    }
    const decisionRecords = listDecisionRecords(pcdb, workflowId).map((record) => {
      const claimId = recordClaimId(record);
      const claim = claimId
        ? pcdb.prepare("SELECT id, claim_type, statement FROM teaching_claims WHERE id = ?").get(claimId)
        : null;
      const effective = getEffectiveDecision(pcdb, record.id);
      return {
        id: record.id,
        claimId,
        claimType: claim?.claim_type ?? null,
        statement: claim?.statement ?? null,
        decisionQuestion: record.decision_question,
        status: record.status,
        mechanicalValidationStatus: record.mechanical_validation_status,
        semanticReviewStatus: record.semantic_review_status,
        targetLessonVersionId: record.target_lesson_version_id,
        publishedAt: record.published_at,
        effectiveDecision: effective
          ? {
              id: effective.id,
              decision: effective.decision,
              reviewerId: effective.reviewer_id,
              originalStatement: effective.original_statement,
              editedStatement: effective.edited_statement,
              comment: effective.comment,
              decidedAt: effective.decided_at,
            }
          : null,
      };
    });
    return {
      workflow: pcWorkflowSummary(workflow),
      availableActions: pcAvailableActions(workflow.current_state),
      observations,
      claims: claimsByType,
      decisionRecords,
    };
  }

  // 审计时间线(只读):优先按 workflow_instance_id 过滤——migration 005 起新事件全部带
  // workflow 维度;实体归集(lesson/claim/TDR/版本)仅兜底无 workflow 维度的旧事件,
  // 避免把同一 lesson 下其他轮次的事件混入本轮时间线。
  function pcAuditTimeline(workflowId) {
    const workflow = pcGetWorkflowOr404(workflowId);
    const entityIds = new Set([workflowId, workflow.lesson_id]);
    for (const row of pcdb.prepare("SELECT id FROM teaching_claims WHERE lesson_id = ?").all(workflow.lesson_id)) {
      entityIds.add(row.id);
    }
    for (const row of pcdb.prepare("SELECT id FROM teaching_decisions WHERE workflow_instance_id = ?").all(workflowId)) {
      entityIds.add(row.id);
    }
    for (const row of pcdb.prepare("SELECT id FROM lesson_versions WHERE lesson_id = ?").all(workflow.lesson_id)) {
      entityIds.add(row.id);
    }
    const placeholders = [...entityIds].map(() => "?").join(", ");
    return pcdb
      .prepare(
        `SELECT * FROM audit_events
         WHERE workflow_instance_id = ? OR (workflow_instance_id IS NULL AND entity_id IN (${placeholders}))
         ORDER BY created_at, rowid`,
      )
      .all(workflowId, ...entityIds)
      .map((row) => ({
        id: row.id,
        eventType: row.event_type,
        actorType: row.actor_type,
        actorId: row.actor_id,
        entityType: row.entity_type,
        entityId: row.entity_id,
        workflowInstanceId: row.workflow_instance_id,
        previousState: row.previous_state,
        nextState: row.next_state,
        payload: row.payload_json ? JSON.parse(row.payload_json) : null,
        eventHash: row.event_hash,
        createdAt: row.created_at,
      }));
  }

  function pcVersionView(row) {
    return {
      id: row.id,
      lessonId: row.lesson_id,
      versionNumber: row.version_number,
      parentVersionId: row.parent_version_id,
      status: row.status,
      createdBy: row.created_by,
      createdAt: row.created_at,
      publishedAt: row.published_at,
      ...(row.status === "PUBLISHED" ? { content: JSON.parse(row.content_json) } : {}),
    };
  }

  // ---------- 知识库(KB)API(/api/product-core/kb/) ----------
  // 教师审核 + Product Core 检索闭环(migration 006/008 表)。与 S1 块同纪律:
  // 路由层只做参数校验、服务层编排调用与视图组装;单元 statement/definition 不可改
  // (006/008 触发器),修订一律走 supersedes 链新建单元(原单元保留原文),状态流转
  // 全部写审计。全程无模型调用(检索服务为 FTS5 + bm25 + 确定性门禁)。
  const KB_LAYERS = Object.freeze({
    theory: { table: "kb_knowledge_units", fragments: "kb_unit_fragments", entityType: "knowledge_unit", idPrefix: "ku" },
    pharma_context: { table: "kb_pharma_context_units", fragments: "kb_pharma_context_fragments", entityType: "pharma_context_unit", idPrefix: "pcx" },
    company_fact: { table: "kb_company_fact_units", fragments: "kb_company_fact_fragments", entityType: "company_fact_unit", idPrefix: "cfx" },
  });
  const KB_REVIEW_STATUSES = Object.freeze(["machine_extracted", "teacher_verified", "needs_review", "rejected"]);
  const KB_GAP_STATUSES = Object.freeze(["open", "resolved", "out_of_scope"]);

  function kbLayerOr400(layer) {
    const def = KB_LAYERS[layer];
    if (!def) {
      fail(400, "KB_LAYER_INVALID", `layer 必须是 ${Object.keys(KB_LAYERS).join("/")},收到 ${JSON.stringify(layer)}`);
    }
    return def;
  }

  function kbGetUnitOr404(layer, layerDef, unitId) {
    const unit = pcdb.prepare(`SELECT * FROM ${layerDef.table} WHERE id = ?`).get(unitId);
    if (!unit) failCode("KB_UNIT_NOT_FOUND", `知识单元不存在(layer=${layer}): ${unitId}`, { layer, unitId });
    return unit;
  }

  // 关联知识点:三层各自的知识点定位字段(theory=concept,pharma=aspect,company=公司+事实类型)。
  function kbKnowledgePoint(layer, row) {
    if (layer === "theory") return row.concept;
    if (layer === "pharma_context") return row.aspect;
    return `${row.company} · ${row.fact_type}`;
  }

  function kbUnitContent(layer, row) {
    if (layer === "theory") {
      return {
        concept: row.concept,
        definition: row.definition,
        claim: row.claim,
        conditions: row.conditions,
        counterexample: row.counterexample,
        relatedConcepts: JSON.parse(row.related_concepts_json ?? "[]"),
        confidence: row.confidence,
        extractionMethod: row.extraction_method,
      };
    }
    if (layer === "pharma_context") {
      return {
        industryStage: row.industry_stage,
        aspect: row.aspect,
        statement: row.statement,
        regulatorContext: row.regulator_context,
      };
    }
    return {
      company: row.company,
      reportPeriod: row.report_period,
      factType: row.fact_type,
      statement: row.statement,
      caseCandidate: row.case_candidate === 1,
    };
  }

  function kbAuditRow(row) {
    return {
      id: row.id,
      eventType: row.event_type,
      actorType: row.actor_type,
      actorId: row.actor_id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      workflowInstanceId: row.workflow_instance_id,
      previousState: row.previous_state,
      nextState: row.next_state,
      payload: row.payload_json ? JSON.parse(row.payload_json) : null,
      eventHash: row.event_hash,
      createdAt: row.created_at,
    };
  }

  // 标题层级启发与 knowledge-retrieval-service 同口径(编号模式重建标题路径;章节锚,非页码虚构)。
  const KB_HEADING_LEVEL1_RE = /^chapter\s+\d+/i;
  const KB_HEADING_LEVEL2_RES = [
    /^\d+\.\d+(\s|$|:)/,
    /^(introduction|key terms|summary of learning outcomes|chapter review questions|management skills application exercises|managerial decision exercises|critical thinking case)\b/i,
  ];
  function kbHeadingLevel(text) {
    if (KB_HEADING_LEVEL1_RE.test(text)) return 1;
    if (KB_HEADING_LEVEL2_RES.some((re) => re.test(text))) return 2;
    return 3;
  }
  function kbSectionAnchor(assetVersionId, orderIndex) {
    const headings = pcdb
      .prepare("SELECT order_index, content_raw FROM content_blocks WHERE asset_version_id = ? AND block_type = 'heading' ORDER BY order_index")
      .all(assetVersionId);
    const last = [null, null, null];
    for (const heading of headings) {
      if (heading.order_index > orderIndex) break;
      last[kbHeadingLevel(heading.content_raw) - 1] = heading.content_raw;
    }
    const path = [];
    for (const text of last) {
      if (text !== null && !path.includes(text)) path.push(text);
    }
    return path;
  }

  // 单元详情视图:内容、来源(asset 标题/authorityLevel/permissionStatus)、原文片段
  // (verbatim + 页码/章节锚)、片段级五项权限、模型处理状态、该单元的审计时间线。
  function kbUnitDetailView(layer, layerDef, unit) {
    const fragmentRows = pcdb
      .prepare(
        `SELECT cb.id AS fragment_id, cb.block_type, cb.order_index, cb.page_index, cb.page_label,
                cb.content_raw, cb.content_hash, cb.parser_metadata_json,
                av.id AS asset_version_id, av.asset_id, av.source_status, av.effective_date,
                ka.title AS asset_title, ka.authority AS asset_authority
         FROM ${layerDef.fragments} f
         JOIN content_blocks cb ON cb.id = f.fragment_id
         JOIN asset_versions av ON av.id = cb.asset_version_id
         JOIN knowledge_assets ka ON ka.id = av.asset_id
         WHERE f.unit_id = ?
         ORDER BY cb.order_index`,
      )
      .all(unit.id);

    // 权限:kb_source_permissions 逐源登记(008);未登记的旧管线资产如实为 null,不虚构。
    const permSelect = pcdb.prepare("SELECT * FROM kb_source_permissions WHERE source_id = ?");
    const sourcesByAsset = new Map();
    for (const row of fragmentRows) {
      if (sourcesByAsset.has(row.asset_id)) continue;
      const perm = permSelect.get(row.asset_id);
      sourcesByAsset.set(row.asset_id, {
        assetId: row.asset_id,
        title: row.asset_title,
        authority: row.asset_authority,
        authorityLevel: perm?.authority_level ?? null,
        permissionStatus: perm?.permission_status ?? null,
        permissions: perm
          ? {
              deterministicParsingAllowed: perm.deterministic_parsing_allowed === 1,
              lexicalIndexingAllowed: perm.lexical_indexing_allowed === 1,
              llmInputAllowed: perm.llm_input_allowed === 1,
              embeddingAllowed: perm.embedding_allowed === 1,
              publicRedistributionAllowed: perm.public_redistribution_allowed === 1,
              permissionBasis: perm.permission_basis,
              permissionUpdatedBy: perm.permission_updated_by,
              permissionUpdatedAt: perm.permission_updated_at,
            }
          : null,
      });
    }

    const fragments = fragmentRows.map((row) => {
      const meta = JSON.parse(row.parser_metadata_json ?? "{}");
      const sectionPath = kbSectionAnchor(row.asset_version_id, row.order_index);
      return {
        fragmentId: row.fragment_id,
        blockType: row.block_type,
        orderIndex: row.order_index,
        assetId: row.asset_id,
        assetVersionId: row.asset_version_id,
        sourceId: meta.sourceId ?? null,
        docId: meta.docId ?? null,
        pageIndex: row.page_index,
        pageLabel: row.page_label,
        sectionAnchor: sectionPath.length > 0 ? sectionPath.join(" > ") : null,
        verbatim: row.content_raw,
        contentHash: row.content_hash,
        sourceStatus: row.source_status,
        effectiveDate: row.effective_date,
      };
    });

    const auditTimeline = pcdb
      .prepare("SELECT * FROM audit_events WHERE entity_id = ? ORDER BY created_at, rowid")
      .all(unit.id)
      .map(kbAuditRow);

    return {
      id: unit.id,
      layer,
      courseId: unit.course_id,
      chapterId: unit.chapter_id,
      reviewStatus: unit.review_status,
      knowledgePoint: kbKnowledgePoint(layer, unit),
      supersedesUnitId: unit.supersedes_unit_id,
      supersededBy: unit.superseded_by,
      content: kbUnitContent(layer, unit),
      sources: [...sourcesByAsset.values()],
      fragments,
      // 模型处理状态:当前权限口径全量禁模型处理(manifest defaultDeny,llmInputAllowed=true
      // 即 FAIL),单元恒"未使用模型";theory 的 created_from_model_run_id 如实回显(恒 null)。
      modelProcessing: {
        status: "unused",
        label: "未使用模型",
        createdFromModelRunId: layer === "theory" ? unit.created_from_model_run_id : null,
      },
      createdBy: unit.created_by,
      createdAt: unit.created_at,
      auditTimeline,
    };
  }

  // revised 语义:editedStatement 非空时,按 supersedes 链新建修订版单元(继承来源片段),
  // 原单元只置 superseded_by、原文只字不动。新单元初始 needs_review,随后走统一状态流转。
  // 非事务:调用方(review 路由)负责 BEGIN/COMMIT 包裹本函数与状态流转。
  function kbCreateRevision(layer, layerDef, unit, editedStatement, actor) {
    const newUnitId = newId(layerDef.idPrefix);
    const now = nowIso();
    if (layer === "theory") {
      // 修订版是教师人工修订产物(extraction_method='manual')。006 UNIQUE(course,chapter,
      // concept,extraction_method) 下同 concept 已有 manual 单元时无法另建修订,显式报错不覆盖。
      const clash = pcdb
        .prepare("SELECT id FROM kb_knowledge_units WHERE course_id = ? AND chapter_id = ? AND concept = ? AND extraction_method = 'manual'")
        .get(unit.course_id, unit.chapter_id, unit.concept);
      if (clash) {
        failCode("KB_UNIT_INPUT_INVALID", `概念 "${unit.concept}" 已存在 manual 单元,无法创建修订版`, { conflictUnitId: clash.id });
      }
      pcdb
        .prepare(
          `INSERT INTO kb_knowledge_units(
             id, course_id, chapter_id, concept, definition, claim, conditions, counterexample,
             related_concepts_json, confidence, review_status, extraction_method,
             created_from_model_run_id, supersedes_unit_id, superseded_by,
             schema_version, created_by, created_at
           ) VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, 'needs_review', 'manual', NULL, ?, NULL, '1.0.0', ?, ?)`,
        )
        .run(newUnitId, unit.course_id, unit.chapter_id, unit.concept, editedStatement, unit.related_concepts_json, unit.confidence, unit.id, actor.actorId, now);
      pcdb
        .prepare("INSERT INTO kb_unit_fragments(unit_id, fragment_id, role, order_index) SELECT ?, fragment_id, role, order_index FROM kb_unit_fragments WHERE unit_id = ?")
        .run(newUnitId, unit.id);
    } else if (layer === "pharma_context") {
      pcdb
        .prepare(
          `INSERT INTO kb_pharma_context_units(
             id, course_id, chapter_id, industry_stage, aspect, statement, regulator_context,
             review_status, supersedes_unit_id, superseded_by, schema_version, created_by, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, 'needs_review', ?, NULL, '1.0.0', ?, ?)`,
        )
        .run(newUnitId, unit.course_id, unit.chapter_id, unit.industry_stage, unit.aspect, editedStatement, unit.regulator_context, unit.id, actor.actorId, now);
      pcdb
        .prepare("INSERT INTO kb_pharma_context_fragments(unit_id, fragment_id) SELECT ?, fragment_id FROM kb_pharma_context_fragments WHERE unit_id = ?")
        .run(newUnitId, unit.id);
    } else {
      pcdb
        .prepare(
          `INSERT INTO kb_company_fact_units(
             id, course_id, chapter_id, company, report_period, fact_type, statement,
             review_status, case_candidate, supersedes_unit_id, superseded_by, schema_version, created_by, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, 'needs_review', 0, ?, NULL, '1.0.0', ?, ?)`,
        )
        .run(newUnitId, unit.course_id, unit.chapter_id, unit.company, unit.report_period, unit.fact_type, editedStatement, unit.id, actor.actorId, now);
      pcdb
        .prepare("INSERT INTO kb_company_fact_fragments(unit_id, fragment_id) SELECT ?, fragment_id FROM kb_company_fact_fragments WHERE unit_id = ?")
        .run(newUnitId, unit.id);
    }
    pcdb.prepare(`UPDATE ${layerDef.table} SET superseded_by = ? WHERE id = ?`).run(newUnitId, unit.id);
    appendAuditEvent(pcdb, {
      eventType: "kb.unit.revised",
      actorType: actor.actorType,
      actorId: actor.actorId,
      entityType: layerDef.entityType,
      entityId: newUnitId,
      payload: {
        layer,
        supersedesUnitId: unit.id,
        courseId: unit.course_id,
        chapterId: unit.chapter_id,
        // 审计纪律:长正文不落 payload,只留哈希与字数(可核验、可比对)。
        editedStatementSha256: hashState(editedStatement),
        editedStatementChars: editedStatement.length,
      },
    });
    return newUnitId;
  }

  // 状态流转:theory 复用 knowledge-unit-service.setUnitReviewStatus(同语义:枚举校验 +
  // 审计 kb.unit.reviewed 含前后状态);pharma/company 在此实现同纪律的流转(008 与 006 同构)。
  function kbSetReviewStatus(layer, layerDef, unitId, { reviewStatus, reviewerId, comment }, actor) {
    if (layer === "theory") {
      return setUnitReviewStatus(pcdb, unitId, { reviewStatus, reviewerId, comment }, actor);
    }
    const unit = pcdb.prepare(`SELECT * FROM ${layerDef.table} WHERE id = ?`).get(unitId);
    if (!unit) failCode("KB_UNIT_NOT_FOUND", `知识单元不存在(layer=${layer}): ${unitId}`, { layer, unitId });
    pcdb.prepare(`UPDATE ${layerDef.table} SET review_status = ? WHERE id = ?`).run(reviewStatus, unitId);
    appendAuditEvent(pcdb, {
      eventType: "kb.unit.reviewed",
      actorType: actor.actorType ?? "teacher",
      actorId: reviewerId,
      entityType: layerDef.entityType,
      entityId: unitId,
      previousState: unit.review_status,
      nextState: reviewStatus,
      payload: { layer, courseId: unit.course_id, chapterId: unit.chapter_id, comment },
    });
    return { unitId, previousStatus: unit.review_status, reviewStatus };
  }

  // 检索工作流(spec §7):每次检索必须落在某个 workflow_instance 上。请求未指定
  // workflowInstanceId 时,复用该 actor 首个 KB_RETRIEVAL 工作流(留痕聚合,run 级区分);
  // 没有则建锚点课程/班/课时,由 searchKnowledge 内部创建工作流并翻转状态。
  function kbRetrievalScope(actorId) {
    const existing = pcdb
      .prepare("SELECT id FROM workflow_instances WHERE workflow_type = 'KB_RETRIEVAL' AND created_by = ? ORDER BY created_at, rowid LIMIT 1")
      .get(actorId);
    if (existing) return { workflowInstanceId: existing.id, workflowScope: null };
    const actor = { actorType: "teacher", actorId };
    const course = insertCourse(pcdb, { name: "知识库检索锚点课程", code: "KB-RETRIEVAL", actorContext: actor });
    const cohort = insertCohort(pcdb, { courseId: course.id, name: "知识库检索锚点班", academicTerm: "", actorContext: actor });
    const lesson = insertLesson(pcdb, { courseId: course.id, classId: cohort.id, title: "知识库检索", actorContext: actor });
    return { workflowInstanceId: null, workflowScope: { courseId: course.id, classId: cohort.id, lessonId: lesson.id } };
  }

  async function handleKbApi(req, res, url) {
    // 三层单元统一列表:layer/reviewStatus/concept/chapterId 等值过滤(concept 按层落到
    // 各自知识点字段:theory→concept、pharma_context→aspect、company_fact→factType 或 company,
    // 大小写不敏感);每条含单元内容、所属层、review_status、关联知识点与来源数。
    if (req.method === "GET" && url.pathname === "/api/product-core/kb/units") {
      const layerParam = url.searchParams.get("layer");
      const reviewStatus = url.searchParams.get("reviewStatus");
      const concept = url.searchParams.get("concept");
      const chapterId = url.searchParams.get("chapterId");
      if (layerParam !== null) kbLayerOr400(layerParam);
      if (reviewStatus !== null && !KB_REVIEW_STATUSES.includes(reviewStatus)) {
        fail(400, "KB_REVIEW_STATUS_INVALID", `reviewStatus 必须是 ${KB_REVIEW_STATUSES.join("/")},收到 ${JSON.stringify(reviewStatus)}`);
      }
      const layers = layerParam === null ? Object.keys(KB_LAYERS) : [layerParam];
      const units = [];
      for (const layer of layers) {
        const def = KB_LAYERS[layer];
        const where = [];
        const params = [];
        if (reviewStatus !== null) {
          where.push("u.review_status = ?");
          params.push(reviewStatus);
        }
        if (chapterId !== null) {
          where.push("u.chapter_id = ?");
          params.push(chapterId);
        }
        if (concept !== null) {
          if (layer === "theory") {
            where.push("lower(u.concept) = lower(?)");
            params.push(concept);
          } else if (layer === "pharma_context") {
            where.push("lower(u.aspect) = lower(?)");
            params.push(concept);
          } else {
            where.push("(lower(u.fact_type) = lower(?) OR lower(u.company) = lower(?))");
            params.push(concept, concept);
          }
        }
        const rows = pcdb
          .prepare(
            `SELECT u.*, (SELECT COUNT(*) FROM ${def.fragments} f WHERE f.unit_id = u.id) AS source_count
             FROM ${def.table} u${where.length > 0 ? ` WHERE ${where.join(" AND ")}` : ""}
             ORDER BY u.id`,
          )
          .all(...params);
        for (const row of rows) {
          units.push({
            id: row.id,
            layer,
            courseId: row.course_id,
            chapterId: row.chapter_id,
            reviewStatus: row.review_status,
            knowledgePoint: kbKnowledgePoint(layer, row),
            content: kbUnitContent(layer, row),
            sourceCount: row.source_count,
            supersedesUnitId: row.supersedes_unit_id,
            supersededBy: row.superseded_by,
            createdBy: row.created_by,
            createdAt: row.created_at,
          });
        }
      }
      sendJson(res, 200, { unitCount: units.length, units });
      return;
    }

    const unitDetailMatch = url.pathname.match(/^\/api\/product-core\/kb\/units\/([^/]+)\/([^/]+)$/);
    if (req.method === "GET" && unitDetailMatch) {
      const layer = unitDetailMatch[1];
      const layerDef = kbLayerOr400(layer);
      const unit = kbGetUnitOr404(layer, layerDef, unitDetailMatch[2]);
      sendJson(res, 200, { unit: kbUnitDetailView(layer, layerDef, unit) });
      return;
    }

    const reviewMatch = url.pathname.match(/^\/api\/product-core\/kb\/units\/([^/]+)\/([^/]+)\/review$/);
    if (req.method === "POST" && reviewMatch) {
      const layer = reviewMatch[1];
      const layerDef = kbLayerOr400(layer);
      const unitId = reviewMatch[2];
      const body = await readJson(req, config.bodyLimitBytes);
      if (!body || typeof body !== "object" || Array.isArray(body)) fail(400, "INVALID_BODY", "请求体必须是对象");
      const reviewStatus = typeof body.reviewStatus === "string" ? body.reviewStatus.trim() : "";
      if (!KB_REVIEW_STATUSES.includes(reviewStatus)) {
        failCode("KB_REVIEW_STATUS_INVALID", `reviewStatus 必须是 ${KB_REVIEW_STATUSES.join("/")},收到 ${JSON.stringify(body.reviewStatus)}`);
      }
      const reviewerId = pcText(body.reviewerId, "reviewerId", { max: 80 });
      // actorType 默认 teacher;非教师身份可提交普通审核动作(留痕),但不可置 case_candidate。
      const actorType = body.actorType == null ? "teacher" : pcText(body.actorType, "actorType", { max: 20 });
      const comment = typeof body.comment === "string" && body.comment.trim() ? body.comment.trim() : null;
      const editedStatement = typeof body.editedStatement === "string" && body.editedStatement.trim() ? body.editedStatement.trim() : null;
      const caseCandidate = body.caseCandidate === true;
      if (caseCandidate) {
        // case_candidate 纪律(008 表头:只允许教师审核后置位)——教师身份 + company_fact 层
        // + 本次审核结论为 teacher_verified,三者缺一即拒。
        if (actorType !== "teacher") {
          fail(403, "KB_CASE_CANDIDATE_TEACHER_ONLY", "case_candidate 只允许教师置位");
        }
        if (layer !== "company_fact") {
          fail(400, "KB_CASE_CANDIDATE_INVALID", "caseCandidate 仅适用于 company_fact 层单元");
        }
        if (reviewStatus !== "teacher_verified") {
          fail(400, "KB_CASE_CANDIDATE_INVALID", "case_candidate 仅在 reviewStatus=teacher_verified 时可置位");
        }
      }
      const unit = kbGetUnitOr404(layer, layerDef, unitId);
      const actor = { actorType, actorId: reviewerId };

      pcdb.exec("BEGIN IMMEDIATE");
      try {
        let activeUnitId = unitId;
        let revisedUnitId = null;
        if (editedStatement) {
          // revised:supersedes 链建修订版(保留原文),状态流转作用于修订版单元。
          revisedUnitId = kbCreateRevision(layer, layerDef, unit, editedStatement, actor);
          activeUnitId = revisedUnitId;
        }
        const transition = kbSetReviewStatus(layer, layerDef, activeUnitId, { reviewStatus, reviewerId, comment }, actor);
        if (caseCandidate) {
          pcdb.prepare("UPDATE kb_company_fact_units SET case_candidate = 1 WHERE id = ?").run(activeUnitId);
          appendAuditEvent(pcdb, {
            eventType: "kb.unit.case_candidate.set",
            actorType,
            actorId: reviewerId,
            entityType: layerDef.entityType,
            entityId: activeUnitId,
            payload: { layer, courseId: unit.course_id, chapterId: unit.chapter_id, reviewerId },
          });
        }
        pcdb.exec("COMMIT");
        sendJson(res, 200, {
          unitId: activeUnitId,
          reviewedUnitId: unitId,
          previousStatus: transition.previousStatus,
          reviewStatus,
          revisedUnitId,
          caseCandidateSet: caseCandidate,
        });
      } catch (error) {
        pcdb.exec("ROLLBACK");
        throw error;
      }
      return;
    }

    // 非模型检索(spec §5/§7):调 searchKnowledge(FTS5+bm25+门禁,零模型),返回结果 +
    // retrievalRunId + evidenceIds + corpusVersionHash;未指定工作流时创建/复用 KB_RETRIEVAL。
    if (req.method === "POST" && url.pathname === "/api/product-core/kb/retrieve") {
      const body = await readJson(req, config.bodyLimitBytes);
      if (!body || typeof body !== "object" || Array.isArray(body)) fail(400, "INVALID_BODY", "请求体必须是对象");
      const query = pcText(body.query, "query", { max: 2_000 });
      const actorId = pcText(body.actorId, "actorId", { max: 80 });
      const filters = {};
      if (body.filters != null) {
        if (typeof body.filters !== "object" || Array.isArray(body.filters)) {
          fail(400, "KB_RETRIEVAL_INPUT_INVALID", "filters 必须是对象");
        }
        for (const [key, value] of Object.entries(body.filters)) {
          if (typeof value !== "string" || !value.trim()) {
            fail(400, "KB_RETRIEVAL_INPUT_INVALID", `filters.${key} 必须是非空文本`);
          }
          filters[key] = value.trim();
        }
      }
      const limit = body.limit == null ? undefined : Number(body.limit);
      let workflowInstanceId = null;
      if (body.workflowInstanceId != null) {
        workflowInstanceId = pcText(body.workflowInstanceId, "workflowInstanceId", { max: 80 });
      }
      let workflowScope = null;
      if (workflowInstanceId === null) {
        const scoped = kbRetrievalScope(actorId);
        workflowInstanceId = scoped.workflowInstanceId;
        workflowScope = scoped.workflowScope;
      }
      const result = searchKnowledge(pcdb, {
        query,
        filters,
        ...(limit === undefined ? {} : { limit }),
        actorContext: { actorType: "teacher", actorId },
        workflowInstanceId,
        workflowScope,
      });
      sendJson(res, 200, result);
      return;
    }

    // 证据缺口只读列表(gap 流转由 kb-unit-builder 管理,本轮不开 resolve 路由)。
    if (req.method === "GET" && url.pathname === "/api/product-core/kb/gaps") {
      const status = url.searchParams.get("status");
      if (status !== null && !KB_GAP_STATUSES.includes(status)) {
        fail(400, "KB_GAP_INPUT_INVALID", `status 必须是 ${KB_GAP_STATUSES.join("/")},收到 ${JSON.stringify(status)}`);
      }
      const rows = status === null
        ? pcdb.prepare("SELECT * FROM kb_evidence_gaps ORDER BY created_at, id").all()
        : pcdb.prepare("SELECT * FROM kb_evidence_gaps WHERE status = ? ORDER BY created_at, id").all(status);
      sendJson(res, 200, {
        gapCount: rows.length,
        gaps: rows.map((row) => ({
          id: row.id,
          questionId: row.question_id,
          topic: row.topic,
          neededSourceType: row.needed_source_type,
          status: row.status,
          resolutionNote: row.resolution_note,
          createdAt: row.created_at,
          resolvedAt: row.resolved_at,
        })),
      });
      return;
    }

    const runMatch = url.pathname.match(/^\/api\/product-core\/kb\/retrieval-runs\/([^/]+)$/);
    if (req.method === "GET" && runMatch) {
      const runId = runMatch[1];
      const run = pcdb.prepare("SELECT * FROM kb_retrieval_runs WHERE id = ?").get(runId);
      if (!run) failCode("KB_RETRIEVAL_RUN_NOT_FOUND", `检索 run 不存在: ${runId}`, { retrievalRunId: runId });
      const evidenceLinks = pcdb
        .prepare(
          `SELECT id, claim_id, evidence_type, source_id, source_version_id, content_block_id,
                  page_index, page_label, verbatim_quote, content_hash, source_status, retrieved_at
           FROM evidence_links WHERE retrieval_run_id = ? ORDER BY id`,
        )
        .all(run.id);
      sendJson(res, 200, {
        id: run.id,
        workflowInstanceId: run.workflow_instance_id,
        query: run.query_text,
        filters: JSON.parse(run.filters_json),
        corpusVersionHash: run.corpus_version_hash,
        resultCount: run.result_count,
        // results_json 逐条含:unitId(单元)/fragmentId+mergedFragmentIds(片段)/sourceId+assetVersionId
        // (来源)/sectionAnchor/pageLabel(锚点)/score+queryTermCoverage(分值)/contentHash。
        results: JSON.parse(run.results_json),
        evidenceLinks: evidenceLinks.map((row) => ({
          id: row.id,
          claimId: row.claim_id,
          evidenceType: row.evidence_type,
          sourceId: row.source_id,
          sourceVersionId: row.source_version_id,
          contentBlockId: row.content_block_id,
          pageIndex: row.page_index,
          pageLabel: row.page_label,
          verbatimQuote: row.verbatim_quote,
          contentHash: row.content_hash,
          sourceStatus: row.source_status,
          retrievedAt: row.retrieved_at,
        })),
        createdBy: run.created_by,
        createdAt: run.created_at,
      });
      return;
    }

    fail(404, "API_NOT_FOUND", "API 路径不存在");
  }

  async function handleProductCoreApi(req, res, url) {
    // 知识库(KB)子路由:教师审核 + 检索闭环(见上方 handleKbApi)。
    if (url.pathname.startsWith("/api/product-core/kb/")) {
      await handleKbApi(req, res, url);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/product-core/courses") {
      const body = await readJson(req, config.bodyLimitBytes);
      const course = insertCourse(pcdb, {
        name: pcText(body.name, "name"),
        code: pcText(body.code, "code", { max: 60 }),
        actorContext: pcActor(body),
      });
      sendJson(res, 201, { course });
      return;
    }

    const cohortMatch = url.pathname.match(/^\/api\/product-core\/courses\/([^/]+)\/cohorts$/);
    if (req.method === "POST" && cohortMatch) {
      const body = await readJson(req, config.bodyLimitBytes);
      const courseId = cohortMatch[1];
      if (!pcdb.prepare("SELECT id FROM courses WHERE id = ?").get(courseId)) {
        fail(404, "COURSE_NOT_FOUND", `课程不存在: ${courseId}`, { courseId });
      }
      const cohort = insertCohort(pcdb, {
        courseId,
        name: pcText(body.name, "name"),
        academicTerm: typeof body.academicTerm === "string" ? body.academicTerm.trim() : "",
        actorContext: pcActor(body),
      });
      sendJson(res, 201, { cohort });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/product-core/lessons") {
      const body = await readJson(req, config.bodyLimitBytes);
      const courseId = pcText(body.courseId, "courseId", { max: 80 });
      if (!pcdb.prepare("SELECT id FROM courses WHERE id = ?").get(courseId)) {
        fail(404, "COURSE_NOT_FOUND", `课程不存在: ${courseId}`, { courseId });
      }
      let classId = null;
      if (body.classId != null && body.classId !== "") {
        classId = pcText(body.classId, "classId", { max: 80 });
        if (!pcdb.prepare("SELECT id FROM class_cohorts WHERE id = ?").get(classId)) {
          fail(404, "COHORT_NOT_FOUND", `班级不存在: ${classId}`, { classId });
        }
      }
      const lesson = insertLesson(pcdb, {
        courseId,
        classId,
        title: pcText(body.title, "title"),
        actorContext: pcActor(body),
      });
      sendJson(res, 201, { lesson });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/product-core/s1/workflows") {
      const body = await readJson(req, config.bodyLimitBytes);
      const courseId = pcText(body.courseId, "courseId", { max: 80 });
      const classId = pcText(body.classId, "classId", { max: 80 });
      const lessonId = pcText(body.lessonId, "lessonId", { max: 80 });
      if (!pcdb.prepare("SELECT id FROM courses WHERE id = ?").get(courseId)) {
        fail(404, "COURSE_NOT_FOUND", `课程不存在: ${courseId}`, { courseId });
      }
      if (!pcdb.prepare("SELECT id FROM class_cohorts WHERE id = ?").get(classId)) {
        fail(404, "COHORT_NOT_FOUND", `班级不存在: ${classId}`, { classId });
      }
      if (!pcdb.prepare("SELECT id FROM lessons WHERE id = ?").get(lessonId)) {
        fail(404, "LESSON_NOT_FOUND", `课时不存在: ${lessonId}`, { lessonId });
      }
      const actorContext = pcActor(body);
      const workflow = startS1Workflow(pcdb, { courseId, classId, lessonId, createdBy: actorContext.actorId, actorContext });
      sendJson(res, 201, { workflow: pcWorkflowSummary(workflow) });
      return;
    }

    const decisionMatch = url.pathname.match(/^\/api\/product-core\/s1\/decision-records\/([^/]+)\/decisions$/);
    if (req.method === "POST" && decisionMatch) {
      const body = await readJson(req, config.bodyLimitBytes);
      const reviewerId = pcText(body.reviewerId, "reviewerId", { max: 80 });
      const result = await submitTeacherDecision(pcdb, {
        decisionRecordId: decisionMatch[1],
        decision: pcText(body.decision, "decision", { max: 20 }),
        reviewerId,
        editedStatement: typeof body.editedStatement === "string" ? body.editedStatement : null,
        comment: typeof body.comment === "string" ? body.comment : null,
        actorContext: { actorType: "teacher", actorId: reviewerId },
      });
      sendJson(res, 201, {
        teacherDecisionId: result.teacherDecisionId,
        decisionRecordId: result.decisionRecordId,
        decision: result.decision,
        revisedClaimId: result.revisedClaimId,
        effective: result.effective && {
          id: result.effective.id,
          decision: result.effective.decision,
          reviewerId: result.effective.reviewer_id,
          originalStatement: result.effective.original_statement,
          editedStatement: result.effective.edited_statement,
          comment: result.effective.comment,
          decidedAt: result.effective.decided_at,
        },
      });
      return;
    }

    const versionsMatch = url.pathname.match(/^\/api\/product-core\/lessons\/([^/]+)\/versions(?:\/([^/]+))?$/);
    if (req.method === "GET" && versionsMatch) {
      const lessonId = versionsMatch[1];
      if (!pcdb.prepare("SELECT id FROM lessons WHERE id = ?").get(lessonId)) {
        fail(404, "LESSON_NOT_FOUND", `课时不存在: ${lessonId}`, { lessonId });
      }
      const rows = pcdb
        .prepare("SELECT * FROM lesson_versions WHERE lesson_id = ? ORDER BY version_number")
        .all(lessonId);
      if (versionsMatch[2]) {
        const row = rows.find((item) => item.id === versionsMatch[2]);
        if (!row) fail(404, "LESSON_VERSION_NOT_FOUND", `课时版本不存在: ${versionsMatch[2]}`);
        sendJson(res, 200, { version: pcVersionView(row) });
        return;
      }
      sendJson(res, 200, { lessonId, versions: rows.map(pcVersionView) });
      return;
    }

    const workflowMatch = url.pathname.match(
      /^\/api\/product-core\/s1\/workflows\/([^/]+?)(?:\/(input|compute-facts|generate-claims|validate|publish|audit))?$/,
    );
    if (workflowMatch) {
      const workflowId = workflowMatch[1];
      const action = workflowMatch[2] ?? null;
      if (req.method === "GET" && action === null) {
        sendJson(res, 200, pcWorkspaceView(workflowId));
        return;
      }
      if (req.method === "GET" && action === "audit") {
        sendJson(res, 200, { workflowId, events: pcAuditTimeline(workflowId) });
        return;
      }
      if (req.method === "POST" && action === "input") {
        const body = await readJson(req, config.bodyLimitBytes);
        const actorContext = pcActor(body);
        pcGetWorkflowOr404(workflowId);
        const fixture = await pcLoadFixture(body);
        const workflow = importPretestAndAdvance(pcdb, { workflowId, fixture, actorContext });
        sendJson(res, 200, { workflow: pcWorkflowSummary(workflow) });
        return;
      }
      if (req.method === "POST" && action === "compute-facts") {
        const body = await readJson(req, config.bodyLimitBytes);
        pcGetWorkflowOr404(workflowId);
        const { workflow, facts } = computeFactsAndAdvance(pcdb, { workflowId, actorContext: pcActor(body) });
        sendJson(res, 200, { workflow: pcWorkflowSummary(workflow), facts });
        return;
      }
      if (req.method === "POST" && action === "generate-claims") {
        const body = await readJson(req, config.bodyLimitBytes);
        pcGetWorkflowOr404(workflowId);
        const result = await generateClaimsAndAdvance(pcdb, { workflowId, actorContext: pcActor(body) });
        sendJson(res, 200, {
          workflow: pcWorkflowSummary(result.workflow),
          modelRunId: result.modelRunId,
          calculationVersion: result.calculationVersion,
          claims: result.claims,
          decisionRecords: result.records,
        });
        return;
      }
      if (req.method === "POST" && action === "validate") {
        const body = await readJson(req, config.bodyLimitBytes);
        const actorContext = pcActor(body);
        pcGetWorkflowOr404(workflowId);
        const { gate } = validateAndAdvance(pcdb, { workflowId, actorContext });
        const { review } = reviewAndAdvance(pcdb, { workflowId, actorContext });
        const workflow = enterTeacherReview(pcdb, { workflowId, actorContext });
        sendJson(res, 200, { workflow: pcWorkflowSummary(workflow), gate, semanticReview: review });
        return;
      }
      if (req.method === "POST" && action === "publish") {
        const body = await readJson(req, config.bodyLimitBytes);
        pcGetWorkflowOr404(workflowId);
        const result = publish(pcdb, { workflowId, actorContext: pcActor(body) });
        sendJson(res, 200, {
          workflow: pcWorkflowSummary(pcGetWorkflowOr404(workflowId)),
          lessonVersionId: result.lessonVersionId,
          versionNumber: result.versionNumber,
          artifact: result.artifact,
        });
        return;
      }
      fail(405, "METHOD_NOT_ALLOWED", "该工作流接口不支持此动作或方法");
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
      if (error instanceof ProductCoreError || error instanceof SchemaValidationError) {
        sendJson(res, productCoreHttpStatus(error.code), {
          error: { code: error.code, message: error.message, details: error.details },
        });
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
