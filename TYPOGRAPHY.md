# PharmacoPilot 排版与设计 Token 规范

> 新增任何文字 / 颜色前先读本文件。所有值的**唯一信源**是 `shared/tokens.css`；
> 可复用组件类在 `shared/bc-chrome.css`。本文件与 tokens.css 注释保持一致，若不一致**以 tokens.css 为准**。

---

## 0. 四条铁律

1. **字号** 一律用 `var(--fs-*)`，**禁止裸 px**。最小是 `--fs-2xs`（12px），不要再写 9/10/11px。
2. **字体** 一律用 `var(--sans/--serif-cn/--serif-en/--mono)`，**禁止裸字体栈或额外 fallback**（token 内已含完整 fallback）。
3. **颜色** 一律用 `var(--…)`，**禁止裸 hex**（语义状态/类别色已建 token，见 §3）。
4. **小组件**（图例 / eyebrow / 折叠按钮等）优先复用 `bc-chrome.css` 的现成类，**不要在 HTML 里手写内联 font 样式**。

---

## 1. 字号刻度 `--fs-*`

全站统一刻度，**最小地板 12px**（中文可读），不再出现 6–11px 微字。

| Token | 值 | 用途 |
|---|---|---|
| `--fs-2xs` | 12px | 最小：微标签 / eyebrow / 角标（地板） |
| `--fs-xs` | 13px | 次要元信息 |
| `--fs-sm` | 14px | 正文 / 默认阅读尺寸 |
| `--fs-md` | 16px | 强调正文 / 小标题 |
| `--fs-lg` | 18px | |
| `--fs-xl` | 22px | |
| `--fs-2xl` | 28px | |
| `--fs-3xl` | 36px | |
| `--fs-4xl` | 48px | |
| `--fs-hero` | 64px | 编辑式大标题 |
| `--fs-hero-xl` | 84px | 巨号 hero |

- `<small>` 已全局兜底：`font-size: max(0.85em, var(--fs-2xs))` —— 大字父级里按比例缩小，但永不低于 12px。
- `<sub>`/`<sup>`（数学下标）保持浏览器默认缩小，属排版惯例，不抬。

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

---

## 3. 颜色 Token

文字色一律取自下表，**禁止裸 hex**。

### 表面 / 文字
| Token | 值 | | Token | 值 |
|---|---|---|---|---|
| `--paper` | #faf7f0 | | `--ink` | #1b1916 |
| `--paper-2` | #f3eee2 | | `--ink-2` | #2c2925 |
| `--paper-3` | #ece5d3 | | `--ink-soft` | #4a463f |
| `--ivory` | #fffdf7 | | `--mute` | #76716a |
| `--rule` / `--rule-2` | 描边 | | `--mute-2` | #98938b |

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
.label   { font-family: var(--mono); font-size: var(--fs-2xs); color: var(--amber-deep); }
.title   { font-family: var(--serif-cn); font-size: var(--fs-3xl); color: var(--ink); }
.body    { font-size: var(--fs-sm); color: var(--ink-soft); }     /* 字体继承 body 的 --sans */
.ondark  { color: var(--on-dark-mute); }                          /* 深色面板上的弱化文字 */

/* ❌ 错误（会破坏一致性，code review 应打回） */
.x { font-size: 11px; }                          /* 裸 px、且 <12 */
.y { font-family: "Songti SC", serif; }          /* 裸字体栈，应 var(--serif-cn) */
.z { color: #908a7a; }                           /* 裸 hex，应 var(--mute-2) */
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
| 各页 `<style>` / `shared/*.js` 注入 CSS | 页面 / 组件局部样式，**必须引用上面的 token，不写裸值** |
