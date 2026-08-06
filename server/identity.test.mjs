// 教师账号/令牌体系测试(migration 009 + identity.mjs + teachers.mjs + app.mjs 绑定)。
// 覆盖:
//   - migration 009:空库建表(STRICT/约束/索引)、老库(仅 000–008)升级、幂等;
//   - 函数层(tools/manage-teachers.mjs 同款服务函数):add/list/revoke/disable 与审计;
//   - resolveActor:有效/撤销/禁用教师/未知 token/旧静态 token/空 token;
//   - API(真实 HTTP + 临时库):教师令牌跑通裁决且审计 reviewerId=真实教师 ID;
//     body 冒充他人 reviewerId → 403 ACTOR_MISMATCH;revoke/disable 后 401;
//     旧静态 token 兼容(body 自报身份沿用);无 token(已配置静态 token)→ 401;
//     回环无静态 token 开发态维持放行。
// modelClient.chat 直接抛错:整条闭环零模型调用(无 MLX 也必须全绿)。
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createPharmacoServer } from "./app.mjs";
import { loadConfig } from "./config.mjs";
import { PharmacoDatabase } from "./db.mjs";
import { runMigrations } from "./migrations.mjs";
import { resolveActor } from "./product-core/identity.mjs";
import {
  addTeacher,
  disableTeacher,
  hashToken,
  listTeachers,
  revokeToken,
} from "./product-core/teachers.mjs";

const SERVER_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(SERVER_DIR, "..");
const MIGRATIONS_DIR = join(SERVER_DIR, "migrations");
const FIXTURE = JSON.parse(
  readFileSync(new URL("./product-core/fixtures/pretest-s1.fixture.json", import.meta.url), "utf8"),
);
const STATIC_TOKEN = "legacy-static-token";

const noModelClient = {
  async status() {
    return { ready: false, endpoint: "http://127.0.0.1:1/v1", model: "none", advertisedModels: [] };
  },
  async chat() {
    throw new Error("身份体系测试不允许调用任何模型");
  },
};

async function api(base, method, path, body, headers = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await response.json();
  return { status: response.status, body: json };
}

function bearer(token) {
  return { authorization: `Bearer ${token}` };
}

function expectError(result, status, code) {
  assert.equal(result.status, status, `期望 ${status},实际 ${result.status}: ${JSON.stringify(result.body)}`);
  assert.equal(result.body.error.code, code);
  assert.equal(typeof result.body.error.message, "string");
}

function auditEvents(db, eventType) {
  return db.prepare("SELECT * FROM audit_events WHERE event_type = ? ORDER BY created_at, rowid").all(eventType);
}

