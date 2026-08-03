#!/usr/bin/env node
/* L3 学习轨迹 → 关键时刻（KM）候选 · 消费者证明（persona-v2-contract §14 P3）
 *
 * 契约 P3 验收：「L3 字段（learningTrace）无消费者证明 = P3 不通过」。
 * 最终 UI 消费者（practice-detail.html 派生 KM 面板）由并行会话冻结，
 * 故本 harness 在数据侧跑通「引擎事件 → deep 学生 learningTrace → KM 候选」链路：
 *
 *   ① 引擎实跑到 T_CAP，deep 学生（enrichmentPlan.learningTraceDepth≥2）积累轨迹，
 *      light 学生轨迹保持为空（深度分层生效）；
 *   ② MVCore.learningTraceMoments() 从轨迹派生 KM 候选 ≥1 条，
 *      每条候选的 evidence 必须引用真实轨迹条目（消费者不是空转）；
 *   ③ 同 seed 两次运行，轨迹与 KM 候选逐字节一致（确定性）。
 *
 * UI 接线登记 PENDING：practice-detail.html 解禁后，deriveKeyMoments 侧读取
 * learningTraceMoments() 并入 state.keyMoments（owner = 页面解禁后任务）。
 *
 * 用法：node tools/prove-learning-trace-km.mjs
 * 退出码：全过 = 0；任一失败 = 1。
 */
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const agentsText = readFileSync(resolve(root, "shared/virtual-class-agents.json"), "utf8");

globalThis.window = globalThis;
globalThis.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(agentsText)) });
vm.runInThisContext(readFileSync(resolve(root, "shared/mv-classroom-core.js"), "utf8"), { filename: "shared/mv-classroom-core.js" });

const MV = globalThis.MVCore;
if (!MV) { console.error("✗ 引擎未暴露 window.MVCore"); process.exit(1); }
await MV.loadAgents();

const failures = [];
console.log("prove-learning-trace-km（persona-v2-contract §14 P3 · L3 消费者证明）");
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

function runOnce() {
  MV.reset();
  MV.advanceSim(MV.T_CAP);
  const plan = MV.enrichmentPlan();
  const traces = {};
  for (const id of Object.keys(plan.students)) {
    const rt = MV.rtOf(id);
    traces[id] = (rt.learningTrace || []).map((e) => ({ ...e }));
  }
  return { plan, traces, moments: MV.learningTraceMoments() };
}

const r1 = runOnce();

/* ① 深度分层：deep 有轨迹、light 全空 */
check("① 深度分层：deep 学生（learningTraceDepth=2）积累轨迹，light 学生轨迹为空", () => {
  const deepIds = Object.keys(r1.plan.students).filter((id) => r1.plan.students[id].learningTraceDepth >= 2);
  if (deepIds.length !== 8) fail(`deep 学生数 ${deepIds.length} ≠ 8（top8 配置未生效）`);
  const withTrace = deepIds.filter((id) => r1.traces[id].length > 0);
  if (withTrace.length === 0) fail("deep 学生无一积累轨迹（L3 生产未接通）");
  const lightWithTrace = Object.keys(r1.plan.students).filter((id) => r1.plan.students[id].learningTraceDepth < 2 && r1.traces[id].length > 0);
  if (lightWithTrace.length) fail(`light 学生出现轨迹：${lightWithTrace.join(",")}（深度分层泄漏）`);
  console.log(`      deep ${withTrace.length}/${deepIds.length} 人有轨迹，共 ${withTrace.reduce((s, id) => s + r1.traces[id].length, 0)} 条；light 全空 ✓`);
});

/* ② 消费链路：轨迹 → KM 候选 ≥1，evidence 引用真实轨迹条目 */
check("② 消费者接通：learningTraceMoments() 派生 KM 候选 ≥1 且 evidence 可溯源", () => {
  const ms = r1.moments;
  if (!ms.length) fail("KM 候选为 0（轨迹 → KM 派生链断裂）");
  ms.forEach((m) => {
    if (!Array.isArray(m.evidence) || !m.evidence.length) fail(`候选 ${m.type}@${m.t} 无 evidence`);
    if (!m.who || !(m.who in r1.traces)) fail(`候选 ${m.type}@${m.t} who=${m.who} 不在学生集`);
    const owned = new Set(r1.traces[m.who].map((e) => `${e.t}|${e.event}|${e.concept}`));
    m.evidence.forEach((ev) => {
      if (!owned.has(`${ev.t}|${ev.event}|${ev.concept}`)) fail(`候选 ${m.type}@${m.t} evidence ${ev.event}@${ev.t} 不是 ${m.who} 的真实轨迹条目`);
    });
  });
  ms.forEach((m) => console.log(`      KM ${m.t} ${m.type} ${m.who}（${m.concept}）`));
});

/* ③ 确定性：两次运行轨迹与候选逐字节一致 */
check("③ 同 seed 两次运行：learningTrace 与 KM 候选逐字节一致", () => {
  const r2 = runOnce();
  if (JSON.stringify(r1.traces) !== JSON.stringify(r2.traces)) fail("learningTrace 两次运行不一致");
  if (JSON.stringify(r1.moments) !== JSON.stringify(r2.moments)) fail("KM 候选两次运行不一致");
});

if (failures.length) {
  console.error(`\n✗ ${failures.length} 条断言失败 —— P3 L3 消费者证明不通过`);
  process.exit(1);
}
console.log("\nL3 消费者证明通过（轨迹生产 → KM 候选派生链路跑通；UI 接线 PENDING 登记于报告）");
process.exit(0);
