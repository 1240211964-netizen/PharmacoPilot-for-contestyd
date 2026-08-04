# PharmacoPilot · 交接说明

> 生成于 2026-08-02，末次更新 2026-08-04。**唯一信源是代码与 `npm run check`**；本文与代码冲突时以代码为准。
> 长期约束另见 `TYPOGRAPHY.md`（排版）与仓库内各 `verify-*.mjs`（可执行的口径门禁）。

---

## 0. 一句话现状

参赛项目（全球数智教育创新大赛 · AI for Medicine · 课程智能体赛组），**10 月现场答辩**。
前端三工作台 + 本机后端（Node + SQLite + MLX/Qwen）**已跑通端到端**：
实践包生成、五路学科审校接真模型、审校缓存持久化、锚定门禁全部在线。

**教学数据决策摘要页 V1（2026-08-04）：本地冻结完成 ｜ 线上仍为旧版 `?v=4` ｜ 部署待执行。**

本地验收：`npm run check` exit=0（静态 175/175 + 桌面冒烟 + 390×844 移动冒烟 33/33）。
**在完成 §3 P0 部署并线上复验之前，任何材料都不得写成"线上完成"。**

---

## 1. 怎么跑起来

**干净 checkout 首次运行，两步都要做：**

```bash
cd pharmaco网页
npm install                      # 依赖（含 esbuild、playwright）
npx playwright install chromium  # 浏览器二进制，npm install 不会自动下载
```

`npx playwright install chromium` **不能省**。`npm run check` 末尾的冒烟测试要真开浏览器渲染页面，
本机已缓存过二进制所以感觉不到，换台机器或干净 checkout 会直接失败。
（两个 smoke 脚本已内置预检：缺二进制时打印上面这条命令，而不是甩一段 Playwright 堆栈。）

日常：

```bash
npm start                 # 后端 + 静态站，http://127.0.0.1:4173
npm run check             # 构建新鲜度 + 前端静态门禁 + 后端 + 运行时冒烟
```

`npm run check` 三段，缺一不可：

| 段 | 命令 | 证明什么 |
| --- | --- | --- |
| 构建新鲜度 | `node build.mjs --check` | `dist/` 与源文件一致，没忘记重新构建 |
| 静态门禁 | `npm test` | 源码层口径：令牌、术语、环节名、锚定、后端单测 |
| 运行时冒烟 | `npm run test:smoke` | **页面真的渲染完成**——桌面 1440×900 + 移动 390×844 |

最后一段是 2026-08-03 误删 `const MODES` 之后加的：那次 175 项静态门禁全绿、控制台零报错，
但页面从图谱往下全没渲染。静态断言只能证明"源码里有这段字符串"，证明不了"跑起来是对的"。

模型：MLX OpenAI 兼容服务在 `127.0.0.1:8080/v1`，模型 `mlx-community/Qwen3.5-9B-4bit`，启动方式见 `BACKEND.md`。
双击启动器：`启动3D教室.command` / `启动3D路书.command`（均已改走 `npm start`）。

> ⚠️ **3D 页面必须走 http**（ES module + importmap + fetch），`file://` 双击打不开——
> `nav-3d.html` 已内置 file:// 兜底提示，不会白屏。

---

## 2. 已完成（截至本次交接）

**后端**：SQLite（WAL + 乐观锁 revision）、五教学智能体 + `/api/chat`（SSE）、实践包生成接口、
五路学科审校接真模型（scope 隔离 + 同段避让 + 并发 2 扇出）、审校缓存持久化到 SQLite（重启秒回）、
静态路由正向白名单加固（`.git`/SQLite/源码/依赖全部 403，有回归测试锁住）。

**锚定门禁**（`tools/anchor-gate.mjs` + 单测）：三级门禁
`exact` → `normalized-exact`（仅消格式噪声，位置映射回原文，存的仍是原文逐字片段）→ 失败降级。
硬约束：≥12 中文字符、只在声明的 `targetEnv` 内定位、落在别的环节返回 `wrong_env` 不代改、
`segmentKey` 按命中位置重新推导（不信模型填写值）。已被 `server/app.mjs` 接入生产。

