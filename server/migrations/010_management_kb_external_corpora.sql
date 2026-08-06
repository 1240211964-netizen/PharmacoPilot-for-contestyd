-- 010_management_kb_external_corpora.sql
-- 管理学冻结语料库 P1：Product Core 只登记语料版本、检索运行和证据链接；
-- 课程 SQLite 永远不承载审核、工作流或审计状态，运行时亦仅以 read-only 打开。
--
-- 既有 evidence_links 是唯一正式证据表。本迁移扩展它以引用外挂 chunk，不能另建
-- 平行证据表；SQLite 无法扩展 CHECK，故按 007 的保留式重建做最小 schema 调整。

CREATE TABLE kb_external_corpora (
  id TEXT PRIMARY KEY,
  corpus_id TEXT NOT NULL,
  corpus_version TEXT NOT NULL,
  corpus_version_hash TEXT NOT NULL,
  sqlite_sha256 TEXT NOT NULL CONSTRAINT kb_external_corpora_sqlite_sha256_check CHECK (length(sqlite_sha256) = 64),
  manifest_sha256 TEXT NOT NULL CONSTRAINT kb_external_corpora_manifest_sha256_check CHECK (length(manifest_sha256) = 64),
  schema_version TEXT NOT NULL,
  source_count INTEGER NOT NULL CONSTRAINT kb_external_corpora_source_count_check CHECK (source_count >= 0),
  chunk_count INTEGER NOT NULL CONSTRAINT kb_external_corpora_chunk_count_check CHECK (chunk_count >= 0),
  created_at TEXT NOT NULL,
  registered_at TEXT NOT NULL,
  access_mode TEXT NOT NULL CONSTRAINT kb_external_corpora_access_mode_check CHECK (access_mode = 'read-only'),
  status TEXT NOT NULL CONSTRAINT kb_external_corpora_status_check CHECK (status IN ('active', 'superseded', 'revoked')),
  CONSTRAINT kb_external_corpora_version_unique UNIQUE (corpus_id, corpus_version_hash),
  CONSTRAINT kb_external_corpora_sqlite_unique UNIQUE (sqlite_sha256)
) STRICT;

CREATE INDEX kb_external_corpora_active ON kb_external_corpora(corpus_id, status);

CREATE TRIGGER kb_external_corpora_no_update
BEFORE UPDATE ON kb_external_corpora
BEGIN
  SELECT RAISE(ABORT, 'kb_external_corpora: corpus registry is append-only and cannot be updated');
END;

CREATE TRIGGER kb_external_corpora_no_delete
BEFORE DELETE ON kb_external_corpora
BEGIN
  SELECT RAISE(ABORT, 'kb_external_corpora: corpus registry is append-only and cannot be deleted');
END;

CREATE TABLE evidence_links_new (
  id TEXT PRIMARY KEY,
  claim_id TEXT,
  decision_id TEXT,
  evidence_type TEXT NOT NULL CONSTRAINT evidence_links_type_check CHECK (evidence_type IN ('knowledge_block', 'runtime_observation', 'teacher_annotation', 'simulation_event', 'manual_reference', 'external_knowledge_chunk')),
  source_id TEXT NOT NULL,
  source_version_id TEXT,
  content_block_id TEXT,
  external_corpus_id TEXT,
  external_chunk_id TEXT,
  external_locator_json TEXT,
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
  CONSTRAINT evidence_links_external_corpus_fk FOREIGN KEY (external_corpus_id) REFERENCES kb_external_corpora(id),
  CONSTRAINT evidence_links_observation_fk FOREIGN KEY (runtime_observation_id) REFERENCES runtime_observations(id),
  CONSTRAINT evidence_links_retrieval_run_fk FOREIGN KEY (retrieval_run_id) REFERENCES kb_retrieval_runs(id)
) STRICT;

INSERT INTO evidence_links_new(
  id, claim_id, decision_id, evidence_type, source_id, source_version_id, content_block_id,
  runtime_observation_id, page_index, page_label, bbox_json, bbox_coordinate_system,
  verbatim_quote, normalized_quote, source_status, effective_date, superseded_by, content_hash,
  retrieved_at, retrieval_run_id
)
SELECT
  id, claim_id, decision_id, evidence_type, source_id, source_version_id, content_block_id,
  runtime_observation_id, page_index, page_label, bbox_json, bbox_coordinate_system,
  verbatim_quote, normalized_quote, source_status, effective_date, superseded_by, content_hash,
  retrieved_at, retrieval_run_id
FROM evidence_links;

DROP TABLE evidence_links;
ALTER TABLE evidence_links_new RENAME TO evidence_links;

CREATE INDEX evidence_links_claim ON evidence_links(claim_id);
CREATE INDEX evidence_links_retrieval_run ON evidence_links(retrieval_run_id);
CREATE UNIQUE INDEX evidence_links_retrieval_run_block ON evidence_links(retrieval_run_id, content_block_id);
CREATE INDEX evidence_links_external_corpus ON evidence_links(external_corpus_id);
CREATE UNIQUE INDEX evidence_links_retrieval_run_external_chunk
  ON evidence_links(retrieval_run_id, external_corpus_id, external_chunk_id);
