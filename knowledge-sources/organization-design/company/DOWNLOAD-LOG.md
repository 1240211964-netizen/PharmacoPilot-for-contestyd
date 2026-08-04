# DOWNLOAD-LOG — 组织设计知识库 · 企业事实层（company_fact）

- 下载日期 (UTC): 2026-08-04
- 下载方式: 机器（curl + pypdf/BeautifulSoup 抽取），未经人工复核（machine-extract, unreviewed）
- 渠道纪律: 仅法定/官方披露平台；搜索仅用于定位 canonical URL；请求间隔 ≥2 秒；未绕过任何验证码/登录/反爬；未使用第三方财经站
- EDGAR 合规: User-Agent 声明 `PharmacoPilot research contact@example.com`，访问 data.sec.gov / www.sec.gov，间隔 ≥3 秒

## 逐家记录

### 1. 恒瑞医药 (600276.SH) — acquired
- 定位过程: 巨潮 topSearch API 取 orgId `gssh0600276` → hisAnnouncement 查询 category=category_ndbg_szsh（2025-06-01~2026-08-04）→ 得 2025 年年度报告（披露日 2026-03-25）
- URL: http://static.cninfo.com.cn/finalpage/2026-03-26/1225032585.PDF
- raw: `organization-design/company/raw/hengrui-600276-annual-2025.pdf` (3,457,175 B, PDF 1.7)
- sha256: `fae80e2d132f5b6f2bfbb8bcdfd40e1267edb91d689389d63c8e291b0856ace6`
- 身份核验: 首页文本 "江苏恒瑞医药股份有限公司2025年年度报告 公司代码：600276"
- 抽取: pypdf 逐页 236 页 → `doc_hengrui_600276_ar2025.md`；中位 943.5 字符/页，乱码率 0.36%，空页 0

### 2. 药明康德 (603259.SH) — acquired
- 定位过程: 同上（orgId `9900035584`）→ 2025 年年度报告（披露日 2026-03-23）
- URL: http://static.cninfo.com.cn/finalpage/2026-03-24/1225025225.PDF
- raw: `organization-design/company/raw/wuxi-apptec-603259-annual-2025.pdf` (1,608,226 B)
- sha256: `7f1431d66eae399d4b35639bb650e23287c7f52dacbb47b4b4a197fb5026d6a2`
- 身份核验: 首页 "无锡药明康德新药开发股份有限公司2025年年度报告 公司代码：603259"
- 抽取: 249 页 → `doc_wuxiapptec_603259_ar2025.md`；中位 928 字符/页，乱码率 0.34%，空页 0

### 3. 上海医药 (601607.SH / 02607.HK) — acquired
- 定位过程: 同上（orgId `gssh0600849`）→ 2025 年年度报告（披露日 2026-03-30）
- URL: http://static.cninfo.com.cn/finalpage/2026-03-31/1225063837.PDF
- raw: `organization-design/company/raw/shanghai-pharma-601607-annual-2025.pdf` (11,747,868 B)
- sha256: `45a8bd8e3446fc3baf77c953870b2de965c990deb57fe62312c03ba0be525076`
- 身份核验: 首页 "上海医药集团股份有限公司2025年年度报告 A股代码：601607"
- 抽取: 243 页 → `doc_shanghaipharma_601607_ar2025.md`；中位 1015 字符/页，乱码率 0.10%，空页 14（均为整版图表页，正文完整，无需 OCR）

### 4. 益丰药房 (603939.SH) — acquired
- 定位过程: 同上（orgId `9900023775`）→ 2025 年年度报告（披露日 2026-04-22；另有英文版，未取）
- URL: http://static.cninfo.com.cn/finalpage/2026-04-23/1225151847.PDF
- raw: `organization-design/company/raw/yifeng-603939-annual-2025.pdf` (1,866,340 B)
- sha256: `476ba22b30fb008e1dfcd7a1c0971f1c894b0939064a715f9eb6c1a1e1ad4704`
- 身份核验: 首页 "益丰大药房连锁股份有限公司2025年年度报告 公司代码：603939"
- 抽取: 257 页 → `doc_yifeng_603939_ar2025.md`；中位 905 字符/页，乱码率 0.39%，空页 0

