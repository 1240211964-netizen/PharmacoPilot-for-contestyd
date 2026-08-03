#!/usr/bin/env node
/* ============================================================
 *  P4a · Qwen 离线语料重生成（staging）· gen-corpus-qwen.mjs
 *
 *  三段式流程之 staging 段：按画像重生成 responses.* 语料，
 *  产出 migration/persona-v2-corpus-staging.json；不改画像 JSON、
 *  不升版本、不冻结——用户抽检签收后才入库（P4b）。
 *
 *  用法：
 *    node tools/gen-corpus-qwen.mjs                  # dry-run（默认）：打印计划 + 样例 prompt，不联网
 *    node tools/gen-corpus-qwen.mjs --run            # 实跑生成 → 写 staging（串行限速，重试 3 次）
 *    node tools/gen-corpus-qwen.mjs --validate       # 结构校验 + 画像一致性检查（读 staging）
 *    node tools/gen-corpus-qwen.mjs --behavior-proof # 行为预证：内存替换跑 MVCore，beat 签名须逐字节不变
 *
 *  调用纪律（复用 server/model-client.mjs 的纪律：超时 AbortSignal、非 200 即错）：
 *    endpoint 直打 http://127.0.0.1:8080/v1/chat/completions（OpenAI 兼容，不经过业务路由）；
 *    temperature=0；串行请求 + 250ms 间隔；失败重试 3 次后标记 failed（绝不静默跳过）。
 * ============================================================ */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import crypto from "node:crypto";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const AGENTS_PATH = resolve(ROOT, "shared/virtual-class-agents.json");
const STAGING_PATH = resolve(ROOT, "migration/persona-v2-corpus-staging.json");
const ENDPOINT = "http://127.0.0.1:8080/v1/chat/completions";
const MODEL = "mlx-community/Qwen3.5-9B-4bit";
const TEMPERATURE = 0;
const MAX_TOKENS = 512;
const TIMEOUT_MS = 120_000;
const RETRY = 3;
const GAP_MS = 250;
const LESSON_ID = "mp-ch3-environment"; // 默认课（sim 基线场景 swot-huakang-chronic 所属课）

const FORBIDDEN_WORDS = ["\u91cf\u89c4"]; // 退休评价术语（转义写法防 verify-terminology 自伤）

