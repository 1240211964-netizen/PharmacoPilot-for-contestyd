# 新旧数据模型映射

- 版本:v1.0.0
- 日期:2026-08-03
- 状态:冻结

本文说明既有 4 张表、静态负载与各 JSON 工件在新产品内核中的去向。总策略:**strangler pattern** — 旧接口保留,新功能走 `server/product-core/` 新服务;新旧并存,逐步替换,不做一次性改写。现状依据 `docs/product-core/current-state-audit.md`。

## 1. 映射总表

| 旧对象 | 位置 | 处置 | 说明 |
|---|---|---|---|
| `audit_events`(4 列) | `server/db.mjs:32` | **扩展** | 加列 `actor_type`/`actor_id`/`entity_type`/`entity_id`/`workflow_instance_id`/`previous_state`/`next_state`/`payload_json`/`event_hash`/`schema_version`;加触发器禁止 UPDATE/DELETE;旧写入点(putState → `workspace.state.updated`)保留,新增列对旧事件可空 |
| `inference_events` | `server/db.mjs:43` | **并存,不动** | 轻量推理元数据日志(不记 prompt/回答原文),继续由 `/api/chat`、`/api/practice/generate`、`/api/practice/reviews` 三处写入;新 `model_runs` 是领域记录(完整运行上下文、挂 workflow_instance),二者并存,不做数据回填 |
| `workspace_states` | `server/db.mjs:24` | **不动** | 继续服务演示功能的前端工作区同步(revision 乐观锁),不纳入领域模型 |
| `practice_review_cache` | `server/db.mjs:53` | **不动** | 五路审校缓存(内容哈希键 + sourceRevision/sourceHash/promptVersion 快照)继续服务既有审校路由 |
| `migration/*.json` | `migration/` | **无关,不动** | 是 32 人虚拟班 persona 迭代工件,**与数据库 migration 无关**;新的 DB migration 在 `server/migrations/`,命名空间不冲突 |
| `shared/station*.payload.js` | `shared/` | **不动** | 11 个教学站点的前端展示负载,非事实源;S1 闭环上线后由新 API 供数,展示负载逐步退役(本轮不处理) |
| `shared/virtual-class-agents.json` | `shared/` | **不动** | 32 人虚拟班运行时数据(前端确定性规则驱动),属展示负载;真实前测管道建成后不回填该文件 |

## 2. 细节说明

### 2.1 audit_events 扩展

- 通过新增 migration(`server/migrations/NNN_extend_audit_events.sql`)以 `ALTER TABLE ... ADD COLUMN` 加列;SQLite STRICT 表加列须带默认值或允许 NULL,旧行新列取 NULL;
- 既有语义不变:`putState` 仍写 `workspace.state.updated`,只是新代码路径(S1 工作流、门禁、发布等)写入时填充新列;
- 新加触发器对全表生效:任何 UPDATE/DELETE `audit_events` 均 `RAISE(ABORT,'IMMUTABLE_RECORD')`。

### 2.2 inference_events vs model_runs

- `inference_events`:轻量日志,回答"某个 API 调过一次模型,耗时/成败如何";
- `model_runs`(`mrn_`):领域记录,回答"这次 S1 决策由哪个 provider/model/prompt_version、什么输入哈希、哪次运行产出",被 `teaching_claims` 引用,只增不改(B4);
- 二者键不互通,不做 join 承诺;若未来需要关联,以 `model_runs` 补充记录 `inference_event_id` 的可选列实现(属兼容扩张,升 MINOR)。

### 2.3 旧路由与新服务

既有 8 条路由(`/api/health`、`/api/model/status`、`/api/agents`、`GET/PUT /api/workspaces/:id/state`、`/api/chat`、`/api/practice/generate`、`/api/practice/reviews`)全部保留原行为;S1 闭环新增路由统一走 `server/product-core/` 服务层,复用既有 `HttpError`/`fail()` 错误格式、`authorized()` 鉴权与静态白名单机制。

### 2.4 演示数据的边界

`station*.payload.js` 与 `virtual-class-agents.json` 中的前测/学情数字是写死的演示数据(`shared/evaluation-framework.js:153` 已标注"真实入学前测待接入")。新管道(`pretest_items`/`pretest_responses`/`runtime_observations`)建成后,演示负载不作数据源、不回填、不混用;两者通过 lesson/cohort 标识在未来对接时显式映射,本轮不做。

## 3. 迁移顺序

1. baseline migration:把现有 4 表原样纳入 `schema_migrations`(记录 hash,不改表);
2. 扩展 migration:`audit_events` 加列 + 不可变触发器;
3. 领域 migration:按 `entity-model.md` 建全部新表;
4. 新服务上线,旧路由保持;后续轮次再评估演示负载的退役。
