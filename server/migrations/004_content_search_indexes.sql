-- 004_content_search_indexes.sql
-- 用途:高频查询索引 + content_blocks 的 FTS5 全文检索派生表。
-- 约束说明:
--   - 普通索引全部 CREATE INDEX IF NOT EXISTS;
--   - 已在 Node 22.22(node:sqlite 内置 SQLite)实测 CREATE VIRTUAL TABLE ... USING fts5 可用,
--     因此 FTS 部分保留在本 migration 内;若未来运行环境的 node:sqlite 未编译 FTS5,
--     本文件执行会失败且 runner 报错中止(绝不静默),届时需拆出本 migration。
-- 重要:content_blocks_fts 是派生索引,不是事实源。事实源永远是 content_blocks。
--   - 通过 ai/ad/au 三个触发器与 content_blocks 同步;
--   - 如需重建,执行:INSERT INTO content_blocks_fts(content_blocks_fts) VALUES('rebuild');
--     (虚拟表为 external-content 模式,rebuild 会从 content_blocks 全量重建,非事实源可安全重建。)

CREATE INDEX IF NOT EXISTS content_blocks_version_order ON content_blocks(asset_version_id, order_index);
CREATE INDEX IF NOT EXISTS content_blocks_type ON content_blocks(block_type);
CREATE INDEX IF NOT EXISTS evidence_links_claim ON evidence_links(claim_id);
CREATE INDEX IF NOT EXISTS teaching_claims_lesson_type ON teaching_claims(lesson_id, claim_type);
CREATE INDEX IF NOT EXISTS runtime_observations_lesson ON runtime_observations(lesson_id);

CREATE VIRTUAL TABLE IF NOT EXISTS content_blocks_fts USING fts5(
  content_raw,
  content_segmented,
  content = 'content_blocks',
  content_rowid = 'rowid'
);

CREATE TRIGGER IF NOT EXISTS content_blocks_fts_ai
AFTER INSERT ON content_blocks
BEGIN
  INSERT INTO content_blocks_fts(rowid, content_raw, content_segmented)
  VALUES (new.rowid, new.content_raw, new.content_segmented);
END;

CREATE TRIGGER IF NOT EXISTS content_blocks_fts_ad
AFTER DELETE ON content_blocks
BEGIN
  INSERT INTO content_blocks_fts(content_blocks_fts, rowid, content_raw, content_segmented)
  VALUES ('delete', old.rowid, old.content_raw, old.content_segmented);
END;

CREATE TRIGGER IF NOT EXISTS content_blocks_fts_au
AFTER UPDATE ON content_blocks
BEGIN
  INSERT INTO content_blocks_fts(content_blocks_fts, rowid, content_raw, content_segmented)
  VALUES ('delete', old.rowid, old.content_raw, old.content_segmented);
  INSERT INTO content_blocks_fts(rowid, content_raw, content_segmented)
  VALUES (new.rowid, new.content_raw, new.content_segmented);
END;
