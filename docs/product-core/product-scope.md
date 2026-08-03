# 产品范围:从展示型原型到可运行产品内核

- 版本:v1.0.0
- 日期:2026-08-03
- 状态:冻结

## 1. 定位

本轮重构把 PharmacoPilot 从"展示型原型"推进为"可运行产品内核"。现状(见 `docs/product-core/current-state-audit.md`):后端 `server/` 仅有 workspace 状态同步、模型对话、实践包生成、五路审校等演示能力,无任何课程/班级/课时/学生/工作流领域表,教学领域数据全部以前端静态负载(`shared/station*.payload.js`、`shared/virtual-class-agents.json`)存在。本轮在后端建立真实的领域模型与数据管道,使 S1(课前学情诊断与教学决策)形成端到端可运行、可审计、可复算的纵向闭环。

## 2. 核心对象:Teaching Decision Record

本轮的领域核心是 **TeachingDecisionRecord(教学决策记录,ID 前缀 `tdr_`)**。它把一次 S1 教学决策的全部依据固化为结构化记录:基于哪些 RuntimeObservation(`obs_`)、引用了哪些 EvidenceReference(`ev_`)、产出了哪些 TeachingClaim(`clm_`)、经过了哪一轮 ModelRun(`mrn_`)、机械门禁与语义审查结果如何、教师最终如何裁决(TeacherDecision,`tdec_`)。

设计原则:AI 只产出"建议+证据",教师裁决是每条 TeachingDecisionRecord 上的状态(`PENDING / ACCEPTED / REVISED / REJECTED / DEFERRED`),只有教师终态裁决通过的内容才能进入发布产物。

## 3. 本轮范围:S1 纵向闭环

实现 S1(stageId `S1`)从输入到发布的完整主状态机:

```
DRAFT → INPUT_READY → FACTS_COMPUTED → EVIDENCE_RETRIEVED → CLAIMS_GENERATED
      → MECHANICAL_VALIDATED → SEMANTIC_REVIEWED → TEACHER_REVIEW → PUBLISHED
```

另加 `CANCELLED`(可从任意非终态进入)。状态机服务形态为 `transitionWorkflow(instanceId, action, actorContext)`,路由层不得直接写状态字段。详见 `docs/product-core/s1-state-machine.md`。

具体交付物:

- `schemas/v1/` 六个 JSON Schema:RuntimeObservation / EvidenceReference / TeachingClaim / TeachingDecisionRecord / TeacherDecision / ModelRun(`schemaVersion` 均为 `"1.0.0"`,`additionalProperties: false`);
- `schemas/fixtures/v1/` 对应 fixture;
- `server/migrations/` 版本化迁移(`NNN_name.sql` + `schema_migrations` 表 + hash 防篡改),建立全部领域表并把现有 4 表作为 baseline 纳入;
- `server/product-core/` 领域服务:学情事实计算、证据检索、claim 生成、机械门禁(14 条确定性校验)、语义审查(仅接口+状态+mock reviewer)、教师裁决、发布;
- 模型网关 provider 抽象(mock / existing-mlx / deepseek-cloud 占位);
- `experiments/` 技术探针(FTS5 中文检索四通道、PDF parser 对比、Intl.Segmenter 分词);
- `evaluation/` 金标准数据集结构(retrieval / refusal)。

## 4. 发布产物定义

S1 发布 = 新建一行 `lesson_versions`(`status = PUBLISHED`,`content_json` 存 S1 结构化产物)。**不单独建 `stage_artifacts` 表**,理由:复用既有版本链与 `lesson_versions` 的 PUBLISHED 不可变触发器。

## 5. 明确不做清单(本轮)

- 不接 DeepSeek,不接入任何新云模型(`deepseek-cloud` provider 仅占位);
- 不引入 Dify / LangChain 等编排框架;
- 不建向量库、不做 embedding、不做 reranker;
- 不实现完整 S2-S9 闭环(状态机骨架只服务 S1);
- 不做学生端;
- 不做多租户、不做用户/角色体系(`actor_id` 以调用方提供的标识记录);
- 不做大 UI 重构(前端静态负载 `station*.payload.js`、`virtual-class-agents.json` 不动);
- 语义审查不接真模型,只做接口 + 状态 + mock reviewer;
- FTS5 / PDF 解析探针不进入业务依赖;FTS 表若建也只是派生索引,不是事实源。

## 6. 兼容策略

采用 strangler pattern:既有 8 条 API 路由与 4 张旧表全部保留,新功能全部走 `server/product-core/` 新服务与新表,新旧并存,逐步替换。详见 `docs/product-core/data-model-mapping.md`。
