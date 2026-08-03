#!/usr/bin/env node
/**
 * run-evaluation.mjs — FTS5 中文检索四通道评测
 *
 * 用法: node experiments/chinese-search/run-evaluation.mjs
 * 输出: experiments/chinese-search/results/results.json + results/report.md
 *
 * 通道:
 *   A  unicode61 原始文本(基线,预期对中文退化)
 *   B  trigram 原始文本(子串匹配语义,不做模糊)
 *   C  Intl.Segmenter('zh') 预分词入 unicode61(查询侧同样分词,词元 OR + bm25)
 *   D  B + C 双通道 RRF 融合(k=60,等权,候选深度各 50 —— 固定参数,不调参)
 * 另跑结构过滤路径(元数据精确过滤 + 文本 LIKE 对照),与全文通道做互补分析。
 *
 * 错误纪律:校验失败、SQL 错误一律抛出,不静默吞掉。
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { validateAll } from './build-corpus.mjs';
import { openProbeDb, indexSizes, queryTokens, escapePhrase } from './build-indexes.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = join(HERE, 'results');

// ---- 固定实验参数(写入 results 与 README,不允许只记“用了 RRF”) ----
const PARAMS = {
  rrfK: 60,
  rrfWeights: { B: 1, C: 1 },
  candidateDepth: 50,
  recallCutoffs: [5, 10],
  segmenter: "Intl.Segmenter('zh', { granularity: 'word' })",
  date: new Date().toISOString(),
};

const corpus = JSON.parse(readFileSync(join(HERE, 'corpus.json'), 'utf8'));
const queriesJson = JSON.parse(readFileSync(join(HERE, 'queries.json'), 'utf8'));
const goldJson = JSON.parse(readFileSync(join(HERE, 'gold.json'), 'utf8'));

const errors = validateAll({ corpus, queries: queriesJson, gold: goldJson });
if (errors.length > 0) {
  throw new Error(`语料/查询/金标准校验失败:\n  - ${errors.join('\n  - ')}`);
}

const docs = corpus.documents;
const queries = queriesJson.queries;
const goldById = new Map(goldJson.gold.map((g) => [g.queryId, g]));

const db = openProbeDb(docs);

// ---------------- 搜索实现 ----------------

function rowsToDocIds(rows) {
  const map = new Map(docs.map((d, i) => [i + 1, d.docId]));
  return rows.map((r) => map.get(r.rowid));
}

function searchA(query) {
  const rows = db.prepare(
    'SELECT rowid FROM fts_a WHERE fts_a MATCH ? ORDER BY rank LIMIT ?'
  ).all(escapePhrase(query), PARAMS.candidateDepth);
  return rowsToDocIds(rows);
}

function searchB(query) {
  const rows = db.prepare(
    'SELECT rowid FROM fts_b WHERE fts_b MATCH ? ORDER BY rank LIMIT ?'
  ).all(escapePhrase(query), PARAMS.candidateDepth);
  return rowsToDocIds(rows);
}

function searchC(query) {
  const tokens = queryTokens(query);
  if (tokens.length === 0) return [];
  const ftsQuery = tokens.map(escapePhrase).join(' OR ');
  const rows = db.prepare(
    'SELECT rowid FROM fts_c WHERE fts_c MATCH ? ORDER BY rank LIMIT ?'
  ).all(ftsQuery, PARAMS.candidateDepth);
  return rowsToDocIds(rows);
}

/** RRF 融合:score(d) = Σ_channel weight / (k + rank)。rank 从 1 起。 */
function fuseRRF(listB, listC) {
  const score = new Map();
  const add = (list, weight) => {
    list.forEach((docId, idx) => {
      score.set(docId, (score.get(docId) ?? 0) + weight / (PARAMS.rrfK + idx + 1));
    });
  };
  add(listB, PARAMS.rrfWeights.B);
  add(listC, PARAMS.rrfWeights.C);
  return [...score.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([docId]) => docId);
}

function timed(fn, query) {
  const t0 = performance.now();
  const result = fn(query);
  return { result, ms: performance.now() - t0 };
}

// ---------------- 结构过滤路径(不走全文) ----------------

