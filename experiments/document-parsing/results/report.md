# 文档解析器对比探针报告

- 生成时间：2026-08-03T10:45:47.170Z
- 语料清单：corpus-manifest.json（12 条）
- 纪律：环境装不上即记 BLOCKED(原因)，不允许跳过实测直接写结论；不可得项写 "N/A（环境阻塞，未伪造）"。

## 1. 语料状态

| sampleId | docType | status | 说明 |
|---|---|---|---|
| policy-article-sample | 中文政策 | available | 手写脱敏 Markdown（政策条款风，含第N条/（一）（二）子项/图注/pageMap） |
| rubric-scale-sample | 复杂量表 | available | 手写脱敏 Markdown（量表风，含多列 GFM 评分表/编号子项） |
| teaching-case-sample | 教学案例 | available | 手写脱敏 Markdown（案例风，reviewed=false 用于验证降级告警路径） |
| real-policy-gsp | 中文政策 | blocked | 真实 GSP/GMP 类政策 PDF 已有公开来源但尚未完成脱敏与人工校对稿制作；无校对稿则文本完整性指标无基准，按纪律不先跑 |
| real-normative-document | 规范性文件 | blocked | 校内红头规范性文件 PDF 含签发人/文号等敏感信息，脱敏流程未走完，原件未到位 |
| etextbook-chapter | 电子教材 | blocked | 《药事管理学》电子教材 PDF 受版权约束，仅可在本地使用且尚未取得可入库脱敏节选 |
| scanned-textbook | 扫描教材 | blocked | 无扫描件语料：纸质教材尚未扫描，且本机无 OCR 环境（manual-markdown 路径也需要先有人工校对底稿） |
| real-complex-scale | 复杂量表 | blocked | 真实临床/教学评估量表（如 SF-36、PSQ-18）版权受限，不可复制进语料库；需改写版，改写未完成 |
| multi-column-table-pdf | 多列表格 | blocked | 含跨页多列表格的真实 PDF（药品价格表/集采目录）尚未收集到位 |
| figure-text-mixed-pdf | 图文混排 | blocked | 图文混排真实 PDF（含流程图/结构图的教材章节）未收集；扫描+校对流程未启动 |
| header-footer-pdf | 有页眉页脚 | blocked | 带页眉页脚/页码的真实发文 PDF 未收集；该场景主要考验解析器去噪能力，需 mineru/docling 环境就绪后实测 |
| deep-clause-hierarchy | 条款层级 | blocked | 真实深度条款层级文本（章/节/条/款/项五级）已有候选法规 PDF，但人工校对稿未制作，无法作为基准 |

## 2. 各 parser 可用性（探针实测）

| parser | version | available | 原因 |
|---|---|---|---|
| manual-markdown | 1.0.0 | true | — |
| mineru | 0.1.0 | false | MinerU 需要 Python 环境与模型权重（通常需 GPU），本机未安装且本地优先纪律禁止装入系统环境；按契约只保留 adapter 桩与阻塞记录，不伪造解析结果。 |
| docling | 0.1.0 | false | Docling 需要 Python 环境与模型权重，本机未安装且本地优先纪律禁止装入系统环境；按契约只保留 adapter 桩与阻塞记录，不伪造解析结果。 |

## 3. manual-markdown 实测（available 样本）

### policy-article-sample（中文政策）— OK

| 指标 | 结果 |
|---|---|
| 文本完整性 | 10/10 块 normalizedText 非空（来源即人工校对稿，100% 为构造性结论，非 PDF 解析能力证据） |
| 引文匹配 | 100%（每块 normalizedText 直接源自校对稿 Markdown，可逐字回溯；不构成对 PDF 解析能力的证据） |
| 页码保留 | 9/10 块带 pageIndex（90%），pages=2 |
| bbox可用性 | 无 bbox 能力（bboxCoordinateSystem='none'），机械门禁记 NOT_APPLICABLE |
| 层级 | policy_clause 2 个，其中 2 个挂到 policy_article 父块；heading 3 个 |
| 阅读顺序 | 通过（readingOrder 严格递增） |
| 表格完整率 | 源文表格 0 张，检出 0 张（表头+0 数据行） |
| 耗时 | 2.77 ms |
| 降级路径 | 人工校正 Markdown → manual-markdown 结构化；originalFileHash=sha256:fdb76fbb8153a6c7…，correctedBy=教学团队，reviewStatus=reviewed，warnings=1 条 |

warnings:
- [PAGE_UNMAPPED] 1 个 block 位于首个 pageMap 锚点之前，pageIndex/pageLabel 置 null

### rubric-scale-sample（复杂量表）— OK

