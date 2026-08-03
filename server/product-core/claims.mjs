// TeachingClaim 生成(规则版)与证据锚定。
// 三类 claim 分开存储:factual_claim(观察事实,confirmed)/ diagnostic_inference(provisional)/
// teaching_recommendation(provisional)。规则全部是显式常量表,不硬编码任何模型/prompt。
// 每条 claim 入库前过 teaching-claim schema 校验;statement 一经写入不可改(触发器),修正走 supersedeClaim。
import { appendAuditEvent, canonicalJson, sha256Hex } from './audit.mjs';
import { failCode } from './errors.mjs';
import { newId, nowIso } from './ids.mjs';
import { recordModelRun } from './model-runs.mjs';
import { getWriteSchemaVersion, validateAgainstSchema } from './schemas.mjs';
import { DEFAULT_CALCULATION_VERSION, S1_STAGE_ID } from './pretest.mjs';

// 显式规则常量表(可审阅、可调整;改动 = 改规则,不是改代码路径)。
export const CLAIM_RULES = Object.freeze({
  // factual:每个关键指标生成一条事实陈述
  factualMetrics: Object.freeze({
    itemAccuracyPrefix: 'pretest.accuracy.q',
    participation: 'pretest.participation',
    overallAccuracy: 'pretest.overall_accuracy',
  }),
  // inference:题目正确率低于阈值且某错误选项集中度达到阈值 -> 概念混淆推断
  inference: Object.freeze({
    accuracyBelow: 0.3,
    wrongOptionShareAtLeast: 0.35,
    statement: ({ itemNo, accuracyPct, correctNum, totalNum, optionKey, sharePct, shareNum, tag }) =>
      `部分学生可能将「${tag}」相关概念混淆:Q${itemNo} 正确率仅 ${accuracyPct}%(${correctNum}/${totalNum}),` +
      `且 ${sharePct}%(${shareNum}/${totalNum})的学生集中选择错误选项 ${optionKey},提示存在系统性误解(待教师确认)。`,
  }),
  // recommendation:与 inference 配套的教学建议
  recommendation: Object.freeze({
    targetStageId: 'S5',
    targetStageName: 'S5(活动体验)',
    statement: ({ itemNo, optionKey, tag }) =>
      `建议在 S5(活动体验)环节针对 Q${itemNo} 涉及的「${tag}」知识点安排对比辨析活动;` +
      `适用对象:选择错误选项 ${optionKey} 的学生群体;该建议由系统规则生成,适用性与效果待教师验证。`,
  }),
});

// 无知识证据的显式标记(B6 的豁免通道):manual_reference + 固定 quote。
export const NO_KNOWLEDGE_EVIDENCE_QUOTE = 'NO_KNOWLEDGE_EVIDENCE';

function percentText(value) {
  return String(Number((value * 100).toFixed(2)));
}

// 列出某 lesson 的 S1 claim。
// workflowInstanceId 可选:给定则只返回本轮工作流的 claim——
// migration 005 起 teaching_claims.workflow_instance_id 为一等列(NOT NULL + FK),
// 直接按列过滤;教师修订 claim 在 supersede 时继承原 claim 的轮次(见 supersedeClaimWithinTx)。
export function listS1Claims(db, lessonId, { currentOnly = true, workflowInstanceId = null } = {}) {
  const currentFilter = currentOnly ? ' AND superseded_by IS NULL' : '';
  if (workflowInstanceId) {
    return db
      .prepare(
        `SELECT * FROM teaching_claims
         WHERE lesson_id = ? AND stage_id = ? AND workflow_instance_id = ?${currentFilter}
         ORDER BY created_at, id`,
      )
      .all(lessonId, S1_STAGE_ID, workflowInstanceId);
  }
  return db
    .prepare(
      `SELECT * FROM teaching_claims WHERE lesson_id = ? AND stage_id = ?${currentFilter}
       ORDER BY created_at, id`,
    )
    .all(lessonId, S1_STAGE_ID);
}

