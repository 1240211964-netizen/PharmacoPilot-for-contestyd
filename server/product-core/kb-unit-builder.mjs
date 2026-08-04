// 三层知识单元构建器(migration 008 表;知识库 v0.1 组织设计章)。
// 依据任务口径(提交 5):在已摄入语料(theory 408 块 / pharma_context 1106 块 / company_fact 6089 块)
// 之上,用纯确定性规则构建三层 L2 单元、跨层关系与证据缺口流转。全程无模型调用。
//
// 总则(与 knowledge-unit-service.mjs 一致):
//   - 每个单元必须挂 ≥1 个 content_blocks 片段(服务层强制,DB 层 FK 兜底);
//   - statement 照录来源原文关键句(verbatim 切片),不改写为管理结论;切片规则逐条显式写出;
//   - pharma_context / company_fact 单元全部 review_status='needs_review'(待教师审核);
//     company_fact 的 case_candidate 一律 0(只允许教师审核后置位);
//   - 幂等:重跑零增量 —— 各层以确定性判重键预检(theory: 006 UNIQUE(course,chapter,concept,
//     extraction_method);pharma/company: (course,chapter,statement) 精确匹配;relation: 三元组
//     UNIQUE 预检);命中即 skipped,不重复建行;
//   - 提取不到就记 warning / missed,不硬凑;找不到支撑片段的关系不建,记入 notBuilt。
//
// 层内规则概览:
//   A. theory:对 OpenStax §3.7 先跑 extractKeyTermsDeterministic(该节无 Key Terms 小节,
//      预期 0 产出 + warning,如实记录);再以显式规则从 §3.7 加粗术语段与 OCW 15.320 lec05
//      分组优劣势表提取术语-原文对(extraction_method='deterministic_rule');
//   B. pharma_context:中国法规 9 份按【组织设计相关】标记段 + 关键词→(stage,aspect) 映射表
//      提取;国际标准 5 份按 DOWNLOAD-LOG 定位(页标记 + 节标题 + 显式起止串)提取;
//   C. company_fact:8 家公司 25 条披露事实,verbatim 定位串在对应公司 blocks 中确定性匹配,
//      命中建单元,未命中记 missed;
//   D. relations:按既定配对清单在已建单元间确定性解析,支撑片段即对端单元的来源片段;
//   E. gaps:od-eval-20/24/25/29 按实际覆盖 resolved;od-eval-15/30 保持 open 并注明待教师提供。
import { appendAuditEvent } from './audit.mjs';
import { failCode } from './errors.mjs';
import { newId, nowIso } from './ids.mjs';
import { extractKeyTermsDeterministic } from './knowledge-unit-service.mjs';

const LAYER_TABLES = Object.freeze({
  theory: 'kb_knowledge_units',
  pharma_context: 'kb_pharma_context_units',
  company_fact: 'kb_company_fact_units',
});

const RELATION_TYPES = Object.freeze([
  'prerequisite_of',
  'part_of',
  'contrasts_with',
  'applied_in',
  'constrained_by',
  'illustrated_by',
  'supported_by',
  'assessed_by',
]);

const GAP_STATUSES = Object.freeze(['open', 'resolved', 'out_of_scope']);

const CN_MARKER = '【组织设计相关】';

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

function assertFragmentsExist(db, fragmentIds) {
  const select = db.prepare('SELECT id FROM content_blocks WHERE id = ?');
  const missing = fragmentIds.filter((id) => !select.get(id));
  if (missing.length > 0) {
    failCode('KB_FRAGMENT_NOT_FOUND', `以下来源片段不存在于 content_blocks: ${missing.join(', ')}`, { missing });
  }
}

// 按 asset_id 取该来源的 content_blocks(按阅读序)。
function blocksOfAsset(db, assetId) {
  return db
    .prepare(
      `SELECT cb.id AS id, cb.content_raw AS content_raw, cb.page_label AS page_label
       FROM content_blocks cb
       JOIN asset_versions av ON av.id = cb.asset_version_id
       WHERE av.asset_id = ?
       ORDER BY cb.order_index`,
    )
    .all(assetId);
}

// verbatim 切片:在 text 中定位 start 起点与 end 终点(从 start 之后找),返回原文子串。
// 任一端找不到返回 null(调用方记 warning/missed,不硬凑)。
function sliceVerbatim(text, start, end) {
  const startIndex = text.indexOf(start);
  if (startIndex === -1) return null;
  const endIndex = text.indexOf(end, startIndex + start.length);
  if (endIndex === -1) return null;
  return text.slice(startIndex, endIndex + end.length).trim();
}

// ---------------------------------------------------------------------------
// 单元创建(三个公共入口,测试与构建器共用)
// ---------------------------------------------------------------------------

/**
 * 建 pharma_context 单元(条款/标准要点,statement 须为原文摘录)。
 * 幂等判重键:(course_id, chapter_id, statement)。已存在返回 { unitId, alreadyExists: true }。
 */
export function createPharmaContextUnit(
  db,
  { courseId, chapterId, industryStage, aspect, statement, regulatorContext = null, reviewStatus = 'needs_review', fragmentIds } = {},
  actorContext,
) {
  if (!isNonEmptyString(courseId) || !isNonEmptyString(chapterId) || !isNonEmptyString(statement)) {
    failCode('KB_UNIT_INPUT_INVALID', 'courseId/chapterId/statement 必须是非空字符串');
  }
  if (!isNonEmptyString(industryStage) || !isNonEmptyString(aspect)) {
    failCode('KB_UNIT_INPUT_INVALID', 'industryStage/aspect 必须是非空字符串');
  }
  if (!Array.isArray(fragmentIds) || fragmentIds.length === 0) {
    failCode('KB_UNIT_INPUT_INVALID', 'pharma_context 单元必须挂 ≥1 个来源片段(fragmentIds 不能为空)');
  }
  assertFragmentsExist(db, fragmentIds);

  const duplicate = db
    .prepare('SELECT id FROM kb_pharma_context_units WHERE course_id = ? AND chapter_id = ? AND statement = ?')
    .get(courseId, chapterId, statement);
  if (duplicate) {
    return { unitId: duplicate.id, alreadyExists: true };
  }

  const unitId = newId('pcx');
  return withTransaction(db, () => {
    db.prepare(
      `INSERT INTO kb_pharma_context_units(
         id, course_id, chapter_id, industry_stage, aspect, statement, regulator_context,
         review_status, supersedes_unit_id, superseded_by, schema_version, created_by, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, '1.0.0', ?, ?)`,
    ).run(unitId, courseId, chapterId, industryStage, aspect, statement, regulatorContext, reviewStatus, actorContext?.actorId ?? 'system', nowIso());
    const insertFragment = db.prepare('INSERT INTO kb_pharma_context_fragments(unit_id, fragment_id) VALUES (?, ?)');
    for (const fragmentId of fragmentIds) insertFragment.run(unitId, fragmentId);
    appendAuditEvent(db, {
      eventType: 'kb.unit.created',
      actorType: actorContext?.actorType,
      actorId: actorContext?.actorId,
      entityType: 'pharma_context_unit',
      entityId: unitId,
      payload: { layer: 'pharma_context', courseId, chapterId, industryStage, aspect, regulatorContext, reviewStatus, fragmentCount: fragmentIds.length },
    });
    return { unitId, alreadyExists: false };
  });
}

/**
 * 建 company_fact 单元(企业披露事实,statement 须为披露原文摘录;case_candidate 恒 0)。
 * 幂等判重键:(course_id, chapter_id, company, statement)。
 */
