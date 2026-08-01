// 跨学科关注热点（第一期）五场景断言：
//  A 5 ready 3+2 → 2 热点   B 3 ready 2 进行中 → 热点只计 ready
//  C 4 ready 1 降级 → 4/5 实时完成   D 5 ready 各不同 env → 0 热点
//  E 同 env 不同摘录 → 同环节热点且保留各自摘录
// 防回归：stage-ii 内不得出现“共识”或“同段”。
// 前置：4173 后端在跑（仅用于供静态页；审校响应全部由注入桩接管，不打模型）。
import { chromium } from "/Users/yandilei/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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
  env03a: "前概念误区包括认为‘人才短缺’属于外部威胁（实为内部弱点）或‘医保控费’仅影响销售（实为影响研发与定价）。",
  env04a: "设定‘某连锁药店拟在 A 区开设新店’为任务背景，学生需利用上述材料分析该店面临的环境挑战与机遇。",
  env04b: "门诊统筹政策摘要（来源：待核实来源，需确认最新执行细则）",
  env04c: "资源清单包含：脱敏后的会员复购数据表（来源：待核实来源，因原始数据未完全脱敏）、门店排班表（来源：门店运营负责人提供）",
  env05a: "第二阶段（25 分钟）边界辨析，角色轮换（政策与市场分析员、门店运营负责人、顾客与服务代表、产业竞争观察员）",
  env06a: "若策略组合环节出现‘万能策略’（如所有组都建议‘加大营销’），教师提示检查该策略是否针对了具体的 W 或 T 要素",
  env07a: "标准二‘证据相关性’，指标为案例事实支撑度，锚点为‘数据详实且来源可溯’、‘有数据但来源待核实’、‘缺乏数据支撑’。",
  env08a: "核心复盘问题包括：‘在分析医药环境时，我们是否充分区分了政策影响与组织自身能力？’",
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
const NEVER = "__never__";

