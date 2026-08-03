import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { runMigrations } from "./migrations.mjs";

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "migrations");
const NOW = "2026-08-03T00:00:00.000Z";

function openDb(t) {
  const dir = mkdtempSync(join(tmpdir(), "pharmaco-migrations-test-"));
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

// 插入 course -> class_cohort -> lesson 的最小合法链,返回各 id。
function seedScope(db, { courseId = "crs_a", classId = "cls_a", lessonId = "les_a" } = {}) {
  db.prepare("INSERT INTO courses(id, name, code, status, created_at, updated_at) VALUES (?, ?, ?, 'ACTIVE', ?, ?)")
    .run(courseId, "课程", `CODE-${courseId}`, NOW, NOW);
  db.prepare("INSERT INTO class_cohorts(id, course_id, name, academic_term, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(classId, courseId, "班级", "2026 春", NOW);
  db.prepare("INSERT INTO lessons(id, course_id, class_id, title, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(lessonId, courseId, classId, "课时", NOW);
  return { courseId, classId, lessonId };
}

function insertLessonVersion(db, { id, lessonId, versionNumber = 1, status = "DRAFT", content = "{}" }) {
  db.prepare(
    `INSERT INTO lesson_versions(id, lesson_id, version_number, status, content_json, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, 'teacher', ?)`,
  ).run(id, lessonId, versionNumber, status, content, NOW);
}

function seedClaimChain(db) {
  const { courseId, classId, lessonId } = seedScope(db);
  // 005 起 teaching_claims.workflow_instance_id 为 NOT NULL + FK,先建 workflow_instances 行。
  db.prepare(
    `INSERT INTO workflow_instances(id, workflow_type, course_id, class_id, lesson_id, current_state, state_machine_version, created_by, created_at, updated_at)
     VALUES ('wfi_1', 'S1_DIAGNOSIS', ?, ?, ?, 'DRAFT', '1.0.0', 'teacher', ?, ?)`,
  ).run(courseId, classId, lessonId, NOW, NOW);
  db.prepare(
    `INSERT INTO teaching_claims(id, claim_type, statement, stage_id, course_id, class_id, lesson_id, workflow_instance_id, confidence_status, created_by, created_at)
     VALUES ('clm_1', 'factual_claim', '原始主张', 'S1', ?, ?, ?, 'wfi_1', 'confirmed', 'teacher', ?)`,
  ).run(courseId, classId, lessonId, NOW);
  db.prepare(
    `INSERT INTO teaching_decisions(id, course_id, class_id, lesson_id, stage_id, decision_question,
       observation_claim_ids_json, inference_claim_ids_json, recommendation_claim_ids_json, evidence_ids_json,
       workflow_instance_id, created_at)
     VALUES ('dec_1', ?, ?, ?, 'S1', '问题', '[]', '[]', '[]', '[]', 'wfi_1', ?)`,
  ).run(courseId, classId, lessonId, NOW);
  return { courseId, classId, lessonId };
}

test("empty database: all migrations apply and re-running is idempotent", (t) => {
  const db = openDb(t);
  const files = runMigrations(db);
  assert.deepEqual(files, readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{3}_[a-z0-9_]+\.sql$/.test(f)).sort());

  const names = tableNames(db);
  for (const expected of [
    "schema_migrations", "workspace_states", "audit_events", "inference_events", "practice_review_cache",
    "courses", "class_cohorts", "lessons", "lesson_versions", "pretest_items", "pretest_responses",
    "runtime_observations", "knowledge_assets", "asset_versions", "content_blocks",
    "teaching_claims", "teaching_decisions", "teacher_decisions", "evidence_links", "model_runs",
    "workflow_instances", "content_blocks_fts",
  ]) {
    assert.ok(names.has(expected), `缺少表 ${expected}`);
  }

  const applied = db.prepare("SELECT name, sha256, applied_at FROM schema_migrations ORDER BY name").all();
  assert.equal(applied.length, files.length);
  for (const row of applied) {
    assert.match(row.sha256, /^[a-f0-9]{64}$/);
    assert.ok(row.applied_at.length > 0);
  }

  // audit_events 扩展列存在
  const auditCols = new Set(db.prepare("PRAGMA table_info(audit_events)").all().map((c) => c.name));
  for (const col of ["actor_type", "actor_id", "entity_type", "entity_id", "workflow_instance_id", "previous_state", "next_state", "payload_json", "event_hash", "schema_version", "metadata_json"]) {
    assert.ok(auditCols.has(col), `audit_events 缺少列 ${col}`);
  }

  // 重复执行:无效果、不报错
  runMigrations(db);
  const appliedAgain = db.prepare("SELECT COUNT(*) AS c FROM schema_migrations").get().c;
  assert.equal(appliedAgain, files.length);
  db.close();
});

test("legacy database with the original 4 tables upgrades smoothly and keeps data", (t) => {
  const db = openDb(t);
  // 模拟老库:只执行 baseline 的建表语句(不经过 runner),并写入一行真实数据
  const baselineSql = readFileSync(join(MIGRATIONS_DIR, "000_baseline.sql"), "utf8");
  db.exec(baselineSql);
  db.prepare("INSERT INTO workspace_states(workspace_id, revision, state_json, state_hash, updated_at) VALUES (?, ?, ?, ?, ?)")
    .run("default", 3, "{}", "a".repeat(64), NOW);
  assert.equal(tableNames(db).has("schema_migrations"), false);

  runMigrations(db);

  const row = db.prepare("SELECT workspace_id, revision FROM workspace_states WHERE workspace_id = 'default'").get();
  assert.equal(row.workspace_id, "default");
  assert.equal(row.revision, 3);
  const applied = db.prepare("SELECT name FROM schema_migrations ORDER BY name").all().map((r) => r.name);
  assert.ok(applied.includes("000_baseline.sql"));
  assert.equal(applied.length, readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).length);
  db.close();
});

test("runner refuses a tampered applied migration and a missing applied file", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "pharmaco-migrations-tamper-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const migrationsCopy = join(dir, "migrations");
  cpSync(MIGRATIONS_DIR, migrationsCopy, { recursive: true });

  const db = new DatabaseSync(join(dir, "test.sqlite"));
  runMigrations(db, { migrationsDir: migrationsCopy });

  // 篡改已应用的 migration 文件内容 -> 必须拒绝
  const tampered = join(migrationsCopy, "001_product_core_domain.sql");
  writeFileSync(tampered, `${readFileSync(tampered, "utf8")}\n-- tampered\n`);
  assert.throws(() => runMigrations(db, { migrationsDir: migrationsCopy }), /modified after being applied/);

  // 删除已应用的 migration 文件 -> 必须拒绝(先恢复 hash 再删另一个文件)
  cpSync(join(MIGRATIONS_DIR, "001_product_core_domain.sql"), tampered);
  rmSync(join(migrationsCopy, "004_content_search_indexes.sql"));
  assert.throws(() => runMigrations(db, { migrationsDir: migrationsCopy }), /file is missing/);
  db.close();
});