export function createCompanyFactUnit(
  db,
  { courseId, chapterId, company, reportPeriod, factType, statement, reviewStatus = 'needs_review', fragmentIds } = {},
  actorContext,
) {
  if (!isNonEmptyString(courseId) || !isNonEmptyString(chapterId) || !isNonEmptyString(statement)) {
    failCode('KB_UNIT_INPUT_INVALID', 'courseId/chapterId/statement 必须是非空字符串');
  }
  if (!isNonEmptyString(company) || !isNonEmptyString(reportPeriod) || !isNonEmptyString(factType)) {
    failCode('KB_UNIT_INPUT_INVALID', 'company/reportPeriod/factType 必须是非空字符串');
  }
  if (!Array.isArray(fragmentIds) || fragmentIds.length === 0) {
    failCode('KB_UNIT_INPUT_INVALID', 'company_fact 单元必须挂 ≥1 个来源片段(fragmentIds 不能为空)');
  }
  assertFragmentsExist(db, fragmentIds);

  const duplicate = db
    .prepare('SELECT id FROM kb_company_fact_units WHERE course_id = ? AND chapter_id = ? AND company = ? AND statement = ?')
    .get(courseId, chapterId, company, statement);
  if (duplicate) {
    return { unitId: duplicate.id, alreadyExists: true };
  }

  const unitId = newId('cfx');
  return withTransaction(db, () => {
    db.prepare(
      `INSERT INTO kb_company_fact_units(
         id, course_id, chapter_id, company, report_period, fact_type, statement,
         review_status, case_candidate, supersedes_unit_id, superseded_by, schema_version, created_by, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, NULL, '1.0.0', ?, ?)`,
    ).run(unitId, courseId, chapterId, company, reportPeriod, factType, statement, reviewStatus, actorContext?.actorId ?? 'system', nowIso());
    const insertFragment = db.prepare('INSERT INTO kb_company_fact_fragments(unit_id, fragment_id) VALUES (?, ?)');
    for (const fragmentId of fragmentIds) insertFragment.run(unitId, fragmentId);
    appendAuditEvent(db, {
      eventType: 'kb.unit.created',
      actorType: actorContext?.actorType,
      actorId: actorContext?.actorId,
      entityType: 'company_fact_unit',
      entityId: unitId,
      payload: { layer: 'company_fact', courseId, chapterId, company, reportPeriod, factType, reviewStatus, fragmentCount: fragmentIds.length },
    });
    return { unitId, alreadyExists: false };
  });
}

/**
 * 建跨层单元关系。服务层强制:relation_type 八枚举、from/to 单元按 layer 分表查存在性、
 * evidence 片段存在(给定时)。三元组 UNIQUE 预检幂等(已存在返回 alreadyExists)。
 * review_status 默认 'needs_review',created_by 由调用方给(规则构建为 'rule')。
 */
export function createUnitRelation(
  db,
  { fromLayer, fromUnitId, relationType, toLayer, toUnitId, evidenceFragmentId = null, reviewStatus = 'needs_review', createdBy = 'rule' } = {},
  actorContext,
) {
  if (!LAYER_TABLES[fromLayer] || !LAYER_TABLES[toLayer]) {
    failCode('KB_RELATION_INPUT_INVALID', `fromLayer/toLayer 必须是 ${Object.keys(LAYER_TABLES).join('/')},收到 ${fromLayer}/${toLayer}`);
  }
  if (!RELATION_TYPES.includes(relationType)) {
    failCode('KB_RELATION_INPUT_INVALID', `relationType 必须是 ${RELATION_TYPES.join('/')},收到 ${JSON.stringify(relationType)}`);
  }
  // 跨表引用完整性由服务层校验(008 表头注释:单列表无法表达跨表 FK)。
  const fromUnit = db.prepare(`SELECT id FROM ${LAYER_TABLES[fromLayer]} WHERE id = ?`).get(fromUnitId);
  if (!fromUnit) {
    failCode('KB_UNIT_NOT_FOUND', `from 单元不存在(layer=${fromLayer}): ${fromUnitId}`, { fromLayer, fromUnitId });
  }
  const toUnit = db.prepare(`SELECT id FROM ${LAYER_TABLES[toLayer]} WHERE id = ?`).get(toUnitId);
  if (!toUnit) {
    failCode('KB_UNIT_NOT_FOUND', `to 单元不存在(layer=${toLayer}): ${toUnitId}`, { toLayer, toUnitId });
  }
  if (evidenceFragmentId !== null) {
    assertFragmentsExist(db, [evidenceFragmentId]);
  }

  const duplicate = db
    .prepare('SELECT id FROM kb_unit_relations WHERE from_unit_id = ? AND relation_type = ? AND to_unit_id = ?')
    .get(fromUnitId, relationType, toUnitId);
  if (duplicate) {
    return { relationId: duplicate.id, alreadyExists: true };
  }

  const relationId = newId('rel');
  db.prepare(
    `INSERT INTO kb_unit_relations(
       id, from_layer, from_unit_id, relation_type, to_layer, to_unit_id,
       evidence_fragment_id, review_status, schema_version, created_by, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '1.0.0', ?, ?)`,
  ).run(relationId, fromLayer, fromUnitId, relationType, toLayer, toUnitId, evidenceFragmentId, reviewStatus, createdBy, nowIso());
  appendAuditEvent(db, {
    eventType: 'kb.relation.created',
    actorType: actorContext?.actorType,
    actorId: actorContext?.actorId,
    entityType: 'kb_unit_relation',
    entityId: relationId,
    payload: { fromLayer, fromUnitId, relationType, toLayer, toUnitId, evidenceFragmentId, reviewStatus, createdBy },
  });
  return { relationId, alreadyExists: false };
}

/**
 * 证据缺口流转。status='resolved'/'out_of_scope' 必须带 resolutionNote(留痕可审计);
 * status='open' 仅允许补注 resolutionNote(不流转)。审计:resolved → kb.gap.resolved;
 * 其余变更 → kb.gap.updated。
 */
export function setEvidenceGapStatus(db, gapRef, { status, resolutionNote = null } = {}, actorContext) {
  if (!GAP_STATUSES.includes(status)) {
    failCode('KB_GAP_INPUT_INVALID', `status 必须是 ${GAP_STATUSES.join('/')},收到 ${JSON.stringify(status)}`);
  }
  const gap = db.prepare('SELECT * FROM kb_evidence_gaps WHERE id = ? OR question_id = ?').get(gapRef, gapRef);
  if (!gap) {
    failCode('KB_GAP_NOT_FOUND', `证据缺口不存在: ${gapRef}`, { gapRef });
  }
  if ((status === 'resolved' || status === 'out_of_scope') && !isNonEmptyString(resolutionNote)) {
    failCode('KB_GAP_INPUT_INVALID', `status=${status} 必须提供 resolutionNote(解决依据留痕)`);
  }
  // 幂等:目标状态与备注均已一致 → 不动库、不重复审计(重跑零增量)。
  if (gap.status === status && (resolutionNote === null || gap.resolution_note === resolutionNote)) {
    return { gapId: gap.id, questionId: gap.question_id, status: gap.status, changed: false };
  }
  if (status === 'open' && gap.status === 'open' && resolutionNote === null) {
    return { gapId: gap.id, questionId: gap.question_id, status: 'open', changed: false };
  }

  const resolvedAt = status === 'open' ? null : nowIso();
  db.prepare('UPDATE kb_evidence_gaps SET status = ?, resolution_note = COALESCE(?, resolution_note), resolved_at = ? WHERE id = ?').run(
    status,
    resolutionNote,
    resolvedAt,
    gap.id,
  );
  appendAuditEvent(db, {
    eventType: status === 'resolved' ? 'kb.gap.resolved' : 'kb.gap.updated',
    actorType: actorContext?.actorType,
    actorId: actorContext?.actorId,
    entityType: 'kb_evidence_gap',
    entityId: gap.id,
    previousState: gap.status,
    nextState: status,
    payload: { questionId: gap.question_id, topic: gap.topic, resolutionNote },
  });
  return { gapId: gap.id, questionId: gap.question_id, status, changed: true };
}

// ---------------------------------------------------------------------------
// A. theory 层扩充
// ---------------------------------------------------------------------------
// 显式规则说明(供审查):
//   §3.7(OpenStax,资产 openstax-pom-ch03-3-7)无 Key Terms 小节 —— 先跑
//   extractKeyTermsDeterministic 如实拿 warning;再用下面四条规则从正文的**加粗术语**段
//   提取:每条规则给出 blockLocator(定位段落块)与 statement 起止串(definition 为原文
//    verbatim 切片)。规则只覆盖权变/系统学派这一节的核心术语,不扩展到其他段落。
const THEORY_S37_ASSET = 'openstax-pom-ch03-3-7';
const THEORY_S37_RULES = Object.freeze([
  {
    concept: 'open system',
    blockLocator: '**open system**',
    definitionStart: 'The major overview of the systems theorists',
    definitionEnd: 'interacts with its environment.',
  },
  {
    concept: 'contingency school',
    blockLocator: '**contingency school**',
    definitionStart: 'The other school that made a contribution to management thought',
    definitionEnd: 'no universal rules in management.',
  },
  {
    concept: "Woodward's contingency research",
    blockLocator: '**Joan Woodward**',
    definitionStart: 'One of the major theorists in this school is **Joan Woodward**',
    definitionEnd: 'training would be a necessity.',
  },
  {
    concept: 'evidence-based management',
    blockLocator: 'the idea for evidence-based management',
    definitionStart: 'Based on the theoretical research of the last 40 or so years',
    definitionEnd: 'managerial practices that have been tested.',
  },
]);

