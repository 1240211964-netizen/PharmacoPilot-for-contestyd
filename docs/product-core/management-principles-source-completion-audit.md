# 管理学原理知识库 v0.1 — 权威来源补全(source-completion)开工审查记录

- 任务:`management-principles-kb-v0.1-source-completion` Step 1(审查)+ Step 2(开工闸)
- 审查时间:2026-08-04T09:03Z(UTC)
- 分支:`feat/management-principles-kb-v0.1`,HEAD:`33120fe1ec08e2dca855ddc214e469cf7f547f60`
- 本文件与 `docs/knowledge-base/gate-source-completion.json` 为本次唯一新增产物;未改动 30 题内容、manifest 来源内容或任何代码。

## 1. 现状核实(以仓库事实为准)

| # | 核实项 | 结果 | 证据 |
|---|--------|------|------|
| 1 | 当前 branch / HEAD | `feat/management-principles-kb-v0.1` / `33120fe`,与预期一致 | `git branch --show-current && git rev-parse HEAD` |
| 2 | migration 000–007 是否齐全 | 齐全,000_baseline → 007_kb_retrieval_evidence 共 8 个文件,且全部在 HEAD 树中 | `git ls-tree HEAD server/migrations/` 输出 8 行;`server/migrations/007_kb_retrieval_evidence.sql` blob `3c0d6744` |
| 3 | `npm run test:backend` | **175 pass / 0 fail**(tests 175, pass 175, fail 0),与预期 175/175 一致 | 测试尾部输出:`# tests 175 / # pass 175 / # fail 0`,duration ≈1.92s |
| 4 | evaluation-set 30 题三态分布 | `ready_for_reference_retrieval`:24,`pending_source`:6,`ready_for_ai_pipeline`:**0**(三态定义存在,但当前无任何题达到 AI 管线可用态,与 statusDefinitions 自述一致) | `docs/knowledge-base/organization-design-evaluation-set.json` `cases` 数组计数;`statusDefinitions` 字段 |
| 5 | manifest 权限字段与 defaultDeny 闸门 | `permissionModel.defaultDeny`:"未列入 allowedOperations 的操作一律视为禁止;授权变更须留痕";两份已获取 OpenStax 各声明 allowed 6 项(仅 archival/hash/确定性解析/词汇检索/锚点定位/人工阅读)、blocked 7 项(embedding/neural rerank/LLM 提取/摘要/注入/微调/派生内容);`aiProcessingPolicy: prohibited_without_explicit_permission`;4 项 awaiting 来源 allowed/blocked 均留空(权利范围待确认);1 项 candidate(3.7 节)按同等边界预登记 | `organization-design-source-manifest.json`:`permissionModel`、`sources[].allowedOperations/blockedOperations/aiProcessingPolicy` |
| 6 | evidence_links 集成(migration 007)是否在 HEAD | 在 HEAD。007 放宽 `evidence_links.claim_id` 并关联 `retrieval_run_id`(表重建),由 HEAD commit `33120fe` 引入 | HEAD commit message;`git ls-tree HEAD server/migrations/007_kb_retrieval_evidence.sql` 命中 |
| 7 | OpenStax 是否零模型处理 | 是。`server/` 内 grep `embedding|openai|anthropic|llm` 仅 4 处命中,均为权限闸门声明或测试断言,无任何 embedding/LLM 调用路径:`knowledge-retrieval-service.mjs:4` 注释"无任何模型调用(embedding/LLM 通道被 §5 权限闸门锁定,本服务不实现也不调用)";`knowledge-source-service.mjs:8` 权限模型注释;`mechanical-gates.mjs:2`"纯确定性,不调用任何 LLM";`knowledge-base.test.mjs:377` 断言 `blockedOperations.includes("llm_extraction")` | Grep `server/` 目录 |

补充观察(如实记录,非阻塞):

- 工作区存在与本任务无关的未提交改动(前端 `shared/`、`index.html` 等约 30 个文件 + 未跟踪 `HANDOFF.md`/`THEORY-AUDIT.md`/`output/`/`outputs/`);本次提交仅 `git add` 指定的两个新文件,不触碰这些改动。
- manifest 中 `src_openstax_pom_ch04_s4_3` 有一条已知元数据瑕疵(front-matter docId 写作整章标识 `doc_openstax_pom_ch04`,实际内容仅 4.3 节),已在该条目 notes 中留痕,入库时应登记为节级标识——如实转录,不在本步修正。

## 2. 六条 pending_source 题逐条分析

6 题分三类阻塞根因:**A. 课程口径来源待教师提供**(主教材/教师 PPT,涉版权与脱敏流程);**B. 医药行业制度材料脱敏/校对未完成**;**C. 企业名单未定,年报无从获取**。另有 1 个候选来源(OpenStax 3.7 节)未抓取、是否纳入待教师确认。

