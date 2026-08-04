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
    { num: '01', name: '学习者与教学情境分析' },
    { num: '02', name: '预期学习结果与评价证据设计' },
    { num: '03', name: '教学内容结构化与前概念诊断' },
    { num: '04', name: '真实性学习情境与资源设计' },
    { num: '05', name: '学习活动与教学支架设计' },
    { num: '06', name: '形成性评价与适应性调控' },
    { num: '07', name: '表现性评价与学习成效诊断' },
    { num: '08', name: '反思性实践与教学改进' },
    { num: '09', name: '教学知识建构与专业共享' },
  ];

  /* 能力 Δ 由 evaluation-framework.js 派生；COUPLING 只读
   * evaluation-contract.js 经 framework.buildDataset() 生成的结果。 */
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

  function resolveCouplingArr(data, mode) {
    return data?.coupling || [];
  }

  function resolveBridgeArr(data, mode) {
    return data?.bridges || [];
  }

  /* 高度映射：把 cumulative 模式下的最大值锚定为 64%，
   * 其余时段按相同 scale 缩放——视觉上 weekly/single 自然变低，
   * 强化"切换时段后增量缩小"的体感。 */
  const TARGET_MAX_HEIGHT = 64; // %
  const CUMULATIVE_MAX = Math.max(1,
    ...[...DATA.cumulative.teacher, ...DATA.cumulative.student]
      .filter(v => typeof v === 'number' && Number.isFinite(v))
      .map(Math.abs)
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
      const v = values[i];
      const st = STATIONS[i];
      const isMeasured = typeof v === 'number' && Number.isFinite(v);
      const heightPct = isMeasured ? Math.max(2, Math.min(100, Math.abs(v) * HEIGHT_SCALE)) : 0;
      const fill = gain.querySelector('.fill');
      const delta = gain.querySelector('.delta');
      if (fill) fill.style.height = heightPct + '%';
      if (delta) delta.textContent = fmtDelta(v);
      gain.title = `${st.num} ${st.name} · ${fmtDelta(v)}`;
      gain.classList.toggle('is-unmeasured', !isMeasured);
      gain.classList.toggle('is-negative', isMeasured && v < 0);
      gain.classList.toggle('is-near-zero', isMeasured && Math.abs(v) < 0.15);
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
  function renderCouplingBridge(data, mode, bridgeArr) {
    const track = document.getElementById('couplingBridgeTrack');
    if (!track) return;
    const svg = track.querySelector('svg');
    if (!svg) return;
    // COUPLING 单一信源：只消费 buildDataset 已按统一契约生成的结果。
    // 样本契约只对有 Xi 耦合维度的环节(E03/E04/E06/E07/E08)产出连线，其余环节无"已测耦合"→不画，更诚实。
    const bridges = bridgeArr || resolveBridgeArr(data, mode);
    if (!bridges.length) {
      svg.innerHTML = '';
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', data?.couplingStatus?.reason || '当前未计算环节关联');
      return;
    }

    const envCount = EF.ENVIRONMENTS.length;       // 9
    const W = 900, H = 56;                         // viewBox · 轻量关联通道
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

    // a11y：用最强的 1-2 条连线概述，写进 svg 的 aria-label
    const strongest = [...bridges].sort((a, b) => b.strength - a.strength).slice(0, 2)
      .map(b => {
        const ev = EF.STUDENT_EVENTS.find(e => e.id === b.eventId);
        return `${EF.ENVIRONMENTS[b.envIndex]?.short || b.envId} → ${ev?.name || b.eventId}（强度 ${b.strength}）`;
      });
    svg.setAttribute('role', 'img');
    const measuredEnvs = new Set(bridges.map(b => b.envId)).size;
    const measuredEvents = new Set(bridges.map(b => b.eventId)).size;
    svg.setAttribute('aria-label',
      `环节关联图：教师 9 个教学环节中 ${measuredEnvs} 个有局部评价指标的环节，通过 ${bridges.length} 条连线连接到 ${measuredEvents} 个当前可测学生节点；模拟基线与迁移验证节点不画线。` +
      (strongest.length ? `最强连线：${strongest.join('；')}。` : '') +
      `各连线强度见对应节点 tooltip。`);
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

      const isMissing = ev.measurementMode === 'missing';
      const isPredicted = ev.measurementMode === 'model-derived';
      node.classList.toggle('is-predicted', isPredicted);
      node.classList.toggle('is-missing', isMissing);

      const deltaEl = node.querySelector('.node-delta');
      if (deltaEl) {
        if (isMissing) {
          deltaEl.textContent = '未测';
        } else if (ev.id === 'EV0') {
          deltaEl.textContent = '参照点';
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
      if (evEl && isMissing) {
        evEl.textContent = '—';
        evEl.className = 'node-evidence lv-missing';
        evEl.title = '该节点未导入观测，不使用样本进度曲线补值';
        evEl.setAttribute('aria-label', '未测量');
      } else if (evEl && ev.evidence) {
        const evidenceMeta = EF.EVIDENCE_LEVELS?.[ev.evidence];
        const evidenceLabel = evidenceMeta?.label || '未分级证据';
        const evidenceDesc = evidenceMeta?.desc || '';
        evEl.textContent = ev.evidence;
        evEl.className = 'node-evidence lv-' + ev.evidence;
        evEl.title = `证据等级 ${ev.evidence} · ${evidenceLabel}` +
          (evidenceDesc ? `：${evidenceDesc}` : '') +
          (isPredicted ? '（虚拟演练模型推演，不是实测）' : '');
        evEl.setAttribute('aria-label', `证据等级 ${ev.evidence}：${evidenceLabel}` +
          (isPredicted ? '，虚拟演练模型推演' : ''));
      }
      const parts = [ev.name];
      if (ev.whenLabel) parts.push(ev.whenLabel);
      if (isMissing) parts.push('未导入节点观测');
      if (ev.composite != null) parts.push(`综合 ${ev.composite.toFixed(1)}/10`);
      if (ev.delta != null && ev.id !== 'EV0') parts.push(`Δ ${(isPredicted ? '≈' : '') + fmtDelta(ev.delta)}（测 ${fmtNodeDims(ev)}）`);
      node.title = parts.join(' · ');
    });
  }

  function renderTotals(data) {
    // 教师 lane 现在是 atlas-body 里唯一的 .lane
    // 只呈现已测维度的平均绝对分差；缺失维度不按 0 计入分母。
    const teacherSmall = document.querySelector('.bi-atlas-body .lane .lane-id .ll small');
    if (teacherSmall) teacherSmall.textContent = `${data.teacherTotal} · 已测 ${data.teacherMeasuredCount}/8`;
    // 学生轴改为 5 节点，总分挂在 .student-events 的 events-id 上
    const studentSmall = document.querySelector('.student-events .events-id .ll small');
    if (studentSmall) studentSmall.textContent = `${data.studentTotal} · 已测 ${data.studentMeasuredCount}/7`;

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
  function renderDataSources(data) {
    const grid = document.getElementById('evidenceGrid');
    if (!grid || !EF || !EF.DATA_SOURCE_STATUS) return;
    const head = document.querySelector('#evidenceStrip .evidence-strip-head .lvl');
    const level = data?.evidenceLevel || EF.CURRENT_EVIDENCE_LEVEL;
    const levelMeta = EF.EVIDENCE_LEVELS?.[level];
    let sources = EF.DATA_SOURCE_STATUS;
    if (data?.isLive) {
      const meta = data.measurementStatus?.meta || {};
      const hasEvents = !!data.raw?.eventScores;
      sources = [
        {
          id: 'live-measurement', label: '教师 / 学生前后测', status: '已接入', statusType: 'ok',
          sampleCount: `N=${meta.sampleSize ?? '—'} · 缺失率 ${typeof meta.missingRate === 'number' ? `${(meta.missingRate * 100).toFixed(1)}%` : '—'} · 评分者 ${meta.raterCount ?? '—'}`,
          evidenceLevel: level,
        },
        {
          id: 'live-association', label: '环节关联评价指标',
          status: data.couplingStatus?.available ? '已接入' : '未接入',
          statusType: data.couplingStatus?.available ? 'ok' : 'pending',
          sampleCount: data.couplingStatus?.available
            ? `关联覆盖 ${data.associationSummary?.covered || 0}/${data.associationSummary?.total || 9}`
            : (data.couplingStatus?.reason || '缺少 couplingRubric'),
          evidenceLevel: data.couplingStatus?.available ? level : null,
        },
        {
          id: 'live-events', label: '学生节点观测',
          status: hasEvents ? '已接入' : '未接入', statusType: hasEvents ? 'ok' : 'pending',
          sampleCount: hasEvents ? '按节点原始观测显示' : '保持未测，不以样本曲线补值',
          evidenceLevel: hasEvents ? level : null,
        },
      ];
      if (head) head.innerHTML = `<b>当前接入 ${escHtml(data.label || '真实课堂数据')}</b> · 证据等级 <span class="ev-badge">${escHtml(level)}</span> · ${escHtml(levelMeta?.label || '未分级')} · 前后测分差按绝对分派生，缺测不进分母 · <a href="#evaluationFramework" style="color:var(--amber-deep);text-decoration:underline dashed;text-underline-offset:3px;">查看完整评价框架 →</a>`;
    } else if (head) {
      head.innerHTML = `本页数字<b>源自 <span class="ev-badge">${escHtml(level)}</span> 级证据</b>（虚拟演练，非真实课堂）· 这是设计预演，<b>不是真实教学成效</b> · 环节关联按证据等级作置信折扣，能力分差按面值呈现 · <a href="#evaluationFramework" style="color:var(--amber-deep);text-decoration:underline dashed;text-underline-offset:3px;">查看完整评价框架 →</a>`;
    }
    grid.innerHTML = sources.map(src => {
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

  // ── 渲染完成哨兵 ─────────────────────────────────────────────────────
  // 教训来源：一次误删 const MODES 导致 render 从中途全线中断，而 175 项静态
  // 门禁仍全绿、控制台一条错误都没有（异常被上游吞掉）。静态断言只能证明
  // 「源码里有这段」，证明不了「页面真的渲染完成」。
  // 因此把渲染结果写进 DOM 契约：<html data-data-render-state=loading|ready|error>，
  // 出错时同时记 data-data-render-error 并 console.error —— 不再静默吞错，
  // 也不让旧 DOM 内容伪装成最新结果。
  function render(mode) {
    const root = document.documentElement;
    root.dataset.dataRenderState = 'loading';
    try {
      renderInner(mode);
      root.dataset.dataRenderState = 'ready';
      root.removeAttribute('data-data-render-error');
    } catch (error) {
      root.dataset.dataRenderState = 'error';
      root.dataset.dataRenderError = (error && error.name) || 'UnknownError';
      console.error('[data-render] page render failed', error);
    }
  }

  function renderInner(mode) {
    const data = DATA[mode];
    if (!data) return;
    // COUPLING 单一信源：只消费 buildDataset 已按统一契约生成的结果。
    // hot 标记 / KEEP·FIX 卡 / bridge 连线 全部读这一套，消除"同环节三个耦合值"的打架。
    const couplingArr = resolveCouplingArr(data, mode);
    const bridgeArr = resolveBridgeArr(data, mode);
    // 教师轴：9 环节 lane（保留）
    const teacherLane = document.querySelector('.bi-atlas-body .lane');
    renderLane(teacherLane, data.teacher, 't');
    // 双时间轴 v2：COUPLING 连线 + 学生 5 节点（取代旧 spine + student lane）
    renderCouplingBridge(data, mode, bridgeArr);
    renderStudentEvents(data);
    // hot markers 按 9 环节 coupling 标记教师轴 top-3 环节
    renderHotMarkers(couplingArr);
    renderTotals(data);
    renderLedeCards(mode, data, bridgeArr);
    renderQueue(mode, data, couplingArr, bridgeArr);
    renderTrajectory(mode, data, couplingArr, bridgeArr);
    renderSummaryRow(mode, data, couplingArr);
    renderDataSources(data);
    const atlasIntro = document.querySelector('.atlas-section .atlas-intro');
    if (atlasIntro) {
      atlasIntro.textContent = data.isLive
        ? '当前显示已接入的前后测分差与环节关联评价指标；缺失节点保持“未测”，不用样本轨迹补值。'
        : '这是教学设计预演，不是真实学习成效测量。线越粗表示关联越强，虚线表示次要关联；数字仅作改进提示。';
    }
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
      if (c <= 0) return;
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
      if (c <= 0) return;
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
      const v = dimDeltas[id];
      if (typeof v !== 'number' || !Number.isFinite(v)) continue;
      const s = w * v;
      if (s > bestScore) { bestScore = s; bestId = id; }
    }
    if (!bestId) return null;
    const meta = dimsCatalog.find(d => d.id === bestId);
    return { id: bestId, short: meta?.short || bestId, delta: dimDeltas[bestId] };
  }

  function buildSnapshotPoints(envIdx, allValues) {
    // 单次评价只画 0–4 水平快照，不根据一个终点伪造 7 周走势。
    const v = typeof allValues[envIdx] === 'number' ? Math.max(0, Math.min(4, allValues[envIdx])) : 0;
    const y = 30 - 24 * (v / 4);
    const linePts = `0,${y.toFixed(1)} 200,${y.toFixed(1)}`;
    const areaPts = `M0,${y.toFixed(1)} L200,${y.toFixed(1)} L200,36 L0,36 Z`;
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
    // 折叠态下让教师知道里面有几条，否则不知道值不值得展开
    const count = root.querySelector('[data-slot="chip-count"]');
    if (count) count.textContent = chipHtmls.length ? ` · ${chipHtmls.length} 条` : '';
  }

  function renderNextSpark(root, count) {
    const svg = root?.querySelector('svg.spark');
    if (!svg) return;
    const safeCount = Math.max(0, Number(count) || 0);
    svg.setAttribute('aria-label', `${safeCount} 条建议待写回`);
    const dots = safeCount
      ? Array.from({ length: Math.min(safeCount, 4) }, (_, i) => {
          const x = 40 + i * 40;
          const filled = i === 0;
          const label = i === 0 ? '立即' : i === 1 ? '本周' : i === 2 ? '暂缓' : '后续';
          return `
            <circle cx="${x}" cy="14" r="${filled ? 7 : 5}" fill="${filled ? '#a8492a' : 'none'}" stroke="${filled ? '#a8492a' : '#1b1916'}" stroke-width="1.4" opacity="${filled ? '1' : '0.55'}"/>
            <text x="${x}" y="32" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="12" text-anchor="middle" fill="${filled ? '#a8492a' : '#1b1916'}" opacity="${filled ? '1' : '0.55'}">${label}</text>
          `;
        }).join('')
      : `<text x="100" y="21" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="12" text-anchor="middle" fill="#6f675f">暂无待写回</text>`;
    svg.innerHTML = `<title>${safeCount} 条建议待写回</title><line x1="20" y1="14" x2="180" y2="14" stroke="#1b1916" stroke-width="1" stroke-dasharray="2 3" opacity="0.2"/>${dots}`;
  }

  function modeLabel(mode) {
    return mode === 'weekly' ? '第 7 周' : mode === 'single' ? '本节课' : '7 周累计';
  }

  function dataLabel(data, mode) {
    const base = data?.isLive ? (data.label || '实时数据') : (data?.label || modeLabel(mode));
    return data?.isLive ? `${base} · ${modeLabel(mode)}` : base;
  }

  function bridgeTargetName(bridge) {
    const ev = EF?.STUDENT_EVENTS?.find(e => e.id === bridge.eventId);
    return ev ? ev.name : '学生证据';
  }

  function rubricEquation(bridge) {
    if (!bridge?.dims?.length) return '缺少局部评价指标';
    const dimExpr = bridge.dims.length === 1
      ? `${bridge.dims[0]}=${Number(bridge.xiScores?.[bridge.dims[0]] ?? 0).toFixed(1)}`
      : `mean(${bridge.dims.map(id => `${id}=${Number(bridge.xiScores?.[id] ?? 0).toFixed(1)}`).join(', ')})`;
    const evidence = `${bridge.evidenceLevel || 'B'}=${Number(bridge.evidenceCoefficient ?? 0).toFixed(2)}`;
    const x1 = `X1(${Number(bridge.x1Score ?? 0).toFixed(1)})=${Number(bridge.x1Coefficient ?? 0).toFixed(2)}`;
    const stationValue = Number(bridge.stationStrength ?? 0);
    const base = `${dimExpr} × 证据系数 ${evidence} × 全局系数 ${x1} = ${stationValue.toFixed(1)}`;
    return bridge.isPrimary ? base : `${base}；次路径 ×0.5 = ${Number(bridge.strength).toFixed(1)}`;
  }

  function renderLedeCards(mode, data, bridges) {
    if (!EF) return;
    const row = document.querySelector('.atlas-lede .lede-row');
    if (!row) return;
    const tag = document.querySelector('.atlas-lede .lede-h .tag');
    const hint = document.querySelector('.atlas-lede .lede-h .hint');
    if (tag) tag.textContent = `${modeLabel(mode)} · 三条值得关注的环节关联线`;
    if (hint) hint.textContent = data?.isLive
      ? (data.couplingStatus?.available
          ? '当前按接入的评价指标和统一契约计算 · 建议优先核查强耦合或低证据链路'
          : data.couplingStatus?.reason || '当前接入数据未提供耦合评价指标')
      : '下方图谱：教师环节连接课中证据、作品评价与反思证据；模拟基线和迁移验证不画关联线 ↓';

    const top = (bridges || [])
      .filter(b => typeof b.strength === 'number' && b.strength > 0)
      .sort((a, b) => b.strength - a.strength)
      .slice(0, 3);

    if (!top.length) {
      const emptyReason = data?.couplingStatus?.available === false
        ? data.couplingStatus.reason
        : '当前数据没有形成可解释的师生耦合连线。';
      row.innerHTML = `
        <div class="lede-card is-empty">
          <div class="lc-h"><span class="num">—<span class="cn">暂无显著连线</span></span><span class="env">${escHtml(modeLabel(mode))}</span></div>
          <div class="lc-b">${escHtml(emptyReason)}。请核查三时段 X1/X2–X5 评价指标或回到教学实践补采证据。</div>
        </div>
      `;
      return;
    }

    row.innerHTML = top.map((b) => {
      const env = EF.ENVIRONMENTS[b.envIndex];
      const ev = EF.STUDENT_EVENTS.find(e => e.id === b.eventId);
      const evData = data.studentEvents?.find(e => e.id === b.eventId);
      const tVal = data.teacher?.[b.envIndex];
      const evDelta = evData?.delta;
      const arrow = b.isPrimary ? '→' : '↘';
      const signal = b.strength >= 1.5 ? '建议优先验证' : '可作为次要线索';
      return `
        <div class="lede-card">
          <div class="lc-h">
            <span class="num">${escHtml(env?.num || '--')}<span class="cn">${escHtml(env?.short || '')}</span></span>
            <span class="env">${arrow} ${escHtml(ev?.name || '学生证据')} · ${Number(b.strength).toFixed(1)}</span>
          </div>
          <div class="lc-b">
            同期观测（不作为公式输入）：<span class="t-em">教师 ${escHtml(env?.short || '')} ${fmtDelta(tVal)}</span>；
            <span class="s-em">学生 ${escHtml(ev?.name || b.eventId)} ${fmtDelta(evDelta)}</span>。<br>
            评价指标计算：${escHtml(rubricEquation(b))}，形成${b.isPrimary ? '主' : '次'}关联。${signal}。
          </div>
        </div>
      `;
    }).join('');
  }

  function queuePriority(coupling, hasFixSignal) {
    if (hasFixSignal || coupling >= 1.5) return { cls: 'is-p1', label: 'P1', text: '优先级 · 高 · 建议本轮处理' };
    return { cls: 'is-p2', label: 'P2', text: '优先级 · 中 · 可排入下一轮' };
  }

  function renderQueue(mode, data, couplingArr, bridges) {
    if (!EF) return;
    const list = document.querySelector('.queue-list');
    if (!list) return;
    const candidates = (couplingArr || [])
      .map((c, i) => {
        const env = EF.ENVIRONMENTS[i];
        const evidence = EF.ENV_EVIDENCE?.[env.id] || {};
        const bridge = (bridges || []).filter(b => b.envIndex === i).sort((a, b) => b.strength - a.strength)[0];
        const evData = bridge ? data.studentEvents?.find(e => e.id === bridge.eventId) : null;
        const hasFixSignal = String(evidence.coupling || '').includes('FIX 信号');
        return { env, idx: i, coupling: c, evidence, bridge, evData, hasFixSignal };
      })
      .filter(x => typeof x.coupling === 'number' && x.coupling > 0)
      .sort((a, b) => {
        if (a.hasFixSignal !== b.hasFixSignal) return a.hasFixSignal ? -1 : 1;
        return b.coupling - a.coupling;
      })
      .slice(0, 4);

    if (!candidates.length) {
      const emptyReason = data?.couplingStatus?.available === false
        ? data.couplingStatus.reason
        : `当前 ${dataLabel(data, mode)} 未检测到正向环节关联`;
      list.innerHTML = `
        <div class="queue-empty">
          <div class="qe-tag">暂无待写回建议</div>
          <div class="qe-body">${escHtml(emptyReason)}。先核查评价标准、补齐课堂证据，或回到教学实践重跑关键环节。</div>
        </div>
      `;
      return;
    }

    list.innerHTML = candidates.map((item) => {
      const p = queuePriority(item.coupling, item.hasFixSignal);
      const wb = item.evidence.writeback?.[0];
      const action = item.hasFixSignal
        ? '修正评价标准或证据锚点，并重新跑评价'
        : (wb?.note || '把当前有效做法写回本课实践包');
      const evName = item.bridge ? bridgeTargetName(item.bridge) : '学生证据';
      const source = item.hasFixSignal ? '评价标准/证据链风险' : '强耦合改进信号';
      return `
        <div class="queue-item${p.label === 'P1' ? ' is-priority' : ''}" data-env="${escHtml(item.env.num)}" data-env-id="${escHtml(item.env.id)}">
          <span class="queue-prio ${p.cls}">${p.label}</span>
          <div class="queue-field">
            <span class="lbl">问题来源</span>
            <span class="v">教学数据 · ${escHtml(modeLabel(mode))}<br/><b>${escHtml(source)}</b></span>
          </div>
          <div class="queue-field">
            <span class="lbl">支持证据</span>
            <span class="v">同期观测：教师 ${escHtml(item.env.short)} ${fmtDelta(data.teacher?.[item.idx])}；${escHtml(evName)} ${fmtDelta(item.evData?.delta)}。关联强度 <b>${item.coupling.toFixed(1)}</b>。${data.isLive ? '源自当前接入数据。' : '源自虚拟演练样本。'}</span>
          </div>
          <div class="queue-field">
            <span class="lbl">建议动作</span>
            <span class="v">${escHtml(action)}</span>
          </div>
          <div class="queue-field">
            <span class="lbl">写回位置</span>
            <span class="v"><span class="env">${escHtml(item.env.num)}</span> ${escHtml(item.env.short)}<small class="queue-writeback-sync">同步至本课实践包 + 教学数据记录</small></span>
          </div>
          <div class="queue-field is-verify">
            <span class="lbl">验证设计</span>
            <span class="v">重跑 ${escHtml(item.env.num)} ${escHtml(item.env.short)}，只改变本条建议动作，比较重跑前后的教师维度、学生节点增量与关联强度，避免把同期熟练度或话题显著性误判为设计效应。</span>
          </div>
          <div class="queue-actions">
            <span class="src-tag">${escHtml(p.text)}</span>
            <button type="button" class="q-btn is-primary" data-action="rerun">进入教学实践重跑 →</button>
            <button type="button" class="q-btn" data-action="practice-pack">更新本课实践包</button>
            <button type="button" class="q-btn" data-action="asset">写入教学资产库</button>
            <button type="button" class="q-btn is-ghost" data-action="defer">暂缓</button>
          </div>
        </div>
      `;
    }).join('');
  }

  function renderTrajectory(mode, data, couplingArr, bridges) {
    const summary = data?.associationSummary || {};
    const couplingAvailable = summary.available && data?.couplingStatus?.available !== false;
    const associationText = couplingAvailable
      ? `${summary.mean.toFixed(1)} / ${summary.scaleMax || 4}`
      : '未计算';
    const meta = document.querySelector('.traj-head-row .meta');
    if (meta) {
      meta.innerHTML = couplingAvailable
        ? `环节—证据关联均值 <b>${associationText}</b> · 覆盖 <b>${summary.covered}/${summary.total}</b> 环节 · ${escHtml(dataLabel(data, mode))}`
        : `环节—证据关联 <b>未计算</b> · 覆盖 0/${summary.total || 9} 环节 · ${escHtml(dataLabel(data, mode))}`;
    }

    const paragraph = document.querySelector('.traj-section .data-section-h p');
    if (paragraph) {
      paragraph.innerHTML = data.isLive
        ? `<b>这是同一测量窗口的前后测快照，不是连续时间序列。</b>${escHtml(modeLabel(mode))}：教师已测维度平均分差 ${data.teacherTotal}，学生已测维度平均分差 ${data.studentTotal}；${couplingAvailable ? `环节关联强度均值 ${associationText}，覆盖 ${summary.covered}/${summary.total}` : escHtml(data.couplingStatus?.reason || '关联评价指标未计算')}。`
        : `<b>这是虚拟演练推演快照，不是真实课堂轨迹。</b>${escHtml(modeLabel(mode))}：教师已测维度平均分差 ${data.teacherTotal}，学生已测维度平均分差 ${data.studentTotal}；环节关联强度均值 ${associationText}，覆盖 ${summary.covered}/${summary.total}。`;
    }

    const legend = document.querySelector('.traj-legend');
    if (legend) {
      legend.innerHTML = `
        <span class="l-t"><i></i>教师已测维度平均分差 ${escHtml(data.teacherTotal)}</span>
        <span class="l-s"><i></i>学生已测维度平均分差 ${escHtml(data.studentTotal)}</span>
        <span class="l-x"><i></i>环节—证据关联 ${couplingAvailable ? `${associationText} · 覆盖 ${summary.covered}/${summary.total}` : '未计算'}</span>
      `;
    }

    const svg = document.querySelector('.traj-chart svg');
    if (!svg) return;
    const signedBar = (value, y, color) => {
      const safe = typeof value === 'number' && Number.isFinite(value) ? Math.max(-10, Math.min(10, value)) : 0;
      const width = Math.abs(safe) / 10 * 400;
      const x = safe >= 0 ? 660 : 660 - width;
      return `<rect x="${x.toFixed(1)}" y="${y}" width="${width.toFixed(1)}" height="18" rx="4" fill="${color}"/>`;
    };
    const associationWidth = couplingAvailable ? Math.max(0, Math.min(4, summary.mean)) / 4 * 800 : 0;
    svg.setAttribute('viewBox', '0 0 1180 220');
    svg.setAttribute('aria-label', `${data.isLive ? '真实前后测' : '虚拟演练推演'}快照：教师平均分差 ${data.teacherTotal}，学生平均分差 ${data.studentTotal}，环节关联${couplingAvailable ? `${associationText}，覆盖 ${summary.covered}/${summary.total}` : '未计算'}`);
    svg.innerHTML = `
      <title>${data.isLive ? '真实课堂前后测快照' : '虚拟演练推演快照'}</title>
      <g fill="var(--ivory)" opacity=".45" font-family="ui-monospace" font-size="12">
        <text x="260" y="18">−10</text><text x="654" y="18">0</text><text x="1045" y="18">+10</text>
        <text x="20" y="51">教师平均分差</text><text x="20" y="111">学生平均分差</text><text x="20" y="171">关联均值 / 4</text>
      </g>
      <g fill="var(--ivory)" opacity=".08">
        <rect x="260" y="36" width="800" height="18" rx="4"/><rect x="260" y="96" width="800" height="18" rx="4"/><rect x="260" y="156" width="800" height="18" rx="4"/>
      </g>
      <line x1="660" y1="30" x2="660" y2="120" stroke="var(--ivory)" opacity=".42" stroke-width="1"/>
      ${signedBar(data.teacherMeanDelta, 36, 'var(--amber-soft)')}
      ${signedBar(data.studentMeanDelta, 96, 'var(--sage)')}
      ${couplingAvailable ? `<rect x="260" y="156" width="${associationWidth.toFixed(1)}" height="18" rx="4" fill="var(--ivory)"/>` : ''}
      <g fill="var(--ivory)" font-family="ui-monospace" font-size="14" font-weight="700">
        <text x="1080" y="51">${escHtml(data.teacherTotal)}</text><text x="1080" y="111">${escHtml(data.studentTotal)}</text><text x="1080" y="171">${escHtml(associationText)}</text>
      </g>
      <text x="260" y="207" font-family="ui-monospace" font-size="12" fill="var(--ivory)" opacity=".45">${escHtml(data.measurementStatus?.label || '')} · ${escHtml(modeLabel(mode))}${couplingAvailable ? ` · 关联覆盖 ${summary.covered}/${summary.total}` : ''}</text>
    `;
  }

  // ── 判断卡 · 状态轨道 · 行动清单 ────────────────────────────────────────
  // 本页主任务是「把课堂证据转化为教学决策并写回」，不是展示仪表盘。
  // 因此：判断状态→标签+环节号；变化量→并列 Δ 数字；水平值→有界量表；
  //       判断依据→折叠；下一步→有序任务+唯一主按钮；理论来源→后置抽屉。
  // 档位取自契约 COUPLING_THRESHOLDS，但只呈现「关联强弱」这一层含义。
  // 契约里的 label 形如「较强关联证据 ★」，会把「关联强度档位」与「证据质量」
  // 两个不同概念混在一起：2.3 说明关联档位较强，不等于证据质量高，更不等于因果成立。
  // ★ 在前台没有稳定可见的含义（刚撤掉全局图例，不宜新增未解释符号），故只取档位词。
  function couplingBand(v) {
    const T = EF?.COUPLING_THRESHOLDS;
    if (!T || typeof v !== 'number') return null;
    for (const key of ['strong', 'moderate', 'weak']) {
      const b = T[key];
      if (b && v >= b.min && v <= b.max) {
        const tier = String(b.label || '').replace(/关联证据.*$/, '').replace(/\s*★\s*/g, '').trim();
        return tier ? `档位：${tier}` : null;
      }
    }
    return null;
  }

  function fillDeltas(root, items) {
    const wrap = root.querySelector('[data-slot="deltas"]');
    if (!wrap) return;
    // Δ 是差值不是水平值：不加 /10、不用进度条、不转百分比。
    // 上方「较基线变化」一行已说明它是变化量，无需全局图例。
    wrap.innerHTML = items.map((it) => `
      <div class="vd-item">
        <span class="vd-lab">${escHtml(it.label)}</span>
        <span class="vd-val${it.muted ? ' is-muted' : ''}">${escHtml(it.value)}</span>
      </div>`).join('');
  }

  function fillGauge(root, v) {
    const fill = root.querySelector('[data-slot="gauge-fill"]');
    const val = root.querySelector('[data-slot="gauge-val"]');
    const band = root.querySelector('[data-slot="gauge-band"]');
    const gauge = root.querySelector('[data-slot="gauge"]');
    const ok = typeof v === 'number';
    const pct = ok ? Math.max(0, Math.min(4, v)) / 4 * 100 : 0;
    if (fill) fill.style.width = pct.toFixed(1) + '%';
    if (val) val.textContent = ok ? `${v.toFixed(1)} / 4` : '—';
    const label = ok ? couplingBand(v) : null;
    if (band) band.textContent = label || '';
    if (gauge) {
      gauge.setAttribute('aria-label',
        ok ? `当前关联强度 ${v.toFixed(1)}，量表上限 4，单次评价快照${label ? '，' + label : ''}`
           : '当前关联强度暂无数据');
    }
  }

  function renderSummaryRow(mode, data, couplingArrIn) {
    if (!EF) return;
    const envs = EF.ENVIRONMENTS;
    const teacherDeltas = EF.getActiveTeacherDeltas?.(mode) || EF.SAMPLE_TEACHER_DELTAS[mode] || {};
    const studentDeltas = EF.getActiveStudentDeltas?.(mode) || EF.SAMPLE_STUDENT_DELTAS[mode] || {};
    const couplingArr = couplingArrIn || data.coupling || [];

    let verdictCount = 0;
    const trackState = {};   // envIdx → { icon, state, cls }

    // ── KEEP ──────────────────────────────────────────────────────────
    const keepRoot = document.querySelector('[data-summary-role="keep"]');
    const keepIdx = pickKeepEnv(couplingArr);
    if (keepRoot && keepIdx != null) {
      const env = envs[keepIdx];
      const tTop = topDimContribution(teacherDeltas, EF.TEACHER_MATRIX[env.id], EF.TEACHER_DIMS);
      const sTop = topDimContribution(studentDeltas, EF.STUDENT_MATRIX[env.id], EF.STUDENT_DIMS);
      setSlot(keepRoot, 'num', env.num);
      setSlot(keepRoot, 'name', env.short);
      keepRoot.dataset.envIdx = String(keepIdx);
      keepRoot.setAttribute('data-summary-anchor', `verdict-${env.num}`);
      fillDeltas(keepRoot, [
        tTop ? { label: `${tTop.short}（${tTop.id}）`, value: `Δ${fmtDelta(tTop.delta)}` } : null,
        sTop ? { label: `${sTop.short}（${sTop.id}）`, value: `Δ${fmtDelta(sTop.delta)}` } : null,
      ].filter(Boolean));
      fillGauge(keepRoot, couplingArr[keepIdx]);
      const names = [tTop && tTop.short, sTop && sTop.short].filter(Boolean).join('和');
      setSlot(keepRoot, 'verdict',
        `${names ? names + '均' : ''}较基线提高，现有设计予以保留，并进入下一轮继续验证。`);
      const chips = [];
      if (tTop) chips.push(`<span class="basis-chip">${tTop.short} <small>${tTop.id} 教师维度</small></span>`);
      if (sTop) chips.push(`<span class="basis-chip">${sTop.short} <small>${sTop.id} 学生维度</small></span>`);
      chips.push(`<span class="basis-chip is-coupling">关联强度 ${couplingArr[keepIdx].toFixed(1)} / 4 <small>由师生同期分差与证据等级算出 · ${escHtml(data.label || mode)}</small></span>`);
      const soloIdx = pickSoloDesignBest(data.teacher, true);
      if (soloIdx != null) {
        const soloEnv = envs[soloIdx];
        chips.push(`<span class="basis-chip is-solo-aside">同期教师独立 · <b>${soloEnv.num} ${soloEnv.short}</b> <i class="nb">Δ${fmtDelta(data.teacher[soloIdx])}</i> <small>教师先动、学生表现滞后显现</small></span>`);
      }
      setChips(keepRoot, chips);
      trackState[keepIdx] = { icon: '✓', state: '保留', cls: 'is-keep' };
      verdictCount += 1;
    } else if (keepRoot) {
      // 空状态必须清空陈旧内容,否则 LIVE 切换后会留着上一次的判断
      delete keepRoot.dataset.envIdx;
      setSlot(keepRoot, 'num', '—');
      setSlot(keepRoot, 'name', '本轮暂无可保留项');
      fillDeltas(keepRoot, []);
      fillGauge(keepRoot, null);   // 当前未计算环节关联 → 量表归零并改 aria
      setSlot(keepRoot, 'verdict', '当前数据未形成正向师生共在关联，先补齐课堂证据。');
      setChips(keepRoot, ['<span class="basis-chip">先补齐课堂证据 <small>实时数据</small></span>']);
    }

    // ── FIX ───────────────────────────────────────────────────────────
    const fixRoot = document.querySelector('[data-summary-role="fix"]');
    const fixIdx = pickFixEnv(couplingArr);
    if (fixRoot && fixIdx != null) {
      const env = envs[fixIdx];
      const tTop = topDimContribution(teacherDeltas, EF.TEACHER_MATRIX[env.id], EF.TEACHER_DIMS);
      const sTop = topDimContribution(studentDeltas, EF.STUDENT_MATRIX[env.id], EF.STUDENT_DIMS);
      setSlot(fixRoot, 'num', env.num);
      setSlot(fixRoot, 'name', env.short);
      fixRoot.dataset.envIdx = String(fixIdx);
      fixRoot.setAttribute('data-summary-anchor', `verdict-${env.num}`);
      // 学生侧「可能被遮蔽」不是数值，不能与教师侧 Δ 伪装成同类数字。
      fillDeltas(fixRoot, [
        tTop ? { label: `${tTop.short}（${tTop.id}）`, value: `Δ${fmtDelta(tTop.delta)}` } : null,
        sTop ? { label: `${sTop.short}（${sTop.id}）`, value: '当前变化可能被评分口径遮蔽', muted: true } : null,
      ].filter(Boolean));
      fillGauge(fixRoot, couplingArr[fixIdx]);
      setSlot(fixRoot, 'verdict',
        `当前评分口径可能遮蔽${sTop ? sTop.short : '学生'}维度的变化，应先统一评价标准，再进入下一轮验证。`);
      const chips = [];
      if (tTop) chips.push(`<span class="basis-chip">${tTop.short} <small>${tTop.id} 教师维度</small></span>`);
      if (sTop) chips.push(`<span class="basis-chip">${sTop.short} <small>${sTop.id} 学生维度</small></span>`);
      chips.push(`<span class="basis-chip is-coupling">关联强度 ${couplingArr[fixIdx].toFixed(1)} / 4 <small>由师生同期分差与证据等级算出 · 歧义待修</small></span>`);
      setChips(fixRoot, chips);
      trackState[fixIdx] = { icon: '!', state: '修正', cls: 'is-fix' };
      verdictCount += 1;
    } else if (fixRoot) {
      delete fixRoot.dataset.envIdx;
      setSlot(fixRoot, 'num', '—');
      setSlot(fixRoot, 'name', '本轮暂无待修正项');
      fillDeltas(fixRoot, []);
      fillGauge(fixRoot, null);   // 当前未计算环节关联 → 量表归零并改 aria
      setSlot(fixRoot, 'verdict', '当前数据未形成需优先修正的关联信号。');
      setChips(fixRoot, ['<span class="basis-chip">先补齐课堂证据 <small>实时数据</small></span>']);
    }

    renderStageTrack(trackState);
    renderActionList();
    const vc = document.querySelector('[data-slot="verdict-count"]');
    if (vc) vc.textContent = String(verdictCount);
  }

  // 9 环节状态轨道 —— 本页的「状态索引」，不是 9 环节的完整功能导航。
  // 因此只有本轮真的产生了结果的节点才是 <button>；无状态节点用 <span>，
  // 避免 5 个空节点伪装成同样可操作。点击停留在本页定位，不打开环节抽屉：
  // 教师点 06 是想知道「为什么保留」，不该被带离当前决策上下文。
  function renderStageTrack(state) {
    const track = document.querySelector('[data-slot="stage-track"]');
    if (!track || !EF) return;
    const queued = new Set(
      [...document.querySelectorAll('.queue-list .queue-item[data-env]')]
        .map((el) => el.dataset.env)
    );
    track.innerHTML = EF.ENVIRONMENTS.map((env, i) => {
      const st = state[i];
      const isQueued = queued.has(env.num);
      const base = `<span class="st-num">${escHtml(env.num)}</span>`;
      if (st) {
        return `<button type="button" class="st-node ${st.cls}" data-env-track-node
          data-summary-target="verdict-${escHtml(env.num)}"
          aria-label="${escHtml(env.num)} ${escHtml(env.short)}，本轮判断为${escHtml(st.state)}">
          ${base}<span class="st-mark" aria-hidden="true">${st.icon}</span><span class="st-state">${escHtml(st.state)}</span>
        </button>`;
      }
      if (isQueued) {
        return `<button type="button" class="st-node is-queued" data-env-track-node
          data-summary-target="action-${escHtml(env.num)}"
          aria-label="${escHtml(env.num)} ${escHtml(env.short)}，本轮有待写回建议">
          ${base}<span class="st-state">待写回</span>
        </button>`;
      }
      return `<span class="st-node is-idle" data-env-track-node
        aria-label="${escHtml(env.num)} ${escHtml(env.short)}，本轮无新增判断">${base}</span>`;
    }).join('');
  }

  // 轨道点击 → 在本页定位并聚焦目标，不跳转、不开抽屉
  function focusSummaryTarget(target) {
    if (!target) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
    target.classList.add('is-track-highlighted');
    window.setTimeout(() => target.classList.remove('is-track-highlighted'), 1200);
  }

  // 评价依据折叠头：条数与预览词从实际 chip 算出，不硬编码
  function renderTheoryDisclosure() {
    const box = document.querySelector('.theory-disclosure');
    if (!box) return;
    const chips = [...box.querySelectorAll('.theory-chip')];
    const cnt = box.querySelector('[data-slot="theory-count"]');
    const prev = box.querySelector('[data-slot="theory-preview"]');
    if (cnt) cnt.textContent = String(chips.length);
    if (prev) {
      const names = chips.slice(0, 3).map((c) => {
        const clone = c.cloneNode(true);
        clone.querySelectorAll('small').forEach((x) => x.remove());
        return clone.textContent.replace(/\s+/g, ' ').trim();
      });
      prev.textContent = names.length ? names.join('、') + (chips.length > names.length ? '等' : '') : '';
    }
  }

  function bindStageTrack() {
    const track = document.querySelector('[data-slot="stage-track"]');
    if (!track) return;
    track.addEventListener('click', (e) => {
      const node = e.target.closest('[data-summary-target]');
      if (!node) return;
      const key = node.getAttribute('data-summary-target');
      focusSummaryTarget(document.querySelector(`[data-summary-anchor="${key}"]`));
    });
  }

  // 行动清单：直接说明「哪一环节、改什么」
  function renderActionList() {
    const list = document.querySelector('[data-slot="action-list"]');
    if (!list) return;
    const items = [...document.querySelectorAll('.queue-list .queue-item[data-env]')];
    const cnt = document.querySelector('.action-col [data-slot="count"]');
    if (cnt) cnt.textContent = String(items.length);
    const qc = document.querySelector('[data-slot="queue-count"]');
    if (qc) qc.textContent = String(items.length);
    const fieldText = (el, label) => {
      const f = [...el.querySelectorAll('.queue-field')]
        .find((x) => (x.querySelector('.lbl') || {}).textContent?.trim() === label);
      return f ? ((f.querySelector('.v') || {}).textContent || '').replace(/\s+/g, ' ').trim() : '';
    };
    list.innerHTML = items.map((el) => {
      const num = el.dataset.env || '';
      const env = EF?.ENVIRONMENTS?.find((e) => e.num === num);
      const act = fieldText(el, '建议动作');
      return `<li class="ac-item" data-action-item data-summary-anchor="action-${escHtml(num)}">
        <span class="ac-env">${escHtml(num)}</span>
        <span class="ac-body"><b>${escHtml(env ? env.short : '')}</b><small>${escHtml(act.slice(0, 46))}</small></span>
      </li>`;
    }).join('');
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
    const crosswalk = EF.RUBRIC_CROSSWALK;
    const crosswalkTypeLabel = { direct: '可重编码', supporting: '仅旁证', 'task-only': '仅任务级' };
    const crosswalkRows = (crosswalk?.mappings || []).map(row =>
      `<tr><td>${escHtml(row.sourceLabel || row.source)}</td><td>${escHtml(row.target || '不进入能力分')}</td><td>${escHtml(crosswalkTypeLabel[row.mappingType] || row.mappingType)}</td><td>${escHtml(row.note)}</td></tr>`
    ).join('');
    host.innerHTML = `
      <div class="fp-section">
        <h5>§ 1 评分量程<small>${escHtml(EF.SCALE.name)}</small></h5>
        <p>每维度 <code>0–${EF.SCALE.perDimension.max}</code> 分；维度 Δ 如 <b>+5.7</b> = 该维度从基线到当前涨了 5.7 分。环节 Δ 如 <b>+4.7</b> = 该环节涉及的多维加权平均（见 §4）。</p>
        <p style="margin-top:6px;"><b>总览口径</b>：教师与学生都显示<b>已测维度的平均绝对分差 / 10</b>；缺失维度不按 0 计入分母，负向变化保留负号。分差既不是相对提升百分比，也不能直接换算为标准化效应量。</p>
        ${refsHtml(EF.SCALE.refs)}
      </div>

      <div class="fp-section is-full">
        <h5>§ 3B 双时间轴<small>教师 9 环节（过程）× 学生 5 节点（结果）</small></h5>
        <p><b>为什么不同列对齐</b>：教师轴是过程性的（描述教师在每个环节做什么），学生能力是结果性的、螺旋上升的——并不沿教学环节平均产生。课前 01-05 是教师独立设计环节，学生不在场，按列伪造学生增量在认识论上站不住脚。故学生轴折叠为 <b>5 个产出节点</b>：</p>
        <p style="margin-top:6px;font-size: var(--fs-2xs);color:var(--mute);"><b>内部数据编号：</b>${(EF.STUDENT_EVENTS||[]).map(e => `<b>${escHtml(e.num)}</b> ${escHtml(e.name)} <i>(${escHtml(e.whenLabel||'')})</i>`).join(' → ')}</p>
        <p style="margin-top:6px;"><b>注意</b>：每个节点测的是<b>不同维度子集</b>（如课中证据测 S3·S6·S2、反思证据测 S7·S1），是不同时点的<b>能力切面</b>，<b>不是同一条能力曲线</b>——故节点数字横向不可直接比大小；迁移验证为综合 7 维后测。</p>
        <p style="margin-top:6px;">两轴节奏不同，通过环节关联线（§6）在交汇点连接，而非强行同列。</p>
      </div>

      <div class="fp-section is-full">
        <h5>§ 6 环节关联强度公式 · 双时间轴版</h5>
        <p><span class="fp-formula">环节关联强度 = 适用的 X2–X5 评分均值 × 证据系数 × X1 全局系数</span></p>
        <p>样本与实时数据使用同一份评价契约。实时数据必须导入绝对基线值和当前值，系统再派生 Δ；缺少学生节点观测时显示“未测”，不套用样本进度曲线。必须同时提供三时段局部评分才计算环节关联。</p>
        <p style="margin-top:6px;"><b>T2 与 X1 的双重角色已显式区分</b>：T2 是教师能力维度，进入教师能力画像；X1 是目标—任务—评价一致性的全局可信度折扣，只进入环节关联强度，且不在抽屉逐环节重复计分。两者同时偏低会分别影响能力画像和关联置信度，这是有意的双层呈现，不是同一公式内的重复扣分。</p>
        <p style="margin-top:6px;">X1 映射为 0→0.50 / 1→0.70 / 2→0.85 / 3→0.95 / 4→1.00；单环节关联 ≥ <b>1.5</b> 仅标记“建议优先验证”，不宣称因果。跨环节总览报告<b>已测环节均值 + 覆盖率</b>，不再求和。</p>
        ${refsHtml(EF.COUPLING_REFS)}
      </div>

      <div class="fp-section is-full">
        <h5>§ 4 教学环节 × 维度 加权矩阵<small>列 = 9 个教学环节，行 = 教师 8 维 / 学生 7 维</small></h5>
        <p><b>权重</b>：1.0 = 主驱动维度（×）/ 0.4 = 次要参与维度（·）/ 0 = 该环节不评估该维度。</p>
        <p style="margin-top:6px;"><b>读法举例</b>：教师在 04 真实性学习情境与资源设计 的得分 = (1.0 × T3 情境转译 Δ + 0.4 × T4 问题链设计 Δ) / 1.4，归一化到 10 分制。学生 7 维则按 5 节点的实测分数聚合（不再按环节切片）。</p>
        <p style="margin-top:6px;font-size: var(--fs-2xs);color:var(--mute);"><b>教师 8 维</b>：${tDimsTxt}</p>
        <p style="font-size: var(--fs-2xs);color:var(--mute);"><b>学生 7 维</b>：${sDimsTxt}</p>
        ${refsHtml(EF.MATRIX_REFS)}
      </div>

      <div class="fp-section is-full">
        <h5>§ 8 数据来源<small>15 维各自的原始信号</small></h5>
        <p style="margin-bottom:8px;"><b>编码边界</b>：S3 与 S6 可来自同一段讨论录音，但必须分别使用“利益相关者实体/关系”和“论证结构/轮次质量”两张独立编码表，禁止一次编码两次计分。AI 采纳率、退回次数已移出 T8，只作为工具使用过程指标。</p>
        <ul class="fp-sources">${sourcesHtml}</ul>
      </div>

      <div class="fp-section is-full">
        <h5>§ 8B 三套评分体系对照<small>${escHtml(crosswalk?.version || '未定义')}</small></h5>
        <p>${escHtml(crosswalk?.rule || '')}</p>
        <div style="overflow-x:auto;margin-top:8px;"><table class="fp-crosswalk"><thead><tr><th>来源指标</th><th>目标维度</th><th>关系</th><th>使用边界</th></tr></thead><tbody>${crosswalkRows}</tbody></table></div>
      </div>

      <div class="fp-section is-full">
        <h5>§ 7 时段基线</h5>
        <p><b>累计</b>：${escHtml(EF.BASELINES.cumulative.detail)}（${EF.BASELINES.cumulative.sessionCount} 次模拟）</p>
        <p><b>本周</b>：${escHtml(EF.BASELINES.weekly.detail)}（${EF.BASELINES.weekly.sessionCount} 次）</p>
        <p><b>单节课</b>：${escHtml(EF.BASELINES.single.detail)}</p>
      </div>
    `;
  }

  /* ---------- Environment Evidence Drawer ---------- */
  function hydrateEvidenceText(text, data, couplingValue) {
    const teacherDims = data?.raw?.teacherDims || {};
    const studentDims = data?.raw?.studentDims || {};
    const baselineScores = data?.raw?.eventScores?.EV0 || {};
    const numericBaseline = Object.entries(baselineScores)
      .filter(([key, value]) => /^S\d+$/.test(key) && typeof value === 'number')
      .map(([, value]) => value);
    const baselineMean = numericBaseline.length
      ? numericBaseline.reduce((a, b) => a + b, 0) / numericBaseline.length
      : null;
    const dimToken = (id, source) => `${id}↑${Number(source[id] ?? 0).toFixed(1)}`;
    const rankedTeacher = Object.entries(teacherDims)
      .filter(([, value]) => typeof value === 'number')
      .sort((a, b) => b[1] - a[1]);
    const t7Rank = Math.max(0, rankedTeacher.findIndex(([id]) => id === 'T7')) + 1;
    const t7Max = rankedTeacher[0];
    const replacements = {
      '{{BASELINE_MEAN}}': baselineMean == null ? '—' : baselineMean.toFixed(1),
      '{{COUPLING}}': couplingValue == null
        ? '<b>关联强度 —（未配置或缺少局部评价指标）</b>'
        : `<b>关联强度 ${Number(couplingValue).toFixed(1)}</b> · 证据等级 <b>${escHtml(data?.evidenceLevel || '—')}</b>`,
      '{{T6}}': dimToken('T6', teacherDims),
      '{{T7}}': dimToken('T7', teacherDims),
      '{{S2}}': dimToken('S2', studentDims),
      '{{S6}}': dimToken('S6', studentDims),
      '{{T7_RANK}}': t7Max
        ? `${dimToken('T7', teacherDims)}（本时段教师维度第 ${t7Rank}；最高为 ${t7Max[0]}↑${Number(t7Max[1]).toFixed(1)}）`
        : 'T7 证据反馈暂无读数',
    };
    return Object.entries(replacements).reduce(
      (out, [token, value]) => out.split(token).join(value),
      String(text ?? '')
    );
  }

  function scoreRangeLabel(band) {
    const level = EF?.SCALE?.levels?.find(item => item.code === band);
    if (!level) return '';
    const [min, max] = level.range;
    return `${min} ≤ 分数 ${level.upperInclusive ? '≤' : '<'} ${max}`;
  }

  function renderDimensionRubric(dimId, weight, role) {
    const dims = role === 'teacher' ? EF.TEACHER_DIMS : EF.STUDENT_DIMS;
    const dim = dims.find(item => item.id === dimId);
    if (!dim) return '';
    const roleLabel = role === 'teacher' ? '教师' : '学生';
    const weightLabel = weight >= 1 ? '主驱动' : '次要参与';
    const deferredReason = EF.DIM_RUBRICS_DEFERRED?.[dimId];

    if (deferredReason) {
      return `
        <details class="ed-rubric is-${role} is-deferred">
          <summary class="ed-rubric-summary">
            <span class="ed-rubric-title"><b>${escHtml(dimId)}</b>${escHtml(dim.name)}<small>${roleLabel} · ${weightLabel}</small></span>
            <span class="ed-rubric-status">暂缓立锚 · 查看原因</span>
            <span class="ed-rubric-caret" aria-hidden="true">⌄</span>
          </summary>
          <div class="ed-rubric-body">
            <p class="ed-rubric-deferred">${escHtml(deferredReason)}</p>
          </div>
        </details>
      `;
    }

    const rubric = EF.DIM_RUBRICS?.[dimId];
    if (!rubric) return '';
    const isProvisional = rubric.status === 'provisional';
    const statusLabel = isProvisional ? '暂行锚点 · 混合构念待拆' : '草案 · 未经 κ 检验';
    const levelsHtml = rubric.levels.map(level => `
      <div class="ed-rubric-level">
        <span class="ed-rubric-band">${escHtml(level.band)}<small>${escHtml(scoreRangeLabel(level.band))}</small></span>
        <span class="ed-rubric-anchor"><b>${escHtml(level.label)}</b>${escHtml(level.desc)}</span>
      </div>
    `).join('');

    return `
      <details class="ed-rubric is-${role}${isProvisional ? ' is-provisional' : ''}">
        <summary class="ed-rubric-summary">
          <span class="ed-rubric-title"><b>${escHtml(dimId)}</b>${escHtml(dim.name)}<small>${roleLabel} · ${weightLabel}</small></span>
          <span class="ed-rubric-status">${statusLabel} · 展开 L0–L4</span>
          <span class="ed-rubric-caret" aria-hidden="true">⌄</span>
        </summary>
        <div class="ed-rubric-body">
          <p class="ed-rubric-signals"><b>可观察信号</b>${escHtml(rubric.signals)}</p>
          ${rubric.codingNote ? `<p class="ed-rubric-coding"><b>编码边界</b>${escHtml(rubric.codingNote)}</p>` : ''}
          <div class="ed-rubric-levels">${levelsHtml}</div>
        </div>
      </details>
    `;
  }

  function renderEnvRubrics(envId) {
    const teacher = Object.entries(EF.TEACHER_MATRIX?.[envId] || {})
      .filter(([, weight]) => weight > 0)
      .map(([dimId, weight]) => renderDimensionRubric(dimId, weight, 'teacher'));
    const student = Object.entries(EF.STUDENT_MATRIX?.[envId] || {})
      .filter(([, weight]) => weight > 0)
      .map(([dimId, weight]) => renderDimensionRubric(dimId, weight, 'student'));
    return [...teacher, ...student].filter(Boolean).join('');
  }

  // a11y：记录打开抽屉前的触发元素，关闭时把焦点还回去
  let envDrawerTrigger = null;
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
    // a11y：仅在"从关闭到打开"时记录触发元素（prev/next 切换环节不覆盖）
    const wasHidden = drawer.hidden;
    if (wasHidden) envDrawerTrigger = document.activeElement;

    if (phaseEl) {
      phaseEl.textContent = { pre: '课前', in: '课中', post: '课后' }[env.phase] || '';
      phaseEl.className = 'ed-phase is-' + env.phase;
    }
    if (titleEl) {
      titleEl.innerHTML = `<span class="num">${env.num}</span>${env.name}`;
    }
    if (couplingEl) {
      const couplingTxt = cVal == null
        ? (data?.couplingStatus?.available === false ? '关联强度 — · 未计算' : '关联强度 — · 本环节无局部评价指标')
        : (cVal >= 1.5 ? `★ 关联强度 ${cVal} · 建议优先验证` : `关联强度 ${cVal}`);
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
      const hydrate = (text) => hydrateEvidenceText(text, data, cVal);
      const formatBullets = (arr) => arr && arr.length
        ? `<ul>${arr.map(t => `<li>${hydrate(t)}</li>`).join('')}</ul>`
        : '<p style="font-family:var(--mono);font-size: var(--fs-2xs);color:var(--mute);">（暂无）</p>';
      const writebackHtml = evidence?.writeback?.length
        ? evidence.writeback.map(w =>
            `<div class="ed-writeback-item"><span class="wb-tag">${w.env}</span><span>${w.note}</span></div>`
          ).join('')
        : '<p style="font-family:var(--mono);font-size: var(--fs-2xs);color:var(--mute);">（暂无）</p>';
      const rubricPanelHtml = renderEnvRubrics(env.id);
      const dataSnippet = `
        <div class="ed-section">
          <h4>本环节数据 · ${activeMode === 'cumulative' ? '7 周累计' : activeMode === 'weekly' ? '第 7 周' : '本节课'}</h4>
          <div style="display:flex;gap:18px;font-family:var(--mono);font-size: var(--fs-2xs);color:var(--ink-soft);">
            <span>教师 <b style="color:var(--amber-deep);font-family:var(--serif-en);font-style:italic;">${tVal != null ? '+' + tVal : '—'}</b></span>
            <span>学生 <b style="color:var(--sage);font-family:var(--serif-en);font-style:italic;">${sVal != null ? '+' + sVal : '—'}</b></span>
            <span style="margin-left:auto;color:var(--mute);">证据等级 · <b style="color:var(--amber-deep);">${escHtml(data?.evidenceLevel || '—')}</b></span>
          </div>
        </div>
      `;
      // X1 是全局系数；抽屉只展示该环节实际适用的 X2-X5 局部评价指标。
      const contract = window.PharmacoPilotEvaluationContract;
      const localDims = contract?.STATION_COUPLING_DIMS?.[env.id] || null;
      const rubric = data?.couplingRubric;
      const xVals = rubric?.perEnv?.[env.id] || null;
      const xMax = 4;
      const xBreakdownHtml = localDims?.length && xVals
        ? localDims.map(dimId => {
            const dim = EF.COUPLING_DIMS.find(item => item.id === dimId) || { id: dimId, short: dimId };
            const v = xVals[dimId] ?? 0;
            const pct = Math.min(100, (v / xMax) * 100).toFixed(1);
            const isStrong = v >= 1.5;
            return `
              <div class="ed-x-row${isStrong ? ' is-strong' : ''}${v < 0.1 ? ' is-zero' : ''}">
                <span class="ed-x-id">${dimId}</span>
                <span class="ed-x-name">${dim.short}</span>
                <span class="ed-x-bar"><i style="width:${pct}%"></i></span>
                <span class="ed-x-val">${v.toFixed(1)}${isStrong ? ' ★' : ''}</span>
              </div>
            `;
          }).join('')
        : '';

      bodyEl.innerHTML = `
        ${dataSnippet}
        <div class="ed-section is-rubric">
          <h4>评分锚点</h4>
          <p class="ed-rubric-intro">仅列出本环节加权矩阵涉及的维度，默认收起。锚点用于绝对能力评分，不能用页面上的增量 Δ 直接反推当前档位。</p>
          <div class="ed-rubric-list">${rubricPanelHtml}</div>
        </div>
        <div class="ed-section is-teacher">
          <h4>教师证据</h4>
          ${formatBullets(evidence?.teacher)}
        </div>
        <div class="ed-section is-student">
          <h4>学生证据</h4>
          ${formatBullets(evidence?.student)}
        </div>
        <div class="ed-section is-coupling">
          <h4>关联解释</h4>
          ${evidence?.coupling
            ? `<div class="ed-coupling-text">${hydrate(evidence.coupling)}</div>`
            : '<p style="font-family:var(--mono);font-size: var(--fs-2xs);color:var(--mute);">（暂无）</p>'}
          ${xBreakdownHtml ? `
            <div class="ed-x-breakdown">
              <div class="ed-x-head">局部耦合评价指标 · 0–4<small> · X1=${Number(rubric.x1).toFixed(1)} 为全局系数，不作为本环节局部行重复展示</small></div>
              ${xBreakdownHtml}
            </div>
          ` : ''}
        </div>
        <div class="ed-section is-writeback">
          <h4>写回建议</h4>
          ${writebackHtml}
        </div>
        ${evidence?.academic ? `
        <details class="ed-academic">
          <summary class="ed-academic-summary">
            <span class="ed-academic-tag">研究者视角</span>
            <span class="ed-academic-preview">观测摘要 + 机制假设 + 竞争解释</span>
            <span class="ed-academic-caret">⌄</span>
          </summary>
          <div class="ed-academic-body">
            <div class="ed-academic-block is-obs">
              <h5>① 观测摘要</h5>
              <p>${hydrate(evidence.academic.observation)}</p>
            </div>
            <div class="ed-academic-block is-hypo">
              <h5>② 机制假设</h5>
              <p>${hydrate(evidence.academic.hypothesis)}</p>
            </div>
            <div class="ed-academic-block is-rival">
              <h5>③ 竞争解释</h5>
              <p>${hydrate(evidence.academic.rival)}</p>
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
      // a11y：打开后把焦点移入抽屉（关闭按钮）
      if (wasHidden) document.getElementById('envDrawerClose')?.focus();
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
    // a11y：焦点还给打开抽屉的触发元素
    const trigger = envDrawerTrigger;
    envDrawerTrigger = null;
    if (trigger && typeof trigger.focus === 'function' && document.contains(trigger)) {
      trigger.focus();
    }
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
    // a11y：Enter / Space 键盘激活，与上方 click 委托同一容器、同一逻辑
    body.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const target = e.target.closest('[data-col]');
      if (!target) return;
      e.preventDefault();
      const idx = parseInt(target.dataset.col, 10);
      if (!isNaN(idx)) openEnvDrawer(idx);
    });
    // 概览卡的曲线下钻 —— 用 <button> 承载，click 与键盘由浏览器原生处理，
    // 不需要像上面图谱格子那样另写 keydown。
    document.querySelectorAll('[data-summary-drill]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cell = btn.closest('[data-summary-role]');
        const idx = cell ? parseInt(cell.dataset.envIdx, 10) : NaN;
        if (!isNaN(idx)) openEnvDrawer(idx);
      });
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

  let queueActionsBound = false;
  function inferAction(btn) {
    if (btn.dataset.action) return btn.dataset.action;
    const text = (btn.textContent || '').trim();
    if (text.includes('重跑')) return 'rerun';
    if (text.includes('实践包')) return 'practice-pack';
    if (text.includes('资产库')) return 'asset';
    if (text.includes('暂缓')) return 'defer';
    return 'note';
  }
  function queueContext(btn) {
    const item = btn.closest('.queue-item');
    const env = item?.dataset.env || item?.querySelector('.env')?.textContent?.trim() || '';
    const envId = item?.dataset.envId || '';
    const actionText = item?.querySelector('.queue-field:nth-of-type(3) .v')?.textContent?.replace(/\s+/g, ' ').trim() || '';
    return { env, envId, actionText };
  }
  function saveDataAction(entry) {
    const key = 'pp.dataActions';
    let list = [];
    try { list = JSON.parse(localStorage.getItem(key) || '[]'); }
    catch (e) { list = []; }
    list.unshift(Object.assign({ at: Date.now() }, entry));
    try { localStorage.setItem(key, JSON.stringify(list.slice(0, 50))); } catch (e) {}
  }
  function showDataActionToast(message) {
    let toast = document.getElementById('dataActionToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'dataActionToast';
      toast.className = 'data-action-toast';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('is-show');
    clearTimeout(showDataActionToast._timer);
    showDataActionToast._timer = setTimeout(() => toast.classList.remove('is-show'), 2400);
  }
  function bindQueueActions() {
    if (queueActionsBound) return;
    queueActionsBound = true;
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.queue-actions .q-btn, .s-cell .action-row .q-btn');
      if (!btn) return;
      if (btn.tagName === 'A' && btn.getAttribute('href')?.startsWith('#')) return;

      const action = inferAction(btn);
      const ctx = queueContext(btn);
      if (action === 'rerun') {
        e.preventDefault();
        const env = ctx.env || '06';
        const intent = ctx.actionText || '验证本环节改进建议';
        window.location.href = `./practice-detail.html#stage-iii?env=${encodeURIComponent(env)}&from=data&intent=${encodeURIComponent(intent)}`;
        return;
      }

      e.preventDefault();
      saveDataAction({
        action,
        env: ctx.env || null,
        envId: ctx.envId || null,
        note: ctx.actionText || (btn.textContent || '').trim(),
      });
      const label = action === 'practice-pack'
        ? '已记录：更新本课实践包'
        : action === 'asset'
          ? '已记录：写入教学资产库'
          : action === 'defer'
            ? '已记录：暂缓本条建议'
            : '已记录本次操作';
      showDataActionToast(ctx.env ? `${label} · ${ctx.env}` : label);
    });
  }

  /* ---------- Ability chip tooltips（B2 · 短名 ↔ 全名展开） ---------- */
  function attachAbChipTooltips() {
    if (!EF) return;
    const allDims = [...EF.TEACHER_DIMS, ...EF.STUDENT_DIMS];
    document.querySelectorAll('.ability-row .ab-chip.is-dim-tag[data-dim]').forEach(chip => {
      const dim = allDims.find(d => d.id === chip.dataset.dim);
      if (!dim) return;
      chip.title = `${dim.id} · ${dim.name} — 点击查看评分锚点`;
      // 加 aria-label 给屏幕阅读器
      chip.setAttribute('aria-label', `${dim.id} ${dim.short}（${dim.name}），点击查看评分锚点`);
    });
  }

  /* ---------- 维度评分锚点 popover（framework §8C · 点击 chip 弹出） ---------- */
  const DIM_STATUS_META = {
    draft:       { label: '草案 · 未经信度检验', cls: 'is-draft' },
    provisional: { label: '临时 · 构念待拆分',   cls: 'is-provisional' },
  };
  let dimPopoverTrigger = null;

  function buildDimPopoverContent(dimId) {
    const dim = [...(EF.TEACHER_DIMS || []), ...(EF.STUDENT_DIMS || [])].find(d => d.id === dimId);
    if (!dim) return '';
    const rubric = EF.DIM_RUBRICS?.[dimId];
    const deferredReason = EF.DIM_RUBRICS_DEFERRED?.[dimId];
    const kindCls = dimId.startsWith('T') ? 'is-teacher' : 'is-student';
    const kind = dimId.startsWith('T') ? '教师维度' : '学生维度';
    const status = rubric
      ? (DIM_STATUS_META[rubric.status] || DIM_STATUS_META.draft)
      : { label: '暂缓立锚', cls: 'is-deferred' };
    const signals = rubric?.signals || (EF.DATA_SOURCES?.[dimId] || []).join(' · ');
    const ranges = (EF.SCALE?.levels || []).map(l => l.range.join('–'));
    const levelsHtml = rubric
      ? `<ol class="dp-levels">
          ${rubric.levels.map((lv, i) => `
            <li>
              <span class="dp-band">${lv.band}</span>
              <span class="dp-range">${ranges[i] || ''}</span>
              <b>${escHtml(lv.label)}</b>
              <p>${escHtml(lv.desc)}</p>
            </li>`).join('')}
        </ol>`
      : `<p class="dp-deferred">${escHtml(deferredReason || '该维度暂未建立评分锚点。')}</p>`;
    return `
      <div class="dp-head">
        <span class="dp-id ${kindCls}">${dim.id}</span>
        <h3 id="dimPopoverTitle">${escHtml(dim.name)}</h3>
        <button type="button" class="dp-close" id="dimPopoverClose" aria-label="关闭维度说明">×</button>
      </div>
      <div class="dp-sub">${kind} · 评分锚点（0–10）<span class="dp-status ${status.cls}">${status.label}</span></div>
      ${signals ? `<p class="dp-signals"><b>信号</b>${escHtml(signals)}</p>` : ''}
      ${rubric?.codingNote ? `<p class="dp-note">${escHtml(rubric.codingNote)}</p>` : ''}
      ${levelsHtml}
      ${(dim.refs || []).length ? `<p class="dp-refs">参考：${dim.refs.map(escHtml).join(' · ')}</p>` : ''}
    `;
  }

  function openDimPopover(dimId, chip) {
    const pop = document.getElementById('dimPopover');
    if (!pop || !EF) return;
    const html = buildDimPopoverContent(dimId);
    if (!html) return;
    dimPopoverTrigger = chip;
    pop.innerHTML = html;
    pop.hidden = false;
    document.querySelectorAll('.ab-chip.is-dim-tag[aria-expanded="true"]')
      .forEach(c => c.setAttribute('aria-expanded', 'false'));
    chip.setAttribute('aria-expanded', 'true');
    // 定位：优先 chip 正下方、水平居中于 chip，贴近视口边缘；下方放不下则翻到上方
    const rect = chip.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const w = pop.offsetWidth;
    const left = Math.min(Math.max(16, rect.left + rect.width / 2 - w / 2), vw - w - 16);
    const h = pop.offsetHeight;
    let top = rect.bottom + 10;
    if (top + h > vh - 16) top = Math.max(16, rect.top - h - 10);
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
    const closeBtn = pop.querySelector('#dimPopoverClose');
    closeBtn?.addEventListener('click', closeDimPopover);
    closeBtn?.focus();
  }

  function closeDimPopover() {
    const pop = document.getElementById('dimPopover');
    if (!pop || pop.hidden) return;
    pop.hidden = true;
    pop.innerHTML = '';
    dimPopoverTrigger?.setAttribute('aria-expanded', 'false');
    const trigger = dimPopoverTrigger;
    dimPopoverTrigger = null;
    // a11y：焦点还给打开 popover 的 chip
    if (trigger && document.contains(trigger)) trigger.focus();
  }

  function bindDimRubricPopovers() {
    if (!EF) return;
    document.querySelectorAll('.ability-row .ab-chip.is-dim-tag[data-dim]').forEach(chip => {
      chip.addEventListener('click', () => {
        const pop = document.getElementById('dimPopover');
        const sameOpen = pop && !pop.hidden && dimPopoverTrigger === chip;
        if (sameOpen) closeDimPopover();
        else openDimPopover(chip.dataset.dim, chip);
      });
    });
    document.addEventListener('click', (e) => {
      const pop = document.getElementById('dimPopover');
      if (!pop || pop.hidden) return;
      if (pop.contains(e.target)) return;
      if (e.target.closest('.ab-chip.is-dim-tag[data-dim]')) return;
      closeDimPopover();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeDimPopover();
    });
    window.addEventListener('resize', closeDimPopover);
    window.addEventListener('scroll', closeDimPopover, true);
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
      // a11y：可点开证据抽屉的列元素，补键盘可达语义
      n.setAttribute('role', 'button');
      n.setAttribute('tabindex', '0');
    });

    // 教师 lane 现在是唯一的 .lane（双时间轴 v2 移除了学生 9 列 lane 和 spine）
    const lanes = body.querySelectorAll('.lane');
    lanes.forEach((lane) => {
      lane.querySelectorAll('.gain').forEach((g, i) => {
        g.dataset.col = String(i);
        g.classList.add(coClass(i));
        g.setAttribute('role', 'button');
        g.setAttribute('tabindex', '0');
      });
    });

    // 双时间轴 v2：学生 5 节点按"锚定环节列"打 data-col，
    // hover 教师某环节时，COUPLING 连到的学生节点同列高亮。
    const eventNodes = body.querySelectorAll('.student-events .event-node');
    eventNodes.forEach(node => {
      const evId = node.dataset.event;
      const ev = EF?.STUDENT_EVENTS?.find(e => e.id === evId);
      if (ev) {
        node.dataset.col = String(eventEnvCol(ev));
        node.setAttribute('role', 'button');
        node.setAttribute('tabindex', '0');
      }
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
    bindStageTrack();   // 事件委托挂在静态 <nav>，须在 DOM 就绪后绑定
    renderTheoryDisclosure();
    tagColumnIndices();
    bindHoverLinkage();
    bindEnvDrawer();
    bindQueueActions();
    attachAbChipTooltips();
    bindDimRubricPopovers();
    renderFrameworkPanel();

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
