// 权威来源摄入管线测试(migration 008 + paginated-text parser + kb-authoritative-ingest)。
// 覆盖:
//   1. migration 008:空库 000→008 全量 + 幂等;六张新表/关联表/索引/触发器/UNIQUE/FK/CHECK;
//   2. paginated-text parser:分页形态页锚(page_index/page_label=页标记 N)、无页形态行号锚、
//      契约校验、确定性(两次解析 content_hash 序列一致)、front-matter 缺字段报错;
//   3. ingestAuthoritativeManifest:30 条 acquired 全落库(28 新 + 2 legacy 判重补登)、
//      blocked 条目 skipped、权限登记逐条对齐 manifest、kb_chapter_sources 按 layer 归属、
//      corpusVersionHash 摄入前后变化、六条 pending 题 evidence gaps、审计事件;
//   4. 幂等重跑:无重复版本/块/权限行/gap;权限登记被改即 KB_SOURCE_CONFLICT;
//   5. hash 篡改 FAIL(pharma-cn 抽取稿语义 + theory raw 语义两条路径);
//   6. 权限闸门:llmInputAllowed=true 即 KB_PERMISSION_GATE;
//   7. 无 legacy 预摄入的净库:30 条全部新建(legacy 条目同样可独立摄入)。
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { runMigrations } from "./migrations.mjs";
import { getParser } from "./document-parsers/index.mjs";
import { ParserError } from "./document-parsers/parser-contract.mjs";
import { ingestAuthoritativeManifest } from "./product-core/kb-authoritative-ingest.mjs";
import { registerSourcesFromManifest } from "./product-core/knowledge-source-service.mjs";
import { corpusVersionHash } from "./product-core/knowledge-unit-service.mjs";

const SERVER_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(SERVER_DIR, "..");
const MIGRATIONS_DIR = join(SERVER_DIR, "migrations");
const NEW_MANIFEST_PATH = join(PROJECT_ROOT, "docs/knowledge-base/organization-design-authoritative-sources-manifest.json");
const OLD_MANIFEST_PATH = join(PROJECT_ROOT, "docs/knowledge-base/organization-design-source-manifest.json");
const M008 = "008_authoritative_sources.sql";
const COURSE_ID = "course_mgmt_principles";
const CHAPTER_ID = "ch_organization_design";
const GAP_QUESTION_IDS = ["od-eval-15", "od-eval-20", "od-eval-24", "od-eval-25", "od-eval-29", "od-eval-30"];
const ACTOR = { actorType: "system", actorId: "test-system" };
const ICH_Q10_FILE = join(PROJECT_ROOT, "knowledge-sources/organization-design/pharma-intl/ich-q10-pharmaceutical-quality-system.md");
const PFIZER_10K_FILE = join(PROJECT_ROOT, "knowledge-sources/organization-design/company/doc_pfizer_10k_fy2025.md");

const NEW_MANIFEST = JSON.parse(readFileSync(NEW_MANIFEST_PATH, "utf8"));

