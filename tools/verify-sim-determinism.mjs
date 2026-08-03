#!/usr/bin/env node
/* 确定性验收（persona-v2-contract §9 · P0；§13 Metamorphic「固定 seed 三次一致」先行项）
 *
 * 判据：
 *   ① 同一 seedConfig 连跑 3 次，beat 序列序列化后 sha256 逐字节一致；
 *   ② 仅改 runSeed，beat 序列可区分。
 *
 * 做法：Node 最小 shim（window / fetch）直接执行引擎真源码，
 * 程序化 advanceSim 推进到 T_CAP（2700 仿真秒），不等真实时间、不起浏览器。
 * 用法：node tools/verify-sim-determinism.mjs
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import vm from "node:vm";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const agentsText = readFileSync(resolve(root, "shared/virtual-class-agents.json"), "utf8");

/* 最小浏览器 shim：引擎只用到 window 暴露与 fetch 画像 JSON */
globalThis.window = globalThis;
globalThis.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(agentsText)) });
vm.runInThisContext(readFileSync(resolve(root, "shared/mv-classroom-core.js"), "utf8"), { filename: "shared/mv-classroom-core.js" });

const MV = globalThis.MVCore;
if (!MV) { console.error("✗ 引擎未暴露 window.MVCore"); process.exit(1); }
await MV.loadAgents();
if (!MV.agentsReady()) { console.error("✗ 画像加载失败"); process.exit(1); }

function runOnce(seedConfig) {
  MV.reset(seedConfig);
  MV.advanceSim(MV.T_CAP);
  const beats = MV.beatsUpTo(MV.T_CAP);
  return {
    beats,
    sha: createHash("sha256").update(JSON.stringify(beats)).digest("hex"),
  };
}

console.log("verify-sim-determinism（persona-v2-contract §9）");
/* ① 同一 seedConfig × 3（seedString 须在首次 reset 后取值——reset 时才从画像 JSON 读取 version/simVersion 分量播种，reset 前显示的是默认初值） */
const first = runOnce();
const info = MV.getSeedInfo();
console.log(`seedString = ${info.seedString}`);
console.log(`seed       = fnv1a32 → ${info.seed}`);
console.log(`run#1 beats=${first.beats.length} sha256=${first.sha}`);
const runs = [first, ...[2, 3].map((i) => {
  const r = runOnce();
  console.log(`run#${i} beats=${r.beats.length} sha256=${r.sha}`);
  return r;
})];
const sameSeed = runs.every((r) => r.sha === runs[0].sha);

/* ② 仅改 runSeed */
const alt = runOnce({ runSeed: "run-1" });
console.log(`run#4 beats=${alt.beats.length} sha256=${alt.sha}   (runSeed: run-0 → run-1)`);
const diffSeed = alt.sha !== runs[0].sha;

if (sameSeed && diffSeed) {
  console.log("\n✓ 同 seed 三次逐字节一致；换 runSeed 结果可区分");
  process.exit(0);
}
if (!sameSeed) console.error("\n✗ 同一 seedConfig 三次运行哈希不一致 —— 仍有非种子随机源");
if (!diffSeed) console.error("\n✗ 改 runSeed 后哈希未变 —— seedConfig 未真正接入随机流");
process.exit(1);
