# Management Principles Teaching Orchestration P2A 开工审计

## 范围与冻结事实

- 隔离分支：`feat/teaching-orchestration-p2a`
- 隔离基线：`eb6db1c74695ece628b1ef81ba6898b485c90cd2`
- P1 冻结 tag：`management-principles-kb-product-integration-p1`，仍指向
  `9a78dfe963a96199e7af08f79e60f32458615afa`；本轮不移动、不重打该 tag。
- 既有 `CH06_TEACHING_DESIGN_PILOT_BLOCKED` 文档历史保留，且当前 Product Core
  SQLite 中没有可恢复的 CH06 P2 workflow；不得伪造 parent ID。
- 本轮仅实现确定性 fixture 基础设施：不调用 LLM、不调用 Embedding、不读取或修改课程 SQLite。

## 现有能力与可复用模块

| 能力 | 现有实现 | P2A 复用方式 |
| --- | --- | --- |
| S1 状态机、乐观锁与审计 | `server/product-core/workflow.mjs`、`audit.mjs` | 复用 ID、审计事件散列、`BEGIN IMMEDIATE`、错误格式；S2—S9 不复用 S1 的状态枚举。 |
| 教师裁决追加式保存 | `teacher_decisions`、`server/product-core/decisions.mjs` | 复用“原文不可覆盖、修改保留原值、审计追加”的语义；P2A 需要以候选字段为粒度的新关联记录。 |
| 发布版本不可变 | `lesson_versions` 触发器、`publish.mjs` | 复用不可变/ supersede 原则；新增教学设计版本表，不能把 S2—S7 JSON 塞入 S1 lesson version。 |
| 检索运行与证据 | `kb_retrieval_runs`、`evidence_links`、`management-kb-service.mjs` | P2A 仅保存 fixture evidence reference；真实 CH06 P2B 继续使用 P1 正式 evidence package。 |
| 模型运行留痕 | `model_runs`、provider contract | P2A 显式零调用；后续 P2B 可将每个节点模型调用写入该现有表。 |
| Schema / AJV | `schemas/v1*`、`server/product-core/schemas.mjs` | 新增 P2A contract schema，沿用版本路由和严格额外字段拒绝。 |
| Migration | `server/migrations.mjs` | 下一编号为 `011`；旧 migration 不修改，所有新外键/不可变触发器在新 migration 中建立。 |

## 浏览器仿真审计

`shared/mv-classroom-core.js` 包含当前 SWOT 场景的决定性调度、受种子驱动的行为生成和运行时状态；
它在文件末尾以 `window.MVCore` 暴露。`shared/metaverse-classroom.js` 和
`shared/metaverse-classroom-3d.js` 是 DOM / WebGL / 音频 / 定时器 / 本地展示层，
`shared/practice-runtime.js` 则负责 localStorage、卡片和与页面的联动。

- **领域逻辑**：种子串、伪随机生成、角色状态更新、事件节奏、基于事件的关键时刻判读。
- **UI 逻辑**：`window` 暴露、`fetch`、DOM、WebGL、音频、动画、浏览器计时器、localStorage 和 3D 视觉随机性。
- **结论**：可提取一套新的无 DOM、无 global、显式输入/输出/seed 的纯确定性内核；不能把现有
  SWOT 情节直接宣称为 CH06 通用课堂。P2A 将把 SWOT 保留为兼容 scenario adapter，并新建通用
  teaching-scenario contract；不编造 CH06 学生表现。

## 必须新增的模块

1. `TeachingWorkflow` 的 S2—S9 状态机、幂等 transition 事件及恢复查询；
2. 候选、不可变设计版本、字段级教师裁决、仿真 run/event/critical moment、S8、S9 的 Product Core 持久化；
3. 对应 JSON Schema 与 fixture-only 标识；
4. 无浏览器依赖的共享仿真 contracts、RNG、engine 与 critical moment detector；
5. 受同一状态机保护的 Product Core API；
6. 确定性 fixture 黄金路径和重启恢复测试；
7. 浏览器适配层，使现有 SWOT 页面继续消费同一纯内核，而非成为唯一规则来源。

## 数据库与 API 设计

新增 `011_teaching_orchestration.sql`：以 `teaching_workflows` 作为 S2—S9 根实体，
`teaching_workflow_events` 追加式保存合法迁移及 idempotency key。候选、版本、字段裁决、仿真、
关键时刻、S8、S9 全部以 workflow ID 为外键；仿真引用具体 approved 版本，S8 引用关键时刻，
S9 仅能引用 approved v2 且状态固定为 `candidate`。现有 `audit_events` 保持唯一全局审计流，
不建立平行审计表。

API 将以 `/api/product-core/teaching-workflows` 为根，提供创建、S1 context、evidence reference、
candidate、教师裁决、批准、simulation、S8、S9 与读取 run 的等价能力。所有写操作要求 actor、
schema 校验和 idempotency key，并沿用 Product Core 统一错误体。

## 状态机设计

新状态机为专属 `TEACHING_ORCHESTRATION_S2_S9`，覆盖 `INITIALIZED` 至 `COMPLETED`、`BLOCKED`、
`FAILED` 的逐步状态；不允许跳转。S1 context、evidence package、全部 S2—S7 字段、教师审核、
approved v1、completed simulation、有事件证据的 critical moment、S8、approved v2、S9 candidate
各自构成下一步 guard。`REJECTED` / `PENDING_EVIDENCE` 字段级裁决是否阻塞由显式 resolution 记录决定，
不能由前端或默认值静默放行。

## 兼容性风险与不做项

- 迁移必须保留原 S1 `workflow_instances` 的唯一类型约束；P2A 不重建该表。
- 现有 SWOT 3D 视觉层仍含非领域的 `Math.random()`；它不进入共享后端内核，故不影响持久化 run 的可重放性。
- P2A 不做真实 CH06 检索、不发送模型上下文、不生成教案、不创建真实教师裁决或真实虚拟试教。
- P2A 不重做页面 UI；仅提供兼容 adapter 与明确的 local preview / persisted run 边界。
