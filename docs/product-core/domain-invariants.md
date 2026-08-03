# 领域不变量(17 条)

- 版本:v1.0.0
- 日期:2026-08-03
- 状态:冻结

本文列出产品内核必须始终成立的 17 条不变量:12 条业务不变量(B1-B12)+ 5 条 schema 版本纪律(S1-S5)。每条注明落实层(DB 约束 / 触发器 / 服务层 / 测试);无法用 DB 直接落实的,给出替代方案。

## 1. 业务不变量(B1-B12)

### B1 已发布课时版本不可变
`lesson_versions` 中 `status = 'PUBLISHED'` 的行不得 UPDATE、不得 DELETE。
- 落实层:**DB 触发器**(`BEFORE UPDATE/DELETE` 当 `OLD.status='PUBLISHED'` 时 `RAISE(ABORT, 'IMMUTABLE_RECORD')`)+ 测试。

### B2 TeachingClaim 的 statement 不可改,修正走 supersede 链
`teaching_claims.statement` 一经写入不得修改;内容修正只能新建一行 claim 并令新行 `supersedes` 指向旧行,旧行保留。
- 落实层:**DB 触发器**(禁止 UPDATE `statement` 列)+ 服务层(supersede 服务函数)+ 测试。

### B3 asset_versions 不可删,演进走 supersede 链
知识资产的每个版本行(`asset_versions`)不得删除;资产更新只能新增版本并维护 supersede 链。
- 落实层:**DB 触发器**(禁止 DELETE,禁止 UPDATE 内容列)+ 服务层 + 测试。

### B4 model_runs 只增不改
`model_runs` 记录一次模型运行的完整上下文,只 INSERT,不 UPDATE、不 DELETE。
- 落实层:**DB 触发器**(禁止 UPDATE/DELETE)+ 测试。

### B5 teacher_decisions 与 audit_events 追加式
`teacher_decisions`(教师裁决)与 `audit_events`(审计事件)只 INSERT;`audit_events` 由触发器禁止 UPDATE/DELETE。
- 落实层:**DB 触发器**(`audit_events` 强制)+ 服务层(`teacher_decisions` 无更新路径)+ 测试。
- 说明:`teacher_decisions` 的"追加式"同时由触发器禁止 UPDATE/DELETE 落实,与 `audit_events` 同级;教师改变裁决 = 追加一条新 TeacherDecision,TeachingDecisionRecord 上的裁决状态指针更新,历史裁决全部保留。

### B6 每条 TeachingClaim 必须绑定证据
任何 TeachingClaim 进入发布产物前,必须经 `evidence_links` 绑定至少一条 EvidenceReference,且机械门禁的"证据绑定"校验通过。
- 落实层:**服务层**(机械门禁校验 14 条之一)+ **测试**。
- 无法 DB 落实的说明:证据有效性依赖来源存在、版本未 superseded、逐字引用匹配等运行时语义,不是外键能表达的;由机械门禁确定性校验兜底,DB 仅保证 `evidence_links` 外键完整。

### B7 RuntimeObservation 统计可重算且幂等
`runtime_observations` 每行必须带 `numerator / denominator / calculation_rule / calculation_version`,任何时刻可按规则从原始数据重算得到同一值;写入受 `UNIQUE(metric, lesson_id, aggregation_level, calculation_version)` 约束,重复计算产生幂等结果而非重复行。
- 落实层:**DB 约束**(UNIQUE + NOT NULL)+ 服务层(重算器)+ 测试(重算一致性用例)。

### B8 工作流状态只能经状态机服务转移,并发受乐观锁保护
`workflow_instances.current_state` 只能由 `transitionWorkflow(instanceId, action, actorContext)` 变更;路由层与任何其他服务不得直接写状态字段;转移必须携带 `state_version` 做乐观锁,冲突即失败。
- 落实层:**服务层**(唯一转移入口)+ **DB**(state_version 条件更新)+ **测试**(并发冲突用例、非法直写扫描)。
- 无法 DB 落实的说明:"只有状态机服务能写状态"是架构纪律,DB 无法区分调用方;以代码评审 + 测试(路由层不出现裸 UPDATE `workflow_instances.current_state` 的静态扫描)替代。

