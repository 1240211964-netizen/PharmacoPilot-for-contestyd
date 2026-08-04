// 知识检索服务(知识库 v0.1,组织设计章首发):非模型混合检索 + 引用完整性校验。
// 依据 docs/knowledge-base/management-principles-kb-v0.1-spec.md §5(检索设计)、§6(回答输出契约)、
// §7(Product Core 集成点)实现。全程确定性:FTS5 + bm25 + 元数据精确过滤 + 词典式查询扩展,
// 无任何模型调用(embedding/LLM 通道被 §5 权限闸门锁定,本服务不实现也不调用)。
//
// 通道组合(spec §5.1 四件套):
//   1. 中文分词主通道:content_blocks_fts.content_segmented(Intl.Segmenter('zh', word) 预分词、
//      空格连接,与探针 experiments/chinese-search/build-indexes.mjs 完全同口径),bm25() 排序。
//   2. 原文关键词兜底通道:content_blocks_fts.content_raw(unicode61),服务英文术语/编号/ASCII;
//      仅当分词通道无过门槛结果时启用(探针:分词通道 R@5=0.966 为词法最优,主从关系明确)。
//      偏差说明:任务描述提到"content_raw trigram",但 004 migration 的 content_blocks_fts
//      两个列均为 unicode61(migration 已冻结不可改);trigram 在探针中对 <3 字查询结构性失效,
//      本语料为英文长词文本,unicode61 原文通道承担同一"兜底"职责,语义等价。
//   3. 精确字段过滤(不走全文):courseId/chapterId(content_blocks.parser_metadata_json)、
//      sourceType(knowledge_assets.type)、reviewStatus/concept(kb_knowledge_units)。
//   4. 后处理:同 asset_version 相邻 order_index 命中块合并为一个结果(还原上下文,保留首块锚点)。
//
// 误召回门禁(spec §5.2):探针实测分词通道 OR 语义对无答案题误召回率 0.667(共享词元捞回噪声),
// 故候选必须同时通过两道确定性门槛才进入结果集:
//   - BM25_SCORE_THRESHOLD:bm25() 分值门槛(FTS5 bm25 返回负值,越小越优;候选须 <= 阈值)。
//   - MIN_QUERY_TERM_COVERAGE:有效查询词覆盖率下限(命中词数/有效词数,合并组内取并集)。
//   阈值在本文件头冻结为常量,标定记录见 experiments/kb-retrieval/(拒答题必须被门槛拦下)。
//
// 权限闸门(manifest permissionModel.defaultDeny):片段所属来源的 allowedOperations
// (随 parser_metadata_json 落库)必须显式含 'exact_or_lexical_search' 才可被检索;
// 未登记授权的片段一律排除。OpenStax 两份 acquired_reference_only 来源天然满足。
//
// 审核纪律:rejected 单元的片段默认排除(片段仅当被 rejected 单元独占链接时排除;
// 同时被非 rejected 单元链接的片段保留);unitId 标注只挂非 rejected 单元。
//
// 定位纪律:web 来源无印刷页码,pageIndex/pageLabel 如实回显 DB 值(可为 null),
// sectionAnchor 用标题路径重建,严禁虚构页码。
//
// 工作流集成(spec §7):每次检索必须落在某个 workflow_instance 上。
//   - 调用方传入 workflowInstanceId 时,校验存在后直接使用(生命周期归调用方);
//   - 未传入时,必须提供 workflowScope {courseId, classId, lessonId},由本函数内部创建
//     workflow_type='KB_RETRIEVAL' 的工作流(006 已扩展 CHECK;KB 工作流状态机另行约定为
//     DRAFT -> EVIDENCE_RETRIEVED,检索完成后由本函数翻转,不复用 S1 的 transitionWorkflow——
//     其转移表与守卫是 S1 专属);既无 workflowInstanceId 又无 workflowScope 时显式报错。
// 留痕与证据:每次检索追加 kb_retrieval_runs(006 触发器保证只增不改)+ 审计 kb.retrieval.completed
// (携带 corpus_version_hash 与 result_count;查询正文按审计纪律只留 sha256,不落明文);
// 检索结果同时逐条落为正式 evidence_links 行(007:claim_id 可空 = "检索阶段证据,尚未绑定断言",
// retrieval_run_id 关联本次检索),审计 kb.evidence.attached;同一 run 重复持久化不产生重复行。
import { createHash } from 'node:crypto';
import { appendAuditEvent } from './audit.mjs';
import { failCode } from './errors.mjs';
import { newId, nowIso } from './ids.mjs';
import { corpusVersionHash } from './knowledge-unit-service.mjs';
import { normalizeText } from '../document-parsers/manual-markdown-parser.mjs';

// ---------------------------------------------------------------------------
// 门槛常量(spec §5.2 误召回门禁;探针"OR 语义误召回 0.667"教训)。
// 标定方法:experiments/kb-retrieval/run-acceptance.mjs 对 24 条 ready_for_reference_retrieval
// 题 + 2 条 refusal 题实跑,阈值须同时满足:24 题证据定位 >=95%、refusal 题被门槛拦下或仅低分。
// FTS5 bm25() 返回 <=0 的负值,越小(越负)越优;候选须 rank <= BM25_SCORE_THRESHOLD。
// 两道门槛之外另有"零命中词元拒答"规则(见 searchKnowledge 内 OOV 检查):
// 查询显式写出的外文/术语词元在同范围语料中零命中时,直接判 insufficientEvidence——
// 该词元就是查询的核心诉求,语料没有就是没有,OR 语义捞回的共享词元噪声不得顶替(§6.2)。
// ---------------------------------------------------------------------------
export const BM25_SCORE_THRESHOLD = -0.05;
export const MIN_QUERY_TERM_COVERAGE = 0.08;

export const DEFAULT_RESULT_LIMIT = 10;
export const MAX_RESULT_LIMIT = 50;
// MATCH 候选池上限(门槛与合并在候选池之后执行,池必须远大于 limit 以免漏并相邻块)。
const MAX_CANDIDATE_ROWS = 200;
// verbatimQuote 为命中首块原文的前 N 字符(截取仍是原文子串,可过 quoteHash 机检;绝不补写省略号进引文)。
export const VERBATIM_QUOTE_MAX_CHARS = 280;