**前端**：教学导航 3D 路书（`nav-3d.html`，含巡游叙事 + 产出链可视化）、
产物卡状态化（判断已定 → 显示教师真实决策草稿）、
实践包生成分栏（选择区 / 结果区上下分离）、
工作台容器 1280 → **1540**、字号提升到语义角色层、
`data-detail` 三个 section 文案精简（免责声明 4 处 → 1 处，统一在证据带）。

**教学数据页判断层重构**（2026-08-04，已冻结）：
页面主线从"指标陈列"改为**判断陈列**——9 环节状态轨道（不是抽屉导航，只做定位）→
本轮判断卡（保留 06 / 修正 07）→ 行动项 → 评价依据 → 证据带。
配套：渲染哨兵 `<html data-data-render-state>`、`较强关联证据 ★` 改为 `档位：较强`（不再把关联强度说成证据质量）、
理论披露降为单层且后置。390×844 移动端验收 33 项全绿，截图在 `output/playwright/data-summary-mobile*.png`。
**结构已冻结，不再调整视觉架构**；剩余问题见 §3 的 P2 图谱区。

**答辩确定性**：预热与演示一律走批量按钮（避让列表决定缓存键），口径已固化在 commit `1de8569`。

---

## 3. 待办（按优先级）

### P0 — 部署
线上 `pharmacopilot.netlify.app` 资源齐全（Three.js / bundle / nav-3d 均 200），
但**内容仍是旧版**（实测线上无本轮新文案）。本轮全部成果尚未上线。

```bash
cd pharmaco网页 && npm run check      # 必须先绿
node ../make-deploy.mjs               # 白名单打包 → pharmaco-deploy.zip
```
拖 zip 到 Netlify。**部署冻结标签 `freeze/data-summary-v1` 那个 commit，不要顺手带上后续改动。**

部署后两组复验都要做：

**A. 资源与红线**（curl 即可）
bundle / three.js 200、`/shared/*` 带 `immutable`、
`design-canvas.jsx` / `RELEASE_NOTES.md` / 草稿页应 404、线上 `中国药大|cpu.` 应 0 命中。

**B. 教学数据页 V1 上线复验**（浏览器，逐条打勾）
1. 加载的 JS/CSS 是新版本号，不是旧缓存（DevTools Network 看 `?v=`）；
2. `<html data-data-render-state="ready">`；
3. 06 / 07 判断卡、9 环节轨道、行动清单均正常渲染；
4. 评价依据默认折叠，展开后 12 项；
5. 390px 下整页无横向溢出；
6. 样本身份仍显示「样本演练 · 非真实课堂」。

> 第 6 条是匿名红线的一部分：这页的数字是虚拟演练，标识掉了就变成宣称真实教学成效。

B 组全部通过后，才可以把状态从"本地冻结完成"改写为"已上线"。

### ~~P1 — 版本号~~（2026-08-04 已完成）
全站已统一到 `tokens.css?v=8-motion-tokens`（10 处）、`bc-chrome.css?v=24-status-strip-removed`（7 处，
另 3 页本就不引 bc-chrome）。`practice-detail.html` 也已跟上，不再有 `?v=6` / `?v=9` 残留。

**这条约束长期有效，别删**：改 `shared/*.css` 必须同步 bump 所有引用页的 `?v=`。
后果实测过——本地缓存住旧 `?v=` 后，页面拿到旧 tokens（`accent-color`/`color-scheme` 全部失效），
而线上 `/shared/*` 是一年 immutable，老访客必然命中。核对命令：

```bash
grep -hoE "(tokens|bc-chrome)\.css\?v=[^\"']*" *.html | sort | uniq -c   # 每种应只有一个版本号
```

### P2 — 图谱区 390px 被裁切（既有，**不是本轮引入**）

`data-detail.html` 的 `.bi-atlas` 在 390×844 下，内部 `station-header` / `stage-pre` /
`station-numbers` / `lane` / `coupling-bridge` / `bridge-track` 均宽于视口，
而祖先 `.bi-atlas` 是 `overflow-x: hidden` —— 所以**整页不横向滚动（这点是对的），
但图谱右侧内容在手机上看不到、也滑不到**。

