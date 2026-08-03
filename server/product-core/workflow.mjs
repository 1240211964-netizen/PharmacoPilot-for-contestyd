// S1 主状态机服务:唯一合法转移入口(B8)。
// 严格按 docs/product-core/s1-state-machine.md §3 转移表实现:
//   BEGIN IMMEDIATE 内读 current_state + state_version,非法转移抛 WF_ILLEGAL_TRANSITION(带 from/action),
//   乐观锁冲突抛 WF_VERSION_CONFLICT;每次成功转移写审计(previous_state/next_state)。
// 守卫失败同样以 WF_ILLEGAL_TRANSITION 抛出,details.reason 说明未满足的前置条件。
// 审计分工:本服务写 workflow.transitioned 及转移表列出的转移级事件;
// 领域事件(facts.computed / claim.created / mechanical.validation.completed 等)由各对应服务写入。
import { appendAuditEvent } from './audit.mjs';
import { fail, failCode } from './errors.mjs';
import { listS1Claims } from './claims.mjs';
import { newId, nowIso } from './ids.mjs';
import { publishS1 } from './publish.mjs';

export const STATE_MACHINE_VERSION = '1.0.0';
export const TERMINAL_STATES = new Set(['PUBLISHED', 'CANCELLED']);

function guardInputsReady(db, workflow) {
  const items = db.prepare('SELECT COUNT(*) AS n FROM pretest_items WHERE lesson_id = ?').get(workflow.lesson_id).n;
  const responses = db
    .prepare(
      `SELECT COUNT(*) AS n FROM pretest_responses r
       JOIN pretest_items i ON i.id = r.item_id WHERE i.lesson_id = ?`,
    )
    .get(workflow.lesson_id).n;
  if (items === 0 || responses === 0) {
    return `前测题目/作答未导入(items=${items}, responses=${responses})`;
  }
  return null;
}

function guardFactsComputed(db, workflow) {
  const n = db
    .prepare('SELECT COUNT(*) AS n FROM runtime_observations WHERE lesson_id = ?')
    .get(workflow.lesson_id).n;
  return n === 0 ? '该 lesson 尚无 runtime_observation' : null;
}

function guardEvidenceRetrieved(db, workflow) {
  const factuals = listS1Claims(db, workflow.lesson_id).filter((c) => c.claim_type === 'factual_claim');
  for (const claim of factuals) {
    const n = db.prepare('SELECT COUNT(*) AS n FROM evidence_links WHERE claim_id = ?').get(claim.id).n;
    // 显式 NO_KNOWLEDGE_EVIDENCE 标记本身也是一条 evidence_links 行,因此计数覆盖两种合法形态。
    if (n === 0) return `factual_claim ${claim.id} 无证据绑定且未显式标记无知识证据`;
  }
  return null;
}

function guardClaimsGenerated(db, workflow) {
  const claims = listS1Claims(db, workflow.lesson_id);
  if (claims.length === 0) return '尚无 teaching_claim';
  const records = db
    .prepare('SELECT COUNT(*) AS n FROM teaching_decisions WHERE workflow_instance_id = ?')
    .get(workflow.id).n;
  if (records === 0) return '尚无 TeachingDecisionRecord';
  return null;
}

function guardMechanicalValidated(db, workflow) {
  const pending = listS1Claims(db, workflow.lesson_id).filter((c) => c.validation_status === 'PENDING');
  return pending.length > 0 ? `存在未跑机械校验的 claim: ${pending.map((c) => c.id).join(', ')}` : null;
}

function guardSemanticReviewed(db, workflow) {
  const pending = listS1Claims(db, workflow.lesson_id).filter((c) => c.semantic_review_status === 'not_reviewed');
  return pending.length > 0 ? `存在未跑语义审查的 claim: ${pending.map((c) => c.id).join(', ')}` : null;
}

// 冻结转移表(机械校验允许在 MECHANICAL_VALIDATED 内自环重跑,结果覆盖当次留档)。
// 导出供 API 层计算"当前状态可用动作"(只读,不绕过 transitionWorkflow)。
export const TRANSITIONS = Object.freeze({
  markInputReady: { from: ['DRAFT'], to: 'INPUT_READY', guard: guardInputsReady, event: 'inputs.submitted' },
  computeFacts: { from: ['INPUT_READY'], to: 'FACTS_COMPUTED', guard: guardFactsComputed, event: null },
  attachEvidence: { from: ['FACTS_COMPUTED'], to: 'EVIDENCE_RETRIEVED', guard: guardEvidenceRetrieved, event: 'evidence.retrieved' },
  generateClaims: { from: ['EVIDENCE_RETRIEVED'], to: 'CLAIMS_GENERATED', guard: guardClaimsGenerated, event: 'claims.generated' },
  runMechanicalValidation: {
    from: ['CLAIMS_GENERATED', 'MECHANICAL_VALIDATED'],
    to: 'MECHANICAL_VALIDATED',
    guard: guardMechanicalValidated,
    event: 'gate.mechanical.completed',
  },
  runSemanticReview: { from: ['MECHANICAL_VALIDATED'], to: 'SEMANTIC_REVIEWED', guard: guardSemanticReviewed, event: 'review.semantic.completed' },
  enterTeacherReview: { from: ['SEMANTIC_REVIEWED'], to: 'TEACHER_REVIEW', guard: null, event: null },
  publish: { from: ['TEACHER_REVIEW'], to: 'PUBLISHED', guard: null, event: null }, // 走 publishS1 的门禁
});

