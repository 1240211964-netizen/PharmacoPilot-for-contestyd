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
  if (!Store || !Nav || !Practice) {
    console.warn("[practice-runtime] 缺依赖：store / nav-contract / practice-contract");
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
  font-family: var(--mono); font-size: var(--fs-2xs); color: var(--mute, #807a6c);
  opacity: 0.6;
}
.persona-cell.is-state-pulse {
  box-shadow: 0 0 0 2px var(--amber, #d97757), 0 0 12px rgba(217,119,87,.6);
  transform: scale(1.08);
}
/* Group-colored role pill in dark theater for agent-driven beats */
.beat-row .role.role-S-a { background: rgba(217,119,87,.28); color: #f0c1ac; }
.beat-row .role.role-S-b { background: rgba(149,187,164,.25); color: #c4dbcd; }
.beat-row .role.role-S-c { background: rgba(167,144,210,.25); color: #d5c4ec; }
.beat-row .role.role-S-d { background: rgba(180,180,180,.18); color: #ccc; }
.beat-row .what .who-name {
  font-family: var(--serif-cn); font-style: normal; font-weight: 500;
  color: var(--amber-soft, #f0c1ac); margin-right: 2px; opacity: .88;
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

    // 极简：左侧状态串自驱，右侧仅 stage ii 保留兜底按钮（手动派生 KM）
    const a2 = $('[data-actions="ii"]');
    if (a2) a2.innerHTML = `<button class="pr-btn pr-btn-tiny" id="pr-km-rederive" title="重新派生关键时刻">↻ 关键时刻</button>`;
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
    if (t_sec < 80)   return ["价格", "原研", "降价"];
    if (t_sec < 132)  return ["原研", "仿制", "替代", "一致性评价", "依从性"];
    if (t_sec < 145)  return ["立场冲突", "替代焦虑"];
    if (t_sec < 440)  return ["分组讨论", "医保", "慢病", "依从性", "证据", "成本"];
    if (t_sec < 900)  return ["小组汇报", "证据", "依从性", "政策"];
    if (t_sec < 1500) return ["交叉质疑", "BE", "INR", "临床细节", "政策"];
    if (t_sec < 1920) return ["药企", "创新", "C视角", "研发"];
    if (t_sec < 2520) return ["反思", "被低估", "立场迁移", "依从性"];
    return ["反思单", "收束", "立场"];
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
      { tSec: 145, role: "marker", text: "▾ 分组讨论中 · A/B 组并行" },
      { tSec: 285, role: "T", text: '"我注意到 B 组提到了<span class="em">回款周期</span>——这是 plan 里没设的维度。"', flags: { unplanned: true } },
      { tSec: 360, role: "A", kind: "agentDetect", text: '⚠ 检测到 <b>2 名学生主动引入 plan.md 未设维度</b>——建议在下次写回时把"回款周期"加入节点 8 协作任务选项。' },
      { tSec: 405, role: "marker", text: "▾ 回归全班 · 各组汇报" },
      { tSec: 475, role: "T", text: '"很好。下一题——谁来从临床安全角度补充？"', flags: { teacherOpenQ: true } },
      { tSec: 520, role: "marker", text: "▾ 沉默拉长" },
      { tSec: 900, role: "marker", text: "▾ 交叉质疑" },
      { tSec: 1500, role: "T", text: '"现在我想听听 C 组的视角——有谁愿意从药企角度来说？"', flags: { teacherCallC: true } },
      { tSec: 1920, role: "T", text: '"我们快结束了——有没有被低估的视角？"', flags: { teacherReflectPrompt: true, teacherOpenQ: true } },
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
      entry.evidenceLinks = [];
      entry.evidenceTouched = false;
      if (entry.decision !== "insufficient") entry.decision = "pending";
      entry.writtenBack = false;
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
    saveKeyMoments(wizSelection.chapter, state.keyMoments);
    renderKeyMoments();
    refreshAllReviewEvidence({ autoLink: true });
    composeAssets();
    if (state.keyMoments.length) {
      setStageStatus("ii", `已读取 ${state.keyMoments.length} 条已发生仿真记录`, false, true);
    } else {
      setStageStatus("ii", "尚无已发生仿真记录 · 请先播放或拖动录播", false, false);
      toast("尚无可关联记录 · 请先播放或拖动虚拟班录播，再刷新关键时刻");
    }
  }

  function readMetaverseKeyMoments() {
    const mv = window.PharmacoPilotMV;
    if (!(mv && typeof mv.getT === "function" && typeof mv.keyMoments === "function")) return null;
    const capturedUntil = Number(mv.getT()) || 0;
    const records = mv.keyMoments()
      .filter((record) => Number(record?.t) > 0 && Number(record.t) <= capturedUntil)
      .sort((a, b) => Number(a.t) - Number(b.t));
    return records.map((record, index) => packMetaverseMoment(record, index));
  }

  function packMetaverseMoment(record, index) {
    const text = stripHtml(record?.text || record?.label || "虚拟班关键记录").trim();
    const tSec = Math.max(0, Number(record?.t) || 0);
    let typeId = "simulation-signal";
    let cn = "虚拟班关键信号";
    let suggestSlot = "pulseRule.ifThen";
    let copyTemplate = "将这条仿真记录与相关修订候选并列呈现，等待教师判断。";
    let priority = 3;

    if (record?.type === "silence" || /沉默|未发声/.test(text)) {
      typeId = "silence-cliff";
      cn = "仿真中出现沉默或未发声信号";
      suggestSlot = "timeline.scaffoldInsertion";
      copyTemplate = "将这段沉默保留为调控信号，由教师判断是否需要新增支架。";
      priority = 2;
    } else if (/结构性|对立|分歧/.test(text) && record?.type !== "marker") {
      typeId = "structural-conflict";
      cn = "仿真中出现结构性分歧";
      suggestSlot = "questionChain.divergenceAnchor";
      copyTemplate = "将这段结构性分歧与修订候选关联，由教师判断是否需要新增分歧锚点。";
      priority = 1;
    } else if (/反思|复盘|被低估/.test(text)) {
      typeId = "reflection-signal";
      cn = "仿真进入反思与复盘节点";
      suggestSlot = "retro.agendaFulfillment";
      copyTemplate = "将这条反思记录与复盘候选关联，由教师判断是否写回。";
    } else if (record?.type === "marker" || /问题链|锚点|第\s*\d+\s*题/.test(text)) {
      typeId = "question-chain-marker";
      cn = text || "问题链进入新节点";
      suggestSlot = /分歧|对立/.test(text) ? "questionChain.divergenceAnchor" : "questionChain.openerTemplate";
      copyTemplate = "将该问题链节点与修订候选关联，由教师判断是否调整问句或节奏。";
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
          <span class="pill pill-amber">相关环节 · ${envLabels || "待教师判断"}</span>
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
      grid.innerHTML = `<div class="decision-empty">尚无已发生仿真记录 · 请先播放或拖动上方录播，再点击“关键时刻”</div>`;
    }
    // 同步 hero meta 已识别关键时刻
    const moments = $('[data-field="moments"]');
    if (moments) moments.innerHTML = `${state.keyMoments.length} 处 · 待教师关联与判断`;
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
    { key: "env01", no: "01", label: "学情诊断", short: "学情" },
    { key: "env02", no: "02", label: "目标与量规", short: "目标" },
    { key: "env03", no: "03", label: "知识与误区", short: "误区" },
    { key: "env04", no: "04", label: "案例与证据", short: "证据" },
    { key: "env05", no: "05", label: "任务链设计", short: "任务链" },
    { key: "env06", no: "06", label: "课中调控", short: "调控" },
    { key: "env07", no: "07", label: "评价与画像", short: "评价" },
    { key: "env08", no: "08", label: "复盘与决策", short: "复盘" },
    { key: "env09", no: "09", label: "资产沉淀", short: "沉淀" },
  ]);
  const PRACTICE_ENV_BY_KEY = Object.freeze(Object.fromEntries(PRACTICE_ENV_META.map((env) => [env.key, env])));
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
    if (envKey === "env02") return /量规|评价|评分|锚点/.test(body) ? "evidence.rubricRowAdd" : "goal.observableCriterion";
    if (envKey === "env03") return "questionChain.divergenceAnchor";
    if (envKey === "env04") return "case.evidenceForAgenda";
    if (envKey === "env05") return /分歧|对立|锚点|博弈/.test(body) ? "questionChain.divergenceAnchor" : "questionChain.openerTemplate";
    if (envKey === "env06") return /如果|则|触发|监测|信号/.test(body) ? "pulseRule.ifThen" : "timeline.scaffoldInsertion";
    if (envKey === "env07") return /量规|评分|评价|画像/.test(body) ? "evidence.rubricRowAdd" : "pulseRule.ifThen";
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
    if (/目标|量规|评价标准|可观测|可观察/.test(body)) add("env02");
    if (/概念|误区|混淆|机制/.test(body)) add("env03");
    if (/证据|案例|政策|法规|文号|数据|报告|引用|病例|通告|RWE|数据库/.test(body)) add("env04");
    if (/问题链|任务|角色|情境|场景|分歧|博弈|课题|锚点/.test(body)) add("env05");
    if (/分组|分钟|时间|沉默|干预|追问|节奏|触发/.test(body)) add("env06");
    if (/画像|立场迁移|评价维度|评分|量规/.test(body)) add("env07");
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
        const current = body?.textContent?.trim() || loadPackEdits(chapterId)[envKey] || "";
        const addition = `修订：${entry.draftText}`;
        const next = current.includes(addition) ? current : [current, addition].filter(Boolean).join(" · ");
        savePackEdit(chapterId, envKey, next);
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
        return { label: "案例与证据修订", evidenceRow: reviewText };
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
    // Stage i — 调用本机模型生成九环节实践包；不可用时保留当前模板
    const gen = $("#inline-generate-pack");
    if (gen) gen.addEventListener("click", () => generatePracticePackWithLocalModel(gen));

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

  // 课程→班级、章节 的依赖映射
  const WIZ_DATA = {
    courses: [
      { id: "pharm-admin",     title: "《药事管理学》本",  level: "本科" },
      { id: "clinical-pharm",  title: "《临床药学》本",    level: "本科" },
      { id: "pharm-regulation",title: "《药事法规与监管》研", level: "研究生" },
    ],
    classesByCourse: {
      "pharm-admin": [
        { id: "2025-pa-1", title: "2025 级药管 1 班", n: 34 },
        { id: "2026-pa-1", title: "2026 级药管 1 班", n: 32 },
        { id: "2026-pa-2", title: "2026 级药管 2 班", n: 30 },
      ],
      "clinical-pharm": [
        { id: "2025-cp-1", title: "2025 级临药 1 班", n: 28 },
        { id: "2026-cp-1", title: "2026 级临药 1 班", n: 30 },
      ],
      "pharm-regulation": [
        { id: "g2025-reg",  title: "2025 级研究生小班", n: 18 },
      ],
    },
    sessions: [
      { id: "w5-wed-34",  title: "第 5 周 · 周三 3-4 节", min: 90 },
      { id: "w6-mon-12",  title: "第 6 周 · 周一 1-2 节", min: 90 },
      { id: "w7-wed-34",  title: "第 7 周 · 周三 3-4 节", min: 45 },
      { id: "w8-fri-56",  title: "第 8 周 · 周五 5-6 节", min: 45 },
    ],
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
      ],
    },
  };

  let wizSelection = { course: null, class: null, session: null, chapter: null };

  function loadWizSelection() {
    try {
      const s = JSON.parse(localStorage.getItem(WIZ_STORE_KEY) || "{}");
      if (s && typeof s === "object") wizSelection = { ...wizSelection, ...s };
    } catch {}
  }
  function saveWizSelection() {
    try { localStorage.setItem(WIZ_STORE_KEY, JSON.stringify(wizSelection)); } catch {}
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
        root.innerHTML = `<span class="wiz-chip is-disabled" aria-disabled="true">（请先选课程）</span>`;
        return;
      }
      items.forEach((it) => {
        const chip = document.createElement("span");
        const active = wizSelection[group] === it.id;
        chip.className = "wiz-chip" + (active ? " is-active" : "");
        chip.dataset.val = it.id;
        chip.setAttribute("role", "button");
        chip.tabIndex = 0;
        chip.setAttribute("aria-pressed", String(active));
        const meta = opts.metaOf ? opts.metaOf(it) : "";
        chip.innerHTML = it.title + (meta ? ` <small>${meta}</small>` : "");
        chip.addEventListener("click", () => onPick(group, it.id));
        chip.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") { e.preventDefault(); onPick(group, it.id); }
        });
        root.appendChild(chip);
      });
    }

    function refreshDependent() {
      const c = wizSelection.course;
      renderChips("class", c ? (WIZ_DATA.classesByCourse[c] || []) : [], { metaOf: (it) => `${it.n} 人` });
      renderChips("chapter", c ? (WIZ_DATA.chaptersByCourse[c] || []) : []);
    }

    function onPick(group, id) {
      wizSelection[group] = id;
      // 切换课程时若新课程没有原班级 / 章节，自动补选第一个保持 demo 连贯
      if (group === "course") {
        const newClasses = WIZ_DATA.classesByCourse[id] || [];
        if (!newClasses.find((x) => x.id === wizSelection.class)) {
          wizSelection.class = newClasses[0]?.id || null;
        }
        const newChapters = WIZ_DATA.chaptersByCourse[id] || [];
        if (!newChapters.find((x) => x.id === wizSelection.chapter)) {
          wizSelection.chapter = newChapters[0]?.id || null;
        }
        refreshDependent();
        // refreshDependent 后重新打高亮
        ["class", "chapter"].forEach((g) => {
          const r = chipsOf(g);
          if (r) r.querySelectorAll(".wiz-chip").forEach((el) => {
            setChipActive(el, el.dataset.val === wizSelection[g]);
          });
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
    renderChips("course", WIZ_DATA.courses, { metaOf: (it) => it.level });
    renderChips("session", WIZ_DATA.sessions, { metaOf: (it) => `${it.min} min` });
    refreshDependent();

    // 默认选中（首次访问时给个完整 demo 状态）
    if (!wizSelection.course)  { wizSelection.course = "pharm-admin"; }
    if (!wizSelection.class)   { wizSelection.class  = "2026-pa-1"; }
    if (!wizSelection.session) { wizSelection.session = "w7-wed-34"; }
    if (!wizSelection.chapter) { wizSelection.chapter = "ch5-procurement"; }
    saveWizSelection();
    // 同步默认高亮
    ["course", "class", "session", "chapter"].forEach((g) => {
      const r = chipsOf(g);
      if (r) r.querySelectorAll(".wiz-chip").forEach((el) => {
        el.classList.toggle("is-active", el.dataset.val === wizSelection[g]);
      });
    });
    refreshDependent();
    // refreshDependent 重画后再次同步选中态
    ["class", "chapter"].forEach((g) => {
      const r = chipsOf(g);
      if (r) r.querySelectorAll(".wiz-chip").forEach((el) => {
        el.classList.toggle("is-active", el.dataset.val === wizSelection[g]);
      });
    });
    syncToHeroAndPreview();
  }

  function getSelected(group) {
    const id = wizSelection[group];
    if (!id) return null;
    if (group === "course")  return WIZ_DATA.courses.find((x) => x.id === id);
    if (group === "session") return WIZ_DATA.sessions.find((x) => x.id === id);
    if (group === "class")   return (WIZ_DATA.classesByCourse[wizSelection.course] || []).find((x) => x.id === id);
    if (group === "chapter") return (WIZ_DATA.chaptersByCourse[wizSelection.course] || []).find((x) => x.id === id);
    return null;
  }

  // ============================================================
  // 实践包内容编辑：按 chapter.id 分别持久化到 localStorage
  // ============================================================
  const PACK_EDITS_KEY = "pp.practice.packEdits";
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
  function saveGeneratedPack(chapterId, pack, metadata, previousPack = null) {
    const all = loadAllPackEdits();
    all[chapterId] = Object.fromEntries(PACK_KEYS.map((key) => [key, String(pack[key] || "").trim()]));
    try { localStorage.setItem(PACK_EDITS_KEY, JSON.stringify(all)); } catch {}
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
  function validGeneratedPack(pack) {
    return !!pack && PACK_KEYS.every((key) => typeof pack[key] === "string" && pack[key].trim());
  }
  async function generatePracticePackWithLocalModel(button) {
    if (button.dataset.generating === "1") return;
    const course = getSelected("course");
    const klass = getSelected("class");
    const session = getSelected("session");
    const chapter = getSelected("chapter");
    const currentPack = currentPackFromPreview();
    if (!course || !klass || !session || !chapter || !currentPack) {
      toast("请先完成课程、班级、课时和章节选择");
      return;
    }
    if (!global.PharmacoBackend?.generatePracticePack) {
      toast("本地后端未连接 · 已保留当前模板实践包");
      return;
    }

    const originalText = button.textContent;
    const requestedChapterId = chapter.id;
    button.dataset.generating = "1";
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    button.textContent = "本机 Qwen 生成中…";
    setStageStatus("i", "本机 Qwen 正在生成九环节实践包", true, false);
    toast("已提交本机 Qwen · 正在生成九个教学环节");

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
        currentPack,
      });
      if (!validGeneratedPack(result?.pack)) throw new Error("本地模型返回的实践包不完整");
      saveGeneratedPack(requestedChapterId, result.pack, {
        source: "local-model",
        model: result.model || "Qwen3.5-9B-4bit",
        generatedAt: result.generatedAt || new Date().toISOString(),
      }, currentPack);

      if (wizSelection.chapter === requestedChapterId) {
        syncToHeroAndPreview();
        setStageStatus("i", "本机 Qwen 实践包已生成", false, true);
        toast("本机 Qwen 已生成九环节实践包 · 可逐环节编辑后进入 ii 段试错");
        // v5:实践包独占下一栏 —— 滚到生成结果本身,而不是越过它直奔 stage-ii
        (document.querySelector(".pack-result") || document.querySelector("#stage-ii"))
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      } else {
        setStageStatus("i", "实践包已保存到原章节", false, true);
        toast(`实践包已保存到「${chapter.title}」· 当前章节未被覆盖`);
      }
    } catch (error) {
      console.warn("[practice-runtime] 本地模型生成失败", error);
      setStageStatus("i", "本地模型不可用 · 当前模板已保留", false, true);
      const detail = error?.code === "MODEL_OUTPUT_INVALID"
        ? "模型输出未通过九环节校验"
        : "本地后端或模型尚未就绪";
      toast(`${detail} · 已保留当前模板实践包`);
    } finally {
      button.dataset.generating = "0";
      button.disabled = false;
      button.removeAttribute("aria-busy");
      button.textContent = originalText;
    }
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
        savePackEdit(curChapter, field, txt, { bump: changed });
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

  // ============================================================
  // 9-env pack content builder
  // 根据章节信息 + raw mock 数据，推导 9 个教学环节的简要说明
  // ============================================================
  function buildEnvPackContent(chapter, mock) {
    const t  = chapter.topic || chapter.title || "";
    const tS = t.length > 12 ? t.slice(0, 12) + "…" : t;
    const sp = (str) => (str || "").split(/[·；;]/).map((s) => s.trim()).filter(Boolean);
    const tasks  = sp(mock.tasks);
    const roles  = sp(mock.roles);
    const rubric = sp(mock.rubric);
    const cites  = sp(mock.citations);
    const t1 = tasks[0]  ? tasks[0].slice(0, 18)  : tS;
    const r1 = roles[0]  ? roles[0].slice(0, 8)   : "教师";
    return {
      env01: `诊断学生对「${tS}」的先验认知 · 探查常见误解 · 记录认知起点`,
      env02: `目标：运用${tS}框架分析真实案例 · 量规核心：${rubric.slice(0,2).join(" · ")}`,
      env03: `核心概念：${tS}关键机制 · 待破解误区：混淆监管逻辑与商业逻辑`,
      env04: cites.slice(0, 3).join(" · ") || "教材本章 · 政策原文 · 行业指南",
      env05: tasks.slice(0, 3).join(" · ") || `${tS}递进问题链 · 分歧锚点 · 可评价产出`,
      env06: `分组立场分化监控 · 沉默干预节点 · 追问：「你的依据是什么？」`,
      env07: `量规 ${rubric.length || 6} 维：${rubric.slice(0,3).join(" · ")} … · 识别高递进学生`,
      env08: `复盘：${tS}中被低估的视角 · 非专业影响因素 · 2–3 个核心复盘提问`,
      env09: `任务题库（${t1.slice(0,16)}…）· ${r1}角色卡 · 匿名案例数据包`,
    };
  }

  // ============================================================
  // Stage 2 模板：五路学科审校 / 剧本 beats / 风险 / 量规 / 画像
  // 5 路审校视角固定，内容按 chapter 模板化
  // ============================================================
  // 5 路学科审校（按学科出处分，每张卡 3 个数据来源位）
  const EXPERTS = [
    {
      id: "expert-pharm",   ec: "is-pharm",   av: "药",
      role: "药学情境审校",
      func: "把课题锚定到真实临床 / 药学决策场景",
      persona: "临床药学",
      reviewerId: "pharmacy-context",
      scopeCopy: "只审校案例证据与任务链两个主责环节",
      target: 5,
      inject: {
        upload:  "上传匿名病例 PDF / 临床指南",
        link:    "链接院内临床案例库 / 药典数据库",
        distill: "蒸馏某位临床药学学者风格",
      },
    },
    {
      id: "expert-mgmt",    ec: "is-design",  av: "经",
      role: "管理决策审校",
      func: "审视医院管理 / 药事经济 / 政策路径",
      persona: "药事管理与卫生经济",
      reviewerId: "management-tradeoff",
      scopeCopy: "只审校目标量规与复盘决策两个主责环节",
      target: 4,
      inject: {
        upload:  "上传医院年报 / 政策分析报告",
        link:    "链接科室 BI / 经管知识库",
        distill: "蒸馏药事经济 / 卫生经济学者风格",
      },
    },
    {
      id: "expert-law",     ec: "is-law",     av: "法",
      role: "法规合规审校",
      func: "校验法规引用 · 文号 · 年份 · 时效",
      persona: "药事法规与监管",
      reviewerId: "regulatory-citation",
      scopeCopy: "只审校知识误区与案例证据两个主责环节",
      target: 6,
      inject: {
        upload:  "上传法规 PDF / 飞检通告汇编",
        link:    "链接 NMPA / 国家医保局公开库",
        distill: "蒸馏某位药事法规学者风格",
      },
    },
    {
      id: "expert-edu",     ec: "is-eval",    av: "教",
      role: "教学设计审校",
      func: "审视问题链 · 目标对齐 · 量规设计",
      persona: "课程与评价",
      reviewerId: "instructional-design",
      scopeCopy: "只审校目标、误区与任务链三个主责环节",
      target: 4,
      inject: {
        upload:  "上传课程论文 / 评价范式材料",
        link:    "链接学校教学评价数据库",
        distill: "蒸馏 Bloom / Biggs / Wiggins / Stiggins 范式",
      },
    },
    {
      id: "expert-data",    ec: "is-reflect", av: "数",
      role: "数据循证审校",
      func: "提供 RWE / 监测数据 / 循证支撑",
      persona: "数据科学与真实世界证据",
      reviewerId: "evidence-metrics",
      scopeCopy: "只审校案例证据与评价画像两个主责环节",
      target: 9,
      inject: {
        upload:  "上传 CSV / 监测报表 / 真实世界数据",
        link:    "链接 CHINET / FAERS / 院内 HIS 脱敏库",
        distill: "蒸馏某位数据科学学者风格",
      },
    },
  ];

  // 章节 → 5 路审校建议，按学科顺序：药学 / 经管 / 法学 / 教育学 / 数据
  const EXPERT_CHAPTER_COMMENTS = {
    "ch5-procurement": [
      { anchor: "⌗ 药学 · 患者代表",       body: '"集采替代"应聚焦<b>慢性病长期处方</b>（如高血压、糖尿病）——建议把患者代表设为<b>已用原研 2 年</b>的慢病患者，使分歧更贴近临床真实。' },
      { anchor: "⌗ 经管 · 多方博弈",       body: '集采决策涉及<b>医院药事委员会 × 医保局 × 药企</b>三方博弈——建议把课题拓展到"医院如何在 DRG / 集采双轨下博弈"，让管理决策的权衡显化。' },
      { anchor: "⌗ 法学 · 文号引用",       body: '引用文件应标明<b>发文机关 + 年份 + 文号</b>。"国家医保局〔2024〕XX号文"占位需替换为正式文号；建议补<b>《国办发〔2019〕2号》</b>。' },
      { anchor: "⌗ 教育 · 问题链 + 量规",  body: '问题链第 1 题<b>"你最直觉的判断"</b>过于宽泛，建议改为<b>"先注意到药价 / 厂家 / 患者反应中哪一个？"</b>；同时"立场迁移度"维度需<b>3 级可观测量规</b>。' },
      { anchor: "⌗ 数据 · RWE 证据",       body: '建议接入<b>本院集采前后处方数据对比（脱敏 RWE）</b>，让讨论从理论转到证据；可用 2024Q3 至 2025Q3 数据。' },
    ],
    "ch4-gmp": [
      { anchor: "⌗ 药学 · 现场场景",     body: 'GMP 课题最好<b>放到具体车间</b>（固体制剂线 / 无菌灌装线）——建议把任务背景设为<b>「某辅料替代后偏差处置」</b>，让学生看到偏差的物理位置。' },
      { anchor: "⌗ 经管 · 合规成本",     body: 'GMP 不只是合规——建议引入<b>"偏差处置对生产成本与上市时间的影响"</b>，让学生看到管理决策权衡，而非纯技术执行。' },
      { anchor: "⌗ 法学 · 通告引用",     body: '引用应明确<b>年份 + 通告编号</b>；建议补<b>近 12 个月飞检通告（公开汇编）</b>与<b>GMP 通则 + 附录 7</b>，让讨论有真实法规坐标。' },
      { anchor: "⌗ 教育 · 锚点 + 量规",  body: '"找 3 个偏差"过于开放，建议加锚点：<b>"在 6 张拍照中，先看哪 1 张？依据什么？"</b>；CAPA 闭环性需<b>3 级量规</b>（是否给验证措施 / 是否标责任人与时限）。' },
      { anchor: "⌗ 数据 · 偏差分布",     body: '建议接入<b>历年飞检通告统计 + 行业偏差分类公开报告</b>，让学生看到"偏差类型"的真实分布，比抽象列举更有说服力。' },
    ],
    "ch6-supervision": [
      { anchor: "⌗ 药学 · 信号场景",      body: '上市后场景应锚定<b>具体药品 + 真实信号</b>——建议把 4 份 PSUR 摘要改为<b>一个药品 4 个时段</b>的纵向数据，更接近临床真实研判。' },
      { anchor: "⌗ 经管 · 召回决策",      body: '上市后再评价的核心管理问题是<b>召回成本 vs 品牌信任</b>——建议把任务扩到"企业如何决策是否主动召回"，让管理博弈显化。' },
      { anchor: "⌗ 法学 · 病例合规",      body: '院方匿名病例需<b>去标识 + 标注时间窗口</b>，避免学生误以为是当前事件；建议补<b>《药品上市后变更管理办法》《ADR 监测办法》</b>。' },
      { anchor: "⌗ 教育 · 锚点 + 量规",   body: '"先看哪份摘要"过于平铺，建议加锚点：<b>"先看安全性还是先看疗效？"</b>；因果评估需<b>3 级量规</b>（是否使用 WHO-UMC / Naranjo 量表）。' },
      { anchor: "⌗ 数据 · 真实样本",      body: '建议接入<b>FAERS 或国家 ADR 监测库（公开版）</b>的真实信号检测数据，让讨论有量化背景，而非纸面假设。' },
    ],
    "ch8-payment": [
      { anchor: "⌗ 药学 · 临床路径",    body: 'DRG/DIP 涉及<b>具体临床路径</b>——建议把课题设为"某常见病种 DRG 入组与处方调整"，让学生看到从医嘱到付费的完整链条。' },
      { anchor: "⌗ 经管 · 产业博弈",    body: '支付改革是<b>产业链管理大变革</b>——建议把课题分两侧看："医院侧药占比" + "药企侧市场准入"，让完整博弈显化。' },
      { anchor: "⌗ 法学 · 数据合规",    body: '建议<b>引用国家医保局已公开的 DRG 权重表 + 试点方案</b>，避免使用未脱敏院内数据；引用须标年份与文号。' },
      { anchor: "⌗ 教育 · 锚点 + 量规", body: '入组路径推演如果只给学生"分类码"过于技术化，建议加情境锚点：<b>"你是医保科长，先按什么标准入组？"</b>；"处方合理性"需<b>3 级量规</b>。' },
      { anchor: "⌗ 数据 · 公开统计",    body: '建议接入<b>医保局公开的"DRG 试点报告" + 真实付费率分布</b>，让学生看到真实数据，而非概念推演。' },
    ],
    "cl-ch2-amr": [
      { anchor: "⌗ 药学 · 真实病房",    body: '抗菌药物分级管理应放到<b>具体科室</b>（ICU / 呼吸科 / 感染科）——建议把任务背景设为<b>"某 ICU 多重耐药菌爆发"</b>。' },
      { anchor: "⌗ 经管 · AMS 制度",     body: '抗菌药物管理涉及<b>医院 AMS 制度与处方激励</b>——建议引入"医院如何设计 AMS 考核"，让学生看到制度如何反向影响处方行为。' },
      { anchor: "⌗ 法学 · 统计合规",    body: '院内统计应<b>明确数据时段 + 样本量</b>，避免以偏概全；建议补<b>《抗菌药物临床应用管理办法》 + 卫健委分级文件</b>。' },
      { anchor: "⌗ 教育 · 锚点 + 量规", body: '"越级处方"如果只给定义过于抽象，建议加情境锚点：<b>"凌晨 3 点，怀疑革兰阴性脑膜炎，你怎么决定？"</b>；微生物匹配需<b>3 级量规</b>（是否核对培养 / MIC）。' },
      { anchor: "⌗ 数据 · 耐药趋势",    body: '建议接入<b>CHINET 数据库 + 本院微生物耐药趋势图</b>，让分级讨论基于真实数据，而非教材一般规律。' },
    ],
    "cl-ch5-doseopt": [
      { anchor: "⌗ 药学 · TDM 情境",     body: '个体化给药应锚定<b>具体药物 + 患者画像</b>——建议把任务设为<b>"老年肾功能不全患者万古霉素剂量调整"</b>，让 PK 参数有真实落点。' },
      { anchor: "⌗ 经管 · 服务成本",     body: 'TDM 服务成本较高——建议引入<b>"医院如何评估 TDM 项目的投入产出"</b>，让学生看到临床服务背后的经管决策。' },
      { anchor: "⌗ 法学 · 报告合规",     body: 'TDM 报告作为临床决策依据需符合<b>《医疗器械临床使用管理办法》 + ISO 15189</b>——建议补充检验质量管理相关引用。' },
      { anchor: "⌗ 教育 · 锚点 + 量规",  body: '稳态前 / 稳态后 / 谷值三选一可加情境锚点：<b>"第 3 天是否还要测？"</b>；调整合理性需<b>3 级量规</b>（是否用 PK 参数 / 是否算 CrCl）。' },
      { anchor: "⌗ 数据 · 真实关联",     body: '建议接入<b>本院历年 TDM 数据 + 治疗结局关联分析</b>，让学生看到"调整 → 结局"的真实相关性。' },
    ],
    "rg-ch3-newdrug": [
      { anchor: "⌗ 药学 · 临床证据",    body: '新药审评应基于<b>真实公开报告</b>——建议从 CDE 公开审评报告中抽 1 个产品做完整推演，让学生看到从 IND 到 NDA 的临床证据链。' },
      { anchor: "⌗ 经管 · 路径成本",    body: '审评路径选择牵动<b>企业研发投入与上市时间</b>——建议把课题扩到"路径选择对企业现金流的影响"，让学生看到管理决策权衡。' },
      { anchor: "⌗ 法学 · 资料时效",    body: '审评报告应<b>注明年份 + 受理号</b>，避免学生用过期资料推断现行政策；引用须符合<b>《药品注册管理办法》(2020)</b>。' },
      { anchor: "⌗ 教育 · 锚点 + 量规", body: '"突破 / 优先 / 附条件 / 常规"四选一可加锚点：<b>"如果该药是肿瘤靶向药，你会争取哪条路径？"</b>；风险/效益评估需<b>3 级量规</b>。' },
      { anchor: "⌗ 数据 · 试验信息",    body: '建议接入<b>ClinicalTrials.gov + 国家临床试验登记平台</b>，让学生看到该产品的真实试验设计与终点。' },
    ],
    "rg-ch6-pv": [
      { anchor: "⌗ 药学 · 信号场景",     body: 'PV 体系搭建应基于<b>真实企业规模</b>——建议把情境设为<b>"刚获批 1 个 NDA 的中型创新药企"</b>，让组织决策与药品风险特征匹配。' },
      { anchor: "⌗ 经管 · 投资定位",     body: 'PV 体系是<b>合规成本中心 还是 品牌信任来源</b>——建议引入"PV 投资如何反哺品牌"，让学生看到 PV 的经管价值。' },
      { anchor: "⌗ 法学 · 规范引用",     body: '建议明确引用<b>ICH E2E + 《药物警戒质量管理规范》</b>，避免仅靠英文规范；规范年份与版本须明确。' },
      { anchor: "⌗ 教育 · 锚点 + 量规",  body: '"PV 主管 vs 临床医师"职责边界可加锚点：<b>"严重 ADR 上报应由谁起草？"</b>；信号管理需<b>3 级量规</b>（是否用 PRR / ROR 定量方法）。' },
      { anchor: "⌗ 数据 · 公开数据库",   body: '建议接入<b>VigiBase 或国家 ADR 监测系统公开数据</b>，让信号检测教学有真实样本，提升数据敏感度。' },
    ],
  };

  function getExpertCommentsForChapter(chapter) {
    if (!chapter) return null;
    const named = EXPERT_CHAPTER_COMMENTS[chapter.id];
    if (named) return named;
    // 通用模板兜底（5 学科顺序：药学 / 经管 / 法学 / 教育学 / 数据）
    return [
      { anchor: `⌗ 药学 · ${chapter.title.split("·")[1]?.trim() || "情境"}`, body: `「${chapter.topic}」应锚定到<b>真实临床 / 药学决策场景</b>——建议把任务背景写得更具体，让学生进入真实角色。` },
      { anchor: `⌗ 经管 · 管理权衡`,     body: `「${chapter.topic}」涉及的<b>管理权衡</b>值得拆开看——建议引入决策方之间的成本 / 利益博弈，让经管层面显化。` },
      { anchor: `⌗ 法学 · 规范引用`,     body: `引用应标明<b>发文机关 + 年份 + 文号</b>；建议补一份<b>${chapter.topic}</b> 相关公开规范，避免占位文本。` },
      { anchor: `⌗ 教育 · 锚点 + 量规`,  body: `问题链 / 评价量规需给出<b>可观测行为锚点</b>——建议提供 3 级量规，避免主观评分。` },
      { anchor: `⌗ 数据 · RWE 证据`,     body: `建议接入<b>${chapter.topic}</b> 相关的 RWE / 监测 / 公开统计数据，让讨论从理论转到证据。` },
    ];
  }

  // 章节 → 剧本 beats（精简 6-8 拍）
  const SCRIPT_BY_CHAPTER = {
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

  function normalizeLiveReview(raw) {
    if (!raw || typeof raw !== "object" || raw.status !== "anchored") return null;
    const annotation = raw.annotation;
    const sourceRevision = Number(raw.sourceRevision);
    if (!annotation || typeof annotation !== "object"
      || !Number.isInteger(sourceRevision) || sourceRevision < 0
      || !PRACTICE_ENV_BY_KEY[annotation.targetEnv]
      || typeof annotation.issue !== "string" || !annotation.issue.trim()
      || typeof annotation.suggestion !== "string" || !annotation.suggestion.trim()
      || typeof annotation.sourceExcerpt !== "string" || !annotation.sourceExcerpt.trim()) return null;
    return {
      status: "anchored",
      sourceRevision,
      manuscriptHash: typeof raw.manuscriptHash === "string" ? raw.manuscriptHash : "",
      model: typeof raw.model === "string" ? raw.model : "本机 Qwen",
      promptVersion: typeof raw.promptVersion === "string" ? raw.promptVersion : "",
      generatedAt: typeof raw.generatedAt === "string" ? raw.generatedAt : "",
      attempts: Number.isInteger(Number(raw.attempts)) ? Number(raw.attempts) : 1,
      annotation: {
        targetEnv: annotation.targetEnv,
        segmentKey: typeof annotation.segmentKey === "string" ? annotation.segmentKey : "",
        sourceExcerpt: annotation.sourceExcerpt.trim(),
        sourceHash: typeof annotation.sourceHash === "string" ? annotation.sourceHash : "",
        anchorMethod: typeof annotation.anchorMethod === "string" ? annotation.anchorMethod : "",
        issue: annotation.issue.trim(),
        suggestion: annotation.suggestion.trim(),
        crossReferences: Array.isArray(annotation.crossReferences)
          ? annotation.crossReferences.filter((ref) => ref?.ok === true && PRACTICE_ENV_BY_KEY[ref.targetEnv])
            .map((ref) => ({
              ok: true,
              targetEnv: ref.targetEnv,
              segmentKey: typeof ref.segmentKey === "string" ? ref.segmentKey : "",
              sourceExcerpt: typeof ref.sourceExcerpt === "string" ? ref.sourceExcerpt : "",
              sourceHash: typeof ref.sourceHash === "string" ? ref.sourceHash : "",
              anchorMethod: typeof ref.anchorMethod === "string" ? ref.anchorMethod : "",
            }))
          : [],
      },
    };
  }
  function liveReviewSourceText(liveReview) {
    return `问题：${liveReview.annotation.issue}\n建议：${liveReview.annotation.suggestion}`;
  }
  function liveReviewBodyMarkup(liveReview) {
    return `<span class="ec-review-line"><b>问题</b>${escapeHtml(liveReview.annotation.issue)}</span><span class="ec-review-line"><b>建议</b>${escapeHtml(liveReview.annotation.suggestion)}</span>`;
  }
  function liveReviewAnchorCopy(liveReview) {
    const env = PRACTICE_ENV_BY_KEY[liveReview.annotation.targetEnv];
    const segment = liveReview.annotation.segmentKey ? ` · ${liveReview.annotation.segmentKey}` : "";
    return `⌗ ${env?.no || liveReview.annotation.targetEnv} ${env?.short || ""}${segment}`;
  }
  function liveReviewTargetKeys(liveReview) {
    return [...new Set([
      liveReview.annotation.targetEnv,
      ...liveReview.annotation.crossReferences.map((ref) => ref.targetEnv),
    ].filter((key) => PRACTICE_ENV_BY_KEY[key]))];
  }

  // 章节 → 量规歧义
  const FLAGS_BY_CHAPTER = {
    "ch5-procurement": [
      { fid: "R-04", body: '<b>立场迁移度</b>缺少可观测锚点；建议补 3 级量规（已被教学设计审校提出）' },
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
      { fid: "R-0X", body: `<b>${chapter.topic} 立场迁移度</b>缺少可观测锚点；建议补 3 级量规` },
      { fid: "R-0Y", body: '部分评价维度可能交叠，建议复核以免双计分' },
    ];
  }

  function renderExpertCards(chapter) {
    const grid = document.querySelector('#stage-ii [data-ec-role="grid"]');
    if (!grid) return;
    const comments = getExpertCommentsForChapter(chapter);
    if (!comments) return;
    const savedReviews = loadExpertAdoptions(chapter?.id);
    grid.innerHTML = "";
    state.expertCards = [];
    EXPERTS.forEach((e, i) => {
      const c = comments[i] || comments[0];
      const savedRecord = savedReviews[e.id];
      const liveReview = normalizeLiveReview(savedRecord?.liveReview);
      const seedSourceText = stripHtml(c.body).trim();
      const sourceText = liveReview ? liveReviewSourceText(liveReview) : seedSourceText;
      const defaultTargets = liveReview ? liveReviewTargetKeys(liveReview) : inferReviewTargetEnvKeys(sourceText);
      const record = normalizeReviewRecord(savedRecord, sourceText, defaultTargets);
      record.liveReview = liveReview;
      const card = document.createElement("div");
      card.className = `expert-card ${e.ec}`;
      card.dataset.expertId = e.id;
      const targetOptions = PRACTICE_ENV_META.map((env) => `
        <label class="ec-target-chip">
          <input type="checkbox" data-ec-role="target-input" value="${env.key}" ${record.targetEnvKeys.includes(env.key) ? "checked" : ""}/>
          <span>${env.no} ${env.short}</span>
        </label>
      `).join("");
      card.innerHTML = `
        <div class="ec-head">
          <div class="ec-av">${e.av}</div>
          <div class="ec-who">${e.role} <span class="ec-demo">审校视角</span><small>${e.persona}</small></div>
        </div>
        <div class="ec-func">职能 · ${e.func}</div>
        <div class="ec-live-review" data-ec-role="live-review" data-state="seed">
          <span class="ec-live-status" data-ec-role="live-status">固定审校种子</span>
          <button type="button" data-review-act="live">用本机 Qwen 审校</button>
          <span class="ec-live-error" data-ec-role="live-error" role="alert" hidden></span>
        </div>
        <span class="ec-anchor" title="${liveReview ? escapeHtml(liveReview.annotation.sourceExcerpt) : ""}">${liveReview ? escapeHtml(liveReviewAnchorCopy(liveReview)) : c.anchor}</span>
        <div class="ec-body" data-ec-role="body"></div>
        <div class="ec-edit-panel" data-ec-role="edit-panel" hidden>
          <label>修改后意见<textarea maxlength="1200"></textarea></label>
          <span class="ec-inline-error" data-ec-role="edit-error" role="alert" hidden></span>
          <div><button type="button" data-edit-act="save">保存修订</button><button type="button" data-edit-act="cancel">取消</button></div>
        </div>
        <details class="ec-target-picker">
          <summary>目标环节 · <span class="ec-target-summary" data-ec-role="target-summary"></span></summary>
          <div class="ec-target-grid">${targetOptions}</div>
        </details>
        <div class="ec-evidence">
          <span class="ec-section-lbl">仿真证据关联 <small>系统只建议，教师可调整</small></span>
          <div class="ec-evidence-list" data-ec-role="evidence-list"><span class="ec-empty">运行虚拟班后显示可关联记录</span></div>
        </div>
        <div class="ec-decision">
          <span class="ec-section-lbl">教师判断</span>
          <div class="ec-decision-acts">
            <button type="button" data-decision="supported">支持</button>
            <button type="button" data-decision="unsupported">不支持</button>
            <button type="button" data-decision="insufficient">证据不足</button>
          </div>
          <input class="ec-decision-note" data-ec-role="decision-note" maxlength="120" placeholder="判断依据（建议填写）"/>
        </div>
        <div class="ec-inject">
          <span class="ec-inject-lbl">⌕ 自定义数据源</span>
          <div class="ec-inject-acts">
            <button type="button" class="ec-inject-btn" data-act="upload"  title="${e.inject.upload}">📎 上传</button>
            <button type="button" class="ec-inject-btn" data-act="link"    title="${e.inject.link}">🔗 链接</button>
            <button type="button" class="ec-inject-btn" data-act="distill" title="${e.inject.distill}">✨ 蒸馏</button>
          </div>
        </div>
        <div class="ec-resolution" data-ec-role="resolution">
          <span class="ec-resolution-label">候选处理</span>
          <div class="ec-resolution-picker" data-ec-role="resolution-picker" role="group" aria-label="候选处理">
            <button type="button" data-review-choice="original">原意见入候选</button>
            <button type="button" data-review-choice="modified">修改后入候选</button>
            <button type="button" data-review-choice="rejected">不采用</button>
          </div>
          <div class="ec-resolution-summary" data-ec-role="resolution-summary" data-state="pending" hidden>
            <span class="ec-resolution-mark" aria-hidden="true">✓</span>
            <span class="ec-resolution-copy"></span>
            <button type="button" data-review-act="revise">改判</button>
          </div>
        </div>
        <div class="ec-reject-panel" data-ec-role="reject-panel" hidden>
          <label>不采用原因<input maxlength="120" placeholder="请留下一句教师决策理由"/></label>
          <span class="ec-inline-error" data-ec-role="reject-error" role="alert" hidden></span>
          <div><button type="button" data-reject-act="confirm">确认不采用</button><button type="button" data-reject-act="cancel">取消</button></div>
        </div>
      `;
      const body = card.querySelector('[data-ec-role="body"]');
      if (record.draftText === sourceText) body.innerHTML = liveReview ? liveReviewBodyMarkup(liveReview) : c.body;
      else body.textContent = record.draftText;
      grid.appendChild(card);
      const sourceComment = liveReview ? { anchor: liveReviewAnchorCopy(liveReview), body: liveReviewBodyMarkup(liveReview) } : c;
      const entry = {
        ...record,
        card,
        expertId: e.id,
        chapterId: chapter?.id || "",
        expert: e,
        sourceComment,
        seedComment: c,
        seedSourceText,
        sourceText,
        liveReview,
        liveReviewPhase: "idle",
        liveReviewError: "",
        isRevising: false,
      };
      state.expertCards.push(entry);
      if (entry.state === "candidate") {
        captureOriginalEnvContent(entry);
        saveExpertReview(chapter?.id, entry);
      }
      wireReviewCard(entry, chapter);
      syncReviewCardVisual(entry);
      syncLiveReviewVisual(entry);
      renderReviewEvidence(entry, { autoLink: true });
    });
    updateExpertAdoptBar();
    composeAssets();
    wireLiveReviewBatch();
    updateBatchIdleStatus();
  }

  const EXPERT_ADOPT_STORE = "pp.practice.expertAdoptions";
  const KEY_MOMENT_STORE = "pp.practice.keyMoments.v1";

  function loadKeyMoments(chapterId) {
    if (!chapterId) return [];
    try {
      const all = JSON.parse(localStorage.getItem(KEY_MOMENT_STORE) || "{}");
      return Array.isArray(all[chapterId])
        ? all[chapterId].filter((item) => item && item.id && Number.isFinite(Number(item.tSec)))
        : [];
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

  function loadAllExpertAdoptions() {
    try { return JSON.parse(localStorage.getItem(EXPERT_ADOPT_STORE) || "{}"); }
    catch { return {}; }
  }
  function loadExpertAdoptions(chapterId) {
    if (!chapterId) return {};
    return (loadAllExpertAdoptions()[chapterId]) || {};
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
    };
    try { localStorage.setItem(EXPERT_ADOPT_STORE, JSON.stringify(all)); } catch {}
  }

  function captureOriginalEnvContent(entry, envKeys = entry.targetEnvKeys) {
    if (!entry.originalEnvContent) entry.originalEnvContent = {};
    envKeys.forEach((envKey) => {
      if (Object.prototype.hasOwnProperty.call(entry.originalEnvContent, envKey)) return;
      const current = document.querySelector(`.pack-preview [data-pack-field="${envKey}"]`)?.textContent?.trim()
        || loadPackEdits(wizSelection.chapter)[envKey]
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
    const list = entry.card.querySelector('[data-ec-role="evidence-list"]');
    if (!list) return;
    const suggestions = new Set(suggestedEvidenceIdsForEntry(entry));
    if (!state.keyMoments.length) {
      list.innerHTML = `<span class="ec-empty">运行虚拟班后显示可关联记录</span>`;
      return;
    }
    list.innerHTML = state.keyMoments.map((km, index) => {
      const linked = entry.evidenceLinks.includes(km.id);
      const suggested = suggestions.has(km.id);
      return `<button type="button" class="ec-evidence-chip${linked ? " is-linked" : ""}${suggested ? " is-suggested" : ""}" data-km-id="${escapeHtml(km.id)}" title="${escapeHtml(km.cn)}">
        <b>KM-${String(index + 1).padStart(2, "0")}</b> ${fmtTime(km.tSec)}${suggested ? " · 系统建议" : ""}
      </button>`;
    }).join("");
    list.querySelectorAll("[data-km-id]").forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.dataset.kmId;
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
  }

  function refreshAllReviewEvidence({ autoLink = false } = {}) {
    (state.expertCards || []).forEach((entry) => renderReviewEvidence(entry, { autoLink }));
    renderStage3();
  }

  function syncReviewCardVisual(entry) {
    const card = entry.card;
    card.classList.toggle("is-candidate", entry.state === "candidate");
    card.classList.toggle("is-rejected", entry.state === "rejected");
    card.classList.toggle("is-resolved", entry.state !== "pending");
    const picker = card.querySelector('[data-ec-role="resolution-picker"]');
    const resolutionSummary = card.querySelector('[data-ec-role="resolution-summary"]');
    const resolved = entry.state !== "pending";
    if (picker) picker.hidden = resolved && !entry.isRevising;
    if (resolutionSummary) {
      resolutionSummary.hidden = !resolved || entry.isRevising;
      resolutionSummary.dataset.state = entry.state;
      const copy = resolutionSummary.querySelector(".ec-resolution-copy");
      if (copy) {
        const targets = entry.targetEnvKeys.map((key) => PRACTICE_ENV_BY_KEY[key]?.no).filter(Boolean).join(" / ");
        copy.textContent = entry.state === "rejected"
          ? `不采用 · ${entry.rejectionReason || "已保留教师理由"}`
          : `${entry.candidateMode === "modified" ? "修改后意见" : "原意见"}已进入修订候选${targets ? ` · ${targets}` : ""}`;
      }
    }
    card.querySelectorAll("[data-review-choice]").forEach((button) => {
      const activeChoice = entry.state === "rejected" ? "rejected" : entry.candidateMode;
      button.setAttribute("aria-pressed", String(resolved && button.dataset.reviewChoice === activeChoice));
    });
    const summary = card.querySelector('[data-ec-role="target-summary"]');
    if (summary) summary.textContent = entry.targetEnvKeys.map((key) => PRACTICE_ENV_BY_KEY[key]?.no).filter(Boolean).join(" / ") || "未选择";
    card.querySelectorAll("[data-decision]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.decision === entry.decision);
      button.disabled = entry.state !== "candidate";
    });
    const note = card.querySelector('[data-ec-role="decision-note"]');
    if (note && note.value !== entry.decisionNote) note.value = entry.decisionNote;
    syncLiveReviewVisual(entry);
  }

  function isLiveReviewStale(entry) {
    return !!entry.liveReview && entry.liveReview.sourceRevision !== getPackRevision(entry.chapterId || wizSelection.chapter);
  }

  // 同段避让失败时不丢弃批注,而是标出"与××同段"——不同学科对同一段落
  // 提出不同问题是真实情况,教师应看到并列意见而不是被系统裁剪。
  function liveReviewDupNote(entry) {
    if (!entry.liveReview) return "";
    const dup = (state.expertCards || []).find((other) => other !== entry
      && other.liveReview && !isLiveReviewStale(other)
      && other.liveReview.annotation.targetEnv === entry.liveReview.annotation.targetEnv
      && other.liveReview.annotation.segmentKey === entry.liveReview.annotation.segmentKey);
    return dup ? ` · 与${dup.expert?.role || "另一路审校"}同段` : "";
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
    entry.card.querySelectorAll("[data-review-choice]").forEach((choice) => {
      choice.disabled = stale;
      choice.title = stale ? "稿件已修改，请先重新审校当前版本" : "";
    });
  }

  function refreshReviewFreshness(chapterId) {
    (state.expertCards || [])
      .filter((entry) => !chapterId || entry.chapterId === chapterId)
      .forEach((entry) => syncLiveReviewVisual(entry));
  }

  function liveReviewFailureCopy(reason, hasPriorReview = false) {
    const copies = {
      out_of_scope: "模型把意见落到了教学设计主责范围之外。",
      wrong_env: "模型摘录来自另一个环节，未通过跨环节核对。",
      ambiguous: "同一摘录在稿件中出现多次，无法确定唯一位置。",
      ambiguous_env: "短摘录在多个环节重复出现，无法确定唯一位置。",
      too_short: "模型摘录过短，不足以形成可靠锚点。",
      not_found: "模型摘录未逐字命中当前稿件。",
      cross_reference_unanchored: "交叉引用没有全部命中当前稿件。",
    };
    const base = copies[reason] || "模型输出未通过锚定门禁。";
    return `${base}${hasPriorReview ? "现有批注未被替换；若其已过期，仍不能进入候选。" : "系统已保留固定审校种子。"}`;
  }

  // 同段避让：把其它卡已锚定且未过期的批注位置传给后端,提示模型优先另选段落。
  // 只取主锚点、上限 8 条,与服务端校验一致;这是提示不是门禁,同段仍可能出现,
  // 由 syncLiveReviewVisual 的"与××同段"标记诚实呈现。
  function collectAvoidAnchors(excludeExpertId) {
    return (state.expertCards || [])
      .filter((other) => other.expertId !== excludeExpertId && other.liveReview && !isLiveReviewStale(other))
      .map((other) => ({
        targetEnv: other.liveReview.annotation.targetEnv,
        sourceExcerpt: other.liveReview.annotation.sourceExcerpt,
      }))
      .slice(0, 8);
  }

  async function runLiveReview(entry, chapter, { silent = false } = {}) {
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
      return "error";
    }

    const requestedChapterId = selectedChapter.id;
    const sourceRevision = getPackRevision(requestedChapterId);
    const avoidAnchors = collectAvoidAnchors(entry.expertId);
    entry.liveReviewPhase = "loading";
    entry.liveReviewError = "";
    syncLiveReviewVisual(entry);
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
        entry.liveReviewPhase = "error";
        entry.liveReviewError = liveReviewFailureCopy(result?.gate?.reason, !!entry.liveReview);
        if (!silent) setStageStatus("ii", "本次审校未通过锚定门禁", false, true);
        syncLiveReviewVisual(entry);
        return "unanchored";
      }
      const liveReview = normalizeLiveReview(result);
      if (!liveReview) throw new Error("本地模型返回的审校记录不完整");

      entry.liveReview = liveReview;
      entry.sourceText = liveReviewSourceText(liveReview);
      entry.draftText = entry.sourceText;
      entry.sourceComment = { anchor: liveReviewAnchorCopy(liveReview), body: liveReviewBodyMarkup(liveReview) };
      entry.targetEnvKeys = liveReviewTargetKeys(liveReview);
      entry.liveReviewPhase = "idle";
      entry.liveReviewError = "";
      entry.card.querySelector('[data-ec-role="body"]').innerHTML = entry.sourceComment.body;
      const anchor = entry.card.querySelector(".ec-anchor");
      if (anchor) {
        anchor.textContent = entry.sourceComment.anchor;
        anchor.title = liveReview.annotation.sourceExcerpt;
      }
      entry.card.querySelectorAll('[data-ec-role="target-input"]').forEach((input) => {
        input.checked = entry.targetEnvKeys.includes(input.value);
      });
      saveExpertReview(requestedChapterId, entry);
      syncReviewCardVisual(entry);
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
      status: bar?.querySelector('[data-ec-role="batch-status"]') || null,
    };
  }

  function setBatchStatus(text) {
    const { status } = batchBarEls();
    if (status) status.textContent = text;
  }

  function updateBatchIdleStatus() {
    if (liveReviewBatchActive) return;
    const phase = document.documentElement.dataset.backend;
    setBatchStatus(phase === "ready" || phase === "conflict"
      ? "本机 Qwen 已连接 · 可对当前稿件运行五路审校"
      : "本机后端未连接 · 当前显示固定审校种子");
  }

  async function runAllLiveReviews() {
    if (liveReviewBatchActive) return;
    const chapter = getSelected("chapter");
    if (!getSelected("course") || !getSelected("class") || !getSelected("session") || !chapter || !currentPackFromPreview()) {
      toast("请先完成实践包四项选择，并确保九个环节都有内容");
      return;
    }
    const phase = document.documentElement.dataset.backend;
    if (!global.PharmacoBackend?.reviewPractice || (phase !== "ready" && phase !== "conflict")) {
      setBatchStatus("本机后端未连接 · 请用 npm start 打开页面后重试");
      toast("本机后端未连接 · 当前仍显示固定审校种子");
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
    const tally = { anchored: 0, unanchored: 0, error: 0, skipped: 0 };
    let done = 0;
    const worker = async () => {
      while (queue.length) {
        if (getSelected("chapter")?.id !== chapterId) { tally.skipped += queue.length; queue.length = 0; return; }
        const entry = queue.shift();
        setBatchStatus(`审校中 ${Math.min(done + 1, targets.length)}/${targets.length} · ${entry.expert?.role || "学科审校"} · 已锚定 ${tally.anchored}`);
        const outcome = await runLiveReview(entry, chapter, { silent: true });
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
    setStageStatus("ii", "五路学科审校结束", false, true);
    toast(`五路审校结束 · ${parts.join(" · ")}`);
  }

  function wireLiveReviewBatch() {
    const { bar, button } = batchBarEls();
    if (!bar || bar.dataset.wired === "1") return;
    bar.dataset.wired = "1";
    button?.addEventListener("click", () => { runAllLiveReviews(); });
    global.addEventListener("pharmaco:backend-status", () => updateBatchIdleStatus());
    updateBatchIdleStatus();
  }

  function wireReviewCard(entry, chapter) {
    const card = entry.card;
    const body = card.querySelector('[data-ec-role="body"]');
    const editPanel = card.querySelector('[data-ec-role="edit-panel"]');
    const textarea = editPanel?.querySelector("textarea");
    const editError = editPanel?.querySelector('[data-ec-role="edit-error"]');
    const rejectPanel = card.querySelector('[data-ec-role="reject-panel"]');
    const rejectInput = rejectPanel?.querySelector("input");
    const rejectError = rejectPanel?.querySelector('[data-ec-role="reject-error"]');

    const showInlineError = (element, message) => {
      if (!element) return;
      element.textContent = message;
      element.hidden = !message;
    };
    const renderEntryBody = () => {
      if (entry.draftText === entry.sourceText) body.innerHTML = entry.sourceComment.body;
      else body.textContent = entry.draftText;
    };
    const commitCandidate = (mode, text) => {
      if (isLiveReviewStale(entry)) {
        toast("该批注针对旧版稿件 · 请先重新审校当前版本");
        return;
      }
      if (!entry.targetEnvKeys.length) {
        toast("请先为这条审校意见选择至少一个目标教学环节");
        return;
      }
      captureOriginalEnvContent(entry);
      entry.state = "candidate";
      entry.candidateMode = mode;
      entry.draftText = text;
      entry.rejectionReason = "";
      entry.evidenceTouched = false;
      entry.evidenceLinks = suggestedEvidenceIdsForEntry(entry);
      entry.decision = "pending";
      entry.decisionNote = "";
      entry.writtenBack = false;
      entry.isRevising = false;
      editPanel.hidden = true;
      rejectPanel.hidden = true;
      showInlineError(editError, "");
      showInlineError(rejectError, "");
      renderEntryBody();
      saveExpertReview(chapter?.id, entry);
      syncReviewCardVisual(entry);
      renderReviewEvidence(entry);
      updateExpertAdoptBar();
      composeAssets();
    };

    card.querySelector('[data-review-act="live"]')?.addEventListener("click", () => {
      runLiveReview(entry, chapter);
    });

    card.querySelector('[data-review-choice="original"]')?.addEventListener("click", () => {
      commitCandidate("original", entry.sourceText);
    });
    card.querySelector('[data-review-choice="modified"]')?.addEventListener("click", () => {
      textarea.value = entry.candidateMode === "modified" ? entry.draftText : entry.sourceText;
      rejectPanel.hidden = true;
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
        syncReviewCardVisual(entry);
        renderReviewEvidence(entry);
        updateExpertAdoptBar();
        composeAssets();
      });
    });

    card.querySelector('[data-review-choice="rejected"]')?.addEventListener("click", () => {
      editPanel.hidden = true;
      showInlineError(rejectError, "");
      rejectPanel.hidden = false;
      rejectInput.value = entry.rejectionReason || "";
      rejectInput.focus();
    });
    rejectPanel?.querySelector('[data-reject-act="confirm"]')?.addEventListener("click", () => {
      const reason = rejectInput.value.trim();
      if (!reason) { showInlineError(rejectError, "请填写一句不采用原因，保留教师决策痕迹"); return; }
      entry.state = "rejected";
      entry.candidateMode = null;
      entry.rejectionReason = reason;
      entry.decision = "pending";
      entry.decisionNote = "";
      entry.evidenceLinks = [];
      entry.writtenBack = false;
      entry.isRevising = false;
      rejectPanel.hidden = true;
      showInlineError(rejectError, "");
      saveExpertReview(chapter?.id, entry);
      syncReviewCardVisual(entry);
      renderReviewEvidence(entry);
      updateExpertAdoptBar();
      composeAssets();
    });
    rejectPanel?.querySelector('[data-reject-act="cancel"]')?.addEventListener("click", () => {
      rejectPanel.hidden = true;
      showInlineError(rejectError, "");
      entry.isRevising = false;
      syncReviewCardVisual(entry);
    });

    card.querySelector('[data-review-act="revise"]')?.addEventListener("click", () => {
      entry.isRevising = true;
      editPanel.hidden = true;
      rejectPanel.hidden = true;
      syncReviewCardVisual(entry);
    });

    card.querySelectorAll("[data-decision]").forEach((button) => {
      button.addEventListener("click", () => {
        if (entry.state !== "candidate") return;
        const next = button.dataset.decision;
        if (next !== "insufficient" && !entry.evidenceLinks.length) {
          toast("“支持/不支持”必须关联至少一条仿真记录；否则请选择“证据不足”");
          return;
        }
        entry.decision = next;
        entry.writtenBack = false;
        saveExpertReview(chapter?.id, entry);
        syncReviewCardVisual(entry);
        updateExpertAdoptBar();
        composeAssets();
      });
    });
    card.querySelector('[data-ec-role="decision-note"]')?.addEventListener("blur", (event) => {
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
  background: var(--ivory, #fffdf7); color: var(--ink, #1a1a1a);
  border: 1px solid var(--ink, #1a1a1a); border-radius: 14px;
  box-shadow: 8px 8px 0 var(--ink, #1a1a1a);
  padding: 24px 28px; position: relative;
  font-family: var(--serif-cn);
}
.pp-ai-close {
  position: absolute; top: 12px; right: 14px;
  width: 28px; height: 28px; border-radius: 50%;
  background: var(--paper-2, #f3eedc); border: 1px solid var(--rule, #d8d2bf);
  cursor: pointer; font-size: var(--fs-md); line-height: 1;
  display: grid; place-items: center;
}
.pp-ai-close:hover { background: var(--amber-deep, #a8492a); color: var(--ivory, #fffdf7); }
.pp-ai-head {
  display: grid; grid-template-columns: auto 1fr auto; gap: 14px;
  align-items: center; padding-bottom: 14px;
  border-bottom: 1px dashed var(--rule, #d8d2bf); margin-bottom: 14px;
}
.pp-ai-id {
  width: 48px; height: 48px; border-radius: 10px;
  background: var(--ink, #1a1a1a); color: var(--ivory, #fffdf7);
  font-family: var(--serif-en); font-style: italic; font-size: var(--fs-xl); font-weight: 500;
  display: grid; place-items: center;
}
.pp-ai-who .pp-ai-alias { font-size: var(--fs-lg); font-weight: 600; }
.pp-ai-who .pp-ai-demo { font-family: var(--mono); font-size: var(--fs-2xs); color: var(--mute, #807a6c); margin-top: 2px; letter-spacing: .04em; }
.pp-ai-stance {
  padding: 6px 12px; border-radius: 999px;
  font-family: var(--mono); font-size: var(--fs-2xs); letter-spacing: .04em;
  background: var(--paper-2, #f3eedc); color: var(--ink, #1a1a1a);
  display: flex; align-items: center; gap: 6px;
}
.pp-ai-stance small { font-size: var(--fs-2xs); opacity: .6; }
.pp-ai-stance.s-a { background: rgba(217,119,87,.18); color: var(--amber-deep); }
.pp-ai-stance.s-b { background: rgba(77,98,87,.2); color: var(--sage); }
.pp-ai-stance.s-c { background: rgba(112,82,168,.16); color: var(--violet); }
.pp-ai-stance.s-d { background: rgba(100,100,100,.12); color: #555; }
.pp-ai-row {
  font-size: var(--fs-sm); line-height: 1.65; margin-bottom: 8px;
  padding: 8px 12px; background: var(--paper, #faf7f0); border-radius: 6px;
}
.pp-ai-row b {
  display: inline-block; min-width: 56px; margin-right: 8px;
  font-family: var(--mono); font-size: var(--fs-2xs); letter-spacing: .08em; text-transform: uppercase;
  color: var(--amber-deep, #a8492a); font-weight: 600; vertical-align: middle;
}
.pp-ai-row.is-caveat { background: rgba(217,119,87,.06); border-left: 2px solid var(--amber-deep, #a8492a); }
.pp-ai-row small { display: block; margin-left: 64px; margin-top: 4px; font-family: var(--mono); font-size: var(--fs-2xs); color: var(--mute, #807a6c); }
.pp-ai-grid2 {
  display: grid; grid-template-columns: 1fr 1fr; gap: 14px;
  margin-top: 14px;
}
.pp-ai-grid2 > div {
  background: var(--paper-2, #f3eedc); border-radius: 8px; padding: 12px 14px;
}
.pp-ai-grid2 h5 {
  font-family: var(--mono); font-size: var(--fs-2xs); letter-spacing: .12em;
  text-transform: uppercase; color: var(--mute, #807a6c);
  margin: 0 0 10px; padding-bottom: 6px;
  border-bottom: 1px dashed var(--rule, #d8d2bf);
}
.pp-ai-grid2 > div > div { font-size: var(--fs-xs); line-height: 1.6; margin-bottom: 6px; color: var(--ink-2, #2a2a2a); }
.pp-ai-grid2 > div > div b {
  font-family: var(--mono); font-size: var(--fs-2xs); letter-spacing: .06em; text-transform: uppercase;
  color: var(--amber-deep, #a8492a); margin-right: 6px; font-weight: 600;
}
.pp-ai-meter {
  display: grid; grid-template-columns: 78px 1fr 36px; align-items: center;
  gap: 8px; margin-bottom: 6px;
  font-family: var(--mono); font-size: var(--fs-2xs);
}
.pp-ai-meter span { color: var(--mute, #807a6c); }
.pp-ai-meter > div {
  height: 4px; background: rgba(0,0,0,.08); border-radius: 2px; overflow: hidden;
}
.pp-ai-meter > div i {
  display: block; height: 100%; background: var(--amber-deep, #a8492a);
  transition: width .2s;
}
.pp-ai-meter b { text-align: right; color: var(--ink, #1a1a1a); position: relative; }
.pp-ai-meter b em {
  display: block; font-style: normal; font-size: var(--fs-2xs);
  font-family: var(--mono); letter-spacing: .04em;
  position: absolute; right: 0; top: 100%; margin-top: 1px;
  white-space: nowrap;
}
.pp-ai-meter b em.is-down { color: var(--amber-deep, #a8492a); }
.pp-ai-meter b em.is-up { color: var(--sage); }
.pp-ai-eventlog {
  margin-top: 14px; padding: 12px 14px;
  background: var(--paper, #faf7f0); border: 1px dashed var(--rule, #d8d2bf); border-radius: 8px;
}
.pp-ai-eventlog h5 {
  font-family: var(--mono); font-size: var(--fs-2xs); letter-spacing: .12em;
  text-transform: uppercase; color: var(--mute, #807a6c); margin: 0 0 8px;
}
.pp-ai-ev {
  display: grid; grid-template-columns: 50px 1fr auto; gap: 10px;
  padding: 5px 0; border-bottom: 1px dotted var(--rule, #d8d2bf);
  font-size: var(--fs-2xs); align-items: center;
}
.pp-ai-ev:last-child { border-bottom: 0; }
.pp-ai-ev-t {
  font-family: var(--mono); color: var(--amber-deep, #a8492a);
  font-weight: 600; font-size: var(--fs-2xs);
}
.pp-ai-ev-why { color: var(--ink-2, #2a2a2a); font-family: var(--serif-cn); }
.pp-ai-ev-fx { display: flex; gap: 6px; }
.pp-ai-ev-fx span {
  font-family: var(--mono); font-size: var(--fs-2xs);
  padding: 1px 5px; border-radius: 3px;
}
.pp-ai-ev-fx span.is-down { background: rgba(217,119,87,.14); color: var(--amber-deep, #a8492a); }
.pp-ai-ev-fx span.is-up { background: rgba(77,98,87,.14); color: var(--sage); }
.pp-ai-resp {
  padding: 6px 8px; margin-bottom: 5px; background: var(--ivory, #fffdf7);
  border-left: 2px solid var(--amber-deep, #a8492a); border-radius: 4px;
}
.pp-ai-rkey {
  display: block; font-family: var(--mono); font-size: var(--fs-2xs);
  color: var(--mute, #807a6c); letter-spacing: .06em; margin-bottom: 3px;
}
.pp-ai-resp > div {
  font-family: var(--serif-cn); font-size: var(--fs-2xs); line-height: 1.55; color: var(--ink-2, #2a2a2a);
  font-style: italic;
}
.pp-ai-drama {
  margin-top: 14px; padding: 14px 16px;
  background: var(--ink, #1a1a1a); color: var(--ivory, #fffdf7); border-radius: 10px;
}
.pp-ai-drama h5 {
  font-family: var(--mono); font-size: var(--fs-2xs); letter-spacing: .14em;
  text-transform: uppercase; color: rgba(217,119,87,.85);
  margin: 0 0 10px;
}
.pp-ai-drama > div {
  font-size: var(--fs-xs); line-height: 1.6; margin-bottom: 6px;
  font-family: var(--serif-cn);
}
.pp-ai-drama > div b {
  font-family: var(--mono); font-size: var(--fs-2xs); letter-spacing: .08em; text-transform: uppercase;
  color: rgba(217,119,87,.85); margin-right: 6px; font-weight: 500;
}
.pp-ai-rubric {
  margin-top: 14px; padding: 12px 14px;
  background: var(--paper-2, #f3eedc); border-radius: 8px;
}
.pp-ai-rubric h5 {
  font-family: var(--mono); font-size: var(--fs-2xs); letter-spacing: .12em;
  text-transform: uppercase; color: var(--mute, #807a6c);
  margin: 0 0 8px;
}
.pp-ai-rubric-row {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px;
  font-family: var(--mono); font-size: var(--fs-2xs); color: var(--ink-2, #2a2a2a);
}
.pp-ai-rubric-row span {
  padding: 3px 6px; background: var(--ivory, #fffdf7); border-radius: 3px;
  text-align: center;
}
.pp-ai-foot {
  margin-top: 12px; padding-top: 10px; border-top: 1px dashed var(--rule, #d8d2bf);
  font-family: var(--mono); font-size: var(--fs-2xs); color: var(--mute, #807a6c);
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
    if (stance.includes("医保")) return "s-a";
    if (stance.includes("慢病")) return "s-b";
    if (stance.includes("药企")) return "s-c";
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
          <h5>量规初值（6 维 · 来源：${escapeHtml(ri._provenance_note || "designed")}）</h5>
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
        `<div class="persona-type-tag ptt-a">医保视角 ×${rows}</div>`,
        `<div class="persona-type-tag ptt-b">慢病家属 ×${rows}</div>`,
        `<div class="persona-type-tag ptt-c">药企背景 ×${rows}</div>`,
        `<div class="persona-type-tag ptt-d">沉默观望 ×${rows}</div>`,
      ].join("");
    }

    // 4 fixed columns — each column = one persona type
    const colDef = [
      { type: "type-a", short: "医保", col: "A" },
      { type: "type-b", short: "慢病", col: "B" },
      { type: "type-c", short: "药企", col: "C" },
      { type: "type-d", short: "沉默", col: "D" },
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
      foot.innerHTML = `<span>已表态 <b>${speaking}</b>/${n}</span><span>C组 <b style="color:var(--amber-deep)">0</b> 未发声</span><span>主动 <b>${proactive}</b></span>`;
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
    const speaking = Math.max(0, Math.round(n * 0.44));
    const conflict = (state.eventStream || []).filter((b) => b.flags?.conflict).length;
    const drift = (conflict * 0.35).toFixed(1);
    const left = bar.querySelector("span:first-child");
    if (left) {
      left.innerHTML = `本轮试错 · 关键时刻 <b style="color:var(--ink)">${km}</b> 处 · 风险信号 <b style="color:var(--ink)">${risks}</b> 项 · 学生表态 <b style="color:var(--ink)">${speaking} / ${n}</b> · 立场迁移 <b style="color:var(--ink)">+${drift}</b>`;
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
    renderExpertCards(chapter);
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

  function syncToHeroAndPreview() {
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

    // —— 2. 同步 pack-preview 内容（9 个教学环节卡随章节变化）
    const preview = document.querySelector(".pack-preview");
    if (preview && chapter) {
      const ttl = preview.querySelector(".pack-preview-h h4");
      const pid = preview.querySelector(".pack-preview-h .pid");
      if (ttl) ttl.innerHTML = `课堂实践包预览<small>章节：${chapter.title}（${chapter.topic}） · 由教师真实输入合成</small>`;
      if (pid) pid.textContent = `P-${chapter.id.toUpperCase().slice(0, 8)}`;
      // 用一段 mock 内容反映"章节驱动"；所有章节都按 4 任务/4 角色/6 评价/5 资料 配齐
      const mocks = {
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
      // 原始 mock → buildEnvPackContent → 教师编辑覆盖
      const rawMock    = mocks[chapter.id] || fallback;
      const envContent = buildEnvPackContent(chapter, rawMock);
      const edits      = loadPackEdits(chapter.id);
      const merged     = { ...envContent, ...edits };
      const generation = loadPackGenerationMeta(chapter.id);
      if (ttl && generation?.source === "local-model") {
        ttl.innerHTML = `课堂实践包预览<small>章节：${chapter.title}（${chapter.topic}） · 本机 Qwen 生成 · 可继续编辑</small>`;
      }

      // 填充 9 张环节卡
      PACK_KEYS.forEach((key) => {
        const envNum = key.slice(3);                                  // "01".."09"
        const card   = preview.querySelector(`.pack-item[data-env="${envNum}"]`);
        if (!card) return;
        const body = card.querySelector(".body");
        if (!body) return;
        const content = merged[key] || "";
        body.textContent = content;
        body.setAttribute("contenteditable", "true");
        body.dataset.packField = key;
        // 动态计数
        const n = content.split(/[·；;]/).map((s) => s.trim()).filter(Boolean).length;
        const cnt = card.querySelector(".env-count");
        if (cnt) cnt.textContent = n > 0 ? `${n} 条` : "";
      });
      wirePackEdits(preview, chapter.id);
    }
    // 实践包先就绪，再构建审校候选；加入候选时才能冻结真实原文快照。
    renderStage2(chapter);
    // Stage 3 的 sync-tri 和模板类型随章节选择联动
    renderStage3();
  }

  function updateExpertAdoptBar() {
    if (!state.expertCards) return;
    const total = state.expertCards.length;
    let candidates = 0, rejected = 0, pending = 0, decided = 0;
    state.expertCards.forEach((entry) => {
      if (entry.state === "candidate") candidates++;
      else if (entry.state === "rejected") rejected++;
      else pending++;
      if (entry.decision !== "pending") decided++;
    });
    const candidateEntries = state.expertCards.filter((entry) => entry.state === "candidate");
    const linked = new Set(candidateEntries.flatMap((entry) => entry.evidenceLinks)).size;
    const bar = document.querySelector('#stage-ii [data-substage="A"] .adopt-bar');
    if (bar) {
      const left = bar.querySelector("span:first-child");
      if (left) left.innerHTML = `修订候选 · <span class="pct">${candidates} / ${total}</span> · 证据已关联 ${linked} · 教师已判断 ${decided} · 不采用 ${rejected} · 待处理 ${pending}`;
    }
    // 同步页眉摘要卡，让候选/判断操作所见即所得
    const summary = document.querySelector('#practiceMeta [data-field="adoption"]')
                  || document.querySelector('[data-field="adoption"]');
    if (summary) {
      summary.textContent = `${total} 路审校 · 候选 ${candidates} · 已判断 ${decided} · 待处理 ${pending}`;
    }
  }

  function init() {
    mountControls();
    ingestExistingBeats();
    syncDotKey();
    wireInlineControls();
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
    deriveKeyMoments, composeAssets, writeBackAllAssets,
  };
})(window);
