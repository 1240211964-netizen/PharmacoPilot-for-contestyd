// 抓取 practice-detail.html 默认选择下的九条设计摘要（designBriefs），与前端逐字一致。
// 用法: node tools/capture-review-request.mjs
import { chromium } from "/Users/yandilei/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs";
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const browser = await chromium.launch({
  executablePath: "/Users/yandilei/Library/Caches/ms-playwright/chromium_headless_shell-1217/chrome-headless-shell-mac-arm64/chrome-headless-shell",
});
const page = await browser.newPage();
await page.goto(pathToFileURL(resolve(root, "practice-detail.html")).href, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => {
  const el = document.querySelector(".design-summary [data-brief-field='env09']");
  return (el?.textContent?.trim().length || 0) > 10;
}, { timeout: 20000 });

const data = await page.evaluate(() => {
  const briefs = {};
  for (let i = 1; i <= 9; i += 1) {
    const key = `env0${i}`;
    briefs[key] = document.querySelector(`.design-summary [data-brief-field='${key}']`)?.textContent?.trim() || "";
  }
  const meta = {};
  document.querySelectorAll("#practiceMeta [data-field]").forEach((el) => {
    meta[el.dataset.field] = el.textContent.trim();
  });
  const title = document.querySelector(".design-summary .pack-preview-h h4")?.textContent?.trim() || "";
  return { briefs, meta, title };
});

const out = resolve(root, "output/playwright/review-request-capture.json");
writeFileSync(out, JSON.stringify(data, null, 2));
console.log(JSON.stringify({ out, meta: data.meta, title: data.title, briefLens: Object.fromEntries(Object.entries(data.briefs).map(([k, v]) => [k, v.length])) }, null, 2));
await browser.close();