const RETRIEVAL_PERMISSION = 'exact_or_lexical_search';
const KB_RETRIEVAL_STATE_MACHINE_VERSION = '1.0.0';
export const INSUFFICIENT_EVIDENCE_MESSAGE = '当前知识库不足以支持该判断';

// 中文查询停用词:问句套话,对定位无贡献,保留只会稀释覆盖率门禁。确定性小词表,可审查。
const ZH_STOPWORDS = new Set([
  '什么', '的', '了', '与', '和', '或', '及', '在', '是', '都', '也', '就', '不', '更', '各',
  '哪些', '如何', '有', '无', '请', '给出', '说明', '分别', '指', '依据', '出自', '哪份', '来源',
  '之间', '存在', '关系', '核心', '差异', '主要', '风险', '化解', '条件', '适用', '优劣', '优势',
  '劣势', '典型', '特征', '判断', '辨析', '说法', '认为', '学生', '完整', '列出', '清单', '考虑',
  '需要', '影响', '方向', '某', '该', '其', '这', '那', '等', '对', '按', '根据', '所', '提供',
  '原文', '表述', '异同', '含义', '为什么', '怎么', '怎样', '是否', '必然', '吗', '呢', '它',
  '以及', '并且', '而且', '但', '但是', '而', '则', '即', '若', '如', '比如', '例如', '中',
  '出自', '哪', '哪些', '何', '各自', '基于', '假设', '选择', '还是', '属于', '哪种', '二者',
]);

// ---------------------------------------------------------------------------
// 课程核心概念双语别名表(人工维护的课程词典,非模型;范围随 spec §1.2 七概念冻结)。
// 用途一:查询扩展——中文题面命中某概念的任一中文别名时,把该概念的英文别名补入查询,
//   使中文问题可以命中英文来源片段(当前语料为英文 OpenStax,纯中文词元在原文中无匹配)。
// 用途二:concept 精确过滤与同义归并(验收脚本的概念召回判定复用同一表,单一事实源)。
// ---------------------------------------------------------------------------
export const CONCEPT_QUERY_ALIASES = Object.freeze({
  组织结构: Object.freeze({
    zh: Object.freeze(['组织结构', '组织设计', '正式组织', '非正式组织', '组织图', '官僚制']),
    en: Object.freeze([
      'organizational structure', 'organization structure', 'organizational design',
      'formal organization', 'informal organization', 'organizational chart', 'bureaucratic model', 'bureaucracy',
    ]),
  }),
  管理幅度与管理层次: Object.freeze({
    zh: Object.freeze(['管理幅度', '管理层次', '管理层级', '扁平化', '扁平', '高耸', '层级']),
    en: Object.freeze([
      'span of control', 'hierarchy', 'hierarchical', 'flatten', 'flat organization',
      'horizontal organizational structure', 'vertical organizational structure', 'tall',
    ]),
  }),
  集权与分权: Object.freeze({
    zh: Object.freeze(['集权', '分权', '集权化', '分权化', '分散式']),
    en: Object.freeze(['centralization', 'centralized', 'decentralization', 'decentralized', 'diffuse']),
  }),
  部门化: Object.freeze({
    zh: Object.freeze(['部门化', '职能', '事业部', '产品式', '产品线', '地域式', '矩阵']),
    en: Object.freeze([
      'departmentalization', 'functional structure', 'divisional structure', 'divisional',
      'product structure', 'geographic structure', 'matrix structure', 'differentiation',
    ]),
  }),
  机械式与有机式组织: Object.freeze({
    zh: Object.freeze(['机械式', '有机式', '标准化', '专业化']),
    en: Object.freeze([
      'mechanistic', 'organic', 'mechanistic structure', 'organic structure',
      'standardization', 'specialization',
    ]),
  }),
  权责关系: Object.freeze({
    zh: Object.freeze(['权责', '命令链', '指挥与控制', '汇报线', '汇报关系', '问责', '控制']),
    en: Object.freeze([
      'chain of command', 'command-and-control', 'command', 'control', 'authority',
      'accountability', 'accountable', 'responsibility', 'dual reporting',
    ]),
  }),
  组织设计的情境因素: Object.freeze({
    zh: Object.freeze(['情境因素', '权变因素', '权变', '环境']),
    en: Object.freeze(['contingency', 'contingency factors', 'environment', 'uncertainty', 'stable', 'unstable', 'circumstances']),
  }),
});

const segmenter = new Intl.Segmenter('zh', { granularity: 'word' });

/** Intl.Segmenter('zh', word) 分词,仅保留词元(丢弃标点/空白),空格连接。与探针同口径。 */
export function segmentText(text) {
  const tokens = [];
  for (const seg of segmenter.segment(text)) {
    if (seg.isWordLike) tokens.push(seg.segment);
  }
  return tokens.join(' ');
}

/** 查询侧分词:去重词元,剔除中文停用词(问句套话)。 */
export function queryTerms(query) {
  const tokens = [];
  const seen = new Set();
  for (const seg of segmenter.segment(query)) {
    if (!seg.isWordLike) continue;
    const token = seg.segment;
    if (ZH_STOPWORDS.has(token)) continue;
    if (seen.has(token)) continue;
    seen.add(token);
    tokens.push(token);
  }
  return tokens;
}

/**
 * 概念别名扩展:题面命中某核心概念的任一别名(中文子串 / 英文大小写不敏感子串)时,
 * 把该概念全部别名补入有效查询词集(英文别名多为多词短语,入 FTS 时作短语查询)。
 * 返回 { primary, expansionTerms, expansionPhrases, matchedConcepts }。
 */
export function expandQueryByConcepts(query) {
  const primary = queryTerms(query);
  const lowered = query.toLowerCase();
  const expansionTerms = [];
  const expansionPhrases = [];
  const matchedConcepts = [];
  const seen = new Set(primary.map((t) => t.toLowerCase()));
  for (const [concept, aliases] of Object.entries(CONCEPT_QUERY_ALIASES)) {
    const hit =
      aliases.zh.some((alias) => query.includes(alias)) ||
      aliases.en.some((alias) => lowered.includes(alias.toLowerCase()));
    if (!hit) continue;
    matchedConcepts.push(concept);
    for (const alias of [...aliases.zh, ...aliases.en]) {
      const key = alias.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      if (/[\s-]/.test(alias)) {
        // 多词/连字符别名:短语级匹配(command-and-control 在分词通道中是三个词元,短语查询覆盖)。
        expansionPhrases.push(alias);
      } else {
        expansionTerms.push(alias);
      }
    }
  }
  return { primary, expansionTerms, expansionPhrases, matchedConcepts };
}