/* ---- 43 键语义表（情境 + 语域）。register: public=全班可闻 / private=私下·内心·书面 ---- */
const KEY_SEM = {
  anchor_argument: { sem: "全班面前抛出引爆讨论的核心论点（一针见血、带锋芒）", reg: "public" },
  case: { sem: "用亲历/家庭案例支撑自己观点（全班发言）", reg: "public" },
  case_data: { sem: "引用具体数据化案例证据（全班发言）", reg: "public" },
  case_support: { sem: "用亲历案例补强同盟的论点（全班发言）", reg: "public" },
  clarifying_question: { sem: "没听懂时向全班/教师提出的澄清概念提问（坦诚、不装懂）", reg: "public" },
  concession: { sem: "承认对方部分有理的让步发言（但保留自己的核心立场）", reg: "public" },
  domain_point: { sem: "陈述一个自己熟悉领域的专业知识点（全班发言）", reg: "public" },
  evidence_supply: { sem: "补充一条具体证据（数据/文件/事实）支持当前讨论（全班发言）", reg: "public" },
  forced_silent_break: { sem: "被打断/冷场后被迫简短表态（一句话、附议式）", reg: "public" },
  if_anonymous_channel: { sem: "只敢在匿名提问通道里说的话（私下书面，不是全班发言）", reg: "private" },
  if_called: { sem: "被教师点名后的回应（被动、简短、有点措手不及）", reg: "public" },
  if_called_by_teacher: { sem: "被教师点名后终于说出的观点（平时沉默，被点才敢讲，语气略拘谨）", reg: "public" },
  if_called_uncertain: { sem: "被点名后低确定性的短回应（磕巴、自我怀疑、说一半让步，如'我……补一句行吗''可能只说对一半'）", reg: "public" },
  if_finally_called: { sem: "憋了整节课终于被点到时的回应（终于有机会、一口气说出但克制）", reg: "public" },
  if_nudged: { sem: "被同桌/教师轻推后才说的极短一句（附议式、几个字到一句话）", reg: "public" },
  if_regulatory_slot_exists: { sem: "如果课堂有'监管视角'发言槽位才会说的话（私下书面陈述）", reg: "private" },
  intended: { sem: "心里想好但没说出口的观点（内心独白）", reg: "private" },
  intended_but_hidden: { sem: "刻意隐藏不说的真实想法（怕暴露利益/身份，内心独白）", reg: "private" },
  intended_but_not_said: { sem: "几次想说最终没说出口的话（内心独白）", reg: "private" },
  internal_monologue: { sem: "边听边在心里的吐槽/分析（内心独白，最诚实）", reg: "private" },
  late_reflection: { sem: "课程尾声的反思性发言（语气沉淀下来，总结自己学到的）", reg: "public" },
  post_class_action: { sem: "课后的实际行动（一句话描述行为，如'在班级群发了一段文字'）", reg: "private" },
  private: { sem: "只在小组/私下嘀咕的话（口语、碎碎念）", reg: "private" },
  private_to_ally: { sem: "私下只对信任的同盟说的悄悄话", reg: "private" },
  private_to_neighbor: { sem: "低声对同桌说的话（30 秒低声交流的体量）", reg: "private" },
  proposal: { sem: "提出具体可操作的建议/方案（全班发言，建设性）", reg: "public" },
  question: { sem: "向对方阵营或全班提出的追问（全班发言）", reg: "public" },
  question_other: { sem: "针对他人发言的证据核查式提问（全班发言）", reg: "public" },
  rallying: { sem: "整合己方论据、给同盟定调的发言（量化、有煽动性但克制）", reg: "public" },
  rebuttal: { sem: "直接反驳对方论点（全班发言）", reg: "public" },
  reflection_sheet: { sem: "写在反思单上的话（书面、诚实、比口头敢说）", reg: "private" },
  report_read: { sem: "代表小组念报告稿（念稿口吻、不是自己的观点）", reg: "public" },
  report_text_written: { sem: "写进小组报告稿但没念出来的段落（书面）", reg: "private" },
  rhetorical_question: { sem: "反问句（带情绪张力、把问题抛回给对方，全班发言）", reg: "public" },
  situational: { sem: "从自己的日常经验/工作场景出发的情境化补充（全班发言）", reg: "public" },
  small_group: { sem: "小组讨论内说的话（比全班发言放松、可以说得深）", reg: "private" },
  small_group_contrib: { sem: "对小组报告的实际贡献（一句话描述，可带'没被采用'的委屈）", reg: "private" },
  technical: { sem: "技术性陈述（药理/制剂/临床术语准确，全班发言）", reg: "public" },
  technical_rebuttal: { sem: "用技术细节反驳对方（药理/数据层面，全班发言）", reg: "public" },
  to_C1_private: { sem: "低声回应 C1 的私下搭话（小组内、口语）", reg: "private" },
  to_open_question: { sem: "回应教师开放性提问的发言（主动接话、亮出视角）", reg: "public" },
  to_rival: { sem: "直接对立场对手说的话（先礼后兵、有交锋感）", reg: "public" },
  to_teacher: { sem: "直接向教师提的问题或纠偏（礼貌但敢问）", reg: "public" },
};

/* ---- 画像 → prompt ---- */
function f3Orientation(a) {
  const v = a.latentFactors && a.latentFactors.F3 && a.latentFactors.F3.value;
  if (typeof v !== "number") return "居中";
  return v >= 0.55 ? "证据型（习惯引用数据/文件/事实）" : v <= 0.45 ? "经验型（习惯从亲历/场景/感受出发）" : "证据与经验混合";
}

