/**
 * DocumentParser 契约（业务侧唯一依赖）。
 * 依据 docs/product-core/document-parser-contract.md v1.0.0，落地为：
 *  - DocumentParser 接口约定：{ id, version, capabilities(), parse(input) }
 *  - ParsedDocument 结构校验 validateParsedDocument(doc)：不合格抛错（code='CONTRACT_VIOLATION'），不静默。
 *
 * ParsedDocument 顶层字段：documentMeta / parser / parserVersion / pages[] /
 * blocks[] / tables[] / warnings[] / parseConfidence / originalFileHash。
 * blocks 落库形态对应 server/migrations/001_product_core_domain.sql 的 content_blocks 表。
 */

import { createHash } from "node:crypto";

/** content_blocks.block_type 枚举（与 migration 001 的 CHECK 约束一致）。 */
export const BLOCK_TYPES = Object.freeze([
  "heading",
  "paragraph",
  "policy_article",
  "policy_clause",
  "table",
  "rubric",
  "case_context",
  "case_task",
  "case_action",
  "case_result",
  "figure_caption",
  "unknown",
]);

const BLOCK_TYPE_SET = new Set(BLOCK_TYPES);
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/;

/** 带错误码的解析器异常基类。错误不静默：code 必填，details 可选。 */
export class ParserError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = "ParserError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