export function listEvidenceLinks(db, claimId) {
  return db.prepare('SELECT * FROM evidence_links WHERE claim_id = ? ORDER BY retrieved_at, id').all(claimId);
}

export function claimHasNoKnowledgeEvidenceMarker(db, claimId) {
  return Boolean(
    db
      .prepare(
        `SELECT 1 FROM evidence_links
         WHERE claim_id = ? AND evidence_type = 'manual_reference' AND verbatim_quote = ?`,
      )
      .get(claimId, NO_KNOWLEDGE_EVIDENCE_QUOTE),
  );
}

// workflow_instance_id 自 migration 005 起为 NOT NULL + FK 列:规则生成器必知本轮 workflow,
// 教师修订 claim 继承原 claim 的轮次;为 NULL 时由数据库约束直接报错(绝不静默)。
function insertClaimRow(db, claim, workflowInstanceId) {
  db.prepare(
    `INSERT INTO teaching_claims(
       id, claim_type, statement, stage_id, target_stage_id, course_id, class_id, lesson_id,
       workflow_instance_id, confidence_status, validation_status, created_by, created_from_model_run_id,
       supersedes_claim_id, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?)`,
  ).run(
    claim.claimId,
    claim.claimType,
    claim.statement,
    claim.stageId,
    claim.targetStageId,
    claim.scope.courseId,
    claim.scope.classId,
    claim.scope.lessonId,
    workflowInstanceId,
    claim.confidenceStatus,
    claim.createdBy,
    claim.createdFromModelRunId,
    claim.supersedesClaimId,
    claim.createdAt,
  );
}

// 入库前 schema 校验:对象结构与 schemas/v1/teaching-claim.schema.json 对齐。
async function validateClaimPayload(payload) {
  await validateAgainstSchema('teaching-claim', payload);
}