| question_id | 查询内容(原文) | 缺失知识类型 | 需要的来源类别 | 目标来源(文件级) | 当前阻塞原因 |
|---|---|---|---|---|---|
| od-eval-15 | 本课程指定主教材与教师 PPT 对'集权与分权''管理幅度与管理层次'的表述,与 OpenStax 两份来源在术语与侧重点上有哪些差异? | 课程口径本土表述:中国主教材与教师 PPT 对集权/分权、管理幅度/层次的原文(含译名对应、幅度经验数值、权责对等原则等本土特有表述) | 主教材章节文本 + 教师讲义 | `src_textbook_main_orgdesign`(主教材组织设计章相应小节)、`src_teacher_ppt_orgdesign`(教师 PPT);OpenStax 侧已到位(ch10、ch04_s4_3) | 两类来源均 `awaiting_teacher_provided`:主教材受版权约束,尚无取得授权的可入库脱敏节选;教师 PPT 未提供,权利范围(allowed/blockedOperations)留空待确认 |
| od-eval-20 | 在 GSP 等药品经营监管要求下,医药商业企业设置质量管理机构时,其组织结构设计有哪些特殊边界条件? | 医药行业监管制度文本的具体条款(GSP 等对质量管理机构设置、质量负责人权责的强制性要求) | 药品监管制度文本(GSP 及配套规范,同类别还包括《药品管理法》MAH 条款、药事委员会相关规定等) + 主教材情境因素章节 | `src_pharma_context_pack`(制度文本,条款号锚定)、`src_textbook_main_orgdesign` | 真实 GSP/GMP 类政策 PDF 虽有公开来源,但脱敏与人工校对稿未完成;主教材同上未到位 |
| od-eval-24 | 根据所提供的两家医药企业年度报告,分别判断其组织结构更接近哪种类型,并给出年报中的依据。 | 真实企业组织事实:两家医药企业年报中公司治理/组织架构披露章节的逐字原文 | 企业官方披露文件(公司官网/证券交易所渠道的年报原文) | `src_annual_reports_2cos`(两家企业年报"公司治理/管理层讨论"节) | `awaiting_company_selection`:企业名单未定(三种案例选择原则待教师确认),名单不定则无从从官方渠道获取年报 |
| od-eval-25 | 依据两家医药企业年报披露的组织结构与研发布局,哪一家的结构更有利于创新药研发?请给出条件化判断。 | 同上(年报组织+研发布局事实),另需行业背景材料支撑"创新导向→更有机结构"框架在医药情境的应用 | 企业年报 + 医药行业背景材料 | `src_annual_reports_2cos`、`src_pharma_context_pack`;OpenStax ch10 框架侧已到位 | 双重阻塞:年报因企业名单未定不可得;背景材料脱敏/校对未完成 |
| od-eval-29 | 请完整列出组织设计需要考虑的权变因素(contingency factors)清单,并说明各因素对结构选择的影响方向。 | 权变因素的显式权威表述——现有两份 OpenStax 均无 contingency 显式表述(FETCH-NOTES.md §3 已记录该缺口) | 管理学教材权变理论章节 + 主教材对应章节 | `src_openstax_pom_ch03_s3_7`(OpenStax 3.7 节 Contingency and System Management,candidate)、`src_textbook_main_orgdesign` | 3.7 节未抓取,且该节属第 3 章(管理思想史视角),是否纳入组织设计章知识范围须教师确认;主教材未到位。本题为 shouldRefuse 拒答用例,金标准为固定拒答话术+缺口说明 |
| od-eval-30 | 本课程主教材中'权责对等原则'的原文表述是什么?它与 OpenStax 的 command-and-control、centralization 表述有何异同? | 主教材"权责对等(权责一致)原则"原文表述(本土教材特有概念,OpenStax 仅有相邻概念 command-and-control/centralization) | 主教材章节文本(原文逐字,版本+页码) | `src_textbook_main_orgdesign`(主教材"权责对等"段落,页码锚);OpenStax 侧已到位(ch10、ch04_s4_3) | 主教材 `awaiting_teacher_provided`,版权/脱敏流程未走完,原文无法核验。本题为 shouldRefuse 拒答用例 |

共同约束(转录自 evaluation-set usageNote,适用于 od-eval-29/30 及后续 LLM 类测试):OpenStax 文本禁止送入 LLM,LLM 拒答类测试须待至少一项明确 AI 授权的本土来源到位后另行设计;pending_source 题不计入 ready_for_reference_retrieval 题指标分母。

## 3. 开工闸

闸文件:`docs/knowledge-base/gate-source-completion.json`(schemaVersion `1.0.0`,gate `source-completion`),冻结以下基线:source manifest sha256、evaluation-set sha256、migration 000–007 清单及逐个 sha256、`npm run test:backend` 175/175 结果、branch/HEAD。后续任何来源补全工作以该闸为对照基线;30 题、manifest 来源内容、代码在本闸下均为只读。
