# 《管理学原理》知识库 v0.1 规格说明书(management-principles-knowledge-base-v0.1)

- 版本:v0.1.1 · 日期:2026-08-03 · 状态:**开工闸冻结**
- 变更注记:2026-08-03 v0.1.0 → v0.1.1,**权限模型校正**——OpenStax 两份来源降级为"仅参考、禁止模型处理"(manifest 登记 `acquisitionStatus: acquired_reference_only`,新增 `permissionModel` 与 allowedOperations/blockedOperations 逐项授权);验收问题状态改三态(ready_for_reference_retrieval / ready_for_ai_pipeline / pending_source,当前 24/0/6);年报来源改组(awaiting_company_selection + 官方披露渠道候选);检索设计锁定全部模型类通道(§5);许可专章按"三允许用途"重写(§9)。
- 工程根:`pharmaco网页/`(本文所有相对路径相对它)
- 上游依据:`docs/product-core/implementation-report.md` §10 下一工作包定义;`docs/product-core/domain-invariants.md`(17 条不变量,知识层全部继承);`docs/product-core/evaluation-dataset-design.md`(金标准锚定纪律)
- 开工闸纪律:**本阶段只交付文档与 JSON,不写任何服务/检索/回答代码**。本文中所有"接口位置""映射方案""输出契约"均为设计冻结,实现属闸后阶段。

---

## 1. 目标与唯一首发范围

### 1.1 目标

为《管理学原理》课程智能体建立**证据可锚定、版本可追溯、教师可裁决**的课程知识层,使后续阶段的检索与回答能够:

- 每个答案都能沿"答案 → 知识单元 → 来源片段 → 页码/位置"链条回溯到真实来源;
- 区分"来源支持部分"与"系统推断部分",无来源支撑时明确拒答;
- 知识版本演进后,历史答案的依据仍可识别、可复算。

### 1.2 唯一首发范围:组织设计章

首发范围**锁死**为课程 `course_mgmt_principles` 的 `ch_organization_design`(组织设计)一章,核心概念范围 7 个,不得扩项:

1. 组织结构
2. 管理幅度与管理层次
3. 集权与分权
4. 部门化
5. 机械式与有机式组织
6. 权责关系
7. 组织设计的情境因素

教学用途限定五类:概念解释、概念比较、案例判断、证据定位、教学活动与诊断题依据提取。

首批真实数据目标(沿用 implementation-report §10):大纲 1 份、主教材 1 章、OpenStax 1–2 章(已到位 2 份)、医药背景 3–5 份、企业年报 2 家、知识点 10–15 个、检索测试题 30 条。当前状态:OpenStax 2 份已抓取落盘(**仅参考、禁止模型处理**,见 §9),年报改组为"待课程组选定企业 + 官方披露渠道候选",其余均待教师提供,逐条状态见 `organization-design-source-manifest.json`。

---

## 2. 纳入 / 暂不纳入清单

### 2.1 本阶段纳入(v0.1 范围)

- 组织设计章的来源登记与清单管理(manifest,含许可、usage_scope 与 allowedOperations/blockedOperations 逐项授权如实标注);
- 三层对象模型(来源片段 / 知识单元 / 教学用途对象)的 schema 与入库设计;
- 混合检索通道设计(关键词 + 中文分词 FTS5 + 元数据精确过滤 + 去重相邻合并 + 分值门槛);
- 30 条验收问题金标准(锚定纪律沿用 evaluation-dataset-design.md);
- 回答输出契约与拒答契约;
- 许可与合规处置(CC BY-NC-SA 4.0 + OpenStax LLM 摄入声明,见 §9)。

### 2.2 暂不纳入(闸后阶段,本文只定义接口位置)

