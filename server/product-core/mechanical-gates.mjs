// 机械门禁:14 条确定性校验中的 1-13 条(第 14 条"发布版本号新增"由 publish.mjs 在发布时检查)。
// 纯确定性,不调用任何 LLM。逐条结果写入 teaching_claims.mechanical_report_json,
// 汇总状态写入 validation_status(PASSED/FAILED/WARNING/NOT_APPLICABLE)。
// 单条 check 失败只记录在该 claim 的 report;整体结果由返回值汇总。
// validation_status='FAILED' 的 claim 后续 publish 必须被拒(publish.mjs 强制)。
import { appendAuditEvent, canonicalJson, sha256Hex } from './audit.mjs';
import { listEvidenceLinks, listS1Claims, NO_KNOWLEDGE_EVIDENCE_QUOTE } from './claims.mjs';
import { recomputeObservation } from './pretest.mjs';
import { nowIso } from './ids.mjs';

const EPS = 1e-9;
const BBOX_SYSTEMS = new Set(['pdf-points-bottom-left', 'pdf-points-top-left', 'pixel-top-left']);

function checkEntry(check, status, detail) {
  return { check, status, detail };
}

// 解析一条 evidence_link 的来源对象。
function resolveLink(db, link) {
  const block = link.content_block_id
    ? db.prepare('SELECT * FROM content_blocks WHERE id = ?').get(link.content_block_id)
    : null;
  const version = link.source_version_id
    ? db.prepare('SELECT * FROM asset_versions WHERE id = ?').get(link.source_version_id)
    : null;
  const observation = link.runtime_observation_id
    ? db.prepare('SELECT * FROM runtime_observations WHERE id = ?').get(link.runtime_observation_id)
    : null;
  const isMarker = link.evidence_type === 'manual_reference' && link.verbatim_quote === NO_KNOWLEDGE_EVIDENCE_QUOTE;
  return { block, version, observation, isMarker };
}

