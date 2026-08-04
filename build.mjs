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
    "wendao.js", "fanya.js", "toast.js", "faq.js",
    "nav-stations-contract.js", "nav-decision-bank.js",
    "station1.payload.js", "station2.payload.js", "station3.payload.js", "station4.payload.js",
    "station5.payload.js", "station6.payload.js", "station7.payload.js", "station8.payload.js",
    "station9.payload.js", "station10.payload.js", "station11.payload.js",
    "pharmaco-store.js", "sample-collection.js", "nav-render.js", "theory-chips.js",
    "nav-render-store-bridge.js", "practice-feedback-bridge.js",
  ],
};

// 含第三方文档生成依赖的浏览器入口单独 bundle；它只在教师点击下载时执行。
const APP_BUNDLES = {
  "practice-export": "shared/practice-export-entry.js",
};

// 构建产物由这两个函数唯一定义。--check 与真实构建都走它们,
// 保证「校验时算出来的字节」与「构建时写下去的字节」不可能因两份配置漂移而不同。
async function buildConcat(files) {
  const combined = files
    .map((f) => `\n/* ==== ${f} ==== */\n` + readFileSync(join(SHARED, f), "utf8"))
    .join("\n");
  const res = await esbuild.transform(combined, {
    minify: true,
    legalComments: "none",
    charset: "utf8",   // 保留中文不转 \u 转义
  });
  return { code: res.code, rawKB: Buffer.byteLength(combined) / 1024 };
}

async function buildApp(entry) {
  const res = await esbuild.build({
    entryPoints: [join(WEB, entry)],
    bundle: true,
    minify: true,
    legalComments: "none",
    charset: "utf8",
    format: "iife",
    platform: "browser",
    target: ["es2022"],
    write: false,
  });
  return { code: res.outputFiles[0].text };
}

// --check 模式:重新构建到内存,与 dist/ 里已提交的产物逐字节比对。
//
// ⚠ 早先这里比的是 mtime。git clone / CI 检出会把所有文件时间戳刷成同一时刻,
//   先后关系随之丢失,内容完全正确的 bundle 也会被判过期——干净 checkout 上必然假失败
//   (2026-08-04 冻结前实测到:本机全绿,新克隆 exit=1,而两边 bundle 逐字节相同)。
//   内容比对与时间戳无关,本机与 CI 结论一致。
if (process.argv.includes("--check")) {
  let stale = false;

  const committedOf = (page) => {
    try {
      return readFileSync(join(DIST, `${page}.bundle.js`), "utf8");
    } catch {
      console.error(`✗ dist/${page}.bundle.js 不存在,请先 npm run build`);
      stale = true;
      return null;
    }
  };
  const compare = (page, committed, fresh, note) => {
    if (committed === fresh) {
      console.log(`✓ dist/${page}.bundle.js 与源文件一致 (${note})  ok`);
      return;
    }
    console.error(
      `✗ dist/${page}.bundle.js 与源文件不一致(${committed.length} vs ${fresh.length} 字节),请先 npm run build`
    );
    stale = true;
  };

  for (const [page, files] of Object.entries(BUNDLES)) {
    const committed = committedOf(page);
    if (committed === null) continue;
    const { code } = await buildConcat(files);
    compare(page, committed, code, `${files.length} 个源文件`);
  }
  for (const [page, entry] of Object.entries(APP_BUNDLES)) {
    const committed = committedOf(page);
    if (committed === null) continue;
    const { code } = await buildApp(entry);
    compare(page, committed, code, entry);
  }
  process.exit(stale ? 1 : 0);
}

mkdirSync(DIST, { recursive: true });

for (const [page, files] of Object.entries(BUNDLES)) {
  const { code, rawKB } = await buildConcat(files);
  const out = join(DIST, `${page}.bundle.js`);
  writeFileSync(out, code, "utf8");
  const minKB = statSync(out).size / 1024;
  console.log(
    `✓ dist/${page}.bundle.js  ${files.length} 文件  ${rawKB.toFixed(0)}KB → ${minKB.toFixed(0)}KB  (压 ${Math.round((1 - minKB / rawKB) * 100)}%)`
  );
}

for (const [page, entry] of Object.entries(APP_BUNDLES)) {
  const { code } = await buildApp(entry);
  const out = join(DIST, `${page}.bundle.js`);
  writeFileSync(out, code, "utf8");
  console.log(`✓ dist/${page}.bundle.js  ${entry} → ${(statSync(out).size / 1024).toFixed(0)}KB`);
}
