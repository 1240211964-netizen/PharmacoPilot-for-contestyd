// Stage II 二期（统一判断 → 最终写回接缝）Playwright 断言：
//  A 主流程：判断小结条计数 → 卷宗 env 分组 → 确认写回清单口径 → 写回后闭环引导重新审校
//  B 无证据：小结条不渲染（band early-return）
//  M 390px：小结条渲染、无横向溢出
// 防回归：stage-ii / stage-iii 内不得出现“共识”或“同段”。
// 前置：4173 静态服务在跑；审校响应全部由注入桩接管。
import { chromium } from "/Users/yandilei/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { waitSettledBox, waitFontsReady } from "./pw-wait-settled.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = "http://127.0.0.1:4173";
const pack = JSON.parse(readFileSync(resolve(root, "output/playwright/live-review-run.json"), "utf8")).generate.json.pack;

const REVIEWER_META = {
  "pharmacy-context": { id: "pharmacy-context", expertId: "expert-pharm", name: "药学情境审校", scope: ["env04", "env05"] },
  "management-tradeoff": { id: "management-tradeoff", expertId: "expert-mgmt", name: "管理决策审校", scope: ["env02", "env08"] },
  "regulatory-citation": { id: "regulatory-citation", expertId: "expert-law", name: "法规合规审校", scope: ["env03", "env04"] },
  "instructional-design": { id: "instructional-design", expertId: "expert-edu", name: "教学设计审校", scope: ["env02", "env07"] },
  "evidence-metrics": { id: "evidence-metrics", expertId: "expert-data", name: "数据循证审校", scope: ["env04", "env06"] },
};
const EXCERPTS = {
  env02a: "结果一为能准确界定医药组织内外部环境的边界，产出为情境分析图，证据为图中要素归属的准确性，判定标准为无内部/外部混淆错误。",
  env02b: "结果三为能运用 TOWS 策略解决具体管理问题，产出为策略方案，证据为策略与 SWOT 要素的逻辑关联，判定标准为策略针对性强且符合医药行业规范。",
  env04a: "设定‘某连锁药店拟在 A 区开设新店’为任务背景，学生需利用上述材料分析该店面临的环境挑战与机遇。",
  env04b: "门诊统筹政策摘要（来源：待核实来源，需确认最新执行细则）",
  env04c: "资源清单包含：脱敏后的会员复购数据表（来源：待核实来源，因原始数据未完全脱敏）、门店排班表（来源：门店运营负责人提供）",
};
const anchored = (reviewerId, targetEnv, excerptKey, issue, suggestion) => ({
  source: "local-model", status: "anchored", reviewer: REVIEWER_META[reviewerId],
  model: "scenario-qwen", generatedAt: "2026-08-02T00:00:00.000Z", sourceRevision: 1,
  manuscriptHash: "scenario-hash", promptVersion: "scenario", orchestrationVersion: "scenario",
  attempts: 1, cache: { hit: false, key: "scenario" },
  annotation: {
    issue, suggestion, targetEnv, segmentKey: "场景段", sourceExcerpt: EXCERPTS[excerptKey],
    sourceRevision: 1, sourceHash: "h", anchorMethod: "exact", anchorBasis: "excerpt",
    normalizationVersion: 1, crossReferences: [],
  },
});

const ROUTES_FULL = {
  "pharmacy-context": anchored("pharmacy-context", "env04", "env04a", "任务背景聚焦新店开设的经营决策，缺失患者群画像与药师服务流程等药事实践要素。", "补充慢病患者的购药频次、用药依从性与药师指导时长等门店服务数据。"),
  "regulatory-citation": anchored("regulatory-citation", "env04", "env04b", "门诊统筹政策摘要未标注发文机关、文号与生效时间窗口，合规引用无法核验。", "补充该政策的发文机关、文号与年份，并标注有效执行期限。"),
  "evidence-metrics": anchored("evidence-metrics", "env04", "env04c", "会员复购数据表来源标注待核实，情境证据缺少可溯源的替代方案。", "替换为公开可得的医保定点药店年度统计或区域门诊统筹执行概况。"),
  "management-tradeoff": anchored("management-tradeoff", "env02", "env02b", "结果三仅关注策略生成的逻辑自洽，缺失医保控费与竞对策略等环境要素的管理权衡。", "增加权衡维度指标，要求学生标注环境要素对内部资源的挤压或增益。"),
  "instructional-design": anchored("instructional-design", "env02", "env02a", "判定标准“无内部/外部混淆错误”为二元口径，无法区分学生对环境边界的掌握程度。", "将判定标准改为无混淆、混淆不超过 2 项、混淆超过 2 项三级锚点。"),
};

