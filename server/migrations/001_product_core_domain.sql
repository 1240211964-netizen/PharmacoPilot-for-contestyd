-- 001_product_core_domain.sql
-- 用途:产品内核领域表 —— 课程/班级/课时/课时版本/前测/运行时观测/知识资产/资产版本/内容块。
-- 约束说明:
--   - 全部 STRICT 表,约束显式命名,外键显式声明;
--   - enum 一律 TEXT + CHECK;
--   - id 形如 crs_/cls_/les_ 的前缀由服务层生成与校验,数据库不检查前缀;
--   - lessons 通过复合外键 (class_id, course_id) REFERENCES class_cohorts(id, course_id)
--     实现 FK scope 隔离:课时引用的班级必须属于同一门课程,跨 course 引用会被拒绝;
--     class_id 为 NULL 时复合外键按 SQL 标准不检查,只要求 course_id 合法。
-- 不可变规则:
--   - lesson_versions.status = 'PUBLISHED' 的行禁止 UPDATE 与 DELETE;
--     唯一例外是触发器 WHEN 子句放行的 PUBLISHED -> SUPERSEDED 流转,且除 status 外所有字段必须逐字段不变;
--   - asset_versions 禁止 DELETE;source_status 只允许 active -> superseded/withdrawn/expired 单向流转(触发器强制);
--   - pretest_responses 去标识化纪律:只存 student_anon_id 等匿名内部 ID,
--     绝不写入真实姓名、学号或任何可回推身份的信息(由服务层与审计共同保证)。
-- knowledge_assets.current_version_id 是有意的逻辑引用(不加 FK):
--   它指向 asset_versions,而 asset_versions 又 FK 回 knowledge_assets,加 FK 会形成循环依赖,
--   由服务层在事务内先插 asset_versions 再回填,保持一致。