// 对一条 claim 跑全部 13 条机检,返回 checks 数组。
export function validateClaimMechanical(db, claim, { lessonScope = null } = {}) {
  const links = listEvidenceLinks(db, claim.id).map((link) => ({ link, ...resolveLink(db, link) }));
  const knowledgeLinks = links.filter((l) => l.link.content_block_id != null);
  const versionLinks = links.filter((l) => l.link.source_version_id != null);
  const observationLinks = links.filter((l) => l.link.runtime_observation_id != null);
  const checks = [];

  // (1) 知识证据逐字引用:verbatim_quote 必须在对应 content_blocks.content_raw 中逐字存在。
  if (knowledgeLinks.length === 0) {
    checks.push(checkEntry('knowledge_verbatim_quote', 'NOT_APPLICABLE', '无知识块证据'));
  } else {
    const bad = knowledgeLinks.filter(
      (l) => !l.block || typeof l.link.verbatim_quote !== 'string' || !l.block.content_raw.includes(l.link.verbatim_quote),
    );
    checks.push(
      bad.length === 0
        ? checkEntry('knowledge_verbatim_quote', 'PASSED', `${knowledgeLinks.length} 条引用逐字命中`)
        : checkEntry('knowledge_verbatim_quote', 'FAILED', `${bad.length} 条引用未在来源文本中逐字存在`),
    );
  }

  // (2) 来源存在:每条证据引用的块/版本/观测必须能解析到实体。
  {
    const missing = links.filter((l) => {
      if (l.isMarker) return false;
      if (l.link.content_block_id != null && !l.block) return true;
      if (l.link.source_version_id != null && !l.version) return true;
      if (l.link.runtime_observation_id != null && !l.observation) return true;
      return false;
    });
    checks.push(
      missing.length === 0
        ? checkEntry('source_exists', 'PASSED', '全部证据来源可解析')
        : checkEntry('source_exists', 'FAILED', `${missing.length} 条证据来源不存在`),
    );
  }

  // (3) 文档版本有效:asset_versions.source_status 应为 active;非 active 记 WARNING(若同时是唯一来源,由 check 12 升级为 FAILED)。
  if (versionLinks.length === 0) {
    checks.push(checkEntry('asset_version_active', 'NOT_APPLICABLE', '无资产版本证据'));
  } else {
    const inactive = versionLinks.filter((l) => !l.version || l.version.source_status !== 'active');
    checks.push(
      inactive.length === 0
        ? checkEntry('asset_version_active', 'PASSED', '全部资产版本 active')
        : checkEntry('asset_version_active', 'WARNING', `${inactive.length} 条证据的资产版本非 active`),
    );
  }

  // (4) content_hash 匹配:按来源当前内容重算哈希并与锚定时记录比对。
  {
    const hashed = links.filter((l) => l.link.content_hash != null && !l.isMarker);
    if (hashed.length === 0) {
      checks.push(checkEntry('content_hash_match', 'NOT_APPLICABLE', '无 content_hash 可比对的证据'));
    } else {
      const bad = hashed.filter((l) => {
        if (l.block) return `sha256:${sha256Hex(l.block.content_raw)}` !== l.link.content_hash;
        if (l.observation) return `sha256:${sha256Hex(canonicalJson(l.observation))}` !== l.link.content_hash;
        return true;
      });
      checks.push(
        bad.length === 0
          ? checkEntry('content_hash_match', 'PASSED', '全部 content_hash 匹配')
          : checkEntry('content_hash_match', 'FAILED', `${bad.length} 条证据 content_hash 不匹配`),
      );
    }
  }

  // (5) pageIndex 在对应 asset_version 的页码范围内。
  {
    const paged = versionLinks.filter((l) => l.link.page_index != null);
    if (paged.length === 0) {
      checks.push(checkEntry('page_index_in_range', 'NOT_APPLICABLE', '无分页证据'));
    } else {
      const bad = paged.filter((l) => {
        const row = db
          .prepare('SELECT COUNT(*) AS n FROM content_blocks WHERE asset_version_id = ? AND page_index = ?')
          .get(l.link.source_version_id, l.link.page_index);
        return row.n === 0;
      });
      checks.push(
        bad.length === 0
          ? checkEntry('page_index_in_range', 'PASSED', 'page_index 均在版本页码范围内')
          : checkEntry('page_index_in_range', 'FAILED', `${bad.length} 条证据 page_index 超出范围`),
      );
    }
  }

  // (6) bbox 与坐标系一致:bbox null <=> 'none';非 null 则坐标系合法且数值 >= 0。
  {
    const bad = links.filter((l) => {
      const bbox = l.link.bbox_json ? JSON.parse(l.link.bbox_json) : null;
      if (bbox === null) return l.link.bbox_coordinate_system !== 'none';
      if (!BBOX_SYSTEMS.has(l.link.bbox_coordinate_system)) return true;
      return ['x', 'y', 'width', 'height'].some((k) => typeof bbox[k] !== 'number' || bbox[k] < 0);
    });
    checks.push(
      bad.length === 0
        ? checkEntry('bbox_consistency', 'PASSED', 'bbox 与坐标系一致')
        : checkEntry('bbox_consistency', 'FAILED', `${bad.length} 条证据 bbox 与坐标系不一致`),
    );
  }

  // (7) runtime_observation 存在。
  if (observationLinks.length === 0) {
    checks.push(checkEntry('runtime_observation_exists', 'NOT_APPLICABLE', '无运行观测证据'));
  } else {
    const missing = observationLinks.filter((l) => !l.observation);
    checks.push(
      missing.length === 0
        ? checkEntry('runtime_observation_exists', 'PASSED', '全部观测存在')
        : checkEntry('runtime_observation_exists', 'FAILED', `${missing.length} 条观测不存在`),
    );
  }

  // (8) 统计值可重算:按 calculation_rule 从 pretest_responses 重算并与 value 比对。
  // (9) numerator/denominator 与重算一致。
  if (observationLinks.length === 0) {
    checks.push(checkEntry('value_recompute', 'NOT_APPLICABLE', '无运行观测证据'));
    checks.push(checkEntry('numerator_denominator_recompute', 'NOT_APPLICABLE', '无运行观测证据'));
  } else {
    const unknownRule = observationLinks.filter((l) => l.observation && recomputeObservation(db, claim.lesson_id, l.observation.metric) === null);
    if (unknownRule.length > 0) {
      checks.push(checkEntry('value_recompute', 'WARNING', `${unknownRule.length} 条观测的 calculation_rule 无法重算`));
      checks.push(checkEntry('numerator_denominator_recompute', 'WARNING', `${unknownRule.length} 条观测的 calculation_rule 无法重算`));
    } else {
      const valueBad = observationLinks.filter((l) => {
        if (!l.observation) return true;
        const re = recomputeObservation(db, claim.lesson_id, l.observation.metric);
        return Math.abs(re.value - l.observation.value) > EPS;
      });
      const numBad = observationLinks.filter((l) => {
        if (!l.observation) return true;
        const re = recomputeObservation(db, claim.lesson_id, l.observation.metric);
        return Math.abs(re.numerator - l.observation.numerator) > EPS || Math.abs(re.denominator - l.observation.denominator) > EPS;
      });
      checks.push(
        valueBad.length === 0
          ? checkEntry('value_recompute', 'PASSED', '全部观测值可重算一致')
          : checkEntry('value_recompute', 'FAILED', `${valueBad.length} 条观测值重算不一致`),
      );
      checks.push(
        numBad.length === 0
          ? checkEntry('numerator_denominator_recompute', 'PASSED', 'numerator/denominator 重算一致')
          : checkEntry('numerator_denominator_recompute', 'FAILED', `${numBad.length} 条观测 numerator/denominator 重算不一致`),
      );
    }
  }

  // (10) factual_claim 至少绑一个证据(显式 NO_KNOWLEDGE_EVIDENCE 标记计入,B6 豁免通道)。
  if (claim.claim_type !== 'factual_claim') {
    checks.push(checkEntry('factual_evidence_binding', 'NOT_APPLICABLE', '非 factual_claim'));
  } else {
    checks.push(
      links.length > 0
        ? checkEntry('factual_evidence_binding', 'PASSED', `${links.length} 条证据绑定`)
        : checkEntry('factual_evidence_binding', 'FAILED', 'factual_claim 未绑定任何证据'),
    );
  }

  // (11) scope 一致:claim 的 course/class/lesson 与课时上下文一致;观测证据的 course/class 与 claim 一致(B12)。
  {
    const problems = [];
    if (lessonScope) {
      if (claim.lesson_id !== lessonScope.lessonId) problems.push('claim.lesson_id 与课时上下文不一致');
      if (claim.course_id !== lessonScope.courseId) problems.push('claim.course_id 与课时上下文不一致');
      if (claim.class_id !== lessonScope.classId) problems.push('claim.class_id 与课时上下文不一致');
    }
    for (const l of observationLinks) {
      if (!l.observation) continue;
      if (l.observation.course_id !== claim.course_id || l.observation.class_id !== claim.class_id || l.observation.lesson_id !== claim.lesson_id) {
        problems.push(`观测 ${l.observation.id} 的 scope 与 claim 不一致`);
      }
    }
    checks.push(
      problems.length === 0
        ? checkEntry('scope_consistency', 'PASSED', 'scope 一致')
        : checkEntry('scope_consistency', 'FAILED', `CROSS_SCOPE_REFERENCE: ${problems.join(';')}`),
    );
  }

  // (12) superseded/withdrawn 来源不得作为唯一有效证据(B11)。
  if (versionLinks.length === 0) {
    checks.push(checkEntry('superseded_sole_source', 'NOT_APPLICABLE', '无资产版本证据'));
  } else {
    const allVersionInactive = versionLinks.every((l) => !l.version || l.version.source_status !== 'active');
    const hasActiveObservation = observationLinks.some((l) => l.observation);
    checks.push(
      allVersionInactive && !hasActiveObservation
        ? checkEntry('superseded_sole_source', 'FAILED', '全部资产版本来源均已失效且无有效观测证据')
        : checkEntry('superseded_sole_source', 'PASSED', '存在有效来源'),
    );
  }

  // (13) 教师修改保留原始内容:含本 claim 的 TDR 若有 revise 裁决,original_statement 必须与系统原文一致。
  {
    const records = db
      .prepare(
        `SELECT id FROM teaching_decisions
         WHERE lesson_id = ? AND (
           observation_claim_ids_json LIKE '%' || ? || '%'
           OR inference_claim_ids_json LIKE '%' || ? || '%'
           OR recommendation_claim_ids_json LIKE '%' || ? || '%'
         )`,
      )
      .all(claim.lesson_id, claim.id, claim.id, claim.id);
    const revisions = records.flatMap((r) =>
      db
        .prepare(`SELECT * FROM teacher_decisions WHERE decision_record_id = ? AND decision = 'revise' ORDER BY decided_at`)
        .all(r.id),
    );
    if (revisions.length === 0) {
      checks.push(checkEntry('revision_preserves_original', 'NOT_APPLICABLE', '无 revise 裁决'));
    } else {
      const bad = revisions.filter((rev) => !rev.original_statement || rev.original_statement !== claim.statement);
      checks.push(
        bad.length === 0
          ? checkEntry('revision_preserves_original', 'PASSED', 'revise 裁决保留系统原文')
          : checkEntry('revision_preserves_original', 'FAILED', `${bad.length} 条 revise 裁决未保留系统原文`),
      );
    }
  }

  return checks;
}

