#!/usr/bin/env node
/**
 * build-indexes.mjs — 建四种检索通道所需的表与索引
 *
 * 探针完全独立:默认使用 :memory:,不碰 .pharmaco-data/。
 * 表结构:
 *   docs            源文档 + 结构过滤元数据(stage_id/tags/clause_no/doc_no)
 *   fts_a           通道 A:unicode61 原始文本(title + text)
 *   fts_b           通道 B:trigram 原始文本(content_raw)
 *   fts_c           通道 C:Intl.Segmenter('zh') 预分词空格连接入 unicode61(content_segmented)
 *   通道 D 不落表:B、C 候选在评测时做 RRF 融合(k=60,等权,各取 top-50)
 *
 *  standalone: node build-indexes.mjs  → 建索引并打印各通道索引大小(dbstat)
 *  作为模块:  export { buildIndexes, segmentText, queryTokens, indexSizes }
 */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const segmenter = new Intl.Segmenter('zh', { granularity: 'word' });

/** Intl.Segmenter 分词,仅保留词元(丢弃标点/空白),空格连接。 */
export function segmentText(text) {
  const tokens = [];
  for (const seg of segmenter.segment(text)) {
    if (seg.isWordLike) tokens.push(seg.segment);
  }
  return tokens.join(' ');
}

/** 通道 C 的查询侧分词:去重后的词元数组。 */
export function queryTokens(query) {
  const tokens = [];
  const seen = new Set();
  for (const seg of segmenter.segment(query)) {
    if (seg.isWordLike && !seen.has(seg.segment)) {
      seen.add(seg.segment);
      tokens.push(seg.segment);
    }
  }
  return tokens;
}

/** FTS5 短语查询转义(双引号包裹,内部引号 doubling)。 */
export function escapePhrase(q) {
  return `"${q.replace(/"/g, '""')}"`;
}

export function buildIndexes(db, documents) {
  db.exec(`
    CREATE TABLE docs (
      rowid      INTEGER PRIMARY KEY,
      doc_id     TEXT NOT NULL UNIQUE,
      title      TEXT NOT NULL,
      source_type TEXT NOT NULL,
      text       TEXT NOT NULL,
      stage_id   TEXT,
      tags       TEXT,
      clause_no  TEXT,
      doc_no     TEXT
    ) STRICT;
    CREATE VIRTUAL TABLE fts_a USING fts5(content_raw, tokenize = 'unicode61');
    CREATE VIRTUAL TABLE fts_b USING fts5(content_raw, tokenize = 'trigram');
    CREATE VIRTUAL TABLE fts_c USING fts5(content_segmented, tokenize = 'unicode61');
  `);

  const insDoc = db.prepare(
    'INSERT INTO docs(doc_id, title, source_type, text, stage_id, tags, clause_no, doc_no) VALUES (?,?,?,?,?,?,?,?)'
  );
  const insA = db.prepare('INSERT INTO fts_a(rowid, content_raw) VALUES (?,?)');
  const insB = db.prepare('INSERT INTO fts_b(rowid, content_raw) VALUES (?,?)');
  const insC = db.prepare('INSERT INTO fts_c(rowid, content_segmented) VALUES (?,?)');

  db.exec('BEGIN');
  try {
    for (const d of documents) {
      const meta = d.meta ?? {};
      const raw = `${d.title} ${d.text}`;
      const info = insDoc.run(
        d.docId, d.title, d.sourceType, d.text,
        meta.stageId ?? null,
        meta.tags ? meta.tags.join(',') : null,
        meta.clauseNo ?? null,
        meta.docNo ?? null
      );
      const rowid = Number(info.lastInsertRowid);
      insA.run(rowid, raw);
      insB.run(rowid, raw);
      insC.run(rowid, segmentText(raw));
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return db;
}

/** 各通道 FTS 索引大小(dbstat 实页字节数)。:memory: 库同样可用。 */
export function indexSizes(db) {
  const rows = db.prepare(
    "SELECT name, sum(pgsize) AS bytes FROM dbstat GROUP BY name"
  ).all();
  const sum = (prefix) => rows
    .filter((r) => r.name === prefix || r.name.startsWith(`${prefix}_`))
    .reduce((acc, r) => acc + Number(r.bytes), 0);
  return {
    docsTableBytes: sum('docs'),
    channelA: sum('fts_a'),
    channelB: sum('fts_b'),
    channelC: sum('fts_c'),
  };
}

export function openProbeDb(documents) {
  const db = new DatabaseSync(':memory:');
  return buildIndexes(db, documents);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const corpus = JSON.parse(readFileSync(join(HERE, 'corpus.json'), 'utf8'));
  const db = openProbeDb(corpus.documents);
  const sizes = indexSizes(db);
  const n = db.prepare('SELECT count(*) AS n FROM docs').get().n;
  console.log(`索引构建完成(${n} 篇文档, :memory:):`);
  console.log(`  docs 源表:        ${sizes.docsTableBytes} bytes`);
  console.log(`  通道 A unicode61: ${sizes.channelA} bytes`);
  console.log(`  通道 B trigram:   ${sizes.channelB} bytes`);
  console.log(`  通道 C 分词+u61:  ${sizes.channelC} bytes`);
  db.close();
}
