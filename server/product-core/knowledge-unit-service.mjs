// 知识单元(L2)服务:人工建单元、确定性 Key Terms 提取、审核状态流转、语料版本标识。
// 依据 docs/knowledge-base/management-principles-kb-v0.1-spec.md §3:
//   - 单元必须经 kb_unit_fragments 挂 ≥1 个来源片段(content_blocks),无孤儿单元;
//   - definition/claim 不可原地改(migration 006 触发器),修正走 supersedes 链;
//   - review_status 四态(machine_extracted/teacher_verified/needs_review/rejected)经
//     setUnitReviewStatus 流转并审计;rejected 单元只存不取(默认检索排除在检索服务阶段实现);
//   - 全程无模型调用:确定性提取只读 content_blocks 与显式正则,不调用任何模型。
import { createHash } from 'node:crypto';
import { appendAuditEvent } from './audit.mjs';
import { failCode } from './errors.mjs';
import { newId, nowIso } from './ids.mjs';

export const KB_UNIT_REVIEW_STATUSES = Object.freeze([
  'machine_extracted',
  'teacher_verified',
  'needs_review',
  'rejected',
]);

const CONFIDENCE_LEVELS = Object.freeze(['low', 'medium', 'high']);

// ---------------------------------------------------------------------------
// Key Terms 确定性提取规则(显式可读,供审查):
//   OpenStax markdown 经 manual-markdown 解析后,Key Terms 小节在 content_blocks 中表现为:
//     1. 一个 block_type='heading' 且 content_raw 归一化(trim + 小写)恰为 'key terms' 的块;
//     2. 其后直到下一个 heading 块(不含)之间的块,即小节范围;
//     3. 小节内每个 paragraph 块匹配 KEY_TERM_BLOCK_RE(形如 `- **term** definition` 的
//        GFM 列表项,manual-markdown 将其解析为独立 paragraph 块)即得 (concept, definition)。
//   不匹配的块一律跳过;小节缺失或 0 匹配时返回空结果并记 warning,不硬凑、不调用模型。
// ---------------------------------------------------------------------------
const KEY_TERMS_HEADING_TEXT = 'key terms';
const KEY_TERM_BLOCK_RE = /^-\s+\*\*(?<term>[^*]+?)\*\*\s+(?<definition>[\s\S]+)$/;

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function withTransaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

// 单元 + 片段挂载 + 审计的单事务写入(createKnowledgeUnit 与确定性提取共用)。
function insertUnitWithFragments(
  db,
  {
    courseId,
    chapterId,
    concept,
    definition,
    claim,
    conditions,
    counterexample,
    relatedConcepts,
    confidence,
    reviewStatus,
    extractionMethod,
    fragmentIds,
    actorContext,
  },
) {
  const unitId = newId('ku');
  return withTransaction(db, () => {
    db.prepare(
      `INSERT INTO kb_knowledge_units(
         id, course_id, chapter_id, concept, definition, claim, conditions, counterexample,
         related_concepts_json, confidence, review_status, extraction_method,
         created_from_model_run_id, supersedes_unit_id, superseded_by,
         schema_version, created_by, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, '1.0.0', ?, ?)`,
    ).run(
      unitId,
      courseId,
      chapterId,
      concept,
      definition,
      claim,
      conditions,
      counterexample,
      JSON.stringify(relatedConcepts),
      confidence,
      reviewStatus,
      extractionMethod,
      actorContext?.actorId ?? 'system',
      nowIso(),
    );
    const insertFragment = db.prepare(
      'INSERT INTO kb_unit_fragments(unit_id, fragment_id, role, order_index) VALUES (?, ?, ?, ?)',
    );
    fragmentIds.forEach((fragmentId, index) => {
      insertFragment.run(unitId, fragmentId, 'definition', index);
    });
    appendAuditEvent(db, {
      eventType: 'kb.unit.created',
      actorType: actorContext?.actorType,
      actorId: actorContext?.actorId,
      entityType: 'knowledge_unit',
      entityId: unitId,
      payload: {
        courseId,
        chapterId,
        concept,
        extractionMethod,
        reviewStatus,
        confidence,
        fragmentCount: fragmentIds.length,
      },
    });
    return unitId;
  });
}

