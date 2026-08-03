# PharmacoPilot 产品内核重构 · 实现报告

- 版本:v1.1.0 · 日期:2026-08-03 · 状态:终稿(含第二轮硬化)
- v1.1.0 变更:P0 migration 005(teaching_claims.workflow_instance_id)、P1 schema 1.0.1(两处 pattern 兼容修正)、P1 审计维度补齐、P1 解析器契约漂移自动检查;对应 git tag `product-core-s1-baseline`。
- 工程根:`pharmaco网页/`(本报告所有路径相对它)
- 配套文档:`docs/product-core/` 下 12 篇(current-state-audit / product-scope / domain-invariants / entity-model / s1-state-machine / schema-versioning / data-model-mapping / document-parser-contract / retrieval-probe-design / evaluation-dataset-design / security-and-privacy / 本报告)

---

## 1. 当前工程核查

### 实际技术栈
- 纯 ESM JavaScript("type":"module"),Node v22.22.0(engines ≥22.5),npm + package-lock;无 TypeScript。
- 后端零框架:`node:http` 原生路由(server/app.mjs if 链),单一静态 Bearer token 鉴权,静态文件正向白名单。
- 前端:根级静态 HTML + `shared/` 共享 JS,esbuild 打包(build.mjs)。
- 本轮新增依赖仅 2 个:`ajv@^8.20.0`、`ajv-formats@^3.0.1`(均 MIT、纯 JS、无原生编译、对打包/部署无影响;选型记录见 `schemas/README.md`)。

### 实际数据库
- `node:sqlite` 内置 `DatabaseSync`,WAL + foreign_keys=ON + STRICT 表,文件 `.pharmaco-data/pharmaco.sqlite`。
- 本轮前:无版本化 migration(构造函数内联建 4 表);本轮后:`server/migrations/000–004` + `server/migrations.mjs` runner(`schema_migrations` 记录 name+sha256+applied_at,篡改即拒绝),老库经 baseline 平滑升级(已用真实库副本冒烟验证)。

### 实际测试框架
- 后端:`node:test` + `node:assert/strict`,`node --test server/*.test.mjs` 自动拾取新测试。
- 前端/契约:15 个 `tools/verify-*.mjs` 断言脚本(style/color token 棘轮门禁、术语、payload 等)。

### 已复用的现有模块
`PharmacoDatabase` 封装与乐观锁先例、`RevisionConflictError`、`audit_events`/`inference_events` 追加表(扩展不重建)、`HttpError`/`fail()` 错误格式、`authorized()` 鉴权、`staticAllowed` 白名单、`ModelClient`(被 mlx-provider 包装,零修改)、`tools/anchor-gate.mjs` 锚定思路(机械门禁的范式参考)、fake-model 测试模式。

### 发现的技术债务(核查阶段)
- schema 无 migration 体系(本轮已建立);审计写入点过少(本轮已覆盖产品内核全动作);TEACHING_AGENTS 命名为已弃用口径(HANDOFF §3 P1,本轮未处理);教学领域数据全在前端静态负载(本轮开始建后端领域模型);无用户/角色体系(reviewerId 以调用方 actor 标识记录)。

---

## 2. 已完成内容

