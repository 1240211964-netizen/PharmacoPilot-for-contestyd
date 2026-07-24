/* ============================================================
   PharmacoPilot · 教学导航 3D 路书 (nav-map-3d) — 实验性游戏化导航层
   ------------------------------------------------------------
   把 9 个教学环节(契约 NAV_STAGES)铺成一条穿过暖纸色地形的盘山路:
   开车沿路行进,站点完成状态实时读 PharmacoPilotStore,靠近站点按
   Enter(或点击站牌)进入 2D 工作台对应环节(nav-detail.html#go=…)。

   设计铁律(与元宇宙教室同款):
   · 纯前端离线运行,Three.js 走本地 vendor importmap,零外部请求;
   · 不复制存储 — 进度只读 Store,判断仍在 2D 工作台里做;
   · WebGL 不可用 → 自动显示 2D 站点清单回退(页内 #nav3d-fallback);
   · 前台叙事恪守"9 个教学环节",station/子节点仅作跳转参数。
   ============================================================ */

const mount = document.getElementById("nav3d-mount");

function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch (e) { return false; }
}

function showFallback(reason) {
  const fb = document.getElementById("nav3d-fallback");
  if (fb) fb.hidden = false;
  if (mount) mount.style.display = "none";
  const hud = document.getElementById("nav3d-hud");
  if (hud) hud.hidden = true;
  console.warn("[nav-map-3d] 回退 2D 清单:", reason);
}

// ---- 契约与进度 ----------------------------------------------------------
const C = window.PharmacoPilotNavigationContract;
const Store = window.PharmacoPilotStore;
if (!C || !C.NAV_STAGES) {
  showFallback("契约未加载");
} else if (!hasWebGL()) {
  showFallback("无 WebGL");
} else {
  boot().catch((e) => showFallback("3D 初始化失败: " + (e && e.message)));
}

function judged(k) {
  if (!Store || !Store.getJudgment) return false;
  return !!(Store.getJudgment(String(k)) || (Number.isFinite(Number(k)) && Store.getJudgment(Number(k))));
}
function stageDone(stage) {
  const subs = (stage.subNodeIds || []).map(String);
  return subs.length > 0 && subs.every(judged);
}
function goUrl(stage) {
  const firstSub = String((stage.subNodeIds || [])[0] || "1");
  const node = C.SUB_NODES[firstSub] || {};
  const st = node.legacyStationId || parseInt(firstSub, 10) || 1;
  return `./nav-detail.html#go=${st}.${encodeURIComponent(firstSub)}`;
}
function subUrl(subKey) {
  const node = C.SUB_NODES[String(subKey)] || {};
  const st = node.legacyStationId || parseInt(subKey, 10) || 1;
  return `./nav-detail.html#go=${st}.${encodeURIComponent(String(subKey))}`;
}

const PHASE_COLOR = { pre: 0xa8492a, in: 0x3a8a4e, post: 0x5a7090 };
const PHASE_CN = { pre: "课前 · 设计", in: "课中 · 调控", post: "课后 · 沉淀" };