- embedding / 向量召回 / reranker 重排(**锁定**:待至少一项明确 AI 授权的本土来源到位后方可解锁评估;届时是否引入由 retrieval-holdout 评测决定,证明同义题增量价值后再谈,见 implementation-report §10.3);
- 回答生成(answer composer 的生成式实现,**锁定**,同上);
- 任何将来源文本送入 LLM 的用途(**锁定**:受 §9 许可限制,两份 OpenStax 明确禁止未经许可的模型摄入,其余来源权利范围待确认);
- 组织设计以外章节的来源与知识单元;
- mineru/docling 等 PDF 解析器选型(环境阻塞如实记录,见 experiments/document-parsing);
- 用户/角色体系(教师身份仍以 actor 标识记录)。

---

## 3. 三层对象模型

### 3.1 三层分离原则

知识层由三类对象构成,**职责分离、单向依赖**(Use Object → Unit → Fragment,反向不得依赖):

| 层 | 对象 | 职责 | 可变性 |
|---|---|---|---|
| L1 | **Source Fragment**(来源片段) | 来源的不可再分引用单元(一个小节/一段/一表),逐字原文,锚定五元组的载体 | 内容不可改;来源演进走 asset_version supersede 链(B3) |
| L2 | **Knowledge Unit**(知识单元) | 对一个概念的结构化学理表述,必须由 ≥1 个 Fragment 支撑 | statement 式字段不可原地改,修正走 supersede(继承 B2 精神) |
| L3 | **Teaching Use Object**(教学用途对象) | 面向五类教学用途的组配,引用 Unit 而非直接引用原文 | 教师可裁决、可拒绝; rejected 不进正式产物(继承 B9) |

三层分离的理由:Fragment 对来源保真(逐字、可机检),Unit 对学理负责(结构化、可比较),Use Object 对教学负责(可裁决、可拒绝)。任何一层的变化不污染另外两层:解析器升级只重建 Fragment;教材换版只新增 Unit 的来源绑定;教师拒绝某个活动设计不影响 Unit 本身。

### 3.2 L1 Source Fragment 字段

- `fragment_id`、`source_id`(引用 manifest)、`asset_version_id`、`locator`(章节小节标识;有印刷页码的来源用 `page_index`/`page_label`)、`verbatim_text`(逐字原文)、`text_hash`(sha256,与 quoteHash 同口径)、`language`、`parse_run_id`。
- Web 来源(现有两份 OpenStax)无印刷页码:`page_range = null`,定位用**章节小节标识 + verbatim_text + text_hash**;不得虚构页码。

### 3.3 L2 Knowledge Unit 字段

`unit_id`、`concept`(7 核心概念之一)、`definition`(定义)、`claim`(学理断言)、`conditions`(适用条件/边界)、`counterexample`(反例,无则 null)、`related_concepts`(概念内关联)、`source_fragment_ids`(≥1,引用 L1)、`confidence`(0–1,机器抽取置信度)、`review_status`(枚举:`machine_extracted` | `teacher_verified` | `needs_review` | `rejected`)。

- 初始入库一律 `machine_extracted`(现有 OpenStax 文件 front-matter `reviewed: false`,未经人工校审,如实继承);
- 进入教学正式产物的 Unit 必须 `teacher_verified`;`rejected` 保留留痕、不进产物;
- 不同来源对同一概念的定义冲突时:**保留来源差异**,并行列示并标注来源,不静默合并(见 §4)。

### 3.4 L3 Teaching Use Object 字段与七类

`use_object_id`、`use_type`(七类枚举)、`unit_ids`(引用 L2)、`payload`(类型相关结构)、`review_status`(同 L2 枚举)、`decision_refs`(教师裁决记录引用)。七类:

1. `prerequisite` 先备知识
2. `misconception` 常见误解
3. `diagnostic_question` 诊断问题
4. `case_judgment_basis` 案例判断依据
5. `activity_scaffold` 活动支架
6. `evaluation_rubric` 评价标准
7. `teacher_explanation_hint` 教师解释提示

### 3.5 与基线数据模型的映射方案

基线表(`server/migrations/000–005`)**一律不修改**(S5:已合入 migration 不得修改,由 `schema_migrations` hash 防篡改)。映射:

- **Fragment → 复用现有 `content_blocks`**(migration 001),挂在 `knowledge_assets` / `asset_versions` 之下:每份来源 = 一个 knowledge_asset;每次解析 = 一个 asset_version;Fragment = 该 version 下的 content_block。`content_blocks_fts`(migration 004)继续作为派生索引(非事实源)。
- **Knowledge Unit → 新增表**(如 `knowledge_units`),**Teaching Use Object → 新增表**(如 `teaching_use_objects`),连同必要的关联表与状态触发器,**只允许经 migration 006 新增**,并遵循:STRICT 表、命名约束、追加式/不可变触发器(对齐 B2/B3/B5 先例)、`schema_migrations` 记录 hash。
- Unit/UseObject 的跨层 JSON 契约新增 schema 文件,`schemaVersion` 自 `"1.0.0"` 起,遵守 S1–S5;与既有六 schema 的版本演进互不干扰。

---

## 4. 来源优先级与版本纪律

### 4.1 来源优先级(同主题表述冲突时的采信顺序)

1. `src_syllabus_mp` 教学大纲(课程目标的唯一权威);
2. `src_textbook_main_orgdesign` 主教材组织设计章(课程指定教材,学理表述基准);
3. `src_teacher_ppt_orgdesign` 教师讲义/PPT(课堂口径);
4. 已获取 OpenStax 两份(参考来源,英文,概念框架);
5. `src_openstax_pom_ch03_s3_7` 等候选补充(补缺口用, ingestion 前需教师确认)。

优先级只决定"课程口径以谁为准"的**呈现顺序**,不构成删除或改写低优先级来源的理由。

另有"**首批语料优先级**"(按授权易确认程度排序,决定先争取哪批来源的 AI 可用授权,见 manifest 各条 notes):①教师自编 PPT/讲义 ②教学大纲与课程目标 ③主教材(逐项权利待确认)④医药行业材料(需脱敏)。该排序与本表"口径采信优先级"是两个维度,互不替代。

### 4.2 版本纪律

- **不同版本教材不静默合并**:同一来源的不同版本各自登记、各自解析、各成 asset_version;supersede 链仅表达"同一来源的新版替代旧版",绝不用于跨来源合并。
- **定义冲突保留来源差异**:同一 concept 下不同来源的 definition 并列存于不同 Unit(或同一 Unit 的多条来源化定义),展示时标注来源与优先级;禁止把两个来源的表述拼接成"混合定义"。
- 任何来源的撤回/过期走 `asset_versions.source_status` 单向状态机(active→superseded/withdrawn/expired,B3),历史答案绑定的版本仍可查。
- 待提供来源入库前必须完成版权/脱敏流程(manifest notes 逐条注明),未过流程不得解析入库。

---

## 5. 检索设计(闸后实现的接口冻结)

> **权限闸门(2026-08-03 权限模型校正)**:当前阶段只实现**非模型检索**——原文关键词、FTS5 中文分词 + BM25、元数据精确过滤、锚点定位(页码/章节小节)。embedding / 神经重排 / LLM 相关通道全部**锁定,待至少一项明确 AI 授权的本土来源到位**后方可解锁评估(manifest `permissionModel`:检索与模型处理是两类不同权限,逐来源逐项授权)。

### 5.1 通道组合(混合检索)

依据 `experiments/chinese-search` 实测(31 篇语料 × 35 查询):分词通道 C(Intl.Segmenter + FTS5 unicode61)Recall@5 = 0.966,为词法通道最优;trigram 对 <3 字查询结构性失效;结构标识走元数据过滤成立。据此冻结四件套:

1. **原文关键词通道**:FTS5 unicode61 原始文本。服务于英文术语(span of control、mechanistic)、编号、ASCII 结构;对中文连续文本预期退化(实测 R@5 = 0.31),仅作补充。
2. **中文分词通道**:查询与入库两侧均用 `Intl.Segmenter('zh', {granularity:'word'})` 预分词、空格连接入 FTS5 unicode61,bm25 排序。中文语义主通道。
3. **精确字段过滤**(不走全文):`course_id` / `chapter_id` / `concept` / `source_type` / `review_status` 元数据 SQL 精确过滤;教学场景的结构化约束(如"只看 teacher_verified")必须走此通道而非全文。
4. **后处理**:同 `documentId` 相邻 block 命中合并(还原上下文)、跨版本去重(同一来源多版本同时命中时按 §4.2 取课程当前采信版本并标注)。

