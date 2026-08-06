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

## P2B.1 有效修订补丁（2026-08-06）

本节追加记录教师审核及首次仿真完成后的修订修复；上面的“当前边界”是修复前快照，予以保留，
不作为当前状态。原工作流 `twf_W9X4nF8UD2QRJw6mHQIyJ`、v1
`tdv_rZmwm3ijM1kMjwNy9NUqD`、仿真 `sim_TZXqiN2OeA6FyFSXvjdtC`、未形成正文变化的 v2
`tdv_2UgsTeGAox2IAXim0cIdd` 和旧 S9 候选 `sac_h7tqeuVUuZ2VkUR6cpDdl` 均未覆盖或删除。

### 根因

- 旧 S8 生成只读取第一条关键时刻，动作固定为 `investigate`，没有生成 `changedFields`。
- 旧 v2 创建逻辑直接复用 v1 的 `payload_json`，没有字段路径校验或修订应用步骤，因此 payload 与
  hash 均未发生变化。
- 旧 S9 只是引用这个无正文变化的 v2，无法证明仿真反馈已进入教学设计。

### 实际修订

新的 S8 `srev_0TMtSIiLBF7I41WuQRTp4` 同时消费两条关键时刻：

- S5 `km_2dy8xXovMzSvROlVU8idA`：加入“矩阵制双重领导冲突诊断”和
  “角色—权责—命令来源对照表”，要求学生识别两条命令链、冲突类型、协调机制和升级路径，
  明确双重领导会增加协调需求，而非自动消除协调问题。
- S7 `km_KznszzEKtpIehzskJFjm8`：在表现性任务和评价标准中加入授权—分权辨析，要求依据
  决策权持续性、适用范围、最终责任和可撤回性进行分类，并说明二者可以并存但不等同。

两项变化均保存 `stage`、`fieldPath`、`before`、`after`、`reason` 和
`criticalMomentId`。修订应用器以 v1 为基线，只允许当前补丁声明的 S5/S7 路径，验证前值一致后
写入后值，并计算新 payload hash；它不是再次复制 v1。

有效修订版本为 `tdv_DF3sMRIKjFkCOpslOiBcY`（数据库 `versionIndex=3`），父版本仍是 v1，
标记为 `effectiveRevision=true`、`revisionLabel=simulation-informed revision`。其 payload hash 为
`83c34e3013f0618ab9c3a0c607f0805620912e382fe6cd2d3342708c4c052bec`，与 v1 及旧 no-op v2
的 `8fbe6de734...` 不同。查询层将旧 v2 派生标记为 `revisionOutcome=NO_OP`，不改写旧记录。

新 S9 候选为 `sac_RTANzmnsuyBbEVAxivSur`，状态保持 `candidate`，引用新的有效修订版本，
并通过 metadata 记录 `supersedesCandidateId=sac_h7tqeuVUuZ2VkUR6cpDdl`。旧候选仍可查询。

### 验收

- 新增集成测试验证两个关键时刻被完整消费、S5/S7 两项 `changedFields` 均为真实前后差异、
  v3 payload 与 v1/no-op v2 均不同、新 S9 引用 v3，且旧版本和旧候选保留。
- 实际工作流仍为 `COMPLETED`；版本数由 2 增至 3，S8 记录由 1 增至 2，S9 候选由 1 增至 2。
- 模型运行记录仍为 6，没有新增 LLM 或 Embedding 调用。
- 课程 SQLite 修订前后 SHA-256 均为
  `8524f6b700728a6417fec00191c7e912615ae6fcc363b2a4161b0e516d14bfa9`。
- 教师结果页展示旧 v2“未形成正文变化”、两条关键时刻、S5/S7 前后差异、
  v3“仿真驱动修订版”和新 S9 候选 ID。

当前判定：`CH06_REAL_PILOT_RUNNABLE`。
