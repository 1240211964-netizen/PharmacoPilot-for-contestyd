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
    { id: "B1", name: "叶清涵", str: 5, init: "active", note: "社区药店见习 · 熟悉门店排班与服务瓶颈" },
    { id: "B2", name: "吴语桐", str: 4, init: "active", note: "慢病随访志愿者 · 关注顾客需求" },
    { id: "B3", name: "高梓铭", str: 4, init: "active", note: "连锁药房实习 · 熟悉会员运营" },
    { id: "B4", name: "许若曦", str: 4, init: "active", note: "门店调研经历 · 关注服务流程" },
    { id: "B5", name: "曹一然", str: 3, init: "active", note: "社区慢病项目 · 关注依从性服务" },
    { id: "B6", name: "邓嘉禾", str: 4, init: "active", note: "零售运营见习 · 关注人员与成本" },
    { id: "B7", name: "姚梦琪", str: 3, init: "active", note: "药师服务观察 · 关注专业能力" },
    { id: "B8", name: "魏景然", str: 2, init: "neutral", note: "门店兼职经历 · 仅小组内表达" },
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
   * t = 分析重心(-1 内部能力 … +1 外部环境)；m = 易动度(0…1)；why = tooltip 理由 */
  const STANCE_BAKED = {
    A1:{t: 0.85,m:0.12,why:"医保局实习，习惯先看政策与市场趋势，外部环境取向稳定"},
    A2:{t: 0.55,m:0.35,why:"数字派，善于用行业数据识别机会与威胁"},
    A3:{t: 0.65,m:0.25,why:"县医保办经历使其关注政策窗口，但能接受内部能力反证"},
    A4:{t: 0.45,m:0.45,why:"商保 / DRG 视角，偏向外部支付环境，易被运营证据修正"},
    A5:{t: 0.50,m:0.40,why:"依赖数据判断环境趋势，证据充分时会微调"},
    A6:{t: 0.50,m:0.40,why:"连锁零售视角，能在市场趋势与门店能力间切换"},
    A7:{t: 0.40,m:0.50,why:"反思型，通常综合多组证据后再归类"},
    A8:{t: 0.25,m:0.70,why:"被动同意，容易跟随场上占优的分类框架"},
    B1:{t:-0.90,m:0.10,why:"社区药店见习使其熟悉内部排班与服务流程，内部能力取向稳定"},
    B2:{t:-0.80,m:0.18,why:"慢病随访经历使其关注门店服务能力与顾客关系资产"},
    B3:{t:-0.75,m:0.20,why:"会员运营经验使其优先识别组织内部资源与短板"},
    B4:{t:-0.70,m:0.25,why:"门店调研经验使其习惯从流程可控性判断优势与劣势"},
    B5:{t:-0.60,m:0.35,why:"慢病项目经历使其关注服务连续性与内部执行条件"},
    B6:{t:-0.75,m:0.20,why:"零售运营见习使其重视人员、成本与组织能力"},
    B7:{t:-0.55,m:0.40,why:"药师服务观察使其关注专业能力能否支撑战略"},
    B8:{t:-0.40,m:0.60,why:"有门店经历但表达不稳定，容易被同组证据带动"},
    C1:{t:-0.25,m:0.20,why:"产业背景让其能同时看到组织能力与竞争环境，但担心被贴标签"},
    C2:{t:-0.10,m:0.30,why:"研发背景使其善于识别技术机会，也警惕资源约束"},
    C3:{t:-0.15,m:0.30,why:"产业观察较深，但对内部/外部边界仍保持谨慎"},
    C4:{t: 0.00,m:0.25,why:"企业实习经历使其习惯双向核对，停在边界位置"},
    C5:{t:-0.10,m:0.35,why:"熟悉民营企业资源限制，但发言机会经常被抢"},
    C6:{t: 0.00,m:0.30,why:"认为同一现象可能需拆成内部条件与外部趋势两条"},
    C7:{t:-0.20,m:0.15,why:"供应链背景使其重视可控资源与外部供给的分界"},
    C8:{t:-0.05,m:0.30,why:"监管家庭背景使其倾向先核实因素是否属于外部制度环境"},
    D1:{t:-0.10,m:0.75,why:"内向不自信，有观察但尚未形成稳定分类依据"},
    D2:{t: 0.00,m:0.80,why:"前置知识缺口，容易跟随场上最清晰的分类解释"},
    D3:{t:-0.35,m:0.50,why:"反思单较丰富，能看见内部短板，只等被点名"},
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
    { t: 0,   kind: "marker", text: "问题链 · 第 1 题 — S/W/O/T 初步归类" },
    { t: 18,  kind: "line", role: "A", text: "已附案例数据：20 家社区门店会员复购、执业药师排班、医保门诊统筹与竞品服务记录。" },
    { t: 35,  kind: "line", role: "T", text: "华康连锁拟开展慢病药学服务——请先各选一条，判断它属于 S、W、O 还是 T。" },
    { t: 48,  kind: "line", role: "S", who: "A1", text: "医保门诊统筹扩围是外部政策窗口，我归到机会 O。", bubble: "政策窗口 → O" },
    { t: 54,  kind: "line", role: "S", who: "A2", text: "20 家社区门店和既有会员数据是内部资源，属于优势 S。", bubble: "门店网络 → S" },
    { t: 60,  kind: "line", role: "S", who: "B1", text: "但执业药师排班不足会卡住服务落地，我先归到劣势 W。", bubble: "排班不足 → W" },
    { t: 66,  kind: "line", role: "S", who: "A3", text: "周边平台药房正在做在线随访，这更像外部威胁 T。", bubble: "平台竞争 → T" },
    { t: 84,  kind: "marker", text: "问题链 · 第 3 题 — W/T 边界与 TOWS 转化" },
    { t: 98,  kind: "line", role: "T", text: "同样是‘执业药师不足’，为什么有人归 W、有人归 T？判断边界是什么？" },
    { t: 98,  kind: "line", role: "S", who: "A1", text: "门店自己的排班与培养机制可以调整，所以这是内部劣势 W。", bubble: "组织可控 → W" },
    { t: 108, kind: "line", role: "S", who: "B1", text: "但全市药师供给不足不是一家门店能控制的，应当归外部威胁 T。", bubble: "行业供给 → T" },
    { t: 115, kind: "line", role: "S", who: "A2", text: "同一现象要拆开：内部排班能力写 W，外部人才供给趋势写 T。", bubble: "拆成两条证据" },
    { t: 118, kind: "line", role: "S", who: "B2", text: "而且两条都要有数据，不能只凭感觉贴标签。", bubble: "分类必须有证据" },
    { t: 120, kind: "silence", group: "C", text: "8 位具产业或门店实习背景的同学都标出了竞争威胁，却没人引用竞品与供应数据——T 维证据暂时缺位。" },
    { t: 125, kind: "note", role: "A", text: "⚠ 检测到 SWOT 内外部边界分歧（门店排班能力 W vs 行业人才供给 T）——建议拆成组织可控条件与外部趋势，并分别标注证据。", km: "KM-01" },
    { t: 132, kind: "line", role: "T", text: "先不投票——用‘组织能否直接控制’检验边界，再把一组 S/O/W/T 组合成可执行的 TOWS 策略。" },
  ];
  const T_CAP = 2700; // 45 min

  const TEACHER_BEATS = [
    { t: 285,  text: "我注意到 B 组把‘药师不足’拆成内部排班与外部供给——这正是 SWOT 边界判断。" },
    { t: 475,  text: "很好。下一题——谁能把一个优势 S 和一个机会 O 组合成 SO 策略？", openQ: true },
    { t: 900,  text: "TOWS 策略 · 交叉质疑", marker: true },
    { t: 1500, text: "现在我想听听有产业或门店实习经历的同学——竞争威胁 T 还有什么证据？", callC: true },
    { t: 1920, text: "我们快结束了——哪条 SWOT 判断最容易混淆内部与外部？", openQ: true, reflect: true },
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
    if (t < 440)  return ["SWOT", "内部能力", "外部环境", "优势", "劣势", "机会", "威胁", "证据"];
    if (t < 900)  return ["小组汇报", "证据", "门店", "会员", "政策", "市场"];
    if (t < 1500) return ["交叉质疑", "内外部边界", "组织可控", "环境趋势", "数据"];
    if (t < 1920) return ["TOWS", "SO", "WO", "ST", "WT", "策略", "产业", "竞争"];
    if (t < 2520) return ["反思", "边界", "内外部", "证据", "策略可行性"];
    return ["反思单", "收束", "SWOT", "TOWS"];
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