// OCW 15.320 lec05(资产 ocw-15-320-s11-lec05,paginated-text 一页一块):
//   page 8 为 functional/divisional/matrix 分组优劣势表(Structure/Strengths/Weaknesses),
//   page 9 为 front-back 优劣势,page 11 为 lateral coordination 谱系,page 3 为 Galbraith
//   What/How/Who/Why 要素,page 10 为 strategy framework ↔ structure 对应表,page 15 为
//   alignment 结论。规则按 pageLabel + 节标题文本定位页块,再按显式起止串切原文。
const THEORY_LEC05_ASSET = 'ocw-15-320-s11-lec05';
const THEORY_LEC05_RULES = Object.freeze([
  {
    concept: 'functional organization (grouping): strengths and weaknesses',
    pageLabel: '8',
    blockLocator: 'When are different groupings useful?',
    definitionStart: 'Economies of scale within functional departments',
    definitionEnd: 'Restricted view of organizational goals',
  },
  {
    concept: 'divisional organization (grouping): strengths and weaknesses',
    pageLabel: '8',
    blockLocator: 'When are different groupings useful?',
    definitionStart: 'Suited to fast change and innovation in unstable',
    definitionEnd: 'more difficult',
  },
  {
    concept: 'matrix structure: strengths and weaknesses (OCW 15.320 lec05)',
    pageLabel: '8',
    blockLocator: 'When are different groupings useful?',
    definitionStart: 'Achieves coordination to meet dual demands',
    definitionEnd: 'Requires great effort to maintain power balance',
  },
  {
    concept: 'front-back organization',
    pageLabel: '9',
    blockLocator: 'Front-Back',
    definitionStart: 'An alternative way (in addition to Matrix)',
    definitionEnd: 'lateral coordination throughout organization)',
  },
  {
    concept: 'lateral coordination processes',
    pageLabel: '11',
    blockLocator: 'lateral coordination',
    definitionStart: '(lateral coordination processes)',
    definitionEnd: 'management time and difficulty)',
  },
  {
    concept: 'Galbraith organizational pattern elements (What/How/Who/Why)',
    pageLabel: '3',
    blockLocator: 'Galbraith',
    definitionStart: 'What is being done? Strategy',
    definitionEnd: 'Why are they doing it? Rewards',
  },
  {
    concept: 'strategy-structure fit (OCW 15.320 lec05)',
    pageLabel: '10',
    blockLocator: 'Strategy framework',
    definitionStart: 'Strategy framework',
    definitionEnd: 'Geography',
  },
  {
    concept: 'organizational pattern alignment',
    pageLabel: '15',
    blockLocator: 'Alignment',
    definitionStart: 'For an organizational pattern to work well',
    definitionEnd: 'aligned.',
  },
]);

// theory 单元插入(extraction_method='deterministic_rule'):与 knowledge-unit-service 的
// insertUnitWithFragments 同纪律(006 表 + kb_unit_fragments + 审计),判重走 006 UNIQUE 预检。
function insertTheoryRuleUnit(db, { courseId, chapterId, concept, definition, fragmentId, actorContext }) {
  const duplicate = db
    .prepare(
      `SELECT id FROM kb_knowledge_units
       WHERE course_id = ? AND chapter_id = ? AND concept = ? AND extraction_method = 'deterministic_rule'`,
    )
    .get(courseId, chapterId, concept);
  if (duplicate) {
    return { unitId: duplicate.id, alreadyExists: true };
  }
  const unitId = newId('ku');
  return withTransaction(db, () => {
    db.prepare(
      `INSERT INTO kb_knowledge_units(
         id, course_id, chapter_id, concept, definition, claim, conditions, counterexample,
         related_concepts_json, confidence, review_status, extraction_method,
         created_from_model_run_id, supersedes_unit_id, superseded_by,
         schema_version, created_by, created_at
       ) VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, '[]', 'medium', 'machine_extracted', 'deterministic_rule', NULL, NULL, NULL, '1.0.0', ?, ?)`,
    ).run(unitId, courseId, chapterId, concept, definition, actorContext?.actorId ?? 'system', nowIso());
    db.prepare("INSERT INTO kb_unit_fragments(unit_id, fragment_id, role, order_index) VALUES (?, ?, 'definition', 0)").run(unitId, fragmentId);
    appendAuditEvent(db, {
      eventType: 'kb.unit.created',
      actorType: actorContext?.actorType,
      actorId: actorContext?.actorId,
      entityType: 'knowledge_unit',
      entityId: unitId,
      payload: { layer: 'theory', courseId, chapterId, concept, extractionMethod: 'deterministic_rule', reviewStatus: 'machine_extracted', confidence: 'medium', fragmentCount: 1 },
    });
    return { unitId, alreadyExists: false };
  });
}

function applyTheoryRules(db, { courseId, chapterId, actorContext, assetId, rules, usePageLabel }) {
  const created = [];
  const skipped = [];
  const warnings = [];
  const blocks = blocksOfAsset(db, assetId);
  if (blocks.length === 0) {
    warnings.push({ code: 'THEORY_SOURCE_NOT_INGESTED', assetId, message: `来源 ${assetId} 无 content_blocks(未摄入?),0 产出` });
    return { created, skipped, warnings };
  }
  for (const rule of rules) {
    const block = blocks.find(
      (b) => b.content_raw.includes(rule.blockLocator) && (!usePageLabel || b.page_label === rule.pageLabel),
    );
    if (!block) {
      warnings.push({ code: 'THEORY_RULE_NO_BLOCK', assetId, concept: rule.concept, message: `未找到含 "${rule.blockLocator}" 的块,跳过(不硬凑)` });
      continue;
    }
    const definition = sliceVerbatim(block.content_raw, rule.definitionStart, rule.definitionEnd);
    if (!definition) {
      warnings.push({ code: 'THEORY_RULE_NO_SPAN', assetId, concept: rule.concept, fragmentId: block.id, message: '起止串定位失败,跳过(不硬凑)' });
      continue;
    }
    const result = insertTheoryRuleUnit(db, { courseId, chapterId, concept: rule.concept, definition, fragmentId: block.id, actorContext });
    if (result.alreadyExists) {
      skipped.push({ concept: rule.concept, unitId: result.unitId, reason: 'already_exists' });
    } else {
      created.push({ unitId: result.unitId, concept: rule.concept, fragmentId: block.id });
    }
  }
  return { created, skipped, warnings };
}

/**
 * theory 层扩充:§3.7 Key Terms(预期 0 产出 + warning)+ §3.7 加粗术语规则 + lec05 显式规则。
 */
export function buildTheoryLayerUnits(db, { courseId, chapterId, actorContext } = {}) {
  if (!isNonEmptyString(courseId) || !isNonEmptyString(chapterId)) {
    failCode('KB_UNIT_INPUT_INVALID', 'courseId/chapterId 必须是非空字符串');
  }
  const result = { keyTerms: null, created: [], skipped: [], warnings: [] };

  // §3.7 先跑确定性 Key Terms 提取(该节无此小节,预期 0 产出;如实记录 warning)。
  const s37Version = db.prepare('SELECT id FROM asset_versions WHERE asset_id = ? ORDER BY created_at DESC LIMIT 1').get(THEORY_S37_ASSET);
  if (s37Version) {
    result.keyTerms = extractKeyTermsDeterministic(db, { assetVersionId: s37Version.id, courseId, chapterId, actorContext });
  } else {
    result.keyTerms = { created: [], skipped: [], warnings: [{ code: 'SOURCE_NOT_INGESTED', message: `${THEORY_S37_ASSET} 未摄入,跳过 Key Terms 提取` }] };
  }
  result.warnings.push(...result.keyTerms.warnings);

  for (const rules of [
    { assetId: THEORY_S37_ASSET, rules: THEORY_S37_RULES, usePageLabel: false },
    { assetId: THEORY_LEC05_ASSET, rules: THEORY_LEC05_RULES, usePageLabel: true },
  ]) {
    const r = applyTheoryRules(db, { courseId, chapterId, actorContext, ...rules });
    result.created.push(...r.created);
    result.skipped.push(...r.skipped);
    result.warnings.push(...r.warnings);
  }
  return result;
}

