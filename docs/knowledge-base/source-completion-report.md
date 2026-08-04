# management-principles-kb-v0.1 · 权威来源补齐实现报告

- 版本:v1.0.0 · 日期:2026-08-04 · 分支:`feat/management-principles-kb-v0.1`
- 范围:`management-principles-kb-v0.1-source-completion`
- 上一基线:`product-core-s1-baseline`(8d7594a)

---

## 1. 最终状态

《管理学原理》"组织设计"章节知识库已建成三层真实知识资产(theory / pharma_context / company_fact),全部来自 Authority 1–2 级官方来源,确定性解析、零模型处理、权限 defaultDeny、逐层可追溯。30 条验收题全部有明确终态(28 ready_for_reference_retrieval + 2 pending_source 如实保留),复验四门槛全达。AI/Embedding 管线保持锁定。

## 2. 已完成内容(按提交序)

| 提交 | 内容 |
|---|---|
| `8060369` | 开工闸:状态审查(6 题阻塞分析)+ hash 冻结(manifest/30题/migration 000–007/测试基线 175) |
| `05ba4a3` | 四路权威来源下载(28 acquired/2 blocked)+ registry 合并 + 权限登记(31 条 sha256 全量复核一致) |
| `9717f18` | migration 008(8 张新表)+ paginated-text parser + 摄入管线(30 条落库,7603 blocks) |
| `794672a` | 三层单元构建(theory+12 / pharma 148 / company 25)+ 关系 13 + gaps 流转(4 resolved/2 open) |
| `c7c4039` | 教师审核 API(`/api/product-core/kb/` 6 路由)+ Product Core 闭环接线 |
| `12c3917` | 30 题复验:跨语言桥接通道 + NUL 截断修复 + 10 短词 + 同义词别名表 + 指标矩阵 |
| (用户提交)`c2d4d7f` | 教学数据决策摘要页 V1(用户本人工作,夹在分支历史中,与本轮无关) |

(报告提交与干净 checkout 证据为最后一个提交,见 §10。)

## 3. 来源清单(28 acquired + 2 blocked + 1 substituted 组)

### Theory(8 条 acquired_reference_only,authorityLevel 2)
- OpenStax《Principles of Management》ch10 全章、§4.3、§3.7(权变,本轮新补)——CC BY-NC-SA 4.0 + OpenStax LLM 摄入声明,reference-only;
- MIT OCW 15.320 Strategic Organizational Design:syllabus + Lec03/05/12——CC BY-NC-SA 4.0;Lec01 纯图片幻灯片 **blocked**(无 OCR,未补内容)。

### Pharma Context(15 条 acquired,authorityLevel 1)
- 中国法规 9 份:药品管理法(2019,主席令第31号)、**实施条例(2026 第四次修订,国务院令第828号)**、GMP(2010,卫生部令第79号)、MAH 委托生产公告(2023年第132号)、受托生产公告(2025年第134号)、医疗机构药事管理规定(卫医政发〔2011〕11号)、处方审核规范(**国卫办医发〔2018〕14号**,修正任务书"25号")、抗肿瘤药物管理办法(国卫医函〔2020〕487号)、集采常态化意见(国办发〔2021〕2号);
- 国际标准 6 份:ICH Q10(2008 Step4)、FDA QS Approach(2006 Final)、EU GMP Vol.4 Ch.1+Ch.2、EMA GVP Module I、WHO DTC 实践指南(2003)。

### Company Fact(8 条 acquired,authorityLevel 1)
- 国内 FY2025 年报(巨潮官方静态 PDF):恒瑞医药、药明康德、上海医药、益丰药房;
- 国际:Pfizer 10-K、CVS Health 10-K(SEC EDGAR HTML)、Roche AR2025、AstraZeneca AR2025(官方 PDF)。

### 阻塞记录(如实)
- OCW Lec01(图片型 PDF,无文本层);NMPA 三页 WAF 412(已用 npc.gov.cn/gov.cn 公报/samr.gov.cn 官方替代);gov.cn 三条死链未采用;flk.npc.gov.cn 动态 API 未绕过。明细见各层 DOWNLOAD-LOG.md。

## 4. 权限状态

- 全部 31 条:llmInputAllowed=false、embeddingAllowed=false、publicRedistributionAllowed=false(机器自检 31/31);
- 中国法规:官方文件(著作权法第五条),deterministicParsing/lexicalIndexing allowed,permissionStatus=pending_teacher_confirmation;
- 国际标准/企业披露:研究内部使用,pending_teacher_confirmation;
- OpenStax/OCW:acquired_reference_only,blockedOperations 含全部模型处理;
- 检索落库自检:300 条 evidence_links 全部来自 lexicalIndexingAllowed=1 来源,未授权泄漏 0。

## 5. 30 题结果(acceptance-v2,2026-08-04T12-59-35Z)

