-- 002_decision_and_evidence.sql
-- 用途:教学主张(claim)、教学决策、教师裁决、证据链接、模型运行记录 —— 决策与证据链。
-- 约束说明:
--   - 全部 STRICT 表,约束显式命名,外键显式声明,enum 一律 TEXT + CHECK;
--   - teaching_decisions.teacher_decision_id 是有意的逻辑引用(不加 FK):
--     teacher_decisions 已 FK 指向 teaching_decisions,反向加 FK 会形成循环依赖,
--     由服务层在事务内写入后回填;
--   - evidence_links.superseded_by 同为逻辑引用,指向本表后续行。
-- 不可变规则:
--   - teaching_claims.statement 一经写入禁止修改(触发器);修改主张必须新建 claim 并通过 supersedes_claim_id 链接;
--   - teacher_decisions 禁止 UPDATE 与 DELETE:裁决不可覆盖,再次裁决 = 插入新行;
--   - model_runs 禁止 UPDATE 与 DELETE:模型运行只增不改。

CREATE TABLE IF NOT EXISTS teaching_claims (
  id TEXT PRIMARY KEY,
  claim_type TEXT NOT NULL CONSTRAINT teaching_claims_type_check CHECK (claim_type IN ('factual_claim', 'diagnostic_inference', 'teaching_recommendation')),
  statement TEXT NOT NULL,
  stage_id TEXT NOT NULL,
  target_stage_id TEXT,
  course_id TEXT NOT NULL,
  class_id TEXT NOT NULL,
  lesson_id TEXT NOT NULL,
  confidence_status TEXT NOT NULL CONSTRAINT teaching_claims_confidence_check CHECK (confidence_status IN ('confirmed', 'provisional', 'uncertain', 'unsupported')),
  validation_status TEXT NOT NULL DEFAULT 'PENDING' CONSTRAINT teaching_claims_validation_check CHECK (validation_status IN ('PENDING', 'PASSED', 'FAILED', 'WARNING', 'NOT_APPLICABLE')),
  mechanical_report_json TEXT,
  semantic_review_status TEXT NOT NULL DEFAULT 'not_reviewed' CONSTRAINT teaching_claims_semantic_check CHECK (semantic_review_status IN ('not_reviewed', 'supported', 'partially_supported', 'unsupported', 'uncertain')),
  semantic_report_json TEXT,
  created_by TEXT NOT NULL CONSTRAINT teaching_claims_created_by_check CHECK (created_by IN ('system', 'rule', 'mock', 'model', 'teacher')),
  created_from_model_run_id TEXT,
  supersedes_claim_id TEXT,
  superseded_by TEXT,
  created_at TEXT NOT NULL,
  CONSTRAINT teaching_claims_course_fk FOREIGN KEY (course_id) REFERENCES courses(id),
  CONSTRAINT teaching_claims_class_fk FOREIGN KEY (class_id) REFERENCES class_cohorts(id),
  CONSTRAINT teaching_claims_lesson_fk FOREIGN KEY (lesson_id) REFERENCES lessons(id),
  CONSTRAINT teaching_claims_supersedes_fk FOREIGN KEY (supersedes_claim_id) REFERENCES teaching_claims(id)
) STRICT;

-- 原始 claim 的 statement 不可改:修改必须新建 claim 并接 supersedes 链。
CREATE TRIGGER IF NOT EXISTS teaching_claims_statement_immutable
BEFORE UPDATE ON teaching_claims
WHEN NEW.statement IS NOT OLD.statement
BEGIN
  SELECT RAISE(ABORT, 'teaching_claims: statement is immutable; insert a new claim and link it via supersedes_claim_id');
END;

