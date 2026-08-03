# PharmacoPilot 产品内核重构 · 当前工程核查

核查日期:2026-08-03。核查对象:`pharmaco网页/`(本重构的工程根,以下所有相对路径均以它为根)。
所有结论基于代码实读,不以 PPT、申报书或说明文档为依据。

## 0. 仓库根与主要子目录

- 外层目录 `/Users/yandilei/Desktop/Pharmaco_副本/` 是申报/素材工作区(含 `申报材料/`、`课程智能体/`、多个 PPTX),**不是**代码工程根。
- 代码工程根为 `pharmaco网页/`,是一个 git 仓库(含 `.git/`)。主要子目录:
  - `server/` — Node 后端(7 个 `.mjs` 文件 + 1 个测试文件);
  - `shared/` — 前端共享 JS/CSS 与 11 个 `station*.payload.js` 教学站点展示负载;
  - `tools/` — 15+ 个断言式验证脚本与探针;
  - `migration/` — **与数据库 migration 无关**,是 32 人虚拟班 persona 数据的迭代工件(3 个 JSON);
  - `assets/`、`dist/`、`output/`、`outputs/`、`.pharmaco-data/`(gitignored,含 SQLite 文件);
  - 根级 7 个 HTML 页面 + `build.mjs`(esbuild 打包)。
- 根目录**无 AGENTS.md**,无 README.md;有 `BACKEND.md`、`HANDOFF.md`(经抽查与代码一致)。

## 1. Node 版本 / 包管理器 / 模块系统

- Node `v22.22.0`,`package.json` `engines: >=22.5.0`(依赖 `node:sqlite` 内置模块的最低版本)。
- 包管理器:npm 10.9.4,存在 `package-lock.json`。
- 模块系统:纯 ESM(`"type": "module"`),全部 `.mjs`/`.js` 均为 ESM。
- dependencies 仅 4 个前端导出库(`docx/html2canvas/jspdf/jszip`);devDependencies 仅 `esbuild`。**后端零依赖**。

## 2. JavaScript / TypeScript

- 纯 JavaScript(ESM),无 TypeScript、无类型检查工具链。

## 3. 后端框架

- **无框架**。`server/app.mjs` 用 `node:http` 原生 `createServer`,`handleApi()`(`server/app.mjs:520`)内逐条 `if` 匹配路由。
- 入口 `server/index.mjs`:loadConfig → new PharmacoDatabase → new ModelClient → createPharmacoServer → listen;SIGINT/SIGTERM 优雅关闭。
- 默认监听 `127.0.0.1:4173`(`server/config.mjs:25,38`)。

## 4. SQLite 访问方式

- **`node:sqlite` 内置 `DatabaseSync`**(`server/db.mjs:4`),非 better-sqlite3/sqlite3/ORM。
- 数据库文件:`.pharmaco-data/pharmaco.sqlite`(`server/db.mjs:17`,dataDir 见 `server/config.mjs:36`)。
- 已开 WAL(`server/db.mjs:20`)、`foreign_keys=ON`、`busy_timeout=5000`。
- 导出 `class PharmacoDatabase`:`ping/getState/putState(BEGIN IMMEDIATE + revision 乐观锁,冲突抛 RevisionConflictError)/getPracticeReview/savePracticeReview/recordInference/close`。

## 5. Migration 机制

- **完全缺失**。schema 内联在 `PharmacoDatabase` 构造函数的 `db.exec()`(`server/db.mjs:19-58`),仅 `CREATE TABLE IF NOT EXISTS`(STRICT 模式);无 `schema_migrations` 表、无版本号、无 runner。
- 现有 4 张表:
  - `workspace_states`(db.mjs:24)— 工作区不透明 JSON 快照 + revision 乐观锁;
  - `audit_events`(db.mjs:32)— 审计事件(追加式,但目前只有 `putState` 一个写入点,db.mjs:115-121);
  - `inference_events`(db.mjs:43)— 推理元数据日志(不记 prompt/回答原文);
  - `practice_review_cache`(db.mjs:53)— 五路审校结果缓存,键含稿件哈希+revision+promptVersion。
