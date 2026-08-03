// 发布门禁与 S1 产物生成。
// 事务内完成:裁决齐备校验 -> 机械门禁终检 -> 产物组装 -> 新增 lesson_versions(PUBLISHED)->
// 旧 PUBLISHED 版本纯 status 翻转 SUPERSEDED(触发器唯一放行路径)-> TDR 置 PUBLISHED -> 工作流转 PUBLISHED。
// 纪律(B9/B11):PENDING 阻断发布;REJECTED 不进产物;DEFERRED 只进 unresolvedQuestions;
// 进入产物的 claim 必须机械门禁 PASSED 且不由 superseded 来源独立支撑。
import { appendAuditEvent } from './audit.mjs';
import { failCode } from './errors.mjs';
import { listEvidenceLinks } from './claims.mjs';
import { getEffectiveDecision, listDecisionRecords, recordClaimId } from './decisions.mjs';
import { newId, nowIso } from './ids.mjs';
import { CURRENT_SCHEMA_VERSION } from './schemas.mjs';

// B11 运行时终检:进入产物的 claim 不得由 superseded/withdrawn/expired 来源独立支撑。
function assertNotSoleSupersededSource(db, claimId) {
  const links = listEvidenceLinks(db, claimId);
  const versionLinks = links.filter((l) => l.source_version_id != null);
  if (versionLinks.length === 0) return;
  const allInactive = versionLinks.every((l) => {
    const version = db.prepare('SELECT source_status FROM asset_versions WHERE id = ?').get(l.source_version_id);
    return !version || version.source_status !== 'active';
  });
  const hasActiveObservation = links.some(
    (l) => l.runtime_observation_id != null && db.prepare('SELECT 1 FROM runtime_observations WHERE id = ?').get(l.runtime_observation_id),
  );
  if (allInactive && !hasActiveObservation) {
    failCode('GATE_VALIDATION_FAILED', `claim ${claimId} 的全部有效来源均已被 supersede,不得进入发布产物(B11)`, {
      claimId,
    });
  }
}

