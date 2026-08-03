# 评测数据集设计(金标准)

- 版本:v1.0.0
- 日期:2026-08-03
- 状态:草案

本文定义 `evaluation/` 下金标准数据集的结构、锚定纪律与重解析(re-resolution)机制。服务对象:检索探针(`retrieval-probe-design.md`)与拒答能力评测;后续门禁/语义审查评测复用同一套锚定纪律。

## 1. 数据集结构

```
evaluation/
  retrieval/
    dev/queries.jsonl        # 开发集(调参用)
    holdout/queries.jsonl    # 留出集(只在最终评估用一次)
  refusal/
    dev/queries.jsonl
    holdout/queries.jsonl
```

- 首版规模:每个集合 **30-50 题**;retrieval 与 refusal 各含 dev + holdout;
- retrieval 题型与 `retrieval-probe-design.md` §2 查询集一致:两字词、多字词、英文缩写、条款号、文件编号、词形近似、同义字不同、无答案、极短、长问句;
- refusal 题型:无答案(语料内无依据)、超出 scope(跨课程/跨班级引用)、superseded 来源诱导(答案只在已被 supersede 的旧版本里)、证据不足诱导(有相关词但无支撑断言的文本);每题标注期望行为(拒答/标注 unsupported)。

每条 retrieval 题目:

```jsonc
{
  "id": "ret-dev-001",
  "query": "…",
  "queryType": "two-char-word",
  "gold": [
    {
      "documentId": "ka_…",
      "sourceVersion": "kav_…",        // asset_version,允许自动解析但不作永久锚
      "pageIndex": 12,
      "pageLabel": "15",
      "verbatimQuote": "…",            // 来源文本中的逐字段落
      "quoteHash": "sha256:…"
    }
  ],
  "notes": "…"
}
```

## 2. 金标准锚定纪律

- 金标准锚定五元组:**`documentId` + `sourceVersion` + `pageIndex`/`pageLabel` + `verbatimQuote` + `quoteHash`**;
- **不锚 `contentBlockId`**:content_block 是解析产物,解析器升级产生新 asset_version 后 block id 全部失效;
- **允许自动解析但不作永久锚**:建集时可用检索/解析工具自动定位候选块,但落盘前必须由人核对 verbatimQuote 在原版文本中逐字存在,并以五元组形式固化;
- `quoteHash` 对 verbatimQuote 的归一化文本计算,与机械门禁的引用校验口径一致。

## 3. Gold re-resolution 机制

语料演进(asset 新增版本、解析器升级)后,金标准需要重新解析到当前语料:

- **何时重跑**:(a) 相关 knowledge_asset 新增 asset_version;(b) 评测基线切换(如从 dev 语料快照切到新版语料);(c) 定期健康检查(随 `npm run check` 之外单独触发,不阻塞日常测试);
- **输出什么**:每题每个 gold 生成一条 resolution 记录:命中的 `documentId + sourceVersion(新) + pageIndex + contentBlockId(临时) + quoteHash 是否匹配 + resolutionStatus(resolved / moved / missing)`;
- **失败处理**:verbatimQuote 在当前语料中**未匹配即失败** — 该题记为评测失败,**不移出分母**;由人来决定是语料退化(修语料)还是金标准过期(走变更流程更新金标准并留痕);
- re-resolution 报告落盘于 `evaluation/reports/`,含时间戳与语料版本,不覆盖旧报告。

## 4. 使用纪律

- dev 集可用于调参(RRF 参数、通道选择);holdout 只在方案冻结后评估一次,结果如实记录;
- 数据集与 fixture 一样**不含真实 PII**;所有文本来自公开教材/指南/法规文件或合成样例;
- 新增题目走与 schema 变更同级的审查:题型分布变化需在评测报告中说明,保证跨轮次指标可比。
