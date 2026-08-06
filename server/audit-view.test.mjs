// 审计读时规范视图(eventNameCanonical 1.0)单元测试 + 路由级集成断言。
// 视图逻辑不碰库:构造 camelCase 行直接过 canonicalizeAuditEvents。
// 集成段走真实 HTTP 服务 + 临时 DB(与 s1-e2e 同口径),验证 /audit 路由已挂规范视图。
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { createPharmacoServer } from "./app.mjs";
import { loadConfig } from "./config.mjs";
import { PharmacoDatabase } from "./db.mjs";
import {
  AUDIT_EVENT_ALIASES,
  AUDIT_VIEW_VERSION,
  canonicalEventType,
  canonicalizeAuditEvents,
} from "./product-core/audit-view.mjs";

let seq = 0;
function row(overrides) {
  seq += 1;
  return {
    id: `aud_${String(seq).padStart(4, "0")}`,
    eventType: "workflow.created",
    actorType: "teacher",
    actorId: "teacher-01",
    entityType: "workflow_instance",
    entityId: "wf_1",
    workflowInstanceId: "wf_1",
    previousState: null,
    nextState: null,
    payload: null,
    eventHash: "0".repeat(64),
    createdAt: "2026-08-06T07:00:00.000Z",
    ...overrides,
  };
}

test("映射表:别名收敛到规范名,未知名原样", () => {
  assert.equal(canonicalEventType("inputs.submitted"), "input.imported");
  assert.equal(canonicalEventType("observation.computed"), "facts.computed");
  assert.equal(canonicalEventType("lesson.published"), "version.published");
  assert.equal(canonicalEventType("teacher.accepted"), "teacher.decision.recorded");
  assert.equal(canonicalEventType("teacher.revised"), "teacher.decision.recorded");
  assert.equal(canonicalEventType("teacher.rejected"), "teacher.decision.recorded");
  assert.equal(canonicalEventType("teacher.deferred"), "teacher.decision.recorded");
  assert.equal(canonicalEventType("gate.mechanical.completed"), "mechanical.validation.completed");
  assert.equal(canonicalEventType("review.semantic.completed"), "semantic.review.completed");
  // 规范名与未知名都不变
  assert.equal(canonicalEventType("input.imported"), "input.imported");
  assert.equal(canonicalEventType("workflow.created"), "workflow.created");
  assert.equal(canonicalEventType("some.future.event"), "some.future.event");
  // 表内不出现链式映射(别名的规范名本身不得再是别名)
  for (const canonical of Object.values(AUDIT_EVENT_ALIASES)) {
    assert.equal(AUDIT_EVENT_ALIASES[canonical], undefined, `规范名 ${canonical} 不得再是别名`);
  }
});

test("双名折叠:input.imported + inputs.submitted 同一秒同 workflow 折成一条", () => {
  const imported = row({
    id: "aud_a",
    eventType: "input.imported",
    entityType: "lesson",
    entityId: "les_1",
    payload: { itemCount: 5, responseCount: 100, studentCount: 25, courseId: "crs_1" },
  });
  const submitted = row({
    id: "aud_b",
    eventType: "inputs.submitted",
    previousState: "DRAFT",
    nextState: "INPUT_READY",
    payload: { action: "markInputReady" },
  });
  const [merged] = canonicalizeAuditEvents([imported, submitted]);
  assert.equal(merged.eventType, "input.imported");
  assert.equal(merged.aliasCount, 1);
  // 主事件是规范名成员,payload 原样保留
  assert.equal(merged.id, "aud_a");
  assert.deepEqual(merged.payload, imported.payload);
  assert.equal(merged.originalEventType, undefined);
  // 别名行进入 aliases,额外键记入 payloadExtra
  assert.equal(merged.aliases[0].eventType, "inputs.submitted");
  assert.equal(merged.aliases[0].id, "aud_b");
  assert.deepEqual(merged.aliases[0].payloadExtra, { action: "markInputReady" });
});

test("双名折叠:observation.computed ×N + facts.computed 折成一条汇总事件", () => {
  const obs1 = row({ id: "aud_o1", eventType: "observation.computed", entityType: "runtime_observation", entityId: "obs_1", payload: { metric: "m1", lessonId: "les_1" } });
  const obs2 = row({ id: "aud_o2", eventType: "observation.computed", entityType: "runtime_observation", entityId: "obs_2", payload: { metric: "m2", lessonId: "les_1" } });
  const facts = row({ id: "aud_f", eventType: "facts.computed", entityType: "lesson", entityId: "les_1", payload: { lessonId: "les_1", writtenCount: 2, metricCount: 2 } });
  const events = canonicalizeAuditEvents([obs1, obs2, facts]);
  assert.equal(events.length, 1);
  assert.equal(events[0].eventType, "facts.computed");
  assert.equal(events[0].id, "aud_f");
  assert.equal(events[0].aliasCount, 2);
  assert.deepEqual(
    events[0].aliases.map((a) => a.entityId),
    ["obs_1", "obs_2"],
  );
  // 别名行的 metric 是主事件 payload 没有的额外键
  assert.deepEqual(events[0].aliases[0].payloadExtra, { metric: "m1" });
});

