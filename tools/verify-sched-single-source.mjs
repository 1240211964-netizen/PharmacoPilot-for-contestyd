#!/usr/bin/env node
/* SCHED 单源校验（persona-v2-contract §8.2 · P1）+ ENRICH-ACTIVATION 单源校验（§2.1/§7 · P3）
 *
 * 断言：
 *   (a) shared/sched-from-drama.js 的 SCHED-DERIVE 标记区与两引擎
 *       （mv-classroom-core.js / practice-runtime.js）内嵌副本逐字节一致
 *       —— 防双份漂移，照 SIM-RNG P0 断言模式（verify-agent-persona (f)）。
 *   (b) 两引擎 build 函数已改为派生调用：core `SCHED = deriveSchedFromDrama(AGENTS)`、
 *       runtime `__scheduledEvents = deriveSchedFromDrama(__agents)`，
 *       且 build 函数体内不再残留手工事件字面量（{ t: <数字>）。
 *   (c) 用画像 JSON 实跑 deriveSchedFromDrama：条数 = 28（规范 26 + §15-1 C3/C6 2 条），
 *       逐事件 {t, agent, fx, why} 字段齐备且按 t 升序；
 *       C3/C6 各含 1 条 t:1500 教师点名事件（§15-1）。
 *   (d) shared/enrich-activation.js 的 ENRICH-ACTIVATION 标记区与两引擎内嵌副本
 *       逐字节一致（§2.1 enrichmentPlan + §7 情境激活单源，P3 照 SCHED-DERIVE 先例）。
 *
 * 退出码：全过 = 0；任一失败 = 1。
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FILES = [
  ["shared/sched-from-drama.js", resolve(root, "shared/sched-from-drama.js")],
  ["mv-classroom-core.js", resolve(root, "shared/mv-classroom-core.js")],
  ["practice-runtime.js", resolve(root, "shared/practice-runtime.js")],
];

const failures = [];
console.log("verify-sched-single-source（persona-v2-contract §8.2 · P1）");
function check(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failures.push(name);
    console.error(`  ✗ ${name}\n      ${e.message}`);
  }
}
function fail(msg) { throw new Error(msg); }

/* (a) 三处 SCHED-DERIVE 标记区逐字节一致 */
check("(a) SCHED-DERIVE 标记区三处逐字节一致", () => {
  const MARK = /\/\* ==== SCHED-DERIVE-BEGIN[\s\S]*?\/\* ==== SCHED-DERIVE-END ==== \*\//;
  const blocks = FILES.map(([label, p]) => {
    const m = readFileSync(p, "utf8").match(MARK);
    if (!m) fail(`${label} 缺 SCHED-DERIVE 标记区`);
    return [label, m[0]];
  });
  const [refLabel, ref] = blocks[0];
  for (const [label, block] of blocks.slice(1)) {
    if (block !== ref) fail(`${label} 内嵌副本与 ${refLabel} 漂移（同步 SCHED-DERIVE 标记区）`);
  }
});

/* (b) build 函数已改派生调用，无手工事件字面量残留 */
check("(b) 两引擎 build 函数为派生调用、无手工 SCHED 残留", () => {
  const core = readFileSync(FILES[1][1], "utf8");
  const rt = readFileSync(FILES[2][1], "utf8");
  if (!/function buildSched\(\)\s*\{[\s\S]*?SCHED = deriveSchedFromDrama\(AGENTS\);[\s\S]*?\}/.test(core)) {
    fail("core buildSched 未见 SCHED = deriveSchedFromDrama(AGENTS)");
  }
  if (!/function buildScheduledEvents\(\)\s*\{[\s\S]*?__scheduledEvents = deriveSchedFromDrama\(__agents\);[\s\S]*?\}/.test(rt)) {
    fail("runtime buildScheduledEvents 未见 __scheduledEvents = deriveSchedFromDrama(__agents)");
  }
  const coreBody = core.slice(core.indexOf("function buildSched()"), core.indexOf("function applyAgentFx"));
  const rtBody = rt.slice(rt.indexOf("function buildScheduledEvents()"), rt.indexOf("function applyAgentEvent"));
  for (const [label, body] of [["core buildSched", coreBody], ["runtime buildScheduledEvents", rtBody]]) {
    if (/\{ t: \d/.test(body) || /\.push\(\s*\{ t:/.test(body)) fail(`${label} 残留手工事件字面量`);
  }
});

/* (c) 画像 JSON 实跑派生：28 条、字段齐备、升序、C3/C6 点名事件在册 */
check("(c) drama.events 派生 SCHED = 28 条且字段齐备（含 §15-1 C3/C6）", () => {
  const src = readFileSync(FILES[0][1], "utf8");
  vm.runInThisContext(src, { filename: "shared/sched-from-drama.js" });
  const derive = globalThis.SchedFromDrama && globalThis.SchedFromDrama.deriveSchedFromDrama;
  if (typeof derive !== "function") fail("SchedFromDrama.deriveSchedFromDrama 未暴露");
  const agents = JSON.parse(readFileSync(resolve(root, "shared/virtual-class-agents.json"), "utf8"));
  const sched = derive(agents);
  if (sched.length !== 28) fail(`派生条数 ${sched.length} ≠ 28（规范 26 + §15-1 C3/C6 2 条）`);
  sched.forEach((e, i) => {
    if (typeof e.t !== "number" || typeof e.agent !== "string" || !e.fx || typeof e.why !== "string" || !e.why) {
      fail(`事件 #${i} 字段不齐：${JSON.stringify(e)}`);
    }
    if (i > 0 && sched[i - 1].t > e.t) fail(`事件未按 t 升序：#${i - 1} t=${sched[i - 1].t} > #${i} t=${e.t}`);
  });
  for (const sid of ["C3", "C6"]) {
    const hit = sched.filter((e) => e.agent === sid && e.t === 1500 && e.why.includes("点名"));
    if (hit.length !== 1) fail(`${sid} 缺 t:1500 教师点名事件（§15-1）`);
  }
});

/* (d) ENRICH-ACTIVATION 标记区三处逐字节一致（§2.1/§7 · P3） */
check("(d) ENRICH-ACTIVATION 标记区三处逐字节一致", () => {
  const MARK = /\/\* ==== ENRICH-ACTIVATION-BEGIN[\s\S]*?\/\* ==== ENRICH-ACTIVATION-END ==== \*\//;
  const files = [
    ["shared/enrich-activation.js", resolve(root, "shared/enrich-activation.js")],
    ["mv-classroom-core.js", resolve(root, "shared/mv-classroom-core.js")],
    ["practice-runtime.js", resolve(root, "shared/practice-runtime.js")],
  ];
  const blocks = files.map(([label, p]) => {
    const m = readFileSync(p, "utf8").match(MARK);
    if (!m) fail(`${label} 缺 ENRICH-ACTIVATION 标记区`);
    return [label, m[0]];
  });
  const [refLabel, ref] = blocks[0];
  for (const [label, block] of blocks.slice(1)) {
    if (block !== ref) fail(`${label} 内嵌副本与 ${refLabel} 漂移（同步 ENRICH-ACTIVATION 标记区）`);
  }
});

if (failures.length) {
  console.error(`\n✗ ${failures.length} 条断言失败`);
  process.exit(1);
}
console.log("\nSCHED 单源 + ENRICH-ACTIVATION 单源断言全部通过（4/4）");
process.exit(0);
