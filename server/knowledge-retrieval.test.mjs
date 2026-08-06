// 知识检索服务测试(knowledge-retrieval-service.mjs):非模型检索 + 引用完整性。
// 覆盖:
//   1. 检索基本路径:中英文 query、分词主通道与原文兜底通道、锚点/引文/hash 字段契约;
//   2. 精确过滤:chapterId / sourceType / reviewStatus / concept;
//   3. 相邻命中块合并去重(同版本相邻 order_index 合并、非相邻不合并);
//   4. rejected 单元片段默认排除、未授权来源片段排除(权限闸门 defaultDeny);
//   5. kb_retrieval_runs 追加落库(追加式触发器)+ 审计 kb.retrieval.completed;
//   6. KB_RETRIEVAL 工作流:内部创建(DRAFT→EVIDENCE_RETRIEVED)/传入复用/缺 scope 报错;
//   7. insufficientEvidence 路径:零命中词元拒答 + 固定话术 + missingTerms 缺口;
//   8. corpusVersionHash 变化可识别:加块后同一 query 的 run 记录 hash 不同;
//   9. verifyCitations 正/反例:逐字与归一化通过、伪引用 FAIL、superseded 唯一支撑 FAIL、
//      rejected 独占唯一支撑 FAIL;
//  10. 真实语料集成:OpenStax manifest 摄入后中文题面命中预期来源、拒答题 insufficientEvidence;
//  11. 检索证据落库(migration 007):claim_id 放宽可空 + retrieval_run_id 关联;evidence_links
//      行数/字段对齐/整 run 幂等/审计 kb.evidence.attached/verifyCitations 一致性。
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { runMigrations } from "./migrations.mjs";
import { normalizeText } from "./document-parsers/manual-markdown-parser.mjs";
import { registerSourcesFromManifest } from "./product-core/knowledge-source-service.mjs";
import { createKnowledgeUnit, extractKeyTermsDeterministic, setUnitReviewStatus } from "./product-core/knowledge-unit-service.mjs";
import {
  BM25_SCORE_THRESHOLD,
  INSUFFICIENT_EVIDENCE_MESSAGE,
  persistRetrievalEvidence,
  searchKnowledge,
  verifyCitations,
} from "./product-core/knowledge-retrieval-service.mjs";
import {
  insertAssetVersion,
  insertContentBlock,
  insertKnowledgeAsset,
} from "./product-core/repository.mjs";

const SERVER_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(SERVER_DIR, "..");
const MANIFEST_PATH = join(PROJECT_ROOT, "docs/knowledge-base/organization-design-source-manifest.json");
const NOW = "2026-08-04T00:00:00.000Z";
const SYSTEM = { actorType: "system", actorId: "test-system" };
const SCOPE = { courseId: "crs_a", classId: "cls_a", lessonId: "les_a" };
const COURSE_ID = "course_x";
const CHAPTER_ID = "ch_x";

