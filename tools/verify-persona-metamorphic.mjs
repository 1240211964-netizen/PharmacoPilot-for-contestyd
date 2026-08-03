#!/usr/bin/env node
/* Metamorphic 校验（persona-v2-contract §13 · P2 骨架 / P3 全量点亮）
 *
 * scenarioFamiliarity / activationOf / computeEnrichmentPlan 一律来自
 * shared/enrich-activation.js（ENRICH-ACTIVATION 单源，引擎内嵌副本同字节，
 * 防"测试一套、引擎一套"）。
 *
 * 断言：
 *   (a) lessons[].tags ⊆ tag_vocab.tags（§5：事件与章节共用同一词表是可计算的前提）。
 *   (b) proximity / transferability 查表覆盖完整（全部事件 role/type × 全部课程 requiredRole）。
 *   (c) 骨架三课有向断言（纯计算）：C4 familiarity(qa) > familiarity(mp)；
 *       A1/B1 familiarity(he) > familiarity(qa)。
 *   (d) 熟悉度矩阵两次计算逐等（确定性）。
 *   (e) 引擎实跑 × 三课（P3 全量）：L1 生效 speak_motivation——正向激活者均值上升、
 *       零熟悉度者逐人零变化（激活只调 L1 生效值，不写回 state_init）。
 *   (f) §7.2 sensitive 判例：B1（家人糖尿病照护 sensitive 事件）在医保准入课（患者负担议题）
 *       激活方向为负——有效 sm 低于 base（更沉默而非更积极；一切"经历=正向加成"判 bug）。
 *   (f2) §7.2 全量扩展（P4a）：14 条 sensitive 事件逐条合成课探测，均为 argmax 且方向为负。
 *   (g) 教师点名后仍可响应：默认课实跑到 T_CAP，C3/C6 各含 ≥1 条 if_called_uncertain beat。
 *   (h) 固定 seed 三次运行逐 beat 一致（含激活/L2/L3 全链路）。
 *   (i) 跨课程角色轮换（§13）：三课各算 enrichmentPlan top8，两两 jaccard 打印（warning
 *       观察指标不设死阈值）；至少一对名单不同；top8 成员逐项得分可溯源（priorityParts）。
 *   (j) P5 干预响应矩阵：直接 vs 铺垫点名方向差、F7 追问分化、打断恢复差异（§14 P5）。
 *
 * 退出码：全过 = 0；任一失败 = 1。
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import vm from "node:vm";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const agentsText = readFileSync(resolve(root, "shared/virtual-class-agents.json"), "utf8");
const data = JSON.parse(agentsText);

/* 单源计算器（shared/enrich-activation.js；与两引擎内嵌副本同字节，verify-sched-single-source (d) 门禁） */
globalThis.window = globalThis;
vm.runInThisContext(readFileSync(resolve(root, "shared/enrich-activation.js"), "utf8"), { filename: "shared/enrich-activation.js" });
const EA = globalThis.EnrichActivation;
if (!EA) { console.error("✗ EnrichActivation 未暴露"); process.exit(1); }

const failures = [];
console.log("verify-persona-metamorphic（persona-v2-contract §13 · P3 全量）");
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

const meta = data._meta;
const lessons = meta.lessons;
const lessonById = Object.fromEntries(lessons.map((l) => [l.lessonId, l]));
const agentById = Object.fromEntries(data.agents.map((a) => [a.id, a]));
const tables = {
  proximity: meta.role_proximity_table.proximity,
  transferability: meta.transferability_table.by_type,
};
const fam = (stu, lesson) => EA.scenarioFamiliarity(stu, lesson, tables).value;

/* (a) lessons[].tags ⊆ tag_vocab.tags */
check("(a) lessons[].tags ⊆ tag_vocab.tags", () => {
  const vocab = new Set(meta.tag_vocab.tags);
  for (const l of lessons) {
    const missing = l.tags.filter((t) => !vocab.has(t));
    if (missing.length) fail(`${l.lessonId} 含词表外 tag：${missing.join(", ")}`);
  }
});

