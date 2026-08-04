import { resolve } from "node:path";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);

function integerEnv(name, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const raw = process.env[name];
  if (raw == null || raw === "") return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} 必须是 ${min}–${max} 之间的整数`);
  }
  return parsed;
}

function normalizeModelBaseUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("PHARMACO_MODEL_BASE_URL 仅支持 http/https");
  }
  return url.toString().replace(/\/$/, "");
}

export function loadConfig(overrides = {}) {
  const rootDir = resolve(overrides.rootDir || process.cwd());
  const host = overrides.host || process.env.PHARMACO_HOST || "127.0.0.1";
  const apiToken = overrides.apiToken ?? process.env.PHARMACO_API_TOKEN ?? "";

  // 一旦对局域网开放，必须显式设置 token，避免教学数据和本地模型被无认证访问。
  if (!LOOPBACK_HOSTS.has(host) && !apiToken) {
    throw new Error("非回环地址启动时必须设置 PHARMACO_API_TOKEN");
  }

  return Object.freeze({
    rootDir,
    webRoot: resolve(overrides.webRoot || rootDir),
    dataDir: resolve(overrides.dataDir || process.env.PHARMACO_DATA_DIR || resolve(rootDir, ".pharmaco-data")),
    host,
    port: overrides.port
      ?? integerEnv("PORT", null, { min: 1, max: 65535 })
      ?? integerEnv("PHARMACO_PORT", 4173, { min: 0, max: 65535 }),
    apiToken,
    bodyLimitBytes: overrides.bodyLimitBytes ?? integerEnv("PHARMACO_BODY_LIMIT_BYTES", 2 * 1024 * 1024, { min: 1024 }),
    modelBaseUrl: normalizeModelBaseUrl(
      overrides.modelBaseUrl || process.env.PHARMACO_MODEL_BASE_URL || "http://127.0.0.1:8080/v1",
    ),
    modelName: overrides.modelName || process.env.PHARMACO_MODEL_NAME || "mlx-community/Qwen3.5-9B-4bit",
    modelApiKey: overrides.modelApiKey ?? process.env.PHARMACO_MODEL_API_KEY ?? "",
    modelTimeoutMs: overrides.modelTimeoutMs ?? integerEnv("PHARMACO_MODEL_TIMEOUT_MS", 120_000, { min: 1_000 }),
    modelStatusTimeoutMs: overrides.modelStatusTimeoutMs ?? 2_500,
  });
}