export function insertEvidenceLink(
  db,
  {
    claimId,
    decisionId = null,
    evidenceType,
    sourceId,
    sourceVersionId = null,
    contentBlockId = null,
    runtimeObservationId = null,
    pageIndex = null,
    pageLabel = null,
    bbox = null,
    bboxCoordinateSystem = 'none',
    verbatimQuote = null,
    normalizedQuote = null,
    sourceStatus = 'active',
    effectiveDate = null,
    contentHash = null,
    id = null,
  } = {},
) {
  if (bbox !== null && bboxCoordinateSystem === 'none') {
    failCode('EVIDENCE_ANCHOR_INVALID', 'bbox 非空时 bboxCoordinateSystem 不得为 none', { claimId });
  }
  const evidenceId = id ?? newId('ev');
  db.prepare(
    `INSERT INTO evidence_links(
       id, claim_id, decision_id, evidence_type, source_id, source_version_id, content_block_id,
       runtime_observation_id, page_index, page_label, bbox_json, bbox_coordinate_system,
       verbatim_quote, normalized_quote, source_status, effective_date, superseded_by, content_hash, retrieved_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
  ).run(
    evidenceId,
    claimId,
    decisionId,
    evidenceType,
    sourceId,
    sourceVersionId,
    contentBlockId,
    runtimeObservationId,
    pageIndex,
    pageLabel,
    bbox === null ? null : JSON.stringify(bbox),
    bboxCoordinateSystem,
    verbatimQuote,
    normalizedQuote ?? verbatimQuote,
    sourceStatus,
    effectiveDate,
    contentHash,
    nowIso(),
  );
  return evidenceId;
}

// 把一条 runtime_observation 绑定为 claim 证据(运行数据证据)。id 可预生成以便先校验后落库。
function attachObservationEvidence(db, claimId, observation, id = null) {
  const quote = `${observation.metric} = ${observation.value} (${observation.numerator}/${observation.denominator})`;
  return insertEvidenceLink(db, {
    id,
    claimId,
    evidenceType: 'runtime_observation',
    sourceId: observation.id,
    runtimeObservationId: observation.id,
    verbatimQuote: quote,
    contentHash: `sha256:${sha256Hex(canonicalJson(observation))}`,
  });
}

// 知识资产证据锚定:锚 assetVersion + contentBlock + page + 逐字引用(金标准锚定纪律)。
export function attachKnowledgeEvidence(
  db,
  { claimId, assetVersionId, contentBlockId, verbatimQuote, bbox = null, bboxCoordinateSystem = 'none', actorContext = {} } = {},
) {
  const version = db.prepare('SELECT * FROM asset_versions WHERE id = ?').get(assetVersionId);
  if (!version) failCode('EVIDENCE_ANCHOR_INVALID', `asset_version 不存在: ${assetVersionId}`, { assetVersionId });
  const block = db.prepare('SELECT * FROM content_blocks WHERE id = ?').get(contentBlockId);
  if (!block || block.asset_version_id !== assetVersionId) {
    failCode('EVIDENCE_ANCHOR_INVALID', `content_block 不存在或不属于该 asset_version`, {
      assetVersionId,
      contentBlockId,
    });
  }
  const evidenceId = insertEvidenceLink(db, {
    claimId,
    evidenceType: 'knowledge_block',
    sourceId: version.asset_id,
    sourceVersionId: assetVersionId,
    contentBlockId,
    pageIndex: block.page_index,
    pageLabel: block.page_label,
    bbox,
    bboxCoordinateSystem,
    verbatimQuote,
    sourceStatus: version.source_status,
    effectiveDate: version.effective_date,
    contentHash: block.content_hash,
  });
  appendAuditEvent(db, {
    eventType: 'evidence.attached',
    actorType: actorContext.actorType,
    actorId: actorContext.actorId,
    entityType: 'claim',
    entityId: claimId,
    payload: { claimId, evidenceId, evidenceType: 'knowledge_block', assetVersionId },
  });
  return evidenceId;
}

// 显式声明"该 factual claim 无知识证据"(供 EVIDENCE_RETRIEVED 守卫与门禁识别)。
export function attachNoKnowledgeEvidenceMarker(db, { claimId, lessonId, actorContext = {} } = {}) {
  const evidenceId = insertEvidenceLink(db, {
    claimId,
    evidenceType: 'manual_reference',
    sourceId: lessonId,
    verbatimQuote: NO_KNOWLEDGE_EVIDENCE_QUOTE,
  });
  appendAuditEvent(db, {
    eventType: 'evidence.attached',
    actorType: actorContext.actorType,
    actorId: actorContext.actorId,
    entityType: 'claim',
    entityId: claimId,
    payload: { claimId, evidenceId, evidenceType: 'manual_reference', marker: NO_KNOWLEDGE_EVIDENCE_QUOTE },
  });
  return evidenceId;
}

async function createClaimWithEvidence(
  db,
  { claimType, statement, targetStageId, scope, confidenceStatus, createdBy, createdFromModelRunId, observations, actorContext },
) {
  const claimId = newId('clm');
  // FK 约束要求先插 claim 再插 evidence_links:证据 ID 预生成,先校验后落库。
  const evidenceIds = observations.map(() => newId('ev'));
  const payload = {
    claimId,
    schemaVersion: await getWriteSchemaVersion('teaching-claim'),
    claimType,
    statement,
    stageId: S1_STAGE_ID,
    targetStageId,
    scope,
    evidenceIds,
    confidenceStatus,
    validationStatus: 'PENDING',
    createdBy,
    createdFromModelRunId,
    supersedesClaimId: null,
    createdAt: nowIso(),
  };
  await validateClaimPayload(payload);
  insertClaimRow(db, payload, actorContext.workflowInstanceId ?? null);
  observations.forEach((obs, index) => attachObservationEvidence(db, claimId, obs, evidenceIds[index]));
  appendAuditEvent(db, {
    eventType: 'claim.created',
    actorType: actorContext.actorType,
    actorId: actorContext.actorId,
    entityType: 'claim',
    entityId: claimId,
    workflowInstanceId: actorContext.workflowInstanceId ?? null,
    payload: { claimId, claimType, confidenceStatus, evidenceIds, courseId: scope.courseId },
  });
  appendAuditEvent(db, {
    eventType: 'evidence.attached',
    actorType: actorContext.actorType,
    actorId: actorContext.actorId,
    entityType: 'claim',
    entityId: claimId,
    workflowInstanceId: actorContext.workflowInstanceId ?? null,
    payload: { claimId, evidenceIds },
  });
  return { claimId, evidenceIds, claimType, statement };
}

// 从 runtime_observations 规则化生成三类 claim。
// 返回 { claims, modelRunId };claims 供 decisions.mjs 组建 TeachingDecisionRecord。
export async function generateClaimsRuleBased(
  db,
  { workflowInstanceId, courseId, classId, lessonId, calculationVersion = null, actorContext = {} } = {},
) {
  const version =
    calculationVersion ??
    db
      .prepare(
        `SELECT calculation_version FROM runtime_observations WHERE lesson_id = ?
         ORDER BY calculated_at DESC LIMIT 1`,
      )
      .get(lessonId)?.calculation_version ??
    DEFAULT_CALCULATION_VERSION;
  const observations = db
    .prepare(
      `SELECT * FROM runtime_observations WHERE lesson_id = ? AND calculation_version = ? ORDER BY metric`,
    )
    .all(lessonId, version);
  if (observations.length === 0) {
    failCode('WF_ILLEGAL_TRANSITION', `课时 ${lessonId} 尚无 runtime_observation,无法生成 claim`, {
      lessonId,
      action: 'generateClaims',
    });
  }
  const byMetric = new Map(observations.map((o) => [o.metric, o]));
  const items = db
    .prepare('SELECT * FROM pretest_items WHERE lesson_id = ? ORDER BY item_no')
    .all(lessonId);
  const itemByNo = new Map(items.map((i) => [i.item_no, i]));
  const scope = { courseId, classId, lessonId };
  const actor = { ...actorContext, workflowInstanceId };

  // 先记录一次"生成运行"领域记录(规则生成器以 mock provider 登记,满足 model_runs 留痕要求)。
  const modelRunId = newId('mrn');
  const createdClaims = [];
  db.exec('BEGIN IMMEDIATE');
  try {
    // 1) factual_claim:每个关键指标一条
    for (const obs of observations) {
      let statement = null;
      const accuracyMatch = /^pretest\.accuracy\.q(\d+)$/.exec(obs.metric);
      if (accuracyMatch) {
        const itemNo = Number(accuracyMatch[1]);
        statement = `Q${itemNo} 正确率为 ${percentText(obs.value)}%(${obs.numerator}/${obs.denominator})。`;
      } else if (obs.metric === CLAIM_RULES.factualMetrics.participation) {
        statement = `前测作答参与率为 ${percentText(obs.value)}%(${obs.numerator}/${obs.denominator})。`;
      } else if (obs.metric === CLAIM_RULES.factualMetrics.overallAccuracy) {
        statement = `前测整体正确率为 ${percentText(obs.value)}%(${obs.numerator}/${obs.denominator})。`;
      }
      if (!statement) continue; // 选项分布/画像分布作为推断证据,不单独成 factual claim
      const created = await createClaimWithEvidence(db, {
        claimType: 'factual_claim',
        statement,
        targetStageId: null,
        scope,
        confidenceStatus: 'confirmed',
        createdBy: 'rule',
        createdFromModelRunId: modelRunId,
        observations: [obs],
        actorContext: actor,
      });
      createdClaims.push({ ...created, metric: obs.metric });
    }

    // 2) diagnostic_inference + 3) teaching_recommendation(规则配套)
    for (const item of items) {
      const accuracyObs = byMetric.get(`${CLAIM_RULES.factualMetrics.itemAccuracyPrefix}${item.item_no}`);
      if (!accuracyObs || accuracyObs.value >= CLAIM_RULES.inference.accuracyBelow) continue;
      const correctOption = item.correct_option;
      const shareObs = observations
        .filter((o) => o.metric.startsWith(`pretest.option_share.q${item.item_no}.`))
        .map((o) => ({ obs: o, option: o.metric.slice(o.metric.lastIndexOf('.') + 1) }))
        .filter(({ option, obs }) => option !== correctOption && obs.value >= CLAIM_RULES.inference.wrongOptionShareAtLeast)
        .sort((a, b) => b.obs.value - a.obs.value);
      if (shareObs.length === 0) continue;
      const top = shareObs[0];
      const tag = JSON.parse(item.knowledge_tags_json ?? '[]')[0] ?? `Q${item.item_no}`;
      const inferenceStatement = CLAIM_RULES.inference.statement({
        itemNo: item.item_no,
        accuracyPct: percentText(accuracyObs.value),
        correctNum: accuracyObs.numerator,
        totalNum: accuracyObs.denominator,
        optionKey: top.option,
        sharePct: percentText(top.obs.value),
        shareNum: top.obs.numerator,
        tag,
      });
      const inference = await createClaimWithEvidence(db, {
        claimType: 'diagnostic_inference',
        statement: inferenceStatement,
        targetStageId: null,
        scope,
        confidenceStatus: 'provisional',
        createdBy: 'rule',
        createdFromModelRunId: modelRunId,
        observations: [accuracyObs, top.obs],
        actorContext: actor,
      });
      createdClaims.push({ ...inference, metric: accuracyObs.metric });
      const recommendation = await createClaimWithEvidence(db, {
        claimType: 'teaching_recommendation',
        statement: CLAIM_RULES.recommendation.statement({ itemNo: item.item_no, optionKey: top.option, tag }),
        targetStageId: CLAIM_RULES.recommendation.targetStageId,
        scope,
        confidenceStatus: 'provisional',
        createdBy: 'rule',
        createdFromModelRunId: modelRunId,
        observations: [accuracyObs, top.obs],
        actorContext: actor,
      });
      createdClaims.push({ ...recommendation, metric: accuracyObs.metric });
    }

    await recordModelRun(db, {
      modelRunId,
      workflowId: workflowInstanceId,
      agentId: 'agt_rule-s1',
      provider: 'mock',
      model: 'rule-based-generator',
      thinkingMode: null,
      reasoningEffort: null,
      promptVersion: 's1-rules-1.0.0',
      inputRecordIds: observations.map((o) => o.id),
      evidenceIds: createdClaims.flatMap((c) => c.evidenceIds),
      inputHash: `sha256:${sha256Hex(canonicalJson({ observationIds: observations.map((o) => o.id), calculationVersion: version }))}`,
      outputHash: `sha256:${sha256Hex(canonicalJson({ claimIds: createdClaims.map((c) => c.claimId) }))}`,
      rawOutputLocation: null,
      structuredOutput: { claimIds: createdClaims.map((c) => c.claimId), ruleVersion: 's1-rules-1.0.0' },
      latencyMs: 0,
      tokenUsage: null,
      validationStatus: 'PASSED',
      fallbackUsed: false,
      startedAt: nowIso(),
      completedAt: nowIso(),
      actorContext: actor,
    });
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return { claims: createdClaims, modelRunId, calculationVersion: version };
}

// 修改语义:不改旧 statement(触发器强制),新建 claim 并接 supersede 链;证据链接复制到新 claim。
// supersedeClaimWithinTx 不自行管理事务,供 decisions.mjs 等在更大事务内复用;
// supersedeClaim 是自带事务的独立入口。
export async function supersedeClaimWithinTx(db, oldClaimId, newFields, actorContext = {}) {
  const oldClaim = db.prepare('SELECT * FROM teaching_claims WHERE id = ?').get(oldClaimId);
  if (!oldClaim) failCode('EVIDENCE_ANCHOR_INVALID', `claim 不存在: ${oldClaimId}`, { oldClaimId });
  const newClaimId = newId('clm');
  const oldEvidence = listEvidenceLinks(db, oldClaimId);
  const newEvidenceIds = oldEvidence.map(() => newId('ev'));
  {
    const payload = {
      claimId: newClaimId,
      schemaVersion: await getWriteSchemaVersion('teaching-claim'),
      claimType: newFields.claimType ?? oldClaim.claim_type,
      statement: newFields.statement,
      stageId: oldClaim.stage_id,
      targetStageId: newFields.targetStageId !== undefined ? newFields.targetStageId : oldClaim.target_stage_id,
      scope: { courseId: oldClaim.course_id, classId: oldClaim.class_id, lessonId: oldClaim.lesson_id },
      evidenceIds: newEvidenceIds,
      confidenceStatus: newFields.confidenceStatus ?? oldClaim.confidence_status,
      validationStatus: 'PENDING',
      createdBy: newFields.createdBy ?? 'teacher',
      createdFromModelRunId: null,
      supersedesClaimId: oldClaimId,
      createdAt: nowIso(),
    };
    await validateClaimPayload(payload);
    // 轮次归属继承原 claim(migration 005 起为一等列,修订不跨轮次)。
    insertClaimRow(db, payload, oldClaim.workflow_instance_id);
    // FK 约束要求 claim 先存在,再复制证据链。
    oldEvidence.forEach((ev, index) =>
      insertEvidenceLink(db, {
        id: newEvidenceIds[index],
        claimId: newClaimId,
        evidenceType: ev.evidence_type,
        sourceId: ev.source_id,
        sourceVersionId: ev.source_version_id,
        contentBlockId: ev.content_block_id,
        runtimeObservationId: ev.runtime_observation_id,
        pageIndex: ev.page_index,
        pageLabel: ev.page_label,
        bbox: ev.bbox_json ? JSON.parse(ev.bbox_json) : null,
        bboxCoordinateSystem: ev.bbox_coordinate_system,
        verbatimQuote: ev.verbatim_quote,
        normalizedQuote: ev.normalized_quote,
        sourceStatus: ev.source_status,
        effectiveDate: ev.effective_date,
        contentHash: ev.content_hash,
      }),
    );
    db.prepare('UPDATE teaching_claims SET superseded_by = ? WHERE id = ?').run(newClaimId, oldClaimId);
    appendAuditEvent(db, {
      eventType: 'claim.superseded',
      actorType: actorContext.actorType,
      actorId: actorContext.actorId,
      entityType: 'claim',
      entityId: oldClaimId,
      workflowInstanceId: actorContext.workflowInstanceId ?? null,
      payload: { oldClaimId, newClaimId, courseId: oldClaim.course_id },
    });
    appendAuditEvent(db, {
      eventType: 'claim.created',
      actorType: actorContext.actorType,
      actorId: actorContext.actorId,
      entityType: 'claim',
      entityId: newClaimId,
      workflowInstanceId: actorContext.workflowInstanceId ?? null,
      payload: { claimId: newClaimId, claimType: payload.claimType, supersedesClaimId: oldClaimId, courseId: oldClaim.course_id },
    });
  }
  return { newClaimId, oldClaimId };
}

// 独立入口:自带事务包装 supersedeClaimWithinTx。
export async function supersedeClaim(db, oldClaimId, newFields, actorContext = {}) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = await supersedeClaimWithinTx(db, oldClaimId, newFields, actorContext);
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
