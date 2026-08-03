# 安全与隐私

- 版本:v1.0.0
- 日期:2026-08-03
- 状态:冻结

适用于本轮产品内核全部新表、新服务、日志审计与测试资产。既有机制(单 token 鉴权、静态白名单、安全头,见 `current-state-audit.md` §7)继续有效,本文不重复。

## 1. 学情数据去标识化

- `pretest_responses` 与个人级 `runtime_observations` **只存 `student_anon_id`**,不存姓名、学号、联系方式等任何可识别字段;
- `student_anon_id` 的生成与真实身份的映射关系**不进入本系统**(由数据提供方在导入前完成匿名化);本库内不存在"匿名 ID → 真人"的反查表;
- 个人级运行数据不得跨班级复用(B12),从机制上降低重识别面。

## 2. 本地优先

- 数据全部存于本地 `.pharmaco-data/pharmaco.sqlite` 与本地文件系统;服务默认监听 `127.0.0.1:4173`;
- 模型链路:本轮只启用 mock 与 `existing-mlx`(本地 MLX,`server/model-client.mjs`,默认 `http://127.0.0.1:8080/v1`);**云端 provider(`deepseek-cloud`)未启用,仅占位** — 任何学情数据、教学材料正文不会出本机;
- 不引入 Dify/LangChain/向量库等会把数据送往第三方服务的组件。

## 3. 最小必要数据

- 表结构只收集 S1 闭环必需字段;`inference_events` 沿用旧纪律:只记元数据,不记 prompt/回答原文;
- `model_runs` 记 `input_hash` 与 `output_ref`(引用定位),不内嵌完整输入输出正文;确需留存的输入快照以哈希 + 文件引用方式保存;
- API 请求体沿用 2MB 上限(`server/app.mjs` `readJson()`),新路由同此约束。

## 4. 原始文件的权限与哈希定位

- **不把原始文件(PDF 等)塞进 SQLite**:`asset_versions.file_ref` 存文件系统相对路径,`source_hash` 存内容哈希;读取时以哈希校验完整性,路径解析须限制在受控数据目录内(防路径逃逸,沿用静态伺服 realpath 的思路);
- 原始文件目录的文件系统权限由部署方控制,服务进程只读访问;
- 原始文件内容不出现在 API 响应、日志、审计 payload 中。

## 5. 日志与审计纪律

- `audit_events.payload_json` 记录状态转移与结构元数据(ID、状态、哈希、计数),**不记敏感正文**(claim 全文、证据原文)与**完整学生原始数据**(作答原文只以哈希/引用出现);
- `console.log/console.error` 输出遵守同一纪律:不打印学生作答、材料正文、token;
- 鉴权 token 只经 `PHARMACO_*` 环境变量注入,不入库、不入日志、不入 fixture。

## 6. 教师最终裁决

- AI 产出仅为建议:任何内容进入发布产物前必须经教师逐条裁决(B9),`REJECTED`/`DEFERRED` 不进产物;
- 教师修订保留机器原文(B10),责任链(谁、何时、改了什么)在 `teacher_decisions` 与 `audit_events` 全程可追;
- 语义审查(本轮 mock)即使标 `supported` 也不豁免教师裁决。

## 7. 数据删除与保留策略

- **追加式记录不删**:`audit_events`、`teacher_decisions`、`model_runs`、已 PUBLISHED 的 `lesson_versions`、`teaching_claims` 原文、`asset_versions` 均不可删除(触发器/服务层强制),这是可审计性的前提;
- **运行数据可按班级周期清理**:`pretest_responses` 与个人级 `runtime_observations` 允许在班级教学周期结束、且相关 S1 决策已发布或取消后,按 cohort 整体删除;清理动作本身写一条审计事件(`entity_type='class_cohort'`,payload 只记 cohort ID、删除行数、执行者),不记被删内容;聚合级 observation 已进入发布产物的,其证据有效性以发布时快照为准,不受后续清理影响;
- 清理是显式管理操作,无自动定时删除。

## 8. 测试与评测资产

- `schemas/fixtures/`、`evaluation/`、`experiments/` 中的全部样例数据**不含真实 PII**:学生标识一律为合成匿名 ID,材料文本来自公开出版物或合成样例;
- 评测金标准引用真实公开教材/法规时,只引段落与哈希,不复制整份受版权保护文件入仓。
