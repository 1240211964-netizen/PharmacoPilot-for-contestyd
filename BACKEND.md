# PharmacoPilot 本地后端

这是一个本地优先的 Node.js 后端：同源提供现有网页，用 SQLite 保存教学工作台状态，并把教学工作流智能体请求统一转发给本机 OpenAI 兼容模型服务。前端与后端现在位于同一个 Git 仓库中。

## 启动

需要 Node.js 22.5 或更新版本。

```bash
cd /Users/yandilei/Desktop/Pharmaco_副本/pharmaco网页
npm ci
npm start
```

然后打开 [http://127.0.0.1:4173](http://127.0.0.1:4173)。首次连接时，浏览器已有的 `pharmacoPilot.state.v1` 会迁入本地 SQLite；如浏览器和后端都有不同修改，客户端会标记 `conflict` 并停止自动覆盖。

页面顶栏会显示同步状态：

- `已同步`：本机后端已连接，浏览器状态与 SQLite 已对齐。
- `仅浏览器`：后端不可用，当前修改仍保存在浏览器；点击状态标识可重试。
- `同步冲突`：浏览器和后端都有不同修改，系统已停止自动覆盖。

## 接入当前 MLX 模型

当前已安装 `mlx-community/Qwen3.5-9B-4bit`，并由本机管理命令启动 MLX OpenAI 兼容服务：

```bash
pharmaco-qwen status
pharmaco-qwen start
```

检查两层状态：

```bash
curl http://127.0.0.1:4173/api/health
curl http://127.0.0.1:4173/api/model/status
```

后端未启动或模型尚未就绪时，现有网页仍会降级使用 `localStorage`，不影响静态演示。

## 主要 API

| 方法 | 路径 | 用途 |
|---|---|---|
| `GET` | `/api/health` | 应用和 SQLite 健康状态 |
| `GET` | `/api/model/status` | 实时检查本地模型服务 |
| `GET` | `/api/agents` | 教学工作流智能体公开元数据 |
| `GET/PUT` | `/api/workspaces/:id/state` | 按 ETag/版本号读写教学状态 |
| `POST` | `/api/chat` | 非流式 JSON 或流式 SSE 模型对话 |
| `POST` | `/api/practice/generate` | 按课程上下文生成并校验九环节实践包 |
| `POST` | `/api/practice/reviews` | 按学科视角审校实践包，机械锚定门禁 + SQLite 持久缓存 |

`POST /api/chat` 示例：

```bash
curl http://127.0.0.1:4173/api/chat \
  -H 'content-type: application/json' \
  -d '{"agentId":"instructional-designer","messages":[{"role":"user","content":"检查这个课堂目标与评价是否对齐"}]}'
```

可用的工作流 `agentId`：`pharmacy-scenario`、`instructional-designer`、`evaluation-diagnostician`、`evidence-verifier`、`teaching-reflector`。它们描述的是工作流能力，不等同于教学实践页的药学、经管、法学、教育学、数据科学五类学科专家。

“教学实践”页的“生成实践包”按钮已接入 `/api/practice/generate`。后端只接受完整的课程、班级、课时、章节与九环节草稿，并只在模型返回 `env01`–`env09` 九个非空字段时写入页面。后端或模型不可用、响应结构不合格时，网页保留当前模板，不做空白覆盖。

“教学实践”页的五路学科审校（药学情境 / 管理决策 / 法规合规 / 教学设计 / 数据循证）走 `/api/practice/reviews`：每路只在自己的主责环节提一条批注，摘录必须逐字命中当前稿件（机械锚定门禁），未通过时返回 `unanchored`，前端保留固定审校种子。五路批量运行时前端并发上限 2，并把已锚定批注的位置作为 `avoidAnchors` 传给后续请求以避免同段扎堆。已锚定结果按“稿件哈希 + 修订号 + 审校者 + prompt 版本 + 避让列表”持久缓存到 SQLite——**答辩彩排提示**：演示前在**干净状态**（无已锚定批注）下点一次“五路审校当前稿件”批量按钮完成预热；正式演示也**一律走批量按钮**，不要先单卡审一路再批量审其余——混合操作会让后续请求携带不同的避让列表、产生不同缓存键，秒回就会失效。重启后端不影响缓存；现场改稿会改变稿件哈希，自动走真实推理。

## 数据与安全边界

- SQLite 默认位于 `.pharmaco-data/pharmaco.sqlite`，启用 WAL 和忙等待。
- 同步写入使用乐观版本检查，旧版本写入返回 `409 REVISION_CONFLICT`。
- 推理日志只保存智能体 ID、模型名、成功/失败、耗时和输入字符数，不保存原始提示词或回答。
- 默认仅监听 `127.0.0.1`。如果改为 `0.0.0.0` 或局域网地址，后端会要求同时设置 `PHARMACO_API_TOKEN`。
- 静态服务采用正向白名单：只提供 7 个正式页面入口，以及 `assets/`、`dist/`、`shared/` 中获准的运行时资源类型；`.git/`、`.pharmaco-data/`、`server/`、`node_modules/`、工程文档和草稿默认全部返回 `403`。
- 不要在仓库根运行 `python3 -m http.server`。日常预览统一使用 `npm start`；兼容旧 IDE 预览时，`.claude/serve.py` 也执行同一套白名单并默认只监听回环地址。

## 配置

| 环境变量 | 默认值 |
|---|---|
| `PHARMACO_HOST` | `127.0.0.1` |
| `PHARMACO_PORT` | `4173` |
| `PHARMACO_DATA_DIR` | `.pharmaco-data` |
| `PHARMACO_API_TOKEN` | 空（仅回环监听时允许） |
| `PHARMACO_MODEL_BASE_URL` | `http://127.0.0.1:8080/v1` |
| `PHARMACO_MODEL_NAME` | `mlx-community/Qwen3.5-9B-4bit` |
| `PHARMACO_MODEL_API_KEY` | 空 |
| `PHARMACO_MODEL_TIMEOUT_MS` | `120000` |

## 验证

```bash
npm test
npm run check
```