function structuralSearch(kind, value) {
  let metaRows;
  if (kind === 'stageId') {
    metaRows = db.prepare('SELECT doc_id FROM docs WHERE stage_id = ?').all(value);
  } else if (kind === 'tag') {
    metaRows = db.prepare(
      "SELECT doc_id FROM docs WHERE tags IS NOT NULL AND (',' || tags || ',') LIKE ?"
    ).all(`%,${value},%`);
  } else if (kind === 'clauseNo') {
    metaRows = db.prepare('SELECT doc_id FROM docs WHERE clause_no = ?').all(value);
  } else if (kind === 'docNo') {
    metaRows = db.prepare('SELECT doc_id FROM docs WHERE doc_no = ?').all(value);
  } else {
    throw new Error(`未知 structural kind: ${kind}`);
  }
  const likeRows = db.prepare(
    "SELECT doc_id FROM docs WHERE (title || ' ' || text) LIKE ?"
  ).all(`%${value}%`);
  return {
    metaPath: metaRows.map((r) => r.doc_id),
    likePath: likeRows.map((r) => r.doc_id),
  };
}

// ---------------- 指标 ----------------

function recallAt(ranked, goldSet, k) {
  if (goldSet.size === 0) return null;
  const hit = ranked.slice(0, k).filter((id) => goldSet.has(id)).length;
  return hit / goldSet.size;
}

function reciprocalRank(ranked, goldSet) {
  for (let i = 0; i < ranked.length; i += 1) {
    if (goldSet.has(ranked[i])) return 1 / (i + 1);
  }
  return 0;
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
}

function mean(xs) {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}

// ---------------- 跑评测 ----------------

const CHANNELS = ['A', 'B', 'C', 'D'];
const perQuery = {}; // channel -> queryId -> { ranked, ms }
for (const ch of CHANNELS) perQuery[ch] = {};

for (const q of queries) {
  const a = timed(searchA, q.query);
  const b = timed(searchB, q.query);
  const c = timed(searchC, q.query);
  const d0 = performance.now();
  const dResult = fuseRRF(b.result, c.result);
  const dMs = performance.now() - d0 + b.ms + c.ms; // D = B + C + 融合
  perQuery.A[q.queryId] = { ranked: a.result, ms: a.ms };
  perQuery.B[q.queryId] = { ranked: b.result, ms: b.ms };
  perQuery.C[q.queryId] = { ranked: c.result, ms: c.ms };
  perQuery.D[q.queryId] = { ranked: dResult, ms: dMs };
}

const answerable = queries.filter((q) => goldById.get(q.queryId).answerable);
const unanswerable = queries.filter((q) => !goldById.get(q.queryId).answerable);

const channelMetrics = {};
for (const ch of CHANNELS) {
  const r5 = [], r10 = [], rr = [], lat = [];
  for (const q of answerable) {
    const { ranked, ms } = perQuery[ch][q.queryId];
    const goldSet = new Set(goldById.get(q.queryId).relevantDocIds);
    r5.push(recallAt(ranked, goldSet, 5));
    r10.push(recallAt(ranked, goldSet, 10));
    rr.push(reciprocalRank(ranked, goldSet));
    lat.push(ms);
  }
  const falseRecall = unanswerable.filter(
    (q) => perQuery[ch][q.queryId].ranked.slice(0, 5).length > 0
  ).length;
  const latAll = queries.map((q) => perQuery[ch][q.queryId].ms).sort((x, y) => x - y);
  channelMetrics[ch] = {
    'recall@5': round3(mean(r5)),
    'recall@10': round3(mean(r10)),
    mrr: round3(mean(rr)),
    unanswerableFalseRecallRate: round3(falseRecall / unanswerable.length),
    latencyMs: {
      avg: round3(mean(latAll)),
      p50: round3(percentile(latAll, 50)),
      p95: round3(percentile(latAll, 95)),
    },
  };
}

const sizes = indexSizes(db);
channelMetrics.A.indexBytes = sizes.channelA;
channelMetrics.B.indexBytes = sizes.channelB;
channelMetrics.C.indexBytes = sizes.channelC;
channelMetrics.D.indexBytes = sizes.channelB + sizes.channelC;
const sourceBytes = docs.reduce((acc, d) => acc + Buffer.byteLength(d.title + d.text, 'utf8'), 0);

function round3(x) { return Math.round(x * 1000) / 1000; }