### 5.2 误召回门禁

通道 2 的 OR 语义在实测中无答案题误召回率 0.667(共享词元捞回噪声)。业务化必须加**分值门槛**(bm25 阈值)+ 答案判定点;阈值调参只允许在 dev 集上进行,holdout 集只在方案冻结后评估一次(沿用 evaluation-dataset-design.md §4)。

### 5.3 闸后组件的接口位置(本阶段只定义挂载点,不实现)

- **向量召回接口**(**锁定**,待至少一项明确 AI 授权的本土来源到位):与通道 1/2 并列的第三召回通道位置,输入输出契约同词法通道(docId 候选集 + 分数),是否启用由 holdout 评测决定;
- **reranker 接口**(**锁定**,同上):位于"召回合并"与"分值门槛"之间,接收候选列表返回重排列表;
- **answer composer 接口**(**锁定**,同上):位于检索之后,输入为已过滤 Fragment 集合 + 问题,输出遵守 §6 契约;其生成式实现受 §9 许可限制,须授权后另行立项。

---

## 6. 回答输出契约

### 6.1 证据链结构

每个回答必须可分解为:

```
答案(Answer)
  → 知识单元(Knowledge Unit, concept + claim + conditions)
    → 来源片段(Source Fragment, verbatim_text + text_hash)
      → 页码/位置(page_index/page_label;web 来源为章节小节标识)
        → 来源(manifest source_id + asset_version)
```

### 6.2 硬性规则

- **来源支持部分 vs 系统推断部分必须分列标注**:凡逐字可由 Fragment 支撑的内容标"来源支持",凡由 Unit 组配/推理得出的内容标"系统推断",不得混排;
- **禁止伪引用**:任何引用必须在对应来源版本中逐字存在(quoteHash 机检,与机械门禁同口径);引用一致率要求 100%,伪引用容忍度 0;
- **无来源支撑即拒答**:检索与 Unit 层均无支撑时,返回固定话术"**当前知识库不足以支持该判断**",并列出缺口(缺哪类来源/哪个概念无 Unit),不得编造来源、页码或表述;
- 拒答本身留痕(对齐 product core `NO_KNOWLEDGE_EVIDENCE` 显式标记先例);
- 引用 `rejected` / 未过 `review_status` 门禁的内容不得进入面向学生的正式输出(对齐 B9/B11 精神)。

---

## 7. 与 Product Core 的集成点

| 集成点 | 契约 |
|---|---|
| 工作流挂接 | 知识检索/答案组装作为 product-core 工作流的证据环节运行时,记录 `workflow_instance_id`(migration 005 已强制 teaching_claims 维度,知识层沿用同一字段语义) |
| 证据引用 | 沿用 evidence-reference schema(1.0.1 已将 sourceId 放宽含 `ka_/kav_/blk_`);知识证据走 knowledge_block 通道,机械门禁对 verbatimQuote 逐字校验 |
| 教师裁决审计 | Unit/UseObject 的教师审核沿用 `teacher_decisions` 追加式 + `audit_events` 全维度(workflow/entity/actor/schema_version),裁决改变 = 追加新记录(B5) |
| 知识版本留存 | 答案落盘时记录其依据的 `asset_version` 集合(绑定版本,非浮动指针);库版本演进(supersede)后,历史答案的依据版本仍可识别、可重放(B3) |
| Schema 读写 | 既有六 schema 维持"1.0.0 可读、1.0.1 新写"的 `getWriteSchemaVersion()` 分发;KB 新增 schema 独立起版,变更走 S2/S3 升级纪律 |
| 库版本变化识别 | 每次检索响应携带语料版本标识(asset_version 集合摘要 hash),同一问题在不同语料版本下的答案差异可比对 |

---

## 8. 退出条件(10 条)与首轮目标值

