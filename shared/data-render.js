/* ============================================================
 * data-render.js — 教学数据页 9 个教学环节图谱的数据驱动渲染
 * ------------------------------------------------------------
 * 把原本硬编码在 HTML 里的 9 个教师/学生增量、coupling 强度，
 * 抽到一份 DATA 表里，并把顶部 "累计/本周/单节课" 三个 chip
 * 接成真正可切换的视图。
 *
 * 设计原则：
 *   - 教师 lane / gain + COUPLING 连线 + 学生 5 节点 三层结构
 *   - 初始渲染覆盖 HTML 中的硬编码默认值，作为单一信源
 *   - 后续若接 PharmacoPilotStore，只需替换 DATA 来源
 * ============================================================ */

(function () {
  'use strict';

  /* 9 个教学环节（顺序固定，不随时段变化） */
  const STATIONS = [
    { num: '01', name: '学情诊断' },
    { num: '02', name: '目标与量规' },
    { num: '03', name: '知识与误区' },
    { num: '04', name: '案例与证据' },
    { num: '05', name: '任务链设计' },
    { num: '06', name: '课中调控' },
    { num: '07', name: '评价与画像' },
    { num: '08', name: '复盘与决策' },
    { num: '09', name: '资产沉淀' },
  ];

  /* 数据来源：完全交由 evaluation-framework.js 派生（framework-driven）。
   * 三个时段的 9 个教学环节 lane 值与 coupling 均按 §4 矩阵 + §6 公式计算，
   * 任何修改都从 framework 的 SAMPLE_*_DELTAS 与权重矩阵改起。 */
  const EF = window.PharmacoPilotEvaluationFramework;
  if (!EF) {
    console.warn('[data-render] evaluation-framework not loaded — falling back to last-known dataset');
  }

  const DATA = EF ? {
    cumulative: EF.buildDataset('cumulative'),
    weekly:     EF.buildDataset('weekly'),
    single:     EF.buildDataset('single'),
  } : {
    // Fallback — kept for emergency only; do NOT edit. Edit evaluation-framework.js instead.
    cumulative: { label: '加载中…', teacher: [], student: [], coupling: [], teacherTotal: '—', studentTotal: '—' },
    weekly:     { label: '加载中…', teacher: [], student: [], coupling: [], teacherTotal: '—', studentTotal: '—' },
    single:     { label: '加载中…', teacher: [], student: [], coupling: [], teacherTotal: '—', studentTotal: '—' },
  };

  /* 高度映射：把 cumulative 模式下的最大值锚定为 64%，
   * 其余时段按相同 scale 缩放——视觉上 weekly/single 自然变低，
   * 强化"切换时段后增量缩小"的体感。 */
  const TARGET_MAX_HEIGHT = 64; // %
  const CUMULATIVE_MAX = Math.max(
    ...DATA.cumulative.teacher,
    ...DATA.cumulative.student
  );
  const HEIGHT_SCALE = TARGET_MAX_HEIGHT / CUMULATIVE_MAX;

  /* ---------- 渲染函数 ---------- */

  function fmtDelta(v) {
    if (v == null) return '—';
    return (v > 0 ? '+' : '') + v.toFixed(1);
  }

  function renderLane(laneEl, values, kind /* 't' | 's' */) {
    if (!laneEl) return;
    const gains = laneEl.querySelectorAll('.gain');
    gains.forEach((gain, i) => {
      const v = values[i] ?? 0;
      const st = STATIONS[i];
      const heightPct = Math.max(2, Math.min(100, v * HEIGHT_SCALE));
      const fill = gain.querySelector('.fill');
      const delta = gain.querySelector('.delta');
      if (fill) fill.style.height = heightPct + '%';
      if (delta) delta.textContent = fmtDelta(v);
      gain.title = `${st.num} ${st.name} · ${fmtDelta(v)}`;
      // mark zero/near-zero so we can style them muted if desired
      gain.classList.toggle('is-near-zero', v < 0.15);
    });
  }


  /* ============================================================
   * 双时间轴 v2 · 学生 5 节点 + COUPLING 连线渲染
   * ============================================================ */

  // 学生节点在教师 9 环节坐标系里的"锚定列"（0-8）
  // pre → 第 0 列（env01），post → 第 8 列（env09），inline → anchorEnv 对应列
  function eventEnvCol(ev) {
    if (!ev) return 0;
    const envs = EF.ENVIRONMENTS;
    if (ev.anchor === 'pre') return 0;
    if (ev.anchor === 'post') return envs.length - 1;
    const idx = envs.findIndex(e => e.id === ev.anchorEnv);
    return idx >= 0 ? idx : 0;
  }

  // 渲染 COUPLING 连线：从教师列（上）到学生节点（下）的 Sankey 式 S 形曲线
  // 设计：首尾竖直切线（C x1,H/2 x2,H/2 x2,H）+ 同节点多入线扇形展开 + amber→sage 渐变 + 端点圆点
  function renderCouplingBridge(data) {
    const track = document.getElementById('couplingBridgeTrack');
    if (!track) return;
    const svg = track.querySelector('svg');
    if (!svg) return;
    const bridges = data.bridges || [];
    if (!bridges.length) { svg.innerHTML = ''; return; }

    const envCount = EF.ENVIRONMENTS.length;       // 9
    const W = 900, H = 88;                         // viewBox
    const colW = W / envCount;                     // 100
    const xOf = col => (col + 0.5) * colW;
    const maxStr = Math.max(...bridges.map(b => b.strength), 0.01);
    const cY = (H * 0.5).toFixed(1);

    // 次要（虚线、淡）先画，主 COUPLING（亮）后画压在上层
    const sorted = [...bridges].sort((a, b) => (a.isPrimary ? 1 : 0) - (b.isPrimary ? 1 : 0));

    // 同一学生节点的多条入线，在节点宽度内按来源横坐标排序后均匀扇形展开（避免堆叠交叉）
    const byEvent = {};
    sorted.forEach(b => { (byEvent[b.eventId] = byEvent[b.eventId] || []).push(b); });
    Object.values(byEvent).forEach(group => {
      group.sort((a, b) => xOf(a.envIndex) - xOf(b.envIndex));
      const n = group.length;
      const span = Math.min(46, (n - 1) * 16);
      group.forEach((b, idx) => {
        b._arrivalOffset = (n <= 1) ? 0 : (-span / 2 + (span / (n - 1)) * idx);
      });
    });

    const paths = [];
    const dots = [];
    sorted.forEach(b => {
      const ev = EF.STUDENT_EVENTS.find(e => e.id === b.eventId);
      const x1 = xOf(b.envIndex);
      const x2 = xOf(eventEnvCol(ev)) + (b._arrivalOffset || 0);
      const norm = b.strength / maxStr;
      const d = `M ${x1.toFixed(1)} 0 C ${x1.toFixed(1)} ${cY}, ${x2.toFixed(1)} ${cY}, ${x2.toFixed(1)} ${H}`;
      const tip = `${b.envId} ${EF.ENVIRONMENTS[b.envIndex]?.short || ''} → ${b.eventId} ${ev?.name || ''} · 强度 ${b.strength}${b.isPrimary ? '（主）' : '（次）'}`;
      if (b.isPrimary) {
        const sw = (1.4 + norm * 2.2).toFixed(2);
        const op = (0.5 + norm * 0.35).toFixed(2);
        const r = (1.6 + norm * 1.1).toFixed(2);
        paths.push(`<path class="bridge-path is-primary" d="${d}" stroke="url(#bridgeFlow)" stroke-width="${sw}" opacity="${op}"><title>${escHtml(tip)}</title></path>`);
        dots.push(`<circle class="bridge-endpoint-t" cx="${x1.toFixed(1)}" cy="2.5" r="${r}"/><circle class="bridge-endpoint-s" cx="${x2.toFixed(1)}" cy="${(H - 2.5).toFixed(1)}" r="${r}"/>`);
      } else {
        const sw = (0.8 + norm * 0.6).toFixed(2);
        const op = (0.22 + norm * 0.12).toFixed(2);
        paths.push(`<path class="bridge-path is-secondary" d="${d}" stroke-width="${sw}" opacity="${op}"><title>${escHtml(tip)}</title></path>`);
      }
    });

    const defs = `<defs>
      <linearGradient id="bridgeFlow" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#d97757"/>
        <stop offset="0.55" stop-color="#b08068"/>
        <stop offset="1" stop-color="#4d6257"/>
      </linearGradient>
    </defs>`;
    svg.innerHTML = defs + paths.join('') + dots.join('');
  }

  // 把节点 dims 数组格式化为短标签：全 7 维 → "综合 7 维"（基线 → "7 维基线"），否则 S·S·S
  function fmtNodeDims(ev) {
    const dims = ev.dims || [];
    if (dims.length >= 7) return ev.id === 'EV0' ? '7 维基线' : '综合 7 维';
    return dims.join('·');
  }

  // 渲染学生 5 节点（实测增量 + 实测维度 + 证据等级 + 预测样式 + tooltip）
  function renderStudentEvents(data) {
    const wrap = document.getElementById('studentEvents');
    if (!wrap) return;
    const evData = data.studentEvents || [];
    evData.forEach(ev => {
      const node = wrap.querySelector(`.event-node[data-event="${ev.id}"]`);
      if (!node) return;

      // C 级证据 = 待真课接入 → 视为预测值：加 is-predicted 类，delta 前缀 ≈，避免"最大数字压过最弱证据"
      const isPredicted = ev.evidence === 'C';
      node.classList.toggle('is-predicted', isPredicted);

      const deltaEl = node.querySelector('.node-delta');
      if (deltaEl) {
        if (ev.id === 'EV0') {
          deltaEl.textContent = '基线';
        } else if (ev.delta != null) {
          deltaEl.textContent = (isPredicted ? '≈' : '') + fmtDelta(ev.delta);
        } else {
          deltaEl.textContent = '—';
        }
      }
      // 实测维度标签 — 破"伪轨迹"误读
      const dimsEl = node.querySelector('.node-dims');
      if (dimsEl) dimsEl.textContent = fmtNodeDims(ev);

      const evEl = node.querySelector('.node-evidence');
      if (evEl && ev.evidence) {
        evEl.textContent = ev.evidence;
        evEl.className = 'node-evidence lv-' + ev.evidence;
        evEl.title = `证据等级 ${ev.evidence}` + (isPredicted ? '（待真课接入 · 当前为预测值）' : '');
      }
      const parts = [`${ev.num} ${ev.name}`];
      if (ev.whenLabel) parts.push(ev.whenLabel);
      if (ev.composite != null) parts.push(`综合 ${ev.composite.toFixed(1)}/10`);
      if (ev.delta != null && ev.id !== 'EV0') parts.push(`Δ ${(isPredicted ? '≈' : '') + fmtDelta(ev.delta)}（测 ${fmtNodeDims(ev)}）`);
      node.title = parts.join(' · ');
    });
  }

  function renderTotals(data) {
    // 教师 lane 现在是 atlas-body 里唯一的 .lane
    const teacherSmall = document.querySelector('.bi-atlas-body .lane .lane-id .ll small');
    if (teacherSmall) teacherSmall.textContent = data.teacherTotal + ' 累计';
    // 学生轴改为 5 节点，总分挂在 .student-events 的 events-id 上
    const studentSmall = document.querySelector('.student-events .events-id .ll small');
    if (studentSmall) studentSmall.textContent = data.studentTotal + ' · 5 节点实测';

    const headSub = document.querySelector('.bi-atlas-head .title small');
    if (headSub) headSub.textContent = data.label;
  }

  // Dynamically mark the top-3 hot envs (highest coupling) on station-numbers
  // —— 与 lede 三卡保持一致
  function renderHotMarkers(couplingArr) {
    const cells = document.querySelectorAll('.station-numbers .num-cell');
    if (!cells.length) return;
    cells.forEach(c => c.classList.remove('is-hot'));
    const indexed = couplingArr.map((v, i) => ({ v: v ?? -1, i }));
    indexed.sort((a, b) => b.v - a.v);
    indexed.slice(0, 3).forEach(({ v, i }) => {
      if (v > 0) cells[i]?.classList.add('is-hot');
    });
  }

  // Render data sources block (hero 下方一行 4 卡)
  // 已接入的数据源用普通卡；待接入的（暂无证据）渲染为虚线 CTA 卡
  function renderDataSources() {
    const grid = document.getElementById('evidenceGrid');
    if (!grid || !EF || !EF.DATA_SOURCE_STATUS) return;
    grid.innerHTML = EF.DATA_SOURCE_STATUS.map(src => {
      const isPlaceholder = !src.evidenceLevel;
      if (isPlaceholder) {
        // CTA 占位卡——虚线边框 + 加号 + 引导文案
        return `
          <button type="button" class="ev-card is-cta" data-source-id="${src.id}" aria-label="接入${src.label}">
            <div class="ev-cta-mark">+</div>
            <div class="ev-cta-lab">接入${src.label}</div>
            <div class="ev-cta-hint">${src.status}</div>
          </button>
        `;
      }
      const lvlClass = `is-${src.evidenceLevel}`;
      const lvlText = `${src.evidenceLevel} · ${EF.EVIDENCE_LEVELS[src.evidenceLevel]?.label || ''}`;
      return `
        <div class="ev-card">
          <div class="ev-lab">
            <span>${src.label}</span>
            <span class="ev-status is-${src.statusType}">${src.status}</span>
          </div>
          <div class="ev-sample">${src.sampleCount}</div>
          <div class="ev-lvl ${lvlClass}">${lvlText}</div>
        </div>
      `;
    }).join('');
  }

  function render(mode) {
    const data = DATA[mode];
    if (!data) return;
    // evaluation-contract.js 在 DOMContentLoaded 前已就绪；render() 始终在此之后调用
    const couplingArr = window.PharmacoPilotEvaluationContract?.buildCouplingLane(mode) ?? data.coupling;
    // 教师轴：9 环节 lane（保留）
    const teacherLane = document.querySelector('.bi-atlas-body .lane');
    renderLane(teacherLane, data.teacher, 't');
    // 双时间轴 v2：COUPLING 连线 + 学生 5 节点（取代旧 spine + student lane）
    renderCouplingBridge(data);
    renderStudentEvents(data);
    // hot markers 仍按 9 环节 coupling 标记教师轴 top-3 环节
    renderHotMarkers(couplingArr);
    renderTotals(data);
    renderSummaryRow(mode, data, couplingArr);
  }

  /* ---------- 顶部三张卡（KEEP / FIX / NEXT）数据驱动 ----------
   * 选择规则：
   *  - KEEP = coupling 最大且 ENVIRONMENTS[i].coupling 文案不含 "FIX 信号" 的 env
   *  - FIX  = coupling 文案含 "FIX 信号" 的 env 中耦合最强者；若无则取 coupling 最小但 >0 的 env
   *  - NEXT = 队列里 .queue-item 的真实数量；desc 自动列出涉及的 env num + short name
   * 所有数字、维度名、sparkline 形状都从 dataset 推出，不再硬编码。 */

  function envFixSignalText(envId) {
    return EF?.ENV_EVIDENCE?.[envId]?.coupling || '';
  }
  function isCoEnv(envId) {
    return EF?.getEnvCoCategory?.(envId) === 'co';
  }
  // KEEP: 师生共在 (co) 池中 coupling 最大、且无 FIX 信号者
  function pickKeepEnv(coupling) {
    if (!EF) return null;
    const envs = EF.ENVIRONMENTS;
    let bestIdx = -1, bestVal = -Infinity;
    coupling.forEach((c, i) => {
      if (c == null) return;
      if (!isCoEnv(envs[i].id)) return;
      if (envFixSignalText(envs[i].id).includes('FIX 信号')) return;
      if (c > bestVal) { bestVal = c; bestIdx = i; }
    });
    return bestIdx >= 0 ? bestIdx : null;
  }
  // FIX: 师生共在 (co) 池中带 FIX 信号且 coupling 最大者
  function pickFixEnv(coupling) {
    if (!EF) return null;
    const envs = EF.ENVIRONMENTS;
    let bestIdx = -1, bestVal = -Infinity;
    coupling.forEach((c, i) => {
      if (c == null) return;
      if (!isCoEnv(envs[i].id)) return;
      if (!envFixSignalText(envs[i].id).includes('FIX 信号')) return;
      if (c > bestVal) { bestVal = c; bestIdx = i; }
    });
    return bestIdx >= 0 ? bestIdx : null;
  }
  // 副信号 · 教师 design 最佳：solo 池里 teacher 增量最大者（不算 coupling）
  // 用于 KEEP 卡的次行 chip——告诉用户"师生共在之外、教师独立改动里最值得保留的是哪一项"
  function pickSoloDesignBest(teacherLane, exclFix = true) {
    if (!EF || !teacherLane) return null;
    const envs = EF.ENVIRONMENTS;
    let bestIdx = -1, bestVal = -Infinity;
    teacherLane.forEach((v, i) => {
      if (v == null || v <= 0) return;
      if (isCoEnv(envs[i].id)) return;
      if (exclFix && envFixSignalText(envs[i].id).includes('FIX 信号')) return;
      if (v > bestVal) { bestVal = v; bestIdx = i; }
    });
    return bestIdx >= 0 ? bestIdx : null;
  }
  // 副信号 · 教师独立 FIX：solo 池里带 FIX 信号且 teacher 增量最大者（如 E08 复盘）
  function pickSoloFixBest(teacherLane) {
    if (!EF || !teacherLane) return null;
    const envs = EF.ENVIRONMENTS;
    let bestIdx = -1, bestVal = -Infinity;
    teacherLane.forEach((v, i) => {
      if (v == null || v <= 0) return;
      if (isCoEnv(envs[i].id)) return;
      if (!envFixSignalText(envs[i].id).includes('FIX 信号')) return;
      if (v > bestVal) { bestVal = v; bestIdx = i; }
    });
    return bestIdx >= 0 ? bestIdx : null;
  }

  function topDimContribution(dimDeltas, matrix, dimsCatalog) {
    if (!dimDeltas || !matrix) return null;
    let bestId = null, bestScore = -Infinity;
    for (const id in matrix) {
      const w = matrix[id];
      const v = dimDeltas[id] ?? 0;
      const s = w * v;
      if (s > bestScore) { bestScore = s; bestId = id; }
    }
    if (!bestId) return null;
    const meta = dimsCatalog.find(d => d.id === bestId);
    return { id: bestId, short: meta?.short || bestId, delta: dimDeltas[bestId] ?? 0 };
  }

  function buildSparkPoints(envIdx, allValues, direction /* 'up' | 'down' */) {
    // 把单 env 的当前增量值转成 7 周趋势的 11 个 polyline 点。
    // 视觉对齐：与原硬编码同样的 viewBox 0 0 200 36，y 范围 6–30。
    // 大小：取该 env 增量占全部 envs 最大值的比例，决定终点高度。
    const v = Math.max(0, allValues[envIdx] ?? 0);
    const maxV = Math.max(...allValues.filter(x => x != null), 0.1);
    const ratio = Math.min(1, v / maxV);
    // 起点固定 30（底）/ 终点按 ratio 抬到 6（顶）；FIX 卡反向：起点 6，终点 30。
    const yStart = direction === 'down' ? 6  : 30 - 24 * ratio;
    const yEnd   = direction === 'down' ? 6 + 24 * ratio : 30 - 24 * ratio - (24 * ratio === 0 ? 0 : 0);
    // 实际上让趋势线"平滑上升/下降"：起点和终点跨度等于 24 * ratio
    const yA = direction === 'down' ? 6 : 30;
    const yB = direction === 'down' ? 6 + 24 * ratio : 30 - 24 * ratio;
    const N = 11;
    const xs = Array.from({ length: N }, (_, i) => i * 20);
    const ys = xs.map((_, i) => {
      const t = i / (N - 1);
      // 轻微缓动，避免完全直线：0.85 t + 0.15 sin
      const eased = 0.85 * t + 0.15 * Math.sin(t * Math.PI);
      return yA + (yB - yA) * eased;
    });
    const linePts = xs.map((x, i) => `${x},${ys[i].toFixed(1)}`).join(' ');
    const areaPts = `M${linePts.replace(/ /g, ' L')} L200,36 L0,36 Z`;
    return { linePts, areaPath: areaPts };
  }

  function setSlot(root, slot, value) {
    const el = root.querySelector(`[data-slot="${slot}"]`);
    if (el) el.textContent = value;
  }
  function setSpark(root, linePts, areaPath, label) {
    const line = root.querySelector('[data-slot="spark-line"]');
    const area = root.querySelector('[data-slot="spark-area"]');
    const title = root.querySelector('[data-slot="spark-title"]');
    const svg = root.querySelector('[data-slot="spark"]');
    if (line) line.setAttribute('points', linePts);
    if (area) area.setAttribute('d', areaPath);
    if (title) title.textContent = label;
    if (svg) svg.setAttribute('aria-label', label);
  }
  function setChips(root, chipHtmls) {
    const wrap = root.querySelector('[data-slot="chips"]');
    if (!wrap) return;
    wrap.innerHTML = chipHtmls.join('');
  }

  function renderSummaryRow(mode, data, _spineCouplingArr) {
    if (!EF) return;
    const row = document.querySelector('[data-summary-row]');
    if (!row) return;
    const envs = EF.ENVIRONMENTS;
    // 用 active getter 取数（LIVE 覆盖 SAMPLE），而不是直接读 SAMPLE
    const teacherDeltas = EF.getActiveTeacherDeltas?.(mode) || EF.SAMPLE_TEACHER_DELTAS[mode] || {};
    const studentDeltas = EF.getActiveStudentDeltas?.(mode) || EF.SAMPLE_STUDENT_DELTAS[mode] || {};
    // 摘要卡用 framework 派生的 coupling（随 LIVE 数据动），
    // 而非 contract 的 rubric-based couplingArr（静态 sample）。
    const couplingArr = data.coupling || _spineCouplingArr || [];

    // KEEP — 师生共在 (co) 池
    const keepRoot = row.querySelector('[data-summary-role="keep"]');
    const keepIdx = pickKeepEnv(couplingArr);
    if (keepRoot && keepIdx != null) {
      const env = envs[keepIdx];
      const tTop = topDimContribution(teacherDeltas, EF.TEACHER_MATRIX[env.id], EF.TEACHER_DIMS);
      const sTop = topDimContribution(studentDeltas, EF.STUDENT_MATRIX[env.id], EF.STUDENT_DIMS);
      setSlot(keepRoot, 'num', env.num);
      setSlot(keepRoot, 'name', env.short);
      const tBit = tTop ? `教师 ${tTop.id} ↑${tTop.delta.toFixed(1)}` : null;
      const sBit = sTop ? `学生 ${sTop.id} ↑${sTop.delta.toFixed(1)}` : null;
      const desc = [tBit, sBit].filter(Boolean).join(' · ') + ` · COUPLING ${couplingArr[keepIdx].toFixed(1)} 师生共在`;
      setSlot(keepRoot, 'desc', desc);
      const sp = buildSparkPoints(keepIdx, couplingArr, 'up');
      setSpark(keepRoot, sp.linePts, sp.areaPath, `7 周趋势：${env.num} ${env.short} 持续上扬（师生共在）`);
      const chips = [];
      if (tTop) chips.push(`<span class="basis-chip">${tTop.short} <small>${tTop.id} 教师维度</small></span>`);
      if (sTop) chips.push(`<span class="basis-chip">${sTop.short} <small>${sTop.id} 学生维度</small></span>`);
      chips.push(`<span class="basis-chip is-coupling">COUPLING ${couplingArr[keepIdx].toFixed(1)} <small>师生共在 · ${data.label || mode}</small></span>`);
      // 副信号：教师独立改动里最值得保留的（solo 池 teacher delta top）
      const soloIdx = pickSoloDesignBest(data.teacher, true);
      if (soloIdx != null) {
        const soloEnv = envs[soloIdx];
        const soloVal = data.teacher[soloIdx];
        chips.push(`<span class="basis-chip is-solo-aside">同期教师独立 · <b>${soloEnv.num} ${soloEnv.short}</b> ↑${soloVal.toFixed(1)} <small>延迟相关</small></span>`);
      }
      setChips(keepRoot, chips);
    }

    // FIX — 师生共在 (co) 池
    const fixRoot = row.querySelector('[data-summary-role="fix"]');
    const fixIdx = pickFixEnv(couplingArr);
    if (fixRoot && fixIdx != null) {
      const env = envs[fixIdx];
      const tTop = topDimContribution(teacherDeltas, EF.TEACHER_MATRIX[env.id], EF.TEACHER_DIMS);
      const sTop = topDimContribution(studentDeltas, EF.STUDENT_MATRIX[env.id], EF.STUDENT_DIMS);
      setSlot(fixRoot, 'num', env.num);
      setSlot(fixRoot, 'name', env.short);
      const issueBits = [];
      if (tTop) issueBits.push(`${tTop.short}虽 ↑${tTop.delta.toFixed(1)}`);
      if (sTop) issueBits.push(`${sTop.short} ${sTop.id} 增幅可能被遮蔽`);
      issueBits.push(`COUPLING ${couplingArr[fixIdx].toFixed(1)} 本轮最强但量规存在歧义`);
      setSlot(fixRoot, 'desc', issueBits.join(' · '));
      const sp = buildSparkPoints(fixIdx, couplingArr, 'down');
      setSpark(fixRoot, sp.linePts, sp.areaPath, `7 周趋势：${env.num} ${env.short} 量规歧义未解（师生共在）`);
      const chips = [];
      if (tTop) chips.push(`<span class="basis-chip">${tTop.short} <small>${tTop.id} 教师维度</small></span>`);
      if (sTop) chips.push(`<span class="basis-chip">${sTop.short} <small>${sTop.id} 学生维度</small></span>`);
      chips.push(`<span class="basis-chip is-coupling">COUPLING ${couplingArr[fixIdx].toFixed(1)} <small>师生共在 · 量规歧义</small></span>`);
      // 副信号：教师独立带 FIX 信号的环节（如 E08 复盘量规）
      const soloFixIdx = pickSoloFixBest(data.teacher);
      if (soloFixIdx != null) {
        const sEnv = envs[soloFixIdx];
        const sVal = data.teacher[soloFixIdx];
        chips.push(`<span class="basis-chip is-solo-aside">同期教师独立 · <b>${sEnv.num} ${sEnv.short}</b> ↑${sVal.toFixed(1)} <small>延迟相关 · FIX</small></span>`);
      } else {
        chips.push(`<span class="basis-chip">量规歧义建议修正 <small>Biggs 1996</small></span>`);
      }
      setChips(fixRoot, chips);
    }

    // NEXT — 由 .queue-item 实际数量驱动；desc 列出 KEEP/FIX 涉及的 env
    const nextRoot = row.querySelector('[data-summary-role="next"]');
    if (nextRoot) {
      const queueItems = document.querySelectorAll('.queue-list .queue-item');
      const count = queueItems.length || 0;
      setSlot(nextRoot, 'count', String(count));
      // desc 从 queue 第一字段"写回位置"里抓 env num/short，找不到就用 KEEP/FIX 兜底
      const targets = [];
      queueItems.forEach(item => {
        const envChip = item.querySelector('.queue-field .env');
        if (envChip) {
          const num = envChip.textContent.trim();
          const e = envs.find(x => x.num === num);
          if (e && !targets.find(t => t.num === e.num)) targets.push(e);
        }
      });
      if (!targets.length) {
        if (keepIdx != null) targets.push(envs[keepIdx]);
        if (fixIdx != null && fixIdx !== keepIdx) targets.push(envs[fixIdx]);
      }
      const desc = targets.length
        ? '写回 ' + targets.map(e => `${e.num} ${e.short}`).join(' · ')
        : '暂无待写回建议';
      setSlot(nextRoot, 'desc', desc);
    }
  }

  /* ---------- 交互绑定 ---------- */

  const MODES = ['cumulative', 'weekly', 'single'];

  function bindToggles() {
    const chips = document.querySelectorAll('.bi-atlas-head .toggle-chip');
    if (!chips.length) return;

    chips.forEach((chip, i) => {
      const mode = MODES[i] || 'cumulative';
      chip.dataset.mode = mode;
      chip.setAttribute('role', 'button');
      chip.setAttribute('tabindex', '0');
      chip.setAttribute('aria-pressed', chip.classList.contains('is-active') ? 'true' : 'false');

      const activate = () => {
        chips.forEach(c => {
          c.classList.remove('is-active');
          c.setAttribute('aria-pressed', 'false');
        });
        chip.classList.add('is-active');
        chip.setAttribute('aria-pressed', 'true');
        render(mode);
      };
      chip.addEventListener('click', activate);
      chip.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          activate();
        }
      });
    });
  }

  /* ---------- 评价框架公开面板 ---------- */
  function escHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
    })[c]);
  }
  function refsHtml(refs) {
    return `<ul class="fp-refs">${refs.map(r =>
      `<li><b>${escHtml(r.cite)}</b>${escHtml(r.note)}</li>`
    ).join('')}</ul>`;
  }
  function renderFrameworkPanel() {
    const host = document.getElementById('frameworkBody');
    if (!host || !EF) return;
    const tDimsTxt = EF.TEACHER_DIMS.map(d => `<b>T${d.id.slice(1)}</b>${escHtml(d.short)}`).join(' / ');
    const sDimsTxt = EF.STUDENT_DIMS.map(d => `<b>S${d.id.slice(1)}</b>${escHtml(d.short)}`).join(' / ');
    const sourcesHtml = Object.entries(EF.DATA_SOURCES).map(([dimId, sources]) => {
      const dim = [...EF.TEACHER_DIMS, ...EF.STUDENT_DIMS].find(d => d.id === dimId);
      return `<li><b>${escHtml(dimId)}</b>${escHtml(dim ? dim.short : dimId)} ← ${escHtml(sources.join(' · '))}</li>`;
    }).join('');
    host.innerHTML = `
      <div class="fp-section">
        <h5>§ 1 量程 · SCALE<small>${escHtml(EF.SCALE.name)}</small></h5>
        <p>每维度 <code>0–${EF.SCALE.perDimension.max}</code> 分；维度 Δ 如 <b>+5.7</b> = 该维度从基线到当前涨了 5.7 分。环节 Δ 如 <b>+4.7</b> = 该环节涉及的多维加权平均（见 §4）。Hero 的教师百分比 = 教师 8 维合计涨幅 / 80 满分 × 100%。</p>
        ${refsHtml(EF.SCALE.refs)}
      </div>

      <div class="fp-section is-full">
        <h5>§ 3B 双时间轴 · DUAL TIMELINE<small>教师 9 环节（过程）× 学生 5 节点（结果）</small></h5>
        <p><b>为什么不同列对齐</b>：教师轴是过程性的（描述教师在每个环节做什么），学生能力是结果性的、螺旋上升的——并不沿教学环节平均产生。课前 01-05 是教师独立设计环节（<code>co: solo</code>），学生不在场，按列伪造学生增量在认识论上站不住脚。故学生轴折叠为 <b>5 个产出节点</b>：</p>
        <p style="margin-top:6px;font-size:11.5px;color:var(--mute);">${(EF.STUDENT_EVENTS||[]).map(e => `<b>${escHtml(e.num)}</b>${escHtml(e.name)} <i>(${escHtml(e.whenLabel||'')})</i>`).join(' → ')}</p>
        <p style="margin-top:6px;"><b>注意</b>：每个节点测的是<b>不同维度子集</b>（如 E1 测 S3·S6·S2、E3 测 S7·S1），是不同时点的<b>能力切面</b>，<b>不是同一条能力曲线</b>——故节点数字横向不可直接比大小；E4 为综合 7 维后测。</p>
        <p style="margin-top:6px;">两轴节奏不同，通过 COUPLING 连线（§6）在交汇点连接，而非强行同列。</p>
      </div>

      <div class="fp-section is-full">
        <h5>§ 6 COUPLING 公式 · 双时间轴版</h5>
        <p><span class="fp-formula">COUPLING(env<sub>i</sub> → event<sub>j</sub>) = √(T<sub>Δ</sub> × Event<sub>Δ</sub>) × pathStrength(i,j) × decay(Δt) × syncCoef</span></p>
        <p>不再是"同列同步耦合"，而是 <b>N 条 COUPLING 连线</b>：每个教师环节通过 <code>ENV_TO_EVENT</code> 表里的关联路径连到一个学生节点（主路径）+ 可选次路径。<b>pathStrength</b> = 环节-节点的语义距离先验；<b>decay</b> = 教师行为到学生证据出现的时间衰减。例：教师 03 知识设计 → 学生 E1 课中表现（主）+ E2 评价画像（次）。</p>
        <p style="margin-top:6px;">量规侧（X1-X5）的等价计算：<span class="fp-formula">COUPLING(env) = mean(Xi) × evidenceCoef × x1GlobalCoef</span>，X1 全局折扣（目标—任务—评价一致性，0→0.50 / 4→1.00）。阈值 ≥ <b>1.5</b> 视为显著耦合（连线加粗）。</p>
        ${refsHtml(EF.COUPLING_REFS)}
      </div>

      <div class="fp-section is-full">
        <h5>§ 4 教学环节 × 维度 加权矩阵<small>列 = 9 个教学环节，行 = 教师 8 维 / 学生 7 维</small></h5>
        <p><b>权重</b>：1.0 = 主驱动维度（×）/ 0.4 = 次要参与维度（·）/ 0 = 该环节不评估该维度。</p>
        <p style="margin-top:6px;"><b>读法举例</b>：教师在 04 案例与证据 的得分 = (1.0 × T3 情境转译 Δ + 0.4 × T4 问题链设计 Δ) / 1.4，归一化到 10 分制。学生 7 维则按 5 节点的实测分数聚合（不再按环节切片）。</p>
        <p style="margin-top:6px;font-size:11.5px;color:var(--mute);"><b>教师 8 维</b>：${tDimsTxt}</p>
        <p style="font-size:11.5px;color:var(--mute);"><b>学生 7 维</b>：${sDimsTxt}</p>
        ${refsHtml(EF.MATRIX_REFS)}
      </div>

      <div class="fp-section is-full">
        <h5>§ 8 数据来源 · DATA SOURCE<small>12 维各自的原始信号</small></h5>
        <ul class="fp-sources">${sourcesHtml}</ul>
      </div>

      <div class="fp-section is-full">
        <h5>§ 7 时段基线 · BASELINE</h5>
        <p><b>累计</b>：${escHtml(EF.BASELINES.cumulative.detail)}（${EF.BASELINES.cumulative.sessionCount} 次模拟）</p>
        <p><b>本周</b>：${escHtml(EF.BASELINES.weekly.detail)}（${EF.BASELINES.weekly.sessionCount} 次）</p>
        <p><b>单节课</b>：${escHtml(EF.BASELINES.single.detail)}</p>
      </div>
    `;
  }

  /* ---------- Environment Evidence Drawer ---------- */
  // 点击 atlas 任意列元素 → 右侧滑出该环节的证据抽屉
  function openEnvDrawer(envIdx) {
    if (!EF) return;
    const env = EF.ENVIRONMENTS[envIdx];
    if (!env) return;
    const evidence = EF.ENV_EVIDENCE?.[env.id];

    // Latest data for the active mode
    const activeMode = document.querySelector('.toggle-chip.is-active')?.dataset.mode || 'cumulative';
    const data = DATA[activeMode];
    const tVal = data?.teacher?.[envIdx];
    const sVal = data?.student?.[envIdx];
    const cVal = data?.coupling?.[envIdx];

    const phaseEl = document.getElementById('envDrawerPhase');
    const titleEl = document.getElementById('envDrawerTitle');
    const couplingEl = document.getElementById('envDrawerCoupling');
    const bodyEl = document.getElementById('envDrawerBody');
    const actionEl = document.getElementById('envDrawerAction');
    const backdrop = document.getElementById('envDrawerBackdrop');
    const drawer = document.getElementById('envDrawer');
    if (!drawer || !backdrop) return;

    if (phaseEl) {
      phaseEl.textContent = { pre: '课前', in: '课中', post: '课后' }[env.phase] || '';
      phaseEl.className = 'ed-phase is-' + env.phase;
    }
    if (titleEl) {
      titleEl.innerHTML = `<span class="num">${env.num}</span>${env.name}`;
    }
    if (couplingEl) {
      const couplingTxt = cVal == null ? '— · 无显著耦合'
        : (cVal >= 1.5 ? `★ COUPLING ${cVal} · 显著耦合` : `COUPLING ${cVal}`);
      couplingEl.textContent = couplingTxt;
    }

    // 上一/下一 环节 nav 状态
    const posEl = document.getElementById('envDrawerPos');
    const prevBtn = document.getElementById('envDrawerPrev');
    const nextBtn = document.getElementById('envDrawerNext');
    const total = EF.ENVIRONMENTS.length;
    if (posEl) posEl.textContent = `${envIdx + 1} / ${total}`;
    if (prevBtn) prevBtn.disabled = envIdx === 0;
    if (nextBtn) nextBtn.disabled = envIdx === total - 1;
    // 记下当前 idx 供 prev/next 使用
    drawer.dataset.currentIdx = envIdx;
    if (actionEl) {
      actionEl.textContent = `→ 进入教学实践重跑 ${env.num} ${env.short}`;
      // 通过 URL hash query 把重跑请求传给 practice-detail.html
      const intentParts = [];
      if (evidence?.writeback?.length) {
        // 取第一条 writeback 作为重跑意图
        const wb = evidence.writeback[0];
        intentParts.push(`intent=${encodeURIComponent(wb.note)}`);
      }
      const params = [`env=${env.num}`, `from=data`, ...intentParts].join('&');
      actionEl.setAttribute('href', `./practice-detail.html#stage-iii?${params}`);
    }
    if (bodyEl) {
      const formatBullets = (arr) => arr && arr.length
        ? `<ul>${arr.map(t => `<li>${t}</li>`).join('')}</ul>`
        : '<p style="font-family:var(--mono);font-size:11px;color:var(--mute);">（暂无）</p>';
      const writebackHtml = evidence?.writeback?.length
        ? evidence.writeback.map(w =>
            `<div class="ed-writeback-item"><span class="wb-tag">${w.env}</span><span>${w.note}</span></div>`
          ).join('')
        : '<p style="font-family:var(--mono);font-size:11px;color:var(--mute);">（暂无）</p>';
      const dataSnippet = `
        <div class="ed-section">
          <h4>本环节数据 · ${activeMode === 'cumulative' ? '7 周累计' : activeMode === 'weekly' ? '第 7 周' : '本节课'}</h4>
          <div style="display:flex;gap:18px;font-family:var(--mono);font-size:12px;color:var(--ink-soft);">
            <span>教师 <b style="color:var(--amber-deep);font-family:var(--serif-en);font-style:italic;">${tVal != null ? '+' + tVal : '—'}</b></span>
            <span>学生 <b style="color:var(--sage);font-family:var(--serif-en);font-style:italic;">${sVal != null ? '+' + sVal : '—'}</b></span>
            <span style="margin-left:auto;color:var(--mute);">证据等级 · <b style="color:var(--amber-deep);">${EF.CURRENT_EVIDENCE_LEVEL}</b></span>
          </div>
        </div>
      `;
      // X1-X5 五维耦合分解
      const xVals = EF.ENV_COUPLING_X?.[env.id];
      const xMax = 3; // 0-3 量程
      const xBreakdownHtml = xVals
        ? EF.COUPLING_DIMS.map(dim => {
            const v = xVals[dim.id] ?? 0;
            const pct = Math.min(100, (v / xMax) * 100).toFixed(1);
            const isStrong = v >= 1.5;
            return `
              <div class="ed-x-row${isStrong ? ' is-strong' : ''}${v < 0.1 ? ' is-zero' : ''}">
                <span class="ed-x-id">${dim.id}</span>
                <span class="ed-x-name">${dim.short}</span>
                <span class="ed-x-bar"><i style="width:${pct}%"></i></span>
                <span class="ed-x-val">${v.toFixed(1)}${isStrong ? ' ★' : ''}</span>
              </div>
            `;
          }).join('')
        : '';

      bodyEl.innerHTML = `
        ${dataSnippet}
        <div class="ed-section is-teacher">
          <h4>教师证据 · TEACHER</h4>
          ${formatBullets(evidence?.teacher)}
        </div>
        <div class="ed-section is-student">
          <h4>学生证据 · STUDENT</h4>
          ${formatBullets(evidence?.student)}
        </div>
        <div class="ed-section is-coupling">
          <h4>耦合解释 · COUPLING</h4>
          ${evidence?.coupling
            ? `<div class="ed-coupling-text">${evidence.coupling}</div>`
            : '<p style="font-family:var(--mono);font-size:11px;color:var(--mute);">（暂无）</p>'}
          ${xBreakdownHtml ? `
            <div class="ed-x-breakdown">
              <div class="ed-x-head">5 维耦合分解 · 0–3 量程<small> · ★ ≥ 1.5 显著</small></div>
              ${xBreakdownHtml}
            </div>
          ` : ''}
        </div>
        <div class="ed-section is-writeback">
          <h4>写回建议 · WRITE-BACK</h4>
          ${writebackHtml}
        </div>
        ${evidence?.academic ? `
        <details class="ed-academic">
          <summary class="ed-academic-summary">
            <span class="ed-academic-tag">研究者视角 · METHODOLOGY</span>
            <span class="ed-academic-preview">观测摘要 + 机制假设 + 竞争解释</span>
            <span class="ed-academic-caret">⌄</span>
          </summary>
          <div class="ed-academic-body">
            <div class="ed-academic-block is-obs">
              <h5>① 观测摘要 · OBSERVATION</h5>
              <p>${evidence.academic.observation}</p>
            </div>
            <div class="ed-academic-block is-hypo">
              <h5>② 机制假设 · HYPOTHESIS</h5>
              <p>${evidence.academic.hypothesis}</p>
            </div>
            <div class="ed-academic-block is-rival">
              <h5>③ 竞争解释 · RIVAL EXPLANATIONS</h5>
              <p>${evidence.academic.rival}</p>
            </div>
          </div>
        </details>
        ` : ''}
      `;
    }

    backdrop.hidden = false;
    drawer.hidden = false;
    // Trigger animations on next frame
    requestAnimationFrame(() => {
      backdrop.classList.add('is-open');
      drawer.classList.add('is-open');
      drawer.setAttribute('aria-hidden', 'false');
    });
  }
  function closeEnvDrawer() {
    const backdrop = document.getElementById('envDrawerBackdrop');
    const drawer = document.getElementById('envDrawer');
    if (!drawer) return;
    backdrop?.classList.remove('is-open');
    drawer.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
    setTimeout(() => {
      if (backdrop) backdrop.hidden = true;
      drawer.hidden = true;
    }, 250);
  }
  function bindEnvDrawer() {
    const body = document.querySelector('.bi-atlas-body');
    if (!body) return;
    body.addEventListener('click', (e) => {
      const target = e.target.closest('[data-col]');
      if (!target) return;
      const idx = parseInt(target.dataset.col, 10);
      if (!isNaN(idx)) openEnvDrawer(idx);
    });
    document.getElementById('envDrawerClose')?.addEventListener('click', closeEnvDrawer);
    document.getElementById('envDrawerBackdrop')?.addEventListener('click', closeEnvDrawer);

    // Prev/Next nav
    const navTo = (delta) => {
      const drawer = document.getElementById('envDrawer');
      if (!drawer || drawer.hidden) return;
      const cur = parseInt(drawer.dataset.currentIdx || '0', 10);
      const next = cur + delta;
      const total = (window.PharmacoPilotEvaluationFramework?.ENVIRONMENTS || []).length;
      if (next < 0 || next >= total) return;
      openEnvDrawer(next);
    };
    document.getElementById('envDrawerPrev')?.addEventListener('click', () => navTo(-1));
    document.getElementById('envDrawerNext')?.addEventListener('click', () => navTo(1));

    document.addEventListener('keydown', (e) => {
      const drawer = document.getElementById('envDrawer');
      if (!drawer || drawer.hidden) return;
      if (e.key === 'Escape') {
        closeEnvDrawer();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        navTo(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        navTo(1);
      }
    });
  }

  /* ---------- Ability chip tooltips（B2 · 短名 ↔ 全名展开） ---------- */
  function attachAbChipTooltips() {
    if (!EF) return;
    const allDims = [...EF.TEACHER_DIMS, ...EF.STUDENT_DIMS];
    document.querySelectorAll('.ability-row .ab-chip.is-dim-tag').forEach(chip => {
      // chip 内文形如 "T1 学情解释"，取 T1 / S2 作为 id 查 framework
      const text = chip.textContent.trim();
      const match = text.match(/^([TS]\d+)\s+(.+)$/);
      if (!match) return;
      const dim = allDims.find(d => d.id === match[1]);
      if (!dim) return;
      chip.title = `${dim.id} · ${dim.name}`;
      // 加 aria-label 给屏幕阅读器
      chip.setAttribute('aria-label', `${dim.id} ${dim.short}（${dim.name}）`);
    });
  }

  /* ---------- Cross-band hover 联动 ---------- */
  // 给 9 列里的 station-numbers cell / teacher gain / spine cell / student gain
  // 都打上 data-col 索引，hover 任意一个，整列同时高亮。
  function tagColumnIndices() {
    const body = document.querySelector('.bi-atlas-body');
    if (!body) return;
    const envs = EF?.ENVIRONMENTS || [];
    // 给每一列打 is-env-co / is-env-solo（基于 ENVIRONMENTS[i].co）
    const coClass = (i) => envs[i]?.co === 'co' ? 'is-env-co' : 'is-env-solo';

    const stationNums = body.querySelectorAll('.station-numbers .num-cell');
    stationNums.forEach((n, i) => {
      n.dataset.col = String(i);
      n.classList.add(coClass(i));
    });

    // 教师 lane 现在是唯一的 .lane（双时间轴 v2 移除了学生 9 列 lane 和 spine）
    const lanes = body.querySelectorAll('.lane');
    lanes.forEach((lane) => {
      lane.querySelectorAll('.gain').forEach((g, i) => {
        g.dataset.col = String(i);
        g.classList.add(coClass(i));
      });
    });

    // 双时间轴 v2：学生 5 节点按"锚定环节列"打 data-col，
    // hover 教师某环节时，COUPLING 连到的学生节点同列高亮。
    const eventNodes = body.querySelectorAll('.student-events .event-node');
    eventNodes.forEach(node => {
      const evId = node.dataset.event;
      const ev = EF?.STUDENT_EVENTS?.find(e => e.id === evId);
      if (ev) node.dataset.col = String(eventEnvCol(ev));
    });
  }
  function bindHoverLinkage() {
    const body = document.querySelector('.bi-atlas-body');
    if (!body) return;
    const allColEls = body.querySelectorAll('[data-col]');
    function highlight(colIdx) {
      allColEls.forEach(el => {
        const match = el.dataset.col === String(colIdx);
        el.classList.toggle('is-hover-col', match);
      });
    }
    function clear() {
      allColEls.forEach(el => el.classList.remove('is-hover-col'));
    }
    allColEls.forEach(el => {
      el.addEventListener('mouseenter', () => highlight(el.dataset.col));
      el.addEventListener('mouseleave', clear);
      el.addEventListener('focusin', () => highlight(el.dataset.col));
      el.addEventListener('focusout', clear);
    });
  }

  /* ---------- 启动 ---------- */

  function currentMode() {
    const active = document.querySelector('.bi-atlas-head .toggle-chip.is-active');
    return active?.dataset.mode || 'cumulative';
  }
  function rebuildDataCache() {
    if (!EF) return;
    DATA.cumulative = EF.buildDataset('cumulative');
    DATA.weekly     = EF.buildDataset('weekly');
    DATA.single     = EF.buildDataset('single');
  }

  function init() {
    // 始终先以 HTML 中标记 is-active 的 chip 作为初始模式
    const activeIdx = Array.from(
      document.querySelectorAll('.bi-atlas-head .toggle-chip')
    ).findIndex(c => c.classList.contains('is-active'));
    render(MODES[activeIdx >= 0 ? activeIdx : 0]);
    bindToggles();
    tagColumnIndices();
    bindHoverLinkage();
    bindEnvDrawer();
    attachAbChipTooltips();
    renderFrameworkPanel();
    renderDataSources();

    // LIVE 数据接入：当数据源切换（loadDataset / clearDataset）时，
    // 重建 DATA 缓存并按当前激活模式重渲染。
    window.addEventListener('pp:dataset-changed', () => {
      rebuildDataCache();
      render(currentMode());
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // 暴露给调试 / 未来 Store 桥接
  window.PharmacoPilotDataRender = { render, DATA, STATIONS };
})();
