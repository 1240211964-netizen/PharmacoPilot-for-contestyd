# DocumentParser 契约与 Adapter 设计

- 版本:v1.0.0
- 日期:2026-08-03
- 状态:v1.0.0 已落地
- 变更:2026-08-03 与落地实现逐字对齐(`server/document-parsers/`),修正字段命名、block_type 枚举与校验规则

本文定义 PDF/文档解析的适配层契约。解析器对比是 `experiments/` 下的独立探针,**不进入业务依赖**;业务侧只依赖本文契约。环境装不上 mineru/docling 时,只交付契约 + manual-markdown 可用实现,如实记录阻塞,**不伪造对比结果**。

落地代码:`server/document-parsers/parser-contract.mjs`(契约与校验)、`manual-markdown-parser.mjs`(可用实现 v1.0.0)、`mineru-adapter.mjs` / `docling-adapter.mjs`(契约桩 v0.1.0)、`index.mjs`(registry,业务侧唯一入口:`getParser(name)` / `listParsers()`)。

## 1. DocumentParser 接口

```js
interface DocumentParser {
  id: string;            // 'manual-markdown' | 'mineru' | 'docling'
  version: string;       // adapter 自身版本,写入 asset_versions.parser_version
  capabilities(): ParserCapabilities;
  parse(input: ParseInput): Promise<ParsedDocument>;
}
```

- `capabilities()` 返回:`{ blockTypes: string[], bbox: boolean, bboxCoordinateSystem: string, tables: boolean, readingOrder: boolean, pageLabels: boolean }`,调用方据此判断该 adapter 产出能满足哪些下游校验(如 bbox 坐标校验在无 bbox 能力时记 `NOT_APPLICABLE`);
- `ParseInput`:`{ fileRef, fileHash?, options? }`;`fileRef` 为输入文件路径;`fileHash` 为原始文件内容哈希(`'sha256:<64位小写hex>'` 或裸 64 位 hex,后者由 adapter 补前缀),缺省时由 adapter 读取文件实测计算;必须原样进入产出 `originalFileHash`;
- `parse()` 失败抛带错误码的异常(`ParserError`,`code` 必填),不得返回半成品而不告警(半成品走 `warnings` + 低 parse confidence);解析器环境不可用时抛 `ParserUnavailableError`,`code` 固定为 `PARSER_UNAVAILABLE`。

## 2. ParsedDocument 契约

```jsonc
{
  "schemaVersion": "1.0.0",
  "documentMeta": {
    "docId": "…",                 // 必填,非空字符串
    "title": "…",                 // 必填,非空字符串
    "sourceType": "…",            // 必填,非空字符串(如 "中文政策")
    "correctedBy": "…",           // manual-markdown 路径必填(校正人)
    "correctedAt": "ISO-8601",    // manual-markdown 路径必填(校正时间)
    "reviewStatus": "unreviewed | reviewed",  // 可选;出现时必须取这两值之一
    "source": "…"                 // 输入文件定位(fileRef)
  },
  "parser": "manual-markdown",    // 必填,非空字符串
  "parserVersion": "1.0.0",       // 必填,非空字符串
  "originalFileHash": "sha256:…", // 必填,'sha256:' + 64 位小写十六进制
  "parseConfidence": 0.0,         // 必填,0..1 有限数值;manual-markdown 由校正人给
  "parsedAt": "ISO-8601",
  "pages": [                      // 无页码信息时为空数组
    { "pageIndex": 0, "pageLabel": "1" }  // pageIndex 非负整数,pageLabel 字符串
  ],
  "blocks": [
    {
      "blockId": "b0001",              // 必填,非空字符串,文档内唯一
      "blockType": "heading",          // 必填,十二值枚举之一(见下)
      "readingOrder": 0,               // 必填,非负整数,数组序上严格递增
      "parentBlockId": null,           // null 或字符串;字符串时必须引用已存在的 blockId
      "pageIndex": 0,                  // null 或非负整数
      "pageLabel": "1",                // null 或字符串
      "bbox": null,                    // null 或 [x, y, w, h] 四个有限数值
      "bboxCoordinateSystem": "none",  // 必填,非空字符串;bbox 为空时必须为 'none'
      "contentRaw": "…",               // 必填字符串,解析原文
      "normalizedText": "…",           // 必填字符串,归一化文本(NFKC+折叠空白),机械门禁逐字引用校验基于它
      "contentHash": "sha256:…"        // 必填,'sha256:' + 64 位小写十六进制
    }
  ],
  "tables": [                     // 无表格时为空数组
    {
      "tableId": "t0001",         // 必填,非空字符串
      "blockId": "b0005",         // 必填,必须引用 blocks[] 中存在的 blockId
      "header": ["…"],            // 字符串数组
      "rows": [["…"]]             // 字符串二维数组
    }
  ],
  "warnings": [ { "code": "…", "message": "…" } ]  // code/message 均为必填非空字符串;无告警时为空数组
}
```