开工闸后以下 10 条全部达成方可宣告 v0.1 完成;首轮目标值随条目冻结。**注意:24 题实测为"参考检索实测"(非模型检索通道),不是 AI 管线实测——当前无任何题目标 ready_for_ai_pipeline,AI 管线指标待至少一项明确 AI 授权的本土来源到位后另行定义。**

1. **来源入库保真**:两份 OpenStax 完成 Fragment 级解析入 `content_blocks`(deterministic parsing,属 acquired_reference_only 允许操作,产物仅服务非模型检索),入库后 `file_hash` 与 manifest 复核一致,`reviewed=false` 如实继承;
2. **知识单元规模**:Knowledge Unit 10–15 个,7 核心概念全覆盖,每个 Unit 至少绑定 1 个 `source_fragment_id`,无孤儿 Unit;
3. **教学用途对象**:每核心概念 ≥1 条 Use Object(优先 misconception 与 diagnostic_question),全部初始 `machine_extracted`;
4. **migration 纪律**:006 空库可建、幂等;000–005 文件 hash 与 `schema_migrations` 记录逐字不变;
5. **金标准锚定**:30 条验收题中 `ready_for_reference_retrieval` 题(24 条)全部完成五元组锚定(documentId+version+page/小节+verbatimQuote+quoteHash),`pending_source` 题如实挂起;锚定未匹配即失败、不移出分母;
6. **检索通道就绪**:分词通道 + 字段过滤 + 分值门槛 + 相邻合并去重全链路跑通,探针级复测记录留档;
7. **定位准确率 ≥ 95%**:`ready_for_reference_retrieval` 题集中,系统返回的首个证据 Fragment 与金标准锚定 Fragment 一致的比例;
8. **核心概念召回 ≥ 90%**:按 7 概念分桶统计的概念相关题召回;
9. **引用一致率 100% 且伪引用 = 0**:输出引用全部通过 quoteHash 逐字机检;任一引用不存在于所引来源版本即整体失败;
10. **拒答正确率 100%**:2 条 refusal 题 + 探针无答案题应拒尽拒(返回"当前知识库不足以支持该判断"),且 `ready_for_reference_retrieval` 题零误拒;refusal 题仅用于验证系统契约与确定性检索,**不得用 OpenStax 内容测试 LLM 拒答**;同时许可合规审查通过(§9 全部处置落实)。

---

## 9. 许可与合规风险专章

### 9.1 事实

- 两份已获取 OpenStax 来源的现行许可为 **CC BY-NC-SA 4.0**(署名—非商业性使用—相同方式共享),**不是** CC BY 4.0;2026-08-03 经官网逐页核实(书级元数据 + 前言 + 页脚三处一致)。正文 2019 年遗留图注中的 "CC-BY 4.0" 字样为历史残留,以书级声明为准。
- OpenStax 在每页 Citation/Attribution 面板另附声明,逐字:"This book may not be used in the training of large language models or otherwise be ingested into large language models or generative AI offerings without OpenStax's permission."

### 9.2 处置(冻结为系统约束,非倡议)

1. **usage_scope 限制(2026-08-03 校正,manifest 登记为 `acquisitionStatus: acquired_reference_only`)**:两份 OpenStax 来源降级为"**仅参考、禁止模型处理**",允许用途仅三项——**(a) 开发样本**(解析器/锚定机制的开发调试样本)、**(b) 非神经检索基准语料**(exact/lexical/中文分词 FTS5/BM25/元数据精确过滤/锚点定位)、**(c) 教师人工对照**(教师人工阅读与审核对照);**禁止作为生成式知识库的模型语料**。**任何将来源文本送入模型的用途**(prompt 上下文、RAG 生成输入、LLM 抽取/摘要、微调/训练数据、生成式派生内容)均须取得 OpenStax 许可;**embedding 按保守解释视为被禁止的 AI ingestion**,同属禁止;授权记录写入 manifest `notes` 与来源元数据后方可解锁;未授权前 answer composer 的生成式实现不得接入这两份来源。
2. **署名**:任何展示这两份来源内容的界面/文档必须携带官方 attribution 字符串("Access for free at https://openstax.org/books/principles-management/pages/1-introduction")及许可标识。
3. **相同方式共享(SA)**:基于 OpenStax 内容改写形成的派生物(如改写版 Knowledge Unit 定义)若对外发布,须以 CC BY-NC-SA 4.0 相同许可发布并署名;课程内部教学使用的定性由教师/负责人确认。
4. **非商业(NC)**:知识库输出不得进入任何商业性产品口径。
5. **待提供来源的版权纪律**:主教材/教师 PPT/年报/医药背景材料入库前必须完成版权确认与脱敏流程(manifest notes 逐条要求),《药事管理学》类受版权约束教材仅可本地使用、需可入库脱敏节选(对齐 experiments/document-parsing/corpus-manifest.json 已有 blocked 记录)。
6. **校审状态如实**:`reviewed: false` 贯穿元数据、检索过滤(`review_status`)与输出标注;教师校审是 `teacher_verified` 状态流转的唯一通道。