| 文件路径 | 功能 | 对应不变量 | 测试 |
|---|---|---|---|
| `server/migrations/000_baseline.sql`–`004_content_search_indexes.sql` | 版本化 migration:17 张领域/基础设施表 + 不可变触发器 + FTS5 派生索引 | B1/B5/B6/B7/B8,S5 | migrations.test 11 例 |
| `server/migrations.mjs` | runner:顺序执行、sha256 防篡改、幂等 | S5 | 同上 |
| `server/db.mjs`(改) | 构造函数改走 runMigrations,公开 API 不变 | — | backend.test 无回归 |
| `schemas/v1/*.schema.json`(6 个) | 六个跨层 JSON 契约,`schemaVersion` const "1.0.0",additionalProperties=false | S1–S4 | schema-validation.test 26 例 |
| `schemas/fixtures/v1/`(42 个) | 每 schema 1 合法 + 6 非法 fixture | S1 | 同上 |
| `server/product-core/schemas.mjs` | ajv 校验入口,失败抛 SCHEMA_VALIDATION_FAILED 带字段路径 | S1 | 同上 |
| `server/product-core/workflow.mjs` | S1 状态机唯一入口 `transitionWorkflow`,转移表+守卫+乐观锁 | B7、非法转移 12 条 | product-core.test |
| `server/product-core/pretest.mjs` + `fixtures/pretest-s1.fixture.json` | 去标识化前测导入 + 确定性事实计算(28 metric,幂等可重算) | B7(observation 可重算) | product-core.test + e2e |
| `server/product-core/claims.mjs` | 规则常量表生成三类 claim(分表分条存储)、supersedes 链、NO_KNOWLEDGE_EVIDENCE 显式标记 | B2/B3/B4 | product-core.test |
| `server/product-core/mechanical-gates.mjs` | 13 条确定性机检(第 14 条由 publish 检查) | B2/B11/B12 | product-core.test |
| `server/product-core/semantic-review.mjs` | mock reviewer v1 + 五态契约,不替代机械门禁 | — | product-core.test |
| `server/product-core/decisions.mjs` | TDR 组建 + 追加式教师裁决(revise 强制 editedStatement、original 自动留档) | B1/B5/B10 | product-core.test |
| `server/product-core/publish.mjs` | 发布门禁(无裁决/FAILED/rejected/deferred/superseded 独立支撑均拒)+ S1 结构化产物 + 版本链 | B1/B7/B11/B12 | product-core.test + e2e |
| `server/product-core/audit.mjs` | 追加式审计(event_hash=sha256 canonical JSON) | B6 | 全程覆盖 |
| `server/model-providers/`(4 文件) | provider 抽象:mock(确定性)+ existing-mlx(包装 ModelClient)+ deepseek-cloud 占位(抛 PROVIDER_NOT_ENABLED) | — | product-core.test |
| `server/app.mjs`(改,+472 行) | 14 条 `/api/product-core/` 路由 + 错误映射 + 白名单登记;路由层零 UPDATE | B7 | s1-e2e.test 6 例 |
| `s1-workspace.html` | 最小教师工作区:建课向导/流程按钮/三栏事实·推断·建议/四键裁决/原文对照/发布/审计时间线;style/color token 合规 | — | test:frontend 15/15 |
| `server/document-parsers/`(5 文件) | DocumentParser 契约 + manual-markdown 可用实现 + mineru/docling 契约桩(如实 PARSER_UNAVAILABLE) | — | document-parsers.test 24 例 |
| `experiments/chinese-search/` | FTS5 四通道中文检索探针(独立运行,零依赖) | — | run-evaluation 可复现 |
| `experiments/document-parsing/` | 解析探针:manifest 12 条(3 available/9 blocked 如实)+ 3 样本 + 对比报告 | — | run-probe 跑通 |
| `evaluation/` | 41 题金标准(4 数据集)+ 13 份脱敏 fixtures + ingest + resolve-gold-evidence(unmatched 即失败不移出分母) | B12 相关 | gold-resolution.test 11 例 |
| **v1.1.0 硬化** | | | |
| `server/migrations/005_teaching_claims_workflow.sql` | 表重建补 `workflow_instance_id`(NOT NULL+FK+双索引),双路径回填,守卫触发器失败即整体回滚;runner 新增 opt-in `-- migrations:foreign-keys-off` 标记 | B7 | migration-005.test 4 例(含孤儿/幽灵引用负例) |
| `server/product-core/`(claims/pretest/audit 等) | 新 claim 写 workflow_instance_id(supersede 继承);9 类审计事件全维度(workflow/entity/actor/schema_version+payload.courseId);app.mjs 审计归集优先 workflow 过滤 | B6/B7 | 同上 + e2e 回归 |
| `schemas/v1.0.1/`(2 个)+ `schemas/fixtures/v1.0.1/`(7 个) | 兼容 PATCH:TDR lessonVersionId `^(kav\|lvr)_`、evidence sourceId 放宽含 obs_;双版本路由,旧 1.0.0 数据可读,新写入按 `getWriteSchemaVersion()` 分发 | S1–S4 | schema-validation.test +11(共 37) |
| `server/document-parsers-contract.test.mjs` | 契约文档 ↔ BLOCK_TYPES ↔ migration CHECK 三方枚举/字段漂移自动检查 | — | 4 例(篡改实测可检出) |

