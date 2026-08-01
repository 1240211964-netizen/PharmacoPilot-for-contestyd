/* ============================================================
 * evaluation-contract.js — COUPLING 聚合逻辑（X1 全局系数版）
 * ------------------------------------------------------------
 * 设计背景（2026-05-27）：
 *   X1（目标—任务—评价一致性）从逐环节维度升级为全局折扣系数。
 *   教师本轮的 X1 得分决定全局耦合信号的可信权重。
 *   X2–X5 仍为逐环节维度，只在有教学证据的环节计算。
 *
 * 公式：
 *   COUPLING(env) = mean(Xi_score for applicable dims) × evidenceCoef × x1GlobalCoef
 *
 * 量程（B 级证据）：
 *   X1=0 → 最高 1.60   X1=2 → 最高 2.72   X1=4 → 最高 3.20
 *   原型阶段数值上限约 2.3–2.5（X1 典型值 2–3）
 *
 * 本文件是 COUPLING 的唯一计算信源。evaluation-framework.js 只负责能力 Δ、
 * 学生节点与叙事语义，不再保留另一套同名 COUPLING 公式。
 *
 * ── 双时间轴 v2 适配说明（2026-05-29）──────────────────────────
 *   原 spine（9 列同步耦合）已改为 COUPLING 连线（教师环节 → 学生节点）。
 *   本文件的 buildCouplingLane(mode) 返回的 9 元数组语义随之微调为：
 *     "每个教师环节与它在 ENV_TO_EVENT 中所连学生节点的耦合强度"。
 *   该数组现在主要喂 data-render.js 的 renderHotMarkers()（标记教师轴 top-3 强耦合环节），
 *   以及 buildBridgeCoupling() 把 9 元强度按 framework.ENV_TO_EVENT 映射到 env→event 连接。
 *   学生节点（EV0-EV4）的实测分数 / JSON 校验在 evaluation-framework.js 侧（_validateLiveDataset 接收可选 studentEvents 字段）。
 * ============================================================ */

