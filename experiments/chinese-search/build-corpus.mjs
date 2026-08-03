#!/usr/bin/env node
/**
 * build-corpus.mjs — corpus.json / queries.json / gold.json 校验器
 *
 * 语料为人工创作(teaching 类抽取自 shared/ 真实负载,其余手写脱敏),
 * 本脚本不做生成,只做契约校验:
 *   - corpus: 必填字段、sourceType 枚举、docId 唯一、文本长度、meta 字段格式、PII 扫描
 *   - queries: 数量 >= 30、无答案 >= 5、queryId 唯一、structural 字段合法
 *   - gold: 每个 queryId 都有金标准、relevantDocIds 均存在、answerable 一致性
 * 校验失败以非零码退出并逐条列出问题。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE_TYPES = new Set(['policy', 'textbook', 'rubric', 'case', 'teaching']);
const STRUCTURAL_KINDS = new Set(['stageId', 'tag', 'clauseNo', 'docNo']);

function loadJson(name) {
  return JSON.parse(readFileSync(join(HERE, name), 'utf8'));
}

export function validateAll({ corpus, queries, gold }) {
  const errors = [];

  // ---- corpus ----
  const docs = corpus?.documents;
  if (!Array.isArray(docs) || docs.length === 0) {
    errors.push('corpus.documents 缺失或为空');
  } else {
    if (docs.length < 25 || docs.length > 40) {
      errors.push(`语料规模 ${docs.length} 超出 25-40 的要求`);
    }
    const seen = new Set();
    for (const [i, d] of docs.entries()) {
      const at = `documents[${i}](${d?.docId ?? '?'})`;
      if (!d || typeof d !== 'object') { errors.push(`${at}: 不是对象`); continue; }
      for (const f of ['docId', 'title', 'sourceType', 'text']) {
        if (typeof d[f] !== 'string' || d[f].length === 0) errors.push(`${at}: 缺少 ${f}`);
      }
      if (seen.has(d.docId)) errors.push(`${at}: docId 重复`);
      seen.add(d.docId);
      if (!SOURCE_TYPES.has(d.sourceType)) errors.push(`${at}: sourceType 非法: ${d.sourceType}`);
      if (typeof d.text === 'string') {
        if (d.text.length < 30) errors.push(`${at}: text 过短(${d.text.length} 字)`);
        if (d.text.length > 1200) errors.push(`${at}: text 过长(${d.text.length} 字)`);
        // 脱敏检查:手机号、身份证、邮箱、真实人名模式不应出现
        if (/1[3-9]\d{9}/.test(d.text)) errors.push(`${at}: 疑似手机号`);
        if (/\d{17}[\dXx]/.test(d.text)) errors.push(`${at}: 疑似身份证号`);
        if (/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(d.text)) errors.push(`${at}: 疑似邮箱`);
      }
      const meta = d.meta ?? {};
      if (meta.stageId !== undefined && !/^S[1-9]$/.test(meta.stageId)) {
        errors.push(`${at}: meta.stageId 非法: ${meta.stageId}`);
      }
      if (meta.clauseNo !== undefined && !/^第.{1,4}条$/.test(meta.clauseNo)) {
        errors.push(`${at}: meta.clauseNo 非法: ${meta.clauseNo}`);
      }
      if (meta.docNo !== undefined && !/〔\d{4}〕/.test(meta.docNo)) {
        errors.push(`${at}: meta.docNo 缺少〔YYYY〕编号: ${meta.docNo}`);
      }
      if (meta.tags !== undefined && !Array.isArray(meta.tags)) {
        errors.push(`${at}: meta.tags 必须是数组`);
      }
    }
    const byType = {};
    for (const d of docs) byType[d.sourceType] = (byType[d.sourceType] ?? 0) + 1;
    for (const t of SOURCE_TYPES) {
      if (!byType[t]) errors.push(`语料缺少 sourceType=${t} 的文档`);
    }
  }

  // ---- queries ----
  const qs = queries?.queries;
  if (!Array.isArray(qs)) {
    errors.push('queries.queries 缺失');
  } else {
    if (qs.length < 30) errors.push(`查询数 ${qs.length} < 30`);
    const qids = new Set();
    for (const q of qs) {
      if (!q.queryId || !q.query || !q.type) errors.push(`查询缺少字段: ${JSON.stringify(q)}`);
      if (qids.has(q.queryId)) errors.push(`queryId 重复: ${q.queryId}`);
      qids.add(q.queryId);
      if (q.structural) {
        if (!STRUCTURAL_KINDS.has(q.structural.kind)) {
          errors.push(`${q.queryId}: structural.kind 非法: ${q.structural.kind}`);
        }
        if (typeof q.structural.value !== 'string' || !q.structural.value) {
          errors.push(`${q.queryId}: structural.value 缺失`);
        }
      }
    }
  }

  // ---- gold ----
  const gs = gold?.gold;
  if (!Array.isArray(gs)) {
    errors.push('gold.gold 缺失');
  } else {
    const docIds = new Set((docs ?? []).map((d) => d.docId));
    const qids = new Set((qs ?? []).map((q) => q.queryId));
    const covered = new Set();
    let unanswerable = 0;
    for (const g of gs) {
      covered.add(g.queryId);
      if (!qids.has(g.queryId)) errors.push(`gold 引用不存在的 queryId: ${g.queryId}`);
      if (typeof g.answerable !== 'boolean') errors.push(`${g.queryId}: answerable 缺失`);
      if (!Array.isArray(g.relevantDocIds)) errors.push(`${g.queryId}: relevantDocIds 缺失`);
      if (g.answerable === false) {
        unanswerable += 1;
        if (g.relevantDocIds.length !== 0) errors.push(`${g.queryId}: 无答案题不应有 relevantDocIds`);
      }
      if (g.answerable === true && g.relevantDocIds.length === 0) {
        errors.push(`${g.queryId}: 有答案题 relevantDocIds 为空`);
      }
      for (const id of g.relevantDocIds) {
        if (!docIds.has(id)) errors.push(`${g.queryId}: 引用不存在的 docId: ${id}`);
      }
    }
    for (const q of qs ?? []) {
      if (!covered.has(q.queryId)) errors.push(`查询 ${q.queryId} 缺少金标准`);
    }
    if (unanswerable < 5) errors.push(`无答案查询 ${unanswerable} 条 < 5`);
  }

  return errors;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const corpus = loadJson('corpus.json');
  const queries = loadJson('queries.json');
  const gold = loadJson('gold.json');
  const errors = validateAll({ corpus, queries, gold });
  if (errors.length > 0) {
    console.error(`校验失败,共 ${errors.length} 个问题:`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  const docs = corpus.documents;
  const byType = {};
  for (const d of docs) byType[d.sourceType] = (byType[d.sourceType] ?? 0) + 1;
  console.log(`校验通过:语料 ${docs.length} 篇 ${JSON.stringify(byType)};查询 ${queries.queries.length} 条(无答案 ${gold.gold.filter((g) => !g.answerable).length} 条)`);
}
