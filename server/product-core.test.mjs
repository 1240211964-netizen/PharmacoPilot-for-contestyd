// 产品内核领域服务层全量测试(对照 docs/product-core/s1-state-machine.md 与 domain-invariants.md)。
// 每个测试用临时目录建独立库;fixture 为 server/product-core/fixtures/pretest-s1.fixture.json。
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { PharmacoDatabase } from './db.mjs';
import { newId, nowIso } from './product-core/ids.mjs';
import { importPretest, computeFacts, listObservations } from './product-core/pretest.mjs';
import {
  attachKnowledgeEvidence,
  generateClaimsRuleBased,
  listS1Claims,
  supersedeClaim,
} from './product-core/claims.mjs';
import { runMechanicalValidation } from './product-core/mechanical-gates.mjs';
import { mockReviewerV1, runSemanticReview } from './product-core/semantic-review.mjs';
import {
  createDecisionRecords,
  getEffectiveDecision,
  listDecisionRecords,
  recordClaimId,
  submitTeacherDecision,
} from './product-core/decisions.mjs';
import { publishS1 } from './product-core/publish.mjs';
import { recordModelRun } from './product-core/model-runs.mjs';
import {
  insertAssetVersion,
  insertContentBlock,
  insertCohort,
  insertCourse,
  insertKnowledgeAsset,
  insertLesson,
} from './product-core/repository.mjs';
import {
  runDiagnosisUpToTeacherReview,
  setupOrganization,
  startS1Workflow,
} from './product-core/s1-service.mjs';
import { createWorkflow, getWorkflow, transitionWorkflow } from './product-core/workflow.mjs';
import { CURRENT_SCHEMA_VERSION, SchemaValidationError } from './product-core/schemas.mjs';
import { MockProvider } from './model-providers/mock-provider.mjs';
import { MlxProvider } from './model-providers/mlx-provider.mjs';
import { getProvider } from './model-providers/registry.mjs';

const FIXTURE = JSON.parse(
  readFileSync(new URL('./product-core/fixtures/pretest-s1.fixture.json', import.meta.url), 'utf8'),
);
const SYSTEM = { actorType: 'system', actorId: 'test-system' };
const TEACHER = { actorType: 'teacher', actorId: 'teacher-01' };

