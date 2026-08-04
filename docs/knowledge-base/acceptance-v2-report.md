# 知识库 v0.1 检索复验报告(30 题,权威语料)

- 日期:2026-08-04
- 复跑脚本:`experiments/kb-retrieval/run-acceptance-v2.mjs`(确定性,零模型调用)
- 结果文件:`experiments/kb-retrieval/results/acceptance-v2-2026-08-04T12-59-35-026Z.json`
- 语料:7603 块(theory 408 / pharma_context 1106 / company_fact 6089;legacy 2 份 OpenStax + 权威 manifest 28 条,1 条 blocked 不摄入);单元 theory 67 / pharma_context 148 / company_fact 25;关系 13
- 题集:`organization-design-evaluation-set.json` 30 题(ready 28 / pending_source 2 / out_of_scope 0)
- 分母纪律:来源定位准确率与概念召回率分母 = status=ready_for_reference_retrieval 的 28 题;pending_source 2 题全量跑检索验证拒答/缺口路径,不计入分母。

## 一、指标矩阵(对照门槛)

| 指标 | 结果 | 门槛 | 结论 |
| --- | --- | --- | --- |
| 来源定位准确率 | 27/28 = 96.4% | ≥95% | 达标 |
| 核心概念召回率 | 47/50 = 94.0% | ≥90% | 达标 |
| 引用一致率(verifyCitations 逐字复核) | 280/280 = 100% | =100% | 达标 |
| 伪引用(content_hash 重算不一致) | 0 | =0 | 达标 |
| 无证据强答(pending 题诉求短语缺失路径) | 0 | =0 | 达标 |
| 未授权内容泄漏(逐条复核 + blocked 来源) | 0(300 条结果全授权;blocked 零块零结果) | =0 | 达标 |
| evidence_links 集成 | 300 行/30 run,每 run 行数=结果数 | 全一致 | 达标 |
| 课程口径优先率 | N/A(主教材/大纲未到位,课程口径来源缺失,无法测量) | — | 如实记 N/A |

唯一 miss:od-eval-29(权变因素清单)。预期来源 `openstax-pom-ch03-3-7`(3.7 实例)在默认 limit=10 下未进 top10;limit=50 探查名次 25/50,top10 由 ch10/4.3 的权变内容占据(理论层权变内容已命中,概念"组织设计的情境因素"经 mention 召回)。如实记录,不移出分母、不改判定口径。

概念召回未召回 3 处:od-eval-20(组织设计的情境因素、部门化)、od-eval-24(部门化)——该二题预期来源为法规/年报层,返回片段以中文制度/披露文本为主,理论层片段未进其结果前列;对应概念无单元链接(theory 单元不含此概念)且返回文本无别名提及。如实记录。

## 二、根因诊断与修复(相对 12-10-43 基线:定位 14/28、召回 44/50、伪引用 1)

基线症状:14 题理论来源(OpenStax)整体缺席 top10;1 例 content_hash 与 content_raw 重算不一致。

### 根因 1:NUL 截断导致伪引用(已修)

益丰年报 PDF 机器抽取稿含 10 处 U+0000;`node:sqlite` 绑定 TEXT 时在 NUL 处截断,落库的 `content_raw` 是截断串,而 `content_hash` 按完整串计算——两者永不一致(引用完整性机检必判伪引用),且 NUL 之后正文静默丢失。
修复:`server/document-parsers/paginated-text-parser.mjs` 在产出 block 时确定性剔除 U+0000(锚点行号不受影响),`content_hash` 与最终落库文本恢复可互相机检。全库 7603 块重算复核 0 不一致;原截断块全文(如"集采商品定价"段)已回库。

### 根因 2:中英混合语料下 OR 语义 + bm25 把理论片段挤出 top10(已修)

中文题面的高频共享词(组织/结构/设计,df 数千)在 7603 块混合语料上把只含英文核心词的理论片段挤到 10–29 名,被 limit=10 截断。显著词通道(distinctive)抗挤占有效但不足以逆转:RRF 融合每次只传名次不传分数,中文噪声块在"通用 + 显著词"两个通道都名列前茅,双通道叠加后总分超过只在单一通道出现的理论块(实测:通用通道 top1 已是理论块,显著词融合后 top10 全变中文)。
修复:`server/product-core/knowledge-retrieval-service.mjs` 新增跨语言桥接通道(segmented_bridge,文件头通道 6)——桥接词集 = 题面自写拉丁词元(如 contingency/departmentalization,用户已自行完成跨语言桥接)+ 词典扩展(CONCEPT_QUERY_ALIASES/COURSE_TERM_ALIASES)的拉丁面形,在分词通道单独重跑,过同样两道门禁(覆盖率分母=桥接词集,门禁口径未降),并按"通用 → 显著词 → 桥接"的确定顺序做 RRF 融合,把最终抬升位留给桥接通道(查询语义的跨语言直接承载)。纯中文查询(无拉丁词元)与纯英文查询(桥接词集与有效词集重合)通道不启用,行为与先前一致;OOV 拒答路径不受影响(题面无注册外文词元时桥接词集为空)。

未改题目、答案要点、门槛;判定逻辑未动(expectedSourceIds 的 SOURCE_RESOLUTION 映射沿用上轮登记)。

## 三、各来源命中分布(全部 30 题、300 条结果)

按层:theory 234 / company_fact 49 / pharma_context 17。