/** FTS5 MATCH 表达式:全部词元/短语以 OR 连接,双引号包裹转义;列过滤由调用方加前缀。 */
function buildFtsMatchExpr(column, terms, phrases) {
  const clauses = [];
  for (const term of terms) clauses.push(`"${term.replace(/"/g, '""')}"`);
  for (const phrase of phrases) clauses.push(`"${phrase.replace(/"/g, '""')}"`);
  if (clauses.length === 0) return null;
  return `${column} : (${clauses.join(' OR ')})`;
}

/**
 * 分词索引回填:content_blocks.content_segmented 为 NULL 的行以 Intl.Segmenter 确定性补齐。
 * 背景:knowledge-source-service 摄入时未填 content_segmented(001 表该列可空);
 * 本列是派生索引列(content_blocks_fts 经 au 触发器同步),content_raw 一字不动。
 * 幂等:已填充的行不重算;searchKnowledge 每次调用前自动执行(无 NULL 行时为 0 成本 no-op)。
 */
export function ensureSegmentationIndex(db, { actorContext = {} } = {}) {
  const pending = db
    .prepare('SELECT rowid, content_raw FROM content_blocks WHERE content_segmented IS NULL')
    .all();
  if (pending.length === 0) return { updated: 0 };
  const update = db.prepare('UPDATE content_blocks SET content_segmented = ? WHERE rowid = ?');
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const row of pending) {
      update.run(segmentText(row.content_raw), row.rowid);
    }
    appendAuditEvent(db, {
      eventType: 'kb.index.segmented',
      actorType: actorContext.actorType,
      actorId: actorContext.actorId,
      entityType: 'content_block',
      entityId: null,
      payload: { backfilledBlocks: pending.length, segmenter: "Intl.Segmenter('zh',{granularity:'word'})" },
    });
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return { updated: pending.length };
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

// 标题层级启发:content_blocks 只存标题文本(parser 未保留 markdown # 层级),
// 用编号模式重建层级路径——Chapter N 为一级、N.N 编号节与章级固定小节为二级、其余标题为三级。
// 对 web 来源这是"章节小节标识"的确定性重建;有损失处(未编号的三四级并列)如实退化为最近标题。
const HEADING_LEVEL1_RE = /^chapter\s+\d+/i;
const HEADING_LEVEL2_RES = [
  /^\d+\.\d+(\s|$|:)/,
  /^(introduction|key terms|summary of learning outcomes|chapter review questions|management skills application exercises|managerial decision exercises|critical thinking case)\b/i,
];

function headingLevelOf(text) {
  if (HEADING_LEVEL1_RE.test(text)) return 1;
  if (HEADING_LEVEL2_RES.some((re) => re.test(text))) return 2;
  return 3;
}

/** 计算某块的标题层级路径(同版本内、order_index 之前的标题链),如 "Chapter 10: … > 10.1 … > Span of Control"。 */
function sectionAnchorFor(headings, orderIndex) {
  const last = [null, null, null];
  for (const heading of headings) {
    if (heading.order_index > orderIndex) break;
    last[heading.level - 1] = heading.text;
  }
  const path = [];
  for (const text of last) {
    if (text !== null && !path.includes(text)) path.push(text);
  }
  return path;
}

/** 全局语料版本标识(filters 未给 course/chapter 时):全部 active 块的 content_hash 排序后整体 sha256。 */
function globalCorpusVersionHash(db) {
  const rows = db
    .prepare(
      `SELECT cb.content_hash AS content_hash
       FROM content_blocks cb
       JOIN asset_versions av ON av.id = cb.asset_version_id
       WHERE av.source_status = 'active'
       ORDER BY cb.content_hash`,
    )
    .all();
  return `sha256:${createHash('sha256').update(JSON.stringify(rows.map((r) => r.content_hash))).digest('hex')}`;
}

const FILTER_KEYS = new Set(['courseId', 'chapterId', 'sourceType', 'reviewStatus', 'concept']);
const REVIEW_STATUSES = new Set(['machine_extracted', 'teacher_verified', 'needs_review', 'rejected']);

function validateFilters(filters) {
  for (const key of Object.keys(filters)) {
    if (!FILTER_KEYS.has(key)) {
      failCode('KB_RETRIEVAL_INPUT_INVALID', `未知过滤字段: ${key}(允许: ${[...FILTER_KEYS].join('/')})`);
    }
  }
  if (filters.reviewStatus !== undefined && !REVIEW_STATUSES.has(filters.reviewStatus)) {
    failCode('KB_RETRIEVAL_INPUT_INVALID', `reviewStatus 必须是 ${[...REVIEW_STATUSES].join('/')}`);
  }
}

/**
 * 词元语料存在性(OOV 拒答用):该词元是否在可检索范围内(active 版本 + 已授权检索 +
 * 同 course/chapter 过滤)的任一片段原文中出现。instr 精确子串,不走 LIKE 通配。
 */
function corpusTermPresence(db, term, filters) {
  const where = [
    "av.source_status = 'active'",
    'instr(lower(cb.content_raw), lower(?)) > 0',
    `EXISTS (
       SELECT 1 FROM json_each(json_extract(cb.parser_metadata_json, '$.allowedOperations')) op
       WHERE op.value = '${RETRIEVAL_PERMISSION}'
     )`,
  ];
  const params = [term];
  if (filters.courseId !== undefined) {
    where.push(`json_extract(cb.parser_metadata_json, '$.courseId') = ?`);
    params.push(filters.courseId);
  }
  if (filters.chapterId !== undefined) {
    where.push(`json_extract(cb.parser_metadata_json, '$.chapterId') = ?`);
    params.push(filters.chapterId);
  }
  const sql = `
    SELECT cb.id
    FROM content_blocks cb
    JOIN asset_versions av ON av.id = cb.asset_version_id
    WHERE ${where.join('\n      AND ')}
    LIMIT 1`;
  return db.prepare(sql).get(...params) !== undefined;
}

/**
 * 候选检索:FTS5 MATCH + 精确过滤,返回按 bm25 升序(越负越优)的候选行。
 * channel: 'segmented'(分词主通道)| 'raw'(原文关键词兜底通道)。
 */