function makeDb() {
  const dir = mkdtempSync(join(tmpdir(), 'pharmaco-product-core-test-'));
  const pdb = new PharmacoDatabase(dir);
  return {
    pdb,
    db: pdb.db,
    cleanup() {
      pdb.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

function setup(db) {
  const org = setupOrganization(db, {
    courseName: '临床药物治疗学',
    courseCode: 'CLIN-PHARM-01',
    cohortName: '2026 秋 1 班',
    academicTerm: '2026-autumn',
    lessonTitle: '第 3 讲 药物相互作用',
    actorContext: SYSTEM,
  });
  const workflow = startS1Workflow(db, { ...org, createdBy: 'teacher-01', actorContext: SYSTEM });
  return { ...org, workflowId: workflow.id };
}

// 全流程跑到 TEACHER_REVIEW。
async function runToTeacherReview(db, ids) {
  const result = await runDiagnosisUpToTeacherReview(db, {
    workflowId: ids.workflowId,
    fixture: FIXTURE,
    actorContext: SYSTEM,
  });
  return result;
}

// 对全部 TDR 逐条 accept(可按 decisionMap 覆盖个别记录)。
async function decideAll(db, workflowId, decisionMap = new Map()) {
  const records = listDecisionRecords(db, workflowId);
  const outcomes = [];
  for (const record of records) {
    const spec = decisionMap.get(record.id) ?? { decision: 'accept' };
    outcomes.push(
      await submitTeacherDecision(db, {
        decisionRecordId: record.id,
        reviewerId: 'teacher-01',
        comment: spec.comment ?? null,
        editedStatement: spec.editedStatement ?? null,
        decision: spec.decision,
        actorContext: TEACHER,
      }),
    );
  }
  return outcomes;
}

function auditEventTypes(db) {
  return new Set(db.prepare('SELECT DISTINCT event_type FROM audit_events').all().map((r) => r.event_type));
}

test('S1 合法转移全链路 DRAFT -> ... -> PUBLISHED', async () => {
  const { db, cleanup } = makeDb();
  try {
    const ids = setup(db);
    assert.equal(getWorkflow(db, ids.workflowId).current_state, 'DRAFT');

    const { workflow, claims, records, gate } = await runToTeacherReview(db, ids);
    assert.equal(workflow.current_state, 'TEACHER_REVIEW');
    // fixture 设计:4 题正确率 + 参与率 + 整体正确率 = 6 factual;Q4 触发 1 推断 + 1 建议。
    const factuals = claims.filter((c) => c.claimType === 'factual_claim');
    const inferences = claims.filter((c) => c.claimType === 'diagnostic_inference');
    const recommendations = claims.filter((c) => c.claimType === 'teaching_recommendation');
    assert.equal(factuals.length, 6);
    assert.equal(inferences.length, 1);
    assert.equal(recommendations.length, 1);
    assert.ok(inferences[0].statement.includes('6/32'));
    assert.ok(inferences[0].statement.includes('13/32'));
    const q4Factual = factuals.find((c) => c.statement.includes('Q4'));
    assert.ok(q4Factual.statement.includes('18.75%'));
    assert.equal(records.length, claims.length);
    assert.equal(gate.failed, 0);

    await decideAll(db, ids.workflowId);
    const published = publishS1(db, { workflowInstanceId: ids.workflowId, actorContext: TEACHER });
    assert.equal(getWorkflow(db, ids.workflowId).current_state, 'PUBLISHED');
    assert.equal(published.versionNumber, 1);

    const artifact = published.artifact;
    assert.equal(artifact.schemaVersion, CURRENT_SCHEMA_VERSION);
    assert.equal(artifact.observedFacts.length, 6);
    assert.equal(artifact.confirmedDiagnoses.length, 1);
    assert.equal(artifact.confirmedTeachingActions.length, 1);
    assert.ok(artifact.followUpSignals.length >= 2);
    assert.ok(artifact.supportingEvidence.length > 0);

    const versionRow = db.prepare('SELECT * FROM lesson_versions WHERE id = ?').get(published.lessonVersionId);
    assert.equal(versionRow.status, 'PUBLISHED');
    assert.equal(versionRow.version_number, 1);
    const publishedRecords = db
      .prepare(`SELECT COUNT(*) AS n FROM teaching_decisions WHERE workflow_instance_id = ? AND status = 'PUBLISHED'`)
      .get(ids.workflowId).n;
    assert.equal(publishedRecords, records.length);
  } finally {
    cleanup();
  }
});

test('非法转移被拒绝:跨态直跳与缺步推进', async () => {
  const { db, cleanup } = makeDb();
  try {
    const ids = setup(db);
    // 1) DRAFT -> generateClaims 跨态直跳
    assert.throws(
      () => transitionWorkflow(db, ids.workflowId, 'generateClaims', SYSTEM),
      (err) => err.code === 'WF_ILLEGAL_TRANSITION' && err.details.from === 'DRAFT' && err.details.action === 'generateClaims',
    );
    // 2) 未 computeFacts 即 generateClaims(INPUT_READY 也不允许)
    importPretest(db, ids.lessonId, FIXTURE, SYSTEM);
    transitionWorkflow(db, ids.workflowId, 'markInputReady', SYSTEM);
    assert.throws(
      () => transitionWorkflow(db, ids.workflowId, 'generateClaims', SYSTEM),
      (err) => err.code === 'WF_ILLEGAL_TRANSITION' && err.details.from === 'INPUT_READY',
    );
    // 3) 推进到 CLAIMS_GENERATED 后,未跑机械校验直接 runSemanticReview
    computeFacts(db, { ...ids, actorContext: SYSTEM });
    transitionWorkflow(db, ids.workflowId, 'computeFacts', SYSTEM);
    await generateClaimsRuleBased(db, { workflowInstanceId: ids.workflowId, ...ids, actorContext: SYSTEM });
    transitionWorkflow(db, ids.workflowId, 'attachEvidence', SYSTEM);
    await createDecisionRecords(db, { workflowInstanceId: ids.workflowId, actorContext: SYSTEM });
    transitionWorkflow(db, ids.workflowId, 'generateClaims', SYSTEM);
    assert.throws(
      () => transitionWorkflow(db, ids.workflowId, 'runSemanticReview', SYSTEM),
      (err) => err.code === 'WF_ILLEGAL_TRANSITION' && err.details.from === 'CLAIMS_GENERATED',
    );
    // 4) 未跑语义审查直接 enterTeacherReview
    runMechanicalValidation(db, { lessonId: ids.lessonId, workflowInstanceId: ids.workflowId, actorContext: SYSTEM });
    transitionWorkflow(db, ids.workflowId, 'runMechanicalValidation', SYSTEM);
    assert.throws(
      () => transitionWorkflow(db, ids.workflowId, 'enterTeacherReview', SYSTEM),
      (err) => err.code === 'WF_ILLEGAL_TRANSITION',
    );
  } finally {
    cleanup();
  }
});

test('守卫:无 observation 不能 FACTS_COMPUTED;无证据 factual_claim 不能 EVIDENCE_RETRIEVED', async () => {
  const { db, cleanup } = makeDb();
  try {
    const ids = setup(db);
    importPretest(db, ids.lessonId, FIXTURE, SYSTEM);
    transitionWorkflow(db, ids.workflowId, 'markInputReady', SYSTEM);
    // 未运行 computeFacts 服务,直接转移 -> 守卫拒绝
    assert.throws(
      () => transitionWorkflow(db, ids.workflowId, 'computeFacts', SYSTEM),
      (err) => err.code === 'WF_ILLEGAL_TRANSITION' && /runtime_observation/.test(err.details.reason),
    );
    computeFacts(db, { ...ids, actorContext: SYSTEM });
    transitionWorkflow(db, ids.workflowId, 'computeFacts', SYSTEM);
    // 手工插入一条无证据 factual_claim -> attachEvidence 守卫拒绝
    // (005 起 workflow_instance_id 为 NOT NULL 列,归入本轮 workflow)
    db.prepare(
      `INSERT INTO teaching_claims(id, claim_type, statement, stage_id, target_stage_id, course_id, class_id, lesson_id, workflow_instance_id, confidence_status, created_by, created_at)
       VALUES (?, 'factual_claim', '无证据断言', 'S1', NULL, ?, ?, ?, ?, 'confirmed', 'rule', ?)`,
    ).run(newId('clm'), ids.courseId, ids.classId, ids.lessonId, ids.workflowId, nowIso());
    assert.throws(
      () => transitionWorkflow(db, ids.workflowId, 'attachEvidence', SYSTEM),
      (err) => err.code === 'WF_ILLEGAL_TRANSITION' && /无证据绑定/.test(err.details.reason),
    );
  } finally {
    cleanup();
  }
});

test('机械门禁:引用改一字 FAILED;superseded 唯一来源 FAILED;FAILED claim 发布被拒', async () => {
  const { db, cleanup } = makeDb();
  try {
    const ids = setup(db);
    importPretest(db, ids.lessonId, FIXTURE, SYSTEM);
    computeFacts(db, { ...ids, actorContext: SYSTEM });
    await generateClaimsRuleBased(db, { workflowInstanceId: ids.workflowId, ...ids, actorContext: SYSTEM });

    // 基线:全部 PASSED
    let gate = runMechanicalValidation(db, { lessonId: ids.lessonId, workflowInstanceId: ids.workflowId, actorContext: SYSTEM });
    assert.equal(gate.failed, 0);
    assert.equal(gate.passed, gate.claimsChecked);

    // 准备知识资产并给一条 factual claim 追加知识证据
    const asset = insertKnowledgeAsset(db, { type: 'textbook', title: '临床药理学教材', actorContext: SYSTEM });
    const version = insertAssetVersion(db, { assetId: asset.id, version: '2026-01', actorContext: SYSTEM });
    const block = insertContentBlock(db, {
      assetVersionId: version.id,
      orderIndex: 0,
      pageIndex: 0,
      pageLabel: 'p.1',
      contentRaw: 'CYP3A4 强抑制剂可显著升高辛伐他汀血药浓度,增加肌病风险。',
    });
    const factual = listS1Claims(db, ids.lessonId).find((c) => c.claim_type === 'factual_claim');
    attachKnowledgeEvidence(db, {
      claimId: factual.id,
      assetVersionId: version.id,
      contentBlockId: block.id,
      verbatimQuote: 'CYP3A4 强抑制剂可显著升高辛伐他汀血药浓度',
      actorContext: SYSTEM,
    });
    gate = runMechanicalValidation(db, { lessonId: ids.lessonId, workflowInstanceId: ids.workflowId, actorContext: SYSTEM });
    assert.equal(gate.failed, 0);

    // 把引用改一个字 -> knowledge_verbatim_quote FAILED
    db.prepare(`UPDATE evidence_links SET verbatim_quote = 'CYP3A4 强抑制剂可显著降低辛伐他汀血药浓度' WHERE content_block_id = ?`).run(block.id);
    gate = runMechanicalValidation(db, { lessonId: ids.lessonId, workflowInstanceId: ids.workflowId, actorContext: SYSTEM });
    assert.equal(gate.failed, 1);
    const tampered = gate.results.find((r) => r.claimId === factual.id);
    assert.equal(tampered.status, 'FAILED');
    assert.ok(tampered.report.checks.some((c) => c.check === 'knowledge_verbatim_quote' && c.status === 'FAILED'));

    // 修回引用,删除观测证据,使知识版本成为唯一来源;再 supersede 该版本 -> superseded_sole_source FAILED
    db.prepare(`UPDATE evidence_links SET verbatim_quote = 'CYP3A4 强抑制剂可显著升高辛伐他汀血药浓度' WHERE content_block_id = ?`).run(block.id);
    db.prepare(`DELETE FROM evidence_links WHERE claim_id = ? AND evidence_type = 'runtime_observation'`).run(factual.id);
    insertAssetVersion(db, { assetId: asset.id, version: '2026-02', actorContext: SYSTEM });
    gate = runMechanicalValidation(db, { lessonId: ids.lessonId, workflowInstanceId: ids.workflowId, actorContext: SYSTEM });
    const soleSuperseded = gate.results.find((r) => r.claimId === factual.id);
    assert.equal(soleSuperseded.status, 'FAILED');
    assert.ok(soleSuperseded.report.checks.some((c) => c.check === 'superseded_sole_source' && c.status === 'FAILED'));

    // FAILED claim 发布被拒:走完整流程到 TEACHER_REVIEW,全部 accept,publish 必须 GATE_VALIDATION_FAILED
    transitionWorkflow(db, ids.workflowId, 'markInputReady', SYSTEM);
    transitionWorkflow(db, ids.workflowId, 'computeFacts', SYSTEM);
    transitionWorkflow(db, ids.workflowId, 'attachEvidence', SYSTEM);
    await createDecisionRecords(db, { workflowInstanceId: ids.workflowId, actorContext: SYSTEM });
    transitionWorkflow(db, ids.workflowId, 'generateClaims', SYSTEM);
    transitionWorkflow(db, ids.workflowId, 'runMechanicalValidation', SYSTEM);
    runSemanticReview(db, { lessonId: ids.lessonId, workflowInstanceId: ids.workflowId, actorContext: SYSTEM });
    transitionWorkflow(db, ids.workflowId, 'runSemanticReview', SYSTEM);
    transitionWorkflow(db, ids.workflowId, 'enterTeacherReview', SYSTEM);
    await decideAll(db, ids.workflowId);
    assert.throws(
      () => publishS1(db, { workflowInstanceId: ids.workflowId, actorContext: TEACHER }),
      (err) => err.code === 'GATE_VALIDATION_FAILED',
    );
  } finally {
    cleanup();
  }
});

test('教师裁决:accept/revise/reject/defer 四路径与产物内容', async () => {
  const { db, cleanup } = makeDb();
  try {
    const ids = setup(db);
    await runToTeacherReview(db, ids);
    const dbRecords = listDecisionRecords(db, ids.workflowId);
    const byClaimType = new Map();
    for (const record of dbRecords) {
      const claim = db.prepare('SELECT * FROM teaching_claims WHERE id = ?').get(recordClaimId(record));
      byClaimType.set(claim.claim_type, { record, claim });
    }
    const inferenceEntry = byClaimType.get('diagnostic_inference');
    const recommendationEntry = byClaimType.get('teaching_recommendation');
    const factualEntries = dbRecords
      .map((record) => ({ record, claim: db.prepare('SELECT * FROM teaching_claims WHERE id = ?').get(recordClaimId(record)) }))
      .filter((e) => e.claim.claim_type === 'factual_claim');
    const rejectedFactual = factualEntries[0];

    const decisionMap = new Map([
      [inferenceEntry.record.id, { decision: 'revise', editedStatement: '学生将 CYP3A4 抑制与他汀代谢的关系理解反了,需在 S5 安排酶抑制机制辨析。' }],
      [recommendationEntry.record.id, { decision: 'defer', comment: '待与课程组讨论后决定' }],
      [rejectedFactual.record.id, { decision: 'reject', comment: '该指标无教学意义' }],
    ]);
    await decideAll(db, ids.workflowId, decisionMap);

    // revise:original_statement 自动填系统原文且不可覆盖;旧 claim statement 不变,新 claim 接 supersede 链
    const revision = db
      .prepare(`SELECT * FROM teacher_decisions WHERE decision_record_id = ? ORDER BY decided_at DESC, rowid DESC LIMIT 1`)
      .get(inferenceEntry.record.id);
    assert.equal(revision.decision, 'revise');
    assert.equal(revision.original_statement, inferenceEntry.claim.statement);
    assert.ok(revision.edited_statement.includes('理解反了'));
    const oldClaim = db.prepare('SELECT * FROM teaching_claims WHERE id = ?').get(inferenceEntry.claim.id);
    assert.equal(oldClaim.statement, inferenceEntry.claim.statement);
    assert.ok(oldClaim.superseded_by);
    const revisedClaim = db.prepare('SELECT * FROM teaching_claims WHERE id = ?').get(oldClaim.superseded_by);
    assert.equal(revisedClaim.statement, revision.edited_statement);
    assert.equal(revisedClaim.supersedes_claim_id, oldClaim.id);
    assert.equal(revisedClaim.created_by, 'teacher');

    const published = publishS1(db, { workflowInstanceId: ids.workflowId, actorContext: TEACHER });
    const artifact = published.artifact;
    // REJECTED 不进产物:observedFacts 少一条
    assert.equal(artifact.observedFacts.length, 5);
    assert.ok(!artifact.observedFacts.some((f) => f.claimId === rejectedFactual.claim.id));
    // revise 用 editedStatement 且附 originalStatement
    assert.equal(artifact.confirmedDiagnoses.length, 1);
    assert.equal(artifact.confirmedDiagnoses[0].statement, revision.edited_statement);
    assert.equal(artifact.confirmedDiagnoses[0].originalStatement, inferenceEntry.claim.statement);
    // DEFERRED 进未解决问题,不进教学行动
    assert.equal(artifact.confirmedTeachingActions.length, 0);
    assert.equal(artifact.unresolvedQuestions.length, 1);
    assert.equal(artifact.unresolvedQuestions[0].claimId, recommendationEntry.claim.id);
    assert.equal(artifact.unresolvedQuestions[0].deferComment, '待与课程组讨论后决定');
  } finally {
    cleanup();
  }
});

test('发布门禁:无裁决 PUBLISH_NO_TEACHER_DECISION;发布后再 publish 拒;版本链累进', async () => {
  const { db, cleanup } = makeDb();
  try {
    const ids = setup(db);
    await runToTeacherReview(db, ids);
    // 未裁决直接发布
    assert.throws(
      () => publishS1(db, { workflowInstanceId: ids.workflowId, actorContext: TEACHER }),
      (err) => err.code === 'PUBLISH_NO_TEACHER_DECISION',
    );
    await decideAll(db, ids.workflowId);
    const first = publishS1(db, { workflowInstanceId: ids.workflowId, actorContext: TEACHER });
    // 已 PUBLISHED 的 workflow 再 publish -> WF_ILLEGAL_TRANSITION
    assert.throws(
      () => publishS1(db, { workflowInstanceId: ids.workflowId, actorContext: TEACHER }),
      (err) => err.code === 'WF_ILLEGAL_TRANSITION',
    );
    // 新一轮分析 = 新 workflow instance,版本链自然累进,旧版本翻 SUPERSEDED。
    // 前测数据已在库中(同 lesson),第二轮跳过导入,直接按状态机推进。
    const secondWf = createWorkflow(db, { ...ids, createdBy: 'teacher-01', actorContext: SYSTEM });
    transitionWorkflow(db, secondWf.id, 'markInputReady', SYSTEM);
    computeFacts(db, { ...ids, actorContext: SYSTEM });
    transitionWorkflow(db, secondWf.id, 'computeFacts', SYSTEM);
    await generateClaimsRuleBased(db, { workflowInstanceId: secondWf.id, ...ids, actorContext: SYSTEM });
    transitionWorkflow(db, secondWf.id, 'attachEvidence', SYSTEM);
    await createDecisionRecords(db, { workflowInstanceId: secondWf.id, actorContext: SYSTEM });
    transitionWorkflow(db, secondWf.id, 'generateClaims', SYSTEM);
    runMechanicalValidation(db, { lessonId: ids.lessonId, workflowInstanceId: secondWf.id, actorContext: SYSTEM });
    transitionWorkflow(db, secondWf.id, 'runMechanicalValidation', SYSTEM);
    runSemanticReview(db, { lessonId: ids.lessonId, workflowInstanceId: secondWf.id, actorContext: SYSTEM });
    transitionWorkflow(db, secondWf.id, 'runSemanticReview', SYSTEM);
    transitionWorkflow(db, secondWf.id, 'enterTeacherReview', SYSTEM);
    await decideAll(db, secondWf.id);
    const second = publishS1(db, { workflowInstanceId: secondWf.id, actorContext: TEACHER });
    assert.equal(second.versionNumber, 2);
    // 第二轮只含本轮 claim(轮次隔离),产物观察事实数与第一轮一致
    assert.equal(second.artifact.observedFacts.length, 6);
    const oldVersion = db.prepare('SELECT status FROM lesson_versions WHERE id = ?').get(first.lessonVersionId);
    assert.equal(oldVersion.status, 'SUPERSEDED');
    const newVersion = db.prepare('SELECT * FROM lesson_versions WHERE id = ?').get(second.lessonVersionId);
    assert.equal(newVersion.parent_version_id, first.lessonVersionId);
  } finally {
    cleanup();
  }
});

test('不可变:触发器拒绝修改已发布版本/claim statement/teacher_decisions/model_runs/audit', async () => {
  const { db, cleanup } = makeDb();
  try {
    const ids = setup(db);
    await runToTeacherReview(db, ids);
    await decideAll(db, ids.workflowId);
    const published = publishS1(db, { workflowInstanceId: ids.workflowId, actorContext: TEACHER });

    assert.throws(() =>
      db.prepare(`UPDATE lesson_versions SET content_json = '{}' WHERE id = ?`).run(published.lessonVersionId),
    );
    assert.throws(() => db.prepare(`DELETE FROM lesson_versions WHERE id = ?`).run(published.lessonVersionId));

    const claim = listS1Claims(db, ids.lessonId, { currentOnly: false })[0];
    assert.throws(() =>
      db.prepare('UPDATE teaching_claims SET statement = ? WHERE id = ?').run('篡改', claim.id),
    );

    const tdec = db.prepare('SELECT id FROM teacher_decisions LIMIT 1').get();
    assert.throws(() => db.prepare(`UPDATE teacher_decisions SET comment = 'x' WHERE id = ?`).run(tdec.id));
    assert.throws(() => db.prepare('DELETE FROM teacher_decisions WHERE id = ?').run(tdec.id));

    const run = db.prepare('SELECT id FROM model_runs LIMIT 1').get();
    assert.throws(() => db.prepare(`UPDATE model_runs SET model = 'x' WHERE id = ?`).run(run.id));
    assert.throws(() => db.prepare('DELETE FROM model_runs WHERE id = ?').run(run.id));

    const audit = db.prepare('SELECT id FROM audit_events LIMIT 1').get();
    assert.throws(() => db.prepare(`UPDATE audit_events SET event_type = 'x' WHERE id = ?`).run(audit.id));
    assert.throws(() => db.prepare('DELETE FROM audit_events WHERE id = ?').run(audit.id));

    const asset = insertKnowledgeAsset(db, { type: 'policy', title: '处方管理办法', actorContext: SYSTEM });
    const version = insertAssetVersion(db, { assetId: asset.id, version: 'v1', actorContext: SYSTEM });
    assert.throws(() => db.prepare('DELETE FROM asset_versions WHERE id = ?').run(version.id));

    // teacher_decisions 追加不覆盖:同一记录两次裁决 = 两行,最新生效
    const record = listDecisionRecords(db, ids.workflowId)[0];
    const before = db.prepare('SELECT COUNT(*) AS n FROM teacher_decisions WHERE decision_record_id = ?').get(record.id).n;
    await submitTeacherDecision(db, { decisionRecordId: record.id, decision: 'defer', reviewerId: 'teacher-01', actorContext: TEACHER });
    const after = db.prepare('SELECT COUNT(*) AS n FROM teacher_decisions WHERE decision_record_id = ?').get(record.id).n;
    assert.equal(after, before + 1);
    assert.equal(getEffectiveDecision(db, record.id).decision, 'defer');
  } finally {
    cleanup();
  }
});

test('并发:两个 transition 竞争 state_version,后到者 WF_VERSION_CONFLICT', async () => {
  const { db, cleanup } = makeDb();
  try {
    const ids = setup(db);
    // 推进到 MECHANICAL_VALIDATED(机械校验允许自环重跑,适合模拟并发竞争)
    importPretest(db, ids.lessonId, FIXTURE, SYSTEM);
    transitionWorkflow(db, ids.workflowId, 'markInputReady', SYSTEM);
    computeFacts(db, { ...ids, actorContext: SYSTEM });
    transitionWorkflow(db, ids.workflowId, 'computeFacts', SYSTEM);
    await generateClaimsRuleBased(db, { workflowInstanceId: ids.workflowId, ...ids, actorContext: SYSTEM });
    transitionWorkflow(db, ids.workflowId, 'attachEvidence', SYSTEM);
    await createDecisionRecords(db, { workflowInstanceId: ids.workflowId, actorContext: SYSTEM });
    transitionWorkflow(db, ids.workflowId, 'generateClaims', SYSTEM);
    runMechanicalValidation(db, { lessonId: ids.lessonId, workflowInstanceId: ids.workflowId, actorContext: SYSTEM });
    transitionWorkflow(db, ids.workflowId, 'runMechanicalValidation', SYSTEM);
    // 两个"并发"调用读到同一 state_version:第一个成功,第二个必须版本冲突
    const staleVersion = getWorkflow(db, ids.workflowId).state_version;
    transitionWorkflow(db, ids.workflowId, 'runMechanicalValidation', SYSTEM, { expectedStateVersion: staleVersion });
    assert.throws(
      () => transitionWorkflow(db, ids.workflowId, 'runMechanicalValidation', SYSTEM, { expectedStateVersion: staleVersion }),
      (err) => err.code === 'WF_VERSION_CONFLICT' && err.details.expected === staleVersion,
    );
  } finally {
    cleanup();
  }
});

test('可重放:同 fixture 同 calculationVersion 两次 computeFacts 完全一致', () => {
  const { db, cleanup } = makeDb();
  try {
    const ids = setup(db);
    importPretest(db, ids.lessonId, FIXTURE, SYSTEM);
    const first = computeFacts(db, { ...ids, actorContext: SYSTEM });
    const snapshot1 = listObservations(db, ids.lessonId).map((o) => [o.id, o.metric, o.value, o.numerator, o.denominator]);
    const second = computeFacts(db, { ...ids, actorContext: SYSTEM });
    const snapshot2 = listObservations(db, ids.lessonId).map((o) => [o.id, o.metric, o.value, o.numerator, o.denominator]);
    assert.equal(first.written.length, 28);
    assert.equal(second.written.length, 0);
    assert.equal(second.reused.length, 28);
    assert.deepEqual(snapshot2, snapshot1);
    // Q4 正确率与错误选项集中度符合 fixture 设计
    const q4 = db.prepare(`SELECT * FROM runtime_observations WHERE metric = 'pretest.accuracy.q4'`).get();
    assert.equal(q4.value, 0.1875);
    const q4b = db.prepare(`SELECT * FROM runtime_observations WHERE metric = 'pretest.option_share.q4.B'`).get();
    assert.ok(q4b.value >= 0.38);
  } finally {
    cleanup();
  }
});

test('provider:mock 确定性;registry 对 deepseek-cloud 抛 PROVIDER_NOT_ENABLED;model_runs 契约', async () => {
  const { db, cleanup } = makeDb();
  try {
    const mock = getProvider('mock');
    assert.ok(mock instanceof MockProvider);
    assert.equal(mock.capabilities().mock, true);
    const request = { model: 'mock-model', messages: [{ role: 'user', content: '诊断这批前测数据' }] };
    const r1 = await mock.generate(request);
    const r2 = await mock.generate(request);
    assert.deepEqual(r2, r1);
    assert.match(r1.inputHash, /^sha256:[a-f0-9]{64}$/);
    const r3 = await mock.generate({ ...request, messages: [{ role: 'user', content: '另一输入' }] });
    assert.notEqual(r3.inputHash, r1.inputHash);
    assert.equal((await mock.healthCheck()).ready, true);

    assert.throws(() => getProvider('deepseek-cloud'), (err) => err.code === 'PROVIDER_NOT_ENABLED');

    const mlx = new MlxProvider({
      modelBaseUrl: 'http://127.0.0.1:9/v1',
      modelName: 'fake',
      modelApiKey: '',
      modelTimeoutMs: 1000,
      modelStatusTimeoutMs: 100,
    });
    assert.equal(mlx.capabilities().name, 'existing-mlx');

    const ids = setup(db);
    const run = await recordModelRun(db, {
      workflowId: ids.workflowId,
      agentId: 'agt_test-agent',
      provider: 'mock',
      model: 'mock-model',
      thinkingMode: null,
      reasoningEffort: null,
      promptVersion: 'test-v1',
      inputRecordIds: [],
      evidenceIds: [],
      inputHash: r1.inputHash,
      outputHash: r1.outputHash,
      structuredOutput: { ok: true },
      latencyMs: 0,
      tokenUsage: null,
      validationStatus: 'PASSED',
      fallbackUsed: false,
      startedAt: nowIso(),
      completedAt: nowIso(),
      actorContext: SYSTEM,
    });
    assert.ok(run.modelRunId.startsWith('mrn_'));
    // 坏载荷被 schema 拒绝
    await assert.rejects(
      () => recordModelRun(db, { workflowId: ids.workflowId, agentId: 'agt-x', provider: 'mock', model: 'm', promptVersion: 'v', inputHash: 'bad' }),
      (err) => err instanceof SchemaValidationError,
    );
    assert.throws(() => db.prepare(`UPDATE model_runs SET model = 'x' WHERE id = ?`).run(run.modelRunId));
  } finally {
    cleanup();
  }
});

test('审计:全流程覆盖规定事件类型且全部带 event_hash', async () => {
  const { db, cleanup } = makeDb();
  try {
    const ids = setup(db);
    await runToTeacherReview(db, ids);
    await decideAll(db, ids.workflowId);
    publishS1(db, { workflowInstanceId: ids.workflowId, actorContext: TEACHER });

    const types = auditEventTypes(db);
    const required = [
      'workflow.created',
      'workflow.transitioned',
      'input.imported',
      'inputs.submitted',
      'facts.computed',
      'observation.computed',
      'evidence.attached',
      'evidence.retrieved',
      'claim.created',
      'claims.generated',
      'model_run.recorded',
      'mechanical.validation.completed',
      'gate.mechanical.completed',
      'semantic.review.completed',
      'review.semantic.completed',
      'teacher.decision.recorded',
      'teacher.accepted',
      'version.published',
      'lesson.published',
    ];
    for (const t of required) assert.ok(types.has(t), `缺少审计事件 ${t}`);
    const noHash = db.prepare('SELECT COUNT(*) AS n FROM audit_events WHERE event_hash IS NULL').get().n;
    assert.equal(noHash, 0);
    // payload 不含学生原始作答纪律:payload_json 中不得出现学生匿名 ID(LIKE 中 _ 需转义)
    const leaked = db
      .prepare(`SELECT COUNT(*) AS n FROM audit_events WHERE payload_json LIKE '%stu!_%' ESCAPE '!'`)
      .get().n;
    assert.equal(leaked, 0);
  } finally {
    cleanup();
  }
});

test('cancel:非终态可取消并留 cancelled_reason,终态拒绝', async () => {
  const { db, cleanup } = makeDb();
  try {
    const ids = setup(db);
    const cancelled = transitionWorkflow(db, ids.workflowId, 'cancel', TEACHER, { reason: '课时调整,本轮诊断作废' });
    assert.equal(cancelled.current_state, 'CANCELLED');
    assert.equal(cancelled.cancelled_reason, '课时调整,本轮诊断作废');
    assert.ok(auditEventTypes(db).has('workflow.cancelled'));
    assert.throws(
      () => transitionWorkflow(db, ids.workflowId, 'cancel', TEACHER, { reason: '再次取消' }),
      (err) => err.code === 'WF_ILLEGAL_TRANSITION',
    );
  } finally {
    cleanup();
  }
});

test('pretest fixture 结构校验:坏结构 PRETEST_FIXTURE_INVALID,版本不符 SCHEMA_VERSION_MISMATCH', () => {
  const { db, cleanup } = makeDb();
  try {
    const ids = setup(db);
    assert.throws(
      () => importPretest(db, ids.lessonId, { ...FIXTURE, schemaVersion: '2.0.0' }, SYSTEM),
      (err) => err.code === 'SCHEMA_VERSION_MISMATCH',
    );
    const broken = structuredClone(FIXTURE);
    broken.responses.push({ studentAnonId: 'stu_99', itemNo: 1, selectedOption: 'A', participated: 1, submittedAt: nowIso() });
    assert.throws(
      () => importPretest(db, ids.lessonId, broken, SYSTEM),
      (err) => err.code === 'PRETEST_FIXTURE_INVALID',
    );
  } finally {
    cleanup();
  }
});

test('supersedeClaim 与 mockReviewerV1 单元行为', async () => {
  const { db, cleanup } = makeDb();
  try {
    const ids = setup(db);
    importPretest(db, ids.lessonId, FIXTURE, SYSTEM);
    computeFacts(db, { ...ids, actorContext: SYSTEM });
    const { claims } = await generateClaimsRuleBased(db, { workflowInstanceId: ids.workflowId, ...ids, actorContext: SYSTEM });
    const target = claims[0];
    const { newClaimId } = await supersedeClaim(db, target.claimId, { statement: '修正后的表述', createdBy: 'teacher' }, TEACHER);
    const oldClaim = db.prepare('SELECT * FROM teaching_claims WHERE id = ?').get(target.claimId);
    const newClaim = db.prepare('SELECT * FROM teaching_claims WHERE id = ?').get(newClaimId);
    assert.equal(oldClaim.superseded_by, newClaimId);
    assert.equal(newClaim.supersedes_claim_id, target.claimId);
    assert.equal(newClaim.statement, '修正后的表述');
    assert.ok(auditEventTypes(db).has('claim.superseded'));

    // mock reviewer 固定规则
    const supported = mockReviewerV1({ claim_type: 'factual_claim', validation_status: 'PASSED', statement: 'Q1 正确率为 87.5%。' });
    assert.equal(supported.status, 'supported');
    assert.equal(supported.reviewerType, 'mock');
    const inference = mockReviewerV1({ claim_type: 'diagnostic_inference', validation_status: 'PASSED', statement: '部分学生可能混淆概念。' });
    assert.equal(inference.status, 'partially_supported');
    assert.ok(inference.alternativeExplanations.length > 0);
    const overreach = mockReviewerV1({ claim_type: 'factual_claim', validation_status: 'PASSED', statement: '所有学生必然混淆该概念。' });
    assert.equal(overreach.status, 'partially_supported');
    assert.ok(overreach.overreachRisks.length > 0);
    const failed = mockReviewerV1({ claim_type: 'factual_claim', validation_status: 'FAILED', statement: 'x' });
    assert.equal(failed.status, 'unsupported');
    assert.equal(failed.recommendedAction, 'reject');
  } finally {
    cleanup();
  }
});
