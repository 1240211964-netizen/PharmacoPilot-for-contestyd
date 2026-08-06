# Management Principles Teaching Orchestration P2A 基础报告

## 最终判定

`CH06_P2A_ORCHESTRATION_FOUNDATION_BLOCKED`

## 已完成

- 保留 P1 tag 与既有 CH06 P2 BLOCKED 历史；P2A 在隔离分支
  `feat/teaching-orchestration-p2a` 从 `eb6db1c746…` 施工。
- 提交 `42cc9e3`：开工审计，明确现有 S1 / evidence / audit / version 可复用边界。
- 提交 `28cda23`：migration `011`、S2—S9 专属 workflow 实体、追加式迁移事件、候选、
  不可变设计版本、字段级四态 fixture 裁决、simulation run/event/critical moment、S8 和 S9 candidate。
- 新增无 DOM / 无 global / 显式 seed 的纯确定性仿真 contracts、RNG、engine、关键时刻 detector。
  它不读取 localStorage、计时器或课程 SQLite，且不把 SWOT 规则伪装成 CH06。
- fixture 黄金路径实际执行：S1 fixture → evidence fixture → S2—S7 fixture candidate → 四种裁决
  → approved v1 → deterministic simulation → 有事件证据的 critical moment → S8 → approved v2 → S9 candidate。
- `npm run check` 通过：265 后端测试、现有前端门禁和浏览器 smoke 全绿；无 LLM/Embedding 调用。

## 仍未满足的强制门禁

1. 尚未把 `TeachingWorkflow` / `SimulationInput` 等全部契约接入 AJV schema 目录；当前服务层为
   确定性输入守卫，不能宣称“每个 API 均已 schema validation”。
2. 尚未将服务接入 `/api/product-core/teaching-workflows` 路由；因此不存在满足 actor、HTTP 幂等、
   重启后 API 读取的正式后端接口。
3. 现有 SWOT 浏览器页面仍直接消费旧 `window.MVCore`，尚未完成同一内核的浏览器 adapter；
   因此不能宣称浏览器与后端已使用同一个 ruleset。
4. 尚未完成一个新干净 checkout 的 P2A 专项验收（含独立 `npm ci`、P2A fixture、restart recovery、
   无模型调用及 KB 哈希复核）。

这些不是可以通过降低门槛绕过的事项。特别是 API 与浏览器 adapter 未完成前，不能创建真实 CH06
P2B workflow、不能产生真实教师裁决或真实虚拟试教。

## 版本、审计与风险

版本链在 fixture 数据库中为 `v1 → simulation run → S8 → v2 → S9(candidate)`；设计版本、
裁决和 workflow event 均由数据库触发器禁止更新/删除，关键时刻外键绑定 simulation event。
全局 `audit_events` 被用于 workflow 创建与状态迁移，未建立平行审计日志。

风险是当前服务实现尚未成为 HTTP/Schema 受控的产品面；同时 migration `011` 尚未通过包含旧库升级的
专项 migration 测试。P2B 不允许恢复，直至上述四项完成。
