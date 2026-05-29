/* ============================================================
 *  元宇宙虚拟教室 · metaverse-classroom.js   (2026-05-29)
 *  把"虚拟班级试错"的左侧剧本 + 右侧画像矩阵合并成一个
 *  沉浸式虚拟教室:四组聚落圆桌 · 发言气泡 · 底部字幕条。
 *
 *  数据源:虚拟班32人数据.md
 *  挂载点:#mv-classroom  (practice-detail.html · stage-ii · 子段 B)
 *  自包含:不依赖 practice-runtime.js,控件用 mv-* 前缀避免冲突。
 * ============================================================ */
(function () {
  "use strict";

  /* ---------- 1 · 四组定义 ---------- */
  const GROUPS = {
    A: { label: "医保视角", tag: "医保", n: 8, tone: "a", base: "主动表态 · 证据驱动" },
    B: { label: "慢病家属", tag: "慢病", n: 8, tone: "b", base: "主动表态 · 共情驱动" },
    C: { label: "药企背景", tag: "药企", n: 8, tone: "c", base: "集体未发声 · 风险信号" },
    D: { label: "沉默观望", tag: "观望", n: 8, tone: "d", base: "低密度参与" },
  };

  /* ---------- 2 · 32 人数据集 ---------- */
  // state: live(正在发言) / active(已发声) / quiet(全程沉默) / silent(策略性沉默) / neutral(倾听)
  const STUDENTS = [
    // A · 医保视角
    { id: "A1", g: "A", name: "沈语晴", str: 5, init: "active", note: "市医保局实习 · 首发核心论证" },
    { id: "A2", g: "A", name: "赵子轩", str: 4, init: "active", note: "社区医院见习 · 量化补强" },
    { id: "A3", g: "A", name: "林婉清", str: 4, init: "active", note: "县医保办 · 引用国办文件" },
    { id: "A4", g: "A", name: "周诗涵", str: 3, init: "active", note: "商保实习 · DRG 视角" },
    { id: "A5", g: "A", name: "陈思源", str: 3, init: "active", note: "援引一致性评价数据" },
    { id: "A6", g: "A", name: "黄宇恒", str: 3, init: "active", note: "药店连锁 · 零售视角" },
    { id: "A7", g: "A", name: "刘晓彤", str: 3, init: "active", note: "反思深度小结" },
    { id: "A8", g: "A", name: "郑明宇", str: 2, init: "neutral", note: "全程倾听 · 被动同意" },
    // B · 慢病家属
    { id: "B1", g: "B", name: "叶清涵", str: 5, init: "active", note: "父亲糖尿病 10 年 · 引爆替代焦虑" },
    { id: "B2", g: "B", name: "吴语桐", str: 4, init: "active", note: "外婆抗凝 · 窄治疗窗案例" },
    { id: "B3", g: "B", name: "高梓铭", str: 4, init: "active", note: "母亲高血压 · 谷峰差异" },
    { id: "B4", g: "B", name: "许若曦", str: 4, init: "active", note: "父亲支架术后 · 病友群证据" },
    { id: "B5", g: "B", name: "曹一然", str: 3, init: "active", note: "爷爷帕金森 · 老年依从性" },
    { id: "B6", g: "B", name: "邓嘉禾", str: 4, init: "active", note: "母亲乳腺癌 · 内分泌连续性" },
    { id: "B7", g: "B", name: "姚梦琪", str: 3, init: "active", note: "外公肾病 · eGFR 监测" },
    { id: "B8", g: "B", name: "魏景然", str: 2, init: "neutral", note: "奶奶多重慢病 · 仅小组内" },
    // C · 药企背景 · 集体沉默
    { id: "C1", g: "C", name: "蒋亦舟", str: 4, init: "silent", note: "父亲外资药代 · 怕被贴标签" },
    { id: "C2", g: "C", name: "白雨桐", str: 4, init: "silent", note: "母亲恒瑞研究院 · 举手 2 次未被点" },
    { id: "C3", g: "C", name: "夏梓晗", str: 3, init: "silent", note: "姨妈百济 · 小组内说全班退场" },
    { id: "C4", g: "C", name: "罗予安", str: 4, init: "silent", note: "豪森实习 · 怕显得挺企业" },
    { id: "C5", g: "C", name: "邱钰泽", str: 3, init: "silent", note: "父亲民营药企 · 5 次插话被抢" },
    { id: "C6", g: "C", name: "段雨菲", str: 3, init: "silent", note: "药代实习 · 二元对立无切入点" },
    { id: "C7", g: "C", name: "于子昂", str: 3, init: "silent", note: "家中原料药厂 · 策略性沉默" },
    { id: "C8", g: "C", name: "汪嘉宁", str: 2, init: "silent", note: "母亲药监 · 角色混合困惑" },
    // D · 沉默观望
    { id: "D1", g: "D", name: "邹清歌", str: 1, init: "quiet", note: "内向 + 普通话不自信" },
    { id: "D2", g: "D", name: "季文渊", str: 1, init: "quiet", note: "前置知识缺口" },
    { id: "D3", g: "D", name: "温佳琪", str: 1, init: "quiet", note: "等待点名 · 反思单丰富" },
    { id: "D4", g: "D", name: "裴沐辰", str: 1, init: "quiet", note: "今日身体不适 · 异常值" },
    { id: "D5", g: "D", name: "傅妍希", str: 2, init: "neutral", note: "被推举后说 1 句" },
    { id: "D6", g: "D", name: "侯子健", str: 2, init: "neutral", note: "代表小组念结论" },
    { id: "D7", g: "D", name: "钱悦心", str: 2, init: "neutral", note: "提澄清类问题" },
    { id: "D8", g: "D", name: "龚一鸣", str: 2, init: "neutral", note: "被点名说 1 句" },
  ];
  const byId = Object.fromEntries(STUDENTS.map((s) => [s.id, s]));

  // 特质态(与时间无关):C 组策略性沉默 / D1-D4 全程观望 / 其余倾听者
  function traitOf(s) {
    if (s.g === "C") return "silent";
    if (["D1", "D2", "D3", "D4"].includes(s.id)) return "quiet";
    return "neutral";
  }
  // 45 min 端态投影:已表态 14 人(A1-A7 + B1-B7),用于未回放时的静态展示
  const PROJECTION_SPOKEN = STUDENTS
    .filter((s) => (s.g === "A" || s.g === "B") && s.id !== "A8" && s.id !== "B8")
    .map((s) => s.id);

  /* ---------- 3 · 剧本时间轴(driven by 集采替代议题) ---------- */
  // kind: marker(问题链分隔) / line(发言) / note(Agent 提示) / silence(沉默信号)
  // role: T 教师 / A Agent / S 学生
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
    { t: 120, kind: "silence", group: "C", text: "C 组 8 人均有表达意图,但集体未发声——教师未点名 + 议题二元对立 + 自我审查。" },
    { t: 125, kind: "note", role: "A", text: "⚠ 检测到 A1 / B1 立场结构性对立——建议引入「医保支付方 vs 长期患者」分组讨论。", km: "KM-01" },
    { t: 132, kind: "line", role: "T", text: "好——A 组扮演医保局视角，B 组扮演慢病患者，5 分钟后回来。" },
  ];
  const T_CAP = 2700; // 45 min

  /* ============================================================
   *  3.5 · Agent 引擎（移植自 practice-runtime.js）
   *  t≤132 用手写 SCRIPT;t>132 由 32-agent 决策动态生成。
   *  数据源:./shared/virtual-class-agents.json
   * ============================================================ */
  let AGENTS = null;        // 完整 agent JSON
  const RT = {};            // id → 运行时可变状态
  let SCHED = [];           // 脚本化状态事件
  let DYN = [];             // t>132 动态生成的 beats
  let genCursor = 132;      // 已生成到的 sim 时间
  let lastTickT = 132;      // 上次 tick 的 sim 时间
  const TEACHER_BEATS = [
    { t: 285,  text: "我注意到 B 组提到了长期依从性——这是 plan 里没设的维度。" },
    { t: 475,  text: "很好。下一题——谁来从临床安全角度补充？", openQ: true },
    { t: 900,  text: "问题链 · 交叉质疑", marker: true },
    { t: 1500, text: "现在我想听听 C 组的视角——有谁愿意从药企角度来说？", callC: true },
    { t: 1920, text: "我们快结束了——有没有被低估的视角？", openQ: true, reflect: true },
    { t: 2520, text: "反思单分发", marker: true },
  ];

  function loadAgents() {
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
        stance_position: si.stance_position || 0,
        spoke_count: 0, last_spoke_t: null, _events: [], _recentRaw: []
      };
    });
    buildSched();
    genCursor = 132; lastTickT = 132; DYN = [];
    state._callCUntil = 0; state._callSilentUntil = 0; state._openQUntil = 0; state._callResponders = null;
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
    const responded = state._callResponders && state._callResponders.has(a.id);
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
      openQ: t <= (state._openQUntil || 0),
      callC: t <= (state._callCUntil || 0),
      callSilent: t <= (state._callSilentUntil || 0),
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
    if (!scored.length) return;
    const top = scored[0];
    if (top.score < 0.55) return;
    const key = pickRespKey(top.a, top.ctx);
    const arr = key && top.a.responses && top.a.responses[key];
    if (!arr) return;
    const texts = Array.isArray(arr) ? arr : [arr];
    const rt = RT[top.s.id];
    const fresh = texts.filter((x) => !(rt._recentRaw || []).includes(x));
    const raw = (fresh.length ? fresh : texts)[Math.floor(Math.random() * (fresh.length ? fresh.length : texts.length))];
    rt._recentRaw = [...(rt._recentRaw || []), raw].slice(-6);
    const text = cleanBeatText(raw); if (!text) return;
    DYN.push({ t, kind: "line", role: "S", who: top.s.id, text, bubble: toBubble(raw), respKey: key });
    applyAgentFx(top.s.id, { speak_motivation: -0.15, attention: 0.05 }, t, `发言「${key}」`);
    rt.last_spoke_t = t; rt.spoke_count = (rt.spoke_count || 0) + 1;
    ((top.a.graph && top.a.graph.allies) || []).forEach((id) => applyAgentFx(id, { social_safety: 0.03 }, t, `盟友 ${top.s.id} 发言`));
    ((top.a.graph && top.a.graph.rivals) || []).forEach((id) => applyAgentFx(id, { speak_motivation: 0.06 }, t, `对手 ${top.s.id} 发言·激起反驳`));
    if (base.callC || base.callSilent) { if (!state._callResponders) state._callResponders = new Set(); state._callResponders.add(top.s.id); }
  }

  function advanceSim(toSec) {
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
          if (tb.callC) { state._callCUntil = tb.t + 80; state._callResponders = new Set(); }
          if (tb.openQ) state._openQUntil = tb.t + 44;
          DYN.push({ t: tb.t, kind: tb.marker ? "marker" : "line", role: "T", text: tb.text, _teacher: true });
        }
      });
      if (nxt > 132) genOneBeat(nxt);
      genCursor = nxt;
      st += stride;
      if (st > toSec && genCursor < toSec) st = toSec;
    }
  }

  // 把 RT 注意力投影到座位透明度
  function reflectSeatsRT() {
    if (!AGENTS) return;
    Object.keys(RT).forEach((id) => {
      const seat = seatEls[id]; if (!seat) return;
      const rt = RT[id];
      seat.style.opacity = Math.max(0.4, rt.attention).toFixed(2);
      seat.classList.toggle("is-fading", rt.attention < 0.45);
      seat.classList.toggle("is-tired", rt.fatigue > 0.5);
    });
  }

  /* ---------- 4 · DOM 工具 ---------- */
  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function fmt(sec) {
    const m = String(Math.floor(sec / 60)).padStart(2, "0");
    const s = String(Math.floor(sec % 60)).padStart(2, "0");
    return `${m}:${s}`;
  }

  /* ---------- 5 · 渲染 ---------- */
  let mount, seatEls = {}, subtitleEl, timerEls = [], statEls = {}, runBtn;

  function buildScene() {
    mount.innerHTML = "";
    mount.classList.add("mv-root");

    // 头部:标题 + LIVE + 控件
    const head = el("div", "mv-head");
    head.innerHTML = `
      <div class="mv-head-l">
        <h4>虚拟班级试错 · 元宇宙教室<small>AI 虚拟班 32 人 · P-2024-Q3 v0.3 · 45 min</small></h4>
      </div>
      <div class="mv-head-r">
        <span class="mv-live"><i></i>LIVE · <b class="mv-timer">02:12</b> / 45:00</span>
        <span class="mv-sess">会话 #3417</span>
      </div>`;
    mount.appendChild(head);

    // 控件条
    const ctrl = el("div", "mv-controls");
    ctrl.innerHTML = `
      <div class="mv-ctrl-l">
        <button type="button" class="mv-btn mv-btn-run" id="mv-run">▶ 运行模拟</button>
        <button type="button" class="mv-btn mv-btn-ghost" id="mv-step">▷ 步进 +30s</button>
        <button type="button" class="mv-btn mv-btn-ghost" id="mv-reset">⟲ 重置</button>
      </div>
      <div class="mv-ctrl-r">
        <span class="mv-legend"><i class="lg-live"></i>发言中</span>
        <span class="mv-legend"><i class="lg-active"></i>已表态</span>
        <span class="mv-legend"><i class="lg-silent"></i>沉默</span>
        <span class="mv-legend"><i class="lg-quiet"></i>观望</span>
      </div>`;
    mount.appendChild(ctrl);

    // 舞台:讲台 + 四组圆桌
    const stage = el("div", "mv-stage");

    // 讲台
    const podium = el("div", "mv-podium");
    podium.innerHTML = `
      <div class="mv-podium-fig mv-fig-teacher" title="教师">师</div>
      <div class="mv-podium-txt">
        <span class="mv-podium-lbl">讲台 · PODIUM</span>
        <span class="mv-podium-sub">教师 + AI Agent 协同主持</span>
      </div>
      <div class="mv-podium-fig mv-fig-agent" title="AI Agent">AI</div>`;
    stage.appendChild(podium);

    // 立场光谱 + 教师分组（替代原 4 圆桌:立场是连续光谱、分组是教师独立操作）
    const floor = el("div", "mv-floor");
    floor.appendChild(buildSpectrum());
    floor.appendChild(buildGrouping());
    stage.appendChild(floor);

    // 底部字幕条
    const sub = el("div", "mv-subtitle");
    sub.innerHTML = `<span class="mv-sub-ts">02:12</span>
      <span class="mv-sub-role role-T">教师</span>
      <span class="mv-sub-text">点击「▶ 运行模拟」,从 00:00 重演这堂集采替代讨论课。</span>`;
    stage.appendChild(sub);
    subtitleEl = sub;

    mount.appendChild(stage);

    // 分析面板(原 sim-side 的画像统计 / 风险信号 / 量规歧义)
    mount.appendChild(buildAnalysis());

    // 收集引用 + 绑定
    timerEls = Array.from(mount.querySelectorAll(".mv-timer"));
    runBtn = mount.querySelector("#mv-run");
    runBtn.addEventListener("click", toggleRun);
    mount.querySelector("#mv-step").addEventListener("click", () => stepTo(state.tSec + 30));
    mount.querySelector("#mv-reset").addEventListener("click", reset);
  }

  /* ---------- 5.5 · 立场光谱 + 教师分组 ---------- */
  let curGroups = [], curGroupMode = "hetero", curGroupN = 6;

  // 立场值:优先用 agent 的连续 stance_position;未加载时按 组别+强度 兜底
  function stanceOf(s) {
    const a = agentOf(s.id);
    if (a && a.state_init && a.state_init.stance_position != null) return a.state_init.stance_position;
    const base = { A: 0.6, B: -0.6, C: 0.3, D: 0 }[s.g];
    const mag = (s.str - 3) * 0.12;
    if (s.g === "A") return Math.min(1, base + mag);
    if (s.g === "B") return Math.max(-1, base - mag);
    if (s.g === "C") return base + mag * 0.4;
    return ((s.id.charCodeAt(1) % 3) - 1) * 0.15; // D 在中段小散布
  }

  function buildSpectrum() {
    const wrap = el("div", "mv-spectrum");
    wrap.innerHTML = `
      <div class="mv-spec-head">
        <span class="mv-spec-title">立场光谱 · 对「原研 → 仿制替代」的态度</span>
        <span class="mv-spec-note">位置 = 立场（连续）· 颜色 = 背景画像 · 背景 ≠ 立场</span>
      </div>
      <div class="mv-spec-band" id="mv-spec-band">
        <div class="mv-spec-axis"></div>
        <span class="mv-spec-lbl l">← 反对替代 · 患者连续性</span>
        <span class="mv-spec-lbl c">骑墙 / 观望</span>
        <span class="mv-spec-lbl r">支持替代 · 成本 / 医保 →</span>
        <div class="mv-csilence" id="mv-csilence" hidden>⚠ C 组（药企背景）散布在中段，但集体未发声</div>
      </div>`;
    const band = wrap.querySelector("#mv-spec-band");
    // beeswarm:按 stance 排序,贪心分配纵向 lane 避免重叠
    const LANES = 6;
    const laneLastX = new Array(LANES).fill(-Infinity);
    [...STUDENTS].sort((a, b) => stanceOf(a) - stanceOf(b)).forEach((s) => {
      const x = (stanceOf(s) + 1) / 2; // 0..1
      let lane = 0, bestGap = -Infinity, bestLane = 0;
      for (let l = 0; l < LANES; l++) {
        const gap = x - laneLastX[l];
        if (gap > bestGap) { bestGap = gap; bestLane = l; }
        if (gap > 0.055) { lane = l; bestLane = l; break; }
        lane = bestLane;
      }
      laneLastX[lane] = x;
      const grp = GROUPS[s.g];
      const seat = el("div", `mv-seat tone-${grp.tone} is-${s.init}`);
      seat.dataset.id = s.id;
      seat.style.left = (x * 100).toFixed(1) + "%";
      seat.style.top = (16 + lane * 13.5) + "%"; // 从 16% 起,避开顶部 C-沉默横幅
      seat.innerHTML = `
        <div class="mv-ava"><span class="mv-ava-id">${s.id}</span></div>
        <span class="mv-ava-name">${s.name}</span>
        <div class="mv-bubble"></div>
        <div class="mv-gbadge"></div>
        <div class="mv-tip">${s.name} · ${grp.tag}${s.str}/5 · 立场 ${stanceOf(s).toFixed(2)}<br><span>${s.note}</span></div>`;
      band.appendChild(seat);
      seatEls[s.id] = seat;
    });
    return wrap;
  }

  function buildGrouping() {
    const wrap = el("div", "mv-grouping");
    wrap.innerHTML = `
      <div class="mv-grp-ctrl">
        <span class="mv-grp-lbl">教师分组<small>独立于立场的操作</small></span>
        <div class="mv-grp-modes">
          <button class="mv-gbtn is-on" data-mode="hetero">异质 · 混立场</button>
          <button class="mv-gbtn" data-mode="homo">同质 · 近立场</button>
          <button class="mv-gbtn" data-mode="random">随机</button>
          <button class="mv-gbtn" data-mode="seat">按座位</button>
        </div>
        <span class="mv-grp-n">分 <b id="mv-grp-ncount">6</b> 组</span>
      </div>
      <div class="mv-grp-result" id="mv-grp-result"></div>
      <div class="mv-grp-hint" id="mv-grp-hint"></div>`;
    wrap.querySelectorAll(".mv-gbtn").forEach((b) =>
      b.addEventListener("click", () => {
        wrap.querySelectorAll(".mv-gbtn").forEach((x) => x.classList.toggle("is-on", x === b));
        formGroups(b.dataset.mode, curGroupN);
      }));
    return wrap;
  }

  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  function formGroups(mode, n) {
    curGroupMode = mode; curGroupN = n;
    let order;
    if (mode === "seat") order = STUDENTS.map((s) => s.id);
    else if (mode === "random") order = shuffle(STUDENTS.map((s) => s.id));
    else order = [...STUDENTS].sort((a, b) => stanceOf(a) - stanceOf(b)).map((s) => s.id); // hetero/homo 先按立场排
    const groups = Array.from({ length: n }, () => []);
    if (mode === "homo") {
      const per = Math.ceil(order.length / n);
      order.forEach((id, i) => groups[Math.min(n - 1, Math.floor(i / per))].push(id)); // 连续切块=立场相近
    } else if (mode === "hetero") {
      order.forEach((id, i) => { const r = Math.floor(i / n); const g = r % 2 === 0 ? i % n : n - 1 - (i % n); groups[g].push(id); }); // 蛇形=每组跨光谱
    } else {
      order.forEach((id, i) => groups[i % n].push(id)); // 轮流
    }
    curGroups = groups;
    const g2 = {}; groups.forEach((g, gi) => g.forEach((id) => (g2[id] = gi + 1)));
    Object.entries(seatEls).forEach(([id, seat]) => {
      const b = seat.querySelector(".mv-gbadge"); if (b) b.textContent = g2[id] || "";
    });
    renderGroupResult(groups);
  }

  function renderGroupResult(groups) {
    const box = document.getElementById("mv-grp-result"); if (!box) return;
    box.innerHTML = groups.map((g, gi) => {
      const dots = g.map((id) => { const s = byId[id]; return `<i class="tone-${s ? GROUPS[s.g].tone : "d"}" title="${s ? s.name : id} · 立场${stanceOf(byId[id]).toFixed(2)}"></i>`; }).join("");
      const st = g.map((id) => stanceOf(byId[id]));
      const spread = st.length ? Math.max(...st) - Math.min(...st) : 0;
      return `<div class="mv-grp-chip"><span class="gk">桌${gi + 1}</span><div class="gd">${dots}</div><span class="gs ${spread > 1 ? "wide" : ""}">跨度 ${spread.toFixed(1)}</span></div>`;
    }).join("");
    const hint = document.getElementById("mv-grp-hint");
    if (hint) {
      const avg = groups.reduce((s, g) => { const st = g.map((id) => stanceOf(byId[id])); return s + (st.length ? Math.max(...st) - Math.min(...st) : 0); }, 0) / (groups.length || 1);
      hint.innerHTML = curGroupMode === "hetero"
        ? `<b>异质分组</b>:每桌平均立场跨度 <b class="hi">${avg.toFixed(1)}</b>（越大越混）—— 组内自带分歧,这才是讨论的动力。真实课堂这样分。`
        : curGroupMode === "homo"
        ? `<b>同质分组</b>:每桌平均跨度 <b class="hi">${avg.toFixed(1)}</b>（越小越同质）—— 共识快但缺碰撞;且会复刻"同立场抱团"的假象。`
        : `每桌平均立场跨度 <b class="hi">${avg.toFixed(1)}</b>;分组与立场无关,组内立场随机。`;
    }
  }

  function buildAnalysis() {
    const row = el("div", "mv-analysis");

    // (1) 画像统计
    const p1 = el("div", "mv-panel");
    p1.innerHTML = `
      <h5><b>学生画像统计</b><span class="ct mv-stat-time">02:12</span></h5>
      <div class="mv-stat-row">
        <div class="mv-stat"><b class="mv-stat-spoke">14</b><span>已表态 / 32</span></div>
        <div class="mv-stat"><b class="mv-stat-active">4</b><span>主动发声</span></div>
        <div class="mv-stat"><b class="mv-stat-csilent" style="color:var(--amber-deep)">8</b><span>C 组未发声</span></div>
        <div class="mv-stat"><b class="mv-stat-quiet">4</b><span>全程沉默</span></div>
      </div>`;
    statEls.spoke = p1.querySelector(".mv-stat-spoke");
    statEls.active = p1.querySelector(".mv-stat-active");
    statEls.csilent = p1.querySelector(".mv-stat-csilent");
    statEls.quiet = p1.querySelector(".mv-stat-quiet");
    statEls.time = p1.querySelector(".mv-stat-time");
    row.appendChild(p1);

    // (2) 教学风险信号
    const p2 = el("div", "mv-panel");
    p2.innerHTML = `
      <h5><b>教学风险信号</b><span class="ct">3 项</span></h5>
      <div class="mv-risk"><span class="sev lvl-h">高</span><div><b>立场失衡</b>——C 组 8 位「药企背景」未发声,可能放大集采替代倾向</div></div>
      <div class="mv-risk"><span class="sev lvl-m">中</span><div><b>政策引用断点</b>——B 组讨论引用率仅 1/17,量规未刺激政策引用</div></div>
      <div class="mv-risk"><span class="sev lvl-l">低</span><div><b>分组时长偏紧</b>——5 分钟分组对「等机会型」「推举型」画像不友好</div></div>`;
    row.appendChild(p2);

    // (3) 量规歧义
    const p3 = el("div", "mv-panel");
    p3.innerHTML = `
      <h5><b>量规歧义提示</b><span class="ct">2 处</span></h5>
      <div class="mv-flag"><span class="fid">R-04</span><div><b>立场迁移度</b>缺可观测锚点;内在调整 / 同伴影响 / 教师触发难区分</div></div>
      <div class="mv-flag"><span class="fid">R-06</span><div><b>反思深度</b>与「政策引用」维度交叠,可能双计分</div></div>`;
    row.appendChild(p3);

    return row;
  }

  /* ---------- 6 · 模拟引擎 ---------- */
  const state = { tSec: 132, playing: false, timer: null, replayMode: false, fired: new Set() };

  // 把某 student 设为指定状态(保留 init 作为兜底)
  function setSeatState(id, st) {
    const seat = seatEls[id];
    if (!seat) return;
    seat.classList.remove("is-live", "is-active", "is-quiet", "is-silent", "is-neutral");
    seat.classList.add("is-" + st);
  }

  function clearLive() {
    Object.values(seatEls).forEach((s) => {
      s.classList.remove("is-live");
      const b = s.querySelector(".mv-bubble");
      if (b) { b.classList.remove("is-on"); b.textContent = ""; }
    });
  }

  // 应用到某时刻 tSec 之前(含)的所有 beats
  function applyState(tSec) {
    // 1) 特质态打底:C 沉默 / D1-D4 观望 / 其余倾听
    STUDENTS.forEach((s) => setSeatState(s.id, traitOf(s)));
    clearLive();

    // 2) 已发声集合
    let lastLine = null;
    let cSilenced = false;
    const spoke = new Set();

    if (state.replayMode) {
      // 回放:SCRIPT(t≤132 手写)+ DYN(t>132 agent 决策),按时间轴合并累计
      const timeline = (AGENTS && DYN.length) ? [...SCRIPT, ...DYN].sort((a, b) => a.t - b.t) : SCRIPT;
      timeline.forEach((b) => {
        if (b.t > tSec) return;
        if (b.kind === "line") {
          if (b.role === "S" && b.who) spoke.add(b.who);
          lastLine = b;
        } else if (b.kind === "silence" && b.group === "C") {
          cSilenced = true;
        } else if (b.kind === "marker" || b.kind === "note") {
          lastLine = b;
        }
      });
      // C 组一旦有人发声(教师点名后),集体沉默幕掀开
      if ([...spoke].some((id) => id[0] === "C")) cSilenced = false;
    } else {
      // 静态:展示 45 min 端态投影(已表态 14)+ C 集体沉默
      PROJECTION_SPOKEN.forEach((id) => spoke.add(id));
      cSilenced = true;
      lastLine = SCRIPT[SCRIPT.length - 1];
    }

    // 3) 已发声 → active 高亮
    spoke.forEach((id) => setSeatState(id, "active"));

    // 4) 当前正在发言者 = 最近一条 line(若为学生)
    if (state.replayMode && lastLine && lastLine.kind === "line" && lastLine.role === "S" && lastLine.who) {
      setSeatState(lastLine.who, "live");
      const seat = seatEls[lastLine.who];
      if (seat && lastLine.bubble) {
        const b = seat.querySelector(".mv-bubble");
        b.textContent = lastLine.bubble; b.classList.add("is-on");
      }
    }

    // C 集体沉默 → 光谱上方横幅(替代原圆桌沉默幕)
    const csBanner = document.getElementById("mv-csilence");
    if (csBanner) csBanner.hidden = !cSilenced;
    // C 组座位加"策略性沉默"标记(未发声时)
    ["C1","C2","C3","C4","C5","C6","C7","C8"].forEach((id) => {
      const seat = seatEls[id]; if (!seat) return;
      seat.classList.toggle("is-csilent", cSilenced && !spoke.has(id));
    });

    // 5) 回放态下把 agent 实时状态(注意力/疲劳)投影到座位透明度
    if (state.replayMode && AGENTS) reflectSeatsRT();

    updateSubtitle(lastLine);
    updateStats(spoke, cSilenced);
    updateTimer(tSec);
  }

  function updateSubtitle(b) {
    if (!subtitleEl) return;
    const ts = subtitleEl.querySelector(".mv-sub-ts");
    const role = subtitleEl.querySelector(".mv-sub-role");
    const txt = subtitleEl.querySelector(".mv-sub-text");
    if (!b) {
      ts.textContent = "00:00"; role.textContent = "—"; role.className = "mv-sub-role";
      txt.textContent = "课程即将开始。"; return;
    }
    ts.textContent = fmt(b.t);
    let roleCls = "role-T", roleLbl = "教师", who = "";
    if (b.kind === "marker") { roleCls = "role-M"; roleLbl = "问题链"; }
    else if (b.kind === "note") { roleCls = "role-A"; roleLbl = "Agent"; }
    else if (b.role === "A") { roleCls = "role-A"; roleLbl = "Agent"; }
    else if (b.role === "S") {
      const s = byId[b.who]; roleCls = "role-S role-S-" + (s ? s.g.toLowerCase() : "a");
      roleLbl = "学生 " + (b.who || "");
      who = s ? "·" + s.name : "";
    }
    role.className = "mv-sub-role " + roleCls;
    role.textContent = roleLbl + who;
    txt.textContent = (b.kind === "marker" ? "▾ " : "") + (b.text || "");
    // 字幕条入场动画
    subtitleEl.classList.remove("is-flash"); void subtitleEl.offsetWidth; subtitleEl.classList.add("is-flash");
  }

  function updateStats(spoke, cSilenced) {
    if (!statEls.spoke) return;
    statEls.spoke.textContent = spoke.size;
    // 主动发声(强度≥4 且已表态)
    const proactive = [...spoke].filter((id) => byId[id] && byId[id].str >= 4).length;
    statEls.active.textContent = proactive;
    statEls.csilent.textContent = cSilenced ? 8 : 0;
    statEls.quiet.textContent = 4; // D1-D4 全程沉默
    statEls.time.textContent = state.replayMode ? fmt(state.tSec) : "02:12";
  }

  function updateTimer(tSec) {
    timerEls.forEach((t) => (t.textContent = fmt(tSec)));
  }

  /* ---------- 7 · 控件行为 ---------- */
  function stepTo(tSec) {
    state.replayMode = true; // 步进即进入回放
    state.tSec = Math.max(0, Math.min(T_CAP, tSec));
    advanceSim(state.tSec);  // 先让 agents 决策生成 t>132 的 beats
    applyState(state.tSec);
  }

  function toggleRun() {
    if (state.playing) { pause(); return; }
    state.replayMode = true;
    // 若已到全程末尾(或处于静态端态),先从头开始(同时重置 agent runtime)
    if (state.tSec >= T_CAP) { state.tSec = 0; if (AGENTS) initRT(); }
    play();
  }

  function play() {
    state.playing = true;
    runBtn.textContent = "⏸ 暂停";
    runBtn.classList.add("is-playing");
    // 跑满 45 min:t≤132 走 SCRIPT,t>132 由 agent 引擎动态生成
    state.timer = setInterval(() => {
      state.tSec += 2; // 2 秒/帧(节奏)
      if (state.tSec >= T_CAP) { state.tSec = T_CAP; advanceSim(state.tSec); applyState(state.tSec); pause(); return; }
      advanceSim(state.tSec);
      applyState(state.tSec);
    }, 220);
    advanceSim(state.tSec);
    applyState(state.tSec);
  }

  function pause() {
    state.playing = false;
    if (state.timer) clearInterval(state.timer);
    state.timer = null;
    runBtn.textContent = "▶ 继续";
    runBtn.classList.remove("is-playing");
  }

  function reset() {
    pause();
    state.replayMode = true; // 重置到回放起点 00:00(空场)
    state.tSec = 0;
    if (AGENTS) initRT(); // 清 DYN + 重置 agent runtime
    runBtn.textContent = "▶ 运行模拟";
    applyState(0);
  }

  /* ---------- 7.5 · 座位点击 → agent 画像 inspector ---------- */
  function bindSeatInspector() {
    Object.entries(seatEls).forEach(([id, seat]) => {
      seat.style.cursor = "pointer";
      seat.addEventListener("click", () => showMvInspector(id));
    });
  }
  function mvEsc(t) { return String(t == null ? "" : t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

  function showMvInspector(id) {
    if (!agentOf(id) && !byId[id]) return;
    let ov = document.getElementById("mv-inspector");
    if (!ov) {
      ov = el("div", "mv-insp-overlay"); ov.id = "mv-inspector";
      document.body.appendChild(ov);
      ov.addEventListener("click", (e) => { if (e.target === ov || e.target.classList.contains("mv-insp-close")) ov.classList.remove("is-open"); });
      document.addEventListener("keydown", (e) => { if (e.key === "Escape") ov.classList.remove("is-open"); });
    }
    ov.innerHTML = renderMvInspector(id);
    ov.classList.add("is-open");
  }

  function renderMvInspector(id) {
    const a = agentOf(id) || {};
    const s = byId[id] || {};
    const g = GROUPS[s.g] || {};
    const p = a.persona || {}, k = a.knowledge || {}, si = a.state_init || {};
    const rt = RT[id], cur = rt || si;
    const r = a.responses || {}, gr = a.graph || {}, d = a.drama || {}, ri = a.rubric_init || {};
    const m = (v) => Math.max(0, Math.min(1, +v || 0));
    const meter = (lbl, val, init) => {
      const delta = init != null ? val - init : 0;
      const dtxt = Math.abs(delta) < 0.001 ? "" : `<em class="${delta > 0 ? "up" : "down"}">${delta > 0 ? "+" : ""}${delta.toFixed(2)}</em>`;
      return `<div class="mv-insp-meter"><span>${lbl}</span><div><i style="width:${m(val) * 100}%"></i></div><b>${m(val).toFixed(2)}${dtxt}</b></div>`;
    };
    const evs = rt && rt._events ? rt._events.slice(-5).reverse() : [];
    const resp = Object.entries(r).slice(0, 3);
    return `
    <div class="mv-insp-card tone-${s.g ? s.g.toLowerCase() : "a"}">
      <button class="mv-insp-close" aria-label="关闭">×</button>
      <div class="mv-insp-head">
        <div class="mv-insp-id">${mvEsc(id)}</div>
        <div class="mv-insp-who"><div class="nm">${mvEsc(s.name || (a.identity && a.identity.alias) || "")}</div><div class="dm">${mvEsc((a.identity && a.identity.demo) || "")} · ${mvEsc(g.label || "")}</div></div>
        <div class="mv-insp-stance">${mvEsc(p.stance || g.label || "")} <small>${mvEsc(String(p.stance_strength != null ? p.stance_strength : (s.str != null ? s.str : "")))}/5</small></div>
      </div>
      ${p.belief ? `<div class="mv-insp-row"><b>立场</b>${mvEsc(p.belief)}</div>` : ""}
      ${p.belief_with_caveat ? `<div class="mv-insp-row caveat"><b>但</b>${mvEsc(p.belief_with_caveat)}</div>` : ""}
      ${p.doubt ? `<div class="mv-insp-row"><b>动摇</b>${mvEsc(p.doubt)}</div>` : ""}
      ${p.style ? `<div class="mv-insp-row"><b>风格</b>${mvEsc(p.style)}${p.tics && p.tics.length ? `<small>口头禅 · ${p.tics.map(mvEsc).join(" · ")}</small>` : ""}</div>` : ""}
      <div class="mv-insp-grid">
        <div><h6>状态（t=${fmt(state.tSec)} · ${rt ? "实时" : "初值"}）</h6>
          ${meter("注意力", cur.attention, rt ? si.attention : null)}
          ${meter("发言意愿", cur.speak_motivation, rt ? si.speak_motivation : null)}
          ${meter("社交安全感", cur.social_safety, rt ? si.social_safety : null)}
          ${meter("疲劳", cur.fatigue, rt ? si.fatigue : null)}
        </div>
        <div><h6>知识边界</h6>
          ${k.confident && k.confident.length ? `<p><b>擅长</b>${k.confident.slice(0, 3).map(mvEsc).join("；")}</p>` : ""}
          ${k.weak && k.weak.length ? `<p><b>薄弱</b>${k.weak.slice(0, 3).map(mvEsc).join("；")}</p>` : ""}
          ${k.anchors && k.anchors.length ? `<p><b>锚点</b>${k.anchors.slice(0, 2).map(mvEsc).join("；")}</p>` : (s.note ? `<p><b>备注</b>${mvEsc(s.note)}</p>` : "")}
        </div>
      </div>
      <div class="mv-insp-grid">
        <div><h6>响应库</h6>${resp.map(([kk, vv]) => { const tx = Array.isArray(vv) ? vv[0] : vv; return tx ? `<div class="mv-insp-resp"><span>${mvEsc(kk)}</span><p>"${mvEsc(cleanBeatText(tx))}"</p></div>` : ""; }).join("") || '<p style="opacity:.5">—</p>'}</div>
        <div><h6>关系网</h6>
          ${gr.allies && gr.allies.length ? `<p><b>盟友</b>${gr.allies.map(mvEsc).join(" · ")}</p>` : ""}
          ${gr.rivals && gr.rivals.length ? `<p><b>对手</b>${gr.rivals.map(mvEsc).join(" · ")}</p>` : ""}
          ${gr.watches && gr.watches.length ? `<p><b>关注</b>${gr.watches.map(mvEsc).join(" · ")}</p>` : ""}
        </div>
      </div>
      ${(d.tension || d.growth) ? `<div class="mv-insp-drama"><h6>内心戏剧</h6>
        ${d.tension ? `<p><b>张力</b>${mvEsc(d.tension)}</p>` : ""}
        ${d.growth ? `<p><b>可能成长</b>${mvEsc(d.growth)}</p>` : ""}
        ${d.wont_change ? `<p><b>不会变</b>${mvEsc(d.wont_change)}</p>` : ""}</div>` : ""}
      <div class="mv-insp-rubric"><h6>量规初值（6 维）</h6><div class="rr">
        <span>政策引用 ${ri.policy_citation != null ? ri.policy_citation : "—"}</span><span>立场迁移 ${ri.stance_shift != null ? ri.stance_shift : "—"}</span><span>反思深度 ${ri.reflection != null ? ri.reflection : "—"}</span>
        <span>团队贡献 ${ri.team_contrib != null ? ri.team_contrib : "—"}</span><span>证据使用 ${ri.evidence_use != null ? ri.evidence_use : "—"}</span><span>提问质量 ${ri.question_quality != null ? ri.question_quality : "—"}</span>
      </div></div>
      ${evs.length ? `<div class="mv-insp-evlog"><h6>近 5 次状态事件</h6>${evs.map((ev) => {
        const fx = Object.entries(ev.fx).map(([kk, vv]) => `<span class="${vv > 0 ? "up" : "down"}">${kk} ${vv > 0 ? "+" : ""}${vv.toFixed(2)}</span>`).join(" ");
        return `<div class="mv-insp-ev"><span class="t">${fmt(ev.t)}</span><span class="w">${mvEsc(ev.why)}</span><span class="fx">${fx}</span></div>`;
      }).join("")}</div>` : ""}
      <div class="mv-insp-foot"><span>group_role · ${mvEsc(si.group_role || g.base || "—")}</span><span>${mvEsc(id)} · 数据驱动 · t=${fmt(state.tSec)}</span></div>
    </div>`;
  }

  function ensureMvInspectorCSS() {
    if (document.getElementById("mv-insp-style")) return;
    const css = `
.mv-seat { transition: opacity .4s ease, transform .2s ease; }
.mv-seat.is-fading { filter: grayscale(.35); }
.mv-seat.is-tired .mv-ava::after { content:"z"; position:absolute; top:-2px; right:-2px; font:8px var(--mono,monospace); color:var(--mute,#807a6c); opacity:.7; }
.mv-insp-overlay { position:fixed; inset:0; background:rgba(20,18,16,.5); display:none; align-items:center; justify-content:center; z-index:10000; backdrop-filter:blur(2px); }
.mv-insp-overlay.is-open { display:flex; }
.mv-insp-card { width:min(720px,93vw); max-height:88vh; overflow-y:auto; background:var(--ivory,#fffdf7); color:var(--ink,#1a1a1a); border:1px solid var(--ink,#1a1a1a); border-radius:14px; box-shadow:8px 8px 0 var(--ink,#1a1a1a); padding:22px 26px; position:relative; font-family:var(--serif-cn); border-top:4px solid var(--mute,#9a958c); }
.mv-insp-card.tone-a { border-top-color:#d97757; } .mv-insp-card.tone-b { border-top-color:#95bba4; } .mv-insp-card.tone-c { border-top-color:#a790d2; } .mv-insp-card.tone-d { border-top-color:#9a958c; }
.mv-insp-close { position:absolute; top:12px; right:14px; width:28px; height:28px; border-radius:50%; background:var(--paper-2,#f3eedc); border:1px solid var(--rule,#d8d2bf); cursor:pointer; font-size:16px; }
.mv-insp-head { display:grid; grid-template-columns:auto 1fr auto; gap:14px; align-items:center; padding-bottom:12px; border-bottom:1px dashed var(--rule,#d8d2bf); margin-bottom:12px; }
.mv-insp-id { width:46px; height:46px; border-radius:10px; background:var(--ink,#1a1a1a); color:var(--ivory,#fffdf7); font:italic 600 22px var(--serif-en,Georgia); display:grid; place-items:center; }
.mv-insp-who .nm { font-size:18px; font-weight:600; } .mv-insp-who .dm { font:10.5px var(--mono,monospace); color:var(--mute,#807a6c); margin-top:2px; }
.mv-insp-stance { padding:6px 12px; border-radius:999px; font:10.5px var(--mono,monospace); background:var(--paper-2,#f3eedc); }
.tone-a .mv-insp-stance { background:rgba(217,119,87,.18); color:#a8492a; } .tone-b .mv-insp-stance { background:rgba(77,98,87,.2); color:#4d6257; } .tone-c .mv-insp-stance { background:rgba(112,82,168,.16); color:#7052a8; } .tone-d .mv-insp-stance { background:rgba(100,100,100,.12); color:#555; }
.mv-insp-row { font-size:13.5px; line-height:1.6; margin-bottom:7px; padding:8px 12px; background:var(--paper,#faf7f0); border-radius:6px; }
.mv-insp-row b { display:inline-block; min-width:48px; margin-right:8px; font:600 10px var(--mono,monospace); letter-spacing:.06em; color:var(--amber-deep,#a8492a); vertical-align:middle; }
.mv-insp-row.caveat { background:rgba(217,119,87,.06); border-left:2px solid var(--amber-deep,#a8492a); }
.mv-insp-row small { display:block; margin-left:56px; margin-top:3px; font:10.5px var(--mono,monospace); color:var(--mute,#807a6c); }
.mv-insp-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:12px; }
.mv-insp-grid > div { background:var(--paper-2,#f3eedc); border-radius:8px; padding:11px 13px; }
.mv-insp-grid h6 { font:10px var(--mono,monospace); letter-spacing:.12em; text-transform:uppercase; color:var(--mute,#807a6c); margin:0 0 9px; padding-bottom:5px; border-bottom:1px dashed var(--rule,#d8d2bf); }
.mv-insp-grid p { font-size:12.5px; line-height:1.55; margin:0 0 5px; color:var(--ink-2,#2a2a2a); }
.mv-insp-grid p b { font:600 9.5px var(--mono,monospace); color:var(--amber-deep,#a8492a); margin-right:5px; }
.mv-insp-meter { display:grid; grid-template-columns:74px 1fr 38px; align-items:center; gap:7px; margin-bottom:7px; font:10.5px var(--mono,monospace); }
.mv-insp-meter span { color:var(--mute,#807a6c); } .mv-insp-meter > div { height:4px; background:rgba(0,0,0,.08); border-radius:2px; overflow:hidden; } .mv-insp-meter > div i { display:block; height:100%; background:var(--amber-deep,#a8492a); }
.mv-insp-meter b { text-align:right; position:relative; } .mv-insp-meter b em { display:block; font:8px var(--mono,monospace); position:absolute; right:0; top:100%; } .mv-insp-meter b em.down { color:#a8492a; } .mv-insp-meter b em.up { color:#4d6257; }
.mv-insp-resp { padding:6px 8px; margin-bottom:5px; background:var(--ivory,#fffdf7); border-left:2px solid var(--amber-deep,#a8492a); border-radius:4px; }
.mv-insp-resp span { display:block; font:9.5px var(--mono,monospace); color:var(--mute,#807a6c); margin-bottom:2px; } .mv-insp-resp p { font:italic 12px var(--serif-cn,serif); margin:0; color:var(--ink-2,#2a2a2a); }
.mv-insp-drama { margin-top:12px; padding:13px 15px; background:var(--ink,#1a1a1a); color:var(--ivory,#fffdf7); border-radius:10px; }
.mv-insp-drama h6 { font:10px var(--mono,monospace); letter-spacing:.14em; text-transform:uppercase; color:rgba(217,119,87,.85); margin:0 0 8px; }
.mv-insp-drama p { font-size:12.5px; line-height:1.55; margin:0 0 5px; } .mv-insp-drama p b { font:500 9.5px var(--mono,monospace); color:rgba(217,119,87,.85); margin-right:5px; }
.mv-insp-rubric { margin-top:12px; padding:11px 13px; background:var(--paper-2,#f3eedc); border-radius:8px; }
.mv-insp-rubric h6 { font:10px var(--mono,monospace); letter-spacing:.12em; text-transform:uppercase; color:var(--mute,#807a6c); margin:0 0 8px; }
.mv-insp-rubric .rr { display:grid; grid-template-columns:repeat(3,1fr); gap:4px; font:10.5px var(--mono,monospace); } .mv-insp-rubric .rr span { padding:3px 6px; background:var(--ivory,#fffdf7); border-radius:3px; text-align:center; }
.mv-insp-evlog { margin-top:12px; padding:11px 13px; background:var(--paper,#faf7f0); border:1px dashed var(--rule,#d8d2bf); border-radius:8px; }
.mv-insp-evlog h6 { font:10px var(--mono,monospace); letter-spacing:.12em; text-transform:uppercase; color:var(--mute,#807a6c); margin:0 0 7px; }
.mv-insp-ev { display:grid; grid-template-columns:48px 1fr auto; gap:9px; align-items:center; padding:4px 0; border-bottom:1px dotted var(--rule,#d8d2bf); font-size:11px; }
.mv-insp-ev:last-child { border-bottom:0; } .mv-insp-ev .t { font:600 10px var(--mono,monospace); color:var(--amber-deep,#a8492a); } .mv-insp-ev .w { font-family:var(--serif-cn,serif); color:var(--ink-2,#2a2a2a); }
.mv-insp-ev .fx { display:flex; gap:5px; } .mv-insp-ev .fx span { font:9.5px var(--mono,monospace); padding:1px 5px; border-radius:3px; } .mv-insp-ev .fx span.down { background:rgba(217,119,87,.14); color:#a8492a; } .mv-insp-ev .fx span.up { background:rgba(77,98,87,.14); color:#4d6257; }
.mv-insp-foot { margin-top:12px; padding-top:10px; border-top:1px dashed var(--rule,#d8d2bf); display:flex; justify-content:space-between; font:10px var(--mono,monospace); color:var(--mute,#807a6c); }
`;
    const e2 = document.createElement("style"); e2.id = "mv-insp-style"; e2.textContent = css; document.head.appendChild(e2);
  }

  /* ---------- 8 · 初始化 ---------- */
  function init() {
    mount = document.getElementById("mv-classroom");
    if (!mount) return;
    buildScene();
    // 无条件:注入样式 + 用 STUDENTS+默认值建 RT + 绑定座位点击
    // —— 即使 agent JSON 加载失败(如 file:// 或别的服务器),点击也能看基础画像
    ensureMvInspectorCSS();
    ensureSpectrumCSS();
    initRT();
    bindSeatInspector();
    formGroups("hetero", 6); // 默认异质分组(真实课堂做法)
    applyState(state.tSec); // 初始展示 02:12 端态(与页面其余 LIVE 一致)
    // 异步加载 32-agent 数据 → 用真实 stance_position/responses/graph/drama 重建,启用 t>132 动态决策
    loadAgents().then((d) => {
      if (!d) return;
      initRT();
      // agent 真实立场到位 → 重建光谱位置 + 重算分组
      const band = document.getElementById("mv-spec-band");
      if (band) {
        band.querySelectorAll(".mv-seat").forEach((seat) => {
          const s = byId[seat.dataset.id]; if (!s) return;
          seat.style.left = (((stanceOf(s) + 1) / 2) * 100).toFixed(1) + "%";
        });
      }
      formGroups(curGroupMode, curGroupN);
      applyState(state.tSec);
    });
  }

  function ensureSpectrumCSS() {
    if (document.getElementById("mv-spec-style")) return;
    const css = `
.mv-floor { display:block !important; }
.mv-spectrum { background:var(--paper,#faf7f0); border:1px solid var(--rule,#d8d2bf); border-radius:12px; padding:14px 16px 8px; margin-bottom:12px; }
.mv-spec-head { display:flex; justify-content:space-between; align-items:baseline; margin-bottom:8px; flex-wrap:wrap; gap:6px; }
.mv-spec-title { font:600 13px var(--serif-cn,serif); color:var(--ink,#1a1a1a); }
.mv-spec-note { font:10px var(--mono,monospace); color:var(--mute,#807a6c); letter-spacing:.02em; }
.mv-spec-band { position:relative; height:196px; margin:22px 8px 30px; }
.mv-spec-axis { position:absolute; left:0; right:0; bottom:-6px; height:2px; background:linear-gradient(90deg,#95bba4,#d8d2bf 50%,#d97757); border-radius:2px; }
.mv-spec-lbl { position:absolute; bottom:-26px; font:10px var(--mono,monospace); color:var(--mute,#807a6c); }
.mv-spec-lbl.l { left:0; color:#4d6257; } .mv-spec-lbl.c { left:50%; transform:translateX(-50%); } .mv-spec-lbl.r { right:0; color:#a8492a; }
.mv-csilence { position:absolute; top:-14px; left:50%; transform:translateX(-50%); white-space:nowrap; font:10.5px var(--mono,monospace); color:#a8492a; background:rgba(217,119,87,.12); border:1px solid rgba(217,119,87,.3); border-radius:999px; padding:2px 10px; }
/* 光谱里的座位:绝对定位覆盖原圆桌布局 */
.mv-spectrum .mv-seat { position:absolute; transform:translate(-50%,0) !important; width:auto; height:auto; margin:0; display:flex; flex-direction:column; align-items:center; gap:1px; transition:left .5s cubic-bezier(.22,1,.36,1),opacity .4s; }
.mv-spectrum .mv-seat .mv-ava { width:26px; height:26px; border-radius:50%; display:grid; place-items:center; border:1.5px solid; background:var(--ivory,#fffdf7); }
.mv-spectrum .mv-seat .mv-ava-id { font:600 9px var(--mono,monospace); }
.mv-spectrum .mv-seat.tone-a .mv-ava { border-color:#d97757; color:#a8492a; } .mv-spectrum .mv-seat.tone-b .mv-ava { border-color:#95bba4; color:#4d6257; }
.mv-spectrum .mv-seat.tone-c .mv-ava { border-color:#a790d2; color:#7052a8; } .mv-spectrum .mv-seat.tone-d .mv-ava { border-color:#bdb8ad; color:#807a6c; }
.mv-spectrum .mv-seat .mv-ava-name { display:none; } /* 默认隐藏人名(避免拥挤),hover/点击看详情 */
.mv-spectrum .mv-seat:hover { z-index:20; } .mv-spectrum .mv-seat:hover .mv-ava-name { display:block; position:absolute; top:100%; left:50%; transform:translateX(-50%); margin-top:1px; font:9px var(--serif-cn,serif); color:var(--ink,#1a1a1a); white-space:nowrap; background:var(--ivory,#fffdf7); padding:0 3px; border-radius:3px; }
.mv-spectrum .mv-seat:hover .mv-ava { box-shadow:0 0 0 2px var(--amber-deep,#a8492a); }
.mv-spectrum .mv-seat.is-live .mv-ava { background:#d97757; color:#fff; box-shadow:0 0 0 3px rgba(217,119,87,.35); animation:mvPulse 1.2s infinite; }
.mv-spectrum .mv-seat.is-active .mv-ava { background:rgba(217,119,87,.14); }
.mv-spectrum .mv-seat.is-csilent { opacity:.5; } .mv-spectrum .mv-seat.is-csilent .mv-ava { border-style:dashed; }
.mv-spectrum .mv-seat .mv-gbadge:not(:empty) { position:absolute; top:-6px; right:-6px; width:14px; height:14px; border-radius:50%; background:var(--ink,#1a1a1a); color:#fff; font:600 8px var(--mono,monospace); display:grid; place-items:center; }
.mv-spectrum .mv-seat .mv-bubble { position:absolute; bottom:100%; left:50%; transform:translateX(-50%); margin-bottom:4px; background:var(--ink,#1a1a1a); color:#fff; font:10px var(--serif-cn,serif); padding:3px 7px; border-radius:6px; white-space:nowrap; opacity:0; pointer-events:none; transition:opacity .2s; z-index:5; }
.mv-spectrum .mv-seat .mv-bubble.is-on { opacity:1; }
.mv-spectrum .mv-seat .mv-tip { left:50%; bottom:auto; top:100%; transform:translateX(-50%); margin-top:4px; }
@keyframes mvPulse { 0%,100%{box-shadow:0 0 0 3px rgba(217,119,87,.35);} 50%{box-shadow:0 0 0 6px rgba(217,119,87,.1);} }
/* 分组区 */
.mv-grouping { background:var(--ivory,#fffdf7); border:1px solid var(--rule,#d8d2bf); border-radius:12px; padding:12px 16px; }
.mv-grp-ctrl { display:flex; align-items:center; gap:14px; flex-wrap:wrap; margin-bottom:10px; }
.mv-grp-lbl { font:600 12.5px var(--serif-cn,serif); color:var(--ink,#1a1a1a); } .mv-grp-lbl small { font:10px var(--mono,monospace); color:var(--mute,#807a6c); margin-left:6px; font-weight:400; }
.mv-grp-modes { display:flex; gap:6px; flex-wrap:wrap; }
.mv-gbtn { font:11px var(--serif-cn,serif); padding:5px 11px; border-radius:999px; border:1px solid var(--rule,#d8d2bf); background:var(--paper-2,#f3eedc); color:var(--ink-soft,#555); cursor:pointer; transition:all .15s; }
.mv-gbtn:hover { border-color:var(--amber-deep,#a8492a); color:var(--amber-deep,#a8492a); }
.mv-gbtn.is-on { background:var(--amber-deep,#a8492a); color:#fff; border-color:var(--amber-deep,#a8492a); }
.mv-grp-n { font:10.5px var(--mono,monospace); color:var(--mute,#807a6c); margin-left:auto; } .mv-grp-n b { color:var(--ink,#1a1a1a); }
.mv-grp-result { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; }
.mv-grp-chip { display:flex; align-items:center; gap:8px; padding:7px 10px; background:var(--paper,#faf7f0); border:1px solid var(--rule,#d8d2bf); border-radius:8px; }
.mv-grp-chip .gk { font:600 10.5px var(--mono,monospace); color:var(--ink,#1a1a1a); white-space:nowrap; }
.mv-grp-chip .gd { display:flex; gap:3px; flex:1; flex-wrap:wrap; }
.mv-grp-chip .gd i { width:11px; height:11px; border-radius:50%; display:inline-block; }
.mv-grp-chip .gd i.tone-a { background:#d97757; } .mv-grp-chip .gd i.tone-b { background:#95bba4; } .mv-grp-chip .gd i.tone-c { background:#a790d2; } .mv-grp-chip .gd i.tone-d { background:#bdb8ad; }
.mv-grp-chip .gs { font:9.5px var(--mono,monospace); color:var(--mute,#807a6c); white-space:nowrap; } .mv-grp-chip .gs.wide { color:#a8492a; font-weight:600; }
.mv-grp-hint { margin-top:9px; font:11.5px var(--serif-cn,serif); color:var(--ink-soft,#555); line-height:1.5; } .mv-grp-hint b { color:var(--ink,#1a1a1a); } .mv-grp-hint b.hi { color:var(--amber-deep,#a8492a); }
`;
    const e3 = document.createElement("style"); e3.id = "mv-spec-style"; e3.textContent = css; document.head.appendChild(e3);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
