// 语义审查(mock reviewer v1)。
// 定位:语义审查不替代机械门禁——机械门禁是确定性事实核验,语义审查只提供风险标记;
// 最终裁决权在教师(teacher_decisions)。本轮 reviewer 为确定性 mock,只落实接口与状态契约。
// 契约状态:supported / partially_supported / unsupported / uncertain / not_reviewed。
import { appendAuditEvent } from './audit.mjs';
import { listS1Claims } from './claims.mjs';
import { nowIso } from './ids.mjs';

export const MOCK_REVIEWER_VERSION = 'v1';

// 过强措辞表:出现即标记 overreachRisks(确定性子串匹配)。
export const OVERREACH_PHRASES = Object.freeze(['必然', '所有学生', '全部学生', '一定能', '绝对']);

// mockReviewerV1:固定规则给结果,同输入同输出。
// claim 参数为 teaching_claims 行(含 claim_type/statement/validation_status)。
export function mockReviewerV1(claim) {
  const result = {
    status: 'uncertain',
    supportedParts: [],
    unsupportedParts: [],
    overreachRisks: [],
    alternativeExplanations: [],
    recommendedAction: 'review',
    reviewerType: 'mock',
    reviewerVersion: MOCK_REVIEWER_VERSION,
  };

  const overreach = OVERREACH_PHRASES.filter((phrase) => claim.statement.includes(phrase));
  for (const phrase of overreach) {
    result.overreachRisks.push(`措辞「${phrase}」超出证据可支撑范围`);
  }

  if (claim.validation_status === 'FAILED') {
    result.status = 'unsupported';
    result.unsupportedParts.push(claim.statement);
    result.recommendedAction = 'reject';
    return result;
  }

  if (claim.claim_type === 'factual_claim' && claim.validation_status === 'PASSED') {
    result.status = overreach.length > 0 ? 'partially_supported' : 'supported';
    result.supportedParts.push(claim.statement);
    result.recommendedAction = overreach.length > 0 ? 'review' : 'accept';
    return result;
  }

  if (claim.claim_type === 'diagnostic_inference') {
    result.status = 'partially_supported';
    result.supportedParts.push(claim.statement);
    result.alternativeExplanations.push('学生可能是单纯记忆薄弱而非概念混淆');
    result.alternativeExplanations.push('题目表述或选项设计可能造成误选集中');
    result.recommendedAction = 'review';
    return result;
  }

  if (claim.claim_type === 'teaching_recommendation') {
    result.status = 'partially_supported';
    result.supportedParts.push(claim.statement);
    result.alternativeExplanations.push('也可在后续课时以提问方式低成本验证该误解');
    result.recommendedAction = 'review';
    return result;
  }

  if (claim.validation_status === 'WARNING') {
    result.status = 'uncertain';
    result.recommendedAction = 'review';
    return result;
  }

  return result;
}

// 对某 lesson 全部当前 S1 claim 执行 mock 语义审查,落库并审计。
export function runSemanticReview(db, { lessonId, workflowInstanceId = null, actorContext = {} } = {}) {
  const claims = listS1Claims(db, lessonId, { workflowInstanceId });
  const results = [];
  const updateClaim = db.prepare(
    'UPDATE teaching_claims SET semantic_review_status = ?, semantic_report_json = ? WHERE id = ?',
  );
  const updateRecord = db.prepare(
    `UPDATE teaching_decisions SET semantic_review_status = ?
     WHERE lesson_id = ? AND (
       observation_claim_ids_json LIKE '%' || ? || '%'
       OR inference_claim_ids_json LIKE '%' || ? || '%'
       OR recommendation_claim_ids_json LIKE '%' || ? || '%'
     )`,
  );
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const claim of claims) {
      const report = mockReviewerV1(claim);
      const reportWithMeta = { schemaVersion: '1.0.0', claimId: claim.id, ...report, reviewedAt: nowIso() };
      updateClaim.run(report.status, JSON.stringify(reportWithMeta), claim.id);
      updateRecord.run(report.status, lessonId, claim.id, claim.id, claim.id);
      appendAuditEvent(db, {
        eventType: 'semantic.review.completed',
        actorType: actorContext.actorType,
        actorId: actorContext.actorId,
        entityType: 'claim',
        entityId: claim.id,
        workflowInstanceId,
        payload: { claimId: claim.id, status: report.status, reviewerType: 'mock', reviewerVersion: MOCK_REVIEWER_VERSION, courseId: claim.course_id },
      });
      results.push({ claimId: claim.id, status: report.status, report: reportWithMeta });
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return { lessonId, reviewed: results.length, results };
}
