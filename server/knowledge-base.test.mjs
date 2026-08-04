// 知识库 v0.1 DB 层与来源/单元服务测试(migration 006 + knowledge-source-service + knowledge-unit-service)。
// 覆盖:
//   1. migration 006:空库 000→006 全量 + 幂等;kb_* 四表/索引/触发器;workflow_instances CHECK
//      扩展('KB_RETRIEVAL'/'KB_REVIEW')且老库 S1 行无损;kb_retrieval_runs 追加式;
//      unit definition/claim 不可改而 review_status 可流转;
//   2. registerSourcesFromManifest:真实 manifest 两章摄入、hash 复核、权限闸门、幂等、审计;
//   3. parser repeatability:同文件两次解析 content_hash 序列一致;
//   4. extractKeyTermsDeterministic:ch10 ≥10 个 machine_extracted 单元、挂片段、UNIQUE 幂等;
//   5. createKnowledgeUnit/setUnitReviewStatus/listKnowledgeUnits/corpusVersionHash。
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { runMigrations } from "./migrations.mjs";
import { createManualMarkdownParser } from "./document-parsers/manual-markdown-parser.mjs";
import { registerSourcesFromManifest } from "./product-core/knowledge-source-service.mjs";
import {
  corpusVersionHash,
  createKnowledgeUnit,
  extractKeyTermsDeterministic,
  listKnowledgeUnits,
  setUnitReviewStatus,
} from "./product-core/knowledge-unit-service.mjs";
import { insertContentBlock } from "./product-core/repository.mjs";

const SERVER_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(SERVER_DIR, "..");
const MIGRATIONS_DIR = join(SERVER_DIR, "migrations");
const MANIFEST_PATH = join(PROJECT_ROOT, "docs/knowledge-base/organization-design-source-manifest.json");
const M006 = "006_knowledge_base.sql";
const M007 = "007_kb_retrieval_evidence.sql";
const NOW = "2026-08-03T00:00:00.000Z";
const COURSE_ID = "course_mgmt_principles";
const CHAPTER_ID = "ch_organization_design";
const CH10_SOURCE_ID = "src_openstax_pom_ch10";
const CH04_SOURCE_ID = "src_openstax_pom_ch04_s4_3";
const CH10_HASH = "sha256:9d3c49d6880d41b16ab1ea15a69cabc28e8527444141f947f5bf07a5af6b41b5";
const CH04_HASH = "sha256:029a8b421f696bad53796cb61c7aed71b5185d8d3e99baae07e31d363dd11a6d";
const CH10_FILE = join(PROJECT_ROOT, "knowledge-sources/organization-design/openstax-pom-ch10-organizational-structure-and-change.md");
const PENDING_SOURCE_IDS = [
  "src_teacher_ppt_orgdesign",
  "src_syllabus_mp",
  "src_textbook_main_orgdesign",
  "src_pharma_context_pack",
  "src_openstax_pom_ch03_s3_7",
  "src_annual_reports_2cos",
];
const SYSTEM = { actorType: "system", actorId: "test-system" };
const TEACHER = { actorType: "teacher", actorId: "teacher-01" };

