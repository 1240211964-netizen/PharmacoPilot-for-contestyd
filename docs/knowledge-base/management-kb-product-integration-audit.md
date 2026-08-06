# 《管理学》知识库接入 Product Core · 开工核查

- 工作包：`management-principles-kb-product-integration-p1`
- 核查时间：2026-08-06
- 代码仓库：`/Users/yandilei/Desktop/Pharmaco_副本/pharmaco网页`
- 课程知识库目录：`/Users/yandilei/Desktop/Pharmaco_副本/管理学知识库`
- 课程知识库 SQLite：`/Users/yandilei/Desktop/Pharmaco_副本/管理学知识库/04_index/management_course_kb.sqlite`
- `KB_ZIP`：本机未提供；不得以目录重新打包后冒充原云端 ZIP。

## 1. Git 与现有门禁事实

当前分支为 `feat/teacher-trial-v0.1`，HEAD 为 `a0926d7f9d63bf5a11e128901d78817e3f22c1aa`（`docs(trial): teacher trial guide, operations runbook and safe reset tool`）。

开工时工作区已存在、且不属于本工作包的未提交变更：`package.json`、`s1-workspace.html`、`server/app.mjs`、`server/backend.test.mjs`、`shared/backend-client.js`，以及未跟踪的 `output/`、`outputs/`、`server/health-public.test.mjs`、`tools/verify-api-token-bridge.mjs`。本工作包不回退或覆盖这些变更。

`npm run check` 在开工时失败：前端静态门禁通过，但后端 263 个测试中有 3 个失败（审计视图与 S1 HTTP 端到端闭环均断言 `schemaVersion === "1.0"`，实际返回 `undefined`）。这是当前未提交教师试用变更造成的回归，非课程知识库包导致；在本工作包完成前必须恢复整套门禁为绿。

## 2. 可复用 Product Core 能力

当前最新 migration 为 `009_teachers.sql`。现有迁移已经提供：

- `workflow_instances`、状态机、乐观锁与不可变发布版本；
- `kb_retrieval_runs`（追加式，记录 `query_text`、`filters_json`、`corpus_version_hash`、结果集）；
- `evidence_links`（已可挂 `retrieval_run_id`）；
- `audit_events`（追加式 `event_hash`，统一由 `appendAuditEvent()` 写入）；
- `knowledge-retrieval-service.mjs`、`/api/product-core/kb/retrieve`、检索 run 查询路由；
- 统一 `ProductCoreError` / `failCode()` 错误格式、令牌绑定身份、静态白名单与 migration SHA-256 防篡改。

这些机制将继续作为唯一的 workflow、运行留痕、证据、教师审核和审计系统。本工作包不创建影子审核表、影子审计表或第二套 workflow。

## 3. 云端知识库核查

### 3.1 已定位资产

`corpus_version.json` 声明：

- `corpus_version`：`management-principles-cloud-kb-v1.2`
- `corpus_version_hash`：`a4f11290b7a59d17e101c29ab8dfb1e93ef09cc0d22fbfc6717d2df54edbc687`
- 24 个来源、1082 个单元、1011 个切片。

本地 SHA-256：

| 文件 | SHA-256 |
| --- | --- |
| `04_index/management_course_kb.sqlite` | `8524f6b700728a6417fec00191c7e912615ae6fcc363b2a4161b0e516d14bfa9` |
| `00_manifest/corpus_version.json` | `a32a4d1637ca6bde75f9dc469ba4ad286ce1369450691d39e3da4e4bc58ef793` |
| `00_manifest/source_manifest.json` | `485a6553ca3b595d10d9491ab20ab16aa652216569059cd11e018a03fbea1a25` |
| `05_evaluation/retrieval_evaluation.json` | `0117e3318a21b435725e202b22bd88d937337b21d162efcd0b91bcfed4b84446` |

SQLite 的 `PRAGMA user_version` 为 `0`，没有自描述 schema version 表。通过表/列契约识别为本工作包定义的 `management-course-kb-sqlite-v1`：`sources`、`units`、`chunks`、`chunks_fts`、`concepts`、`relations`、`learning_objectives`、`chapters` 均存在；`chunks_fts` 是 FTS5 虚表。

直接计数与云端构建摘要一致：24 来源、1082 单元、1011 切片、276 概念、45 关系、104 学习目标、23 案例候选、131 评价题。`integrity_checks.json` 的五项检查均为 pass；固定 30 题评测记录章节 Top-5 定位率 90.0%、章节过滤后概念召回 95.45%、引用完整率 100%。

### 3.2 已知资料边界

