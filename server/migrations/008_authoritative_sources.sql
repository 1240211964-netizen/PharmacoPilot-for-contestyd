-- 008_authoritative_sources.sql
-- 用途:权威来源统一权限登记与三层知识对象的 DB 层(配套
--   docs/knowledge-base/organization-design-authoritative-sources-manifest.json 与
--   server/product-core/kb-authoritative-ingest.mjs):
--   - kb_source_permissions:每个已入库权威来源一行的权限登记(五类操作授权 + 权限状态),
--     source_id 即 knowledge_assets.id(同源同 ID,FK 强制资产必须先存在);
--   - kb_chapter_sources:来源按 layer(theory/pharma_context/company_fact)挂到课程/章;
--   - kb_pharma_context_units / kb_company_fact_units:行业情境层与公司事实层的 L2 单元
--     (与 006 kb_knowledge_units 同构:statement 不可改 + supersedes 链 + 四态审核),
--     各自经 *_fragments 关联表挂 ≥1 个 content_blocks 来源片段;
--   - kb_unit_relations:跨层单元关系(理论→情境→事实),证据可锚到 content_blocks;
--   - kb_evidence_gaps:证据缺口登记(pending_source 题逐条建 gap,解决后流转 status)。
--
-- 不改动 000–007 已冻结对象:本文件只 CREATE 新表/索引/触发器,无 ALTER、无表重建,
--   故不使用 `-- migrations:foreign-keys-off` 标记。
-- 失败保护:runner 在单事务内执行本文件,任何一步失败即整体 ROLLBACK,数据库保持迁移前原状。
--
-- 四态 review_status 与 006 对齐:('machine_extracted','teacher_verified','needs_review','rejected')。
-- statement 不可改纪律同 006:修正必须新建单元并接 supersedes 链;review_status 由服务层流转并审计。

-- 来源权限登记:一行一来源,五类操作授权以 INTEGER 0/1 落库(默认 0 = default-deny)。
-- permission_status 四态:pending_teacher_confirmation(默认)/confirmed/reference_only/rejected;
-- 状态变更由服务层执行并审计(permission_updated_by/at 留痕),DB 层不加触发器强制。
CREATE TABLE kb_source_permissions (
  source_id TEXT PRIMARY KEY,
  canonical_url TEXT,
  authority_level INTEGER NOT NULL CONSTRAINT kb_source_permissions_authority_check CHECK (authority_level IN (1, 2)),
  deterministic_parsing_allowed INTEGER NOT NULL DEFAULT 0,
  lexical_indexing_allowed INTEGER NOT NULL DEFAULT 0,
  llm_input_allowed INTEGER NOT NULL DEFAULT 0,
  embedding_allowed INTEGER NOT NULL DEFAULT 0,
  public_redistribution_allowed INTEGER NOT NULL DEFAULT 0,
  permission_basis TEXT,
  permission_status TEXT NOT NULL DEFAULT 'pending_teacher_confirmation' CONSTRAINT kb_source_permissions_status_check CHECK (permission_status IN ('pending_teacher_confirmation', 'confirmed', 'reference_only', 'rejected')),
  permission_updated_by TEXT,
  permission_updated_at TEXT,
  CONSTRAINT kb_source_permissions_source_fk FOREIGN KEY (source_id) REFERENCES knowledge_assets(id)
) STRICT;

CREATE INDEX kb_source_permissions_status ON kb_source_permissions(permission_status);

-- 来源-章归属:同一资产可挂多个课程/章;layer 决定该来源在本章知识三层中的位置。
-- course_id/chapter_id 是知识范围标识,有意不加 FK(同 006 kb_knowledge_units 的纪律)。
CREATE TABLE kb_chapter_sources (
  course_id TEXT NOT NULL,
  chapter_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  layer TEXT NOT NULL CONSTRAINT kb_chapter_sources_layer_check CHECK (layer IN ('theory', 'pharma_context', 'company_fact')),
  priority INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT kb_chapter_sources_pk PRIMARY KEY (course_id, chapter_id, asset_id),
  CONSTRAINT kb_chapter_sources_asset_fk FOREIGN KEY (asset_id) REFERENCES knowledge_assets(id)
) STRICT;

CREATE INDEX kb_chapter_sources_chapter ON kb_chapter_sources(chapter_id, layer);

