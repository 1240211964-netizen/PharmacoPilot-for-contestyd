// 教师裁决:TeachingDecisionRecord 组建 + TeacherDecision 追加式提交。
// 设计说明:本实现采用"一 claim 一 TDR"粒度——
//   teaching_decisions 表含单个 original_statement 语义(teacher_decisions.original_statement 与单条 claim 对应),
//   且 publish 需要按 claim 粒度排除 REJECTED/DEFERRED 内容,因此每条 claim 生成一条 TDR,
//   claim 按类型落入 observation/inference/recommendation 三个分组字段之一(其余为空数组)。
// 教师改变裁决 = 追加一条新 teacher_decisions 行(触发器禁 UPDATE/DELETE),TDR 上指针更新,历史全保留(B5)。
import { appendAuditEvent } from './audit.mjs';
import { fail, failCode } from './errors.mjs';
import { listEvidenceLinks, listS1Claims, supersedeClaimWithinTx } from './claims.mjs';
import { newId, nowIso } from './ids.mjs';
import { getWriteSchemaVersion, validateAgainstSchema } from './schemas.mjs';
import { S1_STAGE_ID } from './pretest.mjs';

const DECISION_QUESTION_BY_TYPE = Object.freeze({
  factual_claim: '是否确认该观察事实进入 S1 诊断产物?',
  diagnostic_inference: '是否确认该诊断推断成立并进入 S1 诊断产物?',
  teaching_recommendation: '是否采纳该教学建议进入 S1 教学行动?',
});

const DECISION_AUDIT_EVENT = Object.freeze({
  accept: 'teacher.accepted',
  revise: 'teacher.revised',
  reject: 'teacher.rejected',
  defer: 'teacher.deferred',
});

export function listDecisionRecords(db, workflowInstanceId) {
  return db
    .prepare('SELECT * FROM teaching_decisions WHERE workflow_instance_id = ? ORDER BY created_at, id')
    .all(workflowInstanceId);
}

// TDR 覆盖的唯一 claim id(一 claim 一 TDR 粒度)。
export function recordClaimId(record) {
  for (const column of ['observation_claim_ids_json', 'inference_claim_ids_json', 'recommendation_claim_ids_json']) {
    const ids = JSON.parse(record[column]);
    if (ids.length > 0) return ids[0];
  }
  return null;
}

// 当前生效裁决:最新一条 teacher_decisions(decided_at 最新,并列取后插入行)。
export function getEffectiveDecision(db, decisionRecordId) {
  return (
    db
      .prepare(
        `SELECT * FROM teacher_decisions WHERE decision_record_id = ?
         ORDER BY decided_at DESC, rowid DESC LIMIT 1`,
      )
      .get(decisionRecordId) ?? null
  );
}

// 为本 workflow 的全部当前 S1 claim 组建 TeachingDecisionRecord(每条 claim 一条)。
export async function createDecisionRecords(db, { workflowInstanceId, actorContext = {} } = {}) {
  const workflow = db.prepare('SELECT * FROM workflow_instances WHERE id = ?').get(workflowInstanceId);
  if (!workflow) failCode('WF_INSTANCE_NOT_FOUND', `工作流实例不存在: ${workflowInstanceId}`, { workflowInstanceId });
  const claims = listS1Claims(db, workflow.lesson_id, { workflowInstanceId });
  const records = [];
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const claim of claims) {
      const recordId = newId('tdr');
      const evidenceIds = listEvidenceLinks(db, claim.id).map((ev) => ev.id);
      const payload = {
        decisionRecordId: recordId,
        schemaVersion: await getWriteSchemaVersion('teaching-decision-record'),
        courseId: claim.course_id,
        classId: claim.class_id,
        lessonId: claim.lesson_id,
        stageId: S1_STAGE_ID,
        decisionQuestion: DECISION_QUESTION_BY_TYPE[claim.claim_type],
        observationClaimIds: claim.claim_type === 'factual_claim' ? [claim.id] : [],
        inferenceClaimIds: claim.claim_type === 'diagnostic_inference' ? [claim.id] : [],
        recommendationClaimIds: claim.claim_type === 'teaching_recommendation' ? [claim.id] : [],
        evidenceIds,
        mechanicalValidationStatus: claim.validation_status,
        semanticReviewStatus: claim.semantic_review_status,
        teacherDecisionId: null,
        workflowInstanceId,
        sourceLessonVersionId: null,
        targetLessonVersionId: null,
        status: 'OPEN',
        createdAt: nowIso(),
        publishedAt: null,
      };
      await validateAgainstSchema('teaching-decision-record', payload);
      db.prepare(
        `INSERT INTO teaching_decisions(
           id, course_id, class_id, lesson_id, stage_id, decision_question,
           observation_claim_ids_json, inference_claim_ids_json, recommendation_claim_ids_json,
           evidence_ids_json, mechanical_validation_status, semantic_review_status,
           teacher_decision_id, workflow_instance_id, source_lesson_version_id, target_lesson_version_id,
           status, created_at, published_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, NULL, 'OPEN', ?, NULL)`,
      ).run(
        recordId,
        payload.courseId,
        payload.classId,
        payload.lessonId,
        payload.stageId,
        payload.decisionQuestion,
        JSON.stringify(payload.observationClaimIds),
        JSON.stringify(payload.inferenceClaimIds),
        JSON.stringify(payload.recommendationClaimIds),
        JSON.stringify(payload.evidenceIds),
        payload.mechanicalValidationStatus,
        payload.semanticReviewStatus,
        workflowInstanceId,
        payload.createdAt,
      );
      // 回填 evidence_links.decision_id,把证据挂到决策记录上。
      db.prepare('UPDATE evidence_links SET decision_id = ? WHERE claim_id = ?').run(recordId, claim.id);
      appendAuditEvent(db, {
        eventType: 'decision_record.created',
        actorType: actorContext.actorType,
        actorId: actorContext.actorId,
        entityType: 'teaching_decision',
        entityId: recordId,
        workflowInstanceId,
        payload: { decisionRecordId: recordId, claimId: claim.id, claimType: claim.claim_type },
      });
      records.push(payload);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return { workflowInstanceId, records };
}

