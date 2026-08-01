# PharmacoPilot 排版与设计 Token 规范

> 新增任何文字 / 颜色前先读本文件。本文件负责说明“如何选、如何排”；所有值的**唯一信源**是
> `shared/tokens.css`，可复用组件类在 `shared/bc-chrome.css`。若文档与代码不一致，**以 tokens.css 为准**，
> 并在同一轮修改中修正文档。

---

## 0. 六条铁律

1. **阅读文字先选语义角色**：正文、说明、表格、控件优先用 `var(--text-*)`；大标题和展示数字再用 `var(--fs-*)`。
2. **字号不低于 12px**：禁止 9/10/11px 微字。12px 只留给技术 ID、轴刻度和装饰序号，不能承担连续中文说明。
3. **长文字先换行，再扩容，最后才考虑降级字号**：不能为了把一句话塞进一行而牺牲整页可读性。
4. **字体按角色选用**：一律用 `var(--sans/--serif-cn/--serif-en/--mono)`，禁止裸字体栈或额外 fallback。
5. **颜色使用语义 Token**：一律用 `var(--…)`，禁止裸 hex（技术例外见 §7）。
6. **复用现有组件**：图例、eyebrow、折叠按钮等优先使用 `bc-chrome.css`，不要在 HTML 里写内联 font 样式。

---

## 1. 两层字号系统

字号分成两层：`--fs-*` 是稳定的**视觉刻度**，`--text-*` 是面向阅读任务的**语义角色**。
新增正文类内容先选语义角色；只有标题、展示数字、固定比例构图才直接选视觉刻度。

### 1.1 视觉刻度 `--fs-*`

全站统一刻度，最小地板为 12px。

| Token | 值 | 用途 |
|---|---|---|
| `--fs-2xs` | 12px | 技术微标签 / eyebrow / 角标（绝对地板） |
| `--fs-xs` | 13px | 紧凑型次要元信息 |
| `--fs-sm` | 14px | 图例 / 状态 / 次要说明 |
| `--fs-md` | 16px | 正文 / 表格内容 / 小标题 |
| `--fs-lg` | 18px | 强调正文 / 卡片标题 |
| `--fs-xl` | 22px | 区块副标题 |
| `--fs-2xl` | 28px | 区块标题 |
| `--fs-3xl` | 36px | 页面标题 |
| `--fs-4xl` | 48px | 大型页面标题 |
| `--fs-hero` | 64px | 编辑式大标题 |
| `--fs-hero-xl` | 84px | 巨号 hero |

- `<small>` 已全局兜底：`font-size: max(0.85em, var(--fs-2xs))` —— 大字父级里按比例缩小，但永不低于 12px。
- `<sub>`/`<sup>`（数学下标）保持浏览器默认缩小，属排版惯例，不抬。

### 1.2 阅读角色 `--text-*`

| Token | 值 | 适用内容 | 不应用于 |
|---|---:|---|---|
| `--text-micro` | 12px | 技术 ID、轴刻度、装饰序号、极短角标 | 中文句子、按钮、图例解释 |
| `--text-caption` | 15px | 图例、状态、次要元数据、短说明 | 多行正文 |
| `--text-control` | 16px | 导航、按钮、表单标签、筛选项 | 展示标题 |
| `--text-body` | 17px | 正文、解释、表格内容、抽屉内容 | 微型标签 |
| `--text-body-strong` | 20px | 关键结论、强调正文、卡片主信息 | 大型标题 |

配套行高：

| Token | 值 | 用途 |
|---|---:|---|
| `--lh-tight` | 1.30 | 数字、短标签、单行标题 |
| `--lh-ui` | 1.45 | 控件、图例、多行卡片标题 |
| `--lh-body` | 1.65 | 中文正文、解释、长说明 |

> 选择顺序：先判断内容角色，再选择字号。不要因为容器窄就把正文降成 caption 或 micro。

### 1.3 核心工作页的可读模式

`nav-detail.html`、`practice-detail.html`、`data-detail.html` 等高密度工作页在 `<body>` 使用：

```html
<body class="is-readable-detail">
```

该模式只抬高低四档，不改变页面大标题：

| 页面内原 Token | 可读模式下映射 |
|---|---|
| `--fs-2xs` | `--text-caption`（15px） |
| `--fs-xs` | `--text-control`（16px） |
| `--fs-sm` | `--text-body`（17px） |
| `--fs-md` | `--text-body-strong`（20px） |