function openDb(t) {
  const dir = mkdtempSync(join(tmpdir(), "pharmaco-kb008-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const db = new DatabaseSync(join(dir, "test.sqlite"));
  db.exec("PRAGMA foreign_keys = ON;");
  return db;
}

function migratedDb(t) {
  const db = openDb(t);
  runMigrations(db);
  return db;
}

// 复刻旧管线遗产:两条 OpenStax 已经旧 manifest 摄入(ka_ 前缀资产)。
async function preIngestLegacy(db) {
  const result = await registerSourcesFromManifest(db, OLD_MANIFEST_PATH, ACTOR);
  assert.equal(result.ingested.length, 2);
  return result;
}

function manifestEntry(sourceId) {
  return NEW_MANIFEST.sources.find((s) => (s.sourceId ?? s.docId) === sourceId);
}

// 写一份篡改过的 manifest 到临时目录,返回其路径(文件仍相对 PROJECT_ROOT 解析)。
function writeTamperedManifest(t, mutate) {
  const dir = mkdtempSync(join(tmpdir(), "pharmaco-kb008-manifest-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const clone = JSON.parse(JSON.stringify(NEW_MANIFEST));
  mutate(clone);
  const path = join(dir, "manifest.json");
  writeFileSync(path, JSON.stringify(clone, null, 2));
  return path;
}

// ---------------------------------------------------------------------------
// 1. migration 008 DB 层
// ---------------------------------------------------------------------------

test("migration 008:空库 000→008 全量应用且幂等,foreign_key_check 干净", (t) => {
  const db = migratedDb(t);
  const applied = db.prepare("SELECT name FROM schema_migrations ORDER BY name").all().map((r) => r.name);
  // 数量随后续 migration(009+)增长,不断言死数字;008 必须已应用且全部已应用项与目录一一对应。
  const expectedFiles = readdirSync(MIGRATIONS_DIR).filter((name) => /^\d{3}_[a-z0-9_]+\.sql$/.test(name)).sort();
  assert.deepEqual(applied, expectedFiles);
  assert.ok(applied.includes(M008));
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  // 幂等:再跑一遍不多应用、不报错。
  runMigrations(db);
  assert.equal(db.prepare("SELECT COUNT(*) AS c FROM schema_migrations").get().c, expectedFiles.length);
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'kb_%' ORDER BY name")
    .all()
    .map((r) => r.name);
  assert.deepEqual(tables, [
    "kb_chapter_sources",
    "kb_company_fact_fragments",
    "kb_company_fact_units",
    "kb_evidence_gaps",
    "kb_knowledge_units",
    "kb_pharma_context_fragments",
    "kb_pharma_context_units",
    "kb_retrieval_runs",
    "kb_source_permissions",
    "kb_teaching_use_objects",
    "kb_unit_fragments",
    "kb_unit_relations",
  ]);
});

test("migration 008:kb_source_permissions 约束(FK/authority_level/permission_status/默认待定)", (t) => {
  const db = migratedDb(t);
  // FK:source_id 必须指向既有 knowledge_assets。
  assert.throws(
    () =>
      db.prepare("INSERT INTO kb_source_permissions(source_id, authority_level) VALUES (?, ?)").run("ghost", 1),
    /FOREIGN KEY/,
  );
  db.prepare("INSERT INTO knowledge_assets(id, type, title, created_at) VALUES (?, 'textbook', ?, ?)").run("src_x", "X", "2026-08-04T00:00:00.000Z");
  db.prepare("INSERT INTO kb_source_permissions(source_id, authority_level) VALUES (?, ?)").run("src_x", 1);
  const row = db.prepare("SELECT * FROM kb_source_permissions WHERE source_id = 'src_x'").get();
  assert.equal(row.permission_status, "pending_teacher_confirmation");
  assert.equal(row.deterministic_parsing_allowed, 0);
  assert.equal(row.llm_input_allowed, 0);
  // authority_level 只允许 1/2。
  assert.throws(
    () => db.prepare("INSERT INTO kb_source_permissions(source_id, authority_level) VALUES ('src_y', 3)").run(),
    /CHECK/,
  );
  // permission_status 四态之外被拒。
  assert.throws(
    () =>
      db.prepare("UPDATE kb_source_permissions SET permission_status = 'approved' WHERE source_id = 'src_x'").run(),
    /CHECK/,
  );
});

test("migration 008:kb_chapter_sources 复合主键与 layer CHECK", (t) => {
  const db = migratedDb(t);
  db.prepare("INSERT INTO knowledge_assets(id, type, title, created_at) VALUES ('src_x', 'policy', 'X', '2026-08-04T00:00:00.000Z')").run();
  db.prepare("INSERT INTO kb_chapter_sources(course_id, chapter_id, asset_id, layer) VALUES (?, ?, ?, ?)").run(COURSE_ID, CHAPTER_ID, "src_x", "pharma_context");
  // 复合主键去重。
  assert.throws(
    () => db.prepare("INSERT INTO kb_chapter_sources(course_id, chapter_id, asset_id, layer) VALUES (?, ?, ?, ?)").run(COURSE_ID, CHAPTER_ID, "src_x", "pharma_context"),
    /UNIQUE|PRIMARY KEY/,
  );
  // layer 枚举之外被拒。
  assert.throws(
    () => db.prepare("INSERT INTO kb_chapter_sources(course_id, chapter_id, asset_id, layer) VALUES (?, ?, 'src_x', 'market')").run("c2", CHAPTER_ID),
    /CHECK/,
  );
});

test("migration 008:pharma_context/company_fact 单元 statement 不可改、fragments FK、review 四态", (t) => {
  const db = migratedDb(t);
  db.prepare("INSERT INTO knowledge_assets(id, type, title, created_at) VALUES ('src_x', 'policy', 'X', '2026-08-04T00:00:00.000Z')").run();
  db.prepare("INSERT INTO asset_versions(id, asset_id, version, created_at) VALUES ('v1', 'src_x', '1', '2026-08-04T00:00:00.000Z')").run();
  db.prepare("INSERT INTO content_blocks(id, asset_version_id, block_type, order_index, content_raw, content_hash) VALUES ('blk1', 'v1', 'paragraph', 0, 'text', 'sha256:x')").run();

  db.prepare(
    "INSERT INTO kb_pharma_context_units(id, course_id, chapter_id, industry_stage, aspect, statement, created_by, created_at) VALUES ('pcx_1', ?, ?, 'production', 'quality_unit_independence', 's1', 'tester', '2026-08-04T00:00:00.000Z')",
  ).run(COURSE_ID, CHAPTER_ID);
  // statement 不可改触发器。
  assert.throws(
    () => db.prepare("UPDATE kb_pharma_context_units SET statement = 's2' WHERE id = 'pcx_1'").run(),
    /immutable/,
  );
  // review_status 可流转且限四态。
  db.prepare("UPDATE kb_pharma_context_units SET review_status = 'teacher_verified' WHERE id = 'pcx_1'").run();
  assert.throws(() => db.prepare("UPDATE kb_pharma_context_units SET review_status = 'ok' WHERE id = 'pcx_1'").run(), /CHECK/);
  // industry_stage CHECK。
  assert.throws(
    () =>
      db.prepare("INSERT INTO kb_pharma_context_units(id, course_id, chapter_id, industry_stage, aspect, statement, created_by, created_at) VALUES ('pcx_2', 'c', 'ch', 'sales', 'a', 's', 't', 'now')").run(),
    /CHECK/,
  );
  // fragments:正常挂片段 + FK 拒绝幽灵引用 + 复合主键去重。
  db.prepare("INSERT INTO kb_pharma_context_fragments(unit_id, fragment_id) VALUES ('pcx_1', 'blk1')").run();
  assert.throws(() => db.prepare("INSERT INTO kb_pharma_context_fragments(unit_id, fragment_id) VALUES ('pcx_1', 'blk1')").run(), /UNIQUE|PRIMARY KEY/);
  assert.throws(() => db.prepare("INSERT INTO kb_pharma_context_fragments(unit_id, fragment_id) VALUES ('pcx_1', 'ghost')").run(), /FOREIGN KEY/);

  db.prepare(
    "INSERT INTO kb_company_fact_units(id, course_id, chapter_id, company, report_period, fact_type, statement, created_by, created_at) VALUES ('cfx_1', ?, ?, 'Pfizer', 'FY2025', 'org_hierarchy', 'f1', 'tester', '2026-08-04T00:00:00.000Z')",
  ).run(COURSE_ID, CHAPTER_ID);
  assert.throws(() => db.prepare("UPDATE kb_company_fact_units SET statement = 'f2' WHERE id = 'cfx_1'").run(), /immutable/);
  // fact_type 十二值枚举之外被拒;case_candidate 只允许 0/1,默认 0。
  assert.throws(
    () =>
      db.prepare("INSERT INTO kb_company_fact_units(id, course_id, chapter_id, company, report_period, fact_type, statement, created_by, created_at) VALUES ('cfx_2', 'c', 'ch', 'P', 'FY', 'marketing', 's', 't', 'now')").run(),
    /CHECK/,
  );
  assert.throws(() => db.prepare("UPDATE kb_company_fact_units SET case_candidate = 2 WHERE id = 'cfx_1'").run(), /CHECK/);
  assert.equal(db.prepare("SELECT case_candidate FROM kb_company_fact_units WHERE id = 'cfx_1'").get().case_candidate, 0);
  db.prepare("INSERT INTO kb_company_fact_fragments(unit_id, fragment_id) VALUES ('cfx_1', 'blk1')").run();
  assert.throws(() => db.prepare("INSERT INTO kb_company_fact_fragments(unit_id, fragment_id) VALUES ('cfx_1', 'ghost')").run(), /FOREIGN KEY/);
});

test("migration 008:kb_unit_relations 三元组 UNIQUE、relation_type/layer CHECK、evidence FK", (t) => {
  const db = migratedDb(t);
  db.prepare("INSERT INTO knowledge_assets(id, type, title, created_at) VALUES ('src_x', 'policy', 'X', '2026-08-04T00:00:00.000Z')").run();
  db.prepare("INSERT INTO asset_versions(id, asset_id, version, created_at) VALUES ('v1', 'src_x', '1', '2026-08-04T00:00:00.000Z')").run();
  db.prepare("INSERT INTO content_blocks(id, asset_version_id, block_type, order_index, content_raw, content_hash) VALUES ('blk1', 'v1', 'paragraph', 0, 'text', 'sha256:x')").run();
  db.prepare(
    "INSERT INTO kb_unit_relations(id, from_layer, from_unit_id, relation_type, to_layer, to_unit_id, evidence_fragment_id, created_by, created_at) VALUES ('rel_1', 'theory', 'ku_1', 'applied_in', 'pharma_context', 'pcx_1', 'blk1', 'tester', '2026-08-04T00:00:00.000Z')",
  ).run();
  assert.equal(db.prepare("SELECT review_status FROM kb_unit_relations WHERE id = 'rel_1'").get().review_status, "needs_review");
  // 三元组 UNIQUE。
  assert.throws(
    () =>
      db.prepare("INSERT INTO kb_unit_relations(id, from_layer, from_unit_id, relation_type, to_layer, to_unit_id, created_by, created_at) VALUES ('rel_2', 'theory', 'ku_1', 'applied_in', 'pharma_context', 'pcx_1', 't', 'now')").run(),
    /UNIQUE/,
  );
  // relation_type 八值枚举之外被拒。
  assert.throws(
    () =>
      db.prepare("INSERT INTO kb_unit_relations(id, from_layer, from_unit_id, relation_type, to_layer, to_unit_id, created_by, created_at) VALUES ('rel_3', 'theory', 'ku_1', 'causes', 'company_fact', 'cfx_1', 't', 'now')").run(),
    /CHECK/,
  );
  // layer 三值枚举之外被拒。
  assert.throws(
    () =>
      db.prepare("INSERT INTO kb_unit_relations(id, from_layer, from_unit_id, relation_type, to_layer, to_unit_id, created_by, created_at) VALUES ('rel_4', 'market', 'ku_1', 'part_of', 'company_fact', 'cfx_1', 't', 'now')").run(),
    /CHECK/,
  );
  // evidence 片段 FK。
  assert.throws(
    () =>
      db.prepare("INSERT INTO kb_unit_relations(id, from_layer, from_unit_id, relation_type, to_layer, to_unit_id, evidence_fragment_id, created_by, created_at) VALUES ('rel_5', 'theory', 'ku_1', 'part_of', 'company_fact', 'cfx_1', 'ghost', 't', 'now')").run(),
    /FOREIGN KEY/,
  );
});

test("migration 008:kb_evidence_gaps status 三态与默认 open", (t) => {
  const db = migratedDb(t);
  db.prepare("INSERT INTO kb_evidence_gaps(id, topic, created_at) VALUES ('gap_1', 't', '2026-08-04T00:00:00.000Z')").run();
  assert.equal(db.prepare("SELECT status FROM kb_evidence_gaps WHERE id = 'gap_1'").get().status, "open");
  db.prepare("UPDATE kb_evidence_gaps SET status = 'resolved', resolved_at = '2026-08-04T01:00:00.000Z' WHERE id = 'gap_1'").run();
  assert.throws(() => db.prepare("UPDATE kb_evidence_gaps SET status = 'closed' WHERE id = 'gap_1'").run(), /CHECK/);
});

// ---------------------------------------------------------------------------
// 2. paginated-text parser
// ---------------------------------------------------------------------------

test("paginated-text:分页形态按 <!-- page N --> 切块,页锚 pageIndex/pageLabel=N", async () => {
  const parser = getParser("paginated-text");
  const doc = await parser.parse({ fileRef: ICH_Q10_FILE });
  assert.equal(doc.parser, "paginated-text");
  assert.equal(doc.pages.length, 21);
  const paged = doc.blocks.filter((b) => b.pageIndex !== null);
  assert.equal(paged.length, 21);
  // 页锚:page_index/page_label 取页标记 N(1 起)。
  assert.equal(paged[0].pageIndex, 1);
  assert.equal(paged[0].pageLabel, "1");
  assert.equal(paged.at(-1).pageIndex, 21);
  // 页标记前的前言文本单成一块并记 warning。
  assert.equal(doc.blocks[0].pageIndex, null);
  assert.ok(doc.warnings.some((w) => w.code === "PAGE_MARKER_PREAMBLE"));
  assert.ok(doc.warnings.some((w) => w.code === "REVIEW_PENDING"));
  // 全 paragraph、无 parent、content_hash 形如 sha256:<hex>。
  for (const block of doc.blocks) {
    assert.equal(block.blockType, "paragraph");
    assert.equal(block.parentBlockId, null);
    assert.match(block.contentHash, /^sha256:[0-9a-f]{64}$/);
  }
  // readingOrder 严格递增(契约已保证,这里显式锚定语义)。
  for (let i = 1; i < doc.blocks.length; i += 1) {
    assert.ok(doc.blocks[i].readingOrder > doc.blocks[i - 1].readingOrder);
  }
});

test("paginated-text:无页形态(10-K)按空行分段,page_index=null,行号锚入 anchor", async () => {
  const parser = getParser("paginated-text");
  const doc = await parser.parse({ fileRef: PFIZER_10K_FILE });
  assert.equal(doc.pages.length, 0);
  assert.ok(doc.warnings.some((w) => w.code === "NO_PAGE_MARKERS"));
  assert.ok(doc.blocks.length > 100);
  for (const block of doc.blocks) {
    assert.equal(block.pageIndex, null);
    assert.equal(block.pageLabel, null);
    assert.match(block.anchor, /^L\d+-L\d+$/);
  }
  // 锚点行号相对整个文件且单调前进。
  const first = doc.blocks[0].anchor.match(/^L(\d+)-L(\d+)$/).slice(1).map(Number);
  assert.ok(first[0] > 15, "首块应起于 front-matter 之后");
  for (let i = 1; i < doc.blocks.length; i += 1) {
    const prev = Number(doc.blocks[i - 1].anchor.match(/-L(\d+)$/)[1]);
    const curr = Number(doc.blocks[i].anchor.match(/^L(\d+)/)[1]);
    assert.ok(curr > prev, `锚点行号必须单调前进(block ${i})`);
  }
});

test("paginated-text:确定性(同文件两次解析 content_hash 序列一致)且过契约校验", async () => {
  const parser = getParser("paginated-text");
  const a = await parser.parse({ fileRef: ICH_Q10_FILE });
  const b = await parser.parse({ fileRef: ICH_Q10_FILE });
  assert.deepEqual(a.blocks.map((x) => x.contentHash), b.blocks.map((x) => x.contentHash));
  const c = await parser.parse({ fileRef: PFIZER_10K_FILE });
  const d = await parser.parse({ fileRef: PFIZER_10K_FILE });
  assert.deepEqual(c.blocks.map((x) => x.contentHash), d.blocks.map((x) => x.contentHash));
});

test("paginated-text:front-matter 缺必填字段即 FRONTMATTER_INVALID,不静默猜", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "pharmaco-ptext-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const bad = join(dir, "bad.md");
  writeFileSync(bad, "---\ntitle: no docId\nsourceType: regulation\n---\n\n正文段落。\n");
  const parser = getParser("paginated-text");
  await assert.rejects(parser.parse({ fileRef: bad }), (error) => {
    assert.ok(error instanceof ParserError);
    assert.equal(error.code, "FRONTMATTER_INVALID");
    return true;
  });
});

// ---------------------------------------------------------------------------
// 3. 摄入:30 条 acquired 全落库 + legacy 判重补登
// ---------------------------------------------------------------------------

test("ingestAuthoritativeManifest:30 条落库(28 新+2 legacy 补登),权限/归属/语料版本/缺口/审计齐备", async (t) => {
  const db = migratedDb(t);
  await preIngestLegacy(db);
  const before = corpusVersionHash(db, { courseId: COURSE_ID, chapterId: CHAPTER_ID });
  // 旧管线已为 legacy 两条各记一次 source.registered/source.parsed,统计新摄入的增量。
  const auditBaseline = Object.fromEntries(
    db.prepare("SELECT event_type, COUNT(*) AS c FROM audit_events WHERE event_type IN ('source.registered', 'source.parsed') GROUP BY event_type").all().map((a) => [a.event_type, a.c]),
  );

  const result = await ingestAuthoritativeManifest(db, NEW_MANIFEST_PATH, ACTOR);

  assert.equal(result.ingested.length, 30);
  assert.equal(result.ingested.filter((e) => !e.alreadyIngested).length, 28);
  assert.deepEqual(
    result.ingested.filter((e) => e.alreadyIngested).map((e) => e.sourceId).sort(),
    ["src_openstax_pom_ch04_s4_3", "src_openstax_pom_ch10"],
  );
  // blocked 条目如实 skipped,不建幽灵资产。
  assert.equal(result.skipped.length, 1);
  assert.equal(result.skipped[0].sourceId, "ocw-15-320-s11-lec01");
  assert.equal(db.prepare("SELECT COUNT(*) AS c FROM knowledge_assets WHERE id = 'ocw-15-320-s11-lec01'").get().c, 0);

  // 资产/版本/块计数:28 新(sourceId 即资产 id)+ 2 legacy(ka_ 前缀)。
  assert.equal(db.prepare("SELECT COUNT(*) AS c FROM knowledge_assets").get().c, 30);
  assert.equal(db.prepare("SELECT COUNT(*) AS c FROM asset_versions").get().c, 30);
  const blockTotal = db.prepare("SELECT COUNT(*) AS c FROM content_blocks").get().c;
  assert.equal(blockTotal, result.totalBlocks);
  assert.ok(result.totalBlocks > 7000, `总块数应符合实测规模(实际 ${result.totalBlocks})`);
  for (const layer of ["theory", "pharma_context", "company_fact"]) {
    assert.ok(result.layerBlockCounts[layer] > 0, `${layer} 层应有块`);
  }
  assert.equal(
    Object.values(result.layerBlockCounts).reduce((a, b) => a + b, 0),
    result.totalBlocks,
  );
  // 新摄入条目的 parser 登记为 paginated-text;legacy 两条保持旧管线 manual-markdown。
  assert.equal(
    db.prepare("SELECT COUNT(*) AS c FROM asset_versions WHERE parser_name = 'paginated-text'").get().c,
    28,
  );

  // 权限登记逐条对齐 manifest(30 行;blocked 条目无资产不登记)。
  assert.equal(db.prepare("SELECT COUNT(*) AS c FROM kb_source_permissions").get().c, 30);
  const permRows = db.prepare("SELECT * FROM kb_source_permissions").all();
  const assetIdBySourceId = new Map(result.ingested.map((e) => [e.sourceId, e.assetId]));
  for (const source of NEW_MANIFEST.sources) {
    const sourceId = source.sourceId ?? source.docId;
    if (sourceId === "ocw-15-320-s11-lec01") continue;
    const row = permRows.find((r) => r.source_id === assetIdBySourceId.get(sourceId));
    assert.ok(row, `kb_source_permissions 缺少 ${sourceId}`);
    assert.equal(row.authority_level, source.authorityLevel, sourceId);
    assert.equal(row.deterministic_parsing_allowed, source.deterministicParsingAllowed ? 1 : 0, sourceId);
    assert.equal(row.lexical_indexing_allowed, source.lexicalIndexingAllowed ? 1 : 0, sourceId);
    assert.equal(row.llm_input_allowed, source.llmInputAllowed ? 1 : 0, sourceId);
    assert.equal(row.embedding_allowed, source.embeddingAllowed ? 1 : 0, sourceId);
    assert.equal(row.public_redistribution_allowed, source.publicRedistributionAllowed ? 1 : 0, sourceId);
    assert.equal(row.permission_status, source.permissionStatus, sourceId);
    assert.equal(row.canonical_url, source.canonicalUrl ?? source.source_url ?? null, sourceId);
    assert.equal(row.permission_basis, source.permissionBasis ?? null, sourceId);
  }

  // 章归属:30 行,layer 与 manifest 一致。
  const chapterRows = db.prepare("SELECT * FROM kb_chapter_sources WHERE course_id = ? AND chapter_id = ?").all(COURSE_ID, CHAPTER_ID);
  assert.equal(chapterRows.length, 30);
  for (const source of NEW_MANIFEST.sources) {
    const sourceId = source.sourceId ?? source.docId;
    if (sourceId === "ocw-15-320-s11-lec01") continue;
    const row = chapterRows.find((r) => r.asset_id === assetIdBySourceId.get(sourceId));
    assert.ok(row, `kb_chapter_sources 缺少 ${sourceId}`);
    assert.equal(row.layer, source.layer, sourceId);
  }

  // 语料版本:摄入前后不同,且与返回值一致。
  const after = corpusVersionHash(db, { courseId: COURSE_ID, chapterId: CHAPTER_ID });
  assert.notEqual(after, before);
  assert.equal(result.corpusVersionBefore, before);
  assert.equal(result.corpusVersionAfter, after);

  // 六条 pending 题 evidence gaps。
  assert.equal(result.gapsCreated, 6);
  const gaps = db.prepare("SELECT * FROM kb_evidence_gaps ORDER BY question_id").all();
  assert.deepEqual(gaps.map((g) => g.question_id), GAP_QUESTION_IDS);
  for (const gap of gaps) {
    assert.equal(gap.status, "open");
    assert.ok(gap.topic.length > 0);
    assert.ok(gap.needed_source_type.length > 0);
  }

  // 审计:本次摄入 source.registered 每条一次(30),source.parsed 仅新解析条目(28)。
  const audits = db.prepare("SELECT event_type, COUNT(*) AS c FROM audit_events WHERE event_type IN ('source.registered', 'source.parsed') GROUP BY event_type").all();
  const auditCount = Object.fromEntries(audits.map((a) => [a.event_type, a.c]));
  assert.equal(auditCount["source.registered"] - (auditBaseline["source.registered"] ?? 0), 30);
  assert.equal(auditCount["source.parsed"] - (auditBaseline["source.parsed"] ?? 0), 28);

  // 块元数据携带课程范围与层级(corpusVersionHash 与三层检索依赖)。
  const meta = db
    .prepare(
      `SELECT cb.parser_metadata_json AS m FROM content_blocks cb
       JOIN asset_versions av ON av.id = cb.asset_version_id WHERE av.asset_id = 'ich-q10-pharmaceutical-quality-system' LIMIT 1`,
    )
    .get();
  const parsed = JSON.parse(meta.m);
  assert.equal(parsed.courseId, COURSE_ID);
  assert.equal(parsed.chapterId, CHAPTER_ID);
  assert.equal(parsed.layer, "pharma_context");
  assert.equal(parsed.permissionStatus, "pending_teacher_confirmation");

  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
});

test("ingestAuthoritativeManifest:幂等重跑无重复,权限行被改即 KB_SOURCE_CONFLICT", async (t) => {
  const db = migratedDb(t);
  await preIngestLegacy(db);
  await ingestAuthoritativeManifest(db, NEW_MANIFEST_PATH, ACTOR);
  const countsBefore = {
    assets: db.prepare("SELECT COUNT(*) AS c FROM knowledge_assets").get().c,
    versions: db.prepare("SELECT COUNT(*) AS c FROM asset_versions").get().c,
    blocks: db.prepare("SELECT COUNT(*) AS c FROM content_blocks").get().c,
    perms: db.prepare("SELECT COUNT(*) AS c FROM kb_source_permissions").get().c,
    chapterSources: db.prepare("SELECT COUNT(*) AS c FROM kb_chapter_sources").get().c,
    gaps: db.prepare("SELECT COUNT(*) AS c FROM kb_evidence_gaps").get().c,
  };

  const rerun = await ingestAuthoritativeManifest(db, NEW_MANIFEST_PATH, ACTOR);
  assert.equal(rerun.ingested.length, 30);
  assert.equal(rerun.ingested.filter((e) => !e.alreadyIngested).length, 0);
  assert.equal(rerun.gapsCreated, 0);
  assert.equal(rerun.corpusVersionBefore, rerun.corpusVersionAfter);
  for (const [key, value] of Object.entries(countsBefore)) {
    const table = { assets: "knowledge_assets", versions: "asset_versions", blocks: "content_blocks", perms: "kb_source_permissions", chapterSources: "kb_chapter_sources", gaps: "kb_evidence_gaps" }[key];
    assert.equal(db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get().c, value, `${table} 不应因重跑变化`);
  }

  // 权限行被库内改动后与 manifest 不一致 → 重跑 FAIL,不静默覆盖。
  db.prepare("UPDATE kb_source_permissions SET permission_status = 'confirmed' WHERE source_id = 'ich-q10-pharmaceutical-quality-system'").run();
  await assert.rejects(ingestAuthoritativeManifest(db, NEW_MANIFEST_PATH, ACTOR), (error) => {
    assert.equal(error.code, "KB_SOURCE_CONFLICT");
    return true;
  });
});

test("ingestAuthoritativeManifest:净库(无 legacy 预摄入)30 条全部新建,legacy 条目走 paginated-text", async (t) => {
  const db = migratedDb(t);
  const result = await ingestAuthoritativeManifest(db, NEW_MANIFEST_PATH, ACTOR);
  assert.equal(result.ingested.length, 30);
  assert.equal(result.ingested.filter((e) => !e.alreadyIngested).length, 30);
  assert.equal(db.prepare("SELECT COUNT(*) AS c FROM knowledge_assets").get().c, 30);
  assert.equal(db.prepare("SELECT COUNT(*) AS c FROM kb_source_permissions").get().c, 30);
  assert.equal(db.prepare("SELECT COUNT(*) AS c FROM kb_chapter_sources").get().c, 30);
  // legacy 条目资产 id 即 sourceId(净库无 ka_ 遗产)。
  assert.ok(db.prepare("SELECT id FROM knowledge_assets WHERE id = 'src_openstax_pom_ch10'").get());
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
});

// ---------------------------------------------------------------------------
// 4. 失败路径:hash 篡改与权限闸门
// ---------------------------------------------------------------------------

test("ingestAuthoritativeManifest:hash 篡改 FAIL(pharma-cn 抽取稿语义与 theory raw 语义)", async (t) => {
  // pharma-cn:manifest sha256 即抽取稿 hash,改登记值即失配。
  const db1 = migratedDb(t);
  const tamperedCn = writeTamperedManifest(t, (clone) => {
    const entry = clone.sources.find((s) => s.sourceId === "cn-drug-admin-law-2019");
    entry.sha256 = "0".repeat(64);
  });
  await assert.rejects(ingestAuthoritativeManifest(db1, tamperedCn, ACTOR), (error) => {
    assert.equal(error.code, "KB_SOURCE_HASH_MISMATCH");
    assert.match(error.message, /cn-drug-admin-law-2019/);
    return true;
  });

  // theory:manifest sha256 指向 raw 原件,改登记值即失配。
  const db2 = migratedDb(t);
  const tamperedTheory = writeTamperedManifest(t, (clone) => {
    const entry = clone.sources.find((s) => s.sourceId === "ocw-15-320-s11-lec03");
    entry.sha256 = "0".repeat(64);
  });
  await assert.rejects(ingestAuthoritativeManifest(db2, tamperedTheory, ACTOR), (error) => {
    assert.equal(error.code, "KB_SOURCE_HASH_MISMATCH");
    assert.match(error.message, /ocw-15-320-s11-lec03/);
    return true;
  });
});

test("ingestAuthoritativeManifest:llmInputAllowed=true 即 KB_PERMISSION_GATE FAIL", async (t) => {
  const db = migratedDb(t);
  const tampered = writeTamperedManifest(t, (clone) => {
    const entry = clone.sources.find((s) => s.sourceId === "ich-q10-pharmaceutical-quality-system");
    entry.llmInputAllowed = true;
  });
  await assert.rejects(ingestAuthoritativeManifest(db, tampered, ACTOR), (error) => {
    assert.equal(error.code, "KB_PERMISSION_GATE");
    assert.match(error.message, /ich-q10/);
    return true;
  });
  // 闸门先于一切文件操作:被 FAIL 的条目不得落库。
  assert.equal(db.prepare("SELECT COUNT(*) AS c FROM knowledge_assets WHERE id = 'ich-q10-pharmaceutical-quality-system'").get().c, 0);
});