function openDb(t) {
  const dir = mkdtempSync(join(tmpdir(), "pharmaco-kb-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const db = new DatabaseSync(join(dir, "test.sqlite"));
  db.exec("PRAGMA foreign_keys = ON;");
  return db;
}

function tableNames(db) {
  return new Set(
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name),
  );
}

// course -> class -> lesson 最小合法链(workflow_instances 的 FK 依赖)。
function seedScope(db, { courseId = "crs_a", classId = "cls_a", lessonId = "les_a" } = {}) {
  db.prepare("INSERT INTO courses(id, name, code, status, created_at, updated_at) VALUES (?, ?, ?, 'ACTIVE', ?, ?)")
    .run(courseId, "课程", `CODE-${courseId}`, NOW, NOW);
  db.prepare("INSERT INTO class_cohorts(id, course_id, name, academic_term, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(classId, courseId, "班级", "2026 春", NOW);
  db.prepare("INSERT INTO lessons(id, course_id, class_id, title, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(lessonId, courseId, classId, "课时", NOW);
  return { courseId, classId, lessonId };
}

function insertWorkflow(db, { id, workflowType }) {
  db.prepare(
    `INSERT INTO workflow_instances(id, workflow_type, course_id, class_id, lesson_id, current_state, state_machine_version, created_by, created_at, updated_at)
     VALUES (?, ?, 'crs_a', 'cls_a', 'les_a', 'DRAFT', '1.0.0', 'teacher', ?, ?)`,
  ).run(id, workflowType, NOW, NOW);
}

// 建库 + 全量迁移 + 真实 manifest 摄入,返回 { db, result }。
async function openIngestedDb(t) {
  const db = openDb(t);
  runMigrations(db);
  const result = await registerSourcesFromManifest(db, MANIFEST_PATH, SYSTEM);
  return { db, result };
}

function versionIdByHash(db, hashRef) {
  return db.prepare("SELECT id FROM asset_versions WHERE original_file_hash = ?").get(hashRef).id;
}

// ---------------------------------------------------------------------------
// migration 006
// ---------------------------------------------------------------------------

test("006: 空库 000→006 全量应用且幂等,kb 四表/索引/触发器齐全", (t) => {
  const db = openDb(t);
  const files = runMigrations(db);
  assert.ok(files.includes(M006), "migration 列表应包含 006");

  const names = tableNames(db);
  for (const expected of ["kb_knowledge_units", "kb_unit_fragments", "kb_teaching_use_objects", "kb_retrieval_runs"]) {
    assert.ok(names.has(expected), `缺少表 ${expected}`);
  }

  const indexes = new Set(
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all().map((r) => r.name),
  );
  for (const expected of [
    "kb_knowledge_units_course_chapter",
    "kb_knowledge_units_concept",
    "kb_knowledge_units_review_status",
    "kb_unit_fragments_fragment",
    "kb_teaching_use_objects_unit",
    "kb_teaching_use_objects_type",
    "kb_retrieval_runs_workflow",
    "kb_retrieval_runs_corpus",
    "workflow_instances_lesson",
  ]) {
    assert.ok(indexes.has(expected), `缺少索引 ${expected}`);
  }

  const triggers = new Set(
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger'").all().map((r) => r.name),
  );
  for (const expected of [
    "kb_knowledge_units_definition_claim_immutable",
    "kb_retrieval_runs_no_update",
    "kb_retrieval_runs_no_delete",
  ]) {
    assert.ok(triggers.has(expected), `缺少触发器 ${expected}`);
  }

  // STRICT 表抽查
  const unitSql = db.prepare("SELECT sql FROM sqlite_master WHERE name = 'kb_knowledge_units'").get().sql;
  assert.match(unitSql, /STRICT/);
  assert.match(unitSql, /UNIQUE \(course_id, chapter_id, concept, extraction_method\)/);

  // 全库引用完整 + 迁移记录 + 幂等
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM schema_migrations").get().n, files.length);
  runMigrations(db);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM schema_migrations").get().n, files.length);
  db.close();
});

test("006: workflow_instances 接受 KB_RETRIEVAL/KB_REVIEW,拒绝未列枚举", (t) => {
  const db = openDb(t);
  runMigrations(db);
  seedScope(db);

  insertWorkflow(db, { id: "wfi_kb1", workflowType: "KB_RETRIEVAL" });
  insertWorkflow(db, { id: "wfi_kb2", workflowType: "KB_REVIEW" });
  insertWorkflow(db, { id: "wfi_s1", workflowType: "S1_DIAGNOSIS" });
  assert.throws(
    () => insertWorkflow(db, { id: "wfi_bad", workflowType: "BOGUS" }),
    /CHECK/,
  );
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM workflow_instances").get().n, 3);
  db.close();
});

test("006: 老库(000–005,S1 行)升级 —— 旧行无损、引用完整、CHECK 扩展生效", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "pharmaco-kb-m006-legacy-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const migrationsCopy = join(dir, "migrations");
  cpSync(MIGRATIONS_DIR, migrationsCopy, { recursive: true });
  // 老库 = 000–005:006 及其依赖项 007(引用 006 的 kb_retrieval_runs)一并排除。
  rmSync(join(migrationsCopy, M006));
  rmSync(join(migrationsCopy, M007));

  const db = new DatabaseSync(join(dir, "legacy.sqlite"));
  db.exec("PRAGMA foreign_keys = ON;");
  runMigrations(db, { migrationsDir: migrationsCopy });

  // 老库播种:S1 workflow + 一条 claim(005 结构)。
  seedScope(db);
  insertWorkflow(db, { id: "wfi_1", workflowType: "S1_DIAGNOSIS" });
  db.prepare(
    `INSERT INTO teaching_claims(id, claim_type, statement, stage_id, course_id, class_id, lesson_id, workflow_instance_id, confidence_status, created_by, created_at)
     VALUES ('clm_1', 'factual_claim', '升级前主张', 'S1', 'crs_a', 'cls_a', 'les_a', 'wfi_1', 'confirmed', 'teacher', ?)`,
  ).run(NOW);
  // 升级前:KB_RETRIEVAL 被旧 CHECK 拒绝
  assert.throws(() => insertWorkflow(db, { id: "wfi_kb", workflowType: "KB_RETRIEVAL" }), /CHECK/);

  // 应用 006 与 007(007 依赖 006 的 kb_retrieval_runs,必须同批或其后)
  cpSync(join(MIGRATIONS_DIR, M006), join(migrationsCopy, M006));
  cpSync(join(MIGRATIONS_DIR, M007), join(migrationsCopy, M007));
  runMigrations(db, { migrationsDir: migrationsCopy });

  // 旧行无损(全部列逐字)
  const wfi = db.prepare("SELECT * FROM workflow_instances WHERE id = 'wfi_1'").get();
  assert.deepEqual(
    { ...wfi, created_at: NOW, updated_at: NOW },
    {
      id: "wfi_1",
      workflow_type: "S1_DIAGNOSIS",
      course_id: "crs_a",
      class_id: "cls_a",
      lesson_id: "les_a",
      current_state: "DRAFT",
      state_version: 1,
      state_machine_version: "1.0.0",
      created_by: "teacher",
      cancelled_reason: null,
      created_at: NOW,
      updated_at: NOW,
    },
  );
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM teaching_claims").get().n, 1);
  assert.equal(db.prepare("SELECT statement FROM teaching_claims WHERE id = 'clm_1'").get().statement, "升级前主张");

  // 全库引用完整;索引保留;既有触发器(005 重建的 statement 不可变)仍在
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  const indexNames = new Set(
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'workflow_instances'").all().map((r) => r.name),
  );
  assert.ok(indexNames.has("workflow_instances_lesson"), "workflow_instances_lesson 索引未保留");
  assert.throws(
    () => db.prepare("UPDATE teaching_claims SET statement = '改写' WHERE id = 'clm_1'").run(),
    /statement is immutable/,
  );

  // CHECK 扩展生效:KB 类型现在可插入,且与 S1 行并存
  insertWorkflow(db, { id: "wfi_kb", workflowType: "KB_RETRIEVAL" });
  insertWorkflow(db, { id: "wfi_kr", workflowType: "KB_REVIEW" });
  assert.throws(() => insertWorkflow(db, { id: "wfi_bad", workflowType: "BOGUS" }), /CHECK/);
  assert.equal(db.prepare("PRAGMA foreign_keys").get().foreign_keys, 1);
  db.close();
});

test("006: kb_retrieval_runs 追加式 —— 禁 UPDATE/DELETE", (t) => {
  const db = openDb(t);
  runMigrations(db);
  seedScope(db);
  insertWorkflow(db, { id: "wfi_kb", workflowType: "KB_RETRIEVAL" });
  db.prepare(
    `INSERT INTO kb_retrieval_runs(id, workflow_instance_id, query_text, filters_json, corpus_version_hash, results_json, result_count, created_by, created_at)
     VALUES ('krr_1', 'wfi_kb', '管理幅度', '{}', 'sha256:abc', '[]', 0, 'system', ?)`,
  ).run(NOW);

  assert.throws(
    () => db.prepare("UPDATE kb_retrieval_runs SET result_count = 1 WHERE id = 'krr_1'").run(),
    /append-only/,
  );
  assert.throws(() => db.prepare("DELETE FROM kb_retrieval_runs WHERE id = 'krr_1'").run(), /append-only/);
  // FK:workflow_instance_id 必须真实存在
  assert.throws(
    () =>
      db.prepare(
        `INSERT INTO kb_retrieval_runs(id, workflow_instance_id, query_text, filters_json, corpus_version_hash, results_json, result_count, created_by, created_at)
         VALUES ('krr_2', 'wfi_ghost', 'x', '{}', 'h', '[]', 0, 'system', ?)`,
      ).run(NOW),
    /FOREIGN KEY/,
  );
  db.close();
});

test("006: unit definition/claim 不可改,review_status 可更新,UNIQUE 防重复,fragment FK 生效", (t) => {
  const db = openDb(t);
  runMigrations(db);
  db.prepare("INSERT INTO knowledge_assets(id, type, title, created_at) VALUES ('ka_1', 'textbook', '教材', ?)").run(NOW);
  db.prepare("INSERT INTO asset_versions(id, asset_id, version, created_at) VALUES ('av_1', 'ka_1', 'v1', ?)").run(NOW);
  db.prepare(
    "INSERT INTO content_blocks(id, asset_version_id, block_type, order_index, content_raw, content_hash) VALUES ('blk_1', 'av_1', 'paragraph', 0, '原文片段', 'h1')",
  ).run();
  db.prepare(
    `INSERT INTO kb_knowledge_units(id, course_id, chapter_id, concept, definition, confidence, extraction_method, created_by, created_at)
     VALUES ('ku_1', ?, ?, '管理幅度', '一个管理者直接管辖的人数', 'high', 'manual', 'teacher', ?)`,
  ).run(COURSE_ID, CHAPTER_ID, NOW);

  // definition/claim 不可改;review_status 可更新(审核流转)
  assert.throws(
    () => db.prepare("UPDATE kb_knowledge_units SET definition = '改写' WHERE id = 'ku_1'").run(),
    /immutable/,
  );
  assert.throws(
    () => db.prepare("UPDATE kb_knowledge_units SET claim = '新断言' WHERE id = 'ku_1'").run(),
    /immutable/,
  );
  db.prepare("UPDATE kb_knowledge_units SET review_status = 'teacher_verified' WHERE id = 'ku_1'").run();
  assert.equal(db.prepare("SELECT review_status FROM kb_knowledge_units WHERE id = 'ku_1'").get().review_status, "teacher_verified");

  // UNIQUE(course_id, chapter_id, concept, extraction_method) 防重复提取;换 extraction_method 可并存
  assert.throws(
    () =>
      db.prepare(
        `INSERT INTO kb_knowledge_units(id, course_id, chapter_id, concept, confidence, extraction_method, created_by, created_at)
         VALUES ('ku_2', ?, ?, '管理幅度', 'medium', 'manual', 'teacher', ?)`,
      ).run(COURSE_ID, CHAPTER_ID, NOW),
    /UNIQUE/,
  );
  db.prepare(
    `INSERT INTO kb_knowledge_units(id, course_id, chapter_id, concept, confidence, extraction_method, created_by, created_at)
     VALUES ('ku_3', ?, ?, '管理幅度', 'medium', 'deterministic_keyterm', 'system', ?)`,
  ).run(COURSE_ID, CHAPTER_ID, NOW);

  // kb_unit_fragments:合法挂载 + 双 FK
  db.prepare("INSERT INTO kb_unit_fragments(unit_id, fragment_id, role) VALUES ('ku_1', 'blk_1', 'definition')").run();
  assert.throws(
    () => db.prepare("INSERT INTO kb_unit_fragments(unit_id, fragment_id) VALUES ('ku_1', 'blk_ghost')").run(),
    /FOREIGN KEY/,
  );
  assert.throws(
    () => db.prepare("INSERT INTO kb_unit_fragments(unit_id, fragment_id) VALUES ('ku_ghost', 'blk_1')").run(),
    /FOREIGN KEY/,
  );
  db.close();
});

// ---------------------------------------------------------------------------
// registerSourcesFromManifest
// ---------------------------------------------------------------------------

test("registerSources: 真实 manifest 摄入两章,hash 复核一致,pending/skipped 分类正确,审计留痕", async (t) => {
  const { db, result } = await openIngestedDb(t);

  // 两章摄入成功
  assert.equal(result.ingested.length, 2);
  assert.deepEqual(
    result.ingested.map((r) => r.sourceId),
    [CH10_SOURCE_ID, CH04_SOURCE_ID],
  );
  for (const row of result.ingested) {
    assert.ok(row.blockCount > 0, `${row.sourceId} 应解析出 content_blocks`);
    assert.equal(row.alreadyIngested, false);
  }
  assert.equal(result.ingested[0].fileHash, CH10_HASH);
  assert.equal(result.ingested[1].fileHash, CH04_HASH);

  // skipped=0(两条 OpenStax 均授权 deterministic_parsing);pending=6 待提供/候选
  assert.equal(result.skipped.length, 0);
  assert.deepEqual(
    result.pending.map((p) => p.sourceId).sort(),
    [...PENDING_SOURCE_IDS].sort(),
  );
  const pendingById = new Map(result.pending.map((p) => [p.sourceId, p]));
  assert.equal(pendingById.get("src_teacher_ppt_orgdesign").status, "awaiting_teacher_provided");
  assert.equal(pendingById.get("src_annual_reports_2cos").status, "awaiting_company_selection");
  assert.equal(pendingById.get("src_openstax_pom_ch03_s3_7").status, "candidate");

  // 落库:2 资产(UNREVIEWED/textbook)+ 2 版本(hash/位置/parser 字段与 manifest 一致)+ 块数一致
  const assets = db.prepare("SELECT * FROM knowledge_assets ORDER BY created_at, id").all();
  assert.equal(assets.length, 2);
  for (const asset of assets) {
    assert.equal(asset.review_status, "UNREVIEWED");
    assert.equal(asset.type, "textbook");
  }
  const versions = db.prepare("SELECT * FROM asset_versions ORDER BY created_at, id").all();
  assert.equal(versions.length, 2);
  const versionByHash = new Map(versions.map((v) => [v.original_file_hash, v]));
  assert.ok(versionByHash.has(CH10_HASH));
  assert.ok(versionByHash.has(CH04_HASH));
  assert.equal(versionByHash.get(CH10_HASH).parser_name, "manual-markdown");
  assert.equal(
    versionByHash.get(CH10_HASH).original_file_location,
    "knowledge-sources/organization-design/openstax-pom-ch10-organizational-structure-and-change.md",
  );
  assert.ok(versionByHash.get(CH10_HASH).parsed_at);
  const totalBlocks = db.prepare("SELECT COUNT(*) AS n FROM content_blocks").get().n;
  assert.equal(totalBlocks, result.ingested[0].blockCount + result.ingested[1].blockCount);

  // 权限/许可元数据随块落库(001 已冻结表不加列,走 parser_metadata_json)
  const meta = JSON.parse(db.prepare("SELECT parser_metadata_json FROM content_blocks LIMIT 1").get().parser_metadata_json);
  assert.ok([CH10_SOURCE_ID, CH04_SOURCE_ID].includes(meta.sourceId));
  assert.equal(meta.courseId, COURSE_ID);
  assert.equal(meta.chapterId, CHAPTER_ID);
  assert.equal(meta.license, "CC-BY-NC-SA-4.0");
  assert.equal(meta.acquisitionStatus, "acquired_reference_only");
  assert.ok(meta.allowedOperations.includes("deterministic_parsing"));
  assert.ok(meta.blockedOperations.includes("llm_extraction"));
  assert.equal(meta.reviewStatus, "unreviewed");

  // 审计:source.registered / source.parsed 各两条,payload 带 file_hash
  for (const eventType of ["source.registered", "source.parsed"]) {
    const events = db.prepare("SELECT * FROM audit_events WHERE event_type = ?").all(eventType);
    assert.equal(events.length, 2, `缺少审计事件 ${eventType}`);
    for (const event of events) {
      const payload = JSON.parse(event.payload_json);
      assert.ok([CH10_HASH, CH04_HASH].includes(payload.fileHash), `${eventType} payload 缺 fileHash`);
      assert.ok(event.entity_type && event.entity_id);
    }
  }
  db.close();
});

test("registerSources: 幂等重跑 —— 行数不变,alreadyIngested=true", async (t) => {
  const { db, result: first } = await openIngestedDb(t);
  const before = {
    assets: db.prepare("SELECT COUNT(*) AS n FROM knowledge_assets").get().n,
    versions: db.prepare("SELECT COUNT(*) AS n FROM asset_versions").get().n,
    blocks: db.prepare("SELECT COUNT(*) AS n FROM content_blocks").get().n,
  };

  const second = await registerSourcesFromManifest(db, MANIFEST_PATH, SYSTEM);
  assert.equal(second.ingested.length, 2);
  for (const row of second.ingested) {
    assert.equal(row.alreadyIngested, true, "重跑应判重而非重复摄入");
  }
  assert.deepEqual(
    second.ingested.map((r) => [r.sourceId, r.assetVersionId, r.blockCount]),
    first.ingested.map((r) => [r.sourceId, r.assetVersionId, r.blockCount]),
  );
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM knowledge_assets").get().n, before.assets);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM asset_versions").get().n, before.versions);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM content_blocks").get().n, before.blocks);
  db.close();
});

