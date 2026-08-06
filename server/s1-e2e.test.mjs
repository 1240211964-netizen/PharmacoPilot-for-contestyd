// S1 产品内核端到端测试:真实 HTTP 服务 + 临时 DB,走完整闭环。
// 覆盖:建课链路 -> 导入 -> 算事实 -> 生成 -> 校验 -> 混合裁决 -> 发布 -> 版本链 -> 审计 -> 可重放。
// modelClient.chat 直接抛错:整条闭环不允许触碰任何模型(无 MLX 也必须全绿)。
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { createPharmacoServer } from "./app.mjs";
import { loadConfig } from "./config.mjs";
import { PharmacoDatabase } from "./db.mjs";

const FIXTURE = JSON.parse(
  readFileSync(new URL("./product-core/fixtures/pretest-s1.fixture.json", import.meta.url), "utf8"),
);
const FIXTURE_PATH = "server/product-core/fixtures/pretest-s1.fixture.json";
const ACTOR = { actorId: "teacher-e2e" };
const REVIEWER = "teacher-e2e";

const noModelClient = {
  async status() {
    return { ready: false, endpoint: "http://127.0.0.1:1/v1", model: "none", advertisedModels: [] };
  },
  async chat() {
    throw new Error("S1 闭环不允许调用任何模型");
  },
};

async function api(base, method, path, body) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await response.json();
  return { status: response.status, body: json };
}

function expectError(result, status, code) {
  assert.equal(result.status, status, `期望 ${status},实际 ${result.status}: ${JSON.stringify(result.body)}`);
  assert.equal(result.body.error.code, code);
  assert.equal(typeof result.body.error.message, "string");
}

// 走一遍完整 组织 -> workflow -> TEACHER_REVIEW 流程,返回各 ID 与中间结果。
async function runUpToTeacherReview(base, { useFixturePath = false, label = "run" } = {}) {
  const course = await api(base, "POST", "/api/product-core/courses", {
    name: `药事管理学-${label}`, code: `PHA-E2E-${label}`, ...ACTOR,
  });
  assert.equal(course.status, 201, JSON.stringify(course.body));
  assert.match(course.body.course.id, /^crs_/);

  const cohort = await api(base, "POST", `/api/product-core/courses/${course.body.course.id}/cohorts`, {
    name: `2026 级药管 1 班-${label}`, academicTerm: "2026-2027-1", ...ACTOR,
  });
  assert.equal(cohort.status, 201, JSON.stringify(cohort.body));
  assert.match(cohort.body.cohort.id, /^coh_/);

  const lesson = await api(base, "POST", "/api/product-core/lessons", {
    courseId: course.body.course.id,
    classId: cohort.body.cohort.id,
    title: `第 5 章 课前-${label}`,
    ...ACTOR,
  });
  assert.equal(lesson.status, 201, JSON.stringify(lesson.body));
  assert.match(lesson.body.lesson.id, /^les_/);

  const workflow = await api(base, "POST", "/api/product-core/s1/workflows", {
    courseId: course.body.course.id,
    classId: cohort.body.cohort.id,
    lessonId: lesson.body.lesson.id,
    ...ACTOR,
  });
  assert.equal(workflow.status, 201, JSON.stringify(workflow.body));
  assert.match(workflow.body.workflow.id, /^wf_/);
  assert.equal(workflow.body.workflow.currentState, "DRAFT");
  const workflowId = workflow.body.workflow.id;

  const input = await api(base, "POST", `/api/product-core/s1/workflows/${workflowId}/input`, {
    ...(useFixturePath ? { fixturePath: FIXTURE_PATH } : { fixture: FIXTURE }),
    ...ACTOR,
  });
  assert.equal(input.status, 200, JSON.stringify(input.body));
  assert.equal(input.body.workflow.currentState, "INPUT_READY");

  const facts = await api(base, "POST", `/api/product-core/s1/workflows/${workflowId}/compute-facts`, ACTOR);
  assert.equal(facts.status, 200, JSON.stringify(facts.body));
  assert.equal(facts.body.workflow.currentState, "FACTS_COMPUTED");
  assert.ok(facts.body.facts.metricCount > 0);

  const claims = await api(base, "POST", `/api/product-core/s1/workflows/${workflowId}/generate-claims`, ACTOR);
  assert.equal(claims.status, 200, JSON.stringify(claims.body));
  assert.equal(claims.body.workflow.currentState, "CLAIMS_GENERATED");
  assert.ok(claims.body.claims.length > 0);
  assert.ok(claims.body.decisionRecords.length > 0);
  assert.match(claims.body.modelRunId, /^mrn_/);

  const validated = await api(base, "POST", `/api/product-core/s1/workflows/${workflowId}/validate`, ACTOR);
  assert.equal(validated.status, 200, JSON.stringify(validated.body));
  assert.equal(validated.body.workflow.currentState, "TEACHER_REVIEW");
  assert.equal(validated.body.gate.failed, 0, JSON.stringify(validated.body.gate.results));
  assert.ok(validated.body.semanticReview.reviewed > 0);

  return {
    courseId: course.body.course.id,
    classId: cohort.body.cohort.id,
    lessonId: lesson.body.lesson.id,
    workflowId,
    claims: claims.body.claims,
  };
}

