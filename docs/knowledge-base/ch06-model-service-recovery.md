# CH06 P2 本地模型恢复核查

- 核查时间：2026-08-06
- 恢复原因：`LOCAL_MODEL_SERVICE_RESTORED`
- P1 冻结提交：`9a78dfe963a96199e7af08f79e60f32458615afa`
- P1 标签：`management-principles-kb-product-integration-p1`（仅核验，未移动、重打或修改）
- 模型端点：`http://127.0.0.1:8080/v1`
- 模型 profile：`mlx-community/Qwen3.5-9B-4bit`
- 冻结 `corpusVersionHash`：`a4f11290b7a59d17e101c29ab8dfb1e93ef09cc0d22fbfc6717d2df54edbc687`
- 冻结课程 SQLite SHA-256：`8524f6b700728a6417fec00191c7e912615ae6fcc363b2a4161b0e516d14bfa9`

## 恢复闸门结果

| 闸门 | 结果 | 实测事实 |
| --- | --- | --- |
| `GET /v1/models` | PASS | 返回且包含 `mlx-community/Qwen3.5-9B-4bit` |
| 最小 chat completion | PASS | 真实调用返回“模型恢复验证成功”；未携带课程语料 |
| `GET /api/model/status` | PASS | `ready: true`，配置端点与模型 ID 一致 |
| 课程 SQLite 完整性 | PASS | 运行后 SHA-256 与 P1 冻结记录逐字一致 |
| `npm run check` | PASS | 当前工作区门禁通过（含既有用户未提交的 token bridge 测试） |
| `npm run verify:management-kb` | PASS | CH06 确定性检索、证据包和只读哈希验收通过 |

模型恢复仅解除“模型不可达”这一外部阻塞；它本身不构成 CH06 P2 通过条件。

## 继承关系核查

此前的 `CH06_TEACHING_DESIGN_PILOT_BLOCKED` 只存在于
`docs/knowledge-base/ch06-teaching-design-pilot-report.md`；当前 Product Core SQLite 中不存在
`courseId = MGT-PHARM-001`、`chapterId = CH06` 或任何 CH06 P2 工作流/审计记录。因此：

```json
{
  "parentWorkflowInstanceId": null,
  "previousStatus": "BLOCKED",
  "resumeReason": "LOCAL_MODEL_SERVICE_RESTORED",
  "modelEndpoint": "http://127.0.0.1:8080/v1",
  "modelProfile": "mlx-community/Qwen3.5-9B-4bit",
  "corpusVersionHash": "a4f11290b7a59d17e101c29ab8dfb1e93ef09cc0d22fbfc6717d2df54edbc687"
}
```

`parentWorkflowInstanceId` 不能以文档标题、假 ID 或 S1 工作流替代。这样做会破坏“可追溯”要求；本次未创建伪造 successor workflow。

## 当前不可继续的结构性门禁

1. `workflow_instances.workflow_type` 被数据库约束为唯一值 `S1_DIAGNOSIS`，状态机和发布守卫也只实现 S1。没有 S2—S9 的合法状态机、TeachingDesignCandidate 版本实体或可恢复的 P2 workflow，不能绕过 Product Core 直接落 JSON/文档。
2. 虚拟课堂的实际实现是浏览器端 `shared/mv-classroom-core.js` 和渲染/运行时脚本。它没有 API、服务端运行器或“批准教学设计版本 + S1 分群 + 活动流程 + 评价标准”输入契约；其现有情境为 SWOT。把它作为 CH06“组织设计”真实后端试教会产生错误的课程证据。

因此未向模型发送 CH06 证据，也未生成任何 S2—S7 候选。虽然 121 个 CH06 切片均为
`llm_input_allowed=true`，但没有可审计的 P2 workflow 和逐节点模型运行记录容器时，发送最小证据也无法满足版本、教师裁决和审计门禁。

## 解除条件

先以迁移和服务扩展 Product Core：增加有明确状态转移的 `CH06_TEACHING_DESIGN` workflow、不可覆盖的候选/版本和逐项审查记录，并复用既有 `model_runs`、`evidence_links`、`teacher_decisions`、`audit_events`。再为既有虚拟课堂提供经过同一审计的服务器端运行接口，或明确授权将已批准设计适配到其确定性运行核心。完成这些前置后，才能创建真实 successor workflow 并从 `load_s1_context` 开始。