---

## 3. 数据库变化

### migration(新增,均未修改已应用文件)
- `000_baseline.sql`:既有 4 表原样 IF NOT EXISTS(workspace_states/audit_events/inference_events/practice_review_cache)。
- `001_product_core_domain.sql`:courses、class_cohorts(含 UNIQUE(id,course_id) 供复合外键)、lessons、lesson_versions、pretest_items、pretest_responses、runtime_observations、knowledge_assets、asset_versions、content_blocks。
- `002_decision_and_evidence.sql`:teaching_claims、teaching_decisions、teacher_decisions、evidence_links、model_runs。
- `003_workflow_and_audit.sql`:workflow_instances;`audit_events` ALTER 扩 10 列(actor_type/actor_id/entity_type/entity_id/workflow_instance_id/previous_state/next_state/payload_json/event_hash/schema_version)。
- `004_content_search_indexes.sql`:5 个高频索引 + `content_blocks_fts`(external-content 派生表 + 同步触发器,注释声明"派生索引非事实源")。
- `005_teaching_claims_workflow.sql`(v1.1.0):表重建为 teaching_claims 补 `workflow_instance_id TEXT NOT NULL REFERENCES workflow_instances(id)` + `(workflow_instance_id)`/`(workflow_instance_id, claim_type)` 索引;回填经 model_runs/TDR 反查,不可解析行由守卫触发器 RAISE、整迁移回滚;002 结构原约束/触发器逐一保留。

### 约束与不可变规则(触发器强制)
- lesson_versions:PUBLISHED 行禁 UPDATE/DELETE,仅放行"纯 status→SUPERSEDED 翻转"(逐字段 IS 比较);UNIQUE(lesson_id, version_number)。
- teaching_claims.statement 不可改(修改=新建+supersedes 链)。
- teacher_decisions、model_runs、audit_events:禁 UPDATE/DELETE(追加式)。
- asset_versions:禁 DELETE;source_status 仅 active→superseded/withdrawn/expired 单向。
- 复合外键 FK(class_id, course_id) 保证班级-课程 scope;全部 STRICT 表、命名约束、高频 FK 索引。
- 兼容策略:旧 4 表不动语义(strangler);`inference_events` 与新 `model_runs` 并存(轻量日志 vs 领域记录);循环 FK 三处保留逻辑引用由服务层事务回填(详见 data-model-mapping.md)。

---

## 4. 领域契约

- **Schema 列表**(均 `schemaVersion="1.0.0"`):runtime-observation / evidence-reference / teaching-claim / teaching-decision-record / teacher-decision / model-run;ID 前缀 obs_/ev_/clm_/tdr_/tdec_/mrn_/crs_/coh_/les_/lvr_/blk_/ka_/kav_/wf_/agt_;stageId `S1–S9`。
- **状态机**:DRAFT→INPUT_READY→FACTS_COMPUTED→EVIDENCE_RETRIEVED→CLAIMS_GENERATED→MECHANICAL_VALIDATED→SEMANTIC_REVIEWED→TEACHER_REVIEW→PUBLISHED(+CANCELLED);state_machine_version='1.0.0';唯一入口 transitionWorkflow;教师裁决为 TDR 级状态(PENDING/ACCEPTED/REVISED/REJECTED/DEFERRED)。
- **不变量**:B1–B12 + S1–S5,落实层逐条见 domain-invariants.md;DB 无法落实的(B6 部分、B8 部分、B9、B12)由服务层+测试兜底并有文档说明。