function assertFragmentsExist(db, fragmentIds) {
  const select = db.prepare('SELECT id FROM content_blocks WHERE id = ?');
  const missing = fragmentIds.filter((id) => !select.get(id));
  if (missing.length > 0) {
    failCode('KB_FRAGMENT_NOT_FOUND', `以下来源片段不存在于 content_blocks: ${missing.join(', ')}`, { missing });
  }
}

/**
 * 人工录入知识单元(extraction_method='manual')。
 * 人工录入同样需经审核:reviewStatus 默认 'needs_review'(可参数指定)。
 * 必须挂 ≥1 个已存在的 content_block 作为来源片段。
 */
export function createKnowledgeUnit(
  db,
  {
    courseId,
    chapterId,
    concept,
    definition = null,
    claim = null,
    conditions = null,
    counterexample = null,
    relatedConcepts = [],
    confidence = 'high',
    reviewStatus = 'needs_review',
    fragmentIds,
  } = {},
  actorContext,
) {
  if (!isNonEmptyString(courseId) || !isNonEmptyString(chapterId) || !isNonEmptyString(concept)) {
    failCode('KB_UNIT_INPUT_INVALID', 'courseId/chapterId/concept 必须是非空字符串');
  }
  if (!CONFIDENCE_LEVELS.includes(confidence)) {
    failCode('KB_UNIT_INPUT_INVALID', `confidence 必须是 ${CONFIDENCE_LEVELS.join('/')},收到 ${JSON.stringify(confidence)}`);
  }
  if (!KB_UNIT_REVIEW_STATUSES.includes(reviewStatus)) {
    failCode('KB_UNIT_INPUT_INVALID', `reviewStatus 必须是 ${KB_UNIT_REVIEW_STATUSES.join('/')},收到 ${JSON.stringify(reviewStatus)}`);
  }
  if (!Array.isArray(relatedConcepts) || !relatedConcepts.every((c) => typeof c === 'string')) {
    failCode('KB_UNIT_INPUT_INVALID', 'relatedConcepts 必须是字符串数组');
  }
  if (!Array.isArray(fragmentIds) || fragmentIds.length === 0) {
    failCode('KB_UNIT_INPUT_INVALID', '知识单元必须挂 ≥1 个来源片段(fragmentIds 不能为空)');
  }
  assertFragmentsExist(db, fragmentIds);

  const unitId = insertUnitWithFragments(db, {
    courseId,
    chapterId,
    concept,
    definition,
    claim,
    conditions,
    counterexample,
    relatedConcepts,
    confidence,
    reviewStatus,
    extractionMethod: 'manual',
    fragmentIds,
    actorContext,
  });
  return { unitId, reviewStatus, extractionMethod: 'manual' };
}

/**
 * 纯确定性 Key Terms 提取:从 OpenStax markdown 解析出的 Key Terms 小节提取术语-定义对,
 * 产出 machine_extracted 单元(confidence='medium',挂来源片段)。不调用任何模型。
 * @param {object} db
 * @param {{assetVersionId?: string, courseId: string, chapterId: string, actorContext?: object}} args
 *   assetVersionId 指定时只扫该版本;否则扫该章全部 active 版本的 content_blocks
 *   (经 parser_metadata_json 的 courseId/chapterId 定位,见 knowledge-source-service.mjs)。
 * @returns {{created: object[], skipped: object[], warnings: object[]}}
 *   skipped 为 UNIQUE(course_id, chapter_id, concept, extraction_method) 判重命中(幂等);
 *   小节缺失或 0 匹配记入 warnings,不硬凑。
 */