(function () {
  'use strict';

  // ============ § 1 · X1 全局系数映射 ============
  // X1 评价"目标、任务、评价是否指向同一种学生能力"
  // 分低时折扣耦合信号的可信权重，而不是清零
  const X1_GLOBAL_COEFFICIENT = {
    0: 0.50,  // 目标、任务、评价完全脱节——耦合信号可信度减半
    1: 0.70,  // 基本对齐，但证据链断裂
    2: 0.85,  // 基本一致，可作诊断参考
    3: 0.95,  // 高度一致，保留少量不确定性
    4: 1.00,  // 完全一致，不折扣
  };

  const EVIDENCE_COEFFICIENTS = {
    A: 1.0,
    B: 0.8,
    C: 0.5,
    D: 0.2,
  };

  // 十进制评价指标统一采用一位小数的四舍五入。Number#toFixed 会受二进制
  // 浮点表示影响（例如 2.85 在部分运行时得到 2.8），因此在契约层固定规则。
  function roundRubric(value, digits) {
    const scale = 10 ** (digits ?? 1);
    const tolerance = Number.EPSILON * Math.max(1, Math.abs(value)) * 100;
    return Math.round((value + tolerance) * scale) / scale;
  }

  // ============ § 2 · 各环节适用 Xi 维度 ============
  // X1 已升级为全局系数，不再出现在逐环节映射中
  // null 表示该环节无耦合维度，spine 显示"—"
  const STATION_COUPLING_DIMS = {
    E01: null,
    E02: null,
    E03: ['X2'],         // 问题链—高阶思维耦合
    E04: ['X3'],         // 情境—证据使用耦合
    E05: null,
    E06: ['X4'],         // 互动调控—参与公平耦合
    E07: ['X4', 'X5'],   // 互动调控 + 反馈—修正闭环耦合（双维等权）
    E08: ['X5'],         // 反馈—修正闭环耦合（X1 已提升为全局，不再计入局部）
    E09: null,
  };

  // ============ § 3 · Xi 评价维度说明（0–4）============
  // 含义：同一环节内，教师行为变化与学生能力证据变化同时出现的强度
  // 注意：4 分在 B 级证据阶段几乎不可达（需要学生的明确叙说）
  const XI_RUBRIC_LEVELS = [
    { score: 0, label: '无同时出现',         desc: '教师行为有记录，但无对应学生证据变化' },
    { score: 1, label: '弱同时出现',         desc: '方向一致但变化微弱，可能是噪声' },
    { score: 2, label: '可观察同时出现',     desc: '方向一致，学生证据有可观察变化，单一来源' },
    { score: 3, label: '多源同时出现',       desc: '方向一致，来自多个证据源，变化幅度明显' },
    { score: 4, label: '强同时出现（含叙说）', desc: '学生能在反思中说明"因教师做了 X，我才改变了 Y"' },
  ];

  // ============ § 4 · 核心计算函数 ============

  /**
   * 计算单个环节的 COUPLING 分数。
   *
   * @param {string} envId          - 'E01'–'E09'
   * @param {Object} envXiScores    - 该环节的 Xi 评价指标得分，如 { X2: 2.5 }（0–4）
   * @param {number} x1Score        - 本轮 X1 评价指标得分（0–4 整数）
   * @param {string} evidenceLevel  - 'A' | 'B' | 'C' | 'D'
   * @returns {number|null}         - 保留 1 位小数；该环节无耦合维度则返回 null
   */
  function computeStationCoupling(envId, envXiScores, x1Score, evidenceLevel) {
    const dims = STATION_COUPLING_DIMS[envId];
    if (!dims || dims.length === 0) return null;

    const scores = dims.map(d => envXiScores[d] ?? 0);
    const rawAvg = scores.reduce((a, b) => a + b, 0) / scores.length;

    const evidenceCoef = EVIDENCE_COEFFICIENTS[evidenceLevel] ?? EVIDENCE_COEFFICIENTS.B;

    const x1Key = Math.min(4, Math.max(0, Math.round(x1Score)));
    const x1Coef = X1_GLOBAL_COEFFICIENT[x1Key] ?? 0.85;

    return roundRubric(rawAvg * evidenceCoef * x1Coef, 1);
  }

  /**
   * 计算全部 9 个环节的 COUPLING 数组（顺序对应 E01–E09）。
   *
   * @param {Object} perEnvXiScores - 按环节 ID 分组的 Xi 得分，如 { E03: { X2: 2.5 }, E04: { X3: 2.0 } }
   * @param {number} x1Score        - 本轮 X1 评价指标得分（0–4）
   * @param {string} evidenceLevel  - 'A' | 'B' | 'C' | 'D'
   * @returns {Array<number|null>}  - 9 个值，null 表示该环节无耦合维度
   */
  function computeCouplingLane(perEnvXiScores, x1Score, evidenceLevel) {
    return ['E01', 'E02', 'E03', 'E04', 'E05', 'E06', 'E07', 'E08', 'E09'].map(id =>
      computeStationCoupling(id, perEnvXiScores[id] || {}, x1Score, evidenceLevel)
    );
  }

  function validateRubricBlock(block) {
    if (!block || typeof block !== 'object') return '评价指标数据必须是对象';
    if (typeof block.x1 !== 'number' || !Number.isFinite(block.x1) || block.x1 < 0 || block.x1 > 4) {
      return 'x1 必须是 0–4 的数字';
    }
    if (!block.perEnv || typeof block.perEnv !== 'object') return '缺少 perEnv 评价指标得分';
    for (const [envId, dims] of Object.entries(block.perEnv)) {
      if (!Object.prototype.hasOwnProperty.call(STATION_COUPLING_DIMS, envId)) {
        return `未知环节 ${envId}`;
      }
      const applicable = STATION_COUPLING_DIMS[envId];
      if (!applicable || !applicable.length) return `${envId} 未设置局部耦合维度，不应提供评价指标得分`;
      if (!dims || typeof dims !== 'object') return `${envId} 评价指标得分必须是对象`;
      for (const [dimId, score] of Object.entries(dims)) {
        if (!applicable.includes(dimId)) return `${envId}.${dimId} 不属于该环节适用维度`;
        if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 4) {
          return `${envId}.${dimId} 必须是 0–4 的数字`;
        }
      }
      for (const dimId of applicable) {
        if (typeof dims[dimId] !== 'number') return `${envId}.${dimId} 缺失`;
      }
    }
    for (const [envId, dims] of Object.entries(STATION_COUPLING_DIMS)) {
      if (dims?.length && !block.perEnv[envId]) return `${envId} 缺少局部耦合评价指标分`;
    }
    return null;
  }

  // ============ § 5 · 样本评价指标得分（仿真 · B 级证据）============
  // 真实课堂数据接入后，用实测值替换 perEnv 中的 Xi 得分。
  // X1 全局得分也应随新教师目标对齐质量更新。
  //
  // 验算（cumulative，X1=3，B级）：
  //   E03 X2=2.5 → 2.5 × 0.95 × 0.80 = 1.9
  //   E04 X3=2.0 → 2.0 × 0.76 = 1.5
  //   E06 X4=3.0 → 3.0 × 0.76 = 2.3
  //   E07 avg(3,3)=3.0 → 2.3
  //   E08 X5=2.0 → 1.5
  const SAMPLE_XI_RUBRIC_SCORES = {
    cumulative: {
      x1: 3,  // 本轮教师目标对齐高度一致（问题链、任务、评价标准指向同一能力）
      perEnv: {
        E03: { X2: 2.5 },          // 问题链重写后高阶回应明显，但复杂场景追问仍有缺口
        E04: { X3: 2.0 },          // 案例被真实使用，政策引用准确率仍不足（38%）
        E06: { X4: 3.0 },          // 五方角色任务激活多方，少数学生沉默仍存在
        E07: { X4: 3.0, X5: 3.0 }, // 即时处理沉默 + 反馈后修正闭环在讨论中出现
        E08: { X5: 2.0 },          // 反馈后修正发生，但观点迁移至新情境仍不完整
      },
    },
    weekly: {
      x1: 3,
      perEnv: {
        E03: { X2: 1.5 },
        E04: { X3: 1.0 },
        E06: { X4: 2.0 },
        E07: { X4: 2.0, X5: 2.0 },
        E08: { X5: 1.0 },
      },
    },
    single: {
      x1: 3,
      perEnv: {
        E03: { X2: 0.5 },
        E04: { X3: 0.5 },
        E06: { X4: 1.0 },
        E07: { X4: 1.0, X5: 1.0 },
        E08: { X5: 0.5 },
      },
    },
  };

  // ============ § 6 · 快捷入口（供 data-render.js 调用）============

  /**
   * 用样本数据生成指定时段的 COUPLING 数组（B 级证据）。
   * 样本与 LIVE 均通过此入口生成 COUPLING；LIVE 需显式传入 rubricBlock。
   *
   * @param {'cumulative'|'weekly'|'single'} mode
   * @returns {Array<number|null>}
   */
  function buildCouplingLane(mode, rubricBlock, evidenceLevel) {
    const block = rubricBlock || SAMPLE_XI_RUBRIC_SCORES[mode];
    if (!block || validateRubricBlock(block)) return null;
    return computeCouplingLane(block.perEnv, block.x1, evidenceLevel || 'B');
  }

  // ============ § 6B · 桥接耦合（v2 · env → event）============
  // 把 9 元环节耦合数组按 framework.ENV_TO_EVENT 映射成 COUPLING 连接列表，
  // 供“教师环节 → 学生节点”视图使用。连线强度仍来自同一评价指标结果；
  // 主路径使用环节值，次路径仅作 0.5 权重线索，不启用第二套公式。
  //
  // @returns {Array<{envId, envIndex, eventId, isPrimary, strength}>}
  // envIndex（0-8）供 data-render.js renderCouplingBridge 在 9 列坐标系里定位连线起点。
  function buildBridgeCoupling(mode, rubricBlock, evidenceLevel) {
    const block = rubricBlock || SAMPLE_XI_RUBRIC_SCORES[mode];
    const level = evidenceLevel || 'B';
    const lane = buildCouplingLane(mode, block, level);
    const EF = window.PharmacoPilotEvaluationFramework;
    if (!lane || !EF || !EF.ENV_TO_EVENT) return [];
    const envIds = ['E01','E02','E03','E04','E05','E06','E07','E08','E09'];
    const out = [];
    envIds.forEach((envId, i) => {
      const strength = lane[i];
      if (strength == null || strength <= 0) return;
      const link = EF.ENV_TO_EVENT[envId];
      if (!link) return;
      const dims = STATION_COUPLING_DIMS[envId] || [];
      const scores = dims.map(dimId => block.perEnv[envId]?.[dimId] ?? 0);
      const xiAverage = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
      const x1Key = Math.min(4, Math.max(0, Math.round(block.x1)));
      const meta = {
        dims,
        xiScores: Object.fromEntries(dims.map(dimId => [dimId, block.perEnv[envId]?.[dimId] ?? 0])),
        xiAverage: +xiAverage.toFixed(2),
        stationStrength: strength,
        x1Score: block.x1,
        x1Coefficient: X1_GLOBAL_COEFFICIENT[x1Key],
        evidenceLevel: level,
        evidenceCoefficient: EVIDENCE_COEFFICIENTS[level] ?? EVIDENCE_COEFFICIENTS.B,
      };
      if (link.primary)   out.push({ envId, envIndex: i, eventId: link.primary,   isPrimary: true,  strength, ...meta });
      if (link.secondary) out.push({ envId, envIndex: i, eventId: link.secondary, isPrimary: false, strength: roundRubric(strength * 0.5, 2), ...meta });
    });
    return out;
  }

  function buildCouplingProfile(mode, rubricBlock, evidenceLevel) {
    const block = rubricBlock || SAMPLE_XI_RUBRIC_SCORES[mode];
    if (!block) return { ok: false, error: '缺少 COUPLING 评价指标', lane: Array(9).fill(null), bridges: [] };
    const error = validateRubricBlock(block);
    if (error) return { ok: false, error, lane: Array(9).fill(null), bridges: [] };
    const level = evidenceLevel || 'B';
    return {
      ok: true,
      error: null,
      rubric: block,
      evidenceLevel: level,
      lane: buildCouplingLane(mode, block, level),
      bridges: buildBridgeCoupling(mode, block, level),
    };
  }

  /**
   * 汇总的是“已设置局部评价指标的环节平均关联强度”，不是九环节求和指数。
   * coverage 独立报告，避免多测几个环节就机械抬高总值。
   */
  function buildAssociationSummary(lane, totalStations) {
    const values = (lane || []).filter(v => typeof v === 'number' && Number.isFinite(v));
    const total = Number.isInteger(totalStations) && totalStations > 0 ? totalStations : 9;
    if (!values.length) {
      return { available: false, mean: null, covered: 0, total, coverageRate: 0, scaleMax: 4 };
    }
    const mean = roundRubric(values.reduce((a, b) => a + b, 0) / values.length, 1);
    return {
      available: true,
      mean,
      covered: values.length,
      total,
      coverageRate: roundRubric(values.length / total, 2),
      scaleMax: 4,
    };
  }

  // ============ § 7 · 量程快查（调试 / 文档用）============
  // 示例：buildRangeTable('B', 2) 返回 Xi=0–4 时的 COUPLING 值

  function buildRangeTable(evidenceLevel, x1Score) {
    return [0, 1, 2, 3, 4].map(xi => ({
      xiScore: xi,
      coupling: computeStationCoupling('E03', { X2: xi }, x1Score, evidenceLevel),
    }));
  }

  // ============ EXPORT ============
  window.PharmacoPilotEvaluationContract = {
    X1_GLOBAL_COEFFICIENT,
    EVIDENCE_COEFFICIENTS,
    STATION_COUPLING_DIMS,
    XI_RUBRIC_LEVELS,
    SAMPLE_XI_RUBRIC_SCORES,
    computeStationCoupling,
    computeCouplingLane,
    validateRubricBlock,
    buildCouplingLane,
    buildBridgeCoupling,
    buildCouplingProfile,
    buildAssociationSummary,
    buildRangeTable,
  };
})();
