# CH06 教学设计黄金路径 P2 报告

## 最终判定

`CH06_TEACHING_DESIGN_PILOT_BLOCKED`

## P1 冻结前置已完成

- P1 代码提交：`9a78dfe963a96199e7af08f79e60f32458615afa`
- P1 标签：`management-principles-kb-product-integration-p1`
- 冻结记录：[management-kb-product-integration-p1-freeze.md](management-kb-product-integration-p1-freeze.md)
- 干净 worktree：`npm ci`、`npm run build`、`npm run check`、`npm run verify:management-kb` 全部通过。
- 运行前后真实课程 SQLite SHA-256 均为 `8524f6b700728a6417fec00191c7e912615ae6fcc363b2a4161b0e516d14bfa9`。

## 已核实的 P2 输入边界

冻结语料为 `management-principles-cloud-kb-v1.2`，`corpusVersionHash` 为 `a4f11290b7a59d17e101c29ab8dfb1e93ef09cc0d22fbfc6717d2df54edbc687`。CH06 共有 121 个可检索切片，来自 4 个来源：课程教材/课件、教学日历和复习大纲。

模型权限核查结果：这 121 个 CH06 切片的 `llm_input_allowed` 均为 `true`；4 个来源的 `embedding_allowed` 均为 `false`。因此，后续只能向模型发送通过正式检索接口取得、被最小化选择并带 `evidenceLinkId`、chunk、来源定位和 `contentHash` 的摘录；不能直接发送 SQLite、整份 PPT/PDF 或启用 Embedding。

## 阻塞事实

当前配置的本地模型 profile 为 `mlx-community/Qwen3.5-9B-4bit`，端点为 `http://127.0.0.1:8080/v1`。在 2026-08-06 的实时探测中，`ModelClient.status()` 返回：

```json
{
  "ready": false,
  "error": "unreachable"
}
```

直接连接同一端点也被拒绝。P2 的 `generate_s2_outcomes` 至 `generate_s7_performance_assessment` 是模型生成节点；在模型不可用时，不能用人工硬编码内容、旧页面样例或 mock 输出冒充模型候选，也不能伪造后续的“模型原始输出—教师修改前后版本”链。

由于还没有可信的、可审核的 S2—S7 候选，以下后续条件均尚未满足，不能提前执行：

- 混合教师裁决（采纳、修改、驳回、待补证据）；
- 仅向已批准版本传入虚拟课堂；
- 基于真实试教关键时刻产生 S8；
- 创建以真实试教为基础的 S9 `candidate`；
- `teaching_design_v1 → simulation_run_1 → teaching_design_v2` 版本链。

## 未做事项（刻意保持）

未修改只读课程 SQLite；未引入 Embedding；未新增平行 workflow、审计或教师裁决系统；未生成、发布或伪造任何教学设计、虚拟试教结果、S8 修订或 S9 资产候选。P1 检索验收没有退化。

## 解除阻塞所需的唯一外部条件

启动并验证当前配置的本地模型服务，使 `GET /api/model/status` 返回 `ready: true`。恢复后，应先重新运行 P1 冻结验收和 CH06 证据包检索，再按 P2 门禁执行最小证据上下文的分节点结构化生成、教师裁决和虚拟试教；不得跳过本报告列出的未满足条件。

## 多章节扩展

不允许。在 CH06 单章的模型候选—教师裁决—试教—修订版本链完成并通过全部门禁前，不得进入多章节扩展。

---

## 2026-08-06 恢复尝试（追加记录，不改写上述 BLOCKED 结论）

本次恢复闸门确认本地模型服务已恢复，详情见
[ch06-model-service-recovery.md](ch06-model-service-recovery.md)。P1 tag 已核验仍精确指向
`9a78dfe963a96199e7af08f79e60f32458615afa`，未移动、未重打。

本次不以模型可达替代 P2 的全链路门禁。经重新核查，旧报告从未创建可恢复的 CH06 P2
Product Core workflow，且当前 Product Core 只实现 `S1_DIAGNOSIS` 状态机；现有虚拟课堂也仅为
SWOT 浏览器端仿真，没有 CH06 批准设计的后端运行契约。因此保持
`CH06_TEACHING_DESIGN_PILOT_BLOCKED`，不生成或伪造 S2—S9、教师裁决、试教结果、版本链或 S9 资产候选。
