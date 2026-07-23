/* ============================================================
 *  虚拟教室 · 真 3D 渲染器  metaverse-classroom-3d.js   (2026-06-02)
 *  Three.js (CDN, ESM via importmap) 渲染的"立场教室":
 *   - 真 3D 房间 + 软阴影 + 暖色教室，自由镜头(环视/缩放/聚焦)
 *   - 32 个程序化 3D 角色(肤色/发型/体态/服装因人而异)
 *   - 头顶实时表情(发言/想说/焦虑/走神) + 名牌 + 发言气泡
 *   - 群体动态:阵营地面分区 / 班级立场重心 / 发言视线
 *   - 自由仿真:复用 window.MVCore 的规则引擎，教师可抛问题/点名
 *
 *  仿真大脑：window.MVCore（shared/mv-classroom-core.js）
 *  挂载点：#mv-classroom（practice-detail.html · stage-ii · 子段 B）
 *  失败回退：WebGL/CDN 不可用 → window.MV2D.mount()（2.5D 渲染器）
 * ============================================================ */
(function () {
  "use strict";

  const MOUNT_ID = "mv-classroom";
  const THREE_VER = "0.160.0";

  /* ---------- 0 · 能力探测 / 回退 ---------- */
  function hasWebGL() {
    try {
      const c = document.createElement("canvas");
      return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
    } catch (e) { return false; }
  }
  function fallback2D(reason) {
    console.warn("[MV3D] 回退到 2.5D 教室：" + reason);
    let tries = 0;
    (function wait() {
      if (window.MV2D && window.MV2D.mount) { window.MV2D.mount(); return; }
      if (tries++ < 60) setTimeout(wait, 50);
    })();
  }
  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- 1 · 小工具 ---------- */
  function hashStr(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const fmt = (sec) => { const m = String(Math.floor(sec / 60)).padStart(2, "0"); const s = String(Math.floor(sec % 60)).padStart(2, "0"); return `${m}:${s}`; };
  const groupOf = (id) => id[0]; // A/B/C/D

  // 品牌色（与 tokens.css 对齐）
  const COL = {
    paper: "#f3eee2", paper2: "#ece5d3", ink: "#1b1916",
    amber: "#d4805f", amberDeep: "#a8492a", sage: "#5a6f63", violet: "#8472a8", grey: "#9a9082",
    floorWarm: "#e3d4b4", floorWarm2: "#d8c6a0", woodLine: "#c2ab82",
    zoneL: "#7d94b8", zoneR: "#d99a6c", board: "#f7f2e6",
  };
  const GROUP_COLOR = { A: COL.amber, B: COL.sage, C: COL.violet, D: COL.grey };
  const SKIN = ["#f1c9a5", "#e8b48c", "#dca87e", "#c98b5a", "#f3d3b0", "#e0a982"];
  const HAIR = ["#2b2320", "#3d2b1f", "#4a3527", "#171311", "#5a4636", "#6b4a2e"];
  const PANTS = ["#4a463f", "#3a4b6b", "#5b5147", "#3d3a34", "#6f5b3e"];

  /* ============================================================
   *  主流程（异步加载 Three.js）
   * ============================================================ */
  async function start() {
    const mount = document.getElementById(MOUNT_ID);
    if (!mount) return;                 // 没有挂载点
    if (!window.MVCore) return fallback2D("MVCore 未就绪");
    if (!hasWebGL()) return fallback2D("WebGL 不可用");

    let THREE, OrbitControls, CSS2DRenderer, CSS2DObject, RoomEnvironment = null;
    try {
      THREE = await import("three");
      ({ OrbitControls } = await import("three/addons/controls/OrbitControls.js"));
      ({ CSS2DRenderer, CSS2DObject } = await import("three/addons/renderers/CSS2DRenderer.js"));
      try { ({ RoomEnvironment } = await import("three/addons/environments/RoomEnvironment.js")); } catch (e2) {}
    } catch (e) { return fallback2D("Three.js CDN 加载失败 " + e); }

    window.__MV3D_ACTIVE = true;
    const MV = window.MVCore;
    await MV.loadAgents();   // 加载 32-agent 决策数据（失败也能跑：仅 SCRIPT 段）

    buildUI(mount);
    const app = new Classroom(THREE, OrbitControls, CSS2DRenderer, CSS2DObject, mount, RoomEnvironment);
    app.init();
    window.PharmacoPilotMV3D = app;
    // 兼容旧 hook（证据流联动）
    window.PharmacoPilotMV = window.PharmacoPilotMV || {
      getT: () => app.simT,
      seek: (t) => app.seek(t),
      keyMoments: () => app.keyMoments(),
      onTime: (cb) => app.onTime(cb),
    };
    try { window.dispatchEvent(new CustomEvent("mv:ready")); } catch (e) {}  // 通知“证据流”等联动 hook 已就绪（懒加载后时机不定）
  }

  /* ============================================================
   *  HUD（DOM 覆盖层，品牌排版）
   * ============================================================ */
  function buildUI(mount) {
    mount.innerHTML = "";
    mount.className = "mv3-root data-off seat-class";
    mount.innerHTML = `
      <div class="mv3-head">
        <div class="mv3-head-l">
          <h4>虚拟班级试错 · 3D 课堂<small>AI 虚拟班 32 人 · P-2024-Q3 v0.5 · 真 3D 教室 · 45 min</small></h4>
        </div>
        <div class="mv3-head-r">
          <span class="mv3-mode" id="mv3-modelbl">录播回放</span>
          <span class="mv3-live"><i></i>LIVE · <b id="mv3-timer">00:00</b> / 45:00</span>
          <span class="mv3-sess">会话 #3417</span>
        </div>
      </div>

      <div class="mv3-stage" id="mv3-stage">
        <div class="mv3-vignette"></div>
        <div class="mv3-timer-badge" id="mv3-timerbadge" hidden>⏱ <b>5:00</b><span id="mv3-timer-state"></span></div>
        <div class="mv3-cam-presets" id="mv3-cam">
          <button type="button" data-cam="orbit" class="is-on">环视</button>
          <button type="button" data-cam="teacher">教师位</button>
          <button type="button" data-cam="back">后排</button>
          <button type="button" data-cam="seat">旁听席</button>
          <button type="button" data-cam="podium">俯视</button>
        </div>
        <div class="mv3-axis mv3-axis-l">◀ 反对替代</div>
        <div class="mv3-axis mv3-axis-r">支持替代 ▶</div>
        <div class="mv3-axis mv3-axis-hint">数据层 · 左右=立场 · 远近=投入度</div>
        <div class="mv3-centroid-readout" id="mv3-centroid">班级立场重心 <b>0.00</b></div>
        <div class="mv3-loading" id="mv3-loading">正在构建 3D 教室…</div>
        <div class="mv3-inspector" id="mv3-inspector" hidden></div>
        <div class="mv3-caption" id="mv3-caption" role="status" aria-live="polite" aria-atomic="true" aria-label="当前发言字幕">
          <span class="mv3-cap-ts">00:00</span>
          <span class="mv3-cap-role role-T">教师</span>
          <span class="mv3-cap-text">点击「▶ 播放录播」重演这堂集采替代讨论课；或「自由仿真」自己当老师。右下「数据层」可叠加诊断信息。</span>
        </div>
      </div>

      <div class="mv3-scrub">
        <span class="mv3-scrub-time"><b id="mv3-cur">00:00</b> / 45:00</span>
        <div class="mv3-scrub-track" id="mv3-track" role="slider" tabindex="0" aria-label="录播进度" aria-valuemin="0" aria-valuemax="2700" aria-valuenow="0">
          <div class="mv3-scrub-fill" id="mv3-fill"></div>
          <div class="mv3-scrub-ticks" id="mv3-ticks"></div>
          <div class="mv3-scrub-head" id="mv3-head"></div>
        </div>
      </div>

      <div class="mv3-controls">
        <div class="mv3-ctrl-l">
          <button type="button" class="mv3-btn mv3-btn-run" id="mv3-run">▶ 播放录播</button>
          <button type="button" class="mv3-btn mv3-btn-ghost" id="mv3-reset">⟲ 回到开头</button>
          <button type="button" class="mv3-btn mv3-btn-mode" id="mv3-live">🎤 自由仿真</button>
        </div>
        <div class="mv3-ctrl-teacher" id="mv3-teacher" hidden>
          <span class="mv3-tlab">教师动作</span>
          <button type="button" class="mv3-chip" data-act="openq">抛开放问题</button>
          <button type="button" class="mv3-chip" data-act="callc">点名药企背景</button>
          <button type="button" class="mv3-chip" data-act="callsilent">点名沉默者</button>
          <button type="button" class="mv3-chip" data-act="callrandom">随机点名</button>
          <button type="button" class="mv3-chip" data-act="topic">切议题 ⇆</button>
          <button type="button" class="mv3-chip" data-act="huddle">分组讨论</button>
          <button type="button" class="mv3-chip" data-act="timer">⏱ 计时 5:00</button>
        </div>
        <div class="mv3-ctrl-r">
          <button type="button" class="mv3-btn mv3-btn-snd" id="mv3-snd" title="环境声音">🔊 声音</button>
          <button type="button" class="mv3-btn mv3-btn-data" id="mv3-data">📊 数据层</button>
          <select id="mv3-seat" class="mv3-select" aria-label="座位排布" title="座位排布">
            <option value="class">真实座位</option>
            <option value="stance">立场散布（分析）</option>
            <option value="group">分组聚类（分析）</option>
          </select>
        </div>
      </div>

      <div class="mv3-legend">
        <span><i style="background:${COL.amber}"></i>A 政策/医保</span>
        <span><i style="background:${COL.sage}"></i>B 患者/家庭</span>
        <span><i style="background:${COL.violet}"></i>C 药企背景</span>
        <span><i style="background:${COL.grey}"></i>D 观望/被动</span>
        <span class="mv3-lg-sep"></span>
        <span class="mv3-lg-expr">💬 发言　✋ 想说　😟 焦虑　💤 走神</span>
      </div>

      <div class="mv3-analysis" id="mv3-analysis"></div>
    `;
    injectCSS();
  }

  /* ============================================================
   *  Classroom — 场景 / 角色 / 仿真 / 交互
   * ============================================================ */
  class Classroom {
    constructor(THREE, OrbitControls, CSS2DRenderer, CSS2DObject, mount, RoomEnvironment) {
      this.THREE = THREE; this.OrbitControls = OrbitControls;
      this.CSS2DRenderer = CSS2DRenderer; this.CSS2DObject = CSS2DObject;
      this.RoomEnvironment = RoomEnvironment || null;
      this.mount = mount; this.stage = mount.querySelector("#mv3-stage");
      this.MV = window.MVCore;
      this.chars = {};          // id → { group, parts..., label, expr, hit, target:{x,z}, ... }
      this.simT = 0;            // 当前 sim 秒
      this.playing = false;
      this.live = false;        // 自由仿真模式
      this.seatMode = "class";  // 默认=真实固定座位的教室（立场退到"数据层"）
      this.dataLayer = false;   // 数据层（名牌/表情/立场/统计）默认关，看真实课堂；诊断时打开
      this.focusId = null;
      this.timeCbs = [];
      this.speakUntil = {};     // id → 发言高亮截止 simT
      this.lastBeatIdx = 0;
      this._raf = null;
      this._lastWall = 0;
      this.huddle = false; this.huddleUntil = 0;   // 分组讨论
      this.timer = null;                            // ⏱ 计时（真实时间）
      this.audio = new MVAudio();                   // 声音层（默认静音，需点击开启）
      this._lastSpokenId = null; this._sndAccum = 0;
    }

    init() {
      const T = this.THREE;
      const scene = new T.Scene();
      scene.background = new T.Color(COL.paper);
      scene.fog = new T.Fog(COL.paper, 26, 60);
      this.scene = scene;

      const W = this.stage.clientWidth, H = this.stage.clientHeight || 520;
      const cam = new T.PerspectiveCamera(46, W / H, 0.1, 200);
      this.camHome = new T.Vector3(0, 9.5, 17);
      this.camTarget = new T.Vector3(0, 1.3, 3.4);
      cam.position.copy(this.camHome);
      this.camera = cam;

      const renderer = new T.WebGLRenderer({ antialias: true, alpha: false });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      renderer.setSize(W, H);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = T.PCFSoftShadowMap;
      renderer.outputColorSpace = T.SRGBColorSpace;
      renderer.toneMapping = T.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.06;
      this.stage.appendChild(renderer.domElement);
      renderer.domElement.className = "mv3-canvas";
      // a11y：canvas 是非文本内容，给屏幕阅读器一个等价描述（动态状态走下方 #mv3-caption 的 aria-live）
      renderer.domElement.setAttribute("role", "img");
      renderer.domElement.setAttribute("aria-label", "AI 虚拟班 32 人 3D 立场课堂：横轴=对集采替代的立场，纵深=投入度；实时发言见下方字幕条");
      this.renderer = renderer;

      // 基于图像的柔光（RoomEnvironment IBL）——材质从哑光塑料 → 有柔和高光的质感
      if (this.RoomEnvironment) {
        try {
          const pmrem = new T.PMREMGenerator(renderer);
          scene.environment = pmrem.fromScene(new this.RoomEnvironment(), 0.04).texture;
          scene.environmentIntensity = 0.55;
        } catch (e) { /* 无 IBL 也能跑 */ }
      }

      const labelR = new this.CSS2DRenderer();
      labelR.setSize(W, H);
      labelR.domElement.className = "mv3-labels";
      this.stage.appendChild(labelR.domElement);
      this.labelR = labelR;

      const controls = new this.OrbitControls(cam, labelR.domElement);
      controls.enableDamping = true; controls.dampingFactor = 0.08;
      controls.target.copy(this.camTarget);
      controls.minDistance = 6; controls.maxDistance = 42;
      controls.maxPolarAngle = Math.PI * 0.49;   // 不钻到地板下
      controls.minPolarAngle = Math.PI * 0.12;
      controls.enablePan = false;
      this.controls = controls;

      this.buildLights();
      this.buildRoom();
      this.buildPodium();
      this.buildCentroidMarker();
      this.buildCharacters();
      this.ensureFurniture();                               // 真实课堂默认有桌椅
      this.furniture.visible = (this.seatMode === "class");
      this.layout(true);

      // 烘焙整堂录像（固定 beats + 立场/注意力关键帧，供进度条任意定位）
      this.bake();
      this.buildScrubTicks();
      this.applyFrame(0);
      this.updateAnalysis();

      this.bindControls();
      this.bindPicking();
      this.onResize = this.onResize.bind(this);
      window.addEventListener("resize", this.onResize);
      this.ro = new ResizeObserver(this.onResize); this.ro.observe(this.stage);
      document.addEventListener("visibilitychange", () => { if (document.hidden) this.stop(); else this.loop(); });

      const ld = this.mount.querySelector("#mv3-loading"); if (ld) ld.remove();
      this.loop();
    }

    /* ---------- 灯光 ---------- */
    buildLights() {
      const T = this.THREE, s = this.scene;
      s.add(new T.HemisphereLight(0xfff4e0, 0xa99878, 0.62));        // 暖天光 / 地面回弹
      const key = new T.DirectionalLight(0xfff0d4, 1.35);            // 暖主光
      key.position.set(-11, 23, 14);
      key.castShadow = true;
      key.shadow.mapSize.set(2048, 2048);
      const d = 24; const c = key.shadow.camera;
      c.left = -d; c.right = d; c.top = d; c.bottom = -d; c.near = 1; c.far = 72;
      key.shadow.bias = -0.0004; key.shadow.normalBias = 0.025; key.shadow.radius = 4;
      s.add(key);
      const fill = new T.DirectionalLight(0xdde8fb, 0.26); fill.position.set(13, 9, -6); s.add(fill);   // 冷补光
      const rim = new T.DirectionalLight(0xffe6c0, 0.55); rim.position.set(1, 7, -17); s.add(rim);       // 背向轮廓光
      s.add(new T.AmbientLight(0xfff4e6, 0.12));
    }

    /* ---------- 房间 ---------- */
    buildRoom() {
      const T = this.THREE, s = this.scene;
      // 地板（暖木）
      const floorGeo = new T.PlaneGeometry(40, 32);
      const floorMat = new T.MeshStandardMaterial({ color: COL.floorWarm, roughness: 0.95, metalness: 0 });
      const floor = new T.Mesh(floorGeo, floorMat);
      floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, 4); floor.receiveShadow = true;
      s.add(floor);

      // 阵营地面分区（仅"数据层"显示——真实课堂默认隐藏）
      const zoneL = new T.Mesh(new T.PlaneGeometry(19, 30), new T.MeshBasicMaterial({ color: COL.zoneL, transparent: true, opacity: 0.12 }));
      zoneL.rotation.x = -Math.PI / 2; zoneL.position.set(-9.6, 0.02, 4); zoneL.visible = false; s.add(zoneL); this.zoneL = zoneL;
      const zoneR = new T.Mesh(new T.PlaneGeometry(19, 30), new T.MeshBasicMaterial({ color: COL.zoneR, transparent: true, opacity: 0.14 }));
      zoneR.rotation.x = -Math.PI / 2; zoneR.position.set(9.6, 0.02, 4); zoneR.visible = false; s.add(zoneR); this.zoneR = zoneR;
      const mid = new T.Mesh(new T.PlaneGeometry(0.12, 30), new T.MeshBasicMaterial({ color: COL.ink, transparent: true, opacity: 0.12 }));
      mid.rotation.x = -Math.PI / 2; mid.position.set(0, 0.03, 4); mid.visible = false; s.add(mid); this.midLine = mid;

      // 墙（背 + 两侧），单面，淡纸色
      const wallMat = new T.MeshStandardMaterial({ color: COL.paper2, roughness: 1, metalness: 0, side: T.DoubleSide });
      const back = new T.Mesh(new T.PlaneGeometry(40, 13), wallMat);
      back.position.set(0, 6.5, -11.5); back.receiveShadow = true; s.add(back);
      const left = new T.Mesh(new T.PlaneGeometry(32, 13), wallMat);
      left.rotation.y = Math.PI / 2; left.position.set(-20, 6.5, 4); s.add(left);
      const right = new T.Mesh(new T.PlaneGeometry(32, 13), wallMat);
      right.rotation.y = -Math.PI / 2; right.position.set(20, 6.5, 4); s.add(right);

      // 黑板/投影屏（背墙）
      const board = new T.Mesh(new T.PlaneGeometry(15, 6), new T.MeshStandardMaterial({ color: COL.board, roughness: 0.9 }));
      board.position.set(0, 6.5, -11.35); board.receiveShadow = true; s.add(board);
      const frame = new T.Mesh(new T.PlaneGeometry(15.5, 6.5), new T.MeshBasicMaterial({ color: COL.amberDeep }));
      frame.position.set(0, 6.5, -11.42); s.add(frame);
      // 屏上议题（CSS2D）—— 可由「切议题」更新
      this.topics = [
        { b: "原研 → 仿制 <b>替代</b>", sub: "集采落地后的药事委员会决策" },
        { b: "MAH <b>委托生产</b>责任", sub: "上市许可持有人的质量主体责任边界" },
        { b: "医保 <b>支付方式</b>改革", sub: "DRG / DIP 下的药品成本与临床价值" },
        { b: "一致性评价与<b>质量</b>", sub: "仿制药 BE 与窄治疗窗药品的争议" },
      ];
      this.topicIdx = 0;
      const topic = document.createElement("div");
      topic.className = "mv3-board"; topic.innerHTML = `<span>议题</span>${this.topics[0].b}<i>${this.topics[0].sub}</i>`;
      this.boardEl = topic;
      const topicObj = new this.CSS2DObject(topic); topicObj.position.set(0, 6.3, -11.2); s.add(topicObj);
      // 粉笔槽 + 挂钟（物理痕迹）
      const tray = new T.Mesh(new T.BoxGeometry(15.2, 0.16, 0.22), new T.MeshStandardMaterial({ color: "#8c6a44", roughness: 0.8 }));
      tray.position.set(0, 3.35, -11.2); tray.castShadow = true; s.add(tray);
      const clock = new T.Mesh(new T.CylinderGeometry(0.55, 0.55, 0.08, 24), new T.MeshStandardMaterial({ color: "#fbf8f1", roughness: 0.6 }));
      clock.rotation.x = Math.PI / 2; clock.position.set(11.5, 9.5, -11.3); s.add(clock);
      const clockR = new T.Mesh(new T.TorusGeometry(0.55, 0.05, 8, 28), new T.MeshStandardMaterial({ color: COL.ink, roughness: 0.5 })); clockR.position.copy(clock.position); s.add(clockR);
      // 门（右墙）
      const doorMat = new T.MeshStandardMaterial({ color: "#b9a07e", roughness: 0.8 });
      const door = new T.Mesh(new T.BoxGeometry(0.12, 5.4, 2.2), doorMat); door.position.set(19.85, 2.7, 9.5); s.add(door);
      const doorFr = new T.Mesh(new T.BoxGeometry(0.16, 5.8, 2.5), new T.MeshStandardMaterial({ color: "#7a6244", roughness: 0.8 })); doorFr.position.set(19.8, 2.9, 9.5); s.add(doorFr);
      const knob = new T.Mesh(new T.SphereGeometry(0.08, 10, 10), new T.MeshStandardMaterial({ color: "#caa24a", metalness: 0.6, roughness: 0.3 })); knob.position.set(19.78, 2.6, 8.55); s.add(knob);
      // 窗（左墙，3 扇，浅蓝半透玻璃 + 框）
      const glass = new T.MeshStandardMaterial({ color: "#cfe2f0", roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.45 });
      const winFrameMat = new T.MeshStandardMaterial({ color: "#e8e0cf", roughness: 0.9 });
      [-2, 4, 10].forEach((wz) => {
        const fr = new T.Mesh(new T.BoxGeometry(0.18, 4.4, 3.0), winFrameMat); fr.position.set(-19.85, 6.4, wz); s.add(fr);
        const gl = new T.Mesh(new T.PlaneGeometry(2.7, 4.0), glass); gl.rotation.y = Math.PI / 2; gl.position.set(-19.78, 6.4, wz); s.add(gl);
        const mull = new T.Mesh(new T.BoxGeometry(0.2, 0.1, 3.0), winFrameMat); mull.position.set(-19.8, 6.4, wz); s.add(mull);
      });
    }

    buildPodium() {
      const T = this.THREE, s = this.scene;
      const podium = new T.Mesh(new T.BoxGeometry(2.4, 1.1, 1.1), new T.MeshStandardMaterial({ color: "#b08c5e", roughness: 0.7 }));
      podium.position.set(-3.4, 0.55, -8.6); podium.castShadow = true; podium.receiveShadow = true; s.add(podium);
      // 讲台杂物：笔记本电脑 + 水杯 + 一摞书 + 纸
      const lap = new T.MeshStandardMaterial({ color: "#2f2c28", roughness: 0.45, metalness: 0.35 });
      const lb = new T.Mesh(new T.BoxGeometry(0.7, 0.04, 0.5), lap); lb.position.set(-3.4, 1.13, -8.45); s.add(lb);
      const ls = new T.Mesh(new T.BoxGeometry(0.7, 0.46, 0.03), lap); ls.position.set(-3.4, 1.35, -8.68); ls.rotation.x = -0.35; s.add(ls);
      const cup = new T.Mesh(new T.CylinderGeometry(0.07, 0.06, 0.22, 12), new T.MeshStandardMaterial({ color: COL.amberDeep, roughness: 0.5 })); cup.position.set(-2.7, 1.22, -8.5); s.add(cup);
      [0, 0.07, 0.14].forEach((dy, k) => { const bk = new T.Mesh(new T.BoxGeometry(0.5, 0.06, 0.36), new T.MeshStandardMaterial({ color: ["#6f2f2a", "#3a4b6b", "#4d6257"][k], roughness: 0.8 })); bk.position.set(-4.1, 1.14 + dy, -8.5); bk.rotation.y = 0.1 * k; s.add(bk); });
      // 教师 + AI Agent 立在讲台旁
      this.teacher = this.makeFigure("__T", { skin: "#eab98f", hair: "#2b2320", torso: COL.amberDeep, pants: "#3d3a34", build: 1.08, hairStyle: 1 });
      this.teacher.position.set(-4.7, 0, -8.4); this.scene.add(this.teacher);
      const tlab = document.createElement("div"); tlab.className = "mv3-name mv3-name-T"; tlab.textContent = "教师";
      this.teacher.add(this._labelObj(tlab, 3.3));
      this.agent = this.makeFigure("__A", { skin: "#cdd6e6", hair: "#1b2536", torso: COL.ink, pants: "#2c2925", build: 1.0, hairStyle: 3, robot: true });
      this.agent.position.set(-2.1, 0, -8.4); this.scene.add(this.agent);
      const alab = document.createElement("div"); alab.className = "mv3-name mv3-name-A"; alab.textContent = "AI Agent";
      this.agent.add(this._labelObj(alab, 3.3));
    }

    buildCentroidMarker() {
      const T = this.THREE;
      const g = new T.Group();
      const pole = new T.Mesh(new T.CylinderGeometry(0.04, 0.04, 2.4, 8), new T.MeshBasicMaterial({ color: COL.ink }));
      pole.position.y = 1.2; g.add(pole);
      const flag = new T.Mesh(new T.PlaneGeometry(1.1, 0.5), new T.MeshBasicMaterial({ color: COL.amberDeep, side: T.DoubleSide }));
      flag.position.set(0.55, 2.1, 0); g.add(flag);
      const ring = new T.Mesh(new T.RingGeometry(0.5, 0.62, 24), new T.MeshBasicMaterial({ color: COL.amberDeep, transparent: true, opacity: 0.6, side: T.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; g.add(ring);
      g.position.set(0, 0, 4); g.visible = false;   // 仅"数据层"显示
      this.scene.add(g); this.centroidMarker = g;
    }

    /* ---------- 角色工厂（程序化低多边形写实人：四肢/手/鞋/肩/脸） ---------- */
    makeFigure(id, opt) {
      const T = this.THREE;
      const g = new T.Group(); g.userData.id = id;
      const M = (c, r = 0.62) => new T.MeshStandardMaterial({ color: c, roughness: r, metalness: 0.03 });
      const darker = (hex, f) => "#" + new T.Color(hex).multiplyScalar(f).getHexString();
      const build = opt.build || 1;
      const skin = M(opt.skin, 0.5);
      const shirt = M(opt.torso, 0.62);
      const pants = M(opt.pants, 0.7);
      const shoe = M("#2b2620", 0.55);
      const hairMat = M(opt.hair, 0.55);

      // 升降组：站立 y=0，坐下整体下沉到椅面（上半身随之沉，腿在髋/膝铰接弯曲）
      const upper = new T.Group(); g.add(upper); g.userData.upper = upper;

      // —— 腿（髋/膝铰接：站立伸直、坐下大腿前伸+小腿垂地） ——
      const legMat = opt.skirt ? skin : pants;   // 裙装露小腿(肤色)
      const makeLeg = (x) => {
        const hip = new T.Group(); hip.position.set(x, 1.0, 0);
        const thighPiv = new T.Group(); hip.add(thighPiv);
        const th = new T.Mesh(new T.CapsuleGeometry(0.125, 0.4, 5, 14), pants); th.position.y = -0.23; th.castShadow = true; thighPiv.add(th);
        const knee = new T.Group(); knee.position.y = -0.46; thighPiv.add(knee);
        const shinPiv = new T.Group(); knee.add(shinPiv);
        const ca = new T.Mesh(new T.CapsuleGeometry(0.105, 0.38, 5, 14), legMat); ca.position.y = -0.22; ca.castShadow = true; shinPiv.add(ca);
        const sh = new T.Mesh(new T.CapsuleGeometry(0.1, 0.16, 4, 10), shoe); sh.rotation.z = Math.PI / 2; sh.position.set(0, -0.44, 0.07); shinPiv.add(sh);
        upper.add(hip); return { thighPiv, shinPiv };
      };
      g.userData.legL = makeLeg(-0.13); g.userData.legR = makeLeg(0.13);
      if (opt.skirt) {
        const pts = [new T.Vector2(0.06, 0), new T.Vector2(0.40, 0.05), new T.Vector2(0.38, 0.12), new T.Vector2(0.30, 0.46), new T.Vector2(0.24, 0.7)];
        const skirt = new T.Mesh(new T.LatheGeometry(pts, 30), new T.MeshStandardMaterial({ color: opt.pants, roughness: 0.7, metalness: 0.03, side: T.DoubleSide }));
        skirt.position.y = 0.66; skirt.castShadow = true; upper.add(skirt);
      }
      // 盆骨
      const pelvis = new T.Mesh(new T.SphereGeometry(0.25, 20, 16), pants); pelvis.position.y = 1.2; pelvis.scale.set(1, 0.66, 0.85); upper.add(pelvis);

      // —— 躯干（车削：腰→胸→肩；双面避免半透露空心） ——
      const tp = [
        new T.Vector2(0.245, 0.0), new T.Vector2(0.265, 0.16), new T.Vector2(0.245, 0.32),
        new T.Vector2(0.315, 0.58), new T.Vector2(0.335, 0.76), new T.Vector2(0.29, 0.9), new T.Vector2(0.10, 1.0),
      ];
      const torso = new T.Mesh(new T.LatheGeometry(tp, 32), new T.MeshStandardMaterial({ color: opt.torso, roughness: 0.6, metalness: 0.03, side: T.DoubleSide }));
      torso.position.y = 1.16; torso.scale.y = build; torso.castShadow = true; upper.add(torso);
      g.userData.torso = torso;
      const shoulderY = 1.16 + 0.9 * build;       // ~2.06
      // —— 上装类型（打散同质感）：领圈 + 衬衫/夹克/连帽衫各自细节 ——
      const neckTrim = new T.Mesh(new T.TorusGeometry(0.115, 0.026, 8, 20), M(darker(opt.torso, 0.8), 0.6));
      neckTrim.position.y = shoulderY - 0.02; neckTrim.rotation.x = Math.PI / 2; upper.add(neckTrim);
      if (opt.top === "collar" || opt.top === "jacket") {
        [-1, 1].forEach((s) => { const fl = new T.Mesh(new T.BoxGeometry(0.13, 0.16, 0.03), M(darker(opt.torso, opt.top === "jacket" ? 0.7 : 0.9), 0.6)); fl.position.set(0.08 * s, shoulderY - 0.13, 0.25); fl.rotation.z = 0.5 * s; fl.rotation.y = -0.3 * s; upper.add(fl); });
        const plk = new T.Mesh(new T.BoxGeometry(0.04, 0.66 * build, 0.02), M(darker(opt.torso, 0.85), 0.6)); plk.position.set(0, 1.55, 0.28); upper.add(plk);
        if (opt.top === "collar") for (let k = 0; k < 3; k++) { const bt = new T.Mesh(new T.SphereGeometry(0.018, 8, 8), M("#efe9dc", 0.5)); bt.position.set(0, 1.74 - k * 0.18, 0.29); upper.add(bt); }
      } else if (opt.top === "hoodie") {
        const hood = new T.Mesh(new T.SphereGeometry(0.2, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.6), M(darker(opt.torso, 0.92), 0.7)); hood.position.set(0, shoulderY + 0.01, -0.12); hood.rotation.x = -0.5; hood.scale.set(1.1, 1, 0.8); upper.add(hood);
        const pocket = new T.Mesh(new T.BoxGeometry(0.34, 0.16, 0.05), M(darker(opt.torso, 0.9), 0.78)); pocket.position.set(0, 1.32, 0.29); upper.add(pocket);
        [-1, 1].forEach((s) => { const str = new T.Mesh(new T.CylinderGeometry(0.012, 0.012, 0.18, 6), M("#efe9dc", 0.6)); str.position.set(0.05 * s, shoulderY - 0.18, 0.27); upper.add(str); });
      }
      // 肩（三角肌）
      [-1, 1].forEach((s) => { const d = new T.Mesh(new T.SphereGeometry(0.13, 16, 12), shirt); d.position.set(0.28 * s, shoulderY - 0.04, 0); d.scale.set(1, 0.85, 1); d.castShadow = true; upper.add(d); });

      // —— 手臂（肩为支点的组：上臂+前臂+手；微弯更自然） ——
      function armAt(s) {
        const a = new T.Group(); a.position.set(0.30 * s, shoulderY - 0.02, 0);
        const upper = new T.Mesh(new T.CapsuleGeometry(0.082, 0.34, 5, 12), shirt); upper.position.y = -0.22; upper.castShadow = true; a.add(upper);
        const fore = new T.Mesh(new T.CapsuleGeometry(0.072, 0.32, 5, 12), shirt); fore.position.set(0.015 * s, -0.58, 0.03); fore.rotation.x = -0.22; fore.castShadow = true; a.add(fore);
        const hand = new T.Mesh(new T.SphereGeometry(0.082, 12, 10), skin); hand.position.set(0.02 * s, -0.78, 0.08); hand.scale.set(1, 1.15, 0.7); a.add(hand);
        a.rotation.z = -0.13 * s;
        return a;
      }
      const armL = armAt(-1), armR = armAt(1); upper.add(armL); upper.add(armR);
      g.userData.armL = armL; g.userData.armR = armR;

      // —— 颈 + 头（略呈头形） ——
      const neck = new T.Mesh(new T.CylinderGeometry(0.085, 0.11, 0.2, 16), skin); neck.position.y = shoulderY + 0.06; upper.add(neck);
      const head = new T.Mesh(new T.SphereGeometry(0.3, 32, 26), skin);
      head.position.y = 2.42; head.scale.set(0.88, 1.02, 0.9); head.castShadow = true; upper.add(head);  // 头略缩→更成人比例
      g.userData.head = head;
      // 鼻 + 耳
      const nose = new T.Mesh(new T.ConeGeometry(0.04, 0.1, 10), skin); nose.rotation.x = Math.PI / 2; nose.position.set(0, -0.01, 0.30); head.add(nose);
      [-1, 1].forEach((s) => { const ear = new T.Mesh(new T.SphereGeometry(0.06, 10, 10), skin); ear.position.set(0.29 * s, 0, 0); ear.scale.set(0.5, 1, 0.7); head.add(ear); });

      // —— 头发 ——
      if (!opt.robot) {
        const cap = new T.Mesh(new T.SphereGeometry(0.315, 28, 22, 0, Math.PI * 2, 0, Math.PI * 0.6), hairMat);
        cap.position.set(0, 0.04, -0.01); cap.castShadow = true; head.add(cap);
        const hs = opt.hairStyle;
        if (hs === 2) { const pony = new T.Mesh(new T.CapsuleGeometry(0.075, 0.4, 5, 12), hairMat); pony.position.set(0, -0.12, -0.3); pony.rotation.x = 0.5; head.add(pony); }
        else if (hs === 0) { const bob = new T.Mesh(new T.SphereGeometry(0.34, 26, 20, 0, Math.PI * 2, Math.PI * 0.3, Math.PI * 0.55), hairMat); bob.position.set(0, -0.04, -0.02); head.add(bob); }
        else if (hs === 4) { const bun = new T.Mesh(new T.SphereGeometry(0.12, 14, 12), hairMat); bun.position.set(0, 0.27, -0.1); head.add(bun); }
        else if (hs === 5) { for (let q = 0; q < 7; q++) { const cl = new T.Mesh(new T.SphereGeometry(0.1 + Math.random() * 0.03, 10, 8), hairMat); const a = q / 7 * Math.PI * 2; cl.position.set(Math.cos(a) * 0.22, 0.16 + Math.sin(a * 2) * 0.04, -0.02 + Math.sin(a) * 0.18); head.add(cl); } }
        if (hs === 1 || hs === 5) { const fr = new T.Mesh(new T.BoxGeometry(0.42, 0.07, 0.12), hairMat); fr.position.set(0, 0.2, 0.23); fr.rotation.x = 0.3; head.add(fr); }  // 刘海/发际线
      } else {
        const r = new T.Mesh(new T.TorusGeometry(0.27, 0.03, 12, 28), new T.MeshStandardMaterial({ color: COL.amber, emissive: COL.amber, emissiveIntensity: 0.5, roughness: 0.4 }));
        r.position.set(0, 0.4, 0); r.rotation.x = Math.PI / 2; head.add(r);
      }

      // —— 五官（眼白+瞳孔；挂头） ——
      const eyeMat = M("#241c16", 0.3);
      const white = M("#f4efe6", 0.4);
      function eye(s) {
        const e = new T.Group(); e.position.set(0.11 * s, 0.04, 0.245);
        const w = new T.Mesh(new T.SphereGeometry(0.045, 12, 10), white); w.scale.set(1.25, 1, 0.6); e.add(w);
        const p = new T.Mesh(new T.SphereGeometry(0.026, 10, 10), eyeMat); p.position.set(0, 0, 0.03); e.add(p);
        return e;
      }
      const eL = eye(-1), eR = eye(1); head.add(eL); head.add(eR);
      g.userData.eyeL = eL; g.userData.eyeR = eR;
      if (!opt.robot) {
        const browMat = M(opt.hair, 0.55);
        const browGeo = new T.BoxGeometry(0.13, 0.028, 0.04);
        const bL = new T.Mesh(browGeo, browMat); bL.position.set(-0.11, 0.13, 0.26); head.add(bL);
        const bR = new T.Mesh(browGeo, browMat); bR.position.set(0.11, 0.13, 0.26); head.add(bR);
        g.userData.browL = bL; g.userData.browR = bR;
        const mouth = new T.Mesh(new T.BoxGeometry(0.12, 0.03, 0.04), M("#9a5b4a", 0.5));
        mouth.position.set(0, -0.14, 0.26); head.add(mouth);
        g.userData.mouth = mouth;
      }

      // 脚下接触阴影
      const shc = new T.Mesh(new T.CircleGeometry(0.46, 24), new T.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.12 }));
      shc.rotation.x = -Math.PI / 2; shc.position.y = 0.02; g.add(shc);

      g.scale.setScalar(1.0);
      return g;
    }

    _labelObj(dom, y) { const o = new this.CSS2DObject(dom); o.position.set(0, y, 0); o.center = new this.THREE.Vector2(0.5, 1); return o; }

    buildCharacters() {
      const MV = this.MV;
      MV.STUDENTS.forEach((s) => {
        const rnd = mulberry32(hashStr(s.id));
        const grp = groupOf(s.id);
        const female = rnd() < 0.5;
        const opt = {
          skin: SKIN[Math.floor(rnd() * SKIN.length)],
          hair: HAIR[Math.floor(rnd() * HAIR.length)],
          torso: GROUP_COLOR[grp],
          pants: PANTS[Math.floor(rnd() * PANTS.length)],
          build: 0.9 + rnd() * 0.28,
          hairStyle: female ? [0, 2, 4][(rnd() * 3) | 0] : (rnd() < 0.6 ? 1 : 5),  // 0长发 2马尾 4丸子 1短 5卷
          skirt: female && rnd() < 0.6,
          top: ["tshirt", "collar", "hoodie", "jacket", "tshirt", "collar"][(rnd() * 6) | 0],  // 上装类型
        };
        const fig = this.makeFigure(s.id, opt);
        fig.userData.id = s.id;
        const host = fig.userData.upper || fig;   // 名牌/命中盒挂升降组，随坐下下沉
        // 名牌
        const nameEl = document.createElement("div");
        nameEl.className = "mv3-name mv3-name-" + grp; nameEl.textContent = s.name;
        const nameObj = this._labelObj(nameEl, 3.05);
        host.add(nameObj);
        // 表情/气泡
        const exEl = document.createElement("div"); exEl.className = "mv3-expr";
        const exObj = this._labelObj(exEl, 3.55); exObj.center = new this.THREE.Vector2(0.5, 1);
        host.add(exObj);
        // 命中盒（点击聚焦）
        const hit = new this.THREE.Mesh(new this.THREE.CylinderGeometry(0.7, 0.7, 3, 6), new this.THREE.MeshBasicMaterial({ visible: false }));
        hit.position.y = 1.5; hit.userData.id = s.id; host.add(hit);

        this.scene.add(fig);
        this.chars[s.id] = {
          group: fig, id: s.id, nameEl, exEl, hit,
          base: { x: 0, z: 0 }, target: { x: 0, z: 0 }, cur: { x: 0, z: 0 },
          bob: rnd() * 6.28, jitter: { x: (rnd() - 0.5) * 0.9, z: (rnd() - 0.5) * 0.9 },
          lastExpr: "", lastFace: 0,
          // —— 个体课堂习惯（驱动异步微动作） ——
          noteTaker: rnd() < 0.4,           // 爱记笔记
          fidget: rnd() < 0.3,              // 易换坐姿/小动作
          glance: 0.6 + rnd() * 0.8,        // 看屏幕/看同伴的频率因子
          phase: rnd() * 6.28,              // 动作错峰相位
          voicePitch: female ? 178 + rnd() * 55 : 108 + rnd() * 42,  // 风格化语声基频
        };
      });
    }

    /* ---------- 立场 → 世界坐标 ---------- */
    targetFor(id, rt) {
      const grp = groupOf(id);
      if (this.huddle) {
        // 8 个小组围圈讨论
        const i = this.MV.STUDENTS.findIndex((s) => s.id === id);
        const hud = Math.floor(i / 4);
        const hx = ((hud % 4) - 1.5) * 6.6, hz = 0.5 + Math.floor(hud / 4) * 6.4;
        const a = (i % 4) / 4 * Math.PI * 2 + 0.4;
        const c = this.chars[id]; if (c) c._huddleCenter = { x: hx, z: hz };
        return { x: hx + Math.cos(a) * 1.3, z: hz + Math.sin(a) * 1.3 };
      }
      if (this.seatMode === "group") {
        // 四象限聚类
        const gi = { A: 0, B: 1, C: 2, D: 3 }[grp];
        const cx = [-9, 9, 4.5, -4.5][gi], cz = [-2, -2, 8, 8][gi];
        const idx = +id.slice(1) - 1;
        const col = idx % 4, row = Math.floor(idx / 4);
        return { x: cx + (col - 1.5) * 1.6, z: cz + row * 1.7 };
      }
      if (this.seatMode === "class") return this.seatXZ(id);   // 真实固定座位（含中央过道）
      // stance：x = 立场，z = 投入度（高=前排近讲台=z小）
      const st = rt ? rt.stance_position : (this.MV.STANCE_BAKED[id] ? this.MV.STANCE_BAKED[id].t : 0);
      const at = rt ? rt.attention : 0.6;
      const c = this.chars[id];
      const x = clamp(st * 11 + c.jitter.x, -15, 15);
      const z = lerp(8.5, -1.0, clamp(at, 0, 1)) + c.jitter.z;  // 投入越高越靠前
      return { x, z };
    }

    // 真实教室座位（4 排 × 8 列，中央过道）
    seatXZByIndex(i, jc) {
      const cols = 8, col = i % cols, row = Math.floor(i / cols);
      const aisle = col < 4 ? -0.8 : 0.8;
      const jx = jc ? jc.jitter.x * 0.12 : 0, jz = jc ? jc.jitter.z * 0.1 : 0;
      return { x: (col - 3.5) * 2.05 + aisle + jx, z: -0.2 + row * 2.35 + jz };
    }
    seatXZ(id) {
      if (!this._seatOrder) this._seatOrder = this.MV.STUDENTS.map((s) => s.id);
      return this.seatXZByIndex(this._seatOrder.indexOf(id), this.chars[id]);
    }

    // 防重叠：把彼此过近的目标点互相推开（仅自由/立场模式需要）
    relaxTargets() {
      if (this.huddle || this.seatMode === "class" || this.seatMode === "group") return; // 真实座位/聚类/分组不松弛
      const ids = this.MV.STUDENTS.map((s) => s.id);
      const minD = 2.25;
      for (let it = 0; it < 8; it++) {
        for (let i = 0; i < ids.length; i++) {
          const a = this.chars[ids[i]].target;
          for (let j = i + 1; j < ids.length; j++) {
            const b = this.chars[ids[j]].target;
            let dx = b.x - a.x, dz = b.z - a.z; let d = Math.hypot(dx, dz) || 0.001;
            if (d < minD) { const p = (minD - d) / 2, nx = dx / d, nz = dz / d; a.x -= nx * p; a.z -= nz * p; b.x += nx * p; b.z += nz * p; }
          }
        }
      }
      ids.forEach((id) => { const t = this.chars[id].target; t.x = clamp(t.x, -16, 16); t.z = clamp(t.z, -1.2, 9); });
    }

    layout(immediate) {
      const all = this.MV.allRT();
      this.MV.STUDENTS.forEach((s) => {
        const c = this.chars[s.id]; if (!c) return;
        const tgt = this.targetFor(s.id, all[s.id]);
        c.target.x = tgt.x; c.target.z = tgt.z;
      });
      this.relaxTargets();
      if (immediate) this.MV.STUDENTS.forEach((s) => { const c = this.chars[s.id]; if (c) { c.cur.x = c.target.x; c.cur.z = c.target.z; c.group.position.set(c.target.x, 0, c.target.z); } });
    }

    /* ============================================================
     *  仿真：烘焙录像 + 关键帧采样（可任意定位）
     * ============================================================ */
    bake() {
      const MV = this.MV;
      MV.reset();
      const STEP = 3;                 // 每 3 秒一帧
      const ids = MV.STUDENTS.map((s) => s.id);
      const frames = [];
      for (let t = 0; t <= MV.T_CAP; t += STEP) {
        MV.advanceSim(t);
        const rec = MV.allRT();
        const n = ids.length;
        const fr = { t, st: new Float32Array(n), at: new Float32Array(n), fa: new Float32Array(n), sm: new Float32Array(n), ss: new Float32Array(n) };
        ids.forEach((id, i) => { const r = rec[id]; fr.st[i] = r.stance_position; fr.at[i] = r.attention; fr.fa[i] = r.fatigue; fr.sm[i] = r.speak_motivation; fr.ss[i] = r.social_safety; });
        frames.push(fr);
      }
      this.baked = { frames, ids, STEP };
      // 录像 beats（SCRIPT t≤132 + 生成的 DYN），按时间排序
      this.beats = MV.beatsUpTo(MV.T_CAP);
      this.km = this.beats.filter((b) => b.km || b.kind === "marker" || (b.kind === "note") || b.kind === "silence")
        .map((b) => ({ t: b.t, type: b.km ? "km" : b.kind === "marker" ? "marker" : b.kind === "silence" ? "silence" : "note", text: b.text }));
    }

    // 取插值后的某学生在 simT 的 {st, at, fa}
    frameState(id) {
      const b = this.baked; const i = b.ids.indexOf(id); if (i < 0) return { st: 0, at: 0.6, fa: 0 };
      const f = clamp(this.simT / b.STEP, 0, b.frames.length - 1);
      const i0 = Math.floor(f), i1 = Math.min(i0 + 1, b.frames.length - 1), w = f - i0;
      const a = b.frames[i0], c = b.frames[i1];
      return { st: lerp(a.st[i], c.st[i], w), at: lerp(a.at[i], c.at[i], w), fa: lerp(a.fa[i], c.fa[i], w), sm: lerp(a.sm[i], c.sm[i], w), ss: lerp(a.ss[i], c.ss[i], w) };
    }

    centroidAt() {
      if (this.live) { return this.MV.centroid(); }
      const b = this.baked; let sum = 0;
      const f = clamp(this.simT / b.STEP, 0, b.frames.length - 1); const i0 = Math.floor(f), i1 = Math.min(i0 + 1, b.frames.length - 1), w = f - i0;
      for (let i = 0; i < b.ids.length; i++) sum += lerp(b.frames[i0].st[i], b.frames[i1].st[i], w);
      return sum / b.ids.length;
    }

    /* ---------- 应用某时刻（录播） ---------- */
    applyFrame(t) {
      this.simT = clamp(t, 0, this.MV.T_CAP);
      // 目标位置由帧态决定
      this.MV.STUDENTS.forEach((s) => {
        const c = this.chars[s.id]; if (!c) return;
        const fs = this.live ? (() => { const r = this.MV.rtOf(s.id); return { st: r.stance_position, at: r.attention, fa: r.fatigue, sm: r.speak_motivation, ss: r.social_safety }; })() : this.frameState(s.id);
        c._fs = fs;
        const tgt = this.targetFor(s.id, { stance_position: fs.st, attention: fs.at });
        c.target.x = tgt.x; c.target.z = tgt.z;
      });
      this.relaxTargets();
      // 发言（找最近一条学生 line，落在窗口内 → 高亮）
      this.syncCaptionAndSpeaker();
      this.updateScrubUI();
      this.fireTime();
    }

    syncCaptionAndSpeaker() {
      // ≤simT 的最后一条 line/note；以及 6s 内的发言者
      let cur = null, speaker = null;
      for (const b of this.beats) {
        if (b.t > this.simT) continue;
        if ((b.kind === "line" || b.kind === "note") && (!cur || b.t >= cur.t)) cur = b;
        if (b.kind === "line" && b.role === "S" && this.simT - b.t < 6) speaker = b;
      }
      this.curSpeaker = speaker ? speaker.who : null;
      if (speaker) this.speakUntil[speaker.who] = Math.max(this.speakUntil[speaker.who] || 0, speaker.t + 6);
      // 字幕：仅"最近发言"时浮现，过 HOLD 秒或回到起点自动淡出
      const cap = this.mount.querySelector("#mv3-caption");
      const HOLD = 8;
      const active = !!cur && this.simT > 0 && (this.simT - cur.t) < HOLD;
      if (cap) {
        if (active) {
          if (this._capText !== cur.text) {
            const role = cur.role === "T" ? "教师" : cur.role === "A" ? "AI Agent" : (this.MV.byId[(cur.who || "").split("·")[0]] || {}).name || "学生";
            cap.querySelector(".mv3-cap-ts").textContent = fmt(cur.t);
            const r = cap.querySelector(".mv3-cap-role"); r.textContent = role; r.className = "mv3-cap-role role-" + (cur.role || "S");
            cap.querySelector(".mv3-cap-text").textContent = cur.text || "";
            this._capText = cur.text;
          }
          cap.classList.add("is-on");
        } else {
          cap.classList.remove("is-on"); this._capText = null;
        }
      }
    }

    /* ============================================================
     *  渲染循环
     * ============================================================ */
    loop() {
      if (this._raf) return;
      const T = this.THREE;
      const tick = (now) => {
        this._raf = requestAnimationFrame(tick);
        const dt = this._lastWall ? Math.min(0.05, (now - this._lastWall) / 1000) : 0.016;
        this._lastWall = now;

        // 推进时间
        if (this.playing && !this.live) {
          this.simT += dt * (this.MV.T_CAP / 90); // 90 秒走完 45 分钟
          if (this.simT >= this.MV.T_CAP) { this.simT = this.MV.T_CAP; this.playing = false; this.setRunBtn(); }
          this.applyFrame(this.simT);
        } else if (this.live) {
          this.simT += dt * 8;                    // 自由仿真：8× 实时
          this.MV.advanceSim(this.simT, (b) => this.onLiveBeat(b));
          this.applyFrame(this.simT);
        }

        // 角色补间 + 体态 + 表情
        const camPos = this.camera.position;
        this.MV.STUDENTS.forEach((s) => this.updateChar(s.id, now / 1000, camPos));
        // 立场重心
        const ce = this.centroidAt();
        const cx = clamp(ce * 8.4, -14, 14);
        this.centroidMarker.position.x += (cx - this.centroidMarker.position.x) * 0.06;
        const cr = this.mount.querySelector("#mv3-centroid b"); if (cr) cr.textContent = ce.toFixed(2);

        // 名牌防遮挡（节流；仅数据层）
        this._fc = (this._fc || 0) + 1;
        if (this.dataLayer && this._fc % 5 === 0) this.declutterLabels();
        // 声音触发
        if (this.audio && this.audio.on) this.tickAudio(dt);
        // ⏱ 计时（真实时间倒计）
        if (this.timer && this.timer.on) { this.timer.left = Math.max(0, this.timer.left - dt); this.updateTimerUI(); if (this.timer.left <= 0) { this.timer.on = false; this.timerDone(); } }
        // 分组讨论时长到 → 收束
        if (this.huddle && this.live && this.simT > this.huddleUntil) this.endHuddle();

        // 相机聚焦补间
        if (this._camLerp) this.stepCamLerp();
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
        this.labelR.render(this.scene, this.camera);
      };
      this._raf = requestAnimationFrame(tick);
    }
    stop() { if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; this._lastWall = 0; } }

    // 把世界坐标投影为声像 -1..1（屏幕左右）
    panOf(c) {
      const v = (this._panV || (this._panV = new this.THREE.Vector3())); v.set(c.cur.x, 1.4, c.cur.z); v.project(this.camera);
      return clamp(v.z > 1 ? 0 : v.x, -1, 1);
    }
    tickAudio(dt) {
      // 发言：换人时播一段定向"语声"
      if (this.curSpeaker && this.curSpeaker !== this._lastSpokenId) {
        const c = this.chars[this.curSpeaker]; if (c) this.audio.speak(this.panOf(c), c.voicePitch || 150, 2.4);
        this._lastSpokenId = this.curSpeaker;
      } else if (!this.curSpeaker) this._lastSpokenId = null;
      // 椅响 / 翻书（低概率，按位置声像）
      this._sndAccum += dt;
      if (this._sndAccum >= 0.25) {
        this._sndAccum = 0;
        const ids = this.MV.STUDENTS;
        if (Math.random() < 0.16) { const c = this.chars[ids[(Math.random() * ids.length) | 0].id]; if (c) this.audio.creak(this.panOf(c)); }
        if (Math.random() < 0.12) { const nt = ids.filter((s) => this.chars[s.id].noteTaker); const arr = nt.length ? nt : ids; const c = this.chars[arr[(Math.random() * arr.length) | 0].id]; if (c) this.audio.page(this.panOf(c)); }
      }
    }

    updateChar(id, time, camPos) {
      const c = this.chars[id]; if (!c) return;
      const g = c.group;
      const k = reduceMotion ? 1 : 0.05;
      c.cur.x = lerp(c.cur.x, c.target.x, k); c.cur.z = lerp(c.cur.z, c.target.z, k);
      g.position.x = c.cur.x; g.position.z = c.cur.z;
      const fs = c._fs || { at: 0.6, fa: 0, st: 0, sm: 0.3, ss: 0.6 };
      const speaking = this.curSpeaker === id || (this.speakUntil[id] || 0) > this.simT;
      const seated = this.seatMode === "class" && !this.huddle;

      if (seated) this.behaveSeated(c, fs, speaking, time);
      else this.behaveStanding(c, fs, speaking, time, id);

      // 躯干亮度（注意力）——仅数据层下作为信号；默认轻微
      const ud = g.userData;
      if (ud.torso) { ud.torso.material.transparent = true; ud.torso.material.opacity = this.dataLayer ? clamp(0.7 + fs.at * 0.3, 0.7, 1) : 1; ud.torso.material.emissive && ud.torso.material.emissive.setHex(speaking ? 0x5e3016 : 0x000000); }
      // 脸部五官（真实表情，始终）
      this.updateFace(c, fs, speaking, fs.at < 0.4, time);
      // 头顶 emoji / 文字气泡 —— 只在"数据层"显示
      if (this.dataLayer) {
        this.updateExpr(c, fs, speaking, time);
        if (this.huddle) this.updateWhisper(c, time); else this.updateBubble(c, id, speaking);
      } else {
        if (c.lastExpr) { c.exEl.classList.remove("is-on"); c.exEl.textContent = ""; c.lastExpr = ""; }
        if (c.bubbleEl && c._bubbleTxt) { c.bubbleEl.classList.remove("is-on"); c._bubbleTxt = ""; }
      }
      c._dist = camPos.distanceTo(g.position);
      c.nameEl.classList.toggle("is-live", speaking);
    }

    // —— 站姿行为（立场散布 / 分组 / 分组讨论 等分析视图） ——
    behaveStanding(c, fs, speaking, time, id) {
      const g = c.group, ud = g.userData;
      const huddle = !!this.huddle;
      const distract = fs.at < 0.4 && !huddle;
      let targetYaw;
      if (huddle) { const hc = c._huddleCenter || { x: 0, z: 0 }; targetYaw = Math.atan2(hc.x - g.position.x, hc.z - g.position.z); }
      else {
        let faceX = -3.4, faceZ = -8.6;
        if (this.curSpeaker && this.curSpeaker !== id) { const scc = this.chars[this.curSpeaker]; if (scc) { faceX = scc.cur.x; faceZ = scc.cur.z; } }
        const yaw = Math.atan2(faceX - g.position.x, faceZ - g.position.z);
        targetYaw = distract ? Math.sin(time * 0.3 + c.bob) * 0.8 : yaw;
      }
      g.rotation.x = lerp(g.rotation.x || 0, 0, 0.1);
      g.rotation.y = lerp(g.rotation.y, targetYaw, 0.07);
      const amp = speaking ? 0.06 : 0.02, spd = speaking ? 6 : 1.6;
      if (ud.upper) { ud.upper.position.y = reduceMotion ? 0 : Math.sin(time * spd + c.bob) * amp; ud.upper.rotation.x = lerp(ud.upper.rotation.x || 0, 0, 0.1); }
      this.poseLegs(ud, 0, 0, 0.15);                       // 站立：腿伸直
      if (ud.armR) ud.armR.rotation.z = lerp(ud.armR.rotation.z, speaking ? -2.45 : -0.13, 0.12);
      if (ud.armL) ud.armL.rotation.z = lerp(ud.armL.rotation.z, 0.13, 0.1);
      const scl = speaking ? 1.12 : 1.0;
      g.scale.x += (scl - g.scale.x) * 0.1; g.scale.y = g.scale.x; g.scale.z = g.scale.x;
      if (ud.head) { ud.head.rotation.y = lerp(ud.head.rotation.y, 0, 0.1); ud.head.rotation.x = lerp(ud.head.rotation.x, distract ? 0.5 : 0, 0.08); }
    }
    poseLegs(ud, thigh, shin, k) {
      [ud.legL, ud.legR].forEach((L) => { if (!L) return; L.thighPiv.rotation.x = lerp(L.thighPiv.rotation.x, thigh, k); L.shinPiv.rotation.x = lerp(L.shinPiv.rotation.x, shin, k); });
    }

    // —— 坐姿微动作（真实教室）：看发言者/屏幕、点头、记笔记、迟疑举手、换坐姿 ——
    behaveSeated(c, fs, speaking, time) {
      const g = c.group, ud = g.userData;
      const ph = c.phase;
      // 臀部落到椅面（升降组下沉），腿在髋/膝铰接弯曲成真坐姿；低注意力略塌
      const slump = clamp(1 - fs.at, 0, 1);
      if (ud.upper) ud.upper.position.y = lerp(ud.upper.position.y, -0.46 - slump * 0.04, 0.12);
      this.poseLegs(ud, -1.45, 1.42, 0.15);            // 大腿前伸、小腿垂地
      // 身体基本朝前（讲台 -z = yaw π），易动者偶尔换坐姿微转
      const shift = (c.fidget && !reduceMotion) ? Math.sin(time * 0.12 + ph) * 0.1 : 0;
      g.rotation.y = lerp(g.rotation.y, Math.PI + shift, 0.05);
      g.rotation.x = lerp(g.rotation.x || 0, 0, 0.1);
      if (ud.upper) ud.upper.rotation.x = lerp(ud.upper.rotation.x || 0, speaking ? -0.12 : (slump * 0.06), 0.08); // 发言前倾 / 走神后仰
      // 记笔记：低头 + 前臂小幅书写
      const writing = c.noteTaker && !speaking && fs.at > 0.4 && Math.sin(time * 0.18 + ph) > 0.35;
      // 头：看发言者 / 看屏幕 / 走神乱看 / 低头写
      let hy = 0, hx = 0;
      if (writing) { hx = 0.62; hy = Math.sin(time * 0.5 + ph) * 0.12; }
      else if (speaking) { hx = -0.05; hy = 0; }
      else if (this.curSpeaker && this.curSpeaker !== c.id && fs.at > 0.42) {
        const sp = this.chars[this.curSpeaker];
        if (sp) hy = clamp(Math.atan2(sp.cur.x - g.position.x, sp.cur.z - g.position.z) - Math.PI, -1.25, 1.25);
        // 认同点头
        if (fs.at > 0.6 && Math.sin(time * 1.7 + ph * 3) > 0.86) hx = 0.2;
      } else if (fs.at < 0.4) { hy = Math.sin(time * 0.28 + ph) * 0.8; hx = 0.18; } // 走神：东张西望
      else { hy = Math.sin(time * 0.22 + ph) * 0.25; }                              // 看屏幕方向小幅游移
      if (ud.head) { ud.head.rotation.y = lerp(ud.head.rotation.y, hy, 0.1); ud.head.rotation.x = lerp(ud.head.rotation.x, hx, 0.1); }
      // 右臂：发言举手 / 想说迟疑半举 / 记笔记搭桌 / 常态垂放
      let armZ = -0.13;
      if (speaking) armZ = -2.5;
      else if (fs.sm > 0.8) {                       // 想说没被点 → 半举又犹豫
        const env = Math.max(0, Math.sin(time * 0.22 + ph));      // 缓慢起意
        const trem = (Math.sin(time * 0.9 + ph * 2) + 1) / 2;     // 抖动幅度
        armZ = -0.13 - (1.0 + 0.7 * trem) * env;
      } else if (writing) armZ = -0.55;
      if (ud.armR) ud.armR.rotation.z = lerp(ud.armR.rotation.z, armZ, 0.1);
      if (ud.armL) ud.armL.rotation.z = lerp(ud.armL.rotation.z, writing ? 0.5 : 0.13, 0.1);
      // 发言者略放大（其余复位）
      const scl = speaking ? 1.05 : 1.0;
      g.scale.x += (scl - g.scale.x) * 0.1; g.scale.y = g.scale.x; g.scale.z = g.scale.x;
    }

    updateFace(c, fs, speaking, distract, time) {
      const ud = c.group.userData;
      if (ud.mouth) {
        const open = speaking ? (0.35 + 0.65 * Math.abs(Math.sin(time * 9 + c.bob))) : 0;
        ud.mouth.scale.y = lerp(ud.mouth.scale.y || 1, 1 + open * 3.2, 0.35);
      }
      const anxious = (groupOf(c.id) === "C" && fs.ss < 0.45 && fs.at > 0.4) || fs.fa > 0.62;
      const wants = fs.sm > 0.84 && !anxious && !speaking;
      if (ud.browL) {
        const inner = anxious ? 0.42 : (wants ? -0.22 : 0);   // 内端上扬=担忧 / 下压=跃跃欲试
        ud.browL.rotation.z = lerp(ud.browL.rotation.z, inner, 0.12);
        ud.browR.rotation.z = lerp(ud.browR.rotation.z, -inner, 0.12);
        const by = wants ? 0.2 : 0.16;
        ud.browL.position.y = lerp(ud.browL.position.y, by, 0.12); ud.browR.position.y = lerp(ud.browR.position.y, by, 0.12);
      }
      if (ud.eyeL) {
        const blink = (Math.sin(time * 1.3 + c.bob * 4) > 0.985) ? 0.12 : 1;
        const droop = (distract || fs.fa > 0.6) ? 0.5 : 1;
        const sy = Math.min(blink, droop);
        ud.eyeL.scale.y = lerp(ud.eyeL.scale.y, sy, 0.4); ud.eyeR.scale.y = ud.eyeL.scale.y;
      }
    }

    updateWhisper(c, time) {
      const on = !reduceMotion && Math.sin(time * 0.6 + c.bob * 5) > 0.55;
      if (on) {
        const ph = this._whispers || (this._whispers = ["你怎么看？", "我觉得…", "有道理", "但是…", "记一下", "同意", "再想想"]);
        const txt = ph[Math.floor((c.bob * 1000) % ph.length)];
        if (c._bubbleTxt !== txt) {
          if (!c.bubbleEl) { c.bubbleEl = document.createElement("div"); c.bubbleEl.className = "mv3-bubble"; c.bubbleObj = this._labelObj(c.bubbleEl, 3.9); (c.group.userData.upper||c.group).add(c.bubbleObj); }
          c.bubbleEl.textContent = txt; c.bubbleEl.classList.add("is-on", "is-whisper"); c._bubbleTxt = txt;
        }
      } else if (c.bubbleEl) { c.bubbleEl.classList.remove("is-on"); c._bubbleTxt = ""; }
    }

    // 名牌防遮挡：屏幕空间碰撞，近的/发言的优先显示，被压住的隐藏
    declutterLabels() {
      const T = this.THREE, W = this.stage.clientWidth, H = this.stage.clientHeight || 1;
      const v = new T.Vector3(); const list = [];
      this.MV.STUDENTS.forEach((s) => {
        const c = this.chars[s.id]; if (!c) return;
        v.copy(c.group.position); v.y += 3.05; v.project(this.camera);
        if (v.z > 1) { c.nameEl.style.opacity = 0; return; }
        list.push({ c, sx: (v.x * 0.5 + 0.5) * W, sy: (-v.y * 0.5 + 0.5) * H, w: c.nameEl.textContent.length * 13 + 6, dist: c._dist || 99, speaking: this.curSpeaker === s.id });
      });
      list.sort((a, b) => (b.speaking - a.speaking) || (a.dist - b.dist));
      const placed = [];
      list.forEach((it) => {
        let hidden = false;
        for (const p of placed) { if (Math.abs(it.sx - p.sx) < (it.w + p.w) / 2 && Math.abs(it.sy - p.sy) < 16) { hidden = true; break; } }
        if (hidden && !it.speaking) it.c.nameEl.style.opacity = 0;
        else { it.c.nameEl.style.opacity = clamp(1.4 - it.dist / 36, 0.4, 1); placed.push(it); }
      });
    }

    exprFor(id, fs, speaking) {
      if (speaking) return "💬";
      const grp = groupOf(id);
      if (id === "D4") return "🤒";
      if (fs.at < 0.34) return "💤";
      if (fs.fa > 0.66) return "😮‍💨";
      if (grp === "C" && fs.ss < 0.45 && fs.at > 0.42) return "😟";
      if (fs.sm > 0.84 && /[AB]/.test(grp)) return "✋";
      return "";
    }
    updateExpr(c, fs, speaking, time) {
      let e = this.exprFor(c.id, fs, speaking);
      // 非发言表情错峰闪现，避免整片同时挂满 emoji
      if (e && e !== "💬" && !reduceMotion && Math.sin(time * 0.5 + c.bob * 2.3) < -0.05) e = "";
      if (e !== c.lastExpr) { c.exEl.textContent = e; c.exEl.classList.toggle("is-on", !!e); c.exEl.classList.toggle("is-speak", e === "💬"); c.lastExpr = e; }
    }
    updateBubble(c, id, speaking) {
      if (speaking && this.curSpeaker === id) {
        const beat = [...this.beats].reverse().find((b) => b.role === "S" && b.who === id && this.simT - b.t < 6 && this.simT >= b.t);
        const txt = beat ? (beat.bubble || this.MV.toBubble(beat.text)) : "";
        if (txt && c._bubbleTxt !== txt) {
          if (!c.bubbleEl) { c.bubbleEl = document.createElement("div"); c.bubbleEl.className = "mv3-bubble"; c.bubbleObj = this._labelObj(c.bubbleEl, 4.0); (c.group.userData.upper||c.group).add(c.bubbleObj); }
          c.bubbleEl.textContent = txt; c.bubbleEl.classList.add("is-on"); c._bubbleTxt = txt;
        }
      } else if (c.bubbleEl) { c.bubbleEl.classList.remove("is-on"); c._bubbleTxt = ""; }
    }

    onLiveBeat(b) {
      // 自由仿真新生成一条 beat → 加入 beats 流（供 caption/气泡）
      this.beats.push(b);
    }

    /* ============================================================
     *  交互：控件 / 选取 / 相机
     * ============================================================ */
    bindControls() {
      const $ = (s) => this.mount.querySelector(s);
      this.runBtn = $("#mv3-run");
      this.runBtn.addEventListener("click", () => { if (this.live) this.exitLive(); this.playing = !this.playing; if (this.playing && this.simT >= this.MV.T_CAP) this.applyFrame(0); this.setRunBtn(); });
      $("#mv3-reset").addEventListener("click", () => { this.playing = false; this.applyFrame(0); this.setRunBtn(); });
      $("#mv3-live").addEventListener("click", () => this.toggleLive());
      // 进度条
      const track = $("#mv3-track");
      const seekAt = (clientX) => { const r = track.getBoundingClientRect(); const p = clamp((clientX - r.left) / r.width, 0, 1); if (this.live) this.exitLive(); this.playing = false; this.setRunBtn(); this.applyFrame(p * this.MV.T_CAP); };
      let scrubbing = false;
      track.addEventListener("pointerdown", (e) => { scrubbing = true; track.setPointerCapture(e.pointerId); seekAt(e.clientX); });
      track.addEventListener("pointermove", (e) => { if (scrubbing) seekAt(e.clientX); });
      track.addEventListener("pointerup", () => { scrubbing = false; });
      track.addEventListener("keydown", (e) => { let d = 0; if (e.key === "ArrowLeft") d = -30; if (e.key === "ArrowRight") d = 30; if (d) { this.applyFrame(this.simT + d); e.preventDefault(); } });
      // 教师动作
      this.mount.querySelectorAll("#mv3-teacher .mv3-chip").forEach((b) => b.addEventListener("click", () => this.teacherAct(b.dataset.act, b)));
      // 座位
      $("#mv3-seat").addEventListener("change", (e) => this.setSeatMode(e.target.value));
      // 数据层开关
      this.dataBtn = $("#mv3-data");
      this.dataBtn.addEventListener("click", () => this.toggleDataLayer());
      // 声音开关（点击=用户手势，满足自动播放策略）
      this.sndBtn = $("#mv3-snd");
      this.sndBtn.addEventListener("click", () => { const on = this.audio.toggle(); this.sndBtn.classList.toggle("is-on", on); this.sndBtn.textContent = on ? "🔊 声音" : "🔇 静音"; });
      // 相机预设
      this.mount.querySelectorAll("#mv3-cam button").forEach((b) => b.addEventListener("click", () => {
        this.mount.querySelectorAll("#mv3-cam button").forEach((x) => x.classList.toggle("is-on", x === b));
        this.camPreset(b.dataset.cam);
      }));
    }
    toggleDataLayer(on) {
      this.dataLayer = (on === undefined) ? !this.dataLayer : !!on;
      this.mount.classList.toggle("data-on", this.dataLayer);
      this.mount.classList.toggle("data-off", !this.dataLayer);
      if (this.dataBtn) this.dataBtn.classList.toggle("is-on", this.dataLayer);
    }
    setRunBtn() { if (this.runBtn) this.runBtn.textContent = this.playing ? "⏸ 暂停" : (this.simT >= this.MV.T_CAP ? "↻ 重播" : "▶ 播放录播"); }

    toggleLive() {
      if (this.live) this.exitLive(); else this.enterLive();
    }
    enterLive() {
      this.live = true; this.playing = false;
      this.MV.reset(); this.simT = 132; this.beats = this.MV.beatsUpTo(132);
      this.mount.querySelector("#mv3-teacher").hidden = false;
      this.mount.querySelector("#mv3-live").classList.add("is-on");
      this.mount.querySelector("#mv3-modelbl").textContent = "自由仿真";
      this.mount.querySelector("#mv3-run").disabled = true; this.mount.querySelector("#mv3-run").style.opacity = .4;
      this.setRunBtn();
    }
    exitLive() {
      if (!this.live) return;
      this.live = false;
      if (this.huddle) this.endHuddle();
      if (this.timer) { this.timer.on = false; const tb = this.mount.querySelector("#mv3-timerbadge"); if (tb) tb.hidden = true; }
      this.mount.querySelector("#mv3-teacher").hidden = true;
      this.mount.querySelector("#mv3-live").classList.remove("is-on");
      this.mount.querySelector("#mv3-modelbl").textContent = "录播回放";
      const run = this.mount.querySelector("#mv3-run"); run.disabled = false; run.style.opacity = 1;
      this.bake(); this.applyFrame(this.simT);
    }
    teacherAct(act, btn) {
      const t = this.simT, MV = this.MV;
      if (act === "openq") { MV.teacherOpenQ(t); MV.teacherLine(t, "谁来从这个角度补充一下？"); flash(btn); }
      else if (act === "callc") { MV.teacherCallC(t); MV.teacherLine(t, "我想听听有药企背景的同学——有谁愿意从产业角度说说？"); flash(btn); }
      else if (act === "callsilent") { MV.teacherCallSilent(t); MV.teacherLine(t, "还没出声的同学，谁愿意先说一句你最真实的担心？"); flash(btn); }
      else if (act === "callrandom") {
        const quiet = MV.STUDENTS.filter((s) => /[CD]/.test(s.id[0]));
        const pick = quiet[Math.floor(Math.random() * quiet.length)];
        MV.teacherCallOn(pick.id); MV.teacherLine(t, `${pick.name}，你怎么看？`); this.focusOn(pick.id); flash(btn);
      }
      else if (act === "topic") { this.cycleTopic(); flash(btn); }
      else if (act === "huddle") { this.huddle ? this.endHuddle() : this.startHuddle(); flash(btn); }
      else if (act === "timer") { this.startTimer(300); flash(btn); }
      // 把教师这句立刻反映到 caption
      this.beats = this.beats.concat(MV.beatsUpTo(this.simT).filter((b) => b._teacher && !this.beats.includes(b)));
      this.syncCaptionAndSpeaker();
    }

    /* ---------- 教师动作：切议题 / 分组讨论 / 计时 ---------- */
    cycleTopic() {
      this.topicIdx = (this.topicIdx + 1) % this.topics.length;
      const tp = this.topics[this.topicIdx];
      if (this.boardEl) this.boardEl.innerHTML = `<span>议题</span>${tp.b}<i>${tp.sub}</i>`;
      const name = tp.b.replace(/<[^>]+>/g, "");
      this.MV.teacherLine(this.simT, `我们换个议题——${name}。先各自想 30 秒。`);
    }
    startHuddle() {
      this.huddle = true; this.huddleUntil = this.simT + 60;
      const h = this.mount.querySelector('.mv3-chip[data-act="huddle"]'); if (h) { h.classList.add("is-active"); h.textContent = "结束讨论"; }
      this.MV.teacherLine(this.simT, "好，现在分组讨论 5 分钟，每组推一个代表。");
      this.startTimer(300);
      this.camPreset("top");
      this.mount.querySelectorAll("#mv3-cam button").forEach((x) => x.classList.toggle("is-on", x.dataset.cam === "top"));
      this.layout(false);
    }
    endHuddle() {
      if (!this.huddle) return;
      this.huddle = false;
      const h = this.mount.querySelector('.mv3-chip[data-act="huddle"]'); if (h) { h.classList.remove("is-active"); h.textContent = "分组讨论"; }
      // 收掉耳语气泡
      Object.values(this.chars).forEach((c) => { if (c.bubbleEl) { c.bubbleEl.classList.remove("is-on", "is-whisper"); c._bubbleTxt = ""; } });
      this.MV.teacherLine(this.simT, "时间到，各组代表准备汇报。");
      this.layout(false);
    }
    startTimer(secs) {
      this.timer = { left: secs, total: secs, on: true };
      const b = this.mount.querySelector("#mv3-timerbadge"); if (b) { b.hidden = false; b.classList.remove("is-done"); }
      const st = this.mount.querySelector("#mv3-timer-state"); if (st) st.textContent = "";
      this.updateTimerUI();
    }
    updateTimerUI() {
      const b = this.mount.querySelector("#mv3-timerbadge b"); if (b && this.timer) b.textContent = fmt(this.timer.left);
    }
    timerDone() {
      const b = this.mount.querySelector("#mv3-timerbadge"); if (b) b.classList.add("is-done");
      const st = this.mount.querySelector("#mv3-timer-state"); if (st) st.textContent = " · 时间到";
      if (this.huddle) this.endHuddle();
    }
    setSeatMode(mode) {
      this.seatMode = mode;
      if (mode === "class") { this.ensureFurniture(); this.furniture.visible = true; }
      else if (this.furniture) this.furniture.visible = false;
      ["seat-class", "seat-stance", "seat-group"].forEach((c) => this.mount.classList.remove(c));
      this.mount.classList.add("seat-" + mode);
      const stance = (mode === "stance");
      if (this.zoneL) this.zoneL.visible = stance;
      if (this.zoneR) this.zoneR.visible = stance;
      if (this.midLine) this.midLine.visible = stance;
      if (this.centroidMarker) this.centroidMarker.visible = stance;
      if (mode !== "class") this.toggleDataLayer(true);   // 分析排布自动开数据层
      this.layout(false);
    }
    ensureFurniture() {
      if (this.furniture) return;
      const T = this.THREE;
      const grp = new T.Group();
      const wood = new T.MeshStandardMaterial({ color: "#c2a47a", roughness: 0.85 });
      const woodD = new T.MeshStandardMaterial({ color: "#a98a60", roughness: 0.85 });
      const paper = new T.MeshStandardMaterial({ color: "#f3eee2", roughness: 0.95 });
      const lap = new T.MeshStandardMaterial({ color: "#3d3a34", roughness: 0.5, metalness: 0.3 });
      const metal = new T.MeshStandardMaterial({ color: "#8a8f96", roughness: 0.4, metalness: 0.5 });
      const bookCols = ["#6f2f2a", "#3a4b6b", "#4d6257", "#a8492a", "#b08440"];
      const bagCols = ["#6f2f2a", "#3a4b6b", "#4d6257", "#5b5147", "#7a5a3a", "#33485f"];
      const penCols = ["#d97757", "#3a4b6b", "#2b2620", "#4d6257"];
      const bag = (x, y, z, ry, sc) => {
        const b = new T.Group(); b.position.set(x, y, z); b.rotation.y = ry; b.scale.setScalar(sc || 1);
        const col = bagCols[(Math.random() * bagCols.length) | 0];
        const m = new T.MeshStandardMaterial({ color: col, roughness: 0.92 });
        const body = new T.Mesh(new T.BoxGeometry(0.34, 0.4, 0.2), m); body.castShadow = true; b.add(body);
        const pkt = new T.Mesh(new T.BoxGeometry(0.26, 0.2, 0.08), m); pkt.position.set(0, -0.06, 0.12); b.add(pkt);
        return b;
      };
      const N = this.MV.STUDENTS.length, TOTAL = N + 4;   // 多几张桌 → 个别空座
      for (let i = 0; i < TOTAL; i++) {
        const occupied = i < N;
        const sid = occupied ? this.MV.STUDENTS[i].id : "e" + i;
        const rnd = mulberry32((hashStr(sid) ^ 0x9e3779b9) >>> 0);
        const p = this.seatXZByIndex(i, null);
        const x = p.x, z = p.z, deskZ = z - 0.95;
        // 桌面 + 前挡板 + 四腿
        const top = new T.Mesh(new T.BoxGeometry(1.45, 0.07, 0.7), wood); top.position.set(x, 0.74, deskZ); top.castShadow = true; top.receiveShadow = true; grp.add(top);
        const panel = new T.Mesh(new T.BoxGeometry(1.4, 0.42, 0.05), woodD); panel.position.set(x, 0.5, deskZ - 0.3); grp.add(panel);
        [[-0.65, -0.28], [0.65, -0.28], [-0.65, 0.28], [0.65, 0.28]].forEach(([dx, dz]) => { const lg = new T.Mesh(new T.BoxGeometry(0.05, 0.74, 0.05), woodD); lg.position.set(x + dx, 0.37, deskZ + dz); grp.add(lg); });
        // 椅（成组，轻微转角更"生活化"；空座转得更随意）
        const chair = new T.Group(); chair.position.set(x, 0, z + 0.12); chair.rotation.y = (rnd() - 0.5) * (occupied ? 0.14 : 0.6);
        const seat = new T.Mesh(new T.BoxGeometry(0.56, 0.06, 0.5), woodD); seat.position.y = 0.46; seat.castShadow = true; chair.add(seat);
        const backr = new T.Mesh(new T.BoxGeometry(0.56, 0.46, 0.06), woodD); backr.position.set(0, 0.7, 0.24); chair.add(backr);
        grp.add(chair);
        // 桌面杂物
        const r = rnd();
        if (occupied && r < 0.4) {        // 笔记本/平板
          const base = new T.Mesh(new T.BoxGeometry(0.4, 0.02, 0.28), lap); base.position.set(x + (rnd() - 0.5) * 0.2, 0.785, deskZ + 0.05); grp.add(base);
          const scr = new T.Mesh(new T.BoxGeometry(0.4, 0.26, 0.02), lap); scr.position.set(base.position.x, 0.91, deskZ - 0.08); scr.rotation.x = -0.32; grp.add(scr);
        } else if (r < 0.88) {            // 书 + 纸（散乱）
          const bk = new T.Mesh(new T.BoxGeometry(0.34, 0.05, 0.24), new T.MeshStandardMaterial({ color: bookCols[(rnd() * bookCols.length) | 0], roughness: 0.8 }));
          bk.position.set(x + (rnd() - 0.5) * 0.5, 0.78, deskZ + (rnd() - 0.5) * 0.12); bk.rotation.y = (rnd() - 0.5) * 0.7; grp.add(bk);
          if (rnd() < 0.7) { const pp = new T.Mesh(new T.PlaneGeometry(0.24, 0.32), paper); pp.rotation.x = -Math.PI / 2; pp.position.set(x + (rnd() - 0.5) * 0.55, 0.778, deskZ + 0.18); pp.rotation.z = (rnd() - 0.5) * 0.7; grp.add(pp); }
        }
        if (rnd() < 0.55) {               // 笔
          const pen = new T.Mesh(new T.CylinderGeometry(0.012, 0.012, 0.18, 6), new T.MeshStandardMaterial({ color: penCols[(rnd() * penCols.length) | 0], roughness: 0.5 }));
          pen.rotation.set(0, (rnd() - 0.5) * 1.2, Math.PI / 2); pen.position.set(x + (rnd() - 0.5) * 0.6, 0.79, deskZ + 0.24); grp.add(pen);
        }
        if (occupied && rnd() < 0.4) {     // 水杯
          const cup = new T.Mesh(new T.CylinderGeometry(0.05, 0.045, 0.15, 10), new T.MeshStandardMaterial({ color: "#9fb0c4", roughness: 0.3, metalness: 0.1, transparent: true, opacity: 0.85 }));
          cup.position.set(x + (rnd() < 0.5 ? -0.55 : 0.55), 0.81, deskZ + (rnd() - 0.5) * 0.2); grp.add(cup);
        }
        // 书包：挂椅背 / 放地上 / 空座落椅上
        const bp = rnd();
        if (bp < 0.3) grp.add(bag(x + (rnd() - 0.5) * 0.1, 0.72, z + 0.42, (rnd() - 0.5) * 0.4, 0.95));
        else if (bp < 0.52) grp.add(bag(x + (rnd() < 0.5 ? -0.62 : 0.62), 0.2, z + (rnd() - 0.5) * 0.3, (rnd() - 0.5) * 1.2, 1.0));
        else if (!occupied && bp < 0.82) grp.add(bag(x, 0.56, z + 0.12, (rnd() - 0.5) * 1.5, 0.9));
      }
      // 过道 / 地面零散 + 门边垃圾桶
      grp.add(bag(0.1, 0.2, 6.4, 0.6, 1.1)); grp.add(bag(-0.2, 0.2, 1.6, -0.8, 0.9));
      const bin = new T.Mesh(new T.CylinderGeometry(0.26, 0.22, 0.7, 16), metal); bin.position.set(18.2, 0.35, 8.6); bin.castShadow = true; grp.add(bin);
      this.scene.add(grp); this.furniture = grp;
    }

    bindPicking() {
      const T = this.THREE;
      const ray = new T.Raycaster(); const m = new T.Vector2();
      const dom = this.labelR.domElement;
      let downX = 0, downY = 0;
      dom.addEventListener("pointerdown", (e) => { downX = e.clientX; downY = e.clientY; });
      dom.addEventListener("pointerup", (e) => {
        if (Math.abs(e.clientX - downX) > 5 || Math.abs(e.clientY - downY) > 5) return; // 拖拽不算点选
        const r = dom.getBoundingClientRect();
        m.x = ((e.clientX - r.left) / r.width) * 2 - 1; m.y = -((e.clientY - r.top) / r.height) * 2 + 1;
        ray.setFromCamera(m, this.camera);
        const hits = ray.intersectObjects(this.MV.STUDENTS.map((s) => this.chars[s.id].hit), false);
        if (hits.length) this.focusOn(hits[0].object.userData.id);
        else this.closeInspector();
      });
    }

    focusOn(id) {
      this.focusId = id; const c = this.chars[id]; if (!c) return;
      const p = c.group.position;
      this.camLerpTo(new this.THREE.Vector3(p.x + 4.5, 4.2, p.z + 6.5), new this.THREE.Vector3(p.x, 1.6, p.z));
      this.openInspector(id);
      Object.values(this.chars).forEach((ch) => ch.group.traverse((o) => {}));
    }
    camPreset(which) {
      this.focusId = null; this.closeInspector();
      const V = (x, y, z) => new this.THREE.Vector3(x, y, z);
      // 眼高约 1.7（人视高），允许被桌椅/前排部分遮挡
      if (which === "teacher") this.camLerpTo(V(-3.4, 1.75, -7.2), V(2, 1.45, 4));      // 教师站位（讲台后望全班）
      else if (which === "back") this.camLerpTo(V(0.5, 1.9, 11.5), V(0, 1.4, 3));        // 后排观察（越过人头）
      else if (which === "seat") this.camLerpTo(V(6.8, 1.45, 7.2), V(-1.5, 1.4, 0.5));   // 学生旁听（坐席视角，前排遮挡）
      else if (which === "podium") this.camLerpTo(V(-3.2, 6.6, -8.2), V(0.5, 1.4, 4.5)); // 讲台俯视
      else if (which === "top") this.camLerpTo(V(0.1, 27, 6), V(0, 0, 4));               // 俯瞰（分析）
      else this.camLerpTo(this.camHome.clone(), this.camTarget.clone());                 // 环视
    }
    camLerpTo(pos, tgt) { this._camLerp = { pos, tgt, k: 0 }; }
    stepCamLerp() {
      const L = this._camLerp; L.k = Math.min(1, L.k + (reduceMotion ? 1 : 0.06));
      const e = 1 - Math.pow(1 - L.k, 3);
      this.camera.position.lerp(L.pos, e * 0.18 + 0.04);
      this.controls.target.lerp(L.tgt, e * 0.18 + 0.04);
      if (L.k >= 1 && this.camera.position.distanceTo(L.pos) < 0.3) this._camLerp = null;
    }

    openInspector(id) {
      const s = this.MV.byId[id]; const bk = this.MV.STANCE_BAKED[id]; const a = this.MV.agentOf(id);
      const rt = this.live ? this.MV.rtOf(id) : null; const fs = this.frameState(id);
      const st = rt ? rt.stance_position : fs.st;
      const stance = st > 0.25 ? "支持替代" : st < -0.25 ? "反对替代" : "骑墙/观望";
      const grpName = { A: "政策/医保", B: "患者/家庭", C: "药企背景", D: "观望/被动" }[groupOf(id)];
      const insp = this.mount.querySelector("#mv3-inspector");
      insp.hidden = false;
      insp.innerHTML = `
        <button class="mv3-insp-x" aria-label="关闭">×</button>
        <div class="mv3-insp-h"><b>${s.name}</b><span>${id} · ${grpName}</span></div>
        <div class="mv3-insp-note">${s.note}</div>
        <div class="mv3-insp-stance">
          <div class="mv3-insp-bar"><i style="left:${(st + 1) / 2 * 100}%"></i></div>
          <div class="mv3-insp-srow"><span>反对替代</span><b>${stance} · ${st.toFixed(2)}</b><span>支持替代</span></div>
        </div>
        <div class="mv3-insp-why">${bk ? bk.why : ""}</div>
        ${a && a.persona ? `<div class="mv3-insp-meta">易动度 ${(bk.m).toFixed(2)} · 立场强度 ${(a.persona.stance_strength || 0).toFixed ? a.persona.stance_strength : a.persona.stance_strength}</div>` : ""}
      `;
      insp.querySelector(".mv3-insp-x").addEventListener("click", () => this.closeInspector());
    }
    closeInspector() { const i = this.mount.querySelector("#mv3-inspector"); if (i) i.hidden = true; this.focusId = null; }

    /* ---------- 进度条 / 分析 ---------- */
    buildScrubTicks() {
      const host = this.mount.querySelector("#mv3-ticks"); if (!host) return; host.innerHTML = "";
      this.km.forEach((m) => { const t = document.createElement("span"); t.className = "mv3-tick t-" + m.type; t.style.left = (m.t / this.MV.T_CAP * 100) + "%"; t.title = m.text || ""; host.appendChild(t); });
    }
    updateScrubUI() {
      const p = this.simT / this.MV.T_CAP;
      const fill = this.mount.querySelector("#mv3-fill"); if (fill) fill.style.width = (p * 100) + "%";
      const head = this.mount.querySelector("#mv3-head"); if (head) head.style.left = (p * 100) + "%";
      const cur = this.mount.querySelector("#mv3-cur"); if (cur) cur.textContent = fmt(this.simT);
      const tm = this.mount.querySelector("#mv3-timer"); if (tm) tm.textContent = fmt(this.simT);
      const tr = this.mount.querySelector("#mv3-track"); if (tr) tr.setAttribute("aria-valuenow", Math.round(this.simT));
    }
    updateAnalysis() {
      const MV = this.MV; let spoke = 0, active = 0, silent = 0, quiet = 0;
      MV.STUDENTS.forEach((s) => { if (s.init === "active") active++; else if (s.init === "silent") silent++; else if (s.init === "quiet") quiet++; });
      spoke = active + Math.max(0, Math.round((this.simT / MV.T_CAP) * (silent + 4)));
      const host = this.mount.querySelector("#mv3-analysis");
      host.innerHTML = `
        <div class="mv3-panel">
          <div class="mv3-panel-h">学生画像统计<span>实时</span></div>
          <div class="mv3-stats">
            <div><b id="mv3-st-spoke">14</b><span>已表态 / 32</span></div>
            <div><b>${active}</b><span>主动发声</span></div>
            <div><b>${silent}</b><span>策略性沉默</span></div>
            <div><b>${quiet}</b><span>全程沉默</span></div>
          </div>
        </div>
        <div class="mv3-panel">
          <div class="mv3-panel-h">教学风险信号<span>3 项</span></div>
          <div class="mv3-risk"><i class="rk rk-hi">高</i><b>立场失衡</b>——8 位「药企背景」同学未发声，可能放大集采替代倾向</div>
          <div class="mv3-risk"><i class="rk rk-mid">中</i><b>政策引用断点</b>——B 组讨论引用率仅 1/17，量规未刺激政策引用</div>
          <div class="mv3-risk"><i class="rk rk-lo">低</i><b>讨论时长偏紧</b>——5 分钟对「等机会型」「推举型」画像不友好</div>
        </div>
        <div class="mv3-panel">
          <div class="mv3-panel-h">量规歧义提示<span>2 处</span></div>
          <div class="mv3-risk"><i class="rk rk-r">R-04</i><b>立场迁移度</b>缺可观测锚点；内在调整 / 同伴影响 / 教师触发难区分</div>
          <div class="mv3-risk"><i class="rk rk-r">R-06</i><b>反思深度</b>与「政策引用」维度交叠，可能双计分</div>
        </div>`;
    }

    /* ---------- 对外 hook / 杂项 ---------- */
    seek(t) { this.playing = false; this.applyFrame(t); }
    onTime(cb) { if (typeof cb === "function") { this.timeCbs.push(cb); try { cb(this.simT); } catch (e) {} } }
    fireTime() {
      const spoke = this.mount.querySelector("#mv3-st-spoke");
      if (spoke) spoke.textContent = String(Math.min(32, 14 + Math.round((this.simT - 132) / 130)));
      this.timeCbs.forEach((cb) => { try { cb(this.simT); } catch (e) {} });
    }
    keyMoments() { return this.km; }
    onResize() {
      const W = this.stage.clientWidth, H = this.stage.clientHeight || 520;
      this.camera.aspect = W / H; this.camera.updateProjectionMatrix();
      this.renderer.setSize(W, H); this.labelR.setSize(W, H);
    }
  }

  function flash(btn) { if (!btn) return; btn.classList.add("is-flash"); setTimeout(() => btn.classList.remove("is-flash"), 600); }

  /* ============================================================
   *  声音层（WebAudio 纯合成，无音频文件）
   *  环境底噪 + 远处低语铺底；椅响/翻书一次性；发言定向"语声"。
   *  浏览器自动播放策略：必须用户点击后 enable()。
   * ============================================================ */
  class MVAudio {
    constructor() { this.on = false; this.ctx = null; this.noiseBuf = null; }
    enable() {
      if (this.ctx) { this.ctx.resume(); this.on = true; this._master(); return true; }
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
      let ctx; try { ctx = new AC(); } catch (e) { return false; }
      this.ctx = ctx;
      const master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination); this.masterGain = master;
      // 复用噪声缓冲（棕噪）
      const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = buf.getChannelData(0); let last = 0;
      for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.2; }
      this.noiseBuf = buf;
      // 环境室内底噪
      const amb = ctx.createBufferSource(); amb.buffer = buf; amb.loop = true;
      const ambLP = ctx.createBiquadFilter(); ambLP.type = "lowpass"; ambLP.frequency.value = 380;
      const ambG = ctx.createGain(); ambG.gain.value = 0.06;
      amb.connect(ambLP).connect(ambG).connect(master); amb.start();
      // 远处低语铺底（带通 + 慢 LFO 起伏）
      const mur = ctx.createBufferSource(); mur.buffer = buf; mur.loop = true;
      const murBP = ctx.createBiquadFilter(); murBP.type = "bandpass"; murBP.frequency.value = 680; murBP.Q.value = 0.7;
      const murG = ctx.createGain(); murG.gain.value = 0.05;
      mur.connect(murBP).connect(murG).connect(master); mur.start();
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.11; const lfoG = ctx.createGain(); lfoG.gain.value = 0.03;
      lfo.connect(lfoG).connect(murG.gain); lfo.start();
      this.on = true; this._master(); return true;
    }
    _master() { if (this.masterGain) try { this.masterGain.gain.linearRampToValueAtTime(this.on ? 0.7 : 0.0, this.ctx.currentTime + 0.4); } catch (e) {} }
    toggle() { if (!this.ctx) return this.enable(); this.on = !this.on; if (this.on) this.ctx.resume(); this._master(); return this.on; }
    _pan(p) { if (!this.ctx.createStereoPanner) return null; const n = this.ctx.createStereoPanner(); n.pan.value = clamp(p, -1, 1); return n; }
    _out(node, pan) { const p = this._pan(pan); if (p) { node.connect(p); p.connect(this.masterGain); } else node.connect(this.masterGain); }
    creak(pan) {
      if (!this.on || !this.ctx) return; const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator(); o.type = "sawtooth"; o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(55, t + 0.18);
      const f = this.ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 480;
      const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.1, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      o.connect(f).connect(g); this._out(g, pan); o.start(t); o.stop(t + 0.22);
    }
    page(pan) {
      if (!this.on || !this.ctx) return; const t = this.ctx.currentTime;
      const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
      const f = this.ctx.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 2600;
      const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.05, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
      s.connect(f).connect(g); this._out(g, pan); s.start(t); s.stop(t + 0.17);
    }
    speak(pan, pitch, dur) {
      if (!this.on || !this.ctx) return; const t0 = this.ctx.currentTime;
      const out = this.ctx.createGain(); out.gain.value = 1; this._out(out, pan);
      const syl = Math.max(2, Math.min(16, Math.round((dur || 1.4) / 0.16)));
      for (let i = 0; i < syl; i++) {
        const t = t0 + i * 0.16; const o = this.ctx.createOscillator(); o.type = "triangle";
        const base = pitch * (0.88 + Math.random() * 0.24);
        o.frequency.setValueAtTime(base, t); o.frequency.linearRampToValueAtTime(base * (0.8 + Math.random() * 0.5), t + 0.12);
        const f = this.ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = base * 2.2; f.Q.value = 4;
        const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.08, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
        o.connect(f).connect(g).connect(out); o.start(t); o.stop(t + 0.15);
      }
    }
  }

  /* ============================================================
   *  CSS（品牌排版）
   * ============================================================ */
  function injectCSS() {
    if (document.getElementById("mv3-style")) return;
    const css = `
.mv3-root{display:block;border:1px solid var(--rule,#d8d2bf);border-radius:18px;background:var(--paper,#faf7f0);box-shadow:0 2px 14px rgba(120,90,40,.07);overflow:hidden;}
.mv3-head{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;padding:14px 18px 10px;flex-wrap:wrap;}
.mv3-head h4{margin:0;font:600 var(--fs-xl,22px) var(--serif-cn);color:var(--ink);}
.mv3-head h4 small{display:block;margin-top:3px;font:var(--fs-2xs,12px) var(--mono);color:var(--mute-2);font-weight:400;letter-spacing:.02em;}
.mv3-head-r{display:flex;align-items:center;gap:14px;font:var(--fs-2xs,12px) var(--mono);color:var(--mute-2);}
.mv3-mode{padding:2px 9px;border:1px solid var(--rule-2);border-radius:999px;color:var(--amber-deep);}
.mv3-live{display:inline-flex;align-items:center;gap:6px;color:var(--ink-soft);}
.mv3-live i{width:7px;height:7px;border-radius:50%;background:var(--amber);box-shadow:0 0 0 0 rgba(217,119,87,.6);animation:mv3pulse 2s infinite;}
@keyframes mv3pulse{70%{box-shadow:0 0 0 6px rgba(217,119,87,0);}100%{box-shadow:0 0 0 0 rgba(217,119,87,0);}}
.mv3-stage{position:relative;width:100%;height:540px;background:radial-gradient(120% 90% at 50% 0%, #fbf8f1 0%, #efe8d9 100%);overflow:hidden;cursor:grab;}
.mv3-stage:active{cursor:grabbing;}
.mv3-canvas{display:block;width:100%;height:100%;}
.mv3-labels{position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:4;}
.mv3-labels>*{pointer-events:none;}
.mv3-vignette{position:absolute;inset:0;z-index:2;pointer-events:none;background:radial-gradient(120% 100% at 50% 38%, transparent 52%, rgba(60,40,20,.10) 82%, rgba(40,26,12,.22) 100%);mix-blend-mode:multiply;}
.mv3-timer-badge{position:absolute;top:12px;left:50%;transform:translateX(-50%);z-index:6;font:600 var(--fs-sm) var(--mono);color:var(--ink);background:rgba(255,253,247,.9);border:1px solid var(--rule-2);padding:4px 14px;border-radius:999px;box-shadow:var(--shadow-2);}
.mv3-timer-badge b{color:var(--amber-deep);font:600 var(--fs-md) var(--serif-en);}
.mv3-timer-badge.is-done{background:var(--amber-deep);color:#fff;border-color:var(--amber-deep);}
.mv3-timer-badge.is-done b{color:#fff;}
.mv3-name{font:600 var(--fs-2xs,12px) var(--mono);color:var(--ink);white-space:nowrap;text-shadow:0 1px 3px rgba(250,247,240,.95),0 0 3px rgba(250,247,240,.9);transform:translateY(-2px);}
.mv3-name-A{color:var(--amber-deep);}.mv3-name-B{color:var(--sage);}.mv3-name-C{color:var(--violet);}.mv3-name-D{color:var(--mute);}
.mv3-name-T{color:#fff;background:var(--amber-deep);padding:1px 7px;border-radius:999px;}
.mv3-name-A.mv3-name-A{}
.mv3-name.is-live{color:var(--amber-deep);font-weight:800;}
.mv3-expr{font-size:15px;opacity:0;transform:scale(.6);transition:opacity .25s,transform .25s;filter:drop-shadow(0 2px 3px rgba(0,0,0,.18));}
.mv3-expr.is-on{opacity:1;transform:scale(1);}
.mv3-expr.is-speak{animation:mv3pop .5s ease;}
@keyframes mv3pop{0%{transform:scale(.4);}60%{transform:scale(1.25);}100%{transform:scale(1);}}
.mv3-bubble{background:var(--ink);color:#fff;font:var(--fs-2xs,12px) var(--serif-cn);padding:4px 9px;border-radius:9px 9px 9px 2px;white-space:nowrap;max-width:200px;overflow:hidden;text-overflow:ellipsis;opacity:0;transform:translateY(4px);transition:opacity .2s,transform .2s;box-shadow:0 4px 12px rgba(40,25,10,.25);}
.mv3-bubble.is-on{opacity:1;transform:translateY(0);}
.mv3-bubble.is-whisper{background:rgba(74,67,57,.92);color:#f3efe6;font-size:11px;padding:2px 8px;border-radius:8px 8px 8px 2px;box-shadow:0 2px 7px rgba(40,25,10,.2);}
.mv3-board{text-align:center;font:var(--fs-2xs,12px) var(--mono);color:var(--ink-soft);background:rgba(250,247,240,.0);width:200px;line-height:1.5;}
.mv3-board span{display:block;font-size:10px;color:var(--mute-2);letter-spacing:.18em;}
.mv3-board b{color:var(--amber-deep);}
.mv3-board i{display:block;font:italic var(--fs-2xs,12px) var(--serif-cn);color:var(--mute-2);margin-top:2px;}
.mv3-cam-presets{position:absolute;top:12px;right:14px;z-index:6;display:flex;gap:6px;}
.mv3-cam-presets button{pointer-events:auto;font:var(--fs-2xs,12px) var(--mono);padding:4px 10px;border:1px solid var(--rule-2);background:rgba(255,253,247,.85);color:var(--ink-soft);border-radius:999px;cursor:pointer;backdrop-filter:blur(4px);}
.mv3-cam-presets button.is-on{background:var(--ink);color:#fff;border-color:var(--ink);}
.mv3-axis{position:absolute;top:50%;font:var(--fs-2xs,12px) var(--mono);color:var(--mute-2);z-index:4;pointer-events:none;}
.mv3-axis-l{left:14px;color:var(--sage);}.mv3-axis-r{right:14px;color:var(--amber-deep);}
.mv3-axis-hint{top:auto;bottom:10px;left:50%;transform:translateX(-50%);color:var(--mute-2);background:rgba(250,247,240,.7);padding:2px 10px;border-radius:999px;}
.mv3-centroid-readout{position:absolute;top:12px;left:14px;z-index:5;font:var(--fs-2xs,12px) var(--mono);color:var(--ink);background:rgba(250,247,240,.82);border:1px solid var(--rule-2);padding:3px 10px;border-radius:8px;}
.mv3-centroid-readout b{color:var(--amber-deep);}
.mv3-loading{position:absolute;inset:0;display:grid;place-items:center;font:var(--fs-sm) var(--mono);color:var(--mute-2);}
/* 字幕：贴底、半透明渐变（电影字幕式，不抢戏，露出教室主体） */
.mv3-caption{position:absolute;left:0;right:0;bottom:0;z-index:5;display:flex;align-items:flex-end;gap:8px;padding:22px 18px 11px;background:linear-gradient(to top, rgba(22,20,17,.74), rgba(22,20,17,.34) 55%, rgba(22,20,17,0));color:#f6f1e7;pointer-events:none;opacity:0;transform:translateY(6px);transition:opacity .45s ease,transform .45s ease;}
.mv3-caption.is-on{opacity:1;transform:translateY(0);}
.mv3-cap-ts{font:var(--fs-2xs,12px) var(--mono);color:var(--on-dark-mute,#c5bda9);flex:none;padding-bottom:1px;text-shadow:0 1px 2px rgba(0,0,0,.5);}
.mv3-cap-role{font:600 var(--fs-2xs,12px) var(--serif-cn);padding:1px 8px;border-radius:999px;background:rgba(255,255,255,.18);flex:none;}
.mv3-cap-role.role-T{background:var(--amber-deep);color:#fff;}.mv3-cap-role.role-A{background:var(--ink-2);color:var(--amber-soft);}
.mv3-cap-text{font:var(--fs-sm) var(--serif-cn);line-height:1.4;flex:1;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;text-shadow:0 1px 3px rgba(0,0,0,.6);}
.mv3-inspector{position:absolute;top:46px;right:14px;width:280px;z-index:7;background:rgba(255,253,247,.97);border:1px solid var(--rule-2);border-radius:14px;padding:14px 15px;box-shadow:var(--shadow-3);pointer-events:auto;}
.mv3-insp-x{position:absolute;top:8px;right:10px;border:none;background:none;font-size:20px;color:var(--mute);cursor:pointer;line-height:1;}
.mv3-insp-h{display:flex;align-items:baseline;gap:8px;}
.mv3-insp-h b{font:600 var(--fs-lg) var(--serif-cn);color:var(--ink);}
.mv3-insp-h span{font:var(--fs-2xs,12px) var(--mono);color:var(--mute-2);}
.mv3-insp-note{margin:6px 0 10px;font:var(--fs-xs) var(--serif-cn);color:var(--ink-soft);line-height:1.5;}
.mv3-insp-bar{position:relative;height:6px;border-radius:999px;background:linear-gradient(90deg,rgba(125,148,184,.5),rgba(0,0,0,.08) 50%,rgba(217,154,108,.6));}
.mv3-insp-bar i{position:absolute;top:50%;width:12px;height:12px;border-radius:50%;background:var(--amber-deep);border:2px solid #fff;transform:translate(-50%,-50%);box-shadow:0 1px 4px rgba(0,0,0,.3);}
.mv3-insp-srow{display:flex;justify-content:space-between;align-items:center;margin-top:6px;font:var(--fs-2xs,12px) var(--mono);color:var(--mute-2);}
.mv3-insp-srow b{color:var(--ink);}
.mv3-insp-why{margin-top:9px;font:italic var(--fs-xs) var(--serif-cn);color:var(--mute-2);line-height:1.5;border-left:2px solid var(--amber-soft);padding-left:8px;}
.mv3-insp-meta{margin-top:8px;font:var(--fs-2xs,12px) var(--mono);color:var(--mute-2);}
.mv3-scrub{display:flex;align-items:center;gap:12px;padding:12px 18px 4px;}
.mv3-scrub-time{font:var(--fs-2xs,12px) var(--mono);color:var(--mute-2);white-space:nowrap;}
.mv3-scrub-time b{color:var(--ink);}
.mv3-scrub-track{position:relative;flex:1;height:18px;cursor:pointer;display:flex;align-items:center;}
.mv3-scrub-track::before{content:"";position:absolute;left:0;right:0;height:4px;background:var(--rule-2);border-radius:999px;}
.mv3-scrub-fill{position:absolute;left:0;height:4px;background:var(--amber);border-radius:999px;width:0;}
.mv3-scrub-ticks{position:absolute;inset:0;}
.mv3-tick{position:absolute;top:2px;width:2px;height:14px;background:var(--mute-2);border-radius:1px;transform:translateX(-50%);}
.mv3-tick.t-km{background:var(--amber-deep);height:16px;top:1px;}
.mv3-tick.t-marker{background:var(--sage);}
.mv3-tick.t-silence{background:var(--violet);}
.mv3-tick.t-note{background:var(--gold);}
.mv3-scrub-head{position:absolute;top:50%;width:13px;height:13px;background:#fff;border:2px solid var(--amber-deep);border-radius:50%;transform:translate(-50%,-50%);box-shadow:0 1px 4px rgba(0,0,0,.25);}
.mv3-controls{display:flex;align-items:center;gap:14px;padding:6px 18px 12px;flex-wrap:wrap;}
.mv3-btn{font:600 var(--fs-sm) var(--sans);padding:8px 16px;border-radius:999px;border:1px solid var(--ink);background:var(--ink);color:#fff;cursor:pointer;transition:transform .1s;}
.mv3-btn:active{transform:scale(.96);}
.mv3-btn-ghost{background:transparent;color:var(--ink-soft);border-color:var(--rule-2);}
.mv3-btn-mode{background:transparent;color:var(--amber-deep);border-color:var(--amber);}
.mv3-btn-mode.is-on{background:var(--amber);color:#fff;border-color:var(--amber);}
.mv3-btn-data{background:transparent;color:var(--ink-soft);border-color:var(--rule-2);}
.mv3-btn-data.is-on{background:var(--ink);color:#fff;border-color:var(--ink);}
.mv3-btn-snd{background:transparent;color:var(--ink-soft);border-color:var(--rule-2);}
.mv3-btn-snd.is-on{background:var(--sage);color:#fff;border-color:var(--sage);}
/* —— 数据层：默认隐藏诊断元素，看真实课堂；开启后叠加 —— */
.mv3-root.data-off .mv3-name,.mv3-root.data-off .mv3-expr,.mv3-root.data-off .mv3-bubble,.mv3-root.data-off .mv3-centroid-readout,.mv3-root.data-off .mv3-legend,.mv3-root.data-off .mv3-analysis{display:none !important;}
/* 立场轴标签：仅"立场散布"分析排布下出现 */
.mv3-axis{display:none !important;}
.mv3-root.seat-stance .mv3-axis{display:block !important;}
.mv3-ctrl-teacher{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
.mv3-tlab{font:var(--fs-2xs,12px) var(--mono);color:var(--mute-2);}
.mv3-chip{font:var(--fs-xs) var(--serif-cn);padding:6px 12px;border-radius:999px;border:1px solid var(--amber);background:var(--amber-wash);color:var(--amber-deep);cursor:pointer;}
.mv3-chip:hover{background:var(--amber-soft);}
.mv3-chip.is-flash{animation:mv3flash .6s ease;}
.mv3-chip.is-active{background:var(--amber);color:#fff;border-color:var(--amber);}
@keyframes mv3flash{0%{background:var(--amber);color:#fff;}100%{background:var(--amber-wash);color:var(--amber-deep);}}
.mv3-ctrl-r{margin-left:auto;display:flex;align-items:center;gap:8px;}
.mv3-seatlab{font:var(--fs-2xs,12px) var(--mono);color:var(--mute-2);}
.mv3-select{font:var(--fs-xs) var(--sans);padding:6px 10px;border-radius:8px;border:1px solid var(--rule-2);background:var(--ivory);color:var(--ink);cursor:pointer;}
.mv3-legend{display:flex;align-items:center;gap:14px;padding:0 18px 12px;flex-wrap:wrap;font:var(--fs-2xs,12px) var(--mono);color:var(--mute-2);}
.mv3-legend span{display:inline-flex;align-items:center;gap:5px;}
.mv3-legend i{width:10px;height:10px;border-radius:3px;display:inline-block;}
.mv3-lg-sep{width:1px;height:14px;background:var(--rule-2);}
.mv3-analysis{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;padding:6px 18px 18px;}
.mv3-panel{border:1px solid var(--rule);border-radius:12px;padding:13px 15px;background:var(--ivory);}
.mv3-panel-h{display:flex;justify-content:space-between;align-items:baseline;font:600 var(--fs-sm) var(--serif-cn);color:var(--ink);margin-bottom:10px;}
.mv3-panel-h span{font:var(--fs-2xs,12px) var(--mono);color:var(--amber-deep);}
.mv3-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;text-align:left;}
.mv3-stats b{display:block;font:600 var(--fs-2xl) var(--serif-en);color:var(--ink);line-height:1;}
.mv3-stats span{font:var(--fs-2xs,12px) var(--mono);color:var(--mute-2);}
.mv3-risk{display:flex;align-items:flex-start;gap:8px;font:var(--fs-xs) var(--serif-cn);color:var(--ink-soft);line-height:1.5;padding:5px 0;border-top:1px dashed var(--rule);}
.mv3-risk:first-of-type{border-top:none;}
.mv3-risk b{color:var(--ink);font-weight:600;}
.rk{flex:none;font:var(--fs-2xs,12px) var(--mono);padding:1px 6px;border-radius:5px;}
.rk-hi{background:rgba(168,73,42,.14);color:var(--amber-deep);}
.rk-mid{background:rgba(176,132,64,.16);color:var(--gold-deep);}
.rk-lo{background:rgba(118,113,106,.14);color:var(--mute-2);}
.rk-r{background:rgba(112,82,168,.13);color:var(--violet);}
@media (max-width:760px){
  .mv3-stage{height:62vw;min-height:320px;}
  .mv3-analysis{grid-template-columns:1fr;}
  .mv3-head h4{font-size:var(--fs-lg);}
  /* 字幕：移动端进一步压扁、半透明、省时间戳，第一屏多露教室 */
  .mv3-caption{padding:16px 12px 8px;gap:6px;background:linear-gradient(to top, rgba(22,20,17,.78), rgba(22,20,17,0));}
  .mv3-cap-ts{display:none;}
  .mv3-cap-role{font-size:11px;padding:1px 6px;}
  .mv3-cap-text{font-size:var(--fs-xs);-webkit-line-clamp:2;}
}
`;
    const e = document.createElement("style"); e.id = "mv3-style"; e.textContent = css; document.head.appendChild(e);
  }

  /* ---------- 启动（懒加载：滚动到挂载点附近才构建，消除首屏 ~23s 主线程占用 + CLS） ---------- */
  window.__MV3D_PENDING = true;  // “3D 延迟待命”——供 HTML 兜底区分“延迟”与“真失败/缺席”
  function lazyBoot() {
    const mount = document.getElementById(MOUNT_ID);
    if (!mount) return;
    if (!("IntersectionObserver" in window)) { start(); return; }   // 老浏览器:直接构建
    const io = new IntersectionObserver(function (es) {
      if (es.some(function (e) { return e.isIntersecting; })) { io.disconnect(); start(); }
    }, { rootMargin: "300px 0px" });   // 提前 300px 预载,滚到时已就绪
    io.observe(mount);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", lazyBoot);
  else lazyBoot();
})();