test("foreign keys are enforced", (t) => {
  const db = openDb(t);
  runMigrations(db);
  // 孤儿课时:course_id 不存在
  assert.throws(
    () => db.prepare("INSERT INTO lessons(id, course_id, title, created_at) VALUES ('les_x', 'crs_missing', '孤儿', ?)").run(NOW),
    /FOREIGN KEY/,
  );
  db.close();
});

test("class scope isolation: a lesson cannot reference a class from another course", (t) => {
  const db = openDb(t);
  runMigrations(db);
  seedScope(db, { courseId: "crs_a", classId: "cls_a", lessonId: "les_a" });
  db.prepare("INSERT INTO courses(id, name, code, status, created_at, updated_at) VALUES ('crs_b', '课程B', 'CODE-B', 'ACTIVE', ?, ?)").run(NOW, NOW);
  db.prepare("INSERT INTO class_cohorts(id, course_id, name, academic_term, created_at) VALUES ('cls_b', 'crs_b', '班级B', '2026 春', ?)").run(NOW);

  // 跨 course:lesson 属于 crs_a 却挂 crs_b 的班级 -> 复合外键拒绝
  assert.throws(
    () => db.prepare("INSERT INTO lessons(id, course_id, class_id, title, created_at) VALUES ('les_bad', 'crs_a', 'cls_b', '越界', ?)").run(NOW),
    /FOREIGN KEY/,
  );
  // 同 course 的合法组合 -> 成功
  db.prepare("INSERT INTO lessons(id, course_id, class_id, title, created_at) VALUES ('les_ok', 'crs_a', 'cls_a', '合法', ?)").run(NOW);
  // class_id 为 NULL 时只校验 course_id -> 成功
  db.prepare("INSERT INTO lessons(id, course_id, class_id, title, created_at) VALUES ('les_null', 'crs_a', NULL, '无班级', ?)").run(NOW);
  db.close();
});