test("双名折叠:version.published 优先于 lesson.published 作主事件", () => {
  const lessonPub = row({ id: "aud_lp", eventType: "lesson.published", entityType: "lesson", entityId: "les_1", payload: { lessonVersionId: "lv_1", versionNumber: 1 } });
  const versionPub = row({ id: "aud_vp", eventType: "version.published", entityType: "lesson_version", entityId: "lv_1", payload: { lessonVersionId: "lv_1", versionNumber: 1, lessonId: "les_1" } });
  const [merged] = canonicalizeAuditEvents([lessonPub, versionPub]);
  assert.equal(merged.eventType, "version.published");
  assert.equal(merged.id, "aud_vp");
  assert.equal(merged.aliasCount, 1);
  assert.equal(merged.aliases[0].eventType, "lesson.published");
});

test("双名折叠:teacher.accepted 等动作名折入 teacher.decision.recorded", () => {
  const recorded = row({ id: "aud_r", eventType: "teacher.decision.recorded", entityType: "teaching_decision", entityId: "tdr_1", payload: { decision: "accept", teacherDecisionId: "tdec_1" } });
  const accepted = row({ id: "aud_s", eventType: "teacher.accepted", entityType: "teaching_decision", entityId: "tdr_1", payload: { decision: "accept", teacherDecisionId: "tdec_1" } });
  const [merged] = canonicalizeAuditEvents([recorded, accepted]);
  assert.equal(merged.eventType, "teacher.decision.recorded");
  assert.equal(merged.aliasCount, 1);
  assert.equal(merged.aliases[0].eventType, "teacher.accepted");
  // payload 完全一致的别名行不产生 payloadExtra
  assert.equal(merged.aliases[0].payloadExtra, undefined);
});

test("别名优选:组内无规范名成员时取 payload 更全者,并记 originalEventType", () => {
  const thin = row({ id: "aud_t", eventType: "observation.computed", entityId: "obs_1", payload: { metric: "m1" } });
  const full = row({ id: "aud_u", eventType: "observation.computed", entityId: "obs_2", payload: { metric: "m2", lessonId: "les_1", courseId: "crs_1" } });
  const [merged] = canonicalizeAuditEvents([thin, full]);
  assert.equal(merged.eventType, "facts.computed");
  assert.equal(merged.id, "aud_u");
  assert.equal(merged.originalEventType, "observation.computed");
  assert.equal(merged.aliasCount, 1);
  assert.equal(merged.aliases[0].id, "aud_t");
});

test("落单别名:旧数据只有别名名也规范化为规范名", () => {
  const lone = row({ id: "aud_l", eventType: "inputs.submitted", payload: { action: "markInputReady" } });
  const [merged] = canonicalizeAuditEvents([lone]);
  assert.equal(merged.eventType, "input.imported");
  assert.equal(merged.originalEventType, "inputs.submitted");
  assert.equal(merged.aliasCount, 0);
  assert.deepEqual(merged.aliases, []);
});

test("单名事件不受影响:原对象原样通过,不新增字段", () => {
  const created = row({ id: "aud_c", eventType: "workflow.created" });
  const claim = row({ id: "aud_cl", eventType: "claim.created", entityType: "teaching_claim", entityId: "clm_1" });
  const transitioned = row({ id: "aud_tr", eventType: "workflow.transitioned", previousState: "DRAFT", nextState: "INPUT_READY" });
  const events = canonicalizeAuditEvents([created, claim, transitioned]);
  assert.deepEqual(events, [created, claim, transitioned]);
  assert.equal(events[0], created); // 引用不变
  assert.equal("aliasCount" in events[0], false);
});

test("裁决组 fold=entity:同秒不同裁决记录保持独立,各自的双名对折叠", () => {
  const members = [];
  for (const [index, action] of ["accept", "revise", "reject", "defer"].entries()) {
    const tdr = `tdr_${index}`;
    members.push(row({ id: `aud_r${index}`, eventType: "teacher.decision.recorded", entityType: "teaching_decision", entityId: tdr, payload: { decision: action } }));
    members.push(row({ id: `aud_a${index}`, eventType: `teacher.${action === "accept" ? "accepted" : action === "revise" ? "revised" : action === "reject" ? "rejected" : "deferred"}`, entityType: "teaching_decision", entityId: tdr, payload: { decision: action } }));
  }
  const events = canonicalizeAuditEvents(members);
  assert.equal(events.length, 4);
  for (const [index, event] of events.entries()) {
    assert.equal(event.eventType, "teacher.decision.recorded");
    assert.equal(event.entityId, `tdr_${index}`);
    assert.equal(event.aliasCount, 1);
  }
});