// ---- 逐题明细(每通道 recall@5/@10 + top5) ----
const perQueryDetail = queries.map((q) => {
  const g = goldById.get(q.queryId);
  const goldSet = new Set(g.relevantDocIds);
  const row = {
    queryId: q.queryId, query: q.query, type: q.type, answerable: g.answerable,
    gold: g.relevantDocIds, channels: {},
  };
  for (const ch of CHANNELS) {
    const { ranked, ms } = perQuery[ch][q.queryId];
    row.channels[ch] = {
      top5: ranked.slice(0, 5),
      top10: ranked.slice(0, 10),
      'recall@5': g.answerable ? round3(recallAt(ranked, goldSet, 5)) : null,
      'recall@10': g.answerable ? round3(recallAt(ranked, goldSet, 10)) : null,
      hitsTop5: g.answerable ? null : ranked.slice(0, 5).length,
      latencyMs: round3(ms),
    };
  }
  return row;
});

// ---- 短词(≤2 字)失败清单 ----
const shortWordQueries = queries.filter((q) => [...q.query].length <= 2);
const shortWordReport = shortWordQueries.map((q) => {
  const g = goldById.get(q.queryId);
  const goldSet = new Set(g.relevantDocIds);
  const entry = { queryId: q.queryId, query: q.query, answerable: g.answerable, channels: {} };
  for (const ch of CHANNELS) {
    const { ranked } = perQuery[ch][q.queryId];
    if (g.answerable) {
      const r10 = recallAt(ranked, goldSet, 10);
      entry.channels[ch] = r10 === 1 ? 'pass' : `fail(recall@10=${round3(r10)})`;
    } else {
      entry.channels[ch] = ranked.length === 0 ? 'empty(正确)' : `误召回${Math.min(ranked.length, 10)}条`;
    }
  }
  return entry;
});

// ---- 各通道独有召回(top10 内命中金标准而其他通道全漏) ----
const uniqueRecall = {};
for (const ch of CHANNELS) {
  const others = CHANNELS.filter((c) => c !== ch);
  const items = [];
  for (const q of answerable) {
    const goldSet = new Set(goldById.get(q.queryId).relevantDocIds);
    const mine = new Set(perQuery[ch][q.queryId].ranked.slice(0, 10).filter((id) => goldSet.has(id)));
    for (const id of mine) {
      const unique = others.every((oc) =>
        !perQuery[oc][q.queryId].ranked.slice(0, 10).includes(id));
      if (unique) items.push({ queryId: q.queryId, query: q.query, docId: id });
    }
  }
  uniqueRecall[ch] = { count: items.length, items };
}

// ---- D 相对 B/C 的新增召回 ----
const dNewRecall = [];
for (const q of answerable) {
  const goldSet = new Set(goldById.get(q.queryId).relevantDocIds);
  const dTop = perQuery.D[q.queryId].ranked.slice(0, 10).filter((id) => goldSet.has(id));
  for (const id of dTop) {
    const inB = perQuery.B[q.queryId].ranked.slice(0, 10).includes(id);
    const inC = perQuery.C[q.queryId].ranked.slice(0, 10).includes(id);
    if (!inB || !inC) {
      dNewRecall.push({ queryId: q.queryId, query: q.query, docId: id, missedBy: [...(!inB ? ['B'] : []), ...(!inC ? ['C'] : [])] });
    }
  }
}

// ---- 结构过滤互补分析 ----
const structuralReport = queries.filter((q) => q.structural).map((q) => {
  const g = goldById.get(q.queryId);
  const goldSet = new Set(g.relevantDocIds);
  const { metaPath, likePath } = structuralSearch(q.structural.kind, q.structural.value);
  const cover = (ids) => g.relevantDocIds.filter((id) => ids.includes(id));
  const entry = {
    queryId: q.queryId, query: q.query, kind: q.structural.kind, value: q.structural.value,
    gold: g.relevantDocIds,
    metaPathHits: metaPath, likePathHits: likePath,
    metaPathGoldCover: cover(metaPath), likePathGoldCover: cover(likePath),
    fulltext: {},
  };
  for (const ch of CHANNELS) {
    const top10 = perQuery[ch][q.queryId].ranked.slice(0, 10);
    entry.fulltext[ch] = {
      goldCover: cover(top10),
      goldMissed: g.relevantDocIds.filter((id) => !top10.includes(id)),
    };
  }
  return entry;
});