/** 解析器环境不可用（如 mineru/docling 未安装）。code 固定为 PARSER_UNAVAILABLE。 */
export class ParserUnavailableError extends ParserError {
  constructor(message, details = undefined) {
    super("PARSER_UNAVAILABLE", message, details);
    this.name = "ParserUnavailableError";
  }
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function validateBbox(bbox) {
  return (
    Array.isArray(bbox) &&
    bbox.length === 4 &&
    bbox.every((n) => typeof n === "number" && Number.isFinite(n))
  );
}

/**
 * 校验 ParsedDocument 是否满足契约。全部问题收集后一次性抛出，避免逐条试错。
 * @param {object} doc 待校验文档
 * @returns {object} 原样返回 doc（通过时）
 * @throws {ParserError} code='CONTRACT_VIOLATION'，details.violations 为问题清单
 */
export function validateParsedDocument(doc) {
  const violations = [];
  const fail = (path, message) => violations.push({ path, message });

  if (!isPlainObject(doc)) {
    throw new ParserError("CONTRACT_VIOLATION", "ParsedDocument 必须是对象", {
      violations: [{ path: "$", message: "not an object" }],
    });
  }

  // documentMeta
  if (!isPlainObject(doc.documentMeta)) {
    fail("documentMeta", "缺失或不是对象");
  } else {
    for (const key of ["docId", "title", "sourceType"]) {
      if (!isNonEmptyString(doc.documentMeta[key])) {
        fail(`documentMeta.${key}`, "必须是非空字符串");
      }
    }
    if (
      doc.documentMeta.reviewStatus !== undefined &&
      !["unreviewed", "reviewed"].includes(doc.documentMeta.reviewStatus)
    ) {
      fail("documentMeta.reviewStatus", "必须是 unreviewed | reviewed");
    }
  }

  // parser / parserVersion / originalFileHash / parseConfidence
  if (!isNonEmptyString(doc.parser)) fail("parser", "必须是非空字符串");
  if (!isNonEmptyString(doc.parserVersion)) fail("parserVersion", "必须是非空字符串");
  if (typeof doc.originalFileHash !== "string" || !SHA256_PATTERN.test(doc.originalFileHash)) {
    fail("originalFileHash", "必须是 'sha256:' + 64 位小写十六进制");
  }
  if (
    typeof doc.parseConfidence !== "number" ||
    !Number.isFinite(doc.parseConfidence) ||
    doc.parseConfidence < 0 ||
    doc.parseConfidence > 1
  ) {
    fail("parseConfidence", "必须是 0..1 的有限数值");
  }

  // pages
  if (!Array.isArray(doc.pages)) {
    fail("pages", "必须是数组（无页码信息时为空数组）");
  } else {
    doc.pages.forEach((page, i) => {
      if (!isPlainObject(page)) return fail(`pages[${i}]`, "必须是对象");
      if (!isNonNegativeInteger(page.pageIndex)) fail(`pages[${i}].pageIndex`, "必须是非负整数");
      if (typeof page.pageLabel !== "string") fail(`pages[${i}].pageLabel`, "必须是字符串");
    });
  }

  // blocks
  if (!Array.isArray(doc.blocks)) {
    fail("blocks", "必须是数组");
  } else {
    const seenIds = new Set();
    doc.blocks.forEach((block, i) => {
      const p = `blocks[${i}]`;
      if (!isPlainObject(block)) return fail(p, "必须是对象");
      if (!isNonEmptyString(block.blockId)) {
        fail(`${p}.blockId`, "必须是非空字符串");
      } else if (seenIds.has(block.blockId)) {
        fail(`${p}.blockId`, `重复：${block.blockId}`);
      } else {
        seenIds.add(block.blockId);
      }
      if (!BLOCK_TYPE_SET.has(block.blockType)) {
        fail(`${p}.blockType`, `必须是枚举之一：${BLOCK_TYPES.join("/")}，收到 ${JSON.stringify(block.blockType)}`);
      }
      if (!isNonNegativeInteger(block.readingOrder)) fail(`${p}.readingOrder`, "必须是非负整数");
      if (block.parentBlockId !== null && block.parentBlockId !== undefined && typeof block.parentBlockId !== "string") {
        fail(`${p}.parentBlockId`, "必须是 null 或字符串");
      }
      if (block.pageIndex !== null && !isNonNegativeInteger(block.pageIndex)) {
        fail(`${p}.pageIndex`, "必须是 null 或非负整数");
      }
      if (block.pageLabel !== null && block.pageLabel !== undefined && typeof block.pageLabel !== "string") {
        fail(`${p}.pageLabel`, "必须是 null 或字符串");
      }
      if (block.bbox !== null && block.bbox !== undefined && !validateBbox(block.bbox)) {
        fail(`${p}.bbox`, "必须是 null 或 [x, y, w, h] 四个有限数值");
      }
      if (typeof block.bboxCoordinateSystem !== "string" || block.bboxCoordinateSystem.length === 0) {
        fail(`${p}.bboxCoordinateSystem`, "必须是非空字符串（无 bbox 时为 'none'）");
      }
      if ((block.bbox === null || block.bbox === undefined) && block.bboxCoordinateSystem !== "none") {
        fail(`${p}.bboxCoordinateSystem`, "bbox 为空时必须为 'none'");
      }
      if (typeof block.contentRaw !== "string") fail(`${p}.contentRaw`, "必须是字符串");
      if (typeof block.normalizedText !== "string") fail(`${p}.normalizedText`, "必须是字符串");
      if (typeof block.contentHash !== "string" || !SHA256_PATTERN.test(block.contentHash)) {
        fail(`${p}.contentHash`, "必须是 'sha256:' + 64 位小写十六进制");
      }
    });

    // parentBlockId 引用完整性
    doc.blocks.forEach((block, i) => {
      if (typeof block?.parentBlockId === "string" && !seenIds.has(block.parentBlockId)) {
        fail(`blocks[${i}].parentBlockId`, `引用了不存在的 blockId：${block.parentBlockId}`);
      }
    });

    // readingOrder 单调（跨页连续、严格递增）
    for (let i = 1; i < doc.blocks.length; i += 1) {
      const prev = doc.blocks[i - 1].readingOrder;
      const curr = doc.blocks[i].readingOrder;
      if (isNonNegativeInteger(prev) && isNonNegativeInteger(curr) && curr <= prev) {
        fail(`blocks[${i}].readingOrder`, `必须严格大于前一块（${curr} <= ${prev}）`);
      }
    }
  }

  // tables
  if (!Array.isArray(doc.tables)) {
    fail("tables", "必须是数组（无表格时为空数组）");
  } else {
    const blockIds = new Set(Array.isArray(doc.blocks) ? doc.blocks.map((b) => b?.blockId) : []);
    doc.tables.forEach((table, i) => {
      const p = `tables[${i}]`;
      if (!isPlainObject(table)) return fail(p, "必须是对象");
      if (!isNonEmptyString(table.tableId)) fail(`${p}.tableId`, "必须是非空字符串");
      if (!isNonEmptyString(table.blockId)) {
        fail(`${p}.blockId`, "必须是非空字符串");
      } else if (!blockIds.has(table.blockId)) {
        fail(`${p}.blockId`, `引用了不存在的 blockId：${table.blockId}`);
      }
      if (!Array.isArray(table.header) || !table.header.every((c) => typeof c === "string")) {
        fail(`${p}.header`, "必须是字符串数组");
      }
      if (
        !Array.isArray(table.rows) ||
        !table.rows.every((row) => Array.isArray(row) && row.every((c) => typeof c === "string"))
      ) {
        fail(`${p}.rows`, "必须是字符串二维数组");
      }
    });
  }

  // warnings
  if (!Array.isArray(doc.warnings)) {
    fail("warnings", "必须是数组（无告警时为空数组）");
  } else {
    doc.warnings.forEach((warning, i) => {
      if (!isPlainObject(warning)) return fail(`warnings[${i}]`, "必须是对象");
      if (!isNonEmptyString(warning.code)) fail(`warnings[${i}].code`, "必须是非空字符串");
      if (!isNonEmptyString(warning.message)) fail(`warnings[${i}].message`, "必须是非空字符串");
    });
  }

  if (violations.length > 0) {
    throw new ParserError(
      "CONTRACT_VIOLATION",
      `ParsedDocument 不满足契约（${violations.length} 处）：${violations[0].path} ${violations[0].message}`,
      { violations },
    );
  }
  return doc;
}

/**
 * 计算 sha256 内容哈希，输出 'sha256:<hex>' 形式。
 * @param {string|Buffer} content
 */
export function sha256Hex(content) {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}