- 目录中没有原始 PDF/PPT，因此可以核验云端产物内的 manifest 与 SQLite，不可重新计算 24 份原件的 SHA-256；
- `README.md` 仍含旧 corpus hash，注册以 `corpus_version.json` 为准；
- `management_course_kb (1).sqlite` 是额外副本，不作为运行语料；
- CH07、CH14、CH15 为 `source_gap`，CH16 为 `partial`；417 个图像型页面在视觉复核队列；
- 本机未找到用户指定的原云端 ZIP，因此 ZIP 哈希不适用，且不能替代为新打包 ZIP。

## 4. 只读双数据库接入决策

课程知识库 SQLite 是唯一的课程语料源，运行时仅以 `DatabaseSync(path, { readOnly: true })` 打开，并额外设置 `PRAGMA query_only = ON`。Product Core SQLite 不复制知识库正文，只保存：外部语料登记、检索运行、正式证据链接、教师后续裁决关联与审计事件。

启动时的外部库校验顺序：文件存在 → SQLite SHA-256 精确匹配 → 读取并哈希 manifest / corpus version 文件 → schema 契约与 FTS5 存在 → 只读打开 → 计数与 corpus version 一致。任何一步失败，管理学检索接口返回稳定错误，不退回空库、内置文案、Embedding 或模型记忆。

## 5. 缺口与最小修改面

现有 `evidence_links` 只能引用 Product Core 内部的 `content_blocks`。外部只读切片需要在同一张证据表中增加外部语料、外部切片与定位字段，并通过 migration 扩展枚举；不能创建平行 evidence 表。

预定修改文件：

1. `server/migrations/010_management_kb_external_corpora.sql`：外部语料冻结登记，以及对既有 `evidence_links` 的最小兼容扩展；
2. `server/config.mjs`：`MANAGEMENT_KB_PATH`、固定 SHA、manifest 路径和只读开关；
3. `server/product-core/management-kb-service.mjs`：校验、只读打开、确定性检索、注册与证据包组装；
4. `server/app.mjs`：正式检索、语料状态、证据包只读路由，复用现有身份、run、证据与审计；
5. `server/management-kb-service.test.mjs`、`tools/verify-management-kb-product-integration.mjs` 与必要的现有测试修正：CH06、哈希失配、只读、追加审计、无 LLM / 无 Embedding 回归。

## 6. 明确不做

- 不重解析 24 份来源文件；
- 不写入、迁移或复制 `management_course_kb.sqlite`；
- 不引入 Embedding、向量库、LLM 检索重排或教案生成；
- 不把知识库正文写进 migration 或 Git；
- 不补造 CH07/CH14/CH15/CH16 内容；
- 不把外部知识库的审核状态写回课程库；
- 不新建平行 workflow、审计、裁决或证据系统。

## 7. 当前风险

1. 当前主工作区已有测试回归，必须在交付前与本接入共同复绿；
2. 外部库未声明 SQLite schema version，只能使用严格表/列契约加服务端版本标签检测；
3. 原始 ZIP 和原始来源文件未在本机，不能完成 ZIP/原件层独立哈希复核；
4. 权限 manifest 显示 Embedding 为禁用，且本工作包将保持该禁用状态；
5. 外部库路径必须由部署环境显式配置，路径或 SHA 不匹配将 fail closed。

## 8. P1 实施与验收结果

已新增 migration `010_management_kb_external_corpora.sql`，在既有 `kb_retrieval_runs`、`evidence_links` 与 `audit_events` 上完成外部冻结语料登记和引用；没有新增平行 workflow、审核或审计表。外部切片使用 `evidence_type = external_knowledge_chunk`，并以 `external_corpus_id`、`external_chunk_id`、`external_locator_json` 保留跨数据库定位。

正式接口为：

- `GET /api/product-core/kb/management/status`
- `POST /api/product-core/kb/management/retrieve`
- `GET /api/product-core/kb/management/retrieval-runs/:id/evidence-package`

实际冻结语料验收已以 CH06 查询“矩阵制为什么容易产生多头指挥”运行：首条为 `CHK-000803`，来源定位为《管理学》（第二版）第六章组织设计第 25 张幻灯片；两次相同输入的切片 ID 和分数完全一致。另以 9 条章节内问题分别探测 S1—S9 的后续证据需求，九条均能返回带定位和内容哈希的 CH06 切片；这只验证“可供教师设计时引用”，不生成教案或教学结论。证据包、Product Core 检索运行、证据链接及追加审计均已生成，前后 SQLite SHA-256 相同。`npm run test:backend` 全绿；真实资产验收命令见配套运行说明。