// ---------------------------------------------------------------------------
// B. pharma_context 层
// ---------------------------------------------------------------------------
// 发文机关/文号登记:逐源显式登记(值取自各文件 front-matter 的 author_or_issuer /
// document_number;intl 取版本核验信息,见各层 DOWNLOAD-LOG)。
const REGULATOR_REGISTRY = Object.freeze({
  'cn-drug-admin-law-2019': { regulator: '全国人民代表大会常务委员会', documentNumber: '中华人民共和国主席令第三十一号' },
  'cn-drug-admin-law-implementing-reg-2026': { regulator: '国务院', documentNumber: '中华人民共和国国务院令第828号' },
  'cn-gmp-2010': { regulator: '卫生部', documentNumber: '中华人民共和国卫生部令第79号' },
  'cn-mah-contract-mfg-supervision-2023-132': { regulator: '国家药品监督管理局', documentNumber: '国家药监局公告2023年第132号' },
  'cn-contract-mfg-entrusted-2025-134': { regulator: '国家药品监督管理局', documentNumber: '国家药监局公告2025年第134号' },
  'cn-med-inst-pharm-admin-2011': { regulator: '卫生部、国家中医药管理局、总后勤部卫生部', documentNumber: '卫医政发〔2011〕11号' },
  'cn-prescription-review-2018': { regulator: '国家卫生健康委员会办公厅、国家中医药管理局办公室、中央军委后勤保障部办公厅', documentNumber: '国卫办医发〔2018〕14号' },
  'cn-antineoplastic-clinical-2020-487': { regulator: '国家卫生健康委员会', documentNumber: '国卫医函〔2020〕487号' },
  'cn-vbp-normalization-2021-2': { regulator: '国务院办公厅', documentNumber: '国办发〔2021〕2号' },
  'ich-q10-pharmaceutical-quality-system': { regulator: 'ICH', documentNumber: 'ICH Q10 Pharmaceutical Quality System(Step 4, 2008-06-04)' },
  'fda-quality-systems-approach-cgmp': { regulator: 'U.S. FDA', documentNumber: 'Guidance for Industry: Quality Systems Approach to Pharmaceutical CGMP Regulations(2006-09)' },
  'eu-gmp-vol4-ch2-personnel': { regulator: 'European Commission(EudraLex)', documentNumber: 'EU GMP Volume 4 Chapter 2: Personnel(2014-02-16 施行)' },
  'ema-gvp-module-i-pharmacovigilance-systems': { regulator: 'EMA', documentNumber: 'GVP Module I: Pharmacovigilance systems and their quality systems(EMA/541760/2011)' },
  'who-drug-therapeutics-committees-practical-guide': { regulator: 'WHO', documentNumber: 'Drug and Therapeutics Committees: A Practical Guide(WHO/EDM/PAR/2004.1)' },
});

// 中国法规:【组织设计相关】标记段 → (industry_stage, aspect) 关键词映射(有序,先中先得;
// 只提取命中映射的标记段,其余标记段不建单元)。映射口径见任务 B。
const CN_ASPECT_RULES = Object.freeze([
  { keyword: '抗肿瘤药物管理工作组', industryStage: 'use', aspect: 'dtc_committee' },
  { keyword: '药事管理与药物治疗学委员会', industryStage: 'use', aspect: 'dtc_committee' },
  { keyword: '处方审核', industryStage: 'use', aspect: 'prescription_review' },
  { keyword: '集中带量采购', industryStage: 'distribution', aspect: 'vbp_coordination' },
  { keyword: '委托生产', industryStage: 'production', aspect: 'mah_responsibility' },
  // "可以自行生产药品,也可以委托药品生产企业生产"(药品管理法§32 首句)等变体写法。
  { keyword: '委托药品', industryStage: 'production', aspect: 'mah_responsibility' },
  { keyword: '质量受权人', industryStage: 'production', aspect: 'qualified_person' },
  { keyword: '药物警戒', industryStage: 'cross_stage', aspect: 'pharmacovigilance' },
  { keyword: '质量管理体系', industryStage: 'production', aspect: 'quality_system' },
  { keyword: '药学部门', industryStage: 'use', aspect: 'pharmacy_department' },
  { keyword: '临床药师', industryStage: 'use', aspect: 'clinical_pharmacist' },
]);

const CN_SOURCE_IDS = Object.freeze([
  'cn-drug-admin-law-2019',
  'cn-drug-admin-law-implementing-reg-2026',
  'cn-gmp-2010',
  'cn-mah-contract-mfg-supervision-2023-132',
  'cn-contract-mfg-entrusted-2025-134',
  'cn-med-inst-pharm-admin-2011',
  'cn-prescription-review-2018',
  'cn-antineoplastic-clinical-2020-487',
  'cn-vbp-normalization-2021-2',
]);

const CN_CLAUSE_RE = /^\*\*(第[0-9一二三四五六七八九十百零]+条)\*\*/;

// 标记段 → statement 段序列:剥离加粗条款号(进 regulator_context)与初标 marker(机器标注,
// 非原文);一个块可能含多条连续标记段(条款正文 + 续行同块),逐段产出。marker 语义为
// "标记其后文本",故取各 marker 之后的部分;非常规形态(marker 后全空)回退最长段。
function parseCnMarkedSegments(rawText, lastClause) {
  let text = rawText.trim();
  let clause = null;
  const clauseMatch = text.match(CN_CLAUSE_RE);
  if (clauseMatch) {
    clause = clauseMatch[1];
    text = text.slice(clauseMatch[0].length);
  }
  const parts = text.split(CN_MARKER);
  const marked = parts.slice(1).map((p) => p.replace(/^[\s　]+/, '').trim()).filter((p) => p.length > 0);
  let segments = marked;
  if (segments.length === 0) {
    const longest = parts.map((p) => p.trim()).reduce((a, b) => (b.length > a.length ? b : a), '');
    segments = longest ? [longest] : [];
  }
  const clauseUsed = clause ?? (lastClause ? `${lastClause}(续)` : null);
  return { segments, clause, clauseUsed };
}

// 国际标准:页标记 + 节标题 + 显式起止串(定位依据为 pharma-intl/DOWNLOAD-LOG 的页码范围
// 记录:ICH Q10 §2 pp.8–10、FDA 管理责任 pp.12–17 与外包 pp.18–19、EU GMP Ch2 关键岗位
// pp.2–4、EMA GVP QPPV 专节 pp.14–19、WHO DTC Ch.2 起页)。statement 为原文关键句切片。
const INTL_RULES = Object.freeze([
  {
    sourceId: 'ich-q10-pharmaceutical-quality-system',
    pageLabel: '8',
    blockLocator: 'MANAGEMENT RESPONSIBILITY',
    sectionRef: 'Section 2 Management Responsibility(§2.1(a))',
    industryStage: 'cross_stage',
    aspect: 'management_responsibility',
    statementStart: '(a) Senior management',
    statementEnd: 'implemented throughout the company.',
  },
  {
    sourceId: 'fda-quality-systems-approach-cgmp',
    pageLabel: '12',
    blockLocator: 'A. Management Responsibilities',
    sectionRef: 'IV.B Management Responsibilities(开头段)',
    industryStage: 'cross_stage',
    aspect: 'management_responsibility',
    statementStart: 'Modern robust quality systems models',
    statementEnd: 'functioning of a quality system.',
  },
  {
    sourceId: 'fda-quality-systems-approach-cgmp',
    pageLabel: '18',
    blockLocator: '4. Control Outsourced Operations',
    sectionRef: 'IV.B.4 Control Outsourced Operations(开头段)',
    industryStage: 'production',
    aspect: 'outsourced_operations',
    statementStart: 'Outsourcing involves hiring a second party',
    statementEnd: 'communication mechanisms.',
  },
  {
    sourceId: 'eu-gmp-vol4-ch2-personnel',
    pageLabel: '2',
    blockLocator: '2.4 Senior management',
    sectionRef: '§2.4(Senior management ultimate responsibility)',
    industryStage: 'production',
    aspect: 'management_responsibility',
    statementStart: '2.4 Senior management',
    statementEnd: 'implemented throughout the \norganisation.',
  },
  {
    sourceId: 'eu-gmp-vol4-ch2-personnel',
    pageLabel: '2',
    blockLocator: 'Key Management Personnel',
    sectionRef: '§2.5(Key Personnel)',
    industryStage: 'production',
    aspect: 'key_personnel',
    statementStart: '2.5 Senior Management should appoint Key Management Personnel',
    statementEnd: 'independent from each other.',
  },
  {
    sourceId: 'eu-gmp-vol4-ch2-personnel',
    pageLabel: '3',
    blockLocator: '2.6 The duties of the Qualified Person',
    sectionRef: '§2.6(Qualified Person 职责)',
    industryStage: 'production',
    aspect: 'qualified_person',
    statementStart: '2.6 The duties of the Qualified Person(s)',
    statementEnd: 'summarised as follows:',
  },
  {
    sourceId: 'ema-gvp-module-i-pharmacovigilance-systems',
    pageLabel: '14',
    blockLocator: 'qualified person responsible for pharmacovigilance',
    sectionRef: 'I.C.1.1(QPPV 设置义务)',
    industryStage: 'cross_stage',
    aspect: 'pharmacovigilance',
    statementStart: 'As part of the pharmacovigilance system, the marketing authorisation holder shall have permanently',
    statementEnd: '(QPPV) [DIR Art 104(3)(a)].',
  },
  {
    sourceId: 'ema-gvp-module-i-pharmacovigilance-systems',
    pageLabel: '14',
    blockLocator: 'hierarchical relationship',
    sectionRef: 'I.C.1.1(QPPV 组织图定位)',
    industryStage: 'cross_stage',
    aspect: 'pharmacovigilance',
    statementStart: 'The duties of the QPPV shall be defined in a job description',
    statementEnd: 'supervisory staff [IR Art 10(2)].',
  },
  {
    sourceId: 'who-drug-therapeutics-committees-practical-guide',
    pageLabel: '15',
    blockLocator: 'Structure and organization of a drug',
    sectionRef: 'Ch.2 Structure and organization of a DTC(Summary)',
    industryStage: 'use',
    aspect: 'dtc_committee',
    statementStart: 'In order for a DTC to function it should have a multidisciplinary, transparent approach',
    statementEnd: 'an official mandate.',
  },
  {
    sourceId: 'who-drug-therapeutics-committees-practical-guide',
    pageLabel: '15',
    blockLocator: 'multidisciplinary approach sensitive to local politics',
    sectionRef: 'Ch.2 §2.1.1(多学科原则)',
    industryStage: 'use',
    aspect: 'dtc_committee',
    statementStart: 'DTC activities will involve different cadres of health professional',
    statementEnd: 'motivations and status.',
  },
]);