- 结论:新增领域表必须自建版本化 migration 机制,并把现有 4 表作为 baseline 纳入。

## 6. 测试框架

- 后端:`node:test` + `node:assert/strict`(`server/backend.test.mjs`,3 个顶层 test、17 个子用例,全部用 fake model);命令 `npm run test:backend` = `node --test server/*.test.mjs`。**新增 `server/*.test.mjs` 自动纳入。**
- 前端/契约:`tools/verify-*.mjs` 断言脚本(裸 assert,非零退出即失败),串在 `npm run test:frontend`。
- `npm run check` = build --check + 全部测试(HANDOFF.md 称 20/20 绿)。

## 7. API 结构

8 条路由(均 JSON in/out,错误统一 `{error:{code,message,details?}}`):

| Method+Path | 位置 | 用途 |
|---|---|---|
| GET `/api/health` | app.mjs:526 | 服务+SQLite 健康 |
| GET `/api/model/status` | :536 | MLX 探测 |
| GET `/api/agents` | :541 | 智能体公开元数据 |
| GET/PUT `/api/workspaces/:id/state` | :546-563 | 状态同步(ETag/If-Match 乐观锁,409 REVISION_CONFLICT) |
| POST `/api/chat` | :567 | 模型对话(JSON/SSE) |
| POST `/api/practice/generate` | :606 | 九环节实践包生成 |
| POST `/api/practice/reviews` | :648 | 五路审校(两级缓存+锚定门禁+unanchored 降级) |

- 鉴权:单一静态 Bearer/`x-pharmaco-token`,`timingSafeEqual` 比对(app.mjs:440-447);无用户/角色概念。
- 静态伺服:正向白名单(app.mjs:461 `staticAllowed`),仅 7 个根级 HTML + `assets/dist/shared` 指定扩展;realpath 防逃逸;安全头齐全。**新增页面必须加入该白名单。**
- 前端封装:`shared/backend-client.js`(`window.PharmacoBackend`,含 sync/push/pull/chat 等,防抖 800ms,冲突只标记不覆盖)。

## 8. 已有课程/教案/班级/学生/模型运行/审校/工作流数据结构

- **后端无任何领域表**。所有教学领域数据以前端静态负载存在:
  - `shared/station1.payload.js` … `station11.payload.js` — 11 个教学站点展示数据(IIFE 注册到 `window.PharmacoPilotStationPayloads`);
  - `shared/virtual-class-agents.json`(301 KB,`virtual-class-agents-v0.5`)— 32 人虚拟班运行时数据,由 `shared/practice-runtime.js` 以**确定性规则**驱动(非 LLM);
  - `虚拟班32人数据.md`(gitignored)— 人类可读设计底稿;
  - `migration/*.json` — persona 迭代工件。
- "前测"目前是写死的演示数字(`shared/evaluation-framework.js:153`、`data-detail.html:2327` 明确标注"真实入学前测待接入");`shared/station1.payload.js:52` 注释声明"上传当班前测后自动重算"功能**已停用**。
- 判定:真实前测管道 = 界面占位;课程/班级/学生/工作流领域模型 = 完全缺失。

## 9. 本地 MLX/Qwen 接入位置

- `server/model-client.mjs` `class ModelClient`:OpenAI 兼容协议。
  - `status()`(:32)GET `{baseUrl}/models`,超时 2500ms;
  - `chat()`(:61)POST `{baseUrl}/chat/completions`,总超时 120s,支持流式与外部 AbortSignal;失败抛 `ModelUnavailableError`(→503)/`ModelUpstreamError`(→502)。
- 配置:`server/config.mjs:42-47`,默认 `http://127.0.0.1:8080/v1`、`mlx-community/Qwen3.5-9B-4bit`,环境变量 `PHARMACO_MODEL_*` 可覆盖。
- **无 provider 抽象**,单一通道;prompt 全部硬编码在 `server/agents.mjs`。

## 10. 五路审校 / evidence-verifier

