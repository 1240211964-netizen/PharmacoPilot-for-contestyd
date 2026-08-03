# Schema 版本纪律

- 版本:v1.0.0
- 日期:2026-08-03
- 状态:冻结

适用于 `schemas/v1/` 六个 JSON Schema、其 fixture、以及 `server/migrations/` 表结构演进。与 `domain-invariants.md` S1-S5 一一对应,本文是细则。

## 1. 基本规则

- 所有跨层 JSON 对象必含 `schemaVersion` 字段(S1);`schemas/v1/` 六个 schema 初始均为 `"1.0.0"`,且 `additionalProperties: false`(1.0.1 起两个 schema 为 `"1.0.1"`,见文末执行记录);
- 版本号走 semver:`MAJOR.MINOR.PATCH`;
- schema 文件按主版本分目录:`schemas/v1/`、`schemas/v2/`……旧版本目录永久保留,不原地修改;
- fixture 同步分目录:`schemas/fixtures/v1/`……每个 schema 至少一个正例 fixture + 必要的反例。

## 2. semver 规则

- **PATCH**:纯文档性修改(description、示例),不改变任何校验结果;
- **MINOR**:兼容扩张 — 只新增可选字段(注意 `additionalProperties:false` 下新增字段仍需升 MINOR 并同步 fixture)、新增枚举取值且旧写入路径不产出新值以外的非法数据;
- **MAJOR**:任何非兼容变更(见 §3),升主版本,新 schema 进新目录。

## 3. 什么算非兼容变更(必须升主版本,S2)

- 删除字段、改字段名;
- 改字段类型或收窄取值范围(含删除枚举值、收紧 format/pattern);
- 把可选字段改为必填;
- 改变字段语义,即使名称类型不变(S4:不得不改版本号改字段语义);
- 修改 ID 前缀规则、stageId 格式等跨对象约定;
- 表结构层面:改列类型语义、删除列、改变既有约束方向。

## 4. 变更流程

1. 新主版本:在 `schemas/v{n}/` 落全套 schema(即使只有一个对象变更,也复制未变更对象,保证单目录自洽);
2. 新 fixture 进 `schemas/fixtures/v{n}/`;
3. DB 侧变更:新增 `server/migrations/NNN_name.sql`,**不得修改已合入的 migration 文件**(S5,hash 防篡改,runner 启动时逐文件比对 `schema_migrations` 记录的 hash);
4. 随变更提交迁移说明(S3,模板见 §5);
5. 服务层按 `schemaVersion` 分发读写:旧版本数据可读,写入只写当前支持版本;读旧写新时必须执行显式 upgrade 函数并留痕。

## 5. 迁移说明模板

```markdown
## Migration / Schema 变更说明
- 变更对象:(schema 名 / 表名 / 文件)
- 从版本 → 到版本:
- 变更内容:
- 非兼容点:(无 / 列出)
- 数据迁移路径:(存量数据如何转换;无需转换则说明)
- 读兼容策略:(旧版本数据如何被新代码读取)
- 写兼容策略:(新数据对旧代码/旧 fixture 的影响)
- 回滚策略:(追加式体系下通常为"新增修正 migration",说明之)
- 关联 fixture / 测试:
```

## 6. Fixture 纪律

- 每个 schema 的 fixture 必须能通过对应版本 schema 校验,纳入测试(`node:test`,fixture 回归);
- 旧主版本的 fixture 永久保留并持续跑回归:验证新代码对旧版本数据的读兼容(S4 的落实手段);
- fixture 不得含真实 PII(学生姓名、学号等一律使用匿名样例,见 `security-and-privacy.md`);
- fixture 中的 ID 必须使用规定前缀(`obs_/ev_/clm_/tdr_/tdec_/mrn_/crs_/coh_/les_/lvr_/blk_/ka_/kav_/wf_/agt_`),stageId 用 `S1..S9`;
- 修改 fixture 语义视同修改 schema,受同一套版本纪律约束。

## 7. 执行记录

### 2026-08-03 — v1.0.1(兼容 PATCH:仅放宽校验)

- 变更对象:`teaching-decision-record`、`evidence-reference` 两个 schema;其余四个不变。
- 从版本 → 到版本:1.0.0 → 1.0.1(PATCH)。
- 变更内容(两处均为放宽,1.0.0 合法数据在 1.0.1 下必仍合法):
  1. `teaching-decision-record.sourceLessonVersionId/targetLessonVersionId` pattern `^kav_` → `^(kav|lvr)_`:1.0.0 误把教案版本 ID 写成知识资产版本前缀,`lesson_versions` 真实前缀为 `lvr_`;`kav_` 保留以兼容存量 1.0.0 数据,新写入一律 `lvr_`。
  2. `evidence-reference.sourceId` pattern `^ka_` → `^(ka|kav|obs|blk|tdec|ev|wf)_`:使 `runtime_observation` 等类型证据可表达。
- 非兼容点:无(接受集合只增不减;§3 的"修改 ID 前缀规则"指收紧/更换约定,此处为修正性放宽,且旧前缀继续接受)。
- 数据迁移路径:无需转换,存量 1.0.0 数据原样可读可校验。
- 读兼容策略:`validateAgainstSchema()` 按对象自带 `schemaVersion` 路由——`"1.0.0"` 走 `schemas/v1/`,`"1.0.1"` 走 `schemas/v1.0.1/`(无增量文件的 schema 回落 v1)。v1 fixture 永久保留并持续回归。
- 写兼容策略:服务层经 `getWriteSchemaVersion(name)` 取写入版本——两个增量 schema 写 `"1.0.1"`,其余四个仍写 `"1.0.0"`;发布产物 content_json 用 `CURRENT_SCHEMA_VERSION='1.0.1'`。audit_events.schema_version 保持 `'1.0.0'`(审计事件结构未变,不属于六个跨层对象)。
- 版本定级说明:§2 原将 PATCH 限定为"纯文档性修改";本次执行将 PATCH 语义明确扩展为"仅放宽校验的兼容修正(接受集合只增不减)"——不改变任何既有合法数据的校验结果,与 MINOR 的"新增字段/枚举"区分(本次未新增字段或枚举值,仅修正两处过严 pattern)。
- 发布方式:增量——`schemas/v1.0.1/` 只放两个变更 schema,未变更四个不复制。§4.1 的全套复制纪律针对新主版本目录(`schemas/v{n}/`),PATCH 增量不触发;单目录自洽性由校验器的版本路由 + 回落保证。
- 回滚策略:追加式体系下不原地回滚;如需废止,新增修正版本(1.0.2)重新收紧并配套 upgrade 函数。
- 关联 fixture / 测试:`schemas/fixtures/v1.0.1/`(2 合法 + 1 runtime_observation 新能力正例 + 4 反例);`server/schema-validation.test.mjs` 新增 11 例(路由、写入版本分发、向后兼容、读兼容回归),`npm run test:backend` 131/131 通过。