按来源(top):src_openstax_pom_ch10 167、src_openstax_pom_ch04_s4_3 50、doc_wuxiapptec_603259_ar2025 15、doc_yifeng_603939_ar2025 14、doc_hengrui_600276_ar2025 10、doc_shanghaipharma_601607_ar2025 9、ocw-15-320-s11-lec03 8、cn-med-inst-pharm-admin-2011 5、ocw-15-320-s11-lec05 4、cn-drug-admin-law-2019 4、openstax-pom-ch03-3-7 3、cn-gmp-2010 3,其余来源各 1–2。blocked 来源(ocw-15-320-s11-lec01)0 块 0 结果。

expectedSourceIds 聚合占位解析(题目内容不动,解析规则显式登记于 runner SOURCE_RESOLUTION):`src_pharma_context_pack` → pharma_context 层 15 条;`src_annual_reports_2cos` → company_fact 层 8 家(题面"两家"与入库 8 家的口径差异不改题目);`src_openstax_pom_ch03_s3_7` → 实例 `openstax-pom-ch03-3-7`(supersedes 登记);主教材/教师 PPT 未到位不可解析,缺口如实记录且不移出分母(所涉 4 题另有可解析预期来源)。

## 四、短词通道(10 词)

| 词 | 通道 | 结果数 | 逐字命中 | 层分布 t/p/c | top 来源 |
| --- | --- | --- | --- | --- | --- |
| 组织 | segmented | 10 | 是 | 0/10/0 | cn-prescription-review-2018 |
| 授权 | segmented | 10 | 是 | 0/6/4 | cn-drug-admin-law-implementing-reg-2026 |
| 分权 | segmented | 10 | 否 | 9/0/1 | src_openstax_pom_ch10 |
| 集权 | segmented | 10 | 否 | 8/0/2 | src_openstax_pom_ch10 |
| 权责 | segmented | 10 | 否 | 8/1/1 | src_openstax_pom_ch10 |
| 矩阵 | segmented | 10 | 是 | 9/0/1 | src_openstax_pom_ch04_s4_3 |
| 质量 | segmented | 10 | 是 | 0/10/0 | cn-gmp-2010 |
| 委托 | segmented | 10 | 是 | 0/7/3 | cn-mah-contract-mfg-supervision-2023-132 |
| 药事 | segmented | 10 | 是 | 0/10/0 | cn-med-inst-pharm-admin-2011 |
| 采购 | segmented | 10 | 是 | 0/4/6 | cn-vbp-normalization-2021-2 |

10/10 有命中、无 insufficientEvidence。语料无逐字的中文词元(分权/集权/权责)经概念别名桥接命中理论层(centralization/chain of command 等),如实记"逐字=否";逐字存在的 7 词全部命中中文法规/披露语料。

## 五、同义词别名表(显式常量,单一事实源)

`COURSE_TERM_ALIASES`(`knowledge-retrieval-service.mjs` 导出,Object.freeze 冻结数组):质量受权人↔QP↔Qualified Person、药物警戒↔pharmacovigilance、集采↔集中带量采购↔volume-based procurement、年报↔annual report↔10-K、GSP↔药品经营质量管理规范、GMP↔药品生产质量管理规范、MAH↔药品上市许可持有人、药事委员会↔DTC、委托生产↔contract manufacturing、处方审核↔prescription review。
与 CONCEPT_QUERY_ALIASES 的分工:概念表服务七大核心概念(查询扩展 + concept 过滤归并),术语表服务行业术语跨语言互指(查询扩展 + OOV 拒答豁免),不参与 concept 过滤。`aliasesOfTerm`/`expandQueryByTermAliases` 为唯一事实源,检索服务与测试共用。

## 六、6 题终态(eval-set 仅改 status/usageNote)

| 题 | 终态 | 依据 |
| --- | --- | --- |
| od-eval-20 | ready_for_reference_retrieval | 法规层(pharma_context 15 条)到位,复验命中;主教材未到位部分不得引用 |
| od-eval-24 | ready_for_reference_retrieval | company_fact 8 家年报/10-K 到位,复验命中;题面"两家"口径差异见 §三 |
| od-eval-25 | ready_for_reference_retrieval | 同上(年报 + 行业情境均可检索) |
| od-eval-29 | ready_for_reference_retrieval | 3.7 实例入库,contingency 可检索命中,OOV 拒答不再触发属预期;拒答设计语义复核:正确终态=可定位权变来源的参考检索,回答层须声明部分覆盖(完整清单仍缺主教材口径);残留:limit=10 下 3.7 实例未进 top10(计 miss,见 §一) |
| od-eval-15 | pending_source(保持) | 主教材/教师 PPT 仍 awaiting_teacher_provided,课程口径比对不可做;OpenStax 侧锚点已可用 |
| od-eval-30 | pending_source(保持) | 主教材未到位,"权责对等"原文无法核验;拒答契约由"诉求短语缺失"路径承载(复验:返回片段均不含该短语) |

pending 题缺口路径复验:od-eval-15/30 均经 demanded_content_absent 满足(诉求短语零出现、无伪装来源),无证据强答 =0。

## 七、五维精确过滤

layer(经 kb_chapter_sources)/ company(经 kb_company_fact_units)/ authorityLevel(经 kb_source_permissions)/ reviewStatus(三层单元并集)/ concept(概念别名归并,中文概念名命中英文 unit concept)逐维锁定于 `server/kb-retrieval-corpus.test.mjs`;非法过滤值显式报 KB_RETRIEVAL_INPUT_INVALID。

## 八、回归锁定

`server/kb-retrieval-corpus.test.mjs`(10 测试):10 短词逐词锁定、别名表结构与 OOV 豁免、五维过滤与非法值报错、拒答路径(OOV 固定话术 + channel 'none' + 零证据行、纯停用词、od-eval-30 型诉求短语缺失、blocked 来源零资产零块)、解析完整性(全库 content_hash ↔ content_raw 机检 + 益丰原截断块全文在库)。
