# 实体模型

- 版本:v1.0.0
- 日期:2026-08-03
- 状态:冻结
- 变更注记(2026-08-03):migration `005_teaching_claims_workflow.sql` 为 `teaching_claims` 新增 `workflow_instance_id`(表重建方式);同步约定新审计事件必带 `workflow_instance_id`/entity/actor 维度、`courseId` 入 payload。

本文定义产品内核全部表/对象的字段语义、关系与不可变规则。所有表为 SQLite STRICT 表,经 `server/migrations/` 版本化迁移建立;现有 4 张旧表(`workspace_states` / `audit_events` / `inference_events` / `practice_review_cache`)作为 baseline 纳入,映射关系见 `data-model-mapping.md`。

## 0. ID 前缀与枚举

ID 前缀:`obs_`(RuntimeObservation)、`ev_`(EvidenceReference)、`clm_`(TeachingClaim)、`tdr_`(TeachingDecisionRecord)、`tdec_`(TeacherDecision)、`mrn_`(ModelRun)、`crs_`(course)、`coh_`(class_cohort)、`les_`(lesson)、`lvr_`(lesson_version)、`blk_`(content_block)、`ka_`(knowledge_asset)、`kav_`(asset_version)、`wf_`(workflow_instance)、`agt_`(agent)。stageId 格式 `S1..S9`。

关键枚举:
- `claimType`:`factual_claim` / `diagnostic_inference` / `teaching_recommendation`
- `confidenceStatus`:`confirmed` / `provisional` / `uncertain` / `unsupported`
- `validationStatus`(机械门禁):`PENDING` / `PASSED` / `FAILED` / `WARNING` / `NOT_APPLICABLE`
- `semanticReviewStatus`:`not_reviewed` / `supported` / `partially_supported` / `unsupported` / `uncertain`
- 教师裁决动作(TeacherDecision):`accept` / `revise` / `reject` / `defer`
- TeachingDecisionRecord 裁决状态:`PENDING` / `ACCEPTED` / `REVISED` / `REJECTED` / `DEFERRED`

## 1. 组织结构

### courses(`crs_`)
一门课程。字段:`id`、`name`、`code`、`schema_version`、时间戳。

### class_cohorts(`coh_`)
一个开课班级,外键 `course_id → courses`。个人级运行数据的隔离边界(B12):个人级数据不得跨 cohort 复用。

### lessons(`les_`)
一次课时,外键 `cohort_id → class_cohorts`;含 `stage_id`(`S1..S9`)、课时序号、标题。运行数据不得跨 course 引用(B12)。

### lesson_versions(`lvr_`)
课时的发布版本链。字段:`id`、`lesson_id`、`version_no`、`status`(`DRAFT`/`PUBLISHED`)、`content_json`(含 `schemaVersion`)、时间戳。
- **不可变规则**:`status='PUBLISHED'` 的行由触发器禁止 UPDATE/DELETE(B1)。
- S1 发布 = 新建一行 `status='PUBLISHED'` 的版本,`content_json` 存 S1 结构化产物;不单独建 `stage_artifacts` 表,复用本版本链与不可变触发器。

## 2. 运行数据(事实侧)

### pretest_items
前测题目,外键 `lesson_id`(或课程级题库)。字段:题干、题型、标准答案/评分规则、`schema_version`。

### pretest_responses
学生前测作答。**去标识化:只存 `student_anon_id`,不存任何可识别身份信息**(见 `security-and-privacy.md`)。字段:`id`、`item_id → pretest_items`、`cohort_id`、`student_anon_id`、`response_json`、得分。

### runtime_observations(`obs_`)
可重算的学情事实。字段:`id`、`lesson_id`、`metric`、`aggregation_level`(`individual`/`cohort`/`lesson`)、`student_anon_id`(仅个人级)、`value`、`numerator`、`denominator`、`calculation_rule`、`calculation_version`、`source_hash`、`computed_at`。
- `UNIQUE(metric, lesson_id, aggregation_level, calculation_version)` 保证幂等(B7);
- 任何时刻可按 `calculation_rule` + `calculation_version` 从 `pretest_responses` 等原始数据重算同一值。

## 3. 知识资产(知识侧)

### knowledge_assets(`ka_`)
一份知识资产(教材、指南、法规文件等)。字段:`id`、`title`、`asset_type`、当前版本指针、元数据。

### asset_versions(`kav_`)
资产的版本链。字段:`id`、`asset_id`、`version_no`、`source_hash`(原文哈希)、`file_ref`(原始文件定位,不内嵌文件本体)、`parser_id`/`parser_version`(来自 DocumentParser 契约)、`supersedes`(指向前一版本)、状态。
- **不可变规则**:不可删除,演进只能新增版本并维护 supersede 链(B3)。

### content_blocks(`blk_`)
资产版本切分出的内容块(页/段/表),外键 `asset_version_id`。字段:`block_type`、`page_index`、`page_label`、`text_raw`、`text_normalized`、`bbox`、`bbox_coordinate_system`(默认 `'none'`,第一版 bbox 可空)、`reading_order`。

