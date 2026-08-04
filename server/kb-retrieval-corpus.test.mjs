// 权威语料检索锁定测试(knowledge-retrieval-service.mjs × 008 三层语料)。
// 与 knowledge-retrieval.test.mjs(小夹具,通道/契约单测)的分工:本文件在真实权威语料
// (legacy 2 份 OpenStax + 权威 manifest 28 条 + 三层单元)上锁定 2026-08-04 复验的关键行为:
//   1. 短词通道:组织/授权/分权/集权/权责/矩阵/质量/委托/药事/采购 10 个两字词逐词锁定
//      (中文语料逐字命中 / 语料无逐字时经概念别名桥接命中理论层,均不得 insufficient);
//   2. 术语别名表(COURSE_TERM_ALIASES):显式常量结构、aliasesOfTerm/expandQueryByTermAliases
//      单一事实源、OOV 拒答豁免(注册别名的外文缩写不判 missing);
//   3. 五维精确过滤:layer/company/authorityLevel/reviewStatus/concept 逐维锁定 + 非法值报错;
//   4. 拒答路径锁定:OOV 零命中拒答(固定话术/channel 'none'/零证据行)、纯停用词查询、
//      主教材缺失题(od-eval-30 型)诉求短语"权责对等"不得出现在任何返回片段、
//      blocked 来源(ocw-15-320-s11-lec01)零资产零块;
//   5. 解析完整性:NUL 清洗后 content_hash 与 content_raw 全库可互相机检(伪引用=0 的
//      结构性保证),益丰年报原截断块全文在库。
// 全程确定性,无模型调用;语料构建一次,全部测试共享只读(检索落 run/证据行不改语料)。
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { runMigrations } from "./migrations.mjs";
import { registerSourcesFromManifest } from "./product-core/knowledge-source-service.mjs";
import { ingestAuthoritativeManifest } from "./product-core/kb-authoritative-ingest.mjs";
import { extractKeyTermsDeterministic } from "./product-core/knowledge-unit-service.mjs";
import { buildLayeredKnowledgeBase } from "./product-core/kb-unit-builder.mjs";
import {
  aliasesOfTerm,
  COURSE_TERM_ALIASES,
  expandQueryByTermAliases,
  INSUFFICIENT_EVIDENCE_MESSAGE,
  searchKnowledge,
} from "./product-core/knowledge-retrieval-service.mjs";

const SERVER_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(SERVER_DIR, "..");
const LEGACY_MANIFEST = join(PROJECT_ROOT, "docs/knowledge-base/organization-design-source-manifest.json");
const AUTHORITATIVE_MANIFEST = join(PROJECT_ROOT, "docs/knowledge-base/organization-design-authoritative-sources-manifest.json");
const COURSE_ID = "course_mgmt_principles";
const CHAPTER_ID = "ch_organization_design";
const NOW = "2026-08-04T00:00:00.000Z";
const SYSTEM = { actorType: "system", actorId: "test-kb-corpus" };
const SCOPE = { courseId: "crs_mgmt", classId: "cls_mgmt", lessonId: "les_orgdesign" };
const FILTERS = { courseId: COURSE_ID, chapterId: CHAPTER_ID };

const dir = mkdtempSync(join(tmpdir(), "pharmaco-kb-corpus-test-"));
const db = new DatabaseSync(join(dir, "corpus.sqlite"));
db.exec("PRAGMA foreign_keys = ON;");
runMigrations(db);
db.prepare("INSERT INTO courses(id, name, code, status, created_at, updated_at) VALUES (?, ?, ?, 'ACTIVE', ?, ?)")
  .run(SCOPE.courseId, "管理学原理", "MGMT-101", NOW, NOW);
db.prepare("INSERT INTO class_cohorts(id, course_id, name, academic_term, created_at) VALUES (?, ?, ?, ?, ?)")
  .run(SCOPE.classId, SCOPE.courseId, "2026 春 1 班", "2026 春", NOW);
db.prepare("INSERT INTO lessons(id, course_id, class_id, title, created_at) VALUES (?, ?, ?, ?, ?)")
  .run(SCOPE.lessonId, SCOPE.courseId, SCOPE.classId, "组织设计", NOW);
await registerSourcesFromManifest(db, LEGACY_MANIFEST, SYSTEM);
await ingestAuthoritativeManifest(db, AUTHORITATIVE_MANIFEST, SYSTEM);
extractKeyTermsDeterministic(db, { courseId: COURSE_ID, chapterId: CHAPTER_ID, actorContext: SYSTEM });
buildLayeredKnowledgeBase(db, { courseId: COURSE_ID, chapterId: CHAPTER_ID, actorContext: SYSTEM });

