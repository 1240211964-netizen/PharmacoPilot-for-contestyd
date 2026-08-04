# DOWNLOAD-LOG — organization-design / pharma-intl(国际医药组织标准层)

下载时间:2026-08-04(UTC)。全部来自官方域名,顺序请求间隔 ≥2 秒(实际 ≥3 秒);未绕验证码/登录;未使用镜像。抽取工具:pypdf(`/tmp/pdfvenv/bin/python`),逐页抽取,页间插 `<!-- page N -->`。

## 下载记录

### 1. ICH Q10 Pharmaceutical Quality System
- URL: https://database.ich.org/sites/default/files/Q10%20Guideline.pdf
- 状态:200 application/pdf,直接下载成功,**ich.org/database.ich.org 未要求注册或登录**
- 版本核验:封面 "Current Step 4 version dated 4 June 2008"(PDF 为 2020-04-06 由 Word 2016 重新生成的现行版本)
- raw: `raw/ich-q10-pharmaceutical-quality-system.pdf`,21 页,sha256 `396b99197692a2fd386089b886dc7345e22b726fd6ebd0bbb5d2a0173b0ec292`
- 许可:该 PDF 本身未内嵌 legal notice 页;ICH 官方条款原文从同库(database.ich.org)ICH Q9(R1) 指南 PDF 的 Legal notice 逐字核验:"This document is protected by copyright and may, with the exception of the ICH logo, be used, reproduced, incorporated into other works, adapted, modified, translated or distributed under a public license provided that ICH's copyright in the document is acknowledged at all times. In case of any adaption, modification or translation ... reasonable steps must be taken to clearly label, demarcate or otherwise identify that changes were made ... Any impression that the adaption, modification or translation of the original document is endorsed or sponsored by the ICH must be avoided."(另含 "as is" 免责及第三方内容例外条款。)注:ich.org 主站为 JS 渲染,Terms of Use 页面无法静态抓取,故以官方 PDF 内嵌条款为准。

