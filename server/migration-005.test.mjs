// migration 005(teaching_claims 补 workflow_instance_id)专项测试。
// 覆盖:
//   1. 正例:002 结构老库(000-004 已应用)上跑 005 —— 列/回填/FK/触发器/索引/数据保留/幂等;
//   2. 负例:存在无法解析 workflow 的旧 claim(含幽灵 workflow 引用)—— 005 必须失败且库保持原状;
//   3. 服务层:005 之后新建 claim 带 workflow_instance_id,supersede 继承轮次,
//      新审计事件(input.imported/facts.computed/claim.created/mechanical/semantic/teacher.*/version.published)
//      维度齐全(workflow_instance_id/entity/actor/schema_version,payload 带 courseId)。
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { runMigrations } from "./migrations.mjs";
import { PharmacoDatabase } from "./db.mjs";
import {
  runDiagnosisUpToTeacherReview,
  setupOrganization,
  startS1Workflow,
} from "./product-core/s1-service.mjs";
import {
  listDecisionRecords,
  recordClaimId,
  submitTeacherDecision,
} from "./product-core/decisions.mjs";
import { publishS1 } from "./product-core/publish.mjs";

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "migrations");
const M005 = "005_teaching_claims_workflow.sql";
const NOW = "2026-08-03T00:00:00.000Z";
const FIXTURE = JSON.parse(
  readFileSync(new URL("./product-core/fixtures/pretest-s1.fixture.json", import.meta.url), "utf8"),
);
const SYSTEM = { actorType: "system", actorId: "test-system" };
const TEACHER = { actorType: "teacher", actorId: "teacher-01" };

