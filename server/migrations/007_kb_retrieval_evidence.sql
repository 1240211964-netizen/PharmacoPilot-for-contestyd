-- 007_kb_retrieval_evidence.sql
-- 用途:让检索阶段(knowledge-retrieval-service)能把检索结果落为正式 evidence_links 行。
-- 背景:002 的 evidence_links.claim_id 为 NOT NULL + FK(teaching_claims),而 KB 检索运行时
--   断言尚不存在(answer composer 属闸后锁定阶段,spec §2.2/§5.3),证据引用必须先于断言入库,
--   否则"检索结果生成 evidence reference、引用可回溯到 source fragment"这一集成链断裂。
-- 方案(最小侵入;不新建影子表——两套证据源比放宽一列更糟):
--   1. claim_id 放宽为可空(FK 保留)。NULL 语义:"检索阶段证据,尚未绑定断言";
--      闸后 answer 层创建 claim 后按现行追加纪律绑定新行,不回填旧行。
--   2. 新增 retrieval_run_id 可空列 + FK -> kb_retrieval_runs(id)(006):
--      kb_retrieval_runs 与 evidence_links 的正式关联,证据可回溯到本次检索。
--   3. 新增 UNIQUE 索引 (retrieval_run_id, content_block_id):同一检索 run 重复持久化
--      不产生重复行(幂等的 DB 层兜底;S1 证据行 retrieval_run_id 为 NULL,SQLite UNIQUE
--      容许多个 NULL,互不冲突)。
--
-- 表重建说明:SQLite 的 ALTER TABLE 不能修改既有 NOT NULL,唯一合规路径是官方 12 步表重建
--   (建新表 -> 逐字拷贝 -> drop 旧表 -> rename -> 重建索引),同 005/006 先例。
--   本文件不使用 `-- migrations:foreign-keys-off` 标记:没有任何表以外键引用
--   evidence_links(002 注释:superseded_by 为逻辑引用,无 FK),drop 旧表无需关闭外键。
-- 保留清单(与 002 逐一对齐):
--   - 原 19 列(id/claim_id/decision_id/evidence_type/source_id/source_version_id/content_block_id/
--     runtime_observation_id/page_index/page_label/bbox_json/bbox_coordinate_system/verbatim_quote/
--     normalized_quote/source_status/effective_date/superseded_by/content_hash/retrieved_at)的
--     类型、DEFAULT、CHECK(evidence_links_type_check)逐字保留;仅 claim_id 的 NOT NULL 放宽;
--   - 002 的四个命名外键(claim/decision/block/observation)原样保留;
--   - 002 未在 evidence_links 上建任何触发器,无触发器需要保留或重建;
--   - 004 的 evidence_links_claim 索引在 rename 后原样重建;
--   - 旧行逐字拷贝(id 不变),新增 retrieval_run_id 一律 NULL,无回填、无改写;
--   - 配套测试(server/knowledge-retrieval.test.mjs)在迁移后执行 PRAGMA foreign_key_check 验证。
-- 失败保护:runner 在单事务内执行本文件,任何一步失败即整体 ROLLBACK。

CREATE TABLE evidence_links_new (
  id TEXT PRIMARY KEY,
  claim_id TEXT,
  decision_id TEXT,
  evidence_type TEXT NOT NULL CONSTRAINT evidence_links_type_check CHECK (evidence_type IN ('knowledge_block', 'runtime_observation', 'teacher_annotation', 'simulation_event', 'manual_reference')),
  source_id TEXT NOT NULL,
  source_version_id TEXT,
  content_block_id TEXT,
  runtime_observation_id TEXT,
  page_index INTEGER,
  page_label TEXT,
  bbox_json TEXT,
  bbox_coordinate_system TEXT NOT NULL DEFAULT 'none',
  verbatim_quote TEXT,
  normalized_quote TEXT,
  source_status TEXT NOT NULL DEFAULT 'active',
  effective_date TEXT,
  superseded_by TEXT,
  content_hash TEXT,
  retrieved_at TEXT NOT NULL,
  retrieval_run_id TEXT,
  CONSTRAINT evidence_links_claim_fk FOREIGN KEY (claim_id) REFERENCES teaching_claims(id),
  CONSTRAINT evidence_links_decision_fk FOREIGN KEY (decision_id) REFERENCES teaching_decisions(id),
  CONSTRAINT evidence_links_block_fk FOREIGN KEY (content_block_id) REFERENCES content_blocks(id),
  CONSTRAINT evidence_links_observation_fk FOREIGN KEY (runtime_observation_id) REFERENCES runtime_observations(id),
  CONSTRAINT evidence_links_retrieval_run_fk FOREIGN KEY (retrieval_run_id) REFERENCES kb_retrieval_runs(id)
) STRICT;

INSERT INTO evidence_links_new(
  id, claim_id, decision_id, evidence_type, source_id, source_version_id, content_block_id,
  runtime_observation_id, page_index, page_label, bbox_json, bbox_coordinate_system,
  verbatim_quote, normalized_quote, source_status, effective_date, superseded_by, content_hash,
  retrieved_at
)
SELECT
  id, claim_id, decision_id, evidence_type, source_id, source_version_id, content_block_id,
  runtime_observation_id, page_index, page_label, bbox_json, bbox_coordinate_system,
  verbatim_quote, normalized_quote, source_status, effective_date, superseded_by, content_hash,
  retrieved_at
FROM evidence_links;

DROP TABLE evidence_links;
ALTER TABLE evidence_links_new RENAME TO evidence_links;

-- 004 的索引随 drop 旧表被连带删除,原样重建。
CREATE INDEX evidence_links_claim ON evidence_links(claim_id);

-- 检索 run 关联索引 + 幂等兜底(同一 run 的同一片段只允许一行;NULL run 的 S1 行不受约束)。
CREATE INDEX evidence_links_retrieval_run ON evidence_links(retrieval_run_id);
CREATE UNIQUE INDEX evidence_links_retrieval_run_block ON evidence_links(retrieval_run_id, content_block_id);
