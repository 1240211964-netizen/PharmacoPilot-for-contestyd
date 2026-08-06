-- P2B: 不改变既有 model_runs 的 S1 workflow_id 契约；为 S2-S7 教学编排保留原始本地模型输出。
CREATE TABLE teaching_model_generation_runs (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL REFERENCES teaching_workflows(id),
  stage TEXT NOT NULL CHECK (stage IN ('S2','S3','S4','S5','S6','S7','ALIGNMENT','CITATIONS')),
  provider TEXT NOT NULL CHECK (provider='existing-mlx'),
  model_profile TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  input_chunk_ids_json TEXT NOT NULL,
  evidence_link_ids_json TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  raw_output_text TEXT NOT NULL,
  parsed_output_json TEXT,
  validation_status TEXT NOT NULL CHECK (validation_status IN ('PASSED','FAILED')),
  retry_count INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  UNIQUE(workflow_id, stage)
) STRICT;
CREATE TRIGGER teaching_model_generation_runs_no_update BEFORE UPDATE ON teaching_model_generation_runs BEGIN SELECT RAISE(ABORT, 'teaching_model_generation_runs immutable'); END;
CREATE TRIGGER teaching_model_generation_runs_no_delete BEFORE DELETE ON teaching_model_generation_runs BEGIN SELECT RAISE(ABORT, 'teaching_model_generation_runs immutable'); END;