export function summarizeChecks(checks) {
  if (checks.some((c) => c.status === 'FAILED')) return 'FAILED';
  if (checks.some((c) => c.status === 'WARNING')) return 'WARNING';
  if (checks.some((c) => c.status === 'PASSED')) return 'PASSED';
  return 'NOT_APPLICABLE';
}

// 对某 lesson 全部当前 S1 claim 执行机械门禁,落库并审计。
export function runMechanicalValidation(db, { lessonId, workflowInstanceId = null, actorContext = {} } = {}) {
  const claims = listS1Claims(db, lessonId, { workflowInstanceId });
  const lesson = db.prepare('SELECT id, course_id, class_id FROM lessons WHERE id = ?').get(lessonId);
  const lessonScope = lesson ? { lessonId: lesson.id, courseId: lesson.course_id, classId: lesson.class_id } : null;
  const results = [];
  const updateClaim = db.prepare(
    'UPDATE teaching_claims SET validation_status = ?, mechanical_report_json = ? WHERE id = ?',
  );
  const updateRecord = db.prepare(
    `UPDATE teaching_decisions SET mechanical_validation_status = ?
     WHERE lesson_id = ? AND (
       observation_claim_ids_json LIKE '%' || ? || '%'
       OR inference_claim_ids_json LIKE '%' || ? || '%'
       OR recommendation_claim_ids_json LIKE '%' || ? || '%'
     )`,
  );
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const claim of claims) {
      const checks = validateClaimMechanical(db, claim, { lessonScope });
      const status = summarizeChecks(checks);
      const report = { schemaVersion: '1.0.0', claimId: claim.id, overallStatus: status, checks, checkedAt: nowIso() };
      updateClaim.run(status, JSON.stringify(report), claim.id);
      updateRecord.run(status, lessonId, claim.id, claim.id, claim.id);
      appendAuditEvent(db, {
        eventType: 'mechanical.validation.completed',
        actorType: actorContext.actorType,
        actorId: actorContext.actorId,
        entityType: 'claim',
        entityId: claim.id,
        workflowInstanceId,
        payload: {
          claimId: claim.id,
          status,
          failedChecks: checks.filter((c) => c.status === 'FAILED').map((c) => c.check),
          courseId: claim.course_id,
        },
      });
      results.push({ claimId: claim.id, status, report });
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return {
    lessonId,
    claimsChecked: results.length,
    passed: results.filter((r) => r.status === 'PASSED').length,
    failed: results.filter((r) => r.status === 'FAILED').length,
    warnings: results.filter((r) => r.status === 'WARNING').length,
    results,
  };
}