/* (b) proximity / transferability 查表覆盖完整 */
check("(b) proximity 覆盖全部事件 role 与课程 requiredRole；transferability 覆盖全部事件 type", () => {
  const reqRoles = [...new Set(lessons.flatMap((l) => l.requiredRole))];
  for (const a of data.agents) {
    for (const e of a.historyEvents || []) {
      const row = tables.proximity[e.role];
      if (!row) fail(`${a.id} 事件 ${e.id} role=${e.role} 不在 proximity 表`);
      const miss = reqRoles.filter((r) => row[r] == null);
      if (miss.length) fail(`proximity[${e.role}] 缺 requiredRole：${miss.join(", ")}`);
      if (tables.transferability[e.type] == null) fail(`${a.id} 事件 ${e.id} type=${e.type} 不在 transferability 表`);
    }
  }
});

/* (c) 骨架三课有向断言（纯计算） */
check("(c) 骨架三课有向断言（C4/A1/B1）", () => {
  const mp = lessonById["mp-ch3-environment"];
  const qa = lessonById["qa-ch5-gmp-deviation"];
  const he = lessonById["he-ch6-payment-access"];
  const cases = [
    ["C4", qa, mp, "gmp-deviation > swot（制药生产实习事件直中）"],
    ["A1", he, qa, "payment-access > gmp（商保支付方实习事件直中）"],
    ["B1", he, qa, "payment-access > gmp（medication_adherence 弱命中，方向仍须 >）"],
  ];
  for (const [id, hi, lo, why] of cases) {
    const vHi = fam(agentById[id], hi);
    const vLo = fam(agentById[id], lo);
    if (!(vHi > vLo)) {
      fail(`${id} familiarity(${hi.lessonId})=${vHi} 应 > familiarity(${lo.lessonId})=${vLo}（${why}）`);
    }
    console.log(`      ${id}: ${hi.lessonId}=${vHi.toFixed(4)} > ${lo.lessonId}=${vLo.toFixed(4)}（${why}）`);
  }
});

/* (d) 确定性：全矩阵计算两次逐等 */
check("(d) 32 人 × 3 课熟悉度矩阵两次计算逐等", () => {
  const matrix = () => data.agents.map((a) => lessons.map((l) => fam(a, l)));
  if (JSON.stringify(matrix()) !== JSON.stringify(matrix())) fail("同输入两次计算结果不一致（存在非确定性来源）");
});

/* ---- 引擎实跑段（(e)-(h)）：vm shim 跑 mv-classroom-core 真源码 ---- */
vm.runInThisContext(readFileSync(resolve(root, "shared/mv-classroom-core.js"), "utf8"), { filename: "shared/mv-classroom-core.js" });
globalThis.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(agentsText)) });
const MV = globalThis.MVCore;
if (!MV) { console.error("✗ 引擎未暴露 window.MVCore"); process.exit(1); }
await MV.loadAgents();
if (!MV.agentsReady()) { console.error("✗ 画像加载失败"); process.exit(1); }

/* (e) 引擎实跑 × 三课：L1 生效 sm 正向激活者均值上升、零熟悉度者逐人零变化 */
check("(e) 三课实跑：正向激活者 L1 sm 均值上升；零熟悉度者逐人零调制", () => {
  for (const l of lessons) {
    MV.reset({ lessonId: l.lessonId, scenarioId: l.scenarioId });
    const deltas = data.agents.map((a) => {
      const rt = MV.rtOf(a.id);
      const act = MV.activationOf(a.id);
      return { id: a.id, base: a.state_init.speak_motivation, eff: rt.speak_motivation, direction: act.direction, familiarity: act.familiarity };
    });
    const pos = deltas.filter((d) => d.direction > 0);
    const zero = deltas.filter((d) => d.familiarity === 0);
    const meanUp = pos.length ? pos.reduce((s, d) => s + (d.eff - d.base), 0) / pos.length : 0;
    const drifted = zero.filter((d) => d.eff !== d.base);
    if (drifted.length) fail(`${l.lessonId} 零熟悉度者被调制：${drifted.map((d) => d.id).join(",")}`);
    if (pos.length && meanUp <= 0) fail(`${l.lessonId} 正向激活者均值未上升（Δ=${meanUp}）`);
    console.log(`      ${l.lessonId}: 正向 ${pos.length} 人 均值Δsm=+${meanUp.toFixed(4)} · 负向 ${deltas.filter((d) => d.direction < 0).length} 人 · 零熟悉度 ${zero.length} 人逐人零变化 ✓`);
  }
});

