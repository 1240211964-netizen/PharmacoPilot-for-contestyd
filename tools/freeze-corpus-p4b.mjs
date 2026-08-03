#!/usr/bin/env node
/* ============================================================
 *  P4b · 冻结入库 · freeze-corpus-p4b.mjs（一次性迁移脚本，可重复验尸）
 *
 *  输入：migration/persona-v2-corpus-staging.json（用户 2026-08-03 已签收：
 *        67 条保留现长 + 7 键打回重生成完毕）+ shared/virtual-class-agents.json
 *  动作：
 *    1. staging 语料写回 responses.*（形状逐键保持；6 条偏长项标注"用户裁定保留"）；
 *    2. 社交图 13 删 3 增 + 全部 36 边补 graph.derivedFrom（文档行号）；
 *    3. _meta.corpus_provenance（模型/参数/模板版本/签收/打回清单/freezeHash）；
 *    4. _meta._field_consumers 登记 graph.derivedFrom 与 _meta.corpus_provenance；
 *    5. version → virtual-class-agents-v0.6、simVersion → sim-1.4.0；
 *    6. 行为对照三段证据（双 vm 防哑法）：
 *       A 语料换入零结构变化（beat 计数 + (t,who,respKey) 签名逐字节不变，且语料 beat 文本真变）；
 *       B 社交图白名单 diff（t<308 前缀必须逐字节一致；差异逐 beat 归因）；
 *       C 升版后新基线三重跑取证。
 *  产出：改写 shared/virtual-class-agents.json；备份旧版至 migration/persona-v0_5-pre-p4b-backup.json。
 * ============================================================ */
import { readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import crypto from "node:crypto";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const AGENTS_PATH = resolve(ROOT, "shared/virtual-class-agents.json");
const STAGING_PATH = resolve(ROOT, "migration/persona-v2-corpus-staging.json");
const BACKUP_PATH = resolve(ROOT, "migration/persona-v0_5-pre-p4b-backup.json");
const APPLY = process.argv.includes("--apply");

/* ---- 社交图裁决（2026-08-03 签收）：13 删 3 增，逐边 derivedFrom 文档行号 ---- */
const DELETE_EDGES = [
  ["C1", "ally", "C2"], ["C1", "ally", "C3"], ["C1", "ally", "C4"],
  ["C2", "ally", "C1"], ["C2", "ally", "C3"],
  ["C3", "ally", "C1"],
  ["C4", "ally", "C1"], ["C4", "ally", "C3"],
  ["C5", "ally", "C1"],
  ["A1", "ally", "A5"], ["A2", "ally", "A6"], ["A3", "ally", "A2"], ["A1", "rival", "B2"],
];
const ADD_EDGES = [
  ["B7", "ally", "A4"], ["C1", "ally", "D5"], ["A1", "rival", "B3"],
];
/* 36 边 derivedFrom（行号 = 虚拟班32人数据.md；据 output/design-drafts/persona-v2-social-graph-review.md 逐边复查表） */
const DERIVED_FROM = {
  "A1>A2": "L96 互动对象「A2×4（同盟+补充）」；L126 A2 跟进 A1",
  "A1>A3": "L165 A3 侧互动「A1×2」（单向互证）",
  "A1>B1": "L88 反驳 B1；L89 提问→B1；L96「B1×3 质疑+追问」；KM-01 L1052",
  "A1>B3": "L96 互动对象「B3×2（引用反驳）」（2026-08-03 签收新增）",
  "A2>A1": "L126 跟进 A1；L131/L133「A1×4」",
  "A2>A5": "L133「A5×2」；L227 A5 侧「A2×3」（双向互证）",
  "A2>B2": "L129 提问→B2；L133「B2×2」；L381 B2 侧「A2×2」（双向互证）",
  "A3>A1": "L165「A1×2」",
  "A3>B4": "L165「B4×2」；L438 B4 提问→A3（对抗性）；L442「A3×1」",
  "A4>A6": "L196「A6×2」",
  "A5>A2": "L227「A2×3」",
  "A5>A3": "L227「A3×2」",
  "A6>A4": "L196 A4 侧「A6×2」（单向互证）",
  "A8>A1": "L309 小组内低声「A1 说的有道理」；L314「A1×1（仅小组内）」；L320 课后私下向 A1 提问",
  "B1>B2": "L348「B2×3」；L381 B2 侧「B1×3」（双向互证）",
  "B1>B4": "L348「B4×2」；L442 B4 侧「B1×2」（双向互证）",
  "B1>B6": "L500 B6 侧「B1×2」（单向互证）；KM-03 L1054「B1 提出 → B6/B4 强化」",
  "B1>A1": "L341「A1 反驳后」；KM-01 L1052 立场冲突核心",
  "B1>A2": "L342 A2「7 倍覆盖」触发情境追问；L348「A2×2」",
  "B2>B1": "L381「B1×3」（双向互证）",
  "B2>A2": "L375 反诘 A 组；L381「A2×2」；L129 A2 提问→B2",
  "B2>A5": "L381「A5×1」；语义闭环：L375 反诘「BE 80-125%」↔ L222 A5 援引「BE 90%CI 80-125%」",
  "B3>B1": "L413「B1×2」；L411「听 B1/B2 定调」",
  "B3>B4": "L413「B4×1」",
  "B3>A3": "L408「反驳 A3：通知到位也无济于事」",
  "B4>B1": "L442「B1×2」（双向互证）",
  "B4>B6": "L442「B6×1」；L500 B6 侧「B4×1」（双向互证）",
  "B4>A3": "L438 提问→A3「国办文件里有没有规定换药的临床观察义务？」",
  "B5>B3": "L471「B3×1」",
  "B6>B1": "L500「B1×2」",
  "B6>B2": "L500「B2×1」",
  "B7>A4": "L524 B7 提问→A 组；L528「A4×1（A4 接住了她的问题）」（2026-08-03 签收新增）",
  "B8>B7": "L556「B7×1（同组）」",
  "C1>D5": "L587/L591 与同桌 D5 低声交流；L926/L931 D5 侧互证（2026-08-03 签收新增）",
  "C3>A2": "L646 小组报告稿「全是 C3 写的但是 A2 念的」；L650「A2×2（小组内）」",
  "D5>C1": "L926 接 C1 低声交流；L931「C1×1（小组内）」；L587/L591 C1 侧互证",
};
const USER_KEPT_LONG = ["B1.anchor_argument", "B1.case_support", "B1.proposal", "B1.rhetorical_question", "B6.domain_point", "B6.technical"];
const REGEN_KEYS = ["A1.question_other", "A6.situational", "B2.case_data", "D3.if_called", "D3.reflection_sheet", "A1.forced_silent_break", "D5.if_nudged"];

/* ---- freezeHash：responses 规范化序列化（verify-agent-persona (s) 同算法复算，两处须同步） ---- */
function corpusHash(agents) {
  const norm = agents.map((a) => {
    const r = a.responses || {};
    const keys = Object.keys(r).sort();
    return [a.id, keys.map((k) => [k, r[k]])];
  });
  return crypto.createHash("sha256").update(JSON.stringify(norm)).digest("hex");
}

function main() {
  const data = JSON.parse(readFileSync(AGENTS_PATH, "utf8"));
  const staging = JSON.parse(readFileSync(STAGING_PATH, "utf8"));
  if (data._meta.version !== "virtual-class-agents-v0.5") {
    console.error(`版本前置检查失败：_meta.version=${data._meta.version}（应 v0.5；重复执行请先还原备份）`);
    process.exit(1);
  }

  /* 0. staging 完备性门禁：74 键全 generated/preserved，无 rejected/failed */
  const bad = [];
  for (const a of data.agents) {
    for (const key of Object.keys(a.responses || {})) {
      const e = staging.students[a.id] && staging.students[a.id].keys[key];
      if (!e) bad.push(`${a.id}.${key}: staging 缺条目`);
      else if (e.status !== "generated" && e.status !== "preserved") bad.push(`${a.id}.${key}: status=${e.status}`);
    }
  }
  if (bad.length) { console.error("staging 未完备，禁止冻结：\n  " + bad.join("\n  ")); process.exit(1); }

  /* 1. 行为对照 A：语料换入零结构变化（双 vm 防哑法） */
  const coreSrc = readFileSync(resolve(ROOT, "shared/mv-classroom-core.js"), "utf8");
  function freshMV(agentsData) {
    const sb = { console };
    sb.window = sb; sb.globalThis = sb;
    sb.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(JSON.stringify(agentsData))) });
    vm.createContext(sb);
    vm.runInContext(coreSrc, sb, { filename: "shared/mv-classroom-core.js" });
    return sb.MVCore;
  }
  async function run(d) {
    const MV = freshMV(d);
    await MV.loadAgents(); MV.reset(); MV.advanceSim(MV.T_CAP);
    return MV.beatsUpTo(MV.T_CAP);
  }
  const sig = (beats) => crypto.createHash("sha256").update(beats.map((b) => `${b.t}|${b.who}|${b.respKey || ""}`).join("\n")).digest("hex");

  return (async () => {
    const stage0 = JSON.parse(JSON.stringify(data)); // v0.5 原样
    const beats0 = await run(stage0);

    /* 语料换入（内存态 stage1） */
    const stage1 = JSON.parse(JSON.stringify(stage0));
    for (const a of stage1.agents) {
      for (const key of Object.keys(a.responses || {})) {
        const e = staging.students[a.id].keys[key];
        if (e.status === "generated") a.responses[key] = e.new;
      }
    }
    const beats1 = await run(stage1);
    const textsChanged = beats0.filter((b, i) => b.role === "S" && b.text !== beats1[i].text).length;
    const corpusOK = beats0.length === beats1.length && sig(beats0) === sig(beats1) && textsChanged > 0;
    console.log(`A 语料换入：beats ${beats0.length}→${beats1.length} · (t,who,respKey) 签名 ${sig(beats0).slice(0, 16)}… ${sig(beats0) === sig(beats1) ? "逐字节一致" : "不一致！"} · 语料 beat 文本变更 ${textsChanged} 条（防哑：>0）`);
    if (!corpusOK) { console.error("A 段失败：语料换入改变了 beat 结构——打回"); process.exit(1); }

    /* 2. 行为对照 B：社交图白名单 diff（stage2 = stage1 + 图改动）
       机制说明（core:621-637 nudgeStances + 463-479 scoreDesire）：图边在每条 beat 后
       影响全部听者立场拉力（ally +0.35 / rival −0.55）与发言者近期盟友/对手加成，
       立场轨迹自首个涉及边即开始漂移——不存在"前 N 拍无差异"的干净前缀。
       故白名单采用逐边隔离归因：9 条 C 内同盟（组）须零差异；其余 7 边逐边单独取证。 */
    const stage2 = JSON.parse(JSON.stringify(stage1));
    const byId = Object.fromEntries(stage2.agents.map((a) => [a.id, a]));
    const applyEdges = (d, dels, adds) => {
      const m = Object.fromEntries(d.agents.map((a) => [a.id, a]));
      for (const [id, kind, target] of dels) {
        const list = kind === "ally" ? m[id].graph.allies : m[id].graph.rivals;
        const i = list.indexOf(target);
        if (i < 0) { console.error(`待删边不存在：${id}→${target}（${kind}）`); process.exit(1); }
        list.splice(i, 1);
      }
      for (const [id, kind, target] of adds) {
        const list = kind === "ally" ? m[id].graph.allies : m[id].graph.rivals;
        if (list.includes(target)) { console.error(`待增边已存在：${id}→${target}`); process.exit(1); }
        list.push(target);
      }
    };
    applyEdges(stage2, DELETE_EDGES, ADD_EDGES);
    const beats2 = await run(stage2);
    /* B1 硬门禁：9 条 C 内同盟删除 → 逐字节零差异（C 无人作发言者影响他人、C1/C2/C4/C5
       被删边永不触发——自身 0 beat，C3 被删的 C1 边对应 C1 亦 0 beat） */
    const C_DEL = DELETE_EDGES.filter(([id]) => id.startsWith("C"));
    const sC = JSON.parse(JSON.stringify(stage1)); applyEdges(sC, C_DEL, []);
    const beatsC = await run(sC);
    const cOK = JSON.stringify(beats1) === JSON.stringify(beatsC);
    console.log(`B1 白名单·C 内同盟 9 删：${cOK ? "逐字节零差异 ✓（预期近零影响成立）" : "✗ 出现差异——白名单外，失败"}`);
    if (!cOK) { console.error("B 段失败：C 内同盟删除本应零影响"); process.exit(1); }
    /* B2 逐边隔离归因（4 删推定边 + 3 增） */
    console.log("B2 白名单·逐边隔离归因（每条边单独换入跑一遍，对照 stage1）：");
    const isoEdges = [
      ...DELETE_EDGES.filter(([id]) => !id.startsWith("C")).map((e) => [[e], []]),
      ...ADD_EDGES.map((e) => [[], [e]]),
    ];
    for (const [dels, adds] of isoEdges) {
      const sx = JSON.parse(JSON.stringify(stage1)); applyEdges(sx, dels, adds);
      const bx = await run(sx);
      let first = -1, nd = 0;
      const n = Math.max(beats1.length, bx.length);
      for (let i = 0; i < n; i++) {
        const a = beats1[i], b = bx[i];
        if (JSON.stringify(a) !== JSON.stringify(b)) { nd++; if (first < 0) first = i; }
      }
      const label = (dels[0] ? `删 ${dels[0][0]}→${dels[0][2]}(${dels[0][1]})` : `增 ${adds[0][0]}→${adds[0][2]}(${adds[0][1]})`);
      console.log(`  ${label.padEnd(22)} → ${nd === 0 ? "零差异" : `差异 ${nd} 拍，首分叉 [${first}] ${first >= 0 ? (beats1[first] ? `${beats1[first].t}|${beats1[first].who}` : "∅") + " → " + (bx[first] ? `${bx[first].t}|${bx[first].who}` : "∅") : ""}`}`);
    }
    /* B3 合并版确定性 + 教师/系统 beat 不变门禁 */
    const beats2b = await run(stage2);
    const detOK = JSON.stringify(beats2) === JSON.stringify(beats2b);
    const sysOK = JSON.stringify(beats1.filter((b) => b.role !== "S").map((b) => [b.t, b.kind, b.text])) === JSON.stringify(beats2.filter((b) => b.role !== "S").map((b) => [b.t, b.kind, b.text]));
    console.log(`B3 合并：beats ${beats1.length}→${beats2.length} · 二次运行一致=${detOK} · 教师/系统 beat 序列不变=${sysOK}`);
    if (!detOK || !sysOK) { console.error("B 段失败：合并版不确定或系统 beat 被扰动"); process.exit(1); }
    let diffN = 0;
    const maxLen = Math.max(beats1.length, beats2.length);
    for (let i = 0; i < maxLen; i++) {
      const b = beats1[i], c = beats2[i];
      const k1 = b ? `${b.t}|${b.who}|${b.respKey || ""}` : "∅";
      const k2 = c ? `${c.t}|${c.who}|${c.respKey || ""}` : "∅";
      if (k1 !== k2) { diffN++; if (diffN <= 8) console.log(`  diff#${diffN} [${i}] ${k1}  →  ${k2}`); }
    }
    console.log(`  (t,who,respKey) 序列差异共 ${diffN} 处（归因见 B2 逐边表）`);

    /* 3. 升版 + 写回（stage3） */
    const final = stage2;
    for (const a of final.agents) {
      /* derivedFrom 全量落边 */
      const g = a.graph;
      g.derivedFrom = {};
      for (const t of g.allies) {
        const k = `${a.id}>${t}`;
        if (!DERIVED_FROM[k]) { console.error(`缺 derivedFrom：${k}`); process.exit(1); }
        g.derivedFrom[k] = DERIVED_FROM[k];
      }
      for (const t of g.rivals) {
        const k = `${a.id}>${t}`;
        if (!DERIVED_FROM[k]) { console.error(`缺 derivedFrom：${k}`); process.exit(1); }
        g.derivedFrom[k] = DERIVED_FROM[k];
      }
      /* basis 文案同步（成员变动者） */
      if (a.id === "C1") { g.ally_basis = "同桌低声交流互证（文档 L587/L591/L926/L931）"; }
      if (a.id === "C3") { g.ally_basis = "小组内协作（报告稿 C3 写、A2 念）"; }
      if (["C2", "C4", "C5"].includes(a.id)) g.ally_basis = "";
      if (a.id === "A1") g.rival_basis = "立场对立（医保 vs 慢病家属 · KM-01）";
    }
    const hash = corpusHash(final.agents);
    final._meta.corpus_provenance = {
      frozenAt: new Date().toISOString().slice(0, 10),
      stage: "P4b 冻结入库（三段式：staging → 用户签收 → 冻结）",
      userSignoff: "2026-08-03：67 条保留现长 + 7 键打回重生成后入库；社交图 13 删 3 增同批落地",
      model: staging.provenance.model,
      endpoint: staging.provenance.endpoint,
      temperature: staging.provenance.temperature,
      maxTokens: staging.provenance.maxTokens,
      promptTemplateVersions: "v1 首轮 54 条 / v1.5 禁英文双引号续跑 20 条 / v2 P4b 打回重生成（+文号禁令+长度/问句条款）；模板全文见 staging provenance.promptTemplate",
      regeneratedKeys: REGEN_KEYS,
      userKeptLongKeys: USER_KEPT_LONG.map((k) => `${k}（偏长·用户裁定保留 2026-08-03）`),
      preservedKeys: ["D2.if_called（刻意沉默「…」原样保留）"],
      stagingFile: "migration/persona-v2-corpus-staging.json",
      freezeHash: hash,
      freezeHashAlgorithm: "sha256(JSON.stringify(agents.map(a=>[a.id, keys(responses).sort().map(k=>[k, responses[k]])]))) · tools/freeze-corpus-p4b.mjs 与 verify-agent-persona (s) 同算法",
    };
    final._meta._field_consumers.fields["graph.derivedFrom"] = { consumer: "derived", use: "社交图边文档依据（行号）；verify-agent-persona (t) 门禁；P4b 社交图复查落地" };
    final._meta._field_consumers.fields["_meta.corpus_provenance"] = { consumer: "derived", use: "语料冻结溯源（模型/参数/签收/freezeHash）；verify-agent-persona (s) 一致性门禁" };
    final._meta.version = "virtual-class-agents-v0.6";
    final._meta.simVersion = "sim-1.4.0";

    /* 4. 行为对照 C：新基线三重跑（升版改变 seedString，预期全面 reshuffle） */
    const run3 = async () => { const MV = freshMV(final); await MV.loadAgents(); MV.reset(); MV.advanceSim(MV.T_CAP); return MV.beatsUpTo(MV.T_CAP); };
    const b31 = await run3(), b32 = await run3(), b33 = await run3();
    const h = (b) => crypto.createHash("sha256").update(JSON.stringify(b)).digest("hex");
    const h31 = h(b31), h32 = h(b32), h33 = h(b33);
    const MVi = freshMV(final); await MVi.loadAgents(); MVi.reset();
    const seedInfo = MVi.getSeedInfo();
    console.log(`C 新基线：seedString=${seedInfo.seedString}`);
    console.log(`  v0.6/sim-1.4.0 run-0：${b31.length} beats sha256=${h31}`);
    console.log(`  三重跑一致：${h31 === h32 && h32 === h33 ? "✓（×3 逐字节一致）" : "✗ 不一致！"}`);
    if (!(h31 === h32 && h32 === h33)) { console.error("C 段失败：新基线三次运行不一致"); process.exit(1); }
    const MVr = freshMV(final); await MVr.loadAgents(); MVr.reset({ runSeed: "run-1" }); MVr.advanceSim(MVr.T_CAP);
    const hRun1 = h(MVr.beatsUpTo(MVr.T_CAP));
    console.log(`  run-1 可区分：${hRun1 !== h31 ? "✓" : "✗"}（${hRun1.slice(0, 16)}…）`);

    if (!APPLY) {
      console.log("\n[dry-run] 未写盘。实冻：node tools/freeze-corpus-p4b.mjs --apply");
      console.log(`（写盘将：备份 v0.5 → migration/persona-v0_5-pre-p4b-backup.json；freezeHash=${hash.slice(0, 16)}…）`);
      return;
    }
    if (!existsSync(BACKUP_PATH)) copyFileSync(AGENTS_PATH, BACKUP_PATH);
    writeFileSync(AGENTS_PATH, JSON.stringify(final, null, 2) + "\n");
    console.log(`\n已冻结入库：${AGENTS_PATH}`);
    console.log(`备份：${BACKUP_PATH} · freezeHash=${hash}`);
  })();
}

await main();