- **五路学科审校已完整实现**:`server/agents.mjs:69-165` `PRACTICE_REVIEWERS`(药学情境/管理决策/法规合规/数据循证/教学设计,scope 刻意错开),配套机械锚定门禁 `tools/anchor-gate.mjs`(`anchorAnnotation/anchorCrossReferences`,三级 exact → normalized-exact → 失败),已接入 `app.mjs:15`;前端编排在 `shared/practice-runtime.js:4042-4121`。
- `evidence-verifier` 目前只是 `TEACHING_AGENTS` 五个聊天智能体之一(agents.mjs:20-25),无独立服务化实现。
- 探针:`tools/review-probe.mjs`、`tools/review-concurrency-probe.mjs`、`tools/live-review-run.mjs`。

## 11. 日志 / 审计 / 事件记录

- `audit_events` 表存在(追加式 INSERT),但只有一个写入点(`putState` → `workspace.state.updated`)。
- `inference_events` 在 `/api/chat`、`/api/practice/generate`、`/api/practice/reviews` 三处 finally 写入,只记元数据。
- 其余为 `console.log/console.error`;无日志文件、无轮转。

## 12. FTS5

- **完全缺失**。全仓(排除 node_modules)grep `CREATE VIRTUAL TABLE`/`fts5`/`MATCH` 零命中。

## 13. 文件上传 / 文档解析

- **完全缺失**。无 multipart、无上传入口、无 PDF 解析;唯一请求体读取是纯 JSON `readJson()`(app.mjs:55-69,上限 2MB)。前端 jspdf/html2canvas 仅用于浏览器端导出。

## 14. 不可覆盖版本 / 历史记录

- **部分存在**:`workspace_states.revision` 乐观锁(防并发覆盖但不留历史,原地 UPDATE);`practice_review_cache` 以内容哈希为键、payload 内含 sourceRevision/sourceHash/promptVersion 快照("锚定存快照",HANDOFF §4-2 硬约束)。
- **缺失**:无版本表、无历史快照链、无不可变记录强制机制(触发器/服务层均无)。

## 15. 判定汇总

| 能力 | 判定 |
|---|---|
| node:sqlite + WAL + 封装类 + 乐观锁先例 | 已存在 |
| API 路由/单 token 鉴权/静态白名单/错误格式 | 已存在 |
| MLX OpenAI 兼容单通道 | 已存在(provider 抽象缺失) |
| 五路审校 + 锚定门禁(接真模型) | 已存在 |
| audit_events / inference_events 追加表 | 部分存在(写入点少) |
| 乐观锁 revision、内容哈希缓存键 | 部分存在(无版本历史) |
| 版本化 migration 体系 | 完全缺失 |
| 课程/班级/课时/学生/工作流领域表 | 完全缺失 |
| 真实前测数据管道 | 界面占位(标注"待接入"/"已停用") |
| FTS5 | 完全缺失 |
| 上传/PDF 解析 | 完全缺失 |
| schema 校验(JSON Schema) | 完全缺失 |

## 16. 对本轮重构直接相关的既有资产(复用清单)

1. `node:sqlite` DatabaseSync + WAL + STRICT 表先例 → 新 migration 沿用;
2. `RevisionConflictError` 乐观锁模式 → 工作流状态版本冲突沿用;
3. `audit_events`/`inference_events` 追加式先例 → 新审计体系扩展(新表,不动旧表语义);
4. `HttpError`/`fail()` 错误格式、`authorized()` 鉴权、静态白名单 → 新 API 直接复用;
5. `tools/anchor-gate.mjs` 的三级锚定思路 → 机械门禁"逐字引用校验"的范式参考(不直接复用,领域不同);
6. `server/backend.test.mjs` 的 fake-model 测试模式 → 新测试沿用;
7. `ModelClient` → 包一层 provider adapter,不改其底层。

## 17. 已知技术债务(与本轮相关)

- schema 无 migration 体系,建表散落在构造函数;
- 审计表写入点过少,审校/生成/发布等关键动作无审计;
- TEACHING_AGENTS 命名为已弃用口径(HANDOFF §3 P1),本轮不处理;
- 教学领域数据全在前端巨型静态负载,后端无领域模型(本轮开始建立);
- 无用户/角色体系,`reviewerId` 等只能先以调用方提供的 actor 标识记录。