CREATE TABLE IF NOT EXISTS courses (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  status TEXT NOT NULL CONSTRAINT courses_status_check CHECK (status IN ('ACTIVE', 'ARCHIVED')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CONSTRAINT courses_code_uq UNIQUE (code)
) STRICT;

CREATE TABLE IF NOT EXISTS class_cohorts (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL,
  name TEXT NOT NULL,
  academic_term TEXT NOT NULL,
  anonymization_policy TEXT NOT NULL DEFAULT 'anonymous-internal-id',
  created_at TEXT NOT NULL,
  CONSTRAINT class_cohorts_course_fk FOREIGN KEY (course_id) REFERENCES courses(id),
  CONSTRAINT class_cohorts_id_course_uq UNIQUE (id, course_id)
) STRICT;

CREATE TABLE IF NOT EXISTS lessons (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL,
  class_id TEXT,
  title TEXT NOT NULL,
  stage_status TEXT NOT NULL DEFAULT 'DRAFT',
  created_at TEXT NOT NULL,
  CONSTRAINT lessons_course_fk FOREIGN KEY (course_id) REFERENCES courses(id),
  CONSTRAINT lessons_class_course_fk FOREIGN KEY (class_id, course_id) REFERENCES class_cohorts(id, course_id)
) STRICT;

CREATE INDEX IF NOT EXISTS lessons_course ON lessons(course_id);
CREATE INDEX IF NOT EXISTS lessons_class ON lessons(class_id);

CREATE TABLE IF NOT EXISTS lesson_versions (
  id TEXT PRIMARY KEY,
  lesson_id TEXT NOT NULL,
  version_number INTEGER NOT NULL,
  parent_version_id TEXT,
  status TEXT NOT NULL CONSTRAINT lesson_versions_status_check CHECK (status IN ('DRAFT', 'PUBLISHED', 'SUPERSEDED')),
  content_json TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  published_at TEXT,
  CONSTRAINT lesson_versions_lesson_fk FOREIGN KEY (lesson_id) REFERENCES lessons(id),
  CONSTRAINT lesson_versions_parent_fk FOREIGN KEY (parent_version_id) REFERENCES lesson_versions(id),
  CONSTRAINT lesson_versions_lesson_version_uq UNIQUE (lesson_id, version_number)
) STRICT;

-- PUBLISHED 课时版本不可变:仅放行 status PUBLISHED -> SUPERSEDED 且其余字段逐字段不变(IS 为 NULL 安全比较)的更新。
CREATE TRIGGER IF NOT EXISTS lesson_versions_published_no_update
BEFORE UPDATE ON lesson_versions
WHEN OLD.status = 'PUBLISHED'
  AND NOT (
    NEW.status = 'SUPERSEDED'
    AND NEW.id IS OLD.id
    AND NEW.lesson_id IS OLD.lesson_id
    AND NEW.version_number IS OLD.version_number
    AND NEW.parent_version_id IS OLD.parent_version_id
    AND NEW.content_json IS OLD.content_json
    AND NEW.created_by IS OLD.created_by
    AND NEW.created_at IS OLD.created_at
    AND NEW.published_at IS OLD.published_at
  )
BEGIN
  SELECT RAISE(ABORT, 'lesson_versions: PUBLISHED row is immutable; only status transition to SUPERSEDED is allowed');
END;

CREATE TRIGGER IF NOT EXISTS lesson_versions_published_no_delete
BEFORE DELETE ON lesson_versions
WHEN OLD.status = 'PUBLISHED'
BEGIN
  SELECT RAISE(ABORT, 'lesson_versions: PUBLISHED row cannot be deleted');
END;

CREATE TABLE IF NOT EXISTS pretest_items (
  id TEXT PRIMARY KEY,
  lesson_id TEXT NOT NULL,
  item_no INTEGER NOT NULL,
  stem TEXT NOT NULL,
  options_json TEXT NOT NULL,
  correct_option TEXT NOT NULL,
  knowledge_tags_json TEXT,
  CONSTRAINT pretest_items_lesson_fk FOREIGN KEY (lesson_id) REFERENCES lessons(id),
  CONSTRAINT pretest_items_lesson_item_uq UNIQUE (lesson_id, item_no)
) STRICT;

-- 去标识化纪律:本表只允许匿名内部 ID(student_anon_id),绝不存真实姓名/学号。
CREATE TABLE IF NOT EXISTS pretest_responses (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  student_anon_id TEXT NOT NULL,
  selected_option TEXT,
  participated INTEGER NOT NULL DEFAULT 1,
  knowledge_level TEXT,
  experience_profile TEXT,
  submitted_at TEXT NOT NULL,
  CONSTRAINT pretest_responses_item_fk FOREIGN KEY (item_id) REFERENCES pretest_items(id),
  CONSTRAINT pretest_responses_item_student_uq UNIQUE (item_id, student_anon_id)
) STRICT;

CREATE TABLE IF NOT EXISTS runtime_observations (
  id TEXT PRIMARY KEY,
  observation_type TEXT NOT NULL,
  course_id TEXT NOT NULL,
  class_id TEXT NOT NULL,
  lesson_id TEXT NOT NULL,
  stage_id TEXT NOT NULL,
  metric TEXT NOT NULL,
  value REAL NOT NULL,
  unit TEXT,
  numerator REAL NOT NULL,
  denominator REAL NOT NULL,
  calculation_rule TEXT NOT NULL,
  calculation_version TEXT NOT NULL,
  source_record_ids_json TEXT NOT NULL,
  aggregation_level TEXT NOT NULL CONSTRAINT runtime_observations_agg_check CHECK (aggregation_level IN ('individual', 'group', 'course')),
  calculated_at TEXT NOT NULL,
  CONSTRAINT runtime_observations_course_fk FOREIGN KEY (course_id) REFERENCES courses(id),
  CONSTRAINT runtime_observations_class_fk FOREIGN KEY (class_id) REFERENCES class_cohorts(id),
  CONSTRAINT runtime_observations_lesson_fk FOREIGN KEY (lesson_id) REFERENCES lessons(id),
  CONSTRAINT runtime_observations_dedup_uq UNIQUE (metric, lesson_id, aggregation_level, calculation_version)
) STRICT;

CREATE TABLE IF NOT EXISTS knowledge_assets (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CONSTRAINT knowledge_assets_type_check CHECK (type IN ('textbook', 'policy', 'theory', 'case', 'rubric', 'workflow', 'teaching_artifact')),
  title TEXT NOT NULL,
  authority TEXT,
  review_status TEXT NOT NULL DEFAULT 'UNREVIEWED' CONSTRAINT knowledge_assets_review_check CHECK (review_status IN ('UNREVIEWED', 'TEACHER_CONFIRMED', 'EXPERT_CONFIRMED', 'REJECTED')),
  current_version_id TEXT,
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS asset_versions (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL,
  version TEXT NOT NULL,
  effective_date TEXT,
  source_status TEXT NOT NULL DEFAULT 'active' CONSTRAINT asset_versions_source_status_check CHECK (source_status IN ('active', 'superseded', 'withdrawn', 'expired')),
  superseded_by TEXT,
  original_file_hash TEXT,
  original_file_location TEXT,
  parser_name TEXT,
  parser_version TEXT,
  parsed_at TEXT,
  created_at TEXT NOT NULL,
  CONSTRAINT asset_versions_asset_fk FOREIGN KEY (asset_id) REFERENCES knowledge_assets(id),
  CONSTRAINT asset_versions_superseded_by_fk FOREIGN KEY (superseded_by) REFERENCES asset_versions(id),
  CONSTRAINT asset_versions_asset_version_uq UNIQUE (asset_id, version)
) STRICT;

-- 资产版本只增不删:禁止 DELETE。
CREATE TRIGGER IF NOT EXISTS asset_versions_no_delete
BEFORE DELETE ON asset_versions
BEGIN
  SELECT RAISE(ABORT, 'asset_versions: rows are append-only and cannot be deleted');
END;

-- source_status 单向流转:active -> superseded/withdrawn/expired,其余任何状态变更均被拒绝。
CREATE TRIGGER IF NOT EXISTS asset_versions_status_one_way
BEFORE UPDATE ON asset_versions
WHEN NEW.source_status IS NOT OLD.source_status
  AND NOT (OLD.source_status = 'active' AND NEW.source_status IN ('superseded', 'withdrawn', 'expired'))
BEGIN
  SELECT RAISE(ABORT, 'asset_versions: source_status may only transition one-way from active to superseded/withdrawn/expired');
END;

CREATE TABLE IF NOT EXISTS content_blocks (
  id TEXT PRIMARY KEY,
  asset_version_id TEXT NOT NULL,
  block_type TEXT NOT NULL CONSTRAINT content_blocks_type_check CHECK (block_type IN ('heading', 'paragraph', 'policy_article', 'policy_clause', 'table', 'rubric', 'case_context', 'case_task', 'case_action', 'case_result', 'figure_caption', 'unknown')),
  parent_block_id TEXT,
  order_index INTEGER NOT NULL,
  page_index INTEGER,
  page_label TEXT,
  bbox_json TEXT,
  bbox_coordinate_system TEXT NOT NULL DEFAULT 'none',
  content_raw TEXT NOT NULL,
  content_segmented TEXT,
  normalized_text TEXT,
  content_hash TEXT NOT NULL,
  parser_metadata_json TEXT,
  CONSTRAINT content_blocks_asset_version_fk FOREIGN KEY (asset_version_id) REFERENCES asset_versions(id),
  CONSTRAINT content_blocks_parent_fk FOREIGN KEY (parent_block_id) REFERENCES content_blocks(id)
) STRICT;