test("未知事件名原样保留:不折叠、不改名、不吞", () => {
  const unknown1 = row({ id: "aud_x1", eventType: "plugin.custom.fired" });
  const unknown2 = row({ id: "aud_x2", eventType: "plugin.custom.fired" }); // 同名同秒也不折
  const events = canonicalizeAuditEvents([unknown1, unknown2]);
  assert.deepEqual(events, [unknown1, unknown2]);
});

test("折叠边界:跨秒 / 跨 workflow 不折叠", () => {
  const a = row({ id: "aud_s1", eventType: "input.imported", createdAt: "2026-08-06T07:00:00.900Z" });
  const b = row({ id: "aud_s2", eventType: "inputs.submitted", createdAt: "2026-08-06T07:00:01.100Z" });
  const acrossSeconds = canonicalizeAuditEvents([a, b]);
  assert.equal(acrossSeconds.length, 2);
  assert.equal(acrossSeconds[0].eventType, "input.imported");
  assert.equal(acrossSeconds[1].eventType, "input.imported"); // 落单别名也规范化
  assert.equal(acrossSeconds[1].originalEventType, "inputs.submitted");

  const c = row({ id: "aud_w1", eventType: "input.imported", workflowInstanceId: "wf_1" });
  const d = row({ id: "aud_w2", eventType: "inputs.submitted", workflowInstanceId: "wf_2", entityId: "wf_2" });
  assert.equal(canonicalizeAuditEvents([c, d]).length, 2);
});

test("无 workflow 维度的旧行退化为按 entity_id 归集折叠", () => {
  const recorded = row({ id: "aud_1", eventType: "teacher.decision.recorded", workflowInstanceId: null, entityType: "teaching_decision", entityId: "tdr_9" });
  const accepted = row({ id: "aud_2", eventType: "teacher.accepted", workflowInstanceId: null, entityType: "teaching_decision", entityId: "tdr_9" });
  const events = canonicalizeAuditEvents([recorded, accepted]);
  assert.equal(events.length, 1);
  assert.equal(events[0].eventType, "teacher.decision.recorded");
  assert.equal(events[0].aliasCount, 1);
});

// ---------- 路由级集成:GET .../audit 已挂规范视图并带版本标记 ----------
const noModelClient = {
  async status() {
    return { ready: false, endpoint: "http://127.0.0.1:1/v1", model: "none", advertisedModels: [] };
  },
  async chat() {
    throw new Error("规范视图集成测试不允许调用任何模型");
  },
};

async function api(base, method, path, body) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json() };
}

test("路由集成:导入前测后 /audit 返回规范视图(eventNameCanonical + 折叠)", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "pharmaco-audit-view-"));
  const config = loadConfig({
    rootDir: resolve("."),
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
  try {
    const actor = { actorId: "teacher-audit-view" };
    const course = await api(base, "POST", "/api/product-core/courses", { name: "规范视图课", code: "PHA-AV-1", ...actor });
    const cohort = await api(base, "POST", `/api/product-core/courses/${course.body.course.id}/cohorts`, { name: "规范视图班", ...actor });
    const lesson = await api(base, "POST", "/api/product-core/lessons", {
      courseId: course.body.course.id,
      classId: cohort.body.cohort.id,
      title: "规范视图课时",
      ...actor,
    });
    const workflow = await api(base, "POST", "/api/product-core/s1/workflows", {
      courseId: course.body.course.id,
      classId: cohort.body.cohort.id,
      lessonId: lesson.body.lesson.id,
      ...actor,
    });
    const workflowId = workflow.body.workflow.id;
    const input = await api(base, "POST", `/api/product-core/s1/workflows/${workflowId}/input`, {
      fixturePath: "server/product-core/fixtures/pretest-s1.fixture.json",
      ...actor,
    });
    assert.equal(input.status, 200, JSON.stringify(input.body));

    const audit = await api(base, "GET", `/api/product-core/s1/workflows/${workflowId}/audit`);
    assert.equal(audit.status, 200);
    assert.equal(audit.body.eventNameCanonical, AUDIT_VIEW_VERSION);
    const eventTypes = audit.body.events.map((e) => e.eventType);
    // 双名对只剩规范名
    assert.ok(eventTypes.includes("input.imported"));
    assert.ok(!eventTypes.includes("inputs.submitted"), "别名 inputs.submitted 应折叠");
    // inputs.submitted 要么折进 input.imported 的 aliases,要么(跨秒)以 originalEventType 留痕
    const importedEvents = audit.body.events.filter((e) => e.eventType === "input.imported");
    const foldedAlias = importedEvents.some((e) => (e.aliases ?? []).some((a) => a.eventType === "inputs.submitted"));
    const straddled = importedEvents.some((e) => e.originalEventType === "inputs.submitted");
    assert.ok(foldedAlias || straddled, "inputs.submitted 应折叠为别名或落单规范化");
    // 单名事件原样在
    assert.ok(eventTypes.includes("workflow.created"));
    assert.ok(eventTypes.includes("workflow.transitioned"));
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
    database.close();
    rmSync(tempDir, { recursive: true, force: true });
  }
});