## 4. 决策与证据(核心侧)

### teaching_claims(`clm_`)
一条教学断言。字段:`id`、`workflow_instance_id`(**由 migration 005 引入**,TEXT NOT NULL + FK → `workflow_instances(id)`,轮次归属一等列;教师修订 claim 经 supersede 继承原轮次)、`claim_type`、`statement`(**不可改**,B2)、`confidence_status`、`scope_json`(course/cohort/lesson 范围)、`supersedes`(指向被修正的旧 claim)、`schema_version`。
- claimType 决定证据要求:`factual_claim` 必须锚定知识资产逐字引用;`diagnostic_inference` 必须绑定 observation;`teaching_recommendation` 两类证据均可。

### teaching_decisions(`tdr_`,TeachingDecisionRecord)
本轮核心对象。一次 S1 教学决策记录,字段:`id`、`workflow_instance_id`、`lesson_id`、`claim_id → teaching_claims`、`model_run_id → model_runs`、`validation_status`、`semantic_review_status`、教师裁决状态(`PENDING`/`ACCEPTED`/`REVISED`/`REJECTED`/`DEFERRED`)、`schema_version`。
- 教师裁决是记录上的状态,不是主工作流终态;
- `REJECTED`/`DEFERRED` 的记录不得进入发布产物(B9)。

### teacher_decisions(`tdec_`,TeacherDecision)
教师裁决动作,**追加式**(B5)。字段:`id`、`teaching_decision_id → teaching_decisions`、`action`(`accept`/`revise`/`reject`/`defer`)、`revised_statement`(仅 revise,原文保留于 claim)、`rationale`、`actor_id`、`schema_version`、时间戳。教师改变裁决 = 追加新行,TDR 上状态指针更新,历史全保留。

### evidence_links
TeachingClaim ↔ EvidenceReference 的多对多绑定。字段:`id`、`claim_id`、证据定位(`asset_version_id` + `content_block_id` 或 `runtime_observation_id`)、`verbatim_quote`、`quote_hash`、`page_index`、`page_label`、`schema_version`。
- `verbatim_quote` 必须在来源文本中逐字存在(机械门禁校验);
- 金标准锚定纪律同样适用:锚 `documentId + sourceVersion + pageIndex/pageLabel + verbatimQuote + quoteHash`,不锚 `contentBlockId` 作永久锚。

## 5. 运行与治理

### model_runs(`mrn_`)
一次模型运行的领域记录,**只增不改**(B4)。字段:`id`、`workflow_instance_id`、`provider_id`、`model_id`、`thinking_mode`/`reasoning_effort`(可选,契约不规定开关策略)、`prompt_version`、`input_hash`、`output_ref`、`latency_ms`、`token_usage_json`、`schema_version`。
- 与旧 `inference_events` 并存:后者是轻量日志,本表是领域记录(见 `data-model-mapping.md`)。

### workflow_instances(`wf_`)
S1 主工作流实例。字段:`id`、`lesson_id`、`stage_id='S1'`、`current_state`、`state_version`(乐观锁)、`state_machine_version`、时间戳。
- 状态只能经 `transitionWorkflow(instanceId, action, actorContext)` 变更(B8);
- `state_machine_version` 记录创建时的状态机版本,转移按该版本校验。

### audit_events(扩展既有表)
在旧 `audit_events` 4 列基础上加列:`actor_type`、`actor_id`、`entity_type`、`entity_id`、`workflow_instance_id`、`previous_state`、`next_state`、`payload_json`、`event_hash`、`schema_version`。追加式,触发器禁止 UPDATE/DELETE(B5)。
- 维度纪律(migration 005 起):新事件必带 `workflow_instance_id`(工作流上下文内)、entity、actor,`schema_version='1.0.0'`;能拿到 course_id 的事件把 `courseId` 放入 `payload_json`(不新增列)。005 之前缺失维度的旧行不回填,保持原样。

## 6. 关系总览

```
courses 1─n class_cohorts 1─n lessons 1─n lesson_versions
lessons 1─n pretest_items 1─n pretest_responses
lessons 1─n runtime_observations
lessons 1─n workflow_instances 1─n teaching_claims ─n evidence_links ─→ asset_versions / runtime_observations
knowledge_assets 1─n asset_versions 1─n content_blocks
teaching_claims 1─n teaching_decisions 1─n teacher_decisions(追加)
teaching_claims n─1 model_runs;workflow_instances 1─n model_runs
workflow_instances 1─n audit_events
```

## 7. 运行数据 vs 知识资产的分离原则

- **运行数据**(pretest_responses、runtime_observations)是当班当课产生的事实:**不进向量库、不做切块索引**;FTS 表若建也只是派生索引,不是事实源;
- **知识资产**(knowledge_assets / asset_versions / content_blocks)是可版本化、可 supersede 的引用材料,可切块、可建派生检索索引;
- 两类数据**统一可绑定** EvidenceReference / evidence_links,作为 TeachingClaim 的证据;绑定时必须满足 scope 一致(B12)与 superseded 误用检查(B11)。