function personaBlock(a, actDir) {
  const p = a.persona || {}, k = a.knowledge || {};
  const ev = (a.historyEvents || []).map((e) => e.tags.slice(0, 3).join("/")).join("；");
  const sil = (a.silenceCauses || []).join("、");
  const act = actDir > 0
    ? "正向（本课情境激活了他/她的相关经历：发言意愿略升，可适度偏向证据式表达）"
    : actDir < 0
      ? "负向（本课议题触碰其敏感经历：表达更短、更保留、更克制，不要慷慨激昂）"
      : "中性（本课议题与其经历无强关联）";
  return [
    `学生：${a.identity.alias}（${a.identity.demo}），学号 ${a.identity.sid}`,
    `核心立场：${p.belief || "无明确立场"}`,
    `内心顾虑：${p.doubt || "无"}`,
    `自我定位：${p.self || "普通学生"}；表达风格：${p.style || "普通"}${(p.tics || []).length ? "；口头禅：" + p.tics.join("、") : ""}`,
    `认识论取向：${f3Orientation(a)}`,
    `知识储备（自信）：${(k.confident || []).join("、") || "一般课程知识"}`,
    `知识短板（不要让他/她引用这些）：${(k.weak || []).join("、") || "无特别标注"}`,
    `经历锚点：${(k.anchors || []).join("；") || ev || "无"}`,
    sil ? `沉默因果：${sil}（除非键语义本身是"被点名/私下"，否则不要生成主动长篇大论）` : null,
    `本课（集采后仿制药替代讨论）对其激活方向：${act}`,
  ].filter(Boolean).join("\n");
}

const PROMPT_TEMPLATE = `你是药学本科课堂模拟的语料撰写器。根据学生画像，为指定发言情境撰写 {N} 条候选语料。

【学生画像】
{PERSONA}

【发言情境】{KEY_SEM}
【课程背景】《药事管理》课堂讨论：集采后仿制药替代（原研药降价 87%，医保视角 vs 慢病家属视角交锋中）。

要求：
1. 每条都是这名学生会说的话，第一人称、口语化，符合其风格与顾虑；
2. {LEN_RULE}
3. 事实不得超出其知识储备与经历锚点；药学/医保术语要准确；
4. {N} 条之间措辞与角度要有差异；
5. 文本内部如需引用或强调，一律用「」，严禁使用英文双引号 " ；
6. 禁止引用任何法规/文件文号（如「国办发〔2019〕2 号」这类），除非该文号逐字出现在上方知识储备里；
7. 严格输出 JSON：{"lines": ["...", "..."]}，恰好 {N} 条，不要输出任何其他文字。`;

/* P4b 用户裁决（2026-08-03）打回重生成的 7 键：逐键定向约束（形式/方向约束，不代写内容） */
const REGEN_CONSTRAINTS = {
  "A1.question_other": "必须是针对对方证据的核查式【问句】（以问号收尾），不得写成陈述句；每条 ≤40 字",
  "A6.situational": "保持你的真实观察方向：集采药上架后，老人主动指名要买的反而多了——不得反转为患者拒绝仿制药；每条 ≤35 字",
  "B2.case_data": "必须给出量化数据（院方记录级别的具体数字，如几个月内几例 INR 失控），不得降级为单例轶事；每条 ≤38 字，超过就删减修饰语",
  "D3.if_called": "突出「基层行政成本」洞察（通知患者、贴药袋、重新建档这类没有工分的活），不要泛泛说工作量大；每条 ≤50 字",
  "D3.reflection_sheet": "书面语，不要「老师，」这类口语呼告；围绕「这堂课漏了基层执行成本这一维度」；每条 ≤45 字",
  "A1.forced_silent_break": "必须是附议别人刚说过的话（如「我同意 A2 说的」「A2 说得对」），不要自己提出新论据、不要「数据上」开头；纯附议 ≤12 字",
  "D5.if_nudged": "就说「我同意 B 组」这种 4-8 个字的纯附议，不要加任何理由或解释",
};
/* 极短键（语义就是一句话的体量）：生成与校验共用同一上限 */
const ULTRA_SHORT_MAX = 15;
const ULTRA_SHORT_KEYS = new Set(["if_nudged", "forced_silent_break"]);

function lenRule(key) {
  if (ULTRA_SHORT_KEYS.has(key)) return `每条 ≤${ULTRA_SHORT_MAX} 个汉字（这是"被迫/被轻推后的附议式短句"，越短越对）`;
  return "每条 8-55 个汉字（标点不计入硬性限制，但不要写长段）";
}