CREATE TABLE IF NOT EXISTS teaching_decisions (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL,
  class_id TEXT NOT NULL,
  lesson_id TEXT NOT NULL,
  stage_id TEXT NOT NULL,
  decision_question TEXT NOT NULL,
  observation_claim_ids_json TEXT NOT NULL,
  inference_claim_ids_json TEXT NOT NULL,
  recommendation_claim_ids_json TEXT NOT NULL,
  evidence_ids_json TEXT NOT NULL,
  mechanical_validation_status TEXT NOT NULL DEFAULT 'PENDING',
  semantic_review_status TEXT NOT NULL DEFAULT 'not_reviewed',
  teacher_decision_id TEXT,
  workflow_instance_id TEXT NOT NULL,
  source_lesson_version_id TEXT,
  target_lesson_version_id TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN' CONSTRAINT teaching_decisions_status_check CHECK (status IN ('OPEN', 'UNDER_REVIEW', 'DECIDED', 'PUBLISHED', 'CANCELLED')),
  created_at TEXT NOT NULL,
  published_at TEXT,
  CONSTRAINT teaching_decisions_course_fk FOREIGN KEY (course_id) REFERENCES courses(id),
  CONSTRAINT teaching_decisions_class_fk FOREIGN KEY (class_id) REFERENCES class_cohorts(id),
  CONSTRAINT teaching_decisions_lesson_fk FOREIGN KEY (lesson_id) REFERENCES lessons(id),
  CONSTRAINT teaching_decisions_source_version_fk FOREIGN KEY (source_lesson_version_id) REFERENCES lesson_versions(id),
  CONSTRAINT teaching_decisions_target_version_fk FOREIGN KEY (target_lesson_version_id) REFERENCES lesson_versions(id)
) STRICT;

CREATE TABLE IF NOT EXISTS teacher_decisions (
  id TEXT PRIMARY KEY,
  decision_record_id TEXT NOT NULL,
  decision TEXT NOT NULL CONSTRAINT teacher_decisions_decision_check CHECK (decision IN ('accept', 'revise', 'reject', 'defer')),
  reviewer_id TEXT NOT NULL,
  original_statement TEXT NOT NULL,
  edited_statement TEXT,
  comment TEXT,
  decided_at TEXT NOT NULL,
  CONSTRAINT teacher_decisions_record_fk FOREIGN KEY (decision_record_id) REFERENCES teaching_decisions(id)
) STRICT;

-- 教师裁决不可覆盖、不可删除:再次裁决 = 插入新行。
CREATE TRIGGER IF NOT EXISTS teacher_decisions_no_update
BEFORE UPDATE ON teacher_decisions
BEGIN
  SELECT RAISE(ABORT, 'teacher_decisions: rulings are immutable; submit a new row instead');
END;

CREATE TRIGGER IF NOT EXISTS teacher_decisions_no_delete
BEFORE DELETE ON teacher_decisions
BEGIN
  SELECT RAISE(ABORT, 'teacher_decisions: rulings cannot be deleted');
END;

CREATE TABLE IF NOT EXISTS evidence_links (
  id TEXT PRIMARY KEY,
  claim_id TEXT NOT NULL,
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
  CONSTRAINT evidence_links_claim_fk FOREIGN KEY (claim_id) REFERENCES teaching_claims(id),
  CONSTRAINT evidence_links_decision_fk FOREIGN KEY (decision_id) REFERENCES teaching_decisions(id),
  CONSTRAINT evidence_links_block_fk FOREIGN KEY (content_block_id) REFERENCES content_blocks(id),
  CONSTRAINT evidence_links_observation_fk FOREIGN KEY (runtime_observation_id) REFERENCES runtime_observations(id)
) STRICT;

CREATE TABLE IF NOT EXISTS model_runs (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  provider TEXT NOT NULL CONSTRAINT model_runs_provider_check CHECK (provider IN ('mock', 'existing-mlx', 'deepseek-cloud')),
  model TEXT NOT NULL,
  thinking_mode TEXT,
  reasoning_effort TEXT,
  prompt_version TEXT NOT NULL,
  input_record_ids_json TEXT NOT NULL,
  evidence_ids_json TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  output_hash TEXT,
  raw_output_location TEXT,
  structured_output_json TEXT,
  latency_ms REAL,
  token_usage_json TEXT,
  validation_status TEXT NOT NULL DEFAULT 'PENDING',
  fallback_used INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL,
  completed_at TEXT
) STRICT;

-- 模型运行记录只增不改、不删。
CREATE TRIGGER IF NOT EXISTS model_runs_no_update
BEFORE UPDATE ON model_runs
BEGIN
  SELECT RAISE(ABORT, 'model_runs: rows are append-only and cannot be updated');
END;

CREATE TRIGGER IF NOT EXISTS model_runs_no_delete
BEFORE DELETE ON model_runs
BEGIN
  SELECT RAISE(ABORT, 'model_runs: rows are append-only and cannot be deleted');
END;