const SCENARIOS = {
  A: {
    "pharmacy-context": anchored("pharmacy-context", "env04", "env04a", "任务背景聚焦新店开设的经营决策，缺失患者群画像与药师服务流程等药事实践要素。", "补充慢病患者的购药频次、用药依从性与药师指导时长等门店服务数据。"),
    "regulatory-citation": anchored("regulatory-citation", "env04", "env04b", "门诊统筹政策摘要未标注发文机关、文号与生效时间窗口，合规引用无法核验。", "补充该政策的发文机关、文号与年份，并标注有效执行期限。"),
    "evidence-metrics": anchored("evidence-metrics", "env04", "env04c", "会员复购数据表来源标注待核实，情境证据缺少可溯源的替代方案。", "替换为公开可得的医保定点药店年度统计或区域门诊统筹执行概况。"),
    "management-tradeoff": anchored("management-tradeoff", "env02", "env02b", "结果三仅关注策略生成的逻辑自洽，缺失医保控费与竞对策略等环境要素的管理权衡。", "增加权衡维度指标，要求学生标注环境要素对内部资源的挤压或增益。"),
    "instructional-design": anchored("instructional-design", "env02", "env02a", "判定标准“无内部/外部混淆错误”为二元口径，无法区分学生对环境边界的掌握程度。", "将判定标准改为无混淆、混淆不超过 2 项、混淆超过 2 项三级锚点。"),
  },
  B: {
    // 批跑并发 2、队列顺序 = EXPERTS 顺序（药学/管理/法规/教学/数据）。
    // 进行中的两路必须排在队尾，否则两个 worker 都被占位，后面的 ready 路永远轮不到。
    "pharmacy-context": anchored("pharmacy-context", "env04", "env04a", "任务背景聚焦新店开设的经营决策，缺失患者群画像与药师服务流程等药事实践要素。", "补充慢病患者的购药频次、用药依从性与药师指导时长等门店服务数据。"),
    "management-tradeoff": anchored("management-tradeoff", "env02", "env02b", "结果三仅关注策略生成的逻辑自洽，缺失医保控费与竞对策略等环境要素的管理权衡。", "增加权衡维度指标，要求学生标注环境要素对内部资源的挤压或增益。"),
    "regulatory-citation": anchored("regulatory-citation", "env04", "env04b", "门诊统筹政策摘要未标注发文机关、文号与生效时间窗口，合规引用无法核验。", "补充该政策的发文机关、文号与年份，并标注有效执行期限。"),
    "instructional-design": NEVER,
    "evidence-metrics": NEVER,
  },
  C: {
    "pharmacy-context": anchored("pharmacy-context", "env04", "env04a", "任务背景聚焦新店开设的经营决策，缺失患者群画像与药师服务流程等药事实践要素。", "补充慢病患者的购药频次、用药依从性与药师指导时长等门店服务数据。"),
    "regulatory-citation": anchored("regulatory-citation", "env04", "env04b", "门诊统筹政策摘要未标注发文机关、文号与生效时间窗口，合规引用无法核验。", "补充该政策的发文机关、文号与年份，并标注有效执行期限。"),
    "management-tradeoff": anchored("management-tradeoff", "env02", "env02b", "结果三仅关注策略生成的逻辑自洽，缺失医保控费与竞对策略等环境要素的管理权衡。", "增加权衡维度指标，要求学生标注环境要素对内部资源的挤压或增益。"),
    "evidence-metrics": anchored("evidence-metrics", "env02", "env02a", "结果一的证据仅看要素归属准确性，缺少对混淆类型与数据出处的事实核查。", "增加证据出处可溯的判定要求，区分无混淆与部分混淆。"),
    "instructional-design": unanchored("instructional-design"),
  },
  D: {
    "pharmacy-context": anchored("pharmacy-context", "env05", "env05a", "边界辨析环节的角色轮换未明确药师在门店决策中的实际权限。", "为门店运营负责人与顾客代表补充药师决策权限的说明卡。"),
    // 前端的案例回应校验要求 issue/suggestion 至少沾一个本案词汇（文号/发文机关/来源…），
    // 只写“政策出处/年份”会被当作漂移拦截。
    "regulatory-citation": anchored("regulatory-citation", "env03", "env03a", "前概念诊断引用医保控费影响，但未标注发文机关与年份，来源无法核验。", "为医保控费相关表述补充发文机关、文号与年份标注。"),
    "evidence-metrics": anchored("evidence-metrics", "env06", "env06a", "万能策略干预规则缺少可观察的数据信号，教师难以判定触发时机。", "为策略泛泛化定义可观察信号，如全部小组策略雷同即触发。"),
    "instructional-design": anchored("instructional-design", "env07", "env07a", "证据相关性的中间锚点“来源待核实”不可观察，学生自评时无法稳定判定。", "把中间锚点改为可观察行为，如能写出数据出处但不完整。"),
    "management-tradeoff": anchored("management-tradeoff", "env08", "env08a", "复盘问题未显化政策影响与组织能力之间的管理权衡取舍。", "增加一条权衡复盘题，要求学生写下一次具体取舍及依据。"),
  },
  E: {
    "pharmacy-context": anchored("pharmacy-context", "env04", "env04a", "任务背景聚焦新店开设的经营决策，缺失患者群画像与药师服务流程等药事实践要素。", "补充慢病患者的购药频次、用药依从性与药师指导时长等门店服务数据。"),
    "regulatory-citation": anchored("regulatory-citation", "env04", "env04b", "门诊统筹政策摘要未标注发文机关、文号与生效时间窗口，合规引用无法核验。", "补充该政策的发文机关、文号与年份，并标注有效执行期限。"),
    "management-tradeoff": NEVER,
    "instructional-design": NEVER,
    "evidence-metrics": NEVER,
  },
};

const report = { scenarios: {}, failures: [] };
const fail = (scenario, name, detail) => { report.failures.push({ scenario, name, detail }); console.error(`✗ [${scenario}] ${name}: ${detail}`); };
const pass = (scenario, name) => console.error(`· [${scenario}] ${name}`);

const browser = await chromium.launch({
  executablePath: "/Users/yandilei/Library/Caches/ms-playwright/chromium_headless_shell-1217/chrome-headless-shell-mac-arm64/chrome-headless-shell",
});

