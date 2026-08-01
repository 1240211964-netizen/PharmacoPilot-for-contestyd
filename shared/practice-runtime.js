/*
 * PharmacoPilot · Practice Runtime
 * ------------------------------------------------------------
 * 把 practice-detail.html 的 4 个阶段真正接通。
 *
 * 读：   window.PharmacoPilotStore  (跨页状态)
 *        window.PharmacoPilotNavigationContract  (9 个教学环节定义)
 *        window.PharmacoPilotPracticeContract    (本页运行时契约)
 * 写：   PharmacoPilotStore.saveArtifact / setZpdAnchors /
 *        setPulseRule / markAgendaFulfilled
 * 广播： Stage iii 写回时，nav 页通过 store 的 artifact:saved
 *        / zpd:anchorsChanged / pulse:ruleSaved 事件实时拿到更新。
 * ============================================================ */
(function attachPracticeRuntime(global) {
  "use strict";

  // ──────────────────────────────────────────────────────────────
  // 0. 取依赖
  // ──────────────────────────────────────────────────────────────
  const Store = global.PharmacoPilotStore;
  const Nav = global.PharmacoPilotNavigationContract;
  const Practice = global.PharmacoPilotPracticeContract;
  const Review = global.PharmacoPracticeReview;
  if (!Store || !Nav || !Practice || !Review) {
    console.warn("[practice-runtime] 缺依赖：store / nav-contract / practice-contract / practice-review");
    return;
  }

  // ──────────────────────────────────────────────────────────────
  // 1. 运行时状态
  // ──────────────────────────────────────────────────────────────
  const state = {
    stageId: "i",                       // 当前阶段
    simStarted: false,
    simPaused: true,
    tSec: 132,                          // 仿真时间（从页面默认起点 02:12 续上）
    capSec: 2700,                       // 45 min
    realtimeScale: 6,                   // 1 真实秒 = 6 仿真秒，让 45 min 课在 7.5 min 跑完
    timerHandle: null,
    eventStream: [],                    // beat[]
    participation: {
      students: new Array(32).fill(0).map(() => ({ count: 0 })),
      breakdown: { teacher: 0.31, student: 0.47, silent: 0.22 },
      goal: 0.40,
    },
    keyMoments: [],                     // KeyMoment[]
    comments: [],                       // Comment[]
    assets: [],                         // ReusableAsset[]（已生成但未必写回）
    writebackLog: [],                   // 已写回的 store 调用记录
  };
  let activeMetaverseMomentSource = null;
  let metaverseMomentLastT = null;
  let metaverseMomentSignature = "";

  // ──────────────────────────────────────────────────────────────
  // 1.5 智能体数据：32 个虚拟人画像 (v0.2)
  //     - 异步加载 ./shared/virtual-class-agents.json
  //     - 加载完成后驱动 renderPersonaGrid 与 click-to-inspect
  // ──────────────────────────────────────────────────────────────
  let __agents = null;
  let __agentsLoadPromise = null;
  function loadAgents() {
    if (__agentsLoadPromise) return __agentsLoadPromise;
    __agentsLoadPromise = fetch("./shared/virtual-class-agents.json", { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => { __agents = d; return d; })
      .catch((e) => { console.warn("[practice-runtime] 智能体数据加载失败", e); return null; });
    return __agentsLoadPromise;
  }
  function getAgentById(id) {
    return __agents?.agents?.find((a) => a.id === id) || null;
  }
  function getInitialSimState() {
    return __agents?._initial_simulation_state || null;
  }

  // ──────────────────────────────────────────────────────────────
  // 1.6 Agent runtime — 每个 agent 的可变状态 + 脚本化事件
  //     - tickAgents(t_sec) 每 sim 秒推进状态（衰减+触发事件）
  //     - reflectAgentStateInGrid() 把当前状态投影到格子的视觉
  //     - 脚本化事件 = agent.drama 里"attention_decay"/"attempt_action_on"等的具象化
  // ──────────────────────────────────────────────────────────────
  const __agentRuntime = new Map();
  let __scheduledEvents = [];
  let __lastAgentTickSec = 0;

  function initAgentRuntimes() {
    if (!__agents) return;
    __agentRuntime.clear();
    __agents.agents.forEach((a) => {
      __agentRuntime.set(a.id, {
        attention: a.state_init?.attention ?? 0.5,
        speak_motivation: a.state_init?.speak_motivation ?? 0.3,
        fatigue: a.state_init?.fatigue ?? 0.0,
        social_safety: a.state_init?.social_safety ?? 0.5,
        stance_position: a.state_init?.stance_position ?? 0,
        spoke_count: 0,
        last_event_t: null,
        _events: []
      });
    });
    __lastAgentTickSec = 0;
    buildScheduledEvents();
  }

  function getAgentRuntime(id) {
    return __agentRuntime.get(id) || null;
  }

  // Build scripted events from agent.drama signals. Each event fires once at t_sec
  // and applies effects to one agent. Reasons are surfaced in the inspector changelog.
  function buildScheduledEvents() {
    __scheduledEvents = [];
    if (!__agents) return;

    // C2 白雨桐：举手 2 次未被点 → 注意力 0.85→0.45 (其 drama 明确)
    __scheduledEvents.push(
      { t: 150,  agent: "C2", fx: { speak_motivation: -0.18, attention: -0.12, social_safety: -0.08 }, why: "举手 5s 未被点·第 1 次" },
      { t: 1000, agent: "C2", fx: { speak_motivation: -0.22, attention: -0.18, social_safety: -0.12 }, why: "举手 5s 未被点·第 2 次" },
      { t: 1500, agent: "C2", fx: { speak_motivation: -0.10, attention: -0.10 }, why: "放弃·开始默写未说论点" }
    );

    // C5 邱钰泽：5 次插话被抢 (@01:30, @02:20, @14:00, @22:00, @35:00)
    [90, 140, 840, 1320, 2100].forEach((t, idx) => {
      __scheduledEvents.push({
        t, agent: "C5",
        fx: { speak_motivation: -0.07, attention: -0.06, social_safety: -0.04 },
        why: `想插话被抢 · 第 ${idx + 1}/5 次`
      });
    });

    // C1 蒋亦舟：内嵌行为时间戳 (摇头/笔记/手抬桌面/与 D5 低声)
    __scheduledEvents.push(
      { t: 120,  agent: "C1", fx: { social_safety: -0.04 }, why: "摇头·不同意二元对立框架" },
      { t: 720,  agent: "C1", fx: { social_safety: -0.03, attention: +0.02 }, why: "笔记累积·想说的反驳" },
      { t: 1180, agent: "C1", fx: { social_safety: -0.05 }, why: "手抬到桌面但放弃举起" },
      { t: 1560, agent: "C1", fx: { social_safety: +0.06, attention: -0.03 }, why: "与同桌 D5 低声 30s" },
      { t: 1560, agent: "D5", fx: { attention: +0.08, social_safety: +0.08, speak_motivation: +0.05 }, why: "C1 低声向她解释" }
    );

    // C3 夏梓晗：小组讨论中说了 4 分钟但全班退场
    __scheduledEvents.push(
      { t: 480, agent: "C3", fx: { social_safety: +0.05, speak_motivation: +0.05 }, why: "小组内讲述 BD 视角" },
      { t: 930, agent: "C3", fx: { social_safety: -0.08, speak_motivation: -0.10 }, why: "代表小组发言机会让给 A2·退缩" }
    );

    // C4 罗予安：报告稿 GMP 段被砍
    __scheduledEvents.push(
      { t: 1800, agent: "C4", fx: { social_safety: -0.10, speak_motivation: -0.05 }, why: "GMP 段被砍·自我审查强化" }
    );

    // A1, A2, B1, B2 主动发言事件 → 微小正反馈
    __scheduledEvents.push(
      { t: 48,  agent: "A1", fx: { speak_motivation: +0.04, attention: +0.04, social_safety: +0.04 }, why: "首发被教师认可" },
      { t: 98,  agent: "A1", fx: { speak_motivation: +0.03 }, why: "核心论证" },
      { t: 108, agent: "B1", fx: { speak_motivation: +0.05, social_safety: +0.04 }, why: "引爆论点" },
      { t: 125, agent: "A1", fx: { social_safety: -0.05 }, why: "B 组立场冲击" },
      { t: 125, agent: "B1", fx: { social_safety: +0.05 }, why: "冲击成功" },
      { t: 480, agent: "A2", fx: { speak_motivation: +0.05, social_safety: +0.05 }, why: "分组内主导整合" },
      { t: 600, agent: "B2", fx: { speak_motivation: +0.05, social_safety: +0.05 }, why: "技术反诘 BE" }
    );

    // 教师在 1920s 追问'被低估视角' → A1 立场微调 + A7 反思激活 + D3 反思触发
    __scheduledEvents.push(
      { t: 1920, agent: "A1", fx: { stance_position: -0.05 }, why: "立场松动·吸收依从性维度" },
      { t: 1920, agent: "A7", fx: { speak_motivation: +0.20, attention: +0.10 }, why: "反思阶段·被激活" },
      { t: 1920, agent: "D3", fx: { speak_motivation: +0.05 }, why: "想发言但仍等点名" }
    );

    __scheduledEvents.sort((a, b) => a.t - b.t);
  }

  // 应用单个 event 到 runtime
  function applyAgentEvent(ev) {
    const rt = getAgentRuntime(ev.agent);
    if (!rt) return;
    const before = { ...rt };
    Object.entries(ev.fx).forEach(([k, d]) => {
      const lo = (k === "stance_position") ? -1 : 0;
      rt[k] = Math.max(lo, Math.min(1, (rt[k] ?? 0) + d));
    });
    rt._events.push({ t: ev.t, fx: ev.fx, why: ev.why, before });
    rt.last_event_t = ev.t;
  }

  // 每 sim 秒（实际是每次 tick 调用一次）推进 agent 状态
  function tickAgents(t_sec) {
    if (!__agents || __agentRuntime.size === 0) return [];
    const fired = [];

    // 1. 触发到期的 scripted events
    __scheduledEvents.forEach((ev) => {
      if (ev.t > __lastAgentTickSec && ev.t <= t_sec) {
        applyAgentEvent(ev);
        fired.push(ev);
      }
    });

    // 2. 默认衰减 (随时间累积疲劳，注意力降低)
    const dt = Math.max(0, t_sec - __lastAgentTickSec);
    __agentRuntime.forEach((rt, id) => {
      // 注意力衰减：疲劳越高衰减越快
      const baseDecay = 0.0002 * (1 + rt.fatigue * 1.5) * dt;
      rt.attention = Math.max(0, rt.attention - baseDecay);

      // 疲劳累积
      rt.fatigue = Math.min(1, rt.fatigue + 0.00008 * dt);

      // D 组疲劳加速
      if (id.startsWith("D") && id !== "D4") {
        rt.fatigue = Math.min(1, rt.fatigue + 0.00015 * dt);
      }
      // D4 因身体不适，疲劳特别快
      if (id === "D4") {
        rt.fatigue = Math.min(1, rt.fatigue + 0.0008 * dt);
        rt.attention = Math.max(0.05, rt.attention - 0.0006 * dt);
      }
    });

    __lastAgentTickSec = t_sec;
    return fired;
  }

  // 把 runtime 投影到视觉：注意力 → opacity，事件触发 → 闪烁
  function reflectAgentStateInGrid(firedEvents) {
    if (__agentRuntime.size === 0) return;
    const grid = document.querySelector("#stage-ii .persona-grid");
    if (!grid) return;
    const firedIds = new Set((firedEvents || []).map((e) => e.agent));

    grid.querySelectorAll(".persona-cell").forEach((cell) => {
      const id = cell.dataset.agentId;
      if (!id) return;
      const rt = getAgentRuntime(id);
      if (!rt) return;
      // 注意力映射 opacity (最低 0.35 保持可见)
      const opacity = Math.max(0.35, rt.attention).toFixed(2);
      cell.style.opacity = opacity;

      // 严重衰减时加 is-fading 标志
      cell.classList.toggle("is-fading", rt.attention < 0.45);
      // 高疲劳时加 is-tired
      cell.classList.toggle("is-tired", rt.fatigue > 0.5);
      // 刚触发事件时闪烁
      if (firedIds.has(id)) {
        cell.classList.add("is-state-pulse");
        setTimeout(() => cell.classList.remove("is-state-pulse"), 600);
      }
    });

    // 在 sim panel 头部展示已触发事件计数
    const ct = document.querySelector("#stage-ii .sim-panel:nth-of-type(1) h5 .ct");
    if (ct && __agents) {
      const total = __agents.agents.length;
      const totalEvents = Array.from(__agentRuntime.values()).reduce((s, r) => s + (r._events?.length || 0), 0);
      ct.textContent = `${total} 人 · ${fmtTime(state.tSec)} · ${totalEvents} 事件`;
    }
  }

  function ensureRuntimeCSS() {
    if (document.getElementById("__pp_runtime_style")) return;
    const css = `
.persona-cell {
  transition: opacity .4s ease, transform .2s ease, box-shadow .2s ease;
}
.persona-cell.is-fading {
  filter: grayscale(0.3);
}
.persona-cell.is-tired::before {
  content: "z";
  position: absolute; top: 1px; right: 2px;
  font-family: var(--mono); font-size: var(--fs-2xs); color: var(--mute);
  opacity: 0.6;
}
.persona-cell.is-state-pulse {
  box-shadow: 0 0 0 2px var(--amber), 0 0 12px color-mix(in srgb, var(--amber) 60%, transparent);
  transform: scale(1.08);
}
/* Group-colored role pill in dark theater for agent-driven beats */
.beat-row .role.role-S-a { background: color-mix(in srgb, var(--amber) 28%, transparent); color: #f0c1ac; }
.beat-row .role.role-S-b { background: rgba(149,187,164,.25); color: #c4dbcd; }
.beat-row .role.role-S-c { background: rgba(167,144,210,.25); color: #d5c4ec; }
.beat-row .role.role-S-d { background: rgba(180,180,180,.18); color: #ccc; }
.beat-row .what .who-name {
  font-family: var(--serif-cn); font-style: normal; font-weight: 500;
  color: var(--amber-soft); margin-right: 2px; opacity: .88;
}
`;
    const el = document.createElement("style");
    el.id = "__pp_runtime_style";
    el.textContent = css;
    document.head.appendChild(el);
  }

  // ──────────────────────────────────────────────────────────────
  // 2. 工具
  // ──────────────────────────────────────────────────────────────
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const fmtTime = (sec) => {
    const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };
  const toast = (msg) => (global.showDemoToast ? global.showDemoToast(msg) : console.log("[toast]", msg));
  const stationOf = (id) => Nav.NAV_STATIONS.find((s) => s.id === id);

  // ──────────────────────────────────────────────────────────────
  // 3. 控件挂载：每个 stage 顶上加一条状态条 + 按钮
  // ──────────────────────────────────────────────────────────────
  function mountControls() {
    const css = `
.pr-statusbar {
  display: flex; align-items: center; gap: 10px;
  padding: 7px 14px; margin: 8px 0 14px;
  background: transparent; border: 0;
  border-bottom: 1px dashed var(--rule);
  border-radius: 0;
  font-family: var(--mono); font-size: var(--fs-2xs); color: var(--mute);
  letter-spacing: 0.04em;
}
.pr-statusbar .ind { display: inline-flex; align-items: center; gap: 6px; }
.pr-statusbar .ind i {
  width: 7px; height: 7px; border-radius: 50%; background: var(--mute);
}
.pr-statusbar.is-live .ind i { background: var(--amber); animation: pulse 1.4s infinite; }
.pr-statusbar.is-done .ind i { background: var(--sage); }
.pr-statusbar .sep { color: var(--mute-2); }
.pr-statusbar .r { margin-left: auto; display: flex; gap: 6px; }
.pr-btn {
  font-family: var(--mono); font-size: var(--fs-2xs); letter-spacing: 0.04em;
  padding: 5px 11px; border-radius: 999px;
  border: 1px solid var(--ink); color: var(--ink); background: var(--ivory);
  cursor: pointer; transition: all .15s;
}
.pr-btn:hover { background: var(--ink); color: var(--ivory); }
.pr-btn.is-primary { background: var(--amber-deep); color: var(--ivory); border-color: var(--amber-deep); }
.pr-btn.is-primary:hover { background: var(--ink); border-color: var(--ink); }
.pr-btn[disabled] { opacity: .35; cursor: not-allowed; }
.pr-btn.pr-btn-tiny { padding: 4px 10px; font-size: var(--fs-2xs); }
.btn-run.is-running { background: #8e3d22; }
.pr-flash {
  position: relative;
  animation: prflash 1.2s ease-out;
}
@keyframes prflash {
  0%   { background: var(--amber-wash); }
  100% { background: transparent; }
}
.km-card.is-new { border-color: var(--amber-deep); box-shadow: 0 0 0 1px var(--amber-deep); }
.comment.is-adopted .reply { background: color-mix(in oklab, var(--sage) 18%, var(--ivory)); color: var(--sage); }
.comment.is-adopted .pin-num { background: var(--sage); }
.mig-card.is-shipped { opacity: 1; border-color: var(--sage); }
.mig-card.is-shipped::after {
  content: "✓ 已写回"; position: absolute; top: -10px; right: 12px;
  font-family: var(--mono); font-size: var(--fs-2xs); letter-spacing: 0.14em;
  background: var(--sage); color: var(--ivory); padding: 2px 6px; border-radius: 3px;
}
.pr-wb-tag {
  display: inline-block; padding: 2px 7px; margin-left: 6px;
  background: var(--ink); color: var(--ivory);
  border-radius: 999px;
  font-family: var(--mono); font-size: var(--fs-2xs); letter-spacing: 0.06em;
}
`;
    const styleEl = document.createElement("style");
    styleEl.textContent = css;
    document.head.appendChild(styleEl);

    Practice.PRACTICE_STAGES.forEach((stage) => {
      const sec = document.querySelector(stage.anchor);
      if (!sec) return;
      const bar = document.createElement("div");
      bar.className = "pr-statusbar";
      bar.id = `pr-bar-${stage.id}`;
      bar.innerHTML = `
        <span class="ind"><i></i><span class="pr-status" data-stage="${stage.id}">待启动</span></span>
        <span class="r" data-actions="${stage.id}"></span>
      `;
      const headerEnd = sec.querySelector(".stage-h");
      if (headerEnd && headerEnd.nextSibling) {
        sec.insertBefore(bar, headerEnd.nextSibling);
      } else {
        sec.insertBefore(bar, sec.children[1]);
      }
    });

    // 极简：左侧状态串自驱，右侧仅 stage ii 保留手动重新同步兜底。
    const a2 = $('[data-actions="ii"]');
    if (a2) a2.innerHTML = `<button class="pr-btn pr-btn-tiny" id="pr-km-rederive" title="录播会自动记录；点此可手动重新同步">↻ 重新同步记录</button>`;
    const km = $("#pr-km-rederive");
    if (km) km.onclick = deriveKeyMoments;
  }

  function setStageStatus(stageId, text, live = false, done = false) {
    const bar = $(`#pr-bar-${stageId}`);
    if (!bar) return;
    bar.classList.toggle("is-live", !!live);
    bar.classList.toggle("is-done", !!done);
    const s = bar.querySelector(".pr-status");
    if (s) s.textContent = text;
  }

  // ──────────────────────────────────────────────────────────────
  // 4. Stage i —— 事件流时间步进
  // ──────────────────────────────────────────────────────────────
  // 把页面上已有的硬编码 beat 行升级为可推进的数据，再追加新 beat。
  function ingestExistingBeats() {
    const beats = [];
    $$(".scene .beat-row").forEach((row, idx) => {
      const ts = row.querySelector(".ts")?.textContent?.trim() || "";
      const role = row.querySelector(".role")?.textContent?.trim() || "";
      const text = row.querySelector(".what")?.innerHTML || "";
      const tSec = parseTs(ts);
      beats.push({
        tSec,
        role: role.includes("教师") ? "T" : role.includes("Agent") ? "A" : role.includes("学生") ? "S" : "marker",
        text, ts, kind: row.classList.contains("note") ? "agentDetect" : "speech",
        flags: {},
        domRef: row,
      });
    });
    state.eventStream = beats;
  }
  function parseTs(ts) {
    const m = /(\d+):(\d+)/.exec(ts);
    if (!m) return 0;
    return Number(m[1]) * 60 + Number(m[2]);
  }

  // 增量生成 beat（往剧本后面继续）
  // ──────────────────────────────────────────────────────────────
  // H · Agent-driven beat generation: 让 agents 决定谁说什么
  // ──────────────────────────────────────────────────────────────

  // 剥离面向审阅者的元注释——这些是给教师/专家看的旁注，不应作为学生台词读出
  function cleanBeatText(t) {
    return String(t || "")
      .replace(/（注[：:][^）]*）/g, "")
      .replace(/\(注[：:][^)]*\)/g, "")
      .replace(/（[^）]*专家[^）]*）/g, "")
      .replace(/（v0\.\d[^）]*）/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  // 阶段化话题关键词（驱动 rules.speak_on 的 "话题:[...]" 匹配）
  function getCurrentTopic(t_sec) {
    if (t_sec < 80)   return ["SWOT", "优势", "劣势", "机会", "威胁"];
    if (t_sec < 132)  return ["内部能力", "外部环境", "分类", "证据"];
    if (t_sec < 145)  return ["W/T 边界", "组织可控性", "外部趋势"];
    if (t_sec < 440)  return ["分组讨论", "门店", "顾客", "政策", "市场", "证据"];
    if (t_sec < 900)  return ["小组汇报", "SWOT", "边界", "证据"];
    if (t_sec < 1500) return ["交叉质疑", "内部", "外部", "可控性", "趋势", "数据"];
    if (t_sec < 1920) return ["TOWS", "SO", "WO", "ST", "WT", "产业", "竞争"];
    if (t_sec < 2520) return ["反思", "边界", "证据", "策略可行性"];
    return ["反思单", "收束", "SWOT", "TOWS"];
  }

  // 判断 agent.rules 数组是否匹配当前 context
  function rulesMatch(rules, context) {
    if (!Array.isArray(rules) || !rules.length) return false;
    return rules.some((rule) => {
      if (typeof rule !== "string") return false;
      // 话题:[k1,k2] 匹配
      if (rule.includes("话题:")) {
        const m = rule.match(/\[(.*?)\]/);
        if (!m) return false;
        const kws = m[1].split(",").map((s) => s.trim().replace(/['"]/g, ""));
        return kws.some((k) => context.topic.some((t) => t.includes(k) || k.includes(t)));
      }
      if (rule === "教师开放问题") return !!context.lastTeacherWasOpenQ;
      if (rule === "盟友被攻击") return !!context.allyAttacked;
      if (rule === "证据被误用" || rule === "证据被误用 by 对手") return !!context.evidenceMisstated;
      if (rule.includes("纯情绪") || rule.includes("情绪化")) return !!context.discussionDrifting;
      if (rule.includes("讨论卡在二元对立")) return !!context.binaryDeadlock;
      if (rule.includes("C 组短暂发声") || rule.includes("C组短暂发声")) return !!context.CGroupSpoke;
      if (rule.includes("教师明确点沉默") || rule.includes("教师明确点名") || rule.includes("点名沉默学生")) return !!context.teacherCallSilent;
      if (rule.includes("家庭隐私")) return context.topic.some((t) => t.includes("家庭"));
      if (rule.includes("临床细节")) return context.topic.some((t) => t.includes("临床") || t.includes("BE") || t.includes("INR"));
      // 几乎从不
      if (rule.includes("几乎从不") || rule === "所有公开发言" || rule === "所有" || rule.includes("从未成功")) return true;
      // 仅小组内
      if (rule.includes("仅小组内") || rule.includes("仅在小组内")) return context.phaseIsSmallGroup === false;
      // 仅被点名
      if (rule.includes("被点名") || rule.includes("被推举")) return !context.teacherCalled;
      return false;
    });
  }

  // 计算 agent 当前的"想说话"分数
  function scoreSpeakDesire(agent, rt, context) {
    if (!rt) return -Infinity;
    if (rulesMatch(agent.rules?.silent_on, context)) return -Infinity;

    // 基础分（来自状态）
    let score = (rt.speak_motivation || 0) * 1.0
              + (rt.attention || 0) * 0.35
              + (rt.social_safety || 0) * 0.45
              - (rt.fatigue || 0) * 0.25;

    // 话题/规则命中加分
    if (rulesMatch(agent.rules?.speak_on, context)) score += 0.35;

    // 盟友/对手刚发言
    const recent = context.recentSpeakers || [];
    const recentIds = recent.map((w) => (w || "").split("·")[0]);
    if (agent.graph?.allies?.some((id) => recentIds.includes(id))) score += 0.15;
    if (agent.graph?.rivals?.some((id) => recentIds.includes(id))) score += 0.25;

    // 冷却（刚说过不久再说）
    if (rt.last_spoke_t != null && context.t_sec - rt.last_spoke_t < 90) {
      score -= 0.4 * (1 - (context.t_sec - rt.last_spoke_t) / 90);
    }

    // 立场强度
    score += (agent.persona?.stance_strength || 0) * 0.05;

    // 轮换激励：说得越多越降权；从未发言的 A/B 组加分，避免两人垄断
    const spokeCount = rt.spoke_count || 0;
    score -= spokeCount * 0.11;
    if (spokeCount === 0 && (agent.id.startsWith("A") || agent.id.startsWith("B"))) score += 0.18;

    // 组别先验（C/D 默认低发言概率）
    if (agent.id.startsWith("C")) score -= 0.5;
    if (agent.id.startsWith("D")) score -= 0.65;

    // 教师点名时 D/C 组分数大幅提升（已响应本轮点名的不再加分，让位给别的沉默同学）
    const alreadyResponded = state._callResponders && state._callResponders.has(agent.id);
    if (!alreadyResponded) {
      if (context.teacherCallSilent && (agent.id.startsWith("C") || agent.id.startsWith("D"))) score += 0.8;
      if (context.teacherCallC && agent.id.startsWith("C")) score += 0.9;
    } else if (context.teacherCallC || context.teacherCallSilent) {
      score -= 0.5;
    }

    // 噪声（让相近分数随机）
    score += (Math.random() - 0.5) * 0.18;

    return score;
  }

  // 根据 context 选择响应模板键
  function pickResponseKey(agent, context) {
    const r = agent.responses || {};
    const keys = Object.keys(r);
    if (!keys.length) return null;

    // 教师点名/被叫起
    if (context.teacherCalled || context.teacherCallSilent || context.teacherCallC) {
      if (r.if_called_by_teacher) return "if_called_by_teacher";
      if (r.if_called) return "if_called";
      if (r.if_nudged) return "if_nudged";
      if (r.if_finally_called) return "if_finally_called";
    }
    // 教师开放问题刚问完
    if (context.lastTeacherWasOpenQ) {
      if (r.to_open_question) return "to_open_question";
      if (r.to_teacher) return "to_teacher";
      if (r.clarifying_question) return "clarifying_question";
    }
    // 对手刚发言 → 反驳
    if (context.lastWasRival) {
      if (r.technical_rebuttal) return "technical_rebuttal";
      if (r.to_rival) return "to_rival";
      if (r.rebuttal) return "rebuttal";
      if (Math.random() < 0.3 && r.concession) return "concession";
    }
    // 盟友刚发言 → 支援/补强
    if (context.lastWasAlly) {
      if (r.case_support) return "case_support";
      if (r.rallying) return "rallying";
      if (r.evidence_supply) return "evidence_supply";
      if (r.situational) return "situational";
    }
    // 反思阶段
    if (context.phase === "reflection") {
      if (r.late_reflection) return "late_reflection";
      if (r.concession) return "concession";
      if (r.proposal) return "proposal";
    }
    // 兜底：选一个非私密、非内心独白的公开响应
    const publicKeys = keys.filter((k) =>
      !k.includes("private") && !k.includes("internal") && !k.includes("intended") &&
      !k.includes("post_class") && !k.includes("small_group") && !k.includes("report_text") &&
      !k.includes("if_anonymous") && !k.includes("if_regulatory") && !k.includes("reflection_sheet")
    );
    if (publicKeys.length === 0) return null;
    return publicKeys[Math.floor(Math.random() * publicKeys.length)];
  }

  // 在 [fromSec, toSec] 内由 agents 决定生成的 beat 行
  function generateAgentBeats(fromSec, toSec) {
    if (!__agents || __agentRuntime.size === 0) return [];
    const added = [];
    const stride = 22; // 每 22 仿真秒考虑发一次话

    for (let t = Math.ceil((fromSec + 1) / stride) * stride; t <= toSec; t += stride) {
      if (t <= fromSec) continue;
      if (state.eventStream.some((b) => b.tSec === t)) continue;

      // 组 context
      const lastBeats = state.eventStream.slice(-3);
      const lastBeat = lastBeats[lastBeats.length - 1];
      const lastStudent = [...lastBeats].reverse().find((b) => b.role === "S");
      const lastStudentId = (lastStudent?.who || "").split("·")[0];

      const recentSpeakers = state.eventStream
        .filter((b) => b.role === "S" && b.tSec >= t - 90 && b.tSec < t)
        .map((b) => b.who || "");

      const context = {
        t_sec: t,
        topic: getCurrentTopic(t),
        recentSpeakers,
        lastTeacherWasOpenQ: t <= (state._teacherOpenQUntil || 0) || (lastBeat?.role === "T" && /[？?——]/.test(lastBeat?.text || "")),
        lastWasRival: false, // filled below per-agent
        lastWasAlly: false,
        phase: t < 145 ? "warmup" : t < 440 ? "small_group" : t < 900 ? "report" : t < 1500 ? "rebuttal" : t < 1920 ? "C_call" : t < 2520 ? "reflection" : "closing",
        phaseIsSmallGroup: t >= 145 && t < 440,
        teacherCallC: t <= (state._teacherCallCUntil || 0),
        teacherCallSilent: t <= (state._teacherCallSilentUntil || 0),
        binaryDeadlock: recentSpeakers.length >= 3,
      };

      // 评分（per-agent 时把 lastWasRival/lastWasAlly 算上）
      const scored = __agents.agents.map((a) => {
        const ctx = {
          ...context,
          lastWasRival: !!(lastStudentId && a.graph?.rivals?.includes(lastStudentId)),
          lastWasAlly:  !!(lastStudentId && a.graph?.allies?.includes(lastStudentId)),
          teacherCalled: !!(context.teacherCallSilent || context.teacherCallC),
        };
        const sc = scoreSpeakDesire(a, getAgentRuntime(a.id), ctx);
        return { a, score: sc, ctx };
      }).filter((x) => isFinite(x.score)).sort((a, b) => b.score - a.score);

      if (scored.length === 0) continue;
      const top = scored[0];
      // 兜底阈值（避免在没人想说时强行发言）
      if (top.score < 0.55) continue;

      const respKey = pickResponseKey(top.a, top.ctx);
      const respArr = respKey && top.a.responses?.[respKey];
      if (!respArr) continue;
      const respTexts = Array.isArray(respArr) ? respArr : [respArr];
      if (!respTexts.length) continue;

      // 模板冷却：优先选最近没用过的台词
      const rtTop = getAgentRuntime(top.a.id);
      const recentRaw = (rtTop && rtTop._recentRaw) || [];
      const fresh = respTexts.filter((tx) => !recentRaw.includes(tx));
      const pool = fresh.length ? fresh : respTexts;
      const rawText = pool[Math.floor(Math.random() * pool.length)];
      if (rtTop) rtTop._recentRaw = [...recentRaw, rawText].slice(-6);
      // 剥离面向审阅者的元注释（（注：…）/（…专家…）），不进课堂台词
      const text = cleanBeatText(rawText);
      if (!text) continue;

      const alias = top.a.identity?.alias || top.a.id;
      const beat = {
        tSec: t,
        role: "S",
        who: `${top.a.id}·${alias}`,
        text: `"${text}"`,
        flags: { fromAgent: top.a.id, respKey, score: +top.score.toFixed(2) }
      };
      added.push(beat);
      state.eventStream.push(beat);
      appendBeatToScene(beat);

      // 说话后的 runtime 更新
      const rt = getAgentRuntime(top.a.id);
      if (rt) {
        const fx = { speak_motivation: -0.15, attention: 0.05 };
        applyAgentEvent({ t, agent: top.a.id, fx, why: `发言「${respKey}」` });
        rt.last_spoke_t = t;
        rt.spoke_count = (rt.spoke_count || 0) + 1;
      }
      // 记录本轮点名响应者，避免同一人重复占用点名窗口
      if (top.ctx.teacherCallC || top.ctx.teacherCallSilent) {
        if (!state._callResponders) state._callResponders = new Set();
        state._callResponders.add(top.a.id);
      }
      // 盟友受益 / 对手被激
      (top.a.graph?.allies || []).forEach((aid) => {
        applyAgentEvent({ t, agent: aid, fx: { social_safety: 0.03 }, why: `盟友 ${top.a.id} 发言支持` });
      });
      (top.a.graph?.rivals || []).forEach((rid) => {
        applyAgentEvent({ t, agent: rid, fx: { speak_motivation: 0.06 }, why: `对手 ${top.a.id} 发言·激起反驳` });
      });
    }
    return added;
  }

  function generateNextBeats(fromSec, toSec) {
    const added = [];
    // v0.2: blueprint 只保留 marker + teacher + agentDetect；student 行由 agents 决定
    const blueprint = [
      { tSec: 145, role: "marker", text: "▾ SWOT 归类复核 · A/B 组并行" },
      { tSec: 285, role: "T", text: '"我注意到 B 组把<span class="em">药师不足</span>拆成内部排班与外部人才供给——请分别判断 W 与 T。"', flags: { unplanned: true } },
      { tSec: 360, role: "A", kind: "agentDetect", text: '⚠ 检测到 <b>2 名学生对同一现象作出 W/T 拆分</b>——建议把“组织可控性 + 外部趋势证据”补入问题链。' },
      { tSec: 405, role: "marker", text: "▾ 回归全班 · 各组汇报" },
      { tSec: 475, role: "T", text: '"很好。下一题——如何把 S 与 O 组合成一条可执行的 SO 策略？"', flags: { teacherOpenQ: true } },
      { tSec: 520, role: "marker", text: "▾ 沉默拉长" },
      { tSec: 900, role: "marker", text: "▾ TOWS 交叉质疑" },
      { tSec: 1500, role: "T", text: '"现在我想听听有产业或门店实习经历的同学——竞争威胁要用什么外部证据判断？"', flags: { teacherCallC: true } },
      { tSec: 1920, role: "T", text: '"我们快结束了——哪条 SWOT 判断最容易混淆内部与外部？"', flags: { teacherReflectPrompt: true, teacherOpenQ: true } },
      { tSec: 2520, role: "marker", text: "▾ 反思单分发" },
    ];
    blueprint.forEach((b) => {
      if (b.tSec > fromSec && b.tSec <= toSec && !state.eventStream.some((x) => x.tSec === b.tSec && x.text === b.text)) {
        // 教师点名沉默组 → 开 80s 时间窗，让多名 C/D 有机会响应
        if (b.flags?.teacherCallC) { state._teacherCallCUntil = b.tSec + 80; state._callResponders = new Set(); }
        if (b.flags?.teacherCallSilent) { state._teacherCallSilentUntil = b.tSec + 80; state._callResponders = new Set(); }
        if (b.flags?.teacherOpenQ) state._teacherOpenQUntil = b.tSec + 44;
        added.push(b);
        state.eventStream.push(b);
        appendBeatToScene(b);
      }
    });

    // Agent-driven student beats
    const agentBeats = generateAgentBeats(fromSec, toSec);
    added.push(...agentBeats);

    // 推参与度
    added.filter((b) => b.role === "S").forEach((b) => {
      const idx = parseStudentId(b.who);
      if (idx != null && state.participation.students[idx]) {
        state.participation.students[idx].count += 1;
        bumpParticipationDot(idx, state.participation.students[idx].count);
      }
    });
    if (added.length) updateParticipationMeters();
    return added;
  }
  function parseStudentId(who) {
    if (!who) return null;
    // "S-18" → 旧格式
    const m = /S-(\d+)/.exec(who);
    if (m) return Math.min(31, Math.max(0, Number(m[1]) - 1));
    // "A1·沈语晴" → 4×8 网格位置
    const ag = /^([ABCD])(\d)/.exec(who);
    if (ag) {
      const colIdx = { A: 0, B: 1, C: 2, D: 3 }[ag[1]];
      const row = Number(ag[2]) - 1;
      if (colIdx != null && row >= 0 && row < 8) return row * 4 + colIdx;
    }
    return null;
  }
  function appendBeatToScene(b) {
    const scene = $(".scene");
    if (!scene) return;
    const footer = $(".scene-foot");
    const div = document.createElement("div");
    const isMarker = b.role === "marker";
    const isNote = b.kind === "agentDetect";
    div.className = "beat-row" + (isMarker ? " marker" : "") + (isNote ? " note" : "") + " pr-flash is-runtime";
    const ts = fmtTime(b.tSec);

    // Agent-driven 学生发言 "A1·沈语晴" → role pill="A1"，化名前置在 quote 前
    let roleLabel = "";
    let roleClass = "";
    let contentPrefix = "";
    if (b.role === "T") { roleLabel = "教师"; roleClass = "role-T"; }
    else if (b.role === "S") {
      const w = b.who || "学生";
      const parts = w.split("·");
      if (parts.length === 2 && /^[ABCD]\d$/.test(parts[0])) {
        roleLabel = parts[0];
        roleClass = "role-S role-S-" + parts[0][0].toLowerCase();
        contentPrefix = `<span class="who-name">${parts[1]}</span> `;
      } else {
        roleLabel = w;
        roleClass = "role-S";
      }
    }
    else if (b.role === "A") { roleLabel = "Agent"; roleClass = "role-A"; }

    div.innerHTML = isMarker
      ? `<span></span><span></span><span class="what">${b.text}</span>`
      : `<span class="ts">${ts}</span><span class="role ${roleClass}">${roleLabel}</span><span class="what">${contentPrefix}${b.text}</span>`;
    div.dataset.tsec = String(b.tSec);
    // 按时间戳插入正确位置（agent beat 与 blueprint beat 可能乱序到达）
    let anchor = footer;
    const rows = scene.querySelectorAll(".beat-row[data-tsec]");
    for (const row of rows) {
      const rt = Number(row.dataset.tsec);
      if (!isNaN(rt) && rt > b.tSec) { anchor = row; break; }
    }
    if (anchor) scene.insertBefore(div, anchor); else scene.appendChild(div);
    b.domRef = div;
  }
  function bumpParticipationDot(idx, count) {
    const grid = $(".part-grid");
    if (!grid) return;
    const dot = grid.children[idx];
    if (!dot) return;
    dot.classList.remove("spoke-1", "spoke-2", "spoke-3");
    dot.classList.add(count >= 3 ? "spoke-3" : count === 2 ? "spoke-2" : "spoke-1");
    dot.classList.add("pr-flash");
    setTimeout(() => dot.classList.remove("pr-flash"), 1200);
  }
  function updateParticipationMeters() {
    const totalSpeak = state.participation.students.reduce((s, x) => s + x.count, 0);
    // 简单分配：学生说占比按发言总数缓增
    const sPct = Math.min(0.70, 0.47 + totalSpeak * 0.005);
    const tPct = Math.max(0.20, 0.31 - totalSpeak * 0.002);
    const pPct = Math.max(0.10, 1 - sPct - tPct);
    const meterRows = $$(".part-meter .row");
    const setRow = (row, pct) => {
      if (!row) return;
      const bar = row.querySelector(".bar i");
      const v = row.querySelector(".v");
      if (bar) bar.style.width = `${(pct * 100).toFixed(0)}%`;
      if (v) v.textContent = `${(pct * 100).toFixed(0)}%`;
    };
    setRow(meterRows[0], tPct);
    setRow(meterRows[1], sPct);
    setRow(meterRows[2], pPct);
    state.participation.breakdown = { teacher: tPct, student: sPct, silent: pPct };
    // LIVE 提示动态化
    const tip = $(".live-tip .body");
    if (tip) {
      if (sPct >= 0.55) tip.textContent = `学生说占比已达 ${(sPct * 100).toFixed(0)}%——本轮已超过目标 + 15 pp，可以进入下一题。`;
      else if (sPct >= 0.40) tip.textContent = `学生说占比 ${(sPct * 100).toFixed(0)}%，达本轮目标线 40%。`;
      else tip.textContent = `学生说占比偏低 ${(sPct * 100).toFixed(0)}%，建议先抛 1 个开放题再分组。`;
    }
    // 教师讲/学生说图例计数同步
    syncDotKey();
  }
  function syncDotKey() {
    const keys = $$(".part-key .k");
    if (keys.length !== 4) return;
    let c0 = 0, c1 = 0, c2 = 0, c3 = 0;
    state.participation.students.forEach((s) => {
      if (s.count === 0) c0++;
      else if (s.count === 1) c1++;
      else if (s.count === 2) c2++;
      else c3++;
    });
    const setKey = (el, txt) => {
      if (el && el.lastChild && el.lastChild.nodeType === 3) el.lastChild.nodeValue = txt;
    };
    setKey(keys[0], `沉默 ${c0}`);
    setKey(keys[1], `1 次 ${c1}`);
    setKey(keys[2], `2+ 次 ${c2}`);
    setKey(keys[3], `主动 ${c3}`);
  }

  function setInlineRunBtn(running) {
    const inline = $("#inline-sim-run");
    if (inline) {
      inline.textContent = running ? "⏸ 暂停" : "▶ 运行模拟";
      inline.classList.toggle("is-running", !!running);
    }
  }
  function startSim() {
    if (state.simStarted && !state.simPaused) return;
    state.simStarted = true;
    state.simPaused = false;
    const a = $("#pr-sim-start"); if (a) a.disabled = true;
    const b = $("#pr-sim-pause"); if (b) b.disabled = false;
    setInlineRunBtn(true);
    setStageStatus("ii", `仿真中 · ${fmtTime(state.tSec)} / 45:00`, true, false);
    state.timerHandle = setInterval(tick, 1000);
    toast("仿真已开始 · 1 真实秒 = 6 仿真秒");
  }
  function pauseSim() {
    state.simPaused = true;
    clearInterval(state.timerHandle);
    const a = $("#pr-sim-start"); if (a) a.disabled = false;
    const b = $("#pr-sim-pause"); if (b) b.disabled = true;
    setInlineRunBtn(false);
    setStageStatus("ii", `已暂停 · ${fmtTime(state.tSec)} / 45:00`, false, false);
  }
  function tick() {
    const prev = state.tSec;
    state.tSec = Math.min(state.capSec, state.tSec + state.realtimeScale);
    generateNextBeats(prev, state.tSec);
    syncHeaderTimers();
    updatePersonaLive();
    // Agent runtime tick → drives state evolution + visual feedback
    const fired = tickAgents(state.tSec);
    reflectAgentStateInGrid(fired);
    setStageStatus("ii", `仿真中 · ${fmtTime(state.tSec)} / 45:00`, true, false);
    if (state.tSec >= state.capSec) {
      pauseSim();
      setStageStatus("ii", `仿真完成 · 45:00 / 45:00`, false, true);
      // 自动派生 KM
      setTimeout(deriveKeyMoments, 500);
    }
  }
  function stepSim(seconds) {
    const prev = state.tSec;
    state.tSec = Math.min(state.capSec, state.tSec + seconds);
    generateNextBeats(prev, state.tSec);
    syncHeaderTimers();
    updatePersonaLive();
    const fired = tickAgents(state.tSec);
    reflectAgentStateInGrid(fired);
    setStageStatus("ii", `已跳进 +${seconds}s · ${fmtTime(state.tSec)}`, false, false);
  }
  function resetSim() {
    pauseSim();
    state.tSec = 132;
    state.eventStream = [];
    state.keyMoments = [];
    saveKeyMoments(wizSelection.chapter, []);
    state._teacherCallCUntil = 0;
    state._teacherCallSilentUntil = 0;
    state._teacherOpenQUntil = 0;
    state._callResponders = null;
    state.participation.students.forEach((s) => (s.count = 0));
    $$(".part-grid .part-dot").forEach((d) => d.classList.remove("spoke-1", "spoke-2", "spoke-3"));
    // 移除运行时追加的 beat（保留页面静态那批）——节点真正删掉，
    // 否则 reset 后旧 beat 会被 ingestExistingBeats 重新读入，靠 tSec 去重堵死重跑发言
    $$(".scene .beat-row.is-runtime").forEach((el) => el.remove());
    // 清画像 live 高亮
    $$("#stage-ii .persona-cell.is-live-active").forEach((c) => c.classList.remove("is-live-active"));
    // 重置 agent runtime 到 state_init
    if (__agents) initAgentRuntimes();
    $$("#stage-ii .persona-cell").forEach((c) => {
      c.classList.remove("is-fading", "is-tired", "is-state-pulse");
      c.style.opacity = "";
      delete c.dataset.prevAttention;
    });
    ingestExistingBeats();
    renderKeyMoments();
    (state.expertCards || []).forEach((entry) => {
      resetReviewBeforeEvidence(entry);
      saveExpertReview(wizSelection.chapter, entry);
    });
    refreshAllReviewEvidence();
    composeAssets();
    syncHeaderTimers();
    updatePersonaLive();
    reflectAgentStateInGrid([]);
    setStageStatus("ii", `已重置 · ${fmtTime(state.tSec)} / 45:00`, false, false);
  }
  function syncHeaderTimers() {
    $$('[data-live="timer"]').forEach((el) => (el.textContent = fmtTime(state.tSec)));
  }

  // ──────────────────────────────────────────────────────────────
  // 5. Stage ii —— 派生关键时刻
  // ──────────────────────────────────────────────────────────────
  function deriveKeyMoments() {
    setStageStatus("ii", "正在派生…", true, false);
    const mvMoments = readMetaverseKeyMoments();
    state.keyMoments = [];
    if (Array.isArray(mvMoments)) {
      state.keyMoments = mvMoments;
    } else {
      // 兼容旧版内嵌剧本运行时；新版 3D / 2.5D 教室优先走统一 hook。
      Practice.KEY_MOMENT_TYPES.forEach((rule) => {
        const hit = matchRule(rule);
        if (hit) state.keyMoments.push(hit);
      });
    }
    // 限制 3-5 个，按优先级
    state.keyMoments.sort((a, b) => a.priority - b.priority);
    state.keyMoments = state.keyMoments.slice(0, 5);
    metaverseMomentSignature = keyMomentSignature(state.keyMoments);
    saveKeyMoments(wizSelection.chapter, state.keyMoments);
    renderKeyMoments();
    refreshAllReviewEvidence({ autoLink: true });
    composeAssets();
    updateBottomAdoptBar();
    if (state.keyMoments.length) {
      setStageStatus("ii", `已读取 ${state.keyMoments.length} 条已发生仿真记录`, false, true);
    } else {
      setStageStatus("ii", "尚无已发生仿真记录 · 请先播放或拖动录播", false, false);
      toast("尚无可关联记录 · 请先播放或拖动虚拟班录播，再刷新关键时刻");
    }
  }

  function readMetaverseKeyMoments(capturedUntilOverride) {
    const mv = window.PharmacoPilotMV;
    if (!(mv && typeof mv.getT === "function" && typeof mv.keyMoments === "function")) return null;
    const capturedUntil = Number.isFinite(Number(capturedUntilOverride))
      ? Math.max(0, Number(capturedUntilOverride))
      : Number(mv.getT()) || 0;
    const records = mv.keyMoments()
      .filter((record) => Number(record?.t) > 0 && Number(record.t) <= capturedUntil)
      .sort((a, b) => Number(a.t) - Number(b.t));
    return records.map((record, index) => packMetaverseMoment(record, index));
  }

  function keyMomentSignature(moments) {
    return (moments || []).map((moment) => moment.id).join("|");
  }

  function syncKeyMomentsFromPlayback(tSec, { force = false } = {}) {
    const moments = readMetaverseKeyMoments(tSec);
    if (!Array.isArray(moments)) return false;
    moments.sort((a, b) => a.priority - b.priority);
    const next = moments.slice(0, 5);
    const nextSignature = keyMomentSignature(next);
    if (!force && nextSignature === metaverseMomentSignature) return false;
    metaverseMomentSignature = nextSignature;
    state.keyMoments = next;
    saveKeyMoments(wizSelection.chapter, state.keyMoments);
    renderKeyMoments();
    refreshAllReviewEvidence({ autoLink: true });
    composeAssets();
    updateBottomAdoptBar();
    setStageStatus(
      "ii",
      state.keyMoments.length
        ? `已自动记录 ${state.keyMoments.length} 条已发生仿真记录`
        : "尚无已发生仿真记录 · 请继续播放或拖动录播",
      false,
      state.keyMoments.length > 0,
    );
    return true;
  }

  function registerMetaverseMomentSync() {
    const mv = global.PharmacoPilotMV;
    if (!(mv && typeof mv.onTime === "function" && typeof mv.keyMoments === "function")) return false;
    if (activeMetaverseMomentSource === mv) return true;
    activeMetaverseMomentSource = mv;
    metaverseMomentLastT = null;
    metaverseMomentSignature = keyMomentSignature(state.keyMoments);
    mv.onTime((rawT) => {
      const tSec = Math.max(0, Number(rawT) || 0);
      const isInitialCallback = metaverseMomentLastT === null;
      metaverseMomentLastT = tSec;
      // 页面重载时播放器从 0 初始化，不应因这次初始回调擦掉已保存的试教证据和候选。
      if (isInitialCallback && tSec <= 0 && state.keyMoments.length) return;
      syncKeyMomentsFromPlayback(tSec);
    });
    return true;
  }

  function packMetaverseMoment(record, index) {
    const text = stripHtml(record?.text || record?.label || "虚拟班关键记录").trim();
    const tSec = Math.max(0, Number(record?.t) || 0);
    let typeId = "simulation-signal";
    let cn = "虚拟班关键信号";
    let suggestSlot = "pulseRule.ifThen";
    let copyTemplate = "将这条仿真记录与相关修订建议并列呈现，供教师决定如何处理。";
    let priority = 3;

    if (record?.type === "silence" || /沉默|未发声/.test(text)) {
      typeId = "silence-cliff";
      cn = /T 维|竞争威胁|竞品/.test(text) ? "威胁（T）类证据讨论中出现集体沉默" : "讨论中出现集体沉默信号";
      suggestSlot = "timeline.scaffoldInsertion";
      copyTemplate = /T 维|竞争威胁|竞品/.test(text)
        ? "将这段沉默与外部环境证据的追问关联，供教师决定是否新增竞店、人才或区域市场数据支架。"
        : "将这段沉默保留为调控信号，供教师决定是否新增支架。";
      priority = 2;
    } else if (/结构性|对立|分歧/.test(text) && record?.type !== "marker") {
      typeId = "structural-conflict";
      cn = /SWOT|W\s*vs\s*T|内外部/.test(text) ? "SWOT 内外部边界出现结构性分歧" : "仿真中出现结构性分歧";
      suggestSlot = "questionChain.divergenceAnchor";
      copyTemplate = /SWOT|W\s*vs\s*T|内外部/.test(text)
        ? "将这段 W/T 边界分歧与修订建议关联，供教师决定是否新增“组织可控性 + 外部趋势”判据。"
        : "将这段结构性分歧与修订建议关联，供教师决定是否新增分歧锚点。";
      priority = 1;
    } else if (/反思|复盘|被低估/.test(text)) {
      typeId = "reflection-signal";
      cn = "仿真进入反思与复盘节点";
      suggestSlot = "retro.agendaFulfillment";
      copyTemplate = "将这条反思记录与复盘建议关联，供教师决定是否写回。";
    } else if (record?.type === "marker" || /问题链|锚点|第\s*\d+\s*题/.test(text)) {
      typeId = "question-chain-marker";
      cn = text || "问题链进入新节点";
      suggestSlot = /分歧|对立/.test(text) ? "questionChain.divergenceAnchor" : "questionChain.openerTemplate";
      copyTemplate = "将该问题链节点与修订建议关联，供教师决定是否调整问句或节奏。";
    }

    return {
      id: `KM-mv-${typeId}-${Math.round(tSec)}-${index}`,
      typeId,
      cn,
      tSec,
      quote: text.slice(0, 120),
      priority,
      suggestSlot,
      copyTemplate,
      beats: [{ tSec, role: "MV", text }],
      source: "metaverse-classroom",
    };
  }
  function matchRule(rule) {
    const beats = state.eventStream;
    switch (rule.id) {
      case "structural-conflict": {
        // 找出连续两条带 conflict 标记
        for (let i = 1; i < beats.length; i++) {
          if (beats[i].flags?.conflict) {
            return packMoment(rule, beats[i].tSec, beats.slice(Math.max(0, i - 2), i + 1));
          }
        }
        // 兜底用页面静态那条 02:05 note
        const noteIdx = beats.findIndex((b) => b.role === "A" && /结构性对立/.test(b.text));
        if (noteIdx > -1) return packMoment(rule, beats[noteIdx].tSec, beats.slice(Math.max(0, noteIdx - 2), noteIdx + 1));
        return null;
      }
      case "high-response-density": {
        // 教师抛开放题后 30 仿真秒内若多于 1 个 S 应答
        for (let i = 0; i < beats.length; i++) {
          if (beats[i].role === "T" && /直觉|你最先|看到/.test(beats[i].text)) {
            const responders = beats.slice(i + 1).filter((b) => b.role === "S" && b.tSec - beats[i].tSec <= 30);
            if (responders.length >= 1) return packMoment(rule, beats[i].tSec + 13, [beats[i], ...responders.slice(0, 2)]);
          }
        }
        return null;
      }
      case "unplanned-dimension": {
        const b = beats.find((x) => x.flags?.unplanned);
        if (b) return packMoment(rule, b.tSec, [b]);
        return null;
      }
      case "agent-intervention-adopted": {
        // Agent 建议 后 90 秒内有 T 行动
        const ag = beats.find((x) => x.role === "A" && x.kind === "agentDetect");
        if (!ag) return null;
        const teacher = beats.find((x) => x.role === "T" && x.tSec > ag.tSec && x.tSec - ag.tSec <= 90);
        if (teacher) return packMoment(rule, ag.tSec, [ag, teacher]);
        return null;
      }
      case "silence-cliff": {
        // 找一段标记为"沉默拉长"的 marker
        const m = beats.find((x) => x.role === "marker" && /沉默/.test(x.text));
        if (m) return packMoment(rule, m.tSec, [m]);
        return null;
      }
    }
    return null;
  }
  function packMoment(rule, tSec, srcBeats) {
    return {
      id: `KM-${rule.id}-${tSec}`,
      typeId: rule.id,
      cn: rule.cn,
      tSec,
      quote: stripHtml(srcBeats[srcBeats.length - 1].text).slice(0, 80) + "…",
      priority: rule.priority,
      suggestStation: rule.suggestStation,
      suggestSlot: rule.suggestSlot,
      copyTemplate: rule.copyTemplate,
      beats: srcBeats.map((b) => ({ tSec: b.tSec, role: b.role, text: b.text })),
    };
  }
  function stripHtml(s) { return String(s).replace(/<[^>]+>/g, ""); }
  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[char]);
  }

  function renderKeyMoments() {
    const grid = $(".km-grid");
    if (!grid) return;
    grid.innerHTML = "";
    state.keyMoments.forEach((km, i) => {
      const envLabels = envKeysForMoment(km).map((key) => {
        const env = PRACTICE_ENV_BY_KEY[key];
        return env ? `${env.no} ${env.label}` : key;
      }).join(" / ");
      const card = document.createElement("div");
      card.className = "km-card pr-flash is-new";
      card.dataset.kmId = km.id;
      card.innerHTML = `
        <div class="km-time">
          <span>KEY MOMENT ${String(i + 1).padStart(2, "0")}</span>
          <b>${fmtTime(km.tSec)}</b>
        </div>
        <h4>${km.cn}</h4>
        <div class="km-quote">"${km.quote}"</div>
        <p>${km.copyTemplate.replace(/{[^}]+}/g, "—")}</p>
        <div class="km-tag">
          <span class="pill pill-amber">相关环节 · ${envLabels || "待处理"}</span>
          <span class="pill pill-sage">可关联修订候选</span>
        </div>
        <div class="km-meta">
          <span>类型 <b>${km.typeId}</b></span>
          <span>优先级 <b>${km.priority}</b></span>
        </div>
      `;
      grid.appendChild(card);
      setTimeout(() => card.classList.remove("is-new"), 2400);
    });
    if (!state.keyMoments.length) {
      grid.innerHTML = `<div class="decision-empty">尚无已发生仿真记录 · 播放或拖动上方录播后将自动记录</div>`;
    }
    // 同步 hero meta 已识别关键时刻
    const moments = $('[data-field="moments"]');
    if (moments) moments.innerHTML = `${state.keyMoments.length} 处 · 待教师关联与判断`;
    // 页面录播控制器需在 innerHTML 重绘后重新绑定新卡片，避免新节点永久停在待捕获淡色态。
    window.dispatchEvent(new CustomEvent("practice:keymoments-rendered", {
      detail: { count: state.keyMoments.length },
    }));
  }

  // ──────────────────────────────────────────────────────────────
  // 6. Stage iii —— 教师确认与写回
  // ──────────────────────────────────────────────────────────────

  // ──────────────────────────────────────────────────────────────
  // 打包资产 + 写回实践包
  // ──────────────────────────────────────────────────────────────

  // 当前实践包使用 S1–S9；ASSET_TARGETS 仍保留旧 slot/station 契约。
  // 适配层只负责把“这条审校意见影响哪个当前环节”翻译成可复用资产 slot，
  // UI 永远展示 envKey 语义，不把旧 stationId 冒充当前九环节编号。
  const PRACTICE_ENV_META = Object.freeze([
    { key: "env01", no: "01", label: "学习者与教学情境分析", short: "学习者与教学情境分析" },
    { key: "env02", no: "02", label: "预期学习结果与评价证据设计", short: "预期学习结果与评价证据设计" },
    { key: "env03", no: "03", label: "教学内容结构化与前概念诊断", short: "教学内容结构化与前概念诊断" },
    { key: "env04", no: "04", label: "真实性学习情境与资源设计", short: "真实性学习情境与资源设计" },
    { key: "env05", no: "05", label: "学习活动与教学支架设计", short: "学习活动与教学支架设计" },
    { key: "env06", no: "06", label: "形成性评价与适应性调控", short: "形成性评价与适应性调控" },
    { key: "env07", no: "07", label: "表现性评价与学习成效诊断", short: "表现性评价与学习成效诊断" },
    { key: "env08", no: "08", label: "反思性实践与教学改进", short: "反思性实践与教学改进" },
    { key: "env09", no: "09", label: "教学知识建构与专业共享", short: "教学知识建构与专业共享" },
  ]);
  const PRACTICE_ENV_BY_KEY = Object.freeze(Object.fromEntries(PRACTICE_ENV_META.map((env) => [env.key, env])));
  const {
    normalizeLiveReview,
    normalizeUnlocatedReview,
    liveReviewSourceText,
    liveReviewBodyMarkup,
    seedReviewBodyMarkup,
    liveReviewAnchorCopy,
    liveReviewTargetKeys,
    liveReviewFailureCopy,
  } = Review.createHelpers({ envByKey: PRACTICE_ENV_BY_KEY, escapeHtml });
  const SLOT_TO_ENV_KEYS = Object.freeze({
    "positioning.spiralCorrection": ["env01"],
    "goal.observableCriterion": ["env02"],
    "evidence.rubricRowAdd": ["env02", "env07"],
    "questionChain.openerTemplate": ["env05"],
    "questionChain.divergenceAnchor": ["env03", "env05"],
    "case.evidenceForAgenda": ["env04"],
    "timeline.scaffoldInsertion": ["env06"],
    "timeline.zpdAnchorAdd": ["env06"],
    "explore.studentInitiatedDimension": ["env05"],
    "explore.roleRebalance": ["env05"],
    "pulseRule.ifThen": ["env06", "env07"],
    "retro.consensusPull": ["env08", "env09"],
    "retro.agendaFulfillment": ["env08"],
  });

  function slotForReviewTarget(envKey, text) {
    const body = String(text || "");
    if (envKey === "env01") return "positioning.spiralCorrection";
    if (envKey === "env02") return /评价标准|评价|评分|锚点/.test(body) ? "evidence.rubricRowAdd" : "goal.observableCriterion";
    if (envKey === "env03") return "questionChain.divergenceAnchor";
    if (envKey === "env04") return "case.evidenceForAgenda";
    if (envKey === "env05") return /分歧|对立|锚点|博弈/.test(body) ? "questionChain.divergenceAnchor" : "questionChain.openerTemplate";
    if (envKey === "env06") return /如果|则|触发|监测|信号/.test(body) ? "pulseRule.ifThen" : "timeline.scaffoldInsertion";
    if (envKey === "env07") return /评价标准|评分|评价|画像/.test(body) ? "evidence.rubricRowAdd" : "pulseRule.ifThen";
    if (envKey === "env08") return "retro.consensusPull";
    if (envKey === "env09") return "retro.consensusPull";
    return null;
  }

  function envKeysForMoment(km) {
    return SLOT_TO_ENV_KEYS[km?.suggestSlot] || [];
  }

  function inferReviewTargetEnvKeys(text) {
    const body = String(text || "");
    const hits = [];
    const add = (key) => { if (!hits.includes(key)) hits.push(key); };
    if (/学情|先验|前经验|认知起点/.test(body)) add("env01");
    if (/目标|评价标准|可观测|可观察/.test(body)) add("env02");
    if (/概念|误区|混淆|机制/.test(body)) add("env03");
    if (/证据|案例|政策|法规|文号|数据|报告|引用|病例|通告|RWE|数据库/.test(body)) add("env04");
    if (/问题链|任务|角色|情境|场景|分歧|博弈|课题|锚点/.test(body)) add("env05");
    if (/分组|分钟|时间|沉默|干预|追问|节奏|触发/.test(body)) add("env06");
    if (/画像|立场迁移|评价维度|评分|评价标准/.test(body)) add("env07");
    if (/复盘|原因|下一轮|改进决策/.test(body)) add("env08");
    if (/沉淀|模板|复用|知识库/.test(body)) add("env09");
    return hits.length ? hits.slice(0, 3) : ["env08"];
  }

  function composeAssets() {
    state.assets = [];

    // 关键时刻只是仿真记录，不自动成为资产。只有教师明确判断“支持”的
    // 修订候选才按其目标 envKey 生成一个或多个资产。
    (state.expertCards || [])
      .filter((entry) => entry.state === "candidate" && entry.decision === "supported")
      .forEach((entry) => {
        const linkedMoments = state.keyMoments.filter((km) => entry.evidenceLinks.includes(km.id));
        entry.targetEnvKeys.forEach((envKey) => {
          const slotId = slotForReviewTarget(envKey, entry.draftText);
          if (!slotId) return;
          const target = Practice.assetTargetFor(slotId);
          if (!target) return;
          const env = PRACTICE_ENV_BY_KEY[envKey];
          const id = Practice.nextAssetId(`P-${env?.no || "00"}-`, state.assets.map((asset) => asset.id));
          state.assets.push({
            id,
            slotId,
            target,
            practiceEnvKey: envKey,
            km: linkedMoments[0] || null,
            linkedMoments,
            mergedComments: [{ author: entry.expert.role, body: entry.draftText }],
            status: entry.writtenBack ? "shipped" : "ready",
            _fromReview: true,
            _reviewId: entry.expertId,
            _reviewLabel: `${env?.no || "--"} ${env?.label || envKey}`,
            _reviewRole: entry.expert?.role || "",
            _reviewDraft: entry.draftText,
          });
        });
      });

    renderMigrate();
  }
  function renderMigrate() {
    const migrate = $(".migrate");
    if (!migrate) return;
    const leftSide = migrate.querySelectorAll(".mig-side")[0];
    const rightSide = migrate.querySelectorAll(".mig-side")[1];
    if (leftSide) {
      const candidates = (state.expertCards || []).filter((entry) => entry.state === "candidate");
      leftSide.innerHTML = `<h5>本轮 <b>修订候选 + 仿真证据关联</b></h5>`;
      candidates.forEach((entry) => {
        const card = document.createElement("div");
        card.className = "mig-card";
        const envLabels = entry.targetEnvKeys.map((key) => {
          const env = PRACTICE_ENV_BY_KEY[key];
          return env ? `${env.no} ${env.label}` : key;
        }).join(" / ");
        const linked = state.keyMoments.filter((km) => entry.evidenceLinks.includes(km.id));
        const decisionLabel = {
          supported: "教师确认支持",
          unsupported: "教师确认不支持",
          insufficient: "证据不足",
          pending: "待教师判断",
        }[entry.decision] || "待教师判断";
        card.innerHTML = `
          <div class="top">
            <span class="id">${escapeHtml(entry.expert.role)}</span>
            <span class="kind">revision</span>
          </div>
          <div class="title">${escapeHtml(entry.draftText.slice(0, 76))}${entry.draftText.length > 76 ? "…" : ""}</div>
          <div class="meta"><span>${escapeHtml(envLabels)}</span><span><b>${decisionLabel}</b></span></div>
          <div class="meta"><span>${linked.length ? `已关联 ${linked.length} 条仿真记录` : "尚无仿真记录关联"}</span><span>${entry.decisionNote ? escapeHtml(entry.decisionNote) : ""}</span></div>
        `;
        leftSide.appendChild(card);
      });
      if (!candidates.length) {
        leftSide.insertAdjacentHTML("beforeend", `<div class="mig-card is-empty"><div class="title">尚无修订候选</div><div class="meta"><span>请先在 ii 段加入候选</span></div></div>`);
      }
    }
    if (rightSide) {
      rightSide.innerHTML = `<h5>教师确认支持后，按 <b>当前 S1–S9</b> 生成资产</h5>`;
      const grouped = {};
      state.assets.forEach((a) => {
        const k = a.practiceEnvKey || "env09";
        if (!grouped[k]) grouped[k] = [];
        grouped[k].push(a);
      });
      Object.keys(grouped).sort().forEach((envKey) => {
        const env = PRACTICE_ENV_BY_KEY[envKey];
        grouped[envKey].forEach((a) => {
          const card = document.createElement("div");
          card.className = "mig-card right" + (a.status === "shipped" ? " is-shipped" : "");
          card.dataset.assetId = a.id;
          card.style.position = "relative";
          const sourceLabel = `来自 ${a._reviewRole} · 关联 ${a.linkedMoments?.length || 0} 条仿真记录`;
          card.innerHTML = `
            <div class="top">
              <span class="id">${a.id}</span>
              <span class="kind">${a.target.kind}</span>
            </div>
            <div class="title">${env?.no || "--"} · ${env?.label || envKey}<br/>
              <small style="font-family:var(--mono); color:var(--mute); font-size: var(--fs-2xs);">slot · ${a.slotId}</small>
            </div>
            <div class="meta">
              <span>${escapeHtml(sourceLabel)}</span>
              <span><b>${a.status === "shipped" ? "已写入 ✓" : "待写入"}</b></span>
            </div>
          `;
          rightSide.appendChild(card);
        });
      });
      if (!state.assets.length) {
        rightSide.insertAdjacentHTML("beforeend", `<div class="mig-card is-empty"><div class="title">尚无可写回资产</div><div class="meta"><span>需先由教师确认至少一条候选为“支持”</span></div></div>`);
      }
    }
    const candidates = (state.expertCards || []).filter((entry) => entry.state === "candidate");
    const supported = candidates.filter((entry) => entry.decision === "supported").length;
    setStageStatus("iii", `${candidates.length} 条修订候选 · ${supported} 条教师确认支持`, false, supported > 0);
    renderStage3();
  }

  // ============================================================
  // Stage 3 动态渲染：变更清单 / publish-bar / sync-tri
  // 跟随 Stage 1（章节选择）和 Stage 2（学科审校、仿真记录关联与教师判断）实时更新
  // ============================================================

  const EC_LABEL_MAP = {
    "is-pharm":   "药学",
    "is-design":  "经管",
    "is-law":     "法学",
    "is-eval":    "教育",
    "is-reflect": "数据",
  };

  function deriveTemplateType(chapter) {
    if (!chapter) return "T-通用类";
    const id = chapter.id || "";
    if (id.includes("mp-ch3"))                         return "T-SWOT/TOWS 环境分析类";
    if (id.includes("procurement") || id.includes("payment")) return "T-集采/支付类";
    if (id.includes("gmp") || id.includes("gsp"))             return "T-质量体系类";
    if (id.includes("supervision") || id.includes("pv"))      return "T-监管/警戒类";
    if (id.includes("amr") || id.includes("doseopt"))         return "T-临床合理用药类";
    if (id.includes("newdrug") || id.includes("registration")) return "T-注册/审评类";
    return `T-${(chapter.topic || "通用").slice(0, 6)}类`;
  }

  function renderChangeList() {
    const cl = document.querySelector("#stage-iii .change-list");
    if (!cl) return;

    const candidates = (state.expertCards || []).filter((entry) => entry.state === "candidate");

    const ct = cl.querySelector(".ct");
    if (ct) ct.textContent = candidates.length;

    cl.querySelectorAll(".decision-row, .decision-empty").forEach((row) => row.remove());

    candidates.forEach((entry) => {
      const row = document.createElement("article");
      row.className = `decision-row ${entry.expert.ec}`;
      const envLabels = entry.targetEnvKeys.map((key) => {
        const env = PRACTICE_ENV_BY_KEY[key];
        return env ? `${env.no} ${env.label}` : key;
      });
      const originalTexts = entry.targetEnvKeys.map((key) => {
        const env = PRACTICE_ENV_BY_KEY[key];
        const text = entry.originalEnvContent?.[key] || "当前环节暂无内容";
        return `<span><b>${env?.no || "--"}</b>${escapeHtml(text.slice(0, 86))}${text.length > 86 ? "…" : ""}</span>`;
      }).join("");
      const linked = state.keyMoments.filter((km) => entry.evidenceLinks.includes(km.id));
      const evidenceHtml = linked.length
        ? linked.map((km) => `<span><b>${fmtTime(km.tSec)}</b>${escapeHtml(km.cn)}</span>`).join("")
        : `<span class="is-muted">尚未关联仿真记录</span>`;
      const decision = {
        supported: ["教师确认支持", "is-supported"],
        unsupported: ["教师确认不支持", "is-unsupported"],
        insufficient: ["证据不足", "is-insufficient"],
        pending: ["待教师判断", "is-pending"],
      }[entry.decision] || ["待教师判断", "is-pending"];
      row.innerHTML = `
        <header class="decision-head">
          <span class="src ${entry.expert.ec}">${escapeHtml(entry.expert.role)}</span>
          <span class="decision-targets">${escapeHtml(envLabels.join(" / "))}</span>
        </header>
        <div class="decision-flow">
          <section><small>01 · 原内容</small><div class="decision-copy">${originalTexts}</div></section>
          <section><small>02 · 修订候选</small><p>${escapeHtml(entry.draftText)}</p></section>
          <section><small>03 · 仿真证据关联</small><div class="decision-copy">${evidenceHtml}</div></section>
          <section><small>04 · 教师判断</small><span class="decision-state ${decision[1]}">${decision[0]}</span>${entry.decisionNote ? `<p>${escapeHtml(entry.decisionNote)}</p>` : ""}</section>
        </div>
      `;
      cl.appendChild(row);
    });

    if (!candidates.length) {
      const empty = document.createElement("div");
      empty.className = "decision-empty";
      empty.textContent = "尚无修订候选 · 请在 ii 段从五路学科审校中加入至少一条候选";
      cl.appendChild(empty);
    }
  }

  function renderPublishBar() {
    const bar = document.querySelector(".publish-bar");
    if (!bar) return;
    const candidates = (state.expertCards || []).filter((entry) => entry.state === "candidate");
    const supportedEntries = candidates.filter((entry) => entry.decision === "supported");
    const supported = supportedEntries.length;
    const writable = supportedEntries.filter((entry) => !entry.writtenBack).length;
    const pending = candidates.filter((entry) => entry.decision === "pending").length;
    const linked = new Set(candidates.flatMap((entry) => entry.evidenceLinks)).size;
    const heading = bar.querySelector(".pb-l h4");
    if (heading) heading.textContent = supported > 0
      ? (writable > 0 ? "本轮已有教师确认支持的候选" : "本轮教师确认写回已完成")
      : "教师确认后才可写回";
    const p = bar.querySelector("p");
    if (p) p.textContent = `${candidates.length} 条修订候选 · ${linked} 条已关联仿真记录 · ${supported} 条教师确认支持 · ${pending} 条待判断`;
    const publish = bar.querySelector("#inline-publish");
    if (publish) {
      publish.disabled = writable === 0;
      publish.setAttribute("aria-disabled", writable === 0 ? "true" : "false");
    }
  }

  function renderSyncTri() {
    const tri = document.querySelector(".sync-tri");
    if (!tri) return;
    const chapter        = getSelected("chapter");
    const candidates     = (state.expertCards || []).filter((entry) => entry.state === "candidate");
    const supported      = candidates.filter((entry) => entry.decision === "supported");
    const linkedCount    = new Set(candidates.flatMap((entry) => entry.evidenceLinks)).size;
    const cells          = tri.querySelectorAll(".sync-cell");

    if (cells[0]) {
      const targetEnvKeys = [...new Set(supported.flatMap((entry) => entry.targetEnvKeys))].sort();
      const targetLabel = targetEnvKeys.length
        ? targetEnvKeys.map((key) => `${PRACTICE_ENV_BY_KEY[key]?.no} ${PRACTICE_ENV_BY_KEY[key]?.label}`).join(" / ")
        : "等待教师确认支持";
      cells[0].querySelector(".sc-target").textContent = `本课实践包 · ${targetLabel}`;
      const chapterLabel = chapter ? chapter.title : "当前章节";
      cells[0].querySelector(".sc-detail").innerHTML =
        `教师确认支持 <b>${supported.length}</b> 条 · 写回「${escapeHtml(chapterLabel)}」并保留原始审校与判断记录`;
      const hasContent = supported.length > 0;
      cells[0].classList.toggle("is-ready",   hasContent);
      cells[0].classList.toggle("is-pending", !hasContent);
    }

    if (cells[1]) {
      cells[1].querySelector(".sc-detail").innerHTML =
        `修订候选 <b>${candidates.length}</b> 条 · 仿真证据已关联 <b>${linkedCount}</b> 条 · 教师判断 → <b>同步进入下一轮改进队列</b>`;
    }

    if (cells[2]) {
      const templateType = deriveTemplateType(chapter);
      cells[2].querySelector(".sc-detail").innerHTML =
        `模板 <b>${templateType}</b> v0.1 · 待教师在确认写回时勾选是否一并沉淀`;
    }
  }

  function renderStage3() {
    renderChangeList();
    renderPublishBar();
    renderSyncTri();
    renderLoopClose();
  }

  function renderLoopClose() {
    const close = document.querySelector(".loop-close");
    if (!close) return;
    const heading = close.querySelector(".lc-txt b");
    const detail = close.querySelector(".lc-txt span");
    const cta = close.querySelector(".lc-cta");
    const candidates = (state.expertCards || []).filter((entry) => entry.state === "candidate");
    const supported = candidates.filter((entry) => entry.decision === "supported");
    const pending = candidates.filter((entry) => entry.decision === "pending");
    const allSupportedWritten = supported.length > 0 && supported.every((entry) => entry.writtenBack);

    if (allSupportedWritten) {
      if (heading) heading.textContent = "本轮闭环完成 · 教师确认的修订已回写";
      if (detail) detail.textContent = "实践包已更新，审校来源、仿真记录关联与教师判断均已保留";
      if (cta) { cta.textContent = "带着修订再来一轮 →"; cta.href = "#stage-i"; }
      return;
    }
    if (!candidates.length) {
      if (heading) heading.textContent = "本轮闭环待启动 · 尚无修订候选";
      if (detail) detail.textContent = "先将审校意见加入修订候选，再关联仿真记录并完成教师判断";
    } else if (supported.length) {
      if (heading) heading.textContent = `本轮闭环待写回 · ${supported.length} 条候选已由教师确认支持`;
      if (detail) detail.textContent = "点击“教师确认写回”后，系统才会更新目标教学环节";
    } else if (!pending.length) {
      if (heading) heading.textContent = "本轮教师判断已记录 · 暂无支持写回的候选";
      if (detail) detail.textContent = "不支持、证据不足与不采用理由仍保留为可追溯记录";
    } else {
      if (heading) heading.textContent = `本轮闭环待判断 · ${pending.length} 条候选尚待教师确认`;
      if (detail) detail.textContent = "系统只呈现关联的仿真记录，不替教师宣布验证结论";
    }
    if (cta) { cta.textContent = "回到审校与仿真 →"; cta.href = "#stage-ii"; }
  }

  function writeBackAllAssets() {
    if (!state.assets.length) {
      toast("尚无教师确认支持的修订候选 · 系统不会替教师自动写回");
      return;
    }
    let shipped = 0;
    const shippedReviewIds = new Set();
    state.assets.forEach((a) => {
      if (a.status === "shipped") return;
      const ok = writeBackOne(a);
      if (ok) {
        a.status = "shipped";
        shipped++;
        if (a._reviewId) shippedReviewIds.add(a._reviewId);
        state.writebackLog.push({
          assetId: a.id, slotId: a.slotId, practiceEnvKey: a.practiceEnvKey, stationId: a.target.stationId,
          storeCall: a.target.storeCall, at: Date.now(),
        });
      }
    });
    applySupportedCandidatesToPracticePack(shippedReviewIds);
    renderMigrate();
    toast(`教师已确认写回 ${shipped} 个资产 · 修订与判断记录已保留`);
    const envCount = new Set(state.writebackLog.map((item) => item.practiceEnvKey).filter(Boolean)).size;
    setStageStatus("iii", `已写回 ${shipped} 个资产到 ${envCount} 个当前教学环节`, false, true);
    // 更新 hero meta "待写回"计数
    const moments = $('[data-field="moments"]');
    if (moments) moments.innerHTML = `${state.keyMoments.length} 处 · 已写回 ${state.writebackLog.length}`;
    // 刷新页眉"上次写入"——让"确认写回"所见即所得
    if (shipped > 0 && typeof window.ppPracticeTouchUpdated === "function") {
      window.ppPracticeTouchUpdated();
    }
  }
  function applySupportedCandidatesToPracticePack(reviewIds) {
    const chapterId = wizSelection.chapter;
    if (!chapterId || !reviewIds.size) return;
    (state.expertCards || []).forEach((entry) => {
      if (!reviewIds.has(entry.expertId) || entry.writtenBack) return;
      entry.targetEnvKeys.forEach((envKey) => {
        const body = document.querySelector(`.pack-preview [data-pack-field="${envKey}"]`);
        const current = body?.textContent?.trim() || loadGeneratedPack(chapterId)?.[envKey] || "";
        const addition = `修订：${entry.draftText}`;
        const next = current.includes(addition) ? current : [current, addition].filter(Boolean).join(" · ");
        saveGeneratedSection(chapterId, envKey, next);
        if (body) body.textContent = next;
      });
      entry.writtenBack = true;
      saveExpertReview(chapterId, entry);
    });
  }
  function writeBackOne(a) {
    try {
      const data = {
        sourcePractice: { sessionId: "#3417", round: 3 },
        kmId: a.km?.id || null,
        kmType: a.km?.typeId || (a._fromReview ? "discipline-review" : "unknown"),
        kmQuote: a.km?.quote || (a._reviewLabel ? `学科审校 · ${a._reviewLabel}` : ""),
        practiceEnvKey: a.practiceEnvKey || null,
        teacherDecision: a._fromReview ? "supported" : null,
        comments: a.mergedComments.map((c) => ({ author: c.author, body: c.body })),
        slotPayload: buildSlotPayload(a),
      };
      switch (a.target.storeCall) {
        case "saveArtifact":
          Store.saveArtifact(a.target.stationId, a.id, data);
          return true;
        case "setZpdAnchors": {
          const cur = Store.getZpdAnchors();
          const nextId = `Z${cur.length + 1}`;
          const tMin = a.km ? Math.floor(a.km.tSec / 60) : 0;
          Store.setZpdAnchors([...cur, { id: nextId, t: tMin, label: data.slotPayload.label }]);
          return true;
        }
        case "setPulseRule": {
          const anchors = Store.getZpdAnchors();
          const anchorId = anchors.length ? anchors[anchors.length - 1].id : "Z1";
          Store.setPulseRule(anchorId, {
            ifCond: data.slotPayload.ifCond,
            thenAct: data.slotPayload.thenAct,
            microFormat: data.slotPayload.microFormat,
          });
          return true;
        }
        case "markAgendaFulfilled":
          Store.markAgendaFulfilled(a.target.stationId, data.slotPayload.agendaKey, data.slotPayload.evidence);
          return true;
        default:
          console.warn("[practice-runtime] 未知 storeCall", a.target.storeCall);
          return false;
      }
    } catch (e) {
      console.error("[practice-runtime] writeBack failed", a.id, e);
      return false;
    }
  }
  function buildSlotPayload(a) {
    // ASSET_TARGETS 继续负责底层 slot；当前 S1–S9 目标通过 practiceEnvKey 另行记录。
    const reviewText = a._reviewDraft || a.mergedComments?.[0]?.body || "";
    switch (a.slotId) {
      case "questionChain.openerTemplate":
        return { label: "开放问题破冰句式", template: reviewText };
      case "questionChain.divergenceAnchor":
        return { label: "立场切换分歧锚点", template: reviewText, anchorAt: "由教师按目标环节确认" };
      case "explore.studentInitiatedDimension":
        return { label: "学生意外提出维度", dimension: reviewText, howToUse: "由教师确认后作为协作任务可选入口" };
      case "pulseRule.ifThen":
        return {
          label: "Agent 介入复盘规则",
          ifCond: a.km?.cn || "出现与修订候选相关的仿真信号",
          thenAct: reviewText,
          microFormat: "仿真记录关联 + 教师判断",
        };
      case "timeline.scaffoldInsertion":
        return { label: "支架插入点", tRange: a.km ? `${fmtTime(a.km.tSec)}–${fmtTime(a.km.tSec + 60)}` : "待教师编排", scaffold: reviewText };
      case "case.evidenceForAgenda":
        return { label: "真实性学习情境与资源设计修订", evidenceRow: reviewText };
      case "goal.observableCriterion":
        return { label: "可观察目标改写", criterion: reviewText };
      case "evidence.rubricRowAdd":
        return { label: "评价证据新增项", row: reviewText };
      case "retro.consensusPull":
        return { label: "本轮教师确认的改进", pull: reviewText };
      case "positioning.spiralCorrection":
        return { label: "学情与定位修订", correction: reviewText };
      default:
        return { label: a.km?.cn || "教师确认修订", raw: reviewText || a.km?.copyTemplate || "" };
    }
  }

  // ──────────────────────────────────────────────────────────────
  // 8. 启动
  // ──────────────────────────────────────────────────────────────
  // (旧 renderNavFeedinBanner 已删除 — 教学实践使用教师真实数据，不再承接 nav 产物)

  // ──────────────────────────────────────────────────────────────
  // Path A: wire 页内主按钮到已有的 runtime 函数
  // ──────────────────────────────────────────────────────────────
  function wireInlineControls() {
    // Stage i — 设计摘要 → 本机模型完整实践包 → 分环节重生成 / 四格式下载
    const gen = $("#inline-generate-pack");
    if (gen) gen.addEventListener("click", () => generatePracticePackWithLocalModel(gen));
    document.querySelectorAll("[data-pack-edit-briefs]").forEach((button) => {
      button.addEventListener("click", () => transitionPackWorkspace("briefs", { focus: true }));
    });
    document.querySelectorAll("[data-pack-return-output]").forEach((button) => {
      button.addEventListener("click", () => {
        if (!validGeneratedPack(loadGeneratedPack(wizSelection.chapter))) {
          toast("当前章节还没有完整课堂实践包");
          return;
        }
        transitionPackWorkspace("output", { focus: true });
      });
    });
    document.querySelectorAll("[data-pack-regenerate]").forEach((button) => {
      button.addEventListener("click", () => regeneratePracticeSection(button));
    });
    document.querySelectorAll("[data-pack-export]").forEach((button) => {
      button.addEventListener("click", () => exportPracticePack(button));
    });

    // Stage ii — sim-controls 三按钮（▶ 运行模拟 / ⟲ 重置 / ▷ 步进）
    const run = $("#inline-sim-run");
    if (run) run.addEventListener("click", () => {
      if (state.simStarted && !state.simPaused) pauseSim();
      else startSim();
    });
    const reset = $("#inline-sim-reset");
    if (reset) reset.addEventListener("click", () => { resetSim(); setInlineRunBtn(false); });
    const step = $("#inline-sim-step");
    if (step) step.addEventListener("click", () => stepSim(30));

    // Stage ii — 五路审校卡在 renderExpertCards() 内完成绑定

    // Stage iii — 教师确认写回 / 查看完整 diff
    const pub = $("#inline-publish");
    if (pub) pub.addEventListener("click", () => {
      if (state.assets.length === 0) {
        toast("尚无可写回资产 · 需先加入修订候选、关联仿真记录并由教师确认支持");
        return;
      }
      writeBackAllAssets();
    });
    const diff = $("#inline-diff");
    if (diff) diff.addEventListener("click", () => {
      const candidates = (state.expertCards || []).filter((entry) => entry.state === "candidate");
      const supported = candidates.filter((entry) => entry.decision === "supported").length;
      toast(`教师决策卷宗 · ${candidates.length} 条修订候选 · ${supported} 条确认支持 · ${state.keyMoments.length} 条仿真记录`);
      const cl = document.querySelector(".change-list");
      if (cl) cl.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  // ============================================================
  // Stage i: 4 步选择向导（课程 / 班级 / 课时 / 章节）
  // Mock 数据 + 单选 + 联动 + localStorage 持久化
  // 选择是 canonical source；hero meta 与 pack-preview 由它驱动
  // ============================================================
  const WIZ_STORE_KEY = "pp.practice.wizardSelection";
  const WIZ_DEFAULT_VERSION_KEY = "pp.practice.wizardSelection.defaultVersion";
  const WIZ_DEFAULT_VERSION = "management-swot-v1";
  const WIZ_DEFAULT_SELECTION = Object.freeze({
    course: "management-principles",
    class: "2025-pm-1",
    session: "mp-w05",
    chapter: "mp-ch3-environment",
  });

  const SEMESTER_WEEKS = 18;
  const PHARMACY_MANAGEMENT_COHORTS = Object.freeze({
    "2023": Object.freeze([
      { id: "2023-pm-1", title: "2023 级药事管理 1 班", n: 31 },
      { id: "2023-pm-2", title: "2023 级药事管理 2 班", n: 30 },
    ]),
    "2024": Object.freeze([
      { id: "2024-pm-1", title: "2024 级药事管理 1 班", n: 34 },
      { id: "2024-pm-2", title: "2024 级药事管理 2 班", n: 32 },
    ]),
    "2025": Object.freeze([
      { id: "2025-pm-1", title: "2025 级药事管理 1 班", n: 33 },
      { id: "2025-pm-2", title: "2025 级药事管理 2 班", n: 31 },
    ]),
  });

  function buildSemesterSessions({ prefix, weekday, periods, min, chapterIds }) {
    const plan = chapterIds.flatMap((chapterId) => [chapterId, chapterId]);
    if (plan.length !== SEMESTER_WEEKS) throw new Error(`${prefix} 课程必须配置 9 个双周教学单元`);
    return Array.from({ length: SEMESTER_WEEKS }, (_, index) => {
      const week = index + 1;
      const finalMark = week === SEMESTER_WEEKS ? "（期末周）" : "";
      return {
        id: `${prefix}-w${String(week).padStart(2, "0")}`,
        title: `第 ${week} 周${finalMark} · ${weekday} ${periods} 节`,
        min,
        week,
        chapterId: plan[index],
      };
    });
  }

  // 课程→班级、课时、章节 的依赖映射
  const WIZ_DATA = {
    courses: [
      { id: "pharm-admin",           title: "《药事管理学》",     level: "本科",     cohort: "2024 级" },
      { id: "clinical-pharm",        title: "《临床药学》",       level: "本科",     cohort: "2023 级" },
      { id: "pharm-regulation",      title: "《药事法规与监管》", level: "本科",     cohort: "2024 级" },
      { id: "management-principles", title: "《管理学原理》",     level: "本科",     cohort: "2025 级" },
      { id: "pharmacy-retail",       title: "《药店经营管理》",   level: "本科",     cohort: "2023 级" },
      { id: "gxp-practicum",         title: "《GXP实训》",        level: "本科实训", cohort: "2023 级" },
    ],
    classesByCourse: {
      "pharm-admin": PHARMACY_MANAGEMENT_COHORTS["2024"],
      "clinical-pharm": PHARMACY_MANAGEMENT_COHORTS["2023"],
      "pharm-regulation": PHARMACY_MANAGEMENT_COHORTS["2024"],
      "management-principles": PHARMACY_MANAGEMENT_COHORTS["2025"],
      "pharmacy-retail": PHARMACY_MANAGEMENT_COHORTS["2023"],
      "gxp-practicum": PHARMACY_MANAGEMENT_COHORTS["2023"],
    },
    sessionsByCourse: {
      "pharm-admin": buildSemesterSessions({
        prefix: "pa", weekday: "周三", periods: "3-4", min: 90,
        chapterIds: ["ch1-overview", "ch2-rd", "ch3-registration", "ch4-gmp", "ch5-procurement", "ch6-supervision", "ch7-distribution", "ch8-payment", "ch9-summary"],
      }),
      "clinical-pharm": buildSemesterSessions({
        prefix: "cp", weekday: "周二", periods: "1-2", min: 90,
        chapterIds: ["cl-ch1-intro", "cl-ch2-amr", "cl-ch3-tdm", "cl-ch4-interaction", "cl-ch5-doseopt", "cl-ch6-special", "cl-ch7-adr", "cl-ch8-service", "cl-ch9-summary"],
      }),
      "pharm-regulation": buildSemesterSessions({
        prefix: "rg", weekday: "周五", periods: "5-6", min: 90,
        chapterIds: ["rg-ch1-system", "rg-ch2-registration", "rg-ch3-newdrug", "rg-ch4-gmp-gsp", "rg-ch5-safety", "rg-ch6-pv", "rg-ch7-postmarket", "rg-ch8-science", "rg-ch9-summary"],
      }),
      "management-principles": buildSemesterSessions({
        prefix: "mp", weekday: "周一", periods: "1-2", min: 90,
        chapterIds: ["mp-ch1-intro", "mp-ch2-theory", "mp-ch3-environment", "mp-ch4-decision", "mp-ch5-planning", "mp-ch6-organization", "mp-ch7-staffing", "mp-ch8-leadership", "mp-ch9-control-innovation"],
      }),
      "pharmacy-retail": buildSemesterSessions({
        prefix: "rm", weekday: "周四", periods: "1-2", min: 90,
        chapterIds: ["rm-ch1-format", "rm-ch2-location", "rm-ch3-category", "rm-ch4-inventory", "rm-ch5-service", "rm-ch6-chronic", "rm-ch7-compliance", "rm-ch8-performance", "rm-ch9-summary"],
      }),
      "gxp-practicum": buildSemesterSessions({
        prefix: "gxp", weekday: "周四", periods: "1-4", min: 180,
        chapterIds: ["gxp-ch1-system", "gxp-ch2-doc", "gxp-ch3-first", "gxp-ch4-accept", "gxp-ch5-cold", "gxp-ch6-sales", "gxp-ch7-capa", "gxp-ch8-inspection", "gxp-ch9-summary"],
      }),
    },
    chaptersByCourse: {
      "pharm-admin": [
        { id: "ch1-overview",    title: "第 1 章 · 总论",         topic: "药事管理学科定位" },
        { id: "ch2-rd",          title: "第 2 章 · 药品研发管理",  topic: "新药开发策略与立项" },
        { id: "ch3-registration",title: "第 3 章 · 药品注册管理",  topic: "注册分类与审评路径" },
        { id: "ch4-gmp",         title: "第 4 章 · GMP 与质量体系", topic: "GMP 实施案例" },
        { id: "ch5-procurement", title: "第 5 章 · 集采制度",      topic: "集采后仿制药替代" },
        { id: "ch6-supervision", title: "第 6 章 · 药品监管",      topic: "上市后再评价" },
        { id: "ch7-distribution",title: "第 7 章 · 药品流通管理",  topic: "GSP 与冷链追溯" },
        { id: "ch8-payment",     title: "第 8 章 · 医保支付",      topic: "DRG/DIP 与处方行为" },
        { id: "ch9-summary",     title: "课程总结 · 综合案例",     topic: "药事管理综合决策与期末考核" },
      ],
      "clinical-pharm": [
        { id: "cl-ch1-intro",    title: "第 1 章 · 临床药学概论",  topic: "学科与角色定位" },
        { id: "cl-ch2-amr",      title: "第 2 章 · 抗菌药物管理",  topic: "抗菌药物分级管理" },
        { id: "cl-ch3-tdm",      title: "第 3 章 · 治疗药物监测",  topic: "TDM 应用案例" },
        { id: "cl-ch4-interaction", title: "第 4 章 · 药物相互作用", topic: "DDI 识别与处理" },
        { id: "cl-ch5-doseopt",  title: "第 5 章 · 个体化给药",    topic: "TDM 与剂量优化" },
        { id: "cl-ch6-special",  title: "第 6 章 · 特殊人群用药",  topic: "妊娠/儿童/老年用药" },
        { id: "cl-ch7-adr",      title: "第 7 章 · 药物不良反应",  topic: "ADR 监测与上报" },
        { id: "cl-ch8-service",  title: "第 8 章 · 药学服务",      topic: "MTM 与患者教育" },
        { id: "cl-ch9-summary",  title: "课程总结 · 综合病例",     topic: "药学服务方案与期末考核" },
      ],
      "pharm-regulation": [
        { id: "rg-ch1-system",   title: "第 1 章 · 法规体系总论",  topic: "药事法规框架" },
        { id: "rg-ch2-registration", title: "第 2 章 · 药品注册与审评", topic: "注册法规演进" },
        { id: "rg-ch3-newdrug",  title: "第 3 章 · 新药审评",      topic: "技术审评要点" },
        { id: "rg-ch4-gmp-gsp",  title: "第 4 章 · GMP/GSP 监管",  topic: "现场检查与缺陷判定" },
        { id: "rg-ch5-safety",   title: "第 5 章 · 药品安全监管",  topic: "风险管理与应急" },
        { id: "rg-ch6-pv",       title: "第 6 章 · 药物警戒",      topic: "PV 体系构建" },
        { id: "rg-ch7-postmarket", title: "第 7 章 · 上市后再评价", topic: "真实世界证据" },
        { id: "rg-ch8-science",  title: "第 8 章 · 监管科学方法",  topic: "监管科学前沿" },
        { id: "rg-ch9-summary",  title: "课程总结 · 综合监管案例", topic: "法规检索、适用与期末考核" },
      ],
      "management-principles": [
        { id: "mp-ch1-intro",              title: "第 1 章 · 管理与管理学",             topic: "管理的内涵、职能与管理者技能" },
        { id: "mp-ch2-theory",             title: "第 2 章 · 管理理论的产生与发展",     topic: "古典、行为科学与现代管理理论" },
        { id: "mp-ch3-environment",        title: "第 3 章 · 管理环境与战略分析",       topic: "医药组织环境分析与 SWOT/TOWS" },
        { id: "mp-ch4-decision",           title: "第 4 章 · 决策",                     topic: "决策过程、有限理性与决策方法" },
        { id: "mp-ch5-planning",           title: "第 5 章 · 计划",                     topic: "计划编制、目标管理与实施" },
        { id: "mp-ch6-organization",       title: "第 6 章 · 组织设计与组织变革",       topic: "医药组织结构、权责配置与变革" },
        { id: "mp-ch7-staffing",           title: "第 7 章 · 人员配备与人力资源管理",   topic: "医药岗位配置、培训与绩效评价" },
        { id: "mp-ch8-leadership",         title: "第 8 章 · 领导、激励与沟通",         topic: "情境领导、激励机制与跨部门沟通" },
        { id: "mp-ch9-control-innovation", title: "第 9 章 · 控制、风险与创新",         topic: "质量控制、合规风险与组织创新" },
      ],
      "pharmacy-retail": [
        { id: "rm-ch1-format",      title: "第 1 章 · 药店业态与定位", topic: "零售药店经营模式" },
        { id: "rm-ch2-location",    title: "第 2 章 · 选址与商圈",     topic: "商圈评估与门店选址" },
        { id: "rm-ch3-category",    title: "第 3 章 · 品类与采购",     topic: "品类结构与供应商管理" },
        { id: "rm-ch4-inventory",   title: "第 4 章 · 陈列与库存",     topic: "陈列优化与库存周转" },
        { id: "rm-ch5-service",     title: "第 5 章 · 销售与顾客服务", topic: "合理用药咨询与服务转化" },
        { id: "rm-ch6-chronic",     title: "第 6 章 · 慢病与会员管理", topic: "慢病随访与会员分层" },
        { id: "rm-ch7-compliance",  title: "第 7 章 · 质量与合规经营", topic: "处方药销售与 GSP 合规" },
        { id: "rm-ch8-performance", title: "第 8 章 · 财务与绩效",     topic: "毛利率、周转率与服务质量平衡" },
        { id: "rm-ch9-summary",     title: "课程总结 · 门店经营方案", topic: "药店经营综合决策与期末考核" },
      ],
      "gxp-practicum": [
        { id: "gxp-ch1-system",     title: "项目 1 · GXP 体系与实训安全", topic: "GXP 规范边界与岗位职责" },
        { id: "gxp-ch2-doc",        title: "项目 2 · GMP 文件管理",      topic: "SOP 审核与批记录填写" },
        { id: "gxp-ch3-first",      title: "项目 3 · GSP 首营审核",      topic: "首营企业与品种资质审核" },
        { id: "gxp-ch4-accept",     title: "项目 4 · 收货验收与储存",    topic: "验收、拒收与分区管理" },
        { id: "gxp-ch5-cold",       title: "项目 5 · 冷链与温湿度",      topic: "冷链偏差识别与处置" },
        { id: "gxp-ch6-sales",      title: "项目 6 · 销售与处方审核",    topic: "处方药销售合规" },
        { id: "gxp-ch7-capa",       title: "项目 7 · 偏差与 CAPA",       topic: "根因分析与 CAPA 闭环" },
        { id: "gxp-ch8-inspection", title: "项目 8 · 综合飞检模拟",      topic: "飞检缺陷判定与整改" },
        { id: "gxp-ch9-summary",    title: "项目 9 · 综合实训考核",      topic: "GXP 全流程操作与期末考核" },
      ],
    },
  };

  let wizSelection = { course: null, class: null, session: null, chapter: null };

  function loadWizSelection() {
    try {
      if (localStorage.getItem(WIZ_DEFAULT_VERSION_KEY) !== WIZ_DEFAULT_VERSION) {
        wizSelection = { ...wizSelection, ...WIZ_DEFAULT_SELECTION };
        return;
      }
      const s = JSON.parse(localStorage.getItem(WIZ_STORE_KEY) || "{}");
      if (s && typeof s === "object") wizSelection = { ...wizSelection, ...s };
    } catch {}
  }
  function saveWizSelection() {
    try {
      localStorage.setItem(WIZ_STORE_KEY, JSON.stringify(wizSelection));
      localStorage.setItem(WIZ_DEFAULT_VERSION_KEY, WIZ_DEFAULT_VERSION);
    } catch {}
  }

  function chaptersForSession(courseId, sessionId) {
    const chapters = WIZ_DATA.chaptersByCourse[courseId] || [];
    const session = (WIZ_DATA.sessionsByCourse[courseId] || []).find((item) => item.id === sessionId);
    if (!session?.chapterId) return [];
    const chapter = chapters.find((item) => item.id === session.chapterId);
    return chapter ? [chapter] : [];
  }

  function ensureWizardDependents(courseId, preferred = {}) {
    const classes = WIZ_DATA.classesByCourse[courseId] || [];
    const sessions = WIZ_DATA.sessionsByCourse[courseId] || [];
    if (!classes.find((item) => item.id === wizSelection.class)) {
      wizSelection.class = classes.find((item) => item.id === preferred.class)?.id || classes[0]?.id || null;
    }
    if (!sessions.find((item) => item.id === wizSelection.session)) {
      wizSelection.session = sessions.find((item) => item.id === preferred.session)?.id || sessions[0]?.id || null;
    }
    const chapters = chaptersForSession(courseId, wizSelection.session);
    if (!chapters.find((item) => item.id === wizSelection.chapter)) {
      wizSelection.chapter = chapters[0]?.id || null;
    }
  }

  function mountPackWizard() {
    const wiz = document.getElementById("packWizard");
    if (!wiz) return;
    loadWizSelection();

    function chipsOf(group) { return wiz.querySelector(`.wiz-group[data-wiz="${group}"] .wiz-chips`); }
    // 选项 chip 既是视觉态也是可达控件：同步 is-active 与 aria-pressed
    function setChipActive(el, active) {
      el.classList.toggle("is-active", active);
      el.setAttribute("aria-pressed", String(active));
    }
    function renderChips(group, items, opts = {}) {
      const root = chipsOf(group);
      if (!root) return;
      root.innerHTML = "";
      if (!items.length) {
        root.innerHTML = `<span class="wiz-chip is-disabled" aria-disabled="true">（${opts.emptyLabel || "请先选课程"}）</span>`;
        return;
      }
      items.forEach((it) => {
        const chip = document.createElement("span");
        const active = wizSelection[group] === it.id;
        const disabled = !!(opts.disabledOf && opts.disabledOf(it));
        chip.className = "wiz-chip" + (active ? " is-active" : "") + (disabled ? " is-locked" : "");
        chip.dataset.val = it.id;
        const meta = opts.metaOf ? opts.metaOf(it) : "";
        chip.innerHTML = `<span class="wiz-chip-main">${it.title}</span>` + (meta ? ` <small>${meta}</small>` : "");
        chip.setAttribute("role", "button");
        if (disabled) {
          chip.tabIndex = -1;
          chip.setAttribute("aria-disabled", "true");
          chip.setAttribute("aria-label", `${it.title}：非本课时章节，已锁定`);
        } else {
          chip.tabIndex = 0;
          chip.setAttribute("aria-pressed", String(active));
          chip.addEventListener("click", () => onPick(group, it.id));
          chip.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") { e.preventDefault(); onPick(group, it.id); }
          });
        }
        root.appendChild(chip);
      });
    }

    function renderChapterChoices(courseId) {
      const allChapters = WIZ_DATA.chaptersByCourse[courseId] || [];
      const availableChapterIds = new Set(chaptersForSession(courseId, wizSelection.session).map((item) => item.id));
      renderChips("chapter", allChapters, {
        emptyLabel: "请先选课时",
        disabledOf: (item) => !availableChapterIds.has(item.id),
        metaOf: (item) => availableChapterIds.has(item.id) ? "本课时" : "锁定",
      });
    }

    function refreshDependent() {
      const c = wizSelection.course;
      renderChips("class", c ? (WIZ_DATA.classesByCourse[c] || []) : [], { metaOf: (it) => `${it.n} 人` });
      renderChips("session", c ? (WIZ_DATA.sessionsByCourse[c] || []) : [], { metaOf: (it) => `${it.min} min` });
      if (c) renderChapterChoices(c);
      else renderChips("chapter", [], { emptyLabel: "请先选课时" });
    }

    function onPick(group, id) {
      wizSelection[group] = id;
      // 切换课程时同步校验班级 / 课时 / 章节，避免跨课程残留不相干选项
      if (group === "course") {
        ensureWizardDependents(id);
        refreshDependent();
        // refreshDependent 后重新打高亮
        ["class", "session", "chapter"].forEach((g) => {
          const r = chipsOf(g);
          if (r) r.querySelectorAll(".wiz-chip").forEach((el) => {
            setChipActive(el, el.dataset.val === wizSelection[g]);
          });
        });
      } else if (group === "session") {
        const chapters = chaptersForSession(wizSelection.course, id);
        wizSelection.chapter = chapters[0]?.id || null;
        renderChapterChoices(wizSelection.course);
        const chapterRoot = chipsOf("chapter");
        if (chapterRoot) chapterRoot.querySelectorAll(".wiz-chip").forEach((el) => {
          setChipActive(el, el.dataset.val === wizSelection.chapter);
        });
      }
      saveWizSelection();
      // 重绘当前组高亮
      const root = chipsOf(group);
      if (root) root.querySelectorAll(".wiz-chip").forEach((el) => {
        setChipActive(el, el.dataset.val === id);
      });
      syncToHeroAndPreview();
    }

    // 初始绘制
    renderChips("course", WIZ_DATA.courses, { metaOf: (it) => `${it.level} · ${it.cohort}` });

    // 默认选中；同时清理旧版本遗留的跨课程选择值
    if (!WIZ_DATA.courses.find((x) => x.id === wizSelection.course)) wizSelection.course = WIZ_DEFAULT_SELECTION.course;
    const defaults = { class: WIZ_DEFAULT_SELECTION.class, session: WIZ_DEFAULT_SELECTION.session };
    ensureWizardDependents(wizSelection.course, defaults);
    refreshDependent();
    saveWizSelection();
    // 同步默认高亮
    ["course", "class", "session", "chapter"].forEach((g) => {
      const r = chipsOf(g);
      if (r) r.querySelectorAll(".wiz-chip").forEach((el) => {
        setChipActive(el, el.dataset.val === wizSelection[g]);
      });
    });
    syncToHeroAndPreview();
  }

  function getSelected(group) {
    const id = wizSelection[group];
    if (!id) return null;
    if (group === "course")  return WIZ_DATA.courses.find((x) => x.id === id);
    if (group === "session") return (WIZ_DATA.sessionsByCourse[wizSelection.course] || []).find((x) => x.id === id);
    if (group === "class")   return (WIZ_DATA.classesByCourse[wizSelection.course] || []).find((x) => x.id === id);
    if (group === "chapter") return chaptersForSession(wizSelection.course, wizSelection.session).find((x) => x.id === id);
    return null;
  }

  // ============================================================
  // 设计摘要与完整实践包分层持久化：摘要是生成输入，完整实践包是模型产物。
  // ============================================================
  const PACK_EDITS_KEY = "pp.practice.packEdits";
  const PACK_OUTPUTS_KEY = "pp.practice.generatedPacks.v1";
  const PACK_GENERATION_META_KEY = "pp.practice.packGenerationMeta";
  const PACK_REVISION_KEY = "pp.practice.packRevision.v1";
  const PACK_KEYS = Object.freeze(["env01","env02","env03","env04","env05","env06","env07","env08","env09"]);
  function loadAllPackEdits() {
    try { return JSON.parse(localStorage.getItem(PACK_EDITS_KEY) || "{}"); }
    catch { return {}; }
  }
  function loadPackEdits(chapterId) {
    const all = loadAllPackEdits();
    return all[chapterId] || {};
  }
  function loadAllPackRevisions() {
    try {
      const value = JSON.parse(localStorage.getItem(PACK_REVISION_KEY) || "{}");
      return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    } catch { return {}; }
  }
  function getPackRevision(chapterId) {
    const revision = Number(loadAllPackRevisions()[chapterId] || 0);
    return Number.isInteger(revision) && revision >= 0 ? revision : 0;
  }
  function bumpPackRevision(chapterId) {
    if (!chapterId) return 0;
    const all = loadAllPackRevisions();
    const next = getPackRevision(chapterId) + 1;
    all[chapterId] = next;
    try { localStorage.setItem(PACK_REVISION_KEY, JSON.stringify(all)); } catch {}
    global.dispatchEvent(new CustomEvent("pharmaco:pack-revision", { detail: { chapterId, revision: next } }));
    refreshReviewFreshness(chapterId);
    return next;
  }
  function savePackEdit(chapterId, fieldKey, html, { bump = true } = {}) {
    const all = loadAllPackEdits();
    if (!all[chapterId]) all[chapterId] = {};
    all[chapterId][fieldKey] = html;
    try { localStorage.setItem(PACK_EDITS_KEY, JSON.stringify(all)); } catch {}
    if (bump) bumpPackRevision(chapterId);
  }
  function loadAllGeneratedPacks() {
    try {
      const value = JSON.parse(localStorage.getItem(PACK_OUTPUTS_KEY) || "{}");
      return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    } catch { return {}; }
  }
  function loadGeneratedPack(chapterId) {
    return loadAllGeneratedPacks()[chapterId] || null;
  }
  function saveGeneratedSection(chapterId, fieldKey, text, { bump = true } = {}) {
    if (!chapterId || !PACK_KEYS.includes(fieldKey)) return;
    const all = loadAllGeneratedPacks();
    if (!all[chapterId]) all[chapterId] = {};
    all[chapterId][fieldKey] = String(text || "").trim();
    try { localStorage.setItem(PACK_OUTPUTS_KEY, JSON.stringify(all)); } catch {}
    if (bump) bumpPackRevision(chapterId);
  }
  function saveGeneratedPack(chapterId, pack, metadata, previousPack = null) {
    const all = loadAllGeneratedPacks();
    all[chapterId] = Object.fromEntries(PACK_KEYS.map((key) => [key, String(pack[key] || "").trim()]));
    try { localStorage.setItem(PACK_OUTPUTS_KEY, JSON.stringify(all)); } catch {}
    try {
      const allMeta = JSON.parse(localStorage.getItem(PACK_GENERATION_META_KEY) || "{}");
      allMeta[chapterId] = metadata;
      localStorage.setItem(PACK_GENERATION_META_KEY, JSON.stringify(allMeta));
    } catch {}
    const changed = !previousPack || PACK_KEYS.some((key) => String(previousPack[key] || "").trim() !== String(pack[key] || "").trim());
    if (changed) bumpPackRevision(chapterId);
  }
  function loadPackGenerationMeta(chapterId) {
    try {
      const allMeta = JSON.parse(localStorage.getItem(PACK_GENERATION_META_KEY) || "{}");
      return allMeta[chapterId] || null;
    } catch { return null; }
  }
  function currentPackFromPreview() {
    const preview = document.querySelector(".pack-preview");
    if (!preview) return null;
    const pack = {};
    for (const key of PACK_KEYS) {
      const body = preview.querySelector(`.body[data-pack-field="${key}"]`);
      const value = body?.textContent?.trim() || "";
      if (!value) return null;
      pack[key] = value;
    }
    return pack;
  }
  function currentDesignBriefs() {
    const summary = document.querySelector(".design-summary");
    if (!summary) return null;
    const briefs = {};
    for (const key of PACK_KEYS) {
      const body = summary.querySelector(`[data-brief-field="${key}"]`);
      const value = body?.textContent?.trim() || "";
      if (!value) return null;
      briefs[key] = value;
    }
    return briefs;
  }
  function validGeneratedPack(pack) {
    return !!pack && PACK_KEYS.every((key) => typeof pack[key] === "string" && pack[key].trim());
  }
  function refreshPackWorkspaceControls() {
    const chapterId = wizSelection.chapter;
    const hasOutput = !!chapterId && validGeneratedPack(loadGeneratedPack(chapterId));
    const returnButton = document.querySelector("[data-pack-return-output]");
    const generateButton = document.getElementById("inline-generate-pack");
    if (returnButton) returnButton.hidden = !hasOutput;
    if (generateButton && generateButton.dataset.generating !== "1") {
      generateButton.textContent = hasOutput ? "根据修改重新生成 ↓" : "生成完整实践包 ↓";
    }
  }
  function applyPackWorkspaceView(view) {
    const workspace = document.querySelector("[data-pack-workspace]");
    if (!workspace || !["briefs", "generating", "output"].includes(view)) return;
    workspace.dataset.packView = view;
    workspace.setAttribute("aria-busy", view === "generating" ? "true" : "false");
    workspace.querySelectorAll("[data-pack-panel]").forEach((panel) => {
      const active = panel.dataset.packPanel === view;
      panel.hidden = !active;
      panel.inert = !active;
      panel.setAttribute("aria-hidden", active ? "false" : "true");
    });
    refreshPackWorkspaceControls();
  }
  function transitionPackWorkspace(view, { focus = false } = {}) {
    const workspace = document.querySelector("[data-pack-workspace]");
    if (!workspace) return Promise.resolve();
    const targetPanel = workspace.querySelector(`[data-pack-panel="${view}"]`);
    const focusTarget = targetPanel?.querySelector("h4");
    if (workspace.dataset.packView === view && !targetPanel?.hidden) {
      refreshPackWorkspaceControls();
      if (focus) focusTarget?.focus({ preventScroll: true });
      return Promise.resolve();
    }

    const reduceMotion = global.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    const commit = () => applyPackWorkspaceView(view);
    let transition = null;
    let fallbackAnimated = false;
    workspace.classList.add("is-switching");
    if (!reduceMotion && typeof document.startViewTransition === "function") {
      try { transition = document.startViewTransition(commit); }
      catch { commit(); }
    } else {
      commit();
      if (!reduceMotion && targetPanel) {
        targetPanel.classList.remove("is-entering");
        void targetPanel.offsetWidth;
        targetPanel.classList.add("is-entering");
        fallbackAnimated = true;
      }
    }
    const finished = transition?.finished
      || (fallbackAnimated ? new Promise((resolve) => global.setTimeout(resolve, 400)) : Promise.resolve());
    return finished.catch(() => {}).then(() => {
      workspace.classList.remove("is-switching");
      targetPanel?.classList.remove("is-entering");
      if (focus) focusTarget?.focus({ preventScroll: true });
    });
  }
  async function generatePracticePackWithLocalModel(button) {
    if (button.dataset.generating === "1") return;
    const course = getSelected("course");
    const klass = getSelected("class");
    const session = getSelected("session");
    const chapter = getSelected("chapter");
    const designBriefs = currentDesignBriefs();
    if (!course || !klass || !session || !chapter || !designBriefs) {
      toast("请先完成课程、班级、课时和章节选择");
      return;
    }
    if (!global.PharmacoBackend?.generatePracticePack) {
      toast("本地后端未连接 · 设计摘要已保留");
      return;
    }

    const requestedChapterId = chapter.id;
    button.dataset.generating = "1";
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    button.textContent = "本机 Qwen 生成中…";
    const workspace = document.querySelector("[data-pack-workspace]");
    if (workspace) workspace.dataset.packChapter = requestedChapterId;
    const generationContext = document.querySelector("[data-pack-generation-context]");
    if (generationContext) {
      generationContext.textContent = `${chapter.title} · ${chapter.topic} · 九环节结构生成中；摘要已保留。`;
    }
    transitionPackWorkspace("generating", { focus: true });
    setStageStatus("i", "本机 Qwen 正在展开完整课堂实践包", true, false);
    toast("已提交本机 Qwen · 正在把九项设计摘要展开为完整实践包");

    try {
      const result = await global.PharmacoBackend.generatePracticePack({
        context: {
          chapterId: chapter.id,
          courseTitle: course.title,
          courseLevel: course.level || "",
          classTitle: klass.title,
          studentCount: klass.n,
          sessionTitle: session.title,
          durationMinutes: session.min,
          chapterTitle: chapter.title,
          topic: chapter.topic,
        },
        designBriefs,
      });
      if (!validGeneratedPack(result?.pack)) throw new Error("本地模型返回的实践包不完整");
      saveGeneratedPack(requestedChapterId, result.pack, {
        source: "local-model",
        model: result.model || "Qwen3.5-9B-4bit",
        generatedAt: result.generatedAt || new Date().toISOString(),
      }, loadGeneratedPack(requestedChapterId));

      if (wizSelection.chapter === requestedChapterId) {
        syncToHeroAndPreview({ packView: "output" });
        setStageStatus("i", "本机 Qwen 实践包已生成", false, true);
        toast("完整课堂实践包已生成 · 可编辑、下载或进入 ii 段试错");
      } else {
        setStageStatus("i", "实践包已保存到原章节", false, true);
        toast(`实践包已保存到「${chapter.title}」· 当前章节未被覆盖`);
      }
    } catch (error) {
      console.warn("[practice-runtime] 本地模型生成失败", error);
      setStageStatus("i", "本地模型不可用 · 设计摘要已保留", false, true);
      const detail = error?.code === "MODEL_OUTPUT_INVALID"
        ? "模型输出未通过九环节校验"
        : "本地后端或模型尚未就绪";
      toast(`${detail} · 已保留当前设计摘要`);
      if (wizSelection.chapter === requestedChapterId) transitionPackWorkspace("briefs", { focus: true });
    } finally {
      button.dataset.generating = "0";
      button.disabled = false;
      button.removeAttribute("aria-busy");
      refreshPackWorkspaceControls();
    }
  }
  function selectedPracticeContext() {
    const course = getSelected("course");
    const klass = getSelected("class");
    const session = getSelected("session");
    const chapter = getSelected("chapter");
    if (!course || !klass || !session || !chapter) return null;
    return {
      chapterId: chapter.id,
      courseTitle: course.title,
      courseLevel: course.level || "",
      classTitle: klass.title,
      studentCount: klass.n,
      sessionTitle: session.title,
      durationMinutes: session.min,
      chapterTitle: chapter.title,
      topic: chapter.topic,
    };
  }
  async function regeneratePracticeSection(button) {
    if (button.dataset.generating === "1") return;
    const targetEnv = button.dataset.packRegenerate;
    const context = selectedPracticeContext();
    const designBriefs = currentDesignBriefs();
    const generatedPack = currentPackFromPreview();
    if (!PACK_KEYS.includes(targetEnv) || !context || !designBriefs || !generatedPack) {
      toast("当前完整实践包不完整，无法单独重新生成");
      return;
    }
    if (!global.PharmacoBackend?.generatePracticePack) {
      toast("本地后端未连接 · 当前实践包未改变");
      return;
    }
    const originalText = button.textContent;
    button.dataset.generating = "1";
    button.disabled = true;
    button.textContent = "生成中…";
    setStageStatus("i", `${PRACTICE_ENV_BY_KEY[targetEnv]?.short || targetEnv}正在重新生成`, true, false);
    try {
      const result = await global.PharmacoBackend.generatePracticePack({ context, designBriefs, generatedPack, targetEnv });
      const section = result?.pack?.[targetEnv];
      if (typeof section !== "string" || !section.trim()) throw new Error("本地模型没有返回指定环节");
      const merged = { ...generatedPack, [targetEnv]: section.trim() };
      saveGeneratedPack(context.chapterId, merged, {
        source: "local-model",
        model: result.model || "Qwen3.5-9B-4bit",
        generatedAt: result.generatedAt || new Date().toISOString(),
        lastRegeneratedEnv: targetEnv,
      }, generatedPack);
      syncToHeroAndPreview();
      setStageStatus("i", `${PRACTICE_ENV_BY_KEY[targetEnv]?.short || targetEnv}已重新生成`, false, true);
      toast(`${PRACTICE_ENV_BY_KEY[targetEnv]?.short || targetEnv}已重新生成 · 其余环节保持不变`);
    } catch (error) {
      console.warn("[practice-runtime] 单环节重新生成失败", error);
      setStageStatus("i", "单环节生成失败 · 当前版本已保留", false, true);
      toast("单环节重新生成失败 · 当前实践包未改变");
    } finally {
      button.dataset.generating = "0";
      button.disabled = false;
      button.textContent = originalText;
    }
  }
  async function exportPracticePack(button) {
    const format = button.dataset.packExport;
    const context = selectedPracticeContext();
    const pack = currentPackFromPreview();
    const metadata = context ? loadPackGenerationMeta(context.chapterId) : null;
    const status = document.querySelector(".pack-preview .pack-export-status");
    if (!context || !pack || !validGeneratedPack(pack)) {
      toast("请先生成完整课堂实践包");
      return;
    }
    const buttons = Array.from(document.querySelectorAll("[data-pack-export]"));
    buttons.forEach((item) => { item.disabled = true; });
    if (status) status.textContent = "正在准备下载…";
    try {
      await ensurePracticeExportModule();
      const filename = await global.PharmacoPracticeExport.exportFormat(format, { context, pack, metadata }, (text) => {
        if (status) status.textContent = text;
      });
      if (status) status.textContent = `已生成 ${filename}`;
      toast(`实践包已下载 · ${String(format).toUpperCase()}`);
    } catch (error) {
      console.error("[practice-runtime] 实践包导出失败", error);
      if (status) status.textContent = "导出失败 · 当前实践包未改变";
      toast("实践包导出失败，请重试");
    } finally {
      buttons.forEach((item) => { item.disabled = false; });
    }
  }
  let practiceExportLoadPromise = null;
  function ensurePracticeExportModule() {
    if (global.PharmacoPracticeExport?.exportFormat) return Promise.resolve(global.PharmacoPracticeExport);
    if (practiceExportLoadPromise) return practiceExportLoadPromise;
    practiceExportLoadPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "./dist/practice-export.bundle.js?v=3-pdf-pagination";
      script.async = true;
      script.onload = () => global.PharmacoPracticeExport?.exportFormat
        ? resolve(global.PharmacoPracticeExport)
        : reject(new Error("实践包下载模块未初始化"));
      script.onerror = () => reject(new Error("实践包下载模块加载失败"));
      document.head.appendChild(script);
    }).catch((error) => {
      practiceExportLoadPromise = null;
      throw error;
    });
    return practiceExportLoadPromise;
  }
  function wirePackEdits(previewRoot, chapterId) {
    previewRoot.querySelectorAll(".pack-item .body[contenteditable=true]").forEach((el) => {
      if (el.dataset.packBound === "1") return;
      el.dataset.packBound = "1";
      el.addEventListener("focus", () => { el.dataset.packOriginalHtml = el.innerHTML.trim(); });
      el.addEventListener("blur", () => {
        const field = el.dataset.packField;
        if (!field) return;
        // 关键：用当前选中的章节，而非首次绑定时的 chapterId（闭包陷阱）
        const curChapter = wizSelection.chapter;
        if (!curChapter) return;
        const txt = el.innerHTML.trim();
        const changed = txt !== (el.dataset.packOriginalHtml ?? txt);
        saveGeneratedSection(curChapter, field, txt, { bump: changed });
        el.dataset.packOriginalHtml = txt;
        // blur 后重新计数（按 · 分割）
        const n = el.textContent.split(/[·；;]/).map((s) => s.trim()).filter(Boolean).length;
        const cnt = el.closest(".pack-item")?.querySelector(".env-count");
        if (cnt) cnt.textContent = n > 0 ? `${n} 条` : "";
        const label = field.startsWith("env")
          ? `环节 ${field.replace("env","").replace(/^0/,"")}`
          : field;
        toast(`已保存 · ${label} (${n} 条)`);
      });
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && e.ctrlKey) { e.preventDefault(); el.blur(); }
      });
    });
  }
  function wireDesignBriefEdits(summaryRoot) {
    summaryRoot.querySelectorAll("[data-brief-field]").forEach((el) => {
      if (el.dataset.briefBound === "1") return;
      el.dataset.briefBound = "1";
      el.setAttribute("contenteditable", "true");
      el.addEventListener("focus", () => { el.dataset.briefOriginal = el.textContent.trim(); });
      el.addEventListener("blur", () => {
        const chapterId = wizSelection.chapter;
        const field = el.dataset.briefField;
        const text = el.textContent.trim();
        if (!chapterId || !field || !text) return;
        const changed = text !== (el.dataset.briefOriginal || "");
        savePackEdit(chapterId, field, text, { bump: false });
        if (changed) toast(`设计摘要已保存 · ${PRACTICE_ENV_BY_KEY[field]?.short || field}`);
      });
      el.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && event.ctrlKey) { event.preventDefault(); el.blur(); }
      });
    });
  }

  // ============================================================
  // 九环节设计摘要 builder：这些文本是给本地模型的可编辑生成要求，不是实践包成品。
  // ============================================================
  function buildEnvPackContent(chapter, mock) {
    // 主题属于实践包的关键信息，允许卡片自然换行，不在内容层提前截断。
    const topic = String(chapter.topic || chapter.title || "").trim() || "本章主题";
    const sp = (str) => (str || "").split(/[·；;]/).map((s) => s.trim()).filter(Boolean);
    const tasks  = sp(mock.tasks);
    const roles  = sp(mock.roles);
    const rubric = sp(mock.rubric);
    const cites  = sp(mock.citations);
    const taskSeed = tasks.slice(0, 3).join("；") || `围绕「${topic}」形成递进任务`;
    const roleSeed = roles.slice(0, 4).join("、") || "教师、学生与真实利益相关者";
    const rubricSeed = rubric.slice(0, 4).join("、") || "概念准确、证据引用、论证质量与反思迁移";
    const sourceSeed = cites.slice(0, 5).join("、") || "教材本章、教师提供的政策原文与案例材料";
    return {
      env01: `分析本班学生对「${topic}」的先验认知、常见误解与学习起点；给出可在课前或课堂开场完成的诊断方式，不虚构学生表现。`,
      env02: `围绕「${topic}」生成 2–3 个可观察学习结果；为每项结果匹配课堂产出、评价证据与判定标准。评价重点参考：${rubricSeed}。`,
      env03: `梳理「${topic}」的核心概念、概念关系与边界；指出学生容易混淆的前概念，并设计用于暴露误区的诊断问题。`,
      env04: `仅使用下列教师已提供材料构建真实性学习情境与资源清单：${sourceSeed}。不得新增政策、法规或案例来源；信息不足时标注“待核实来源”。`,
      env05: `把以下任务素材组织为递进问题链、分歧锚点、学生任务和教学支架：${taskSeed}。角色可参考：${roleSeed}。明确教师动作、学生协作方式、时间与可评价产出。`,
      env06: `为「${topic}」设置课中形成性检查、分组监控和沉默学生干预节点；给出依据学生回答调整追问、分组或支架的可执行规则。`,
      env07: `生成可直接使用的表现性评价标准；维度参考：${rubricSeed}。每个维度需有可观察指标与等级锚点，并说明如何诊断学习成效。`,
      env08: `设计教师和学生的课后复盘；区分课堂事实、可能原因和改进假设，加入 2–3 个核心复盘问题及下一轮可验证调整。`,
      env09: `从本课「${topic}」产物中整理可复用的任务、问题、角色卡、评价标准和案例材料；标注适用情境、版本、共享方式与使用前需要核验的内容。`,
    };
  }

  // ============================================================
  // Stage 2 模板：五路学科审校 / 剧本 beats / 风险 / 评价标准 / 画像
  // 5 路审校视角固定，内容按 chapter 模板化
  // ============================================================
  const { EXPERTS, getExpertCommentsForChapter } = Review;

  // 章节 → 剧本 beats（精简 6-8 拍）
  const SCRIPT_BY_CHAPTER = {
    "mp-ch3-environment": [
      { kind: "marker", text: "▾ 问题链 · 第 1 题 — S / W / O / T 初步归类" },
      { ts: "00:00", role: "T", text: '"华康连锁拟在 <span class="em">20 家社区门店</span>开展慢病药学服务——先把案例信息归入 S、W、O、T。"' },
      { ts: "00:18", role: "A", text: '已附 <span class="em">会员复购、药师排班、门诊统筹与竞店服务</span>四类资料。' },
      { ts: "00:35", role: "T", text: '"每项判断都要回答：它来自组织内部还是外部环境？证据是什么？"' },
      { ts: "00:48", role: "S", who: "学生 12", text: '"门诊统筹扩大是<span class="em">机会 O</span>，因为它来自外部政策变化。"' },
      { kind: "marker", text: "▾ 问题链 · 第 3 题 — W / T 边界与 TOWS 转化" },
      { ts: "01:24", role: "T", text: '"执业药师不足应归为 W 还是 T？请先说明分析层级。"' },
      { ts: "01:38", role: "S", who: "学生 A", text: '"门店现有排班与培训能力不足，是组织可控的<span class="em">劣势 W</span>。"' },
      { ts: "01:48", role: "S", who: "学生 B", text: '"行业人才供给趋紧来自外部，是<span class="em">威胁 T</span>。"' },
      { ts: "02:05", role: "A", text: '⚠ 检测到同一现象的 W / T 边界分歧——建议拆为<b>“内部能力条件 + 外部趋势证据”</b>两条判断。', note: true },
      { ts: "02:12", role: "T", text: '"好——完成拆分后，再把 SWOT 组合成 SO、WO、ST、WT 四类策略。"' },
    ],
    "ch5-procurement": [
      { kind: "marker", text: "▾ 问题链 · 第 1 题 — 开放" },
      { ts: "00:00", role: "T", text: '"先看这张图——<span class="em">集采第 9 批</span>，原研降价 87%、仿制药 6 家中标。"' },
      { ts: "00:18", role: "A", text: '已附数据源 <span class="em">国办发〔2019〕2号</span> · 集采公告 · 3 份院方匿名替代记录。' },
      { ts: "00:35", role: "T", text: '"看到这张图，你最先注意到——药价、厂家，还是患者反应？"' },
      { ts: "00:48", role: "S", who: "学生 12", text: '"先看到价格——原研降到这个价位真的有点意外。"' },
      { kind: "marker", text: "▾ 问题链 · 第 3 题 — 分歧锚点" },
      { ts: "01:24", role: "T", text: '"如果你是医院药事委员会，会优先采购原研还是仿制？依据什么？"' },
      { ts: "01:38", role: "S", who: "学生 A", text: '"仿制——通过<span class="em">一致性评价</span>就等同临床。"' },
      { ts: "01:48", role: "S", who: "学生 B", text: '"但已用原研 2 年的患者怎么办？<span class="em">替代焦虑</span>是真问题。"' },
      { ts: "02:05", role: "A", text: '⚠ 检测到 学生 A / B 的立场结构性对立——建议引入<b>「医保支付方 vs 长期患者」</b>分组讨论。', note: true },
      { ts: "02:12", role: "T", text: '"好——A 组扮演医保局视角，B 组扮演慢病患者，5 分钟后回来。"' },
    ],
    "ch4-gmp": [
      { kind: "marker", text: "▾ 问题链 · 第 1 题 — 现场观察" },
      { ts: "00:00", role: "T", text: '"这是上周某固体制剂线的 <span class="em">6 张拍照</span>——请找 3 个偏差。"' },
      { ts: "00:18", role: "A", text: '已附 <span class="em">GMP 通则 · 附录 7</span> · 厂内 SOP 摘录 · 飞检通告 3 份。' },
      { ts: "00:36", role: "T", text: '"先看哪一张？依据什么判断它是偏差？"' },
      { ts: "00:50", role: "S", who: "学生 7", text: '"第 4 张——批号填写位置不对，应该在称量后立刻贴。"' },
      { kind: "marker", text: "▾ 问题链 · 第 3 题 — 根因分析" },
      { ts: "01:20", role: "T", text: '"假设这 3 个偏差都已发生，根本原因可能在哪一层？人/机/料/法/环？"' },
      { ts: "01:36", role: "S", who: "学生 A", text: '"人——操作员未培训。"' },
      { ts: "01:48", role: "S", who: "学生 B", text: '"我认为是<span class="em">法</span>——SOP 写得太抽象。"' },
      { ts: "02:05", role: "A", text: '⚠ 检测到 学生 A / B 的立场结构性对立——建议引入<b>「操作执行 vs 程序设计」</b>分组讨论。', note: true },
      { ts: "02:12", role: "T", text: '"好——A 组聚焦操作侧，B 组聚焦 SOP 重写，5 分钟后回来。"' },
    ],
    "ch1-overview": [
      { kind: "marker", text: "▾ 问题链 · 第 1 题 — 概念辨析" },
      { ts: "00:00", role: "T", text: '"先说一下你心目中<span class="em">药事管理</span>、<span class="em">药剂学</span>、<span class="em">药事法规</span>的边界。"' },
      { ts: "00:20", role: "A", text: '已附 <span class="em">学科发展报告</span> · 行业白皮书 · 教材摘录 3 处。' },
      { ts: "00:38", role: "T", text: '"如果让你画一张知识地图，三者交集放在哪？"' },
      { ts: "00:55", role: "S", who: "学生 4", text: '"我认为药事管理是上层——它管前两个。"' },
      { kind: "marker", text: "▾ 问题链 · 第 3 题 — 学科前景" },
      { ts: "01:24", role: "T", text: '"未来 5 年，你觉得药事管理学的关键议题会是什么？"' },
      { ts: "01:40", role: "S", who: "学生 A", text: '"医保支付——它在重塑整个产业链。"' },
      { ts: "01:54", role: "S", who: "学生 B", text: '"不——我觉得是<span class="em">AI 监管科学</span>，这是新边界。"' },
      { ts: "02:05", role: "A", text: '⚠ 检测到 学生 A / B 的立场结构性对立——建议引入<b>「短期议题 vs 长期议题」</b>分组讨论。', note: true },
      { ts: "02:12", role: "T", text: '"好——A 组列短期，B 组列长期，5 分钟后回来。"' },
    ],
  };

  function getScriptForChapter(chapter) {
    if (!chapter) return SCRIPT_BY_CHAPTER["ch5-procurement"];
    if (SCRIPT_BY_CHAPTER[chapter.id]) return SCRIPT_BY_CHAPTER[chapter.id];
    // 兜底：用 topic 套通用模板
    return [
      { kind: "marker", text: `▾ 问题链 · 第 1 题 — 开放（${chapter.topic}）` },
      { ts: "00:00", role: "T", text: `"今天我们看<span class=\"em\">${chapter.topic}</span>——先说说你的第一印象。"` },
      { ts: "00:18", role: "A", text: `已附 <span class=\"em\">${chapter.title}</span> 相关公开资料 · 行业指南 · 教材本章摘录。` },
      { ts: "00:36", role: "T", text: '"你觉得这件事最关键的判断点是什么？"' },
      { ts: "00:52", role: "S", who: "学生 7", text: `"我先看到<span class=\"em\">${chapter.topic}</span>本身的复杂度——切入点不止一个。"` },
      { kind: "marker", text: "▾ 问题链 · 第 3 题 — 立场分歧" },
      { ts: "01:24", role: "T", text: `"如果让你给一个决策建议，<b>${chapter.topic}</b> 你会优先 A 还是 B？依据什么？"` },
      { ts: "01:38", role: "S", who: "学生 A", text: '"我选 A——证据更直接。"' },
      { ts: "01:48", role: "S", who: "学生 B", text: '"我倾向 B——A 忽略了关键风险。"' },
      { ts: "02:05", role: "A", text: '⚠ 检测到 学生 A / B 的立场结构性对立——建议引入<b>对立分组讨论</b>。', note: true },
      { ts: "02:12", role: "T", text: '"好——A、B 各派一组，5 分钟后回来。"' },
    ];
  }

  // 章节 → 风险信号
  const RISKS_BY_CHAPTER = {
    "mp-ch3-environment": [
      { sev: "h", lab: "内外部边界混淆", body: '学生把“门店排班不足”与“行业人才供给趋紧”合并为同一条判断' },
      { sev: "m", lab: "环境证据断点", body: 'T 维判断尚未引用竞店、行业人才或区域市场数据' },
      { sev: "l", lab: "TOWS 转化不足", body: 'SWOT 已完成分类，但部分小组仍未形成可执行的策略组合' },
    ],
    "ch5-procurement": [
      { sev: "h", lab: "立场失衡", body: '4 位"药企背景"学生未发声，可能放大集采替代倾向' },
      { sev: "m", lab: "政策引用断点", body: 'B 组讨论尚未引用任何法规条款' },
      { sev: "l", lab: "分组时长偏紧", body: '5 分钟分组对 1 年级学生破冰偏赶' },
    ],
    "ch4-gmp": [
      { sev: "h", lab: "现场细节失真", body: '学生想象的偏差缺乏对照实物，讨论易停留在抽象' },
      { sev: "m", lab: "法规对应弱", body: '尚未引用 GMP 附录条款支撑判断' },
      { sev: "l", lab: "操作者立场缺位", body: '没有学生扮演实际操作员，难以反驳"人因"假设' },
    ],
    "ch1-overview": [
      { sev: "m", lab: "概念边界模糊", body: '学生对学科边界的描述存在交叉，需教师澄清' },
      { sev: "l", lab: "前景议题分散", body: '学生提出议题多达 7 个，难以聚焦' },
      { sev: "l", lab: "证据引用浅", body: '尚未有学生引用白皮书或具体数据' },
    ],
  };
  function getRisksForChapter(chapter) {
    if (!chapter) return RISKS_BY_CHAPTER["ch5-procurement"];
    return RISKS_BY_CHAPTER[chapter.id] || [
      { sev: "h", lab: "立场覆盖偏窄", body: `「${chapter.topic}」涉及的利益方未在课堂上充分表态` },
      { sev: "m", lab: "证据引用断点", body: '部分论点尚未引用公开资料或法规条款' },
      { sev: "l", lab: "节奏控制", body: '本章节信息密度较高，分组时长建议复核' },
    ];
  }

  // 章节 → 评价标准歧义
  const FLAGS_BY_CHAPTER = {
    "mp-ch3-environment": [
      { fid: "R-04", body: '<b>内外部边界判断</b>缺少可观测锚点；建议加入“组织可控性 + 外部趋势来源”两项判据' },
      { fid: "R-06", body: '<b>策略可行性</b>与“证据充分性”存在交叠，需明确 TOWS 组合与证据质量分别计分' },
    ],
    "ch5-procurement": [
      { fid: "R-04", body: '<b>立场迁移度</b>缺少可观测锚点；建议补 3 级评价标准（已被教学设计审校提出）' },
      { fid: "R-06", body: '<b>反思深度</b>与"政策引用"维度有交叠，可能双计分' },
    ],
    "ch4-gmp": [
      { fid: "R-03", body: '<b>CAPA 闭环性</b>缺少可观测锚点；建议补"是否标明负责人 + 时限"' },
      { fid: "R-05", body: '<b>偏差识别准确度</b>与"法规对应"有交叠，可能双计分' },
    ],
    "ch1-overview": [
      { fid: "R-02", body: '<b>案例迁移度</b>定义偏抽象——建议给"成功迁移"3 个标准' },
      { fid: "R-04", body: '<b>学科自觉</b>评分主观性高，需限定关键词' },
    ],
  };
  function getFlagsForChapter(chapter) {
    if (!chapter) return FLAGS_BY_CHAPTER["ch5-procurement"];
    return FLAGS_BY_CHAPTER[chapter.id] || [
      { fid: "R-0X", body: `<b>${chapter.topic} 立场迁移度</b>缺少可观测锚点；建议补 3 级评价标准` },
      { fid: "R-0Y", body: '部分评价维度可能交叠，建议复核以免双计分' },
    ];
  }

  const REVIEW_VIEW_STORE = "pp.practice.reviewView.v1";
  let reviewViewMode = (() => {
    try { return localStorage.getItem(REVIEW_VIEW_STORE) === "discipline" ? "discipline" : "env"; }
    catch { return "env"; }
  })();
  const reviewDossierRenderer = Review.createDossierRenderer({ envMeta: PRACTICE_ENV_META, escapeHtml });

  function hasTrialEvidence() {
    return Array.isArray(state.keyMoments) && state.keyMoments.length > 0;
  }

  function reviewVerdictIsResolved(entry) {
    return entry.state === "rejected" || (entry.state === "candidate" && entry.decision !== "pending");
  }

  function reviewVerdictStatus(entry) {
    if (entry.state === "rejected") return "暂不修改";
    if (entry.decision === "insufficient") return "证据不足";
    if (entry.state === "candidate" && entry.decision === "supported") {
      return entry.candidateMode === "modified" ? "调整后修改" : "按建议修改";
    }
    return "待处理";
  }

  function reviewVerdictEvidenceCount(entry) {
    return entry.evidenceTouched ? entry.evidenceLinks.length : suggestedEvidenceIdsForEntry(entry).length;
  }

  function reviewVerdictIssue(entry) {
    if (entry.liveReview?.annotation?.issue) return entry.liveReview.annotation.issue;
    return stripHtml(entry.seedComment?.body || entry.sourceText)
      .replace(/[“”"]/g, "")
      .split(/[。；]/)[0]
      .trim() || "查看本路审校建议";
  }

  function reviewVerdictPriority(entry, index) {
    return (reviewVerdictIsResolved(entry) ? 0 : 100)
      + Math.min(reviewVerdictEvidenceCount(entry), 5) * 10
      + (entry.liveReview && !isLiveReviewStale(entry) ? 5 : 0)
      - index / 100;
  }

  function syncReviewWorkspaceSummary() {
    const root = document.querySelector('#stage-ii [data-ec-role="verdict-list"]');
    const entries = state.expertCards || [];
    if (!root || !entries.length) return;
    const resolved = entries.filter(reviewVerdictIsResolved).length;
    const evidenced = entries.filter((entry) => reviewVerdictEvidenceCount(entry) > 0).length;
    const resolvedNode = root.querySelector('[data-review-summary="resolved"]');
    const evidenceNode = root.querySelector('[data-review-summary="evidenced"]');
    if (resolvedNode) resolvedNode.textContent = String(resolved);
    if (evidenceNode) evidenceNode.textContent = String(evidenced);
  }

  function syncReviewVerdictIndex(entry) {
    const root = document.querySelector('#stage-ii [data-ec-role="verdict-list"]');
    const button = root?.querySelector(`[data-review-select="${entry.expertId}"]`);
    if (!button) return;
    button.classList.toggle("is-resolved", reviewVerdictIsResolved(entry));
    const status = button.querySelector("[data-review-index-status]");
    const evidence = button.querySelector(`[data-review-index-evidence="${entry.expertId}"]`);
    if (status) status.textContent = reviewVerdictStatus(entry);
    if (evidence) evidence.textContent = `${reviewVerdictEvidenceCount(entry)} 条证据`;
    syncReviewWorkspaceSummary();
  }

  function renderReviewVerdictBand() {
    const list = document.querySelector('#stage-ii [data-ec-role="verdict-list"]');
    if (!list) return;
    (state.expertCards || []).forEach((entry) => { entry.verdict = null; });
    if (!hasTrialEvidence()) {
      list.innerHTML = '<p class="posttrial-wait">尚无仿真证据 · 先运行虚拟班并读取关键时刻；证据出现前只能阅读审校与标记观察点。</p>';
      return;
    }
    const entries = state.expertCards || [];
    const preferred = entries
      .map((entry, index) => ({ entry, score:reviewVerdictPriority(entry, index) }))
      .sort((a, b) => b.score - a.score)[0]?.entry;
    if (!entries.some((entry) => entry.expertId === state.activeVerdictExpertId)) {
      state.activeVerdictExpertId = preferred?.expertId || entries[0]?.expertId || "";
    }
    const resolvedCount = entries.filter(reviewVerdictIsResolved).length;
    const evidencedCount = entries.filter((entry) => reviewVerdictEvidenceCount(entry) > 0).length;
    list.classList.add("review-verdict-list");
    const indexMarkup = entries.map((entry, index) => {
      const active = entry.expertId === state.activeVerdictExpertId;
      const evidenceCount = reviewVerdictEvidenceCount(entry);
      const targets = entry.targetEnvKeys.map((key) => PRACTICE_ENV_BY_KEY[key]?.no).filter(Boolean).join(" / ");
      return `<button type="button" class="review-verdict-index-item${active ? " is-active" : ""}${reviewVerdictIsResolved(entry) ? " is-resolved" : ""}" data-review-select="${escapeHtml(entry.expertId)}" aria-pressed="${active}" aria-controls="review-verdict-${escapeHtml(entry.expertId)}">
        <span class="review-verdict-index-top"><i>${String(index + 1).padStart(2, "0")}</i><b>${escapeHtml(entry.expert.role)}</b><em data-review-index-status>${escapeHtml(reviewVerdictStatus(entry))}</em></span>
        <span class="review-verdict-index-issue">${escapeHtml(reviewVerdictIssue(entry))}</span>
        <span class="review-verdict-index-meta"><small>环节 ${targets || "未选择"}</small><small data-review-index-evidence="${escapeHtml(entry.expertId)}">${evidenceCount} 条证据</small></span>
      </button>`;
    }).join("");
    const detailMarkup = entries.map((entry) => {
      const targets = entry.targetEnvKeys.map((key) => PRACTICE_ENV_BY_KEY[key]?.no).filter(Boolean).join(" / ");
      const active = entry.expertId === state.activeVerdictExpertId;
      return `<article id="review-verdict-${escapeHtml(entry.expertId)}" class="review-verdict-row is-posttrial${active ? " is-active" : ""}" data-review-verdict="${escapeHtml(entry.expertId)}"${active ? "" : " hidden"}>
        <div class="review-detail-kicker"><span>当前聚焦</span><small>其余审校保留在左侧索引</small></div>
        <div class="posttrial-head"><div><b>${escapeHtml(entry.expert.role)}</b><small>${escapeHtml(entry.expert.persona)} · 观察环节 ${targets || "未选择"}</small></div><span class="pill pill-sage" data-ec-role="posttrial-status">${escapeHtml(reviewVerdictStatus(entry))}</span></div>
        <div class="posttrial-source" data-ec-role="posttrial-source">
          <span class="posttrial-source-label">建议要点</span>
          <div class="posttrial-source-copy${entry.liveReview ? " is-structured" : ""}" data-ec-role="posttrial-body"></div>
          <button type="button" class="posttrial-source-toggle" data-source-act="toggle" aria-expanded="false">展开全文</button>
        </div>
        <div class="posttrial-flow">
          <section class="ec-evidence">
            <div class="ec-evidence-summary"><span class="ec-evidence-label">试教证据</span><span data-ec-role="evidence-summary">正在匹配相关记录</span><button type="button" data-evidence-act="toggle" aria-expanded="false">查看</button></div>
            <span data-ec-role="evidence-count" hidden>系统正在匹配相关记录</span>
            <div class="ec-evidence-list" data-ec-role="evidence-list" hidden></div>
          </section>
          <section data-ec-role="resolution" class="ec-resolution">
            <span class="ec-section-lbl"><b>你的处理</b><small>选择一次</small></span>
            <div class="ec-resolution-picker" data-ec-role="resolution-picker">
              <button type="button" data-review-choice="original" aria-pressed="false">按建议修改</button>
              <button type="button" data-review-choice="modified" aria-pressed="false">调整后修改</button>
              <button type="button" data-review-choice="rejected" aria-pressed="false">暂不修改</button>
            </div>
            <span class="ec-inline-error ec-candidate-error" data-ec-role="candidate-error" role="alert" hidden></span>
            <div class="ec-resolution-summary" data-ec-role="resolution-summary" hidden><span class="ec-resolution-copy"></span><span class="ec-resolution-actions"><button type="button" data-note-act="toggle" aria-expanded="false" hidden>补充说明</button><button type="button" data-review-act="revise">改判</button></span></div>
            <div class="ec-edit-panel" data-ec-role="edit-panel" hidden><label>修改后意见<textarea rows="4" maxlength="480"></textarea></label><span class="ec-inline-error" data-ec-role="edit-error" role="alert" hidden></span><div><button type="button" data-edit-act="save">保存候选</button><button type="button" data-edit-act="cancel">取消</button></div></div>
            <div class="ec-reject-panel" data-ec-role="reject-panel" hidden><label>暂不修改的原因<select data-ec-role="defer-kind"><option value="insufficient">本次试教证据不足</option><option value="not-applicable">建议不适用于本课</option><option value="defer">本轮暂缓处理</option></select></label><label>补充说明（可选）<input maxlength="160" placeholder="用于保留教师决策痕迹"/></label><span class="ec-inline-error" data-ec-role="reject-error" role="alert" hidden></span><div><button type="button" data-reject-act="confirm">确认暂不修改</button><button type="button" data-reject-act="cancel">取消</button></div></div>
            <label class="ec-decision-note-field" data-ec-role="decision-note-field" hidden><span>补充说明（可选）</span><input class="ec-decision-note" data-ec-role="decision-note" maxlength="120" placeholder="例如：下一轮重点观察什么"/></label>
          </section>
        </div>
      </article>`;
    }).join("");
    list.innerHTML = `<div class="review-verdict-workspace">
      <aside class="review-verdict-index" aria-label="五路审校索引">
        <header><span>审校索引</span><strong>${entries.length} 路意见</strong></header>
        <div class="review-verdict-summary"><span><b data-review-summary="evidenced">${evidencedCount}</b> 路已有证据</span><span><b data-review-summary="resolved">${resolvedCount}</b> 路已处理</span></div>
        <nav>${indexMarkup}</nav>
      </aside>
      <div class="review-verdict-detail-stack" aria-live="polite">${detailMarkup}</div>
    </div>`;
    entries.forEach((entry) => { entry.verdict = list.querySelector(`[data-review-verdict="${entry.expertId}"]`); });
    list.querySelectorAll("[data-review-select]").forEach((button) => {
      button.addEventListener("click", () => {
        const nextId = button.dataset.reviewSelect;
        if (!nextId || nextId === state.activeVerdictExpertId) return;
        state.activeVerdictExpertId = nextId;
        list.querySelectorAll("[data-review-select]").forEach((candidate) => {
          const selected = candidate.dataset.reviewSelect === nextId;
          candidate.classList.toggle("is-active", selected);
          candidate.setAttribute("aria-pressed", String(selected));
        });
        list.querySelectorAll("[data-review-verdict]").forEach((detail) => {
          const selected = detail.dataset.reviewVerdict === nextId;
          detail.hidden = !selected;
          detail.classList.toggle("is-active", selected);
        });
      });
    });
  }

  // 环节热点投影：聚类键只用 envId。只有实时完成且逐字锚定的意见（ready）
  // 进入“跨学科关注热点”计数；种子、进行中、过期与降级内容不进入热点数
  // 与完成数，只作为观察重点单独呈现。
  function liveReviewState(entry) {
    if (entry.liveReviewPhase === "loading") return "loading";
    if (entry.liveReviewPhase === "error") return "error";
    if (isLiveReviewStale(entry)) return "stale";
    return entry.liveReview ? "ready" : "seed";
  }
  function buildEnvReviewProjection(entries) {
    const projection = { total: entries.length, readyReviewCount: 0, loadingCount: 0, degradedCount: 0, seedCount: 0, staleCount: 0, byEnv: new Map(), hotEnvCount: 0, maxEnvShare: 0 };
    entries.forEach((entry) => {
      const reviewState = liveReviewState(entry);
      if (reviewState === "ready") {
        projection.readyReviewCount += 1;
        const envKey = entry.liveReview.annotation.targetEnv;
        if (PRACTICE_ENV_BY_KEY[envKey]) {
          const bucket = projection.byEnv.get(envKey) || [];
          bucket.push(entry);
          projection.byEnv.set(envKey, bucket);
        }
      } else if (reviewState === "loading") projection.loadingCount += 1;
      else if (reviewState === "error") projection.degradedCount += 1;
      else if (reviewState === "stale") projection.staleCount += 1;
      else projection.seedCount += 1;
    });
    const sizes = [...projection.byEnv.values()].map((bucket) => bucket.length);
    projection.maxEnvShare = projection.total ? Math.max(0, ...sizes) / projection.total : 0;
    projection.hotEnvCount = sizes.filter((count) => count >= 2).length;
    return projection;
  }

  function renderReviewFocusSummary() {
    const entries = state.expertCards || [];
    const list = document.querySelector('#stage-ii [data-review-role="focus-list"]');
    const gate = document.querySelector('#stage-ii [data-review-role="focus-gate"]');
    if (!entries.length || !list || !gate) return;
    const projection = buildEnvReviewProjection(entries);
    const { total, readyReviewCount, loadingCount, degradedCount, seedCount, staleCount, hotEnvCount } = projection;

    // —— 摘要行：全部完成有热点 / 全部完成无热点 / 部分完成（含降级与进行中） ——
    let gateCopy = "固定种子 · 等待五路实时审校";
    if (readyReviewCount > 0 || loadingCount > 0 || degradedCount > 0) {
      if (readyReviewCount === total) {
        gateCopy = hotEnvCount > 0
          ? `五路审校完成 · ${hotEnvCount} 个跨学科关注热点 · ${readyReviewCount} 条意见均逐字锚定`
          : `五路审校完成 · 各学科关注点分布在不同环节 · ${readyReviewCount} 条意见均逐字锚定`;
      } else {
        const parts = [`已完成 ${readyReviewCount}/${total} 路实时审校`];
        if (hotEnvCount > 0) parts.push(`${hotEnvCount} 个跨学科关注热点`);
        if (degradedCount > 0) parts.push(`${degradedCount} 路显示预置观察重点`);
        if (loadingCount > 0) parts.push(`${loadingCount} 路审校进行中`);
        parts.push(`${readyReviewCount} 条意见已逐字锚定`);
        gateCopy = parts.join(" · ");
      }
    }
    gate.textContent = gateCopy;
    gate.classList.toggle("is-anchored", total > 0 && readyReviewCount === total);

    const roleOf = (entry) => (entry.expert?.role || "学科").replace("审校", "");
    if (readyReviewCount === 0) {
      // 纯种子态：保留“带着问题看试教”的预置观察重点，不计入任何完成数。
      const grouped = new Map();
      entries.forEach((entry) => {
        const key = entry.seedComment?.primaryEnvKey || entry.targetEnvKeys?.[0];
        if (!PRACTICE_ENV_BY_KEY[key]) return;
        const issue = stripHtml(entry.seedComment?.body || entry.sourceText).replace(/["“”]/g, "").split(/[。；]/)[0];
        const bucket = grouped.get(key) || { key, entries:[], issues:[] };
        bucket.entries.push(entry);
        if (issue) bucket.issues.push(issue);
        grouped.set(key, bucket);
      });
      const focuses = [...grouped.values()]
        .sort((a, b) => b.entries.length - a.entries.length || PRACTICE_ENV_BY_KEY[a.key].no.localeCompare(PRACTICE_ENV_BY_KEY[b.key].no))
        .slice(0, 3);
      list.innerHTML = focuses.map((focus) => {
        const env = PRACTICE_ENV_BY_KEY[focus.key];
        const roles = focus.entries.map((entry) => roleOf(entry)).join(" × ");
        return `<article><b>${escapeHtml(env.no)}</b><span>${escapeHtml(focus.issues[0] || `${env.short}需在试教中重点观察`)}</span><small>${escapeHtml(roles)}</small></article>`;
      }).join("");
      return;
    }

    // 热点列表：ready 意见按环节聚类，≥2 路同环节即“跨学科关注热点”。
    // 只投影原始意见（学科/问题/建议/摘录/版本），不生成任何综合文本。
    const envGroups = [...projection.byEnv.entries()]
      .map(([key, bucket]) => ({ key, entries: bucket, env: PRACTICE_ENV_BY_KEY[key] }))
      .sort((a, b) => b.entries.length - a.entries.length || a.env.no.localeCompare(b.env.no));
    const hotspotMarkup = envGroups.map((group) => {
      const shared = group.entries.length >= 2;
      const roles = group.entries.map((entry) => roleOf(entry)).join("｜");
      const heading = shared ? `${group.entries.length} 路共同关注` : "1 路关注";
      const note = shared ? `${group.entries.length} 个不同专业问题，均已逐字定位本环节` : "已逐字定位本环节";
      const items = group.entries.map((entry) => {
        const annotation = entry.liveReview.annotation;
        return `<li><b>${escapeHtml(roleOf(entry))}</b><p><i>问题</i>${escapeHtml(annotation.issue)}</p><p><i>建议</i>${escapeHtml(annotation.suggestion)}</p><p class="review-focus-excerpt"><i>摘录</i>「${escapeHtml(annotation.sourceExcerpt)}」</p><small>本机 Qwen · 已锚定 · 第 ${entry.liveReview.sourceRevision} 版</small></li>`;
      }).join("");
      return `<details class="review-focus-env"><summary><b>${escapeHtml(group.env.no)}</b><span>${escapeHtml(heading)}</span><small>${escapeHtml(roles)} · ${escapeHtml(note)}</small></summary><ul>${items}</ul></details>`;
    }).join("");
    const pending = [];
    if (seedCount > 0) pending.push(`${seedCount} 路使用固定审校种子`);
    if (loadingCount > 0) pending.push(`${loadingCount} 路审校进行中`);
    if (degradedCount > 0) pending.push(`${degradedCount} 路降级为预置观察重点`);
    if (staleCount > 0) pending.push(`${staleCount} 路批注待按当前版复审`);
    const pendingMarkup = pending.length
      ? `<p class="review-focus-pending">观察重点 · ${escapeHtml(pending.join("；"))}</p>` : "";
    list.innerHTML = `${hotspotMarkup}${pendingMarkup}`;
  }

  function renderUnlocatedBasket(chapter) {
    const basket = document.querySelector('#stage-ii [data-ec-role="unlocated-basket"]');
    const list = basket?.querySelector('[data-ec-role="unlocated-list"]');
    if (!basket || !list) return;
    const active = (state.expertCards || []).filter((entry) => entry.unlocatedReview && entry.unlocatedReview.state !== "dismissed");
    const count = basket.querySelector("summary b");
    if (count) count.textContent = String(active.length);
    if (!active.length) {
      list.innerHTML = '<p>当前没有未定位意见。门禁失败的内容不会出现在任何环节，也不能进入修订候选。</p>';
      basket.open = false;
      return;
    }
    list.innerHTML = active.map((entry) => {
      const item = entry.unlocatedReview;
      const claimed = PRACTICE_ENV_BY_KEY[item.claimedTargetEnv];
      return `<section class="review-unlocated-item" data-unlocated-expert="${escapeHtml(entry.expertId)}"><h6>${escapeHtml(entry.expert.role)} · 未定位建议</h6><small>门禁：${escapeHtml(item.gateReason)} · 声称落点 ${escapeHtml(claimed?.no || item.claimedTargetEnv || "未知")}</small><p><b>问题</b> ${escapeHtml(item.issue)}</p><p><b>建议</b> ${escapeHtml(item.suggestion)}</p>${item.claimedSourceExcerpt ? `<p><b>模型声称摘录</b>「${escapeHtml(item.claimedSourceExcerpt)}」</p>` : ""}<label>归档原因 <input maxlength="120" data-unlocated-reason placeholder="必须留下教师原因"/></label><button type="button" data-unlocated-act="dismiss">归档未定位意见</button></section>`;
    }).join("");
    basket.open = true;
    list.querySelectorAll('[data-unlocated-act="dismiss"]').forEach((button) => {
      button.addEventListener("click", () => {
        const itemEl = button.closest("[data-unlocated-expert]");
        const entry = (state.expertCards || []).find((candidate) => candidate.expertId === itemEl?.dataset.unlocatedExpert);
        const reason = itemEl?.querySelector("[data-unlocated-reason]")?.value.trim() || "";
        if (!entry?.unlocatedReview || !reason) { toast("请先填写归档原因，保留教师决策痕迹"); return; }
        entry.unlocatedReview.state = "dismissed";
        entry.unlocatedReview.dismissReason = reason;
        saveExpertReview(chapter?.id, entry);
        renderUnlocatedBasket(chapter);
      });
    });
  }

  function renderReviewSurfaces(chapter, { autoLink = true } = {}) {
    const root = document.querySelector('#stage-ii [data-ec-role="grid"]');
    const indexRoot = document.querySelector('#stage-ii [data-ec-role="env-index"]');
    if (!root) return;
    reviewDossierRenderer.render({ root, indexRoot, entries: state.expertCards || [], pack: currentPackFromPreview() || {}, mode: reviewViewMode });
    renderReviewVerdictBand();
    (state.expertCards || []).forEach((entry) => {
      const body = entry.card?.querySelector('[data-ec-role="body"]');
      if (body) {
        if (entry.draftText === entry.sourceText) body.innerHTML = entry.sourceComment.body;
        else body.textContent = entry.draftText;
      }
      wireReviewCard(entry, chapter);
      syncReviewCardVisual(entry);
      syncLiveReviewVisual(entry);
      renderReviewEvidence(entry, { autoLink });
    });
    indexRoot?.querySelectorAll("[data-review-env]").forEach((button) => {
      button.addEventListener("click", () => {
        indexRoot.querySelectorAll("[data-review-env]").forEach((candidate) => candidate.classList.toggle("is-active", candidate === button));
        document.getElementById(`review-env-${button.dataset.reviewEnv}`)?.scrollIntoView({ behavior:"smooth", block:"start" });
      });
    });
    renderUnlocatedBasket(chapter);
    renderReviewFocusSummary();
  }

  function wireReviewSurfaceControls() {
    const drawer = document.querySelector('#stage-ii [data-review-surface="drawer"]');
    const scrim = document.querySelector('#stage-ii .review-drawer-scrim');
    const openDrawer = () => {
      if (!drawer || !scrim) return;
      document.documentElement.classList.add("review-drawer-open");
      drawer.setAttribute("aria-hidden", "false");
      drawer.removeAttribute("inert");
      scrim.hidden = false;
      drawer.querySelector('[data-review-act="close-drawer"]')?.focus();
    };
    const closeDrawer = () => {
      if (!drawer || !scrim) return;
      document.documentElement.classList.remove("review-drawer-open");
      drawer.setAttribute("aria-hidden", "true");
      drawer.setAttribute("inert", "");
      scrim.hidden = true;
      document.querySelector('#stage-ii [data-review-act="open-drawer"]')?.focus();
    };
    document.querySelectorAll('#stage-ii [data-review-act="open-drawer"]').forEach((button) => {
      if (button.dataset.wired === "1") return;
      button.dataset.wired = "1";
      button.addEventListener("click", openDrawer);
    });
    document.querySelectorAll('#stage-ii [data-review-act="close-drawer"]').forEach((button) => {
      if (button.dataset.wired === "1") return;
      button.dataset.wired = "1";
      button.addEventListener("click", closeDrawer);
    });
    if (!document.documentElement.dataset.reviewDrawerEscape) {
      document.documentElement.dataset.reviewDrawerEscape = "1";
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && drawer?.getAttribute("aria-hidden") === "false") closeDrawer();
      });
    }
    document.querySelectorAll('#stage-ii [data-review-view]').forEach((button) => {
      if (button.dataset.wired === "1") return;
      button.dataset.wired = "1";
      button.addEventListener("click", () => {
        reviewViewMode = button.dataset.reviewView === "discipline" ? "discipline" : "env";
        try { localStorage.setItem(REVIEW_VIEW_STORE, reviewViewMode); } catch {}
        document.querySelectorAll('#stage-ii [data-review-view]').forEach((candidate) => {
          const active = candidate.dataset.reviewView === reviewViewMode;
          candidate.classList.toggle("is-active", active);
          candidate.setAttribute("aria-selected", String(active));
        });
        renderReviewSurfaces(getSelected("chapter"), { autoLink:false });
      });
    });
    const editButton = document.querySelector('#stage-ii [data-review-act="edit-pack"]');
    const warning = document.querySelector('#stage-ii [data-ec-role="edit-warning"]');
    if (editButton && editButton.dataset.wired !== "1") {
      editButton.dataset.wired = "1";
      editButton.addEventListener("click", () => {
        const armed = editButton.dataset.armed === "1";
        if (!armed) {
          editButton.dataset.armed = "1";
          editButton.textContent = "确认回 Stage I 编辑";
          if (warning) warning.hidden = false;
          return;
        }
        editButton.dataset.armed = "0";
        editButton.textContent = "回 Stage I 编辑实践包";
        document.querySelector("#stage-i .pack-result")?.scrollIntoView({ behavior:"smooth", block:"start" });
      });
    }
    document.querySelectorAll('#stage-ii [data-review-view]').forEach((button) => {
      const active = button.dataset.reviewView === reviewViewMode;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
    });
  }

  function renderExpertDossier(chapter) {
    const root = document.querySelector('#stage-ii [data-ec-role="grid"]');
    if (!root) return;
    const comments = getExpertCommentsForChapter(chapter);
    if (!comments) return;
    const savedReviews = loadExpertAdoptions(chapter?.id);
    state.expertCards = EXPERTS.map((e, i) => {
      const c = comments[i] || comments[0];
      const savedRecord = savedReviews[e.id];
      const liveReview = normalizeLiveReview(savedRecord?.liveReview);
      const unlocatedReview = normalizeUnlocatedReview(savedRecord?.unlocatedReview);
      const seedSourceText = stripHtml(c.body).trim();
      const sourceText = liveReview ? liveReviewSourceText(liveReview) : seedSourceText;
      const defaultTargets = liveReview ? liveReviewTargetKeys(liveReview) : [c.primaryEnvKey];
      const record = normalizeReviewRecord(savedRecord, sourceText, defaultTargets);
      return { ...record, card:null, verdict:null, expertId:e.id, chapterId:chapter?.id || "", expert:e,
        sourceComment:liveReview ? { anchor:liveReviewAnchorCopy(liveReview), body:liveReviewBodyMarkup(liveReview) } : { ...c, body:seedReviewBodyMarkup(c.body) },
        seedComment:c, seedSourceText, sourceText, liveReview, unlocatedReview, liveReviewPhase:"idle", liveReviewError:"", isRevising:false,
        sourceExpanded:false, noteExpanded:false };
    });
    enforcePreEvidenceReadOnly(chapter?.id);
    state.expertCards.forEach((entry) => {
      if (entry.state === "candidate") { captureOriginalEnvContent(entry); saveExpertReview(chapter?.id, entry); }
    });
    wireReviewSurfaceControls();
    renderReviewSurfaces(chapter);
    updateExpertAdoptBar();
    composeAssets();
    wireLiveReviewBatch();
    updateBatchIdleStatus();
  }

  const EXPERT_ADOPT_STORE = "pp.practice.expertAdoptions";
  const REVIEW_CONTEXT_VERSION_KEY = "pp.practice.reviewContextVersion.mp-ch3-environment";
  const REVIEW_CONTEXT_VERSION = "management-swot-review-v2";
  const KEY_MOMENT_STORE = "pp.practice.keyMoments.v1";
  let pendingKeyMomentReplay = null;

  function momentSearchText(item) {
    return [item?.cn, item?.quote, item?.copyTemplate]
      .concat(Array.isArray(item?.beats) ? item.beats.map((beat) => beat?.text) : [])
      .filter(Boolean)
      .join(" ");
  }

  function isLegacyProcurementMomentSet(chapterId, moments) {
    if (chapterId !== "mp-ch3-environment" || !Array.isArray(moments) || !moments.length) return false;
    const text = moments.map(momentSearchText).join(" ");
    return /原研|仿制|替代焦虑|患者连续性|成本可及|药企背景|议题二元对立/.test(text);
  }

  function loadKeyMoments(chapterId) {
    if (!chapterId) return [];
    try {
      const all = JSON.parse(localStorage.getItem(KEY_MOMENT_STORE) || "{}");
      const moments = Array.isArray(all[chapterId])
        ? all[chapterId].filter((item) => item && item.id && Number.isFinite(Number(item.tSec)))
        : [];
      if (isLegacyProcurementMomentSet(chapterId, moments)) {
        pendingKeyMomentReplay = {
          chapterId,
          captureUntil: Math.max(132, ...moments.map((item) => Number(item.tSec) || 0)),
        };
        all[chapterId] = [];
        localStorage.setItem(KEY_MOMENT_STORE, JSON.stringify(all));
        return [];
      }
      return moments;
    } catch { return []; }
  }

  function saveKeyMoments(chapterId, moments) {
    if (!chapterId) return;
    try {
      const all = JSON.parse(localStorage.getItem(KEY_MOMENT_STORE) || "{}");
      all[chapterId] = Array.isArray(moments) ? moments : [];
      localStorage.setItem(KEY_MOMENT_STORE, JSON.stringify(all));
    } catch {}
  }

  function replayMigratedKeyMoments() {
    const pending = pendingKeyMomentReplay;
    const mv = global.PharmacoPilotMV;
    if (!pending || wizSelection.chapter !== pending.chapterId || !mv || typeof mv.seek !== "function") return;
    pendingKeyMomentReplay = null;
    mv.seek(pending.captureUntil);
    deriveKeyMoments();
    toast("旧集采仿真记录已失效 · 已按当前 SWOT/TOWS 场景重演到同一时间点");
  }

  function loadAllExpertAdoptions() {
    try { return JSON.parse(localStorage.getItem(EXPERT_ADOPT_STORE) || "{}"); }
    catch { return {}; }
  }
  function loadExpertAdoptions(chapterId) {
    if (!chapterId) return {};
    const all = loadAllExpertAdoptions();
    let storedContextVersion = "";
    try { storedContextVersion = localStorage.getItem(REVIEW_CONTEXT_VERSION_KEY) || ""; } catch {}
    if (chapterId === "mp-ch3-environment" && storedContextVersion !== REVIEW_CONTEXT_VERSION) {
      delete all[chapterId];
      try {
        localStorage.setItem(EXPERT_ADOPT_STORE, JSON.stringify(all));
        localStorage.setItem(REVIEW_CONTEXT_VERSION_KEY, REVIEW_CONTEXT_VERSION);
      } catch {}
      return {};
    }
    return all[chapterId] || {};
  }
  function normalizeReviewRecord(raw, sourceText, defaultTargetEnvKeys) {
    const legacy = typeof raw === "string" ? raw : null;
    const value = raw && typeof raw === "object" ? raw : {};
    const stateValue = legacy === "adopted" ? "candidate"
      : legacy === "ignored" ? "rejected"
      : ["pending", "candidate", "rejected"].includes(value.state) ? value.state
      : "pending";
    const draftText = typeof value.draftText === "string" && value.draftText.trim() ? value.draftText.trim() : sourceText;
    const candidateMode = stateValue === "candidate"
      ? (["original", "modified"].includes(value.candidateMode)
          ? value.candidateMode
          : draftText === sourceText ? "original" : "modified")
      : null;
    const targets = Array.isArray(value.targetEnvKeys)
      ? value.targetEnvKeys.filter((key) => PRACTICE_ENV_BY_KEY[key])
      : defaultTargetEnvKeys;
    return {
      state: stateValue,
      candidateMode,
      draftText,
      targetEnvKeys: targets.length ? [...new Set(targets)] : defaultTargetEnvKeys,
      evidenceLinks: Array.isArray(value.evidenceLinks) ? [...new Set(value.evidenceLinks.map(String))] : [],
      evidenceTouched: value.evidenceTouched === true,
      decision: ["supported", "unsupported", "insufficient"].includes(value.decision) ? value.decision : "pending",
      decisionNote: typeof value.decisionNote === "string" ? value.decisionNote : "",
      rejectionReason: typeof value.rejectionReason === "string" ? value.rejectionReason : "",
      originalEnvContent: value.originalSnapshotVersion === 1
        && value.originalEnvContent && typeof value.originalEnvContent === "object"
        ? Object.fromEntries(Object.entries(value.originalEnvContent)
            .filter(([key, text]) => PRACTICE_ENV_BY_KEY[key] && typeof text === "string"))
        : {},
      originalSnapshotVersion: value.originalSnapshotVersion === 1 ? 1 : 0,
      writtenBack: value.writtenBack === true,
    };
  }

  function resetReviewBeforeEvidence(entry) {
    if (!entry) return;
    entry.state = "pending";
    entry.candidateMode = null;
    entry.draftText = entry.sourceText;
    entry.evidenceLinks = [];
    entry.evidenceTouched = false;
    entry.decision = "pending";
    entry.decisionNote = "";
    entry.rejectionReason = "";
    entry.writtenBack = false;
    entry.isRevising = false;
    entry.originalEnvContent = {};
    entry.originalSnapshotVersion = 0;
  }

  function enforcePreEvidenceReadOnly(chapterId) {
    if (hasTrialEvidence()) return;
    (state.expertCards || []).forEach((entry) => {
      const changed = entry.state !== "pending" || entry.candidateMode !== null
        || entry.decision !== "pending" || entry.evidenceLinks.length
        || entry.rejectionReason || entry.writtenBack;
      if (!changed) return;
      resetReviewBeforeEvidence(entry);
      saveExpertReview(chapterId, entry);
    });
  }
  function saveExpertReview(chapterId, entry) {
    if (!chapterId || !entry) return;
    const all = loadAllExpertAdoptions();
    if (!all[chapterId]) all[chapterId] = {};
    all[chapterId][entry.expertId] = {
      state: entry.state,
      candidateMode: entry.candidateMode,
      draftText: entry.draftText,
      targetEnvKeys: entry.targetEnvKeys,
      evidenceLinks: entry.evidenceLinks,
      evidenceTouched: entry.evidenceTouched,
      decision: entry.decision,
      decisionNote: entry.decisionNote,
      rejectionReason: entry.rejectionReason,
      originalEnvContent: entry.originalEnvContent,
      originalSnapshotVersion: entry.originalSnapshotVersion,
      writtenBack: entry.writtenBack,
      liveReview: entry.liveReview,
      unlocatedReview: entry.unlocatedReview,
    };
    try { localStorage.setItem(EXPERT_ADOPT_STORE, JSON.stringify(all)); } catch {}
  }

  function captureOriginalEnvContent(entry, envKeys = entry.targetEnvKeys) {
    if (!entry.originalEnvContent) entry.originalEnvContent = {};
    envKeys.forEach((envKey) => {
      if (Object.prototype.hasOwnProperty.call(entry.originalEnvContent, envKey)) return;
      const current = document.querySelector(`.pack-preview [data-pack-field="${envKey}"]`)?.textContent?.trim()
        || loadGeneratedPack(wizSelection.chapter)?.[envKey]
        || "当前环节暂无内容";
      const writtenSuffix = ` · 修订：${entry.draftText}`;
      entry.originalEnvContent[envKey] = entry.writtenBack && current.endsWith(writtenSuffix)
        ? current.slice(0, -writtenSuffix.length)
        : current;
    });
    entry.originalSnapshotVersion = 1;
  }

  function suggestedEvidenceIdsForEntry(entry) {
    const targetSet = new Set(entry.targetEnvKeys);
    return state.keyMoments
      .filter((km) => envKeysForMoment(km).some((key) => targetSet.has(key)))
      .map((km) => km.id);
  }

  function renderReviewEvidence(entry, { autoLink = false } = {}) {
    if (autoLink && entry.state === "candidate" && !entry.evidenceTouched) {
      entry.evidenceLinks = suggestedEvidenceIdsForEntry(entry);
      saveExpertReview(wizSelection.chapter, entry);
    }
    entry.evidenceLinks = entry.evidenceLinks.filter((id) => state.keyMoments.some((km) => km.id === id));
    if ((entry.decision === "supported" || entry.decision === "unsupported") && !entry.evidenceLinks.length) {
      entry.decision = "pending";
      entry.writtenBack = false;
      saveExpertReview(wizSelection.chapter, entry);
    }
    const list = entry.verdict?.querySelector('[data-ec-role="evidence-list"]');
    if (!list) return;
    const suggestions = new Set(suggestedEvidenceIdsForEntry(entry));
    const effectiveLinks = entry.evidenceTouched ? entry.evidenceLinks : [...suggestions];
    const summary = entry.verdict?.querySelector('[data-ec-role="evidence-summary"]');
    const count = entry.verdict?.querySelector('[data-ec-role="evidence-count"]');
    const toggle = entry.verdict?.querySelector('[data-evidence-act="toggle"]');
    if (!state.keyMoments.length) {
      list.innerHTML = `<span class="ec-empty">运行虚拟班后显示可关联记录</span>`;
      if (summary) summary.textContent = "尚无已发生的试教记录";
      if (count) count.textContent = "先运行虚拟班";
      if (toggle) toggle.hidden = true;
      syncReviewVerdictIndex(entry);
      return;
    }
    if (summary) summary.textContent = effectiveLinks.length
      ? `自动关联 ${effectiveLinks.length} 条关键记录`
      : "未匹配同环节记录";
    if (count) count.textContent = effectiveLinks.length
      ? `${effectiveLinks.length} 条相关记录 · 可调整`
      : "0 条相关记录 · 可手动关联";
    if (toggle) {
      toggle.hidden = false;
      if (toggle.dataset.bound !== "1") {
        toggle.dataset.bound = "1";
        toggle.addEventListener("click", () => {
          list.hidden = !list.hidden;
          toggle.setAttribute("aria-expanded", String(!list.hidden));
          toggle.textContent = list.hidden ? "查看" : "收起";
        });
      }
    }
    list.innerHTML = state.keyMoments.map((km, index) => {
      const linked = effectiveLinks.includes(km.id);
      const suggested = suggestions.has(km.id);
      return `<button type="button" class="ec-evidence-chip${linked ? " is-linked" : ""}${suggested ? " is-suggested" : ""}" data-km-id="${escapeHtml(km.id)}" aria-pressed="${linked}" title="${escapeHtml(km.quote || km.cn)}">
        <span><b>${fmtTime(km.tSec)}</b> · ${escapeHtml(km.cn)}</span>
        <small>${linked ? "已关联" : "未关联"} · 记录编号 KM-${String(index + 1).padStart(2, "0")}</small>
      </button>`;
    }).join("");
    list.querySelectorAll("[data-km-id]").forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.dataset.kmId;
        if (!entry.evidenceTouched) entry.evidenceLinks = [...suggestions];
        entry.evidenceTouched = true;
        entry.evidenceLinks = entry.evidenceLinks.includes(id)
          ? entry.evidenceLinks.filter((item) => item !== id)
          : [...entry.evidenceLinks, id];
        entry.decision = "pending";
        entry.writtenBack = false;
        saveExpertReview(wizSelection.chapter, entry);
        syncReviewCardVisual(entry);
        renderReviewEvidence(entry);
        updateExpertAdoptBar();
        composeAssets();
      });
    });
    syncReviewVerdictIndex(entry);
  }

  function refreshAllReviewEvidence({ autoLink = false } = {}) {
    const chapter = getSelected("chapter");
    if (chapter && state.expertCards?.length) renderReviewSurfaces(chapter, { autoLink });
    renderStage3();
  }

  function syncReviewCardVisual(entry) {
    const card = entry.card;
    if (!card) return;
    card.classList.toggle("is-candidate", entry.state === "candidate");
    card.classList.toggle("is-rejected", entry.state === "rejected");
    card.classList.toggle("is-resolved", entry.state !== "pending");
    const verdict = entry.verdict;
    const picker = verdict?.querySelector('[data-ec-role="resolution-picker"]');
    const resolutionSummary = verdict?.querySelector('[data-ec-role="resolution-summary"]');
    const resolved = entry.state === "rejected"
      || (entry.state === "candidate" && entry.decision !== "pending");
    if (picker) picker.hidden = resolved && !entry.isRevising;
    if (resolutionSummary) {
      resolutionSummary.hidden = !resolved || entry.isRevising;
      resolutionSummary.dataset.state = entry.state;
      const copy = resolutionSummary.querySelector(".ec-resolution-copy");
      if (copy) {
        const targets = entry.targetEnvKeys.map((key) => PRACTICE_ENV_BY_KEY[key]?.no).filter(Boolean).join(" / ");
        copy.textContent = entry.state === "rejected"
          ? `暂不修改 · ${entry.rejectionReason || "已保留教师理由"}`
          : entry.decision === "insufficient"
            ? `暂不修改 · ${entry.decisionNote || "本次试教证据不足"}`
            : `${entry.candidateMode === "modified" ? "调整后修改" : "按建议修改"}${targets ? ` · 环节 ${targets}` : ""}`;
      }
    }
    verdict?.querySelectorAll("[data-review-choice]").forEach((button) => {
      const activeChoice = entry.state === "rejected" || entry.decision === "insufficient" || entry.decision === "unsupported"
        ? "rejected"
        : entry.candidateMode;
      button.setAttribute("aria-pressed", String(resolved && button.dataset.reviewChoice === activeChoice));
    });
    const summary = card.querySelector('[data-ec-role="target-summary"]');
    if (summary) summary.textContent = entry.targetEnvKeys.map((key) => PRACTICE_ENV_BY_KEY[key]?.no).filter(Boolean).join(" / ") || "未选择";
    verdict?.classList.toggle("is-candidate", entry.state === "candidate");
    verdict?.classList.toggle("is-rejected", entry.state === "rejected");
    const posttrialStatus = verdict?.querySelector('[data-ec-role="posttrial-status"]');
    if (posttrialStatus) posttrialStatus.textContent = entry.state === "rejected"
      ? "暂不修改"
      : entry.decision === "insufficient"
        ? "证据不足"
        : entry.state === "candidate" && entry.decision === "supported"
          ? (entry.candidateMode === "modified" ? "调整后修改" : "按建议修改")
          : "待处理";
    const noteField = verdict?.querySelector('[data-ec-role="decision-note-field"]');
    const noteToggle = verdict?.querySelector('[data-note-act="toggle"]');
    const noteAvailable = resolved && !entry.isRevising
      && entry.state === "candidate" && ["supported", "unsupported"].includes(entry.decision);
    const noteOpen = noteAvailable && (entry.noteExpanded || !!entry.decisionNote);
    if (noteField) noteField.hidden = !noteOpen;
    if (noteToggle) {
      noteToggle.hidden = !noteAvailable;
      noteToggle.setAttribute("aria-expanded", String(noteOpen));
      noteToggle.textContent = noteOpen ? "收起说明" : "补充说明";
    }
    const note = verdict?.querySelector('[data-ec-role="decision-note"]');
    if (note && note.value !== entry.decisionNote) note.value = entry.decisionNote;
    syncReviewVerdictIndex(entry);
    syncLiveReviewVisual(entry);
  }

  function isLiveReviewStale(entry) {
    return !!entry.liveReview && entry.liveReview.sourceRevision !== getPackRevision(entry.chapterId || wizSelection.chapter);
  }

  // 同环节汇聚不丢弃批注,而是标出“与××共同关注 env0X”——不同学科对同一环节
  // 提出不同问题是交叉验证,教师应看到并列意见而不是被系统裁剪。聚类键只用 envId。
  function liveReviewDupNote(entry) {
    if (!entry.liveReview) return "";
    const others = (state.expertCards || []).filter((other) => other !== entry
      && liveReviewState(other) === "ready"
      && other.liveReview.annotation.targetEnv === entry.liveReview.annotation.targetEnv);
    if (!others.length) return "";
    const envNo = PRACTICE_ENV_BY_KEY[entry.liveReview.annotation.targetEnv]?.no || entry.liveReview.annotation.targetEnv;
    const roles = others.map((other) => (other.expert?.role || "另一路").replace("审校", "")).join("、");
    return ` · 与${roles}共同关注 ${envNo}`;
  }

  function syncLiveReviewVisual(entry) {
    const panel = entry.card?.querySelector('[data-ec-role="live-review"]');
    if (!panel) return;
    const status = panel.querySelector('[data-ec-role="live-status"]');
    const error = panel.querySelector('[data-ec-role="live-error"]');
    const button = panel.querySelector('[data-review-act="live"]');
    const currentRevision = getPackRevision(entry.chapterId || wizSelection.chapter);
    const stale = isLiveReviewStale(entry);
    const loading = entry.liveReviewPhase === "loading";
    const failed = entry.liveReviewPhase === "error";
    panel.dataset.state = loading ? "loading" : failed ? "error" : stale ? "stale" : entry.liveReview ? "ready" : "seed";
    entry.card.classList.toggle("has-stale-review", stale);
    if (status) {
      status.textContent = loading
        ? "本机 Qwen 正在审校当前稿件…"
        : failed
          ? "本次审校未形成可定位批注"
          : stale
            ? `该批注针对第 ${entry.liveReview.sourceRevision} 版 · 当前第 ${currentRevision} 版`
            : entry.liveReview
              ? `本机 Qwen · 已锚定 · 第 ${entry.liveReview.sourceRevision} 版${liveReviewDupNote(entry)}`
              : "固定审校种子";
    }
    if (error) {
      error.textContent = failed ? entry.liveReviewError : "";
      error.hidden = !failed;
    }
    if (button) {
      button.textContent = loading ? "审校中…" : entry.liveReview ? "重新审校" : "用本机 Qwen 审校";
      button.disabled = loading || entry.state !== "pending";
      button.setAttribute("aria-busy", String(loading));
      button.title = entry.state !== "pending" ? "先改判回到待处理状态，才能重新审校" : (entry.expert?.scopeCopy || "只审校本学科主责环节");
    }
    entry.verdict?.querySelectorAll("[data-review-choice]").forEach((choice) => {
      choice.disabled = stale || !hasTrialEvidence();
      choice.title = stale ? "稿件已修改，请先重新审校当前版本" : "";
    });
  }

  function refreshReviewFreshness(chapterId) {
    (state.expertCards || [])
      .filter((entry) => !chapterId || entry.chapterId === chapterId)
      .forEach((entry) => syncLiveReviewVisual(entry));
  }

  // 段落避让提示：单卡重审读取其它卡当前锚点；批量审校只读取“批次开始前”已经
  // 存在的锚点快照。它不是批内逐路避让，也不是门禁；同环节意见允许共存，并由
  // syncLiveReviewVisual 的“与××共同关注 env0X”标记诚实呈现。
  function collectAvoidAnchors(excludeExpertId) {
    return (state.expertCards || [])
      .filter((other) => other.expertId !== excludeExpertId && other.liveReview && !isLiveReviewStale(other))
      .map((other) => ({
        targetEnv: other.liveReview.annotation.targetEnv,
        sourceExcerpt: other.liveReview.annotation.sourceExcerpt,
      }))
      .slice(0, 8);
  }

  function reviewAlignmentError(chapterId, liveReview) {
    if (chapterId !== "mp-ch3-environment" || !liveReview) return "";
    const text = `${liveReview.annotation.issue} ${liveReview.annotation.suggestion}`;
    // 换案例拦截：出现其它章节标志情境词即视为漂移（管理权衡提及成本/可及性不算漂移）。
    if (/肿瘤|处方点评|创新药|DRG|集采|医院控费|药企利润|临床可及性|合理用药结构/.test(text)) {
      return "模型擅自把 SWOT/TOWS 课堂换成了其它药学案例，已拦截并保留当前章节固定审校建议。";
    }
    // 回应校验：凝练批注不复述案例名，沾到本案词汇或审校动作词汇即算已回应。
    if (!/SWOT|TOWS|S\/W\/O\/T|优势|劣势|机会|威胁|内部|外部|环境|门店|药店|药师|慢病|门诊统筹|复购|排班|竞店|策略|权衡|博弈|判定标准|评价标准|证据|分类|文号|发文机关|来源|数据|溯源/.test(text)) {
      return "模型建议未直接回应当前 SWOT/TOWS 案例，已拦截并保留当前章节固定审校建议。";
    }
    return "";
  }

  async function runLiveReview(entry, chapter, { silent = false, avoidAnchors: presetAvoid = null } = {}) {
    const reviewerId = entry.expert?.reviewerId;
    const roleName = entry.expert?.role || "学科审校";
    if (!reviewerId || entry.state !== "pending" || entry.liveReviewPhase === "loading") return "skipped";
    const course = getSelected("course");
    const klass = getSelected("class");
    const session = getSelected("session");
    const selectedChapter = getSelected("chapter");
    const currentPack = currentPackFromPreview();
    if (!course || !klass || !session || !selectedChapter || !currentPack) {
      if (!silent) toast("请先完成实践包四项选择，并确保九个环节都有内容");
      return "skipped";
    }
    if (!global.PharmacoBackend?.reviewPractice) {
      entry.liveReviewPhase = "error";
      entry.liveReviewError = "本机后端未连接；当前仍显示固定审校种子。请用 npm start 打开页面。";
      syncLiveReviewVisual(entry);
      renderReviewFocusSummary();
      return "error";
    }

    const requestedChapterId = selectedChapter.id;
    const sourceRevision = getPackRevision(requestedChapterId);
    // 批量模式传入批次开始时的快照:避让列表不随完成顺序演化,同一稿件两次
    // 批跑的缓存键完全一致,答辩预热才可靠。单卡重审仍用实时列表。
    const avoidAnchors = presetAvoid || collectAvoidAnchors(entry.expertId);
    entry.liveReviewPhase = "loading";
    entry.liveReviewError = "";
    syncLiveReviewVisual(entry);
    renderReviewFocusSummary();
    if (!silent) setStageStatus("ii", `${roleName}正在读取当前稿件`, true, false);
    try {
      const result = await global.PharmacoBackend.reviewPractice({
        reviewerId,
        sourceRevision,
        context: {
          chapterId: selectedChapter.id,
          courseTitle: course.title,
          courseLevel: course.level || "",
          classTitle: klass.title,
          studentCount: klass.n,
          sessionTitle: session.title,
          durationMinutes: session.min,
          chapterTitle: selectedChapter.title,
          topic: selectedChapter.topic,
        },
        currentPack,
        ...(avoidAnchors.length ? { avoidAnchors } : {}),
      });
      if (result?.status !== "anchored") {
        const unlocatedReview = normalizeUnlocatedReview(result?.unlocatedReview);
        if (unlocatedReview) {
          entry.unlocatedReview = unlocatedReview;
          saveExpertReview(requestedChapterId, entry);
        }
        entry.liveReviewPhase = "error";
        entry.liveReviewError = liveReviewFailureCopy(result?.gate?.reason, !!entry.liveReview);
        if (!silent) setStageStatus("ii", "本次审校未通过锚定门禁", false, true);
        syncLiveReviewVisual(entry);
        renderReviewFocusSummary();
        renderUnlocatedBasket(chapter);
        return "unanchored";
      }
      const liveReview = normalizeLiveReview(result);
      if (!liveReview) throw new Error("本地模型返回的审校记录不完整");
      const alignmentError = reviewAlignmentError(requestedChapterId, liveReview);
      if (alignmentError) {
        entry.liveReview = null;
        entry.unlocatedReview = null;
        entry.liveReviewPhase = "error";
        entry.liveReviewError = alignmentError;
        saveExpertReview(requestedChapterId, entry);
        syncLiveReviewVisual(entry);
        renderReviewFocusSummary();
        if (!silent) setStageStatus("ii", "本次审校偏离当前章节，已拦截", false, true);
        return "misaligned";
      }

      entry.liveReview = liveReview;
      entry.unlocatedReview = null;
      entry.sourceText = liveReviewSourceText(liveReview);
      entry.draftText = entry.sourceText;
      entry.sourceComment = { anchor: liveReviewAnchorCopy(liveReview), body: liveReviewBodyMarkup(liveReview) };
      entry.targetEnvKeys = liveReviewTargetKeys(liveReview);
      entry.liveReviewPhase = "idle";
      entry.liveReviewError = "";
      saveExpertReview(requestedChapterId, entry);
      renderReviewSurfaces(chapter, { autoLink:false });
      refreshReviewFreshness(requestedChapterId);
      if (!silent) {
        setStageStatus("ii", `${roleName}已锚定到 ${PRACTICE_ENV_BY_KEY[liveReview.annotation.targetEnv]?.no || liveReview.annotation.targetEnv}`, false, true);
        toast(`本机 Qwen 审校完成 · 已锚定第 ${sourceRevision} 版稿件`);
      }
      return "anchored";
    } catch (error) {
      console.warn("[practice-runtime] 本机 Qwen 审校失败", error);
      entry.liveReviewPhase = "error";
      const preserved = entry.liveReview
        ? "现有批注未被替换；若其已过期，仍不能进入候选。"
        : "当前仍显示固定审校种子。";
      entry.liveReviewError = error?.code === "MODEL_UNAVAILABLE"
        ? `本机模型未就绪；${preserved}`
        : `本机后端或模型未完成审校；${preserved}`;
      if (!silent) setStageStatus("ii", "本机审校暂不可用", false, true);
      syncLiveReviewVisual(entry);
      renderReviewFocusSummary();
      return "error";
    }
  }

  // ---- 五路批量审校：并发上限 2,完成一张呈现一张,已判定的卡不静默覆盖 ----
  const LIVE_REVIEW_CONCURRENCY = 2;
  let liveReviewBatchActive = false;

  function batchBarEls() {
    const bar = document.querySelector('#stage-ii [data-ec-role="batch-bar"]');
    return {
      bar,
      button: bar?.querySelector('[data-review-act="run-all"]') || null,
      status: bar?.querySelector('[data-ec-role="drawer-batch-status"]') || null,
    };
  }

  function setBatchStatus(text) {
    const { status } = batchBarEls();
    if (status) status.textContent = text;
    const summaryStatus = document.querySelector('#stage-ii [data-review-role="focus-summary"] [data-ec-role="batch-status"]');
    if (summaryStatus) summaryStatus.textContent = text;
  }

  function updateBatchIdleStatus() {
    if (liveReviewBatchActive) return;
    const phase = document.documentElement.dataset.backend;
    setBatchStatus(phase === "ready" || phase === "conflict"
      ? "本机 Qwen 已连接 · 可对当前稿件运行五路审校"
      : "本机后端未连接 · 当前显示固定审校种子");
  }

  async function runAllLiveReviews({ automatic = false } = {}) {
    if (liveReviewBatchActive) return;
    const chapter = getSelected("chapter");
    if (!getSelected("course") || !getSelected("class") || !getSelected("session") || !chapter || !currentPackFromPreview()) {
      if (!automatic) toast("请先完成实践包四项选择，并确保九个环节都有内容");
      return;
    }
    const phase = document.documentElement.dataset.backend;
    if (!global.PharmacoBackend?.reviewPractice || (phase !== "ready" && phase !== "conflict")) {
      setBatchStatus("本机后端未连接 · 请用 npm start 打开页面后重试");
      if (!automatic) toast("本机后端未连接 · 当前仍显示固定审校种子");
      return;
    }
    const entries = state.expertCards || [];
    const targets = entries.filter((en) => en.expert?.reviewerId && en.state === "pending"
      && en.liveReviewPhase !== "loading" && (!en.liveReview || isLiveReviewStale(en)));
    const decided = entries.filter((en) => en.state !== "pending").length;
    const fresh = entries.filter((en) => en.state === "pending" && en.liveReview && !isLiveReviewStale(en)).length;
    if (!targets.length) {
      setBatchStatus(`没有需要审校的卡${decided ? ` · ${decided} 张已判定` : ""}${fresh ? ` · ${fresh} 张批注仍为当前版` : ""}`);
      return;
    }
    liveReviewBatchActive = true;
    const { button } = batchBarEls();
    if (button) { button.disabled = true; button.setAttribute("aria-busy", "true"); }
    setStageStatus("ii", "五路学科审校进行中", true, false);
    const chapterId = chapter.id;
    const queue = [...targets];
    // 只冻结批次开始前已存在的有效锚点。并发中的新结果不会追加到该列表，
    // 因而同一批五路结果的差异来自职责 scope / prompt，而非完成顺序。
    const batchAvoid = collectAvoidAnchors(null);
    const tally = { anchored: 0, unanchored: 0, error: 0, skipped: 0 };
    let done = 0;
    const worker = async () => {
      while (queue.length) {
        if (getSelected("chapter")?.id !== chapterId) { tally.skipped += queue.length; queue.length = 0; return; }
        const entry = queue.shift();
        setBatchStatus(`审校中 ${Math.min(done + 1, targets.length)}/${targets.length} · ${entry.expert?.role || "学科审校"} · 已锚定 ${tally.anchored}`);
        const outcome = await runLiveReview(entry, chapter, { silent: true, avoidAnchors: batchAvoid });
        tally[outcome] = (tally[outcome] || 0) + 1;
        done += 1;
      }
    };
    await Promise.all(Array.from({ length: Math.min(LIVE_REVIEW_CONCURRENCY, queue.length) }, () => worker()));
    liveReviewBatchActive = false;
    if (button) { button.disabled = false; button.removeAttribute("aria-busy"); }
    const parts = [`${tally.anchored} 已锚定`];
    if (tally.unanchored) parts.push(`${tally.unanchored} 未定位（保留原批注）`);
    if (tally.error) parts.push(`${tally.error} 未完成`);
    if (tally.skipped) parts.push(`${tally.skipped} 因切换章节中止`);
    if (decided) parts.push(`跳过 ${decided} 张已判定卡`);
    setBatchStatus(`五路审校结束 · ${parts.join(" · ")}`);
    renderReviewFocusSummary();
    setStageStatus("ii", "五路学科审校结束", false, true);
    if (!automatic) toast(`五路审校结束 · ${parts.join(" · ")}`);
  }

  let stageTwoEntered = false;
  let autoReviewKey = "";

  function maybeAutoRunLiveReviews() {
    if (!stageTwoEntered || liveReviewBatchActive) return;
    const phase = document.documentElement.dataset.backend;
    const chapter = getSelected("chapter");
    if (!chapter || !global.PharmacoBackend?.reviewPractice || (phase !== "ready" && phase !== "conflict")) return;
    const key = `${chapter.id}@${getPackRevision(chapter.id)}`;
    if (autoReviewKey === key) return;
    autoReviewKey = key;
    runAllLiveReviews({ automatic:true });
  }

  function wireStageTwoAutoReview() {
    const stage = document.getElementById("stage-ii");
    if (!stage || stage.dataset.autoReviewWired === "1") return;
    stage.dataset.autoReviewWired = "1";
    if (!("IntersectionObserver" in global)) {
      stageTwoEntered = true;
      maybeAutoRunLiveReviews();
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      stageTwoEntered = true;
      observer.disconnect();
      maybeAutoRunLiveReviews();
    }, { rootMargin:"200px 0px" });
    observer.observe(stage);
  }

  function wireLiveReviewBatch() {
    const { bar, button } = batchBarEls();
    if (!bar || bar.dataset.wired === "1") return;
    bar.dataset.wired = "1";
    button?.addEventListener("click", () => { runAllLiveReviews(); });
    global.addEventListener("pharmaco:backend-status", () => {
      updateBatchIdleStatus();
      maybeAutoRunLiveReviews();
    });
    updateBatchIdleStatus();
    wireStageTwoAutoReview();
    maybeAutoRunLiveReviews();
  }

  function wireReviewCard(entry, chapter) {
    const card = entry.card;
    if (!card) return;
    const verdict = entry.verdict;
    const body = card.querySelector('[data-ec-role="body"]');
    const posttrialBody = verdict?.querySelector('[data-ec-role="posttrial-body"]');
    const editPanel = verdict?.querySelector('[data-ec-role="edit-panel"]');
    const textarea = editPanel?.querySelector("textarea");
    const editError = editPanel?.querySelector('[data-ec-role="edit-error"]');
    const rejectPanel = verdict?.querySelector('[data-ec-role="reject-panel"]');
    const rejectInput = rejectPanel?.querySelector("input");
    const rejectKind = rejectPanel?.querySelector('[data-ec-role="defer-kind"]');
    const rejectError = rejectPanel?.querySelector('[data-ec-role="reject-error"]');
    const candidateError = verdict?.querySelector('[data-ec-role="candidate-error"]');

    const showInlineError = (element, message) => {
      if (!element) return;
      element.textContent = message;
      element.hidden = !message;
    };
    const renderEntryBody = () => {
      [body, posttrialBody].filter(Boolean).forEach((target) => {
        if (entry.draftText === entry.sourceText) target.innerHTML = entry.sourceComment.body;
        else target.textContent = entry.draftText;
      });
    };
    renderEntryBody();
    const posttrialSource = verdict?.querySelector('[data-ec-role="posttrial-source"]');
    const sourceToggle = verdict?.querySelector('[data-source-act="toggle"]');
    const syncSourceDisclosure = () => {
      if (!posttrialSource || !sourceToggle) return;
      posttrialSource.classList.toggle("is-expanded", !!entry.sourceExpanded);
      sourceToggle.setAttribute("aria-expanded", String(!!entry.sourceExpanded));
      sourceToggle.textContent = entry.sourceExpanded ? "收起" : "展开全文";
    };
    sourceToggle?.addEventListener("click", () => {
      entry.sourceExpanded = !entry.sourceExpanded;
      syncSourceDisclosure();
    });
    syncSourceDisclosure();
    const showEvidenceGate = (message) => {
      showInlineError(candidateError, message);
      const list = verdict?.querySelector('[data-ec-role="evidence-list"]');
      const toggle = verdict?.querySelector('[data-evidence-act="toggle"]');
      if (list) list.hidden = false;
      if (toggle) {
        toggle.hidden = false;
        toggle.setAttribute("aria-expanded", "true");
        toggle.textContent = "收起记录";
      }
      const firstEvidence = list?.querySelector("[data-km-id]");
      if (firstEvidence) firstEvidence.focus({ preventScroll: true });
      verdict?.querySelector(".ec-evidence")?.scrollIntoView({ behavior:"smooth", block:"nearest" });
    };
    const commitCandidate = (mode, text) => {
      showInlineError(candidateError, "");
      if (!hasTrialEvidence()) {
        showEvidenceGate("尚无已发生的试教记录；请先播放或拖动录播。");
        toast("证据出现前只能阅读审校与标记观察点");
        return;
      }
      if (isLiveReviewStale(entry)) {
        toast("该批注针对旧版稿件 · 请先重新审校当前版本");
        return;
      }
      if (!entry.targetEnvKeys.length) {
        toast("请先为这条审校意见选择至少一个目标教学环节");
        return;
      }
      const nextEvidenceLinks = entry.evidenceTouched
        ? entry.evidenceLinks
        : suggestedEvidenceIdsForEntry(entry);
      if (!nextEvidenceLinks.length) {
        showEvidenceGate("这条建议尚未关联到同环节记录；请在上方手动选择至少一条，再加入修订候选。");
        toast("尚无可支撑修改的试教记录 · 请先查看并关联记录，或选择“暂不修改”");
        return;
      }
      captureOriginalEnvContent(entry);
      entry.state = "candidate";
      entry.candidateMode = mode;
      entry.draftText = text;
      entry.rejectionReason = "";
      entry.evidenceLinks = nextEvidenceLinks;
      entry.decision = "supported";
      entry.decisionNote = "";
      entry.writtenBack = false;
      entry.isRevising = false;
      entry.noteExpanded = false;
      if (editPanel) editPanel.hidden = true;
      if (rejectPanel) rejectPanel.hidden = true;
      showInlineError(editError, "");
      showInlineError(rejectError, "");
      showInlineError(candidateError, "");
      renderEntryBody();
      saveExpertReview(chapter?.id, entry);
      renderReviewSurfaces(chapter);
      updateExpertAdoptBar();
      composeAssets();
    };

    card.querySelector('[data-review-act="live"]')?.addEventListener("click", () => {
      runLiveReview(entry, chapter);
    });

    verdict?.querySelector('[data-review-choice="original"]')?.addEventListener("click", () => {
      commitCandidate("original", entry.sourceText);
    });
    verdict?.querySelector('[data-review-choice="modified"]')?.addEventListener("click", () => {
      if (!hasTrialEvidence()) { toast("证据出现前只能阅读审校与标记观察点"); return; }
      showInlineError(candidateError, "");
      textarea.value = entry.candidateMode === "modified" ? entry.draftText : entry.sourceText;
      if (rejectPanel) rejectPanel.hidden = true;
      showInlineError(editError, "");
      editPanel.hidden = false;
      textarea.focus();
    });
    editPanel?.querySelector('[data-edit-act="save"]')?.addEventListener("click", () => {
      const next = textarea.value.trim();
      if (!next) { showInlineError(editError, "修改后意见不能为空"); return; }
      const mode = next === entry.sourceText ? "original" : "modified";
      commitCandidate(mode, next);
      toast(`${entry.expert.role} · ${mode === "modified" ? "修改后意见" : "原意见"}已进入修订候选`);
    });
    editPanel?.querySelector('[data-edit-act="cancel"]')?.addEventListener("click", () => {
      editPanel.hidden = true;
      showInlineError(editError, "");
      entry.isRevising = false;
      syncReviewCardVisual(entry);
    });

    card.querySelectorAll('[data-ec-role="target-input"]').forEach((input) => {
      input.addEventListener("change", () => {
        const selected = Array.from(card.querySelectorAll('[data-ec-role="target-input"]:checked')).map((item) => item.value);
        if (!selected.length) {
          input.checked = true;
          toast("至少保留一个目标教学环节");
          return;
        }
        captureOriginalEnvContent(entry, selected);
        entry.targetEnvKeys = selected;
        entry.evidenceTouched = false;
        entry.evidenceLinks = entry.state === "candidate" ? suggestedEvidenceIdsForEntry(entry) : [];
        entry.decision = "pending";
        entry.writtenBack = false;
        saveExpertReview(chapter?.id, entry);
        renderReviewSurfaces(chapter, { autoLink:false });
        updateExpertAdoptBar();
        composeAssets();
      });
    });

    verdict?.querySelector('[data-review-choice="rejected"]')?.addEventListener("click", () => {
      if (!hasTrialEvidence()) { toast("证据出现前只能阅读审校与标记观察点"); return; }
      if (editPanel) editPanel.hidden = true;
      showInlineError(rejectError, "");
      rejectPanel.hidden = false;
      if (rejectKind) rejectKind.value = entry.decision === "insufficient" ? "insufficient" : "not-applicable";
      rejectInput.value = entry.decision === "insufficient" ? "" : entry.rejectionReason || "";
      rejectInput.focus();
    });
    rejectPanel?.querySelector('[data-reject-act="confirm"]')?.addEventListener("click", () => {
      if (!hasTrialEvidence()) { toast("证据出现前只能阅读审校与标记观察点"); return; }
      const kind = rejectKind?.value || "insufficient";
      const reason = rejectInput.value.trim();
      const reasonLabel = {
        insufficient: "本次试教证据不足",
        "not-applicable": "建议不适用于本课",
        defer: "本轮暂缓处理",
      }[kind] || "暂不修改";
      if (kind === "insufficient") {
        captureOriginalEnvContent(entry);
        entry.state = "candidate";
        entry.candidateMode = "original";
        entry.draftText = entry.sourceText;
        entry.rejectionReason = "";
        if (!entry.evidenceTouched) entry.evidenceLinks = suggestedEvidenceIdsForEntry(entry);
        entry.decision = "insufficient";
        entry.decisionNote = reason || reasonLabel;
      } else {
        entry.state = "rejected";
        entry.candidateMode = null;
        entry.rejectionReason = reason ? `${reasonLabel}：${reason}` : reasonLabel;
        entry.decision = "pending";
        entry.decisionNote = "";
        entry.evidenceLinks = [];
      }
      entry.writtenBack = false;
      entry.isRevising = false;
      entry.noteExpanded = false;
      rejectPanel.hidden = true;
      showInlineError(rejectError, "");
      saveExpertReview(chapter?.id, entry);
      renderReviewSurfaces(chapter, { autoLink:false });
      updateExpertAdoptBar();
      composeAssets();
      toast(`${entry.expert.role} · 已记录“暂不修改”`);
    });
    rejectPanel?.querySelector('[data-reject-act="cancel"]')?.addEventListener("click", () => {
      rejectPanel.hidden = true;
      showInlineError(rejectError, "");
      entry.isRevising = false;
      syncReviewCardVisual(entry);
    });

    verdict?.querySelector('[data-review-act="revise"]')?.addEventListener("click", () => {
      entry.isRevising = true;
      entry.noteExpanded = false;
      if (editPanel) editPanel.hidden = true;
      if (rejectPanel) rejectPanel.hidden = true;
      syncReviewCardVisual(entry);
    });

    verdict?.querySelector('[data-note-act="toggle"]')?.addEventListener("click", () => {
      entry.noteExpanded = !entry.noteExpanded;
      syncReviewCardVisual(entry);
      if (entry.noteExpanded) verdict.querySelector('[data-ec-role="decision-note"]')?.focus();
    });

    verdict?.querySelector('[data-ec-role="decision-note"]')?.addEventListener("blur", (event) => {
      entry.decisionNote = event.target.value.trim();
      saveExpertReview(chapter?.id, entry);
      renderMigrate();
      renderStage3();
    });

    const ACT_VERBS = { upload: "上传文件", link: "链接知识库", distill: "蒸馏学者" };
    card.querySelectorAll(".ec-inject-btn").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const act = button.dataset.act;
        toast(`${entry.expert.role} · ${ACT_VERBS[act] || "接入"}\n${entry.expert.inject?.[act] || ""}\n（demo · 接入位待对接）`);
      });
    });
  }

  function renderSceneBeats(chapter) {
    const scene = document.querySelector(".scene");
    if (!scene) return;
    const sceneFoot = scene.querySelector(".scene-foot");
    // 移除现有 beat-row（保留 .scene-foot）
    scene.querySelectorAll(".beat-row").forEach((el) => el.remove());
    const beats = getScriptForChapter(chapter);
    beats.forEach((b) => {
      const row = document.createElement("div");
      if (b.kind === "marker") {
        row.className = "beat-row marker";
        row.innerHTML = `<span></span><span></span><span class="what">${b.text}</span>`;
      } else {
        row.className = "beat-row" + (b.note ? " note" : "");
        const roleClass = `role-${b.role}`;
        const roleText = b.role === "T" ? "教师" : b.role === "A" ? "Agent" : (b.who || "学生");
        row.innerHTML = `
          <span class="ts">${b.ts}</span>
          <span class="role ${roleClass}">${roleText}</span>
          <span class="what">${b.text}</span>
        `;
      }
      if (sceneFoot) scene.insertBefore(row, sceneFoot);
      else scene.appendChild(row);
    });
    // 重读 beats 到 state
    ingestExistingBeats();
  }

  function renderRiskAndFlag(chapter) {
    const riskList = document.querySelector("#stage-ii .risk-list");
    const flagList = document.querySelector("#stage-ii .flag-list");
    if (riskList) {
      const risks = getRisksForChapter(chapter);
      riskList.innerHTML = risks.map((r) => `
        <div class="risk-item">
          <span class="sev lvl-${r.sev}">${r.sev === "h" ? "高" : r.sev === "m" ? "中" : "低"}</span>
          <div><b>${r.lab}</b>——${r.body}</div>
        </div>
      `).join("");
      // 同步右上角的计数
      const ct = document.querySelector("#stage-ii .sim-panel:nth-of-type(2) h5 .ct");
      if (ct) ct.textContent = `${risks.length} 项`;
    }
    if (flagList) {
      const flags = getFlagsForChapter(chapter);
      flagList.innerHTML = flags.map((f) => `
        <div class="flag-item">
          <span class="fid">${f.fid}</span>
          <div>${f.body}</div>
        </div>
      `).join("");
      const ct = document.querySelector("#stage-ii .sim-panel:nth-of-type(3) h5 .ct");
      if (ct) ct.textContent = `${flags.length} 处`;
    }
  }

  // ──────────────────────────────────────────────────────────────
  // Agent inspector modal — click a persona cell to see the full agent
  // ──────────────────────────────────────────────────────────────
  function ensureInspectorCSS() {
    if (document.getElementById("__pp_inspector_style")) return;
    const css = `
.pp-ai-overlay {
  position: fixed; inset: 0; background: rgba(20,18,16,.45);
  display: none; align-items: center; justify-content: center;
  z-index: 9999; backdrop-filter: blur(2px);
}
.pp-ai-overlay.is-open { display: flex; }
.pp-ai-card {
  width: min(720px, 92vw); max-height: 86vh; overflow-y: auto;
  background: var(--ivory); color: var(--ink);
  border: 1px solid var(--ink); border-radius: 14px;
  box-shadow: 8px 8px 0 var(--ink);
  padding: 24px 28px; position: relative;
  font-family: var(--serif-cn);
}
.pp-ai-close {
  position: absolute; top: 12px; right: 14px;
  width: 28px; height: 28px; border-radius: 50%;
  background: var(--paper-2); border: 1px solid var(--rule);
  cursor: pointer; font-size: var(--fs-md); line-height: 1;
  display: grid; place-items: center;
}
.pp-ai-close:hover { background: var(--amber-deep); color: var(--ivory); }
.pp-ai-head {
  display: grid; grid-template-columns: auto 1fr auto; gap: 14px;
  align-items: center; padding-bottom: 14px;
  border-bottom: 1px dashed var(--rule); margin-bottom: 14px;
}
.pp-ai-id {
  width: 48px; height: 48px; border-radius: 10px;
  background: var(--ink); color: var(--ivory);
  font-family: var(--serif-en); font-style: italic; font-size: var(--fs-xl); font-weight: 500;
  display: grid; place-items: center;
}
.pp-ai-who .pp-ai-alias { font-size: var(--fs-lg); font-weight: 600; }
.pp-ai-who .pp-ai-demo { font-family: var(--mono); font-size: var(--fs-2xs); color: var(--mute); margin-top: 2px; letter-spacing: .04em; }
.pp-ai-stance {
  padding: 6px 12px; border-radius: 999px;
  font-family: var(--mono); font-size: var(--fs-2xs); letter-spacing: .04em;
  background: var(--paper-2); color: var(--ink);
  display: flex; align-items: center; gap: 6px;
}
.pp-ai-stance small { font-size: var(--fs-2xs); opacity: .6; }
.pp-ai-stance.s-a { background: color-mix(in srgb, var(--amber) 18%, transparent); color: var(--amber-deep); }
.pp-ai-stance.s-b { background: rgba(77,98,87,.2); color: var(--sage); }
.pp-ai-stance.s-c { background: rgba(112,82,168,.16); color: var(--violet); }
.pp-ai-stance.s-d { background: rgba(100,100,100,.12); color: #555; }
.pp-ai-row {
  font-size: var(--fs-sm); line-height: 1.65; margin-bottom: 8px;
  padding: 8px 12px; background: var(--paper); border-radius: 6px;
}
.pp-ai-row b {
  display: inline-block; min-width: 56px; margin-right: 8px;
  font-family: var(--mono); font-size: var(--fs-2xs); letter-spacing: .08em; text-transform: uppercase;
  color: var(--amber-deep); font-weight: 600; vertical-align: middle;
}
.pp-ai-row.is-caveat { background: color-mix(in srgb, var(--amber) 6%, transparent); border-left: 2px solid var(--amber-deep); }
.pp-ai-row small { display: block; margin-left: 64px; margin-top: 4px; font-family: var(--mono); font-size: var(--fs-2xs); color: var(--mute); }
.pp-ai-grid2 {
  display: grid; grid-template-columns: 1fr 1fr; gap: 14px;
  margin-top: 14px;
}
.pp-ai-grid2 > div {
  background: var(--paper-2); border-radius: 8px; padding: 12px 14px;
}
.pp-ai-grid2 h5 {
  font-family: var(--mono); font-size: var(--fs-2xs); letter-spacing: .12em;
  text-transform: uppercase; color: var(--mute);
  margin: 0 0 10px; padding-bottom: 6px;
  border-bottom: 1px dashed var(--rule);
}
.pp-ai-grid2 > div > div { font-size: var(--fs-xs); line-height: 1.6; margin-bottom: 6px; color: var(--ink-2); }
.pp-ai-grid2 > div > div b {
  font-family: var(--mono); font-size: var(--fs-2xs); letter-spacing: .06em; text-transform: uppercase;
  color: var(--amber-deep); margin-right: 6px; font-weight: 600;
}
.pp-ai-meter {
  display: grid; grid-template-columns: 78px 1fr 36px; align-items: center;
  gap: 8px; margin-bottom: 6px;
  font-family: var(--mono); font-size: var(--fs-2xs);
}
.pp-ai-meter span { color: var(--mute); }
.pp-ai-meter > div {
  height: 4px; background: rgba(0,0,0,.08); border-radius: 2px; overflow: hidden;
}
.pp-ai-meter > div i {
  display: block; height: 100%; background: var(--amber-deep);
  transition: width .2s;
}
.pp-ai-meter b { text-align: right; color: var(--ink); position: relative; }
.pp-ai-meter b em {
  display: block; font-style: normal; font-size: var(--fs-2xs);
  font-family: var(--mono); letter-spacing: .04em;
  position: absolute; right: 0; top: 100%; margin-top: 1px;
  white-space: nowrap;
}
.pp-ai-meter b em.is-down { color: var(--amber-deep); }
.pp-ai-meter b em.is-up { color: var(--sage); }
.pp-ai-eventlog {
  margin-top: 14px; padding: 12px 14px;
  background: var(--paper); border: 1px dashed var(--rule); border-radius: 8px;
}
.pp-ai-eventlog h5 {
  font-family: var(--mono); font-size: var(--fs-2xs); letter-spacing: .12em;
  text-transform: uppercase; color: var(--mute); margin: 0 0 8px;
}
.pp-ai-ev {
  display: grid; grid-template-columns: 50px 1fr auto; gap: 10px;
  padding: 5px 0; border-bottom: 1px dotted var(--rule);
  font-size: var(--fs-2xs); align-items: center;
}
.pp-ai-ev:last-child { border-bottom: 0; }
.pp-ai-ev-t {
  font-family: var(--mono); color: var(--amber-deep);
  font-weight: 600; font-size: var(--fs-2xs);
}
.pp-ai-ev-why { color: var(--ink-2); font-family: var(--serif-cn); }
.pp-ai-ev-fx { display: flex; gap: 6px; }
.pp-ai-ev-fx span {
  font-family: var(--mono); font-size: var(--fs-2xs);
  padding: 1px 5px; border-radius: 3px;
}
.pp-ai-ev-fx span.is-down { background: color-mix(in srgb, var(--amber) 14%, transparent); color: var(--amber-deep); }
.pp-ai-ev-fx span.is-up { background: rgba(77,98,87,.14); color: var(--sage); }
.pp-ai-resp {
  padding: 6px 8px; margin-bottom: 5px; background: var(--ivory);
  border-left: 2px solid var(--amber-deep); border-radius: 4px;
}
.pp-ai-rkey {
  display: block; font-family: var(--mono); font-size: var(--fs-2xs);
  color: var(--mute); letter-spacing: .06em; margin-bottom: 3px;
}
.pp-ai-resp > div {
  font-family: var(--serif-cn); font-size: var(--fs-2xs); line-height: 1.55; color: var(--ink-2);
  font-style: italic;
}
.pp-ai-drama {
  margin-top: 14px; padding: 14px 16px;
  background: var(--ink); color: var(--ivory); border-radius: 10px;
}
.pp-ai-drama h5 {
  font-family: var(--mono); font-size: var(--fs-2xs); letter-spacing: .14em;
  text-transform: uppercase; color: color-mix(in srgb, var(--amber) 85%, transparent);
  margin: 0 0 10px;
}
.pp-ai-drama > div {
  font-size: var(--fs-xs); line-height: 1.6; margin-bottom: 6px;
  font-family: var(--serif-cn);
}
.pp-ai-drama > div b {
  font-family: var(--mono); font-size: var(--fs-2xs); letter-spacing: .08em; text-transform: uppercase;
  color: color-mix(in srgb, var(--amber) 85%, transparent); margin-right: 6px; font-weight: 500;
}
.pp-ai-rubric {
  margin-top: 14px; padding: 12px 14px;
  background: var(--paper-2); border-radius: 8px;
}
.pp-ai-rubric h5 {
  font-family: var(--mono); font-size: var(--fs-2xs); letter-spacing: .12em;
  text-transform: uppercase; color: var(--mute);
  margin: 0 0 8px;
}
.pp-ai-rubric-row {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px;
  font-family: var(--mono); font-size: var(--fs-2xs); color: var(--ink-2);
}
.pp-ai-rubric-row span {
  padding: 3px 6px; background: var(--ivory); border-radius: 3px;
  text-align: center;
}
.pp-ai-foot {
  margin-top: 12px; padding-top: 10px; border-top: 1px dashed var(--rule);
  font-family: var(--mono); font-size: var(--fs-2xs); color: var(--mute);
  letter-spacing: .04em; display: flex; justify-content: space-between;
}
`;
    const el = document.createElement("style");
    el.id = "__pp_inspector_style";
    el.textContent = css;
    document.head.appendChild(el);
  }

  function stanceClassFor(stance) {
    if (!stance) return "";
    if (stance.includes("医保") || stance.includes("政策") || stance.includes("市场")) return "s-a";
    if (stance.includes("慢病") || stance.includes("门店") || stance.includes("顾客")) return "s-b";
    if (stance.includes("药企") || stance.includes("产业") || stance.includes("竞争")) return "s-c";
    if (stance.includes("观望") || stance.includes("沉默")) return "s-d";
    return "";
  }

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));
  }

  function renderAgentInspectorHTML(a) {
    const p = a.persona || {};
    const k = a.knowledge || {};
    const s_init = a.state_init || {};
    const rt = getAgentRuntime(a.id);
    const s = rt || s_init; // 当前 runtime 状态 (fallback 到 init)
    const d = a.drama || {};
    const r = a.responses || {};
    const g = a.graph || {};
    const ri = a.rubric_init || {};
    const meter = (v) => Math.max(0, Math.min(1, +v || 0));
    const meterRow = (label, val, initVal) => {
      const delta = (initVal != null) ? (val - initVal) : 0;
      const deltaSign = delta > 0 ? "+" : "";
      const deltaCls = Math.abs(delta) < 0.001 ? "" : (delta > 0 ? "is-up" : "is-down");
      const deltaTxt = Math.abs(delta) < 0.001 ? "" : `<em class="${deltaCls}">${deltaSign}${delta.toFixed(2)}</em>`;
      return `<div class="pp-ai-meter"><span>${label}</span><div><i style="width:${meter(val)*100}%"></i></div><b>${meter(val).toFixed(2)}${deltaTxt}</b></div>`;
    };
    const respEntries = Object.entries(r).slice(0, 4);
    const eventLog = (rt?._events || []).slice(-5).reverse();

    return `
      <div class="pp-ai-card" role="dialog" aria-modal="true">
        <button class="pp-ai-close" aria-label="关闭">×</button>
        <div class="pp-ai-head">
          <div class="pp-ai-id">${escapeHtml(a.id)}</div>
          <div class="pp-ai-who">
            <div class="pp-ai-alias">${escapeHtml(a.identity?.alias || "")}</div>
            <div class="pp-ai-demo">${escapeHtml(a.identity?.demo || "")} · ${escapeHtml(a.identity?.sid || "")} · ${escapeHtml(a.identity?.seat || "")}</div>
          </div>
          <div class="pp-ai-stance">立场 ${s_init.stance_position != null ? (+s_init.stance_position).toFixed(2) : "—"} <small>强度 ${escapeHtml(String(p.stance_strength ?? ""))}/5</small></div>
        </div>

        <div class="pp-ai-row"><b>立场</b>${escapeHtml(p.belief || "—")}</div>
        ${p.belief_with_caveat ? `<div class="pp-ai-row is-caveat"><b>但</b>${escapeHtml(p.belief_with_caveat)}</div>` : ""}
        <div class="pp-ai-row"><b>动摇</b>${escapeHtml(p.doubt || "—")}</div>
        <div class="pp-ai-row"><b>风格</b>${escapeHtml(p.style || "—")}${p.tics?.length ? `<small>口头禅 · ${p.tics.map(escapeHtml).join(" · ")}</small>` : ""}</div>

        <div class="pp-ai-grid2">
          <div>
            <h5>状态（t=${fmtTime(state.tSec)} · ${rt ? "实时" : "初值"}）</h5>
            ${meterRow("注意力", s.attention, rt ? s_init.attention : null)}
            ${meterRow("发言意愿", s.speak_motivation, rt ? s_init.speak_motivation : null)}
            ${meterRow("社交安全感", s.social_safety, rt ? s_init.social_safety : null)}
            ${meterRow("疲劳", s.fatigue, rt ? s_init.fatigue : null)}
          </div>
          <div>
            <h5>知识边界</h5>
            ${k.confident?.length ? `<div><b>擅长</b>${k.confident.slice(0,3).map(escapeHtml).join("；")}</div>` : ""}
            ${k.aware?.length ? `<div><b>了解</b>${k.aware.slice(0,2).map(escapeHtml).join("；")}</div>` : ""}
            ${k.weak?.length ? `<div><b>薄弱</b>${k.weak.slice(0,3).map(escapeHtml).join("；")}</div>` : ""}
            ${k.anchors?.length ? `<div><b>锚点</b>${k.anchors.slice(0,2).map(escapeHtml).join("；")}</div>` : ""}
          </div>
        </div>

        <div class="pp-ai-grid2">
          <div>
            <h5>响应库</h5>
            ${respEntries.map(([key, val]) => {
              const txt = Array.isArray(val) ? val[0] : (typeof val === "string" ? val : "");
              return txt ? `<div class="pp-ai-resp"><span class="pp-ai-rkey">${escapeHtml(key)}</span><div>"${escapeHtml(txt)}"</div></div>` : "";
            }).join("")}
          </div>
          <div>
            <h5>关系网</h5>
            ${g.allies?.length ? `<div><b>盟友</b>${g.allies.map(escapeHtml).join(" · ")}</div>` : ""}
            ${g.rivals?.length ? `<div><b>对手</b>${g.rivals.map(escapeHtml).join(" · ")}</div>` : ""}
            ${g.watches?.length ? `<div><b>关注</b>${g.watches.map(escapeHtml).join(" · ")}</div>` : ""}
            ${g.ignores?.length ? `<div><b>忽略</b>${g.ignores.map(escapeHtml).join(" · ")}</div>` : ""}
            ${g.ally_basis ? `<div><b>盟基</b>${escapeHtml(g.ally_basis)}</div>` : ""}
          </div>
        </div>

        <div class="pp-ai-drama">
          <h5>内心戏剧</h5>
          ${d.tension ? `<div><b>张力</b>${escapeHtml(d.tension)}</div>` : ""}
          ${d.growth ? `<div><b>可能成长</b>${escapeHtml(d.growth)}</div>` : ""}
          ${d.wont_change ? `<div><b>不会变</b>${escapeHtml(d.wont_change)}</div>` : ""}
          ${d.fatigue_trigger ? `<div><b>疲劳触发</b>${escapeHtml(d.fatigue_trigger)}</div>` : ""}
          ${d.attention_decay ? `<div><b>注意力衰减</b>${escapeHtml(d.attention_decay)}</div>` : ""}
        </div>

        <div class="pp-ai-rubric">
          <h5>评价维度初值（6 维 · 来源：${escapeHtml(ri._provenance_note || "designed")}）</h5>
          <div class="pp-ai-rubric-row">
            <span>政策引用 ${ri.policy_citation ?? "—"}/5</span>
            <span>立场迁移 ${ri.stance_shift ?? "—"}/5</span>
            <span>反思深度 ${ri.reflection ?? "—"}/5</span>
            <span>团队贡献 ${ri.team_contrib ?? "—"}/5</span>
            <span>证据使用 ${ri.evidence_use ?? "—"}/5</span>
            <span>提问质量 ${ri.question_quality ?? "—"}/5</span>
          </div>
        </div>

        ${eventLog.length ? `
        <div class="pp-ai-eventlog">
          <h5>近 5 次状态事件（最新在前）</h5>
          ${eventLog.map(ev => {
            const fxStr = Object.entries(ev.fx).map(([k, v]) => {
              const sign = v > 0 ? "+" : "";
              const cls = v > 0 ? "is-up" : "is-down";
              return `<span class="${cls}">${k} ${sign}${v.toFixed(2)}</span>`;
            }).join(" ");
            return `<div class="pp-ai-ev"><span class="pp-ai-ev-t">${fmtTime(ev.t)}</span><span class="pp-ai-ev-why">${escapeHtml(ev.why)}</span><span class="pp-ai-ev-fx">${fxStr}</span></div>`;
          }).join("")}
        </div>
        ` : ""}

        <div class="pp-ai-foot">
          <span>group_role · ${escapeHtml(s_init.group_role || "—")}</span>
          <span>v0.2 · ${escapeHtml(a.id)} · 数据驱动 · sim t=${fmtTime(state.tSec)}</span>
        </div>
      </div>
    `;
  }

  function showAgentInspector(agent) {
    ensureInspectorCSS();
    let overlay = document.getElementById("__pp_agent_inspector");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "__pp_agent_inspector";
      overlay.className = "pp-ai-overlay";
      document.body.appendChild(overlay);
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay || e.target.classList.contains("pp-ai-close")) {
          hideAgentInspector();
        }
      });
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") hideAgentInspector();
      });
    }
    overlay.innerHTML = renderAgentInspectorHTML(agent);
    overlay.classList.add("is-open");
  }

  function hideAgentInspector() {
    const o = document.getElementById("__pp_agent_inspector");
    if (o) o.classList.remove("is-open");
  }

  function renderPersonaGrid(klass) {
    const grid = document.querySelector("#stage-ii .persona-grid");
    if (!grid) return;
    const n = (__agents?.agents?.length) || klass?.n || 32;
    const rows = Math.ceil(n / 4);
    const initSim = getInitialSimState();

    // Inject type-header before the grid if not already present
    const panel = grid.closest(".sim-panel");
    let hdr = panel?.querySelector(".persona-type-header");
    if (!hdr && panel) {
      hdr = document.createElement("div");
      hdr.className = "persona-type-header";
      grid.insertAdjacentElement("beforebegin", hdr);
    }
    if (hdr) {
      hdr.innerHTML = [
        `<div class="persona-type-tag ptt-a">政策/市场 ×${rows}</div>`,
        `<div class="persona-type-tag ptt-b">门店/顾客 ×${rows}</div>`,
        `<div class="persona-type-tag ptt-c">产业/竞争 ×${rows}</div>`,
        `<div class="persona-type-tag ptt-d">观望/被动 ×${rows}</div>`,
      ].join("");
    }

    // 4 fixed columns — each column = one persona type
    const colDef = [
      { type: "type-a", short: "政策", col: "A" },
      { type: "type-b", short: "门店", col: "B" },
      { type: "type-c", short: "产业", col: "C" },
      { type: "type-d", short: "观望", col: "D" },
    ];

    grid.innerHTML = "";
    for (let row = 0; row < rows; row++) {
      for (let ci = 0; ci < 4; ci++) {
        if (row * 4 + ci >= n) break;
        const { type, short, col } = colDef[ci];
        const id = `${col}${row + 1}`;
        const agent = getAgentById(id);
        const cell = document.createElement("div");

        // Engagement state: agent-driven if loaded, fallback to hardcoded
        let stateClass = "";
        if (agent && initSim) {
          if (initSim.live_active?.includes(id)) stateClass = " is-live-active";
          else if (initSim.active?.includes(id)) stateClass = " is-active";
          else if (initSim.quiet_full?.includes(id)) stateClass = " is-quiet";
        } else {
          // Fallback for first paint before agents arrive
          if (ci === 0 && row === 0) stateClass = " is-live-active";
          else if (ci === 1 && row === 0) stateClass = " is-live-active";
          else if (ci === 0 && row < 7) stateClass = " is-active";
          else if (ci === 1 && row < 6) stateClass = " is-active";
          else if (ci === 3 && row < 4) stateClass = " is-quiet";
        }

        cell.className = `persona-cell${stateClass} ${type}`;
        cell.dataset.agentId = id;

        // Tooltip from agent persona
        if (agent) {
          const alias = agent.identity?.alias || id;
          const demo = agent.identity?.demo || "";
          const strength = agent.persona?.stance_strength ?? "";
          const pos = agent.state_init?.stance_position;
          const tension = (agent.drama?.tension || "").slice(0, 60);
          cell.title = `${alias} · ${demo}\n立场：${pos != null ? (+pos).toFixed(2) : "—"} · 强度 ${strength}/5${tension ? `\n张力：${tension}` : ""}\n（点击查看完整画像）`;
          cell.style.cursor = "pointer";
        }

        cell.innerHTML = `<span class="n">${id}</span><span class="t">${short}</span>`;
        grid.appendChild(cell);
      }
    }

    // Attach click-to-inspect once
    if (!grid.dataset.inspectorAttached) {
      grid.addEventListener("click", (e) => {
        const cell = e.target.closest(".persona-cell");
        if (!cell) return;
        const id = cell.dataset.agentId;
        const agent = getAgentById(id);
        if (agent) showAgentInspector(agent);
      });
      grid.dataset.inspectorAttached = "true";
    }

    // Update persona-foot — use agent counts when available
    const foot = document.querySelector("#stage-ii .persona-foot");
    if (foot) {
      const live = grid.querySelectorAll(".is-live-active").length;
      const active = grid.querySelectorAll(".is-active").length;
      const speaking = live + active;
      const proactive = initSim?.proactive_speakers?.length || live;
      foot.innerHTML = `<span>已表态 <b>${speaking}</b>/${n}</span><span>威胁（T）类证据 <b style="color:var(--amber-deep)">待补</b></span><span>主动 <b>${proactive}</b></span>`;
    }

    // Sync h5 timestamp
    const ct = document.querySelector("#stage-ii .sim-panel:nth-of-type(1) h5 .ct");
    if (ct) ct.textContent = `${n} 人 · ${fmtTime(state.tSec)}`;
  }

  function updateBottomAdoptBar() {
    const bar = document.querySelector('#stage-ii [data-adopt-bar="km"]');
    if (!bar) return;
    const km = state.keyMoments.length || document.querySelectorAll(".km-card").length;
    const risks = document.querySelectorAll("#stage-ii .risk-list .risk-item").length;
    const klass = getSelected("class");
    const n = klass?.n || 32;
    // 表态数取仿真事件流里的真实发言人数（与画像格联动同一口径），不再用固定比例推算
    const spokenNames = new Set();
    (state.eventStream || []).forEach((b) => {
      if (b.role === "S") spokenNames.add(b.who || `S@${Math.floor(b.tSec || 0)}`);
    });
    const speaking = spokenNames.size;
    const conflict = (state.eventStream || []).filter((b) => b.flags?.conflict).length;
    const drift = (conflict * 0.35).toFixed(1);
    const left = bar.querySelector("span:first-child");
    if (left) {
      const changeLabel = getSelected("chapter")?.id === "mp-ch3-environment" ? "分类修正" : "立场迁移";
      const driftText = conflict > 0 ? `+${drift}` : "—";
      left.innerHTML = `本轮试错 · 关键时刻 <b style="color:var(--ink)">${km}</b> 处 · 风险信号 <b style="color:var(--ink)">${risks}</b> 项 · 学生表态 <b style="color:var(--ink)">${speaking} / ${n}</b> · ${changeLabel} <b style="color:var(--ink)">${driftText}</b>`;
    }
  }

  // 虚拟班剧本推进 → 画像格实时联动
  function updatePersonaLive() {
    const grid = document.querySelector("#stage-ii .persona-grid");
    if (!grid) return;
    const cells = Array.from(grid.querySelectorAll(".persona-cell"));
    if (!cells.length) return;
    const klass = getSelected("class");
    const n = klass?.n || 32;
    const tSec = state.tSec || 0;

    // 1. 时间戳同步
    const ct = document.querySelector("#stage-ii .sim-panel:nth-of-type(1) h5 .ct");
    if (ct) ct.textContent = `${n} 人 · ${fmtTime(tSec)}`;

    // 2. 已发言学生集合（按当前 tSec 滚动）
    const spoken = new Set();
    (state.eventStream || []).forEach((b) => {
      if (b.role === "S" && b.tSec <= tSec) {
        const key = b.who || `S@${Math.floor(b.tSec)}`;
        spoken.add(key);
      }
    });

    // 3. 把发言学生哈希到画像格（只映射 A/B 组，C 组维持"未发声"风险信号）
    const liveIdx = new Set();
    const eligible = cells
      .map((c, i) => ({ i, skip: c.classList.contains("is-quiet") || c.classList.contains("type-c") || c.classList.contains("type-d") }))
      .filter((x) => !x.skip);
    if (eligible.length) {
      spoken.forEach((name) => {
        let h = 0;
        for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % eligible.length;
        liveIdx.add(eligible[h].i);
      });
    }

    cells.forEach((cell, i) => {
      if (!cell.classList.contains("is-quiet")) {
        cell.classList.toggle("is-live-active", liveIdx.has(i));
      }
    });

    // 4. persona-foot 统计实时算
    const foot = document.querySelector("#stage-ii .persona-foot");
    if (foot) {
      const speaking = spoken.size || cells.filter((c) => c.classList.contains("is-active") || c.classList.contains("is-live-active")).length;
      const proactive = cells.filter((c) => c.classList.contains("is-live-active")).length;
      const kn = klass?.n || 32;
      foot.innerHTML = `<span>已表态 <b>${speaking}</b>/${kn}</span><span>C组 <b style="color:var(--amber-deep)">0</b> 未发声</span><span>主动 <b>${proactive}</b></span>`;
    }

    // 5. 顶部 adopt-bar 学生表态也跟着刷
    updateBottomAdoptBar();
  }

  function renderStage2(chapter) {
    const previousChapterId = state.reviewChapterId;
    const chapterChanged = previousChapterId && previousChapterId !== chapter?.id;
    const firstChapterLoad = !previousChapterId;
    state.reviewChapterId = chapter?.id || null;
    if (firstChapterLoad || chapterChanged) {
      state.keyMoments = loadKeyMoments(chapter?.id);
      metaverseMomentSignature = keyMomentSignature(state.keyMoments);
      setStageStatus(
        "ii",
        state.keyMoments.length
          ? `已读取 ${state.keyMoments.length} 条已发生仿真记录`
          : "待启动仿真并读取记录",
        false,
        state.keyMoments.length > 0,
      );
    }
    renderKeyMoments();
    renderSceneBeats(chapter);
    renderExpertDossier(chapter);
    renderRiskAndFlag(chapter);
    renderPersonaGrid(getSelected("class"));
    updatePersonaLive();
    updateBottomAdoptBar();
  }

  function updateWizFlow() {
    const flow = document.getElementById("wizFlow");
    if (!flow) return;
    const order = ["course", "class", "session", "chapter"];
    // 找出第一个未选的作为 current，已选的为 done
    let firstUnpicked = -1;
    order.forEach((g, i) => { if (firstUnpicked === -1 && !wizSelection[g]) firstUnpicked = i; });
    order.forEach((g, i) => {
      const step = flow.querySelector(`.wiz-step[data-step="${g}"]`);
      if (!step) return;
      step.classList.remove("is-done", "is-current");
      if (wizSelection[g]) step.classList.add("is-done");
      if (i === firstUnpicked) step.classList.add("is-current");
    });
    // 若全部已选，把最后一步标 current 以强调"现在 i 进 ii 段"
    if (firstUnpicked === -1) {
      const last = flow.querySelector('.wiz-step[data-step="chapter"]');
      if (last) last.classList.add("is-current");
    }
  }

  function syncToHeroAndPreview({ packView = "auto" } = {}) {
    updateWizFlow();
    const course = getSelected("course");
    const klass  = getSelected("class");
    const session= getSelected("session");
    const chapter= getSelected("chapter");

    // —— 1. 同步 hero meta（反向：选择 → meta；保持 contenteditable 但内容由选择驱动）
    const meta = document.getElementById("practiceMeta");
    if (meta) {
      const setField = (name, html) => {
        const el = meta.querySelector(`[data-field="${name}"]`);
        if (el) el.innerHTML = html;
      };
      if (course && chapter) setField("course", `${course.title} · ${chapter.topic}`);
      if (klass && session)   setField("class",  `${klass.title} · ${klass.n} 人 · ${session.title.split("·")[0].trim()}`);
      if (session)             setField("plan",   `plan.md · v 0.4 · ${session.min} min`);
    }

    // —— 2. 同步“设计摘要”生成输入（不是完整实践包）
    const summary = document.querySelector(".design-summary");
    const preview = document.querySelector(".pack-preview");
    const workspace = document.querySelector("[data-pack-workspace]");
    if (summary && chapter) {
      const ttl = summary.querySelector(".pack-preview-h h4");
      const pid = summary.querySelector(".pack-preview-h .pid");
      if (ttl) ttl.innerHTML = `课堂教学设计摘要<small>章节：${chapter.title}（${chapter.topic}） · 九项生成要求均可编辑</small>`;
      if (pid) pid.textContent = `P-${chapter.id.toUpperCase().slice(0, 8)}`;
      // 用一段 mock 内容反映"章节驱动"；所有章节都按 4 任务/4 角色/6 评价/5 资料 配齐
      const mocks = {
        "mp-ch3-environment": {
          tasks:     "信息归类：将案例证据放入 S/W/O/T · 边界辨析：区分门店能力 W 与人才供给 T · 策略组合：形成 SO/WO/ST/WT · 决策输出：提交慢病药学服务行动备忘录",
          roles:     "政策与市场分析员 · 门店运营负责人 · 顾客与服务代表 · 产业竞争观察员",
          rubric:    "内外部边界 · 证据相关性 · SWOT 分类准确度 · TOWS 策略质量 · 可行性 · 反思深度",
          citations: "案例会员复购数据 · 门店药师排班表 · 门诊统筹政策摘要 · 区域竞店服务记录 · 教材本章",
        },
        "ch5-procurement": {
          tasks:     "起步问题：「价格、厂家、患者反应你最先看到哪一项？」 · 进阶问题：「集采替代下，药事委员会会如何排序？」 · 分歧锚点：医保支付方 vs 长期患者 · 总结性提问：写一份采购建议书 250 字",
          roles:     "医保局代表 · 医院药事委员会 · 慢病患者代表 · 药企代表",
          rubric:    "问题递进性 · 利益相关者覆盖 · 政策证据引用 · 立场迁移度 · 真实任务接口 · 反思深度",
          citations: "国办发〔2019〕2号 · 基本医保药品目录(2024) · 药品管理法(2019) · 处方管理办法(2007) · 匿名案例 P-2024-Q3",
        },
        "ch4-gmp": {
          tasks:     "偏差识别题：6 张实拍照片中找 3 个偏差 · 根因分析：用 5-Why 拆解一次重大偏差 · CAPA 设计：写一份纠正预防措施 · 现场答辩：模拟监管员追问",
          roles:     "QA 经理 · 质量受权人 · 生产负责人 · 监管检查员",
          rubric:    "偏差识别准确度 · 根因深度 · CAPA 闭环性 · 数据可追溯 · 法规对应 · 沟通表达",
          citations: "GMP 通则 · GMP 附录 · 国家药监局飞检通告 · 厂内 SOP 示例 · 偏差处置案例库",
        },
        "ch6-supervision": {
          tasks:     "风险信号筛查：判读 4 份 PSUR 摘要 · 因果关联评估：Naranjo 量表实操 · 应对方案设计：写一份风险沟通信 · 跨部门会商：模拟监管协调会",
          roles:     "PV 专员 · 监管员 · 临床代表 · 患者代表",
          rubric:    "风险识别 · 因果关联 · 信号检测度 · 应对方案 · 沟通适配 · 合规度",
          citations: "ADR 监测办法 · 监管科学指南 · 公开 PSUR · 院方匿名病例 · WHO-UMC 因果评估表",
        },
        "ch8-payment": {
          tasks:     "支付规则推演：在 DRG 框架下设计入组路径 · 处方行为博弈：医院端 vs 医保端 vs 患者端 · 财务测算：估算一例病种的费用结构 · 反思总结：分级诊疗对药占比的影响",
          roles:     "医保局代表 · 临床医师 · 医院药剂科 · 患者代表",
          rubric:    "支付逻辑理解 · 处方合理性 · 患者负担 · 医院经营平衡 · 政策证据 · 决策透明度",
          citations: "DRG 国家技术规范 · DIP 试点方案 · 国家医保局公告 · 院内监测周报 · 公开学术论文",
        },
        "ch1-overview": {
          tasks:     "概念辨析：药事管理 vs 药剂学 vs 药事法规 三者边界 · 学科图谱：手绘药事管理学知识地图 · 案例迁移：把零售药店纠纷套用到本学科理论 · 学科前景研讨：未来 5 年关键议题",
          roles:     "学生 · 教师 · 行业代表 · 监管观察员",
          rubric:    "概念辨析 · 案例迁移度 · 思维清晰度 · 学科自觉 · 论据完整 · 表达准确",
          citations: "教材本章 · 行业白皮书 · 学科发展报告 · 公开访谈 · 国务院相关文件",
        },
        "ch2-rd": {
          tasks:     "立项三角推演：市场 / 技术 / 监管 三轴打分 · TPP 撰写：起草目标产品概况 · 失败案例分析：3 个公开终止项目复盘 · 风险评估：写一份 Go/No-Go 备忘录",
          roles:     "申办方 · CMC 团队 · 临床团队 · 商业评估",
          rubric:    "市场需求理解 · 技术可行性 · 监管路径 · 投资回报 · 风险识别 · 决策可执行",
          citations: "新药立项白皮书 · FDA 公开审评报告 · NMPA 公开审评报告 · 行业 TPP 模板 · 公司年报新药板块",
        },
        "ch3-registration": {
          tasks:     "分类判断：6 个产品分类归属判断 · 路径选择：化药 1 类 vs 改良 vs 仿制路径对比 · 资料清单：起草化药 5 类申报资料目录 · 监管沟通：模拟 Pre-IND 会议",
          roles:     "注册总监 · 临床代表 · 监管联络员 · 项目经理",
          rubric:    "分类判断 · 资料完备性 · 临床要求理解 · 监管沟通 · 时间安排 · 风险预判",
          citations: "注册管理办法 · 注册技术指导原则 · CDE 公开沟通会议纪要 · 化药申报资料要求 · 公开审评报告",
        },
        "ch7-distribution": {
          tasks:     "冷链断点识别：4 段运输日志找断点 · 影响评估：判断断点对药品质量的影响 · 召回执行设计：起草召回流程 · 流程改进：写一份冷链管理改进建议",
          roles:     "GSP 经理 · 物流负责人 · 药店店长 · 监管检查员",
          rubric:    "断点识别 · 影响评估 · 召回执行 · 流程改进 · 法规对应 · 沟通适配",
          citations: "GSP 规范 · 冷链管理办法 · 国家药监局飞检通告 · 公开召回案例 · 物流监测日志模板",
        },
        "cl-ch1-intro": {
          tasks:     "岗位场景对比：药剂科 vs 临床药学室 vs 社区药学服务 · 临床决策模拟：抗菌药物会诊建议书 · 协作场景演练：与主治医师沟通建议被采纳 · 价值评估：写一份临床药师价值案例",
          roles:     "临床药师 · 医师 · 患者 · 药学部主任",
          rubric:    "角色边界 · 协作模式 · 价值识别 · 沟通适配 · 证据引用 · 反思深度",
          citations: "临床药师专业培训大纲 · 卫健委药事管理办法 · 公开会诊记录 · 行业职业标准 · 患者满意度报告",
        },
        "cl-ch2-amr": {
          tasks:     "权限矩阵推演：非限制 / 限制 / 特殊 三级处方权 · 越级触发条件设计 · 处方点评：抽检 10 张抗菌药物处方 · 微生物匹配：用培养结果反推处方合理性",
          roles:     "感染科医师 · 临床药师 · 微生物室 · 院感办",
          rubric:    "分级合理性 · 越级触发条件 · 处方点评质量 · 微生物匹配 · 患者获益评估 · 抗菌素管理 KPI",
          citations: "卫健委抗菌药物分级文件 · 院内 AMS 制度 · 公开点评统计 · CHINET 监测数据 · 病例数据库",
        },
        "cl-ch3-tdm": {
          tasks:     "适应症判断：6 类药物是否需要 TDM · 采样时点：稳态前 vs 稳态后 · 结果解读：3 份血药浓度报告 · 调整决策：写一份个体化剂量调整建议",
          roles:     "临床药师 · 主治医师 · TDM 实验室 · 患者",
          rubric:    "适应症判断 · 采样时点 · 结果解读 · 调整决策 · 安全性评估 · 患者教育",
          citations: "TDM 指南 · 院内 TDM 操作规范 · 药代动力学参数表 · 个案监测报告 · 临床决策支持文献",
        },
        "cl-ch4-interaction": {
          tasks:     "DDI 识别：8 个组合判断相互作用类型 · 严重度分级：A/B/C/D/X 分类 · 替代方案设计 · 告知执行：起草患者告知页",
          roles:     "临床药师 · 主治医师 · HIS 工程师 · 患者",
          rubric:    "DDI 识别 · 严重度分级 · 替代方案 · 告知执行 · 系统对接 · 风险闭环",
          citations: "Lexi-Interact 数据库 · Micromedex · 院内警示规则 · 公开 DDI 综述 · 患者告知模板",
        },
        "cl-ch5-doseopt": {
          tasks:     "剂量起点选择：体重 / BSA / 个体化 三策略对比 · 监测时机：稳态点 / 高峰 / 谷值 · 调整决策树搭建 · 安全性评估：起草不良反应监护计划",
          roles:     "临床药师 · 主治医师 · TDM 实验室 · 护理团队",
          rubric:    "剂量合理性 · 监测时机 · 调整及时性 · 安全性 · 患者依从性 · 沟通适配",
          citations: "TDM 指南 · 药代动力学参数表 · 群体药代文献 · 个案监测报告 · 临床路径模板",
        },
        "cl-ch6-special": {
          tasks:     "妊娠用药风险评估：4 类药物风险分级 · 儿童用药剂量换算：体重 / 体表 / 年龄三公式 · 老年用药交互识别 · 监护方案设计：起草特殊人群用药监护清单",
          roles:     "临床药师 · 儿科 / 产科医师 · 患者家属 · 护理团队",
          rubric:    "生理差异识别 · 文献证据 · 剂量调整 · 监护方案 · 沟通适配 · 安全性",
          citations: "妊娠用药 FDA 分级 · 儿童用药指南 · 老年用药专家共识 · 院内监护规范 · 公开案例",
        },
        "cl-ch7-adr": {
          tasks:     "症状识别：6 个病例区分 ADR vs 病情进展 · 时间关联：建立时间-事件表 · 因果评估：Naranjo / WHO-UMC 量表实操 · 上报：起草国家系统上报材料",
          roles:     "临床医师 · 药学部 · PV 专员 · 患者",
          rubric:    "症状识别 · 时间关联 · 文献支持 · 评估完整度 · 上报规范 · 沟通适配",
          citations: "ADR 监测办法 · 国家上报模板 · WHO-UMC 因果评估 · Naranjo 量表 · 公开 ADR 案例",
        },
        "cl-ch8-service": {
          tasks:     "MTM 评估：完成一次全面药物评估 · 患者教育路径设计 · 依从性提升方案：写一份 30 天行动卡 · 随访闭环：起草 3 次随访记录模板",
          roles:     "临床药师 · 患者 · 社区医师 · 家属照护者",
          rubric:    "评估完整 · 教育有效 · 依从性提升 · 随访闭环 · 沟通适配 · 患者满意度",
          citations: "MTM 服务规范 · 患者教育手册 · 慢病管理指南 · 公开服务案例 · 满意度问卷模板",
        },
        "rg-ch1-system": {
          tasks:     "法律层级辨析：宪法 / 法律 / 行政法规 / 部门规章 · 适用判断：3 个案例选用法条 · 历史脉络梳理：药品管理法变迁时间轴 · 法规对比：中美欧药事法律框架对照",
          roles:     "立法机构观察员 · 监管机构代表 · 行业代表 · 法学专家",
          rubric:    "层级清晰 · 适用判断 · 历史脉络 · 国际对照 · 论据完整 · 表达准确",
          citations: "药品管理法 · 行政法规汇编 · 立法说明 · 国务院公报 · WHO 法律比较研究",
        },
        "rg-ch2-registration": {
          tasks:     "法规演进推演：2007/2019/2020 三版注册办法对比 · 政策影响：判断对申报策略的具体影响 · 申报路径选择 · 监管沟通：模拟与 CDE 的 Pre-IND 沟通",
          roles:     "评审员 · 注册总监 · 临床代表 · 监管联络员",
          rubric:    "法规演进逻辑 · 政策影响判断 · 申报策略 · 监管沟通 · 风险预判 · 时间安排",
          citations: "注册管理办法历次修订 · 国家药监局公告 · CDE 沟通会议纪要 · 行业研究报告 · 公开审评报告",
        },
        "rg-ch3-newdrug": {
          tasks:     "技术资料完整性评估 · 风险/效益评估推演 · 临床价值证据梳理 · 监管路径选择：突破 / 优先 / 附条件 / 常规",
          roles:     "评审员 · 申请人代表 · 临床代表 · 患者代表",
          rubric:    "技术资料完整 · 风险/效益评估 · 临床价值证据 · 监管路径 · 患者获益 · 沟通适配",
          citations: "审评指南 · 公开审评报告 · 突破性疗法清单 · 优先审评清单 · 国际监管对比文献",
        },
        "rg-ch4-gmp-gsp": {
          tasks:     "缺陷判定：将 5 个观察项分级 · 证据收集：现场拍照与记录规范 · 申诉处理：起草申诉信 · 整改跟踪：写一份 CAPA 跟踪表",
          roles:     "检查员 · QA · 生产负责人 · 仓储负责人",
          rubric:    "缺陷分级 · 证据收集 · 申诉处理 · 整改跟踪 · 法规对应 · 沟通适配",
          citations: "现场检查指南 · 缺陷案例汇编 · GMP/GSP 通则 · 国家药监局飞检通告 · 整改报告样板",
        },
        "rg-ch5-safety": {
          tasks:     "风险研判：用风险矩阵给一起事件评级 · 信息公开稿撰写 · 跨部门协调：模拟一次应急例会 · 沟通策略：起草媒体应对要点",
          roles:     "监管员 · 企业代表 · 媒体 · 患者代表",
          rubric:    "风险研判 · 信息公开 · 跨部门协调 · 沟通策略 · 法规对应 · 公众影响管理",
          citations: "药品召回管理办法 · 应急预案模板 · 国家药监局应急通告 · 媒体危机沟通研究 · 公开案例库",
        },
        "rg-ch6-pv": {
          tasks:     "组织职责梳理：起草 PV 组织图 · 信号管理流程设计 · 风险沟通信撰写 · 合规度自查：用清单评估自身体系",
          roles:     "PV 主管 · 临床医师 · 药学部代表 · IT 工程师",
          rubric:    "组织职责 · 信号管理 · 风险沟通 · 合规度 · 流程闭环 · 系统对接",
          citations: "ICH E2E · 药物警戒质量管理规范 · CIOMS 报告 · 行业 PV 白皮书 · 公开整改案例",
        },
        "rg-ch7-postmarket": {
          tasks:     "数据源选择：医保 / 电子病历 / 自报告 三类对比 · 偏倚识别：列出 3 类常见偏倚 · 证据强度分级 · 监管接受度评估",
          roles:     "监管科学家 · 临床流行病学家 · 数据科学家 · 监管员",
          rubric:    "数据源选择 · 偏倚识别 · 证据强度 · 监管接受度 · 方法透明度 · 报告规范",
          citations: "RWE 指南 · 真实世界研究规范 · 国际 RWE 共识 · 公开 RWE 研究 · 数据治理规范",
        },
        "rg-ch8-science": {
          tasks:     "方法适配判断 · 跨学科融合：起草 3 学科协作方案 · 决策透明度评估 · 国际经验对比：FDA / EMA / NMPA 监管科学路线对照",
          roles:     "评审员 · 临床代表 · 统计专家 · 患者代表",
          rubric:    "方法适配 · 跨学科融合 · 决策透明 · 论据完整 · 国际对照 · 沟通适配",
          citations: "监管科学路线图 · FDA RSO 报告 · EMA RSC 报告 · NMPA 监管科学行动计划 · 学术综述",
        },
      };
      const fallback = {
        tasks:     `起步问题（围绕「${chapter.topic}」开口） · 进阶问题（递进深挖） · 分歧锚点（立场切换设计） · 总结性提问（要求学生产出可评价证据）`,
        roles:     `教师 · 学生（核心组） · 行业代表 · 监管 / 临床方`,
        rubric:    `概念准确 · 证据引用 · 立场迁移 · 真实任务接口 · 论证质量 · 反思深度`,
        citations: `教材本章 · 国家相关政策原文 · 行业指南 · 公开案例 · 院内 / 班级匿名数据`,
      };
      // 原始课程素材 → 九环节生成要求 → 教师编辑覆盖
      const rawMock    = mocks[chapter.id] || fallback;
      const envContent = buildEnvPackContent(chapter, rawMock);
      const generation = loadPackGenerationMeta(chapter.id);
      let edits = loadPackEdits(chapter.id);
      let generated = loadGeneratedPack(chapter.id);
      // v1 兼容：旧版本曾把模型产物写进 packEdits；只迁移一次，避免丢失既有实践包。
      if (!generated && generation?.source === "local-model" && validGeneratedPack(edits)) {
        const outputs = loadAllGeneratedPacks();
        outputs[chapter.id] = { ...edits };
        try { localStorage.setItem(PACK_OUTPUTS_KEY, JSON.stringify(outputs)); } catch {}
        generated = { ...edits };
        const allEdits = loadAllPackEdits();
        delete allEdits[chapter.id];
        try { localStorage.setItem(PACK_EDITS_KEY, JSON.stringify(allEdits)); } catch {}
        edits = {};
      }
      const merged = { ...envContent, ...edits };

      // 填充九张“生成要求”卡
      PACK_KEYS.forEach((key) => {
        const envNum = key.slice(3);                                  // "01".."09"
        const card   = summary.querySelector(`.pack-item[data-env="${envNum}"]`);
        if (!card) return;
        const body = card.querySelector(`[data-brief-field="${key}"]`);
        if (!body) return;
        const content = merged[key] || "";
        body.textContent = content;
        body.setAttribute("contenteditable", "true");
        const n = content.split(/[。；;\n]/).map((s) => s.trim()).filter(Boolean).length;
        const cnt = card.querySelector(".env-count");
        if (cnt) cnt.textContent = n > 0 ? `${n} 项要求` : "";
      });
      wireDesignBriefEdits(summary);

      // —— 3. 只有模型产物完整时才显示完整实践包、下载与 Stage II 审校稿。
      if (preview) {
        const output = generated && validGeneratedPack(generated) ? generated : null;
        if (output) {
          const outputTitle = preview.querySelector(".pack-preview-h h4");
          const outputPid = preview.querySelector(".pack-preview-h .pid");
          if (outputTitle) outputTitle.innerHTML = `完整课堂实践包<small>章节：${chapter.title}（${chapter.topic}） · 本机 Qwen 生成 · 可编辑与下载</small>`;
          if (outputPid) outputPid.textContent = `P-${chapter.id.toUpperCase().slice(0, 8)}`;
          PACK_KEYS.forEach((key) => {
            const body = preview.querySelector(`[data-pack-field="${key}"]`);
            if (!body) return;
            body.textContent = output[key];
            body.setAttribute("contenteditable", "true");
          });
          wirePackEdits(preview, chapter.id);
        } else {
          PACK_KEYS.forEach((key) => {
            const body = preview.querySelector(`[data-pack-field="${key}"]`);
            if (body) body.textContent = "";
          });
        }

        if (workspace) {
          const chapterChanged = workspace.dataset.packChapter !== chapter.id;
          const currentView = workspace.dataset.packView || "briefs";
          workspace.dataset.packChapter = chapter.id;
          let nextView = "briefs";
          if (packView === "output" && output) nextView = "output";
          else if (packView === "briefs") nextView = "briefs";
          else if (packView === "generating") nextView = "generating";
          else if (currentView === "generating" && !chapterChanged) nextView = "generating";
          else if (output && (!chapterChanged && currentView === "briefs")) nextView = "briefs";
          else if (output) nextView = "output";
          transitionPackWorkspace(nextView);
        }
      }
    }
    // 实践包先就绪，再构建审校候选；加入候选时才能冻结真实原文快照。
    renderStage2(chapter);
    // Stage 3 的 sync-tri 和模板类型随章节选择联动
    renderStage3();
  }

  function updateExpertAdoptBar() {
    if (!state.expertCards) return;
    const total = state.expertCards.length;
    let preparing = 0, deferred = 0, pending = 0;
    state.expertCards.forEach((entry) => {
      if (entry.state === "candidate" && entry.decision === "supported") preparing++;
      else if (entry.state === "rejected" || entry.decision === "insufficient" || entry.decision === "unsupported") deferred++;
      else pending++;
    });
    const decided = preparing + deferred;
    const candidateEntries = state.expertCards.filter((entry) => entry.state === "candidate");
    const linked = new Set(candidateEntries.flatMap((entry) => entry.evidenceLinks)).size;
    const bar = document.querySelector('#stage-ii [data-adopt-bar="review"]');
    if (bar) {
      const left = bar.querySelector("span:first-child");
      if (left) left.innerHTML = `建议 <span class="pct">${total}</span> 条 · 已处理 ${decided} · 准备修改 ${preparing} · 暂不修改 ${deferred} · 待处理 ${pending} · 已关联记录 ${linked}`;
    }
    // 同步页眉摘要卡，让候选/判断操作所见即所得
    const summary = document.querySelector('#practiceMeta [data-field="adoption"]')
                  || document.querySelector('[data-field="adoption"]');
    if (summary) {
      summary.textContent = `${total} 条建议 · 准备修改 ${preparing} · 暂不修改 ${deferred} · 待处理 ${pending}`;
    }
  }

  function init() {
    mountControls();
    ingestExistingBeats();
    syncDotKey();
    wireInlineControls();
    global.addEventListener("mv:ready", replayMigratedKeyMoments);
    global.addEventListener("mv:ready", registerMetaverseMomentSync);
    registerMetaverseMomentSync();
    mountPackWizard();
    composeAssets(); // 初始时仅恢复“教师确认支持”的修订候选资产
    setStageStatus("i", `实践包就绪`, false, true);
    // 注：教学实践使用教师真实数据，不再承接 nav 产物。
    // Store 监听已移除——nav 与 practice 现在解耦，仅在写回环节共享 9 个教学环节标签。

    // Load 32 虚拟人 agents 并在到达后驱动 persona-grid 重渲
    loadAgents().then((data) => {
      if (!data) return;
      ensureInspectorCSS();
      ensureRuntimeCSS();
      initAgentRuntimes();
      const grid = document.querySelector("#stage-ii .persona-grid");
      if (grid) {
        renderPersonaGrid(getSelected("class"));
        reflectAgentStateInGrid([]);
      }
      const ct = document.querySelector("#stage-ii .sim-panel:nth-of-type(1) h5 .ct");
      if (ct) ct.textContent = `${data.agents.length} 人 · ${fmtTime(state.tSec)} · 智能体驱动`;
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // 暴露给 console 调试
  global.PharmacoPilotPracticeRuntime = {
    state, startSim, pauseSim, stepSim, resetSim,
    deriveKeyMoments, syncKeyMomentsFromPlayback, composeAssets, writeBackAllAssets,
  };
})(window);