export function createWorkflow(db, { courseId, classId, lessonId, createdBy, actorContext = {} } = {}) {
  const id = newId('wf');
  const now = nowIso();
  db.prepare(
    `INSERT INTO workflow_instances(
       id, workflow_type, course_id, class_id, lesson_id, current_state,
       state_version, state_machine_version, created_by, cancelled_reason, created_at, updated_at
     ) VALUES (?, 'S1_DIAGNOSIS', ?, ?, ?, 'DRAFT', 1, ?, ?, NULL, ?, ?)`,
  ).run(id, courseId, classId, lessonId, STATE_MACHINE_VERSION, createdBy ?? actorContext.actorId ?? 'system', now, now);
  appendAuditEvent(db, {
    eventType: 'workflow.created',
    actorType: actorContext.actorType,
    actorId: actorContext.actorId ?? createdBy,
    entityType: 'workflow_instance',
    entityId: id,
    workflowInstanceId: id,
    nextState: 'DRAFT',
    payload: { workflowType: 'S1_DIAGNOSIS', lessonId, stateMachineVersion: STATE_MACHINE_VERSION },
  });
  return getWorkflow(db, id);
}

export function getWorkflow(db, instanceId) {
  return db.prepare('SELECT * FROM workflow_instances WHERE id = ?').get(instanceId) ?? null;
}

// options.expectedStateVersion:调用方声明读到的版本,不一致即 WF_VERSION_CONFLICT(并发测试与 API 层用)。
// options.reason:cancel 必填。
export function transitionWorkflow(db, instanceId, action, actorContext = {}, options = {}) {
  if (action === 'publish') {
    // 发布门禁与产物生成由 publish.mjs 在单事务内完成(含状态翻转与审计)。
    return publishS1(db, { workflowInstanceId: instanceId, actorContext, expectedStateVersion: options.expectedStateVersion });
  }
  const transition = TRANSITIONS[action];
  db.exec('BEGIN IMMEDIATE');
  try {
    const workflow = getWorkflow(db, instanceId);
    if (!workflow) failCode('WF_INSTANCE_NOT_FOUND', `工作流实例不存在: ${instanceId}`, { workflowInstanceId: instanceId });

    if (action === 'cancel') {
      if (TERMINAL_STATES.has(workflow.current_state)) {
        failCode('WF_ILLEGAL_TRANSITION', `终态 ${workflow.current_state} 不允许 cancel`, {
          from: workflow.current_state,
          action,
        });
      }
      if (typeof options.reason !== 'string' || options.reason.trim() === '') {
        fail(422, 'WF_CANCEL_REASON_REQUIRED', 'cancel 必须提供 reason', { workflowInstanceId: instanceId });
      }
    } else if (!transition || !transition.from.includes(workflow.current_state)) {
      failCode('WF_ILLEGAL_TRANSITION', `当前状态 ${workflow.current_state} 不允许动作 ${action}`, {
        from: workflow.current_state,
        action,
      });
    }

    if (options.expectedStateVersion != null && options.expectedStateVersion !== workflow.state_version) {
      failCode('WF_VERSION_CONFLICT', 'state_version 乐观锁冲突', {
        expected: options.expectedStateVersion,
        actual: workflow.state_version,
      });
    }

    const nextState = action === 'cancel' ? 'CANCELLED' : transition.to;
    if (action !== 'cancel' && transition.guard) {
      const reason = transition.guard(db, workflow);
      if (reason) {
        failCode('WF_ILLEGAL_TRANSITION', `转移 ${workflow.current_state} -> ${nextState} 前置条件未满足: ${reason}`, {
          from: workflow.current_state,
          action,
          reason,
        });
      }
    }

    const now = nowIso();
    const update = db
      .prepare(
        `UPDATE workflow_instances
         SET current_state = ?, state_version = state_version + 1, updated_at = ?,
             cancelled_reason = CASE WHEN ? = 'CANCELLED' THEN ? ELSE cancelled_reason END
         WHERE id = ? AND state_version = ?`,
      )
      .run(nextState, now, nextState, options.reason ?? null, instanceId, workflow.state_version);
    if (update.changes === 0) {
      failCode('WF_VERSION_CONFLICT', 'state_version 乐观锁冲突', { workflowInstanceId: instanceId });
    }

    appendAuditEvent(db, {
      eventType: 'workflow.transitioned',
      actorType: actorContext.actorType,
      actorId: actorContext.actorId,
      entityType: 'workflow_instance',
      entityId: instanceId,
      workflowInstanceId: instanceId,
      previousState: workflow.current_state,
      nextState,
      payload: { action },
    });
    if (action === 'cancel') {
      appendAuditEvent(db, {
        eventType: 'workflow.cancelled',
        actorType: actorContext.actorType,
        actorId: actorContext.actorId,
        entityType: 'workflow_instance',
        entityId: instanceId,
        workflowInstanceId: instanceId,
        previousState: workflow.current_state,
        nextState: 'CANCELLED',
        payload: { reason: options.reason },
      });
    } else if (transition.event) {
      appendAuditEvent(db, {
        eventType: transition.event,
        actorType: actorContext.actorType,
        actorId: actorContext.actorId,
        entityType: 'workflow_instance',
        entityId: instanceId,
        workflowInstanceId: instanceId,
        previousState: workflow.current_state,
        nextState,
        payload: { action },
      });
    }
    db.exec('COMMIT');
    return getWorkflow(db, instanceId);
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