function fetchCandidates(db, { channel, terms, phrases, filters, conceptNames }) {
  const column = channel === 'segmented' ? 'content_segmented' : 'content_raw';
  const matchExpr = buildFtsMatchExpr(column, terms, phrases);
  if (matchExpr === null) return [];

  const where = ['content_blocks_fts MATCH ?', "av.source_status = 'active'"];
  const params = [matchExpr];

  // 权限闸门:片段来源必须显式授权 exact_or_lexical_search(defaultDeny,未登记即排除)。
  where.push(
    `EXISTS (
       SELECT 1 FROM json_each(json_extract(cb.parser_metadata_json, '$.allowedOperations')) op
       WHERE op.value = '${RETRIEVAL_PERMISSION}'
     )`,
  );
  // rejected 单元独占链接的片段默认排除(同时被非 rejected 单元链接的片段保留)。
  // 注意:OR 组合必须整体加括号——SQL 中 AND 优先级高于 OR,不括号化会旁路其后的全部过滤条件。
  where.push(
    `(
       NOT EXISTS (
         SELECT 1 FROM kb_unit_fragments uf
         JOIN kb_knowledge_units u ON u.id = uf.unit_id
         WHERE uf.fragment_id = cb.id
       ) OR EXISTS (
         SELECT 1 FROM kb_unit_fragments uf
         JOIN kb_knowledge_units u ON u.id = uf.unit_id
         WHERE uf.fragment_id = cb.id AND u.review_status <> 'rejected'
       )
     )`,
  );

  if (filters.courseId !== undefined) {
    where.push(`json_extract(cb.parser_metadata_json, '$.courseId') = ?`);
    params.push(filters.courseId);
  }
  if (filters.chapterId !== undefined) {
    where.push(`json_extract(cb.parser_metadata_json, '$.chapterId') = ?`);
    params.push(filters.chapterId);
  }
  if (filters.sourceType !== undefined) {
    where.push('ka.type = ?');
    params.push(filters.sourceType);
  }
  if (filters.reviewStatus !== undefined) {
    where.push(
      `EXISTS (
         SELECT 1 FROM kb_unit_fragments uf
         JOIN kb_knowledge_units u ON u.id = uf.unit_id
         WHERE uf.fragment_id = cb.id AND u.review_status = ?
       )`,
    );
    params.push(filters.reviewStatus);
  }
  if (conceptNames !== null) {
    const placeholders = conceptNames.map(() => '?').join(', ');
    where.push(
      `EXISTS (
         SELECT 1 FROM kb_unit_fragments uf
         JOIN kb_knowledge_units u ON u.id = uf.unit_id
         WHERE uf.fragment_id = cb.id AND lower(u.concept) IN (${placeholders})
       )`,
    );
    params.push(...conceptNames);
  }

  // FTS5 的 MATCH 要求 FTS 表为驱动表;多表 JOIN 会让规划器改序并报
  // "unable to use function MATCH in the requested context"。故先在子查询中独立完成
  // MATCH + bm25 排序(候选池),再 JOIN 业务表做精确过滤。
  const sql = `
    SELECT cb.id, cb.asset_version_id, cb.block_type, cb.order_index, cb.page_index, cb.page_label,
           cb.content_raw, cb.content_hash, cb.parser_metadata_json,
           f.rank AS rank
    FROM (
      SELECT rowid, bm25(content_blocks_fts) AS rank
      FROM content_blocks_fts
      WHERE content_blocks_fts MATCH ?
      ORDER BY rank
      LIMIT ${MAX_CANDIDATE_ROWS}
    ) f
    JOIN content_blocks cb ON cb.rowid = f.rowid
    JOIN asset_versions av ON av.id = cb.asset_version_id
    JOIN knowledge_assets ka ON ka.id = av.asset_id
    WHERE ${where.slice(1).join('\n      AND ')}
    ORDER BY f.rank`;
  return db.prepare(sql).all(...params);
}

/** 有效查询词集:primary + 扩展词(短语按整体计 1 词)。覆盖率门禁的分母。 */
function effectiveTermList({ primary, expansionTerms, expansionPhrases }) {
  return [...primary, ...expansionTerms, ...expansionPhrases];
}

/** 合并组(或单块)的命中词数:组内块文本取并集后做小写子串计数(短语精确、单词容忍词形如 environments)。 */
function matchedTermCount(terms, groupRows) {
  const lowered = groupRows.map((row) => row.content_raw.toLowerCase());
  let matched = 0;
  for (const term of terms) {
    const needle = term.toLowerCase();
    if (lowered.some((text) => text.includes(needle))) matched += 1;
  }
  return matched;
}

/** 同 asset_version 相邻 order_index 命中块合并为一组(还原上下文),保留首块锚点;组分值取组内最优 rank。 */
function mergeAdjacentRows(rows) {
  const byVersion = new Map();
  for (const row of rows) {
    if (!byVersion.has(row.asset_version_id)) byVersion.set(row.asset_version_id, []);
    byVersion.get(row.asset_version_id).push(row);
  }
  const groups = [];
  for (const versionRows of byVersion.values()) {
    versionRows.sort((a, b) => a.order_index - b.order_index);
    let current = null;
    for (const row of versionRows) {
      if (current !== null && row.order_index === current[current.length - 1].order_index + 1) {
        current.push(row);
      } else {
        if (current !== null) groups.push(current);
        current = [row];
      }
    }
    if (current !== null) groups.push(current);
  }
  for (const group of groups) {
    group.bestRank = Math.min(...group.map((row) => row.rank));
  }
  groups.sort((a, b) => a.bestRank - b.bestRank);
  return groups;
}

/** 组内首个非 rejected 单元链接(按 kb_unit_fragments.order_index),无则 null。 */
function firstLinkedUnitId(db, fragmentIds) {
  const placeholders = fragmentIds.map(() => '?').join(', ');
  const row = db
    .prepare(
      `SELECT uf.unit_id AS unit_id
       FROM kb_unit_fragments uf
       JOIN kb_knowledge_units u ON u.id = uf.unit_id
       WHERE uf.fragment_id IN (${placeholders}) AND u.review_status <> 'rejected'
       ORDER BY uf.order_index
       LIMIT 1`,
    )
    .get(...fragmentIds);
  return row?.unit_id ?? null;
}