### 9.3 风险登记

| 风险 | 等级 | 缓解 |
|---|---|---|
| 误将 OpenStax 文本送入 LLM(违反附加声明) | 高 | §9.2.1 系统约束 + embedding/重排/answer composer 模型类通道默认锁定、不接入该来源 + 审计留痕 |
| 权变因素覆盖缺口(两章无 contingency 显式表述) | 中 | 候选来源 src_openstax_pom_ch03_s3_7 登记在册;相关验收题标 pending_source/refusal,不用现有文本硬答 |
| 主教材/大纲长期缺位导致课程口径缺失 | 中 | manifest 中 awaiting_teacher_provided 逐条跟踪;涉及本土表述的题全部 pending_source |
| 中文分词通道 OR 语义误召回 | 中 | §5.2 分值门槛 + 拒答契约兜底 |

---

## 附录 A. 验收问题分布自检(对 organization-design-evaluation-set.json)

| 维度 | 计数 |
|---|---|
| type: concept_location / comparison / condition_boundary / case_judgment / misconception / refusal | 10 / 5 / 5 / 5 / 3 / 2(合计 30) |
| status: ready_for_reference_retrieval / ready_for_ai_pipeline / pending_source | 24 / 0 / 6 |
| 24 题实测性质 | 参考检索实测(非模型检索通道),非 AI 管线实测;refusal 2 题仅验证系统契约与确定性检索,不得用 OpenStax 内容测试 LLM 拒答 |
| shouldRefuse: true | 2(od-eval-29、od-eval-30,均 pending_source) |
| 任务书 5 示例题落位 | 管理幅度↔管理层次 = od-eval-11;职能制 vs 事业部制 = od-eval-12;分权≠失控 = od-eval-26;创新团队机械/有机 = od-eval-21;扁平化是否必然提效 = od-eval-19(condition_boundary) |
| targetConcepts 覆盖 | 7 核心概念全部出现 ≥3 次 |

## 附录 B. manifest 条目状态统计(对 organization-design-source-manifest.json)

| status | 计数 | 条目 |
|---|---|---|
| acquired_reference_only(仅参考、禁止模型处理) | 2 | src_openstax_pom_ch10、src_openstax_pom_ch04_s4_3 |
| awaiting_teacher_provided(按首批语料优先级①→④) | 4 | src_teacher_ppt_orgdesign①、src_syllabus_mp②、src_textbook_main_orgdesign③、src_pharma_context_pack④ |
| awaiting_company_selection(public_official_source_candidate) | 1 | src_annual_reports_2cos |
| candidate | 1 | src_openstax_pom_ch03_s3_7 |
| blocked | 0 | — |
| _excluded | 1 组 | evaluation/fixtures/documents 虚构样例 13 份(非知识来源) |

2026-08-03 权限模型校正:manifest 顶层新增 `permissionModel`(检索与模型处理为两类权限,逐来源逐项授权);全部来源条目以 `allowedOperations`/`blockedOperations` 表达权限,待提供来源留空数组并在 notes 注明"权利范围待确认"。
