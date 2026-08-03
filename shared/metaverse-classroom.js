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

  /* ---------- 0 · 唯一真相来源：window.MVCore ----------
   *  STUDENTS / STANCE_BAKED / SCRIPT / TEACHER_BEATS 及整套规则引擎
   *  (advanceSim / genOneBeat / scoreDesire / nudgeStances / tickRT …)
   *  统一来自 shared/mv-classroom-core.js。本文件只是 WebGL/Three.js
   *  不可用时的 2.5D 等距回退渲染器——消费 MVCore、不再自带任何副本，
   *  使全站仿真核心只此一份（改学生名/立场/剧本只需动 core 一处）。 */
  const MV = window.MVCore;
  if (!MV) {
    console.error("[MV2D] 缺少 window.MVCore（请在本脚本前加载 shared/mv-classroom-core.js）——2.5D 回退教室无法启动。");
    window.MV2D = window.MV2D || { mount: function () {} };
    return;
  }
  // 数据与纯函数：引用稳定，安全解构（与 MVCore 同一份对象/函数）
  const { STUDENTS, byId, STANCE_BAKED, SCRIPT, T_CAP, TEACHER_BEATS, PROJECTION_SPOKEN, traitOf, cleanBeatText, agentOf } = MV;
  // 运行时状态表：MVCore.reset() 原地清空+重填同一对象，故本引用始终有效（DYN 是 getter，须用 MV.DYN 实时取）
  const RT = MV.allRT();
  // 引擎推进：本回退渲染器走"烘焙→回放"，不需要 onBeat 回调
  const advanceSim = (toSec) => MV.advanceSim(toSec);

  // 把 RT 注意力投影到座位透明度
  function reflectSeatsRT() {
    if (!MV.agentsReady()) return;
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
    mount.className = "mv-root"; // context-loss 回退时清除残留的 .mv3-root / 座位模式类
    mount.dataset.view = "room"; // 教室视图：触发隐藏舞台 .mv-podium（房间已自带 #mv-podium-iso，避免双讲台）
    const canRetry3D = window.__MV3D_STATUS === "fallback" && window.PharmacoPilotMV3DControl && typeof window.PharmacoPilotMV3DControl.retry === "function";

    // 头部:标题 + LIVE + 控件
    const head = el("div", "mv-head");
    head.innerHTML = `
      <div class="mv-head-l">
        <h4>虚拟班级试错 · 元宇宙教室<small>AI 虚拟班 32 人 · P-2024-Q3 v0.3 · 45 分钟</small></h4>
      </div>
      <div class="mv-head-r">
        ${canRetry3D ? '<span class="mv-fallback-note">兼容模式</span><button type="button" class="mv-btn mv-btn-ghost" id="mv-retry-3d">重试 3D</button>' : ""}
        <span class="mv-live"><i></i>实时 · <b class="mv-timer">02:12</b> / 45:00</span>
        <span class="mv-sess">会话 #3417</span>
      </div>`;
    mount.appendChild(head);
    const retry3D = mount.querySelector("#mv-retry-3d");
    if (retry3D) retry3D.addEventListener("click", () => window.PharmacoPilotMV3DControl.retry());

    // 控件条（录播播放器：播放/暂停 + 回到开头 + 图例）
    const ctrl = el("div", "mv-controls");
    ctrl.innerHTML = `
      <div class="mv-ctrl-l">
        <button type="button" class="mv-btn mv-btn-run" id="mv-run">▶ 播放录播</button>
        <button type="button" class="mv-btn mv-btn-ghost" id="mv-reset">⟲ 回到开头</button>
      </div>
      <div class="mv-ctrl-r">
        <span class="mv-legend"><i class="lg-live"></i>发言中</span>
        <span class="mv-legend"><i class="lg-active"></i>已表态</span>
        <span class="mv-legend"><i class="lg-silent"></i>沉默</span>
        <span class="mv-legend"><i class="lg-quiet"></i>观望</span>
      </div>`;
    mount.appendChild(ctrl);

    // 录播进度条（可点/拖任意一帧；关键时刻刻度）
    const scrub = el("div", "mv-scrub");
    scrub.innerHTML = `
      <span class="mv-scrub-time"><b id="mv-cur">00:00</b> / ${fmt(T_CAP)}</span>
      <div class="mv-scrub-track" id="mv-scrub-track" role="slider" tabindex="0" aria-label="录播进度，拖动到任意时刻" aria-valuemin="0" aria-valuemax="${T_CAP}" aria-valuenow="0" aria-valuetext="00:00">
        <div class="mv-scrub-fill" id="mv-scrub-fill"></div>
        <div class="mv-scrub-ticks" id="mv-scrub-ticks"></div>
        <div class="mv-scrub-head" id="mv-scrub-head"></div>
        <div class="mv-scrub-tip" id="mv-scrub-tip"></div>
      </div>`;
    mount.appendChild(scrub);

    // 舞台:讲台 + 四组圆桌
    const stage = el("div", "mv-stage");

    // 讲台
    const podium = el("div", "mv-podium");
    podium.innerHTML = `
      <div class="mv-podium-fig mv-fig-teacher" title="教师">师</div>
      <div class="mv-podium-txt">
        <span class="mv-podium-lbl">讲台</span>
        <span class="mv-podium-sub">教师 + AI 助手协同主持</span>
      </div>
      <div class="mv-podium-fig mv-fig-agent" title="AI 助手">AI</div>`;
    stage.appendChild(podium);

    // 教室顶视图 / 立场光谱（可切换）+ 教师分组
    const floor = el("div", "mv-floor");
    floor.id = "mv-floor-host";
    paintFloor(floor);
    stage.appendChild(floor);

    // 底部字幕条（a11y：发言字幕对屏幕阅读器朗读）
    const sub = el("div", "mv-subtitle");
    sub.setAttribute("role", "status");
    sub.setAttribute("aria-live", "polite");
    sub.setAttribute("aria-atomic", "true");
    sub.setAttribute("aria-label", "当前发言字幕");
    sub.innerHTML = `<span class="mv-sub-ts">02:12</span>
      <span class="mv-sub-role role-T">教师</span>
      <span class="mv-sub-text">点击「▶ 运行模拟」，从 00:00 重演这堂 SWOT/TOWS 环境分析课。</span>`;
    stage.appendChild(sub);
    subtitleEl = sub;

    mount.appendChild(stage);

    // 分析面板(原 sim-side 的画像统计 / 风险信号 / 评价标准歧义)
    mount.appendChild(buildAnalysis());

    // 收集引用 + 绑定
    timerEls = Array.from(mount.querySelectorAll(".mv-timer"));
    runBtn = mount.querySelector("#mv-run");
    runBtn.addEventListener("click", toggleRun);
    mount.querySelector("#mv-reset").addEventListener("click", reset);
    bindScrub();
  }

  /* ---------- 控件 7.1 · 录播进度条：点/拖任意一帧 + 关键时刻刻度 ---------- */
  // 关键时刻（问题链 / Agent 提示 / 集体沉默 / 点名 / 反思），用于进度条刻度与 hover 提示
  function keyMoments() {
    const ms = [];
    SCRIPT.forEach((b) => {
      if (b.kind === "marker") ms.push({ t: b.t, label: b.text, type: "q" });
      else if (b.kind === "silence") ms.push({ t: b.t, label: "集体沉默 · " + (b.group || "") + " 组", type: "silence" });
      else if (b.kind === "note") ms.push({ t: b.t, label: (b.km ? b.km + " · " : "") + "AI 助手提示", type: "km" });
    });
    TEACHER_BEATS.forEach((tb) => {
      if (tb.marker) ms.push({ t: tb.t, label: tb.text, type: "q" });
      else ms.push({ t: tb.t, label: "教师 · " + tb.text, type: tb.callC ? "call" : (tb.reflect ? "reflect" : "teacher") });
    });
    return ms.sort((a, b) => a.t - b.t);
  }
  let scrubEls = null, scrubbing = false;
  function bindScrub() {
    const track = mount.querySelector("#mv-scrub-track"); if (!track) return;
    scrubEls = {
      track, fill: mount.querySelector("#mv-scrub-fill"), head: mount.querySelector("#mv-scrub-head"),
      cur: mount.querySelector("#mv-cur"), tip: mount.querySelector("#mv-scrub-tip"), ticksHost: mount.querySelector("#mv-scrub-ticks"),
    };
    // 刻度
    keyMoments().forEach((m) => {
      const tk = el("span", "mv-scrub-tick t-" + m.type);
      tk.style.left = (m.t / T_CAP * 100).toFixed(2) + "%";
      tk.title = fmt(m.t) + " · " + m.label;
      scrubEls.ticksHost.appendChild(tk);
    });
    const tFromEvt = (clientX) => {
      const r = track.getBoundingClientRect();
      const f = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
      return Math.round(f * T_CAP);
    };
    // 同步 seek（applyState 很轻；不走 rAF，避免后台/隐藏页 rAF 被节流时拖不动）
    const queueSeek = (tSec) => stepTo(tSec);
    const showTip = (clientX) => {
      if (!scrubEls.tip) return;
      const t = tFromEvt(clientX), r = track.getBoundingClientRect();
      const near = keyMoments().filter((m) => Math.abs(m.t - t) <= 28).sort((a, b) => Math.abs(a.t - t) - Math.abs(b.t - t))[0];
      scrubEls.tip.textContent = fmt(t) + (near ? "  ·  " + near.label : "");
      scrubEls.tip.style.left = (Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * 100).toFixed(1) + "%";
    };
    track.addEventListener("pointerdown", (e) => {
      scrubbing = true; track.classList.add("is-scrubbing"); track.setPointerCapture && track.setPointerCapture(e.pointerId);
      if (state.playing) pause();
      queueSeek(tFromEvt(e.clientX)); showTip(e.clientX); e.preventDefault();
    });
    track.addEventListener("pointermove", (e) => { showTip(e.clientX); if (scrubbing) queueSeek(tFromEvt(e.clientX)); });
    const endScrub = () => { scrubbing = false; track.classList.remove("is-scrubbing"); };
    track.addEventListener("pointerup", endScrub);
    track.addEventListener("pointercancel", endScrub);
    track.addEventListener("keydown", (e) => {
      const k = e.key; let d = 0;
      if (k === "ArrowLeft") d = -30; else if (k === "ArrowRight") d = 30;
      else if (k === "Home") { stepTo(0); e.preventDefault(); return; }
      else if (k === "End") { stepTo(T_CAP); e.preventDefault(); return; }
      if (d) { if (state.playing) pause(); stepTo(state.tSec + d); e.preventDefault(); }
    });
  }
  var mvTimeCbs = [], mvLastNotifyT = -999;
  function updateScrub(tSec) {
    if (scrubEls) {
      const pct = Math.max(0, Math.min(100, tSec / T_CAP * 100));
      if (scrubEls.fill) scrubEls.fill.style.width = pct + "%";
      if (scrubEls.head) scrubEls.head.style.left = pct + "%";
      if (scrubEls.cur) scrubEls.cur.textContent = fmt(tSec);
      if (scrubEls.track) { scrubEls.track.setAttribute("aria-valuenow", String(Math.round(tSec))); scrubEls.track.setAttribute("aria-valuetext", fmt(tSec)); }
    }
    // 录播时间广播：供外部"证据流"等联动（getT/onTime/seek/keyMoments 见 window.PharmacoPilotMV）
    if (tSec !== mvLastNotifyT) { mvLastNotifyT = tSec; for (var i = 0; i < mvTimeCbs.length; i++) { try { mvTimeCbs[i](tSec); } catch (e) {} } }
  }

  /* ---------- 5.1 · 视图切换：教室顶视图 ⇄ 立场光谱 ---------- */
  // floor 内只保留一个视图 + 教师分组面板；切换时重建并重新绑定，再按当前 tSec 复原状态。
  function paintFloor(floorEl) {
    floorEl.innerHTML = "";
    seatEls = {};                 // 引擎只认 seatEls
    floorEl.appendChild(buildStanceRoom());
  }

  /* ---------- 5.2 · 立场教室（2.5D 等距 diorama：横轴=立场，纵深=参与度） ---------- */
  // 透视投影：世界坐标 gx∈[0,1] 立场（0 反对/1 支持）、gy∈[0,1] 纵深（0 远/后排、1 近/前排）→ 屏幕
  const ISO = { topY: 100, botY: 394, spanFar: 0.44, spanNear: 0.98, sFar: 0.58, sNear: 1.12 };
  function isoXpct(gx, gy) { const span = ISO.spanFar + (ISO.spanNear - ISO.spanFar) * gy; return 50 + (gx - 0.5) * span * 100; }
  function isoYpx(gy) { return ISO.topY + (ISO.botY - ISO.topY) * gy; }
  function isoScale(gy) { return ISO.sFar + (ISO.sNear - ISO.sFar) * gy; }
  function placeIso(ch, gx, gy) {
    ch.style.left = isoXpct(gx, gy).toFixed(2) + "%";
    ch.style.top = isoYpx(gy).toFixed(1) + "px";
    ch.style.transform = "translate(-50%,-100%) scale(" + isoScale(gy).toFixed(3) + ")";
    ch.style.zIndex = String(200 + Math.round(gy * 300));
  }

  function buildStanceRoom() {
    const room = el("div", "mv-groom");
    const VBW = 1000, X = (gx, gy) => (isoXpct(gx, gy) * VBW / 100).toFixed(1), Y = (gy) => isoYpx(gy).toFixed(1);
    const WT = 32; // 后墙顶 y
    const floor = `${X(0,1)},${Y(1)} ${X(1,1)},${Y(1)} ${X(1,0)},${Y(0)} ${X(0,0)},${Y(0)}`;
    const zoneL = `${X(0,1)},${Y(1)} ${X(0.5,1)},${Y(1)} ${X(0.5,0)},${Y(0)} ${X(0,0)},${Y(0)}`;
    const zoneR = `${X(0.5,1)},${Y(1)} ${X(1,1)},${Y(1)} ${X(1,0)},${Y(0)} ${X(0.5,0)},${Y(0)}`;
    const backWall = `${X(0,0)},${Y(0)} ${X(1,0)},${Y(0)} ${X(1,0)},${WT} ${X(0,0)},${WT}`;
    const leftWall = `${X(0,1)},${Y(1)} ${X(0,0)},${Y(0)} ${X(0,0)},${WT} ${X(0,1)},${(isoYpx(1) - 96).toFixed(1)}`;
    const rightWall = `${X(1,1)},${Y(1)} ${X(1,0)},${Y(0)} ${X(1,0)},${WT} ${X(1,1)},${(isoYpx(1) - 96).toFixed(1)}`;
    let grid = "";
    for (let i = 1; i < 6; i++) { const gy = i / 6; grid += `<line x1="${X(0,gy)}" y1="${Y(gy)}" x2="${X(1,gy)}" y2="${Y(gy)}"/>`; }
    for (let i = 1; i < 8; i++) { const gx = i / 8; grid += `<line x1="${X(gx,0)}" y1="${Y(0)}" x2="${X(gx,1)}" y2="${Y(1)}"/>`; }
    room.innerHTML = `
      <div class="mv-room-head">
        <span class="mv-room-title">⌂ 环境分析教室 · SWOT 内外部边界</span>
        <span class="mv-room-scene">近=前排讨论(投入) · 远=后排走神 · 左右=立场 · 被说服就走过去</span>
      </div>
      <div class="mv-groom-floor" id="mv-sstage">
        <svg class="mv-iso-bg" viewBox="0 0 ${VBW} 430" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <!-- 地板：近端深暖/远端浅暖，模拟木地板进深光感 -->
            <linearGradient id="floorGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#e8d9b8"/>
              <stop offset="100%" stop-color="#d0bb92"/>
            </linearGradient>
            <!-- 后墙：顶部偏冷/底部偏暖，模拟环境光 -->
            <linearGradient id="wallGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#bfb4a0"/>
              <stop offset="100%" stop-color="#cfc3a8"/>
            </linearGradient>
            <!-- 侧墙：比后墙暖一点，弱光面 -->
            <linearGradient id="sideGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#cbbea8"/>
              <stop offset="100%" stop-color="#d9ccb4"/>
            </linearGradient>
          </defs>
          <polygon class="iso-backwall" points="${backWall}"/>
          <polygon class="iso-sidewall" points="${leftWall}"/>
          <polygon class="iso-sidewall" points="${rightWall}"/>
          <!-- 白板/黑板 with subtle inner border -->
          <rect class="iso-board" x="${X(0.33,0)}" y="${WT + 7}" width="${(X(0.67,0) - X(0.33,0)).toFixed(1)}" height="${(isoYpx(0) - WT - 16).toFixed(1)}" rx="4"/>
          <rect x="${(+X(0.33,0)+2.5).toFixed(1)}" y="${WT + 9.5}" width="${(X(0.67,0) - X(0.33,0) - 5).toFixed(1)}" height="${(isoYpx(0) - WT - 21).toFixed(1)}" rx="2.5" fill="none" stroke="#d4c8a8" stroke-width=".8"/>
          <polygon class="iso-floor" points="${floor}"/>
          <polygon class="iso-zone-l" points="${zoneL}"/>
          <polygon class="iso-zone-r" points="${zoneR}"/>
          <g class="iso-grid">${grid}</g>
        </svg>
        <span class="mv-wall-lbl wl">◀ 内部能力 S / W</span>
        <span class="mv-wall-lbl wr">外部环境 O / T ▶</span>
        <span class="mv-wall-lbl wc">骑墙 / 观望</span>
        <div class="mv-podium-iso" id="mv-podium-iso"><span class="mv-pf mv-pf-t" title="教师">师</span><span class="mv-pf mv-pf-ai" title="AI 助手">AI</span></div>
        <div class="mv-centroid" id="mv-centroid"><span class="mv-centroid-lbl">班级立场重心</span></div>
        <div class="mv-datasrc-notice" id="mv-datasrc" hidden>⚠ 未连接虚拟班数据源 · 当前为脚本回放（立场按个体归宿展示，运行模拟不生成新发言）</div>
      </div>`;
    const stage = room.querySelector("#mv-sstage");
    const pod = stage.querySelector("#mv-podium-iso");
    placeIso(pod, 0.5, 0.04); pod.style.zIndex = "150";
    STUDENTS.forEach((s) => {
      const bk = STANCE_BAKED[s.id] || {};
      const look = indivLook(s.id); // 每人一个独立外观（发色/衣色），不按组上色
      const ch = el("div", `mv-char is-${s.init}`);
      ch.dataset.id = s.id;
      ch.style.setProperty("--shirt", look.shirt);
      ch.style.setProperty("--hair", look.hair);
      ch.style.setProperty("--skin", look.skin);
      ch.innerHTML = `
        <div class="mv-think"></div>
        <div class="mv-bubble"></div>
        <div class="mv-px"><svg class="fig" viewBox="0 0 40 54" aria-hidden="true">
          <ellipse class="fig-shadow" cx="20" cy="53" rx="13" ry="2.4"/>
          <path class="fig-body" d="M3 54 C3 39 10.5 31 20 31 C29.5 31 37 39 37 54 Z" fill="var(--shirt)"/>
          <path class="fig-body-sh" d="M20 31 C29.5 31 37 39 37 54 L20 54 Z" fill="rgba(0,0,0,.08)"/>
          <rect class="fig-neck" x="16.4" y="24" width="7.2" height="10" rx="3.6" fill="var(--skin)"/>
          <circle class="fig-head" cx="20" cy="15" r="11.6" fill="var(--skin)"/>
          <path class="fig-head-sh" d="M20 3.4 A11.6 11.6 0 0 1 20 26.6 Z" fill="rgba(0,0,0,.06)"/>
          <path class="fig-hair" d="M8.3 15.5 C8.3 2.6 31.7 2.6 31.7 15.5 C31.7 8.8 27 5 20 5 C13 5 8.3 8.8 8.3 15.5 Z" fill="var(--hair)"/>
          <ellipse class="fig-eye" cx="15.7" cy="15.6" rx="1.5" ry="1.9" fill="#3a2e28"/>
          <ellipse class="fig-eye" cx="24.3" cy="15.6" rx="1.5" ry="1.9" fill="#3a2e28"/>
        </svg></div>
        <span class="mv-char-name">${s.name}</span>
        <div class="mv-tip">${s.id} · ${s.name} · 强度 ${s.str}/5 · 立场 <span class="mv-tip-st">—</span><br><span>${s.note || ""}</span>${bk.why ? `<br><span class="mv-tip-why">↳ 立场归宿：${bk.why}</span>` : ""}</div>`;
      stage.appendChild(ch);
      seatEls[s.id] = ch;
    });
    return room;
  }

  // 每个学生一个稳定但各异的外观（独立个体，不按组配色）
  const INDIV_SHIRTS = ["#c96f52", "#6fa085", "#9a82c4", "#d99f5e", "#7ea0bd", "#bd7e7e", "#a89255", "#8a7da8", "#c2ad6e", "#7aa593", "#c0905f", "#8aa3b6"];
  const INDIV_HAIRS = ["#2e221a", "#3f2f22", "#221c16", "#4a3724", "#16120e", "#564026", "#6b5238", "#1a1a1f"];
  const INDIV_SKINS = ["#f0c6a0", "#e7b58a", "#d8a778", "#f2d2af", "#caa074", "#e9c19b"];
  function indivLook(id) {
    let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return { shirt: INDIV_SHIRTS[h % INDIV_SHIRTS.length], hair: INDIV_HAIRS[(h >> 4) % INDIV_HAIRS.length], skin: INDIV_SKINS[(h >> 9) % INDIV_SKINS.length] };
  }

  // 等距房间布局：参与度→纵深(近前排/远后排)、立场→横向；近大远小、按纵深 z-order；走动由 CSS 过渡完成
  /* ===== 持续环境仿真：力导向自组织（吸引/排斥/游走）→ 学生自己"走"出簇，无标签无指派 =====
   * gx∈[0,1] 分析轴（0 内部能力 S/W / 1 外部环境 O/T）、gy∈[0,1] 纵深（0 远·后排走神 / 1 近·前排投入）。
   * 每帧合力 = 个人归位(立场x+参与度纵深) + 同伴吸引(立场相近/私交盟友) + 近邻排斥(避让) + 个体游走噪声。
   * 全程确定性（噪声用时间正弦，非 Math.random），与"非 LLM 规则内核"卖点一致。 */
  const POS = {}; // id -> {gx,gy,vx,vy} 连续位置 + 速度
  const TGT = {}; // id -> {gx,gy} 个人归位目标
  let ambientRAF = null, ambientLast = 0;
  function hash01(str, salt) {
    let h = (2166136261 ^ (salt || 0)) >>> 0;
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619) >>> 0;
    return (h % 100000) / 100000;
  }
  // 两人亲和：立场相近→吸引；私交盟友加成、私交对手转排斥（个体关系，非组）
  function affinity(idA, idB) {
    const sa = stanceOf(byId[idA]), sb = stanceOf(byId[idB]);
    let aff = Math.max(0, 1 - Math.abs(sa - sb) / 0.55); // 立场差 <0.55 才互相靠拢
    const gr = (agentOf(idA) || {}).graph || {};
    if ((gr.allies || []).includes(idB)) aff += 0.55; // 私交盟友：额外靠拢
    if ((gr.rivals || []).includes(idB)) aff -= 1.0;  // 私交对手：推开
    return aff;
  }
  // 设定每个学生的归位目标：x=立场，纵深=参与度带（含稳定的个体偏好纵深→自然铺开不成行）
  function updateTargets() {
    Object.keys(seatEls).forEach((id) => {
      const ch = seatEls[id], s = byId[id]; if (!ch || !s) return;
      const rt = RT[id] || {};
      const st = Math.max(-1, Math.min(1, stanceOf(s)));
      const engagedCls = ch.classList.contains("is-live") || ch.classList.contains("is-active");
      const disengaged = !engagedCls && (
        ["is-quiet", "is-silent", "is-csilent", "is-fading"].some((c) => ch.classList.contains(c)) ||
        (typeof rt.attention === "number" && rt.attention < 0.5)
      );
      const front = !disengaged;
      const band = front ? [0.5, 1.0] : [0.06, 0.42];
      const dep = band[0] + (band[1] - band[0]) * hash01(id, 7); // 个体偏好纵深
      (TGT[id] || (TGT[id] = {})).gx = (st + 1) / 2;
      TGT[id].gy = dep;
      ch.classList.toggle("at-desk", !front); ch.classList.toggle("on-floor", front);
      const tip = ch.querySelector(".mv-tip-st"); if (tip) tip.textContent = st.toFixed(2);
    });
  }
  // 参数经离线力学仿真整定（screen-accurate）：无重叠(min≈38px)、铺满 ~890×279px、按立场自然成簇、稳态轻微游走(≈10px/0.6s 不抖动)
  const SIMP = { kHome: 0.02, kRepel: 0.20, rRepel: 0.085, kAttract: 0.0018, rAttract: 0.13, damping: 0.60, JIT: 0.0009, MAXV: 0.012, WX: 1.0, WY: 0.14 };
  // 单步力学积分（dt=帧步；t=时间秒，用于游走噪声；jitter=是否加游走）
  function simStep(dt, t, jitter) {
    const ids = Object.keys(seatEls); if (!ids.length) return;
    const P = SIMP;
    for (let a = 0; a < ids.length; a++) {
      const id = ids[a], p = POS[id], tg = TGT[id]; if (!p || !tg) continue;
      const isLive = seatEls[id].classList.contains("is-live");
      const hp = isLive ? 0.05 : P.kHome; // 发言者强归位，站定不游走
      let fx = hp * (tg.gx - p.gx), fy = hp * (tg.gy - p.gy);
      for (let b = 0; b < ids.length; b++) {
        if (b === a) continue;
        const q = POS[ids[b]]; if (!q) continue;
        const dgx = q.gx - p.gx, dgy = q.gy - p.gy;
        const d2 = dgx * dgx * P.WX + dgy * dgy * P.WY + 1e-4, d = Math.sqrt(d2);
        if (d < P.rRepel) { const rep = P.kRepel * (P.rRepel - d) / d; fx -= dgx * rep; fy -= dgy * rep; }
        else if (d < P.rAttract) {
          const aff = affinity(id, ids[b]);
          if (aff > 0) { const at = P.kAttract * aff / d; fx += dgx * at; fy += dgy * at; }
          else if (aff < 0) { const re = P.kRepel * (-aff) * 0.35 / d; fx -= dgx * re; fy -= dgy * re; }
        }
      }
      if (jitter && !isLive) { // 持续游走（确定性平滑噪声）
        const ph = hash01(id, 1) * 6.283, fr = 0.5 + hash01(id, 2) * 0.7;
        fx += P.JIT * Math.sin(t * fr + ph);
        fy += P.JIT * 0.5 * Math.cos(t * fr * 1.3 + ph);
      }
      p.vx = (p.vx + fx * dt) * P.damping; p.vy = (p.vy + fy * dt) * P.damping;
      const sp = Math.hypot(p.vx, p.vy); if (sp > P.MAXV) { p.vx *= P.MAXV / sp; p.vy *= P.MAXV / sp; }
      p.gx = Math.max(0.04, Math.min(0.96, p.gx + p.vx * dt));
      p.gy = Math.max(0.05, Math.min(1.0, p.gy + p.vy * dt));
    }
  }
  function placeAll() {
    const ids = Object.keys(seatEls); let mx = 0, my = 0, n = 0;
    for (let a = 0; a < ids.length; a++) {
      const id = ids[a], p = POS[id]; if (!p) continue;
      placeIso(seatEls[id], p.gx, p.gy); mx += p.gx; my += p.gy; n++;
    }
    const cen = document.getElementById("mv-centroid");
    if (cen && n) {
      const cgx = mx / n, cgy = my / n;
      cen.style.left = isoXpct(cgx, cgy).toFixed(2) + "%";
      cen.style.top = isoYpx(cgy).toFixed(1) + "px";
      cen.style.transform = "translate(-50%,-100%)";
      const lbl = cen.querySelector(".mv-centroid-lbl"); if (lbl) lbl.textContent = "班级立场重心 " + (cgx * 2 - 1).toFixed(2);
    }
  }
  function ambientTick(now) {
    ambientRAF = requestAnimationFrame(ambientTick);
    if (!Object.keys(seatEls).length) return;
    let dt = ambientLast ? (now - ambientLast) / 16.667 : 1; ambientLast = now;
    dt = Math.max(0.4, Math.min(2.2, dt)); // 帧步限幅，避免卡顿后跳变
    simStep(dt, now * 0.001, true);
    placeAll();
  }
  function ambientStop() { if (ambientRAF != null) { cancelAnimationFrame(ambientRAF); ambientRAF = null; } if (chatTimer != null) { clearInterval(chatTimer); chatTimer = null; } }

  /* ===== 交流：邻近且立场相近者两两交头接耳（非发言者、确定性轮换），让房间有"在讨论"的私语层 ===== */
  let chatTimer = null, chatBucket = 0;
  const WHISPERS = ["这点我同意", "你家也碰到过？", "嗯，有道理", "数据这么看…", "我也这么想", "回头细聊", "就怕万一呢", "确实是这样", "你怎么看", "我有点犹豫"];
  function clearChats() {
    document.querySelectorAll(".mv-char.is-chatting").forEach((c) => {
      c.classList.remove("is-chatting", "chat-l", "chat-r");
      const b = c.querySelector(".mv-bubble.is-whisper"); if (b) { b.classList.remove("is-on", "is-whisper"); b.textContent = ""; }
    });
  }
  function chatTick() {
    clearChats();
    const floor = document.querySelector(".mv-groom-floor"); if (!floor) return;
    const fw = floor.getBoundingClientRect().width || 1100;
    // 候选：在场、非发言者、非走神/沉默者
    const cand = Object.keys(seatEls).filter((id) => {
      const ch = seatEls[id];
      return ch && !ch.classList.contains("is-live") &&
        !["is-quiet", "is-silent", "is-csilent", "is-fading"].some((c) => ch.classList.contains(c));
    });
    const sc = (id) => ({ x: (parseFloat(seatEls[id].style.left) || 50) / 100 * fw, y: parseFloat(seatEls[id].style.top) || 0 });
    const used = new Set(), pairs = [];
    const order = cand.slice().sort((a, b) => hash01(a, chatBucket + 11) - hash01(b, chatBucket + 11)); // 确定性轮换次序
    for (const id of order) {
      if (used.has(id)) continue;
      const pa = sc(id), sa = stanceOf(byId[id]); let best = null, bestD = 78;
      for (const j of cand) {
        if (j === id || used.has(j)) continue;
        const pb = sc(j), d = Math.hypot(pa.x - pb.x, pa.y - pb.y);
        if (d < bestD && Math.abs(sa - stanceOf(byId[j])) < 0.35) { bestD = d; best = j; } // 近邻 + 立场相近
      }
      if (best) { used.add(id); used.add(best); pairs.push([id, best]); if (pairs.length >= 3) break; }
    }
    pairs.forEach(([a, b]) => {
      const A = seatEls[a], B = seatEls[b], pa = sc(a), pb = sc(b), aLeft = pa.x <= pb.x;
      [A, B].forEach((el) => el.classList.remove("is-attending", "attend-l", "attend-r")); // 交流期间脱离对发言者的侧头
      A.classList.add("is-chatting", aLeft ? "chat-r" : "chat-l"); // 面向对方
      B.classList.add("is-chatting", aLeft ? "chat-l" : "chat-r");
      const sp = hash01(a + b, chatBucket) < 0.5 ? a : b; // 其一开口轻语
      const bub = seatEls[sp].querySelector(".mv-bubble");
      if (bub) { bub.textContent = WHISPERS[Math.floor(hash01(a + b, chatBucket + 5) * WHISPERS.length)]; bub.classList.add("is-on", "is-whisper"); }
    });
    chatBucket++;
  }

  let ambientSettled = false;
  function ambientStart() {
    updateTargets();
    const cl = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    let fresh = false;
    Object.keys(seatEls).forEach((id) => {
      if (!POS[id]) { // 初始按个体偏移散开，避免同立场全堆在一条竖线上
        const t = TGT[id] || { gx: 0.5, gy: 0.5 };
        POS[id] = { gx: cl(t.gx + (hash01(id, 3) - 0.5) * 0.18, 0.04, 0.96), gy: cl(t.gy + (hash01(id, 4) - 0.5) * 0.16, 0.05, 1.0), vx: 0, vy: 0 };
        fresh = true;
      }
    });
    // 同步预收敛：即使后台/隐藏页 rAF 被节流，落位也已是无重叠成簇态；每次 applyState 再补几步，让立场变化后的"走位重组"在无 rAF 时也可见（rAF 只在可见时添持续活气）
    const settleN = (fresh || !ambientSettled) ? 110 : 22;
    for (let k = 0; k < settleN; k++) simStep(1, 0, false);
    ambientSettled = true;
    placeAll();
    if (chatTimer == null) chatTimer = setInterval(chatTick, 2600);
    if (ambientRAF != null) return;
    ambientLast = 0; ambientRAF = requestAnimationFrame(ambientTick);
  }
  // applyState 末尾仍调用本函数：刷新归位目标并确保环境循环在跑（落位交给 rAF）
  function layoutStanceRoom() { if (!Object.keys(seatEls).length) return; ambientStart(); }

  // 立场值:优先用运行时 RT.stance_position(会随模拟漂移);再回退 state_init;最后启发式
  function stanceOf(s) {
    const rt = RT[s.id];
    if (rt && typeof rt.stance_position === "number") return rt.stance_position;
    const a = agentOf(s.id);
    if (a && a.state_init && a.state_init.stance_position != null) return a.state_init.stance_position;
    const bk = STANCE_BAKED[s.id];
    return bk && typeof bk.t === "number" ? bk.t : 0; // 兜底用个体烘焙归宿，无则居中(不按组)
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
        <div class="mv-stat"><b class="mv-stat-csilent" style="color:var(--amber-deep)">8</b><span>策略性沉默</span></div>
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
      <div class="mv-risk"><span class="sev lvl-h">高</span><div><b>威胁维度失声</b>——8 位产业/竞争视角学生未发声，T 维证据覆盖不足</div></div>
      <div class="mv-risk"><span class="sev lvl-m">中</span><div><b>环境证据断点</b>——W/T 分类尚未引用人才供给与竞品数据</div></div>
      <div class="mv-risk"><span class="sev lvl-l">低</span><div><b>讨论时长偏紧</b>——5 分钟对「等机会型」「推举型」画像不友好</div></div>`;
    row.appendChild(p2);

    // (3) 评价标准歧义
    const p3 = el("div", "mv-panel");
    p3.innerHTML = `
      <h5><b>评价标准歧义提示</b><span class="ct">2 处</span></h5>
      <div class="mv-flag"><span class="fid">R-04</span><div><b>内外部边界</b>缺可观测锚点；组织可控条件与环境趋势容易混分</div></div>
      <div class="mv-flag"><span class="fid">R-06</span><div><b>策略可行性</b>与「证据充分性」维度交叠，可能双计分</div></div>`;
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

  /* ---------- 6.1 · 录播烘焙：把整堂课一次性跑成"固定录像" ----------
   * agent 决策含 Math.random，故必须烘焙一次冻结：固定 beat 时间轴 + 每 20s 抓一帧立场/注意力关键帧，
   * 之后点/拖进度条到任意一帧都能还原"当时真实发生了什么"（而非每次重放都不一样）。 */
  let recKeys = null; // [{t, st:{id:stance}, at:{id:attention}}]
  function bakeRecording() {
    if (!MV.agentsReady()) return false;
    MV.reset(); // 重置 + 清 DYN，从干净态烘焙
    const keys = [];
    for (let t = 0; t <= T_CAP; t += 20) {
      advanceSim(t); // 生成 t>132 的 beats + 推进 RT（t≤132 早退，走 SCRIPT）
      const v = {};
      // 快照全部影响视觉/画像的 runtime 数值（不止立场/注意力）：
      // 否则 bake 后 RT 停在 45:00 末态，回拖时 is-tired(fatigue)/内心戏(speak_motivation−social_safety)/inspector 会显示末态而非该时刻
      STUDENTS.forEach((s) => {
        const rt = RT[s.id] || {};
        v[s.id] = {
          sp: rt.stance_position != null ? rt.stance_position : stanceOf(s),
          at: rt.attention != null ? rt.attention : 0.6,
          fa: rt.fatigue || 0,
          sm: rt.speak_motivation || 0,
          ss: rt.social_safety || 0,
        };
      });
      keys.push({ t, v });
    }
    recKeys = keys;
    state.recorded = true;
    return true;
  }
  // 把某时刻的全部 runtime 数值从关键帧线性插值还原到 RT（供摆位/画像/内心戏/疲劳用）
  function applyRecordedState(tSec) {
    if (!recKeys || !recKeys.length) return;
    let lo = recKeys[0], hi = recKeys[recKeys.length - 1];
    for (let i = 0; i < recKeys.length; i++) {
      if (recKeys[i].t <= tSec) lo = recKeys[i];
      if (recKeys[i].t >= tSec) { hi = recKeys[i]; break; }
    }
    const span = hi.t - lo.t, f = span > 0 ? (tSec - lo.t) / span : 0;
    const lerp = (a, b) => (a != null && b != null) ? a + (b - a) * f : (a != null ? a : b);
    STUDENTS.forEach((s) => {
      const rt = RT[s.id]; if (!rt) return;
      const A = lo.v[s.id], B = hi.v[s.id]; if (!A || !B) return;
      rt.stance_position = lerp(A.sp, B.sp);
      rt.attention = lerp(A.at, B.at);
      rt.fatigue = lerp(A.fa, B.fa);
      rt.speak_motivation = lerp(A.sm, B.sm);
      rt.social_safety = lerp(A.ss, B.ss);
    });
  }

  // 应用到某时刻 tSec 之前(含)的所有 beats
  function applyState(tSec) {
    // 0) 录播态：把立场/注意力还原到该时刻（回拖任意一帧也能看到当时的真实分营，而非最新态）
    if (state.recorded) applyRecordedState(tSec);
    // 1) 特质态打底:C 沉默 / D1-D4 观望 / 其余倾听
    STUDENTS.forEach((s) => setSeatState(s.id, traitOf(s)));
    clearLive();

    // 2) 已发声集合
    let lastLine = null;
    let cSilenced = false;
    const spoke = new Set();

    if (state.replayMode) {
      // 回放:SCRIPT(t≤132 手写)+ DYN(t>132 agent 决策),按时间轴合并累计
      const timeline = (MV.agentsReady() && MV.DYN.length) ? [...SCRIPT, ...MV.DYN].sort((a, b) => a.t - b.t) : SCRIPT;
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
      // 沉默幕掀开条件：任一"沉默观察"学生已发声（画像驱动：有沉默因果且具行业/职业接触，MVCore.isSilentObserver）
      if ([...spoke].some((id) => MV.isSilentObserver && MV.isSilentObserver(MV.agentOf(id)))) cSilenced = false;
    } else {
      // 静态:展示 45 min 端态投影(已表态 14)+ C 集体沉默
      PROJECTION_SPOKEN.forEach((id) => spoke.add(id));
      cSilenced = true;
      lastLine = SCRIPT[SCRIPT.length - 1];
    }

    // 3) 已发声 → active 高亮
    spoke.forEach((id) => setSeatState(id, "active"));

    // 4) 当前正在发言者 = 最近一条 line(若为学生)
    let liveId = null;
    if (state.replayMode && lastLine && lastLine.kind === "line" && lastLine.role === "S" && lastLine.who) {
      liveId = lastLine.who;
      setSeatState(liveId, "live");
      const seat = seatEls[liveId];
      if (seat && lastLine.bubble) {
        const b = seat.querySelector(".mv-bubble");
        b.textContent = lastLine.bubble; b.classList.add("is-on");
      }
    }

    // 策略性沉默：按"个体"标记（自我审查、未发声者）——不再按"组"
    let silentCount = 0;
    STUDENTS.forEach((st) => {
      const seat = seatEls[st.id]; if (!seat) return;
      const sil = traitOf(st) === "silent" && !spoke.has(st.id);
      seat.classList.toggle("is-csilent", sil);
      if (sil) silentCount++;
    });

    // 5) 回放态下把 agent 实时状态(注意力/疲劳)投影到座位透明度
    if (state.replayMode && MV.agentsReady()) reflectSeatsRT();

    updateSubtitle(lastLine);
    updateStats(spoke, silentCount);
    updateTimer(tSec);
    updateScrub(tSec); // 进度条 playhead 跟随
    layoutStanceRoom(); // 先按实时立场摆位（reflectThoughts 依赖最新屏幕位置做避让）
    reflectAttending(liveId); // 立场相邻者向发言者侧头倾听
    reflectThoughts();  // 沉默/纠结者头上飘内心戏（drama.tension），按当前位置错开
  }

  /* ---------- 6.4 · 侧头倾听：立场相邻者把头转向发言者 ---------- */
  function reflectAttending(liveId) {
    Object.values(seatEls).forEach((s) => s.classList.remove("is-attending", "attend-l", "attend-r"));
    const sp = liveId ? byId[liveId] : null; if (!sp) return;
    const spX = stanceOf(sp);
    STUDENTS.forEach((s) => {
      if (s.id === sp.id) return;
      const seat = seatEls[s.id]; if (!seat) return;
      if (["is-fading", "is-quiet", "is-csilent", "is-silent"].some((c) => seat.classList.contains(c))) return;
      const d = stanceOf(s) - spX;
      if (Math.abs(d) <= 0.3) { seat.classList.add("is-attending", d < 0 ? "attend-r" : "attend-l"); } // 立场更低(在左)→向右侧头
    });
  }

  /* ---------- 6.5 · 内心独白浮层 ----------
   * 把没在发言、但内心有张力的学生(speak_motivation − social_safety 最高)的 drama.tension 飘出来；
   * 全场取前 4 名(策略性沉默者 / D4 加权)，错开避免重叠。 */
  function reflectThoughts() {
    Object.values(seatEls).forEach((s) => {
      const th = s.querySelector(".mv-think");
      if (th) { th.classList.remove("is-on"); th.textContent = ""; }
    });
    const cand = STUDENTS.map((s) => {
      const seat = seatEls[s.id];
      if (!seat || seat.classList.contains("is-live")) return null;
      const a = agentOf(s.id) || {};
      const cur = RT[s.id] || a.state_init || {};
      const tension = (a.drama && a.drama.tension) || s.note;
      if (!tension) return null;
      let score = (+cur.speak_motivation || 0) - (+cur.social_safety || 0);
      if (traitOf(s) === "silent") score += 0.15; // 策略性沉默者的内心更值得浮现(个体)
      if (s.id === "D4") score += 0.6;
      const x = parseFloat(seat.style.left) || 50, y = parseFloat(seat.style.top) || 0; // 当前屏幕位置
      return { s, tension, score, x, y };
    }).filter(Boolean).sort((a, b) => b.score - a.score);
    // 贪心：按张力取前 3，但跳过与已选过近者 → 气泡彼此错开，不再糊成一团
    const shown = [], MAX = 3, MIN_DX = 14, MIN_DY = 80;
    for (const c of cand) {
      if (shown.length >= MAX) break;
      if (shown.some((p) => Math.abs(p.x - c.x) < MIN_DX && Math.abs(p.y - c.y) < MIN_DY)) continue;
      const th = seatEls[c.s.id].querySelector(".mv-think");
      if (th) { th.textContent = c.tension; th.classList.add("is-on"); shown.push(c); }
    }
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
    else if (b.kind === "note") { roleCls = "role-A"; roleLbl = "AI 助手"; }
    else if (b.role === "A") { roleCls = "role-A"; roleLbl = "AI 助手"; }
    else if (b.role === "S") {
      roleCls = "role-S";
      roleLbl = "学生 " + (b.who || "");
      const sp = byId[b.who];
      who = sp ? "·" + sp.name : "";
    }
    role.className = "mv-sub-role " + roleCls;
    role.textContent = roleLbl + who;
    txt.textContent = (b.kind === "marker" ? "▾ " : "") + (b.text || "");
    // 字幕条入场动画
    subtitleEl.classList.remove("is-flash"); void subtitleEl.offsetWidth; subtitleEl.classList.add("is-flash");
  }

  function updateStats(spoke, silentCount) {
    if (!statEls.spoke) return;
    statEls.spoke.textContent = spoke.size;
    // 主动发声(强度≥4 且已表态)
    const proactive = [...spoke].filter((id) => byId[id] && byId[id].str >= 4).length;
    statEls.active.textContent = proactive;
    statEls.csilent.textContent = silentCount != null ? silentCount : 0;
    statEls.quiet.textContent = STUDENTS.filter((s) => s.init === "quiet").length; // 全程观望(个体)
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
    // 已到末尾 → 从头播（录播态保留烘焙好的录像，不重置 agent runtime）
    if (state.tSec >= T_CAP) { state.tSec = 0; if (MV.agentsReady() && !state.recorded) MV.reset(); }
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
    runBtn.textContent = "▶ 继续播放";
    runBtn.classList.remove("is-playing");
  }

  function reset() {
    pause();
    state.replayMode = true; // 回到录播起点 00:00
    state.tSec = 0;
    if (MV.agentsReady() && !state.recorded) MV.reset(); // 非录播态才重置 agent runtime（录播态保留烘焙录像）
    runBtn.textContent = "▶ 播放录播";
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
    <div class="mv-insp-card">
      <button class="mv-insp-close" aria-label="关闭">×</button>
      <div class="mv-insp-head">
        <div class="mv-insp-id">${mvEsc(id)}</div>
        <div class="mv-insp-who"><div class="nm">${mvEsc(s.name || (a.identity && a.identity.alias) || "")}</div><div class="dm">${mvEsc((a.identity && a.identity.demo) || "")}${s.note ? " · " + mvEsc(s.note) : ""}</div></div>
        <div class="mv-insp-stance">立场 ${mvEsc(stanceOf(s).toFixed(2))} <small>强度 ${mvEsc(String(p.stance_strength != null ? p.stance_strength : (s.str != null ? s.str : "")))}/5</small></div>
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
      <div class="mv-insp-rubric"><h6>评价维度初值（6 维）</h6><div class="rr">
        <span>环境证据 ${ri.policy_citation != null ? ri.policy_citation : "—"}</span><span>分类修正 ${ri.stance_shift != null ? ri.stance_shift : "—"}</span><span>反思深度 ${ri.reflection != null ? ri.reflection : "—"}</span>
        <span>团队贡献 ${ri.team_contrib != null ? ri.team_contrib : "—"}</span><span>证据使用 ${ri.evidence_use != null ? ri.evidence_use : "—"}</span><span>提问质量 ${ri.question_quality != null ? ri.question_quality : "—"}</span>
      </div></div>
      ${evs.length ? `<div class="mv-insp-evlog"><h6>近 5 次状态事件</h6>${evs.map((ev) => {
        const fx = Object.entries(ev.fx).map(([kk, vv]) => `<span class="${vv > 0 ? "up" : "down"}">${kk} ${vv > 0 ? "+" : ""}${vv.toFixed(2)}</span>`).join(" ");
        return `<div class="mv-insp-ev"><span class="t">${fmt(ev.t)}</span><span class="w">${mvEsc(ev.why)}</span><span class="fx">${fx}</span></div>`;
      }).join("")}</div>` : ""}
      <div class="mv-insp-foot"><span>group_role · ${mvEsc(si.group_role || "—")}</span><span>${mvEsc(id)} · 数据驱动 · t=${fmt(state.tSec)}</span></div>
    </div>`;
  }

  function ensureMvInspectorCSS() {
    if (document.getElementById("mv-insp-style")) return;
    const css = `
.mv-seat { transition: opacity .4s ease, transform .2s ease; }
.mv-seat.is-fading { filter: grayscale(.35); }
.mv-seat.is-tired .mv-ava::after { content:"z"; position:absolute; top:-2px; right:-2px; font:var(--fs-2xs) var(--mono); color:var(--mute); opacity:.7; }
.mv-insp-overlay { position:fixed; inset:0; background:rgba(20,18,16,.5); display:none; align-items:center; justify-content:center; z-index:10000; backdrop-filter:blur(2px); }
.mv-insp-overlay.is-open { display:flex; }
.mv-insp-card { width:min(720px,93vw); max-height:88vh; overflow-y:auto; background:var(--ivory); color:var(--ink); border:1px solid var(--ink); border-radius:14px; box-shadow:8px 8px 0 var(--ink); padding:22px 26px; position:relative; font-family:var(--serif-cn); border-top:4px solid var(--mute); }
.mv-insp-card.tone-a { border-top-color:var(--amber); } .mv-insp-card.tone-b { border-top-color:#95bba4; } .mv-insp-card.tone-c { border-top-color:var(--violet-soft); } .mv-insp-card.tone-d { border-top-color:#9a958c; }
.mv-insp-close { position:absolute; top:12px; right:14px; width:28px; height:28px; border-radius:50%; background:var(--paper-2); border:1px solid var(--rule); cursor:pointer; font-size: var(--fs-md); }
.mv-insp-head { display:grid; grid-template-columns:auto 1fr auto; gap:14px; align-items:center; padding-bottom:12px; border-bottom:1px dashed var(--rule); margin-bottom:12px; }
.mv-insp-id { width:46px; height:46px; border-radius:10px; background:var(--ink); color:var(--ivory); font:italic 600 var(--fs-xl) var(--serif-en); display:grid; place-items:center; }
.mv-insp-who .nm { font-size: var(--fs-lg); font-weight:600; } .mv-insp-who .dm { font:var(--fs-2xs) var(--mono); color:var(--mute); margin-top:2px; }
.mv-insp-stance { padding:6px 12px; border-radius:999px; font:var(--fs-2xs) var(--mono); background:var(--paper-2); }
.mv-insp-row { font-size: var(--fs-sm); line-height:1.6; margin-bottom:7px; padding:8px 12px; background:var(--paper); border-radius:6px; }
.mv-insp-row b { display:inline-block; min-width:48px; margin-right:8px; font:600 var(--fs-2xs) var(--mono); letter-spacing:.06em; color:var(--amber-deep); vertical-align:middle; }
.mv-insp-row.caveat { background:rgba(217,119,87,.06); border-left:2px solid var(--amber-deep); }
.mv-insp-row small { display:block; margin-left:56px; margin-top:3px; font:var(--fs-2xs) var(--mono); color:var(--mute); }
.mv-insp-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:12px; }
.mv-insp-grid > div { background:var(--paper-2); border-radius:8px; padding:11px 13px; }
.mv-insp-grid h6 { font:var(--fs-2xs) var(--mono); letter-spacing:.12em; text-transform:uppercase; color:var(--mute); margin:0 0 9px; padding-bottom:5px; border-bottom:1px dashed var(--rule); }
.mv-insp-grid p { font-size: var(--fs-xs); line-height:1.55; margin:0 0 5px; color:var(--ink-2); }
.mv-insp-grid p b { font:600 var(--fs-2xs) var(--mono); color:var(--amber-deep); margin-right:5px; }
.mv-insp-meter { display:grid; grid-template-columns:74px 1fr 38px; align-items:center; gap:7px; margin-bottom:7px; font:var(--fs-2xs) var(--mono); }
.mv-insp-meter span { color:var(--mute); } .mv-insp-meter > div { height:4px; background:rgba(0,0,0,.08); border-radius:2px; overflow:hidden; } .mv-insp-meter > div i { display:block; height:100%; background:var(--amber-deep); }
.mv-insp-meter b { text-align:right; position:relative; } .mv-insp-meter b em { display:block; font:var(--fs-2xs) var(--mono); position:absolute; right:0; top:100%; } .mv-insp-meter b em.down { color:var(--amber-deep); } .mv-insp-meter b em.up { color:var(--sage); }
.mv-insp-resp { padding:6px 8px; margin-bottom:5px; background:var(--ivory); border-left:2px solid var(--amber-deep); border-radius:4px; }
.mv-insp-resp span { display:block; font:var(--fs-2xs) var(--mono); color:var(--mute); margin-bottom:2px; } .mv-insp-resp p { font:italic var(--fs-2xs) var(--serif-cn); margin:0; color:var(--ink-2); }
.mv-insp-drama { margin-top:12px; padding:13px 15px; background:var(--ink); color:var(--ivory); border-radius:10px; }
.mv-insp-drama h6 { font:var(--fs-2xs) var(--mono); letter-spacing:.14em; text-transform:uppercase; color:rgba(217,119,87,.85); margin:0 0 8px; }
.mv-insp-drama p { font-size: var(--fs-xs); line-height:1.55; margin:0 0 5px; } .mv-insp-drama p b { font:500 var(--fs-2xs) var(--mono); color:rgba(217,119,87,.85); margin-right:5px; }
.mv-insp-rubric { margin-top:12px; padding:11px 13px; background:var(--paper-2); border-radius:8px; }
.mv-insp-rubric h6 { font:var(--fs-2xs) var(--mono); letter-spacing:.12em; text-transform:uppercase; color:var(--mute); margin:0 0 8px; }
.mv-insp-rubric .rr { display:grid; grid-template-columns:repeat(3,1fr); gap:4px; font:var(--fs-2xs) var(--mono); } .mv-insp-rubric .rr span { padding:3px 6px; background:var(--ivory); border-radius:3px; text-align:center; }
.mv-insp-evlog { margin-top:12px; padding:11px 13px; background:var(--paper); border:1px dashed var(--rule); border-radius:8px; }
.mv-insp-evlog h6 { font:var(--fs-2xs) var(--mono); letter-spacing:.12em; text-transform:uppercase; color:var(--mute); margin:0 0 7px; }
.mv-insp-ev { display:grid; grid-template-columns:48px 1fr auto; gap:9px; align-items:center; padding:4px 0; border-bottom:1px dotted var(--rule); font-size: var(--fs-2xs); }
.mv-insp-ev:last-child { border-bottom:0; } .mv-insp-ev .t { font:600 var(--fs-2xs) var(--mono); color:var(--amber-deep); } .mv-insp-ev .w { font-family:var(--serif-cn); color:var(--ink-2); }
.mv-insp-ev .fx { display:flex; gap:5px; } .mv-insp-ev .fx span { font:var(--fs-2xs) var(--mono); padding:1px 5px; border-radius:3px; } .mv-insp-ev .fx span.down { background:rgba(217,119,87,.14); color:var(--amber-deep); } .mv-insp-ev .fx span.up { background:rgba(77,98,87,.14); color:var(--sage); }
.mv-insp-foot { margin-top:12px; padding-top:10px; border-top:1px dashed var(--rule); display:flex; justify-content:space-between; font:var(--fs-2xs) var(--mono); color:var(--mute); }
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
    ensureRoomCSS();
    MV.reset();
    bindSeatInspector();
    applyState(state.tSec); // 初始展示端态(applyState 末尾会按立场摆位)
    // 对外联动 hook：让页面的"证据流"随录播时间浮现/捕获，并可反向 seek
    window.PharmacoPilotMV = {
      getT: function () { return state.tSec; },
      seek: function (t) { stepTo(t); },
      keyMoments: function () { return keyMoments(); },
      onTime: function (cb) { if (typeof cb === "function") { mvTimeCbs.push(cb); try { cb(state.tSec); } catch (e) {} } },
    };
    try { window.dispatchEvent(new CustomEvent("mv:ready")); } catch (e) {}  // 与 3D 一致:通知联动 hook 已就绪
    // 异步加载 32-agent 数据 → 用真实 stance_position/responses/graph/drama 重建,启用 t>132 动态决策
    MV.loadAgents().then((d) => {
      const notice = document.getElementById("mv-datasrc");
      if (!d) { if (notice) notice.hidden = false; return; } // 数据源未连接 → 提示，避免静默退化
      if (notice) notice.hidden = true;
      bakeRecording();          // 烘焙整堂录像：固定 beat 时间轴 + 立场/注意力关键帧（供进度条任意定位）
      state.tSec = 0;           // 录播就绪，停在 00:00 待播（不自动播）
      applyState(state.tSec);
    });
    // tab 隐藏时停掉环境仿真省电，回前台再续（位置/速度保留）
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) ambientStop();
      else if (Object.keys(seatEls).length) ambientStart();
    });
  }

  function ensureRoomCSS() {
    if (document.getElementById("mv-room-style")) return;
    const css = `
.mv-floor[data-view="room"] .mv-grouping { margin-top:12px; }
.mv-root[data-view="room"] .mv-podium { display:none; } /* 教室视图用 room 自带讲台，隐藏舞台 podium */
/* —— 录播进度条 —— */
.mv-scrub { display:flex; align-items:center; gap:12px; margin:0 0 6px; }
.mv-scrub-time { font:var(--text-caption) var(--mono); color:var(--mute); white-space:nowrap; flex-shrink:0; letter-spacing:.02em; }
.mv-scrub-time b { color:var(--ink); font-weight:600; }
.mv-scrub-track { position:relative; flex:1; height:20px; cursor:pointer; display:flex; align-items:center; touch-action:none; outline:none; }
.mv-scrub-track::before { content:""; position:absolute; left:0; right:0; top:50%; transform:translateY(-50%); height:5px; border-radius:3px; background:var(--rule-2); }
.mv-scrub-track:focus-visible::before { box-shadow:0 0 0 2px var(--amber-deep); }
.mv-scrub-fill { position:absolute; left:0; top:50%; transform:translateY(-50%); height:5px; border-radius:3px; background:var(--amber-deep); width:0; pointer-events:none; }
.mv-scrub-ticks { position:absolute; inset:0; pointer-events:none; }
.mv-scrub-tick { position:absolute; top:50%; transform:translate(-50%,-50%); width:2px; height:10px; border-radius:1px; background:var(--mute); opacity:.5; }
.mv-scrub-tick.t-q { background:var(--amber-deep); opacity:.85; height:13px; width:2.5px; }
.mv-scrub-tick.t-km { background:#b5852a; opacity:.8; }
.mv-scrub-tick.t-silence { background:var(--violet-soft); opacity:.8; }
.mv-scrub-tick.t-call { background:#7a9b6a; opacity:.75; }
.mv-scrub-tick.t-reflect { background:#6a93a8; opacity:.75; }
.mv-scrub-head { position:absolute; left:0; top:50%; transform:translate(-50%,-50%); width:13px; height:13px; border-radius:50%; background:var(--amber-deep); border:2px solid var(--paper); box-shadow:0 1px 4px rgba(0,0,0,.32); pointer-events:none; z-index:2; }
.mv-scrub-track:hover .mv-scrub-head, .mv-scrub-track.is-scrubbing .mv-scrub-head { transform:translate(-50%,-50%) scale(1.22); }
.mv-scrub-tip { position:absolute; bottom:130%; left:0; transform:translateX(-50%); background:var(--ink); color:#fff; font:var(--text-caption) var(--mono); padding:4px 8px; border-radius:5px; white-space:nowrap; pointer-events:none; opacity:0; transition:opacity .12s; z-index:30; max-width:240px; overflow:hidden; text-overflow:ellipsis; }
.mv-scrub-track:hover .mv-scrub-tip, .mv-scrub-track.is-scrubbing .mv-scrub-tip { opacity:1; }
/* 立场教室是单个全宽 diorama：覆盖宿主页面把 .mv-floor 当 2×2 网格的旧样式，否则房间只占半幅、右侧留黑 */
#mv-floor-host { display:block; grid-template-columns:none; gap:0; padding:0; }
#mv-floor-host .mv-groom { width:100%; }
.mv-room-head { display:flex; justify-content:space-between; align-items:baseline; gap:6px; flex-wrap:wrap; margin-bottom:12px; }
.mv-room-title { font:600 var(--fs-xs) var(--serif-cn); color:var(--ink); }
.mv-room-scene { font:var(--fs-2xs) var(--mono); color:var(--mute); letter-spacing:.02em; }
.mv-char { --shirt:var(--mute-2); --skin:var(--amber-soft); --hair:var(--ink-2); }
.mv-char-name { font:var(--fs-2xs) var(--serif-cn); color:var(--ink); white-space:nowrap; line-height:1.1; }
.mv-char.is-quiet, .mv-char.is-neutral { opacity:.6; }
.mv-char.is-silent, .mv-char.is-csilent { opacity:.5; }
.mv-char.is-csilent::after { content:"🤐"; position:absolute; top:-3px; right:3px; font-size: var(--fs-2xs); z-index:6; }
.mv-char.is-quiet::after { content:"💤"; position:absolute; top:-3px; right:3px; font-size: var(--fs-2xs); opacity:.7; z-index:6; }
.mv-char.is-fading { animation:mvDrift 3.4s ease-in-out infinite; }
@keyframes mvDrift { 0%,100% { opacity:.5; } 50% { opacity:.28; } }
.mv-char .mv-bubble { position:absolute; bottom:100%; left:50%; transform:translateX(-50%); margin-bottom:3px; background:var(--ink); color:#fff; font:var(--fs-2xs) var(--serif-cn); padding:3px 7px; border-radius:7px 7px 7px 2px; white-space:nowrap; max-width:150px; overflow:hidden; text-overflow:ellipsis; opacity:0; pointer-events:none; transition:opacity .2s; z-index:20; }
.mv-char .mv-bubble.is-on { opacity:1; }
.mv-char .mv-think { position:absolute; bottom:100%; left:50%; transform:translateX(-50%); margin-bottom:5px; width:104px; z-index:25; background:rgba(247,244,237,.97); color:#8a8178; font:italic var(--fs-2xs) var(--serif-cn); line-height:1.4; padding:4px 8px; border:1px dashed #cfc8b8; border-radius:10px; text-align:center; opacity:0; pointer-events:none; transition:opacity .35s; }
.mv-char .mv-think.is-on { opacity:.95; }
.mv-char .mv-think::before { content:"💭 "; }
/* —— 立场教室 · 2.5D 等距 diorama（横轴=立场，纵深=参与度；近大远小） —— */
.mv-groom { background:var(--paper); border:1px solid var(--rule); border-radius:16px; padding:14px 16px 10px; box-shadow:0 2px 12px rgba(120,90,40,.07); }
.mv-groom-floor { position:relative; height:430px; margin:12px 0 2px; border-radius:12px; overflow:hidden; background:linear-gradient(180deg, #c8b89a 0%, #d4c4a0 28%, #e2d0a8 100%); }
.mv-iso-bg { position:absolute; inset:0; width:100%; height:100%; z-index:0; }
/* M2 · 研讨室空间感：暖木地板 + 立体墙面 + 极淡立场渐变（替换生硬色块） */
.iso-floor { fill:url(#floorGrad); }
.iso-zone-l { fill:rgba(100,145,185,.09); }   /* 左侧(反对)极淡冷蓝—温差暗示，非色块 */
.iso-zone-r { fill:rgba(200,120,70,.08); }     /* 右侧(支持)极淡暖橙 */
.iso-grid line { stroke:rgba(110,85,52,.10); stroke-width:.8; }
.iso-backwall { fill:url(#wallGrad); }
.iso-sidewall { fill:url(#sideGrad); }
.iso-board { fill:#f8f4ea; stroke:#c4b08a; stroke-width:1.2; rx:4; }
/* 地板木纹渐变 & 墙面渐变（SVG defs，由 buildStanceRoom 写入 SVG） */
/* 讲台(投影到远端) */
.mv-podium-iso { position:absolute; transform-origin:50% 100%; display:flex; gap:5px; z-index:150; }
.mv-pf { width:28px; height:28px; border-radius:6px; display:grid; place-items:center; font:600 var(--text-micro) var(--serif-cn); color:#fff; box-shadow:0 3px 0 rgba(0,0,0,.18); }
.mv-pf-t { background:var(--amber-deep); } .mv-pf-ai { background:var(--ink); font-size:var(--text-micro); }
/* 墙上标语 */
.mv-wall-lbl { position:absolute; font:var(--text-micro) var(--mono); color:var(--mute); z-index:1; white-space:nowrap; }
.mv-wall-lbl.wl { top:78px; left:4%; color:var(--sage); }
.mv-wall-lbl.wr { top:78px; right:4%; color:var(--amber-deep); }
.mv-wall-lbl.wc { top:60px; left:50%; transform:translateX(-50%); }
/* 班级立场重心：地板小旗 */
.mv-centroid { position:absolute; transform-origin:50% 100%; z-index:140; transition:left .6s cubic-bezier(.22,1,.36,1), top .6s; }
.mv-centroid::before { content:""; position:absolute; left:50%; bottom:0; width:0; height:24px; border-left:2px dashed var(--ink); transform:translateX(-50%); opacity:.5; }
.mv-centroid-lbl { position:absolute; bottom:24px; left:50%; transform:translateX(-50%); font:var(--text-micro) var(--mono); color:var(--ink); white-space:nowrap; background:rgba(247,240,225,.9); padding:2px 6px; border-radius:3px; }
.mv-datasrc-notice { position:absolute; top:6px; left:50%; transform:translateX(-50%); z-index:60; font:var(--text-caption) var(--mono); color:var(--amber-deep); background:rgba(217,119,87,.12); border:1px solid rgba(217,119,87,.4); border-radius:6px; padding:4px 10px; max-width:92%; text-align:center; }
/* 角色：等距投影定位（left/top + scale 由 JS 内联），近大远小，纵深决定 z-order */
/* 位置/缩放由 rAF 环境仿真每帧驱动（见 ambientTick），不再用 CSS 过渡（否则与逐帧位移叠加成橡皮筋滞后）；仅保留透明度过渡 */
.mv-groom-floor .mv-char { position:absolute; width:40px; display:flex; flex-direction:column; align-items:center; gap:1px; transform-origin:50% 100%; transition:opacity .4s; cursor:pointer; will-change:left,top,transform; }
.mv-groom-floor .mv-char-name { font:var(--text-micro) var(--mono); color:var(--ink); white-space:nowrap; line-height:1; text-shadow:0 1px 2px rgba(247,240,225,.9); }
.mv-groom-floor .mv-char:hover { z-index:400 !important; }
/* 像素小人 + 脚下投影 */
/* M1 · 插画人物（SVG 头+发+躯干，个体肤/发/衣色；比像素更大更可读，体态承载状态） */
.mv-px { position:relative; width:23px; height:31px; transform-origin:50% 100%; }
.mv-px .fig { position:absolute; inset:0; width:100%; height:100%; overflow:visible; }
.fig .fig-shadow { fill:rgba(40,30,20,.20); }
.fig .fig-head, .fig .fig-neck { stroke:rgba(60,40,28,.10); stroke-width:.6; }
.fig .fig-body { stroke:rgba(0,0,0,.06); stroke-width:.5; }
/* 在场踏步 idle / 坐回后排(远端)变灰 */
.mv-char.on-floor .mv-px { animation:pxbob 2.6s ease-in-out infinite; }
@keyframes pxbob { 50% { transform:translateY(-2px); } }
.mv-char.at-desk { opacity:.66; }
.mv-char.at-desk .mv-px { animation:none; }
/* 发言高亮 */
.mv-char.is-live .mv-px { animation:pxbob 0.9s ease-in-out infinite; }
.mv-char.is-live .mv-px .fig { filter:drop-shadow(0 0 5px rgba(217,119,87,.7)); }
.mv-char.is-live .mv-char-name { color:var(--amber-deep); font-weight:700; }
.mv-char.is-fading { opacity:.4; }
.mv-char .mv-tip-why { display:block; margin-top:3px; color:rgba(255,255,255,.62); font-size:var(--text-micro); font-style:italic; line-height:var(--lh-ui); }
.mv-char .mv-tip { position:absolute; top:100%; left:50%; transform:translateX(-50%); margin-top:5px; width:148px; background:var(--ink); color:#fff; font:var(--fs-2xs) var(--serif-cn); line-height:1.45; padding:6px 8px; border-radius:7px; opacity:0; pointer-events:none; transition:opacity .15s; z-index:40; }
.mv-char .mv-tip span { color:rgba(255,255,255,.72); font-size: var(--fs-2xs); }
.mv-char:hover .mv-tip { opacity:1; }
/* ③ iso 像素小人：侧头倾听 / 走神低头（作用在 .mv-px，停 idle 踏步避免与 transform 冲突；置于 bob 规则之后才生效） */
.mv-char.attend-r .mv-px { animation:none; transform:rotate(9deg); }
.mv-char.attend-l .mv-px { animation:none; transform:rotate(-9deg); }
.mv-char.is-quiet .mv-px, .mv-char.is-fading .mv-px { animation:none; transform:translateY(2px) rotate(-6deg) scale(.95); }
/* 交流：两两交头接耳——面向对方轻转 + 轻语小气泡 */
.mv-char.chat-r .mv-px { animation:none; transform:rotate(7deg); }
.mv-char.chat-l .mv-px { animation:none; transform:rotate(-7deg); }
.mv-char .mv-bubble.is-whisper { background:rgba(74,67,57,.92); color:#f3efe6; font-size:var(--text-micro); padding:3px 7px; border-radius:6px 6px 6px 2px; opacity:.9; box-shadow:none; }
.mv-char.is-csilent .fig .fig-head { fill-opacity:.8; }
`;
    const e = document.createElement("style"); e.id = "mv-room-style"; e.textContent = css; document.head.appendChild(e);
  }

  // —— 启动协调：默认延迟，由 mv-bootstrap 决定挂载 3D 还是回退到本 2.5D 渲染器 ——
  let _booted = false;
  function bootMV2D() {
    if (_booted) return;
    _booted = true;
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }
  // 暴露给引导脚本：Three.js / WebGL 不可用时显式回退调用
  window.MV2D = { mount: bootMV2D };
  // 仅当未声明"优先 3D"时自启动（保持旧页面行为不变）
  if (!window.__MV_DEFER_2D) bootMV2D();
})();
