# PharmacoPilot 产品内核 Schema 契约

`schemas/v1/` 存放产品内核六个跨层持久化对象的 JSON Schema(draft-07,自包含,不使用 `$ref`/远程引用);`schemas/fixtures/v1/` 存放合法/非法样例。校验入口为 `server/product-core/schemas.mjs`,测试为 `server/schema-validation.test.mjs`。

## 版本与兼容策略(当前:1.0.1)

- **增量发布**:1.0.1 只发布有变化的两个 schema,落在 `schemas/v1.0.1/`:`teaching-decision-record`、`evidence-reference`。其余四个 schema(`runtime-observation`、`teaching-claim`、`teacher-decision`、`model-run`)无变化,**不复制**,仍以 `schemas/v1/`(schemaVersion `"1.0.0"`)为当前版本。依据 `docs/product-core/schema-versioning.md`:全套复制纪律针对新主版本(`schemas/v{n}/`),PATCH 增量不触发。
- **1.0.1 变更内容**(仅放宽校验的兼容 PATCH,1.0.0 合法数据在 1.0.1 下必仍合法):
  1. `teaching-decision-record` 的 `sourceLessonVersionId`/`targetLessonVersionId`:pattern 由 `^kav_` 放宽为 `^(kav|lvr)_`。`lvr_` 是 `lesson_versions` 表的真实 ID 前缀(1.0.0 误写为 `kav_`);`kav_` 为兼容存量 1.0.0 数据保留,新写入一律 `lvr_`。
  2. `evidence-reference` 的 `sourceId`:pattern 由 `^ka_` 放宽为 `^(ka|kav|obs|blk|tdec|ev|wf)_`,使 `runtime_observation` 等类型证据可表达(按 evidenceType 取对应前缀);1.0.0 的 `ka_` 数据不受影响。
- **旧可读、新写当前版本**:校验入口 `validateAgainstSchema()` 按对象自带 `schemaVersion` 路由——`"1.0.0"` 走 `schemas/v1/`,`"1.0.1"` 走 `schemas/v1.0.1/`(无增量文件的 schema 回落 v1,由 const 校验兜出版本错误)。服务层写入用 `getWriteSchemaVersion(name)`:有 1.0.1 文件的写 `"1.0.1"`,其余仍写 `"1.0.0"`;发布产物(lesson_versions content_json,不属六个 schema)用 `CURRENT_SCHEMA_VERSION = '1.0.1'`。
- fixture 同步增量:`schemas/fixtures/v1.0.1/` 只含两个变更 schema 的正反例;v1 fixture 永久保留并持续回归(读兼容证明)。

## 校验器选型

- **选择**:`ajv@8` + `ajv-formats@3`(后者提供 `date-time` 等 format 校验)。
- **理由**:ajv 是 JSON Schema 事实标准实现,成熟、语义完整;`format: date-time` 等需求开箱可用,避免手写校验器的长尾语义偏差。
- **许可证**:两者均为 MIT。
- **原生编译**:均无,纯 JavaScript,`npm install` 即可,无 node-gyp/平台二进制。
- **部署影响**:`package.json` 的 `dependencies` 新增两个条目,部署时需 `npm install`(工程本就如此);无构建步骤变化,前端脚本不受影响。
- **备选方案**(未启用):若网络不可用导致无法安装,则改写零依赖 JSON Schema 子集校验器 `server/product-core/schema-validator.mjs`(支持 type/properties/required/additionalProperties/enum/const/pattern/format(date-time)/items/minItems)。六个 schema 刻意保持扁平自包含(无 `$ref`),两种方案均可直接校验。

## 统一约定

- 每个 schema 的 `$id` 为 `https://pharmacopilot.local/schemas/<版本目录>/<name>.schema.json`(v1 目录为 `.../schemas/v1/<name>.schema.json`,v1.0.1 目录为 `.../schemas/v1.0.1/<name>.schema.json`)。
- 每个对象必须带 `schemaVersion`,值为该 schema 当前版本的 const(v1.0.1 两个 schema 为 `"1.0.1"`,其余四个仍为 `"1.0.0"`),不符即校验失败。
- 一律 `additionalProperties: false` + 显式 `required`。
- 时间字段为 ISO 8601 `date-time`。
- 空值策略:可选字段默认**省略**而非 `null`;仅 schema 中 `type` 标注 `["...", "null"]` 的字段允许 `null`(各字段 description 有说明)。
- 跨字段业务规则(factual_claim 至少一条证据、bbox 为 null 时坐标系须为 none、revise 必须有 editedStatement 等)中,纯结构可表达的(bbox 规则)已用 `if/then` 写入 schema;涉及跨表/业务语义的部分由服务层强制。

## 对象清单

| Schema | 当前版本 | 说明 |
| --- | --- | --- |
| `runtime-observation` | 1.0.0 | 运行时观测(前测正确率等量化事实) |
| `evidence-reference` | **1.0.1** | 证据引用(知识块/观测/标注等锚点) |
| `teaching-claim` | 1.0.0 | 教学主张(事实/推断/建议) |
| `teaching-decision-record` | **1.0.1** | 教学决策记录 |
| `teacher-decision` | 1.0.0 | 教师决定(accept/revise/reject/defer) |
| `model-run` | 1.0.0 | 模型运行审计记录 |

## Fixtures

`schemas/fixtures/v1/`:每个 schema 一个 `<name>.valid.json`(语义合理的合法样例)加 6 个 `<name>.invalid-<原因>.json`,覆盖:缺 required、非法 enum、多余字段、错误 schemaVersion、错误时间格式、错误 ID 格式。

`schemas/fixtures/v1.0.1/`:仅两个变更 schema——各 1 个 `valid.json`,外加 `evidence-reference.valid-runtime-observation.json`(1.0.1 新能力正向覆盖)与反例(`bad-lesson-version-id`、`bad-source-id`、`bad-schema-version`)。

## 运行测试

```bash
node --disable-warning=ExperimentalWarning --test server/schema-validation.test.mjs
```
