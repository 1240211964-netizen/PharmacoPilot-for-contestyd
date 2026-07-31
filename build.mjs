#!/usr/bin/env node
/**
 * Pharmaco 构建步骤 — 把每页的经典脚本(全是 IIFE + window.X 暴露,无 ES module)
 * 按 HTML 中的原始顺序拼接,再用 esbuild 压缩成「每页一个 bundle」。
 *
 *  · 源文件不动:仍在 shared/,照常手改。
 *  · 改完跑:  npm run build   → 重新生成 dist/<page>.bundle.js
 *  · HTML 引一个 <script src="./dist/<page>.bundle.js?v=N" defer> 取代原来一长串。
 *
 * 为什么安全:这些文件都是 `(function(g){…})(window)` 形式、0 个顶层声明,
 * 拼接=按序执行、靠 window 暴露,与原来 N 个 <script defer> 行为一致。
 * ⚠ 不要把 ES module(practice-detail 的 metaverse-classroom-3d.js / importmap)放进来。
 */
import esbuild from "esbuild";
import { readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// 以本脚本所在目录为项目根,目录改名/移动后无需改路径
const ROOT = dirname(fileURLToPath(import.meta.url));
const WEB = ROOT;
const SHARED = join(WEB, "shared");
const DIST = join(WEB, "dist");

// 每页 → 该页 <script src> 的有序列表(去掉 ?v= 查询)。顺序必须与 HTML 一致。
const BUNDLES = {
  "nav-detail": [
    "wendao.js", "fanya.js", "live-stats.js", "toast.js", "faq.js",
    "nav-stations-contract.js", "nav-decision-bank.js",
    "station1.payload.js", "station2.payload.js", "station3.payload.js", "station4.payload.js",
    "station5.payload.js", "station6.payload.js", "station7.payload.js", "station8.payload.js",
    "station9.payload.js", "station10.payload.js", "station11.payload.js",
    "pharmaco-store.js", "sample-collection.js", "nav-render.js", "theory-chips.js",
    "nav-render-store-bridge.js", "practice-feedback-bridge.js",
  ],
};

// --check 模式:不构建,只比对 dist/<page>.bundle.js 的 mtime 是否晚于其全部源文件。
// 过期(或 bundle 缺失)则列出更新的源文件并 exit 1;全部新鲜则打印 ok。
if (process.argv.includes("--check")) {
  let stale = false;
  for (const [page, files] of Object.entries(BUNDLES)) {
    const out = join(DIST, `${page}.bundle.js`);
    let outMtime = null;
    try {
      outMtime = statSync(out).mtimeMs;
    } catch {
      console.error(`✗ dist/${page}.bundle.js 不存在,请先 npm run build`);
      stale = true;
      continue;
    }
    const newer = files.filter((f) => statSync(join(SHARED, f)).mtimeMs > outMtime);
    if (newer.length) {
      console.error(`✗ dist/${page}.bundle.js 已过期,以下源文件更新于 bundle 之后:`);
      for (const f of newer) console.error(`    shared/${f}`);
      stale = true;
    } else {
      console.log(`✓ dist/${page}.bundle.js 新鲜 (${files.length} 个源文件均早于 bundle)  ok`);
    }
  }
  process.exit(stale ? 1 : 0);
}

mkdirSync(DIST, { recursive: true });

for (const [page, files] of Object.entries(BUNDLES)) {
  const combined = files
    .map((f) => `\n/* ==== ${f} ==== */\n` + readFileSync(join(SHARED, f), "utf8"))
    .join("\n");
  const res = await esbuild.transform(combined, {
    minify: true,
    legalComments: "none",
    charset: "utf8",   // 保留中文不转 \u 转义
  });
  const out = join(DIST, `${page}.bundle.js`);
  writeFileSync(out, res.code, "utf8");
  const rawKB = Buffer.byteLength(combined) / 1024;
  const minKB = statSync(out).size / 1024;
  console.log(
    `✓ dist/${page}.bundle.js  ${files.length} 文件  ${rawKB.toFixed(0)}KB → ${minKB.toFixed(0)}KB  (压 ${Math.round((1 - minKB / rawKB) * 100)}%)`
  );
}
