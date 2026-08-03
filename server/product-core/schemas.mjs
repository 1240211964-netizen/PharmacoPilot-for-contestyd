// 产品内核 JSON Schema 校验入口:加载 schemas/v1 与 schemas/v1.0.1 的 *.schema.json,
// 按对象自带 schemaVersion 路由到对应版本文件(1.0.0 -> v1;1.0.1 -> v1.0.1,
// 无 v1.0.1 文件的 schema 仍走 v1),缓存编译结果。
// 对外提供 listSchemas()、validateAgainstSchema()、getWriteSchemaVersion() 与
// CURRENT_SCHEMA_VERSION。校验失败抛出 SchemaValidationError(code=SCHEMA_VALIDATION_FAILED),
// 错误信息带字段路径,绝不静默吞错。
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

// 当前写入版本(全量 schema 集合的最新版本);1.0.1 为增量发布,
// 仅 teaching-decision-record / evidence-reference 有 v1.0.1 文件,
// 其余四个 schema 的当前版本仍是 1.0.0(见 getWriteSchemaVersion)。
export const CURRENT_SCHEMA_VERSION = '1.0.1';
export const LEGACY_SCHEMA_VERSION = '1.0.0';

const SCHEMA_DIR_V1 = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../schemas/v1',
);
const SCHEMA_DIR_V1_0_1 = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../schemas/v1.0.1',
);
const SCHEMA_SUFFIX = '.schema.json';

const ajv = new Ajv({ allErrors: true, strict: true });
addFormats(ajv);

const validatorCache = new Map();
let schemaNamesCache = null;
let patchSchemaNamesCache = null;

export class SchemaValidationError extends Error {
  constructor(schemaName, details) {
    super(
      `Schema validation failed for "${schemaName}":\n` +
        details.map((d) => `  - ${d}`).join('\n'),
    );
    this.name = 'SchemaValidationError';
    this.code = 'SCHEMA_VALIDATION_FAILED';
    this.schemaName = schemaName;
    this.details = details;
  }
}

// 把 ajv 错误格式化为 "<字段路径>: <message>";required/additionalProperties
// 的 instancePath 指向父级,补上缺失/多余字段名,保证路径指明出错字段。
function formatAjvError(err) {
  let p = err.instancePath || '';
  if (err.keyword === 'required' && err.params?.missingProperty) {
    p += `/${err.params.missingProperty}`;
  } else if (
    err.keyword === 'additionalProperties' &&
    err.params?.additionalProperty
  ) {
    p += `/${err.params.additionalProperty}`;
  }
  if (!p) p = '/';
  return `${p}: ${err.message}`;
}

async function listSchemaFiles(dir) {
  let files;
  try {
    files = await readdir(dir);
  } catch (err) {
    if (err?.code === 'ENOENT') return []; // 增量目录可不存在
    throw err;
  }
  return files
    .filter((f) => f.endsWith(SCHEMA_SUFFIX))
    .map((f) => f.slice(0, -SCHEMA_SUFFIX.length))
    .sort();
}

// 全部已知 schema 名(v1 与 v1.0.1 的并集)。
export async function listSchemas() {
  if (schemaNamesCache) return schemaNamesCache;
  const [base, patch] = await Promise.all([
    listSchemaFiles(SCHEMA_DIR_V1),
    listSchemaFiles(SCHEMA_DIR_V1_0_1),
  ]);
  schemaNamesCache = [...new Set([...base, ...patch])].sort();
  return schemaNamesCache;
}

// v1.0.1 增量目录中实际存在的 schema 名。
async function listPatchSchemas() {
  if (patchSchemaNamesCache) return patchSchemaNamesCache;
  patchSchemaNamesCache = await listSchemaFiles(SCHEMA_DIR_V1_0_1);
  return patchSchemaNamesCache;
}

// 该 schema 当前的写入版本:有 v1.0.1 文件则为 1.0.1,否则仍为 1.0.0。
export async function getWriteSchemaVersion(schemaName) {
  const names = await listSchemas();
  if (!names.includes(schemaName)) {
    throw new Error(
      `Unknown schema "${schemaName}". Available: ${names.join(', ')}`,
    );
  }
  return (await listPatchSchemas()).includes(schemaName)
    ? CURRENT_SCHEMA_VERSION
    : LEGACY_SCHEMA_VERSION;
}

// 按声明版本解析 schema 文件位置:1.0.0 一律走 v1;1.0.1 优先 v1.0.1,
// 无增量文件回落 v1(const 校验会在 /schemaVersion 上报错,而非静默放过);
// 未知/缺失版本按当前写入版本解析,同样由 const 校验兜出 /schemaVersion 错误。
async function resolveSchemaLocation(schemaName, schemaVersion) {
  const names = await listSchemas();
  if (!names.includes(schemaName)) {
    throw new Error(
      `Unknown schema "${schemaName}". Available: ${names.join(', ')}`,
    );
  }
  const patchNames = await listPatchSchemas();
  if (schemaVersion === LEGACY_SCHEMA_VERSION) {
    return { dir: SCHEMA_DIR_V1, key: `v1:${schemaName}` };
  }
  if (schemaVersion === CURRENT_SCHEMA_VERSION && patchNames.includes(schemaName)) {
    return { dir: SCHEMA_DIR_V1_0_1, key: `v1.0.1:${schemaName}` };
  }
  // 未知版本或 1.0.1 但该 schema 无增量文件:落到其当前写入版本文件。
  return patchNames.includes(schemaName)
    ? { dir: SCHEMA_DIR_V1_0_1, key: `v1.0.1:${schemaName}` }
    : { dir: SCHEMA_DIR_V1, key: `v1:${schemaName}` };
}

async function getValidator(schemaName, schemaVersion) {
  const { dir, key } = await resolveSchemaLocation(schemaName, schemaVersion);
  if (validatorCache.has(key)) return validatorCache.get(key);
  const raw = await readFile(
    path.join(dir, `${schemaName}${SCHEMA_SUFFIX}`),
    'utf8',
  );
  const validator = ajv.compile(JSON.parse(raw));
  validatorCache.set(key, validator);
  return validator;
}

// 默认按 obj.schemaVersion 路由;可用 options.schemaVersion 显式指定目标版本
// (fixture 回归、读旧写新的 upgrade 校验等场景)。
export async function validateAgainstSchema(schemaName, obj, options = {}) {
  const declared =
    options.schemaVersion ??
    (obj !== null && typeof obj === 'object' ? obj.schemaVersion : undefined);
  const validate = await getValidator(schemaName, declared);
  const valid = validate(obj);
  if (!valid) {
    const details = (validate.errors ?? []).map(formatAjvError);
    throw new SchemaValidationError(schemaName, details);
  }
  return true;
}