### 5. Pfizer Inc. (NYSE: PFE) — acquired
- 定位过程: data.sec.gov submissions API（CIK 0000078003）→ 最新 10-K：filed 2026-02-26，period 2025-12-31，accession 0000078003-26-000026，主文档 pfe-20251231.htm
- URL: https://www.sec.gov/Archives/edgar/data/78003/000007800326000026/pfe-20251231.htm
- raw: `organization-design/company/raw/pfizer-10k-2025.htm` (5,222,324 B)
- sha256: `175e07c21ee258eddd9952e443d34df2a297d0c38e2d1312dff0a64a31c401ab`
- 抽取: BeautifulSoup/lxml 去标签（剔除 ix:hidden 隐藏 XBRL 层后重抽）→ `doc_pfizer_10k_fy2025.md`；644,840 字符，乱码率 0；HTML 无页码，以 Item 节定位

### 6. CVS Health Corporation (NYSE: CVS) — acquired
- 定位过程: data.sec.gov submissions API（CIK 0000064803）→ 最新 10-K：filed 2026-02-10，period 2025-12-31，accession 0000064803-26-000010，主文档 cvs-20251231.htm
- URL: https://www.sec.gov/Archives/edgar/data/64803/000006480326000010/cvs-20251231.htm
- raw: `organization-design/company/raw/cvs-10k-2025.htm` (4,921,164 B)
- sha256: `422bac70c4d888c89306c113ee8cdf6b84367bd5917b32ca098b07153f9decec`
- 抽取: 同上 → `doc_cvs_10k_fy2025.md`；760,760 字符，乱码率 0；HTML 无页码，以 Item 节定位

### 7. Roche Holding AG — acquired
- 定位过程: WebSearch → 官方页 https://www.roche.com/investors/annualreport25 → curl 该页 grep PDF 链接 → Annual Report 2025 English = ar25e.pdf（assets.roche.com 官方 CDN）
- URL: https://assets.roche.com/f/176343/x/fa3c863601/ar25e.pdf
- raw: `organization-design/company/raw/roche-annual-2025.pdf` (14,509,174 B, 218 页)
- sha256: `111a16ec739a16fd93cb3554d9631dd68807c83928423e17377fd7204b65c064`
- 发布日: 2026-01-29（与 Full-Year Results 2025 同日）
- 抽取: pypdf 218 页 → `doc_roche_ar2025.md`；中位 2272 字符/页，乱码率 0，空页 6（整版图片页）

### 8. AstraZeneca PLC — acquired
- 定位过程: WebSearch → 官方页 https://www.astrazeneca.com/investor-relations/annual-reports/annual-report-2025.html；该页 HTML 对 curl 返回 CloudFront 403（未绕过），改用搜索索引确认的官网 content/dam 静态 PDF 直链（同一 astrazeneca.com 域，大小 11,703,551 B 与页面标注 "PDF 11,429KB" 吻合，内容经首页文本核验为正版年报）
- URL: https://www.astrazeneca.com/content/dam/az/Investor_Relations/annual-report-2025/pdf/AstraZeneca_AR_2025.pdf
- raw: `organization-design/company/raw/astrazeneca-annual-2025.pdf` (11,703,551 B, 232 页)
- sha256: `5a381c1c5df1ca277e95985a6b1b6b3ad371914a4b18a824e22ba541fbf44097`
- 发布日: 2026-02-10（与 FY/Q4 2025 业绩同日）
- 抽取: pypdf 232 页 → `doc_astrazeneca_ar2025.md`；中位 4639.5 字符/页，乱码率 ≈0，空页 0

## 汇总

- acquired: 8/8；blocked: 0
- 全部 raw 存于 `organization-design/company/raw/`；抽取稿（含 front-matter）在 `organization-design/company/`；registry 在 `knowledge-sources/registry/company.json`
- 抽取脚本: `organization-design/company/raw/extract.py`（pypdf 逐页，页间 `<!-- page N -->`；HTML 按 4000 字符块做质量统计）
- 已知瑕疵: 上海医药 14 个图片型空页、Roche 6 个图片型空页（不影响正文完整性）；中文 PDF 乱码率 0.1%–0.4% 来自少量特殊排版字符，无需 OCR
- 权限: 全部 pending_teacher_confirmation，仅内部研究使用；llmInputAllowed=false（待教师确认）