function buildPrompt(a, key, n, actDir) {
  let p = PROMPT_TEMPLATE.replaceAll("{N}", String(n))
    .replace("{PERSONA}", personaBlock(a, actDir))
    .replace("{KEY_SEM}", KEY_SEM[key] ? KEY_SEM[key].sem : key)
    .replace("{LEN_RULE}", lenRule(key));
  const extra = REGEN_CONSTRAINTS[`${a.id}.${key}`];
  if (extra) p += `\n8. 本键特别约束：${extra}。`;
  return p;
}

function personaBasis(a, key, actDir) {
  const bits = [`键语义=${KEY_SEM[key] ? KEY_SEM[key].reg : "?"}/${(KEY_SEM[key] || {}).sem || key}`];
  bits.push(`F3=${f3Orientation(a).slice(0, 3)}`);
  bits.push(actDir > 0 ? "激活=正向(证据倾向)" : actDir < 0 ? "激活=负向(更短更保留)" : "激活=中性");
  if ((a.silenceCauses || []).length) bits.push(`沉默因果=${a.silenceCauses.length}条`);
  return bits.join("；");
}

/* ---- 激活方向（复用 canonical 纯函数，与引擎同字节源） ---- */
function loadEnrich() {
  globalThis.window = globalThis;
  vm.runInThisContext(readFileSync(resolve(ROOT, "shared/enrich-activation.js"), "utf8"), { filename: "enrich-activation.js" });
  return globalThis.EnrichActivation;
}
function activationMap(data) {
  const EA = loadEnrich();
  const lesson = (data._meta.lessons || []).find((l) => l.lessonId === LESSON_ID);
  const tables = { proximity: data._meta.role_proximity_table.proximity, transferability: data._meta.transferability_table.by_type };
  const m = {};
  for (const a of data.agents) m[a.id] = EA.activationOf(a, lesson, tables);
  return m;
}