/* (f) §7.2 sensitive 判例：B1 × 医保准入课 负向激活 */
check("(f) §7.2 判例：B1 在患者负担议题（he-ch6）激活方向为负，有效 sm 低于 base", () => {
  const he = lessonById["he-ch6-payment-access"];
  const act = EA.activationOf(agentById.B1, he, tables);
  if (act.direction !== -1) fail(`B1 direction=${act.direction}（应 -1；familiarity=${act.familiarity} sensitive=${act.sensitive}）`);
  MV.reset({ lessonId: he.lessonId, scenarioId: he.scenarioId });
  const rt = MV.rtOf("B1");
  if (!(rt.speak_motivation < agentById.B1.state_init.speak_motivation)) {
    fail(`B1 有效 sm ${rt.speak_motivation} 未低于 base ${agentById.B1.state_init.speak_motivation}（sensitive 负向未生效）`);
  }
  console.log(`      B1: familiarity=${act.familiarity.toFixed(4)} sensitive=${act.sensitive} direction=-1 · sm ${agentById.B1.state_init.speak_motivation} → ${rt.speak_motivation.toFixed(4)}（更沉默 ✓）`);
});

/* (f2) §7.2 判例全通过扩展（P4a）：14 条 sensitive 事件逐条探测——
   以该事件自身 tags/role 构造合成课，该事件必为 argmax 且激活方向为负（magnitude>0）。
   一切"经历 = 正向加成"的实现判 bug。 */
check("(f2) §7.2 全量：14 条 sensitive 事件逐条探测，激活方向均为负", () => {
  let n = 0;
  const lines = [];
  for (const a of data.agents) {
    for (const e of a.historyEvents || []) {
      if (!e.sensitive) continue;
      n++;
      const probe = { lessonId: "probe-" + e.id, tags: e.tags, requiredRole: [e.role] };
      const act = EA.activationOf(a, probe, tables);
      if (act.eventId !== e.id) fail(`${a.id} ${e.id} 未成为 argmax（winner=${act.eventId}）——探测课未能隔离该事件`);
      if (act.direction !== -1) fail(`${a.id} ${e.id} direction=${act.direction}（应 -1；sensitive=${act.sensitive} familiarity=${act.familiarity}）`);
      if (!(act.magnitude > 0)) fail(`${a.id} ${e.id} magnitude=0（事件被命中但无强度，方向判定失效）`);
      lines.push(`${a.id}/${e.id.replace("evt_", "")} mag=${act.magnitude.toFixed(4)}`);
    }
  }
  if (n !== 14) fail(`sensitive 事件数 ${n} ≠ 14（事件表被改动，本断言需同步复查）`);
  console.log(`      14 条逐条负向 ✓：${lines.join(" · ")}`);
});

/* (g) 教师点名后仍可响应：默认课实跑，C3/C6 if_called_uncertain beat 各 ≥1 */
check("(g) 点名后仍可响应：C3/C6 各含 ≥1 条 if_called_uncertain beat", () => {
  MV.reset();
  MV.advanceSim(MV.T_CAP);
  const beats = MV.beatsUpTo(MV.T_CAP);
  for (const sid of ["C3", "C6"]) {
    const hits = beats.filter((b) => b.role === "S" && b.who === sid && b.respKey === "if_called_uncertain");
    if (!hits.length) fail(`${sid} 无 if_called_uncertain beat（低安全感学生被点后响应能力丧失）`);
    console.log(`      ${sid}: if_called_uncertain ×${hits.length}（@${hits.map((b) => b.t).join(",")}）`);
  }
});

