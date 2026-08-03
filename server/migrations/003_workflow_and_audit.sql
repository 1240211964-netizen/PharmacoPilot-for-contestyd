-- 003_workflow_and_audit.sql
-- 用途:工作流实例表 + 既有 audit_events 审计表扩展。
-- 约束说明:
--   - workflow_instances 为 STRICT 表,enum 一律 TEXT + CHECK,显式外键指向课程/班级/课时;
--     state_version 供乐观并发控制,由服务层在状态迁移时递增;
--   - audit_events 通过 ALTER TABLE ADD COLUMN 扩展,新列与既有 metadata_json 并存,老列不动;
--     旧行新列为 NULL,合法(所有新列均可空);
--   - ALTER TABLE ADD COLUMN 不可重入,但本 migration 只会被 runner 应用一次并记录在案,因此安全。
-- 不可变规则:
--   - audit_events 为追加式审计日志,禁止 UPDATE 与 DELETE(触发器强制)。

CREATE TABLE IF NOT EXISTS workflow_instances (
  id TEXT PRIMARY KEY,
  workflow_type TEXT NOT NULL CONSTRAINT workflow_instances_type_check CHECK (workflow_type IN ('S1_DIAGNOSIS')),
  course_id TEXT NOT NULL,
  class_id TEXT NOT NULL,
  lesson_id TEXT NOT NULL,
  current_state TEXT NOT NULL CONSTRAINT workflow_instances_state_check CHECK (current_state IN ('DRAFT', 'INPUT_READY', 'FACTS_COMPUTED', 'EVIDENCE_RETRIEVED', 'CLAIMS_GENERATED', 'MECHANICAL_VALIDATED', 'SEMANTIC_REVIEWED', 'TEACHER_REVIEW', 'PUBLISHED', 'CANCELLED')),
  state_version INTEGER NOT NULL DEFAULT 1,
  state_machine_version TEXT NOT NULL,
  created_by TEXT NOT NULL,
  cancelled_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CONSTRAINT workflow_instances_course_fk FOREIGN KEY (course_id) REFERENCES courses(id),
  CONSTRAINT workflow_instances_class_fk FOREIGN KEY (class_id) REFERENCES class_cohorts(id),
  CONSTRAINT workflow_instances_lesson_fk FOREIGN KEY (lesson_id) REFERENCES lessons(id)
) STRICT;

ALTER TABLE audit_events ADD COLUMN actor_type TEXT;
ALTER TABLE audit_events ADD COLUMN actor_id TEXT;
ALTER TABLE audit_events ADD COLUMN entity_type TEXT;
ALTER TABLE audit_events ADD COLUMN entity_id TEXT;
ALTER TABLE audit_events ADD COLUMN workflow_instance_id TEXT;
ALTER TABLE audit_events ADD COLUMN previous_state TEXT;
ALTER TABLE audit_events ADD COLUMN next_state TEXT;
ALTER TABLE audit_events ADD COLUMN payload_json TEXT;
ALTER TABLE audit_events ADD COLUMN event_hash TEXT;
ALTER TABLE audit_events ADD COLUMN schema_version TEXT;

-- 审计日志追加式:禁止 UPDATE 与 DELETE。
CREATE TRIGGER IF NOT EXISTS audit_events_no_update
BEFORE UPDATE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'audit_events: audit log is append-only and cannot be updated');
END;

CREATE TRIGGER IF NOT EXISTS audit_events_no_delete
BEFORE DELETE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'audit_events: audit log is append-only and cannot be deleted');
END;

CREATE INDEX IF NOT EXISTS workflow_instances_lesson ON workflow_instances(lesson_id);
CREATE INDEX IF NOT EXISTS audit_events_entity ON audit_events(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS audit_events_workflow ON audit_events(workflow_instance_id);