export function extractKeyTermsDeterministic(db, { assetVersionId = null, courseId, chapterId, actorContext } = {}) {
  if (!isNonEmptyString(courseId) || !isNonEmptyString(chapterId)) {
    failCode('KB_UNIT_INPUT_INVALID', 'courseId/chapterId 必须是非空字符串');
  }

  let versions;
  if (assetVersionId !== null) {
    const version = db.prepare('SELECT id FROM asset_versions WHERE id = ?').get(assetVersionId);
    if (!version) {
      failCode('KB_FRAGMENT_NOT_FOUND', `asset_version 不存在: ${assetVersionId}`, { assetVersionId });
    }
    versions = [version];
  } else {
    versions = db
      .prepare(
        `SELECT DISTINCT av.id AS id
         FROM asset_versions av
         JOIN content_blocks cb ON cb.asset_version_id = av.id
         WHERE av.source_status = 'active'
           AND json_extract(cb.parser_metadata_json, '$.courseId') = ?
           AND json_extract(cb.parser_metadata_json, '$.chapterId') = ?
         ORDER BY av.id`,
      )
      .all(courseId, chapterId);
  }

  const created = [];
  const skipped = [];
  const warnings = [];

  for (const version of versions) {
    const blocks = db
      .prepare('SELECT id, block_type, content_raw FROM content_blocks WHERE asset_version_id = ? ORDER BY order_index')
      .all(version.id);

    // 规则 1:定位 Key Terms 标题块。
    const headingIndex = blocks.findIndex(
      (b) => b.block_type === 'heading' && b.content_raw.trim().toLowerCase() === KEY_TERMS_HEADING_TEXT,
    );
    if (headingIndex === -1) {
      warnings.push({
        code: 'KEY_TERMS_SECTION_NOT_FOUND',
        versionId: version.id,
        message: '该版本无 Key Terms 小节,0 产出(如实返回,不硬凑)',
      });
      continue;
    }

    // 规则 2:小节范围 = 标题之后到下一个 heading 之前。
    const section = [];
    for (let i = headingIndex + 1; i < blocks.length; i += 1) {
      if (blocks[i].block_type === 'heading') break;
      section.push(blocks[i]);
    }

    // 规则 3:逐 paragraph 块匹配 `- **term** definition`。
    let matched = 0;
    for (const block of section) {
      if (block.block_type !== 'paragraph') continue;
      const match = block.content_raw.match(KEY_TERM_BLOCK_RE);
      if (!match) continue;
      const concept = match.groups.term.trim();
      const definition = match.groups.definition.trim();
      if (!concept || !definition) continue;
      matched += 1;

      // 幂等:UNIQUE(course_id, chapter_id, concept, extraction_method) 预检,重复提取不重复建行。
      const duplicate = db
        .prepare(
          `SELECT id FROM kb_knowledge_units
           WHERE course_id = ? AND chapter_id = ? AND concept = ? AND extraction_method = 'deterministic_keyterm'`,
        )
        .get(courseId, chapterId, concept);
      if (duplicate) {
        skipped.push({ concept, unitId: duplicate.id, reason: 'already_exists' });
        continue;
      }

      const unitId = insertUnitWithFragments(db, {
        courseId,
        chapterId,
        concept,
        definition,
        claim: null,
        conditions: null,
        counterexample: null,
        relatedConcepts: [],
        confidence: 'medium',
        reviewStatus: 'machine_extracted',
        extractionMethod: 'deterministic_keyterm',
        fragmentIds: [block.id],
        actorContext,
      });
      created.push({ unitId, concept, fragmentId: block.id });
    }

    if (matched === 0) {
      warnings.push({
        code: 'KEY_TERMS_NO_MATCH',
        versionId: version.id,
        message: 'Key Terms 小节存在但无一条目匹配提取规则,0 产出(如实返回)',
      });
    }
  }

  appendAuditEvent(db, {
    eventType: 'kb.keyterms.extracted',
    actorType: actorContext?.actorType,
    actorId: actorContext?.actorId,
    entityType: assetVersionId !== null ? 'asset_version' : null,
    entityId: assetVersionId,
    payload: {
      courseId,
      chapterId,
      versionIds: versions.map((v) => v.id),
      createdCount: created.length,
      skippedCount: skipped.length,
      warningCount: warnings.length,
    },
  });

  return { created, skipped, warnings };
}

