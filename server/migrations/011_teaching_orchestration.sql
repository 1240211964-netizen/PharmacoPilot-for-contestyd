-- P2A: S2-S9 编排实体。保留 S1 workflow_instances，不改变其类型约束。
CREATE TABLE teaching_workflows (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id),
  class_id TEXT NOT NULL REFERENCES class_cohorts(id),
  lesson_id TEXT NOT NULL REFERENCES lessons(id),
  chapter_id TEXT NOT NULL,
  lesson_hours INTEGER NOT NULL CHECK (lesson_hours > 0),
  current_state TEXT NOT NULL,
  state_version INTEGER NOT NULL DEFAULT 1,
  state_machine_version TEXT NOT NULL,
  parent_workflow_instance_id TEXT,
  previous_status TEXT,
  resume_reason TEXT,
  last_checkpoint_json TEXT,
  blocked_reason TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
CREATE INDEX teaching_workflows_lesson ON teaching_workflows(lesson_id, created_at);

CREATE TABLE teaching_workflow_events (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL REFERENCES teaching_workflows(id),
  previous_state TEXT,
  next_state TEXT NOT NULL,
  action TEXT NOT NULL,
  reason TEXT,
  actor_id TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  checkpoint_json TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(workflow_id, idempotency_key)
) STRICT;
CREATE TRIGGER teaching_workflow_events_no_update BEFORE UPDATE ON teaching_workflow_events BEGIN SELECT RAISE(ABORT, 'teaching_workflow_events immutable'); END;
CREATE TRIGGER teaching_workflow_events_no_delete BEFORE DELETE ON teaching_workflow_events BEGIN SELECT RAISE(ABORT, 'teaching_workflow_events immutable'); END;

CREATE TABLE teaching_s1_contexts (
  id TEXT PRIMARY KEY, workflow_id TEXT NOT NULL REFERENCES teaching_workflows(id),
  fixture INTEGER NOT NULL CHECK (fixture IN (0,1)), payload_json TEXT NOT NULL, created_at TEXT NOT NULL,
  UNIQUE(workflow_id)
) STRICT;
CREATE TABLE teaching_evidence_packages (
  id TEXT PRIMARY KEY, workflow_id TEXT NOT NULL REFERENCES teaching_workflows(id),
  corpus_version_hash TEXT NOT NULL, retrieval_run_ids_json TEXT NOT NULL, evidence_link_ids_json TEXT NOT NULL,
  fixture INTEGER NOT NULL CHECK (fixture IN (0,1)), created_at TEXT NOT NULL, UNIQUE(workflow_id)
) STRICT;
CREATE TABLE teaching_design_candidates (
  id TEXT PRIMARY KEY, workflow_id TEXT NOT NULL REFERENCES teaching_workflows(id), schema_version TEXT NOT NULL,
  generation_mode TEXT NOT NULL CHECK (generation_mode IN ('deterministic_fixture','model_generated')),
  payload_json TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(workflow_id, id)
) STRICT;
CREATE TABLE teaching_design_versions (
  id TEXT PRIMARY KEY, workflow_id TEXT NOT NULL REFERENCES teaching_workflows(id), candidate_id TEXT NOT NULL REFERENCES teaching_design_candidates(id),
  version_number INTEGER NOT NULL, status TEXT NOT NULL CHECK (status IN ('approved','superseded')),
  parent_version_id TEXT REFERENCES teaching_design_versions(id), payload_json TEXT NOT NULL, change_reason TEXT NOT NULL,
  created_at TEXT NOT NULL, UNIQUE(workflow_id, version_number)
) STRICT;
CREATE TRIGGER teaching_design_versions_no_update BEFORE UPDATE ON teaching_design_versions BEGIN SELECT RAISE(ABORT, 'teaching_design_versions immutable'); END;
CREATE TRIGGER teaching_design_versions_no_delete BEFORE DELETE ON teaching_design_versions BEGIN SELECT RAISE(ABORT, 'teaching_design_versions immutable'); END;
CREATE TABLE teaching_design_teacher_decisions (
  id TEXT PRIMARY KEY, workflow_id TEXT NOT NULL REFERENCES teaching_workflows(id), candidate_id TEXT NOT NULL REFERENCES teaching_design_candidates(id),
  field_path TEXT NOT NULL, decision TEXT NOT NULL CHECK (decision IN ('ACCEPTED','MODIFIED','REJECTED','PENDING_EVIDENCE')),
  decision_source TEXT NOT NULL CHECK (decision_source IN ('teacher','deterministic_fixture')), original_content_json TEXT NOT NULL,
  revised_content_json TEXT, reason TEXT NOT NULL, evidence_link_ids_json TEXT NOT NULL, actor_id TEXT NOT NULL, decided_at TEXT NOT NULL
) STRICT;
CREATE TRIGGER teaching_design_teacher_decisions_no_update BEFORE UPDATE ON teaching_design_teacher_decisions BEGIN SELECT RAISE(ABORT, 'teaching_design_teacher_decisions immutable'); END;
CREATE TRIGGER teaching_design_teacher_decisions_no_delete BEFORE DELETE ON teaching_design_teacher_decisions BEGIN SELECT RAISE(ABORT, 'teaching_design_teacher_decisions immutable'); END;
CREATE TABLE simulation_runs (
  id TEXT PRIMARY KEY, workflow_id TEXT NOT NULL REFERENCES teaching_workflows(id), design_version_id TEXT NOT NULL REFERENCES teaching_design_versions(id),
  seed TEXT NOT NULL, simulation_mode TEXT NOT NULL CHECK (simulation_mode IN ('deterministic_fixture','persisted_run')), status TEXT NOT NULL,
  input_json TEXT NOT NULL, metrics_json TEXT NOT NULL, warnings_json TEXT NOT NULL, started_at TEXT NOT NULL, completed_at TEXT
) STRICT;
CREATE TABLE simulation_events (
  id TEXT PRIMARY KEY, simulation_run_id TEXT NOT NULL REFERENCES simulation_runs(id), lesson_offset INTEGER NOT NULL,
  student_id TEXT, group_id TEXT, event_type TEXT NOT NULL, related_stage TEXT NOT NULL, related_field_path TEXT NOT NULL,
  observed_signal TEXT NOT NULL, evidence_json TEXT NOT NULL, severity INTEGER NOT NULL CHECK (severity BETWEEN 1 AND 5)
) STRICT;
CREATE TABLE critical_moments (
  id TEXT PRIMARY KEY, simulation_run_id TEXT NOT NULL REFERENCES simulation_runs(id), event_id TEXT NOT NULL REFERENCES simulation_events(id),
  moment_type TEXT NOT NULL, related_stage TEXT NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(simulation_run_id,event_id,moment_type)
) STRICT;
CREATE TABLE s8_revisions (
  id TEXT PRIMARY KEY, workflow_id TEXT NOT NULL REFERENCES teaching_workflows(id), critical_moment_id TEXT NOT NULL REFERENCES critical_moments(id),
  design_version_id TEXT NOT NULL REFERENCES teaching_design_versions(id), payload_json TEXT NOT NULL, created_at TEXT NOT NULL
) STRICT;
CREATE TABLE s9_asset_candidates (
  id TEXT PRIMARY KEY, workflow_id TEXT NOT NULL REFERENCES teaching_workflows(id), design_version_id TEXT NOT NULL REFERENCES teaching_design_versions(id),
  status TEXT NOT NULL CHECK (status='candidate'), payload_json TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(workflow_id,design_version_id)
) STRICT;
