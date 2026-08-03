#!/usr/bin/env node
/* 画像契约校验（persona-v2-contract §13 · P0 骨架 + P1 点亮）
 *
 * P0 激活断言：
 *   (a) _meta.simVersion 存在且形如 sim-a.b.c（§10）
 *   (b) _meta._decision_weights 与 gen-decision-weights 从引擎源码的解析输出
 *       逐字节一致 —— 文档-代码一致（§11）
 *   (c) _meta._field_consumers 覆盖 field-map 审计的全部引擎实读字段，
 *       且 8 个装饰字段均带 §4 处置标注（铁律①④）
 *   (d) 源码扫描：mv-classroom-core.js / practice-runtime.js 不得出现
 *       switch(group) / if (tier / id <= N 式隐藏模板 / Math.random 调用（§0-11、§9）
 *   (e) 学生记录不得含 group / tier / archetype / segment 字段（§0-11 分组门禁）
 *   (f) 两引擎内嵌 SimRNG 副本与 shared/sim-rng.js 标记区逐字节一致（防双份漂移，P0 暂行方案）
 *
 * P1 激活断言：
 *   (g) historyEvents schema 全字段校验：每人 2–5 条；type 值域；id 形如 evt_NNN_MM
 *       且 NNN = 学号尾段、全班唯一；depth/recency ∈ [0,1]；durationMonths 为正数或 null；
 *       role ∈ role_vocab；tags/absentExposure ⊆ tag_vocab；sensitive 仅布尔（§5）
 *   (h) 每人 ≥1 个区分性事件（签名 type+context+role+tags 全班唯一，§13 个体级）
 *   (i) silenceCauses ∈ silence_cause_vocab，且 C1–C8/D1–D4 的 12 种契约沉默因果在册（§14 P1 细则）
 *   (j) migration/persona-v1-legacy-map.json 32/32 完整（A/B/C/D 唯一合法存放处，§0-11）
 *   (k) lessons.tags ⊆ tag_vocab；requiredRole ∈ role_vocab；role_proximity_table 与
 *       transferability_table 全覆盖且值域 [0,1]（§5/§7.1）
 *
 * P1b 激活断言（sim-1.1.0 行为变更批次）：
 *   (l) drama.events schema（t>0 数值；fx 键 ∈ 五状态字段、delta ∈ [-1,1]；why 非空），
 *       派生 SCHED 总条数 = 28（规范 26 + §15-1 C3/C6 点名 2 条，§8.2）
 *   (w) 班级发言分布软 warning：有效发言预算（硬沉默规则置零后的 speak_motivation）
 *       top8 占比 / bottom16 占比 / 偏度 / D 组取值互异（§15-3 重尾；打印不影响退出码）
 *
 * 其余 §13 断言以 PENDING 形式注册打印（注明点亮阶段），不影响退出码。
 * 退出码：激活断言全过 = 0；任一失败 = 1。
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { deriveDecisionWeights } from "./gen-decision-weights.mjs";
import { computeMetrics, applyApprovedAdjustments, deriveIntervention, FACTOR_IDS, ADJUST_LIMIT } from "./persona-map-v1.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const AGENTS_JSON = resolve(root, "shared/virtual-class-agents.json");
const MIGRATION_MAP = resolve(root, "migration/persona-v1-legacy-map.json");
const MV_CORE = resolve(root, "shared/mv-classroom-core.js");
const PRACTICE_RT = resolve(root, "shared/practice-runtime.js");
const SIM_RNG = resolve(root, "shared/sim-rng.js");

const data = JSON.parse(readFileSync(AGENTS_JSON, "utf8"));
const meta = data._meta || {};
const mvSrc = readFileSync(MV_CORE, "utf8");
const prtSrc = readFileSync(PRACTICE_RT, "utf8");

const failures = [];
let checkCount = 0;
console.log("verify-agent-persona（persona-v2-contract §13 · P0 骨架 + P1 点亮）");
console.log("— 激活断言 —");
function check(name, fn) {
  checkCount += 1;
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failures.push(name);
    console.error(`  ✗ ${name}\n      ${e.message}`);
  }
}
function fail(msg) { throw new Error(msg); }

/* (a) simVersion 形如 sim-a.b.c */
check("(a) _meta.simVersion 存在且形如 sim-a.b.c", () => {
  if (typeof meta.simVersion !== "string") fail(`_meta.simVersion 缺失或不是字符串：${meta.simVersion}`);
  if (!/^sim-\d+\.\d+\.\d+$/.test(meta.simVersion)) fail(`格式不符：${meta.simVersion}（应匹配 /^sim-\\d+\\.\\d+\\.\\d+$/）`);
});

/* (b) _decision_weights 与引擎源码解析输出逐字节一致 */
check("(b) _meta._decision_weights 与引擎常量一致（文档-代码一致）", () => {
  const expected = deriveDecisionWeights(mvSrc);
  const actual = meta._decision_weights;
  if (!actual || typeof actual !== "object") fail("_meta._decision_weights 缺失");
  const e = JSON.stringify(expected);
  const a = JSON.stringify(actual);
  if (e !== a) fail(`漂移：JSON=${a} ≠ 引擎=${e}（运行 node tools/gen-decision-weights.mjs 修复）`);
});

/* (c) _field_consumers 覆盖引擎实读字段 + 装饰字段处置标注
 *     字段清单依据 persona-v2-field-map「运行参数层」与 contract §3.1 表列（11 个引擎字段） */