| 指标 | 结果 | 门槛 | 判定 |
|---|---|---|---|
| ready / pending / out_of_scope | 28 / 2 / 0 | — | 全部有明确终态 |
| 来源定位准确率 | 27/28 = **96.4%** | ≥95% | PASS |
| 核心概念召回率 | 47/50 = **94.0%** | ≥90% | PASS |
| 引用一致率 | 280/280 = **100%** | 100% | PASS |
| 伪引用 | **0** | 0 | PASS |
| 无证据强答 | **0** | 0 | PASS |
| 未授权内容泄漏 | **0** | 0 | PASS |
| 课程口径优先率 | **N/A** | — | 主教材/大纲未到位,无法测量,不粉饰 |
| evidence_links 完整性 | 300 行 / 30 run,零 mismatch | 一致 | PASS |

6 条 pending 终态:od-eval-20/24/25/29 → ready(复验命中);od-eval-15/30 → 保持 pending_source(主教材/教师PPT缺失;od-eval-30 拒答契约经"诉求短语缺失"路径验证成立)。
残留(未移出分母):od-eval-29 为唯一定位 miss(§3.7 实例在 limit=10 未进 top10,概念经 mention 召回);概念未召回 3 处(od-eval-20×2、od-eval-24×1)。
短词通道:组织/授权/矩阵/质量/委托/药事/采购 7 词逐字命中;分权/集权/权责 3 词语料无逐字(如实记),经别名桥接命中理论层。

## 6. 测试

- `npm run check`:**exit 0**;后端 **216 pass / 0 fail**;前端 verify 15/15;build --check 通过。
- 关键新增测试:migration 008 约束/触发器/幂等、parser 页锚/行锚/确定性、摄入 hash 篡改 FAIL、权限闸门 FAIL、三层单元与关系、审核 API 10 例、短词/别名/五维过滤/拒答锁定、解析完整性全库机检。

## 7. 干净 checkout

`git worktree` 于 /tmp 干净拉出 `12c3917`(无 node_modules、无 .pharmaco-data)→ `npm ci`(53 包)→ `node build.mjs` → `npm run check` **exit 0**(216/216 + 前端 15/15);再跑 `run-acceptance-v2.mjs` **exit 0,全部门槛复现达成**(结果 `acceptance-v2-2026-08-04T13-05-33-885Z.json`,独立复现 27/28 定位、拒答路径、10 短词通道与原库一致)。migration 000–008 从零重建由测试套件覆盖(空库全量用例)。已知脆弱性保留:build --check 按 mtime 判 bundle 新鲜度,干净 checkout 须先 build 再 check。

## 8. 未完成项

1. od-eval-15/30 仍为 pending_source——需要教师提供主教材"组织设计"章与自编 PPT/讲义;
2. 课程口径优先率不可测量(同上原因);
3. OCW Lec01 blocked(扫描件,待人工 OCR 或替代讲义);
4. AI/Embedding/LLM 管线全部锁定——需逐项授权 + 独立 holdout 后才可另开任务解锁;
5. relations 5 条 notBuilt(theory 层缺"专业权力/委员会制/分权/幅度↔层次/集权↔分权"对应单元——§3.7 无 Key Terms 小节,OCW 讲义规则未覆盖这些中文概念对;需人工录入或后续规则扩充)。

## 9. 风险

- **MEDIUM**:build.mjs --check 用 mtime 判 bundle 新鲜度,干净 checkout 需先 build 再 check(已知脆弱性,非本轮引入);
- **MEDIUM**:跨语言检索依赖显式别名表+桥接通道;别名表是人工维护的单一事实源,覆盖不全时召回下降(od-eval-29 残留 miss 即此类);
- **LOW**:pharma-cn 的 sha256 登记语义为抽取稿(其余层为 raw 原件),已在 manifest 以 rawSha256 补登区分;
- **LOW**:AS 实体列表中 aspect 未加 DB CHECK(词表服务层维护),若词表漂移需数据清洗;
- **LOW**:company 10-K 为 HTML 无页码,锚点为 Item/行号,重解析后行号可能漂移(re-resolution 纪律已覆盖)。

## 10. 修改文件清单与提交清单

修改文件:见各提交(`git log product-core-s1-baseline..HEAD`)。本报告为收尾提交,另附干净 checkout 证据。

## 11. tag 条件判断

| 条件 | 状态 |
|---|---|
| 30 题均有明确终态 | ✓(28 ready + 2 pending_source,无隐瞒) |
| 所有新增来源权限明确 | ✓(31/31 机器自检) |
| 所有单元可追溯 | ✓(fragments 强制关联) |
| 引用和拒答通过 | ✓(280/280,2/2 拒答契约) |
| 教师审核闭环通过 | ✓(API + 审计 + case_candidate 纪律) |
| npm run check 全绿 | ✓(216/216 + 15/15) |
| 干净 checkout 全绿 | ✓(12c3917 干净拉出,check exit 0,验收复现全绿,§7) |
| AI 管线状态明确 | ✓(锁定,解锁条件已列) |
| 最终报告完成 | ✓(本文件) |