// 提交教师裁决(追加式)。revise 必须 editedStatement 非空;
// original_statement 一律取系统原文(claim.statement),调用方无从覆盖(B10)。
export async function submitTeacherDecision(
  db,
  { decisionRecordId, decision, reviewerId, editedStatement = null, comment = null, actorContext = {} } = {},
) {
  const record = db.prepare('SELECT * FROM teaching_decisions WHERE id = ?').get(decisionRecordId);
  if (!record) fail(404, 'DECISION_RECORD_NOT_FOUND', `TeachingDecisionRecord 不存在: ${decisionRecordId}`, { decisionRecordId });
  if (!['accept', 'revise', 'reject', 'defer'].includes(decision)) {
    failCode('TEACHER_DECISION_INVALID', `非法裁决动作: ${decision}`, { decision });
  }
  if (decision === 'revise' && (typeof editedStatement !== 'string' || editedStatement.trim() === '')) {
    failCode('TEACHER_DECISION_INVALID', 'revise 裁决必须提供非空 editedStatement', { decisionRecordId });
  }
  const claimId = recordClaimId(record);
  const claim = claimId ? db.prepare('SELECT * FROM teaching_claims WHERE id = ?').get(claimId) : null;
  if (!claim) failCode('TEACHER_DECISION_INVALID', `TDR ${decisionRecordId} 未关联有效 claim`, { decisionRecordId });

  const teacherDecisionId = newId('tdec');
  let revisedClaimId = null;
  db.exec('BEGIN IMMEDIATE');
  try {
    const payload = {
      teacherDecisionId,
      schemaVersion: await getWriteSchemaVersion('teacher-decision'),
      decisionRecordId,
      decision,
      reviewerId,
      originalStatement: claim.statement, // 系统原文,自动填充,不得由调用方覆盖
      editedStatement: decision === 'revise' ? editedStatement : null,
      comment,
      decidedAt: nowIso(),
    };
    await validateAgainstSchema('teacher-decision', payload);
    db.prepare(
      `INSERT INTO teacher_decisions(id, decision_record_id, decision, reviewer_id, original_statement, edited_statement, comment, decided_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      teacherDecisionId,
      decisionRecordId,
      decision,
      reviewerId,
      payload.originalStatement,
      payload.editedStatement,
      comment,
      payload.decidedAt,
    );
    // revise:按 supersede 链新建修订 claim,原 statement 不变(B2/B10)。
    if (decision === 'revise') {
      const superseded = await supersedeClaimWithinTx(db, claim.id, {
        statement: editedStatement,
        createdBy: 'teacher',
      }, { ...actorContext, workflowInstanceId: record.workflow_instance_id });
      revisedClaimId = superseded.newClaimId;
    }
    db.prepare(`UPDATE teaching_decisions SET teacher_decision_id = ?, status = 'DECIDED' WHERE id = ?`).run(
      teacherDecisionId,
      decisionRecordId,
    );
    appendAuditEvent(db, {
      eventType: 'teacher.decision.recorded',
      actorType: actorContext.actorType ?? 'teacher',
      actorId: actorContext.actorId ?? reviewerId,
      entityType: 'teaching_decision',
      entityId: decisionRecordId,
      workflowInstanceId: record.workflow_instance_id,
      payload: { decisionRecordId, teacherDecisionId, decision, revisedClaimId, courseId: record.course_id },
    });
    appendAuditEvent(db, {
      eventType: DECISION_AUDIT_EVENT[decision],
      actorType: actorContext.actorType ?? 'teacher',
      actorId: actorContext.actorId ?? reviewerId,
      entityType: 'teaching_decision',
      entityId: decisionRecordId,
      workflowInstanceId: record.workflow_instance_id,
      payload: { decisionRecordId, teacherDecisionId, decision, revisedClaimId, courseId: record.course_id },
    });
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return {
    teacherDecisionId,
    decisionRecordId,
    decision,
    revisedClaimId,
    effective: getEffectiveDecision(db, decisionRecordId),
  };
}