const ENGINE_FIELDS = [
  "state_init.attention", "state_init.speak_motivation", "state_init.fatigue",
  "state_init.social_safety", "state_init.stance_position",
  "rules.speak_on", "rules.silent_on",
  "graph.allies", "graph.rivals",
  "responses.*", "persona.stance_strength",
];
const DECOR_FIELDS = [ // contract §4 零容忍清单
  "rules.primary_style", "rules.secondary_style", "rules.interrupt_tolerance",
  "rules.ally_threshold", "rules.rebut_threshold",
  "persona.openness", "persona.register", "graph.rival_basis",
];
check("(c) _meta._field_consumers 覆盖引擎实读字段与装饰字段处置", () => {
  const fields = (meta._field_consumers && meta._field_consumers.fields) || {};
  const missingEngine = ENGINE_FIELDS.filter((f) => !fields[f] || fields[f].consumer !== "engine");
  if (missingEngine.length) fail(`引擎实读字段未标注 consumer=engine：${missingEngine.join(", ")}`);
  const missingDecor = DECOR_FIELDS.filter((f) => !fields[f] || !fields[f].disposition);
  if (missingDecor.length) fail(`装饰字段缺 §4 处置标注：${missingDecor.join(", ")}`);
});

/* (d) 源码扫描：隐藏分类模板与非种子随机 */
check("(d) 源码扫描：无 switch(group) / if (tier / id <= N 模板 / Math.random", () => {
  const PATTERNS = [
    [/switch\s*\(\s*group/, "switch(group)"],
    [/if\s*\(\s*tier/, "if (tier …)"],
    [/\bid\s*<=\s*\d+/, "id <= N 式隐藏模板"],
    [/Math\.random\s*\(/, "Math.random 调用"],
  ];
  const hits = [];
  for (const [label, src] of [["mv-classroom-core.js", mvSrc], ["practice-runtime.js", prtSrc]]) {
    src.split("\n").forEach((line, i) => {
      for (const [re, tag] of PATTERNS) {
        if (re.test(line)) hits.push(`${label}:${i + 1} [${tag}]`);
      }
    });
  }
  if (hits.length) fail(`命中禁用模式：${hits.join("；")}`);
});

/* (e) 学生记录不得含 group / tier / archetype / segment 字段 */
const BANNED_KEYS = new Set(["group", "tier", "archetype", "segment"]);
check("(e) 学生记录无 group / tier / archetype / segment 字段", () => {
  const hits = [];
  const walk = (node, path) => {
    if (Array.isArray(node)) return node.forEach((v, i) => walk(v, `${path}[${i}]`));
    if (!node || typeof node !== "object") return;
    for (const [k, v] of Object.entries(node)) {
      if (BANNED_KEYS.has(k.toLowerCase())) hits.push(`${path}.${k}`);
      walk(v, `${path}.${k}`);
    }
  };
  (data.agents || []).forEach((a) => walk(a, `agents.${a && a.id}`));
  if (hits.length) fail(`学生记录含分组字段：${hits.join(", ")}`);
});

/* (f) 内嵌 SimRNG 副本与 shared/sim-rng.js 标记区逐字节一致 */
check("(f) 引擎内嵌 SimRNG 副本与 shared/sim-rng.js 逐字节一致", () => {
  const MARK = /\/\* ==== SIM-RNG-BEGIN[\s\S]*?\/\* ==== SIM-RNG-END ==== \*\//;
  const blocks = [["shared/sim-rng.js", readFileSync(SIM_RNG, "utf8")], ["mv-classroom-core.js", mvSrc], ["practice-runtime.js", prtSrc]]
    .map(([label, src]) => {
      const m = src.match(MARK);
      if (!m) fail(`${label} 缺 SIM-RNG 标记区`);
      return [label, m[0]];
    });
  const [refLabel, ref] = blocks[0];
  for (const [label, block] of blocks.slice(1)) {
    if (block !== ref) fail(`${label} 内嵌副本与 ${refLabel} 漂移（同步 SIM-RNG 标记区）`);
  }
});

/* (g) P1 · historyEvents schema 全字段校验（§5） */
const EVENT_TYPES = new Set(["academic_track", "industry_experience", "family_livelihood", "role_social", "career_contact"]);
const EVT_ID_RE = /^evt_(\d{3})_(\d{2})$/;
const roleVocab = (meta.role_vocab && meta.role_vocab.history_roles) || [];
const lessonRoles = (meta.role_vocab && meta.role_vocab.lesson_required_roles) || [];
const tagVocab = new Set((meta.tag_vocab && meta.tag_vocab.tags) || []);
const silenceVocab = new Set((meta.silence_cause_vocab && meta.silence_cause_vocab.causes) || []);
check("(g) historyEvents schema：每人 2–5 条，全字段类型/值域/词表一致（§5）", () => {
  if (!roleVocab.length) fail("_meta.role_vocab.history_roles 缺失");
  if (!tagVocab.size) fail("_meta.tag_vocab.tags 缺失");
  const ids = new Set();
  const errs = [];
  (data.agents || []).forEach((a) => {
    const evs = a.historyEvents;
    if (!Array.isArray(evs) || evs.length < 2 || evs.length > 5) {
      errs.push(`${a.id}: 事件数 ${Array.isArray(evs) ? evs.length : "缺失"}（须 2–5）`);
      return;
    }
    const sidNum = String((a.identity && a.identity.sid) || "").split("-")[1];
    evs.forEach((e) => {
      const m = typeof e.id === "string" && e.id.match(EVT_ID_RE);
      if (!m) {
        errs.push(`${a.id}: 事件 id 非法 ${e.id}`);
      } else {
        if (m[1] !== sidNum) errs.push(`${e.id}: id 前缀 ${m[1]} ≠ 学号尾段 ${sidNum}`);
        if (ids.has(e.id)) errs.push(`事件 id 重复 ${e.id}`);
        ids.add(e.id);
      }
      if (!EVENT_TYPES.has(e.type)) errs.push(`${e.id}: type 非法 ${e.type}`);
      if (typeof e.context !== "string" || !e.context) errs.push(`${e.id}: context 缺失`);
      if (!roleVocab.includes(e.role)) errs.push(`${e.id}: role 不在 role_vocab ${e.role}`);
      for (const f of ["depth", "recency"]) {
        if (typeof e[f] !== "number" || e[f] < 0 || e[f] > 1) errs.push(`${e.id}: ${f} 越界 ${e[f]}`);
      }
      if (!(e.durationMonths === null || (typeof e.durationMonths === "number" && e.durationMonths > 0))) {
        errs.push(`${e.id}: durationMonths 非法 ${e.durationMonths}`);
      }
      if (!Array.isArray(e.tags) || !e.tags.length) {
        errs.push(`${e.id}: tags 空`);
      } else {
        e.tags.filter((t) => !tagVocab.has(t)).forEach((t) => errs.push(`${e.id}: tag 不在 tag_vocab ${t}`));
      }
      if (!Array.isArray(e.absentExposure) || !e.absentExposure.length) {
        errs.push(`${e.id}: absentExposure 空（必填非空）`);
      } else {
        e.absentExposure.filter((t) => !tagVocab.has(t)).forEach((t) => errs.push(`${e.id}: absentExposure 不在 tag_vocab ${t}`));
      }
      if ("sensitive" in e && typeof e.sensitive !== "boolean") errs.push(`${e.id}: sensitive 非布尔`);
    });
  });
  if (errs.length) fail(`${errs.length} 处违规：${errs.slice(0, 5).join("；")}${errs.length > 5 ? " …" : ""}`);
});

/* (h) P1 · 每人 ≥1 个区分性事件（§13 个体级结构门禁） */
check("(h) 每人 ≥1 个区分性事件（与他人不完全雷同）", () => {
  const sig = (e) => JSON.stringify([e.type, e.context, e.role, [...(e.tags || [])].sort()]);
  const count = new Map();
  (data.agents || []).forEach((a) => (a.historyEvents || []).forEach((e) => count.set(sig(e), (count.get(sig(e)) || 0) + 1)));
  const lacking = (data.agents || [])
    .filter((a) => !(a.historyEvents || []).some((e) => count.get(sig(e)) === 1))
    .map((a) => a.id);
  if (lacking.length) fail(`无区分性事件：${lacking.join(", ")}`);
});

/* (i) P1 · silenceCauses 词表一致 + 12 种契约沉默因果在册（§14 P1 细则） */
check("(i) silenceCauses ∈ silence_cause_vocab，12 种契约沉默因果在册", () => {
  if (!silenceVocab.size) fail("_meta.silence_cause_vocab.causes 缺失");
  const errs = [];
  (data.agents || []).forEach((a) => {
    if (!Array.isArray(a.silenceCauses)) {
      errs.push(`${a.id}: silenceCauses 缺失`);
      return;
    }
    a.silenceCauses.filter((c) => !silenceVocab.has(c)).forEach((c) => errs.push(`${a.id}: 沉默因果不在词表 ${c}`));
  });
  const REQUIRED = {
    C1: "fear_of_labeling", C2: "hand_raised_unnoticed", C3: "small_group_speaks_plenary_retreats",
    C4: "self_censorship_pro_industry_image", C5: "turn_taking_repeatedly_preempted", C6: "no_entry_point_in_binary_frame",
    C7: "conflict_of_interest_concealment", C8: "role_identity_confusion_regulator_vs_industry",
    D1: "introversion_and_mandarin_diffidence", D2: "cognitive_overload_and_prerequisite_gap",
    D3: "waits_for_teacher_nomination", D4: "transient_physical_indisposition",
  };
  for (const [sid, cause] of Object.entries(REQUIRED)) {
    const a = (data.agents || []).find((x) => x.id === sid);
    if (!a || !(a.silenceCauses || []).includes(cause)) errs.push(`${sid}: 契约沉默因果缺失 ${cause}`);
  }
  if (errs.length) fail(errs.slice(0, 5).join("；"));
});

/* (j) P1 · migration map 32/32 完整（A/B/C/D 唯一合法存放处，§0-11） */
check("(j) migration/persona-v1-legacy-map.json 32/32 完整", () => {
  let m;
  try {
    m = JSON.parse(readFileSync(MIGRATION_MAP, "utf8"));
  } catch (e) {
    fail(`读取失败：${e.message}`);
  }
  const map = (m && m.map) || {};
  const ids = (data.agents || []).map((a) => a.id);
  const missing = ids.filter((id) => !map[id]);
  const extra = Object.keys(map).filter((id) => !ids.includes(id));
  if (missing.length || extra.length) fail(`缺 ${missing.join(",") || "无"}；多 ${extra.join(",") || "无"}`);
  const bad = Object.entries(map).filter(([, v]) => !/^[ABCD]$/.test(v && v.v0_2_group) || typeof (v && v.source) !== "string" || !v.source);
  if (bad.length) fail(`条目缺 v0_2_group/source：${bad.map(([k]) => k).join(", ")}`);
});

/* (k) P1 · lessons 章节侧打标与 §7.1 查表一致 */
check("(k) lessons.tags ⊆ tag_vocab；requiredRole/两张查表全覆盖", () => {
  const lessons = meta.lessons;
  if (!Array.isArray(lessons) || !lessons.length) fail("_meta.lessons 缺失");
  const prox = (meta.role_proximity_table && meta.role_proximity_table.proximity) || {};
  const trans = (meta.transferability_table && meta.transferability_table.by_type) || {};
  const errs = [];
  lessons.forEach((l) => {
    (l.tags || []).filter((t) => !tagVocab.has(t)).forEach((t) => errs.push(`${l.lessonId}: lesson tag 不在 tag_vocab ${t}`));
    (l.requiredRole || []).filter((r) => !lessonRoles.includes(r)).forEach((r) => errs.push(`${l.lessonId}: requiredRole 不在词表 ${r}`));
  });
  const swot = lessons.find((l) => l.lessonId === "mp-ch3-environment");
  if (!swot || swot.scenarioId !== "swot-huakang-chronic") errs.push("现行 SWOT 章节条目缺失或 scenarioId 漂移（应 mp-ch3-environment / swot-huakang-chronic）");
  roleVocab.forEach((r) => {
    lessonRoles.forEach((lr) => {
      const v = prox[r] && prox[r][lr];
      if (typeof v !== "number" || v < 0 || v > 1) errs.push(`role_proximity_table 缺/越界 ${r}×${lr}`);
    });
  });
  EVENT_TYPES.forEach((t) => {
    const v = trans[t];
    if (typeof v !== "number" || v < 0 || v > 1) errs.push(`transferability_table 缺/越界 ${t}`);
  });
  if (errs.length) fail(errs.slice(0, 5).join("；"));
});

/* (l) P1b · drama.events schema + 派生 SCHED 条数（§8.2） */
check("(l) drama.events schema 合法，派生 SCHED = 28 条（§8.2/§15-1）", () => {
  const FX_KEYS = new Set(["attention", "speak_motivation", "fatigue", "social_safety", "stance_position"]);
  const errs = [];
  let total = 0;
  (data.agents || []).forEach((a) => {
    const evs = a.drama && a.drama.events;
    if (!Array.isArray(evs)) {
      errs.push(`${a.id}: drama.events 缺失或非数组`);
      return;
    }
    evs.forEach((e) => {
      total += 1;
      if (typeof e.t !== "number" || !(e.t > 0)) errs.push(`${a.id}: events.t 非法 ${e.t}`);
      if (!e.fx || typeof e.fx !== "object" || Array.isArray(e.fx)) {
        errs.push(`${a.id}@${e.t}: fx 缺失`);
      } else {
        const ks = Object.keys(e.fx);
        if (!ks.length) errs.push(`${a.id}@${e.t}: fx 空对象`);
        ks.forEach((k) => {
          if (!FX_KEYS.has(k)) errs.push(`${a.id}@${e.t}: fx 键非法 ${k}`);
          const v = e.fx[k];
          if (typeof v !== "number" || v < -1 || v > 1) errs.push(`${a.id}@${e.t}: fx.${k} 越界 ${v}`);
        });
      }
      if (typeof e.why !== "string" || !e.why) errs.push(`${a.id}@${e.t}: why 缺失`);
    });
  });
  const EXPECTED = 28; // 规范 26 条（runtime 超集）+ §15-1 C3/C6 教师点名 2 条
  if (total !== EXPECTED) errs.push(`派生 SCHED 总条数 ${total} ≠ ${EXPECTED}`);
  if (errs.length) fail(errs.slice(0, 5).join("；"));
});

/* (w) P1b · 班级发言分布软 warning（§15-3 重尾；打印但不影响退出码）
 *     有效发言预算 = state_init.speak_motivation ×（silent_on 硬沉默规则 ? 0 : 1），
 *     硬沉默判定与 mv-classroom-core rulesMatch 的恒真沉默分支一致。 */
(function speakingBudgetWarning() {
  const HARD = (rules) => (rules || []).some((r) =>
    typeof r === "string" && (r.includes("几乎从不") || r === "所有公开发言" || r === "所有" || r.includes("从未成功")));
  const eff = (data.agents || []).map((a) => ({
    id: a.id,
    v: HARD(a.rules && a.rules.silent_on) ? 0 : Number((a.state_init && a.state_init.speak_motivation) || 0),
  }));
  const vals = eff.map((x) => x.v).sort((x, y) => y - x);
  const sum = vals.reduce((s, v) => s + v, 0);
  if (!vals.length || sum <= 0) {
    console.log("  ⚠ (w) 发言预算为空（软 warning）");
    return;
  }
  const top8 = vals.slice(0, 8).reduce((s, v) => s + v, 0) / sum;
  const bottom16 = vals.slice(Math.max(8, vals.length - 16)).reduce((s, v) => s + v, 0) / sum;
  const n = vals.length;
  const mean = sum / n;
  const m2 = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const m3 = vals.reduce((s, v) => s + (v - mean) ** 3, 0) / n;
  const skew = m2 > 0 ? m3 / Math.pow(m2, 1.5) : 0;
  const dRaw = (data.agents || []).filter((a) => a.id.startsWith("D")).map((a) => Number((a.state_init && a.state_init.speak_motivation) || 0));
  const dDistinct = new Set(dRaw).size === dRaw.length; // §15-3 对称结构破除看原始预算值（硬沉默置零会撞 0）
  const ok = top8 >= 0.45 && top8 <= 0.8 && bottom16 <= 0.25 && skew >= 0.25 && dDistinct;
  console.log(
    `  ${ok ? "✓" : "⚠"} (w) 发言分布（软）：top8 占比 ${(top8 * 100).toFixed(1)}% · bottom16 占比 ${(bottom16 * 100).toFixed(1)}% · 偏度 ${skew.toFixed(2)} · D 组取值互异 ${dDistinct ? "是" : "否"}`
  );
  if (!ok) console.log("      ⚠ §15-3 重尾包线未达（warning，不影响退出码；包线：top8 ∈ [45%,80%]、bottom16 ≤ 25%、偏度 ≥ 0.25、D 组取值互异）");
})();

/* ---------- P2 点亮（persona-map-v1 落地 + 装饰字段接线/降级 + 字母先验移除） ---------- */

/* (m) 班级级硬门禁：蓝图区间来自 _meta.persona_map_notes.blueprint（单一来源），
 *     指标由 persona-map-v1 computeMetrics 对 latentFactors 现值独立重算（不信 notes.metrics 存档） */
check("(m) 班级级硬门禁：F1–F7 分布/余弦/微簇/反典型/硬相关落入 persona_map_notes.blueprint（§13）", () => {
  const bp = meta.persona_map_notes && meta.persona_map_notes.blueprint;
  if (!bp) fail("_meta.persona_map_notes.blueprint 缺失（先运行 node tools/persona-map-v1.mjs）");
  const agents = data.agents || [];
  const factorsById = {};
  const params = {};
  agents.forEach((a) => {
    factorsById[a.id] = {};
    FACTOR_IDS.forEach((k) => {
      const f = a.latentFactors && a.latentFactors[k];
      if (!f || typeof f.value !== "number") fail(`${a.id}: latentFactors.${k} 缺失（先运行 node tools/persona-map-v1.mjs）`);
      factorsById[a.id][k] = { value: f.value };
    });
    params[a.id] = { state_init: { speak_motivation: (a.state_init && a.state_init.speak_motivation) || 0 } };
  });
  // §6.2 批准校准以有效值参与班级指标（与 persona-map 写回口径一致；approved:false 不动）
  applyApprovedAdjustments(agents, factorsById);
  const m = computeMetrics(agents, factorsById, params);
  const errs = [];
  FACTOR_IDS.forEach((k) => {
    const d = m.distributions[k];
    const [lo, hi] = (bp.mean && (bp.mean[k] || bp.mean.default)) || [0, 1];
    if (d.mean < lo || d.mean > hi) errs.push(`${k} 均值 ${d.mean} 越出 [${lo},${hi}]`);
    const [slo, shi] = bp.sd || [0, 1];
    if (d.sd < slo || d.sd > shi) errs.push(`${k} sd ${d.sd} 越出 [${slo},${shi}]`);
    if (d.tail > bp.tailMax) errs.push(`${k} 尾部 ${d.tail} > ${bp.tailMax}`);
  });
  if (m.maxCosinePair.cos > bp.cosineMax) errs.push(`近重复 ${m.maxCosinePair.a}-${m.maxCosinePair.b} cos=${m.maxCosinePair.cos} > ${bp.cosineMax}`);
  const biggest = m.microClusters[0];
  if (biggest && biggest.length > bp.microClusterMax) errs.push(`微簇 [${biggest.join(",")}] ${biggest.length} 人 > ${bp.microClusterMax}`);
  if (m.atypical.length < bp.atypicalMin) errs.push(`反典型 ${m.atypical.length} 人 < ${bp.atypicalMin}`);
  if (Math.abs(m.correlations.knowledge_vs_participation_r) > bp.knowledgeParticipationAbsR) {
    errs.push(`知识×参与 |r|=${Math.abs(m.correlations.knowledge_vs_participation_r)} > ${bp.knowledgeParticipationAbsR}`);
  }
  if (m.correlations.high_knowledge_all_high_participation) errs.push("高知识子集全员高参与（违反反向约束）");
  if (m.correlations.practice_vs_evidence.gap > bp.practiceEvidenceGapMax) {
    errs.push(`实践×证据素养 gap=${m.correlations.practice_vs_evidence.gap} > ${bp.practiceEvidenceGapMax}`);
  }
  if (errs.length) fail(errs.join("；"));
  console.log(`      蓝图内：最大余弦 ${m.maxCosinePair.a}-${m.maxCosinePair.b}=${m.maxCosinePair.cos} · 最大簇 ${biggest ? biggest.length : 1} 人 · 反典型 ${m.atypical.length} 人 · 知识×参与 r=${m.correlations.knowledge_vs_participation_r} · 实践×证据 gap=${m.correlations.practice_vs_evidence.gap}`);
});

/* (m-soft) 软相关目标 warning（§13：表现取向×评价焦虑、社会安全×发言倾向仅 warning） */
(function softCorrelationWarning() {
  const agents = data.agents || [];
  const F = (a, k) => (a.latentFactors && a.latentFactors[k] && a.latentFactors[k].value) || 0;
  const pearson = (xs, ys) => {
    const n = xs.length, mx = xs.reduce((s, v) => s + v, 0) / n, my = ys.reduce((s, v) => s + v, 0) / n;
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
    return sxy / (Math.sqrt(sxx * syy) || 1e-12);
  };
  const rPerfAnx = pearson(agents.map((a) => F(a, "F2")), agents.map((a) => 1 - F(a, "F4")));
  const rSafeSpeak = pearson(agents.map((a) => F(a, "F4")), agents.map((a) => (a.state_init && a.state_init.speak_motivation) || 0));
  console.log(`  · (m-soft) 软目标：表现动机×评价焦虑 r=${rPerfAnx.toFixed(2)} · 社会安全×发言倾向 r=${rSafeSpeak.toFixed(2)}（warning 观察项，不设阈值）`);
})();

/* (n) 静态扫描：两引擎 + 两展示层无字母先验分支（§13：id[0] 字母分组分支列入禁用模式；P3 扩展 metaverse 两文件） */
check("(n) 静态扫描：引擎与展示层无字母先验（id[0] / startsWith(字母) / ^[AB] ^[CD] 正则）", () => {
  const PATTERNS = [
    [/\bid\s*\[\s*0\s*\]/, "id[0] 字母分支"],
    [/\.startsWith\(\s*["'][A-D]["']\s*\)/, "startsWith(字母) 分支"],
    [/\^\[AB\]/, "/^[AB]/ 字母先验正则"],
    [/\^\[CD\]/, "/^[CD]/ 字母先验正则"],
  ];
  const hits = [];
  const SCAN_FILES = [
    ["mv-classroom-core.js", mvSrc],
    ["practice-runtime.js", prtSrc],
    ["metaverse-classroom.js", readFileSync(resolve(root, "shared/metaverse-classroom.js"), "utf8")],
    ["metaverse-classroom-3d.js", readFileSync(resolve(root, "shared/metaverse-classroom-3d.js"), "utf8")],
  ];
  for (const [label, src] of SCAN_FILES) {
    src.split("\n").forEach((line, i) => {
      for (const [re, tag] of PATTERNS) {
        if (re.test(line)) hits.push(`${label}:${i + 1} [${tag}]`);
      }
    });
  }
  if (hits.length) fail(`命中字母先验模式：${hits.join("；")}`);
});

/* (q) 运行时层字段不得入库：L1 激活 / L2 运行状态 / L3 轨迹 / enrichmentPlan 只存在于引擎运行时（§2.1/§2 铁律①） */
check("(q) 运行时层字段不回写：enrichmentPlan/L1/L2/L3 字段在学生记录零出现（§2.1 硬门禁）", () => {
  const RUNTIME_KEYS = ["enrichmentPlan", "learningTrace", "cognitiveConflict", "perceivedUnderstanding", "participationDebt", "_activation", "priorityParts"];
  const hits = [];
  (data.agents || []).forEach((a) => {
    const walk = (obj, path) => {
      if (!obj || typeof obj !== "object") return;
      Object.keys(obj).forEach((k) => {
        if (RUNTIME_KEYS.includes(k)) hits.push(`${a.id}.${path}${k}`);
        walk(obj[k], `${path}${k}.`);
      });
    };
    walk(a, "");
  });
  if (hits.length) fail(`学生记录含运行时层字段（§2.1 课结束丢弃、绝不回写）：${hits.join("；")}`);
});

/* (r) L2 字段与消费者同批落地（§2 铁律①：无消费者不得入库——运行时字段亦须有消费点） */
check("(r) L2 字段有消费者：cognitiveConflict/perceivedUnderstanding/participationDebt 在两引擎均有初始化+更新+决策消费点", () => {
  const FIELDS = ["cognitiveConflict", "perceivedUnderstanding", "participationDebt"];
  const errs = [];
  for (const [label, src] of [["mv-classroom-core.js", mvSrc], ["practice-runtime.js", prtSrc]]) {
    for (const f of FIELDS) {
      const n = src.split(f).length - 1;
      if (n < 3) errs.push(`${label} 中 ${f} 仅 ${n} 处引用（<3：初始化/更新/消费未齐）`);
    }
    // 决策消费点明示：scoreDesire/scoreSpeakDesire 内必须出现 L2 字段
    const scoreFn = label === "mv-classroom-core.js" ? src.slice(src.indexOf("function scoreDesire"), src.indexOf("function pickRespKey")) : src.slice(src.indexOf("function scoreSpeakDesire"), src.indexOf("function pickResponseKey"));
    for (const f of FIELDS) {
      if (!scoreFn.includes(f)) errs.push(`${label} 评分函数未消费 ${f}`);
    }
  }
  if (errs.length) fail(errs.join("；"));
});

/* (s) 语料冻结一致性（P4b 门禁）：responses.* 与 _meta.corpus_provenance.freezeHash 一致——
   防签收后手改语料不留痕。算法与 tools/freeze-corpus-p4b.mjs corpusHash 相同（两处须同步）。 */
check("(s) 语料冻结门禁：responses.* 复算哈希 == corpus_provenance.freezeHash", () => {
  const cp = data._meta && data._meta.corpus_provenance;
  if (!cp || !cp.freezeHash) fail("_meta.corpus_provenance.freezeHash 缺失（P4b 冻结段应写入）");
  const norm = (data.agents || []).map((a) => {
    const r = a.responses || {};
    return [a.id, Object.keys(r).sort().map((k) => [k, r[k]])];
  });
  const recomputed = createHash("sha256").update(JSON.stringify(norm)).digest("hex");
  if (recomputed !== cp.freezeHash) {
    fail(`freezeHash 不一致：复算 ${recomputed.slice(0, 16)}… ≠ 登记 ${String(cp.freezeHash).slice(0, 16)}…（语料在冻结后被改动；如属有意改动须重跑 freeze 流程重登记）`);
  }
  if (!cp.userSignoff || !String(cp.userSignoff).includes("2026-08-03")) fail("corpus_provenance.userSignoff 缺 2026-08-03 签收注记");
});

/* (t) 社交图边文档依据（P4b 门禁）：每条 ally/rival 边必须有 derivedFrom（文档行号），且不得有悬空条目 */
check("(t) 社交图门禁：全部 ally/rival 边带 graph.derivedFrom，且无悬空条目", () => {
  const errs = [];
  (data.agents || []).forEach((a) => {
    const g = a.graph || {};
    const df = g.derivedFrom || {};
    const edges = [];
    (g.allies || []).forEach((t) => edges.push(`${a.id}>${t}`));
    (g.rivals || []).forEach((t) => edges.push(`${a.id}>${t}`));
    edges.forEach((k) => {
      if (typeof df[k] !== "string" || !df[k].trim()) errs.push(`${a.id} 边 ${k} 缺 derivedFrom`);
    });
    Object.keys(df).forEach((k) => {
      if (!edges.includes(k)) errs.push(`${a.id} derivedFrom 悬空条目 ${k}（边已删，依据残留）`);
    });
  });
  if (errs.length) fail(errs.join("；"));
});

/* (o) 个体级 provenance：latentFactors 与 derived 映射带 derivedFrom + derivationRule（§1.2-②） */
const DERIVED_KEY_RULES = {
  "state_init.attention": "persona-map-v1.R2",
  "state_init.speak_motivation": "persona-map-v1.R2",
  "state_init.fatigue": "persona-map-v1.R2",
  "state_init.social_safety": "persona-map-v1.R2",
  "state_init.stance_position": "persona-map-v1.R2",
  "state_init.fatigue_rate": "persona-map-v1.R2",
  "rules.ally_threshold": "persona-map-v1.R2",
  "rules.rebut_threshold": "persona-map-v1.R2",
  // P5 · 干预响应矩阵（R4 派生，§4 接线）
  "rules.interrupt_tolerance": "persona-map-v1.R4",
  "interventionResponse.publicCall.directMult": "persona-map-v1.R4",
  "interventionResponse.publicCall.scaffoldedBonus": "persona-map-v1.R4",
  "interventionResponse.openQProbe.gain": "persona-map-v1.R4",
};
check("(o) 个体级：latentFactors/derived 带 derivedFrom + derivationRule，adjustment 未批准不生效（§1.2-②）", () => {
  const errs = [];
  (data.agents || []).forEach((a) => {
    FACTOR_IDS.forEach((k) => {
      const f = a.latentFactors && a.latentFactors[k];
      if (!f) { errs.push(`${a.id}: latentFactors.${k} 缺失`); return; }
      if (typeof f.value !== "number" || f.value < 0 || f.value > 1) errs.push(`${a.id}.${k}: value 越界 ${f.value}`);
      if (!Array.isArray(f.derivedFrom) || !f.derivedFrom.length) errs.push(`${a.id}.${k}: derivedFrom 空`);
      if (f.derivationRule !== "persona-map-v1.R1") errs.push(`${a.id}.${k}: derivationRule=${f.derivationRule}`);
      const adj = f.adjustment || {};
      if (adj.approved === true) {
        // §6.2 批准校准：限幅内单点 delta，须留 approvedBy/approvedDate 审计痕（生效由 persona-map 有效值路径执行）
        if (typeof adj.delta !== "number" || Math.abs(adj.delta) > ADJUST_LIMIT) errs.push(`${a.id}.${k}: 批准 delta=${adj.delta} 越出限幅 ±${ADJUST_LIMIT}（§6.2）`);
        if (typeof adj.approvedBy !== "string" || !adj.approvedBy) errs.push(`${a.id}.${k}: 批准 adjustment 缺 approvedBy`);
        if (typeof adj.approvedDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(adj.approvedDate)) errs.push(`${a.id}.${k}: 批准 adjustment 缺 approvedDate(YYYY-MM-DD)`);
      } else if (adj.delta !== 0 || adj.approved !== false) {
        errs.push(`${a.id}.${k}: adjustment 非默认 {delta:0,approved:false}（未批准 delta 不得生效，§6.2）`);
      }
    });
    const der = a.derived || {};
    Object.entries(DERIVED_KEY_RULES).forEach(([k, rule]) => {
      const v = der[k];
      if (!v || !Array.isArray(v.from) || !v.from.length || v.rule !== rule) {
        errs.push(`${a.id}: derived.${k} 缺 from 或 rule≠${rule}`);
      }
    });
  });
  if (errs.length) fail(`${errs.length} 处违规：${errs.slice(0, 5).join("；")}${errs.length > 5 ? " …" : ""}`);
});

/* (p) 装饰字段不得复活到运行层（§4；P5 修订：interrupt_tolerance 已按 §4 接线复活为合法 engine
   字段——必须有消费者证明；openness/register 仍禁复活） */
check("(p) 装饰字段门禁：openness/register 不得复活；interrupt_tolerance 已接线且必须有消费点（§4/P5）", () => {
  const errs = [];
  (data.agents || []).forEach((a) => {
    if (a.persona && "openness" in a.persona) errs.push(`${a.id}: persona.openness 复活（仍禁）`);
    if (a.persona && "register" in a.persona) errs.push(`${a.id}: persona.register 复活（仍禁）`);
    const it = a.rules && a.rules.interrupt_tolerance;
    if (typeof it !== "number" || it < 0 || it > 1) errs.push(`${a.id}: rules.interrupt_tolerance 缺失或越界（P5 接线后应为 [0,1] 数值）`);
  });
  const notes = meta.design_notes || {};
  ["openness", "register"].forEach((k) => {
    const n = Object.keys(notes[k] || {}).length;
    if (n !== 32) errs.push(`_meta.design_notes.${k} 存档人数 ${n} ≠ 32`);
  });
  if (!Object.keys(notes.interrupt_tolerance || {}).length) {
    errs.push("_meta.design_notes.interrupt_tolerance 存档缺失（原 3 级设计值留档，P5 接线后仍保留作参考）");
  }
  // 消费者证明（§1.2-①）：interrupt_tolerance 由 MVCore teacherCallOn 干预处理器消费
  // （interventionOf 读取 + 提升缩放 + 发言后残留惩罚 ≥3 处引用）
  const itRefs = mvSrc.split("interrupt_tolerance").length - 1 + mvSrc.split("interruptTolerance").length - 1;
  if (itRefs < 3) errs.push(`mv-classroom-core.js 中 interrupt_tolerance 消费点不足（${itRefs}<3：读取/提升缩放/残留惩罚未齐）`);
  if (errs.length) fail(errs.join("；"));
});

/* (u) P5 干预响应矩阵门禁：schema 合法 + 与 persona-map-v1.R4 逐人重算一致（防手改） +
   两引擎消费点存在（scoreDesire/scoreSpeakDesire 点名窗口缩放；MVCore openQ 增益） */
check("(u) 干预响应矩阵：schema/值域合法、R4 重算逐人一致、引擎消费点齐备", () => {
  const agents = data.agents || [];
  const errs = [];
  // 因子有效值（批准校准生效，与 persona-map 口径一致）
  const factorsById = {};
  agents.forEach((a) => {
    factorsById[a.id] = {};
    FACTOR_IDS.forEach((k) => { factorsById[a.id][k] = { value: a.latentFactors[k].value }; });
  });
  applyApprovedAdjustments(agents, factorsById);
  const recomputed = deriveIntervention(agents, factorsById).params;
  for (const a of agents) {
    const ir = a.interventionResponse || {};
    const pc = ir.publicCall || {};
    const g = ir.openQProbe || {};
    const inRange = (v, lo, hi) => typeof v === "number" && v >= lo && v <= hi;
    if (!inRange(pc.directMult, -0.4, 1.2)) errs.push(`${a.id}: directMult 越界 ${pc.directMult}`);
    if (!inRange(pc.scaffoldedBonus, 0, 0.45)) errs.push(`${a.id}: scaffoldedBonus 越界 ${pc.scaffoldedBonus}`);
    if (!inRange(g.gain, -0.15, 0.25)) errs.push(`${a.id}: openQProbe.gain 越界 ${g.gain}`);
    const exp = recomputed[a.id];
    const close = (x, y) => Math.abs(x - y) < 1e-9;
    if (!close(pc.directMult, exp.interventionResponse.publicCall.directMult)) errs.push(`${a.id}: directMult=${pc.directMult} ≠ R4 重算 ${exp.interventionResponse.publicCall.directMult}（手改或派生漂移）`);
    if (!close(pc.scaffoldedBonus, exp.interventionResponse.publicCall.scaffoldedBonus)) errs.push(`${a.id}: scaffoldedBonus ≠ R4 重算`);
    if (!close(g.gain, exp.interventionResponse.openQProbe.gain)) errs.push(`${a.id}: openQProbe.gain ≠ R4 重算`);
    if (!close(a.rules.interrupt_tolerance, exp.rules.interrupt_tolerance)) errs.push(`${a.id}: interrupt_tolerance=${a.rules.interrupt_tolerance} ≠ R4 重算 ${exp.rules.interrupt_tolerance}`);
  }
  // 引擎消费点（两引擎对称读取 interventionResponse.publicCall；MVCore 另有 openQProbe/teacherCallOn）
  const pcRefs = (src) => (src.split("directMult").length - 1) + (src.split("scaffoldedBonus").length - 1);
  if (pcRefs(mvSrc) < 3) errs.push("mv-classroom-core.js publicCall 消费点不足（<3）");
  if (pcRefs(prtSrc) < 2) errs.push("practice-runtime.js publicCall 消费点不足（<2）");
  if (!mvSrc.includes("probeGain")) errs.push("mv-classroom-core.js 缺 openQProbe.gain 消费点");
  if (errs.length) fail(errs.slice(0, 6).join("；") + (errs.length > 6 ? ` …共${errs.length}处` : ""));
});

/* §13 其余断言：PENDING 注册（点亮阶段见注记），打印但不影响退出码 */
const PENDING = [
  ["班级级 · F1–F7 边际分布均值/方差/尾部落入蓝图区间", "P2 已由断言 (m) 点亮"],
  ["班级级 · 任意两人关键因子余弦相似度 ≤ 阈值", "P2 已由断言 (m) 点亮（阈值标定 0.93，见 blueprint._note）"],
  ["班级级 · 微簇单簇 ≤ 5 人；反典型个体 ≥ 3", "P2 已由断言 (m) 点亮"],
  ["班级级 · 硬相关约束（知识×参与 |r|≤0.6；高知识不得全员高参与；实践经历≠高证据素养）+ 软目标 warning", "P2 已由断言 (m) + (m-soft) 点亮"],
  ["班级级 · 发言预算重尾分布（软目标）；禁对称人工结构（§15-3）", "P1b 已由断言 (w) 以软 warning 点亮（有效发言预算 top8/bottom16/偏度/D 组取值互异）"],
  ["班级级 · 分组门禁其余项：enrichmentPlan 键含 lessonId/scenarioId；资源深度不写入 persona；clusterId 不回写；32 人满足最低完整人格契约", "P3 已部分点亮：enrichmentPlan 运行时生成含 lessonId（computeEnrichmentPlan）+ 不回写由断言 (q) 门禁；clusterId/人格契约待后续批次"],
  ["静态扫描 · 字母前缀先验（/^[AB]/、id[0]===\"C\" 式分组分支）", "P2 已由断言 (n) 点亮；P3 扩展至 metaverse-classroom*.js 两展示层文件"],
  ["跨课程角色轮换 · ≥3 类章节深度预算 top8 不恒定（jaccard 先作 warning）", "P3 已由 tools/verify-persona-metamorphic.mjs (i) 点亮（三课 top8 两两 jaccard 打印观察）"],
  ["个体级 · derived 字段带 derivedFrom + derivationRule", "P2 已由断言 (o) 点亮"],
  ["个体级 · 成长史文本不得含事件表外事实（tags/role 词表包含性检查）", "P1 数据已就绪（事件表+词表在库）；叙事-事件一致性为人工抽查验收点，不自动化"],
  ["个体级 · 装饰字段不得复活到运行层（§4 降级/接线执行后点亮）", "P2 已由断言 (p) 点亮"],
  ["Metamorphic · 同人换章节行为有向可解释；sensitive 事件负向激活；点名后仍可响应", "P3 全量点亮（tools/verify-persona-metamorphic.mjs (e)-(h)：引擎实跑三课 + B1 sensitive 判例 + 点名响应 + 确定性）"],
  ["Metamorphic · 固定 seed 三次运行逐 beat 一致", "P0 已由 tools/verify-sim-determinism.mjs 先行覆盖"],
  ["L3 · 学习轨迹有消费者证明（轨迹 → 关键时刻派生链）", "P3 已由 tools/prove-learning-trace-km.mjs 点亮（数据侧+harness；UI 接线 PENDING：practice-detail.html 解禁后任务）"],
];

if (failures.length) {
  console.error(`\n✗ ${failures.length} 条激活断言失败：`);
  failures.forEach((f) => console.error(`    ${f}`));
} else {
  console.log(`\n激活断言全部通过（${checkCount}/${checkCount}）`);
}
console.log("\n— PENDING（§13 待点亮，不影响退出码）—");
PENDING.forEach(([name, stage]) => console.log(`  · [${stage}] ${name}`));
process.exit(failures.length ? 1 : 0);