function openDb(t) {
  const dir = mkdtempSync(join(tmpdir(), "pharmaco-kr-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const db = new DatabaseSync(join(dir, "test.sqlite"));
  db.exec("PRAGMA foreign_keys = ON;");
  runMigrations(db);
  return db;
}

function seedScope(db) {
  db.prepare("INSERT INTO courses(id, name, code, status, created_at, updated_at) VALUES (?, ?, ?, 'ACTIVE', ?, ?)")
    .run(SCOPE.courseId, "课程", "CODE-A", NOW, NOW);
  db.prepare("INSERT INTO class_cohorts(id, course_id, name, academic_term, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(SCOPE.classId, SCOPE.courseId, "班级", "2026 春", NOW);
  db.prepare("INSERT INTO lessons(id, course_id, class_id, title, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(SCOPE.lessonId, SCOPE.courseId, SCOPE.classId, "课时", NOW);
}

// 双语小语料:asset A(textbook, doc_a/ch_x)+ asset B(case, doc_b/ch_x,另有一块 ch_other)。
// 返回各块 id 便于断言。块内容精心设计以支撑合并/过滤/排除各用例。
function seedKbFixture(db) {
  const metaA = {
    docId: "doc_a", sourceId: "src_a", courseId: COURSE_ID, chapterId: CHAPTER_ID,
    allowedOperations: ["exact_or_lexical_search"], blockedOperations: [], license: "CC-BY-NC-SA-4.0",
  };
  const metaB = { ...metaA, docId: "doc_b", sourceId: "src_b" };
  const metaOther = { ...metaA, docId: "doc_c", sourceId: "src_c", chapterId: "ch_other" };
  const metaNoAuth = { ...metaA, docId: "doc_d", sourceId: "src_d", allowedOperations: [] };

  const assetA = insertKnowledgeAsset(db, { type: "textbook", title: "管理学原理讲义", actorContext: SYSTEM });
  const versionA = insertAssetVersion(db, {
    assetId: assetA.id, version: "v1", originalFileHash: "sha256:" + "a".repeat(64),
    originalFileLocation: "fixtures/a.md", parserName: "manual-markdown", parserVersion: "1.0.0", actorContext: SYSTEM,
  });
  const blocks = {};
  const add = (key, { versionId = versionA.id, blockType = "paragraph", orderIndex, raw, meta = metaA, segmented = null }) => {
    blocks[key] = insertContentBlock(db, {
      assetVersionId: versionId, blockType, orderIndex, contentRaw: raw,
      contentSegmented: segmented, parserMetadata: meta,
    }).id;
  };
  add("h1", { blockType: "heading", orderIndex: 0, raw: "Chapter 1: 组织设计基础" });
  add("h11", { blockType: "heading", orderIndex: 1, raw: "1.1 组织结构" });
  add("structureDef", { orderIndex: 2, raw: "组织结构(organizational structure)是完成并连接组织内各项活动的系统。" });
  add("structureUse", { orderIndex: 3, raw: "组织结构帮助人们知道自己应做什么工作,以及如何相互协作。" });
  add("h12", { blockType: "heading", orderIndex: 4, raw: "1.2 集权与分权" });
  add("centralization", { orderIndex: 5, raw: "集权(centralization)把资源集中于组织的少数地点,或少数人掌握资源使用的决策权。" });
  add("span", { orderIndex: 6, raw: "管理幅度(span of control)是组织中任何一个人需要问责的工作范围。" });
  // 原文兜底通道用例:预置无关分词,分词通道查不到 delegation(非概念别名),raw 通道兜底命中。
  add("rawOnly", { orderIndex: 7, raw: "delegation 授权把决策权下放到更接近执行的位置。", segmented: "无关 词元 填充" });
  // 未授权检索的片段:权限闸门 defaultDeny,必须被排除。
  add("unauthorized", { orderIndex: 8, raw: "组织结构未授权片段,不应被检索到。", meta: metaNoAuth });

  const assetB = insertKnowledgeAsset(db, { type: "case", title: "组织案例集", actorContext: SYSTEM });
  const versionB = insertAssetVersion(db, {
    assetId: assetB.id, version: "v1", originalFileHash: "sha256:" + "b".repeat(64),
    originalFileLocation: "fixtures/b.md", parserName: "manual-markdown", parserVersion: "1.0.0", actorContext: SYSTEM,
  });
  add("h2", {
    versionId: versionB.id, blockType: "heading", orderIndex: 0, raw: "Chapter 2: Cases", meta: metaB,
  });
  add("matrix", {
    versionId: versionB.id, orderIndex: 1, raw: "A matrix structure creates dual reporting lines for employees.", meta: metaB,
  });
  add("otherChapter", {
    versionId: versionB.id, orderIndex: 2, raw: "组织结构在另一章的表述,不属于 ch_x。", meta: metaOther,
  });

  return { assetA, versionA, assetB, versionB, blocks };
}

function search(db, args) {
  return searchKnowledge(db, { actorContext: SYSTEM, workflowScope: SCOPE, ...args });
}

// ---------------------------------------------------------------------------
// 基本路径
// ---------------------------------------------------------------------------

test("中文 query 命中中文片段:分词主通道,结果带锚点/引文/hash/单元标注", (t) => {
  const db = openDb(t);
  seedScope(db);
  const fixture = seedKbFixture(db);
  const unit = createKnowledgeUnit(db, {
    courseId: COURSE_ID, chapterId: CHAPTER_ID, concept: "组织结构",
    definition: "完成并连接组织内各项活动的系统", fragmentIds: [fixture.blocks.structureDef],
  }, SYSTEM);

  const run = search(db, { query: "什么是组织结构?", filters: { courseId: COURSE_ID, chapterId: CHAPTER_ID } });
  assert.equal(run.channel, "segmented");
  assert.ok(run.resultCount >= 1);
  const top = run.results[0];
  assert.equal(top.sourceId, "src_a");
  assert.equal(top.docId, "doc_a");
  assert.equal(top.assetVersionId, fixture.versionA.id);
  assert.equal(top.sectionAnchor, "Chapter 1: 组织设计基础 > 1.1 组织结构");
  assert.ok(top.contentHash.startsWith("sha256:"));
  assert.ok(top.score <= BM25_SCORE_THRESHOLD, `top score ${top.score} 应过 bm25 门槛`);
  assert.equal(run.insufficientEvidence, false);
  // 相邻命中块(h1 标题经"组织设计"别名命中 + h11 + 定义段 + 作用段)合并为一个结果;
  // 锚点落在组内首个非标题块(structureDef),mergedFragmentIds 保留全组上下文。
  const merged = run.results.find((r) => r.mergedFragmentIds.includes(fixture.blocks.structureDef));
  assert.ok(merged, "应包含 structureDef 所在合并结果");
  assert.equal(run.results.length, 1, "相邻命中应合并为单个结果");
  assert.equal(merged.fragmentId, fixture.blocks.structureDef);
  assert.deepEqual(merged.mergedFragmentIds, [
    fixture.blocks.h1, fixture.blocks.h11, fixture.blocks.structureDef, fixture.blocks.structureUse,
  ]);
  assert.equal(merged.mergedBlockCount, 4);
  assert.equal(merged.unitId, unit.unitId);
  assert.ok(merged.verbatimQuote.startsWith("组织结构"));
});

test("英文 query 命中英文片段;web 来源 pageIndex/pageLabel 如实为 null,不虚构页码", (t) => {
  const db = openDb(t);
  seedScope(db);
  const fixture = seedKbFixture(db);
  const run = search(db, { query: "matrix dual reporting lines", filters: { courseId: COURSE_ID } });
  assert.ok(run.resultCount >= 1);
  const hit = run.results.find((r) => r.fragmentId === fixture.blocks.matrix);
  assert.ok(hit, "应命中 matrix 块");
  assert.equal(hit.sourceId, "src_b");
  assert.equal(hit.pageIndex, null);
  assert.equal(hit.pageLabel, null);
  assert.equal(hit.sectionAnchor, "Chapter 2: Cases");
});

test("原文关键词兜底通道:分词通道无过门槛结果时回退 raw 通道并标注 channel", (t) => {
  const db = openDb(t);
  seedScope(db);
  const fixture = seedKbFixture(db);
  // "delegation"只出现在 rawOnly 的原文中(非概念别名、无扩展),而 rawOnly 预置了无关
  // content_segmented,分词通道零候选 → 回退 raw 通道命中(unicode61 对 ASCII 词有效)。
  const run = search(db, { query: "delegation", filters: { courseId: COURSE_ID, chapterId: CHAPTER_ID } });
  assert.equal(run.channel, "raw");
  const hit = run.results.find((r) => r.fragmentId === fixture.blocks.rawOnly);
  assert.ok(hit, "raw 通道应命中 rawOnly 块");
  assert.equal(hit.channel, "raw");
});

// ---------------------------------------------------------------------------
// 精确过滤
// ---------------------------------------------------------------------------

test("chapterId 过滤:其他章节的同词片段被排除", (t) => {
  const db = openDb(t);
  seedScope(db);
  const fixture = seedKbFixture(db);
  const withFilter = search(db, { query: "组织结构", filters: { courseId: COURSE_ID, chapterId: CHAPTER_ID } });
  assert.ok(!withFilter.results.some((r) => r.mergedFragmentIds.includes(fixture.blocks.otherChapter)));
  const withoutChapter = search(db, { query: "组织结构", filters: { courseId: COURSE_ID } });
  assert.ok(withoutChapter.results.some((r) => r.mergedFragmentIds.includes(fixture.blocks.otherChapter)));
});

test("sourceType 过滤:只返回指定 knowledge_assets.type 的片段", (t) => {
  const db = openDb(t);
  seedScope(db);
  seedKbFixture(db);
  const run = search(db, { query: "matrix structure reporting", filters: { courseId: COURSE_ID, sourceType: "case" } });
  assert.ok(run.resultCount >= 1);
  assert.ok(run.results.every((r) => r.sourceId === "src_b"));
});

test("reviewStatus 过滤:只返回链接到该审核状态单元的片段", (t) => {
  const db = openDb(t);
  seedScope(db);
  const fixture = seedKbFixture(db);
  createKnowledgeUnit(db, {
    courseId: COURSE_ID, chapterId: CHAPTER_ID, concept: "组织结构",
    definition: "完成并连接组织内各项活动的系统", reviewStatus: "machine_extracted",
    fragmentIds: [fixture.blocks.structureDef],
  }, SYSTEM);
  const run = search(db, {
    query: "组织结构", filters: { courseId: COURSE_ID, chapterId: CHAPTER_ID, reviewStatus: "machine_extracted" },
  });
  assert.ok(run.resultCount >= 1);
  assert.ok(run.results.every((r) => r.mergedFragmentIds.includes(fixture.blocks.structureDef)));
  // 换一个不存在该状态的过滤:needs_review 下无单元链接的片段一律不返回。
  const none = search(db, {
    query: "组织结构", filters: { courseId: COURSE_ID, chapterId: CHAPTER_ID, reviewStatus: "needs_review" },
  });
  assert.equal(none.resultCount, 0);
  assert.equal(none.insufficientEvidence, true);
});

test("concept 过滤:中文概念名经别名归并命中单元;不合概念范围的片段被排除", (t) => {
  const db = openDb(t);
  seedScope(db);
  const fixture = seedKbFixture(db);
  const unit = createKnowledgeUnit(db, {
    courseId: COURSE_ID, chapterId: CHAPTER_ID, concept: "组织结构",
    definition: "完成并连接组织内各项活动的系统", reviewStatus: "machine_extracted",
    fragmentIds: [fixture.blocks.structureDef],
  }, SYSTEM);
  const run = search(db, {
    query: "组织结构 集权", filters: { courseId: COURSE_ID, chapterId: CHAPTER_ID, concept: "组织结构" },
  });
  assert.ok(run.resultCount >= 1);
  assert.ok(run.results.every((r) => r.mergedFragmentIds.includes(fixture.blocks.structureDef)));
  assert.equal(run.results[0].unitId, unit.unitId);
});

// ---------------------------------------------------------------------------
// 排除纪律:rejected 单元片段与未授权来源片段
// ---------------------------------------------------------------------------

test("rejected 单元独占链接的片段默认排除,且不作 unitId 标注", (t) => {
  const db = openDb(t);
  seedScope(db);
  const fixture = seedKbFixture(db);
  const unit = createKnowledgeUnit(db, {
    courseId: COURSE_ID, chapterId: CHAPTER_ID, concept: "管理幅度与管理层次",
    definition: "需要问责的工作范围", fragmentIds: [fixture.blocks.span],
  }, SYSTEM);
  setUnitReviewStatus(db, unit.unitId, { reviewStatus: "rejected", reviewerId: "teacher-01" }, SYSTEM);

  const run = search(db, { query: "管理幅度 span of control", filters: { courseId: COURSE_ID, chapterId: CHAPTER_ID } });
  assert.ok(!run.results.some((r) => r.mergedFragmentIds.includes(fixture.blocks.span)), "rejected 片段不得返回");
  assert.equal(run.insufficientEvidence, true);
  assert.equal(run.refusalMessage, INSUFFICIENT_EVIDENCE_MESSAGE);
});

test("未授权 exact_or_lexical_search 的来源片段被权限闸门排除(defaultDeny)", (t) => {
  const db = openDb(t);
  seedScope(db);
  const fixture = seedKbFixture(db);
  const run = search(db, { query: "组织结构", filters: { courseId: COURSE_ID } });
  assert.ok(!run.results.some((r) => r.mergedFragmentIds.includes(fixture.blocks.unauthorized)));
});

// ---------------------------------------------------------------------------
// 留痕:kb_retrieval_runs 追加式 + 审计 + 语料版本变化
// ---------------------------------------------------------------------------

test("每次检索追加 kb_retrieval_runs 并审计 kb.retrieval.completed;runs 表只增不改", (t) => {
  const db = openDb(t);
  seedScope(db);
  seedKbFixture(db);
  const run = search(db, { query: "组织结构", filters: { courseId: COURSE_ID, chapterId: CHAPTER_ID } });

  const row = db.prepare("SELECT * FROM kb_retrieval_runs WHERE id = ?").get(run.retrievalRunId);
  assert.ok(row, "kb_retrieval_runs 应有本次检索行");
  assert.equal(row.workflow_instance_id, run.workflowInstanceId);
  assert.equal(row.query_text, "组织结构");
  assert.equal(row.result_count, run.resultCount);
  assert.equal(JSON.parse(row.filters_json).chapterId, CHAPTER_ID);
  assert.ok(row.corpus_version_hash.startsWith("sha256:"));
  assert.equal(JSON.parse(row.results_json).length, run.resultCount);

  const audit = db
    .prepare("SELECT * FROM audit_events WHERE event_type = 'kb.retrieval.completed' AND entity_id = ?")
    .get(run.retrievalRunId);
  assert.ok(audit, "应有 kb.retrieval.completed 审计事件");
  assert.equal(audit.workflow_instance_id, run.workflowInstanceId);
  const payload = JSON.parse(audit.payload_json);
  assert.equal(payload.corpusVersionHash, row.corpus_version_hash);
  assert.equal(payload.resultCount, run.resultCount);

  assert.throws(
    () => db.prepare("UPDATE kb_retrieval_runs SET result_count = 0 WHERE id = ?").run(run.retrievalRunId),
    /append-only/,
  );
  assert.throws(
    () => db.prepare("DELETE FROM kb_retrieval_runs WHERE id = ?").run(run.retrievalRunId),
    /append-only/,
  );
});

test("corpusVersionHash 变化可识别:加块后同一 query 的 run 记录 hash 不同", (t) => {
  const db = openDb(t);
  seedScope(db);
  const fixture = seedKbFixture(db);
  const filters = { courseId: COURSE_ID, chapterId: CHAPTER_ID };
  const run1 = search(db, { query: "组织结构", filters });
  insertContentBlock(db, {
    assetVersionId: fixture.versionA.id, blockType: "paragraph", orderIndex: 20,
    contentRaw: "组织结构的新补充片段。", parserMetadata: {
      docId: "doc_a", sourceId: "src_a", courseId: COURSE_ID, chapterId: CHAPTER_ID,
      allowedOperations: ["exact_or_lexical_search"],
    },
  });
  const run2 = search(db, { query: "组织结构", filters });
  assert.notEqual(run2.corpusVersionHash, run1.corpusVersionHash, "语料变化后 corpus_version_hash 必须不同");
  const hashes = db
    .prepare("SELECT corpus_version_hash FROM kb_retrieval_runs ORDER BY created_at")
    .all()
    .map((r) => r.corpus_version_hash);
  assert.equal(new Set(hashes).size, 2, "两条 run 记录应各持其语料版本 hash");
});

// ---------------------------------------------------------------------------
// KB_RETRIEVAL 工作流
// ---------------------------------------------------------------------------

test("未传 workflowInstanceId 时内部创建 KB_RETRIEVAL 工作流并翻至 EVIDENCE_RETRIEVED", (t) => {
  const db = openDb(t);
  seedScope(db);
  seedKbFixture(db);
  const run = search(db, { query: "组织结构", filters: { courseId: COURSE_ID } });
  assert.equal(run.workflowCreated, true);
  const wf = db.prepare("SELECT * FROM workflow_instances WHERE id = ?").get(run.workflowInstanceId);
  assert.equal(wf.workflow_type, "KB_RETRIEVAL");
  assert.equal(wf.current_state, "EVIDENCE_RETRIEVED");
  assert.equal(wf.state_version, 2);
  const created = db
    .prepare("SELECT * FROM audit_events WHERE event_type = 'workflow.created' AND entity_id = ?")
    .get(run.workflowInstanceId);
  assert.equal(JSON.parse(created.payload_json).workflowType, "KB_RETRIEVAL");
});

test("传入 workflowInstanceId 时复用且不翻状态;缺 scope 或工作流不存在时显式报错", (t) => {
  const db = openDb(t);
  seedScope(db);
  seedKbFixture(db);
  db.prepare(
    `INSERT INTO workflow_instances(id, workflow_type, course_id, class_id, lesson_id, current_state, state_machine_version, created_by, created_at, updated_at)
     VALUES ('wf_kb_manual', 'KB_RETRIEVAL', 'crs_a', 'cls_a', 'les_a', 'DRAFT', '1.0.0', 'teacher', ?, ?)`,
  ).run(NOW, NOW);
  const run = search(db, {
    query: "组织结构", filters: { courseId: COURSE_ID }, workflowInstanceId: "wf_kb_manual",
  });
  assert.equal(run.workflowCreated, false);
  const wf = db.prepare("SELECT * FROM workflow_instances WHERE id = 'wf_kb_manual'").get();
  assert.equal(wf.current_state, "DRAFT", "传入工作流的生命周期归调用方,不得翻动");

  assert.throws(
    () => searchKnowledge(db, { query: "组织结构", actorContext: SYSTEM }),
    (error) => error.code === "KB_WORKFLOW_SCOPE_REQUIRED",
  );
  assert.throws(
    () => searchKnowledge(db, { query: "组织结构", actorContext: SYSTEM, workflowInstanceId: "wf_missing" }),
    (error) => error.code === "KB_RETRIEVAL_WORKFLOW_NOT_FOUND",
  );
});

test("输入校验:空 query / 未知过滤字段 / 非法 reviewStatus / 非法 limit 均显式报错", (t) => {
  const db = openDb(t);
  seedScope(db);
  seedKbFixture(db);
  assert.throws(
    () => search(db, { query: "  " }),
    (error) => error.code === "KB_RETRIEVAL_INPUT_INVALID",
  );
  assert.throws(
    () => search(db, { query: "组织结构", filters: { bogus: "x" } }),
    (error) => error.code === "KB_RETRIEVAL_INPUT_INVALID",
  );
  assert.throws(
    () => search(db, { query: "组织结构", filters: { reviewStatus: "bogus" } }),
    (error) => error.code === "KB_RETRIEVAL_INPUT_INVALID",
  );
  assert.throws(
    () => search(db, { query: "组织结构", limit: 0 }),
    (error) => error.code === "KB_RETRIEVAL_INPUT_INVALID",
  );
});

// ---------------------------------------------------------------------------
// insufficientEvidence 路径(零命中词元拒答)
// ---------------------------------------------------------------------------

test("零命中词元拒答:OOV 术语直接 insufficientEvidence + 固定话术 + missingTerms 缺口", (t) => {
  const db = openDb(t);
  seedScope(db);
  seedKbFixture(db);
  const run = search(db, {
    query: "请列出所有权变因素(contingency factors)", filters: { courseId: COURSE_ID, chapterId: CHAPTER_ID },
  });
  assert.equal(run.insufficientEvidence, true);
  assert.equal(run.resultCount, 0);
  assert.deepEqual(run.results, []);
  assert.equal(run.refusalMessage, INSUFFICIENT_EVIDENCE_MESSAGE);
  assert.ok(run.missingTerms.includes("contingency"), `missingTerms 应含 contingency,实际 ${run.missingTerms}`);
  // 拒答同样留痕:runs 行 result_count=0。
  const row = db.prepare("SELECT * FROM kb_retrieval_runs WHERE id = ?").get(run.retrievalRunId);
  assert.equal(row.result_count, 0);
});

// ---------------------------------------------------------------------------
// verifyCitations 引用完整性
// ---------------------------------------------------------------------------

test("verifyCitations 正例:逐字引用与 NFKC/空白归一化引用均 PASSED", (t) => {
  const db = openDb(t);
  seedScope(db);
  const fixture = seedKbFixture(db);
  const verdict = verifyCitations(db, {
    answerClaims: [
      { statement: "组织结构(organizational structure)是完成并连接组织内各项活动的系统。", citedFragmentIds: [fixture.blocks.structureDef] },
      // 半角括号 + 折叠空白:经 normalizeText(NFKC) 归一化后命中。
      { statement: "组织结构(organizational structure)是完成并连接组织内各项活动的系统。", citedFragmentIds: [fixture.blocks.structureDef] },
      { statement: "dual reporting lines", citedFragmentIds: [fixture.blocks.matrix], quotes: ["dual reporting lines"] },
    ],
  });
  assert.equal(verdict.overallStatus, "PASSED");
  assert.ok(verdict.claims.every((c) => c.status === "PASSED"));
});

test("verifyCitations 反例:不存在的片段 = 伪引用 FAILED;statement 不在原文 FAILED", (t) => {
  const db = openDb(t);
  seedScope(db);
  const fixture = seedKbFixture(db);
  const verdict = verifyCitations(db, {
    answerClaims: [
      { statement: "任意表述。", citedFragmentIds: ["blk_nonexistent"] },
      { statement: "来源中根本没有这句话。", citedFragmentIds: [fixture.blocks.structureDef] },
      { statement: "无引用断言。", citedFragmentIds: [] },
    ],
  });
  assert.equal(verdict.overallStatus, "FAILED");
  assert.equal(verdict.claims[0].status, "FAILED");
  assert.ok(
    verdict.claims[0].checks.some((c) => c.check === "fragments_exist" && c.status === "FAILED"),
    "伪引用必须落在 fragments_exist 检查",
  );
  assert.equal(verdict.claims[1].status, "FAILED");
  assert.ok(verdict.claims[1].checks.some((c) => c.check === "verbatim_quote_match" && c.status === "FAILED"));
  assert.equal(verdict.claims[2].status, "FAILED");
  assert.ok(verdict.claims[2].checks.some((c) => c.check === "citation_present" && c.status === "FAILED"));
});

test("verifyCitations 反例:superseded 来源不得作唯一支撑;混合支撑可通过", (t) => {
  const db = openDb(t);
  seedScope(db);
  const fixture = seedKbFixture(db);
  // v2 取代 v1:v1 及其全部块进入 superseded。
  insertAssetVersion(db, {
    assetId: fixture.assetA.id, version: "v2", originalFileHash: "sha256:" + "c".repeat(64),
    originalFileLocation: "fixtures/a-v2.md", parserName: "manual-markdown", parserVersion: "1.0.0", actorContext: SYSTEM,
  });
  const sole = verifyCitations(db, {
    answerClaims: [{ statement: "组织结构(organizational structure)是完成并连接组织内各项活动的系统。", citedFragmentIds: [fixture.blocks.structureDef] }],
  });
  assert.equal(sole.overallStatus, "FAILED");
  assert.ok(
    sole.claims[0].checks.some((c) => c.check === "source_status_valid" && c.status === "FAILED"),
    "superseded 唯一支撑必须 FAILED",
  );
  const mixed = verifyCitations(db, {
    answerClaims: [
      {
        statement: "组织结构(organizational structure)是完成并连接组织内各项活动的系统。",
        citedFragmentIds: [fixture.blocks.structureDef, fixture.blocks.matrix],
        quotes: ["组织结构(organizational structure)是完成并连接组织内各项活动的系统。"],
      },
    ],
  });
  assert.equal(mixed.overallStatus, "PASSED", "仍有 active 支撑时可通过");
});

test("verifyCitations 反例:rejected 单元独占片段不得作唯一支撑", (t) => {
  const db = openDb(t);
  seedScope(db);
  const fixture = seedKbFixture(db);
  const unit = createKnowledgeUnit(db, {
    courseId: COURSE_ID, chapterId: CHAPTER_ID, concept: "管理幅度与管理层次",
    definition: "需要问责的工作范围", fragmentIds: [fixture.blocks.span],
  }, SYSTEM);
  setUnitReviewStatus(db, unit.unitId, { reviewStatus: "rejected", reviewerId: "teacher-01" }, SYSTEM);

  const sole = verifyCitations(db, {
    answerClaims: [{ statement: "管理幅度(span of control)是组织中任何一个人需要问责的工作范围。", citedFragmentIds: [fixture.blocks.span] }],
  });
  assert.equal(sole.overallStatus, "FAILED");
  assert.ok(sole.claims[0].checks.some((c) => c.check === "source_status_valid" && c.status === "FAILED"));

  const mixed = verifyCitations(db, {
    answerClaims: [
      {
        statement: "管理幅度(span of control)是组织中任何一个人需要问责的工作范围。",
        citedFragmentIds: [fixture.blocks.span, fixture.blocks.centralization],
        quotes: ["管理幅度(span of control)是组织中任何一个人需要问责的工作范围。"],
      },
    ],
  });
  assert.equal(mixed.overallStatus, "PASSED");
});

test("verifyCitations 输入校验:answerClaims 非数组显式报错", (t) => {
  const db = openDb(t);
  assert.throws(
    () => verifyCitations(db, { answerClaims: "bogus" }),
    (error) => error.code === "KB_CITATION_INPUT_INVALID",
  );
});

// ---------------------------------------------------------------------------
// 真实语料集成(OpenStax manifest)
// ---------------------------------------------------------------------------

test("真实语料集成:中文题面命中预期 OpenStax 来源,引用过 verifyCitations 机检", async (t) => {
  const db = openDb(t);
  seedScope(db);
  await registerSourcesFromManifest(db, MANIFEST_PATH, SYSTEM);
  extractKeyTermsDeterministic(db, {
    courseId: "course_mgmt_principles", chapterId: "ch_organization_design", actorContext: SYSTEM,
  });
  const run = search(db, {
    query: "什么是组织结构(organizational structure)?请给出定义并注明来源。",
    filters: { courseId: "course_mgmt_principles", chapterId: "ch_organization_design" },
  });
  assert.ok(run.resultCount >= 1, "真实语料应返回证据");
  assert.equal(run.results[0].sourceId, "src_openstax_pom_ch10");
  assert.ok(run.results.every((r) => r.sectionAnchor.length > 0), "每个结果都应有标题路径锚点");
  assert.ok(run.results.every((r) => r.pageIndex === null && r.pageLabel === null), "web 来源严禁虚构页码");
  const verdict = verifyCitations(db, {
    answerClaims: run.results.map((r) => ({ statement: r.verbatimQuote, citedFragmentIds: [r.fragmentId] })),
  });
  assert.equal(verdict.overallStatus, "PASSED", "检索产出的引用必须 100% 通过逐字机检(伪引用容忍度 0)");
});

test("真实语料拒答:权变因素题(语料无 contingency)返回 insufficientEvidence 与固定话术", async (t) => {
  const db = openDb(t);
  seedScope(db);
  await registerSourcesFromManifest(db, MANIFEST_PATH, SYSTEM);
  const run = search(db, {
    query: "请完整列出组织设计需要考虑的权变因素(contingency factors)清单。",
    filters: { courseId: "course_mgmt_principles", chapterId: "ch_organization_design" },
  });
  assert.equal(run.insufficientEvidence, true);
  assert.equal(run.resultCount, 0);
  assert.equal(run.refusalMessage, INSUFFICIENT_EVIDENCE_MESSAGE);
  assert.ok(run.missingTerms.includes("contingency"));
});


// ---------------------------------------------------------------------------
// 检索证据落库(migration 007 evidence_links 重建)
// ---------------------------------------------------------------------------

function evidenceRowsOfRun(db, retrievalRunId) {
  return db
    .prepare("SELECT * FROM evidence_links WHERE retrieval_run_id = ? ORDER BY id")
    .all(retrievalRunId);
}

test("007: evidence_links 重建后 claim_id 可空、retrieval_run_id 列与约束齐备,外键完好", (t) => {
  const db = openDb(t);
  const cols = new Map(db.prepare("PRAGMA table_info(evidence_links)").all().map((c) => [c.name, c]));
  assert.ok(cols.has("retrieval_run_id"), "evidence_links 应有 retrieval_run_id 列");
  assert.equal(cols.get("claim_id").notnull, 0, "claim_id 应已放宽为可空");
  assert.equal(cols.get("retrieval_run_id").notnull, 0);
  // 原列逐字保留(19 列)+ 007 retrieval run + 010 外挂课程语料三列。
  assert.equal(cols.size, 23);
  for (const expected of [
    "id", "claim_id", "decision_id", "evidence_type", "source_id", "source_version_id",
    "content_block_id", "runtime_observation_id", "page_index", "page_label", "bbox_json",
    "bbox_coordinate_system", "verbatim_quote", "normalized_quote", "source_status",
    "external_corpus_id", "external_chunk_id", "external_locator_json",
    "effective_date", "superseded_by", "content_hash", "retrieved_at", "retrieval_run_id",
  ]) {
    assert.ok(cols.has(expected), `evidence_links 缺少列 ${expected}`);
  }
  const indexes = new Set(
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all().map((r) => r.name),
  );
  assert.ok(indexes.has("evidence_links_claim"), "004 索引应已重建");
  assert.ok(indexes.has("evidence_links_retrieval_run"));
  assert.ok(indexes.has("evidence_links_retrieval_run_block"));
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), [], "外键完整性必须干净");
});

test("007: retrieval_run_id FK 与 UNIQUE(retrieval_run_id, content_block_id) 幂等兜底生效", (t) => {
  const db = openDb(t);
  seedScope(db);
  const fixture = seedKbFixture(db);
  const run = search(db, { query: "组织结构", filters: { courseId: COURSE_ID, chapterId: CHAPTER_ID } });
  const insertRow = db.prepare(
    `INSERT INTO evidence_links(
       id, claim_id, decision_id, evidence_type, source_id, source_version_id, content_block_id,
       runtime_observation_id, page_index, page_label, bbox_json, bbox_coordinate_system,
       verbatim_quote, normalized_quote, source_status, effective_date, superseded_by, content_hash,
       retrieved_at, retrieval_run_id
     ) VALUES (?, NULL, NULL, 'knowledge_block', ?, ?, ?, NULL, NULL, NULL, NULL, 'none', 'q', 'q', 'active', NULL, NULL, 'sha256:x', ?, ?)`,
  );
  // 不存在的 run:FK 拒绝。
  assert.throws(
    () => insertRow.run("ev_fk1", fixture.assetA.id, fixture.versionA.id, fixture.blocks.centralization, NOW, "krr_bogus"),
    /FOREIGN KEY constraint failed/,
  );
  // 同一 run + 同一片段写两行:UNIQUE 拒绝(幂等的 DB 层兜底)。
  insertRow.run("ev_uq1", fixture.assetA.id, fixture.versionA.id, fixture.blocks.centralization, NOW, run.retrievalRunId);
  assert.throws(
    () => insertRow.run("ev_uq2", fixture.assetA.id, fixture.versionA.id, fixture.blocks.centralization, NOW, run.retrievalRunId),
    /UNIQUE constraint failed/,
  );
});

test("searchKnowledge 自动落 evidence_links:行数=结果数,字段逐一对齐来源片段", (t) => {
  const db = openDb(t);
  seedScope(db);
  const fixture = seedKbFixture(db);
  const run = search(db, { query: "什么是组织结构?", filters: { courseId: COURSE_ID, chapterId: CHAPTER_ID } });
  assert.ok(run.resultCount >= 1);
  assert.equal(run.evidenceIds.length, run.resultCount);

  const rows = evidenceRowsOfRun(db, run.retrievalRunId);
  assert.equal(rows.length, run.resultCount, "每条检索结果一行证据");
  const runRow = db.prepare("SELECT * FROM kb_retrieval_runs WHERE id = ?").get(run.retrievalRunId);
  const target = run.results.find((r) => r.fragmentId === fixture.blocks.structureDef);
  const row = rows.find((r) => r.content_block_id === fixture.blocks.structureDef);
  assert.ok(row, "structureDef 应有证据行");
  assert.equal(row.claim_id, null, "检索阶段 claim 不存在,claim_id 必须为 NULL");
  assert.equal(row.decision_id, null);
  assert.equal(row.evidence_type, "knowledge_block");
  assert.equal(row.source_id, fixture.assetA.id, "source_id 对齐 knowledge_assets.id(同 S1 约定)");
  assert.equal(row.source_version_id, fixture.versionA.id);
  assert.equal(row.runtime_observation_id, null);
  assert.equal(row.page_index, null);
  assert.equal(row.page_label, null);
  assert.equal(row.bbox_json, null);
  assert.equal(row.bbox_coordinate_system, "none");
  assert.equal(row.verbatim_quote, target.verbatimQuote);
  assert.equal(row.normalized_quote, normalizeText(target.verbatimQuote));
  assert.equal(row.source_status, "active");
  assert.equal(row.content_hash, target.contentHash);
  assert.equal(row.retrieved_at, runRow.created_at, "retrieved_at 取检索 run 的创建时刻");
  // 合并组只落一行(锚点块),mergedFragmentIds 的其余块不重复建行。
  assert.equal(
    rows.filter((r) => target.mergedFragmentIds.includes(r.content_block_id)).length,
    1,
    "合并组 4 块只能有 1 行证据",
  );
});

test("persistRetrievalEvidence 幂等:同一 run 重复持久化不产生重复行", (t) => {
  const db = openDb(t);
  seedScope(db);
  seedKbFixture(db);
  const run = search(db, { query: "组织结构", filters: { courseId: COURSE_ID, chapterId: CHAPTER_ID } });
  const before = evidenceRowsOfRun(db, run.retrievalRunId).length;
  assert.ok(before >= 1);
  // 自动落库已发生,独立再调用必须整 run 幂等。
  const again = persistRetrievalEvidence(db, { retrievalRunId: run.retrievalRunId, actorContext: SYSTEM });
  assert.equal(again.alreadyPersisted, true);
  assert.equal(again.linked, 0);
  assert.equal(again.evidenceIds.length, before);
  assert.equal(evidenceRowsOfRun(db, run.retrievalRunId).length, before, "重复持久化不得新增行");
  // 不存在的 run:显式报错。
  assert.throws(
    () => persistRetrievalEvidence(db, { retrievalRunId: "krr_bogus", actorContext: SYSTEM }),
    (error) => error.code === "KB_RETRIEVAL_RUN_NOT_FOUND",
  );
});

test("kb.evidence.attached 审计:带 workflow_instance_id、corpus_version_hash 与证据数", (t) => {
  const db = openDb(t);
  seedScope(db);
  seedKbFixture(db);
  const run = search(db, { query: "组织结构", filters: { courseId: COURSE_ID, chapterId: CHAPTER_ID } });
  const audit = db
    .prepare("SELECT * FROM audit_events WHERE event_type = 'kb.evidence.attached' AND entity_id = ?")
    .get(run.retrievalRunId);
  assert.ok(audit, "应有 kb.evidence.attached 审计事件");
  assert.equal(audit.workflow_instance_id, run.workflowInstanceId);
  const payload = JSON.parse(audit.payload_json);
  assert.equal(payload.evidenceCount, run.resultCount);
  assert.equal(payload.corpusVersionHash, run.corpusVersionHash);
  assert.equal(payload.courseId, COURSE_ID);
  assert.equal(payload.chapterId, CHAPTER_ID);
});

test("insufficientEvidence 的 run 不落证据行、不写 kb.evidence.attached", (t) => {
  const db = openDb(t);
  seedScope(db);
  seedKbFixture(db);
  const run = search(db, {
    query: "请列出所有权变因素(contingency factors)", filters: { courseId: COURSE_ID, chapterId: CHAPTER_ID },
  });
  assert.equal(run.insufficientEvidence, true);
  assert.equal(evidenceRowsOfRun(db, run.retrievalRunId).length, 0);
  assert.equal(
    db.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE event_type = 'kb.evidence.attached' AND entity_id = ?")
      .get(run.retrievalRunId).n,
    0,
  );
  const persisted = persistRetrievalEvidence(db, { retrievalRunId: run.retrievalRunId, actorContext: SYSTEM });
  assert.deepEqual(persisted, {
    retrievalRunId: run.retrievalRunId, linked: 0, evidenceIds: [], alreadyPersisted: false,
  });
});

test("verifyCitations 与 evidence_links 一致:证据行引文过机检;伪引用与 rejected 片段无证据行", (t) => {
  const db = openDb(t);
  seedScope(db);
  const fixture = seedKbFixture(db);
  const run = search(db, { query: "什么是组织结构?", filters: { courseId: COURSE_ID, chapterId: CHAPTER_ID } });
  // 由 evidence_links 行直接组 claim:逐字引用必须 100% 过机检。
  const rows = evidenceRowsOfRun(db, run.retrievalRunId);
  const verdict = verifyCitations(db, {
    answerClaims: rows.map((r) => ({ statement: r.verbatim_quote, citedFragmentIds: [r.content_block_id] })),
  });
  assert.equal(verdict.overallStatus, "PASSED");
  // 伪引用:不存在的片段过不了机检,也绝不会有证据行。
  const fake = verifyCitations(db, {
    answerClaims: [{ statement: "编造的引用。", citedFragmentIds: ["blk_fake"] }],
  });
  assert.equal(fake.overallStatus, "FAILED");
  assert.equal(
    db.prepare("SELECT COUNT(*) AS n FROM evidence_links WHERE content_block_id = 'blk_fake'").get().n,
    0,
  );
  // rejected 单元独占片段:检索排除 → 无证据行;以其为唯一支撑的引用 FAIL。
  const unit = createKnowledgeUnit(db, {
    courseId: COURSE_ID, chapterId: CHAPTER_ID, concept: "管理幅度与管理层次",
    definition: "需要问责的工作范围", fragmentIds: [fixture.blocks.span],
  }, SYSTEM);
  setUnitReviewStatus(db, unit.unitId, { reviewStatus: "rejected", reviewerId: "teacher-01" }, SYSTEM);
  const rejectedRun = search(db, {
    query: "管理幅度 span of control", filters: { courseId: COURSE_ID, chapterId: CHAPTER_ID },
  });
  assert.equal(rejectedRun.insufficientEvidence, true);
  assert.equal(
    db.prepare("SELECT COUNT(*) AS n FROM evidence_links WHERE content_block_id = ?").get(fixture.blocks.span).n,
    0,
    "rejected 片段不得产生证据行",
  );
});

test("真实语料证据链:24 题路径的检索结果落 evidence_links 且逐字过机检", async (t) => {
  const db = openDb(t);
  seedScope(db);
  await registerSourcesFromManifest(db, MANIFEST_PATH, SYSTEM);
  const run = search(db, {
    query: "管理幅度(span of control)在来源中是如何定义的?",
    filters: { courseId: "course_mgmt_principles", chapterId: "ch_organization_design" },
  });
  assert.ok(run.resultCount >= 1);
  const rows = evidenceRowsOfRun(db, run.retrievalRunId);
  assert.equal(rows.length, run.resultCount);
  assert.ok(rows.every((r) => r.claim_id === null && r.retrieval_run_id === run.retrievalRunId));
  assert.ok(rows.every((r) => r.evidence_type === "knowledge_block" && r.source_status === "active"));
  const verdict = verifyCitations(db, {
    answerClaims: rows.map((r) => ({ statement: r.verbatim_quote, citedFragmentIds: [r.content_block_id] })),
  });
  assert.equal(verdict.overallStatus, "PASSED", "真实语料证据行必须 100% 过逐字机检");
});