// ------------------------------------------------------------------
test("migration 009:空库建表 + 老库(000–008)平滑升级", async (t) => {
  await t.test("空库:teachers/api_tokens 为 STRICT 表,约束与索引齐全", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "pharmaco-identity-mig-fresh-"));
    t.after(() => rmSync(tempDir, { recursive: true, force: true }));
    const database = new PharmacoDatabase(tempDir);
    t.after(() => database.close());
    const db = database.db;

    const tables = new Map(
      db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table'").all().map((row) => [row.name, row.sql]),
    );
    for (const name of ["teachers", "api_tokens"]) {
      assert.ok(tables.has(name), `缺表 ${name}`);
      assert.match(tables.get(name), /STRICT/, `${name} 必须是 STRICT 表`);
    }
    assert.match(tables.get("teachers"), /CHECK \(role IN \('teacher', 'admin'\)\)/);
    assert.match(tables.get("teachers"), /CHECK \(status IN \('active', 'disabled'\)\)/);
    assert.match(tables.get("api_tokens"), /UNIQUE/);
    assert.match(tables.get("api_tokens"), /FOREIGN KEY \(teacher_id\) REFERENCES teachers\(id\)/);
    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'api_tokens'")
      .all()
      .map((row) => row.name);
    assert.ok(indexes.includes("api_tokens_teacher_active"), "缺 active token 查询索引");

    // 009 已记录且幂等:重跑无效果。
    const applied = db.prepare("SELECT name FROM schema_migrations WHERE name = '009_teachers.sql'").get();
    assert.ok(applied, "009 未记录到 schema_migrations");
    runMigrations(db);
    assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);
  });

  await t.test("老库(仅应用 000–008)升级:009 补齐,既有数据不动", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "pharmaco-identity-mig-upgrade-"));
    t.after(() => rmSync(tempDir, { recursive: true, force: true }));
    const oldDir = mkdtempSync(join(tmpdir(), "pharmaco-identity-mig-old-"));
    t.after(() => rmSync(oldDir, { recursive: true, force: true }));
    for (const name of readdirSync(MIGRATIONS_DIR).filter((entry) => entry.slice(0, 3) <= "008")) {
      cpSync(join(MIGRATIONS_DIR, name), join(oldDir, name));
    }
    const dbPath = join(tempDir, "pharmaco.sqlite");

    // 先按老版本目录迁移(模拟 008 时代的库),写入一行既有数据。
    const oldDb = new DatabaseSync(dbPath);
    oldDb.exec("PRAGMA foreign_keys = ON");
    runMigrations(oldDb, { migrationsDir: oldDir });
    assert.equal(oldDb.prepare("SELECT COUNT(*) AS n FROM schema_migrations").get().n, 9);
    assert.throws(
      () => oldDb.prepare("SELECT * FROM teachers").all(),
      /no such table/,
      "老库不应有 teachers 表",
    );
    oldDb
      .prepare("INSERT INTO workspace_states(workspace_id, revision, state_json, state_hash, updated_at) VALUES ('legacy-ws', 1, '{}', 'h', '2026-01-01T00:00:00.000Z')")
      .run();
    oldDb.close();

    // 按当前目录重跑:仅追加 009,老行原样保留。
    const upgraded = new DatabaseSync(dbPath);
    upgraded.exec("PRAGMA foreign_keys = ON");
    runMigrations(upgraded);
    assert.ok(upgraded.prepare("SELECT name FROM schema_migrations WHERE name = '009_teachers.sql'").get());
    assert.equal(upgraded.prepare("SELECT workspace_id FROM workspace_states WHERE workspace_id = 'legacy-ws'").get().workspace_id, "legacy-ws");
    assert.equal(upgraded.prepare("PRAGMA foreign_key_check").all().length, 0);
    upgraded.close();
  });
});