### B9 发布前每条 TeachingDecisionRecord 必须有教师终态裁决,REJECTED/DEFERRED 不进产物
进入 `TEACHER_REVIEW → PUBLISHED` 转移时,本次发布覆盖的每条 TeachingDecisionRecord 的裁决状态必须为 `ACCEPTED` 或 `REVISED`;`PENDING` 阻断发布(`PUBLISH_NO_TEACHER_DECISION`),`REJECTED`/`DEFERRED` 的记录不得出现在发布产物中(`PUBLISH_REJECTED_CONTENT`)。
- 落实层:**服务层**(publish 前置校验)+ **测试**。
- 无法 DB 落实的说明:发布产物是新生成的 `lesson_versions.content_json`,其内容断言无法在触发器内做跨表语义校验;由状态机 publish 动作的前置条件保证。

### B10 教师修订必须保留原文
教师对 claim 的修改(`revise`)不得覆盖原 statement:修订内容存于新 claim(supersede 链)与对应 TeacherDecision 记录中,机器生成的原文永久可查。
- 落实层:**DB 触发器**(复用 B2)+ 服务层 + 测试。

### B11 superseded 来源不得作为唯一证据进入发布产物
若某条 claim 的全部证据来源(`asset_versions` / 运行数据快照)均已被 supersede,则该 claim 不得进入发布产物。
- 落实层:**服务层**(机械门禁"superseded 误用"校验 + publish 前置)+ **测试**。

### B12 运行数据的作用域隔离
个人级运行数据(`pretest_responses`、个人级 `runtime_observations`)不得跨班级(`class_cohorts`)复用;任何运行数据不得跨课程(`courses`)引用;`evidence_links` 指向运行数据时,其 scope 必须与 claim 所属 lesson 的 course/cohort 一致。
- 落实层:**服务层**(机械门禁"scope 一致"校验)+ **测试**。
- 无法 DB 落实的说明:scope 一致性是跨表语义规则,外键只能保证引用存在,由门禁校验兜底。

## 2. schema 版本纪律(S1-S5)

### S1 跨层 JSON 必含 schemaVersion
所有跨层(服务间、DB 存取、前后端)传递的结构化 JSON 对象必须含 `schemaVersion` 字段,取值语义化版本(当前六个 v1 schema 均为 `"1.0.0"`)。
- 落实层:**测试**(schema 校验 + fixture 断言)+ 服务层(写入前校验)。

### S2 非兼容变更必须升主版本
对 schema 做任何非兼容变更(见 `schema-versioning.md` §3 定义)必须升主版本(如 `1.x` → `2.0.0`),不得在原版本上原地修改。
- 落实层:**流程纪律** + 测试(新旧 schema 文件共存校验)。

### S3 任何变更必须附迁移说明与兼容策略
每次 schema 或表结构变更必须附:变更内容、非兼容点、数据迁移路径、读写兼容策略(模板见 `schema-versioning.md` §5)。
- 落实层:**流程纪律**(随 migration 文件与 schema PR 一并提交)+ 文档审查。

### S4 不得不改版本号而改字段语义
同一 `schemaVersion` 下,任何字段的名称、类型、枚举取值、语义不得改变;要改就走 S2 升版。
- 落实层:**测试**(fixture 回归:旧 fixture 在新代码下仍通过对应版本 schema 校验)+ 流程纪律。

### S5 已合入的 migration 不得修改,只能新增
`server/migrations/` 中已合入的 `NNN_name.sql` 文件内容不得修改(由 `schema_migrations` 表记录的 hash 防篡改);修正错误只能新增后续 migration。
- 落实层:**DB**(migration runner 启动时逐文件比对 hash,不符即拒绝启动)+ **测试**。