要点:
- `blockType` 十二值枚举固定为:`heading / paragraph / policy_article / policy_clause / table / rubric / case_context / case_task / case_action / case_result / figure_caption / unknown`(与 migration 001 `content_blocks.block_type` 的 CHECK 约束逐字一致)。adapter 内部类型必须映射到该枚举,不可映射的进 `unknown` 并写 `warnings`;
- `readingOrder` 在 blocks 数组序上严格递增,跨页连续;adapter 无法确定时给页内顺序并在 `capabilities().readingOrder=false` 声明;
- `bbox` 可空,`bboxCoordinateSystem` 为 `'none'` 时 bbox 必须为空;机械门禁"bbox 坐标"校验对 `'none'` 记 `NOT_APPLICABLE`;
- `contentRaw` 与 `normalizedText` 双份保留:原文供审计与人工核对,归一化文本供匹配;
- `parseConfidence` 低于阈值(探针定,初定 0.6)的文档不得直接进入证据检索,须走人工校正。

### 校验规则(validateParsedDocument 实际行为)

`validateParsedDocument(doc)` 收集全部问题后一次性抛出 `ParserError(code='CONTRACT_VIOLATION')`,`details.violations` 为 `{ path, message }` 清单;通过时原样返回 doc。具体规则:

- 顶层:`documentMeta.docId/title/sourceType` 非空字符串;`documentMeta.reviewStatus` 出现时必须是 `unreviewed | reviewed`;`parser`、`parserVersion` 非空字符串;`originalFileHash` 匹配 `/^sha256:[0-9a-f]{64}$/`;`parseConfidence` 为 0..1 有限数值;
- `pages`:必须是数组(可为空);每项 `pageIndex` 非负整数、`pageLabel` 字符串;
- `blocks`:`blockId` 非空且全文唯一;`blockType` 命中十二值枚举;`readingOrder` 非负整数且在数组序上严格递增(相邻项 `curr <= prev` 即违规);`parentBlockId` 为 null/字符串,且字符串时必须引用文档内已存在的 `blockId`(引用完整性);`pageIndex` 为 null 或非负整数;`pageLabel` 为 null 或字符串;`bbox` 为 null 或 `[x, y, w, h]` 四个有限数值;`bbox` 为空时 `bboxCoordinateSystem` 必须为 `'none'`;`contentRaw`、`normalizedText` 必须是字符串;`contentHash` 匹配 sha256 格式;
- `tables`:每项 `tableId` 非空;`blockId` 必须引用 `blocks[]` 中已存在的 blockId;`header` 为字符串数组、`rows` 为字符串二维数组;
- `warnings`:每项 `code`、`message` 均为非空字符串。

## 3. 三个 Adapter 定位与现状

| adapter | 定位 | 版本 | 现状 |
|---|---|---|---|
| `manual-markdown` | 兜底与基线:人工把 PDF 校正为 Markdown,adapter 把 Markdown + pageMap 结构化为 ParsedDocument | 1.0.0 | **可用**,不依赖外部环境 |
| `mineru` | 首选候选:学术 PDF 版面/公式/表格强;对比探针的被测对象 | 0.1.0 | 契约桩:`parse()` 抛 `PARSER_UNAVAILABLE`;阻塞原因如实记录——MinerU 依赖 Python 环境与模型权重(通常需 GPU),本机 macOS 未安装且本地优先纪律禁止装入系统环境 |
| `docling` | 备选候选:通用文档结构化 | 0.1.0 | 契约桩:同上,`parse()` 抛 `PARSER_UNAVAILABLE`(Docling 依赖 Python 环境与模型权重) |