-- 行业情境层 L2 单元:医药行业监管/标准对组织设计的情境约束表述(条款级)。
-- industry_stage 覆盖产业链环节;aspect 为自由文本(如 mah_responsibility/quality_unit_independence/
-- qualified_person/dtc_committee/prescription_review/pharmacovigilance/vbp_coordination 等,
-- 取值词表由服务层维护,DB 不加 CHECK 以免频繁重建表)。
-- regulator_context 记录发文机关/文号/条款号等定位信息。
CREATE TABLE kb_pharma_context_units (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL,
  chapter_id TEXT NOT NULL,
  industry_stage TEXT NOT NULL CONSTRAINT kb_pharma_context_units_stage_check CHECK (industry_stage IN ('rd', 'production', 'distribution', 'use', 'cross_stage')),
  aspect TEXT NOT NULL,
  statement TEXT NOT NULL,
  regulator_context TEXT,
  review_status TEXT NOT NULL DEFAULT 'machine_extracted' CONSTRAINT kb_pharma_context_units_review_check CHECK (review_status IN ('machine_extracted', 'teacher_verified', 'needs_review', 'rejected')),
  supersedes_unit_id TEXT,
  superseded_by TEXT,
  schema_version TEXT NOT NULL DEFAULT '1.0.0',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CONSTRAINT kb_pharma_context_units_supersedes_fk FOREIGN KEY (supersedes_unit_id) REFERENCES kb_pharma_context_units(id)
) STRICT;

-- statement 不可改:修正必须新建单元并接 supersedes 链(仿 006 kb_knowledge_units 先例)。
CREATE TRIGGER kb_pharma_context_units_statement_immutable
BEFORE UPDATE ON kb_pharma_context_units
WHEN NEW.statement IS NOT OLD.statement
BEGIN
  SELECT RAISE(ABORT, 'kb_pharma_context_units: statement is immutable; insert a new unit and link it via supersedes_unit_id');
END;

CREATE INDEX kb_pharma_context_units_chapter ON kb_pharma_context_units(chapter_id);
CREATE INDEX kb_pharma_context_units_stage ON kb_pharma_context_units(industry_stage);
CREATE INDEX kb_pharma_context_units_aspect ON kb_pharma_context_units(aspect);

-- 情境单元→来源片段:每个单元必须挂 ≥1 个 content_blocks 片段(服务层强制,DB 层提供关联与 FK)。
CREATE TABLE kb_pharma_context_fragments (
  unit_id TEXT NOT NULL,
  fragment_id TEXT NOT NULL,
  CONSTRAINT kb_pharma_context_fragments_pk PRIMARY KEY (unit_id, fragment_id),
  CONSTRAINT kb_pharma_context_fragments_unit_fk FOREIGN KEY (unit_id) REFERENCES kb_pharma_context_units(id),
  CONSTRAINT kb_pharma_context_fragments_fragment_fk FOREIGN KEY (fragment_id) REFERENCES content_blocks(id)
) STRICT;

CREATE INDEX kb_pharma_context_fragments_fragment ON kb_pharma_context_fragments(fragment_id);

-- 公司事实层 L2 单元:企业披露文件中的组织事实(年报/10-K 等,公司+报告期定位)。
-- case_candidate=1 表示可作为教学案例候选;只允许教师审核后置位(服务层控制 + 审计),
-- DB 层仅约束 0/1 取值。
CREATE TABLE kb_company_fact_units (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL,
  chapter_id TEXT NOT NULL,
  company TEXT NOT NULL,
  report_period TEXT NOT NULL,
  fact_type TEXT NOT NULL CONSTRAINT kb_company_fact_units_type_check CHECK (fact_type IN ('business_segment', 'org_hierarchy', 'governance', 'subsidiary', 'regional_structure', 'rd_organization', 'manufacturing_quality', 'distribution_network', 'internal_control', 'risk', 'incentive', 'org_change')),
  statement TEXT NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'machine_extracted' CONSTRAINT kb_company_fact_units_review_check CHECK (review_status IN ('machine_extracted', 'teacher_verified', 'needs_review', 'rejected')),
  case_candidate INTEGER NOT NULL DEFAULT 0 CONSTRAINT kb_company_fact_units_case_candidate_check CHECK (case_candidate IN (0, 1)),
  supersedes_unit_id TEXT,
  superseded_by TEXT,
  schema_version TEXT NOT NULL DEFAULT '1.0.0',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CONSTRAINT kb_company_fact_units_supersedes_fk FOREIGN KEY (supersedes_unit_id) REFERENCES kb_company_fact_units(id)
) STRICT;