// ---- 典型错误案例(自动挑选 + 原因分类) ----
const REASON_BY_TYPE = {
  typo: '词形错误(无模糊匹配能力)',
  synonym: '同义但字符不同(无同义词映射,词法通道固有边界)',
  'cross-expression': '表达差异(查询与语料措辞不一致)',
  'long-question': '长问句噪声稀释/表达差异',
  'two-char': '短词区分度不足',
  'ultra-short': '极短查询(trigram <3 字无法建索引,分词通道无对应词元)',
  abbr: '缩写歧义/结构未过滤',
  'clause-no': '结构标识未走元数据过滤',
  'doc-no': '结构标识未走元数据过滤',
  'multi-char': '分词切分与索引词元不一致',
  unanswerable: '无答案误召回(噪声)',
};

const errorCases = [];
for (const q of queries) {
  const g = goldById.get(q.queryId);
  const goldSet = new Set(g.relevantDocIds);
  for (const ch of CHANNELS) {
    const { ranked } = perQuery[ch][q.queryId];
    if (g.answerable) {
      const r5 = recallAt(ranked, goldSet, 5);
      if (r5 < 1) {
        errorCases.push({
          queryId: q.queryId, query: q.query, type: q.type, channel: ch,
          gold: g.relevantDocIds, top5: ranked.slice(0, 5),
          reason: REASON_BY_TYPE[q.type] ?? '未分类',
        });
      }
    } else if (ranked.slice(0, 5).length > 0) {
      errorCases.push({
        queryId: q.queryId, query: q.query, type: q.type, channel: ch,
        gold: [], top5: ranked.slice(0, 5),
        reason: REASON_BY_TYPE.unanswerable,
      });
    }
  }
}
// 挑选 ≥5 个有代表性的案例:优先通道/类型多样性
const seenKey = new Set();
const typicalCases = [];
for (const c of errorCases) {
  const key = `${c.type}`;
  if (!seenKey.has(key) || typicalCases.length < 5) {
    typicalCases.push(c);
    seenKey.add(key);
  }
  if (typicalCases.length >= 10) break;
}

// ---------------- 输出 ----------------

const results = {
  experiment: 'chinese-search-fts5-probe',
  params: PARAMS,
  corpusStats: {
    documents: docs.length,
    bySourceType: docs.reduce((acc, d) => { acc[d.sourceType] = (acc[d.sourceType] ?? 0) + 1; return acc; }, {}),
    sourceTextBytes: sourceBytes,
    queries: queries.length,
    answerable: answerable.length,
    unanswerable: unanswerable.length,
  },
  indexSizes: sizes,
  channelMetrics,
  perQuery: perQueryDetail,
  shortWordReport,
  uniqueRecall,
  dNewRecallVsBC: { count: dNewRecall.length, items: dNewRecall },
  structuralFilter: structuralReport,
  typicalErrorCases: typicalCases,
  allErrorCaseCount: errorCases.length,
};

mkdirSync(RESULTS_DIR, { recursive: true });
writeFileSync(join(RESULTS_DIR, 'results.json'), JSON.stringify(results, null, 2));
writeFileSync(join(RESULTS_DIR, 'report.md'), renderReport(results));
db.close();

console.log(`评测完成:${queries.length} 条查询 × 4 通道`);
for (const ch of CHANNELS) {
  const m = channelMetrics[ch];
  console.log(`  ${ch}: R@5=${m['recall@5']} R@10=${m['recall@10']} MRR=${m.mrr} 误召回=${m.unanswerableFalseRecallRate} p50=${m.latencyMs.p50}ms 索引=${m.indexBytes}B`);
}
console.log(`结果写入 ${RESULTS_DIR}/results.json 与 results/report.md`);

// ---------------- report.md 渲染 ----------------