test("registerSources: 篡改 hash 的 manifest → FAIL 且零写入", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "pharmaco-kb-tamper-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  manifest.sources[0].file_hash.value = "0".repeat(64);
  const tamperedPath = join(dir, "tampered-manifest.json");
  writeFileSync(tamperedPath, JSON.stringify(manifest));

  const db = openDb(t);
  runMigrations(db);
  await assert.rejects(registerSourcesFromManifest(db, tamperedPath, SYSTEM), (error) => {
    assert.equal(error.code, "KB_SOURCE_HASH_MISMATCH");
    return true;
  });
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM knowledge_assets").get().n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM asset_versions").get().n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM content_blocks").get().n, 0);
  db.close();
});

test("registerSources: 权限闸门 —— 有文件但未授权 deterministic_parsing 的条目跳过并记录原因", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "pharmaco-kb-gate-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  const blockedEntry = {
    ...manifest.sources[0],
    source_id: "src_blocked_demo",
    allowedOperations: ["local_archival", "hash_verification"],
    blockedOperations: ["deterministic_parsing", "llm_extraction"],
  };
  const syntheticPath = join(dir, "synthetic-manifest.json");
  writeFileSync(syntheticPath, JSON.stringify({ ...manifest, sources: [blockedEntry, manifest.sources[2]] }));

  const db = openDb(t);
  runMigrations(db);
  const result = await registerSourcesFromManifest(db, syntheticPath, SYSTEM);
  assert.equal(result.ingested.length, 0);
  assert.equal(result.skipped.length, 1);
  assert.equal(result.skipped[0].sourceId, "src_blocked_demo");
  assert.match(result.skipped[0].reason, /权限闸门/);
  // sources[2] 为 awaiting_teacher_provided(无文件)→ pending
  assert.equal(result.pending.length, 1);
  assert.equal(result.pending[0].sourceId, "src_teacher_ppt_orgdesign");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM knowledge_assets").get().n, 0);
  db.close();
});