test("lesson_versions UNIQUE(lesson_id, version_number) is enforced", (t) => {
  const db = openDb(t);
  runMigrations(db);
  seedScope(db);
  insertLessonVersion(db, { id: "lv_1", lessonId: "les_a", versionNumber: 1 });
  assert.throws(
    () => insertLessonVersion(db, { id: "lv_2", lessonId: "les_a", versionNumber: 1 }),
    /UNIQUE/,
  );
  // 不同 version_number 可以
  insertLessonVersion(db, { id: "lv_3", lessonId: "les_a", versionNumber: 2 });
  db.close();
});

test("PUBLISHED lesson_versions are immutable except the SUPERSEDED transition", (t) => {
  const db = openDb(t);
  runMigrations(db);
  seedScope(db);
  insertLessonVersion(db, { id: "lv_1", lessonId: "les_a", status: "PUBLISHED", content: '{"v":1}' });

  // 禁止改内容
  assert.throws(
    () => db.prepare("UPDATE lesson_versions SET content_json = '{\"v\":2}' WHERE id = 'lv_1'").run(),
    /immutable/,
  );
  // 禁止删除
  assert.throws(() => db.prepare("DELETE FROM lesson_versions WHERE id = 'lv_1'").run(), /cannot be deleted/);
  // 连带改其他字段的流转也不放行
  assert.throws(
    () => db.prepare("UPDATE lesson_versions SET status = 'SUPERSEDED', created_by = 'someone-else' WHERE id = 'lv_1'").run(),
    /immutable/,
  );
  // 唯一例外:仅 status PUBLISHED -> SUPERSEDED,其余字段不变
  db.prepare("UPDATE lesson_versions SET status = 'SUPERSEDED' WHERE id = 'lv_1'").run();
  assert.equal(db.prepare("SELECT status FROM lesson_versions WHERE id = 'lv_1'").get().status, "SUPERSEDED");
  // DRAFT 行不受限制
  insertLessonVersion(db, { id: "lv_2", lessonId: "les_a", versionNumber: 2 });
  db.prepare("UPDATE lesson_versions SET content_json = '{\"v\":2}' WHERE id = 'lv_2'").run();
  db.close();
});

test("teacher_decisions / model_runs / audit_events are append-only", (t) => {
  const db = openDb(t);
  runMigrations(db);
  seedClaimChain(db);

  db.prepare(
    "INSERT INTO teacher_decisions(id, decision_record_id, decision, reviewer_id, original_statement, decided_at) VALUES ('td_1', 'dec_1', 'accept', 't_1', '原始主张', ?)",
  ).run(NOW);
  assert.throws(() => db.prepare("UPDATE teacher_decisions SET comment = '改' WHERE id = 'td_1'").run(), /immutable/);
  assert.throws(() => db.prepare("DELETE FROM teacher_decisions WHERE id = 'td_1'").run(), /cannot be deleted/);

  db.prepare(
    `INSERT INTO model_runs(id, workflow_id, agent_id, provider, model, prompt_version, input_record_ids_json, evidence_ids_json, input_hash, started_at)
     VALUES ('run_1', 'wf_1', 'agent_1', 'mock', 'fake-model', 'pv1', '[]', '[]', 'h', ?)`,
  ).run(NOW);
  assert.throws(() => db.prepare("UPDATE model_runs SET latency_ms = 1 WHERE id = 'run_1'").run(), /append-only/);
  assert.throws(() => db.prepare("DELETE FROM model_runs WHERE id = 'run_1'").run(), /append-only/);

  db.prepare("INSERT INTO audit_events(id, event_type, workspace_id, metadata_json, created_at) VALUES ('ae_1', 'test', 'default', '{}', ?)").run(NOW);
  assert.throws(() => db.prepare("UPDATE audit_events SET event_type = 'tampered' WHERE id = 'ae_1'").run(), /append-only/);
  assert.throws(() => db.prepare("DELETE FROM audit_events WHERE id = 'ae_1'").run(), /append-only/);
  // 追加新行不受影响
  db.prepare("INSERT INTO audit_events(id, event_type, workspace_id, metadata_json, created_at) VALUES ('ae_2', 'test2', 'default', '{}', ?)").run(NOW);
  db.close();
});