---

## 5. S1 纵向切片(真实可重放示例)

2026-08-03 用服务层在临时库实跑一次完整闭环(零模型调用),输入为内置 fixture(32 匿名学生 × 4 题):

- 组织:course `crs_N7zdmUvlcqn1XbSRz5GSb`(药事管理学 PHM-301)/ cohort `coh_GjgHVG1jKAfDvhjqXqNpf` / lesson `les_nfyqqBTtItq8dUMiQHloo`
- 工作流:`wf_BJm6QDvwYegmM34xVXD5n`,状态序列 DRAFT→…→PUBLISHED 八连转
- 事实(确定性计算,calculation_version='s1-calc-1.0.0'):`obs_hrZgZL0qFMFus6CfJyyIk` pretest.accuracy.q4 = **0.1875(6/32)**;q1=0.875、q2=0.625、q3=0.5;overall=0.546875(70/128)
- claim:7 条 factual_claim + 1 条 diagnostic_inference + 1 条 teaching_recommendation,分条入库
- 教师裁决:8 条 TDR 全部裁决,示例 revise:`tdr_XQtPy8gIAv9UrBx4rwI43` → `tdec_wvfYnZMVFPqi298swwdaF`(editedStatement 限定为 15 分钟小组活动,originalStatement 留档)
- 发布:`lvr_Hjxgpz1IC9hVvRLWyS1fk`,lesson_versions version_number=1,status PUBLISHED
- 审计:全流程 **108 条**追加式 audit_events
- 可重放:同 fixture 同 calculation_version 重算,runtime_observations 行数与值完全一致(product-core.test 与 e2e 均断言)

HTTP 路径冒烟(e2e 与手动 curl 均验证):POST courses → cohorts → lessons → s1/workflows → input → compute-facts → generate-claims → validate → decision-records/:id/decisions ×N → publish → lessons/:id/versions。

---

## 6. 技术探针

### 中文检索(experiments/chinese-search,31 篇语料 × 35 查询,实测可复现)

| 通道 | Recall@5 | Recall@10 | MRR | 无答案误召回 | 索引大小 |
|---|---|---|---|---|---|
| A unicode61 原始 | 0.310 | 0.310 | 0.310 | 0 | 45 KB |
| B trigram 原始 | 0.448 | 0.448 | 0.448 | 0 | 70 KB |
| C Intl.Segmenter 分词+unicode61 | **0.966** | **0.966** | **0.966** | 0.667 | 53 KB |
| D B+C RRF(k=60) | 0.966 | 0.966 | 0.966 | 0.667 | 123 KB |

发现:短词(≤2 字)是分水岭(A/B 全灭,trigram <3 字结构性空结果);C 召回近满分但 OR 语义致无答案题误召回 2/3,业务化需分值门槛;D 在本语料零新增召回;结构标识(S1/条款号/文号)走元数据过滤成立。**推荐但未冻结**:C 通道 + 元数据结构过滤 + 分值门槛;同义题留作向量召回增量价值的证明集。

### PDF 解析(experiments/document-parsing)
manual-markdown 兜底链路 3 样本全绿(契约校验通过、页码保留 88–100%、表格 1:1、毫秒级);**mineru/docling 环境阻塞**(需 Python+模型权重,本地优先纪律不装系统环境),契约桩如实 PARSER_UNAVAILABLE,未伪造任何对比数据;9 条真实 PDF 语料因脱敏/版权未就绪如实 blocked。

---

## 7. 测试

| 命令 | 结果 |
|---|---|
| `npm run test:backend` | **131 pass / 0 fail**(backend 17 子用例 + migrations 11 + migration-005 4 + schema-validation 37 + product-core 14 + document-parsers 24 + document-parsers-contract 4 + gold-resolution 11 + s1-e2e 6,及顶层套件) |
| `npm run test:frontend` | **15/15 脚本通过**(style/color token 棘轮门禁含新页面) |
| `node build.mjs --check` | 通过 |
| `npm run check`(以上全部) | **全绿,exit 0** |
| `node experiments/chinese-search/run-evaluation.mjs` | 跑通,results 可复现 |
| `node experiments/document-parsing/run-probe.mjs` | 跑通 |
| `node evaluation/scripts/resolve-gold-evidence.mjs`(4 数据集) | 全部 exit 0,30 条 gold 全 resolved |
| 真实库冒烟(副本) | migration 平滑应用,旧数据保留 |

