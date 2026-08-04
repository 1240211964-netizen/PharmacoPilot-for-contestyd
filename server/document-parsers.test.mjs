import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  ParserError,
  sha256Hex,
  validateParsedDocument,
} from "./document-parsers/parser-contract.mjs";
import { createManualMarkdownParser } from "./document-parsers/manual-markdown-parser.mjs";
import { createMineruAdapter } from "./document-parsers/mineru-adapter.mjs";
import { createDoclingAdapter } from "./document-parsers/docling-adapter.mjs";
import { getParser, listParsers } from "./document-parsers/index.mjs";

const FRONTMATTER = `---
docId: test-doc-001
title: 测试规范（脱敏）
sourceType: 中文政策
correctedBy: 测试员
correctedAt: 2026-08-03T09:00:00+08:00
reviewed: true
parseConfidence: 0.95
pageMap:
  - heading: 第一章 总则
    pageIndex: 0
    pageLabel: "1"
  - heading: 第二章 附则
    pageIndex: 1
    pageLabel: "2"
---
`;

function writeTempMarkdown(t, body, frontmatter = FRONTMATTER) {
  const dir = mkdtempSync(join(tmpdir(), "pharmaco-parser-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const fileRef = join(dir, "sample.md");
  writeFileSync(fileRef, frontmatter + body, "utf8");
  return fileRef;
}

test("manual-markdown parser", async (t) => {
  await t.test("解析 heading / paragraph / policy_article / policy_clause", async () => {
    const parser = createManualMarkdownParser();
    const fileRef = writeTempMarkdown(
      t,
      `# 测试规范（脱敏）

## 第一章 总则

第一条 为保障用药安全，制定本规范。

（一）质量管理部门独立履职；

（二）主要负责人对质量负总责。

## 第二章 附则

第二条 本规范自发布之日起施行。
`,
    );
    const doc = await parser.parse({ fileRef, fileHash: sha256Hex("ignored-but-well-formed") });

    assert.equal(doc.parser, "manual-markdown");
    assert.match(doc.originalFileHash, /^sha256:[0-9a-f]{64}$/);

    const byType = (type) => doc.blocks.filter((b) => b.blockType === type);
    assert.ok(byType("heading").length >= 3, "应有 # 与两个 ## 标题");
    const articles = byType("policy_article");
    assert.equal(articles.length, 2);
    assert.ok(articles[0].contentRaw.startsWith("第一条"));
    const clauses = byType("policy_clause");
    assert.equal(clauses.length, 2);
    assert.equal(clauses[0].parentBlockId, articles[0].blockId, "（一）应挂到第一条");
    assert.equal(clauses[1].parentBlockId, articles[0].blockId, "（二）应挂到第一条");
    assert.equal(articles[1].parentBlockId, null);
    // 附则段（第二条 所在章节标题下无其他段落时，至少存在标题块）
    assert.ok(doc.blocks.every((b, i) => b.readingOrder === i), "readingOrder 应连续递增");
  });

  await t.test("解析 paragraph 与 figure_caption", async () => {
    const parser = createManualMarkdownParser();
    const fileRef = writeTempMarkdown(
      t,
      `## 第一章 总则

这是正文第一段，说明背景。

图1 质量管理流程示意（脱敏重绘）

## 第二章 附则

这是正文第二段。
`,
    );
    const doc = await parser.parse({ fileRef });
    const paragraphs = doc.blocks.filter((b) => b.blockType === "paragraph");
    assert.equal(paragraphs.length, 2);
    assert.ok(paragraphs[0].normalizedText.includes("正文第一段"));
    const captions = doc.blocks.filter((b) => b.blockType === "figure_caption");
    assert.equal(captions.length, 1);
    assert.ok(captions[0].contentRaw.startsWith("图1"));
  });

  await t.test("解析 GFM 表格 → table 块 + tables[]", async () => {
    const parser = createManualMarkdownParser();
    const fileRef = writeTempMarkdown(
      t,
      `## 第一章 总则

| 维度 | 优秀 | 合格 |
| --- | --- | --- |
| 信息收集 | 系统询问 | 部分询问 |
| 沟通表达 | 通俗确认 | 基本清楚 |

## 第二章 附则

第二条 完。
`,
    );
    const doc = await parser.parse({ fileRef });
    const tableBlocks = doc.blocks.filter((b) => b.blockType === "table");
    assert.equal(tableBlocks.length, 1);
    assert.equal(doc.tables.length, 1);
    assert.equal(doc.tables[0].blockId, tableBlocks[0].blockId);
    assert.deepEqual(doc.tables[0].header, ["维度", "优秀", "合格"]);
    assert.equal(doc.tables[0].rows.length, 2);
    assert.deepEqual(doc.tables[0].rows[0], ["信息收集", "系统询问", "部分询问"]);
  });

  await t.test("contentHash 稳定且与内容绑定", async () => {
    const parser = createManualMarkdownParser();
    const body = `## 第一章 总则

第一条 内容固定的条款。

## 第二章 附则

第二条 完。
`;
    const docA = await parser.parse({ fileRef: writeTempMarkdown(t, body) });
    const docB = await parser.parse({ fileRef: writeTempMarkdown(t, body) });
    assert.deepEqual(
      docA.blocks.map((b) => b.contentHash),
      docB.blocks.map((b) => b.contentHash),
      "同一输入两次解析 contentHash 必须一致",
    );
    assert.equal(docA.blocks[1].contentHash, sha256Hex("第一条 内容固定的条款。"));
  });

  await t.test("缺 front-matter 必填字段报错（不静默）", async () => {
    const parser = createManualMarkdownParser();
    const bad = `---
docId: x
title: 只给两个字段
---

正文。
`;
    const fileRef = writeTempMarkdown(t, "", bad);
    await assert.rejects(parser.parse({ fileRef }), (err) => {
      assert.equal(err.code, "FRONTMATTER_INVALID");
      assert.match(err.message, /sourceType/);
      assert.match(err.message, /correctedBy/);
      return true;
    });
  });

  await t.test("无 front-matter 围栏报错", async () => {
    const parser = createManualMarkdownParser();
    const fileRef = writeTempMarkdown(t, "只有正文，没有 front-matter。\n", "");
    await assert.rejects(parser.parse({ fileRef }), (err) => {
      assert.equal(err.code, "FRONTMATTER_MISSING");
      return true;
    });
  });

  await t.test("pageMap 映射正确；锚点前块 pageIndex=null 并记 warning", async () => {
    const parser = createManualMarkdownParser();
    const fileRef = writeTempMarkdown(
      t,
      `# 文档标题（锚点前）

## 第一章 总则

第一条 甲。

## 第二章 附则

第二条 乙。
`,
    );
    const doc = await parser.parse({ fileRef });
    const find = (prefix) => doc.blocks.find((b) => b.contentRaw.startsWith(prefix));
    assert.equal(find("# 文档标题") ?? find("文档标题（锚点前）") !== undefined, true);
    const titleBlock = doc.blocks.find((b) => b.contentRaw === "文档标题（锚点前）");
    assert.equal(titleBlock.pageIndex, null);
    assert.equal(find("第一章 总则").pageIndex, 0);
    assert.equal(find("第一章 总则").pageLabel, "1");
    assert.equal(find("第一条").pageIndex, 0, "锚点生效至下一锚点");
    assert.equal(find("第二章 附则").pageIndex, 1);
    assert.equal(find("第二条").pageLabel, "2");
    assert.ok(doc.warnings.some((w) => w.code === "PAGE_UNMAPPED"));
    assert.deepEqual(
      doc.pages.map((p) => p.pageIndex),
      [0, 1],
    );
  });

  await t.test("无 pageMap 时全部 pageIndex=null 并记 PAGE_MAP_MISSING", async () => {
    const parser = createManualMarkdownParser();
    const frontmatter = FRONTMATTER.replace(/pageMap:[\s\S]*?\n---\n/, "---\n");
    const fileRef = writeTempMarkdown(t, `## 第一章 总则\n\n第一条 甲。\n`, frontmatter);
    const doc = await parser.parse({ fileRef });
    assert.ok(doc.blocks.every((b) => b.pageIndex === null));
    assert.equal(doc.pages.length, 0);
    assert.ok(doc.warnings.some((w) => w.code === "PAGE_MAP_MISSING"));
  });

  await t.test("reviewed=false → reviewStatus=unreviewed + REVIEW_PENDING 告警", async () => {
    const parser = createManualMarkdownParser();
    const frontmatter = FRONTMATTER.replace("reviewed: true", "reviewed: false");
    const fileRef = writeTempMarkdown(t, `## 第一章 总则\n\n第一条 甲。\n`, frontmatter);
    const doc = await parser.parse({ fileRef });
    assert.equal(doc.documentMeta.reviewStatus, "unreviewed");
    assert.ok(doc.warnings.some((w) => w.code === "REVIEW_PENDING"));
    assert.equal(doc.parseConfidence, 0.95, "front-matter 显式给的 confidence 优先");
  });

  await t.test("capabilities() 如实声明：无 bbox", () => {
    const caps = createManualMarkdownParser().capabilities();
    assert.equal(caps.bbox, false);
    assert.equal(caps.bboxCoordinateSystem, "none");
    assert.equal(caps.tables, true);
    assert.ok(caps.blockTypes.includes("policy_article"));
  });
});

test("validateParsedDocument", async (t) => {
  const parser = createManualMarkdownParser();
  const fileRef = writeTempMarkdown(t, `## 第一章 总则\n\n第一条 甲。\n`);
  const good = await parser.parse({ fileRef });
  assert.equal(validateParsedDocument(good), good, "合法文档应原样通过");

  await t.test("拒绝缺字段文档", () => {
    assert.throws(() => validateParsedDocument({}), (err) => {
      assert.equal(err.code, "CONTRACT_VIOLATION");
      const paths = err.details.violations.map((v) => v.path);
      for (const expected of ["documentMeta", "parser", "pages", "blocks", "tables", "warnings", "originalFileHash", "parseConfidence"]) {
        assert.ok(paths.includes(expected), `应报告缺 ${expected}`);
      }
      return true;
    });
  });

  await t.test("拒绝非法 blockType 与非法哈希", () => {
    const bad = structuredClone(good);
    bad.blocks[0].blockType = "made-up-type";
    bad.originalFileHash = "md5:abc";
    assert.throws(() => validateParsedDocument(bad), (err) => {
      assert.equal(err.code, "CONTRACT_VIOLATION");
      assert.ok(err.details.violations.some((v) => v.path.endsWith("blockType")));
      assert.ok(err.details.violations.some((v) => v.path === "originalFileHash"));
      return true;
    });
  });

  await t.test("拒绝 readingOrder 非单调与悬空 parentBlockId", () => {
    const bad = structuredClone(good);
    bad.blocks[1].readingOrder = bad.blocks[0].readingOrder;
    bad.blocks[1].parentBlockId = "b9999";
    assert.throws(() => validateParsedDocument(bad), (err) => {
      assert.ok(err.details.violations.some((v) => v.path.includes("readingOrder")));
      assert.ok(err.details.violations.some((v) => v.path.includes("parentBlockId")));
      return true;
    });
  });

  await t.test("拒绝 bbox 为空但坐标系非 none", () => {
    const bad = structuredClone(good);
    bad.blocks[0].bboxCoordinateSystem = "pdf-points";
    assert.throws(() => validateParsedDocument(bad), /bbox 为空时必须为 'none'/);
  });
});

test("mineru / docling adapter（当前环境阻塞，如实报错）", async (t) => {
  for (const [name, factory] of [
    ["mineru", createMineruAdapter],
    ["docling", createDoclingAdapter],
  ]) {
    await t.test(`${name}: capabilities() 正常返回`, () => {
      const caps = factory().capabilities();
      assert.equal(typeof caps.bbox, "boolean");
      assert.ok(Array.isArray(caps.blockTypes));
    });
    await t.test(`${name}: parse() 抛 PARSER_UNAVAILABLE 且不伪造结果`, async () => {
      await assert.rejects(factory().parse({ fileRef: "/nonexistent.pdf", fileHash: sha256Hex("x") }), (err) => {
        assert.equal(err.code, "PARSER_UNAVAILABLE");
        assert.ok(err instanceof ParserError);
        assert.match(err.message, /不可用|尚未实现/);
        return true;
      });
    });
  }
});

test("registry", async (t) => {
  await t.test("getParser 取到已注册 adapter，未注册抛 PARSER_NOT_FOUND", () => {
    assert.equal(getParser("manual-markdown").id, "manual-markdown");
    assert.equal(getParser("mineru").id, "mineru");
    assert.equal(getParser("docling").id, "docling");
    assert.throws(() => getParser("nope"), (err) => {
      assert.equal(err.code, "PARSER_NOT_FOUND");
      return true;
    });
  });

  await t.test("listParsers 含可用性状态：manual/paginated-text 可用，mineru/docling 当前不可用", () => {
    const listed = listParsers();
    assert.equal(listed.length, 4);
    const byId = Object.fromEntries(listed.map((p) => [p.id, p]));
    assert.equal(byId["manual-markdown"].available, true);
    assert.equal(byId["paginated-text"].available, true);
    assert.equal(byId.mineru.available, false);
    assert.match(byId.mineru.availabilityReason, /Python/);
    assert.equal(byId.docling.available, false);
    assert.match(byId.docling.availabilityReason, /Python/);
    assert.ok(byId.mineru.capabilities.blockTypes.length > 0);
  });
});