const layerByAssetId = new Map(
  db.prepare("SELECT asset_id, layer FROM kb_chapter_sources WHERE course_id = ? AND chapter_id = ?")
    .all(COURSE_ID, CHAPTER_ID)
    .map((row) => [row.asset_id, row.layer]),
);
const assetIdByVersionId = new Map(
  db.prepare("SELECT id, asset_id FROM asset_versions").all().map((row) => [row.id, row.asset_id]),
);
const layerOf = (result) => layerByAssetId.get(assetIdByVersionId.get(result.assetVersionId)) ?? null;
const assetOf = (result) => assetIdByVersionId.get(result.assetVersionId);
const textsOf = (run) =>
  run.results
    .flatMap((r) => r.mergedFragmentIds)
    .map((id) => db.prepare("SELECT content_raw FROM content_blocks WHERE id = ?").get(id)?.content_raw ?? "");

function search(query, filters = {}) {
  return searchKnowledge(db, {
    query,
    filters: { ...FILTERS, ...filters },
    actorContext: SYSTEM,
    workflowScope: SCOPE,
  });
}

test.after(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// 1. 短词通道(10 词)
// ---------------------------------------------------------------------------
test("短词通道:10 个两字词逐词锁定(逐字命中或别名桥接,均不得 insufficient)", () => {
  // verbatim:语料是否存在该词逐字(2026-08-04 复验实测);layers:必须出现的层。
  const expectations = {
    组织: { verbatim: true, layers: ["pharma_context"] },
    授权: { verbatim: true, layers: ["pharma_context"] },
    分权: { verbatim: false, layers: ["theory"] },
    集权: { verbatim: false, layers: ["theory"] },
    权责: { verbatim: false, layers: ["theory"] },
    矩阵: { verbatim: true, layers: ["theory"] },
    质量: { verbatim: true, layers: ["pharma_context"] },
    委托: { verbatim: true, layers: ["pharma_context"] },
    药事: { verbatim: true, layers: ["pharma_context"] },
    采购: { verbatim: true, layers: ["pharma_context"] },
  };
  for (const [word, expect] of Object.entries(expectations)) {
    const run = search(word);
    assert.equal(run.insufficientEvidence, false, `${word}: 不得 insufficientEvidence`);
    assert.ok(run.resultCount > 0, `${word}: 必须有结果`);
    const texts = textsOf(run);
    assert.equal(
      texts.some((text) => text.includes(word)),
      expect.verbatim,
      `${word}: 逐字命中应为 ${expect.verbatim}`,
    );
    const layers = run.results.map(layerOf);
    for (const layer of expect.layers) {
      assert.ok(layers.includes(layer), `${word}: 结果须含 ${layer} 层(实际 ${[...new Set(layers)].join("/")})`);
    }
  }
});

// ---------------------------------------------------------------------------
// 2. 术语别名表
// ---------------------------------------------------------------------------
test("术语别名表:显式常量结构 + 单一事实源查询扩展", () => {
  assert.ok(Array.isArray(COURSE_TERM_ALIASES) && Object.isFrozen(COURSE_TERM_ALIASES));
  const keys = COURSE_TERM_ALIASES.map((g) => g.key);
  for (const key of ["qualified_person", "pharmacovigilance", "vbp", "mah", "gsp", "gmp", "dtc"]) {
    assert.ok(keys.includes(key), `别名组 ${key} 必须存在`);
  }
  // 中英文/全称缩写互指(单一事实源 aliasesOfTerm)
  assert.deepEqual(new Set(aliasesOfTerm("QP")), new Set(["质量受权人", "QP", "Qualified Person"]));
  assert.ok(aliasesOfTerm("药物警戒").includes("pharmacovigilance"));
  assert.ok(aliasesOfTerm("pharmacovigilance").includes("药物警戒"));
  assert.ok(aliasesOfTerm("集采").includes("集中带量采购"));
  assert.ok(aliasesOfTerm("集采").includes("volume-based procurement"));
  assert.deepEqual(aliasesOfTerm("未登记术语"), ["未登记术语"]);
  // 查询扩展:命中任一面形 → 同组其余面形补入
  const expansion = expandQueryByTermAliases("集采对流通企业的影响");
  assert.ok(expansion.matchedGroups.includes("vbp"));
  const added = [...expansion.expansionTerms, ...expansion.expansionPhrases];
  assert.ok(added.includes("集中带量采购"), "中文面形须补入");
  assert.ok(added.includes("volume-based procurement"), "英文面形须补入");
});

test("术语别名表:OOV 拒答豁免(QP 注册别名在库,不判 missing);未注册外文仍拒答", () => {
  // 'QP' 本身不在语料逐字出现与否不影响:注册别名 质量受权人 在库(GMP 等),OOV 豁免生效。
  const exempted = search("QP 在药品质量放行中的职责是什么");
  assert.deepEqual(exempted.missingTerms, [], "QP 有注册别名在库,不得判 missing");
  assert.equal(exempted.insufficientEvidence, false);
  assert.ok(exempted.resultCount > 0);
  // 未注册外文词元:语料零命中即拒答(OOV 规则本身不被别名表削弱)。
  const refused = search("blockchain 对组织结构设计的影响");
  assert.equal(refused.insufficientEvidence, true);
  assert.deepEqual(refused.results, []);
  assert.ok(refused.missingTerms.includes("blockchain"));
  assert.equal(refused.refusalMessage, INSUFFICIENT_EVIDENCE_MESSAGE);
});

// ---------------------------------------------------------------------------
// 3. 五维精确过滤
// ---------------------------------------------------------------------------
test("五维过滤:layer/company/authorityLevel/reviewStatus/concept 精确生效", () => {
  // layer(中文题面命中概念别名,经扩展 + 桥接命中英文理论层)
  const theoryRun = search("组织结构", { layer: "theory" });
  assert.ok(theoryRun.resultCount > 0);
  assert.ok(theoryRun.results.every((r) => layerOf(r) === "theory"), "layer=theory 结果必须全部理论层");
  const pharmaRun = search("质量 管理 机构", { layer: "pharma_context" });
  assert.ok(pharmaRun.resultCount > 0);
  assert.ok(pharmaRun.results.every((r) => layerOf(r) === "pharma_context"));

  // company(经 kb_company_fact_units 链接)
  const hengruiRun = search("组织 架构 研发", { company: "恒瑞医药" });
  assert.ok(hengruiRun.resultCount > 0, "company=恒瑞医药 必须有结果");
  assert.ok(hengruiRun.results.every((r) => assetOf(r) === "doc_hengrui_600276_ar2025"));

  // authorityLevel(经 kb_source_permissions;1=法规/年报,2=教材/OCW)
  const level1 = search("质量 管理", { authorityLevel: 1 });
  assert.ok(level1.resultCount > 0);
  const level2 = search("组织结构", { authorityLevel: 2 });
  assert.ok(level2.resultCount > 0);
  for (const [run, level] of [[level1, 1], [level2, 2]]) {
    for (const r of run.results) {
      const row = db.prepare("SELECT authority_level FROM kb_source_permissions WHERE source_id = ?").get(assetOf(r));
      assert.equal(row?.authority_level, level, `authorityLevel=${level} 过滤失效:${r.sourceId}`);
    }
  }

  // reviewStatus(pharma/company 单元默认 needs_review;三层并集,须每层至少一条该状态链接)
  const nrRun = search("质量 管理 机构", { reviewStatus: "needs_review" });
  assert.ok(nrRun.resultCount > 0);
  for (const r of nrRun.results) {
    const linked = db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM kb_unit_fragments uf JOIN kb_knowledge_units u ON u.id = uf.unit_id
             WHERE uf.fragment_id = ? AND u.review_status = 'needs_review') +
           (SELECT COUNT(*) FROM kb_pharma_context_fragments pf JOIN kb_pharma_context_units pu ON pu.id = pf.unit_id
             WHERE pf.fragment_id = ? AND pu.review_status = 'needs_review') +
           (SELECT COUNT(*) FROM kb_company_fact_fragments cf JOIN kb_company_fact_units cu ON cu.id = cf.unit_id
             WHERE cf.fragment_id = ? AND cu.review_status = 'needs_review') AS c`,
      )
      .get(r.fragmentId, r.fragmentId, r.fragmentId).c;
    assert.ok(linked > 0, `片段 ${r.fragmentId} 无 needs_review 单元链接却通过过滤`);
  }

  // concept(概念别名归并,中文概念名命中英文 unit concept;查询须含可命中英文块的词元,
  // 故用概念本名触发别名扩展)
  const conceptRun = search("集权与分权", { concept: "集权与分权" });
  assert.ok(conceptRun.resultCount > 0, "concept=集权与分权 必须有结果(别名归并到 centralization 单元)");
  for (const r of conceptRun.results) {
    const concepts = db
      .prepare(
        `SELECT lower(u.concept) AS c FROM kb_unit_fragments uf JOIN kb_knowledge_units u ON u.id = uf.unit_id
         WHERE uf.fragment_id = ?`,
      )
      .all(r.fragmentId)
      .map((row) => row.c);
    const aliasNames = new Set(["集权与分权", "集权", "分权", "centralization", "decentralization", "centralized", "decentralized"]);
    assert.ok(concepts.some((c) => aliasNames.has(c)), `片段 ${r.fragmentId} 未链接到集权与分权概念单元`);
  }
});

test("五维过滤:非法过滤值显式报错(KB_RETRIEVAL_INPUT_INVALID)", () => {
  const isInputInvalid = (error) => error.code === "KB_RETRIEVAL_INPUT_INVALID";
  assert.throws(() => search("组织", { layer: "bogus" }), isInputInvalid);
  assert.throws(() => search("组织", { authorityLevel: 3 }), isInputInvalid);
  assert.throws(() => search("组织", { reviewStatus: "bogus" }), isInputInvalid);
  assert.throws(() => search("组织", { foo: "bar" }), isInputInvalid);
});

// ---------------------------------------------------------------------------
// 4. 拒答路径锁定
// ---------------------------------------------------------------------------
test("拒答锁定:OOV 零命中 → 固定话术 + channel 'none' + 零证据行", () => {
  const run = search("quantumcomputing 与组织设计");
  assert.equal(run.insufficientEvidence, true);
  assert.deepEqual(run.results, []);
  assert.equal(run.channel, "none");
  assert.equal(run.refusalMessage, INSUFFICIENT_EVIDENCE_MESSAGE);
  assert.ok(run.missingTerms.includes("quantumcomputing"));
  const evidenceRows = db.prepare("SELECT COUNT(*) AS c FROM evidence_links WHERE retrieval_run_id = ?").get(run.retrievalRunId).c;
  assert.equal(evidenceRows, 0, "0 结果 run 不得落证据行");
});

test("拒答锁定:纯停用词查询无有效词元 → insufficientEvidence", () => {
  const run = search("什么的了");
  assert.equal(run.insufficientEvidence, true);
  assert.deepEqual(run.results, []);
});

test("拒答锁定:主教材缺失题(od-eval-30 型)诉求短语不得出现在任何返回片段", () => {
  const run = search("本课程主教材中'权责对等原则'的原文表述是什么?它与 OpenStax 的 command-and-control、centralization 表述有何异同?");
  // 主教材 awaiting_teacher_provided:系统可返回相关理论片段,但诉求短语"权责对等"
  // (主教材原文表述)不得被伪装产出;任何返回片段均不含该短语,且结果来源中没有主教材。
  const texts = textsOf(run);
  assert.ok(!texts.some((text) => text.includes("权责对等")), "诉求短语 权责对等 不得出现在返回片段");
  assert.ok(!run.results.some((r) => r.sourceId === "src_textbook_main_orgdesign"), "主教材来源不存在,不得出现其结果");
});

test("拒答锁定:blocked 来源(ocw-15-320-s11-lec01)零资产零块零结果", () => {
  assert.equal(db.prepare("SELECT COUNT(*) AS c FROM knowledge_assets WHERE id = 'ocw-15-320-s11-lec01'").get().c, 0);
  const run = search("organizational change lecture");
  assert.ok(!run.results.some((r) => r.sourceId === "ocw-15-320-s11-lec01"));
});

// ---------------------------------------------------------------------------
// 5. 解析完整性(NUL 清洗:伪引用 =0 的结构性保证)
// ---------------------------------------------------------------------------
test("解析完整性:全库 content_hash 与 content_raw 可互相机检,原截断块全文在库", () => {
  const rows = db.prepare("SELECT content_raw, content_hash FROM content_blocks").all();
  for (const row of rows) {
    const recomputed = `sha256:${createHash("sha256").update(row.content_raw).digest("hex")}`;
    assert.equal(row.content_hash, recomputed, "content_hash 必须与 content_raw 一致(NUL 截断回归)");
  }
  // 益丰年报抽取稿含 10 处 NUL(页块曾被截断):清洗后 NUL 之后的正文必须在库。
  const recovered = db
    .prepare(
      `SELECT COUNT(*) AS c FROM content_blocks cb
       JOIN asset_versions av ON av.id = cb.asset_version_id
       WHERE av.asset_id = 'doc_yifeng_603939_ar2025' AND instr(cb.content_raw, '集采商品定价') > 0`,
    )
    .get().c;
  assert.ok(recovered > 0, "益丰年报 NUL 之后的正文(集采商品定价段)必须在库");
});
