// Stage II 重组一期（C 区环节热点组卡）Playwright 断言：
//  A 5 ready 3+2 + KM → 2 个组项、组卡三子区、组内判定等效
//  B 5 ready 无 KM → posttrial-wait 占位、无组卡、深链落占位区
//  C 右栏热点深链 → 对应组卡 is-active
//  D 4 ready(2+2) + 1 降级 + KM → 降级为观察重点单卡，不进组
// 防回归：stage-ii 内不得出现“共识”或“同段”。
// 前置：4173 后端在跑（仅静态页；审校响应全部由注入桩接管）。
// 证据：等待 window.PharmacoPilotMV 后 seek 到课尾，经 onTime 派生关键时刻。
import { chromium } from "/Users/yandilei/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { waitSettledBox, clickWhenSettled, waitFontsReady } from "./pw-wait-settled.mjs";

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
const unanchored = (reviewerId) => ({
  source: "local-model", status: "unanchored", reviewer: REVIEWER_META[reviewerId],
  model: "scenario-qwen", generatedAt: "2026-08-02T00:00:00.000Z", sourceRevision: 1,
  manuscriptHash: "scenario-hash", promptVersion: "scenario", orchestrationVersion: "scenario",
  attempts: 2, cache: { hit: false, key: "scenario" },
  gate: { reason: "not_found", targetEnv: "env02" },
  unlocatedReview: {
    reviewerId, expertId: REVIEWER_META[reviewerId].expertId,
    issue: "判定标准缺少可观察的行为锚点。", suggestion: "为判定标准配三级行为锚点，对齐评价标准的等级描述。",
    claimedTargetEnv: "env02", claimedSourceExcerpt: "不存在的摘录",
    claimedCrossReferences: [], gateReason: "not_found", sourceRevision: 1,
    manuscriptHash: "scenario-hash", model: "scenario-qwen", promptVersion: "scenario",
    orchestrationVersion: "scenario", generatedAt: "2026-08-02T00:00:00.000Z",
  },
});

const ROUTES_FULL = {
  "pharmacy-context": anchored("pharmacy-context", "env04", "env04a", "任务背景聚焦新店开设的经营决策，缺失患者群画像与药师服务流程等药事实践要素。", "补充慢病患者的购药频次、用药依从性与药师指导时长等门店服务数据。"),
  "regulatory-citation": anchored("regulatory-citation", "env04", "env04b", "门诊统筹政策摘要未标注发文机关、文号与生效时间窗口，合规引用无法核验。", "补充该政策的发文机关、文号与年份，并标注有效执行期限。"),
  "evidence-metrics": anchored("evidence-metrics", "env04", "env04c", "会员复购数据表来源标注待核实，情境证据缺少可溯源的替代方案。", "替换为公开可得的医保定点药店年度统计或区域门诊统筹执行概况。"),
  "management-tradeoff": anchored("management-tradeoff", "env02", "env02b", "结果三仅关注策略生成的逻辑自洽，缺失医保控费与竞对策略等环境要素的管理权衡。", "增加权衡维度指标，要求学生标注环境要素对内部资源的挤压或增益。"),
  "instructional-design": anchored("instructional-design", "env02", "env02a", "判定标准“无内部/外部混淆错误”为二元口径，无法区分学生对环境边界的掌握程度。", "将判定标准改为无混淆、混淆不超过 2 项、混淆超过 2 项三级锚点。"),
};
const ROUTES_DEGRADED = {
  "pharmacy-context": ROUTES_FULL["pharmacy-context"],
  "regulatory-citation": ROUTES_FULL["regulatory-citation"],
  "management-tradeoff": ROUTES_FULL["management-tradeoff"],
  "evidence-metrics": anchored("evidence-metrics", "env02", "env02a", "结果一的证据仅看要素归属准确性，缺少对混淆类型与数据出处的事实核查。", "增加证据出处可溯的判定要求，区分无混淆与部分混淆。"),
  "instructional-design": unanchored("instructional-design"),
};

const report = { scenarios: {}, failures: [] };
const fail = (scenario, name, detail) => { report.failures.push({ scenario, name, detail }); console.error(`✗ [${scenario}] ${name}: ${detail}`); };
const pass = (scenario, name) => console.error(`· [${scenario}] ${name}`);

