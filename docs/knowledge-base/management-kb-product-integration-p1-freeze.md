# Management Principles KB × Product Core P1 冻结记录

- 冻结日期：2026-08-06
- P1 代码提交：`9a78dfe963a96199e7af08f79e60f32458615afa`
- Git tag：`management-principles-kb-product-integration-p1`
- 标签对象：`1cf38c29a69f86b14b4f967ab7a3e23422373e6e`
- 冻结语料：`management-principles-cloud-kb-v1.2`
- `corpusVersionHash`：`a4f11290b7a59d17e101c29ab8dfb1e93ef09cc0d22fbfc6717d2df54edbc687`
- 课程 SQLite SHA-256（运行前/后）：`8524f6b700728a6417fec00191c7e912615ae6fcc363b2a4161b0e516d14bfa9`

## 冻结范围

该提交仅包含外部冻结课程语料的只读接入、外部语料登记、确定性检索、证据包、迁移 `010`、对应测试和运行文档。没有提交课程 SQLite、原始课件/PDF、Embedding、向量库或教案生成实现。

冻结时原工作区已经存在、且未纳入本提交的变更仍保留在工作区：教师试用 API token 桥、`s1-workspace.html`、`server/backend.test.mjs`、`shared/backend-client.js`、`output/`、`outputs/`、`server/health-public.test.mjs`、`tools/verify-api-token-bridge.mjs`。

## 干净 worktree 验证

验证在 detached clean worktree、P1 代码提交上运行：

```text
npm ci                         PASS
npm run build                  PASS
npm run check                  PASS
npm run verify:management-kb   PASS
```

`npm run check` 包含前端门禁、后端 264 项测试和两个 smoke 测试，全部通过。真实 CH06 检索验收运行两次相同查询和 S1—S9 九项章节内证据探针；课程 SQLite 在运行前后 SHA-256 完全一致。

## P2 开始条件

P2 只能把这个 tag 所固定的外部检索与证据包作为课程事实来源。任何教学设计候选、教师裁决、虚拟试教、S8 修订与 S9 资产候选都必须继续写入 Product Core，不得修改本课程 SQLite。