// ---------------------------------------------------------------------------
// 检索证据落库(007):检索结果逐条写为正式 evidence_links 行。
// 列对齐 S1 attachKnowledgeEvidence 约定(claims.mjs):evidence_type='knowledge_block',
// source_id=knowledge_assets.id(ka_*),source_version_id=assetVersionId,page/bbox 从块带出;
// 差异点即设计点:claim_id=NULL(检索阶段断言尚不存在,007 放宽),retrieval_run_id 关联
// kb_retrieval_runs(证据可回溯到本次检索);逐字引文/content_hash 从 DB 重取(不信任调用方),
// retrieved_at 用检索 run 的 created_at(证据在检索时刻取得,不是落库时刻)。
// 幂等:整 run 级——已存在该 run 的证据行即视为已持久化;DB 层另有
// UNIQUE(retrieval_run_id, content_block_id) 兜底(007)。
// ---------------------------------------------------------------------------

/**
 * 为一个检索 run 插入 evidence_links 行(无幂等预检,调用方负责)。
 * @param {object} runRow kb_retrieval_runs 行(需含 id/created_at/workflow_instance_id/results_json)
 * @returns {string[]} 新建证据行 id 列表
 */
function insertRetrievalEvidenceRows(db, runRow, actorContext = {}) {
  const results = JSON.parse(runRow.results_json);
  const evidenceIds = [];
  const blockSelect = db.prepare(
    `SELECT cb.id, cb.content_hash, cb.page_index, cb.page_label,
            av.id AS version_id, av.asset_id, av.source_status, av.effective_date
     FROM content_blocks cb
     JOIN asset_versions av ON av.id = cb.asset_version_id
     WHERE cb.id = ?`,
  );
  const insert = db.prepare(
    `INSERT INTO evidence_links(
       id, claim_id, decision_id, evidence_type, source_id, source_version_id, content_block_id,
       runtime_observation_id, page_index, page_label, bbox_json, bbox_coordinate_system,
       verbatim_quote, normalized_quote, source_status, effective_date, superseded_by, content_hash,
       retrieved_at, retrieval_run_id
     ) VALUES (?, NULL, NULL, 'knowledge_block', ?, ?, ?, NULL, ?, ?, NULL, 'none', ?, ?, ?, ?, NULL, ?, ?, ?)`,
  );
  for (const result of results) {
    const block = blockSelect.get(result.fragmentId);
    if (!block) {
      // 检索与落库之间片段被撤(理论上 content_blocks 不可删):显式报错,绝不静默跳过。
      failCode('KB_FRAGMENT_NOT_FOUND', `检索结果片段不存在,无法落 evidence_links: ${result.fragmentId}`, {
        fragmentId: result.fragmentId,
        retrievalRunId: runRow.id,
      });
    }
    if (block.version_id !== result.assetVersionId || block.content_hash !== result.contentHash) {
      failCode('KB_RETRIEVAL_INPUT_INVALID', `检索结果与当前片段状态不一致(run 记录可能被篡改): ${result.fragmentId}`, {
        fragmentId: result.fragmentId,
        retrievalRunId: runRow.id,
      });
    }
    const evidenceId = newId('ev');
    insert.run(
      evidenceId,
      block.asset_id,
      block.version_id,
      block.id,
      block.page_index,
      block.page_label,
      result.verbatimQuote,
      normalizeText(result.verbatimQuote),
      block.source_status,
      block.effective_date,
      block.content_hash,
      runRow.created_at,
      runRow.id,
    );
    evidenceIds.push(evidenceId);
  }
  return evidenceIds;
}

/**
 * 把一个检索 run 的结果持久化为 evidence_links 行 + 审计 kb.evidence.attached(幂等)。
 * searchKnowledge 在留痕事务内自动调用同等逻辑;本函数供独立调用(如对历史 run 补落)。
 * @param {object} db
 * @param {{retrievalRunId: string, actorContext?: object}} args
 * @returns {{retrievalRunId: string, linked: number, evidenceIds: string[], alreadyPersisted: boolean}}
 *   0 结果 run(insufficientEvidence)无证据可落,如实返回 linked=0(不写审计)。
 */
