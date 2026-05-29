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
 * 补充 evaluation-framework.js，不替换。
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

  // ============ § 3 · Xi 维度量规说明（0–4）============
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
   * @param {Object} envXiScores    - 该环节的 Xi 量规得分，如 { X2: 2.5 }（0–4）
   * @param {number} x1Score        - 本轮 X1 量规得分（0–4 整数）
   * @param {string} evidenceLevel  - 'A' | 'B' | 'C' | 'D'
   * @returns {number|null}         - 保留 1 位小数；该环节无耦合维度则返回 null
   */
  function computeStationCoupling(envId, envXiScores, x1Score, evidenceLevel) {
    const dims = STATION_COUPLING_DIMS[envId];
    if (!dims || dims.length === 0) return null;

    const scores = dims.map(d => envXiScores[d] ?? 0);
    const rawAvg = scores.reduce((a, b) => a + b, 0) / scores.length;

    const evidenceCoefs = { A: 1.0, B: 0.8, C: 0.5, D: 0.2 };
    const evidenceCoef = evidenceCoefs[evidenceLevel] ?? 0.8;

    const x1Key = Math.min(4, Math.max(0, Math.round(x1Score)));
    const x1Coef = X1_GLOBAL_COEFFICIENT[x1Key] ?? 0.85;

    return +(rawAvg * evidenceCoef * x1Coef).toFixed(1);
  }

  /**
   * 计算全部 9 个环节的 COUPLING 数组（顺序对应 E01–E09）。
   *
   * @param {Object} perEnvXiScores - 按环节 ID 分组的 Xi 得分，如 { E03: { X2: 2.5 }, E04: { X3: 2.0 } }
   * @param {number} x1Score        - 本轮 X1 量规得分（0–4）
   * @param {string} evidenceLevel  - 'A' | 'B' | 'C' | 'D'
   * @returns {Array<number|null>}  - 9 个值，null 表示该环节无耦合维度
   */
  function computeCouplingLane(perEnvXiScores, x1Score, evidenceLevel) {
    return ['E01', 'E02', 'E03', 'E04', 'E05', 'E06', 'E07', 'E08', 'E09'].map(id =>
      computeStationCoupling(id, perEnvXiScores[id] || {}, x1Score, evidenceLevel)
    );
  }

  // ============ § 5 · 样本量规得分（仿真 · B 级证据）============
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
      x1: 3,  // 本轮教师目标对齐高度一致（问题链、任务、量规指向同一能力）
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
   * 可作为 evaluation-framework.js deriveCouplingLane() 的替代数据源。
   *
   * @param {'cumulative'|'weekly'|'single'} mode
   * @returns {Array<number|null>}
   */
  function buildCouplingLane(mode) {
    const sample = SAMPLE_XI_RUBRIC_SCORES[mode];
    if (!sample) return null;
    return computeCouplingLane(sample.perEnv, sample.x1, 'B');
  }

  // ============ § 6B · 桥接耦合（v2 · env → event）============
  // 把 9 元环节耦合数组按 framework.ENV_TO_EVENT 映射成 COUPLING 连接列表，
  // 供需要"教师环节 → 学生节点"语义的视图使用（data-render.js 的 renderCouplingBridge
  // 默认走 framework.deriveBridges 的 √ 公式；本函数提供量规驱动的等价物，便于二者对照）。
  //
  // @returns {Array<{envId, eventId, isPrimary, strength}>}
  function buildBridgeCoupling(mode) {
    const lane = buildCouplingLane(mode);
    const EF = window.PharmacoPilotEvaluationFramework;
    if (!lane || !EF || !EF.ENV_TO_EVENT) return [];
    const envIds = ['E01','E02','E03','E04','E05','E06','E07','E08','E09'];
    const out = [];
    envIds.forEach((envId, i) => {
      const strength = lane[i];
      if (strength == null || strength <= 0) return;
      const link = EF.ENV_TO_EVENT[envId];
      if (!link) return;
      if (link.primary)   out.push({ envId, eventId: link.primary,   isPrimary: true,  strength });
      if (link.secondary) out.push({ envId, eventId: link.secondary, isPrimary: false, strength: +(strength * 0.5).toFixed(2) });
    });
    return out;
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
    STATION_COUPLING_DIMS,
    XI_RUBRIC_LEVELS,
    SAMPLE_XI_RUBRIC_SCORES,
    computeStationCoupling,
    computeCouplingLane,
    buildCouplingLane,
    buildBridgeCoupling,
    buildRangeTable,
  };
})();
