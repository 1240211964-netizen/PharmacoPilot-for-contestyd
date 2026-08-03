-- migrations:foreign-keys-off
-- 005_teaching_claims_workflow.sql
-- 用途:给 teaching_claims 补 workflow_instance_id TEXT NOT NULL + 外键 -> workflow_instances(id),
--   让 claim 的工作流轮次归属成为一等列(此前只能经 model_runs.workflow_id / supersedes 链递归推导,
--   多轮分析并存时查询复杂且易错,见 docs/product-core/implementation-report.md §9 HIGH #1)。
--
-- 为何用表重建而非 ALTER:SQLite 的 ALTER TABLE ADD COLUMN 既不能加 NOT NULL 列(无非 NULL 默认值
--   时不允许),也不能新增外键约束。唯一合规路径是 SQLite 官方 12 步表重建:
--   建新表 -> 拷贝 -> drop 旧表 -> rename -> 重建索引与触发器。
--
-- 外键处理(文件首行标记的含义):drop 被 evidence_links / 自引用外键引用的旧表必须先关闭
--   foreign_keys,而 PRAGMA foreign_keys 在事务内是 no-op(SQLite 限制);因此 runner
--   (server/migrations.mjs)识别首行标记,在 BEGIN 之前 PRAGMA foreign_keys = OFF、
--   COMMIT/ROLLBACK 之后恢复 ON。FK 关闭窗口仅限本 migration 的执行期。
--   FK 关闭期间的引用完整性由本文件自行保证:
--   - 回填守卫触发器:workflow 不可解析(含回填值在 workflow_instances 中不存在的幽灵引用)
--     的旧行在拷贝时 RAISE(ABORT),整个 migration 失败回滚;
--   - 其余列逐字拷贝(id 不变),全部既有外键/检查约束原样重建,引用关系不发生任何变化;
--   - 配套测试(server/migration-005.test.mjs)在迁移后执行 PRAGMA foreign_key_check 验证。
--
-- 失败保护:runner 在单事务(BEGIN IMMEDIATE ... COMMIT)内执行本文件,任何一步失败即整体
--   ROLLBACK,数据库保持迁移前原状;绝不静默丢数据。
--
-- 回填规则(逐行解析 workflow_instance_id,按优先级取第一个可解析来源):
--   1. created_from_model_run_id -> model_runs.workflow_id(规则/模型生成的 claim);
--   2. 经 teaching_decisions 的三个 claim 引用 JSON 字段(observation_claim_ids_json /
--      inference_claim_ids_json / recommendation_claim_ids_json)反查,取引用该 claim 的
--      最早一条 TDR 的 workflow_instance_id(教师修订 claim 的 created_from_model_run_id 为 NULL,
--      走此路径);
--   3. 解析结果必须真实存在于 workflow_instances(否则视为幽灵引用,同不可解析处理);
--   4. 仍无法解析的行:迁移期守卫触发器 teaching_claims_workflow_backfill_guard 在拷贝时
--      RAISE(ABORT),整个 migration 抛错中止并回滚,绝不丢数据。
--      (当前生产库 teaching_claims 为 0 行,校验预期通过。)
--
-- 审计旧行不回填:audit_events 是追加式日志(003 触发器禁 UPDATE/DELETE),历史事件中
--   缺失 workflow_instance_id 的旧行保持原样;005 之后由服务层保证新事件的
--   workflow_instance_id / entity / actor / schema_version 维度齐全(见 server/product-core/audit.mjs)。

-- 新表:002 原结构 + workflow_instance_id TEXT NOT NULL REFERENCES workflow_instances(id)。
-- 全部 CHECK/外键/默认值与 002 逐一对齐;statement 不可变触发器在 rename 后原样重建。
CREATE TABLE teaching_claims_new (
  id TEXT PRIMARY KEY,
  claim_type TEXT NOT NULL CONSTRAINT teaching_claims_type_check CHECK (claim_type IN ('factual_claim', 'diagnostic_inference', 'teaching_recommendation')),
  statement TEXT NOT NULL,
  stage_id TEXT NOT NULL,
  target_stage_id TEXT,
  course_id TEXT NOT NULL,
  class_id TEXT NOT NULL,
  lesson_id TEXT NOT NULL,
  workflow_instance_id TEXT NOT NULL,
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
  CONSTRAINT teaching_claims_workflow_fk FOREIGN KEY (workflow_instance_id) REFERENCES workflow_instances(id),
  CONSTRAINT teaching_claims_supersedes_fk FOREIGN KEY (supersedes_claim_id) REFERENCES teaching_claims(id)
) STRICT;

-- 迁移期守卫:workflow 不可解析的旧行在拷贝时立即中止(比 NOT NULL 约束给出更可读的错误)。
-- 拷贝完成后即删除,不留在最终 schema 里。
CREATE TRIGGER teaching_claims_workflow_backfill_guard
BEFORE INSERT ON teaching_claims_new
WHEN NEW.workflow_instance_id IS NULL
BEGIN
  SELECT RAISE(ABORT, '005_teaching_claims_workflow: 存在无法解析 workflow_instance_id 的旧 claim,迁移中止并回滚,未改动任何数据');
END;

-- 拷贝 + 回填(回填规则见文件头注释);最外层 SELECT 同时校验回填值真实存在于 workflow_instances。
INSERT INTO teaching_claims_new(
  id, claim_type, statement, stage_id, target_stage_id, course_id, class_id, lesson_id,
  workflow_instance_id, confidence_status, validation_status, mechanical_report_json,
  semantic_review_status, semantic_report_json, created_by, created_from_model_run_id,
  supersedes_claim_id, superseded_by, created_at
)
SELECT
  c.id, c.claim_type, c.statement, c.stage_id, c.target_stage_id, c.course_id, c.class_id, c.lesson_id,
  (SELECT wi.id FROM workflow_instances wi WHERE wi.id = COALESCE(
    (SELECT mr.workflow_id FROM model_runs mr WHERE mr.id = c.created_from_model_run_id),
    (SELECT td.workflow_instance_id FROM teaching_decisions td
      WHERE EXISTS (SELECT 1 FROM json_each(td.observation_claim_ids_json) je WHERE je.value = c.id)
         OR EXISTS (SELECT 1 FROM json_each(td.inference_claim_ids_json) je WHERE je.value = c.id)
         OR EXISTS (SELECT 1 FROM json_each(td.recommendation_claim_ids_json) je WHERE je.value = c.id)
      ORDER BY td.created_at, td.id LIMIT 1)
  )),
  c.confidence_status, c.validation_status, c.mechanical_report_json,
  c.semantic_review_status, c.semantic_report_json, c.created_by, c.created_from_model_run_id,
  c.supersedes_claim_id, c.superseded_by, c.created_at
FROM teaching_claims c;

DROP TRIGGER teaching_claims_workflow_backfill_guard;

DROP TABLE teaching_claims;
ALTER TABLE teaching_claims_new RENAME TO teaching_claims;

-- 重建索引:teaching_claims_lesson_type 由 004 创建、随 drop 旧表被连带删除,原样重建;
-- 另新增 workflow 维度两个索引。
CREATE INDEX teaching_claims_lesson_type ON teaching_claims(lesson_id, claim_type);
CREATE INDEX teaching_claims_workflow ON teaching_claims(workflow_instance_id);
CREATE INDEX teaching_claims_workflow_type ON teaching_claims(workflow_instance_id, claim_type);

-- 原样重建 002 的不可变触发器:statement 一经写入禁止修改。
CREATE TRIGGER teaching_claims_statement_immutable
BEFORE UPDATE ON teaching_claims
WHEN NEW.statement IS NOT OLD.statement
BEGIN
  SELECT RAISE(ABORT, 'teaching_claims: statement is immutable; insert a new claim and link it via supersedes_claim_id');
END;
