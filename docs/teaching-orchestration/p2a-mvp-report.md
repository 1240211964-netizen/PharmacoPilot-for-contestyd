# P2A MVP 可运行报告

## 实际跑通链路

`POST /api/product-core/teaching-orchestration/demo/ch06/run` 使用固定、明确标记的
`deterministic_fixture` 完成：workflow → S1 fixture → S2—S7 fixture candidate → 四种教师裁决
→ approved design v1 → deterministic simulation → critical moment → S8 → approved v2 → S9 candidate → COMPLETED。

返回 workflow、v1、simulation、v2、S9 ID 与关键时刻数；
`GET /api/product-core/teaching-orchestration/workflows/:id` 返回工作流、迁移时间线、fixture、候选、
裁决、两个版本、仿真 run/events、关键时刻、S8 与 S9。

## 可见入口

[teaching-orchestration-demo.html](../../teaching-orchestration-demo.html) 提供“运行 CH06 编排演示”按钮、
当前状态、版本链、关键时刻数和可展开的状态时间线。它直接调用上述 API，不重做现有页面。

## 仿真与版本链

固定 seed `ch06-demo-001` 由纯确定性内核生成一条 S5 误解事件，检测为有事件证据的
`MISCONCEPTION` critical moment。版本链为 `design v1 → simulation run → S8 revision → design v2 →
S9(candidate)`；S9 状态受数据库约束，不能发布。

## 测试

`server/teaching-orchestration-api.test.mjs` 实际 POST demo、GET workflow 并校验 COMPLETE、两版设计、
S9 candidate 和 critical moment。模型 client 在测试中抛错，证明路径没有 LLM 调用；没有 Embedding，
也不读取或修改课程 SQLite。`npm run check` 已通过。

## Deferred

全量 AJV schema、细分 REST 资源、教师审核 UI、浏览器/后端统一 SWOT adapter、完整权限/审计字段、
队列并发和完整 clean-worktree 证据延后；它们不影响本 MVP 的可运行纵向闭环。