/* ---- 模型调用（超时/重试/标记纪律） ---- */
async function chatOnce(prompt) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify({ model: MODEL, messages: [{ role: "user", content: prompt }], temperature: TEMPERATURE, max_tokens: MAX_TOKENS, stream: false }),
  });
  if (!res.ok) throw new Error(`upstream ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const payload = await res.json();
  const content = payload.choices[0].message.content;
  if (process.env.PHARMA_CORPUS_DEBUG) console.error(`[debug raw]\n${content}\n[finish_reason=${payload.choices[0].finish_reason}]`);
  return content;
}
function parseLines(content, n) {
  const m = String(content).match(/\{[\s\S]*\}/);
  if (!m) throw new Error("输出不含 JSON 对象");
  try {
    const obj = JSON.parse(m[0]);
    if (!Array.isArray(obj.lines)) throw new Error("缺少 lines 数组");
    const lines = obj.lines.map((s) => String(s).trim()).filter(Boolean);
    if (lines.length !== n) throw new Error(`lines 数量 ${lines.length} ≠ 要求 ${n}`);
    return { lines, repaired: false };
  } catch (e) {
    // 容错：模型在文本内用了英文双引号、或漏掉收尾 ] }——按"引号后跟 , 或 ] 或全文结尾才是元素边界"重解
    const arr = m[0].match(/"lines"\s*:\s*\[([\s\S]*?)(?:\]\s*\}?)?$/);
    if (!arr) throw e;
    const parts = [...arr[1].matchAll(/"([\s\S]*?)"(?=\s*[,\]\}]|\s*$)/g)].map((x) => x[1].trim()).filter(Boolean);
    if (parts.length !== n) throw new Error(`${e.message}（容错重解也得 ${parts.length} 条 ≠ ${n}）`);
    return { lines: parts, repaired: true };
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---- 主流程 ---- */
function planOf(data) {
  const plan = [];
  for (const a of data.agents) {
    for (const [key, v] of Object.entries(a.responses || {})) {
      const isArr = Array.isArray(v);
      const n = isArr ? v.length : 1;
      // D2.if_called = "…" 是刻意的"无言以对"沉默回应——画像一致，原样保留不生成
      const preserve = isArr && v.length === 1 && v[0] === "…";
      plan.push({ id: a.id, key, n, shape: isArr ? `array[${n}]` : "string", old: v, preserve });
    }
  }
  return plan;
}

async function run() {
  const data = JSON.parse(readFileSync(AGENTS_PATH, "utf8"));
  const actMap = activationMap(data);
  const plan = planOf(data);
  const gen = plan.filter((p) => !p.preserve);
  // 断点续跑：staging 已存在时复用 status=generated/preserved 的条目（temperature=0 幂等），只重生成 failed/缺失
  const prev = existsSync(STAGING_PATH) ? JSON.parse(readFileSync(STAGING_PATH, "utf8")) : null;
  const reusable = (id, key) => {
    const e = prev && prev.students && prev.students[id] && prev.students[id].keys[key];
    return e && (e.status === "generated" || e.status === "preserved") ? e : null;
  };
  console.log(`计划：${plan.length} 个 (人,键) 对；生成 ${gen.length}，保留 ${plan.length - gen.length}（D2.if_called 省略号）${prev ? "· 续跑模式（复用已生成）" : ""}`);
  const staging = {
    provenance: {
      stage: "P4a-staging（未签收 · 未入库）",
      model: MODEL, endpoint: ENDPOINT, temperature: TEMPERATURE, maxTokens: MAX_TOKENS,
      timeoutMs: TIMEOUT_MS, retry: RETRY, gapMs: GAP_MS,
      lessonContext: LESSON_ID + "（激活方向来源课）",
      promptTemplate: PROMPT_TEMPLATE,
      generatedAt: new Date().toISOString(),
      resumedFrom: prev ? prev.provenance.generatedAt : null,
      script: "tools/gen-corpus-qwen.mjs",
    },
    students: {},
  };
  let ok = 0, failed = 0, retries = 0, reused = 0, repaired = 0;
  const t0 = Date.now();
  for (let i = 0; i < plan.length; i++) {
    const p = plan[i];
    const a = data.agents.find((x) => x.id === p.id);
    const dir = actMap[p.id].direction;
    const st = (staging.students[p.id] = staging.students[p.id] || { keys: {} });
    if (p.preserve) {
      st.keys[p.key] = { shape: p.shape, old: p.old, new: p.old, status: "preserved", personaBasis: "刻意沉默回应'…'，画像一致，原样保留" };
      continue;
    }
    const reuse = reusable(p.id, p.key);
    if (reuse) {
      reused++;
      st.keys[p.key] = reuse;
      continue;
    }
    const prompt = buildPrompt(a, p.key, p.n, dir);
    let parsed = null, err = null, attempts = 0;
    for (attempts = 1; attempts <= RETRY; attempts++) {
      try {
        parsed = parseLines(await chatOnce(prompt), p.n);
        err = null;
        break;
      } catch (e) {
        err = e;
        retries += attempts < RETRY ? 1 : 0;
        if (attempts < RETRY) await sleep(800 * Math.pow(2, attempts - 1));
      }
    }
    if (parsed) {
      ok++;
      if (parsed.repaired) repaired++;
      const lines = parsed.lines;
      st.keys[p.key] = { shape: p.shape, old: p.old, new: p.shape === "string" ? lines[0] : lines, status: "generated", attempts, repaired: parsed.repaired || undefined, personaBasis: personaBasis(a, p.key, dir) };
    } else {
      failed++;
      st.keys[p.key] = { shape: p.shape, old: p.old, new: null, status: "failed", attempts: RETRY, error: String(err && err.message || err), personaBasis: personaBasis(a, p.key, dir) };
      console.error(`  [failed] ${p.id}.${p.key}: ${err && err.message}`);
    }
    if ((i + 1) % 10 === 0) console.log(`  进度 ${i + 1}/${plan.length}（ok=${ok} failed=${failed} 复用=${reused}，已用 ${((Date.now() - t0) / 1000).toFixed(0)}s）`);
    await sleep(GAP_MS);
  }
  staging.provenance.stats = { pairs: plan.length, generated: ok, reusedFromPreviousRun: reused, repairedJson: repaired, preserved: plan.length - gen.length, failed, retries, elapsedSec: Math.round((Date.now() - t0) / 1000) };
  writeFileSync(STAGING_PATH, JSON.stringify(staging, null, 2) + "\n");
  console.log(`完成：ok=${ok} 复用=${reused} 容错修复=${repaired} failed=${failed} retries=${retries} 耗时 ${staging.provenance.stats.elapsedSec}s → ${STAGING_PATH}`);
}

function dryRun() {
  const data = JSON.parse(readFileSync(AGENTS_PATH, "utf8"));
  const actMap = activationMap(data);
  const plan = planOf(data);
  const texts = plan.reduce((s, p) => s + p.n, 0);
  console.log(`[dry-run] 不联网。计划：${plan.length} 个 (人,键) 对，共 ${texts} 条语料待生成（保留 1 条省略号）`);
  console.log(`端点 ${ENDPOINT} · model=${MODEL} · temperature=${TEMPERATURE} · 串行+${GAP_MS}ms 间隔 · 重试 ${RETRY} 次 · 超时 ${TIMEOUT_MS / 1000}s`);
  const keyCount = {}; plan.forEach((p) => { keyCount[p.key] = (keyCount[p.key] || 0) + 1; });
  console.log(`覆盖键 ${Object.keys(keyCount).length} 个`);
  const sample = plan.find((p) => p.id === "B1" && p.key === "case_support");
  const a = data.agents.find((x) => x.id === "B1");
  console.log(`\n===== 样例 prompt（B1.case_support，激活方向=${actMap.B1.direction}）=====\n${buildPrompt(a, "case_support", sample.n, actMap.B1.direction)}`);
  console.log("\n实跑：node tools/gen-corpus-qwen.mjs --run");
}

/* ---- 结构校验 + 画像一致性 ---- */
// P4b 打回重生成键的硬性规则（错误级；其余条目维持可疑级，尊重已签收状态）：
// 问句键必须成问句；禁止法规文号（除非文档原文逐字出现）；逐键方向/量化/语域约束。
const QUESTION_RE = /[？?]|吗|呢|什么|怎么|哪|是否|是不是|能否|要不要/;
const DOCNO_RE = /〔\s*\d{3,4}\s*〕|国办发|国药监|医保发|发改价格/;
const REGEN_MAXLEN = { "A1.question_other": 40, "A6.situational": 35, "B2.case_data": 40, "D3.if_called": 50, "D3.reflection_sheet": 45 };
const QUESTION_KEYS = new Set(["question", "question_other", "clarifying_question", "rhetorical_question", "to_teacher"]);
function validate() {
  const data = JSON.parse(readFileSync(AGENTS_PATH, "utf8"));
  const staging = JSON.parse(readFileSync(STAGING_PATH, "utf8"));
  const actMap = activationMap(data);
  const errors = [], warnings = [];
  const lens = [];
  for (const a of data.agents) {
    const oldKeys = Object.keys(a.responses || {}).sort();
    const st = staging.students[a.id];
    const newKeys = st ? Object.keys(st.keys).sort() : [];
    if (JSON.stringify(oldKeys) !== JSON.stringify(newKeys)) errors.push(`${a.id}: 键集合不一致 old=${oldKeys} new=${newKeys}`);
    for (const key of oldKeys) {
      const e = st && st.keys[key];
      if (!e) continue;
      if (e.status === "failed") { errors.push(`${a.id}.${key}: 生成失败（${e.error}）`); continue; }
      const nv = e.new;
      const texts = Array.isArray(nv) ? nv : [nv];
      const oldShape = Array.isArray(a.responses[key]) ? `array[${a.responses[key].length}]` : "string";
      if (e.shape !== oldShape) errors.push(`${a.id}.${key}: 形状 ${e.shape} ≠ 原 ${oldShape}`);
      if (Array.isArray(nv) !== Array.isArray(a.responses[key]) && e.shape !== "string") errors.push(`${a.id}.${key}: 数组/单串类型变了`);
      for (const t of texts) {
        if (typeof t !== "string" || !t.trim()) { errors.push(`${a.id}.${key}: 空串`); continue; }
        lens.push(t.length);
        if (t.length > 90) errors.push(`${a.id}.${key}: 超长 ${t.length} 字`);
        if (/\n/.test(t)) errors.push(`${a.id}.${key}: 含换行`);
        for (const w of FORBIDDEN_WORDS) if (t.includes(w)) errors.push(`${a.id}.${key}: 违禁词"${w}"`);
        if (/^\s*[-*•]\s/.test(t) || /^\d+[.、)]/.test(t)) warnings.push(`${a.id}.${key}: 疑似列表残留「${t.slice(0, 20)}…」`);
        if (/[{}\[\]"]/.test(t)) warnings.push(`${a.id}.${key}: 含 JSON 符号「${t.slice(0, 20)}…」`);
        if (e.status === "generated" && a.responses[key] && (Array.isArray(a.responses[key]) ? a.responses[key].includes(t) : a.responses[key] === t))
          warnings.push(`${a.id}.${key}: 新语料与旧语料逐字相同（模型复读了原文）`);
      }
      // 画像一致性启发式：有沉默因果的学生，public 键生成不审慎的长/激昂发言 → 可疑
      const sem = KEY_SEM[key];
      if (sem && sem.reg === "public" && (a.silenceCauses || []).length > 0 && e.status === "generated") {
        for (const t of texts) {
          if (t.length > 55) warnings.push(`${a.id}.${key}: 有沉默因果学生 public 键文本偏长（${t.length} 字）「${t.slice(0, 24)}…」`);
          if (/！|!/.test(t)) warnings.push(`${a.id}.${key}: 有沉默因果学生 public 键含感叹号，语气过激昂`);
        }
      }
      // 键语义一致性：极短键超长 → 可疑（打回重生成键为错误）
      if (ULTRA_SHORT_KEYS.has(key) && e.status === "generated") {
        for (const t of texts) {
          if (t.length > ULTRA_SHORT_MAX) {
            const msg = `${a.id}.${key}: 极短键语义（≤${ULTRA_SHORT_MAX} 字）被长文本违背（${t.length} 字）「${t.slice(0, 24)}…」`;
            if (REGEN_CONSTRAINTS[`${a.id}.${key}`]) errors.push(msg); else warnings.push(msg);
          }
        }
      }
      // 负向激活学生（sensitive 议题）：public 键应更短更保留 → 长文本可疑
      if (sem && sem.reg === "public" && e.status === "generated" && actMap[a.id].direction < 0) {
        for (const t of texts) if (t.length > 45) warnings.push(`${a.id}.${key}: 负向激活学生 public 键应更短更保留（${t.length} 字）「${t.slice(0, 24)}…」`);
      }
      // P4b 打回重生成键：硬性规则（错误级）
      const regenId = `${a.id}.${key}`;
      if (REGEN_CONSTRAINTS[regenId] && e.status === "generated") {
        for (const t of texts) {
          if (QUESTION_KEYS.has(key) && !QUESTION_RE.test(t)) errors.push(`${regenId}: 问句键未成问句「${t.slice(0, 30)}…」`);
          if (DOCNO_RE.test(t)) errors.push(`${regenId}: 含法规/文件文号（禁止引用非文档原文文号）「${t.slice(0, 30)}…」`);
          const cap = REGEN_MAXLEN[regenId];
          if (cap && t.length > cap) errors.push(`${regenId}: 超过逐键上限 ${cap} 字（${t.length} 字）`);
        }
        const joined = texts.join("");
        if (regenId === "A6.situational" && (/指名要原研|拒绝仿制|便宜药没效|不愿意买/.test(joined) || !/集采|仿制/.test(joined)))
          errors.push(`${regenId}: 立场方向与文档实录不符（应为"集采药上架后老人主动指名要的反而多了"）`);
        if (regenId === "B2.case_data" && !/\d/.test(joined)) errors.push(`${regenId}: 无量化数字（键语义=数据化案例证据）`);
        if (regenId === "D3.if_called" && !/基层|社区|工分|行政|建档|药袋/.test(joined)) errors.push(`${regenId}: 未体现基层行政成本洞察`);
        if (regenId === "D3.reflection_sheet" && /^老师[，,]/.test(joined)) errors.push(`${regenId}: 书面反思单不应以口语呼告开头`);
      }
    }
  }
  lens.sort((x, y) => x - y);
  console.log(`校验：${errors.length} 错误 / ${warnings.length} 可疑`);
  errors.forEach((e) => console.log("  [错误]", e));
  warnings.forEach((w) => console.log("  [可疑]", w));
  if (lens.length) console.log(`长度分布：min=${lens[0]} p50=${lens[Math.floor(lens.length / 2)]} p95=${lens[Math.floor(lens.length * 0.95)]} max=${lens[lens.length - 1]}（共 ${lens.length} 条）`);
  if (errors.length) process.exit(1);
}

/* ---- 行为预证：内存替换 responses → MVCore 重跑，beat 签名（t|who|respKey 序列）逐字节不变 ---- */
function signature(beats) {
  const seq = beats.map((b) => `${b.t}|${b.who}|${b.respKey || ""}`).join("\n");
  return crypto.createHash("sha256").update(seq).digest("hex");
}
async function behaviorProof() {
  const data = JSON.parse(readFileSync(AGENTS_PATH, "utf8"));
  const staging = JSON.parse(readFileSync(STAGING_PATH, "utf8"));
  const coreSrc = readFileSync(resolve(ROOT, "shared/mv-classroom-core.js"), "utf8");
  // 每轮独立 vm 上下文：MVCore.loadAgents 有模块级 AGENTS 缓存（core:199），
  // 同上下文跑两轮第二轮不会重新取数——独立上下文才能保证"换入语料真的进到引擎"。
  function freshMV(agentsData) {
    const sandbox = { console };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    sandbox.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(JSON.stringify(agentsData))) });
    vm.createContext(sandbox);
    vm.runInContext(coreSrc, sandbox, { filename: "shared/mv-classroom-core.js" });
    return sandbox.MVCore;
  }
  async function runWith(agentsData) {
    const MV = freshMV(agentsData);
    await MV.loadAgents();
    MV.reset();
    MV.advanceSim(MV.T_CAP);
    return MV.beatsUpTo(MV.T_CAP);
  }
  const base = await runWith(data);
  const baseSig = signature(base);
  // 内存替换（深拷贝，不碰磁盘 JSON）
  const swapped = JSON.parse(JSON.stringify(data));
  let changedTexts = 0;
  for (const a of swapped.agents) {
    const st = staging.students[a.id];
    if (!st) continue;
    for (const [key, e] of Object.entries(st.keys)) {
      if (e.status !== "generated") continue;
      const oldTxt = JSON.stringify(a.responses[key]);
      a.responses[key] = e.new;
      if (JSON.stringify(a.responses[key]) !== oldTxt) changedTexts++;
    }
  }
  const after = await runWith(swapped);
  const afterSig = signature(after);
  console.log(`替换 (人,键) 文本 ${changedTexts} 处（独立双 vm 上下文，防 loadAgents 缓存假象）`);
  console.log(`基线 beats=${base.length} sig=${baseSig}`);
  console.log(`换入 beats=${after.length} sig=${afterSig}`);
  if (base.length !== after.length || baseSig !== afterSig) {
    console.error("行为预证失败：beat 计数或 (t,who,respKey) 序列变了——结构被破坏，打回");
    process.exit(1);
  }
  // 换入必须真实可见：至少一条学生 beat 的文本变了（防"替换没进引擎"的哑通过）
  const baseTexts = base.filter((b) => b.role === "S").map((b) => b.text);
  const afterTexts = after.filter((b) => b.role === "S").map((b) => b.text);
  const diffN = baseTexts.filter((t, i) => t !== afterTexts[i]).length;
  console.log(`学生 beat 文本对照：${diffN}/${baseTexts.length} 条文本已替换`);
  if (diffN === 0) { console.error("行为预证失败：换入语料后无任何 beat 文本变化（替换未到达引擎，哑通过）"); process.exit(1); }
  console.log("行为预证通过：beat 计数与键选择序列逐字节不变（仅文本替换）");
}

const mode = process.argv.includes("--run") ? "run" : process.argv.includes("--validate") ? "validate" : process.argv.includes("--behavior-proof") ? "proof" : "dry";
if (mode === "run") await run();
else if (mode === "validate") validate();
else if (mode === "proof") await behaviorProof();
else dryRun();
