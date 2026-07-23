/* ============================================================
 *  虚拟教室 · 仿真核心  mv-classroom-core.js   (2026-06-02)
 *  纯数据 + 规则引擎，无任何 DOM —— 供 3D 渲染器
 *  (metaverse-classroom-3d.js) 与 2.5D 回退渲染器
 *  (metaverse-classroom.js) 共用，作为唯一真相来源。
 *
 *  暴露：window.MVCore
 *  数据源：虚拟班32人数据.md · shared/virtual-class-agents.json
 *
 *  设计铁律（沿用旧实现）：
 *   - 立场反应离线"烘焙"(STANCE_BAKED)，运行时只回放/推演，
 *     无实时 LLM 调用 → 可复现、零成本。
 *   - t≤132 用手写 SCRIPT；t>132 由 32-agent 规则决策动态生成，
 *     可响应教师动作(点名 / 抛问题) → 这就是"自由仿真"的大脑。
 * ============================================================ */
(function () {
  "use strict";

  /* ---------- 1 · 32 人数据集 ---------- */
  // state: live(正在发言) / active(已发声) / quiet(全程沉默) / silent(策略性沉默) / neutral(倾听)
  const STUDENTS = [
    { id: "A1", name: "沈语晴", str: 5, init: "active", note: "市医保局实习 · 首发核心论证" },
    { id: "A2", name: "赵子轩", str: 4, init: "active", note: "社区医院见习 · 量化补强" },
    { id: "A3", name: "林婉清", str: 4, init: "active", note: "县医保办 · 引用国办文件" },
    { id: "A4", name: "周诗涵", str: 3, init: "active", note: "商保实习 · DRG 视角" },
    { id: "A5", name: "陈思源", str: 3, init: "active", note: "援引一致性评价数据" },
    { id: "A6", name: "黄宇恒", str: 3, init: "active", note: "药店连锁 · 零售视角" },
    { id: "A7", name: "刘晓彤", str: 3, init: "active", note: "反思深度小结" },
    { id: "A8", name: "郑明宇", str: 2, init: "neutral", note: "全程倾听 · 被动同意" },
    { id: "B1", name: "叶清涵", str: 5, init: "active", note: "父亲糖尿病 10 年 · 引爆替代焦虑" },
    { id: "B2", name: "吴语桐", str: 4, init: "active", note: "外婆抗凝 · 窄治疗窗案例" },
    { id: "B3", name: "高梓铭", str: 4, init: "active", note: "母亲高血压 · 谷峰差异" },
    { id: "B4", name: "许若曦", str: 4, init: "active", note: "父亲支架术后 · 病友群证据" },
    { id: "B5", name: "曹一然", str: 3, init: "active", note: "爷爷帕金森 · 老年依从性" },
    { id: "B6", name: "邓嘉禾", str: 4, init: "active", note: "母亲乳腺癌 · 内分泌连续性" },
    { id: "B7", name: "姚梦琪", str: 3, init: "active", note: "外公肾病 · eGFR 监测" },
    { id: "B8", name: "魏景然", str: 2, init: "neutral", note: "奶奶多重慢病 · 仅小组内" },
    { id: "C1", name: "蒋亦舟", str: 4, init: "silent", note: "父亲外资药代 · 怕被贴标签" },
    { id: "C2", name: "白雨桐", str: 4, init: "silent", note: "母亲恒瑞研究院 · 举手 2 次未被点" },
    { id: "C3", name: "夏梓晗", str: 3, init: "silent", note: "姨妈百济 · 小组内说全班退场" },
    { id: "C4", name: "罗予安", str: 4, init: "silent", note: "豪森实习 · 怕显得挺企业" },
    { id: "C5", name: "邱钰泽", str: 3, init: "silent", note: "父亲民营药企 · 5 次插话被抢" },
    { id: "C6", name: "段雨菲", str: 3, init: "silent", note: "药代实习 · 二元对立无切入点" },
    { id: "C7", name: "于子昂", str: 3, init: "silent", note: "家中原料药厂 · 策略性沉默" },
    { id: "C8", name: "汪嘉宁", str: 2, init: "silent", note: "母亲药监 · 角色混合困惑" },
    { id: "D1", name: "邹清歌", str: 1, init: "quiet", note: "内向 + 普通话不自信" },
    { id: "D2", name: "季文渊", str: 1, init: "quiet", note: "前置知识缺口" },
    { id: "D3", name: "温佳琪", str: 1, init: "quiet", note: "等待点名 · 反思单丰富" },
    { id: "D4", name: "裴沐辰", str: 1, init: "quiet", note: "今日身体不适 · 异常值" },
    { id: "D5", name: "傅妍希", str: 2, init: "neutral", note: "被推举后说 1 句" },
    { id: "D6", name: "侯子健", str: 2, init: "neutral", note: "代表小组念结论" },
    { id: "D7", name: "钱悦心", str: 2, init: "neutral", note: "提澄清类问题" },
    { id: "D8", name: "龚一鸣", str: 2, init: "neutral", note: "被点名说 1 句" },
  ];
  const byId = Object.fromEntries(STUDENTS.map((s) => [s.id, s]));

  /* ---------- 2 · 立场反应烘焙表（离线烘焙，运行时回放） ----------
   * t = 立场归宿(-1 反对替代 … +1 支持替代)；m = 易动度(0…1)；why = tooltip 理由 */
  const STANCE_BAKED = {
    A1:{t: 0.85,m:0.12,why:"医保局实习，成本与可及性是信念锚，几乎不动"},
    A2:{t: 0.55,m:0.35,why:"数字派，但见习时对老人的同情让他能被患者叙事软化"},
    A3:{t: 0.65,m:0.25,why:"县医保办见过基层乱象，按文件办但留余地"},
    A4:{t: 0.45,m:0.45,why:"商保 / DRG 视角，渴望被听见，易被强论证带动"},
    A5:{t: 0.50,m:0.40,why:"靠数据，理解逻辑后会微调"},
    A6:{t: 0.50,m:0.40,why:"药店连锁零售视角，务实可动"},
    A7:{t: 0.40,m:0.50,why:"反思型，整堂下来才定，向多数靠"},
    A8:{t: 0.25,m:0.70,why:"被动同意，随场上强者 / 共识漂"},
    B1:{t:-0.90,m:0.10,why:"父亲糖尿病 10 年，亲历替代焦虑，立场坚如磐石"},
    B2:{t:-0.80,m:0.18,why:"外婆抗凝窄治疗窗，专业自信，难撼动"},
    B3:{t:-0.75,m:0.20,why:"母亲高血压谷峰差异，切身且有据"},
    B4:{t:-0.70,m:0.25,why:"父亲支架、病友群证据，对纯成本论逆反"},
    B5:{t:-0.60,m:0.35,why:"爷爷帕金森老年依从，切身但论证稍弱"},
    B6:{t:-0.75,m:0.20,why:"母亲乳腺癌内分泌连续性，见过代价"},
    B7:{t:-0.55,m:0.40,why:"外公肾病 eGFR，有意愿但怕太专业"},
    B8:{t:-0.40,m:0.60,why:"奶奶多重慢病，想说说不清，易被同组带"},
    C1:{t:-0.25,m:0.20,why:"父亲外资药代，懂质量水分，私下偏审慎但怕标签噤声"},
    C2:{t:-0.10,m:0.30,why:"母亲恒瑞研究院，既信创新又知研发成本，矛盾居中"},
    C3:{t:-0.15,m:0.30,why:"姨妈百济，深度思考但角色焦虑，缓慢偏审慎"},
    C4:{t: 0.00,m:0.25,why:"豪森实操懂两面，自我审查，停在中间"},
    C5:{t:-0.10,m:0.35,why:"民营药企，插话总被抢，倾向被压抑"},
    C6:{t: 0.00,m:0.30,why:"觉得二元框架不友好，骑墙"},
    C7:{t:-0.20,m:0.15,why:"家中原料药厂，知供应与质量，策略性沉默几乎不动"},
    C8:{t:-0.05,m:0.30,why:"母亲药监，监管双重身份，谨慎居中"},
    D1:{t:-0.10,m:0.75,why:"内向不自信，共情把他往患者侧轻推"},
    D2:{t: 0.00,m:0.80,why:"知识缺口，跟着场上最强声漂"},
    D3:{t:-0.35,m:0.50,why:"反思单丰富，其实有偏患者侧的真知，只等被点名"},
    D4:{t:-0.05,m:0.05,why:"今日身体不适，几乎不参与、不移动（异常值）"},
    D5:{t:-0.05,m:0.60,why:"被推举才说，立场不确信，易动"},
    D6:{t: 0.10,m:0.55,why:"代表小组念结论，跟任务 / 多数走"},
    D7:{t: 0.00,m:0.60,why:"提澄清问题，愿学，向更清晰一方靠"},
    D8:{t: 0.00,m:0.60,why:"被点名说一句，真实立场未明，易动"},
  };

  function traitOf(s) {
    if (s.init === "silent") return "silent";
    if (s.init === "quiet") return "quiet";
    return "neutral";
  }
  const PROJECTION_SPOKEN = STUDENTS.filter((s) => s.init === "active").map((s) => s.id);

  /* ---------- 3 · 剧本时间轴(t≤132 手写) ---------- */
  const SCRIPT = [
    { t: 0,   kind: "marker", text: "问题链 · 第 1 题 — 三选一锚点" },
    { t: 18,  kind: "line", role: "A", text: "已附数据源：国办发〔2019〕2 号 · 集采公告 · 3 份院方匿名替代记录。" },
    { t: 35,  kind: "line", role: "T", text: "看到这张图，你最先注意到——药价、厂家，还是患者反应？" },
    { t: 48,  kind: "line", role: "S", who: "A1", text: "先看到价格——原研降到这个价位真的有点意外。", bubble: "先看到价格…" },
    { t: 54,  kind: "line", role: "S", who: "A2", text: "对，这个降幅是政策推动的，不是市场自然降的。", bubble: "政策推动的降幅" },
    { t: 60,  kind: "line", role: "S", who: "B1", text: "我注意的是患者——降价之后会不会被要求换药？", bubble: "会不会被换药？" },
    { t: 66,  kind: "line", role: "S", who: "A3", text: "国办发〔2019〕2 号写的是「量价挂钩」。", bubble: "量价挂钩" },
    { t: 84,  kind: "marker", text: "问题链 · 第 3 题 — 分歧锚点" },
    { t: 98,  kind: "line", role: "T", text: "如果你是医院药事委员会，会优先采购原研还是仿制？依据什么？" },
    { t: 98,  kind: "line", role: "S", who: "A1", text: "仿制——通过一致性评价就等同临床。", bubble: "一致性评价 = 等同临床" },
    { t: 108, kind: "line", role: "S", who: "B1", text: "但已用原研 2 年的患者怎么办？替代焦虑是真问题。", bubble: "替代焦虑是真问题" },
    { t: 115, kind: "line", role: "S", who: "A2", text: "医保已经为这个降价付了对应的预算，再开口子就乱了。", bubble: "预算已对应" },
    { t: 118, kind: "line", role: "S", who: "B2", text: "华法林 INR 窗口很窄，不同厂家颗粒分布会影响吸收。", bubble: "INR 窗口很窄" },
    { t: 120, kind: "silence", group: "C", text: "8 位有药企背景的同学都有表达意图，却都没发声——未被点名 + 议题二元对立 + 自我审查。" },
    { t: 125, kind: "note", role: "A", text: "⚠ 检测到结构性立场对立（成本可及 vs 患者连续性）——建议追问双方各自的证据来源。", km: "KM-01" },
    { t: 132, kind: "line", role: "T", text: "好——先别急着站队，每人从你最真实的处境说一句：你最担心的是什么？5 分钟后我们看分歧落在哪。" },
  ];
  const T_CAP = 2700; // 45 min

  const TEACHER_BEATS = [
    { t: 285,  text: "我注意到 B 组提到了长期依从性——这是 plan 里没设的维度。" },
    { t: 475,  text: "很好。下一题——谁来从临床安全角度补充？", openQ: true },
    { t: 900,  text: "问题链 · 交叉质疑", marker: true },
    { t: 1500, text: "现在我想听听有药企背景的同学——有谁愿意从产业角度说说？", callC: true },
    { t: 1920, text: "我们快结束了——有没有被低估的视角？", openQ: true, reflect: true },
    { t: 2520, text: "反思单分发", marker: true },
  ];

  /* ============================================================
   *  4 · Agent 引擎
   * ============================================================ */
  let AGENTS = null;
  const RT = {};            // id → 运行时可变状态（引用稳定，reset 用清键不重赋）
  let SCHED = [];
  let DYN = [];             // t>132 动态生成的 beats（reset 会重赋，外部经 getter 读）
  let genCursor = 132;
  let lastTickT = 132;
  const sim = {};           // 教师动作窗口标记：_callCUntil / _callSilentUntil / _openQUntil / _callResponders

  function loadAgents() {
    if (AGENTS) return Promise.resolve(AGENTS);
    return fetch("./shared/virtual-class-agents.json", { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { AGENTS = d; return d; })
      .catch(() => null);
  }
  function agentOf(id) { return (AGENTS && AGENTS.agents) ? AGENTS.agents.find((a) => a.id === id) : null; }

  function initRT() {
    Object.keys(RT).forEach((k) => delete RT[k]);
    STUDENTS.forEach((s) => {
      const a = agentOf(s.id);
      const si = (a && a.state_init) || {};
      RT[s.id] = {
        attention: si.attention != null ? si.attention : (s.init === "quiet" ? 0.45 : s.init === "silent" ? 0.78 : 0.7),
        speak_motivation: si.speak_motivation != null ? si.speak_motivation : (s.init === "active" ? 0.7 : 0.3),
        fatigue: si.fatigue || 0,
        social_safety: si.social_safety != null ? si.social_safety : (s.init === "silent" ? 0.38 : 0.6),
        stance_position: si.stance_position != null ? si.stance_position : ((STANCE_BAKED[s.id] && STANCE_BAKED[s.id].t) || 0),
        spoke_count: 0, last_spoke_t: null, _events: [], _recentRaw: []
      };
    });
    buildSched();
    genCursor = 132; lastTickT = 132; DYN = [];
    sim._callCUntil = 0; sim._callSilentUntil = 0; sim._openQUntil = 0; sim._callResponders = null;
  }

  function buildSched() {
    SCHED = [
      { t: 150,  agent: "C2", fx: { speak_motivation: -0.18, attention: -0.12, social_safety: -0.08 }, why: "举手 5s 未被点·第 1 次" },
      { t: 1000, agent: "C2", fx: { speak_motivation: -0.22, attention: -0.18, social_safety: -0.12 }, why: "举手 5s 未被点·第 2 次" },
      { t: 1500, agent: "C2", fx: { speak_motivation: -0.10, attention: -0.10 }, why: "放弃·默写未说论点" },
      { t: 120,  agent: "C1", fx: { social_safety: -0.04 }, why: "摇头·不同意二元对立" },
      { t: 720,  agent: "C1", fx: { social_safety: -0.03 }, why: "笔记累积·想说的反驳" },
      { t: 1180, agent: "C1", fx: { social_safety: -0.05 }, why: "手抬到桌面但放弃" },
      { t: 1560, agent: "C1", fx: { social_safety: 0.06, attention: -0.03 }, why: "与同桌 D5 低声 30s" },
      { t: 1560, agent: "D5", fx: { attention: 0.08, social_safety: 0.08, speak_motivation: 0.05 }, why: "C1 低声向她解释" },
      { t: 480,  agent: "C3", fx: { social_safety: 0.05, speak_motivation: 0.05 }, why: "小组内讲 BD 视角" },
      { t: 930,  agent: "C3", fx: { social_safety: -0.08, speak_motivation: -0.10 }, why: "全班发言机会让给 A2·退缩" },
      { t: 1800, agent: "C4", fx: { social_safety: -0.10 }, why: "GMP 段被砍·自我审查强化" },
      { t: 1920, agent: "A7", fx: { speak_motivation: 0.20, attention: 0.10 }, why: "反思阶段·被激活" },
      { t: 1920, agent: "A1", fx: { stance_position: -0.05 }, why: "立场松动·吸收依从性" },
    ];
    [90, 140, 840, 1320, 2100].forEach((t, i) =>
      SCHED.push({ t, agent: "C5", fx: { speak_motivation: -0.07, attention: -0.06, social_safety: -0.04 }, why: `插话被抢 ${i + 1}/5` }));
    SCHED.sort((a, b) => a.t - b.t);
  }

  function applyAgentFx(id, fx, t, why) {
    const rt = RT[id]; if (!rt) return;
    Object.entries(fx).forEach(([k, d]) => {
      const lo = k === "stance_position" ? -1 : 0;
      rt[k] = Math.max(lo, Math.min(1, (rt[k] || 0) + d));
    });
    rt._events.push({ t, fx, why });
  }

  function cleanBeatText(t) {
    return String(t || "")
      .replace(/（注[：:][^）]*）/g, "").replace(/\(注[：:][^)]*\)/g, "")
      .replace(/（[^）]*专家[^）]*）/g, "").replace(/（v0\.\d[^）]*）/g, "")
      .replace(/\s{2,}/g, " ").trim();
  }
  function toBubble(text) {
    const t = cleanBeatText(text).replace(/^["“]+|["”]+$/g, "");
    const seg = t.split(/[——，。？！、,?!]/)[0] || t;
    return seg.length > 15 ? seg.slice(0, 14) + "…" : seg;
  }
  function getTopic(t) {
    if (t < 440)  return ["分组讨论", "医保", "慢病", "依从性", "证据", "成本", "替代焦虑"];
    if (t < 900)  return ["小组汇报", "证据", "依从性", "政策"];
    if (t < 1500) return ["交叉质疑", "BE", "INR", "临床细节", "政策"];
    if (t < 1920) return ["药企", "创新", "C视角", "研发"];
    if (t < 2520) return ["反思", "被低估", "立场迁移", "依从性"];
    return ["反思单", "收束", "立场"];
  }
  function rulesMatch(rules, ctx) {
    if (!Array.isArray(rules)) return false;
    return rules.some((r) => {
      if (typeof r !== "string") return false;
      if (r.includes("话题:")) {
        const m = r.match(/\[(.*?)\]/); if (!m) return false;
        const kws = m[1].split(",").map((s) => s.trim().replace(/['"]/g, ""));
        return kws.some((k) => ctx.topic.some((tp) => tp.includes(k) || k.includes(tp)));
      }
      if (r === "教师开放问题") return !!ctx.openQ;
      if (r.includes("纯情绪") || r.includes("情绪化")) return !!ctx.deadlock;
      if (r.includes("家庭隐私")) return ctx.topic.some((tp) => tp.includes("家庭"));
      if (r.includes("临床细节")) return ctx.topic.some((tp) => /临床|BE|INR/.test(tp));
      if (r.includes("几乎从不") || r === "所有公开发言" || r === "所有" || r.includes("从未成功")) return true;
      if (r.includes("仅小组内") || r.includes("仅在小组内")) return true;
      return false;
    });
  }
  function scoreDesire(a, rt, ctx) {
    if (!rt) return -Infinity;
    if (rulesMatch(a.rules && a.rules.silent_on, ctx)) return -Infinity;
    let s = rt.speak_motivation * 1.0 + rt.attention * 0.35 + rt.social_safety * 0.45 - rt.fatigue * 0.25;
    if (rulesMatch(a.rules && a.rules.speak_on, ctx)) s += 0.35;
    const rids = (ctx.recent || []).map((w) => w.split("·")[0]);
    if (a.graph && a.graph.allies && a.graph.allies.some((id) => rids.includes(id))) s += 0.15;
    if (a.graph && a.graph.rivals && a.graph.rivals.some((id) => rids.includes(id))) s += 0.25;
    if (rt.last_spoke_t != null && ctx.t - rt.last_spoke_t < 90)
      s -= 0.4 * (1 - (ctx.t - rt.last_spoke_t) / 90);
    s += ((a.persona && a.persona.stance_strength) || 0) * 0.05;
    s -= (rt.spoke_count || 0) * 0.11;
    if ((rt.spoke_count || 0) === 0 && /^[AB]/.test(a.id)) s += 0.18;
    if (a.id[0] === "C") s -= 0.5;
    if (a.id[0] === "D") s -= 0.65;
    const responded = sim._callResponders && sim._callResponders.has(a.id);
    if (!responded) {
      if (ctx.callSilent && /^[CD]/.test(a.id)) s += 0.8;
      if (ctx.callC && a.id[0] === "C") s += 0.9;
    } else if (ctx.callC || ctx.callSilent) s -= 0.5;
    s += (Math.random() - 0.5) * 0.18;
    return s;
  }
  function pickRespKey(a, ctx) {
    const r = a.responses || {}; const keys = Object.keys(r); if (!keys.length) return null;
    if (ctx.called) { for (const k of ["if_called_by_teacher", "if_called", "if_nudged", "if_finally_called"]) if (r[k]) return k; }
    if (ctx.openQ) { for (const k of ["to_open_question", "to_teacher", "clarifying_question"]) if (r[k]) return k; }
    if (ctx.lastRival) { for (const k of ["technical_rebuttal", "to_rival", "rebuttal"]) if (r[k]) return k; if (Math.random() < 0.3 && r.concession) return "concession"; }
    if (ctx.lastAlly) { for (const k of ["case_support", "rallying", "evidence_supply", "situational"]) if (r[k]) return k; }
    if (ctx.phase === "reflection") { for (const k of ["late_reflection", "concession", "proposal"]) if (r[k]) return k; }
    const pub = keys.filter((k) => !/private|internal|intended|post_class|small_group|report_text|if_anonymous|if_regulatory|reflection_sheet/.test(k));
    return pub.length ? pub[Math.floor(Math.random() * pub.length)] : null;
  }

  function tickRT(toSec) {
    SCHED.forEach((ev) => { if (ev.t > lastTickT && ev.t <= toSec) applyAgentFx(ev.agent, ev.fx, ev.t, ev.why); });
    const dt = Math.max(0, toSec - lastTickT);
    Object.keys(RT).forEach((id) => {
      const rt = RT[id];
      rt.attention = Math.max(0, rt.attention - 0.0002 * (1 + rt.fatigue * 1.5) * dt);
      rt.fatigue = Math.min(1, rt.fatigue + 0.00008 * dt);
      if (id[0] === "D" && id !== "D4") rt.fatigue = Math.min(1, rt.fatigue + 0.00015 * dt);
      if (id === "D4") { rt.fatigue = Math.min(1, rt.fatigue + 0.0008 * dt); rt.attention = Math.max(0.05, rt.attention - 0.0006 * dt); }
    });
    lastTickT = toSec;
  }

  function genOneBeat(t) {
    if (!AGENTS) return;
    const recent = DYN.filter((b) => b.role === "S" && b.t >= t - 90 && b.t < t).map((b) => b.who || "");
    const lastS = [...DYN].reverse().find((b) => b.role === "S");
    const lastSid = ((lastS && lastS.who) || "").split("·")[0];
    const base = {
      t, topic: getTopic(t), recent,
      openQ: t <= (sim._openQUntil || 0),
      callC: t <= (sim._callCUntil || 0),
      callSilent: t <= (sim._callSilentUntil || 0),
      deadlock: recent.length >= 3,
      phase: t < 440 ? "small_group" : t < 900 ? "report" : t < 1500 ? "rebuttal" : t < 1920 ? "C_call" : t < 2520 ? "reflection" : "closing",
    };
    const scored = STUDENTS.map((s) => {
      const a = agentOf(s.id); if (!a) return null;
      const ctx = { ...base,
        lastRival: !!(lastSid && a.graph && a.graph.rivals && a.graph.rivals.includes(lastSid)),
        lastAlly: !!(lastSid && a.graph && a.graph.allies && a.graph.allies.includes(lastSid)),
        called: !!(base.callC || base.callSilent) };
      return { a, s, ctx, score: scoreDesire(a, RT[s.id], ctx) };
    }).filter((x) => x && isFinite(x.score)).sort((x, y) => y.score - x.score);
    if (!scored.length) return null;
    const top = scored[0];
    if (top.score < 0.55) return null;
    const key = pickRespKey(top.a, top.ctx);
    const arr = key && top.a.responses && top.a.responses[key];
    if (!arr) return null;
    const texts = Array.isArray(arr) ? arr : [arr];
    const rt = RT[top.s.id];
    const fresh = texts.filter((x) => !(rt._recentRaw || []).includes(x));
    const raw = (fresh.length ? fresh : texts)[Math.floor(Math.random() * (fresh.length ? fresh.length : texts.length))];
    rt._recentRaw = [...(rt._recentRaw || []), raw].slice(-6);
    const text = cleanBeatText(raw); if (!text) return null;
    const beat = { t, kind: "line", role: "S", who: top.s.id, text, bubble: toBubble(raw), respKey: key };
    DYN.push(beat);
    applyAgentFx(top.s.id, { speak_motivation: -0.15, attention: 0.05 }, t, `发言「${key}」`);
    rt.last_spoke_t = t; rt.spoke_count = (rt.spoke_count || 0) + 1;
    ((top.a.graph && top.a.graph.allies) || []).forEach((id) => applyAgentFx(id, { social_safety: 0.03 }, t, `盟友 ${top.s.id} 发言`));
    ((top.a.graph && top.a.graph.rivals) || []).forEach((id) => applyAgentFx(id, { speak_motivation: 0.06 }, t, `对手 ${top.s.id} 发言·激起反驳`));
    nudgeStances(top.s.id);
    if (base.callC || base.callSilent) { if (!sim._callResponders) sim._callResponders = new Set(); sim._callResponders.add(top.s.id); }
    return beat;
  }

  /* 立场互相影响（纯个体，不按组） */
  function nudgeStances(speakerId) {
    const sp = byId[speakerId], spRT = RT[speakerId]; if (!sp || !spRT) return;
    const sS = spRT.stance_position;
    STUDENTS.forEach((s) => {
      if (s.id === speakerId) return;
      const rt = RT[s.id], bk = STANCE_BAKED[s.id]; if (!rt || !bk) return;
      let tf = 0.3;
      if (typeof bk.t === "number" && (sS - rt.stance_position) * (bk.t - rt.stance_position) < 0) tf = 0.12;
      const gr = (agentOf(s.id) || {}).graph || {};
      if ((gr.allies || []).includes(speakerId)) tf += 0.35;
      if ((gr.rivals || []).includes(speakerId)) tf -= 0.55;
      const home = (bk.t - rt.stance_position) * 0.55;
      const pull = tf * (sS - rt.stance_position) * 0.5;
      const delta = (bk.m || 0.3) * 0.09 * (home + pull);
      rt.stance_position = Math.max(-1, Math.min(1, rt.stance_position + delta));
    });
  }

  // 推进仿真到 toSec：生成 t>132 的 beats（每次新生成的 beat 通过回调上抛给渲染层）
  function advanceSim(toSec, onBeat) {
    if (!AGENTS) return;
    if (toSec <= genCursor) { if (toSec > lastTickT) tickRT(toSec); return; }
    const stride = 22;
    let st = Math.ceil((genCursor + 1) / stride) * stride;
    let guard = 0;
    while (genCursor < toSec && guard++ < 3000) {
      const nxt = Math.min(toSec, st);
      tickRT(nxt);
      TEACHER_BEATS.forEach((tb) => {
        if (tb.t > genCursor && tb.t <= nxt && !DYN.some((d) => d.t === tb.t && d._teacher)) {
          if (tb.callC) { sim._callCUntil = tb.t + 80; sim._callResponders = new Set(); }
          if (tb.openQ) sim._openQUntil = tb.t + 44;
          const beat = { t: tb.t, kind: tb.marker ? "marker" : "line", role: "T", text: tb.text, _teacher: true };
          DYN.push(beat);
          if (onBeat) onBeat(beat);
        }
      });
      if (nxt > 132) { const b = genOneBeat(nxt); if (b && onBeat) onBeat(b); }
      genCursor = nxt;
      st += stride;
      if (st > toSec && genCursor < toSec) st = toSec;
    }
  }

  /* ---------- 5 · 合并 beat 流（SCRIPT t≤132 + DYN t>132） ---------- */
  function beatsUpTo(t) {
    const out = [];
    for (const b of SCRIPT) if (b.t <= t) out.push(b);
    for (const b of DYN) if (b.t <= t) out.push(b);
    out.sort((x, y) => x.t - y.t);
    return out;
  }
  // 班级立场重心（均值），范围 -1…+1
  function centroid() {
    let sum = 0, n = 0;
    STUDENTS.forEach((s) => { const rt = RT[s.id]; if (rt) { sum += rt.stance_position; n++; } });
    return n ? sum / n : 0;
  }

  /* ---------- 6 · 教师动作（自由仿真）——在指定 sim 时间设置窗口 ---------- */
  function teacherCallC(atSec, win) { sim._callCUntil = atSec + (win || 80); sim._callResponders = new Set(); }
  function teacherCallSilent(atSec, win) { sim._callSilentUntil = atSec + (win || 80); sim._callResponders = new Set(); }
  function teacherOpenQ(atSec, win) { sim._openQUntil = atSec + (win || 44); }
  function teacherLine(atSec, text) { const b = { t: atSec, kind: "line", role: "T", text, _teacher: true }; DYN.push(b); return b; }
  // 强制点名某个体：临时拉满其发言意图，下一拍极可能由他发声
  function teacherCallOn(id) { const rt = RT[id]; if (rt) { rt.speak_motivation = 1; rt.social_safety = Math.max(rt.social_safety, 0.7); rt.attention = Math.max(rt.attention, 0.7); } }

  /* ---------- 7 · 暴露 ---------- */
  window.MVCore = {
    // 数据
    STUDENTS, byId, STANCE_BAKED, SCRIPT, T_CAP, TEACHER_BEATS, PROJECTION_SPOKEN,
    traitOf, cleanBeatText, toBubble,
    // agent
    loadAgents, agentOf, agentsReady: () => !!AGENTS,
    // 引擎
    reset: initRT, advanceSim, tickRT, beatsUpTo, centroid,
    get cursor() { return genCursor; },
    get DYN() { return DYN; },
    rtOf: (id) => RT[id],
    allRT: () => RT,
    // 教师动作
    teacherCallC, teacherCallSilent, teacherOpenQ, teacherLine, teacherCallOn,
  };
})();
