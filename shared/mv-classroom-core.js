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

  /* ---------- 0 · 确定性随机（persona-v2-contract §9 · P0） ----------
   * P0：页面由并行会话冻结、暂不引新脚本，故内嵌本副本；
   * 与 shared/sim-rng.js 的 SIM-RNG 标记区逐字节一致（verify-agent-persona 校验）。 */
  /* ==== SIM-RNG-BEGIN · 引擎内嵌副本须与本区逐字节一致 ==== */
  // FNV-1a 32bit：seed 字符串 → 32 位无符号整数
  function fnv1a32(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  }
  // mulberry32：32 位种子 PRNG，输出 [0,1)，无依赖、可复现
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function next() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // seed 串 = simVersion | personaSetVersion | lessonId | scenarioId | runSeed
  function seedStringOf(cfg) {
    return [cfg.simVersion, cfg.personaSetVersion, cfg.lessonId, cfg.scenarioId, cfg.runSeed].join("|");
  }
  function createSeededRng(cfg) {
    return mulberry32(fnv1a32(seedStringOf(cfg)));
  }
  /* ==== SIM-RNG-END ==== */

  /* seed 配置：reset(seedConfig) 可覆盖任一分量；默认值与现行 SWOT 章节一致，
     画像 _meta.simVersion / _meta.version 加载后自动跟随，现有页面零改动可用。 */
  const DEFAULT_SEED_CONFIG = {
    simVersion: "sim-1.0.0",
    personaSetVersion: "virtual-class-agents-v0.2",
    lessonId: "mp-ch3-environment",
    scenarioId: "swot-huakang-chronic",
    runSeed: "run-0",
  };
  let SEED_CFG = { ...DEFAULT_SEED_CONFIG };
  let rng = createSeededRng(SEED_CFG);

  function reseedRng(seedConfig) {
    const meta = (AGENTS && AGENTS._meta) || {};
    SEED_CFG = {
      ...DEFAULT_SEED_CONFIG,
      simVersion: meta.simVersion || DEFAULT_SEED_CONFIG.simVersion,
      personaSetVersion: meta.version || DEFAULT_SEED_CONFIG.personaSetVersion,
      ...(seedConfig || {}),
    };
    rng = createSeededRng(SEED_CFG);
  }

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
  let __scoreNoiseOverride = null; // P5：debugScore 专用噪声注入（正常决策恒 null）
  const sim = {};           // 教师动作窗口标记：_callCUntil / _callSilentUntil / _openQUntil / _callResponders

  function loadAgents() {
    if (AGENTS) return Promise.resolve(AGENTS);
    return fetch("./shared/virtual-class-agents.json", { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { AGENTS = d; return d; })
      .catch(() => null);
  }
  function agentOf(id) { return (AGENTS && AGENTS.agents) ? AGENTS.agents.find((a) => a.id === id) : null; }

  /* P3 课程级状态：L1 激活（§7，只调运行时生效值，不写回 state_init）+ enrichmentPlan（§2.1，课加载生成、课结束丢弃） */
  let ACT = {};           // id → activationOf 结果（含 direction/magnitude/sensitive/eventId）
  let ENRICH = null;      // 本课 enrichmentPlan（computeEnrichmentPlan 产物）
  function lessonOf(cfg) {
    const meta = (AGENTS && AGENTS._meta) || {};
    const lid = (cfg && cfg.lessonId) || SEED_CFG.lessonId;
    return (meta.lessons || []).find((l) => l.lessonId === lid) || null;
  }
  function lookupTables() {
    const meta = (AGENTS && AGENTS._meta) || {};
    return {
      proximity: (meta.role_proximity_table && meta.role_proximity_table.proximity) || {},
      transferability: (meta.transferability_table && meta.transferability_table.by_type) || {},
    };
  }

  function initRT(seedConfig) {
    reseedRng(seedConfig); // §9：每次 reset 重播种，同一 seedConfig 全程可复放
    Object.keys(RT).forEach((k) => delete RT[k]);
    // P3：课程加载 → L1 激活 + enrichmentPlan（§2.1 生命周期：课加载生成、课结束丢弃，绝不回写 persona）
    const lesson = lessonOf(seedConfig);
    const tables = lookupTables();
    ACT = {}; ENRICH = computeEnrichmentPlan(AGENTS, lesson, tables);
    STUDENTS.forEach((s) => {
      const a = agentOf(s.id);
      const si = (a && a.state_init) || {};
      // §7.2 激活 → L1 生效 speak_motivation（base 不变，仅运行时层调制）
      const act = a ? activationOf(a, lesson, tables) : { direction: 0, magnitude: 0, sensitive: false, familiarity: 0, identity: 0.5, eventId: null };
      const l1 = applyActivationToL1(si.speak_motivation != null ? si.speak_motivation : (s.init === "active" ? 0.7 : 0.3), act);
      ACT[s.id] = act;
      RT[s.id] = {
        attention: si.attention != null ? si.attention : (s.init === "quiet" ? 0.45 : s.init === "silent" ? 0.78 : 0.7),
        speak_motivation: l1.speak_motivation,
        fatigue: si.fatigue || 0,
        social_safety: si.social_safety != null ? si.social_safety : (s.init === "silent" ? 0.38 : 0.6),
        stance_position: si.stance_position != null ? si.stance_position : ((STANCE_BAKED[s.id] && STANCE_BAKED[s.id].t) || 0),
        fatigue_rate: si.fatigue_rate != null ? si.fatigue_rate : 0.00005, // P2 persona-map-v1 R2 派生；缺数据回退基础档
        // P3 · L2 课堂运行状态（更新/消费规则见 tickRT/genOneBeat/scoreDesire；依据见 _meta.persona_map_notes.runtime_layer）
        cognitiveConflict: 0,
        perceivedUnderstanding: Math.min(1, Math.max(0, 0.35 + 0.4 * (personaFactorValue(a, "F1") != null ? personaFactorValue(a, "F1") : 0.5))),
        participationDebt: 0,
        learningTrace: [], // L3：仅 enrichmentPlan learningTraceDepth≥2 的 deep 学生追加（全员字段在位、light 保持空数组）
        _baseSpeakMotivation: si.speak_motivation != null ? si.speak_motivation : null, // L1 调制前基线（对照/审查用）
        spoke_count: 0, last_spoke_t: null, _events: [], _recentRaw: []
      };
    });
    buildSched();
    genCursor = 132; lastTickT = 132; DYN = [];
    sim._callCUntil = 0; sim._callSilentUntil = 0; sim._openQUntil = 0; sim._callResponders = null;
    sim._forcedCallId = null; // P5：打断式强制点名待结算标记（发言后按 interrupt_tolerance 残留惩罚）
  }

  /* ==== SCHED-DERIVE-BEGIN · 引擎内嵌副本须与本区逐字节一致 ==== */
  // drama.events → SCHED：agent 由所属学生隐含，产物按 t 升序。
  function deriveSchedFromDrama(agentsData) {
    const out = [];
    ((agentsData && agentsData.agents) || []).forEach((a) => {
      const evs = (a && a.drama && a.drama.events) || [];
      evs.forEach((e) => {
        out.push({ t: e.t, agent: a.id, fx: e.fx, why: e.why });
      });
    });
    out.sort((x, y) => x.t - y.t);
    return out;
  }
  /* ==== SCHED-DERIVE-END ==== */

  /* ==== ENRICH-ACTIVATION-BEGIN · 引擎内嵌副本须与本区逐字节一致 ==== */
  // 本区为纯函数：不读引擎状态、不调 rng、无 DOM——同输入同输出。
  // tables = { proximity: _meta.role_proximity_table.proximity, transferability: _meta.transferability_table.by_type }

  // FNV-1a 32bit（§2.1 explorationBonus 用；与 SIM-RNG 同算法但独立命名，防标记区耦合）
  function __enrichFnv1a32(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  }
  function __jaccardTags(a, b) {
    const sa = {}, sb = {};
    (a || []).forEach((t) => { sa[t] = 1; });
    (b || []).forEach((t) => { sb[t] = 1; });
    let inter = 0, union = 0;
    Object.keys(sa).forEach((t) => { union += 1; if (sb[t]) inter += 1; });
    Object.keys(sb).forEach((t) => { if (!sa[t]) union += 1; });
    return union === 0 ? 0 : inter / union;
  }

  // §7.1 情境熟悉度：max over historyEvents of Jaccard(tags) × depth × recency × roleProximity × transferability
  // 返回 {value, event}：event 为取得最大值的事件（§7.2 sensitive 方向判定用）；无命中 value=0/event=null
  function scenarioFamiliarity(student, lesson, tables) {
    const best = { value: 0, event: null };
    if (!student || !lesson || !tables) return best;
    const proximity = tables.proximity || {};
    const transfer = tables.transferability || {};
    (student.historyEvents || []).forEach((e) => {
      const row = proximity[e.role] || {};
      let prox = 0; // 缺列兜底弱相关档 0.1（§7.1 锚定无关≈0.1–0.15）
      (lesson.requiredRole || []).forEach((r) => {
        const v = row[r] != null ? row[r] : 0.1;
        if (v > prox) prox = v;
      });
      const tr = transfer[e.type] != null ? transfer[e.type] : 0;
      const v = __jaccardTags(e.tags, lesson.tags) * (e.depth || 0) * (e.recency || 0) * prox * tr;
      if (v > best.value) { best.value = v; best.event = e; }
    });
    return best;
  }

  // 画像因子有效值：approved:true 的 §6.2 校准 delta 生效（限幅由 persona-map-v1 管线把守），未批准不动
  function personaFactorValue(agent, k) {
    const f = agent && agent.latentFactors && agent.latentFactors[k];
    if (!f || typeof f.value !== "number") return null;
    const adj = f.adjustment;
    const d = adj && adj.approved === true && typeof adj.delta === "number" ? adj.delta : 0;
    return Math.min(1, Math.max(0, f.value + d));
  }

  // §7.2 激活（方向判定，可正可负）：
  //   熟悉度 ─▶ 身份相关性（F5 调制 identity ∈ [0.5,1]）─▶ 情绪显著性（sensitive:true → 负向）─▶ 行为方向
  //   判例（契约 §7.2）：家庭成员慢病经历学生在患者负担议题 familiarity 高，但 sensitive 使方向为负——更沉默而非更积极。
  function activationOf(student, lesson, tables) {
    const fam = scenarioFamiliarity(student, lesson, tables);
    const f5 = personaFactorValue(student, "F5");
    const identity = 0.5 + 0.5 * (f5 == null ? 0.5 : f5);
    const sensitive = !!(fam.event && fam.event.sensitive);
    const magnitude = fam.value * identity;
    const direction = magnitude > 0 ? (sensitive ? -1 : 1) : 0;
    return { familiarity: fam.value, eventId: fam.event ? fam.event.id : null, identity: identity, sensitive: sensitive, magnitude: magnitude, direction: direction };
  }

  // L1 生效值调制（只调运行时初始化层，不写回 state_init）：
  //   正向 speak_motivation↑ + evidence 语料键优先（evidenceBias=true 供 pickRespKey 消费）；
  //   负向 silent 倾向↑（sm 减分；"仅小组内"语义由 silent_on 规则侧承载，不在本函数内分支）。
  var ACTIVATION_SM_GAIN = 0.2;
  function applyActivationToL1(baseSpeakMotivation, act) {
    let sm = baseSpeakMotivation;
    if (act && act.direction !== 0) sm = baseSpeakMotivation + act.direction * ACTIVATION_SM_GAIN * act.magnitude;
    return { speak_motivation: Math.min(1, Math.max(0, sm)), evidenceBias: !!(act && act.direction > 0) };
  }

  // §2.1 课程级临时资源计划（enrichmentPlan）：
  //   课程加载时生成 → 本课使用 → 课结束丢弃；不得写回 persona 永久记录（verify 硬门禁）。
  //   优先级公式六项（speakProbability 不得为主要权重——公式不含 sm 主项，sm 仅以"不确定性"形式反向进入）：
  //     scenarioActivation      §7 情境激活程度（熟悉度）
  //     personaUncertainty      参数不确定性：sm 越居中行为越难预判，越值得深建模
  //     coverageGap             班级覆盖缺口：该生最佳匹配背景类型在已激活班级中的稀缺度
  //     interventionSensitivity 干预敏感性（教学诊断价值）：有沉默因果 / 敏感经历者优先
  //     counterfactualValue     反事实价值：立场易动者在不同干预下分叉潜力更大
  //     explorationBonus        探索奖励：确定性哈希，防稳定偏向高动机学生
  //   系数依据见画像 _meta.persona_map_notes.enrichment。
  var ENRICH_WEIGHTS = { scenarioActivation: 0.3, personaUncertainty: 0.15, coverageGap: 0.15, interventionSensitivity: 0.2, counterfactualValue: 0.1, explorationBonus: 0.1 };
  var ENRICH_TOP_N = 8;
  var ENRICH_DEEP = { conceptModel: "deep", responseInventory: 6, misconceptionModel: true, learningTraceDepth: 2, interventionBranches: 3, counterfactualResponses: true };
  var ENRICH_LIGHT = { conceptModel: "light", responseInventory: 3, misconceptionModel: false, learningTraceDepth: 0, interventionBranches: 1, counterfactualResponses: false };
  function computeEnrichmentPlan(agentsData, lesson, tables) {
    const agents = (agentsData && agentsData.agents) || [];
    if (!lesson || !agents.length) return null;
    const best = agents.map((a) => ({ a: a, fam: scenarioFamiliarity(a, lesson, tables) }));
    const activated = best.filter((x) => x.fam.value > 0);
    const typeCount = {};
    activated.forEach((x) => {
      const t = x.fam.event && x.fam.event.type;
      typeCount[t] = (typeCount[t] || 0) + 1;
    });
    const rows = best.map((x) => {
      const a = x.a, fam = x.fam;
      const sm = (a.state_init && a.state_init.speak_motivation != null) ? a.state_init.speak_motivation : 0.3;
      const str = (a.persona && typeof a.persona.stance_strength === "number") ? a.persona.stance_strength : 3;
      const parts = {
        scenarioActivation: fam.value,
        personaUncertainty: 1 - Math.abs(2 * sm - 1),
        coverageGap: fam.value > 0 ? 1 - (typeCount[(fam.event && fam.event.type)] || 1) / Math.max(1, activated.length) : 0,
        interventionSensitivity: 0.5 * (((a.silenceCauses || []).length > 0) ? 1 : 0) + 0.5 * ((fam.event && fam.event.sensitive) ? 1 : 0),
        counterfactualValue: (5 - Math.min(5, Math.max(1, str))) / 4,
        explorationBonus: __enrichFnv1a32(String(lesson.lessonId) + "|" + a.id) / 4294967296,
      };
      let total = 0;
      Object.keys(ENRICH_WEIGHTS).forEach((k) => { total += ENRICH_WEIGHTS[k] * parts[k]; });
      return { id: a.id, total: Math.round(total * 10000) / 10000, parts: parts };
    });
    rows.sort((x, y) => (y.total - x.total) || (x.id < y.id ? -1 : 1));
    const top8 = rows.slice(0, ENRICH_TOP_N).map((r) => r.id);
    const students = {};
    rows.forEach((r) => {
      const deep = top8.indexOf(r.id) >= 0;
      students[r.id] = Object.assign({}, deep ? ENRICH_DEEP : ENRICH_LIGHT, { priority: r.total, priorityParts: r.parts });
    });
    return { lessonId: lesson.lessonId, lifecycle: "lesson-load（课程加载时生成 · 课结束丢弃 · 不回写 persona）", top8: top8, students: students };
  }
  /* ==== ENRICH-ACTIVATION-END ==== */

  function buildSched() {
    // §8.2 单源：SCHED 由 drama.events 派生（SCHED-DERIVE 内嵌副本，与
    // shared/sched-from-drama.js / practice-runtime.js 副本逐字节一致）。
    // 规范 26 条 + §15-1 C3/C6 点名 2 条 = 28；原手工 18 条漂移残本废弃。
    SCHED = deriveSchedFromDrama(AGENTS);
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
      // §15-1：仅 C6 使用——除教师点名窗口外全程沉默（沉默因果结构不变，被点名可短回应）
      if (r === "所有（除教师点名）") return !ctx.called;
      if (r.includes("家庭隐私")) return ctx.topic.some((tp) => tp.includes("家庭"));
      if (r.includes("临床细节")) return ctx.topic.some((tp) => /临床|BE|INR/.test(tp));
      if (r.includes("几乎从不") || r === "所有公开发言" || r === "所有" || r.includes("从未成功")) return true;
      if (r.includes("仅小组内") || r.includes("仅在小组内")) return true;
      return false;
    });
  }
  // P2：行业视角点名（callC）目标判定——有沉默因果且具行业/职业接触（或家族产业参与）的学生（历史驱动，替代 v0.3 字母口径）
  function isCallCTarget(a) {
    if (!a || !((a.silenceCauses || []).length > 0)) return false;
    return ((a.historyEvents) || []).some((e) => e.type === "industry_experience" || e.type === "career_contact" || e.role === "family_business_participant");
  }
  // P5 · 干预响应矩阵（persona-map-v1.R4 逐人派生，字段取值依据 _meta.persona_map_notes.R4）：
  //   缺省降级 = 旧行为（directMult 1 / 铺垫 0 / 追问 0 / 容忍 0.7）——旧数据语义不变
  function interventionOf(a) {
    const ir = (a && a.interventionResponse) || {};
    const pc = ir.publicCall || {};
    return {
      directMult: typeof pc.directMult === "number" ? pc.directMult : 1,
      scaffoldedBonus: typeof pc.scaffoldedBonus === "number" ? pc.scaffoldedBonus : 0,
      probeGain: (ir.openQProbe && typeof ir.openQProbe.gain === "number") ? ir.openQProbe.gain : 0,
      interruptTolerance: (a && a.rules && typeof a.rules.interrupt_tolerance === "number") ? a.rules.interrupt_tolerance : 0.7,
    };
  }
  // P2 §4：认识论习惯（latentFactors.F3）驱动的语料键类别——只在已匹配的公开候选池内调概率，键集合不变
  const EVIDENCE_KEYS = ["evidence_supply", "case_data", "case_support", "anchor_argument", "technical", "technical_rebuttal", "rebuttal", "domain_point", "clarifying_question"];
  const EXPERIENCE_KEYS = ["case", "situational", "rallying", "proposal", "question", "question_other", "rhetorical_question", "to_open_question"];
  function scoreDesire(a, rt, ctx) {
    if (!rt) return -Infinity;
    if (rulesMatch(a.rules && a.rules.silent_on, ctx)) return -Infinity;
    let s = rt.speak_motivation * 1.0 + rt.attention * 0.35 + rt.social_safety * 0.45 - rt.fatigue * 0.25;
    if (rulesMatch(a.rules && a.rules.speak_on, ctx)) s += 0.35;
    const rids = (ctx.recent || []).map((w) => w.split("·")[0]);
    // P2 §4 接线：allies 加成需近期发言盟友数 ≥ ally_threshold（persona-map-v1 R2 由 F6 派生；缺省 1 = 原无条件语义）
    const allySpoke = (a.graph && a.graph.allies) ? a.graph.allies.filter((id) => rids.includes(id)).length : 0;
    const allyTh = (a.rules && typeof a.rules.ally_threshold === "number") ? a.rules.ally_threshold : 1;
    if (allySpoke >= allyTh) s += 0.15;
    // P2 §4 接线：rivals 加成需 立场差 × 在场强度 ≥ rebut_threshold（R2 由 F7×F6 派生；缺省 0.3）
    const rivalSpoke = (a.graph && a.graph.rivals) ? a.graph.rivals.filter((id) => rids.includes(id)) : [];
    if (rivalSpoke.length) {
      const gap = Math.max(...rivalSpoke.map((id) => Math.abs((rt.stance_position || 0) - ((RT[id] && RT[id].stance_position) || 0))));
      const rebutTh = (a.rules && typeof a.rules.rebut_threshold === "number") ? a.rules.rebut_threshold : 0.3;
      if (gap * Math.min(1, rivalSpoke.length / 2) >= rebutTh) s += 0.25;
    }
    // P3 · L2 消费点（更新规则见 genOneBeat/tickRT，依据 _meta.persona_map_notes.runtime_layer）：
    // 高认知冲突 × 高认知调节(F7≥0.55) → 反驳/立场迁移倾向；理解度过低 → 不敢开口
    if ((rt.cognitiveConflict || 0) > 0.5 && (personaFactorValue(a, "F7") || 0) >= 0.55) s += 0.2;
    if ((rt.perceivedUnderstanding || 0) < 0.25) s -= 0.15;
    if (rt.last_spoke_t != null && ctx.t - rt.last_spoke_t < 90)
      s -= 0.4 * (1 - (ctx.t - rt.last_spoke_t) / 90);
    s += ((a.persona && a.persona.stance_strength) || 0) * 0.05;
    s -= (rt.spoke_count || 0) * 0.11;
    // P2（§14）：v0.3 字母先验（A/B 首发加成、C/D 固定减分）已移除——个体发言倾向由 state_init（persona-map-v1 R2 派生）承载
    // P5 · 干预响应矩阵消费点①：公开点名窗口加成按 directMult 逐人缩放（低安全感/低效能+沉默因果者近零
    // 甚至微负＝被直接点名吓住）；openQ 铺垫叠加时加 scaffoldedBonus（低 F4 者获益最大）
    const irm = interventionOf(a);
    const callMult = irm.directMult + (ctx.openQ ? irm.scaffoldedBonus : 0);
    const responded = sim._callResponders && sim._callResponders.has(a.id);
    if (!responded) {
      // 点名沉默窗口：有沉默因果记录的学生被激活（历史驱动，非字母）
      if (ctx.callSilent && ((a.silenceCauses || []).length > 0)) s += 0.8 * callMult;
      // 行业视角点名窗口：有沉默因果且具行业/职业接触（或家族产业参与）的学生被激活
      if (ctx.callC && isCallCTarget(a)) s += 0.9 * callMult;
      // P3 · L2 消费点：参与欠账累积 → 点名窗口内目标权重上调（沉默风险对冲）
      if (ctx.callC || ctx.callSilent) s += Math.min(0.3, (rt.participationDebt || 0) * 0.05);
    } else if (ctx.callC || ctx.callSilent) s -= 0.5;
    // P5 · 干预响应矩阵消费点②：追问/开放问题窗口增益（F7 驱动：高认知调节者正、最低者微负——追问压力下退缩）
    if (ctx.openQ) s += irm.probeGain;
    // __scoreNoiseOverride：仅 debugScore 注入（确定性测试评分），正常决策恒为 null 走 seeded 噪声
    s += (__scoreNoiseOverride != null ? __scoreNoiseOverride : (rng() - 0.5)) * 0.18; // §9 seeded 噪声
    return s;
  }
  function pickRespKey(a, ctx) {
    const r = a.responses || {}; const keys = Object.keys(r); if (!keys.length) return null;
    if (ctx.called) { for (const k of ["if_called_uncertain", "if_called_by_teacher", "if_called", "if_nudged", "if_finally_called"]) if (r[k]) return k; }
    if (ctx.openQ) { for (const k of ["to_open_question", "to_teacher", "clarifying_question"]) if (r[k]) return k; }
    if (ctx.lastRival) { for (const k of ["technical_rebuttal", "to_rival", "rebuttal"]) if (r[k]) return k; if (rng() < 0.3 && r.concession) return "concession"; }
    if (ctx.lastAlly) { for (const k of ["case_support", "rallying", "evidence_supply", "situational"]) if (r[k]) return k; }
    if (ctx.phase === "reflection") { for (const k of ["late_reflection", "concession", "proposal"]) if (r[k]) return k; }
    // P3 · L2 消费点：理解不足（perceivedUnderstanding<0.3）优先澄清请求（若有该语料键）
    const rtU = RT[a.id];
    if (rtU && (rtU.perceivedUnderstanding || 0) < 0.3 && r.clarifying_question) return "clarifying_question";
    let pub = keys.filter((k) => !/private|internal|intended|post_class|small_group|report_text|if_anonymous|if_regulatory|reflection_sheet/.test(k));
    if (!pub.length) return null;
    // P3 · §7.2 正向激活：evidence 语料键优先（80% 落入证据子池；覆盖 F3 调序，键集合不变）
    const act = ACT[a.id];
    if (act && act.evidenceBias && pub.length > 1) {
      const evPool = pub.filter((k) => EVIDENCE_KEYS.includes(k));
      if (evPool.length && rng() < 0.8) pub = evPool;
    } else {
      // P2 §4：认识论习惯调序——F3≥0.55 证据型 / ≤0.45 经验型，65% 概率落入偏好子池（只在已匹配键集合内，集合不变）
      const f3 = a.latentFactors && a.latentFactors.F3 && a.latentFactors.F3.value;
      if (typeof f3 === "number" && pub.length > 1) {
        const pref = f3 >= 0.55 ? EVIDENCE_KEYS : f3 <= 0.45 ? EXPERIENCE_KEYS : null;
        const prefPool = pref ? pub.filter((k) => pref.includes(k)) : [];
        if (prefPool.length && rng() < 0.65) pub = prefPool;
      }
    }
    return pub[Math.floor(rng() * pub.length)];
  }

  function tickRT(toSec) {
    SCHED.forEach((ev) => { if (ev.t > lastTickT && ev.t <= toSec) applyAgentFx(ev.agent, ev.fx, ev.t, ev.why); });
    const dt = Math.max(0, toSec - lastTickT);
    Object.keys(RT).forEach((id) => {
      const rt = RT[id];
      rt.attention = Math.max(0, rt.attention - 0.0002 * (1 + rt.fatigue * 1.5) * dt);
      // P2：疲劳累积速率全员按画像派生 fatigue_rate（persona-map-v1 R2），替代 v0.3 的字母分支加速
      rt.fatigue = Math.min(1, rt.fatigue + (rt.fatigue_rate != null ? rt.fatigue_rate : 0.00008) * dt);
      // P3 · L2 更新规则（取值依据 _meta.persona_map_notes.runtime_layer）：
      // 认知冲突随时间自然消解（有冲突才会有"想通/放下"）；理解度随听课缓慢衰减
      rt.cognitiveConflict = Math.max(0, (rt.cognitiveConflict || 0) - 0.00005 * dt);
      rt.perceivedUnderstanding = Math.max(0, (rt.perceivedUnderstanding || 0) - 0.00003 * dt);
    });
    lastTickT = toSec;
  }

  // P3 · L3：learningTrace 仅对 enrichmentPlan learningTraceDepth≥2 的 deep 学生追加（light 保持空数组）
  function traceDepthOf(id) { return (ENRICH && ENRICH.students && ENRICH.students[id] && ENRICH.students[id].learningTraceDepth) || 0; }
  function pushTrace(id, entry) {
    if (traceDepthOf(id) < 2) return;
    const rt = RT[id]; if (!rt) return;
    rt.learningTrace.push(entry);
    if (rt.learningTrace.length > 50) rt.learningTrace.shift();
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
    const raw = (fresh.length ? fresh : texts)[Math.floor(rng() * (fresh.length ? fresh.length : texts.length))];
    rt._recentRaw = [...(rt._recentRaw || []), raw].slice(-6);
    const text = cleanBeatText(raw); if (!text) return null;
    const beat = { t, kind: "line", role: "S", who: top.s.id, text, bubble: toBubble(raw), respKey: key };
    DYN.push(beat);
    applyAgentFx(top.s.id, { speak_motivation: -0.15, attention: 0.05 }, t, `发言「${key}」`);
    rt.last_spoke_t = t; rt.spoke_count = (rt.spoke_count || 0) + 1;
    ((top.a.graph && top.a.graph.allies) || []).forEach((id) => applyAgentFx(id, { social_safety: 0.03 }, t, `盟友 ${top.s.id} 发言`));
    ((top.a.graph && top.a.graph.rivals) || []).forEach((id) => applyAgentFx(id, { speak_motivation: 0.06 }, t, `对手 ${top.s.id} 发言·激起反驳`));
    // P3 · L2/L3 发言事件更新（规则依据 _meta.persona_map_notes.runtime_layer）
    const concept = (base.topic && base.topic[0]) || "SWOT";
    const preConflict = rt.cognitiveConflict || 0;
    rt.cognitiveConflict = Math.max(0, preConflict - 0.15);                       // 说出即部分消解
    rt.perceivedUnderstanding = Math.min(1, (rt.perceivedUnderstanding || 0) + 0.02);
    if (preConflict > 0.2) pushTrace(top.s.id, { t, event: "self_revision", concept, effect: -0.15 });
    ((top.a.graph && top.a.graph.allies) || []).forEach((id) => {
      const r2 = RT[id]; if (r2) r2.perceivedUnderstanding = Math.min(1, (r2.perceivedUnderstanding || 0) + 0.05); // 盟友阐发提升理解
    });
    // 认知冲突：任何与听者立场差 >0.5 的发言都是"反例"（全班轻量运行；deep 学生记概念级轨迹）
    Object.keys(RT).forEach((id) => {
      if (id === top.s.id) return;
      const r2 = RT[id];
      const gap = Math.abs((rt.stance_position || 0) - (r2.stance_position || 0));
      if (gap > 0.5) {
        const d = Math.round(0.1 * gap * 10000) / 10000;
        r2.cognitiveConflict = Math.min(1, (r2.cognitiveConflict || 0) + d);
        pushTrace(id, { t, event: "peer_counterexample", concept, effect: d });
      }
    });
    if (base.callC || base.callSilent) pushTrace(top.s.id, { t, event: "teacher_scaffold", concept, effect: 0.05 });
    nudgeStances(top.s.id);
    if (base.callC || base.callSilent) { if (!sim._callResponders) sim._callResponders = new Set(); sim._callResponders.add(top.s.id); }
    // P5 · 干预响应矩阵消费点③：被打断式强制点名（teacherCallOn）的学生发言后按 interrupt_tolerance
    // 结算残留惩罚——低容忍者恢复慢（sm 回落更多），高容忍者几乎无感
    if (sim._forcedCallId && sim._forcedCallId === top.s.id) {
      const itF = interventionOf(top.a).interruptTolerance;
      rt.speak_motivation = Math.max(0, rt.speak_motivation - 0.25 * (1 - itF));
      sim._forcedCallId = null;
    }
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
      if (nxt > 132) {
        const b = genOneBeat(nxt);
        // P3 · L2 participationDebt：连续未发言轮次计数，发言即清零（每个决策轮次结算一次）
        Object.keys(RT).forEach((id) => {
          const r = RT[id];
          if (b && id === b.who) r.participationDebt = 0;
          else r.participationDebt = (r.participationDebt || 0) + 1;
        });
        if (b && onBeat) onBeat(b);
      }
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
  // 强制点名某个体（打断式干预）：P5 起按 rules.interrupt_tolerance（R4 派生）缩放——低容忍者
  // 得不到满提升、发言后残留惩罚更大（恢复慢）；记录 _forcedCallId 供发言后结算
  function teacherCallOn(id) {
    const rt = RT[id]; if (!rt) return;
    const it = interventionOf(agentOf(id)).interruptTolerance;
    rt.speak_motivation = Math.max(rt.speak_motivation, 0.55 + 0.45 * it);
    rt.social_safety = Math.max(rt.social_safety, 0.45 + 0.35 * it);
    rt.attention = Math.max(rt.attention, 0.5 + 0.4 * it);
    sim._forcedCallId = id;
  }

  // P3 · L3 消费者：学习轨迹 → 关键时刻（KM）候选派生。
  // 数据侧生产（本函数）+ tools/prove-learning-trace-km.mjs 消费者证明；
  // UI 接线（practice-detail.html 派生 KM 面板）登记 PENDING——页面冻结，解禁后任务。
  function learningTraceMoments() {
    const out = [];
    STUDENTS.forEach((s) => {
      const rt = RT[s.id];
      if (!rt || !rt.learningTrace || !rt.learningTrace.length) return;
      const tr = rt.learningTrace;
      for (let i = 0; i < tr.length; i++) {
        // 认知冲突消解链：peer_counterexample 后 240s 内出现 self_revision
        if (tr[i].event === "peer_counterexample") {
          const rev = tr.slice(i + 1).find((e) => e.event === "self_revision" && e.t - tr[i].t <= 240);
          if (rev) {
            out.push({ t: rev.t, type: "conflict_resolution", who: s.id, concept: rev.concept,
              label: `${s.id} 认知冲突消解（${rev.concept}）：对手反例 → 自我修正`, evidence: [tr[i], rev] });
            i = tr.indexOf(rev);
          }
        }
        // 教师支架吸纳：deep 学生在点名窗口响应且此前未发过言
        if (tr[i].event === "teacher_scaffold") {
          const spokeBefore = (rt._events || []).some((ev) => ev.t < tr[i].t && /发言/.test(ev.why || ""));
          if (!spokeBefore) {
            out.push({ t: tr[i].t, type: "scaffold_uptake", who: s.id, concept: tr[i].concept,
              label: `${s.id} 教师支架后首次响应（${tr[i].concept}）`, evidence: [tr[i]] });
          }
        }
      }
    });
    return out.sort((x, y) => x.t - y.t);
  }

  // P3 展示层分组（替代学号首字母着色/分区，画像驱动）：
  // 沉默观察（有沉默因果且具行业/职业接触，isCallCTarget 同口径）→ C；
  // 低主动参与（speak_motivation<0.3）→ D 观望；立场外部取向（≥0）→ A 政策/市场；其余 → B 门店/顾客。
  // 读 L0 state_init（着色按画像版本稳定，不随 L1 激活逐课变化）。
  function visualArchetypeOf(id) {
    const a = agentOf(id);
    if (!a) return "D";
    if (isCallCTarget(a)) return "C";
    const si = a.state_init || {};
    if ((si.speak_motivation != null ? si.speak_motivation : 0.3) < 0.3) return "D";
    return (si.stance_position || 0) >= 0 ? "A" : "B";
  }

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
    // §9 确定性：当前 seed 配置（供测试与溯源打印）
    getSeedInfo: () => ({ config: { ...SEED_CFG }, seedString: seedStringOf(SEED_CFG), seed: fnv1a32(seedStringOf(SEED_CFG)) }),
    // 教师动作
    teacherCallC, teacherCallSilent, teacherOpenQ, teacherLine, teacherCallOn,
    // P3 · §2.1/§7/L3 暴露（课程级临时资源与运行时派生，均不回写 persona）
    enrichmentPlan: () => ENRICH,
    enrichmentOf: (id) => (ENRICH && ENRICH.students && ENRICH.students[id]) || null,
    activationOf: (id) => ACT[id] || null,
    learningTraceMoments,
    isSilentObserver: isCallCTarget, // 展示语义别名：沉默观察者判定（有沉默因果且具行业/职业接触）
    visualArchetypeOf,
    // P5 · 干预矩阵（R4 派生系数只读暴露 + metamorphic (j) 调试评分：当前 RT × 合成 ctx 算 scoreDesire，不改状态）
    interventionOf,
    debugScore: (id, ctxPatch) => {
      const a = agentOf(id);
      if (!a) return null;
      __scoreNoiseOverride = 0; // 固定噪声分量，不消耗 rng 流（防污染确定性序列）
      try {
        return scoreDesire(a, RT[id], { t: 600, topic: getTopic(600), recent: [], openQ: false, callC: false, callSilent: false, deadlock: false, phase: "rebuttal", lastRival: false, lastAlly: false, called: false, ...(ctxPatch || {}) });
      } finally { __scoreNoiseOverride = null; }
    },
  };
})();