// 建一个只含 000-004 的 migrations 目录(002 结构的老 teaching_claims)。
function makeLegacyMigrationsDir(t) {
  const dir = mkdtempSync(join(tmpdir(), "pharmaco-m005-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const migrationsCopy = join(dir, "migrations");
  cpSync(MIGRATIONS_DIR, migrationsCopy, { recursive: true });
  rmSync(join(migrationsCopy, M005));
  return { dir, migrationsCopy };
}

function openLegacyDb(t) {
  const { dir, migrationsCopy } = makeLegacyMigrationsDir(t);
  const db = new DatabaseSync(join(dir, "legacy.sqlite"));
  db.exec("PRAGMA foreign_keys = ON;");
  runMigrations(db, { migrationsDir: migrationsCopy });
  // 005 尚未应用:teaching_claims 仍是 002 结构
  assert.ok(
    !db.prepare("PRAGMA table_info(teaching_claims)").all().some((c) => c.name === "workflow_instance_id"),
    "前置假设失败:老库不应有 workflow_instance_id 列",
  );
  return { db, migrationsCopy };
}

function apply005(db, migrationsCopy) {
  cpSync(join(MIGRATIONS_DIR, M005), join(migrationsCopy, M005));
  runMigrations(db, { migrationsDir: migrationsCopy });
}

// 在老库(002 结构)里播种:scope + workflow + model_run + 两条 claim(规则生成/教师修订)+ TDR + 证据。
// opts.orphan: 追加一条任何路径都解析不到 workflow 的孤儿 claim;
// opts.ghostRun: model_run 指向不存在的 workflow_instances 行(幽灵引用)。
function seedLegacyClaims(db, { orphan = false, ghostRun = false } = {}) {
  db.prepare("INSERT INTO courses(id, name, code, status, created_at, updated_at) VALUES ('crs_a', '课程', 'CODE-A', 'ACTIVE', ?, ?)").run(NOW, NOW);
  db.prepare("INSERT INTO class_cohorts(id, course_id, name, academic_term, created_at) VALUES ('cls_a', 'crs_a', '班级', '2026 春', ?)").run(NOW);
  db.prepare("INSERT INTO lessons(id, course_id, class_id, title, created_at) VALUES ('les_a', 'crs_a', 'cls_a', '课时', ?)").run(NOW);
  db.prepare(
    `INSERT INTO workflow_instances(id, workflow_type, course_id, class_id, lesson_id, current_state, state_machine_version, created_by, created_at, updated_at)
     VALUES ('wfi_1', 'S1_DIAGNOSIS', 'crs_a', 'cls_a', 'les_a', 'DRAFT', '1.0.0', 'teacher', ?, ?)`,
  ).run(NOW, NOW);
  db.prepare(
    `INSERT INTO model_runs(id, workflow_id, agent_id, provider, model, prompt_version, input_record_ids_json, evidence_ids_json, input_hash, started_at)
     VALUES ('mrn_1', ?, 'agt_rule-s1', 'mock', 'rule-based-generator', 's1-rules-1.0.0', '[]', '[]', 'h', ?)`,
  ).run(ghostRun ? "wfi_ghost" : "wfi_1", NOW);
  // 路径 1:created_from_model_run_id -> model_runs.workflow_id
  db.prepare(
    `INSERT INTO teaching_claims(id, claim_type, statement, stage_id, course_id, class_id, lesson_id, confidence_status, created_by, created_from_model_run_id, created_at)
     VALUES ('clm_model', 'factual_claim', '规则生成主张', 'S1', 'crs_a', 'cls_a', 'les_a', 'confirmed', 'rule', 'mrn_1', ?)`,
  ).run(NOW);
  // 路径 2:教师修订(created_from_model_run_id 为 NULL),经 TDR 的 claim 引用反查
  db.prepare(
    `INSERT INTO teaching_claims(id, claim_type, statement, stage_id, course_id, class_id, lesson_id, confidence_status, created_by, supersedes_claim_id, created_at)
     VALUES ('clm_teacher', 'factual_claim', '教师修订主张', 'S1', 'crs_a', 'cls_a', 'les_a', 'confirmed', 'teacher', 'clm_model', ?)`,
  ).run(NOW);
  db.prepare(
    `INSERT INTO teaching_decisions(id, course_id, class_id, lesson_id, stage_id, decision_question,
       observation_claim_ids_json, inference_claim_ids_json, recommendation_claim_ids_json, evidence_ids_json,
       workflow_instance_id, created_at)
     VALUES ('tdr_1', 'crs_a', 'cls_a', 'les_a', 'S1', '问题', '["clm_teacher"]', '[]', '[]', '[]', 'wfi_1', ?)`,
  ).run(NOW);
  db.prepare(
    `INSERT INTO evidence_links(id, claim_id, evidence_type, source_id, retrieved_at)
     VALUES ('ev_1', 'clm_model', 'runtime_observation', 'obs_x', ?)`,
  ).run(NOW);
  if (orphan) {
    db.prepare(
      `INSERT INTO teaching_claims(id, claim_type, statement, stage_id, course_id, class_id, lesson_id, confidence_status, created_by, created_at)
       VALUES ('clm_orphan', 'factual_claim', '孤儿主张', 'S1', 'crs_a', 'cls_a', 'les_a', 'confirmed', 'teacher', ?)`,
    ).run(NOW);
  }
}

test("005: 老库(002 结构)升级 —— 列/回填/FK/触发器/索引/数据保留/幂等", (t) => {
  const { db, migrationsCopy } = openLegacyDb(t);
  seedLegacyClaims(db);

  apply005(db, migrationsCopy);

  // 新列存在且 NOT NULL,FK 指向 workflow_instances
  const col = db.prepare("PRAGMA table_info(teaching_claims)").all().find((c) => c.name === "workflow_instance_id");
  assert.ok(col, "缺少 workflow_instance_id 列");
  assert.equal(col.notnull, 1);
  const fk = db.prepare("PRAGMA foreign_key_list(teaching_claims)").all().find((f) => f.from === "workflow_instance_id");
  assert.ok(fk, "缺少 workflow_instance_id 外键");
  assert.equal(fk.table, "workflow_instances");

  // 回填:两条路径都解析到 wfi_1
  const rows = db
    .prepare("SELECT id, workflow_instance_id FROM teaching_claims ORDER BY id")
    .all()
    .map((r) => ({ id: r.id, workflow_instance_id: r.workflow_instance_id }));
  assert.deepEqual(rows, [
    { id: "clm_model", workflow_instance_id: "wfi_1" },
    { id: "clm_teacher", workflow_instance_id: "wfi_1" },
  ]);

  // 数据保留:行数、supersede 链、证据行不变
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM teaching_claims").get().n, 2);
  assert.equal(db.prepare("SELECT supersedes_claim_id FROM teaching_claims WHERE id = 'clm_teacher'").get().supersedes_claim_id, "clm_model");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM evidence_links").get().n, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM teaching_decisions").get().n, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM model_runs").get().n, 1);

  // 引用完整性:全库 fk_check 干净(FK-off 窗口未留下任何违例)
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);

  // 索引:004 的旧索引原样重建 + 两个 workflow 新索引
  const indexes = new Set(
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'teaching_claims'").all().map((r) => r.name),
  );
  for (const name of ["teaching_claims_lesson_type", "teaching_claims_workflow", "teaching_claims_workflow_type"]) {
    assert.ok(indexes.has(name), `缺少索引 ${name}`);
  }

  // 旧触发器仍在:statement 不可改;非 statement 字段可改
  assert.throws(
    () => db.prepare("UPDATE teaching_claims SET statement = '改写' WHERE id = 'clm_model'").run(),
    /statement is immutable/,
  );
  db.prepare("UPDATE teaching_claims SET validation_status = 'PASSED' WHERE id = 'clm_model'").run();

  // 迁移期守卫触发器不残留在最终 schema
  const triggers = db.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'teaching_claims'").all().map((r) => r.name);
  assert.deepEqual(triggers, ["teaching_claims_statement_immutable"]);

  // 新 FK 生效:幽灵 workflow 的新 claim 被拒
  assert.throws(
    () =>
      db.prepare(
        `INSERT INTO teaching_claims(id, claim_type, statement, stage_id, course_id, class_id, lesson_id, workflow_instance_id, confidence_status, created_by, created_at)
         VALUES ('clm_bad', 'factual_claim', 'x', 'S1', 'crs_a', 'cls_a', 'les_a', 'wfi_ghost', 'confirmed', 'teacher', ?)`,
      ).run(NOW),
    /FOREIGN KEY/,
  );

  // 迁移记录 + 幂等:二次执行无效果;外键 enforcement 已恢复
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM schema_migrations WHERE name = ?").get(M005).n, 1);
  runMigrations(db, { migrationsDir: migrationsCopy });
  assert.equal(db.prepare("PRAGMA foreign_keys").get().foreign_keys, 1);
  db.close();
});

