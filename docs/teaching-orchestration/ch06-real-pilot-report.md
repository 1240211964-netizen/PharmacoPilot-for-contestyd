# CH06 真实教学设计试点（P2B）

## 冻结前提

- P1 tag `management-principles-kb-product-integration-p1` 仍指向
  `9a78dfe963a96199e7af08f79e60f32458615afa`，未移动。
- P2A tag `management-principles-teaching-orchestration-p2a-mvp` 已冻结在
  `f857fac7f68097177381a45fa35670a58808e4d7`，未移动。
- P2B 在独立分支 `feat/ch06-real-pilot-p2b` 继续，课程 SQLite 只读 SHA-256 为
  `8524f6b700728a6417fec00191c7e912615ae6fcc363b2a4161b0e516d14bfa9`。

## 已实际运行

真实运行接口为 `POST /api/product-core/teaching-orchestration/ch06/run`。它要求
`generationMode=local_model` 与 `s1ContextMode=simulated_fixture`，并在模型或只读
语料不可用时 fail closed。

本次运行使用本地 `mlx-community/Qwen3.5-9B-4bit`，模型端点为
`http://127.0.0.1:8080/v1`；P1 语料版本为
`a4f11290b7a59d17e101c29ab8dfb1e93ef09cc0d22fbfc6717d2df54edbc687`。

每个 S2—S7 节点各创建一个确定性 lexical retrieval run，并仅把其中
`llm_input_allowed=true` 的一条、短摘录、带 evidence link/chunk/page/content hash 的切片
发送给模型。不会发送课程 SQLite、完整 PPT/PDF 或 121 个可授权切片的全集。

结构化回包和原始模型回包、提示词版本、模型 profile、请求哈希、输入 chunk/evidence IDs、
时间与校验状态存入追加式 `teaching_model_generation_runs`。模型默认 reasoning 会挤占 JSON
输出预算，P2B 对该结构化节点显式传入 MLX 支持的
`chat_template_kwargs.enable_thinking=false`；该调用已用最小真实请求验证。

真实运行目前到达 `TEACHER_REVIEW_PENDING`：S1 是明确标记的
`simulated_for_workflow_validation` fixture，S2—S7 均为 `local_model` 候选。它没有伪造
教师裁决，也没有在审核前生成 v1、仿真、S8、v2 或 S9。

## 教师操作入口

打开 `/ch06-real-pilot.html`：页面展示各 S2—S7 内容、claim type、evidence link、来源定位、
结构化内容及原始运行记录。教师可真实提交 `ACCEPTED`、`MODIFIED`、`REJECTED` 或
`PENDING_EVIDENCE`；`MODIFIED` 保留原内容和改后 JSON。

只有每个 S2—S7 至少有一个有效教师裁决时，才能调用
`POST /api/product-core/teaching-orchestration/workflows/:id/complete-real-pilot`，从批准的 v1
运行已有确定性仿真内核，生成关键时刻驱动的 S8、v2 与 S9 `candidate`。

手工模型验收命令为 `npm run pilot:ch06-real`（可用 `PHARMACO_PILOT_URL` 与
`CH06_PILOT_SEED` 覆盖默认值）；它不属于普通 `npm run check`。

## 当前边界

教师的实际裁决尚未发生，故版本链的后半段尚未生成。这是有意保留的人工权限门，不是以
fixture 冒充真实审核。全量 schema、权限系统、通用多章节 API、任务队列与正式工作台视觉仍 deferred。