const browser = await chromium.launch({
  executablePath: "/Users/yandilei/Library/Caches/ms-playwright/chromium_headless_shell-1217/chrome-headless-shell-mac-arm64/chrome-headless-shell",
});

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
  try {
    await page.goto(`${BASE}/practice-detail.html?backend=1`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => (document.querySelector(".pack-preview [data-pack-field='env09']")?.textContent?.trim().length || 0) > 10, undefined, { timeout: 30000 });
    await page.waitForFunction(() => document.documentElement.dataset.backend === "ready", undefined, { timeout: 20000 });
    await page.evaluate(() => document.getElementById("stage-ii")?.scrollIntoView());
    // 移动断点下 IntersectionObserver 自动批跑偶发不触发：先等一拍，仍未启动则点批量按钮兜底
    await page.waitForTimeout(800);
    await page.evaluate(() => {
      const panels = Array.from(document.querySelectorAll("[data-ec-role='live-review']"));
      const started = panels.length >= 5 && panels.every((p) => ["ready", "error", "loading"].includes(p.dataset.state));
      if (!started) document.querySelector("[data-review-act='run-all']")?.click();
    });
    // 五路全部脱离 loading 态（ready 或降级）再操作
    await page.waitForFunction(() => {
      const panels = Array.from(document.querySelectorAll("[data-ec-role='live-review']"));
      return panels.length >= 5 && panels.every((p) => p.dataset.state === "ready" || p.dataset.state === "error");
    }, undefined, { timeout: 60000 });

    if (seek) {
      await page.waitForFunction(() => typeof window.PharmacoPilotMV?.seek === "function", undefined, { timeout: 30000 });
      await page.evaluate(() => window.PharmacoPilotMV.seek(2690));
      await page.waitForFunction(() => !!document.querySelector("#stage-ii .review-verdict-workspace"), undefined, { timeout: 30000 });
      // seek 后渲染沉降约 2s（boundingBox 漂移数 px）：轮询位置稳定再操作，不用固定等待
      await waitSettledBox(page, "#stage-ii [data-ec-role='verdict-list']", { stableMs: 700 });
    } else {
      await page.waitForSelector("#stage-ii .posttrial-wait", { timeout: 15000 });
      await waitSettledBox(page, "#stage-ii [data-ec-role='verdict-list']", { stableMs: 700 });
    }

    const snap = await page.evaluate(() => {
      const list = document.querySelector("#stage-ii [data-ec-role='verdict-list']");
      const items = Array.from(list?.querySelectorAll(".review-verdict-index-item") || []);
      const activeDetail = list?.querySelector("[data-review-group]:not([hidden])");
      return {
        wait: !!list?.querySelector(".posttrial-wait"),
        groupItems: items.filter((el) => el.classList.contains("is-group")).map((el) => el.textContent.replace(/\s+/g, " ").trim()),
        routeItems: items.filter((el) => !el.classList.contains("is-group")).map((el) => ({ text: el.textContent.replace(/\s+/g, " ").trim(), observation: el.classList.contains("is-observation"), select: el.dataset.reviewSelect })),
        itemCount: items.length,
        activeKey: activeDetail?.dataset.reviewGroup || "",
        activeIndexKey: list?.querySelector(".review-verdict-index-item.is-active")?.dataset.reviewSelect || "",
        groupCards: list?.querySelectorAll(".review-verdict-group").length || 0,
        stage2Text: document.getElementById("stage-ii")?.innerText || "",
      };
    });
    Object.assign(out, snap);

    if (/共识|同段/.test(snap.stage2Text)) fail(id, "防回归", "stage-ii 出现“共识”或“同段”字样");

    if (id === "A") {
      if (snap.wait) fail(id, "证据门", "有 KM 时仍显示 posttrial-wait");
      if (snap.groupItems.length !== 2) fail(id, "组项数", JSON.stringify(snap.groupItems));
      if (!snap.groupItems.some((t) => t.includes("04") && t.includes("3 路共同关注"))) fail(id, "env04 组项", JSON.stringify(snap.groupItems));
      if (!snap.groupItems.some((t) => t.includes("02") && t.includes("2 路共同关注"))) fail(id, "env02 组项", JSON.stringify(snap.groupItems));
      if (!snap.activeKey || snap.activeKey !== snap.activeIndexKey) fail(id, "默认聚焦一致", `detail=${snap.activeKey} index=${snap.activeIndexKey}`);

      // 聚焦 env04 组卡：组头 + 并集行 + 三个子区
      await clickWhenSettled(page, "[data-review-select='env:env04']");
      await waitSettledBox(page, "[data-review-group='env:env04']", { stableMs: 500 });
      const group = await page.evaluate(() => {
        const card = document.querySelector("[data-review-group='env:env04']");
        const sub = Array.from(card?.querySelectorAll(".review-verdict-row.is-in-group") || []);
        return {
          visible: !!card && !card.hidden,
          head: card?.querySelector(".review-verdict-group-head")?.textContent.replace(/\s+/g, " ").trim() || "",
          union: card?.querySelector("[data-group-evidence]")?.textContent.replace(/\s+/g, " ").trim() || "",
          subCount: sub.length,
          choiceCounts: sub.map((el) => el.querySelectorAll("[data-review-choice]").length),
          statuses: sub.map((el) => el.querySelector("[data-ec-role='posttrial-status']")?.textContent.trim() || ""),
        };
      });
      Object.assign(out, { group });
      if (!group.visible) fail(id, "组卡可见", "env04 组卡未显示");
      if (!group.head.includes("04") || !group.head.includes("3 路共同关注")) fail(id, "组头", group.head);
      if (!group.union.startsWith("关联记录并集")) fail(id, "并集行", group.union);
      if (group.subCount !== 3) fail(id, "子区数", `subCount=${group.subCount}`);
      if (!group.choiceCounts.every((n) => n === 3)) fail(id, "子区三选", JSON.stringify(group.choiceCounts));

      // 组内第一路子区：关联一条证据 → 按建议修改 → 组项聚合 3 路待处理 → 2 路待处理
      const firstSub = page.locator("[data-review-group='env:env04'] .review-verdict-row.is-in-group").first();
      await firstSub.locator("[data-evidence-act='toggle']").click();
      await firstSub.locator(".ec-evidence-chip").first().click();
      await firstSub.locator("[data-review-choice='original']").click();
      await page.waitForFunction(() => {
        const item = document.querySelector("[data-review-select='env:env04'] [data-review-index-status]");
        return item?.textContent.trim() === "2 路待处理";
      }, undefined, { timeout: 15000 });
      const resolved = await page.evaluate(() => document.querySelector("[data-review-summary='resolved']")?.textContent.trim());
      if (resolved !== "1") fail(id, "工作区已处理计数", `resolved=${resolved}`);
      await waitFontsReady(page);
      await page.screenshot({ path: resolve(root, "output/playwright/stage2-group-desktop.png"), timeout: 60000 });
      await page.locator("[data-group-evidence]").first().screenshot({ path: resolve(root, "output/playwright/stage2-group-evidence.png"), timeout: 60000 });
    }

    if (id === "B") {
      if (!snap.wait) fail(id, "无证据占位", "未显示 posttrial-wait");
      if (snap.groupCards !== 0 || snap.itemCount !== 0) fail(id, "无证据不渲染组卡", `groups=${snap.groupCards} items=${snap.itemCount}`);
      // 无证据时深链落到占位区且不出组卡（先展开热点 details，按钮才可见）
      await clickWhenSettled(page, "details.review-focus-env[data-env-key='env04'] > summary");
      await clickWhenSettled(page, "[data-focus-goto='env04']");
      await waitSettledBox(page, "#stage-ii .posttrial-wait", { stableMs: 500 });
      const stillWait = await page.evaluate(() => !!document.querySelector("#stage-ii .posttrial-wait"));
      if (!stillWait) fail(id, "无证据深链", "深链后占位区消失");
    }

    if (id === "C") {
      // 先切到 env02，再从右栏热点深链回 env04
      await clickWhenSettled(page, "[data-review-select='env:env02']");
      await waitSettledBox(page, "[data-review-group='env:env02']", { stableMs: 500 });
      await clickWhenSettled(page, "details.review-focus-env[data-env-key='env04'] > summary");
      await clickWhenSettled(page, "[data-focus-goto='env04']");
      await waitSettledBox(page, "[data-review-group='env:env04']", { stableMs: 700 });
      const focus = await page.evaluate(() => ({
        card: document.querySelector("[data-review-group='env:env04']")?.classList.contains("is-active") || false,
        index: document.querySelector("[data-review-select='env:env04']")?.classList.contains("is-active") || false,
        hidden: document.querySelector("[data-review-group='env:env04']")?.hidden,
      }));
      if (!focus.card || !focus.index || focus.hidden !== false) fail(id, "深链聚焦", JSON.stringify(focus));
    }

    if (id === "D") {
      if (snap.groupItems.length !== 2) fail(id, "降级场景组项数", JSON.stringify(snap.groupItems));
      const obs = snap.routeItems.filter((r) => r.observation);
      if (obs.length !== 1 || !obs[0].text.includes("预置观察重点") || !obs[0].text.includes("教学设计")) {
        fail(id, "降级观察重点单卡", JSON.stringify(snap.routeItems));
      }
      if (snap.routeItems.some((r) => r.text.includes("共同关注"))) fail(id, "单卡不得标共同关注", JSON.stringify(snap.routeItems));
    }

    if (viewport?.width === 390) {
      await clickWhenSettled(page, "[data-review-select='env:env04']")
        .then(() => waitSettledBox(page, "[data-review-group='env:env04']", { stableMs: 500 }))
        .catch(() => {});
      await waitFontsReady(page);
      await page.screenshot({ path: resolve(root, "output/playwright/stage2-group-mobile.png"), fullPage: false, timeout: 60000 });
    }
    pass(id, `groups=${snap.groupItems.length} routes=${snap.routeItems.length} active=${snap.activeKey}`);
  } catch (error) {
    fail(id, "流程异常", String(error?.message || error).slice(0, 300));
    try { await page.screenshot({ path: resolve(root, `output/playwright/stage2-group-${id}-error.png`) }); } catch { /* 忽略 */ }
  }
  report.scenarios[id] = out;
  await page.close();
}

await runScenario("A", { routes: ROUTES_FULL, seek: true });
await runScenario("B", { routes: ROUTES_FULL, seek: false });
await runScenario("C", { routes: ROUTES_FULL, seek: true });
await runScenario("D", { routes: ROUTES_DEGRADED, seek: true });
await runScenario("M", { routes: ROUTES_FULL, seek: true, viewport: { width: 390, height: 844 } });

report.finishedAt = new Date().toISOString();
writeFileSync(resolve(root, "output/playwright/verify-stage2-groups.json"), JSON.stringify(report, null, 2));
await browser.close();
console.log(JSON.stringify({ ok: report.failures.length === 0, failures: report.failures }, null, 2));
process.exit(report.failures.length ? 1 : 0);