-- statement 不可改(同 kb_pharma_context_units 纪律)。
CREATE TRIGGER kb_company_fact_units_statement_immutable
BEFORE UPDATE ON kb_company_fact_units
WHEN NEW.statement IS NOT OLD.statement
BEGIN
  SELECT RAISE(ABORT, 'kb_company_fact_units: statement is immutable; insert a new unit and link it via supersedes_unit_id');
END;

CREATE INDEX kb_company_fact_units_company ON kb_company_fact_units(company);
CREATE INDEX kb_company_fact_units_type ON kb_company_fact_units(fact_type);
CREATE INDEX kb_company_fact_units_review_status ON kb_company_fact_units(review_status);

-- 公司事实单元→来源片段(同 kb_pharma_context_fragments 纪律)。
CREATE TABLE kb_company_fact_fragments (
  unit_id TEXT NOT NULL,
  fragment_id TEXT NOT NULL,
  CONSTRAINT kb_company_fact_fragments_pk PRIMARY KEY (unit_id, fragment_id),
  CONSTRAINT kb_company_fact_fragments_unit_fk FOREIGN KEY (unit_id) REFERENCES kb_company_fact_units(id),
  CONSTRAINT kb_company_fact_fragments_fragment_fk FOREIGN KEY (fragment_id) REFERENCES content_blocks(id)
) STRICT;

CREATE INDEX kb_company_fact_fragments_fragment ON kb_company_fact_fragments(fragment_id);

-- 跨层单元关系:from/to 指向三层(theory=kb_knowledge_units,pharma_context=kb_pharma_context_units,
-- company_fact=kb_company_fact_units)中某一层的单元 id。from_unit_id/to_unit_id 不加 FK:
-- 单元 id 分属三张表,单列表无法表达跨表外键,引用完整性由服务层校验。
-- evidence_fragment_id 可锚定支持该关系的来源片段;UNIQUE 防同三元组重复。
CREATE TABLE kb_unit_relations (
  id TEXT PRIMARY KEY,
  from_layer TEXT NOT NULL CONSTRAINT kb_unit_relations_from_layer_check CHECK (from_layer IN ('theory', 'pharma_context', 'company_fact')),
  from_unit_id TEXT NOT NULL,
  relation_type TEXT NOT NULL CONSTRAINT kb_unit_relations_type_check CHECK (relation_type IN ('prerequisite_of', 'part_of', 'contrasts_with', 'applied_in', 'constrained_by', 'illustrated_by', 'supported_by', 'assessed_by')),
  to_layer TEXT NOT NULL CONSTRAINT kb_unit_relations_to_layer_check CHECK (to_layer IN ('theory', 'pharma_context', 'company_fact')),
  to_unit_id TEXT NOT NULL,
  evidence_fragment_id TEXT,
  review_status TEXT NOT NULL DEFAULT 'needs_review' CONSTRAINT kb_unit_relations_review_check CHECK (review_status IN ('machine_extracted', 'teacher_verified', 'needs_review', 'rejected')),
  schema_version TEXT NOT NULL DEFAULT '1.0.0',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CONSTRAINT kb_unit_relations_evidence_fk FOREIGN KEY (evidence_fragment_id) REFERENCES content_blocks(id),
  CONSTRAINT kb_unit_relations_triple_uq UNIQUE (from_unit_id, relation_type, to_unit_id)
) STRICT;

CREATE INDEX kb_unit_relations_from ON kb_unit_relations(from_unit_id);
CREATE INDEX kb_unit_relations_to ON kb_unit_relations(to_unit_id);
CREATE INDEX kb_unit_relations_type ON kb_unit_relations(relation_type);

-- 证据缺口:检索/评测暴露的来源缺口逐条登记;status open -> resolved/out_of_scope,
-- question_id 可空(缺口也可来自教师标注而非评测题)。
CREATE TABLE kb_evidence_gaps (
  id TEXT PRIMARY KEY,
  question_id TEXT,
  topic TEXT NOT NULL,
  needed_source_type TEXT,
  status TEXT NOT NULL DEFAULT 'open' CONSTRAINT kb_evidence_gaps_status_check CHECK (status IN ('open', 'resolved', 'out_of_scope')),
  resolution_note TEXT,
  created_at TEXT NOT NULL,
  resolved_at TEXT
) STRICT;

CREATE INDEX kb_evidence_gaps_status ON kb_evidence_gaps(status);