已知问题:无测试失败;遗留均为设计层偏差,见 §9。

---

## 8. 验收矩阵(逐条对照验收标准)

| # | 标准 | 结论 | 证据 |
|---|---|---|---|
| 1 | 空库执行全部 migration | PASS | migrations.test 空库全量+幂等 |
| 2 | 创建课程/班级/课时 | PASS | repository + e2e |
| 3 | 导入前测数据 | PASS | pretest.mjs + e2e(fixture 32×4) |
| 4 | 确定性计算统计事实 | PASS | computeFacts 28 metric,值含分子分母 |
| 5 | 三类 claim 创建 | PASS | 7 factual+1 inference+1 recommendation |
| 6 | 事实 claim 绑运行数据证据 | PASS | evidence_links→runtime_observations |
| 7 | 绑知识证据或显式标记无知识证据 | PASS | knowledge_block 通道+机械门禁逐字校验;NO_KNOWLEDGE_EVIDENCE 显式标记行 |
| 8 | 无证据事实不能发布 | PASS | EVIDENCE_RETRIEVED 守卫+门禁(10)+publish 门禁,测试覆盖 |
| 9 | 机械校验失败不能发布 | PASS | GATE_VALIDATION_FAILED 测试 |
| 10 | 教师 accept/revise/reject/defer | PASS | 四路径测试+API |
| 11 | 教师修改不覆盖原始内容 | PASS | original_statement 留档+statement 触发器 |
| 12 | rejected/deferred 不进正式产物 | PASS | e2e 断言产物排除与 unresolvedQuestions |
| 13 | 发布生成不可覆盖新版本 | PASS | 版本链 max+1+parent 链 |
| 14 | 已发布版本不能原地修改 | PASS | 触发器测试(改内容/连带改字段均拒) |
| 15 | 状态变化写追加审计 | PASS | 17 类事件 e2e 断言;audit 禁 UPDATE/DELETE |
| 16 | 同一输入重算同一事实 | PASS | 幂等重算+OBSERVATION_RECALC_MISMATCH |
| 17 | 模型关闭闭环仍运行 | PASS | e2e 中 modelClient.chat 抛错仍全绿 |
| 18 | mock provider 可替代模型 | PASS | mock 确定性输出+registry 测试 |
| 19 | 现有功能未被破坏 | PASS | npm run check 全绿(含全部 15 个前端 verify 与原 backend 套件) |
| 20 | Schema 带版本号+校验测试 | PASS | 6 schema const "1.0.0",26 例 |
| 21 | 非兼容 schema 变更有升级纪律 | PASS | schema-versioning.md+migration hash 防篡改 |
| 22 | FTS 探针独立运行 | PASS | §6 实测指标 |
| 23 | PDF 探针独立运行或记录阻塞 | PASS | manual-markdown 可用;mineru/docling BLOCKED 如实记录 |
| 24 | 金标准可重映射 contentBlockId | PASS | 4 数据集 30/30 resolved |
| 25 | 金标准无法定位时明确失败 | PASS | 负例:改一字→exit 1 且计入 unmatched 分母 |
| 26 | 未接 DeepSeek/向量/reranker | PASS | registry 中 deepseek-cloud 抛 PROVIDER_NOT_ENABLED;无向量依赖 |
| 27 | 未确认生成内容未写入正式知识库 | PASS | knowledge_assets 仅经 fixtures/人工通道入库,review_status 门禁;无 AI 回写路径 |
| 28 | fixture 无真实 PII | PASS | 学生仅 stu_01–32 匿名 ID;评测文档全虚构脱敏;build-corpus 含 PII 扫描 |
| 29 | 本报告列出新增/修改/未完成 | PASS | §2/§3/§9 |
| 30 | 下一阶段建议但不实施 | PASS | §10(未实施) |