- 真正需要保持 12px 的纯技术标记，显式使用 `--text-micro`，不要依赖 `--fs-2xs`。
- 首页、开场页等展示型页面不默认启用可读模式，避免破坏既有比例构图。
- 可读模式不是“整体缩放”；它只修正原先被 12–14px 承担的阅读内容。

---

## 2. 字体四族 `--sans / --serif-cn / --serif-en / --mono`

各有分工，**按用途选用，勿混用**：

| Token | 字体 | 用途 |
|---|---|---|
| `--sans` | Geist / 苹方 | UI / 正文默认（`body` 已设，通常无需显式写） |
| `--serif-cn` | Noto Serif SC | 中文标题 / 编辑式正文强调 / chip 名称 |
| `--serif-en` | Fraunces | 西文 / 数字 / 斜体强调 |
| `--mono` | Geist Mono | 技术标签 / eyebrow / 代码 / 图例 / 数据记号 |

> 💡 `--mono` 的中文回退是 Noto Serif SC（衬线）。所以"拉丁记号 + 中文说明"的技术图例用 `--mono`，
> 会自动呈现 **拉丁等宽 + 中文衬线**，与上方理论 chip 同族 —— 这正是图例/eyebrow 该用 `--mono` 的原因。

### 2.1 中文长标签与拥挤布局

中文信息密集时，遵循“**先换行 → 再扩容 → 最后才调整字号层级**”：

1. 环节名称、卡片标题、解释性标签默认横排，允许自然换成 2–3 行；不要用纵排文字解决横向拥挤。
2. 短标题使用 `text-wrap: balance`；正文使用自然换行，不要为了追求每行等长手工插入 `<br>`。
3. Grid 列使用 `minmax(0, 1fr)`，可收缩子项使用 `min-width: 0`，避免内容把整列撑宽。
4. 8 个字以上的标题可设 `max-width: 8em–12em`，并使用 `line-height: 1.35–1.55`。
5. 标签组、图例和筛选项使用 `flex-wrap: wrap`；`white-space: nowrap` 只用于日期、编号、代码和不可拆单位。
6. 角标字符不能贴边或溢出：12–14px 字符的方形徽标至少为 18×18px，并设置 `line-height: 1`、`box-sizing: border-box`。

```css
/* 多行环节名称：横排、平衡换行，不靠缩小字号硬塞一行 */
.stage-name {
  min-width: 0;
  max-width: 10em;
  font: 500 var(--text-body)/1.5 var(--serif-cn);
  white-space: normal;
  overflow-wrap: anywhere;
  line-break: strict;
  text-wrap: balance;
}

/* A / B / C 等极短角标：字号与容器共同校验 */
.evidence-badge {
  width: 18px;
  height: 18px;
  display: inline-grid;
  place-items: center;
  box-sizing: border-box;
  overflow: hidden;
  font: 700 var(--text-micro)/1 var(--mono);
}
```

---

## 3. 颜色 Token

文字色一律取自下表，**禁止裸 hex**。

### 表面 / 文字
| Token | 值 | | Token | 值 |
|---|---|---|---|---|
| `--paper` | #faf7f0 | | `--ink` | #1b1916 |
| `--paper-2` | #f3eee2 | | `--ink-2` | #2c2925 |
| `--paper-3` | #ece5d3 | | `--ink-soft` | #4a463f |
| `--ivory` | #fffdf7 | | `--mute` | #6a655e |
| `--rule` / `--rule-2` / `--rule-3` | 描边 | | `--mute-2` | #6f6a64 |

### 品牌 / 次级
| Token | 值 | | Token | 值 |
|---|---|---|---|---|
| `--amber` | #d97757 | | `--sage` | #4d6257 |
| `--amber-deep` | #a8492a | | `--sage-soft` | #d8dfd8 |
| `--amber-soft` | #f1cdb9 | | `--indigo` | #3a4b6b |
| `--amber-wash` | #f7e6d8 | | `--gold` | #b08440 |
| | | | `--maroon` | #6f2f2a |

### 语义色（状态 / 类别 / 暗底文字）
| Token | 值 | 含义 |
|---|---|---|
| `--ok` | #3a8a4e | 成功 / 已采纳 / 已处理 |
| `--gold-deep` | #6a3a14 | 金棕强调（训练地图标签 · 资产沉淀） |
| `--violet` | #7052a8 | **类别 C（药企）** |
| `--violet-soft` | #a790d2 | 类别 C 浅色 |
| `--on-dark` | #d6cfbe | 深色面板上的次级文字（stage-deck / 元宇宙等） |
| `--on-dark-mute` | #c5bda9 | 深色面板上的三级 / 弱化文字 |

