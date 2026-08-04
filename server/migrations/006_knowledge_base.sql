-- migrations:foreign-keys-off
-- 006_knowledge_base.sql
-- 用途:知识库三层对象模型(spec: docs/knowledge-base/management-principles-kb-v0.1-spec.md §3)的 DB 层:
--   L1 Source Fragment 复用 content_blocks(001,不改动);L2 Knowledge Unit、L3 Teaching Use Object、
--   单元-片段关联、检索留痕为本次新增的四张 kb_* 表;另把 workflow_instances.workflow_type 的
--   CHECK 从 ('S1_DIAGNOSIS') 扩为 ('S1_DIAGNOSIS','KB_RETRIEVAL','KB_REVIEW')。
--
-- 一、workflow_instances 表重建(CHECK 扩展)
-- 重建原因:SQLite 的 ALTER TABLE 不能修改既有 CHECK 约束,唯一合规路径是官方 12 步表重建
--   (建新表 -> 逐字拷贝 -> drop 旧表 -> rename -> 重建索引),同 005 先例;drop 被
--   teaching_claims(005)外键引用的旧表必须先关闭 foreign_keys,故用首行
--   `-- migrations:foreign-keys-off` 标记(runner 在 BEGIN 之前 PRAGMA foreign_keys=OFF、
--   COMMIT/ROLLBACK 之后恢复 ON;FK 关闭窗口仅限本 migration 执行期)。
-- 变更点仅一处:workflow_instances_type_check 的枚举值扩展,其余与 003 逐一对应保留。
-- 保留清单(与 003 逐一对齐):
--   - 全部 12 列(id/workflow_type/course_id/class_id/lesson_id/current_state/state_version/
--     state_machine_version/created_by/cancelled_reason/created_at/updated_at)及类型、
--     可空性、state_version DEFAULT 1,逐字保留;
--   - workflow_instances_state_check 十态 CHECK 原样保留(KB 工作流的状态机另行约定,
--     复用同一列,CANCELLED 等终态语义不变);
--   - course/class/lesson 三个显式命名外键原样保留;
--   - workflow_instances_lesson 索引在 rename 后原样重建;
--   - 003 未在 workflow_instances 上建任何触发器,无触发器需要保留或重建;
--   - 旧行逐字拷贝(id 不变),无新增列、无回填、无改写;audit_events.workflow_instance_id
--     为 003 ALTER 的无 FK 逻辑列,不受本重建影响;
--   - 配套测试(server/knowledge-base.test.mjs)在迁移后执行 PRAGMA foreign_key_check 验证。
-- 失败保护:runner 在单事务内执行本文件,任何一步失败即整体 ROLLBACK,数据库保持迁移前原状。
--
-- 二、新增 kb_* 四表(000–005 已冻结对象一律不改动)
-- 不可变/追加式规则(对齐 B2/B3/B5 先例):
--   - kb_knowledge_units.definition/claim 一经写入禁止修改(触发器);修正必须新建单元并经
--     supersedes_unit_id 链接;review_status 可更新(审核是状态流转,由服务层执行并审计);
--   - kb_retrieval_runs 追加式:禁止 UPDATE 与 DELETE(触发器),检索留痕只增不改。

