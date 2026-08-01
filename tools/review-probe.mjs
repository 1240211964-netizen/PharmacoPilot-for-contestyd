#!/usr/bin/env node
/**
 * 单卡验证探针 · 学科审校是否"真的在读稿件"
 * ---------------------------------------------------------------
 * 目的：验证一个假设——把当前实践包原文交给模型，它能否产出
 *       **锚定到具体段落**的审校批注（而不是像现在这样按章节背固定台词）。
 *
 * 为什么直连模型而不走后端 /api：本轮 practice-detail.html / practice-runtime.js /
 * practice-runtime-contract.js / verify-practice-review.mjs 正在被并行修改，
 * 探针刻意只新增文件、不改任何现有文件。生产集成应改走后端已有的
 * TEACHING_AGENTS + /api/chat 通道（那层已建好且有测试）。
 *
 * 用法：
 *   node tools/review-probe.mjs                 # 用内置的当前实践包跑一次
 *   node tools/review-probe.mjs --edited        # 用"教师改写过的"稿件再跑一次（对照）
 *   node tools/review-probe.mjs --json          # 只输出 JSON（供样张页引用）
 */
import { writeFileSync } from "node:fs";

const BASE = process.env.PHARMACO_MODEL_BASE_URL || "http://127.0.0.1:8080/v1";
const MODEL = process.env.PHARMACO_MODEL_NAME || "mlx-community/Qwen3.5-9B-4bit";

// ── 被审校的稿件：取自运行时真实实践包（第 5 章 · 集采制度）────────────
const PACK = {
  env02: "目标：辨析集采规则与临床替代的冲突点 · 量规核心：证据链完整性 · 角色扮演代入感",
  env04: "待核实来源：具体省份集采执行细则 · 待核实来源：某仿制药临床替代率数据 · 待核实来源：医院药事会最新会议纪要",
  env05: "情境导入：模拟医保局发布某品种集采结果 · 任务指令：分组扮演医院、患者、药企制定替代方案 · 输出要求：列出替代优先级及理由",
  env07: "评价维度：政策理解准确度 · 利益平衡合理性 · 临床思维逻辑性 · 产出物：各小组替代方案书 · 评价方式：小组互评 + 教师点评",
};

// 对照组：教师把 env05 改写成"已有分层问题链 + 已含医保局角色"的版本。
// 若批注真的在读稿件，这一版应当得到**不同的**批注；固定种子做不到这一点。
const PACK_EDITED = {
  ...PACK,
  env05:
    "情境导入：模拟医保局发布某品种集采结果，同步给出中选价与原研价对照表 · "
    + "问题链：Q1 你先注意到药价、厂家还是患者反应？ Q2 药事委员会会如何排序？ Q3 若你是用原研 2 年的慢病患者是否接受替代？ · "
    + "任务指令：分组扮演医院、患者、药企、医保局四方，围绕是否推进替代展开对抗性讨论 · "
    + "输出要求：列出替代优先级及理由，形成 250 字采购建议书",
};

const CONTEXT = {
  course: "药事管理", classTitle: "2026 级 · 32 人", durationMinutes: 45,
  chapter: "第 5 章 · 集采制度", topic: "集采后仿制药替代",
};

// ── 学科审校提示词（教学设计视角）────────────────────────────────────
// 与后端 TEACHING_AGENTS 同源思路：限定学科视角、禁止虚构、要求可执行。
// 增量在于强制锚定：必须回填被评论的原文摘录，否则批注无法定位。
const SYSTEM = `你是 PharmacoPilot 的教学设计审校，只从课程与评价的视角审阅教师的课堂实践包。
依据 OBE、UbD、建设性对齐与 ICAP 审视：学习目标、问题链认知层级、评价证据与量规的对齐关系。

严格要求：
1. 只针对教师**实际写下的内容**提出问题，不得虚构稿件中不存在的句子。
2. 必须锚定：sourceExcerpt 必须是 targetEnv 原文中**逐字出现**的片段（复制粘贴，不要改写）。
3. 不堆砌理论名词，给出可直接落到课堂的修订动作。
4. 资料不足时写"待核实来源"，不要自行补齐政策条文或数据。

只输出 JSON，不要任何解释或代码块标记：
{
  "targetEnv": "env05",
  "segmentKey": "情境导入|问题链|任务指令|输出要求 中最贴切的一个",
  "sourceExcerpt": "被评论的原文片段（逐字复制）",
  "issue": "问题是什么（40 字以内）",
  "suggestion": "怎么改（80 字以内，可直接执行）",
  "alsoAffects": ["env02"]
}`;

function buildUserPrompt(pack) {
  return `课程：${CONTEXT.course}｜班级：${CONTEXT.classTitle}｜课时：${CONTEXT.durationMinutes} 分钟
章节：${CONTEXT.chapter}｜主题：${CONTEXT.topic}

【本次审校对象】env05 任务链设计：
${pack.env05}

【上下文（仅供判断对齐关系，不要直接评论）】
env02 目标与量规：${pack.env02}
env04 案例与证据：${pack.env04}
env07 评价与画像：${pack.env07}`;
}

function extractJson(text) {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) {
      try { return JSON.parse(text.slice(start, i + 1)); } catch { return null; }
    }
  }
  return null;
}

async function review(pack, label) {
  const started = Date.now();
  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL, temperature: 0.2, max_tokens: 700,
      messages: [{ role: "system", content: SYSTEM }, { role: "user", content: buildUserPrompt(pack) }],
    }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) throw new Error(`模型返回 ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const payload = await res.json();
  const raw = payload?.choices?.[0]?.message?.content || "";
  const parsed = extractJson(raw);
  const latency = Math.round((Date.now() - started) / 100) / 10;

  // ── 锚定校验：这是整个验证的核心断言 ──
  const excerpt = parsed?.sourceExcerpt?.trim() || "";
  const anchored = !!excerpt && pack[parsed?.targetEnv || "env05"]?.includes(excerpt);

  return {
    label, latencySec: latency, ok: !!parsed, anchored,
    annotation: parsed,
    manuscript: pack.env05,
    rawIfUnparsed: parsed ? undefined : raw.slice(0, 300),
  };
}

const args = process.argv.slice(2);
const jsonOnly = args.includes("--json");
const runs = [];
runs.push(await review(PACK, "当前稿件"));
if (args.includes("--edited") || jsonOnly) runs.push(await review(PACK_EDITED, "教师改写后"));

if (jsonOnly) {
  writeFileSync("output/review-probe.json", JSON.stringify(runs, null, 2));
  console.log("written: output/review-probe.json");
} else {
  for (const r of runs) {
    console.log("\n" + "─".repeat(72));
    console.log(`【${r.label}】  ${r.latencySec}s   解析:${r.ok ? "ok" : "失败"}   锚定校验:${r.anchored ? "✓ 摘录在原文中" : "✗ 摘录不在原文中"}`);
    console.log("─".repeat(72));
    console.log("稿件：" + r.manuscript);
    if (r.annotation) {
      console.log(`\n  段落   ${r.annotation.segmentKey}`);
      console.log(`  摘录   「${r.annotation.sourceExcerpt}」`);
      console.log(`  问题   ${r.annotation.issue}`);
      console.log(`  建议   ${r.annotation.suggestion}`);
      console.log(`  连带   ${(r.annotation.alsoAffects || []).join(" / ") || "—"}`);
    } else {
      console.log("  未能解析出 JSON：" + r.rawIfUnparsed);
    }
  }
  console.log("");
}