| 指标 | 结果 |
|---|---|
| 文本完整性 | 5/5 块 normalizedText 非空（来源即人工校对稿，100% 为构造性结论，非 PDF 解析能力证据） |
| 引文匹配 | 100%（每块 normalizedText 直接源自校对稿 Markdown，可逐字回溯；不构成对 PDF 解析能力的证据） |
| 页码保留 | 5/5 块带 pageIndex（100%），pages=1 |
| bbox可用性 | 无 bbox 能力（bboxCoordinateSystem='none'），机械门禁记 NOT_APPLICABLE |
| 层级 | policy_clause 2 个，其中 0 个挂到 policy_article 父块；heading 1 个 |
| 阅读顺序 | 通过（readingOrder 严格递增） |
| 表格完整率 | 源文表格 1 张，检出 1 张（表头+4 数据行） |
| 耗时 | 0.49 ms |
| 降级路径 | 人工校正 Markdown → manual-markdown 结构化；originalFileHash=sha256:78b55e182bbcfd8e…，correctedBy=教学团队，reviewStatus=reviewed，warnings=0 条 |

### teaching-case-sample（教学案例）— OK

| 指标 | 结果 |
|---|---|
| 文本完整性 | 8/8 块 normalizedText 非空（来源即人工校对稿，100% 为构造性结论，非 PDF 解析能力证据） |
| 引文匹配 | 100%（每块 normalizedText 直接源自校对稿 Markdown，可逐字回溯；不构成对 PDF 解析能力的证据） |
| 页码保留 | 7/8 块带 pageIndex（88%），pages=2 |
| bbox可用性 | 无 bbox 能力（bboxCoordinateSystem='none'），机械门禁记 NOT_APPLICABLE |
| 层级 | policy_clause 0 个，其中 0 个挂到 policy_article 父块；heading 3 个 |
| 阅读顺序 | 通过（readingOrder 严格递增） |
| 表格完整率 | 源文表格 1 张，检出 1 张（表头+2 数据行） |
| 耗时 | 0.15 ms |
| 降级路径 | 人工校正 Markdown → manual-markdown 结构化；originalFileHash=sha256:50e1d2a34be0290d…，correctedBy=教学团队，reviewStatus=unreviewed，warnings=2 条 |

warnings:
- [PAGE_UNMAPPED] 1 个 block 位于首个 pageMap 锚点之前，pageIndex/pageLabel 置 null
- [REVIEW_PENDING] front-matter reviewed=false：该校正稿未经复核，下游机械门禁应记 WARNING 而非 PASSED

## 4. mineru / docling：BLOCKED 记录

### mineru — BLOCKED

- 阻塞原因（parse() 实抛）：mineru 解析器不可用：MinerU 需要 Python 环境与模型权重（通常需 GPU），本机未安装且本地优先纪律禁止装入系统环境；按契约只保留 adapter 桩与阻塞记录，不伪造解析结果。
- 各项指标：
  - 文本完整性：N/A（环境阻塞，未伪造）
  - 引文匹配：N/A（环境阻塞，未伪造）
  - 页码保留：N/A（环境阻塞，未伪造）
  - bbox可用性：N/A（环境阻塞，未伪造）
  - 层级：N/A（环境阻塞，未伪造）
  - 阅读顺序：N/A（环境阻塞，未伪造）
  - 表格完整率：N/A（环境阻塞，未伪造）
  - 耗时：N/A（环境阻塞，未伪造）
  - 降级路径：N/A（环境阻塞，未伪造）

### docling — BLOCKED

- 阻塞原因（parse() 实抛）：docling 解析器不可用：Docling 需要 Python 环境与模型权重，本机未安装且本地优先纪律禁止装入系统环境；按契约只保留 adapter 桩与阻塞记录，不伪造解析结果。
- 各项指标：
  - 文本完整性：N/A（环境阻塞，未伪造）
  - 引文匹配：N/A（环境阻塞，未伪造）
  - 页码保留：N/A（环境阻塞，未伪造）
  - bbox可用性：N/A（环境阻塞，未伪造）
  - 层级：N/A（环境阻塞，未伪造）
  - 阅读顺序：N/A（环境阻塞，未伪造）
  - 表格完整率：N/A（环境阻塞，未伪造）
  - 耗时：N/A（环境阻塞，未伪造）
  - 降级路径：N/A（环境阻塞，未伪造）

## 5. 结论（仅限已实测范围）

- manual-markdown 兜底链路在 3 个手写脱敏样本上全绿：契约校验通过、页码映射保留、条款层级与表格结构完整、耗时毫秒级。
- manual-markdown 无 bbox 能力（'none'），机械门禁的 bbox 校验对其记 NOT_APPLICABLE；文本完整性/引文匹配的 100% 是构造性结论（来源即校对稿），不能外推为 PDF 解析质量。
- mineru / docling 在当前环境（无 Python/GPU 依赖、本地优先纪律禁止装系统环境）均 BLOCKED，未产生任何解析结果与对比数据；待环境就绪后需用真实 PDF 语料重跑本探针。
- 多数真实 PDF 语料当前 blocked（脱敏/版权/校对稿未就绪），详见清单；real 语料到位前，结论不外推。
