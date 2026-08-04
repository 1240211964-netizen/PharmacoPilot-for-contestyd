// 三层知识单元构建器测试(kb-unit-builder,migration 008 表)。
// 覆盖:
//   1. 服务层校验:三类单元创建的片段强制/幽灵片段拒绝/statement 不可改触发器/幂等判重;
//   2. 关系:八枚举校验、跨层单元存在性校验、evidence 片段强制、三元组幂等;
//   3. gaps:resolved 必须带 resolution_note、幂等不重流、open 补注;
//   4. 全语料实测:theory 规则单元(§3.7 + OCW lec05)、pharma_context ≥20、company_fact ≥15、
//      relations ≥12、statement 全部为来源片段 verbatim 子串、审计事件带全维度;
//   5. 幂等重跑:全表零增量。
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import test, { after as afterAll } from "node:test";
import { runMigrations } from "./migrations.mjs";
import { ingestAuthoritativeManifest } from "./product-core/kb-authoritative-ingest.mjs";
import { registerSourcesFromManifest } from "./product-core/knowledge-source-service.mjs";
import { extractKeyTermsDeterministic } from "./product-core/knowledge-unit-service.mjs";
import {
  buildLayeredKnowledgeBase,
  createCompanyFactUnit,
  createPharmaContextUnit,
  createUnitRelation,
  setEvidenceGapStatus,
} from "./product-core/kb-unit-builder.mjs";

const SERVER_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(SERVER_DIR, "..");
const NEW_MANIFEST_PATH = join(PROJECT_ROOT, "docs/knowledge-base/organization-design-authoritative-sources-manifest.json");
const OLD_MANIFEST_PATH = join(PROJECT_ROOT, "docs/knowledge-base/organization-design-source-manifest.json");
const COURSE_ID = "course_mgmt_principles";
const CHAPTER_ID = "ch_organization_design";
const ACTOR = { actorType: "system", actorId: "test-kb-builder" };