// ---------------------------------------------------------------------------
// parser repeatability
// ---------------------------------------------------------------------------

test("parser repeatability: 同一文件两次解析 content_hash 序列完全一致", async () => {
  const parse = () => createManualMarkdownParser().parse({ fileRef: CH10_FILE });
  const [first, second] = await Promise.all([parse(), parse()]);
  assert.ok(first.blocks.length > 0);
  assert.deepEqual(
    first.blocks.map((b) => b.contentHash),
    second.blocks.map((b) => b.contentHash),
  );
  assert.deepEqual(
    first.blocks.map((b) => [b.blockId, b.blockType, b.readingOrder]),
    second.blocks.map((b) => [b.blockId, b.blockType, b.readingOrder]),
  );
});

// ---------------------------------------------------------------------------
// extractKeyTermsDeterministic
// ---------------------------------------------------------------------------

test("extractKeyTerms: ch10 ≥10 个 machine_extracted 单元,挂来源片段,重复提取幂等", async (t) => {
  const { db } = await openIngestedDb(t);
  const ch10VersionId = versionIdByHash(db, CH10_HASH);

  const first = extractKeyTermsDeterministic(db, {
    assetVersionId: ch10VersionId,
    courseId: COURSE_ID,
    chapterId: CHAPTER_ID,
    actorContext: SYSTEM,
  });
  assert.ok(first.created.length >= 10, `ch10 Key Terms 应提取 ≥10 个单元,实际 ${first.created.length}`);
  assert.equal(first.skipped.length, 0);
  assert.equal(first.warnings.length, 0);

  const concepts = new Set(first.created.map((c) => c.concept));
  for (const expected of ["span of control", "centralization", "mechanistic bureaucratic structure", "organic bureaucratic structure"]) {
    assert.ok(concepts.has(expected), `应提取术语 ${expected}`);
  }
  for (const entry of first.created) {
    assert.ok(entry.concept.trim().length > 0, "concept 非空");
    const fragments = db.prepare("SELECT * FROM kb_unit_fragments WHERE unit_id = ?").all(entry.unitId);
    assert.ok(fragments.length >= 1, `单元 ${entry.concept} 必须挂 ≥1 片段`);
    assert.equal(fragments[0].fragment_id, entry.fragmentId);
    const unit = db.prepare("SELECT * FROM kb_knowledge_units WHERE id = ?").get(entry.unitId);
    assert.equal(unit.review_status, "machine_extracted");
    assert.equal(unit.confidence, "medium");
    assert.equal(unit.extraction_method, "deterministic_keyterm");
    assert.ok(unit.definition && unit.definition.length > 0, `单元 ${entry.concept} 应有定义`);
    assert.equal(unit.created_from_model_run_id, null, "确定性提取不得关联模型运行");
  }
  // 片段指向真实 content_block 且属于 ch10 版本
  const fragment = db
    .prepare("SELECT asset_version_id FROM content_blocks WHERE id = ?")
    .get(first.created[0].fragmentId);
  assert.equal(fragment.asset_version_id, ch10VersionId);

  // 审计:汇总事件 + 每单元 kb.unit.created
  const summary = db.prepare("SELECT * FROM audit_events WHERE event_type = 'kb.keyterms.extracted'").all();
  assert.equal(summary.length, 1);
  assert.equal(JSON.parse(summary[0].payload_json).createdCount, first.created.length);
  assert.equal(
    db.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE event_type = 'kb.unit.created'").get().n,
    first.created.length,
  );

  // 重复提取:UNIQUE(course_id, chapter_id, concept, extraction_method) 幂等,0 新增
  const unitCount = db.prepare("SELECT COUNT(*) AS n FROM kb_knowledge_units").get().n;
  const second = extractKeyTermsDeterministic(db, {
    assetVersionId: ch10VersionId,
    courseId: COURSE_ID,
    chapterId: CHAPTER_ID,
    actorContext: SYSTEM,
  });
  assert.equal(second.created.length, 0);
  assert.equal(second.skipped.length, first.created.length);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM kb_knowledge_units").get().n, unitCount);

  // listKnowledgeUnits 精确过滤
  assert.equal(listKnowledgeUnits(db, { courseId: COURSE_ID, chapterId: CHAPTER_ID }).length, unitCount);
  assert.equal(listKnowledgeUnits(db, { courseId: COURSE_ID, chapterId: CHAPTER_ID, reviewStatus: "machine_extracted" }).length, unitCount);
  assert.equal(listKnowledgeUnits(db, { courseId: COURSE_ID, chapterId: CHAPTER_ID, reviewStatus: "teacher_verified" }).length, 0);
  const span = listKnowledgeUnits(db, { concept: "span of control" });
  assert.equal(span.length, 1);
  assert.match(span[0].definition, /accountable/i);
  db.close();
});

