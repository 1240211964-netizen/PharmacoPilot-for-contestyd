// UI 层真模型全流程实测：后端页面 → Stage II 自动五路审校 → 渲染断言。
// 实践包通过 localStorage 注入（与 API 复跑同一份稿件、revision=1），五路命中服务端
// 缓存，专注验证渲染与联动；生成按钮流程已单独实测（env 长度 201/222/203/243/269/214/271/216/217）。
// 前置：4173 后端在跑。用法: node tools/verify-live-review-ui.mjs
import { chromium } from "/Users/yandilei/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = "http://127.0.0.1:4173";
const injectedPack = JSON.parse(readFileSync(resolve(root, "output/playwright/live-review-run.json"), "utf8")).generate.json.pack;
const report = { startedAt: new Date().toISOString(), steps: [], failures: [] };
const step = (name, detail) => { report.steps.push({ name, detail, at: new Date().toISOString() }); console.error(`· ${name}${detail ? ` — ${detail}` : ""}`); };
const fail = (name, detail) => { report.failures.push({ name, detail }); console.error(`✗ ${name}: ${detail}`); };

const browser = await chromium.launch({
  executablePath: "/Users/yandilei/Library/Caches/ms-playwright/chromium_headless_shell-1217/chrome-headless-shell-mac-arm64/chrome-headless-shell",
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(30000);
await page.addInitScript((pack) => {
  localStorage.setItem("pp.practice.generatedPacks.v1", JSON.stringify({ "mp-ch3-environment": pack }));
  localStorage.setItem("pp.practice.packRevision.v1", JSON.stringify({ "mp-ch3-environment": 1 }));
}, injectedPack);

try {
  await page.goto(`${BASE}/practice-detail.html?backend=1`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => (document.querySelector(".design-summary [data-brief-field='env09']")?.textContent?.trim().length || 0) > 10, undefined, { timeout: 30000 });
  await page.waitForFunction(() => document.documentElement.dataset.backend === "ready", undefined, { timeout: 20000 });
  await page.waitForFunction(() => (document.querySelector(".pack-preview [data-pack-field='env09']")?.textContent?.trim().length || 0) > 10, undefined, { timeout: 30000 });
  const packLens = await page.evaluate(() => Array.from({ length: 9 }, (_, i) => document.querySelector(`.pack-preview [data-pack-field='env0${i + 1}']`)?.textContent?.trim().length || 0));
  step("页面与后端", `设计摘要就绪 · backend=ready · 实践包 env 长度 ${packLens.join("/")}`);

  await page.evaluate(() => document.getElementById("stage-ii")?.scrollIntoView());
  // 五路全部脱离 loading/seed 态即视为批跑结束（ready=锚定，error=门禁降级）。
  await page.waitForFunction(() => {
    const panels = Array.from(document.querySelectorAll("[data-ec-role='live-review']"));
    return panels.length >= 5 && panels.every((p) => p.dataset.state === "ready" || p.dataset.state === "error");
  }, undefined, { timeout: 120000 });
  await page.waitForTimeout(1200); // 等底部指标条与卡片重绘

  const cards = await page.evaluate(() => Array.from(document.querySelectorAll(".expert-card")).map((card) => {
    const panel = card.querySelector("[data-ec-role='live-review']");
    const lines = Array.from(card.querySelectorAll(".ec-review-line b")).map((b) => b.textContent.trim());
    return {
      expert: card.querySelector(".ec-who")?.textContent?.trim().slice(0, 12) || card.dataset.expertId,
      state: panel?.dataset.state || "?",
      status: card.querySelector("[data-ec-role='live-status']")?.textContent?.trim() || "",
      error: card.querySelector("[data-ec-role='live-error']")?.textContent?.trim() || "",
      bodyLines: lines,
      issueLen: (card.querySelector(".ec-review-line span")?.textContent || "").trim().length,
    };
  }));
  report.cards = cards;
  const ready = cards.filter((c) => c.state === "ready");
  const errored = cards.filter((c) => c.state === "error");
  step("五路审校批跑", `锚定 ${ready.length}/5 · 降级 ${errored.length}/5`);
  if (ready.length !== 5) fail("五路锚定", `只有 ${ready.length} 路 ready：${JSON.stringify(cards.map((c) => [c.expert, c.state, c.error]))}`);
  for (const c of ready) {
    if (!c.status.includes("已锚定")) fail("锚定状态文案", `${c.expert}: ${c.status}`);
    if (!c.bodyLines.includes("问题") || !c.bodyLines.includes("建议")) fail("批注卡结构", `${c.expert} 缺问题/建议行：${c.bodyLines.join(",")}`);
  }

  const bottom = await page.evaluate(() => document.querySelector("[data-batch-status], .review-batch-status, .stage-ii-status")?.textContent?.trim() || "");
  report.bottomStatus = bottom;
  await page.screenshot({ path: resolve(root, "output/playwright/live-review-ui-e2e.png"), fullPage: false });
  step("截图", "output/playwright/live-review-ui-e2e.png");
} catch (error) {
  fail("流程异常", String(error?.message || error).slice(0, 400));
  try { await page.screenshot({ path: resolve(root, "output/playwright/live-review-ui-e2e-error.png") }); } catch { /* 忽略 */ }
} finally {
  report.finishedAt = new Date().toISOString();
  writeFileSync(resolve(root, "output/playwright/live-review-ui-e2e.json"), JSON.stringify(report, null, 2));
  await browser.close();
}
console.log(JSON.stringify({ ok: report.failures.length === 0, failures: report.failures, cards: (report.cards || []).map((c) => ({ expert: c.expert, state: c.state, status: c.status, bodyLines: c.bodyLines })) }, null, 2));
process.exit(report.failures.length ? 1 : 0);