/* (h) 固定 seed 三次运行逐 beat 一致 */
check("(h) 固定 seed 三次运行逐 beat 一致（sha256）", () => {
  const run = () => {
    MV.reset();
    MV.advanceSim(MV.T_CAP);
    return createHash("sha256").update(JSON.stringify(MV.beatsUpTo(MV.T_CAP))).digest("hex");
  };
  const h1 = run(), h2 = run(), h3 = run();
  if (h1 !== h2 || h2 !== h3) fail(`三次运行哈希不一致：${h1.slice(0, 12)} / ${h2.slice(0, 12)} / ${h3.slice(0, 12)}`);
  console.log(`      sha256=${h1.slice(0, 16)}… ×3 一致`);
});

/* (i) 跨课程角色轮换：三课 top8 两两 jaccard（warning 观察），名单可溯源 */
check("(i) 跨课程轮换：三课 top8 不恒定，逐项得分可溯源", () => {
  const plans = lessons.map((l) => EA.computeEnrichmentPlan(data, l, tables));
  const jacc = (A, B) => {
    const sa = new Set(A), sb = new Set(B);
    let inter = 0;
    sa.forEach((x) => { if (sb.has(x)) inter += 1; });
    return inter / (sa.size + sb.size - inter);
  };
  for (let i = 0; i < plans.length; i++) {
    for (let j = i + 1; j < plans.length; j++) {
      console.log(`      jaccard(${plans[i].lessonId}, ${plans[j].lessonId}) = ${jacc(plans[i].top8, plans[j].top8).toFixed(3)}   [warning 观察指标]`);
      console.log(`        ${plans[i].lessonId} top8: ${plans[i].top8.join(",")}`);
      console.log(`        ${plans[j].lessonId} top8: ${plans[j].top8.join(",")}`);
    }
  }
  const allSame = plans.every((p) => jacc(p.top8, plans[0].top8) === 1);
  if (allSame) fail("三课 top8 完全恒定（角色不轮换，深度预算固化）");
  for (const p of plans) {
    for (const id of p.top8) {
      const parts = p.students[id] && p.students[id].priorityParts;
      if (!parts || typeof parts.scenarioActivation !== "number") fail(`${p.lessonId} top8 成员 ${id} 缺 priorityParts（名单不可溯源）`);
    }
  }
});

/* (j) P5 干预响应矩阵（§14 P5）：同一人 × 不同干预 → 响应方向符合矩阵。
   ① 低安全感沉默学生：直接公开点名效应 < 铺垫（openQ 叠加）后点名；极低者直接点名近无效。
   ② 高/低 F7 在追问（openQ）窗口下增益分化（高正低负，大小有序）。
   ③ 打断式强制点名（teacherCallOn）：高 interrupt_tolerance 者提升大、残留惩罚小（恢复快）。
   断言判方向与大小关系（公式由 JSON 现值推导），不硬编码数值；debugScore 固定噪声分量不消耗 rng。 */
