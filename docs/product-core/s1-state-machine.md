# S1 主状态机

- 版本:v1.0.0
- 日期:2026-08-03
- 状态:冻结

## 1. 状态定义

S1(课前学情诊断与教学决策)主工作流,实例存于 `workflow_instances`(`stage_id='S1'`,字段 `current_state` + `state_version` 乐观锁 + `state_machine_version`)。

| 状态 | 含义 |
|---|---|
| `DRAFT` | 实例已建,输入(前测、知识资产)未齐 |
| `INPUT_READY` | 前测数据与知识资产版本已就位 |
| `FACTS_COMPUTED` | RuntimeObservation 已计算并落库(可重算、幂等) |
| `EVIDENCE_RETRIEVED` | 证据检索完成,EvidenceReference 已定位 |
| `CLAIMS_GENERATED` | TeachingClaim 已生成,TeachingDecisionRecord 已建 |
| `MECHANICAL_VALIDATED` | 机械门禁 14 条确定性校验已执行 |
| `SEMANTIC_REVIEWED` | 语义审查完成(本轮为 mock reviewer,仅接口+状态) |
| `TEACHER_REVIEW` | 等待/进行教师逐条裁决 |
| `PUBLISHED` | 已发布:新建 `lesson_versions` 行(status PUBLISHED)(终态) |
| `CANCELLED` | 已取消(终态,可从任意非终态进入) |

教师裁决是每条 TeachingDecisionRecord 上的状态(`PENDING/ACCEPTED/REVISED/REJECTED/DEFERRED`),**不是主工作流终态**。

## 2. 服务形态

唯一转移入口:

```js
transitionWorkflow(instanceId, action, actorContext)
```

- `actorContext`:`{ actorType, actorId }`(本轮无用户体系,actorId 以调用方提供的标识记录);
- 路由层与任何其他服务不得直接写 `current_state`(B8);转移携带 `state_version` 乐观锁,冲突返回 `WF_VERSION_CONFLICT`;
- 每次转移写一条 `audit_events`(`previous_state`/`next_state`/`actor_*`/`event_hash`)。

## 3. 转移表

| # | 转移 | action | 前置条件 | 后置条件 | 审计事件 |
|---|---|---|---|---|---|
| 1 | DRAFT → INPUT_READY | `submit_inputs` | 前测题目/作答已导入;所需 knowledge_assets 存在且至少各有一个未 superseded 的 asset_version | 记录输入快照哈希 | `workflow.transitioned` + `inputs.submitted` |
| 2 | INPUT_READY → FACTS_COMPUTED | `compute_facts` | 处于 INPUT_READY | `runtime_observations` 按 `UNIQUE(metric,lesson_id,aggregation_level,calculation_version)` 幂等写入,含 numerator/denominator/calculation_rule/calculation_version | `workflow.transitioned` + `facts.computed` |
| 3 | FACTS_COMPUTED → EVIDENCE_RETRIEVED | `retrieve_evidence` | 存在至少一条本次 lesson 的 observation | evidence_links 候选已定位到 `asset_version_id + page_index` 或 observation | `workflow.transitioned` + `evidence.retrieved` |
| 4 | EVIDENCE_RETRIEVED → CLAIMS_GENERATED | `generate_claims` | 证据检索完成 | teaching_claims 与 teaching_decisions(裁决状态 PENDING)已建;`model_runs` 记录本次运行 | `workflow.transitioned` + `claims.generated` + `model_run.recorded` |
| 5 | CLAIMS_GENERATED → MECHANICAL_VALIDATED | `run_mechanical_validation` | 存在至少一条 claim | 每条 TDR 写入 `validation_status`(PASSED/FAILED/WARNING/NOT_APPLICABLE);门禁结果留档 | `workflow.transitioned` + `gate.mechanical.completed` |
| 6 | MECHANICAL_VALIDATED → SEMANTIC_REVIEWED | `run_semantic_review` | 机械门禁已执行(允许存在 WARNING;FAILED 的 claim 不得进入发布) | 每条 TDR 写入 `semantic_review_status`(本轮 mock reviewer) | `workflow.transitioned` + `review.semantic.completed` |
| 7 | SEMANTIC_REVIEWED → TEACHER_REVIEW | `submit_for_teacher_review` | 语义审查完成 | TDR 开放教师裁决 | `workflow.transitioned` |
| 8 | TEACHER_REVIEW → PUBLISHED | `publish` | 本次发布覆盖的每条 TDR 裁决状态 ∈ {ACCEPTED, REVISED};无 PENDING(否则 `PUBLISH_NO_TEACHER_DECISION`);无 REJECTED/DEFERRED 内容进产物(否则 `PUBLISH_REJECTED_CONTENT`);全部进入产物的 claim 机械门禁非 FAILED | **新增**一行 `lesson_versions`(status PUBLISHED,version_no 递增,content_json 存 S1 结构化产物),不覆盖任何既有行 | `workflow.transitioned` + `lesson.published` |
| 9 | 任意非终态 → CANCELLED | `cancel` | 当前状态 ∉ {PUBLISHED, CANCELLED} | 实例封存,已生成记录全部保留 | `workflow.transitioned` + `workflow.cancelled` |

