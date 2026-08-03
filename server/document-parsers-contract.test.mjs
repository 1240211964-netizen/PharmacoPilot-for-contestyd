import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { BLOCK_TYPES } from "./document-parsers/parser-contract.mjs";

// 漂移检查:docs/product-core/document-parser-contract.md(契约文档)
// 必须与 parser-contract.mjs(实现)及 migration 001(落库 CHECK)逐字一致。
// 任一断言失败即说明三方出现漂移,失败信息指明缺什么/多什么,不静默。
const DOC_TEXT = readFileSync(
  new URL("../docs/product-core/document-parser-contract.md", import.meta.url),
  "utf8",
);
const SQL_TEXT = readFileSync(
  new URL("../server/migrations/001_product_core_domain.sql", import.meta.url),
  "utf8",
);

/** 从文档的 "`blockType` 十二值枚举固定为:`a / b / …`" 清单行解析出文档声明的枚举列表。 */
function parseDocBlockTypes(docText) {
  const line = docText
    .split("\n")
    .find((l) => l.includes("blockType") && l.includes("十二值枚举") && l.includes("固定为"));
  assert.ok(line, "文档解析失败:找不到 `blockType` 十二值枚举清单行(文档结构已变,需同步本测试)");
  const spans = [...line.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
  const enumSpan = spans.find((s) => s.includes("/"));
  assert.ok(enumSpan, "文档解析失败:枚举清单行缺少反引号包裹的 `a / b / …` 列表");
  return enumSpan
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 从 migration SQL 文本解析 content_blocks.block_type 的 CHECK IN 枚举列表。 */
function parseSqlBlockTypes(sqlText) {
  const m = sqlText.match(/CHECK\s*\(\s*block_type\s+IN\s*\(([^)]*)\)/);
  assert.ok(m, "SQL 解析失败:找不到 content_blocks.block_type 的 CHECK (block_type IN (...)) 约束");
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

/** 集合差:missing = 权威方有而待检方缺;extra = 待检方多出来的。 */
function diffValues(authoritative, candidate) {
  return {
    missing: authoritative.filter((v) => !candidate.includes(v)),
    extra: candidate.filter((v) => !authoritative.includes(v)),
  };
}

/** 漂移断言:两方枚举集合必须一致,失败信息指明缺什么/多什么。 */
function assertEnumNoDrift(kind, authoritative, authoritativeName, candidate, candidateName) {
  const { missing, extra } = diffValues(authoritative, candidate);
  assert.deepEqual(
    { missing, extra },
    { missing: [], extra: [] },
    `文档与实现漂移(${kind}):${candidateName} 相比 ${authoritativeName} —— ` +
      `缺 [${missing.join(", ") || "无"}](${authoritativeName} 有而${candidateName} 没有),` +
      `多 [${extra.join(", ") || "无"}](${candidateName} 有而${authoritativeName} 没有)`,
  );
}

test("漂移检查:block_type 十二值枚举 —— 文档 vs parser-contract.mjs", () => {
  assert.equal(
    BLOCK_TYPES.length,
    12,
    `实现漂移:BLOCK_TYPES 应为 12 值枚举,实际 ${BLOCK_TYPES.length} 值:[${BLOCK_TYPES.join(", ")}]`,
  );

  // 实现中的每个枚举值必须在文档中逐字出现
  const absent = BLOCK_TYPES.filter((v) => !DOC_TEXT.includes(v));
  assert.deepEqual(
    absent,
    [],
    `文档与实现漂移(block_type 逐字):文档缺少实现中的枚举值 [${absent.join(", ")}]`,
  );

  // 双向集合比对:文档枚举清单行 vs 实现 BLOCK_TYPES(抓"文档有而实现没有"的多余值)
  const docTypes = parseDocBlockTypes(DOC_TEXT);
  assertEnumNoDrift("block_type 枚举", BLOCK_TYPES, "实现 BLOCK_TYPES", docTypes, "文档枚举清单");
});

test("漂移检查:ParsedDocument 顶层字段与 block 关键字段名在文档中逐字出现", () => {
  const TOP_LEVEL_FIELDS = [
    "documentMeta",
    "parser",
    "parserVersion",
    "pages",
    "blocks",
    "tables",
    "warnings",
    "parseConfidence",
    "originalFileHash",
  ];
  const BLOCK_FIELDS = [
    "contentRaw",
    "normalizedText",
    "parentBlockId",
    "contentHash",
    "readingOrder",
    "bboxCoordinateSystem",
  ];

  const missingTop = TOP_LEVEL_FIELDS.filter((f) => !DOC_TEXT.includes(f));
  const missingBlock = BLOCK_FIELDS.filter((f) => !DOC_TEXT.includes(f));
  assert.deepEqual(
    { missingTop, missingBlock },
    { missingTop: [], missingBlock: [] },
    `文档与实现漂移(ParsedDocument 字段):文档缺顶层字段 [${missingTop.join(", ") || "无"}],` +
      `缺 block 字段 [${missingBlock.join(", ") || "无"}]`,
  );
});

test("漂移检查:文档 / 实现 / migration 001 content_blocks CHECK 三方枚举一致", () => {
  const sqlTypes = parseSqlBlockTypes(SQL_TEXT);
  const docTypes = parseDocBlockTypes(DOC_TEXT);
  assertEnumNoDrift("SQL CHECK vs 实现", BLOCK_TYPES, "实现 BLOCK_TYPES", sqlTypes, "migration 001 CHECK");
  assertEnumNoDrift("SQL CHECK vs 文档", sqlTypes, "migration 001 CHECK", docTypes, "文档枚举清单");
});

test("漂移检查:三个 adapter 名称与 PARSER_UNAVAILABLE 错误码在文档中逐字出现", () => {
  const ADAPTER_IDS = ["manual-markdown", "mineru", "docling"];
  const missingAdapters = ADAPTER_IDS.filter((a) => !DOC_TEXT.includes(a));
  const hasErrorCode = DOC_TEXT.includes("PARSER_UNAVAILABLE");
  assert.deepEqual(
    { missingAdapters, hasErrorCode },
    { missingAdapters: [], hasErrorCode: true },
    `文档与实现漂移(adapter/错误码):文档缺 adapter [${missingAdapters.join(", ") || "无"}],` +
      `PARSER_UNAVAILABLE ${hasErrorCode ? "在档" : "缺失"}`,
  );
});