// ------------------------------------------------------------------
test("函数层(manage-teachers 同款):add/list/revoke/disable + 审计", async (t) => {
  const tempDir = mkdtempSync(join(tmpdir(), "pharmaco-identity-svc-"));
  const database = new PharmacoDatabase(tempDir);
  const db = database.db;
  t.after(() => {
    database.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  await t.test("add:生成教师 + 令牌,明文格式 pk_+48 位,库里只存 sha256 哈希", () => {
    const { teacher, tokenId, token } = addTeacher(db, { name: "张老师", role: "teacher", label: "试用-药理" });
    assert.match(teacher.id, /^tch_/);
    assert.equal(teacher.displayName, "张老师");
    assert.equal(teacher.role, "teacher");
    assert.equal(teacher.status, "active");
    assert.match(tokenId, /^tok_/);
    assert.match(token, /^pk_[A-Za-z0-9]{48}$/);

    const row = db.prepare("SELECT * FROM api_tokens WHERE id = ?").get(tokenId);
    assert.equal(row.token_hash, hashToken(token), "库里必须存明文的 sha256 哈希");
    assert.notEqual(row.token_hash, token);
    assert.equal(row.teacher_id, teacher.id);
    assert.equal(row.revoked_at, null);
    // 全库任意文本列都不得出现明文令牌。
    const dump = db.prepare("SELECT sql FROM sqlite_master").all().map((r) => r.sql).join("\n");
    assert.ok(!dump.includes(token), "schema 不应含明文");
    assert.equal(
      db.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE payload_json LIKE ?").get(`%${token}%`).n,
      0,
      "审计不得落明文令牌",
    );

    // 审计:teacher.created + token.created,actor_type='admin'。
    const created = auditEvents(db, "teacher.created");
    assert.equal(created.length, 1);
    assert.equal(created[0].actor_type, "admin");
    assert.equal(created[0].entity_type, "teacher");
    assert.equal(created[0].entity_id, teacher.id);
    const tokenCreated = auditEvents(db, "token.created");
    assert.equal(tokenCreated.length, 1);
    assert.equal(tokenCreated[0].entity_id, tokenId);
    assert.equal(JSON.parse(tokenCreated[0].payload_json).teacherId, teacher.id);

    // 参数校验:空名/非法 role 抛错,不落任何行。
    assert.throws(() => addTeacher(db, { name: " " }), /name 必填/);
    assert.throws(() => addTeacher(db, { name: "x", role: "superuser" }), /role 必须是/);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM teachers").get().n, 1);
  });

  await t.test("list/revoke/disable:状态流转与审计,重复操作显式报错", () => {
    const second = addTeacher(db, { name: "李老师" });
    let teachers = listTeachers(db);
    assert.equal(teachers.length, 2);
    const listed = teachers.find((row) => row.id === second.teacher.id);
    assert.equal(listed.displayName, "李老师");
    assert.equal(listed.role, "teacher", "role 缺省 teacher");
    assert.equal(listed.tokens.length, 1);
    assert.equal(listed.tokens[0].active, true);
    assert.equal(listed.tokens[0].label, null);
    assert.ok(!("tokenHash" in listed.tokens[0]), "列表不得暴露哈希");

    // revoke:置 revoked_at,行保留,审计 token.revoked。
    const { teacherId } = revokeToken(db, second.tokenId);
    assert.equal(teacherId, second.teacher.id);
    teachers = listTeachers(db);
    const revoked = teachers.find((row) => row.id === second.teacher.id).tokens[0];
    assert.equal(revoked.active, false);
    assert.ok(revoked.revokedAt);
    const revokeEvents = auditEvents(db, "token.revoked");
    assert.equal(revokeEvents.length, 1);
    assert.equal(revokeEvents[0].actor_type, "admin");
    assert.equal(revokeEvents[0].entity_id, second.tokenId);

    // 重复撤销 / 查无令牌:显式抛错。
    assert.throws(() => revokeToken(db, second.tokenId), /已撤销/);
    assert.throws(() => revokeToken(db, "tok_000000000000000000000"), /不存在/);

    // disable:status → disabled,审计带前后状态;重复禁用 / 查无教师显式抛错。
    disableTeacher(db, second.teacher.id);
    const disabled = listTeachers(db).find((row) => row.id === second.teacher.id);
    assert.equal(disabled.status, "disabled");
    const disableEvents = auditEvents(db, "teacher.disabled");
    assert.equal(disableEvents.length, 1);
    assert.equal(disableEvents[0].previous_state, "active");
    assert.equal(disableEvents[0].next_state, "disabled");
    assert.throws(() => disableTeacher(db, second.teacher.id), /已禁用/);
    assert.throws(() => disableTeacher(db, "tch_000000000000000000000"), /不存在/);
  });
});

// ------------------------------------------------------------------
test("resolveActor:有效/撤销/禁用/未知/旧静态 token/空 token", async (t) => {
  const tempDir = mkdtempSync(join(tmpdir(), "pharmaco-identity-resolve-"));
  const database = new PharmacoDatabase(tempDir);
  const db = database.db;
  t.after(() => {
    database.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  const { teacher, token } = addTeacher(db, { name: "王老师" });

  const resolved = resolveActor(db, token, { staticToken: STATIC_TOKEN });
  assert.deepEqual(resolved, {
    actorId: teacher.id,
    role: "teacher",
    displayName: "王老师",
    source: "teacher-token",
    tokenId: resolved.tokenId,
  });
  assert.match(resolved.tokenId, /^tok_/);

  assert.equal(resolveActor(db, "pk_unknown0000000000000000000000000000000000000000", { staticToken: STATIC_TOKEN }), null, "未知 token → null");
  assert.equal(resolveActor(db, STATIC_TOKEN, { staticToken: STATIC_TOKEN })?.source, "static-token");
  assert.deepEqual(
    (({ actorId, role, source }) => ({ actorId, role, source }))(resolveActor(db, STATIC_TOKEN, { staticToken: STATIC_TOKEN })),
    { actorId: "admin", role: "admin", source: "static-token" },
  );
  assert.equal(resolveActor(db, "", { staticToken: STATIC_TOKEN }), null, "空 token → null");
  // 未配置静态 token 时,旧静态 token 字符串也无特权。
  assert.equal(resolveActor(db, STATIC_TOKEN, { staticToken: "" }), null);

  revokeToken(db, resolved.tokenId);
  assert.equal(resolveActor(db, token, { staticToken: STATIC_TOKEN }), null, "撤销后 → null");

  const third = addTeacher(db, { name: "赵老师" });
  disableTeacher(db, third.teacher.id);
  assert.equal(resolveActor(db, third.token, { staticToken: STATIC_TOKEN }), null, "教师禁用后 → null");
});

// ------------------------------------------------------------------
test("API:教师令牌绑定 actor/reviewerId;静态 token 与开发态兼容", async (t) => {
  const tempDir = mkdtempSync(join(tmpdir(), "pharmaco-identity-api-"));
  const config = loadConfig({
    rootDir: resolve(PROJECT_ROOT),
    dataDir: tempDir,
    host: "127.0.0.1",
    port: 0,
    modelBaseUrl: "http://127.0.0.1:1/v1",
    modelName: "no-model",
    apiToken: STATIC_TOKEN,
  });
  const database = new PharmacoDatabase(config.dataDir);
  const db = database.db;
  const teacherA = addTeacher(db, { name: "张老师" });
  const teacherB = addTeacher(db, { name: "李老师" });
  const server = createPharmacoServer({ config, database, modelClient: noModelClient, logger: { error() {} } });
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const base = `http://127.0.0.1:${server.address().port}`;

  t.after(async () => {
    await new Promise((resolveClose) => server.close(resolveClose));
    database.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  // 带教师令牌跑一遍 建课 → TEACHER_REVIEW,body 全程不带 actorId(身份来自令牌)。
  async function runUpToTeacherReview(token, label) {
    const auth = bearer(token);
    const course = await api(base, "POST", "/api/product-core/courses", { name: `药事管理学-${label}`, code: `PHA-ID-${label}` }, auth);
    assert.equal(course.status, 201, JSON.stringify(course.body));
    const cohort = await api(base, "POST", `/api/product-core/courses/${course.body.course.id}/cohorts`, { name: `2026 级 1 班-${label}` }, auth);
    assert.equal(cohort.status, 201, JSON.stringify(cohort.body));
    const lesson = await api(base, "POST", "/api/product-core/lessons", {
      courseId: course.body.course.id, classId: cohort.body.cohort.id, title: `第 5 章 课前-${label}`,
    }, auth);
    assert.equal(lesson.status, 201, JSON.stringify(lesson.body));
    const workflow = await api(base, "POST", "/api/product-core/s1/workflows", {
      courseId: course.body.course.id, classId: cohort.body.cohort.id, lessonId: lesson.body.lesson.id,
    }, auth);
    assert.equal(workflow.status, 201, JSON.stringify(workflow.body));
    const workflowId = workflow.body.workflow.id;
    for (const [action, payload] of [
      ["input", { fixture: FIXTURE }],
      ["compute-facts", {}],
      ["generate-claims", {}],
      ["validate", {}],
    ]) {
      const result = await api(base, "POST", `/api/product-core/s1/workflows/${workflowId}/${action}`, payload, auth);
      assert.equal(result.status, 200, `${action}: ${JSON.stringify(result.body)}`);
    }
    return { workflowId, courseId: course.body.course.id };
  }

  await t.test("教师令牌:裁决审计 reviewerId=真实教师 ID;body 可省略身份字段", async () => {
    const { workflowId } = await runUpToTeacherReview(teacherA.token, "a");

    // 组织数据归到令牌身份(工作流 created_by = 教师 ID,而非自报文本)。
    assert.equal(
      db.prepare("SELECT created_by FROM workflow_instances WHERE id = ?").get(workflowId).created_by,
      teacherA.teacher.id,
    );

    const view = await api(base, "GET", `/api/product-core/s1/workflows/${workflowId}`, undefined, bearer(teacherA.token));
    assert.equal(view.status, 200, JSON.stringify(view.body).slice(0, 300));
    const record = view.body.decisionRecords[0];

    // body 不带 reviewerId → 用令牌身份裁决。
    const decided = await api(base, "POST", `/api/product-core/s1/decision-records/${record.id}/decisions`, { decision: "accept" }, bearer(teacherA.token));
    assert.equal(decided.status, 201, JSON.stringify(decided.body));
    assert.equal(decided.body.effective.reviewerId, teacherA.teacher.id);
    assert.equal(
      db.prepare("SELECT reviewer_id FROM teacher_decisions WHERE decision_record_id = ?").get(record.id).reviewer_id,
      teacherA.teacher.id,
    );
    const audit = db
      .prepare("SELECT * FROM audit_events WHERE event_type = 'teacher.decision.recorded' AND entity_id = ?")
      .get(record.id);
    assert.ok(audit, "缺 teacher.decision.recorded 审计");
    assert.equal(audit.actor_id, teacherA.teacher.id, "审计 actor_id 必须是真实教师 ID");
    assert.equal(audit.actor_type, "teacher");

    // body 显式带一致 reviewerId → 同样放行。
    const secondRecord = view.body.decisionRecords[1];
    const consistent = await api(base, "POST", `/api/product-core/s1/decision-records/${secondRecord.id}/decisions`, {
      decision: "accept", reviewerId: teacherA.teacher.id,
    }, bearer(teacherA.token));
    assert.equal(consistent.status, 201, JSON.stringify(consistent.body));
  });

  await t.test("教师令牌:body 冒充他人 reviewerId → 403 ACTOR_MISMATCH", async () => {
    const { workflowId } = await runUpToTeacherReview(teacherA.token, "a2");
    const view = await api(base, "GET", `/api/product-core/s1/workflows/${workflowId}`, undefined, bearer(teacherA.token));
    const record = view.body.decisionRecords[0];

    const mismatch = await api(base, "POST", `/api/product-core/s1/decision-records/${record.id}/decisions`, {
      decision: "accept", reviewerId: teacherB.teacher.id,
    }, bearer(teacherA.token));
    expectError(mismatch, 403, "ACTOR_MISMATCH");
    assert.equal(mismatch.body.error.details.tokenActorId, teacherA.teacher.id);
    // 冒充未落库:该 TDR 仍无裁决。
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM teacher_decisions WHERE decision_record_id = ?").get(record.id).n, 0);

    // 自由文本冒充(老习惯写法)同样 403。
    const freeText = await api(base, "POST", `/api/product-core/s1/decision-records/${record.id}/decisions`, {
      decision: "accept", reviewerId: "teacher-e2e",
    }, bearer(teacherA.token));
    expectError(freeText, 403, "ACTOR_MISMATCH");

    // 建课 body 带他人 actorId 也 403。
    const courseMismatch = await api(base, "POST", "/api/product-core/courses", {
      name: "冒充课", code: "FAKE-1", actorId: teacherB.teacher.id,
    }, bearer(teacherA.token));
    expectError(courseMismatch, 403, "ACTOR_MISMATCH");
  });

  await t.test("revoke / disable 后:教师令牌一律 401", async () => {
    const { workflowId } = await runUpToTeacherReview(teacherB.token, "b");
    const okBefore = await api(base, "GET", `/api/product-core/s1/workflows/${workflowId}`, undefined, bearer(teacherB.token));
    assert.equal(okBefore.status, 200);

    revokeToken(db, teacherB.tokenId);
    expectError(await api(base, "GET", `/api/product-core/s1/workflows/${workflowId}`, undefined, bearer(teacherB.token)), 401, "UNAUTHORIZED");
    expectError(
      await api(base, "POST", `/api/product-core/s1/decision-records/tdr_x/decisions`, { decision: "accept" }, bearer(teacherB.token)),
      401, "UNAUTHORIZED",
    );

    disableTeacher(db, teacherB.teacher.id);
    const third = addTeacher(db, { name: "赵老师" });
    disableTeacher(db, third.teacher.id);
    expectError(await api(base, "GET", "/api/product-core/kb/units", undefined, bearer(third.token)), 401, "UNAUTHORIZED");
    expectError(await api(base, "GET", "/api/product-core/kb/units", undefined, bearer("pk_nope0000000000000000000000000000000000000000")), 401, "UNAUTHORIZED");
    expectError(await api(base, "GET", "/api/product-core/kb/units"), 401, "UNAUTHORIZED");
  });

  await t.test("旧静态 token 兼容:读写放行,body 自报身份沿用(不绑定)", async () => {
    // 只读 GET。
    const list = await api(base, "GET", "/api/product-core/kb/units", undefined, bearer(STATIC_TOKEN));
    assert.equal(list.status, 200);

    // 写操作:body 自报 actorId 仍是自由文本(兼容现有单 token 部署)。
    const course = await api(base, "POST", "/api/product-core/courses", {
      name: "静态令牌课", code: "LEGACY-1", actorId: "teacher-legacy",
    }, bearer(STATIC_TOKEN));
    assert.equal(course.status, 201, JSON.stringify(course.body));
    const legacyAudit = db
      .prepare("SELECT actor_id FROM audit_events WHERE event_type = 'course.created' AND entity_id = ?")
      .get(course.body.course.id);
    assert.equal(legacyAudit.actor_id, "teacher-legacy", "旧静态 token 下自报身份沿用");

    // body 未提供身份 → 用 admin 身份。
    const adminCourse = await api(base, "POST", "/api/product-core/courses", { name: "静态令牌课2", code: "LEGACY-2" }, bearer(STATIC_TOKEN));
    assert.equal(adminCourse.status, 201, JSON.stringify(adminCourse.body));
    const adminAudit = db
      .prepare("SELECT actor_id FROM audit_events WHERE event_type = 'course.created' AND entity_id = ?")
      .get(adminCourse.body.course.id);
    assert.equal(adminAudit.actor_id, "admin");
  });

  await t.test("x-pharmaco-token 头与 Bearer 等效", async () => {
    const result = await api(base, "GET", "/api/product-core/kb/units", undefined, { "x-pharmaco-token": teacherA.token });
    assert.equal(result.status, 200);
  });
});

// ------------------------------------------------------------------
test("回环开发态(未配置静态 token):无令牌请求维持现行放行", async (t) => {
  const tempDir = mkdtempSync(join(tmpdir(), "pharmaco-identity-dev-"));
  const config = loadConfig({
    rootDir: resolve(PROJECT_ROOT),
    dataDir: tempDir,
    host: "127.0.0.1",
    port: 0,
    modelBaseUrl: "http://127.0.0.1:1/v1",
    modelName: "no-model",
  });
  const database = new PharmacoDatabase(config.dataDir);
  const server = createPharmacoServer({ config, database, modelClient: noModelClient, logger: { error() {} } });
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const base = `http://127.0.0.1:${server.address().port}`;

  t.after(async () => {
    await new Promise((resolveClose) => server.close(resolveClose));
    database.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  // 无 token:自报身份沿用(既有行为不变)。
  const course = await api(base, "POST", "/api/product-core/courses", { name: "开发态课", code: "DEV-1", actorId: "teacher-dev" });
  assert.equal(course.status, 201, JSON.stringify(course.body));
  const units = await api(base, "GET", "/api/product-core/kb/units");
  assert.equal(units.status, 200);
});