test("teaching_claims statement is immutable, other fields can change", (t) => {
  const db = openDb(t);
  runMigrations(db);
  seedClaimChain(db);
  assert.throws(
    () => db.prepare("UPDATE teaching_claims SET statement = '改写后的主张' WHERE id = 'clm_1'").run(),
    /statement is immutable/,
  );
  // 非 statement 字段允许更新
  db.prepare("UPDATE teaching_claims SET validation_status = 'PASSED' WHERE id = 'clm_1'").run();
  assert.equal(db.prepare("SELECT validation_status FROM teaching_claims WHERE id = 'clm_1'").get().validation_status, "PASSED");
  db.close();
});

test("asset_versions: no DELETE and one-way source_status", (t) => {
  const db = openDb(t);
  runMigrations(db);
  db.prepare("INSERT INTO knowledge_assets(id, type, title, created_at) VALUES ('ka_1', 'policy', '集采政策', ?)").run(NOW);
  db.prepare("INSERT INTO asset_versions(id, asset_id, version, created_at) VALUES ('av_1', 'ka_1', 'v1', ?)").run(NOW);

  assert.throws(() => db.prepare("DELETE FROM asset_versions WHERE id = 'av_1'").run(), /append-only/);
  // active -> superseded 允许
  db.prepare("UPDATE asset_versions SET source_status = 'superseded' WHERE id = 'av_1'").run();
  // superseded -> active 逆向流转被拒绝
  assert.throws(
    () => db.prepare("UPDATE asset_versions SET source_status = 'active' WHERE id = 'av_1'").run(),
    /one-way/,
  );
  // 与状态无关的字段更新不受影响
  db.prepare("UPDATE asset_versions SET parser_version = 'p2' WHERE id = 'av_1'").run();
  db.close();
});

test("FTS5 derived index stays in sync with content_blocks", (t) => {
  const db = openDb(t);
  runMigrations(db);
  db.prepare("INSERT INTO knowledge_assets(id, type, title, created_at) VALUES ('ka_1', 'textbook', '教材', ?)").run(NOW);
  db.prepare("INSERT INTO asset_versions(id, asset_id, version, created_at) VALUES ('av_1', 'ka_1', 'v1', ?)").run(NOW);
  db.prepare(
    "INSERT INTO content_blocks(id, asset_version_id, block_type, order_index, content_raw, content_segmented, content_hash) VALUES ('cb_1', 'av_1', 'paragraph', 0, '集采 替代 质量', '集采 替代 质量', 'h1')",
  ).run();

  const hit = db.prepare("SELECT rowid FROM content_blocks_fts WHERE content_blocks_fts MATCH '替代'").all();
  assert.equal(hit.length, 1);
  // 更新后同步
  db.prepare("UPDATE content_blocks SET content_raw = '换药 决策', content_segmented = '换药 决策' WHERE id = 'cb_1'").run();
  assert.equal(db.prepare("SELECT rowid FROM content_blocks_fts WHERE content_blocks_fts MATCH '替代'").all().length, 0);
  assert.equal(db.prepare("SELECT rowid FROM content_blocks_fts WHERE content_blocks_fts MATCH '换药'").all().length, 1);
  db.close();
});