---

## 9. 剩余风险(v1.1.0 硬化后)

第二轮硬化(P0 migration 005 + P1 schema 1.0.1 + P1 审计维度 + P1 契约漂移检查)已消除原 HIGH#1、MEDIUM#2/#3/#4:

- **BLOCKER**:无。
- **HIGH**:无(原 #1 已由 migration 005 修复:表重建补 `workflow_instance_id` NOT NULL+FK+双索引,双路径回填,不可解析行 FAIL 且事务回滚,真实库副本 000→005 冒烟通过)。
- **MEDIUM**
  1. ~~TDR lessonVersionId pattern 误用 kav_~~ 已由 schema 1.0.1 修复(`^(kav|lvr)_` 最小放宽,新写入用 lvr_,1.0.0 数据仍合法)。
  2. ~~evidence-reference sourceId 过严~~ 已由 schema 1.0.1 修复(放宽为 `^(ka|kav|obs|blk|tdec|ev|wf)_`,runtime_observation 型证据有正向 fixture)。
  3. ~~审计事件缺 workflow_instance_id~~ 已由 005 服务层补齐(input.imported/facts.computed 等 9 类事件全维度:workflow/entity/actor/schema_version+payload.courseId;审计归集改为优先 workflow 过滤;旧行不回填,追加式纪律)。
  4. 残留:verbatimQuote/contentHash 在 evidence-reference 中对全部 evidenceType 必填,对"NO_KNOWLEDGE_EVIDENCE"标记行语义略牵强——下轮评估是否按 evidenceType 分条件必填。
- **LOW**
  5. entity-model.md 个别字段与 migration 口径差(aggregation_level 枚举、pretest_responses.cohort_id、lessons.stage_id)——以 migration 为准(005 已对齐 workflow_instance_id 条目,其余下轮对齐)。
  6. mlx-provider 的 thinkingMode/reasoningEffort 无法透传(ModelClient.chat 契约不含此二字段),目前只留痕于 model_runs;需 model-client 契约演进。
  7. claim 生成时点与冻结转移表的字面顺序有偏差(规则生成器在 FACTS_COMPUTED 阶段生成 claim+证据,EVIDENCE_RETRIEVED 守卫核验)——已写入 s1-state-machine.md 实现注记。
  8. 审计事件存在双名并写(input.imported/inputs.submitted 等两套)——历史兼容,后续收敛。
  9. mineru/docling 未实测(环境阻塞),正式解析器选型无数据支撑——属计划内未决项。

---

## 10. 下一阶段建议(仅建议,未实施)

1. ~~migration 005 + schema 1.0.1~~(v1.1.0 已完成)。下一工作包为 `management-principles-knowledge-base-v0.1`:四个闭环(来源进入系统/课程知识结构化/行业与企业证据/检索证据包),首批真实数据限定"组织设计"一章(大纲 1 份、主教材 1 章、OpenStax 1–2 章、医药背景 3–5 份、年报 2 家、知识点 10–15 个、检索测试题 30 条)。
2. 接入本地 MLX 到真实诊断生成:经 model-providers/existing-mlx,先只替换 diagnostic_inference/teaching_recommendation 的规则生成器,recordModelRun 全量留档,用 evaluation 数据集对比规则版与模型版。
3. 用 retrieval-holdout 评测决定是否引入向量召回(证明同义题增量价值后再谈 embedding/reranker)。
4. 用评测决定 thinking 模式(thinkingMode/reasoningEffort 留空待数据)。
5. 搭建 mineru/docling 隔离实验环境,补全真实 PDF 语料脱敏后用 run-probe 选型正式解析器。
6. 扩展 S2:复用状态机骨架(workflow_type 枚举扩展),不复制新框架。
7. 接入真实课堂验证前,先补用户/角色体系(reviewerId 目前为自由文本 actor 标识)。