CREATE TABLE workflow_instances_new (
  id TEXT PRIMARY KEY,
  workflow_type TEXT NOT NULL CONSTRAINT workflow_instances_type_check CHECK (workflow_type IN ('S1_DIAGNOSIS', 'KB_RETRIEVAL', 'KB_REVIEW')),
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

INSERT INTO workflow_instances_new(
  id, workflow_type, course_id, class_id, lesson_id, current_state,
  state_version, state_machine_version, created_by, cancelled_reason, created_at, updated_at
)
SELECT
  id, workflow_type, course_id, class_id, lesson_id, current_state,
  state_version, state_machine_version, created_by, cancelled_reason, created_at, updated_at
FROM workflow_instances;

DROP TABLE workflow_instances;
ALTER TABLE workflow_instances_new RENAME TO workflow_instances;

-- 003 的索引随 drop 旧表被连带删除,原样重建。
CREATE INDEX workflow_instances_lesson ON workflow_instances(lesson_id);

-- L2 知识单元:对一个概念的结构化学理表述,必须经 kb_unit_fragments 挂 ≥1 个来源片段。
-- definition/claim 为 statement 式字段,不可原地改(触发器);review_status 走服务层状态流转。
-- course_id/chapter_id 是知识范围标识(manifest 的课程/章),有意不加 FK:知识层不依赖
-- 课程组织表(courses 中未必存在对应行)。
CREATE TABLE kb_knowledge_units (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL,
  chapter_id TEXT NOT NULL,
  concept TEXT NOT NULL,
  definition TEXT,
  claim TEXT,
  conditions TEXT,
  counterexample TEXT,
  related_concepts_json TEXT NOT NULL DEFAULT '[]',
  confidence TEXT NOT NULL CONSTRAINT kb_knowledge_units_confidence_check CHECK (confidence IN ('low', 'medium', 'high')),
  review_status TEXT NOT NULL DEFAULT 'machine_extracted' CONSTRAINT kb_knowledge_units_review_check CHECK (review_status IN ('machine_extracted', 'teacher_verified', 'needs_review', 'rejected')),
  extraction_method TEXT NOT NULL CONSTRAINT kb_knowledge_units_extraction_check CHECK (extraction_method IN ('manual', 'deterministic_keyterm', 'deterministic_rule')),
  created_from_model_run_id TEXT,
  supersedes_unit_id TEXT,
  superseded_by TEXT,
  schema_version TEXT NOT NULL DEFAULT '1.0.0',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CONSTRAINT kb_knowledge_units_supersedes_fk FOREIGN KEY (supersedes_unit_id) REFERENCES kb_knowledge_units(id),
  CONSTRAINT kb_knowledge_units_concept_extraction_uq UNIQUE (course_id, chapter_id, concept, extraction_method)
) STRICT;

-- definition/claim 不可改:修正必须新建单元并接 supersedes 链(仿 teaching_claims.statement 先例)。
CREATE TRIGGER kb_knowledge_units_definition_claim_immutable
BEFORE UPDATE ON kb_knowledge_units
WHEN NEW.definition IS NOT OLD.definition OR NEW.claim IS NOT OLD.claim
BEGIN
  SELECT RAISE(ABORT, 'kb_knowledge_units: definition/claim are immutable; insert a new unit and link it via supersedes_unit_id');
END;

CREATE INDEX kb_knowledge_units_course_chapter ON kb_knowledge_units(course_id, chapter_id);
CREATE INDEX kb_knowledge_units_concept ON kb_knowledge_units(concept);
CREATE INDEX kb_knowledge_units_review_status ON kb_knowledge_units(review_status);

-- L2→L1 关联:知识单元必须可追溯到来源片段(content_blocks);role 标注片段在单元中的角色。
CREATE TABLE kb_unit_fragments (
  unit_id TEXT NOT NULL,
  fragment_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'definition' CONSTRAINT kb_unit_fragments_role_check CHECK (role IN ('definition', 'example', 'counterexample', 'context', 'table')),
  order_index INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT kb_unit_fragments_pk PRIMARY KEY (unit_id, fragment_id, role),
  CONSTRAINT kb_unit_fragments_unit_fk FOREIGN KEY (unit_id) REFERENCES kb_knowledge_units(id),
  CONSTRAINT kb_unit_fragments_fragment_fk FOREIGN KEY (fragment_id) REFERENCES content_blocks(id)
) STRICT;

CREATE INDEX kb_unit_fragments_fragment ON kb_unit_fragments(fragment_id);

-- L3 教学用途对象:面向七类教学用途的组配,引用 Unit 而非直接引用原文;
-- 教师可裁决、可拒绝,rejected 不进正式产物(同 units 四态)。
CREATE TABLE kb_teaching_use_objects (
  id TEXT PRIMARY KEY,
  unit_id TEXT NOT NULL,
  use_type TEXT NOT NULL CONSTRAINT kb_teaching_use_objects_type_check CHECK (use_type IN ('prerequisite', 'misconception', 'diagnostic_question', 'case_judgment_basis', 'activity_scaffold', 'assessment_rubric', 'teacher_explanation')),
  content TEXT NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'machine_extracted' CONSTRAINT kb_teaching_use_objects_review_check CHECK (review_status IN ('machine_extracted', 'teacher_verified', 'needs_review', 'rejected')),
  supersedes_use_object_id TEXT,
  superseded_by TEXT,
  schema_version TEXT NOT NULL DEFAULT '1.0.0',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CONSTRAINT kb_teaching_use_objects_unit_fk FOREIGN KEY (unit_id) REFERENCES kb_knowledge_units(id),
  CONSTRAINT kb_teaching_use_objects_supersedes_fk FOREIGN KEY (supersedes_use_object_id) REFERENCES kb_teaching_use_objects(id)
) STRICT;

CREATE INDEX kb_teaching_use_objects_unit ON kb_teaching_use_objects(unit_id);
CREATE INDEX kb_teaching_use_objects_type ON kb_teaching_use_objects(use_type);

-- 检索留痕:每次检索记录查询、过滤、语料版本标识与结果集,追加式只增不改;
-- corpus_version_hash 使"语料版本变化可识别"(服务层计算,见 knowledge-unit-service.mjs)。
CREATE TABLE kb_retrieval_runs (
  id TEXT PRIMARY KEY,
  workflow_instance_id TEXT NOT NULL,
  query_text TEXT NOT NULL,
  filters_json TEXT NOT NULL,
  corpus_version_hash TEXT NOT NULL,
  results_json TEXT NOT NULL,
  result_count INTEGER NOT NULL,
  schema_version TEXT NOT NULL DEFAULT '1.0.0',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CONSTRAINT kb_retrieval_runs_workflow_fk FOREIGN KEY (workflow_instance_id) REFERENCES workflow_instances(id)
) STRICT;

CREATE INDEX kb_retrieval_runs_workflow ON kb_retrieval_runs(workflow_instance_id);
CREATE INDEX kb_retrieval_runs_corpus ON kb_retrieval_runs(corpus_version_hash);

CREATE TRIGGER kb_retrieval_runs_no_update
BEFORE UPDATE ON kb_retrieval_runs
BEGIN
  SELECT RAISE(ABORT, 'kb_retrieval_runs: retrieval runs are append-only and cannot be updated');
END;

CREATE TRIGGER kb_retrieval_runs_no_delete
BEFORE DELETE ON kb_retrieval_runs
BEGIN
  SELECT RAISE(ABORT, 'kb_retrieval_runs: retrieval runs are append-only and cannot be deleted');
END;
