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

console.log(`verify-style-tokens: ok (${files.length} production files)`);
