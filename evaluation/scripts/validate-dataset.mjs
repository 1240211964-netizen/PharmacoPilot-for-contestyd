// validate-dataset.mjs
// 用途:evaluation/datasets/ 数据集结构校验的零依赖实现,与
//   evaluation/schemas/dataset.schema.json 的约束一一对应(schema 文件是对外契约文档,
//   本模块是可执行校验;两者必须同步修改)。
// validateDataset(data) 返回错误字符串数组,空数组 = 合法。任何不合法都不静默。

const DATASET_ID_PATTERN = /^(retrieval|refusal)-(dev|holdout)\.v[0-9]+$/;
const CASE_ID_PATTERN = /^(retrieval|refusal)(-holdout)?-[0-9]{3}$/;
const DOC_ID_PATTERN = /^doc_[0-9]{3}$/;
const VERSION_PATTERN = /^v[0-9]+$/;
const QUOTE_HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
const DATE_PATTERN = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

const DATASET_KEYS = new Set(["datasetId", "schemaVersion", "kind", "split", "createdAt", "cases"]);
const CASE_KEYS = new Set(["caseId", "schemaVersion", "question", "answerable", "goldSources", "forbiddenClaims", "tags"]);
const GOLD_KEYS = new Set(["documentId", "sourceVersion", "pageIndex", "pageLabel", "verbatimQuote", "quoteHash"]);

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function checkKeys(obj, allowed, path, errors) {
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) errors.push(`${path}: 不允许的字段 ${key}`);
  }
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

export function validateDataset(data) {
  const errors = [];
  if (!isPlainObject(data)) return ["数据集必须是 JSON object"];
  checkKeys(data, DATASET_KEYS, "dataset", errors);

  if (typeof data.datasetId !== "string" || !DATASET_ID_PATTERN.test(data.datasetId)) {
    errors.push(`datasetId 非法: ${JSON.stringify(data.datasetId)}`);
  }
  if (data.schemaVersion !== "1.0.0") errors.push(`schemaVersion 必须是 "1.0.0",得到 ${JSON.stringify(data.schemaVersion)}`);
  if (data.kind !== "retrieval" && data.kind !== "refusal") errors.push(`kind 非法: ${JSON.stringify(data.kind)}`);
  if (data.split !== "dev" && data.split !== "holdout") errors.push(`split 非法: ${JSON.stringify(data.split)}`);
  if (typeof data.datasetId === "string" && DATASET_ID_PATTERN.test(data.datasetId)) {
    const [kind, rest] = data.datasetId.split("-");
    const split = rest.split(".")[0];
    if (data.kind !== undefined && data.kind !== kind) errors.push(`kind(${data.kind}) 与 datasetId(${data.datasetId}) 不一致`);
    if (data.split !== undefined && data.split !== split) errors.push(`split(${data.split}) 与 datasetId(${data.datasetId}) 不一致`);
  }
  if (typeof data.createdAt !== "string" || !DATE_PATTERN.test(data.createdAt)) {
    errors.push(`createdAt 非法: ${JSON.stringify(data.createdAt)}`);
  }

  if (!Array.isArray(data.cases) || data.cases.length === 0) {
    errors.push("cases 必须是非空数组");
    return errors;
  }

  const seenCaseIds = new Set();
  data.cases.forEach((item, index) => {
    const path = `cases[${index}]`;
    if (!isPlainObject(item)) {
      errors.push(`${path}: 必须是 object`);
      return;
    }
    checkKeys(item, CASE_KEYS, path, errors);
    const id = item.caseId;
    if (typeof id !== "string" || !CASE_ID_PATTERN.test(id)) {
      errors.push(`${path}.caseId 非法: ${JSON.stringify(id)}`);
    } else {
      if (seenCaseIds.has(id)) errors.push(`${path}.caseId 重复: ${id}`);
      seenCaseIds.add(id);
      const prefix = id.startsWith("retrieval") ? "retrieval" : "refusal";
      if (data.kind !== undefined && prefix !== data.kind) {
        errors.push(`${path}.caseId(${id}) 与数据集 kind(${data.kind}) 不一致`);
      }
      const isHoldout = id.includes("-holdout-");
      if (data.split !== undefined && isHoldout !== (data.split === "holdout")) {
        errors.push(`${path}.caseId(${id}) 与数据集 split(${data.split}) 不一致`);
      }
    }
    if (item.schemaVersion !== "1.0.0") errors.push(`${path}.schemaVersion 必须是 "1.0.0"`);
    if (!isNonEmptyString(item.question)) errors.push(`${path}.question 必须是非空字符串`);
    if (typeof item.answerable !== "boolean") errors.push(`${path}.answerable 必须是 boolean`);

    if (!Array.isArray(item.goldSources)) {
      errors.push(`${path}.goldSources 必须是数组`);
    } else {
      if (item.answerable === true && item.goldSources.length === 0) {
        errors.push(`${path}: answerable=true 时 goldSources 不得为空`);
      }
      if (item.answerable === false && item.goldSources.length !== 0) {
        errors.push(`${path}: answerable=false 时 goldSources 必须为空数组`);
      }
      item.goldSources.forEach((gold, goldIndex) => {
        const gpath = `${path}.goldSources[${goldIndex}]`;
        if (!isPlainObject(gold)) {
          errors.push(`${gpath}: 必须是 object`);
          return;
        }
        checkKeys(gold, GOLD_KEYS, gpath, errors);
        if (typeof gold.documentId !== "string" || !DOC_ID_PATTERN.test(gold.documentId)) {
          errors.push(`${gpath}.documentId 非法: ${JSON.stringify(gold.documentId)}`);
        }
        if (typeof gold.sourceVersion !== "string" || !VERSION_PATTERN.test(gold.sourceVersion)) {
          errors.push(`${gpath}.sourceVersion 非法: ${JSON.stringify(gold.sourceVersion)}`);
        }
        if (!Number.isInteger(gold.pageIndex) || gold.pageIndex < 0) {
          errors.push(`${gpath}.pageIndex 必须是非负整数: ${JSON.stringify(gold.pageIndex)}`);
        }
        if (!isNonEmptyString(gold.pageLabel)) errors.push(`${gpath}.pageLabel 必须是非空字符串`);
        if (typeof gold.verbatimQuote !== "string" || gold.verbatimQuote.length < 4) {
          errors.push(`${gpath}.verbatimQuote 必须是长度 ≥4 的字符串`);
        }
        if (typeof gold.quoteHash !== "string" || !QUOTE_HASH_PATTERN.test(gold.quoteHash)) {
          errors.push(`${gpath}.quoteHash 非法: ${JSON.stringify(gold.quoteHash)}`);
        }
      });
    }

    if (!Array.isArray(item.forbiddenClaims) || item.forbiddenClaims.some((c) => !isNonEmptyString(c))) {
      errors.push(`${path}.forbiddenClaims 必须是非空字符串数组`);
    }
    if (!Array.isArray(item.tags) || item.tags.length === 0 || item.tags.some((t) => !isNonEmptyString(t))) {
      errors.push(`${path}.tags 必须是非空的非空字符串数组`);
    }
  });

  return errors;
}

// 校验失败即抛错(不静默),供脚本入口使用。
export function assertValidDataset(data, source = "dataset") {
  const errors = validateDataset(data);
  if (errors.length > 0) {
    throw new Error(`${source} 未通过 schema 校验:\n${errors.map((e) => `  - ${e}`).join("\n")}`);
  }
}