function statementExcerpt(text, max = 40) {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

export function publishS1(db, { workflowInstanceId, actorContext = {}, expectedStateVersion = null } = {}) {
  const result = {};
  db.exec('BEGIN IMMEDIATE');
  try {
    const workflow = db.prepare('SELECT * FROM workflow_instances WHERE id = ?').get(workflowInstanceId);
    if (!workflow) failCode('WF_INSTANCE_NOT_FOUND', `工作流实例不存在: ${workflowInstanceId}`, { workflowInstanceId });
    if (workflow.current_state !== 'TEACHER_REVIEW') {
      failCode('WF_ILLEGAL_TRANSITION', `当前状态 ${workflow.current_state} 不允许 publish`, {
        from: workflow.current_state,
        action: 'publish',
      });
    }
    if (expectedStateVersion != null && expectedStateVersion !== workflow.state_version) {
      failCode('WF_VERSION_CONFLICT', 'state_version 乐观锁冲突', {
        expected: expectedStateVersion,
        actual: workflow.state_version,
      });
    }

    const records = listDecisionRecords(db, workflowInstanceId);
    const pending = records.filter((r) => r.teacher_decision_id == null);
    if (records.length === 0 || pending.length > 0) {
      failCode('PUBLISH_NO_TEACHER_DECISION', '存在未裁决(PENDING)的 TeachingDecisionRecord,不得发布', {
        workflowInstanceId,
        pendingRecordIds: pending.map((r) => r.id),
      });
    }

    // 按生效裁决分类:accept/revise 进产物;reject 排除;defer 进未解决问题。
    const included = [];
    const deferred = [];
    for (const record of records) {
      const effective = getEffectiveDecision(db, record.id);
      const claimId = recordClaimId(record);
      const claim = db.prepare('SELECT * FROM teaching_claims WHERE id = ?').get(claimId);
      if (effective.decision === 'reject') continue;
      if (effective.decision === 'defer') {
        deferred.push({ record, effective, claim });
        continue;
      }
      included.push({ record, effective, claim });
    }

    // 机械门禁终检:进产物的 claim 必须 PASSED,且不由 superseded 来源独立支撑。
    // (revise 的修订 claim 由教师直接负责,门禁以系统原 claim 的校验状态为准。)
    for (const { claim } of included) {
      if (claim.validation_status !== 'PASSED') {
        failCode('GATE_VALIDATION_FAILED', `claim ${claim.id} 机械门禁状态为 ${claim.validation_status},不得进入发布产物`, {
          claimId: claim.id,
          validationStatus: claim.validation_status,
        });
      }
      assertNotSoleSupersededSource(db, claim.id);
    }

    const publishedAt = nowIso();
    const toEntry = ({ effective, claim }) => {
      const revised = effective.decision === 'revise';
      return {
        claimId: claim.id,
        claimType: claim.claim_type,
        statement: revised ? effective.edited_statement : claim.statement,
        ...(revised ? { originalStatement: claim.statement, revisedBy: effective.reviewer_id } : {}),
        evidenceIds: listEvidenceLinks(db, claim.id).map((ev) => ev.id),
      };
    };
    const observedFacts = included.filter((i) => i.claim.claim_type === 'factual_claim').map(toEntry);
    const confirmedDiagnoses = included.filter((i) => i.claim.claim_type === 'diagnostic_inference').map(toEntry);
    const confirmedTeachingActions = included.filter((i) => i.claim.claim_type === 'teaching_recommendation').map(toEntry);
    const unresolvedQuestions = deferred.map(({ effective, claim }) => ({
      claimId: claim.id,
      claimType: claim.claim_type,
      statement: claim.statement,
      deferComment: effective.comment ?? null,
    }));
    const followUpSignals = [
      ...confirmedDiagnoses.map((d) => ({
        signalType: 'recheck_misconception',
        description: `在后续课时前测或课堂提问中复测以下误解是否消除:${statementExcerpt(d.statement)}`,
      })),
      ...confirmedTeachingActions.map((a) => ({
        signalType: 'verify_action_effect',
        targetStageId: db.prepare('SELECT target_stage_id FROM teaching_claims WHERE id = ?').get(a.claimId)?.target_stage_id ?? null,
        description: `在目标环节观察以下教学行动的效果:${statementExcerpt(a.statement)}`,
      })),
    ];
    const evidenceSeen = new Map();
    for (const { claim } of included) {
      for (const ev of listEvidenceLinks(db, claim.id)) {
        evidenceSeen.set(ev.id, {
          evidenceId: ev.id,
          evidenceType: ev.evidence_type,
          sourceId: ev.source_id,
          sourceVersionId: ev.source_version_id,
          runtimeObservationId: ev.runtime_observation_id,
          pageIndex: ev.page_index,
          pageLabel: ev.page_label,
        });
      }
    }

    const artifact = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      artifactType: 'S1_DIAGNOSIS_ARTIFACT',
      courseId: workflow.course_id,
      classId: workflow.class_id,
      lessonId: workflow.lesson_id,
      workflowInstanceId,
      diagnosisScope: { stageId: 'S1', description: '课前学情诊断与教学决策' },
      observedFacts,
      confirmedDiagnoses,
      confirmedTeachingActions,
      unresolvedQuestions,
      followUpSignals,
      supportingEvidence: [...evidenceSeen.values()],
      publishedBy: actorContext.actorId ?? 'unknown',
      publishedAt,
    };

    // 版本链:新版本号 = max+1(check 14:必须是新增号),parent 指向当前最新行;
    // 既有 PUBLISHED 行纯 status 翻转 SUPERSEDED(触发器唯一放行的 UPDATE)。
    const latest = db
      .prepare('SELECT * FROM lesson_versions WHERE lesson_id = ? ORDER BY version_number DESC LIMIT 1')
      .get(workflow.lesson_id);
    const versionNumber = (latest?.version_number ?? 0) + 1;
    const versionId = newId('lvr');
    if (latest?.status === 'PUBLISHED') {
      db.prepare(`UPDATE lesson_versions SET status = 'SUPERSEDED' WHERE id = ?`).run(latest.id);
    }
    db.prepare(
      `INSERT INTO lesson_versions(id, lesson_id, version_number, parent_version_id, status, content_json, created_by, created_at, published_at)
       VALUES (?, ?, ?, ?, 'PUBLISHED', ?, ?, ?, ?)`,
    ).run(versionId, workflow.lesson_id, versionNumber, latest?.id ?? null, JSON.stringify(artifact), artifact.publishedBy, publishedAt, publishedAt);

    db.prepare(
      `UPDATE teaching_decisions SET status = 'PUBLISHED', published_at = ?, target_lesson_version_id = ?
       WHERE workflow_instance_id = ?`,
    ).run(publishedAt, versionId, workflowInstanceId);

    const update = db
      .prepare(
        `UPDATE workflow_instances SET current_state = 'PUBLISHED', state_version = state_version + 1, updated_at = ?
         WHERE id = ? AND state_version = ?`,
      )
      .run(publishedAt, workflowInstanceId, workflow.state_version);
    if (update.changes === 0) {
      failCode('WF_VERSION_CONFLICT', 'state_version 乐观锁冲突', { workflowInstanceId });
    }

    appendAuditEvent(db, {
      eventType: 'version.published',
      actorType: actorContext.actorType,
      actorId: actorContext.actorId,
      entityType: 'lesson_version',
      entityId: versionId,
      workflowInstanceId,
      payload: { lessonVersionId: versionId, versionNumber, lessonId: workflow.lesson_id, courseId: workflow.course_id },
    });
    appendAuditEvent(db, {
      eventType: 'lesson.published',
      actorType: actorContext.actorType,
      actorId: actorContext.actorId,
      entityType: 'lesson',
      entityId: workflow.lesson_id,
      workflowInstanceId,
      payload: { lessonVersionId: versionId, versionNumber, courseId: workflow.course_id },
    });
    appendAuditEvent(db, {
      eventType: 'workflow.transitioned',
      actorType: actorContext.actorType,
      actorId: actorContext.actorId,
      entityType: 'workflow_instance',
      entityId: workflowInstanceId,
      workflowInstanceId,
      previousState: 'TEACHER_REVIEW',
      nextState: 'PUBLISHED',
      payload: { action: 'publish', lessonVersionId: versionId },
    });
    db.exec('COMMIT');
    Object.assign(result, { lessonVersionId: versionId, versionNumber, artifact });
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return result;
}