test("005 负例:无法解析 workflow 的旧 claim -> 迁移失败且库保持原状", (t) => {
  const { db, migrationsCopy } = openLegacyDb(t);
  seedLegacyClaims(db, { orphan: true });

  assert.throws(
    () => apply005(db, migrationsCopy),
    /005_teaching_claims_workflow: 存在无法解析 workflow_instance_id 的旧 claim/,
  );

  // 事务回滚:无新列、行数不变、005 未记录、FK enforcement 已恢复
  assert.ok(!db.prepare("PRAGMA table_info(teaching_claims)").all().some((c) => c.name === "workflow_instance_id"));
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM teaching_claims").get().n, 3);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM schema_migrations WHERE name = ?").get(M005).n, 0);
  assert.equal(db.prepare("PRAGMA foreign_keys").get().foreign_keys, 1);
  db.close();
});

test("005 负例:回填值为幽灵 workflow 引用 -> 迁移失败且库保持原状", (t) => {
  const { db, migrationsCopy } = openLegacyDb(t);
  seedLegacyClaims(db, { ghostRun: true });

  assert.throws(
    () => apply005(db, migrationsCopy),
    /005_teaching_claims_workflow: 存在无法解析 workflow_instance_id 的旧 claim/,
  );
  assert.ok(!db.prepare("PRAGMA table_info(teaching_claims)").all().some((c) => c.name === "workflow_instance_id"));
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM schema_migrations WHERE name = ?").get(M005).n, 0);
  db.close();
});