test("extractKeyTerms: ch04 无 Key Terms 小节 → 0 产出并记 warning,不硬凑", async (t) => {
  const { db } = await openIngestedDb(t);
  const ch04VersionId = versionIdByHash(db, CH04_HASH);
  const result = extractKeyTermsDeterministic(db, {
    assetVersionId: ch04VersionId,
    courseId: COURSE_ID,
    chapterId: CHAPTER_ID,
    actorContext: SYSTEM,
  });
  assert.equal(result.created.length, 0);
  assert.equal(result.warnings.length, 1);
  assert.equal(result.warnings[0].code, "KEY_TERMS_SECTION_NOT_FOUND");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM kb_knowledge_units").get().n, 0);
  db.close();
});

// ---------------------------------------------------------------------------
// createKnowledgeUnit / setUnitReviewStatus / corpusVersionHash
// ---------------------------------------------------------------------------

test("createKnowledgeUnit + setUnitReviewStatus: 人工录入、片段校验、四态流转、审计", async (t) => {
  const { db } = await openIngestedDb(t);
  const fragmentId = db
    .prepare("SELECT id FROM content_blocks WHERE asset_version_id = ? ORDER BY order_index LIMIT 1")
    .get(versionIdByHash(db, CH10_HASH)).id;

  // 片段校验:不存在/空列表一律显式报错
  assert.throws(
    () => createKnowledgeUnit(db, { courseId: COURSE_ID, chapterId: CHAPTER_ID, concept: "x", fragmentIds: ["blk_ghost"] }, TEACHER),
    (error) => error.code === "KB_FRAGMENT_NOT_FOUND",
  );
  assert.throws(
    () => createKnowledgeUnit(db, { courseId: COURSE_ID, chapterId: CHAPTER_ID, concept: "x", fragmentIds: [] }, TEACHER),
    (error) => error.code === "KB_UNIT_INPUT_INVALID",
  );

  const { unitId, reviewStatus } = createKnowledgeUnit(
    db,
    {
      courseId: COURSE_ID,
      chapterId: CHAPTER_ID,
      concept: "管理幅度(人工示例)",
      definition: "一名管理者能够直接有效管辖的下属人数。",
      claim: "管理幅度与管理层次呈反向关系。",
      relatedConcepts: ["管理层次", "集权与分权"],
      fragmentIds: [fragmentId],
    },
    TEACHER,
  );
  assert.equal(reviewStatus, "needs_review", "人工录入默认也应经审核");
  const unit = db.prepare("SELECT * FROM kb_knowledge_units WHERE id = ?").get(unitId);
  assert.equal(unit.extraction_method, "manual");
  assert.equal(unit.confidence, "high");
  assert.deepEqual(JSON.parse(unit.related_concepts_json), ["管理层次", "集权与分权"]);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM kb_unit_fragments WHERE unit_id = ?").get(unitId).n, 1);

  const created = db.prepare("SELECT * FROM audit_events WHERE event_type = 'kb.unit.created' AND entity_id = ?").all(unitId);
  assert.equal(created.length, 1);
  assert.equal(JSON.parse(created[0].payload_json).extractionMethod, "manual");

  // 四态流转 + 审计(含前后状态)
  const reviewed = setUnitReviewStatus(db, unitId, { reviewStatus: "teacher_verified", reviewerId: "teacher-01", comment: "对照原文无误" }, TEACHER);
  assert.equal(reviewed.previousStatus, "needs_review");
  assert.equal(db.prepare("SELECT review_status FROM kb_knowledge_units WHERE id = ?").get(unitId).review_status, "teacher_verified");
  const reviewEvents = db.prepare("SELECT * FROM audit_events WHERE event_type = 'kb.unit.reviewed' AND entity_id = ?").all(unitId);
  assert.equal(reviewEvents.length, 1);
  assert.equal(reviewEvents[0].previous_state, "needs_review");
  assert.equal(reviewEvents[0].next_state, "teacher_verified");
  assert.equal(reviewEvents[0].actor_id, "teacher-01");
  assert.equal(JSON.parse(reviewEvents[0].payload_json).concept, "管理幅度(人工示例)");

  // rejected 单元只存(默认检索排除在检索服务阶段实现);非法状态/未知单元显式报错
  setUnitReviewStatus(db, unitId, { reviewStatus: "rejected", reviewerId: "teacher-01" }, TEACHER);
  assert.equal(db.prepare("SELECT review_status FROM kb_knowledge_units WHERE id = ?").get(unitId).review_status, "rejected");
  assert.throws(
    () => setUnitReviewStatus(db, unitId, { reviewStatus: "bogus", reviewerId: "teacher-01" }, TEACHER),
    (error) => error.code === "KB_REVIEW_STATUS_INVALID",
  );
  assert.throws(
    () => setUnitReviewStatus(db, "ku_ghost", { reviewStatus: "teacher_verified", reviewerId: "teacher-01" }, TEACHER),
    (error) => error.code === "KB_UNIT_NOT_FOUND",
  );
  db.close();
});