const report = { scenarios: {}, failures: [] };
const fail = (scenario, name, detail) => { report.failures.push({ scenario, name, detail }); console.error(`✗ [${scenario}] ${name}: ${detail}`); };
const pass = (scenario, name) => console.error(`· [${scenario}] ${name}`);

const browser = await chromium.launch({
  executablePath: "/Users/yandilei/Library/Caches/ms-playwright/chromium_headless_shell-1217/chrome-headless-shell-mac-arm64/chrome-headless-shell",
});

async function handoffCounts(page) {
  return page.evaluate(() => {
    const strip = document.querySelector("#stage-ii [data-review-handoff]");
    if (!strip) return null;
    const read = (key) => strip.querySelector(`[data-handoff="${key}"]`)?.textContent.trim() || "";
    return {
      original: read("original"), modified: read("modified"),
      deferred: read("deferred"), pending: read("pending"),
      linkText: strip.querySelector("[data-handoff-link]")?.textContent.trim() || "",
      linkHref: strip.querySelector("[data-handoff-link]")?.getAttribute("href") || "",
    };
  });
}

async function waitHandoff(page, key, value) {
  await page.waitForFunction(({ key, value }) => {
    const node = document.querySelector(`#stage-ii [data-review-handoff] [data-handoff="${key}"]`);
    return node?.textContent.trim() === value;
  }, { key, value }, { timeout: 15000 });
}

// 组项/发布按钮常距当前滚动位数千 px（seek 把页面带到课尾场景区）。
// page.click 自带的 scrollIntoView 会把未渲染区域拉进视口、触发持续重排，
// 其 actionability 稳定性自检遂永远不过（M 场景实测）。故先瞬时滚到视口中央，
// 等目标位置稳定（pw-wait-settled 轮询）再点 —— 与 resolveRoute 的 clickCentered 同理。
async function clickAfterScrollSettled(page, selector, { stableMs = 700 } = {}) {
  await page.waitForSelector(selector, { timeout: 20000 });
  await page.evaluate((sel) => document.querySelector(sel)?.scrollIntoView({ block: "center", behavior: "instant" }), selector);
  await waitSettledBox(page, selector, { stableMs });
  await page.click(selector);
}

// 在指定组内对第 index 个子区执行：关联首条证据 → 选择处理方式
// 每个交互目标先滚到视口中央再点：移动端按钮常落在视口底缘/顶栏遮挡区
async function resolveRoute(page, groupKey, index, mode) {
  const row = page.locator(`[data-review-group='${groupKey}'] .review-verdict-row.is-in-group`).nth(index);
  const clickCentered = async (loc) => {
    await loc.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" }));
    await page.waitForTimeout(200);
    await loc.click();
  };
  await clickCentered(row.locator("[data-evidence-act='toggle']"));
  await clickCentered(row.locator(".ec-evidence-chip").first());
  if (mode === "original") {
    await clickCentered(row.locator("[data-review-choice='original']"));
  } else if (mode === "modified") {
    await clickCentered(row.locator("[data-review-choice='modified']"));
    const textarea = row.locator(".ec-edit-panel textarea");
    await textarea.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" }));
    await page.waitForTimeout(200);
    await textarea.fill("调整后：补充三级判定锚点，区分无混淆与部分混淆，并标注证据出处。");
    await clickCentered(row.locator("[data-edit-act='save']"));
  } else if (mode === "rejected") {
    await clickCentered(row.locator("[data-review-choice='rejected']"));
    await clickCentered(row.locator("[data-reject-act='confirm']"));
  }
}