/**
 * pharma_context 层构建:中国法规 9 份(标记段 + 关键词映射)+ 国际标准 5 份(显式定位规则)。
 */
export function buildPharmaContextUnits(db, { courseId, chapterId, actorContext } = {}) {
  if (!isNonEmptyString(courseId) || !isNonEmptyString(chapterId)) {
    failCode('KB_UNIT_INPUT_INVALID', 'courseId/chapterId 必须是非空字符串');
  }
  const created = [];
  const skipped = [];
  const warnings = [];

  // --- 中国法规:标记段解析 ---
  for (const sourceId of CN_SOURCE_IDS) {
    const registry = REGULATOR_REGISTRY[sourceId];
    const blocks = blocksOfAsset(db, sourceId);
    if (blocks.length === 0) {
      warnings.push({ code: 'PHARMA_SOURCE_NOT_INGESTED', sourceId, message: `来源 ${sourceId} 无 content_blocks,跳过` });
      continue;
    }
    let lastClause = null;
    let matchedInSource = 0;
    for (const block of blocks) {
      if (!block.content_raw.includes(CN_MARKER)) continue;
      // 排除文首机器标注说明行(含 marker 但非条款)。
      if (block.content_raw.includes('为机器按关键词初标')) continue;
      const parsed = parseCnMarkedSegments(block.content_raw, lastClause);
      if (parsed.clause) lastClause = parsed.clause;
      for (const statement of parsed.segments) {
        const rule = CN_ASPECT_RULES.find((r) => statement.includes(r.keyword));
        if (!rule) continue;
        matchedInSource += 1;
        const regulatorContext = [registry.regulator, registry.documentNumber, parsed.clauseUsed].filter(Boolean).join(' ');
        const result = createPharmaContextUnit(
          db,
          {
            courseId,
            chapterId,
            industryStage: rule.industryStage,
            aspect: rule.aspect,
            statement,
            regulatorContext,
            reviewStatus: 'needs_review',
            fragmentIds: [block.id],
          },
          actorContext,
        );
        if (result.alreadyExists) {
          skipped.push({ sourceId, statement: statement.slice(0, 40), reason: 'already_exists' });
        } else {
          created.push({ unitId: result.unitId, sourceId, aspect: rule.aspect, industryStage: rule.industryStage, fragmentId: block.id });
        }
      }
    }
    if (matchedInSource === 0) {
      warnings.push({ code: 'PHARMA_CN_NO_MATCH', sourceId, message: `来源 ${sourceId} 无标记段命中关键词映射,0 产出(如实返回)` });
    }
  }

  // --- 国际标准:显式定位规则 ---
  for (const rule of INTL_RULES) {
    const registry = REGULATOR_REGISTRY[rule.sourceId];
    const blocks = blocksOfAsset(db, rule.sourceId);
    const block = blocks.find((b) => b.page_label === rule.pageLabel && b.content_raw.includes(rule.blockLocator));
    if (!block) {
      warnings.push({ code: 'PHARMA_INTL_NO_BLOCK', sourceId: rule.sourceId, sectionRef: rule.sectionRef, message: `未在 page ${rule.pageLabel} 找到含 "${rule.blockLocator}" 的块,跳过(不硬凑)` });
      continue;
    }
    const statement = sliceVerbatim(block.content_raw, rule.statementStart, rule.statementEnd);
    if (!statement) {
      warnings.push({ code: 'PHARMA_INTL_NO_SPAN', sourceId: rule.sourceId, sectionRef: rule.sectionRef, fragmentId: block.id, message: '起止串定位失败,跳过(不硬凑)' });
      continue;
    }
    const result = createPharmaContextUnit(
      db,
      {
        courseId,
        chapterId,
        industryStage: rule.industryStage,
        aspect: rule.aspect,
        statement,
        regulatorContext: `${registry.regulator} ${registry.documentNumber} ${rule.sectionRef}`,
        reviewStatus: 'needs_review',
        fragmentIds: [block.id],
      },
      actorContext,
    );
    if (result.alreadyExists) {
      skipped.push({ sourceId: rule.sourceId, sectionRef: rule.sectionRef, reason: 'already_exists' });
    } else {
      created.push({ unitId: result.unitId, sourceId: rule.sourceId, aspect: rule.aspect, industryStage: rule.industryStage, fragmentId: block.id });
    }
  }

  return { created, skipped, warnings };
}