两桩的 `capabilities()` 如实声明兑现后的预期能力(`bbox: true, bboxCoordinateSystem: 'pdf-points'` 等);`listParsers()` 对每个 adapter 实测可用性并返回 `available / availabilityReason / executablePath`,不缓存。

### manual-markdown 输入与块规则(v1.0.0)

输入为带 YAML front-matter 的人工校正 Markdown。front-matter 必填字段:`docId`、`title`、`sourceType`、`correctedBy`、`correctedAt`、`reviewed`(true/false);可选:`parseConfidence`(0..1,缺省时 reviewed=0.9 / unreviewed=0.7)、`pageMap`(锚点列表,`heading: <标题文本精确匹配>` 或 `block: <1 起计块序号>`,各带 `pageIndex`/`pageLabel`)。front-matter 只支持顶层 `key: value` 与 pageMap 的缩进列表子集,超出子集即报 `FRONTMATTER_INVALID`,不静默猜。

块切分规则:`#/##/…` → `heading`;段首"第N条" → `policy_article`;段首"(一)"或"1." → `policy_clause`(`parentBlockId` 指向最近的 `policy_article`);GFM 表格 → `table`(同时入 `tables[]`);段首"图N" → `figure_caption`;其余 → `paragraph`。段内以结构性标记起始的行自成一块,普通续行并入前一 article/clause/paragraph 块。

pageMap 应用:每个锚点生效至下一个锚点;锚点之前的块 `pageIndex/pageLabel` 置 null 并记 `PAGE_UNMAPPED` 告警;未提供 pageMap 时全部置 null 并记 `PAGE_MAP_MISSING`;锚点无效/未匹配记 `PAGE_ANCHOR_INVALID` / `PAGE_ANCHOR_UNMATCHED`。表格缺分隔行记 `TABLE_MALFORMED` 并按普通段落处理;`reviewed=false` 记 `REVIEW_PENDING`。产出在返回前过 `validateParsedDocument`,不合格直接抛错,不交付半成品。

### manual-markdown 降级路径纪律

以人工校正 Markdown 作为解析来源时,必须同时保留:

1. **原始文件本体**与其内容哈希(`originalFileHash`),原始文件存文件系统,不把原始文件塞进 SQLite(见 `security-and-privacy.md`);
2. **校正人**与**校正时间**(front-matter `correctedBy` / `correctedAt`,进入 `documentMeta`);
3. **页码映射**:front-matter `pageMap` 给出 Markdown 块 ↔ 原 PDF `pageIndex/pageLabel` 的映射,使 evidence_links 的页码锚定在降级路径下仍成立;未映射块如实置 null 并告警;
4. **审核状态**:`reviewStatus: unreviewed | reviewed`,未 reviewed 的解析结果产生的证据,机械门禁记 `WARNING` 而非 `PASSED`。

## 4. 对比指标清单(experiments 探针输出)

对同一批测试 PDF,逐 adapter 输出:

- 文本质量:与人工校对稿的字符级一致率、归一化后一致率;
- 结构:blockType 分布与人工标注的一致率、reading order 正确率;
- 版面:bbox 覆盖率、bbox 与页面对齐抽查通过率;
- 表格:表格检出率、单元格内容一致率;
- 页码:pageIndex/pageLabel 映射正确率;
- 工程:解析耗时、内存峰值、依赖安装成本;
- 结论:每项如实记录,环境装不上即记 `BLOCKED(原因)`,**不允许跳过实测直接写结论**。

## 5. 与主链路的关系

- `asset_versions.parser_name` / `parser_version` 记录解析来源;`content_blocks` 即 ParsedDocument.blocks 的落库形态(`block_type` ← `blockType`,`order_index` ← `readingOrder`,`parent_block_id` ← `parentBlockId`,`page_index` / `page_label` ← `pageIndex` / `pageLabel`,`bbox_json` ← `bbox`,`bbox_coordinate_system` ← `bboxCoordinateSystem`,`content_raw` ← `contentRaw`,`normalized_text` ← `normalizedText`,`content_hash` ← `contentHash`);
- 解析器升级 = 新增 asset_version(supersede 链,B3),不覆盖旧解析结果;
- 探针代码在 `experiments/` 下,业务代码(`server/product-core/`)只 import 契约与 manual-markdown 实现。