> **A/B/C/D 类别色体系**：A=`--amber` · B=`--sage` · C=`--violet` · D=灰（`--mute` 系）。
> 这是语义编码，**不要混用或合并**。

---

## 4. 可复用组件类（`shared/bc-chrome.css`）

新增同类小组件直接套用，别手写内联样式。

| 类 | 用途 | 关键样式 |
|---|---|---|
| `.u-eyebrow` | mono 大写小标签（FEATURE 0X / INFORMED BY 同款） | `--mono` + 字距 + 大写 + `--amber-deep` |
| `.metric-legend` | 技术图例行（拉丁 mono + 中文衬线） | `--mono` + `--fs-xs` + flex wrap；内部 `.lead`（粗体引导）/ `b`（高亮记号）/ `.dim`（弱化） |
| `.theory-toggle` | 折叠/展开标签（"+N 更多…"） | 在 `theory-chips.js`，`--mono`，与 `.theory-add` 同族 |

**图例用法示例：**
```html
<div class="metric-legend" role="note" aria-label="…">
  <span class="lead">指标怎么读 ·</span>
  <span><b>T#</b> 教师 · 教学环节指标</span>
  <span class="dim"><b>↑n</b> 近 7 周相对增幅 · 数字仅作提示</span>
</div>
```

---

## 5. 常见写法对照

```css
/* ✅ 正确 */
.micro   { font-family: var(--mono); font-size: var(--text-micro); color: var(--amber-deep); }
.caption { font-family: var(--mono); font-size: var(--text-caption); line-height: var(--lh-ui); }
.body    { font-size: var(--text-body); line-height: var(--lh-body); color: var(--ink-soft); }
.control { font-size: var(--text-control); line-height: var(--lh-ui); }
.title   { font-family: var(--serif-cn); font-size: var(--fs-3xl); color: var(--ink); }
.ondark  { color: var(--on-dark-mute); }                          /* 深色面板上的弱化文字 */

/* ❌ 错误（会破坏一致性，code review 应打回） */
.x { font-size: 11px; }                          /* 裸 px、且 <12 */
.y { font-family: "Songti SC", serif; }          /* 裸字体栈，应 var(--serif-cn) */
.z { color: #908a7a; }                           /* 裸 hex，应 var(--mute-2) */
.long-title { white-space: nowrap; font-size: 10px; } /* 为塞进一行而缩字 */
<div style="font-size:10px;color:#999">          <!-- 内联 font 样式，应抽成类 + token -->
```

---

## 6. 有意保留的例外（不是疏漏）

以下场景 **不**走 CSS token，是技术约束或惯例：

1. **SVG 表现属性** `fill="#…"` / `stroke="#…"` / `stop-color="#…"` —— 属性里 `var()` **无效**，必须裸 hex。
2. **JS 动态配置字符串**，如 `{ color: "#3a8a4e" }` 传给图表 / 运行时生成的内联样式 —— 非 CSS 编写。
3. **`<sub>` / `<sup>` 数学下标** —— 浏览器默认缩小，符合数学排版惯例。
4. **首页系统架构示意图**（`arch-svg-home`，37 个标签 9–10.5px）—— 标签贴节点框排版，整体抬字号会撑破/重叠；属插画性示意图，**未纳入字号刻度**（如需放大应整图缩放，另行处理）。
5. **零散一次性图表色调**（各出现 1–2 次的暖灰 / 淡色调）—— 数据可视化专用，未建 token。

---

## 7. 文件分工

| 文件 | 职责 |
|---|---|
| `shared/tokens.css` | **唯一信源**：所有颜色 / 字体 / 字号 token + 基础 reset + 排版约定注释 |
| `shared/bc-chrome.css` | 全站共享组件类（masthead / app-tabs / `.metric-legend` / `.u-eyebrow` 等） |
| `TYPOGRAPHY.md` | 排版决策说明、字号角色、换行与拥挤处理规则 |
| `tools/verify-style-tokens.mjs` | 检查生产页字号地板、核心页可读模式及文档与 Token 的同步 |
| 各页 `<style>` / `shared/*.js` 注入 CSS | 页面 / 组件局部样式，**必须引用上面的 token，不写裸值** |