async function runScenario(id, { routes, seek = false, viewport } = {}) {
  const page = await browser.newPage({ viewport: viewport || { width: 1440, height: 900 } });
  page.setDefaultTimeout(25000);
  await page.addInitScript((args) => {
    localStorage.setItem("pp.practice.generatedPacks.v1", JSON.stringify({ "mp-ch3-environment": args.pack }));
    localStorage.setItem("pp.practice.packRevision.v1", JSON.stringify({ "mp-ch3-environment": 1 }));
    const routeMap = args.routes;
    let inner = null;
    Object.defineProperty(window, "PharmacoBackend", {
      configurable: true,
      get() { return inner; },
      set(value) {
        if (value && typeof value === "object") {
          value.reviewPractice = (opts) => {
            const route = routeMap[opts.reviewerId];
            if (!route) return new Promise(() => {});
            return Promise.resolve(JSON.parse(JSON.stringify(route)));
          };
        }
        inner = value;
      },
    });
  }, { pack, routes });

  const out = {};
  let step = "init";
  try {
    step = "goto";
    await page.goto(`${BASE}/practice-detail.html?backend=1`, { waitUntil: "domcontentloaded" });
    step = "wait-pack";
    await page.waitForFunction(() => (document.querySelector(".pack-preview [data-pack-field='env09']")?.textContent?.trim().length || 0) > 10, undefined, { timeout: 30000 });
    step = "wait-backend";
    await page.waitForFunction(() => document.documentElement.dataset.backend === "ready", undefined, { timeout: 20000 });
    await page.evaluate(() => document.getElementById("stage-ii")?.scrollIntoView());
    await page.waitForTimeout(800);
    await page.evaluate(() => {
      const panels = Array.from(document.querySelectorAll("[data-ec-role='live-review']"));
      const started = panels.length >= 5 && panels.every((p) => ["ready", "error", "loading"].includes(p.dataset.state));
      if (!started) document.querySelector("[data-review-act='run-all']")?.click();
    });
    step = "wait-five-panels";
    await page.waitForFunction(() => {
      const panels = Array.from(document.querySelectorAll("[data-ec-role='live-review']"));
      return panels.length >= 5 && panels.every((p) => p.dataset.state === "ready" || p.dataset.state === "error");
    }, undefined, { timeout: 60000 });

    if (seek) {
      step = "wait-mv-seek-fn";
      await page.waitForFunction(() => typeof window.PharmacoPilotMV?.seek === "function", undefined, { timeout: 60000 });
      await page.evaluate(() => window.PharmacoPilotMV.seek(2690));
      step = "wait-workspace";
      await page.waitForFunction(() => !!document.querySelector("#stage-ii .review-verdict-workspace"), undefined, { timeout: 60000 });
      // seek 后渲染沉降约 2s（boundingBox 漂移数 px）：轮询位置稳定再操作，不用固定等待
      await waitSettledBox(page, "#stage-ii [data-ec-role='verdict-list']", { stableMs: 700 });
    } else {
      await page.waitForSelector("#stage-ii .posttrial-wait", { timeout: 15000 });
      await waitSettledBox(page, "#stage-ii [data-ec-role='verdict-list']", { stableMs: 700 });
    }

    if (id === "B") {
      const noEvidence = await page.evaluate(() => ({
        wait: !!document.querySelector("#stage-ii .posttrial-wait"),
        strip: !!document.querySelector("#stage-ii [data-review-handoff]"),
      }));
      Object.assign(out, noEvidence);
      if (!noEvidence.wait) fail(id, "无证据占位", "未显示 posttrial-wait");
      if (noEvidence.strip) fail(id, "无证据不渲染小结条", "证据前小结条已出现");
      pass(id, `wait=${noEvidence.wait} strip=${noEvidence.strip}`);
      report.scenarios[id] = out;
      await page.close();
      return;
    }

    // ── 场景 A / M：小结条初始态（5 路均未处理）──
    const initial = await handoffCounts(page);
    Object.assign(out, { initial });
    if (!initial) {
      fail(id, "小结条渲染", "证据出现后未渲染小结条");
    } else {
      if (initial.pending !== "5" || initial.original !== "0") fail(id, "小结条初始计数", JSON.stringify(initial));
      if (initial.linkText !== "前往第三步确认写回 →") fail(id, "小结条初始链接", initial.linkText);
      if (!initial.linkHref.includes("#stage-iii")) fail(id, "小结条锚点", initial.linkHref);
    }

    // ── 处理五路：env04 两路（按建议/调整后）＋一路暂不修改；env02 一路按建议、一路不处理 ──
    await clickAfterScrollSettled(page, "[data-review-select='env:env04']");
    await waitSettledBox(page, "[data-review-group='env:env04']", { stableMs: 500 });
    await resolveRoute(page, "env:env04", 0, "original");
    await waitHandoff(page, "original", "1");
    await resolveRoute(page, "env:env04", 1, "modified");
    await waitHandoff(page, "modified", "1");
    await resolveRoute(page, "env:env04", 2, "rejected");
    await waitHandoff(page, "deferred", "1");
    await clickAfterScrollSettled(page, "[data-review-select='env:env02']");
    await waitSettledBox(page, "[data-review-group='env:env02']", { stableMs: 500 });
    await resolveRoute(page, "env:env02", 0, "original");
    await waitHandoff(page, "original", "2");

    const decided = await handoffCounts(page);
    Object.assign(out, { decided });
    if (!decided || decided.original !== "2" || decided.modified !== "1" || decided.deferred !== "1" || decided.pending !== "1") {
      fail(id, "小结条判定计数", JSON.stringify(decided));
    }
    if (decided && decided.linkText !== "待写回 3 条 · 前往确认写回 →") fail(id, "待写回强调链接", decided?.linkText || "");

    // ── Stage III：确认写回清单口径 + 卷宗 env 分组 ──
    const stage3 = await page.evaluate(() => {
      const groups = Array.from(document.querySelectorAll("#stage-iii .decision-env-group"));
      const rows = Array.from(document.querySelectorAll("#stage-iii .decision-row"));
      return {
        headCopy: document.querySelector("#stage-iii .stage-h p")?.textContent.replace(/\s+/g, " ").trim() || "",
        publishHeading: document.querySelector(".publish-bar .pb-l h4")?.textContent.trim() || "",
        publishDisabled: document.querySelector("#inline-publish")?.disabled,
        ct: document.querySelector("#stage-iii .change-list .ct")?.textContent.trim() || "",
        groupKeys: groups.map((g) => g.dataset.envGroup),
        groupHeads: groups.map((g) => g.querySelector(".decision-env-head")?.textContent.replace(/\s+/g, " ").trim() || ""),
        rowCount: rows.length,
        sectionCounts: rows.map((r) => r.querySelectorAll(".decision-flow > section").length),
        stage3Text: document.getElementById("stage-iii")?.innerText || "",
      };
    });
    Object.assign(out, { stage3 });
    if (!stage3.headCopy.includes("判断已在第二步完成")) fail(id, "Stage III 口径", stage3.headCopy.slice(0, 80));
    if (stage3.headCopy.includes("只有教师明确判断为")) fail(id, "Stage III 旧口径残留", stage3.headCopy.slice(0, 80));
    if (!stage3.headCopy.includes("系统不自动宣布验证结论")) fail(id, "原则句保留", stage3.headCopy.slice(0, 120));
    if (stage3.publishHeading !== "确认写回清单 · 3 条待写回") fail(id, "publish-bar 待写回", stage3.publishHeading);
    if (stage3.publishDisabled !== false) fail(id, "写回按钮可用", String(stage3.publishDisabled));
    if (stage3.ct !== "3" || stage3.rowCount !== 3) fail(id, "卷宗候选总数", `ct=${stage3.ct} rows=${stage3.rowCount}`);
    if (stage3.groupKeys.join(",") !== "env02,env04") fail(id, "卷宗分组键", stage3.groupKeys.join(","));
    if (!stage3.groupHeads.some((t) => t.includes("04") && t.includes("2 条候选"))) fail(id, "env04 组头", JSON.stringify(stage3.groupHeads));
    if (!stage3.groupHeads.some((t) => t.includes("02") && t.includes("1 条候选"))) fail(id, "env02 组头", JSON.stringify(stage3.groupHeads));
    if (!stage3.sectionCounts.every((n) => n === 4)) fail(id, "四段证据链", JSON.stringify(stage3.sectionCounts));

    if (viewport?.width === 390) {
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth);
      if (overflow > 391) fail(id, "移动端横向溢出", `scrollWidth=${overflow}`);
      await page.evaluate(() => document.querySelector("[data-review-handoff]")?.scrollIntoView({ block: "center" }));
      await waitSettledBox(page, "[data-review-handoff]", { stableMs: 500 });
      await waitFontsReady(page);
      await page.screenshot({ path: resolve(root, "output/playwright/stage3-handoff-mobile.png"), timeout: 60000 });
    } else {
      await page.evaluate(() => document.querySelector(".review-verdict-workspace")?.scrollIntoView({ block: "center" }));
      await waitSettledBox(page, ".review-verdict-workspace", { stableMs: 500 });
      await waitFontsReady(page);
      await page.screenshot({ path: resolve(root, "output/playwright/stage3-handoff-verdict.png"), timeout: 60000 });
      await page.evaluate(() => document.querySelector("#stage-iii .change-list")?.scrollIntoView({ block: "start" }));
      await waitSettledBox(page, "#stage-iii .change-list", { stableMs: 500 });
      await page.screenshot({ path: resolve(root, "output/playwright/stage3-handoff-change-list.png"), timeout: 60000 });
    }

    // ── 写回：闭环引导重新审校 + C 区卡片转旧稿 ──
    await clickAfterScrollSettled(page, "#inline-publish");
    await page.waitForFunction(() => document.querySelector(".publish-bar .pb-l h4")?.textContent.trim() === "本轮写回已完成 · 修订与判断记录已保留", undefined, { timeout: 15000 });
    const closed = await page.evaluate(() => ({
      ctaText: document.querySelector(".loop-close .lc-cta")?.textContent.trim() || "",
      ctaHref: document.querySelector(".loop-close .lc-cta")?.getAttribute("href") || "",
      detail: document.querySelector(".loop-close .lc-txt span")?.textContent.trim() || "",
      stalePanels: document.querySelectorAll("[data-ec-role='live-review'][data-state='stale']").length,
      strip: (() => {
        const link = document.querySelector("#stage-ii [data-review-handoff] [data-handoff-link]");
        return link?.textContent.trim() || "";
      })(),
    }));
    Object.assign(out, { closed });
    if (!closed.ctaText.includes("重新审校")) fail(id, "闭环 CTA 引导", closed.ctaText);
    if (closed.ctaHref !== "#stage-ii") fail(id, "闭环 CTA 锚点", closed.ctaHref);
    if (!closed.detail.includes("第 2 版") || !closed.detail.includes("旧稿")) fail(id, "闭环版本号与旧稿提示（一轮写回只升一版）", closed.detail);
    if (closed.stalePanels < 1) fail(id, "C 区旧稿态", `stale=${closed.stalePanels}`);
    if (closed.strip !== "前往第三步确认写回 →") fail(id, "写回后小结条复位", closed.strip);

    const stage2Text = await page.evaluate(() => document.getElementById("stage-ii")?.innerText || "");
    if (/共识|同段/.test(stage2Text)) fail(id, "防回归 stage-ii", "出现“共识”或“同段”字样");
    if (/共识|同段/.test(stage3.stage3Text)) fail(id, "防回归 stage-iii", "出现“共识”或“同段”字样");

    if (viewport?.width !== 390) {
      await page.evaluate(() => document.querySelector(".loop-close")?.scrollIntoView({ block: "center" }));
      await waitSettledBox(page, ".loop-close", { stableMs: 500 });
      await waitFontsReady(page);
      await page.screenshot({ path: resolve(root, "output/playwright/stage3-handoff-loop-close.png"), timeout: 60000 });
    }
    pass(id, `decided=${JSON.stringify(decided && [decided.original, decided.modified, decided.deferred, decided.pending])} groups=${stage3.groupKeys} stale=${closed.stalePanels}`);
  } catch (error) {
    fail(id, "流程异常", `[${step}] ${String(error?.message || error).slice(0, 300)}`);
    try { await page.screenshot({ path: resolve(root, `output/playwright/stage3-handoff-${id}-error.png`) }); } catch { /* 忽略 */ }
  }
  report.scenarios[id] = out;
  await page.close();
}

const only = process.argv[2];
if (!only || only === "A") await runScenario("A", { routes: ROUTES_FULL, seek: true });
if (!only || only === "B") await runScenario("B", { routes: ROUTES_FULL, seek: false });
if (!only || only === "M") await runScenario("M", { routes: ROUTES_FULL, seek: true, viewport: { width: 390, height: 844 } });

report.finishedAt = new Date().toISOString();
writeFileSync(resolve(root, "output/playwright/verify-stage3-handoff.json"), JSON.stringify(report, null, 2));
await browser.close();
console.log(JSON.stringify({ ok: report.failures.length === 0, failures: report.failures }, null, 2));
process.exit(report.failures.length ? 1 : 0);