function openDb(t) {
  const dir = mkdtempSync(join(tmpdir(), "pharmaco-kb-builder-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const db = new DatabaseSync(join(dir, "test.sqlite"));
  db.exec("PRAGMA foreign_keys = ON;");
  runMigrations(db);
  return db;
}

// 桩数据:一个资产/版本/两个块,供服务层校验测试。
function seedStub(db) {
  db.prepare("INSERT INTO knowledge_assets(id, type, title, created_at) VALUES ('src_x', 'policy', 'X', '2026-08-04T00:00:00.000Z')").run();
  db.prepare("INSERT INTO asset_versions(id, asset_id, version, created_at) VALUES ('v1', 'src_x', '1', '2026-08-04T00:00:00.000Z')").run();
  db.prepare("INSERT INTO content_blocks(id, asset_version_id, block_type, order_index, content_raw, content_hash) VALUES ('blk1', 'v1', 'paragraph', 0, '原文片段一', 'sha256:x1')").run();
  db.prepare("INSERT INTO content_blocks(id, asset_version_id, block_type, order_index, content_raw, content_hash) VALUES ('blk2', 'v1', 'paragraph', 1, '原文片段二', 'sha256:x2')").run();
}

// ---------------------------------------------------------------------------
// 1. 单元创建:片段强制 / 不可改 / 幂等
// ---------------------------------------------------------------------------

test("createPharmaContextUnit:片段强制、statement 不可改、幂等判重、stage CHECK", (t) => {
  const db = openDb(t);
  seedStub(db);

  assert.throws(
    () => createPharmaContextUnit(db, { courseId: COURSE_ID, chapterId: CHAPTER_ID, industryStage: "production", aspect: "a", statement: "s", fragmentIds: [] }, ACTOR),
    (error) => error.code === "KB_UNIT_INPUT_INVALID",
  );
  assert.throws(
    () => createPharmaContextUnit(db, { courseId: COURSE_ID, chapterId: CHAPTER_ID, industryStage: "production", aspect: "a", statement: "s", fragmentIds: ["ghost"] }, ACTOR),
    (error) => error.code === "KB_FRAGMENT_NOT_FOUND",
  );
  const first = createPharmaContextUnit(
    db,
    { courseId: COURSE_ID, chapterId: CHAPTER_ID, industryStage: "use", aspect: "dtc_committee", statement: "二级以上医院应当设立药事管理与药物治疗学委员会", regulatorContext: "卫生部 卫医政发〔2011〕11号 第七条", fragmentIds: ["blk1"] },
    ACTOR,
  );
  assert.equal(first.alreadyExists, false);
  const row = db.prepare("SELECT * FROM kb_pharma_context_units WHERE id = ?").get(first.unitId);
  assert.equal(row.review_status, "needs_review");
  assert.equal(row.regulator_context, "卫生部 卫医政发〔2011〕11号 第七条");
  assert.equal(db.prepare("SELECT COUNT(*) AS c FROM kb_pharma_context_fragments WHERE unit_id = ?").get(first.unitId).c, 1);
  // statement 不可改触发器(008)。
  assert.throws(() => db.prepare("UPDATE kb_pharma_context_units SET statement = 'x' WHERE id = ?").run(first.unitId), /immutable/);
  // 幂等:同 statement 重建 → alreadyExists,零增量。
  const second = createPharmaContextUnit(
    db,
    { courseId: COURSE_ID, chapterId: CHAPTER_ID, industryStage: "use", aspect: "dtc_committee", statement: "二级以上医院应当设立药事管理与药物治疗学委员会", fragmentIds: ["blk2"] },
    ACTOR,
  );
  assert.equal(second.alreadyExists, true);
  assert.equal(second.unitId, first.unitId);
  assert.equal(db.prepare("SELECT COUNT(*) AS c FROM kb_pharma_context_units").get().c, 1);
  // industry_stage 枚举之外被 DB CHECK 拒绝。
  assert.throws(
    () => createPharmaContextUnit(db, { courseId: COURSE_ID, chapterId: CHAPTER_ID, industryStage: "sales", aspect: "a", statement: "s2", fragmentIds: ["blk1"] }, ACTOR),
    /CHECK/,
  );
  // 审计:kb.unit.created 带全维度。
  const audit = db.prepare("SELECT payload_json FROM audit_events WHERE event_type = 'kb.unit.created' AND entity_id = ?").get(first.unitId);
  const payload = JSON.parse(audit.payload_json);
  assert.equal(payload.layer, "pharma_context");
  assert.equal(payload.courseId, COURSE_ID);
  assert.equal(payload.chapterId, CHAPTER_ID);
  assert.equal(payload.aspect, "dtc_committee");
  assert.equal(payload.fragmentCount, 1);
});

test("createCompanyFactUnit:片段强制、fact_type 枚举、case_candidate 恒 0、幂等", (t) => {
  const db = openDb(t);
  seedStub(db);

  assert.throws(
    () => createCompanyFactUnit(db, { courseId: COURSE_ID, chapterId: CHAPTER_ID, company: "P", reportPeriod: "FY2025", factType: "business_segment", statement: "s", fragmentIds: ["ghost"] }, ACTOR),
    (error) => error.code === "KB_FRAGMENT_NOT_FOUND",
  );
  const first = createCompanyFactUnit(
    db,
    { courseId: COURSE_ID, chapterId: CHAPTER_ID, company: "Pfizer", reportPeriod: "FY2025", factType: "business_segment", statement: "We manage our commercial operations through a global structure", fragmentIds: ["blk1"] },
    ACTOR,
  );
  const row = db.prepare("SELECT * FROM kb_company_fact_units WHERE id = ?").get(first.unitId);
  assert.equal(row.review_status, "needs_review");
  assert.equal(row.case_candidate, 0);
  assert.throws(() => db.prepare("UPDATE kb_company_fact_units SET statement = 'x' WHERE id = ?").run(first.unitId), /immutable/);
  // fact_type 十二值枚举之外被拒(DB CHECK)。
  assert.throws(
    () => createCompanyFactUnit(db, { courseId: COURSE_ID, chapterId: CHAPTER_ID, company: "Pfizer", reportPeriod: "FY2025", factType: "marketing", statement: "s2", fragmentIds: ["blk1"] }, ACTOR),
    /CHECK/,
  );
  const second = createCompanyFactUnit(
    db,
    { courseId: COURSE_ID, chapterId: CHAPTER_ID, company: "Pfizer", reportPeriod: "FY2025", factType: "business_segment", statement: "We manage our commercial operations through a global structure", fragmentIds: ["blk1"] },
    ACTOR,
  );
  assert.equal(second.alreadyExists, true);
  assert.equal(db.prepare("SELECT COUNT(*) AS c FROM kb_company_fact_units").get().c, 1);
  const audit = db.prepare("SELECT payload_json FROM audit_events WHERE event_type = 'kb.unit.created' AND entity_id = ?").get(first.unitId);
  const payload = JSON.parse(audit.payload_json);
  assert.equal(payload.layer, "company_fact");
  assert.equal(payload.company, "Pfizer");
  assert.equal(payload.factType, "business_segment");
});

// ---------------------------------------------------------------------------
// 2. 关系:枚举 / 存在性 / evidence / 幂等
// ---------------------------------------------------------------------------

test("createUnitRelation:八枚举校验、跨层单元存在性、evidence 片段强制、三元组幂等", (t) => {
  const db = openDb(t);
  seedStub(db);
  const pcx = createPharmaContextUnit(db, { courseId: COURSE_ID, chapterId: CHAPTER_ID, industryStage: "use", aspect: "dtc_committee", statement: "条款甲", fragmentIds: ["blk1"] }, ACTOR);
  const cfx = createCompanyFactUnit(db, { courseId: COURSE_ID, chapterId: CHAPTER_ID, company: "C", reportPeriod: "FY2025", factType: "org_change", statement: "事实乙", fragmentIds: ["blk2"] }, ACTOR);

  // relation_type 八枚举之外。
  assert.throws(
    () => createUnitRelation(db, { fromLayer: "pharma_context", fromUnitId: pcx.unitId, relationType: "causes", toLayer: "company_fact", toUnitId: cfx.unitId }, ACTOR),
    (error) => error.code === "KB_RELATION_INPUT_INVALID",
  );
  // layer 三值之外。
  assert.throws(
    () => createUnitRelation(db, { fromLayer: "market", fromUnitId: pcx.unitId, relationType: "applied_in", toLayer: "company_fact", toUnitId: cfx.unitId }, ACTOR),
    (error) => error.code === "KB_RELATION_INPUT_INVALID",
  );
  // from/to 单元必须存在(跨层服务层校验)。
  assert.throws(
    () => createUnitRelation(db, { fromLayer: "pharma_context", fromUnitId: "pcx_ghost", relationType: "applied_in", toLayer: "company_fact", toUnitId: cfx.unitId }, ACTOR),
    (error) => error.code === "KB_UNIT_NOT_FOUND",
  );
  assert.throws(
    () => createUnitRelation(db, { fromLayer: "pharma_context", fromUnitId: pcx.unitId, relationType: "applied_in", toLayer: "theory", toUnitId: "ku_ghost" }, ACTOR),
    (error) => error.code === "KB_UNIT_NOT_FOUND",
  );
  // evidence 片段必须存在。
  assert.throws(
    () => createUnitRelation(db, { fromLayer: "pharma_context", fromUnitId: pcx.unitId, relationType: "applied_in", toLayer: "company_fact", toUnitId: cfx.unitId, evidenceFragmentId: "ghost" }, ACTOR),
    (error) => error.code === "KB_FRAGMENT_NOT_FOUND",
  );
  // 正常创建 + 审计。
  const rel = createUnitRelation(
    db,
    { fromLayer: "pharma_context", fromUnitId: pcx.unitId, relationType: "constrained_by", toLayer: "company_fact", toUnitId: cfx.unitId, evidenceFragmentId: "blk2" },
    ACTOR,
  );
  const row = db.prepare("SELECT * FROM kb_unit_relations WHERE id = ?").get(rel.relationId);
  assert.equal(row.review_status, "needs_review");
  assert.equal(row.created_by, "rule");
  assert.equal(row.evidence_fragment_id, "blk2");
  const audit = db.prepare("SELECT payload_json FROM audit_events WHERE event_type = 'kb.relation.created' AND entity_id = ?").get(rel.relationId);
  const payload = JSON.parse(audit.payload_json);
  assert.equal(payload.relationType, "constrained_by");
  assert.equal(payload.fromLayer, "pharma_context");
  assert.equal(payload.toLayer, "company_fact");
  // 三元组幂等。
  const again = createUnitRelation(
    db,
    { fromLayer: "pharma_context", fromUnitId: pcx.unitId, relationType: "constrained_by", toLayer: "company_fact", toUnitId: cfx.unitId },
    ACTOR,
  );
  assert.equal(again.alreadyExists, true);
  assert.equal(db.prepare("SELECT COUNT(*) AS c FROM kb_unit_relations").get().c, 1);
  // DB 层:八枚举 CHECK 直接兜底(原始 SQL)。
  assert.throws(
    () => db.prepare("INSERT INTO kb_unit_relations(id, from_layer, from_unit_id, relation_type, to_layer, to_unit_id, created_by, created_at) VALUES ('rel_x', 'pharma_context', ?, 'causes', 'company_fact', ?, 't', 'now')").run(pcx.unitId, cfx.unitId),
    /CHECK/,
  );
});

// ---------------------------------------------------------------------------
// 3. gaps 状态流转
// ---------------------------------------------------------------------------

test("setEvidenceGapStatus:resolved 必须带 note、幂等不重流、open 补注", (t) => {
  const db = openDb(t);
  db.prepare("INSERT INTO kb_evidence_gaps(id, question_id, topic, needed_source_type, status, created_at) VALUES ('gap_1', 'od-eval-20', 't', 'regulation', 'open', '2026-08-04T00:00:00.000Z')").run();

  assert.throws(
    () => setEvidenceGapStatus(db, "od-eval-20", { status: "resolved" }, ACTOR),
    (error) => error.code === "KB_GAP_INPUT_INVALID",
  );
  assert.throws(
    () => setEvidenceGapStatus(db, "ghost", { status: "resolved", resolutionNote: "n" }, ACTOR),
    (error) => error.code === "KB_GAP_NOT_FOUND",
  );
  assert.throws(
    () => setEvidenceGapStatus(db, "od-eval-20", { status: "closed", resolutionNote: "n" }, ACTOR),
    (error) => error.code === "KB_GAP_INPUT_INVALID",
  );

  const resolved = setEvidenceGapStatus(db, "od-eval-20", { status: "resolved", resolutionNote: "法规已解析为 N 条单元" }, ACTOR);
  assert.equal(resolved.changed, true);
  const row = db.prepare("SELECT * FROM kb_evidence_gaps WHERE id = 'gap_1'").get();
  assert.equal(row.status, "resolved");
  assert.equal(row.resolution_note, "法规已解析为 N 条单元");
  assert.ok(row.resolved_at);
  const audit = db.prepare("SELECT * FROM audit_events WHERE event_type = 'kb.gap.resolved' AND entity_id = 'gap_1'").get();
  assert.ok(audit);
  assert.equal(audit.previous_state, "open");
  assert.equal(audit.next_state, "resolved");
  // 幂等:同状态同备注不再写库、不再审计。
  const auditCount = db.prepare("SELECT COUNT(*) AS c FROM audit_events WHERE event_type = 'kb.gap.resolved'").get().c;
  const again = setEvidenceGapStatus(db, "od-eval-20", { status: "resolved", resolutionNote: "法规已解析为 N 条单元" }, ACTOR);
  assert.equal(again.changed, false);
  assert.equal(db.prepare("SELECT COUNT(*) AS c FROM audit_events WHERE event_type = 'kb.gap.resolved'").get().c, auditCount);

  // open 补注(od-eval-15/30 路径)。
  db.prepare("INSERT INTO kb_evidence_gaps(id, question_id, topic, status, created_at) VALUES ('gap_2', 'od-eval-15', 't2', 'open', '2026-08-04T00:00:00.000Z')").run();
  const annotated = setEvidenceGapStatus(db, "od-eval-15", { status: "open", resolutionNote: "待教师提供主教材/PPT" }, ACTOR);
  assert.equal(annotated.changed, true);
  const row2 = db.prepare("SELECT * FROM kb_evidence_gaps WHERE id = 'gap_2'").get();
  assert.equal(row2.status, "open");
  assert.equal(row2.resolution_note, "待教师提供主教材/PPT");
  assert.equal(row2.resolved_at, null);
  assert.ok(db.prepare("SELECT * FROM audit_events WHERE event_type = 'kb.gap.updated' AND entity_id = 'gap_2'").get());
});

// ---------------------------------------------------------------------------
// 4. 全语料实测构建
// ---------------------------------------------------------------------------

let corpusPromise = null;
let corpusDir = null;
// 文件级清理必须在模块顶层注册(在测试体内注册会挂到该测试上,提前删库)。
afterAll(() => {
  if (corpusDir) rmSync(corpusDir, { recursive: true, force: true });
});
function corpusDb(t) {
  if (!corpusPromise) {
    corpusPromise = (async () => {
      const dir = mkdtempSync(join(tmpdir(), "pharmaco-kb-builder-corpus-"));
      corpusDir = dir;
      const db = new DatabaseSync(join(dir, "corpus.sqlite"));
      db.exec("PRAGMA foreign_keys = ON;");
      runMigrations(db);
      // 复刻现状:legacy 两份 OpenStax(ch10/§4.3)经旧管线摄入,55 个 machine_extracted 单元在位。
      await registerSourcesFromManifest(db, OLD_MANIFEST_PATH, ACTOR);
      await ingestAuthoritativeManifest(db, NEW_MANIFEST_PATH, ACTOR);
      const keyTerms = extractKeyTermsDeterministic(db, { courseId: COURSE_ID, chapterId: CHAPTER_ID, actorContext: ACTOR });
      assert.equal(keyTerms.created.length, 55);
      const build = buildLayeredKnowledgeBase(db, { courseId: COURSE_ID, chapterId: CHAPTER_ID, actorContext: ACTOR });
      return { db, dir, build };
    })();
  }
  return corpusPromise;
}

test("三层构建实测:单元/关系/缺口数量与质量断言", async (t) => {
  const { db, build } = await corpusDb(t);

  // --- theory:§3.7 Key Terms 0 产出(无小节,warning 如实)+ 规则单元 12 个 ---
  assert.equal(build.theory.keyTerms.created.length, 0);
  assert.ok(build.theory.keyTerms.warnings.some((w) => w.code === "KEY_TERMS_SECTION_NOT_FOUND"));
  assert.equal(build.theory.warnings.filter((w) => w.code.startsWith("THEORY_RULE")).length, 0, JSON.stringify(build.theory.warnings));
  assert.equal(build.theory.created.length, 12);
  const concepts = build.theory.created.map((c) => c.concept);
  for (const expected of ["open system", "contingency school", "Woodward's contingency research", "evidence-based management", "front-back organization", "lateral coordination processes", "Galbraith organizational pattern elements (What/How/Who/Why)", "strategy-structure fit (OCW 15.320 lec05)"]) {
    assert.ok(concepts.includes(expected), `theory 缺少 ${expected}`);
  }
  // theory 单元挂片段且 definition 为片段 verbatim 子串。
  for (const created of build.theory.created) {
    const unit = db.prepare("SELECT * FROM kb_knowledge_units WHERE id = ?").get(created.unitId);
    assert.equal(unit.extraction_method, "deterministic_rule");
    const fragment = db.prepare("SELECT content_raw FROM kb_unit_fragments uf JOIN content_blocks cb ON cb.id = uf.fragment_id WHERE uf.unit_id = ?").get(created.unitId);
    assert.ok(fragment, `${created.concept} 缺片段`);
    assert.ok(fragment.content_raw.includes(unit.definition), `${created.concept} definition 非 verbatim 子串`);
  }

  // --- pharma_context:≥20 条、全部 needs_review、fragment 强制、statement verbatim ---
  const pharmaUnits = db.prepare("SELECT * FROM kb_pharma_context_units WHERE course_id = ? AND chapter_id = ?").all(COURSE_ID, CHAPTER_ID);
  assert.ok(pharmaUnits.length >= 20, `pharma_context 实测 ${pharmaUnits.length} 条(<20)`);
  assert.equal(build.pharmaContext.created.length, pharmaUnits.length);
  const aspects = new Set(pharmaUnits.map((u) => u.aspect));
  for (const expected of ["mah_responsibility", "qualified_person", "dtc_committee", "prescription_review", "vbp_coordination", "pharmacovigilance", "management_responsibility", "outsourced_operations", "key_personnel"]) {
    assert.ok(aspects.has(expected), `pharma_context 缺 aspect ${expected}(实测 ${[...aspects].join(",")})`);
  }
  for (const unit of pharmaUnits) {
    assert.equal(unit.review_status, "needs_review");
    const fragments = db.prepare("SELECT cb.content_raw FROM kb_pharma_context_fragments pf JOIN content_blocks cb ON cb.id = pf.fragment_id WHERE pf.unit_id = ?").all(unit.id);
    assert.ok(fragments.length >= 1, `${unit.id} 无来源片段`);
    assert.ok(fragments.some((f) => f.content_raw.includes(unit.statement)), `${unit.id} statement 非 verbatim 子串`);
  }
  // 抽查:药事委员会第七条单元的 regulator_context(发文机关+文号+条款号)。
  const dtc = pharmaUnits.find((u) => u.statement.includes("二级以上医院应当设立药事管理与药物治疗学委员会"));
  assert.ok(dtc, "缺药事委员会第七条单元");
  assert.ok(dtc.regulator_context.includes("卫医政发〔2011〕11号"));
  assert.ok(dtc.regulator_context.includes("第七条"));
  // 抽查:MAH 委托生产(药品管理法第32条)与质量受权人(实施条例第23条)。
  assert.ok(pharmaUnits.some((u) => u.aspect === "mah_responsibility" && u.statement.includes("可以自行生产药品，也可以委托药品生产企业生产") && u.regulator_context.includes("第三十二条")));
  assert.ok(pharmaUnits.some((u) => u.aspect === "qualified_person" && u.statement.includes("质量受权人应当独立履行药品上市放行职责") && u.regulator_context.includes("第二十三条")));

  // --- company_fact:≥15 条、missed 为空、statement verbatim、case_candidate=0 ---
  assert.deepEqual(build.companyFact.missed, [], `存在未命中事实: ${JSON.stringify(build.companyFact.missed)}`);
  const companyUnits = db.prepare("SELECT * FROM kb_company_fact_units WHERE course_id = ? AND chapter_id = ?").all(COURSE_ID, CHAPTER_ID);
  assert.equal(companyUnits.length, 25);
  assert.ok(companyUnits.length >= 15);
  for (const unit of companyUnits) {
    assert.equal(unit.review_status, "needs_review");
    assert.equal(unit.case_candidate, 0);
    const fragments = db.prepare("SELECT cb.content_raw FROM kb_company_fact_fragments cf JOIN content_blocks cb ON cb.id = cf.fragment_id WHERE cf.unit_id = ?").all(unit.id);
    assert.ok(fragments.length >= 1, `${unit.id} 无来源片段`);
    assert.ok(fragments.some((f) => f.content_raw.includes(unit.statement)), `${unit.company}/${unit.fact_type} statement 非 verbatim 子串`);
  }
  const companies = new Set(companyUnits.map((u) => u.company));
  assert.deepEqual([...companies].sort(), ["CVS Health", "Pfizer", "Roche", "上海医药", "恒瑞医药", "益丰药房", "药明康德", "AstraZeneca"].sort());
  // 抽查关键事实原文。
  assert.ok(companyUnits.some((u) => u.company === "Pfizer" && u.statement.includes("Biopharma is the only reportable segment.")));
  assert.ok(companyUnits.some((u) => u.company === "益丰药房" && u.statement.includes("14,831 家（含加盟店4,313 家）")));
  assert.ok(companyUnits.some((u) => u.company === "药明康德" && u.statement.includes("25,983") && u.statement.includes("76.8")));

  // --- relations:≥12 条、evidence 强制、notBuilt 如实 ---
  const relations = db.prepare("SELECT * FROM kb_unit_relations").all();
  assert.ok(relations.length >= 12, `relations 实测 ${relations.length} 条(<12)`);
  assert.equal(build.relations.created.length, relations.length);
  for (const relation of relations) {
    assert.equal(relation.review_status, "needs_review");
    assert.equal(relation.created_by, "rule");
    assert.ok(relation.evidence_fragment_id, `${relation.id} 缺 evidence 片段`);
    assert.ok(db.prepare("SELECT id FROM content_blocks WHERE id = ?").get(relation.evidence_fragment_id));
  }
  const relationTypes = new Set(relations.map((r) => r.relation_type));
  for (const expected of ["applied_in", "constrained_by", "contrasts_with", "part_of", "supported_by"]) {
    assert.ok(relationTypes.has(expected), `缺关系类型 ${expected}`);
  }
  // 理论层无对应单元的关系不建,原因如实记录。
  assert.equal(build.relations.notBuilt.length, 5);
  assert.ok(build.relations.notBuilt.some((r) => r.note.includes("专业权力")));
  assert.ok(build.relations.notBuilt.some((r) => r.note.includes("委员会制")));

  // --- gaps:20/24/25/29 resolved,15/30 保持 open 并注明 ---
  const gapByQuestion = Object.fromEntries(db.prepare("SELECT * FROM kb_evidence_gaps").all().map((g) => [g.question_id, g]));
  for (const q of ["od-eval-20", "od-eval-24", "od-eval-25", "od-eval-29"]) {
    assert.equal(gapByQuestion[q].status, "resolved", q);
    assert.ok(gapByQuestion[q].resolution_note.length > 0, q);
    assert.ok(gapByQuestion[q].resolved_at, q);
  }
  for (const q of ["od-eval-15", "od-eval-30"]) {
    assert.equal(gapByQuestion[q].status, "open", q);
    assert.ok(gapByQuestion[q].resolution_note.includes("待教师提供主教材/PPT"), q);
  }
  assert.ok(gapByQuestion["od-eval-20"].resolution_note.includes("pharma_context"));
  assert.ok(gapByQuestion["od-eval-24"].resolution_note.includes("company_fact"));

  // --- 审计:三类事件存在且带维度 ---
  const auditCounts = Object.fromEntries(
    db.prepare("SELECT event_type, COUNT(*) AS c FROM audit_events WHERE event_type IN ('kb.unit.created', 'kb.relation.created', 'kb.gap.resolved') GROUP BY event_type").all().map((a) => [a.event_type, a.c]),
  );
  assert.ok(auditCounts["kb.unit.created"] >= 55 + 12 + pharmaUnits.length + companyUnits.length);
  assert.equal(auditCounts["kb.relation.created"], relations.length);
  assert.equal(auditCounts["kb.gap.resolved"], 4);

  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);

  console.log("实测数量:", JSON.stringify({
    theoryNew: build.theory.created.length,
    pharmaContext: pharmaUnits.length,
    companyFact: companyUnits.length,
    relations: relations.length,
    gapsResolved: 4,
    notBuiltRelations: build.relations.notBuilt.length,
    missed: build.companyFact.missed.length,
  }));
});

// ---------------------------------------------------------------------------
// 5. 幂等重跑:全表零增量
// ---------------------------------------------------------------------------

test("buildLayeredKnowledgeBase 幂等重跑:单元/片段/关系/缺口/审计零增量", async (t) => {
  const { db } = await corpusDb(t);
  const countOf = (table) => db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get().c;
  // kb.keyterms.extracted 是扫描留痕(每次跑 §3.7 Key Terms 扫描都记一条,与单元增量无关),
  // 审计零增量断言将其排除。
  const countAudits = () => db.prepare("SELECT COUNT(*) AS c FROM audit_events WHERE event_type != 'kb.keyterms.extracted'").get().c;
  const before = {
    ku: countOf("kb_knowledge_units"),
    kuFragments: countOf("kb_unit_fragments"),
    pcx: countOf("kb_pharma_context_units"),
    pcxFragments: countOf("kb_pharma_context_fragments"),
    cfx: countOf("kb_company_fact_units"),
    cfxFragments: countOf("kb_company_fact_fragments"),
    relations: countOf("kb_unit_relations"),
    gaps: countOf("kb_evidence_gaps"),
    audits: countAudits(),
  };

  const rerun = buildLayeredKnowledgeBase(db, { courseId: COURSE_ID, chapterId: CHAPTER_ID, actorContext: ACTOR });
  assert.equal(rerun.theory.created.length, 0);
  assert.equal(rerun.pharmaContext.created.length, 0);
  assert.equal(rerun.companyFact.created.length, 0);
  assert.equal(rerun.relations.created.length, 0);
  assert.ok(rerun.gaps.resolved.every((g) => g.changed === false));

  assert.equal(countOf("kb_knowledge_units"), before.ku);
  assert.equal(countOf("kb_unit_fragments"), before.kuFragments);
  assert.equal(countOf("kb_pharma_context_units"), before.pcx);
  assert.equal(countOf("kb_pharma_context_fragments"), before.pcxFragments);
  assert.equal(countOf("kb_company_fact_units"), before.cfx);
  assert.equal(countOf("kb_company_fact_fragments"), before.cfxFragments);
  assert.equal(countOf("kb_unit_relations"), before.relations);
  assert.equal(countOf("kb_evidence_gaps"), before.gaps);
  assert.equal(countAudits(), before.audits);
});