// ---------------------------------------------------------------------------
// C. company_fact 层
// ---------------------------------------------------------------------------
// 事实清单:任务 C 给定(下载阶段官方披露定位已核验出处)。locators 全部命中同一块才算
// 命中(取阅读序第一块);statement 为块内 verbatim 切片(statementStart..statementEnd)。
// 未命中 → missed 记录,不硬凑。全部 review_status='needs_review',case_candidate=0。
const COMPANY_FACT_RULES = Object.freeze([
  // 恒瑞医药(FY2025 年报)
  {
    sourceId: 'doc_hengrui_600276_ar2025', company: '恒瑞医药', reportPeriod: 'FY2025', factType: 'org_change',
    factLabel: '研发组织架构整合',
    locators: ['优化研发组织架构'],
    statementStart: '（3）优化研发组织架构', statementEnd: '保障产品全周期价值决策的一致性。',
  },
  {
    sourceId: 'doc_hengrui_600276_ar2025', company: '恒瑞医药', reportPeriod: 'FY2025', factType: 'org_change',
    factLabel: '销售体系组织架构优化',
    locators: ['深化销售体系改革', '组织架构优化实现人岗'],
    statementStart: '（1）优化组织结构，促进运营提效。', statementEnd: '为市场拓展及业绩增长注入强劲动力。',
  },
  {
    sourceId: 'doc_hengrui_600276_ar2025', company: '恒瑞医药', reportPeriod: 'FY2025', factType: 'manufacturing_quality',
    factLabel: '9 城市 12 个生产基地',
    locators: ['9 个城市拥有规模庞大且功能互补的 12 个生产基地'],
    statementStart: '公司在中国 9 个城市拥有规模庞大且功能互补的 12 个生产基地', statementEnd: '优化生产成本。',
  },
  {
    sourceId: 'doc_hengrui_600276_ar2025', company: '恒瑞医药', reportPeriod: 'FY2025', factType: 'rd_organization',
    factLabel: '研发人员 5,684 人占比 27.59%',
    locators: ['公司研发人员的数量 5,684', '研发人员数量占公司总人数的比例（%） 27.59'],
    statementStart: '公司研发人员的数量 5,684', statementEnd: '研发人员数量占公司总人数的比例（%） 27.59',
  },
  {
    sourceId: 'doc_hengrui_600276_ar2025', company: '恒瑞医药', reportPeriod: 'FY2025', factType: 'incentive',
    factLabel: '激励机制改革',
    locators: ['深化激励与活力机制改革'],
    statementStart: '深化激励与活力机制改革。', statementEnd: '强化激励的精准性与及时性。',
  },
  // 药明康德(2025 年报)
  {
    sourceId: 'doc_wuxiapptec_603259_ar2025', company: '药明康德', reportPeriod: 'FY2025', factType: 'rd_organization',
    factLabel: '研发人员 25,983 人占比 76.8%',
    locators: ['公司研发人员的数量 25,983', '研发人员数量占公司总人数的比例（%） 76.8'],
    statementStart: '公司研发人员的数量 25,983', statementEnd: '研发人员数量占公司总人数的比例（%） 76.8',
  },
  {
    sourceId: 'doc_wuxiapptec_603259_ar2025', company: '药明康德', reportPeriod: 'FY2025', factType: 'governance',
    factLabel: '沪港两地上市治理架构',
    locators: ['沪港两地上市公司'],
    statementStart: '公司作为沪港两地上市公司', statementEnd: '持续完善公司治理体系。',
  },
  {
    sourceId: 'doc_wuxiapptec_603259_ar2025', company: '药明康德', reportPeriod: 'FY2025', factType: 'manufacturing_quality',
    factLabel: '全球产能建设',
    locators: ['加速推进全球布局和产能建设'],
    statementStart: '公司加速推进全球布局和产能建设', statementEnd: '成功通过FDA 现场检查。',
  },
  {
    sourceId: 'doc_wuxiapptec_603259_ar2025', company: '药明康德', reportPeriod: 'FY2025', factType: 'risk',
    factLabel: '核心技术人员激励机制不能落实的流失风险',
    locators: ['核心技术人员流失的风险', '核心技术人员的激励机制不能落实'],
    statementStart: '(6) 核心技术人员流失的风险', statementEnd: '利影响。',
  },
  // 上海医药(2025 年报)
  {
    sourceId: 'doc_shanghaipharma_601607_ar2025', company: '上海医药', reportPeriod: 'FY2025', factType: 'business_segment',
    factLabel: '医药工业/医药商业双板块',
    locators: ['医药工业和医药商业均居国内领先地位'],
    statementStart: '主营业务所覆盖的', statementEnd: '国内领先地位。',
  },
  {
    sourceId: 'doc_shanghaipharma_601607_ar2025', company: '上海医药', reportPeriod: 'FY2025', factType: 'manufacturing_quality',
    factLabel: '20 个生产基地关键指标改善',
    locators: ['20 个生产基地'],
    statementStart: '报告期内，公司重点实施', statementEnd: '关键指标改善；',
  },
  {
    sourceId: 'doc_shanghaipharma_601607_ar2025', company: '上海医药', reportPeriod: 'FY2025', factType: 'distribution_network',
    factLabel: '零售整合与核心门店建设',
    locators: ['加快推动全国零售业务整合，聚力核心门店建设'],
    statementStart: '加快推动全国零售业务整合，聚力核心门店建设', statementEnd: '创新服务模式。',
  },
  {
    sourceId: 'doc_shanghaipharma_601607_ar2025', company: '上海医药', reportPeriod: 'FY2025', factType: 'org_change',
    factLabel: '市场化机制改革',
    locators: ['市场化机制、决策机制、激励机制等方面的深化改革'],
    statementStart: '将持续推动公司在治理结构、市场化机制、决策机制、激励机制等方面的深化改革', statementEnd: '高质量发展。',
  },
  // 益丰药房(2025 年报)
  {
    sourceId: 'doc_yifeng_603939_ar2025', company: '益丰药房', reportPeriod: 'FY2025', factType: 'distribution_network',
    factLabel: '期末门店 14,831 家(含加盟 4,313)',
    locators: ['截至报告期末，公司门店总数14,831 家（含加盟店4,313 家）'],
    statementStart: '截至报告期末，公司门店总数14,831 家（含加盟店4,313 家）', statementEnd: '147 家。',
  },
  {
    sourceId: 'doc_yifeng_603939_ar2025', company: '益丰药房', reportPeriod: 'FY2025', factType: 'org_change',
    factLabel: '组织架构与门店网络优化',
    locators: ['通过组织架构和门店网络优化'],
    statementStart: '报告期内，通过组织架构和门店网络优化', statementEnd: '盈利能力持续提升。',
  },
  {
    sourceId: 'doc_yifeng_603939_ar2025', company: '益丰药房', reportPeriod: 'FY2025', factType: 'incentive',
    factLabel: '薪酬激励体系重构',
    locators: ['重构员工薪酬激励体系'],
    statementStart: '通过人力资源基础体系重构、门店编制梳理、组织结构优', statementEnd: '打通员工职业发展通道；',
  },
  // Pfizer(10-K FY2025)
  {
    sourceId: 'doc_pfizer_10k_fy2025', company: 'Pfizer', reportPeriod: 'FY2025', factType: 'business_segment',
    factLabel: 'three operating segments(Biopharma/PC1/Ignite),Biopharma 为唯一 reportable segment',
    locators: ['three operating segments', 'Biopharma is the only reportable segment.'],
    statementStart: 'We manage our commercial operations through a global structure', statementEnd: 'Biopharma is the only reportable segment.',
  },
  {
    sourceId: 'doc_pfizer_10k_fy2025', company: 'Pfizer', reportPeriod: 'FY2025', factType: 'org_change',
    factLabel: '2026-01-01 起商业架构重组、新设 Global Hospital and Biosimilars organization',
    locators: ['at the beginning of 2026, we made changes', 'Global Hospital and Biosimilars organization'],
    statementStart: 'As part of our continued focus on commercial execution, at the beginning of 2026', statementEnd: 'is as follows:',
  },
  {
    sourceId: 'doc_pfizer_10k_fy2025', company: 'Pfizer', reportPeriod: 'FY2025', factType: 'org_change',
    factLabel: '关停 Pfizer Ignite',
    locators: ['made the decision to discontinue Pfizer Ignite'],
    statementStart: 'In 2025, Pfizer made the decision to discontinue Pfizer Ignite', statementEnd: 'successful transition of work.',
  },
  // CVS Health(10-K FY2025)
  {
    sourceId: 'doc_cvs_10k_fy2025', company: 'CVS Health', reportPeriod: 'FY2025', factType: 'business_segment',
    factLabel: 'four reportable segments(Health Care Benefits/Health Services/Pharmacy & Consumer Wellness/Corporate)',
    locators: ['has four reportable segments: Health Care Benefits, Health Services, Pharmacy & Consumer Wellness'],
    statementStart: 'The Company has four reportable segments', statementEnd: 'Corporate/Other.',
  },
  {
    sourceId: 'doc_cvs_10k_fy2025', company: 'CVS Health', reportPeriod: 'FY2025', factType: 'distribution_network',
    factLabel: '约 9,000 零售门店 + 1,000+ 诊所',
    locators: ['approximately 9,000 retail locations, more than 1,000 walk-in and primary care medical clinics'],
    statementStart: 'we had approximately 9,000 retail locations', statementEnd: 'expanding specialty pharmacy solutions.',
  },
  // Roche(AR2025)
  {
    sourceId: 'doc_roche_ar2025', company: 'Roche', reportPeriod: 'AR2025', factType: 'business_segment',
    factLabel: 'Pharmaceuticals/Diagnostics 双分部销售(CHF 47.7bn / 13.8bn)',
    locators: ['Pharmaceuticals Division increased by', 'Diagnostics Division’s sales increased by'],
    statementStart: 'Sales in the Pharmaceuticals Division increased by', statementEnd: 'reforms in China.',
  },
  {
    sourceId: 'doc_roche_ar2025', company: 'Roche', reportPeriod: 'AR2025', factType: 'governance',
    factLabel: 'Group structure and shareholders(双分部构成)',
    locators: ['operating businesses are organised into', 'Pharmaceuticals and Diagnostics'],
    statementStart: 'Roche’s operating businesses are organised into', statementEnd: 'Chugai.',
  },
  // AstraZeneca(AR2025)
  {
    sourceId: 'doc_astrazeneca_ar2025', company: 'AstraZeneca', reportPeriod: 'AR2025', factType: 'business_segment',
    factLabel: '三大治疗领域板块(Oncology/BioPharmaceuticals/Rare Disease)',
    locators: ['Oncology', 'BioPharmaceuticals', 'Rare Disease', 'Total Revenue by therapy area'],
    statementStart: 'Oncology\nLeading a revolution to transform cancer care.', statementEnd: 'Total Revenue by therapy area',
  },
  {
    sourceId: 'doc_astrazeneca_ar2025', company: 'AstraZeneca', reportPeriod: 'AR2025', factType: 'rd_organization',
    factLabel: '按治疗领域分设的专注化 R&D 组织',
    locators: ['three therapy area', 'focused R&D organisations'],
    statementStart: 'We have three therapy area', statementEnd: 'and Rare Disease.',
  },
]);