export function persistRetrievalEvidence(db, { retrievalRunId, actorContext = {} } = {}) {
  if (!isNonEmptyString(retrievalRunId)) {
    failCode('KB_RETRIEVAL_INPUT_INVALID', 'retrievalRunId 必须是非空字符串');
  }
  const runRow = db.prepare('SELECT * FROM kb_retrieval_runs WHERE id = ?').get(retrievalRunId);
  if (!runRow) {
    failCode('KB_RETRIEVAL_RUN_NOT_FOUND', `检索 run 不存在: ${retrievalRunId}`, { retrievalRunId });
  }
  const resultCount = JSON.parse(runRow.results_json).length;
  if (resultCount === 0) {
    return { retrievalRunId, linked: 0, evidenceIds: [], alreadyPersisted: false };
  }
  const existing = db
    .prepare('SELECT id FROM evidence_links WHERE retrieval_run_id = ? ORDER BY id')
    .all(retrievalRunId)
    .map((row) => row.id);
  if (existing.length > 0) {
    return { retrievalRunId, linked: 0, evidenceIds: existing, alreadyPersisted: true };
  }

  const filters = JSON.parse(runRow.filters_json ?? '{}');
  db.exec('BEGIN IMMEDIATE');
  try {
    const evidenceIds = insertRetrievalEvidenceRows(db, runRow, actorContext);
    appendAuditEvent(db, {
      eventType: 'kb.evidence.attached',
      actorType: actorContext.actorType,
      actorId: actorContext.actorId,
      entityType: 'retrieval_run',
      entityId: retrievalRunId,
      workflowInstanceId: runRow.workflow_instance_id,
      payload: {
        retrievalRunId,
        evidenceCount: evidenceIds.length,
        corpusVersionHash: runRow.corpus_version_hash,
        courseId: filters.courseId ?? null,
        chapterId: filters.chapterId ?? null,
      },
    });
    db.exec('COMMIT');
    return { retrievalRunId, linked: evidenceIds.length, evidenceIds, alreadyPersisted: false };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

/**
 * 非模型知识检索。每次调用落一条 kb_retrieval_runs + 审计 kb.retrieval.completed。
 * @param {object} db node:sqlite DatabaseSync(已完成 migrations)
 * @param {object} args
 * @param {string} args.query 查询文本(中英文均可)
 * @param {object} [args.filters] { courseId?, chapterId?, sourceType?, reviewStatus?, concept? }
 * @param {number} [args.limit] 结果上限(默认 10,最大 50)
 * @param {object} [args.actorContext] { actorType?, actorId? }
 * @param {string} [args.workflowInstanceId] 已有工作流;缺省时必须给 workflowScope 由本函数创建
 * @param {object} [args.workflowScope] { courseId, classId, lessonId } 内部创建 KB_RETRIEVAL 工作流
 * @returns 检索结果;无过门槛证据时 results=[] 且 insufficientEvidence=true(绝不编造)。
 */
export function searchKnowledge(
  db,
  { query, filters = {}, limit = DEFAULT_RESULT_LIMIT, actorContext = {}, workflowInstanceId = null, workflowScope = null } = {},
) {
  if (!isNonEmptyString(query)) {
    failCode('KB_RETRIEVAL_INPUT_INVALID', 'query 必须是非空字符串');
  }
  validateFilters(filters);
  if (!Number.isInteger(limit) || limit <= 0 || limit > MAX_RESULT_LIMIT) {
    failCode('KB_RETRIEVAL_INPUT_INVALID', `limit 必须是 1..${MAX_RESULT_LIMIT} 的整数,收到 ${JSON.stringify(limit)}`);
  }

  ensureSegmentationIndex(db, { actorContext });

  // --- 工作流解析:传入则校验;缺省则按 workflowScope 内部创建 KB_RETRIEVAL 工作流。 ---
  let workflowId = workflowInstanceId;
  let workflowCreated = false;
  if (workflowId !== null) {
    const existing = db.prepare('SELECT id FROM workflow_instances WHERE id = ?').get(workflowId);
    if (!existing) {
      failCode('KB_RETRIEVAL_WORKFLOW_NOT_FOUND', `工作流实例不存在: ${workflowId}`, { workflowInstanceId: workflowId });
    }
  } else {
    if (
      !workflowScope ||
      !isNonEmptyString(workflowScope.courseId) ||
      !isNonEmptyString(workflowScope.classId) ||
      !isNonEmptyString(workflowScope.lessonId)
    ) {
      failCode(
        'KB_WORKFLOW_SCOPE_REQUIRED',
        '未传 workflowInstanceId 时必须提供 workflowScope {courseId, classId, lessonId} 以创建 KB_RETRIEVAL 工作流',
      );
    }
    workflowId = newId('wf');
    const now = nowIso();
    db.prepare(
      `INSERT INTO workflow_instances(
         id, workflow_type, course_id, class_id, lesson_id, current_state,
         state_version, state_machine_version, created_by, cancelled_reason, created_at, updated_at
       ) VALUES (?, 'KB_RETRIEVAL', ?, ?, ?, 'DRAFT', 1, ?, ?, NULL, ?, ?)`,
    ).run(
      workflowId,
      workflowScope.courseId,
      workflowScope.classId,
      workflowScope.lessonId,
      KB_RETRIEVAL_STATE_MACHINE_VERSION,
      actorContext.actorId ?? 'system',
      now,
      now,
    );
    appendAuditEvent(db, {
      eventType: 'workflow.created',
      actorType: actorContext.actorType,
      actorId: actorContext.actorId,
      entityType: 'workflow_instance',
      entityId: workflowId,
      workflowInstanceId: workflowId,
      nextState: 'DRAFT',
      payload: { workflowType: 'KB_RETRIEVAL', stateMachineVersion: KB_RETRIEVAL_STATE_MACHINE_VERSION },
    });
    workflowCreated = true;
  }

  const corpusHash =
    filters.courseId !== undefined && filters.chapterId !== undefined
      ? corpusVersionHash(db, { courseId: filters.courseId, chapterId: filters.chapterId })
      : globalCorpusVersionHash(db);

  const expansion = expandQueryByConcepts(query);
  const effectiveTerms = effectiveTermList(expansion);

  // --- 零命中词元拒答(spec §6.2 无来源支撑即拒答的词元级实现) ---
  // 查询显式写出的外文/术语词元若在同范围(active + 已授权 + 同 course/chapter 过滤)
  // 语料中零命中,则该词元所代表的核心诉求语料根本无法支撑;此时 OR 语义捞回的
  // 共享词元噪声(探针实测误召回 0.667 的来源)不得顶替,直接判 insufficientEvidence,
  // 缺口词元随返回值与审计如实列出。中文词元对英文语料天然零命中,不参与本规则
  // (其中文诉求已由概念别名扩展承担)。
  const primaryLatinTerms = expansion.primary.filter((t) => /[a-z]/i.test(t));
  const missingTerms = primaryLatinTerms.filter(
    (term) => !corpusTermPresence(db, term, filters),
  );

  // concept 过滤:概念别名归并(中文概念名可命中英文 unit concept),大小写不敏感精确匹配。
  let conceptNames = null;
  if (filters.concept !== undefined) {
    const aliases = CONCEPT_QUERY_ALIASES[filters.concept];
    const names = new Set([filters.concept.toLowerCase()]);
    if (aliases) {
      for (const alias of [...aliases.zh, ...aliases.en]) names.add(alias.toLowerCase());
    }
    conceptNames = [...names];
  }

  // --- 通道执行:分词为主,原文关键词兜底;OOV 拒答时不进任何通道,如实记 'none'。 ---
  let channel = missingTerms.length > 0 ? 'none' : 'segmented';
  let candidates = [];
  let passed = [];
  let gatedOut = 0;
  if (missingTerms.length === 0) {
    candidates = fetchCandidates(db, {
      channel,
      terms: [...expansion.primary, ...expansion.expansionTerms],
      phrases: expansion.expansionPhrases,
      filters,
      conceptNames,
    });

    // --- 误召回门禁:bm25 分值门槛 + 有效查询词覆盖率(合并组内取并集)。 ---
    const gateGroups = (rows) => {
      const groups = mergeAdjacentRows(rows);
      const kept = [];
      let dropped = 0;
      for (const group of groups) {
        const coverage =
          effectiveTerms.length === 0 ? 0 : matchedTermCount(effectiveTerms, group) / effectiveTerms.length;
        if (group.bestRank <= BM25_SCORE_THRESHOLD && coverage >= MIN_QUERY_TERM_COVERAGE) {
          group.coverage = coverage;
          kept.push(group);
        } else {
          dropped += 1;
        }
      }
      return { kept, dropped };
    };

    ({ kept: passed, dropped: gatedOut } = gateGroups(candidates));
    if (passed.length === 0) {
      channel = 'raw';
      candidates = fetchCandidates(db, {
        channel,
        terms: [...expansion.primary, ...expansion.expansionTerms],
        phrases: expansion.expansionPhrases,
        filters,
        conceptNames,
      });
      ({ kept: passed, dropped: gatedOut } = gateGroups(candidates));
    }
  }

  // --- 结果组装:首块锚点 + 标题路径 + 原文截取 + 单元标注。 ---
  // 锚点块选择:组内首个非标题块。标题块命中只作上下文(它同时把标题路径带进锚点),
  // 锚点/引文/contentHash 必须落在正文块上,引文才是可逐字核验的证据;全为标题块的组退回首块。
  const headingCache = new Map();
  const headingsOf = (assetVersionId) => {
    if (!headingCache.has(assetVersionId)) {
      const rows = db
        .prepare(
          `SELECT order_index, content_raw FROM content_blocks
           WHERE asset_version_id = ? AND block_type = 'heading' ORDER BY order_index`,
        )
        .all(assetVersionId)
        .map((row) => ({ order_index: row.order_index, text: row.content_raw, level: headingLevelOf(row.content_raw) }));
      headingCache.set(assetVersionId, rows);
    }
    return headingCache.get(assetVersionId);
  };

  const results = passed.slice(0, limit).map((group) => {
    const first = group.find((row) => row.block_type !== 'heading') ?? group[0];
    const meta = JSON.parse(first.parser_metadata_json ?? '{}');
    const fragmentIds = group.map((row) => row.id);
    const sectionPath = sectionAnchorFor(headingsOf(first.asset_version_id), first.order_index);
    return {
      unitId: firstLinkedUnitId(db, fragmentIds),
      fragmentId: first.id,
      mergedFragmentIds: fragmentIds,
      mergedBlockCount: group.length,
      assetVersionId: first.asset_version_id,
      docId: meta.docId ?? null,
      sourceId: meta.sourceId ?? null,
      sectionAnchor: sectionPath.join(' > '),
      sectionPath,
      pageIndex: first.page_index,
      pageLabel: first.page_label,
      verbatimQuote: first.content_raw.slice(0, VERBATIM_QUOTE_MAX_CHARS),
      quoteTruncated: first.content_raw.length > VERBATIM_QUOTE_MAX_CHARS,
      contentHash: first.content_hash,
      score: group.bestRank,
      queryTermCoverage: group.coverage,
      channel,
    };
  });

  const insufficientEvidence = results.length === 0;

  // --- 留痕:kb_retrieval_runs 追加 + KB 工作流翻状态 + 证据落库 + 审计(单事务)。 ---
  const retrievalRunId = newId('krr');
  const now = nowIso();
  let evidenceIds = [];
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(
      `INSERT INTO kb_retrieval_runs(
         id, workflow_instance_id, query_text, filters_json, corpus_version_hash,
         results_json, result_count, schema_version, created_by, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, '1.0.0', ?, ?)`,
    ).run(
      retrievalRunId,
      workflowId,
      query,
      JSON.stringify(filters),
      corpusHash,
      JSON.stringify(results),
      results.length,
      actorContext.actorId ?? 'system',
      now,
    );
    if (workflowCreated) {
      // KB 工作流状态机(006 注释"另行约定"):DRAFT -> EVIDENCE_RETRIEVED,检索完成即翻转。
      db.prepare(
        `UPDATE workflow_instances
         SET current_state = 'EVIDENCE_RETRIEVED', state_version = state_version + 1, updated_at = ?
         WHERE id = ? AND state_version = 1`,
      ).run(now, workflowId);
      appendAuditEvent(db, {
        eventType: 'workflow.transitioned',
        actorType: actorContext.actorType,
        actorId: actorContext.actorId,
        entityType: 'workflow_instance',
        entityId: workflowId,
        workflowInstanceId: workflowId,
        previousState: 'DRAFT',
        nextState: 'EVIDENCE_RETRIEVED',
        payload: { action: 'completeRetrieval' },
      });
    }
    // 检索结果落为正式 evidence_links 行(007;0 结果时无证据可落,跳过)。
    if (results.length > 0) {
      evidenceIds = insertRetrievalEvidenceRows(
        db,
        {
          id: retrievalRunId,
          created_at: now,
          results_json: JSON.stringify(results),
        },
        actorContext,
      );
      appendAuditEvent(db, {
        eventType: 'kb.evidence.attached',
        actorType: actorContext.actorType,
        actorId: actorContext.actorId,
        entityType: 'retrieval_run',
        entityId: retrievalRunId,
        workflowInstanceId: workflowId,
        payload: {
          retrievalRunId,
          evidenceCount: evidenceIds.length,
          corpusVersionHash: corpusHash,
          courseId: filters.courseId ?? null,
          chapterId: filters.chapterId ?? null,
        },
      });
    }
    appendAuditEvent(db, {
      eventType: 'kb.retrieval.completed',
      actorType: actorContext.actorType,
      actorId: actorContext.actorId,
      entityType: 'retrieval_run',
      entityId: retrievalRunId,
      workflowInstanceId: workflowId,
      payload: {
        querySha256: createHash('sha256').update(query).digest('hex'),
        resultCount: results.length,
        insufficientEvidence,
        missingTermCount: missingTerms.length,
        corpusVersionHash: corpusHash,
        channel,
        courseId: filters.courseId ?? null,
        chapterId: filters.chapterId ?? null,
      },
    });
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return {
    retrievalRunId,
    workflowInstanceId: workflowId,
    workflowCreated,
    query,
    filters,
    corpusVersionHash: corpusHash,
    results,
    resultCount: results.length,
    evidenceIds,
    insufficientEvidence,
    missingTerms,
    refusalMessage: insufficientEvidence ? INSUFFICIENT_EVIDENCE_MESSAGE : null,
    channel,
    matchedConcepts: expansion.matchedConcepts,
    gateDiagnostics: {
      bm25ScoreThreshold: BM25_SCORE_THRESHOLD,
      minQueryTermCoverage: MIN_QUERY_TERM_COVERAGE,
      candidateCount: candidates.length,
      gatedOutCount: gatedOut,
    },
  };
}

// ---------------------------------------------------------------------------
// 引用完整性校验(spec §6.2:禁止伪引用,引用一致率要求 100%)。
// 复用机械门禁思路(mechanical-gates.mjs check 1/2/3/4/12):
//   - 引用片段必须存在于 content_blocks(无对应 fragment 的引用 = 伪引用,FAILED);
//   - 引用文本必须在片段原文中逐字存在,或经 normalizeText(NFKC+折叠空白,与机械门禁同口径)
//     归一化后存在;
//   - rejected(单元独占链接)/superseded 等非 active 来源不得作为唯一支撑(全部失效即 FAILED)。
// 纯读取,不落库、不审计(校验结果由调用方自行留痕)。
// ---------------------------------------------------------------------------

/** 片段是否"rejected 单元独占链接"(其知识层唯一支撑已被教师拒绝)。 */
function isRejectedExclusiveFragment(db, fragmentId) {
  const statuses = db
    .prepare(
      `SELECT u.review_status AS review_status
       FROM kb_unit_fragments uf
       JOIN kb_knowledge_units u ON u.id = uf.unit_id
       WHERE uf.fragment_id = ?`,
    )
    .all(fragmentId)
    .map((row) => row.review_status);
  return statuses.length > 0 && statuses.every((status) => status === 'rejected');
}

function citationCheckEntry(check, status, detail) {
  return { check, status, detail };
}

/**
 * 校验一组回答断言的引用完整性。
 * @param {object} db
 * @param {object} args
 * @param {Array} args.answerClaims [{ statement, citedFragmentIds: string[], quotes?: string[] }]
 *   quotes 缺省时,校验整条 statement(归一化后)可在所引片段并集中找到;
 *   给出 quotes 时,逐条校验每个 quote 在所引片段(并集)中逐字/归一化存在。
 * @returns {{ overallStatus: 'PASSED'|'FAILED', claims: object[], checkedAt: string }}
 */
export function verifyCitations(db, { answerClaims } = {}) {
  if (!Array.isArray(answerClaims)) {
    failCode('KB_CITATION_INPUT_INVALID', 'answerClaims 必须是数组');
  }
  const claims = answerClaims.map((claim, index) => {
    const checks = [];
    const statement = claim?.statement;
    const citedFragmentIds = claim?.citedFragmentIds;
    const quotes = claim?.quotes;

    if (!isNonEmptyString(statement)) {
      checks.push(citationCheckEntry('statement_present', 'FAILED', 'statement 缺失或非字符串'));
    }
    if (!Array.isArray(citedFragmentIds) || citedFragmentIds.length === 0) {
      checks.push(citationCheckEntry('citation_present', 'FAILED', '断言未给出来源片段引用(citedFragmentIds 为空)'));
      return { index, status: 'FAILED', checks };
    }
    checks.push(citationCheckEntry('citation_present', 'PASSED', `${citedFragmentIds.length} 条片段引用`));

    // (1) 片段存在:无对应 fragment 的引用 = 伪引用。
    const fragments = [];
    const missing = [];
    const select = db.prepare(
      `SELECT cb.id, cb.content_raw, cb.content_hash, cb.asset_version_id, av.source_status
       FROM content_blocks cb
       JOIN asset_versions av ON av.id = cb.asset_version_id
       WHERE cb.id = ?`,
    );
    for (const fragmentId of citedFragmentIds) {
      const row = select.get(fragmentId);
      if (row) fragments.push(row);
      else missing.push(fragmentId);
    }
    checks.push(
      missing.length === 0
        ? citationCheckEntry('fragments_exist', 'PASSED', `${fragments.length} 条引用片段全部存在`)
        : citationCheckEntry('fragments_exist', 'FAILED', `伪引用:${missing.length} 条引用片段不存在: ${missing.join(', ')}`),
    );

    // (2) 逐字/归一化匹配(复用机械门禁 knowledge_verbatim_quote 思路)。
    if (missing.length === 0 && isNonEmptyString(statement)) {
      const normalizedCorpus = fragments.map((f) => normalizeText(f.content_raw)).join(' ');
      if (Array.isArray(quotes) && quotes.length > 0) {
        const badQuotes = quotes.filter((quote) => {
          if (!isNonEmptyString(quote)) return true;
          const exact = fragments.some((f) => f.content_raw.includes(quote));
          if (exact) return false;
          return !normalizedCorpus.includes(normalizeText(quote));
        });
        checks.push(
          badQuotes.length === 0
            ? citationCheckEntry('verbatim_quote_match', 'PASSED', `${quotes.length} 条引用文本逐字/归一化命中`)
            : citationCheckEntry('verbatim_quote_match', 'FAILED', `${badQuotes.length} 条引用文本未在来源片段中逐字存在`),
        );
      } else {
        const normalizedStatement = normalizeText(statement);
        checks.push(
          normalizedCorpus.includes(normalizedStatement)
            ? citationCheckEntry('verbatim_quote_match', 'PASSED', 'statement 归一化后存在于所引片段并集')
            : citationCheckEntry('verbatim_quote_match', 'FAILED', 'statement 未在所引片段原文中逐字/归一化存在'),
        );
      }
    }

    // (3) 来源状态:rejected/superseded 等非 active 来源不得作为唯一支撑。
    if (fragments.length > 0) {
      const invalid = fragments.filter(
        (f) => f.source_status !== 'active' || isRejectedExclusiveFragment(db, f.id),
      );
      if (invalid.length === 0) {
        checks.push(citationCheckEntry('source_status_valid', 'PASSED', '全部引用来源 active 且未被 rejected 独占'));
      } else if (invalid.length === fragments.length) {
        checks.push(
          citationCheckEntry(
            'source_status_valid',
            'FAILED',
            '全部引用来源均为非 active(superseded/withdrawn/expired)或 rejected 单元独占,不得作为唯一支撑',
          ),
        );
      } else {
        checks.push(
          citationCheckEntry(
            'source_status_valid',
            'PASSED',
            `${invalid.length} 条引用来源非 active 或被 rejected 独占,但仍有 ${fragments.length - invalid.length} 条有效支撑`,
          ),
        );
      }
    }

    const status = checks.some((c) => c.status === 'FAILED') ? 'FAILED' : 'PASSED';
    return { index, status, checks };
  });

  return {
    overallStatus: claims.every((c) => c.status === 'PASSED') ? 'PASSED' : 'FAILED',
    claims,
    checkedAt: nowIso(),
  };
}