// 巡游叙事:每环节一句话(事实均出自契约/payload:32 人前测、45min、锚点 10'/28'/42'、
// 华海·集采案例、38% 误区、5 维量规、S7→S2 反向修订等),开完一圈 = 一节课的全生命周期。
const STAGE_STORY = {
  S1: { time: "开课前 2 周", line: "先摸清起点:32 人前测与经验画像落定,定位卡从 v0 迭代到 v1,学习者议程被正式接进课程设计。" },
  S2: { time: "开课前 10 天", line: "倒着设计:先定学习目标与可接受证据,再校准 5 维 SWOT 量规——这套量规课后还会被 S7 的证据反向修订。" },
  S3: { time: "开课前 1 周", line: "把内容拆成概念边界与误区清单,预埋问题链——前测里 38% 学生的「S 与 T 互斥」误区,就等问题链定点澄清。" },
  S4: { time: "开课前 5 天", line: "华海药业 · 集采常态化的真实案例进场,证据卡与学习者议程逐条对照,课堂有了可辩的真材料。" },
  S5: { time: "开课前 3 天", line: "45 分钟时间线 v0→v1,三个 ZPD 锚点钉在 10' / 28' / 42',协作任务与角色支架就位。" },
  S6: { time: "上课 · 45 分钟", line: "开课。Z1 条文测温、Z2 推演投票、Z3 知识封闭,每个锚点都有一条「如果 X 则 Y」的干预规则待命。" },
  S7: { time: "课后 48 小时", line: "收表现性证据:5 维量规逐人评分汇成能力画像;量规本身的问题,沿虚线通道退回 S2 修订。" },
  S8: { time: "课后 1 周", line: "对照学习者议程逐条兑现,课中触发的干预被复盘成下一轮的改进决策。" },
  S9: { time: "归档 · 面向下一轮", line: "案例 v2、量规 v2、法规日志入库——下一位新教师,从这里出发。" },
};