已用 `git worktree` 拉 HEAD 版同尺寸复测：超宽元素列表与改后**逐项相同**，确认是既有问题。
2026-08-04 那轮验收范围是"判断层"（标题/轨道/判断卡/行动项/评价依据），图谱区不在其中，故未动。

修的时候二选一，别只改 `overflow`：
- 让 `.bi-atlas` 在窄屏可横滚（`overflow-x: auto` + `-webkit-overflow-scrolling`），并给出可滚提示；
- 或窄屏改用纵向排布，别把桌面版的横向泳道硬塞进 390px。

`tools/smoke-data-detail-mobile.mjs` 已探测该情况，但**只打印 ⓘ 不判失败**（见文件内注释）。
修好后把那行改成 `check(...)`，否则会悄悄回退。

### P1 — agentId 口径
`server/agents.mjs` 里五个 `TEACHING_AGENTS` 仍用**已弃用的命名**
（药学场景师 / 教学设计师 / 评价诊断师 / 证据校验师 / 教学反思师）。
建设说明书 v1.8 中这五个名字出现 **0 次**；前端 `PRACTICE_REVIEWERS` 用的是学科视角命名。
两套并存，评委同时看到会追问哪个是真的。趁调用方少尽早改 `agentId` 与 `name`（systemPrompt 内容可保留）。

### P2 — 人工核对（机器够不到）
- `课程智能体.pptx` 文本层抓不到口径关键词，文字疑在图片里，需人工翻一遍
- 两份申报书 PDF 为图片型，同上
- `证明材料/匿名版.pdf`、`相关证明材料.pdf` 是**旧口径的图片型 PDF**，需从新 docx 重导（原始版若为盖章件需重新盖章）
- 全站中文错别字 / 药学专业表述**无人校对过**——评委是药学教育专家，内容错误比 a11y 违例更致命

### P1 — 设计缺陷（2026-08-02 实测扫描，两条都在 practice-detail.html）
1. **审校抽屉自成一套字号刻度**。`.review-drawer-head h4` 同一选择器三处声明：
   2017 `var(--fs-xl)`(22px) / 2050 `clamp(25px,2.3vw,34px)` / 2535 `30px`；clamp 胜出，
   1440 视口下渲染 **33.12px**，而同页其它 h4 是 18/22px，几乎压过 h3(36px)。
   `.review-env-no` 同样重复声明（1915 行 38px、2225 行 32px）。
   → 删掉 2050 的 clamp 与 2535 的 30px，2017 的 token 声明即给出 22px。
2. **引导文案用了「系统注释」的排版却装着句子**。`.wiz-hint` / `.decision-empty` /
   `.posttrial-wait` 都是 `var(--mono)` + `--fs-2xs` + 居中。实测 `.wiz-hint` 58 字压成
   **一行 1344px 宽 = 107 字/行**，另两条 90–93 字/行（中文最佳 35–45）。
   这三条恰好是空态首屏文案，评委第一眼读的就是它们。
   → 给 `max-width: 34em; margin-inline: auto; text-align: start`，长句切回正文字族。

> 全站 19 条 `max-width` **无一使用 `ch`/`em`**，行长完全不随字号走——这是容器
> 1280→1540 之后行长失控的结构原因，不只是这三条的问题。

### P2 — 其它
- `practice-runtime.js:3183` 有 `querySelectorAll("#stage-ii .adopt-bar")[1]` 按下标取元素，
  与已清理的 `nth-of-type` 同类脆弱，重排 DOM 时是隐患
- `output/playwright/` 已 gitignore；视觉基线是否入库尚未定
- L3 产出链顶卡仍是「规格视图」（显示应当产出什么），未随 Store 状态化

---

## 4. 跨会话硬约束（改之前必读）

1. **两层不可合并**：候选处理（原意见入候选 / 修改后入候选 / 不采用）在证据**之前**；
   教师判断（支持 / 不支持 / 证据不足）在 32 人虚拟班仿真产生证据**之后**，且逐条绑定。
   合并 = 证据出现前宣布采纳。
2. **锚定必须存快照**：`sourceExcerpt` + `sourceRevision`（+ `sourceHash`）。
   运行时实践包会被 Qwen 重写或教师改写，不存快照旧批注必然错位——**这是已发生的事实，不是假设**。
