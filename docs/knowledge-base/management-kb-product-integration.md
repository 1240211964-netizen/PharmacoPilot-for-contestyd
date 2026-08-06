# 《管理学》冻结知识库 · Product Core 接入（P1）

本接入把冻结的课程 SQLite 作为只读课程语料源。Product Core 继续是 workflow、检索运行、证据链接、教师裁决、发布版本与审计事件的唯一事实源。

## 部署配置

```bash
export MANAGEMENT_KB_PATH="/absolute/path/management_course_kb.sqlite"
export MANAGEMENT_KB_EXPECTED_SHA256="<冻结 SQLite 的 64 位 SHA-256>"
export MANAGEMENT_KB_MANIFEST_PATH="/absolute/path/source_manifest.json"
export MANAGEMENT_KB_CORPUS_VERSION_PATH="/absolute/path/corpus_version.json"
export MANAGEMENT_KB_READ_ONLY=true
```

只要声明任一 `MANAGEMENT_KB_*` 路径或哈希，配置就被视为启用；缺任一必需项、哈希不一致、schema/FTS5 不符合、计数不一致或只读探针失败时，服务启动即拒绝。不会回退到空结果、Embedding、模型记忆或教案生成。

课程 SQLite 通过 `DatabaseSync(path, { readOnly: true })` 与 `PRAGMA query_only = ON` 打开。课程库文件不进入 Git，也不能写入审核状态、运行记录或业务表。

## 正式 API

`GET /api/product-core/kb/management/status` 返回登记的语料版本、哈希、schema 契约、数量和只读状态；不返回本机路径。

`POST /api/product-core/kb/management/retrieve` 请求示例：

```json
{
  "query": "矩阵制为什么容易产生多头指挥",
  "chapterIds": ["CH06"],
  "authorityMaxRank": 4,
  "limit": 5,
  "actorId": "teacher-001"
}
```

该接口仅作确定性词法和课程概念别名匹配。每次调用会复用/创建现有 `KB_RETRIEVAL` workflow，并追加 `kb_retrieval_runs`、正式 `evidence_links` 和 `audit_events`。响应明确标注 `embeddingUsed: false`、`llmUsed: false`。

`GET /api/product-core/kb/management/retrieval-runs/:id/evidence-package` 返回可供 S1—S9 教学设计和教师审核引用的证据包。每条引用都有外部切片 ID、来源 ID、定位、逐字摘录和 `contentHash`；接口不生成教案，也不替教师形成教学结论。

## 验收

运行通用回归：

```bash
npm run test:backend
```

在冻结语料已按上文配置后，运行真实 CH06 验收：

```bash
npm run verify:management-kb
```

验收固定检索“矩阵制为什么容易产生多头指挥”，验证 CH06 过滤、重复输入确定性、证据包、审计无查询原文、无模型/Embedding 调用，以及运行前后课程 SQLite 的 SHA-256 不变。验收还以 9 条 CH06 查询分别探测 S1—S9 的后续证据需求；这只证明各环节可取得可引用的章节证据，不生成教案、也不替教师作教学判断。