/**
 * company_fact 层构建:25 条披露事实确定性定位;命中建单元,未命中记 missed。
 */
export function buildCompanyFactUnits(db, { courseId, chapterId, actorContext } = {}) {
  if (!isNonEmptyString(courseId) || !isNonEmptyString(chapterId)) {
    failCode('KB_UNIT_INPUT_INVALID', 'courseId/chapterId 必须是非空字符串');
  }
  const created = [];
  const skipped = [];
  const missed = [];
  const blocksCache = new Map();

  for (const rule of COMPANY_FACT_RULES) {
    if (!blocksCache.has(rule.sourceId)) blocksCache.set(rule.sourceId, blocksOfAsset(db, rule.sourceId));
    const blocks = blocksCache.get(rule.sourceId);
    const block = blocks.find((b) => rule.locators.every((locator) => b.content_raw.includes(locator)));
    if (!block) {
      missed.push({ company: rule.company, factType: rule.factType, factLabel: rule.factLabel, reason: 'locator_not_found', locators: rule.locators });
      continue;
    }
    const statement = sliceVerbatim(block.content_raw, rule.statementStart, rule.statementEnd);
    if (!statement) {
      missed.push({ company: rule.company, factType: rule.factType, factLabel: rule.factLabel, reason: 'span_not_found', fragmentId: block.id });
      continue;
    }
    const result = createCompanyFactUnit(
      db,
      {
        courseId,
        chapterId,
        company: rule.company,
        reportPeriod: rule.reportPeriod,
        factType: rule.factType,
        statement,
        reviewStatus: 'needs_review',
        fragmentIds: [block.id],
      },
      actorContext,
    );
    if (result.alreadyExists) {
      skipped.push({ company: rule.company, factLabel: rule.factLabel, reason: 'already_exists' });
    } else {
      created.push({ unitId: result.unitId, company: rule.company, factType: rule.factType, factLabel: rule.factLabel, fragmentId: block.id });
    }
  }
  return { created, skipped, missed };
}

// ---------------------------------------------------------------------------
// D. 关系映射
// ---------------------------------------------------------------------------
// 单元解析助手:按确定性条件在已建单元中定位;找不到 → 关系不建(notBuilt 记原因)。
function findTheoryUnit(db, courseId, chapterId, concept) {
  return db
    .prepare('SELECT id FROM kb_knowledge_units WHERE course_id = ? AND chapter_id = ? AND concept = ? ORDER BY created_at LIMIT 1')
    .get(courseId, chapterId, concept);
}

function findPharmaUnit(db, courseId, chapterId, { aspect = null, statementContains }) {
  return db
    .prepare('SELECT id, aspect, statement FROM kb_pharma_context_units WHERE course_id = ? AND chapter_id = ? ORDER BY created_at')
    .all(courseId, chapterId)
    .find((row) => row.statement.includes(statementContains) && (aspect === null || row.aspect === aspect));
}

function findCompanyUnit(db, courseId, chapterId, { company, factType, statementContains }) {
  return db
    .prepare('SELECT id, statement FROM kb_company_fact_units WHERE course_id = ? AND chapter_id = ? AND company = ? AND fact_type = ? ORDER BY created_at')
    .all(courseId, chapterId, company, factType)
    .find((row) => row.statement.includes(statementContains));
}

// 单元首个来源片段(关系的 evidence 锚点:支撑文本即对端单元的来源片段)。
function firstFragmentOf(db, layer, unitId) {
  if (layer === 'theory') {
    return db.prepare('SELECT fragment_id AS id FROM kb_unit_fragments WHERE unit_id = ? ORDER BY order_index LIMIT 1').get(unitId)?.id ?? null;
  }
  const table = layer === 'pharma_context' ? 'kb_pharma_context_fragments' : 'kb_company_fact_fragments';
  return db.prepare(`SELECT fragment_id AS id FROM ${table} WHERE unit_id = ? LIMIT 1`).get(unitId)?.id ?? null;
}

// 配对清单(任务 D):每条给出 from/to 的确定性定位与 evidence 侧。
// from/to 描述元组:[layer, 定位参数]。evidenceSide 决定 evidence_fragment_id 取哪侧片段。
const RELATION_RULES = Object.freeze([
  // 组织结构(theory)→ applied_in → 各公司 org/business 单元(≥3 条,此处 5 条)。
  { note: '组织结构→Pfizer 三分部', from: ['theory', { concept: 'organizational structure' }], relationType: 'applied_in', to: ['company_fact', { company: 'Pfizer', factType: 'business_segment', statementContains: 'three operating segments' }], evidenceSide: 'to' },
  { note: '组织结构→CVS 四分部', from: ['theory', { concept: 'organizational structure' }], relationType: 'applied_in', to: ['company_fact', { company: 'CVS Health', factType: 'business_segment', statementContains: 'four reportable segments' }], evidenceSide: 'to' },
  { note: '组织结构→AZ 三大治疗领域', from: ['theory', { concept: 'organizational structure' }], relationType: 'applied_in', to: ['company_fact', { company: 'AstraZeneca', factType: 'business_segment', statementContains: 'Rare Disease' }], evidenceSide: 'to' },
  { note: '组织结构→Roche 双分部', from: ['theory', { concept: 'organizational structure' }], relationType: 'applied_in', to: ['company_fact', { company: 'Roche', factType: 'business_segment', statementContains: 'Diagnostics Division' }], evidenceSide: 'to' },
  { note: '组织结构→上海医药双板块', from: ['theory', { concept: 'organizational structure' }], relationType: 'applied_in', to: ['company_fact', { company: '上海医药', factType: 'business_segment', statementContains: '医药工业和医药商业' }], evidenceSide: 'to' },
  // 矩阵制 → applied_in → 跨职能研发(AZ 研发组织;恒瑞研发架构含跨职能项目团队)。
  { note: '矩阵制→AZ 治疗领域 R&D 组织', from: ['theory', { concept: 'matrix structure' }], relationType: 'applied_in', to: ['company_fact', { company: 'AstraZeneca', factType: 'rd_organization', statementContains: 'focused R&D organisations' }], evidenceSide: 'to' },
  { note: '矩阵制→恒瑞研发跨职能项目团队', from: ['theory', { concept: 'matrix structure' }], relationType: 'applied_in', to: ['company_fact', { company: '恒瑞医药', factType: 'org_change', statementContains: '跨职能项目团队' }], evidenceSide: 'to' },
  // 外包(FDA 外包单元)→ constrained_by → MAH 责任单元(药品管理法第32条委托生产)。
  { note: 'FDA 外包→MAH 委托生产责任(药品管理法§32)', from: ['pharma_context', { statementContains: 'Outsourcing involves hiring a second party' }], relationType: 'constrained_by', to: ['pharma_context', { statementContains: '可以自行生产药品，也可以委托药品生产企业生产' }], evidenceSide: 'to' },
  // 控制幅度 → applied_in → 医药流通/门店网络单元(益丰/上海医药)。
  { note: '控制幅度→益丰门店网络', from: ['theory', { concept: 'span of control' }], relationType: 'applied_in', to: ['company_fact', { company: '益丰药房', factType: 'distribution_network', statementContains: '14,831' }], evidenceSide: 'to' },
  { note: '控制幅度→上海医药零售网络', from: ['theory', { concept: 'span of control' }], relationType: 'applied_in', to: ['company_fact', { company: '上海医药', factType: 'distribution_network', statementContains: '零售业务整合' }], evidenceSide: 'to' },
  // theory 内部关系。
  { note: '机械式 contrasts_with 有机式', from: ['theory', { concept: 'mechanistic bureaucratic structure' }], relationType: 'contrasts_with', to: ['theory', { concept: 'organic bureaucratic structure' }], evidenceSide: 'from' },
  { note: '部门化(differentiation)part_of 组织结构', from: ['theory', { concept: 'differentiation' }], relationType: 'part_of', to: ['theory', { concept: 'organizational structure' }], evidenceSide: 'from' },
  { note: '权变理论 supported_by §3.7 Woodward 研究', from: ['theory', { concept: 'contingency school' }], relationType: 'supported_by', to: ['theory', { concept: "Woodward's contingency research" }], evidenceSide: 'to' },
]);