3. **32 人虚拟班保持非 LLM**：确定性规则 + 离线烘焙立场表。可复现、零成本、不幻觉，是答辩加分项而非短板。
4. **改 `shared/` 下任何文件，必须同步 bump HTML 里的 `?v=`**（`_headers` 对 `/shared/*` 是一年 immutable）。
5. **排版走 token**：先选语义角色 `--text-*`，再选视觉刻度 `--fs-*`；禁裸 px / 裸 hex / 裸字体栈。
   文档与 tokens.css 的同步由 `verify-style-tokens.mjs` 动态断言守护（改值只需改两处，测试自动跟随）。
   **字号裸 px 现在有门禁了**（存量基线制）：新增一律红；存量 17 处登记在 `FONT_SIZE_BASELINE`，
   基线只许缩小——改好后必须从表里删掉对应条目，否则门禁提示「基线该收窄了」，防止豁免永久化。
   例外：`gsap-demo.html`（不上线）、`practice-export-entry.js`（生成独立纸张文档）、相对单位。
6. **深浅色成对声明**：站点有完整暗色主题（`html[data-theme="dark"]`，48 条规则，默认 `auto`
   跟随系统），但主题引擎只在 `nav-detail.html` 加载。凡是写 `color-scheme` / `accent-color`
   这类原生控件属性，浅色放 `tokens.css:root`、暗色**必须**在 `bc-chrome.css §P` 反向声明，
   否则暗色主题下原生控件被锁成浅色。`--amber-deep` 是浅底变体（纸底 5.38:1，深底仅 3.09:1），
   深底一律用 `--amber`（5.62:1）。
7. **部署只用白名单脚本** `make-deploy.mjs`。Netlify 拖拽部署**不读 `.gitignore`**——
   6 月那次就是这样把 jsx 脚手架、草稿页、内部审计报告送上了公网。
8. **匿名评审红线**：不得出现真实校名 / `cpu.*` 域名 / 真实超星 courseid。已清理，改动后需复查。

---

## 5. 踩过的坑（省时间用）

- **`requestAnimationFrame` 在隐藏文档不触发** —— 后台标签页里"保存了但界面不更新"。用 `setTimeout(…, 0)`。
- **`build.mjs` 在 `pharmaco网页/` 内**（迁移后），根目录跑会 `MODULE_NOT_FOUND`，用 `npm run build`。
- **CJK 宽度比不出字体** —— 所有中文字体 em 等宽；判断某字体是否真的生效要用 canvas 像素指纹。
- **同名 token 在文档里出现两次**（§1.1 基础值 / §1.3 可读模式映射），解析要取首次出现，
  且 tokens.css 需拆 `:root` 与 `.is-readable-detail` 分别比对，否则误报。
- **测试可能钉死文案**：改 UI 文字前先 `grep` 一遍 `tools/verify-*.mjs`，
  有锁说明是有意为之——应把断言改为守护新口径，而不是删掉它。
- 预览面板（IDE 内嵌）经常 `document.hidden===true` 且视口塌成 0，
  截图空白、尺寸测量全废；**用 JS 取数据判断，别信截图**。

---

## 6. 关键文件地图

| 路径 | 作用 |
|---|---|
| `server/{app,agents,db,model-client,config}.mjs` | 后端：路由 / 智能体 / SQLite / 模型客户端 / 配置 |
| `tools/anchor-gate.mjs` | 批注锚定门禁（纯函数，生产已接入） |
| `tools/verify-*.mjs` | 9 项前端口径门禁，全部串在 `npm test` |
| `tools/review-probe.mjs`、`review-concurrency-probe.mjs` | 审校可行性 / 并发性能探针（独立，可随时重跑） |
| `shared/tokens.css` + `TYPOGRAPHY.md` | 设计 token 唯一信源 + 排版规范 |
| `shared/nav-render.js`（4.7k 行） | 教学导航主渲染器 |
| `shared/nav-render-store-bridge.js` | capture-phase 增强层（判断落库 / 产物 / 主题） |
| `shared/practice-runtime.js` | 实践页运行时 + 32 人虚拟班驱动 |
| `make-deploy.mjs`（项目根） | 白名单部署打包，带自校验 |