test("005 之后服务层:claim 带 workflow_instance_id,supersede 继承,审计事件维度齐全", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "pharmaco-m005-svc-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const pdb = new PharmacoDatabase(dir);
  const db = pdb.db;
  try {
    const org = setupOrganization(db, {
      courseName: "临床药物治疗学",
      courseCode: "CLIN-PHARM-01",
      cohortName: "2026 秋 1 班",
      academicTerm: "2026-autumn",
      lessonTitle: "第 3 讲 药物相互作用",
      actorContext: SYSTEM,
    });
    const workflow = startS1Workflow(db, { ...org, createdBy: "teacher-01", actorContext: SYSTEM });
    const workflowId = workflow.id;

    await runDiagnosisUpToTeacherReview(db, { workflowId, fixture: FIXTURE, actorContext: SYSTEM });

    // 全部 claim 归属本轮 workflow
    const claims = db.prepare("SELECT id, workflow_instance_id FROM teaching_claims").all();
    assert.ok(claims.length > 0);
    for (const claim of claims) assert.equal(claim.workflow_instance_id, workflowId);

    // 一条 inference 走 revise(触发 supersede),其余 accept,然后发布
    const records = listDecisionRecords(db, workflowId);
    let revised = false;
    for (const record of records) {
      const claim = db.prepare("SELECT * FROM teaching_claims WHERE id = ?").get(recordClaimId(record));
      if (!revised && claim.claim_type === "diagnostic_inference") {
        await submitTeacherDecision(db, {
          decisionRecordId: record.id,
          decision: "revise",
          reviewerId: "teacher-01",
          editedStatement: "教师修订后的诊断表述(证据支撑范围内)。",
          actorContext: TEACHER,
        });
        revised = true;
      } else {
        await submitTeacherDecision(db, {
          decisionRecordId: record.id,
          decision: "accept",
          reviewerId: "teacher-01",
          actorContext: TEACHER,
        });
      }
    }
    assert.ok(revised, "fixture 应产生至少一条 diagnostic_inference");

    // supersede:新 claim 继承原 claim 的 workflow
    const superseded = db.prepare("SELECT superseded_by FROM teaching_claims WHERE superseded_by IS NOT NULL").get();
    assert.ok(superseded, "revise 应产生 supersede 链");
    const newClaim = db.prepare("SELECT workflow_instance_id FROM teaching_claims WHERE id = ?").get(superseded.superseded_by);
    assert.equal(newClaim.workflow_instance_id, workflowId);

    publishS1(db, { workflowInstanceId: workflowId, actorContext: TEACHER });

    // 审计维度:列出的事件全部 workflow_instance_id 非空且归本轮,entity/actor/schema_version 齐全
    const withCourse = [
      "input.imported",
      "facts.computed",
      "claim.created",
      "mechanical.validation.completed",
      "semantic.review.completed",
      "teacher.decision.recorded",
      "teacher.accepted",
      "teacher.revised",
      "version.published",
    ];
    for (const eventType of withCourse) {
      const rows = db.prepare("SELECT * FROM audit_events WHERE event_type = ?").all(eventType);
      assert.ok(rows.length > 0, `缺少审计事件 ${eventType}`);
      for (const row of rows) {
        assert.equal(row.workflow_instance_id, workflowId, `${eventType} 缺 workflow_instance_id`);
        assert.ok(row.entity_type && row.entity_id, `${eventType} 缺 entity 维度`);
        assert.ok(row.actor_type && row.actor_id, `${eventType} 缺 actor 维度`);
        assert.equal(row.schema_version, "1.0.0", `${eventType} schema_version 异常`);
        assert.equal(JSON.parse(row.payload_json).courseId, org.courseId, `${eventType} payload 缺 courseId`);
      }
    }
    // inputs.submitted(转移级事件)同样带 workflow 维度
    const submitted = db.prepare("SELECT * FROM audit_events WHERE event_type = 'inputs.submitted'").all();
    assert.equal(submitted.length, 1);
    assert.equal(submitted[0].workflow_instance_id, workflowId);
  } finally {
    pdb.close();
  }
});