async function runScenario(id, viewport) {
  const routes = SCENARIOS[id];
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
            if (!route || route === "__never__") return new Promise(() => {});
            return Promise.resolve(JSON.parse(JSON.stringify(route)));
          };
        }
        inner = value;
      },
    });
  }, { pack, routes });

  const out = { gate: "", details: 0, summaries: [], pending: "", cardStates: [] };
  try {
    await page.goto(`${BASE}/practice-detail.html?backend=1`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => (document.querySelector(".pack-preview [data-pack-field='env09']")?.textContent?.trim().length || 0) > 10, undefined, { timeout: 30000 });
    await page.waitForFunction(() => document.documentElement.dataset.backend === "ready", undefined, { timeout: 20000 });
    await page.evaluate(() => document.getElementById("stage-ii")?.scrollIntoView());

    const expectedReady = Object.values(routes).filter((r) => r !== "__never__" && r.status === "anchored").length;
    const expectedError = Object.values(routes).filter((r) => r !== "__never__" && r.status !== "anchored").length;
    await page.waitForFunction((want) => {
      const panels = Array.from(document.querySelectorAll("[data-ec-role='live-review']"));
      const ready = panels.filter((p) => p.dataset.state === "ready").length;
      const error = panels.filter((p) => p.dataset.state === "error").length;
      return panels.length >= 5 && ready >= want.ready && error >= want.error;
    }, { ready: expectedReady, error: expectedError }, { timeout: 60000 });
    await page.waitForTimeout(900); // 等焦点摘要与卡片重绘

    const snap = await page.evaluate(() => {
      const summary = document.querySelector("[data-review-role='focus-summary']");
      const list = document.querySelector("[data-review-role='focus-list']");
      return {
        gate: summary?.querySelector("[data-review-role='focus-gate']")?.textContent?.trim() || "",
        details: list?.querySelectorAll("details.review-focus-env").length || 0,
        summaries: Array.from(list?.querySelectorAll("details.review-focus-env > summary") || []).map((s) => s.textContent.replace(/\s+/g, " ").trim()),
        pending: list?.querySelector(".review-focus-pending")?.textContent?.trim() || "",
        cardStates: Array.from(document.querySelectorAll(".expert-card")).map((c) => c.querySelector("[data-ec-role='live-review']")?.dataset.state || "?"),
        cardStatusTexts: Array.from(document.querySelectorAll("[data-ec-role='live-status']")).map((el) => el.textContent.trim()),
        stage2Text: document.getElementById("stage-ii")?.innerText || "",
        focusText: summary?.innerText || "",
      };
    });
    Object.assign(out, snap);

    if (/共识|同段/.test(snap.stage2Text)) fail(id, "防回归", "stage-ii 出现“共识”或“同段”字样");

    if (id === "A") {
      if (snap.gate !== "五路审校完成 · 2 个跨学科关注热点 · 5 条意见均逐字锚定") fail(id, "摘要", snap.gate);
      if (snap.details !== 2) fail(id, "热点数", `details=${snap.details}`);
      if (!snap.summaries.some((s) => s.includes("04") && s.includes("3 路共同关注"))) fail(id, "env04 热点", JSON.stringify(snap.summaries));
      if (!snap.summaries.some((s) => s.includes("02") && s.includes("2 路共同关注"))) fail(id, "env02 热点", JSON.stringify(snap.summaries));
      if (!snap.cardStatusTexts.every((t) => t.includes("已锚定"))) fail(id, "五卡状态", JSON.stringify(snap.cardStatusTexts));
      if (!snap.cardStatusTexts.some((t) => t.includes("共同关注 04"))) fail(id, "卡片共同关注标注", JSON.stringify(snap.cardStatusTexts));
      // 展开 env04：三个学科的问题/建议/摘录必须各自保留（仅桌面轮；移动轮不点开，
      // 避免覆盖桌面截图，也让移动端截到折叠态）
      if (!viewport) {
        await page.click("details.review-focus-env > summary");
        const openText = await page.evaluate(() => document.querySelector("details.review-focus-env[open]")?.innerText || "");
        for (const needle of ["药学情境", "法规合规", "数据循证", "问题", "建议", "摘录", "已锚定 · 第 1 版"]) {
          if (!openText.includes(needle)) fail(id, "展开内容", `缺 ${needle}`);
        }
        await page.screenshot({ path: resolve(root, "output/playwright/hotspot-expanded.png") });
        await page.screenshot({ path: resolve(root, "output/playwright/hotspot-desktop.png") });
      }
    }
    if (id === "B") {
      if (!snap.gate.startsWith("已完成 3/5 路实时审校")) fail(id, "部分完成摘要", snap.gate);
      if (!snap.gate.includes("1 个跨学科关注热点")) fail(id, "部分完成热点", snap.gate);
      if (!snap.gate.includes("3 条意见已逐字锚定")) fail(id, "部分完成锚定数", snap.gate);
      if (!snap.pending.includes("2 路审校进行中")) fail(id, "进行中观察重点", snap.pending || "(无 pending 行)");
      if (snap.pending.includes("种子")) fail(id, "进行中不得混入种子", snap.pending);
      // env04 两路 ready 聚成唯一热点；env02 单路只显示“1 路关注”，不算共同关注
      const hot = snap.summaries.filter((s) => s.includes("共同关注"));
      if (hot.length !== 1 || !hot[0].includes("04") || !hot[0].includes("2 路共同关注")) fail(id, "热点只计 ready", JSON.stringify(snap.summaries));
    }
    if (id === "C") {
      if (!snap.gate.startsWith("已完成 4/5 路实时审校")) fail(id, "降级摘要", snap.gate);
      if (!snap.gate.includes("1 路显示预置观察重点")) fail(id, "降级不计完成", snap.gate);
      if (!snap.gate.includes("4 条意见已逐字锚定")) fail(id, "降级锚定数", snap.gate);
      if (!snap.pending.includes("1 路降级为预置观察重点")) fail(id, "降级观察重点", snap.pending || "(无 pending 行)");
      if (snap.cardStates.filter((s) => s === "error").length !== 1) fail(id, "降级卡状态", JSON.stringify(snap.cardStates));
      await page.screenshot({ path: resolve(root, "output/playwright/hotspot-degraded.png") });
    }
    if (id === "D") {
      if (snap.gate !== "五路审校完成 · 各学科关注点分布在不同环节 · 5 条意见均逐字锚定") fail(id, "无热点摘要", snap.gate);
      if (snap.details !== 5) fail(id, "单路分组数", `details=${snap.details}`);
      if (snap.summaries.some((s) => s.includes("共同关注"))) fail(id, "无热点不得出现共同关注", JSON.stringify(snap.summaries));
      if (!snap.summaries.every((s) => s.includes("1 路关注"))) fail(id, "单路标注", JSON.stringify(snap.summaries));
    }
    if (id === "E") {
      if (snap.details !== 1) fail(id, "同环节聚合", `details=${snap.details}`);
      await page.click("details.review-focus-env > summary");
      const openText = await page.evaluate(() => document.querySelector("details.review-focus-env[open]")?.innerText || "");
      if (!openText.includes(EXCERPTS.env04a.slice(0, 18))) fail(id, "保留摘录 A", openText.slice(0, 120));
      if (!openText.includes(EXCERPTS.env04b.slice(0, 12))) fail(id, "保留摘录 B", openText.slice(0, 120));
    }

    if (viewport?.width === 390) {
      await page.screenshot({ path: resolve(root, "output/playwright/hotspot-mobile.png"), fullPage: false });
    }
    pass(id, `gate="${snap.gate}" details=${snap.details}`);
  } catch (error) {
    fail(id, "流程异常", String(error?.message || error).slice(0, 300));
    try { await page.screenshot({ path: resolve(root, `output/playwright/hotspot-${id}-error.png`) }); } catch { /* 忽略 */ }
  }
  report.scenarios[id] = out;
  await page.close();
}

await runScenario("A");
await runScenario("B");
await runScenario("C");
await runScenario("D");
await runScenario("E");
await runScenario("A", { width: 390, height: 844 });

report.finishedAt = new Date().toISOString();
writeFileSync(resolve(root, "output/playwright/verify-env-hotspots.json"), JSON.stringify(report, null, 2));
await browser.close();
console.log(JSON.stringify({ ok: report.failures.length === 0, failures: report.failures }, null, 2));
process.exit(report.failures.length ? 1 : 0);
