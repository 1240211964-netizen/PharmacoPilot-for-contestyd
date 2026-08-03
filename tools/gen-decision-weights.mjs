#!/usr/bin/env node
/* _meta._decision_weights 生成器（persona-v2-contract §11 · P0）
 * 主从：代码为准。从 shared/mv-classroom-core.js 的 scoreDesire 源码常量
 * 解析权重，重写画像 JSON 的 _meta._decision_weights；
 * _meta 其余 key 与文件其余文本逐字节保留（外科手术式替换，2 空格缩进）。
 *
 * 纪律：禁止在本文件手抄数值 —— 任一常量解析失败必须报错退出，不得静默写盘。
 * 用法：node tools/gen-decision-weights.mjs [--check]
 *   默认    重写 JSON 到位
 *   --check 只比对不写盘，漂移时 exit 1
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENGINE = resolve(root, "shared/mv-classroom-core.js");
const AGENTS_JSON = resolve(root, "shared/virtual-class-agents.json");

/* 从引擎源码解析 scoreDesire 权重。返回固定键序对象（序列化即稳定输出）。 */
export function deriveDecisionWeights(source) {
  const grab = (re, label) => {
    const m = source.match(re);
    if (!m) throw new Error(`scoreDesire 权重解析失败：${label}（引擎源码结构变了？请同步更新生成器）`);
    const n = Number(m[1]);
    if (!Number.isFinite(n)) throw new Error(`scoreDesire 权重解析异常：${label} → ${m[1]}`);
    return n;
  };
  return {
    speak_motivation: grab(/rt\.speak_motivation \* ([\d.]+)/, "speak_motivation 系数"),
    attention: grab(/rt\.attention \* ([\d.]+)/, "attention 系数"),
    social_safety: grab(/rt\.social_safety \* ([\d.]+)/, "social_safety 系数"),
    fatigue: -grab(/- rt\.fatigue \* ([\d.]+)/, "fatigue 系数"),
    rules_speak_on_bonus: grab(/rules\.speak_on, ctx\)\) s \+= ([\d.]+)/, "speak_on 规则命中加分"),
    ally_recent_bonus: grab(/allySpoke >= allyTh\) s \+= ([\d.]+)/, "盟友近期发言加分（阈值接线后）"),
    rival_recent_bonus: grab(/>= rebutTh\) s \+= ([\d.]+)/, "对手近期发言加分（阈值接线后）"),
    speak_threshold: grab(/top\.score < ([\d.]+)\) return null/, "发言阈值"),
  };
}

/* 权重对象 → 文件内嵌块（键在 6 空格层，与 _meta 既有块同款缩进） */
function renderBlock(weights) {
  const pad = "    "; // _decision_weights 键本身在 4 空格层
  const body = JSON.stringify(weights, null, 2)
    .split("\n")
    .map((line, i) => (i === 0 ? line : pad + line))
    .join("\n");
  return `"_decision_weights": ${body}`;
}

const BLOCK_RE = /"_decision_weights": \{[^{}]*\}/;

function main() {
  const checkOnly = process.argv.includes("--check");
  const weights = deriveDecisionWeights(readFileSync(ENGINE, "utf8"));
  const text = readFileSync(AGENTS_JSON, "utf8");
  if (!BLOCK_RE.test(text)) {
    console.error("✗ 画像 JSON 中未找到 _meta._decision_weights 块（或块内出现嵌套，需人工处理）");
    process.exit(1);
  }
  const next = text.replace(BLOCK_RE, renderBlock(weights));
  if (next === text) {
    console.log("✓ _meta._decision_weights 与引擎常量一致，无需更新");
    return;
  }
  if (checkOnly) {
    console.error("✗ _meta._decision_weights 与引擎常量漂移：运行 node tools/gen-decision-weights.mjs 重新生成");
    process.exit(1);
  }
  writeFileSync(AGENTS_JSON, next, "utf8");
  console.log("✓ 已从 mv-classroom-core.js 常量重写 _meta._decision_weights：");
  for (const [k, v] of Object.entries(weights)) console.log(`    ${k}: ${v}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main();
}