### 2. FDA Guidance for Industry: Quality Systems Approach to Pharmaceutical CGMP Regulations
- URL: https://www.fda.gov/media/71023/download
- 状态:200 application/pdf
- 版本核验:Final guidance,September 2006(PDF 元数据创建 2006-09-26;Federal Register Notice of Availability 2006-10-02)
- raw: `raw/fda-quality-systems-approach-cgmp.pdf`,32 页,sha256 `69fa9da511ea1d5b59f780700a3ee2c5e949e9add538781cdf1aaaa7d613a32a`
- 许可:FDA 官网 Website Policies(https://www.fda.gov/about-fda/about-website/website-policies)原文:"Unless otherwise noted, the contents of the FDA website (www.fda.gov) — both text and graphics — are not copyrighted. They are in the public domain and may be republished, reprinted and otherwise used freely by anyone without the need to obtain permission from FDA."(美国政府作品,17 U.S.C. §105。)

### 3. EudraLex Volume 4 Chapter 1: Pharmaceutical Quality System
- URL: https://health.ec.europa.eu/document/download/e458c423-f564-4171-b344-030a461c567f_en?filename=vol4-chap1_2013-01_en.pdf(链接取自 EudraLex Volume 4 官方目录页 https://health.ec.europa.eu/medicinal-products/eudralex/eudralex-volume-4_en;旧 ec.europa.eu 地址 301 重定向至此)
- 状态:200(首次 HEAD 遇到一次 429,间隔后重试成功)
- 版本核验:Revision 1,目录页注明 "into operation since 31 January 2013";文件头 SANCO/AM/sl/ddg1.d.6(2012)860362
- raw: `raw/eu-gmp-vol4-ch1-pharmaceutical-quality-system.pdf`,8 页,sha256 `11e87c3246abeaac008615f5e9ef8249eaf6c32685d180cb8d1d61a95ae00105`
- 许可:© European Union。europa.eu legal notice(https://commission.europa.eu/legal-notice_en)原文:"The Commission's reuse policy is implemented by the Commission Decision of 12 December 2011 on the reuse of Commission documents. Unless otherwise indicated ... content owned by the EU on this website is licensed under the Creative Commons Attribution 4.0 International (CC BY 4.0) licence. This means that reuse is allowed, provided appropriate credit is given and changes are indicated."另注意:在线副本不保证与正式文本一致,具法律效力文本以《欧盟官方公报》为准。

### 4. EudraLex Volume 4 Chapter 2: Personnel
- URL: https://health.ec.europa.eu/document/download/11f4f8e6-a6e9-4897-afe3-f21e1dc56cb8_en?filename=2014-03_chapter_2.pdf(同上,取自官方目录页)
- 状态:200
- 版本核验:封面日期 Brussels, 16 August 2013;目录页注明 "into operation since 16 February 2014"
- raw: `raw/eu-gmp-vol4-ch2-personnel.pdf`,6 页,sha256 `8e7395cbde5e1d08f1b3ded420b6afc5902adc88174a76a94c8ddc3bc7358a12`
- 许可:同第 3 条(EU / CC BY 4.0 口径)。

### 5. EMA GVP Module I: Pharmacovigilance systems and their quality systems
- URL: https://www.ema.europa.eu/en/documents/scientific-guideline/guideline-good-pharmacovigilance-practices-module-i-pharmacovigilance-systems-their-quality-systems_en.pdf(重定向至 ...-systems-and-their-quality-systems_en.pdf)
- 状态:200 application/pdf
- 版本核验:EMA/541760/2011,22 June 2012(封面);PDF 元数据 DM_DocRefId 一致;为首次发布版本
- raw: `raw/ema-gvp-module-i.pdf`,25 页,sha256 `197de2bc0cfb6bdafe8d322934ece6e9bd4c5901651a5a828e74076470d7ff59`
- 许可(封面原文):"© European Medicines Agency and Heads of Medicines Agencies, 2012. Reproduction is authorised provided the source is acknowledged."

### 6. WHO Drug and Therapeutics Committees: A Practical Guide
- 记录页: https://iris.who.int/handle/10665/68553(WHO/EDM/PAR/2004.1,2003,146 p.,WHO 与 Management Sciences for Health 合作出版,eds. Holloway & Green)
- 位流 URL: https://iris.who.int/server/api/core/bitstreams/292ce865-1f41-497c-9c31-d73ed5867e34/content
- 状态:旧 apps.who.int/bitstream 路径现返回 DSpace 7 SPA 的 HTML(非 PDF);经 IRIS REST API(`/server/api/pid/find?id=10665/68553` → item bundles)定位官方英文位流后下载成功。波斯语(Dari)版本未下载(任务语言要求 en)。
- raw: `raw/who-drug-therapeutics-committees.pdf`,155 页(含封面/空白页;正文 146 p.),sha256 `2cc162223b678c11d96f2756211444c07eb26179c7790d043ebb90e2ad174e23`
- 许可(版权页原文):"© World Health Organization 2003. All rights reserved."(IRIS 条目无 dc.rights/CC 标注;属 CC 政策之前的 WHO 出版物,公开可下载,超个人/教学参考用途的复制需 WHO 许可。)

## 抽取质量自检

| 文件 | 页数 | 总字符 | 页均字符 | 低字符页(<100) | U+FFFD |
|---|---|---|---|---|---|
| ich-q10 | 21 | 44,750 | 2,130 | 无 | 0 |
| fda-quality-systems | 32 | 82,646 | 2,582 | 无 | 0 |
| eu-gmp-ch1 | 8 | 18,041 | 2,255 | 无 | 0 |
| eu-gmp-ch2 | 6 | 13,840 | 2,306 | 无 | 0 |
| ema-gvp-module-i | 25 | 80,865 | 3,234 | 无 | 0 |
| who-dtc | 155 | 383,388 | 2,473 | 38-42, 116 | 0 |

- WHO 第 38–42 页为案例文本框页(尼泊尔/南非医院实例,照片+图注),第 116 页为第 7 章分节页——均已人工复核含正常文字,非扫描缺页。全部 6 份判定为文本型 PDF,抽取成功,**无需 OCR,无 blocked**。

## blocked 清单

无。(ICH 下载未要求注册;各站点均无验证码/登录墙。)

## 产物

- 抽取稿:`knowledge-sources/organization-design/pharma-intl/<docId>.md`(6 份,front-matter 含 docId/title/sourceType/author_or_issuer/edition_or_version/publication_date/source_url/license_or_terms/language/retrieved_at/correctedBy/reviewed/layer)
- Registry:`knowledge-sources/registry/pharma-intl.json`(permissionStatus 全部 "pending_teacher_confirmation";authorityLevel=1;llmInputAllowed=false;embeddingAllowed=false;publicRedistributionAllowed=false)