// ---- 3D 主体 -------------------------------------------------------------
async function boot() {
  const THREE = await import("three");
  const { OrbitControls } = await import("three/addons/controls/OrbitControls.js");
  const { RoomEnvironment } = await import("three/addons/environments/RoomEnvironment.js");
  const { CSS2DRenderer, CSS2DObject } = await import("three/addons/renderers/CSS2DRenderer.js");

  const stages = C.NAV_STAGES;
  const W = () => mount.clientWidth, H = () => mount.clientHeight;

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setSize(W(), H());
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  mount.appendChild(renderer.domElement);

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(W(), H());
  labelRenderer.domElement.style.cssText = "position:absolute;inset:0;pointer-events:none;";
  mount.appendChild(labelRenderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf6efe2);
  scene.fog = new THREE.Fog(0xf6efe2, 60, 190);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.05).texture;

  const camera = new THREE.PerspectiveCamera(52, W() / H(), 0.1, 400);
  camera.position.set(0, 26, 42);

  const sun = new THREE.DirectionalLight(0xfff2dd, 2.6);
  sun.position.set(-38, 55, 28);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -90; sc.right = 90; sc.top = 90; sc.bottom = -90; sc.far = 200;
  scene.add(sun, new THREE.AmbientLight(0xfaf3e3, 0.55));

  // ---- 地形:低多边形起伏(确定性正弦噪声,每次加载一致) ----
  const terrGeo = new THREE.PlaneGeometry(320, 320, 96, 96);
  terrGeo.rotateX(-Math.PI / 2);
  const pos = terrGeo.attributes.position;
  const bump = (x, z) =>
    Math.sin(x * 0.055) * Math.cos(z * 0.047) * 3.4 +
    Math.sin(x * 0.021 + 1.7) * Math.sin(z * 0.026 + 0.6) * 5.2 +
    Math.sin((x + z) * 0.09) * 0.8;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const edge = Math.max(Math.abs(x), Math.abs(z)) / 160;          // 边缘抬高成远山
    pos.setY(i, bump(x, z) * (0.35 + edge * 1.5) - 1.2);
  }
  terrGeo.computeVertexNormals();
  const terrain = new THREE.Mesh(terrGeo, new THREE.MeshStandardMaterial({
    color: 0xe8dfc8, roughness: 1, metalness: 0, flatShading: true,
  }));
  terrain.receiveShadow = true;
  scene.add(terrain);

  // ---- 路线:9 站盘山路(CatmullRom 样条) ----
  const ctrl = [
    [-62, -58], [-40, -30], [-52, 2], [-24, 18], [-30, 48],
    [4, 40], [22, 12], [48, 24], [40, 56], [66, 62],
  ].map(([x, z]) => new THREE.Vector3(x, 0, z));
  const curve = new THREE.CatmullRomCurve3(ctrl, false, "catmullrom", 0.35);
  // 与地形顶点公式完全一致(含边缘抬升系数),否则路会被抬高的地形埋掉
  const groundY = (x, z) => {
    const edge = Math.max(Math.abs(x), Math.abs(z)) / 160;
    return bump(x, z) * (0.35 + edge * 1.5) - 1.2;
  };
  const lift = 0.22;                                                  // 路面略高于地面防 z-fight
  const roadAt = (t) => {
    const p = curve.getPointAt(t);
    p.y = groundY(p.x, p.z) + lift;
    return p;
  };

  // 开路基:把路线两侧地形顶点羽化压平到路面解析高度。
  // 不做这步的话,折面地形的插值误差(顶点间距 ~3.3)会把路面埋进去。
  {
    const samples = [];
    for (let i = 0; i <= 400; i++) {
      const p = curve.getPointAt(i / 400);
      samples.push([p.x, p.z, groundY(p.x, p.z)]);
    }
    const INNER = 3.4, OUTER = 9.5;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      let best = Infinity, by = 0;
      for (let j = 0; j < samples.length; j++) {
        const dx = x - samples[j][0], dz = z - samples[j][1]; // samples 条目为 [x, z, y]
        const d = dx * dx + dz * dz;
        if (d < best) { best = d; by = samples[j][2]; }
      }
      const dist = Math.sqrt(best);
      if (dist < OUTER) {
        const k = Math.min(1, Math.max(0, (dist - INNER) / (OUTER - INNER)));
        const s = k * k * (3 - 2 * k); // smoothstep 羽化
        pos.setY(i, by * (1 - s) + pos.getY(i) * s);
      }
    }
    terrGeo.computeVertexNormals();
  }

  // 路面:沿曲线取左右偏移点拼三角带
  const SEG = 420, HALF_W = 2.6;
  const verts = [], uvs = [], idx = [];
  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG;
    const p = roadAt(t);
    const tan = curve.getTangentAt(t); tan.y = 0; tan.normalize();
    const nrm = new THREE.Vector3(-tan.z, 0, tan.x);
    const l = p.clone().addScaledVector(nrm, HALF_W);
    const r = p.clone().addScaledVector(nrm, -HALF_W);
    l.y = groundY(l.x, l.z) + lift; r.y = groundY(r.x, r.z) + lift;
    verts.push(l.x, l.y, l.z, r.x, r.y, r.z);
    uvs.push(0, t * 60, 1, t * 60);
    if (i < SEG) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const roadGeo = new THREE.BufferGeometry();
  roadGeo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  roadGeo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  roadGeo.setIndex(idx);
  roadGeo.computeVertexNormals();
  const road = new THREE.Mesh(roadGeo, new THREE.MeshStandardMaterial({
    color: 0x6f665a, roughness: 0.95, metalness: 0,
    side: THREE.DoubleSide, // 三角带绕向随曲线方向变化,双面渲染兜底
  }));
  road.receiveShadow = true;
  scene.add(road);

  // 中线虚线:小白条沿路
  const dashMat = new THREE.MeshStandardMaterial({ color: 0xfffdf7, roughness: 0.8 });
  const dashGeo = new THREE.BoxGeometry(0.16, 0.05, 1.1);
  for (let i = 0; i < 150; i++) {
    const t = (i + 0.5) / 150;
    const p = roadAt(t);
    const tan = curve.getTangentAt(t);
    const dash = new THREE.Mesh(dashGeo, dashMat);
    dash.position.copy(p).y += 0.05;
    dash.lookAt(p.clone().add(tan));
    scene.add(dash);
  }

  // 路边点缀:低多边形小树(确定性摆放)
  const treeMat = new THREE.MeshStandardMaterial({ color: 0x7f9469, roughness: 1, flatShading: true });
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8a6b4f, roughness: 1 });
  const coneGeo = new THREE.ConeGeometry(1.3, 3.2, 6);
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.3, 1.1, 5);
  for (let i = 0; i < 46; i++) {
    const t = (i * 37 % 100) / 100;
    const side = i % 2 ? 1 : -1;
    const off = 6 + ((i * 53) % 17);
    const p = roadAt(t);
    const tan = curve.getTangentAt(t); tan.y = 0; tan.normalize();
    const nrm = new THREE.Vector3(-tan.z, 0, tan.x);
    const tp = p.clone().addScaledVector(nrm, side * off);
    if (Math.max(Math.abs(tp.x), Math.abs(tp.z)) > 120) continue;
    tp.y = groundY(tp.x, tp.z);
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, trunkMat); trunk.position.y = 0.55;
    const crown = new THREE.Mesh(coneGeo, treeMat); crown.position.y = 2.5;
    crown.castShadow = true;
    tree.add(trunk, crown);
    tree.position.copy(tp);
    const s = 0.7 + ((i * 29) % 10) / 14;
    tree.scale.setScalar(s);
    scene.add(tree);
  }

  // ---- 9 个站点:路牌 + 状态旗 + CSS2D 标签 ----
  const stations = [];
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.11, 3.1, 8);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x4a4339, roughness: 0.8 });
  const signGeo = new THREE.BoxGeometry(2.3, 1.5, 0.14);
  const ringGeo = new THREE.TorusGeometry(1.7, 0.09, 10, 40);
  const flagGeo = new THREE.BoxGeometry(0.9, 0.55, 0.05);

  stages.forEach((g, i) => {
    const t = 0.045 + (0.91 * i) / (stages.length - 1);
    const p = roadAt(t);
    const tan = curve.getTangentAt(t); tan.y = 0; tan.normalize();
    const nrm = new THREE.Vector3(-tan.z, 0, tan.x);
    const side = i % 2 ? -1 : 1;                                     // 左右交替立牌
    const base = p.clone().addScaledVector(nrm, side * (HALF_W + 1.7));
    base.y = groundY(base.x, base.z);

    const grp = new THREE.Group();
    grp.position.copy(base);
    const color = PHASE_COLOR[g.phase] || 0xa8492a;

    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.y = 1.55; pole.castShadow = true;
    const sign = new THREE.Mesh(signGeo, new THREE.MeshStandardMaterial({
      color, roughness: 0.55, metalness: 0.05,
    }));
    sign.position.y = 3.15; sign.castShadow = true;
    sign.userData.stageIdx = i;

    const ring = new THREE.Mesh(ringGeo, new THREE.MeshStandardMaterial({
      color, roughness: 0.5, emissive: color, emissiveIntensity: 0,
    }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(p).sub(base).setY(p.y - base.y + 0.05);

    const flag = new THREE.Mesh(flagGeo, new THREE.MeshStandardMaterial({ color: 0x3a8a4e, roughness: 0.5 }));
    flag.position.set(0.45, 4.35, 0);
    flag.visible = false;

    grp.add(pole, sign, ring, flag);

    // CSS2D 标签(号码 + 短名 + 状态)
    const el = document.createElement("button");
    el.type = "button";
    el.className = "n3-tag";
    el.dataset.phase = g.phase;
    el.innerHTML = `<b>${String(i + 1).padStart(2, "0")}</b><span></span>`;
    el.addEventListener("click", () => driveTo(i, { openPanel: true }));
    el.style.pointerEvents = "auto";
    const label = new CSS2DObject(el);
    label.position.set(0, 4.9, 0);
    grp.add(label);

    // 产出展卡:车开近才浮现 — 本环节产出物(契约 topCardToKeys)+ Store 沉淀数
    const story = document.createElement("div");
    story.className = "n3-story";
    story.dataset.phase = g.phase;
    const outs = ((C.STAGE_CHAIN[g.id] || {}).topCardToKeys || [])
      .map((k) => `<i>${k}</i>`).join("");
    story.innerHTML = `<em>${(STAGE_STORY[g.id] || {}).time || ""}</em>
      <div class="n3-story-outs">${outs}</div><b class="n3-story-live"></b>`;
    story.addEventListener("click", () => openPanel(i));
    story.style.pointerEvents = "auto";
    const storyObj = new CSS2DObject(story);
    storyObj.position.set(0, 2.15, 0);
    grp.add(storyObj);

    scene.add(grp);
    // 站牌面向路面(世界坐标 lookAt,需先刷新矩阵)
    grp.updateMatrixWorld(true);
    const face = p.clone(); face.y = base.y + 3.15;
    sign.lookAt(face);
    stations.push({ stage: g, t, grp, sign, ring, flag, el, story, done: false, roadPoint: p });
  });

  // ---- L3 产出链:站与站之间的光点弧线(契约 STAGE_CHAIN + 量规反修订通道) ----
  // 只在俯瞰模式显示 — 跟车视角下会遮挡路面,而产出链本来就是"全局结构"信息。
  const chainGroup = new THREE.Group();
  scene.add(chainGroup);
  const packets = [];
  {
    const idxOf = Object.fromEntries(stages.map((g, i) => [g.id, i]));
    const edges = [];
    stages.forEach((g, i) =>
      ((C.STAGE_CHAIN[g.id] || {}).outputsTo || []).forEach((to) => edges.push([i, idxOf[to], false])));
    if (C.RUBRIC_REVISION && idxOf[C.RUBRIC_REVISION.from] !== undefined) {
      edges.push([idxOf[C.RUBRIC_REVISION.from], idxOf[C.RUBRIC_REVISION.to], true]); // S7→S2 反向修订
    }
    edges.forEach(([a, b, rev], ei) => {
      if (b === undefined) return;
      const A = stations[a].grp.position.clone().add(new THREE.Vector3(0, 4.6, 0));
      const B = stations[b].grp.position.clone().add(new THREE.Vector3(0, 4.6, 0));
      const mid = A.clone().lerp(B, 0.5);
      mid.y += A.distanceTo(B) * 0.22 + 5;
      const arc = new THREE.QuadraticBezierCurve3(A, mid, B);
      const color = rev ? 0xa8492a : PHASE_COLOR[stations[a].stage.phase];
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(arc.getPoints(48)),
        new THREE.LineDashedMaterial({
          color, transparent: true,
          dashSize: rev ? 0.7 : 1.6, gapSize: rev ? 0.7 : 0.9, opacity: rev ? 0.9 : 0.45,
        })
      );
      line.computeLineDistances();
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(rev ? 0.3 : 0.36, 10, 10),
        new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.9, roughness: 0.4 })
      );
      chainGroup.add(line, dot);
      packets.push({ arc, dot, speed: rev ? 0.1 : 0.06, off: (ei * 0.137) % 1, rev });
    });
  }
  chainGroup.visible = false;

  // ---- 小车(副驾座驾):低多边形拼装 ----
  const car = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xa8492a, roughness: 0.35, metalness: 0.15 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.5, 2.3), bodyMat);
  body.position.y = 0.55; body.castShadow = true;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.42, 1.15),
    new THREE.MeshStandardMaterial({ color: 0xfaf7f0, roughness: 0.2, metalness: 0.1 }));
  cabin.position.set(0, 0.98, -0.1); cabin.castShadow = true;
  const wheelGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.22, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x2c2620, roughness: 0.9 });
  [[-0.62, 0.75], [0.62, 0.75], [-0.62, -0.8], [0.62, -0.8]].forEach(([x, z]) => {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.position.set(x, 0.28, z);
    car.add(w);
  });
  car.add(body, cabin);
  scene.add(car);

  // ---- 行驶状态机 ----
  let tCar = 0.02, vel = 0, targetT = null;
  let camMode = "chase"; // chase | orbit
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.46;
  controls.enabled = false;

  const keys = {};
  addEventListener("keydown", (e) => {
    if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "].includes(e.key)) e.preventDefault();
    keys[e.key.toLowerCase()] = true;
    // 手动接管方向盘 → 结束巡游
    if (tour && ["arrowleft", "arrowright", "arrowup", "arrowdown", "a", "d", "w", "s"].includes(e.key.toLowerCase())) stopTour();
    if (e.key === "Enter") {
      const near = nearestStation();
      if (near && near.dist < 0.022) openPanel(near.idx);
    }
    if (e.key.toLowerCase() === "v") toggleCam();
    if (e.key.toLowerCase() === "t") (tour ? stopTour() : startTour());
  });
  addEventListener("keyup", (e) => { keys[e.key.toLowerCase()] = false; });

  function nearestStation() {
    let best = null;
    stations.forEach((s, idx) => {
      const d = Math.abs(s.t - tCar);
      if (!best || d < best.dist) best = { idx, dist: d };
    });
    return best;
  }
  function driveTo(idx, opts) {
    closePanel();
    // 减弱动效偏好 / 后台标签(rAF 暂停) / 显式 instant → 瞬移,不做巡航动画
    const instant = (opts && opts.instant) || document.hidden ||
      (matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
    if (instant) {
      tCar = stations[idx].t; vel = 0; targetT = null;
      if (opts && opts.openPanel) openPanel(idx);
      refreshProgress();
      return;
    }
    targetT = stations[idx].t;
    panelPendingIdx = opts && opts.openPanel ? idx : null;
  }
  function toggleCam() {
    camMode = camMode === "chase" ? "orbit" : "chase";
    controls.enabled = camMode === "orbit";
    chainGroup.visible = camMode === "orbit"; // 产出链只在俯瞰显示
    if (camMode === "orbit") {
      camera.position.set(0, 95, 80);
      controls.target.set(0, 0, 8);
    }
    const btn = document.getElementById("n3-cam");
    if (btn) btn.textContent = camMode === "chase" ? "俯瞰全图 · 看产出链" : "跟车视角";
  }
  document.getElementById("n3-cam")?.addEventListener("click", toggleCam);

  // 点击站牌(3D mesh)也可直达
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
  renderer.domElement.addEventListener("click", (e) => {
    const r = renderer.domElement.getBoundingClientRect();
    ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ptr, camera);
    const hit = ray.intersectObjects(stations.map((s) => s.sign), false)[0];
    if (hit) driveTo(hit.object.userData.stageIdx, { openPanel: true });
  });

  // ---- 进度同步 ----
  function refreshProgress() {
    let done = 0;
    const activeIdx = nearestStation()?.idx ?? 0;
    stations.forEach((s, i) => {
      s.done = stageDone(s.stage);
      if (s.done) done++;
      s.flag.visible = s.done;
      s.ring.material.emissiveIntensity = s.done ? 0.55 : (i === activeIdx ? 0.3 : 0);
      const stateCn = s.done ? "✓ 已完成" : "待完成";
      s.el.querySelector("span").textContent = `${s.stage.id} ${stateCn}`;
      s.el.classList.toggle("is-done", s.done);
      const subs = (s.stage.subNodeIds || []).map(String);
      const n = subs.filter(judged).length;
      const live = s.story.querySelector(".n3-story-live");
      if (live) live.textContent = n ? `已沉淀 ${n}/${subs.length} 项判断` : `待沉淀 · ${subs.length} 个子节点`;
      s.story.classList.toggle("is-done", s.done);
    });
    const hudDone = document.getElementById("n3-done");
    if (hudDone) hudDone.textContent = `${done}/9`;
    return done;
  }
  refreshProgress();
  if (Store && Store.on) {
    ["judgment:saved", "judgment:cleared", "progress:changed"].forEach((ev) => {
      try { Store.on(ev, refreshProgress); } catch (e) {}
    });
  }

  // ---- 站点面板 ----
  const panel = document.getElementById("n3-panel");
  let panelPendingIdx = null;
  function openPanel(idx) {
    const s = stations[idx];
    const g = s.stage;
    const subs = (g.subNodeIds || []).map(String);
    const subRows = subs.map((k) => {
      const node = C.SUB_NODES[k] || {};
      const ok = judged(k);
      return `<a class="n3-sub ${ok ? "is-done" : ""}" href="${subUrl(k)}">
        <i>${ok ? "✓" : "○"}</i>${node.subTitle || ("节点 " + k)}</a>`;
    }).join("");
    panel.innerHTML = `
      <button class="n3-x" type="button" aria-label="关闭">×</button>
      <span class="n3-phase" data-phase="${g.phase}">${PHASE_CN[g.phase] || g.phase}</span>
      <h2>${String(idx + 1).padStart(2, "0")} · ${g.title}</h2>
      <div class="n3-subs">${subRows}</div>
      <a class="n3-go" href="${goUrl(g)}">进入该环节工作台 →</a>`;
    panel.hidden = false;
    panel.querySelector(".n3-x").addEventListener("click", closePanel);
    panel.querySelector(".n3-go").focus();
  }
  function closePanel() { if (panel) { panel.hidden = true; panel.innerHTML = ""; } }
  addEventListener("keydown", (e) => { if (e.key === "Escape") closePanel(); });

  // ---- HUD ----
  const hudStage = document.getElementById("n3-stage");
  const hudHint = document.getElementById("n3-hint");

  // ---- 巡游整节课:S1→S9 自动行进,每站停留讲一句本环节的故事 ----
  const captionEl = document.getElementById("n3-caption");
  let tour = null; // { idx, state: 'drive'|'dwell'|'finale', until, reduced }
  function captionShow(html) {
    if (!captionEl) return;
    captionEl.innerHTML = html;
    captionEl.hidden = false;
  }
  function captionHide() { if (captionEl) { captionEl.hidden = true; } }
  function startTour() {
    closePanel();
    if (camMode === "orbit") toggleCam();
    const reduced = document.hidden ||
      (matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
    if (!reduced) tCar = 0;
    vel = 0; targetT = null;
    tour = { idx: 0, state: "drive", until: 0, reduced };
    captionShow("<b>▶ 巡游开始</b> 一节药事管理课的全生命周期,沿 9 个教学环节行进。");
    const btn = document.getElementById("n3-tour");
    if (btn) btn.textContent = "■ 停止巡游";
  }
  function stopTour() {
    tour = null;
    captionHide();
    const btn = document.getElementById("n3-tour");
    if (btn) btn.textContent = "▶ 巡游整节课";
  }
  document.getElementById("n3-tour")?.addEventListener("click", () => (tour ? stopTour() : startTour()));

  // ---- 主循环 ----
  const clock = new THREE.Clock();
  const camPos = new THREE.Vector3();
  function tick() {
    requestAnimationFrame(tick);
    const dt = Math.min(clock.getDelta(), 0.05);

    // 巡游状态机:drive(巡航到当前站) → dwell(停留讲故事) → 下一站 → … → finale
    if (tour) {
      const s = stations[tour.idx];
      if (tour.state === "drive") {
        if (tour.reduced) { tCar = s.t; vel = 0; targetT = null; }
        else targetT = s.t;
        if (Math.abs(tCar - s.t) < 0.002) {
          tour.state = "dwell";
          tour.until = clock.elapsedTime + 3.4;
          const st = STAGE_STORY[s.stage.id] || {};
          captionShow(`<b>${String(tour.idx + 1).padStart(2, "0")} ${s.stage.id} · ${st.time || ""}</b> ${st.line || s.stage.title}`);
        }
      } else if (tour.state === "dwell" && clock.elapsedTime > tour.until) {
        if (tour.idx >= stations.length - 1) {
          tour.state = "finale";
          tour.until = clock.elapsedTime + 4.5;
          captionShow("<b>✓ 全程走完</b> 9 个教学环节 · 一节课的全生命周期。俯瞰全图(V)可见环节间的产出链与 S7→S2 量规回流。");
        } else {
          tour.idx += 1;
          tour.state = "drive";
          captionHide();
        }
      } else if (tour.state === "finale" && clock.elapsedTime > tour.until) {
        stopTour();
      }
    }

    // 驾驶:手动油门 or 自动巡航到目标站
    const MAX = 0.055;
    let accel = 0;
    if (keys["arrowright"] || keys["d"] || keys["arrowup"] || keys["w"]) accel = 1;
    if (keys["arrowleft"] || keys["a"] || keys["arrowdown"] || keys["s"]) accel = -1;
    if (accel !== 0) targetT = null;
    if (targetT !== null) {
      const diff = targetT - tCar;
      if (Math.abs(diff) < 0.0015) {
        vel = 0; tCar = targetT; targetT = null;
        if (panelPendingIdx !== null) { openPanel(panelPendingIdx); panelPendingIdx = null; }
      } else {
        vel = THREE.MathUtils.clamp(diff * 1.6, -MAX, MAX);
      }
    } else {
      vel = accel !== 0
        ? THREE.MathUtils.clamp(vel + accel * dt * 0.09, -MAX, MAX)
        : vel * Math.pow(0.02, dt); // 摩擦滑行
    }
    tCar = THREE.MathUtils.clamp(tCar + vel * dt, 0, 1);

    // 车体位姿
    const p = roadAt(tCar);
    const ahead = roadAt(Math.min(tCar + 0.004, 1));
    car.position.copy(p);
    car.lookAt(ahead.x, p.y, ahead.z);

    // 相机
    if (camMode === "chase") {
      const back = car.position.clone().sub(
        new THREE.Vector3().subVectors(ahead, p).setY(0).normalize().multiplyScalar(11)
      );
      back.y = p.y + 6.5;
      camPos.lerp(back, 1 - Math.pow(0.001, dt));
      camera.position.copy(camPos);
      camera.lookAt(car.position.x, car.position.y + 1.6, car.position.z);
    } else {
      controls.update();
    }

    // HUD:最近站 + 进站提示
    const near = nearestStation();
    if (near && hudStage) {
      const s = stations[near.idx];
      hudStage.textContent = `${String(near.idx + 1).padStart(2, "0")} / 9 · ${s.stage.title}`;
      const inRange = near.dist < 0.022;
      if (hudHint) hudHint.hidden = !inRange;
      s.ring.material.emissiveIntensity = Math.max(
        s.ring.material.emissiveIntensity,
        inRange ? 0.55 + Math.sin(clock.elapsedTime * 5) * 0.25 : 0
      );
    }

    // 产出展卡:跟车视角下,只有临近的站浮现(俯瞰时全部收起防遮挡)
    stations.forEach((s) => {
      const showStory = camMode === "chase" && Math.abs(s.t - tCar) < 0.055;
      s.story.classList.toggle("is-show", showStory);
    });

    // 产出链光点(仅俯瞰可见时驱动)
    if (chainGroup.visible) {
      packets.forEach((p) => {
        const u = (clock.elapsedTime * p.speed + p.off) % 1;
        p.dot.position.copy(p.arc.getPointAt(p.rev ? 1 - u : u));
      });
    }

    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
  }
  camPos.copy(camera.position);
  tick();

  addEventListener("resize", () => {
    camera.aspect = W() / H();
    camera.updateProjectionMatrix();
    renderer.setSize(W(), H());
    labelRenderer.setSize(W(), H());
  });

  // 暴露最小调试接口(与站点其它模块同风格)
  window.PharmacoPilotNavMap = {
    stations: () => stations.map((s) => ({ id: s.stage.id, t: s.t, done: s.done })),
    driveTo, refreshProgress, mode: () => camMode,
  };
  document.getElementById("n3-loading")?.remove();
}
