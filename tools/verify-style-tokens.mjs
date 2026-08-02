#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const productionHtml = fs.readdirSync(root)
  .filter((name) => name.endsWith(".html"))
  .filter((name) => !name.endsWith("-draft.html"));

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (["vendor", "dist", "node_modules"].includes(entry.name)) return [];
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(abs);
    return /\.(?:css|js)$/.test(entry.name) ? [abs] : [];
  });
}

const files = [
  ...productionHtml.map((name) => path.join(root, name)),
  ...walk(path.join(root, "shared")),
];

const violations = [];
const lineOf = (source, index) => source.slice(0, index).split("\n").length;

for (const abs of files) {
  const rel = path.relative(root, abs);
  const source = fs.readFileSync(abs, "utf8");

  // CSS declarations also catch styles embedded in JS template strings.
  const declaration = /\bfont(?:-size)?\s*:\s*([^;}\n]+)/gi;
  for (const match of source.matchAll(declaration)) {
    const pxValues = [...match[1].matchAll(/(?<![\d.])(\d+(?:\.\d+)?)px\b/g)];
    for (const px of pxValues) {
      if (Number(px[1]) < 12) {
        violations.push(`${rel}:${lineOf(source, match.index)} 字号 ${px[1]}px 低于 12px 地板`);
      }
    }
  }

  // JS object style declarations are not written as CSS declarations.
  for (const match of source.matchAll(/\bfontSize\s*[:=]\s*["'`](\d+(?:\.\d+)?)px\b/g)) {
    if (Number(match[1]) < 12) {
      violations.push(`${rel}:${lineOf(source, match.index)} fontSize ${match[1]}px 低于 12px 地板`);
    }
  }

  for (const match of source.matchAll(/var\(--(?:mono|serif-cn|serif-en|sans)\s*,/g)) {
    violations.push(`${rel}:${lineOf(source, match.index)} 字体 token 携带私有 fallback`);
  }
}

assert.deepEqual(violations, [], `样式 token 门禁失败:\n${violations.join("\n")}`);

// ── 字号必须来自 token(存量基线制) ──────────────────────────────────────
// 上面的循环只守 12px 地板；≥12px 的裸 px 一律放行,所以 TYPOGRAPHY.md 写的
// "禁裸 px" 一直没有门禁。五路审校抽屉就是这样漂走的:同一个
// `.review-drawer-head h4` 叠了 var(--fs-xl) / clamp(25px,2.3vw,34px) / 30px
// 三条声明,clamp 胜出渲染成 33.12px,而同页其它 h4 是 18/22px。
//
// 存量 17 处不阻塞,登记进基线;新增的一律红。基线只许缩小:改好后从下表删掉
// 对应条目,否则本门禁会提示"基线该收窄了",防止它变成永久豁免。
const FONT_SIZE_SKIP = new Set([
  "gsap-demo.html", // 内部演示,make-deploy 明确不上线
]);
const FONT_SIZE_EXEMPT = new Set([
  // 生成教师下载的独立文档(固定 760px 纸张 + Songti SC),不套用屏幕字号刻度
  "shared/practice-export-entry.js",
]);
// 允许:token / 关键字 / 相对单位(随上下文缩放,不是硬编码刻度)
const FONT_SIZE_OK = /^(?:0|inherit|initial|unset|revert|smaller|larger)$/i;
const FONT_SIZE_REL = /^[\d.]+(?:em|rem|%|ch)$/i;

const FONT_SIZE_BASELINE = {
  "data-detail.html": ["14px"],
  "nav-3d.html": ["20px"],
  "nav-detail.html": ["32px"],
  // 首屏大字用流体排版。要留就该在 tokens.css 里立成 --fs-hero-fluid 之类的
  // token,而不是散在页面里。
  "opening-story.html": [
    "clamp(34px, 4.3vw, 60px)",
    "clamp(34px, 4.3vw, 60px)",
    "clamp(42px, 6vw, 82px)",
  ],
  // 审校抽屉(Stage 2b)自成一套刻度。清理时注意 .review-drawer-head h4 与
  // .review-env-no 各有两处重复声明,删掉后写的那条即可。
  "practice-detail.html": [
    "14px", "22px", "26px", "27px", "30px", "32px", "38px",
  ],
  "shared/metaverse-classroom-3d.js": ["15px", "20px"],
};

const fontSizeFound = {};
for (const abs of files) {
  const rel = path.relative(root, abs);
  if (FONT_SIZE_SKIP.has(path.basename(rel)) || FONT_SIZE_EXEMPT.has(rel)) continue;
  const source = fs.readFileSync(abs, "utf8");
  const bad = [];
  for (const match of source.matchAll(/\bfont-size\s*:\s*([^;}\n]+)/gi)) {
    const value = match[1].trim().replace(/\s+/g, " ");
    if (value.includes("var(--") || FONT_SIZE_OK.test(value) || FONT_SIZE_REL.test(value)) continue;
    bad.push(value);
  }
  if (bad.length) fontSizeFound[rel] = bad.sort();
}

const fontSizeProblems = [];
for (const rel of new Set([...Object.keys(fontSizeFound), ...Object.keys(FONT_SIZE_BASELINE)])) {
  const found = fontSizeFound[rel] || [];
  const allowed = [...(FONT_SIZE_BASELINE[rel] || [])].sort();
  const remaining = [...allowed];
  const added = [];
  for (const value of found) {
    const at = remaining.indexOf(value);
    if (at === -1) added.push(value);
    else remaining.splice(at, 1);
  }
  if (added.length) {
    fontSizeProblems.push(
      `${rel} 新增裸字号 ${added.join(", ")}\n` +
      `    → 改用 var(--fs-*) / var(--text-*);确有理由才加进 FONT_SIZE_BASELINE`
    );
  }
  if (remaining.length) {
    fontSizeProblems.push(
      `${rel} 基线该收窄了:${remaining.join(", ")} 已不在文件里\n` +
      `    → 从 verify-style-tokens.mjs 的 FONT_SIZE_BASELINE 删掉这几条`
    );
  }
}

assert.deepEqual(
  fontSizeProblems, [],
  `字号 token 门禁失败:\n${fontSizeProblems.map((p) => "  " + p).join("\n")}`
);

const tokens = fs.readFileSync(path.join(root, "shared/tokens.css"), "utf8");
const typography = fs.readFileSync(path.join(root, "TYPOGRAPHY.md"), "utf8");
// ── 文档 ⇄ Token 同步门禁 ────────────────────────────────────────────────
// 期望值**从 TYPOGRAPHY.md 的表格动态读取**，不再硬编码：调字号时只改
// tokens.css + 文档两处，测试自动跟随；两边不一致才红。
// tokens.css 拆成「:root 基础块」与「.is-readable-detail 覆盖块」分别比对，
// 否则 --fs-2xs 等四档会被可读模式的覆盖值误判（曾踩过这个坑）。
const readableBlock = (tokens.match(/\.is-readable-detail[^{]*\{([\s\S]*?)\n\}/) || [, ""])[1];
const baseBlock = readableBlock ? tokens.replace(readableBlock, "") : tokens;
const cssVal = (block, name) => (block.match(new RegExp(`--${name}:\\s*([^;]+);`)) || [, null])[1]?.trim() ?? null;
// 文档表格：| `--token` | 值 |
// 同名 token 可能出现两次（§1.1 基础值在前、§1.3 可读模式映射在后），
// 这里取**首次出现**，即基础值；映射关系由下面第 ② 组单独校验。
const docTable = new Map();
for (const m of typography.matchAll(/\|\s*`--([a-z0-9-]+)`\s*\|\s*([^|]+?)\s*\|/g)) {
  if (!docTable.has(m[1])) docTable.set(m[1], m[2].trim());
}

// ① 阅读角色 + 行高 + 视觉刻度基础值：文档写多少，tokens.css 就必须是多少
const SYNCED_TOKENS = [
  "text-micro", "text-caption", "text-control", "text-body", "text-body-strong",
  "lh-tight", "lh-ui", "lh-body",
  "fs-2xs", "fs-xs", "fs-sm", "fs-md", "fs-lg", "fs-xl",
  "fs-2xl", "fs-3xl", "fs-4xl", "fs-hero", "fs-hero-xl",
];
for (const name of SYNCED_TOKENS) {
  const expected = docTable.get(name);
  assert.ok(expected, `TYPOGRAPHY.md 未列出 --${name}（新增 token 必须同时写进文档表格）`);
  assert.equal(cssVal(baseBlock, name), expected, `--${name} 不同步：tokens.css=${cssVal(baseBlock, name)} 文档=${expected}`);
}

// ② 可读模式映射：文档 §1.3 声明的四档抬升必须真的写在 .is-readable-detail 里
for (const [fsName, textName] of [...typography.matchAll(/\|\s*`--(fs-[a-z0-9-]+)`\s*\|\s*`--(text-[a-z-]+)`/g)].map((m) => [m[1], m[2]])) {
  assert.equal(cssVal(readableBlock, fsName), `var(--${textName})`,
    `可读模式映射不同步：--${fsName} 应映射到 var(--${textName})`);
}

// ③ 颜色 token：文档颜色表里的每个 hex 都必须与 tokens.css 一致
for (const [name, expected] of docTable) {
  if (!/^#[0-9a-f]{3,8}$/i.test(expected)) continue;
  assert.equal(cssVal(baseBlock, name), expected, `颜色 --${name} 不同步：tokens.css=${cssVal(baseBlock, name)} 文档=${expected}`);
}

// ④ 字体四族：首选字体必须与文档记载一致
for (const [name, primary] of [
  ["sans", "Geist"], ["serif-cn", "Noto Serif SC"], ["serif-en", "Fraunces"], ["mono", "Geist Mono"],
]) {
  assert.ok((cssVal(baseBlock, name) || "").includes(primary), `--${name} 首选字体应为 ${primary}`);
  assert.ok(typography.includes(primary), `TYPOGRAPHY.md 未记录字体 ${primary}`);
}

for (const phrase of [
  "长文字先换行，再扩容，最后才考虑降级字号",
  "核心工作页的可读模式",
  "中文长标签与拥挤布局",
]) {
  assert.match(typography, new RegExp(phrase), `TYPOGRAPHY.md 缺少规则：${phrase}`);
}

for (const page of ["nav-detail.html", "practice-detail.html", "data-detail.html"]) {
  const source = fs.readFileSync(path.join(root, page), "utf8");
  assert.match(source, /<body\s+class="[^"]*is-readable-detail[^"]*">/, `${page} 未启用笔记本可读模式`);
}

// ⑤ 主题所有权：暗色只服务教学导航工作台。
// 共享 CSS 不得再出现全站暗色覆盖；否则纸色内容页会只变顶栏、不变主体。
const sharedChrome = fs.readFileSync(path.join(root, "shared/bc-chrome.css"), "utf8");
const navTheme = fs.readFileSync(path.join(root, "shared/nav-theme.css"), "utf8");
const navPage = fs.readFileSync(path.join(root, "nav-detail.html"), "utf8");
const themeBridge = fs.readFileSync(path.join(root, "shared/nav-render-store-bridge.js"), "utf8");
assert.doesNotMatch(sharedChrome, /html\[data-theme=["']dark["']\]/, "bc-chrome.css 不得携带全站暗色规则");
assert.match(navTheme, /html\[data-theme=["']dark["']\]/, "nav-theme.css 缺少导航暗色规则");
assert.match(navPage, /<link[^>]+shared\/nav-theme\.css/, "nav-detail.html 未加载导航专属主题");
for (const page of ["index.html", "login.html", "opening-story.html", "nav-3d.html", "practice-detail.html", "data-detail.html"]) {
  const source = fs.readFileSync(path.join(root, page), "utf8");
  assert.doesNotMatch(source, /shared\/nav-theme\.css/, `${page} 不得加载导航专属主题`);
}
assert.match(themeBridge, /localStorage\.getItem\(THEME_KEY\)\s*\|\|\s*["']light["']/,
  "教学导航首次访问必须默认纸色，不得暗中跟随系统主题");

console.log(`verify-style-tokens: ok (${files.length} production files)`);