// 任务 D 中因理论层无对应单元而不建的关系(如实记录,不硬凑):
//   - 专业权力 → applied_in → 质量受权人:theory 层无 expert/professional authority 单元;
//   - 委员会制 → applied_in → 药事委员会:theory 层无 committee 单元;
//   - 分权 → applied_in → 益丰门店网络:theory 层无 decentralization 单元(ch10 Key Terms 只有
//     centralization);
//   - 管理幅度 contrasts_with 管理层次:theory 层无 hierarchy levels 单元;
//   - 集权 contrasts_with 分权:同上,无 decentralization 单元。
const RELATION_NOT_BUILDABLE = Object.freeze([
  { note: '专业权力→质量受权人', reason: 'theory 层无 expert/professional authority 单元(语料 Key Terms 未覆盖)' },
  { note: '委员会制→药事管理与药物治疗学委员会', reason: 'theory 层无 committee 单元(语料 Key Terms 未覆盖)' },
  { note: '分权→益丰门店网络', reason: 'theory 层无 decentralization 单元(ch10 Key Terms 仅 centralization)' },
  { note: '管理幅度 contrasts_with 管理层次', reason: 'theory 层无 hierarchy levels 单元' },
  { note: '集权 contrasts_with 分权', reason: 'theory 层无 decentralization 单元' },
]);

function resolveRelationEndpoint(db, courseId, chapterId, [layer, locator]) {
  if (layer === 'theory') return findTheoryUnit(db, courseId, chapterId, locator.concept);
  if (layer === 'pharma_context') return findPharmaUnit(db, courseId, chapterId, locator);
  return findCompanyUnit(db, courseId, chapterId, locator);
}

/**
 * 关系映射:按 RELATION_RULES 在已建单元间确定性建关系;单元缺失或片段缺失 → notBuilt。
 */
export function buildUnitRelations(db, { courseId, chapterId, actorContext } = {}) {
  if (!isNonEmptyString(courseId) || !isNonEmptyString(chapterId)) {
    failCode('KB_UNIT_INPUT_INVALID', 'courseId/chapterId 必须是非空字符串');
  }
  const created = [];
  const skipped = [];
  const notBuilt = RELATION_NOT_BUILDABLE.map((r) => ({ ...r }));

  for (const rule of RELATION_RULES) {
    const fromUnit = resolveRelationEndpoint(db, courseId, chapterId, rule.from);
    const toUnit = resolveRelationEndpoint(db, courseId, chapterId, rule.to);
    if (!fromUnit || !toUnit) {
      notBuilt.push({ note: rule.note, reason: `单元缺失(from=${fromUnit ? 'ok' : 'missing'}, to=${toUnit ? 'ok' : 'missing'})` });
      continue;
    }
    const [evidenceLayer, evidenceUnitId] = rule.evidenceSide === 'from' ? [rule.from[0], fromUnit.id] : [rule.to[0], toUnit.id];
    const evidenceFragmentId = firstFragmentOf(db, evidenceLayer, evidenceUnitId);
    if (!evidenceFragmentId) {
      notBuilt.push({ note: rule.note, reason: '支撑片段缺失,关系不建' });
      continue;
    }
    const result = createUnitRelation(
      db,
      { fromLayer: rule.from[0], fromUnitId: fromUnit.id, relationType: rule.relationType, toLayer: rule.to[0], toUnitId: toUnit.id, evidenceFragmentId, reviewStatus: 'needs_review', createdBy: 'rule' },
      actorContext,
    );
    if (result.alreadyExists) {
      skipped.push({ note: rule.note, relationId: result.relationId, reason: 'already_exists' });
    } else {
      created.push({ relationId: result.relationId, note: rule.note, relationType: rule.relationType });
    }
  }
  return { created, skipped, notBuilt };
}

// ---------------------------------------------------------------------------
// E. 证据缺口更新
// ---------------------------------------------------------------------------
/**
 * 按新语料实际覆盖流转 kb_evidence_gaps(不改 eval-set 文件):
 *   od-eval-20(法规)/24/25(8 家年报)/29(§3.7+OCW)→ resolved(注明解析到的单元);
 *   od-eval-15/30(主教材/教师 PPT 缺失)→ 保持 open,补注"待教师提供主教材/PPT"。
 * counts 由调用方给(各层实测数量),写入 resolution_note 留痕。
 */
export function updateEvidenceGaps(db, { courseId = null, chapterId = null, actorContext } = {}) {
  // 实测数量直接按库内单元计(与调用次序无关,重跑语义稳定)。
  const count = (sql, ...params) => db.prepare(sql).get(...params).c;
  const scoped = courseId && chapterId;
  const pharmaCount = scoped
    ? count('SELECT COUNT(*) AS c FROM kb_pharma_context_units WHERE course_id = ? AND chapter_id = ?', courseId, chapterId)
    : count('SELECT COUNT(*) AS c FROM kb_pharma_context_units');
  const companyCount = scoped
    ? count('SELECT COUNT(*) AS c FROM kb_company_fact_units WHERE course_id = ? AND chapter_id = ?', courseId, chapterId)
    : count('SELECT COUNT(*) AS c FROM kb_company_fact_units');
  const theoryCount = scoped
    ? count("SELECT COUNT(*) AS c FROM kb_knowledge_units WHERE course_id = ? AND chapter_id = ? AND extraction_method = 'deterministic_rule'", courseId, chapterId)
    : count("SELECT COUNT(*) AS c FROM kb_knowledge_units WHERE extraction_method = 'deterministic_rule'");
  const pharmaNote = `已解析中国法规 9 份 + 国际标准 5 份为 ${pharmaCount} 条 pharma_context 单元(aspect 覆盖 dtc_committee/prescription_review/mah_responsibility/qualified_person/vbp_coordination/pharmacovigilance/quality_system 等),见 kb_pharma_context_units`;
  const companyNote = `已解析 8 家公司年报/10-K 披露为 ${companyCount} 条 company_fact 单元(business_segment/org_change/rd_organization/manufacturing_quality/distribution_network/governance/incentive/risk),见 kb_company_fact_units`;
  const theoryNote = `OpenStax §3.7 与 OCW 15.320 lec05 已确定性提取 ${theoryCount} 个 theory 单元(open system/contingency school/matrix strengths/front-back/lateral coordination/Galbraith/strategy-structure fit 等),见 kb_knowledge_units(extraction_method='deterministic_rule')`;

  const resolved = [];
  const keptOpen = [];
  const plans = [
    { questionId: 'od-eval-20', status: 'resolved', note: pharmaNote },
    { questionId: 'od-eval-24', status: 'resolved', note: companyNote },
    { questionId: 'od-eval-25', status: 'resolved', note: companyNote },
    { questionId: 'od-eval-29', status: 'resolved', note: theoryNote },
    { questionId: 'od-eval-15', status: 'open', note: '待教师提供主教材/PPT' },
    { questionId: 'od-eval-30', status: 'open', note: '待教师提供主教材/PPT' },
  ];
  for (const plan of plans) {
    const gap = db.prepare('SELECT id, status FROM kb_evidence_gaps WHERE question_id = ?').get(plan.questionId);
    if (!gap) {
      keptOpen.push({ questionId: plan.questionId, warning: 'gap 不存在,跳过(摄入服务负责登记)' });
      continue;
    }
    const result = setEvidenceGapStatus(db, plan.questionId, { status: plan.status, resolutionNote: plan.note }, actorContext);
    if (plan.status === 'resolved') {
      resolved.push({ questionId: plan.questionId, changed: result.changed });
    } else {
      keptOpen.push({ questionId: plan.questionId, status: 'open', note: plan.note });
    }
  }
  return { resolved, keptOpen };
}

// ---------------------------------------------------------------------------
// 编排入口
// ---------------------------------------------------------------------------
/**
 * 三层单元 + 关系 + 证据缺口一键构建(幂等;重跑零增量)。
 * @returns {{theory: object, pharmaContext: object, companyFact: object,
 *   relations: object, gaps: object, missed: object[], notBuiltRelations: object[],
 *   warnings: object[]}}
 */
export function buildLayeredKnowledgeBase(db, { courseId, chapterId, actorContext } = {}) {
  const theory = buildTheoryLayerUnits(db, { courseId, chapterId, actorContext });
  const pharmaContext = buildPharmaContextUnits(db, { courseId, chapterId, actorContext });
  const companyFact = buildCompanyFactUnits(db, { courseId, chapterId, actorContext });
  const relations = buildUnitRelations(db, { courseId, chapterId, actorContext });
  const gaps = updateEvidenceGaps(db, { courseId, chapterId, actorContext });
  return {
    theory,
    pharmaContext,
    companyFact,
    relations,
    gaps,
    missed: companyFact.missed,
    notBuiltRelations: relations.notBuilt,
    warnings: [...theory.warnings, ...pharmaContext.warnings],
  };
}