function renderReport(r) {
  const L = [];
  const m = r.channelMetrics;
  L.push('# FTS5 中文检索探针 · 评测报告', '');
  L.push(`- 生成时间:${r.params.date}`);
  L.push(`- 语料:${r.corpusStats.documents} 篇(${Object.entries(r.corpusStats.bySourceType).map(([k, v]) => `${k}=${v}`).join(', ')}),源文本 ${r.corpusStats.sourceTextBytes} bytes`);
  L.push(`- 查询:${r.corpusStats.queries} 条(有答案 ${r.corpusStats.answerable},无答案 ${r.corpusStats.unanswerable})`);
  L.push(`- RRF 参数:k=${r.params.rrfK},权重 B=${r.params.rrfWeights.B}/C=${r.params.rrfWeights.C},候选深度各 ${r.params.candidateDepth}(固定,未调参)`, '');
  L.push('## 四通道核心指标', '');
  L.push('| 通道 | 方案 | Recall@5 | Recall@10 | MRR | 无答案误召回率 | 延迟 avg/p50/p95 (ms) | 索引大小 (bytes) |');
  L.push('|---|---|---|---|---|---|---|---|');
  const NAMES = { A: 'unicode61 原始', B: 'trigram 原始', C: '分词+unicode61', D: 'B+C RRF 融合' };
  for (const ch of CHANNELS) {
    const c = m[ch];
    L.push(`| ${ch} | ${NAMES[ch]} | ${c['recall@5']} | ${c['recall@10']} | ${c.mrr} | ${c.unanswerableFalseRecallRate} | ${c.latencyMs.avg}/${c.latencyMs.p50}/${c.latencyMs.p95} | ${c.indexBytes} |`);
  }
  L.push('', '## 逐题 Recall@5(有答案题;“-”为无答案题 top5 命中数)', '');
  L.push('| queryId | 查询 | 类型 | A | B | C | D |');
  L.push('|---|---|---|---|---|---|---|');
  for (const row of r.perQuery) {
    const cell = (ch) => row.answerable ? String(row.channels[ch]['recall@5']) : `误${row.channels[ch].hitsTop5}`;
    L.push(`| ${row.queryId} | ${row.query} | ${row.type} | ${cell('A')} | ${cell('B')} | ${cell('C')} | ${cell('D')} |`);
  }
  L.push('', '## 短词(≤2 字)逐题成败', '');
  L.push('| queryId | 查询 | A | B | C | D |');
  L.push('|---|---|---|---|---|---|');
  for (const s of r.shortWordReport) {
    L.push(`| ${s.queryId} | ${s.query}${s.answerable ? '' : '(无答案)'} | ${s.channels.A} | ${s.channels.B} | ${s.channels.C} | ${s.channels.D} |`);
  }
  L.push('', '## 各通道独有召回(top10 内独有命中)', '');
  for (const ch of CHANNELS) {
    const u = r.uniqueRecall[ch];
    const items = u.items.map((i) => `${i.queryId}→${i.docId}`).join(', ') || '无';
    L.push(`- 通道 ${ch}:${u.count} 对(${items})`);
  }
  L.push('', '## D 通道相对 B/C 的新增召回', '');
  if (r.dNewRecallVsBC.count === 0) {
    L.push('- 无。');
  } else {
    for (const i of r.dNewRecallVsBC.items) {
      L.push(`- ${i.queryId}「${i.query}」→ ${i.docId}(单通道 ${i.missedBy.join('/')} top10 漏掉)`);
    }
  }
  L.push('', '## 结构过滤路径(元数据精确过滤 vs 全文)', '');
  L.push('| queryId | 查询 | kind | 元数据路径命中 | 全文 A | 全文 B | 全文 C | 全文 D |');
  L.push('|---|---|---|---|---|---|---|---|');
  for (const s of r.structuralFilter) {
    const cov = (ch) => `${s.fulltext[ch].goldCover.length}/${s.gold.length}`;
    L.push(`| ${s.queryId} | ${s.query} | ${s.kind} | ${s.metaPathGoldCover.length}/${s.gold.length} | ${cov('A')} | ${cov('B')} | ${cov('C')} | ${cov('D')} |`);
  }
  L.push('', `## 典型错误案例(全部失配 ${r.allErrorCaseCount} 条,此处挑 ${r.typicalErrorCases.length} 条代表)`, '');
  for (const c of r.typicalErrorCases) {
    L.push(`- **${c.queryId}「${c.query}」(${c.type},通道 ${c.channel})**:gold=[${c.gold.join(', ') || '空'}] top5=[${c.top5.join(', ') || '空'}] — ${c.reason}`);
  }
  L.push('');
  return L.join('\n');
}