test("corpusVersionHash: 对块集稳定,对新 block 敏感", async (t) => {
  const { db } = await openIngestedDb(t);
  const h1 = corpusVersionHash(db, { courseId: COURSE_ID, chapterId: CHAPTER_ID });
  const h2 = corpusVersionHash(db, { courseId: COURSE_ID, chapterId: CHAPTER_ID });
  assert.match(h1, /^sha256:[0-9a-f]{64}$/);
  assert.equal(h1, h2, "块集不变时语料版本标识必须稳定");

  // 新增一个属于该章的 active block → 标识变化(版本变化可识别)
  insertContentBlock(db, {
    assetVersionId: versionIdByHash(db, CH10_HASH),
    blockType: "paragraph",
    orderIndex: 9999,
    contentRaw: "新增片段(测试语料版本敏感性)",
    parserMetadata: { courseId: COURSE_ID, chapterId: CHAPTER_ID, sourceId: CH10_SOURCE_ID },
  });
  const h3 = corpusVersionHash(db, { courseId: COURSE_ID, chapterId: CHAPTER_ID });
  assert.notEqual(h3, h1);

  // 无块的章 → 空集标识,与该章不同
  const hEmpty = corpusVersionHash(db, { courseId: COURSE_ID, chapterId: "ch_nonexistent" });
  assert.notEqual(hEmpty, h1);
  db.close();
});