/**
 * 审核状态流转:四态枚举校验 + 审计 kb.unit.reviewed(含前后状态)。
 * definition/claim 不受此更新影响(006 触发器只拦 statement 式字段)。
 */
export function setUnitReviewStatus(db, unitId, { reviewStatus, reviewerId, comment = null } = {}, actorContext) {
  if (!isNonEmptyString(unitId)) {
    failCode('KB_UNIT_INPUT_INVALID', 'unitId 必须是非空字符串');
  }
  if (!KB_UNIT_REVIEW_STATUSES.includes(reviewStatus)) {
    failCode(
      'KB_REVIEW_STATUS_INVALID',
      `reviewStatus 必须是 ${KB_UNIT_REVIEW_STATUSES.join('/')},收到 ${JSON.stringify(reviewStatus)}`,
    );
  }
  if (!isNonEmptyString(reviewerId)) {
    failCode('KB_REVIEW_STATUS_INVALID', 'reviewerId 必须是非空字符串(审核人留痕)');
  }
  const unit = db.prepare('SELECT * FROM kb_knowledge_units WHERE id = ?').get(unitId);
  if (!unit) {
    failCode('KB_UNIT_NOT_FOUND', `知识单元不存在: ${unitId}`, { unitId });
  }

  db.prepare('UPDATE kb_knowledge_units SET review_status = ? WHERE id = ?').run(reviewStatus, unitId);
  appendAuditEvent(db, {
    eventType: 'kb.unit.reviewed',
    actorType: actorContext?.actorType ?? 'teacher',
    actorId: reviewerId,
    entityType: 'knowledge_unit',
    entityId: unitId,
    previousState: unit.review_status,
    nextState: reviewStatus,
    payload: {
      courseId: unit.course_id,
      chapterId: unit.chapter_id,
      concept: unit.concept,
      comment,
    },
  });
  return { unitId, previousStatus: unit.review_status, reviewStatus };
}

/** 精确过滤列出知识单元(course_id/chapter_id/concept/review_status,等值匹配)。 */
export function listKnowledgeUnits(db, { courseId, chapterId, concept, reviewStatus } = {}) {
  const where = [];
  const params = [];
  if (courseId !== undefined) {
    where.push('course_id = ?');
    params.push(courseId);
  }
  if (chapterId !== undefined) {
    where.push('chapter_id = ?');
    params.push(chapterId);
  }
  if (concept !== undefined) {
    where.push('concept = ?');
    params.push(concept);
  }
  if (reviewStatus !== undefined) {
    where.push('review_status = ?');
    params.push(reviewStatus);
  }
  const sql = `SELECT * FROM kb_knowledge_units${where.length > 0 ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY course_id, chapter_id, concept`;
  return db.prepare(sql).all(...params);
}

/**
 * 语料版本标识:该章全部 active content_blocks 的 content_hash 排序后整体 sha256。
 * 供 kb_retrieval_runs.corpus_version_hash 留痕 —— 同一问题在不同语料版本下的答案差异可比对。
 * 块集不变则值稳定;新增/撤换块即变化(版本变化可识别)。
 */
export function corpusVersionHash(db, { courseId, chapterId } = {}) {
  if (!isNonEmptyString(courseId) || !isNonEmptyString(chapterId)) {
    failCode('KB_UNIT_INPUT_INVALID', 'courseId/chapterId 必须是非空字符串');
  }
  const rows = db
    .prepare(
      `SELECT cb.content_hash AS content_hash
       FROM content_blocks cb
       JOIN asset_versions av ON av.id = cb.asset_version_id
       WHERE av.source_status = 'active'
         AND json_extract(cb.parser_metadata_json, '$.courseId') = ?
         AND json_extract(cb.parser_metadata_json, '$.chapterId') = ?
       ORDER BY cb.content_hash`,
    )
    .all(courseId, chapterId);
  const hashes = rows.map((row) => row.content_hash);
  return `sha256:${createHash('sha256').update(JSON.stringify(hashes)).digest('hex')}`;
}
