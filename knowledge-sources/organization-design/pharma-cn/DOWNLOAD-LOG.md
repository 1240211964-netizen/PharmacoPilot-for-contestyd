# DOWNLOAD-LOG — pharma-cn(中国医药组织制度层)

任务：为《管理学原理》"组织设计"知识库下载中国医药组织制度层法定来源。
执行时间：2026-08-04(UTC)。请求间隔 ≥2 秒，未绕过任何访问控制，未使用转载/镜像页作为来源。

## 获取成功(acquired)

| # | 文件 | 文号 | canonical URL | 获取方式 | raw |
|---|------|------|---------------|---------|-----|
| 1 | 中华人民共和国药品管理法(2019年修订) | 主席令第三十一号 | http://www.npc.gov.cn/npc/c2/c30834/201908/t20190826_300489.html | curl 200 (HTML) | raw/drug-admin-law-2019_npc.html |
| 2 | 药品管理法实施条例(2026年修订,现行) | 国务院令第828号 | https://www.gov.cn/gongbao/2026/issue_12546/202602/content_7057461.html | curl 200 (HTML,国务院公报) | raw/drug-admin-law-reg-2026_govcn.html |
| 3 | 药品生产质量管理规范(2010年修订) | 卫生部令第79号 | https://www.samr.gov.cn/zw/zfxxgk/fdzdgknr/bgt/art/2023/art_d5e1dbaa8f284277a5f6c3e2fc840d00.html | curl 200 (HTML,SAMR 规章库) | raw/gmp-2010_samr.html |
| 4 | 加强药品上市许可持有人委托生产监督管理公告 | 国家药监局公告2023年第132号 | https://www.nmpa.gov.cn/xxgk/fgwj/xzhgfxwj/20231023160426145.html | FetchURL 正文抽取(curl 412) | raw/mah-contract-mfg-2023-132_nmpa.txt |
| 5 | 加强药品受托生产监督管理工作公告(132号配套) | 国家药监局公告2025年第134号 | https://www.nmpa.gov.cn/xxgk/fgwj/xzhgfxwj/20260106115318178.html | FetchURL 正文抽取(curl 412) | raw/contract-mfg-entrusted-2025-134_nmpa.txt |
| 6 | 医疗机构药事管理规定 | 卫医政发〔2011〕11号 | https://www.nhc.gov.cn/wjw/c100175/201103/0819a008695340a1a61173a09ef674df.shtml | nhc.gov.cn 官方附件 .doc(curl 200) + FetchURL 正文交叉核对 | raw/med-inst-pharm-admin-2011_nhc.doc(+.txt) |
| 7 | 医疗机构处方审核规范 | 国卫办医发〔2018〕14号 | https://www.gov.cn/zhengce/zhengceku/2018-12/31/content_5435182.htm | gov.cn 通知页(curl 200) + gov.cn 官方附件 .doc 正文(curl 200) | raw/prescription-review-2018_govcn.{html,doc,txt} |
| 8 | 抗肿瘤药物临床应用管理办法(试行) | 国卫医函〔2020〕487号 | https://www.nhc.gov.cn/yzygj/c100068/202012/02cc3fdaca5c46519b24d677b56bb499.shtml | FetchURL 正文抽取(curl 412) | raw/antineoplastic-2020_nhc.txt |
| 9 | 关于推动药品集中带量采购工作常态化制度化开展的意见 | 国办发〔2021〕2号 | https://www.gov.cn/zhengce/content/2021-01/28/content_5583305.htm | curl 200 (HTML) | raw/vbp-2021-2_govcn.html |

## 失败/替代记录(blocked / dead link)

- `https://www.gov.cn/xinwen/2019-08/26/content_5424780.htm`(药品管理法旧链接)— 404;改用 npc.gov.cn。
- `https://www.gov.cn/zhengce/2019-08/26/content_5424780.htm` — 404。
- `https://www.nmpa.gov.cn/xxgk/fgwj/flxzhfg/20190827083801685.html`(药品管理法 NMPA 页)— 412(curl,含完整浏览器头仍 412);未再高频重试。
- `https://www.nmpa.gov.cn/xxgk/fgwj/flxzhfg/20260127172639127.html`(实施条例 NMPA 页)— curl 412、FetchURL network error;改用 gov.cn 公报版。
- `https://www.nmpa.gov.cn/xxgk/fgwj/bmgzh/20110117120001434.html`(GMP NMPA 部门规章页)— FetchURL 两次 412(间隔 8s);改用 SAMR 官方规章库。
- `https://www.nhc.gov.cn/wjw/c100175/...`(药事管理/处方审核/抗肿瘤 HTML 页)— curl 412(完整浏览器头无效);处方审核页 FetchURL 亦 412;药事管理与抗肿瘤两页 FetchURL 成功。
- `https://www.nhc.gov.cn/ewebeditor/uploadfile/2018/07/20180710152545409.doc`(处方审核规范 NHC 附件)— curl empty reply;改用 gov.cn 附件 .doc。
- `http://www.gov.cn/zwgk/2011-03/30/content_1834424.htm`(药事管理规定 gov.cn 旧链接)— 404。
- flk.npc.gov.cn(国家法律法规数据库)— 动态 API 应用,静态抓取不可行,未尝试绕过。

## 版本核验要点

- 《药品管理法实施条例》现行版为 **2026 年第四次修订**(国务院令第828号,2026-01-16 公布,2026-05-15 施行),而非任务书举例的 2019 修订版;已按"以现行有效为准"抓取 2026 版。
- 《医疗机构处方审核规范》文号经核验为 **国卫办医发〔2018〕14号**(非 25 号),2018-06-29 印发。
- 2023 年第132号公告现行有效,其受托方配套文件 2025 年第134号公告(2025-12-30 发布)一并收录。

## 处理

- 抽取脚本:`_extract.py`(HTML 去标签→章/节/条层级格式化→关键词初标【组织设计相关】)。
- 9 份 `<docId>.md` 均含 front-matter 与"组织设计相关条款定位(机器初标)"清单;条文数为 155/89/313/46/23/48 条,与官方文本条数吻合(药品管理法155条、GMP 313条、处方审核规范23条等)。
- sha256 清单:`sha256-manifest.txt`;registry:`../../registry/pharma-cn.json`。
