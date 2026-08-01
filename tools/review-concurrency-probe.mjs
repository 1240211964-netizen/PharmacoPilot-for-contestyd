#!/usr/bin/env node
/**
 * 五路学科审校并发探针
 *
 * 只直连本机 MLX 的 OpenAI-compatible endpoint，用于测量：
 * - 五个请求同时发出时，各卡首 token 到达时间；
 * - 各卡完整结束时间；
 * - 五路总墙钟时间；
 * - 主摘录与跨环节引用是否能通过逐字锚定校验。
 *
 * 本文件仅验证模型服务能力，不代表生产集成。生产实现仍应走后端 /api/chat。
 */

const BASE = process.env.PHARMACO_MODEL_BASE_URL || "http://127.0.0.1:8080/v1";
const MODEL = process.env.PHARMACO_MODEL_NAME || "mlx-community/Qwen3.5-9B-4bit";

const PACK = Object.freeze({
  env02: "目标：辨析集采规则与临床替代的冲突点 · 核心评价维度：证据链完整性 · 角色扮演代入感",
  env04: "待核实来源：具体省份集采执行细则 · 待核实来源：某仿制药临床替代率数据 · 待核实来源：医院药事会最新会议纪要",
  env05: "情境导入：模拟医保局发布某品种集采结果 · 任务指令：分组扮演医院、患者、药企制定替代方案 · 输出要求：列出替代优先级及理由",
  env07: "评价维度：政策理解准确度 · 利益平衡合理性 · 临床思维逻辑性 · 产出物：各小组替代方案书 · 评价方式：小组互评 + 教师点评",
});

const PERSPECTIVES = Object.freeze([
  ["药学情境", "从临床药学、患者用药连续性与药师决策场景审校，不得补写稿件中没有的临床事实。"],
  ["管理决策", "从医院药事管理、医保支付、利益相关方权衡与决策责任审校。"],
  ["法规合规", "从法规来源、发文主体、年份、文号、时效与适用范围审校，不得伪造条文。"],
  ["教学设计", "依据 OBE、UbD、建设性对齐与 ICAP，审校目标、活动、证据和评价是否对齐。"],
  ["数据循证", "从数据来源、指标口径、可验证性与真实世界证据适用性审校，不得编造统计数字。"],
]);

const MANUSCRIPT = Object.entries(PACK).map(([key, text]) => `${key}：${text}`).join("\n");

function systemPrompt(label, lens) {
  return `你是 PharmacoPilot 的${label}审校。${lens}

严格要求：
1. 只评论稿件实际存在的内容；sourceExcerpt 必须逐字复制自 targetEnv 原文。
2. 如需引用其他环节，只能放进 crossReferences；每条必须给出正确 envKey 和逐字原文摘录。
3. 不得把某个环节的内容说成来自另一个环节。没有可靠交叉引用时返回空数组。
4. 给出一条最重要且可直接执行的修订动作，不堆砌术语。
5. 只输出 JSON，不要解释或代码围栏：
{
  "targetEnv": "env02|env04|env05|env07",
  "segmentKey": "被评论段落的短标签",
  "sourceExcerpt": "逐字原文摘录",
  "issue": "40 字以内",
  "suggestion": "80 字以内",
  "crossReferences": [{"envKey":"env02","sourceExcerpt":"逐字原文摘录"}]
}`;
}

function userPrompt() {
  return `课程：药事管理｜班级：2026 级 · 32 人｜课时：45 分钟
章节：第 5 章 · 集采制度｜主题：集采后仿制药替代

【本次完整稿件】
${MANUSCRIPT}`;
}

function extractJson(text) {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index++) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{") depth++;
    else if (char === "}" && --depth === 0) {
      try { return JSON.parse(text.slice(start, index + 1)); }
      catch { return null; }
    }
  }
  return null;
}

function validateAnchors(annotation) {
  const targetText = PACK[annotation?.targetEnv];
  const excerpt = annotation?.sourceExcerpt?.trim() || "";
  const primary = !!targetText && !!excerpt && targetText.includes(excerpt);
  const references = Array.isArray(annotation?.crossReferences) ? annotation.crossReferences : [];
  const crossReferenceChecks = references.map((reference) => {
    const referenceText = PACK[reference?.envKey];
    const referenceExcerpt = reference?.sourceExcerpt?.trim() || "";
    return {
      envKey: reference?.envKey || "",
      excerpt: referenceExcerpt,
      anchored: !!referenceText && !!referenceExcerpt && referenceText.includes(referenceExcerpt),
    };
  });
  return { primary, crossReferenceChecks, all: primary && crossReferenceChecks.every((item) => item.anchored) };
}

function seconds(started, ended = performance.now()) {
  return Math.round((ended - started) / 100) / 10;
}

async function streamReview([label, lens]) {
  const started = performance.now();
  const response = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.1,
      max_tokens: 420,
      stream: true,
      messages: [
        { role: "system", content: systemPrompt(label, lens) },
        { role: "user", content: userPrompt() },
      ],
    }),
    signal: AbortSignal.timeout(300_000),
  });
  if (!response.ok) throw new Error(`${label}返回 ${response.status}: ${(await response.text()).slice(0, 200)}`);
  if (!response.body) throw new Error(`${label}未返回流式响应体`);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let firstTokenSec = null;
  let finished = false;

  while (!finished) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const events = buffer.split("\n\n");
    buffer = events.pop() || "";
    for (const event of events) {
      for (const line of event.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") { finished = true; break; }
        if (!data) continue;
        let payload;
        try { payload = JSON.parse(data); } catch { continue; }
        const delta = payload?.choices?.[0]?.delta?.content || "";
        if (delta && firstTokenSec === null) firstTokenSec = seconds(started);
        content += delta;
      }
      if (finished) break;
    }
    if (done) break;
  }

  const annotation = extractJson(content);
  return {
    label,
    firstTokenSec,
    totalSec: seconds(started),
    chars: content.length,
    parsed: !!annotation,
    anchors: validateAnchors(annotation),
    annotation,
  };
}

const overallStarted = performance.now();
const settled = await Promise.allSettled(PERSPECTIVES.map(streamReview));
const wallSec = seconds(overallStarted);
const results = settled.map((item, index) => item.status === "fulfilled"
  ? item.value
  : { label: PERSPECTIVES[index][0], error: String(item.reason?.message || item.reason) });

console.log(JSON.stringify({
  model: MODEL,
  mode: "five-concurrent-streaming",
  wallSec,
  startedAt: new Date().toISOString(),
  results,
}, null, 2));