check("(j) 干预响应矩阵：直接 vs 铺垫点名 / F7 追问分化 / 打断恢复差异，方向符合矩阵", () => {
  const errs = [];
  const irOf = (id) => agentById[id].interventionResponse;
  const itOf = (id) => agentById[id].rules.interrupt_tolerance;

  /* ① 低安全感沉默学生（D5：有沉默因果、F4 偏低）：铺垫效应 > 直接效应；D2 直接点名近无效 */
  const d5 = irOf("D5"), d2 = irOf("D2");
  if (!(d5.publicCall.scaffoldedBonus > 0 && d5.publicCall.directMult < 0.35)) errs.push(`D5 矩阵形态异常：direct=${d5.publicCall.directMult} scaf=${d5.publicCall.scaffoldedBonus}`);
  if (!(d2.publicCall.directMult < 0.1)) errs.push(`D2 directMult=${d2.publicCall.directMult}（应近零＝直接公开点名对极低安全感者无效）`);
  if (!(d2.publicCall.scaffoldedBonus > d2.publicCall.directMult)) errs.push("D2 铺垫增益应大于直接效应");
  MV.reset();
  const directScore = MV.debugScore("D5", { t: 620, callSilent: true, called: true });
  const scafScore = MV.debugScore("D5", { t: 620, callSilent: true, openQ: true, called: true });
  if (!(scafScore > directScore)) errs.push(`引擎消费方向反了：铺垫 ${scafScore} 应 > 直接 ${directScore}`);
  console.log(`      ① D5 直接点名 score=${directScore.toFixed(3)} < 铺垫后点名 score=${scafScore.toFixed(3)}（Δ=${(scafScore - directScore).toFixed(3)}=0.8×scaffoldedBonus）；D2 directMult=${d2.publicCall.directMult.toFixed(3)}（近零）`);
  // 行为面佐证（固定 seed）：铺垫窗口内 D5 响应不弱于直接窗口
  MV.reset(); MV.teacherCallSilent(600, 90); MV.advanceSim(760);
  const beatsA = MV.beatsUpTo(760).filter((b) => b.role === "S" && b.who === "D5" && b.t >= 600);
  MV.reset(); MV.teacherOpenQ(560, 130); MV.teacherCallSilent(600, 90); MV.advanceSim(760);
  const beatsB = MV.beatsUpTo(760).filter((b) => b.role === "S" && b.who === "D5" && b.t >= 560);
  if (!(beatsB.length >= beatsA.length)) errs.push(`铺垫后 D5 响应数 ${beatsB.length} < 直接 ${beatsA.length}（方向反）`);
  const firstOf = (arr) => (arr.length ? arr[0].t : Infinity);
  if (!(firstOf(beatsB) <= firstOf(beatsA) || beatsB.length > beatsA.length)) errs.push("铺垫后 D5 首响应更晚且数量未增（方向反）");
  console.log(`      ① 行为面：直接窗口 D5 响应 ${beatsA.length} 次（首@${firstOf(beatsA)}）· 铺垫窗口 ${beatsB.length} 次（首@${firstOf(beatsB)}）`);

  /* ② F7 追问分化：增益符号与排序（F7 两端各 4 人；silent_on 绝对否决者评分为 -Infinity，跳过其差值、
     改以矩阵 gain 符号断言——其引擎语义为"任何干预下都不公开响应"，不参与窗口分化） */
  const byF7 = [...data.agents].sort((a, b) => a.latentFactors.F7.value - b.latentFactors.F7.value);
  const loIds = byF7.slice(0, 4).map((a) => a.id), hiIds = byF7.slice(-4).map((a) => a.id);
  MV.reset();
  const delta = (id) => {
    const s0 = MV.debugScore(id, { t: 620 });
    const s1 = MV.debugScore(id, { t: 620, openQ: true });
    return (isFinite(s0) && isFinite(s1)) ? s1 - s0 : null;
  };
  const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const dLo = loIds.map(delta).filter((x) => x != null), dHi = hiIds.map(delta).filter((x) => x != null);
  if (!dLo.length || !dHi.length) errs.push("F7 两端可评分样本不足（全被 silent_on 否决）");
  else {
    if (!(mean(dHi) > 0)) errs.push(`高 F7 追问增益均值 ${mean(dHi)} 应为正`);
    if (!(mean(dHi) > mean(dLo))) errs.push(`分化失败：高 F7 增益 ${mean(dHi)} 应 > 低 F7 ${mean(dLo)}`);
  }
  if (!(irOf(byF7[0].id).openQProbe.gain < 0)) errs.push(`最低 F7（${byF7[0].id}）gain 应为负（追问压力下退缩），实 ${irOf(byF7[0].id).openQProbe.gain}`);
  if (!(irOf(byF7[byF7.length - 1].id).openQProbe.gain > irOf(byF7[0].id).openQProbe.gain)) errs.push("矩阵 gain 排序失败");
  console.log(`      ② 高 F7（${hiIds}）追问增益 ${dHi.map((x) => x.toFixed(3))} > 低 F7（${loIds}）${dLo.map((x) => x.toFixed(3))}；最低 F7 ${byF7[0].id} gain=${irOf(byF7[0].id).openQProbe.gain}（负）`);

  /* ③ 打断式强制点名恢复差异：可发言者中 it 最高 vs 最低
     （D2 silent_on=["所有"]/C1=["所有公开发言"] 为绝对否决语义——任何干预下不公开响应，其
     interrupt_tolerance 仍参与 CallOn 提升缩放但 scoreDesire 前置否决；本断言取可发言者） */
  const VETO = (a) => (a.rules.silent_on || []).some((r) => r.includes("几乎从不") || r === "所有公开发言" || r === "所有" || r.includes("从未成功"));
  const PUBKEY = /private|internal|intended|post_class|small_group|report_text|if_anonymous|if_regulatory|reflection_sheet/;
  const hasPub = (a) => Object.keys(a.responses || {}).some((k) => !PUBKEY.test(k)); // 无公开语料键者分数再高也产不出 beat（A8 型）
  const speakable = data.agents.filter((a) => !VETO(a) && hasPub(a));
  const byIt = [...speakable].sort((a, b) => itOf(a.id) - itOf(b.id));
  const lo = byIt[0].id, hi = byIt[byIt.length - 1].id;
  const SPEAK_COST = 0.15; // genOneBeat:applyAgentFx 的通用发言成本（与 P5 残留惩罚叠加，须剔除再比）
  const trial = (id) => {
    MV.reset();
    const before = MV.rtOf(id).speak_motivation;
    MV.teacherCallOn(id);
    const lifted = MV.rtOf(id).speak_motivation;
    const expect = Math.max(before, 0.55 + 0.45 * itOf(id));
    let residual = null;
    MV.advanceSim(MV.T_CAP, (b) => { if (residual == null && b.role === "S" && b.who === id) residual = MV.rtOf(id).speak_motivation; });
    return { before, lifted, expect, residual };
  };
  const tHi = trial(hi), tLo = trial(lo);
  if (Math.abs(tHi.lifted - tHi.expect) > 1e-9 || Math.abs(tLo.lifted - tLo.expect) > 1e-9) errs.push(`CallOn 提升幅度未按 interrupt_tolerance 缩放：${hi} ${tHi.lifted}≠${tHi.expect} / ${lo} ${tLo.lifted}≠${tLo.expect}`);
  if (!(tHi.lifted > tLo.lifted)) errs.push(`提升幅度方向反：${hi}(it=${itOf(hi)}) ${tHi.lifted} 应 > ${lo}(it=${itOf(lo)}) ${tLo.lifted}`);
  if (tHi.residual == null || tLo.residual == null) errs.push(`被强制点名者未发言：${hi} residual=${tHi.residual} ${lo} residual=${tLo.residual}`);
  else {
    const dipHi = (tHi.lifted - SPEAK_COST) - tHi.residual, dipLo = (tLo.lifted - SPEAK_COST) - tLo.residual;
    if (!(dipLo > dipHi)) errs.push(`恢复差异方向反：${lo} 残留惩罚 ${dipLo.toFixed(3)} 应 > ${hi} ${dipHi.toFixed(3)}`);
    if (Math.abs(dipHi - 0.25 * (1 - itOf(hi))) > 0.02 || Math.abs(dipLo - 0.25 * (1 - itOf(lo))) > 0.02) errs.push(`残留惩罚与 0.25×(1−it) 公式不符：${hi} ${dipHi.toFixed(3)} / ${lo} ${dipLo.toFixed(3)}`);
    console.log(`      ③ ${hi}(it=${itOf(hi)}) 提升 ${tHi.before.toFixed(2)}→${tHi.lifted.toFixed(3)} 残留 ${dipHi.toFixed(3)} · ${lo}(it=${itOf(lo)}) 提升 ${tLo.before.toFixed(2)}→${tLo.lifted.toFixed(3)} 残留 ${dipLo.toFixed(3)}（低容忍恢复慢 ✓；D2 为绝对否决语义不在样本内）`);
  }
  if (errs.length) fail(errs.join("；"));
});

const isAsyncOk = await Promise.resolve(true);
if (!isAsyncOk) process.exit(1);
if (failures.length) {
  console.error(`\n${failures.length} 项失败：`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("\n全部断言通过（(a)-(j) · P3 全量点亮 / P4a §7.2 扩展 / P5 干预矩阵）。");