教师裁决动作(不转移主状态机,在 TEACHER_REVIEW 内发生):`accept / revise / reject / defer` → 追加 `teacher_decisions` 行 + 更新 TDR 裁决状态 + `teacher.decision.recorded` 审计。revise 同时按 supersede 链新建修订 claim,原 statement 不变(B2/B10)。

v1 不定义回退转移;修正路径 = 在允许状态下重跑门禁、supersede 修正 claim,或 cancel 后新建实例。机械门禁允许在 `MECHANICAL_VALIDATED` 状态内以同一 action 重跑(自环),重跑结果覆盖当次校验留档。

## 4. 非法转移清单(必须被拒绝并测试)

1. `DRAFT → CLAIMS_GENERATED`(跨态直跳);
2. 未算事实即生成诊断:非 `FACTS_COMPUTED` 之后的状态执行 `generate_claims`;
3. 无证据事实发布:claim 无有效 evidence_links 绑定进入发布产物;
4. 机械校验失败发布:`validation_status='FAILED'` 的 claim 进入发布产物(`GATE_VALIDATION_FAILED`);
5. 无教师裁决发布:存在 `PENDING` TDR 时执行 `publish`(`PUBLISH_NO_TEACHER_DECISION`);
6. `REJECTED`/`DEFERRED` 的 TDR 内容进入发布产物(`PUBLISH_REJECTED_CONTENT`);
7. 修改已发布版本:UPDATE/DELETE `lesson_versions` 中 `status='PUBLISHED'` 的行(`IMMUTABLE_RECORD`,触发器拒绝);
8. 修改历史 model_run:UPDATE/DELETE `model_runs` 任意行(`IMMUTABLE_RECORD`);
9. 修改历史审计:UPDATE/DELETE `audit_events` 任意行(`IMMUTABLE_RECORD`);
10. superseded 来源作为唯一证据发布(B11,门禁拒绝);
11. 跨课程引用运行数据:evidence_links 指向其他 course 的 observation(`CROSS_SCOPE_REFERENCE`);
12. 跨班级复用个人级记录:个人级 pretest_responses / runtime_observations 被其他 cohort 的 claim 引用(`CROSS_SCOPE_REFERENCE`)。

## 5. 错误码表

| 错误码 | HTTP | 含义 |
|---|---|---|
| `WF_ILLEGAL_TRANSITION` | 409 | 当前状态不允许该 action |
| `WF_VERSION_CONFLICT` | 409 | state_version 乐观锁冲突(沿用 `RevisionConflictError` 模式) |
| `WF_INSTANCE_NOT_FOUND` | 404 | 工作流实例不存在 |
| `GATE_VALIDATION_FAILED` | 422 | 机械门禁失败,阻断推进/发布 |
| `PUBLISH_NO_TEACHER_DECISION` | 422 | 存在未裁决(PENDING)的 TDR |
| `PUBLISH_REJECTED_CONTENT` | 422 | REJECTED/DEFERRED 内容被纳入发布产物 |
| `IMMUTABLE_RECORD` | 409 | 试图修改不可变记录(触发器/服务层) |
| `EVIDENCE_ANCHOR_INVALID` | 422 | 证据锚定无效(引用不逐字/来源不存在/版本失效) |
| `OBSERVATION_RECALC_MISMATCH` | 422 | observation 重算结果与存储值不一致 |
| `CROSS_SCOPE_REFERENCE` | 422 | 跨课程/跨班级引用运行数据 |
| `SCHEMA_VERSION_MISMATCH` | 400 | JSON 载荷 schemaVersion 不受支持 |

错误响应格式沿用既有 `{error:{code,message,details?}}`(`server/app.mjs` `fail()`)。

## 6. 审计事件类型清单

写入扩展后的 `audit_events`(`entity_type`/`entity_id`/`workflow_instance_id`/`previous_state`/`next_state`/`payload_json`/`event_hash`/`schema_version`):

- `workflow.created`
- `workflow.transitioned`
- `workflow.cancelled`
- `inputs.submitted`
- `facts.computed`
- `observation.computed`
- `evidence.retrieved`
- `claims.generated`
- `claim.superseded`
- `gate.mechanical.completed`
- `review.semantic.completed`
- `teacher.decision.recorded`
- `model_run.recorded`
- `lesson.published`
- `asset.version.created`

`event_hash` 由服务层对事件规范内容计算,供完整性核验;`payload_json` 不记敏感正文与完整学生原始数据(见 `security-and-privacy.md`)。