// 观测投影:跨运行可比对的确定性字段(不含随机 ID/时间戳)。
function observationProjections(view) {
  return view.observations
    .map((o) => ({
      metric: o.metric,
      value: o.value,
      unit: o.unit,
      numerator: o.numerator,
      denominator: o.denominator,
      calculationRule: o.calculationRule,
      calculationVersion: o.calculationVersion,
    }))
    .sort((a, b) => a.metric.localeCompare(b.metric));
}

test("S1 HTTP API 端到端闭环", async (t) => {
  const tempDir = mkdtempSync(join(tmpdir(), "pharmaco-s1-e2e-"));
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

  t.after(async () => {
    await new Promise((resolveClose) => server.close(resolveClose));
    database.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  let firstRunObservations = null;

  await t.test("完整闭环:建课→导入→算事实→生成→校验→混合裁决→发布→版本链→审计", async () => {
    const run = await runUpToTeacherReview(base, { label: "main" });
    const { workflowId, lessonId } = run;

    // 工作区聚合视图:状态/分组 claim/TDR/可用动作齐全
    const view = (await api(base, "GET", `/api/product-core/s1/workflows/${workflowId}`)).body;
    assert.equal(view.workflow.currentState, "TEACHER_REVIEW");
    assert.ok(view.availableActions.includes("publish"));
    assert.ok(view.availableActions.includes("cancel"));
    assert.ok(view.observations.length > 0);
    assert.ok(view.claims.factual.length > 0);
    assert.equal(view.claims.inference.length, 1, "fixture Q4 应触发一条混淆推断");
    assert.equal(view.claims.recommendation.length, 1, "fixture Q4 应触发一条教学建议");
    for (const claim of [...view.claims.factual, ...view.claims.inference, ...view.claims.recommendation]) {
      assert.ok(claim.evidenceLinks.length > 0, `${claim.id} 缺证据`);
      assert.equal(claim.mechanicalReport.overallStatus, "PASSED");
      assert.ok(claim.semanticReport, `${claim.id} 缺语义审查报告`);
    }
    assert.equal(view.decisionRecords.length, view.claims.factual.length + 2);
    for (const record of view.decisionRecords) assert.equal(record.effectiveDecision, null);
    firstRunObservations = observationProjections(view);

    // 无裁决直接发布 → 422 PUBLISH_NO_TEACHER_DECISION
    const earlyPublish = await api(base, "POST", `/api/product-core/s1/workflows/${workflowId}/publish`, ACTOR);
    expectError(earlyPublish, 422, "PUBLISH_NO_TEACHER_DECISION");

    // 混合裁决:推断 revise、建议 defer、首条事实 reject、其余 accept
    const inferenceRecord = view.decisionRecords.find((r) => r.claimType === "diagnostic_inference");
    const recommendationRecord = view.decisionRecords.find((r) => r.claimType === "teaching_recommendation");
    const factualRecords = view.decisionRecords.filter((r) => r.claimType === "factual_claim");
    const rejectedRecord = factualRecords[0];
    const EDITED = "部分学生可能混淆 CYP3A4 抑制与他汀代谢:Q4 正确率 18.75%,13/32 集中误选 B(教师修订,证据边界保留)。";

    const reviseResult = await api(base, "POST", `/api/product-core/s1/decision-records/${inferenceRecord.id}/decisions`, {
      decision: "revise", reviewerId: REVIEWER, editedStatement: EDITED, comment: "措辞收紧",
    });
    assert.equal(reviseResult.status, 201, JSON.stringify(reviseResult.body));
    assert.equal(reviseResult.body.decision, "revise");
    assert.match(reviseResult.body.revisedClaimId, /^clm_/);
    assert.equal(reviseResult.body.effective.originalStatement, inferenceRecord.statement);
    assert.equal(reviseResult.body.effective.editedStatement, EDITED);

    const deferResult = await api(base, "POST", `/api/product-core/s1/decision-records/${recommendationRecord.id}/decisions`, {
      decision: "defer", reviewerId: REVIEWER, comment: "待教研室讨论后再定",
    });
    assert.equal(deferResult.status, 201, JSON.stringify(deferResult.body));

    const rejectResult = await api(base, "POST", `/api/product-core/s1/decision-records/${rejectedRecord.id}/decisions`, {
      decision: "reject", reviewerId: REVIEWER, comment: "该指标不纳入本次诊断",
    });
    assert.equal(rejectResult.status, 201, JSON.stringify(rejectResult.body));

    for (const record of view.decisionRecords) {
      if ([inferenceRecord.id, recommendationRecord.id, rejectedRecord.id].includes(record.id)) continue;
      const acceptResult = await api(base, "POST", `/api/product-core/s1/decision-records/${record.id}/decisions`, {
        decision: "accept", reviewerId: REVIEWER,
      });
      assert.equal(acceptResult.status, 201, JSON.stringify(acceptResult.body));
    }

    // 发布:返回新版本与产物
    const published = await api(base, "POST", `/api/product-core/s1/workflows/${workflowId}/publish`, ACTOR);
    assert.equal(published.status, 200, JSON.stringify(published.body));
    assert.equal(published.body.versionNumber, 1);
    assert.match(published.body.lessonVersionId, /^lvr_/);
    assert.equal(published.body.workflow.currentState, "PUBLISHED");
    const artifact = published.body.artifact;
    assert.equal(artifact.artifactType, "S1_DIAGNOSIS_ARTIFACT");
    assert.equal(artifact.workflowInstanceId, workflowId);

    // revise 的诊断进产物:用 editedStatement,保留 originalStatement
    assert.equal(artifact.confirmedDiagnoses.length, 1);
    assert.equal(artifact.confirmedDiagnoses[0].statement, EDITED);
    assert.equal(artifact.confirmedDiagnoses[0].originalStatement, inferenceRecord.statement);
    assert.equal(artifact.confirmedDiagnoses[0].revisedBy, REVIEWER);

    // rejected 内容不进产物
    const artifactText = JSON.stringify(artifact);
    assert.ok(!artifactText.includes(rejectedRecord.id), "rejected 的 TDR 不得出现在产物");
    assert.ok(!artifactText.includes(rejectedRecord.statement), "rejected 的陈述不得出现在产物");
    assert.equal(
      artifact.observedFacts.length,
      view.claims.factual.length - 1,
      "observedFacts = 采纳的事实(reject 的除外)",
    );

    // deferred 只进 unresolvedQuestions
    assert.equal(artifact.confirmedTeachingActions.length, 0, "defer 的建议不得进教学行动");
    assert.equal(artifact.unresolvedQuestions.length, 1);
    assert.equal(artifact.unresolvedQuestions[0].claimId, recommendationRecord.claimId);
    assert.equal(artifact.unresolvedQuestions[0].statement, recommendationRecord.statement);
    assert.equal(artifact.unresolvedQuestions[0].deferComment, "待教研室讨论后再定");

    // 进入产物的每条内容都带证据
    for (const entry of [...artifact.observedFacts, ...artifact.confirmedDiagnoses]) {
      assert.ok(entry.evidenceIds.length > 0, `${entry.claimId} 缺证据`);
    }
    assert.ok(artifact.supportingEvidence.length > 0);

    // 版本链:GET 列表含 PUBLISHED 产物;GET 单版本一致
    const versions = await api(base, "GET", `/api/product-core/lessons/${lessonId}/versions`);
    assert.equal(versions.status, 200);
    assert.equal(versions.body.versions.length, 1);
    assert.equal(versions.body.versions[0].status, "PUBLISHED");
    assert.equal(versions.body.versions[0].content.artifactType, "S1_DIAGNOSIS_ARTIFACT");
    assert.deepEqual(versions.body.versions[0].content.confirmedDiagnoses, artifact.confirmedDiagnoses);
    const single = await api(base, "GET", `/api/product-core/lessons/${lessonId}/versions/${published.body.lessonVersionId}`);
    assert.equal(single.status, 200);
    assert.equal(single.body.version.id, published.body.lessonVersionId);
    assert.equal(single.body.version.versionNumber, 1);

    // 发布是终态:再 publish → 409 WF_ILLEGAL_TRANSITION
    const republish = await api(base, "POST", `/api/product-core/s1/workflows/${workflowId}/publish`, ACTOR);
    expectError(republish, 409, "WF_ILLEGAL_TRANSITION");

    // 审计时间线(读时规范视图 eventNameCanonical 1.0):双名对折叠为规范名 + 别名计数
    const audit = await api(base, "GET", `/api/product-core/s1/workflows/${workflowId}/audit`);
    assert.equal(audit.status, 200);
    assert.equal(audit.body.eventNameCanonical, "1.0");
    const eventTypes = new Set(audit.body.events.map((e) => e.eventType));
    for (const required of [
      "workflow.created",
      "input.imported",
      "facts.computed",
      "claim.created",
      "mechanical.validation.completed",
      "semantic.review.completed",
      "teacher.decision.recorded",
      "version.published",
      "workflow.transitioned",
    ]) {
      assert.ok(eventTypes.has(required), `审计时间线缺少 ${required}`);
    }
    // 别名事件名折叠后不再作为独立事件出现(进 aliases)
    for (const folded of [
      "inputs.submitted",
      "observation.computed",
      "gate.mechanical.completed",
      "review.semantic.completed",
      "teacher.accepted",
      "teacher.revised",
      "teacher.rejected",
      "teacher.deferred",
      "lesson.published",
    ]) {
      assert.ok(!eventTypes.has(folded), `别名 ${folded} 应折叠进规范事件`);
    }
    // 折叠留痕:别名计数 + 别名行可溯
    const importedEvent = audit.body.events.find((e) => e.eventType === "input.imported");
    assert.ok(importedEvent.aliasCount >= 1);
    assert.ok(importedEvent.aliases.some((a) => a.eventType === "inputs.submitted"));
    const decisionEvents = audit.body.events.filter((e) => e.eventType === "teacher.decision.recorded");
    // 每条决策记录一条裁决事件(fold=entity:同秒不同记录不互折),动作在 payload.decision
    assert.equal(decisionEvents.length, view.decisionRecords.length);
    assert.deepEqual(
      [...new Set(decisionEvents.map((e) => e.payload.decision))].sort(),
      ["accept", "defer", "reject", "revise"],
    );
    for (const event of decisionEvents) assert.equal(event.aliasCount, 1);
    const publishedEvent = audit.body.events.find((e) => e.eventType === "version.published");
    assert.ok(publishedEvent.aliases.some((a) => a.eventType === "lesson.published"));
    for (const event of audit.body.events) assert.match(event.eventHash, /^[a-f0-9]{64}$/);
    // 状态转移序列完整且有序
    const transitions = audit.body.events
      .filter((e) => e.eventType === "workflow.transitioned")
      .map((e) => `${e.previousState}->${e.nextState}`);
    assert.deepEqual(transitions, [
      "DRAFT->INPUT_READY",
      "INPUT_READY->FACTS_COMPUTED",
      "FACTS_COMPUTED->EVIDENCE_RETRIEVED",
      "EVIDENCE_RETRIEVED->CLAIMS_GENERATED",
      "CLAIMS_GENERATED->MECHANICAL_VALIDATED",
      "MECHANICAL_VALIDATED->SEMANTIC_REVIEWED",
      "SEMANTIC_REVIEWED->TEACHER_REVIEW",
      "TEACHER_REVIEW->PUBLISHED",
    ]);
  });

  await t.test("非法操作:DRAFT 直接 generate-claims → 409 WF_ILLEGAL_TRANSITION", async () => {
    const course = await api(base, "POST", "/api/product-core/courses", { name: "非法路径课", code: "PHA-E2E-bad", ...ACTOR });
    const cohort = await api(base, "POST", `/api/product-core/courses/${course.body.course.id}/cohorts`, { name: "非法路径班", ...ACTOR });
    const lesson = await api(base, "POST", "/api/product-core/lessons", {
      courseId: course.body.course.id, classId: cohort.body.cohort.id, title: "非法路径课时", ...ACTOR,
    });
    const workflow = await api(base, "POST", "/api/product-core/s1/workflows", {
      courseId: course.body.course.id, classId: cohort.body.cohort.id, lessonId: lesson.body.lesson.id, ...ACTOR,
    });
    const illegal = await api(base, "POST", `/api/product-core/s1/workflows/${workflow.body.workflow.id}/generate-claims`, ACTOR);
    expectError(illegal, 409, "WF_ILLEGAL_TRANSITION");
  });

  await t.test("找不到的资源一律 404,错误结构统一", async () => {
    const missingWf = await api(base, "GET", "/api/product-core/s1/workflows/wf_000000000000000000000");
    expectError(missingWf, 404, "WF_INSTANCE_NOT_FOUND");
    const missingAudit = await api(base, "GET", "/api/product-core/s1/workflows/wf_000000000000000000000/audit");
    expectError(missingAudit, 404, "WF_INSTANCE_NOT_FOUND");
    const missingTdr = await api(base, "POST", "/api/product-core/s1/decision-records/tdr_000000000000000000000/decisions", {
      decision: "accept", reviewerId: REVIEWER,
    });
    expectError(missingTdr, 404, "DECISION_RECORD_NOT_FOUND");
    const missingLesson = await api(base, "GET", "/api/product-core/lessons/les_000000000000000000000/versions");
    expectError(missingLesson, 404, "LESSON_NOT_FOUND");
    const missingRoute = await api(base, "GET", "/api/product-core/nope");
    expectError(missingRoute, 404, "API_NOT_FOUND");
  });

  await t.test("裁决参数校验:非法 decision / revise 缺 editedStatement → 4xx", async () => {
    const run = await runUpToTeacherReview(base, { label: "guard" });
    const view = (await api(base, "GET", `/api/product-core/s1/workflows/${run.workflowId}`)).body;
    const record = view.decisionRecords[0];
    const badDecision = await api(base, "POST", `/api/product-core/s1/decision-records/${record.id}/decisions`, {
      decision: "maybe", reviewerId: REVIEWER,
    });
    expectError(badDecision, 422, "TEACHER_DECISION_INVALID");
    const badRevise = await api(base, "POST", `/api/product-core/s1/decision-records/${record.id}/decisions`, {
      decision: "revise", reviewerId: REVIEWER,
    });
    expectError(badRevise, 422, "TEACHER_DECISION_INVALID");
  });

  await t.test("同一 fixture 两次完整流程,observations 完全一致(可重放)", async () => {
    assert.ok(firstRunObservations, "主流程必须先运行");
    // 第二次用 fixturePath 通道(同时覆盖该约定),其余步骤完全相同。
    const run = await runUpToTeacherReview(base, { useFixturePath: true, label: "replay" });
    const view = (await api(base, "GET", `/api/product-core/s1/workflows/${run.workflowId}`)).body;
    assert.deepEqual(observationProjections(view), firstRunObservations);
  });
});
