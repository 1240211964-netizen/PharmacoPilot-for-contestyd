/* ============================================================
 * evaluation-framework.js — 教学数据页 评价体系定义
 * ------------------------------------------------------------
 * 角色：
 *   1) 规范文档 — 把页面里所有数字背后的"语义"明文化
 *   2) 可执行模块 — data-render.js 从这里取常量、矩阵、公式
 *
 * 与设计文档对齐：PharmacoPilot 教学数据评价体系系统设计 v1.0
 *   · 9 个教学环节（课前 5 + 课中 1 + 课后 3）
 *   · 教师 8 维（含课程定位、课堂流程、AI 协同）
 *   · 学生 7 维（含反思迁移与自我调节）
 *   · 师生耦合 5 维（X1-X5，当前 spine 仍渲染综合 coupling，X1-X5 留作下一阶段下钻）
 *   · 4 类数据源 + A/B/C/D 证据等级（系数 1.0 / 0.8 / 0.5 / 0.2）
 * ============================================================ */

(function () {
  'use strict';

  // ============ § 1 · 量程与单位 ============
  const SCALE = {
    name: '10 分制能力评分',
    perDimension: { min: 0, max: 10 },
    deltaMeaning: '同一维度从基线到当前的分数差',
    overallPercentMeaning: '维度合计涨幅 / 满分 × 100%',
    refs: [
      { cite: 'AACP CAPE 2013', note: '药学教育子能力 1-4 级量表的扩展（10 分制提供更细的 Δ 分辨率）' },
      { cite: 'Hattie 2009 可见的学习', note: '效应量 d ≥ 0.4 视为显著 → 10 分制 +4 即对应 d ≈ 0.4 标准差' },
      { cite: 'Black & Wiliam 1998 形成性评价', note: '把评分作为可迭代信号而非终结性判断' },
    ],
    // 等级化呈现（0-4 级，与 doc §9.1 对齐）— 用于在 hover/抽屉里把分数翻译为叙事档位
    levels: [
      { range: [0, 1], code: 'L0', name: '无证据' },
      { range: [1, 3], code: 'L1', name: '形式完成' },
      { range: [3, 5], code: 'L2', name: '基本可用' },
      { range: [5, 7], code: 'L3', name: '有效应用' },
      { range: [7, 10], code: 'L4', name: '可迁移复用' },
    ],
  };

  // ============ § 1B · 证据等级（A/B/C/D） ============
  const EVIDENCE_LEVELS = {
    A: { label: '强证据',     coefficient: 1.0, badge: 'A', desc: '真实课堂数据 + 学生作品 + 教师修改记录 + 量规评分' },
    B: { label: '中强证据',   coefficient: 0.8, badge: 'B', desc: '虚拟班级演练 + 教师行为记录 + 产物版本对比' },
    C: { label: '弱证据',     coefficient: 0.5, badge: 'C', desc: '单一日志或单一作品证据' },
    D: { label: '暂不采信',   coefficient: 0.2, badge: 'D', desc: '仅自评、主观描述或展示性数据' },
  };
  // 当前原型阶段：展示数字**源自** B 级证据（虚拟演练），这是**溯源标签**，不是对数值的折扣。
  // 证据系数(B=0.8)只作用于 COUPLING 的**置信度**（见 evaluation-contract.computeStationCoupling），
  // **不打折**教师/学生能力 Δ 与 headline %——能力增量是仿真里的实测增益，按面值呈现。
  const CURRENT_EVIDENCE_LEVEL = 'B';

  // ============ § 1C · 数据源状态（hero 下方"数据源与证据等级"区块用） ============
  const DATA_SOURCE_STATUS = [
    {
      id: 'practice', label: '教学实践数据',
      status: '已同步', statusType: 'ok',
      sampleCount: '虚拟演练 #03 · 17 次模拟课堂',
      evidenceLevel: 'B',
    },
    {
      id: 'behavior', label: '教师编辑行为',
      status: '已同步', statusType: 'ok',
      sampleCount: '采纳 6 · 修改 9 · 退回 2',
      evidenceLevel: 'B',
    },
    {
      id: 'real',     label: '真实课堂数据',
      status: '待接入泛雅', statusType: 'pending',
      sampleCount: '0',
      evidenceLevel: null,
    },
  ];

  // ============ § 2 · 6→8 教师维度 + 6→7 学生维度 ============
  // 与设计文档 §6.1 / §7.1 完全对齐
  const TEACHER_DIMS = [
    { id: 'T1', name: '课程定位与学情解释能力', short: '学情解释', refs: ['Shulman 1987 PCK'] },
    { id: 'T2', name: '目标—评价对齐能力',     short: '目标对齐', refs: ['Biggs 1996 建设性对齐', '崔允漷 教学评一体化'] },
    { id: 'T3', name: '药事情境转译能力',       short: '情境转译', refs: ['Shulman 1987 PCK', '邵蓉 药事管理教育'] },
    { id: 'T4', name: '内容结构与问题链设计能力', short: '问题链', refs: ['Bloom × SOLO 认知层级'] },
    { id: 'T5', name: '课堂流程与认知负荷管理能力', short: '流程节奏', refs: ['Sweller 认知负荷理论'] },
    { id: 'T6', name: '探究协作与互动调控能力', short: '互动调控', refs: ['ICAP 2014 学习参与'] },
    { id: 'T7', name: '证据反馈与评价诊断能力', short: '证据反馈', refs: ['Black & Wiliam 1998', 'Hattie 2009'] },
    { id: 'T8', name: '反思迭代与 AI 协同能力', short: 'AI 协同', refs: ['Zimmerman 2002 自我调节'] },
  ];

  const STUDENT_DIMS = [
    { id: 'S1', name: '管理工具迁移能力',       short: '工具迁移',   refs: ['CAPE 2013 教育成果'] },
    { id: 'S2', name: '政策法规证据识读能力',   short: '政策识读',   refs: ['杨悦 药事法规与监管科学'] },
    { id: 'S3', name: '利益相关者分析能力',     short: '利益相关者', refs: ['邵蓉 药事管理教育'] },
    { id: 'S4', name: '风险与合规判断能力',     short: '风险合规',   refs: ['杨悦 药事法规'] },
    { id: 'S5', name: '决策方案可行性能力',     short: '方案可行性', refs: ['史录文 药学服务评价'] },
    { id: 'S6', name: '协作论证与表达能力',     short: '协作论证',   refs: ['ICAP 2014', 'Chi & Wylie'] },
    { id: 'S7', name: '反思迁移与自我调节能力', short: '反思迁移',   refs: ['Zimmerman 2002 自我调节'] },
  ];

  // ============ § 2C · 师生耦合 5 维（X1-X5） ============
  // 综合 COUPLING（spine 上的单数字）是几何平均，回答"师生在该环节是否同步上扬"
  // X1-X5 是同一现象的 5 维分解，回答"是哪种类型的耦合"——drawer 里 drill-down
  const COUPLING_DIMS = [
    { id: 'X1', name: '目标—任务—评价一致性',   short: '目标对齐一致' },
    { id: 'X2', name: '问题链—高阶思维耦合',     short: '问题链—思维' },
    { id: 'X3', name: '情境—证据使用耦合',       short: '情境—证据' },
    { id: 'X4', name: '互动调控—参与公平耦合',   short: '互动—参与公平' },
    { id: 'X5', name: '反馈—修正闭环耦合',       short: '反馈—修正' },
  ];

  // 每个环节在 X1-X5 五维上的耦合强度（0-3 量程，与综合 COUPLING 同量程）
  // 数据来源：教师设计行为 × 学生学习证据 的跨度量分析
  const ENV_COUPLING_X = {
    E01: { X1: 0.6, X2: 0,   X3: 0,   X4: 0,   X5: 0   },
    E02: { X1: 0.8, X2: 0.3, X3: 0.2, X4: 0,   X5: 0   },
    E03: { X1: 0.5, X2: 1.8, X3: 0.6, X4: 0,   X5: 0.4 }, // X2 主导（与综合 1.8 吻合）
    E04: { X1: 0.3, X2: 0.3, X3: 1.5, X4: 0.4, X5: 0   }, // X3 主导
    E05: { X1: 0.3, X2: 0.3, X3: 1.2, X4: 1.0, X5: 0.5 },
    E06: { X1: 0.4, X2: 0.5, X3: 1.3, X4: 2.2, X5: 0.8 }, // X4 主导
    E07: { X1: 0.3, X2: 0.4, X3: 0.5, X4: 2.0, X5: 2.2 }, // X5 主导
    E08: { X1: 0.8, X2: 0.3, X3: 0.5, X4: 0.3, X5: 1.5 }, // X5 主导
    E09: { X1: 0.4, X2: 0.3, X3: 0,   X4: 0.3, X5: 0.7 },
  };

  // ============ § 3 · 9 个教学环节（教师轴） ============
  // 课前 5 (E01-E05) + 课中 1 (E06) + 课后 3 (E07-E09)
  // co 字段：'co'=师生共在（E06 即时互动 / E07 表现性评价），'solo'=教师独立活动
  // 这一栏决定 atlas 视觉分组、KEEP/FIX 选哪个池、coupling chip 是"同步耦合"还是"延迟相关"
  //
  // 设计说明（双时间轴架构 · v2）：
  //   教师轴是过程性的，9 个环节描述「教师正在做什么」；
  //   学生轴是结果性的，5 个产出节点（见 § 3B STUDENT_EVENTS）描述「学生何时产生可观测证据」；
  //   两轴**节奏不同、不强行同列对齐**——避免在教师独立环节（solo）虚构学生增量。
  //   COUPLING 从同列耦合改为「教师环节 → 学生节点」的 COUPLING 连线（见 § 3C ENV_TO_EVENT）。
  const ENVIRONMENTS = [
    { id: 'E01', num: '01', name: '学习者画像与课程情境诊断', short: '学情诊断', phase: 'pre',  phaseName: '课前 · 设计与准备', co: 'solo' },
    { id: 'E02', num: '02', name: '学习目标—评价证据—量规对齐', short: '目标与量规', phase: 'pre',  phaseName: '课前 · 设计与准备', co: 'solo' },
    { id: 'E03', num: '03', name: '知识结构与关键误区定位',     short: '知识与误区', phase: 'pre',  phaseName: '课前 · 设计与准备', co: 'solo' },
    { id: 'E04', num: '04', name: '真实药事管理案例与证据包',   short: '案例与证据', phase: 'pre',  phaseName: '课前 · 设计与准备', co: 'solo' },
    { id: 'E05', num: '05', name: '课堂任务链与支架设计',       short: '任务链设计', phase: 'pre',  phaseName: '课前 · 设计与准备', co: 'solo' },
    { id: 'E06', num: '06', name: '课中学情捕捉与即时干预',     short: '课中调控',   phase: 'in',   phaseName: '课中 · 实施与调控', co: 'co'   },
    { id: 'E07', num: '07', name: '表现性评价与学生能力画像',   short: '评价与画像', phase: 'post', phaseName: '课后 · 评价与沉淀', co: 'co'   },
    { id: 'E08', num: '08', name: '教师教学复盘与改进决策',     short: '复盘与决策', phase: 'post', phaseName: '课后 · 评价与沉淀', co: 'solo' },
    { id: 'E09', num: '09', name: '课例资产沉淀与知识库更新',   short: '资产沉淀',   phase: 'post', phaseName: '课后 · 评价与沉淀', co: 'solo' },
  ];
  function getEnvCoCategory(envId) {
    const e = ENVIRONMENTS.find(x => x.id === envId);
    return e?.co || 'solo';
  }

  // ============ § 3B · 5 个学生产出节点（学生轴） ============
  // 学生能力的可观测证据并不沿教师 9 环节平均产生，
  // 而是集中在 5 个产出节点；每个节点对应一次可测量的学生行为。
  //
  // 字段：
  //   anchor    — 该节点在教师轴上的"锚定"列（用于视觉定位）；课前/课后节点用 'pre' / 'post' 表示在表格外侧
  //   anchorEnv — 主锚定环节（决定 atlas 中该节点圆心的横坐标）
  //   spanEnvs  — 该节点的证据来源跨越的教师环节（视觉上画接收带）
  //   dims      — 该节点主要测得的学生维度（用于权重计算节点综合分）
  //   evidence  — 默认证据等级
  const STUDENT_EVENTS = [
    {
      id: 'EV0', num: 'E0', name: '入学基线', short: '基线',
      timing: 'pre-course', whenLabel: '第 1 周 · 课前',
      anchor: 'pre', anchorEnv: null, spanEnvs: [],
      dims: ['S1','S2','S3','S4','S5','S6','S7'],   // 7 维全测，作为基线
      evidence: 'A',
      source: '入学前测 · 32 卷',
      role: '基线（无增量，作为后续节点的对照参考）',
    },
    {
      id: 'EV1', num: 'E1', name: '课中表现', short: '课中',
      timing: 'in-class', whenLabel: '第 7 周 · 课中',
      anchor: 'inline', anchorEnv: 'E06', spanEnvs: ['E03','E04','E05','E06'],
      dims: ['S3','S6','S2'],                       // 课中讨论主要显化：利益相关者识别 / 协作论证 / 政策识读
      evidence: 'B',
      source: '任务卡评分 + 互动热图 + 话语编码',
      role: '课中即时产出（教师 E03-E05 设计 + E06 调控的兑现点）',
    },
    {
      id: 'EV2', num: 'E2', name: '评价画像', short: '评价',
      timing: 'post-class', whenLabel: '课后 1-3 天',
      anchor: 'inline', anchorEnv: 'E07', spanEnvs: ['E02','E04','E07'],
      dims: ['S2','S4','S5'],                       // 表现性评价主要显化：政策识读 / 风险合规 / 方案可行性
      evidence: 'B',
      source: '作品评估 + 量规打分',
      role: '课后表现性评价（教师 E02 目标 + E07 量规的兑现点）',
    },
    {
      id: 'EV3', num: 'E3', name: '反思迁移', short: '反思',
      timing: 'post-class', whenLabel: '课后 7 天',
      anchor: 'inline', anchorEnv: 'E08', spanEnvs: ['E08'],
      dims: ['S7','S1'],                            // 反思文本主要显化：反思迁移 / 工具迁移
      evidence: 'B',
      source: '反思文本 + 版本对比记录',
      role: '反思产物（教师 E08 复盘前后学生侧的对位证据）',
    },
    {
      id: 'EV4', num: 'E4', name: '迁移测试', short: '迁移',
      timing: 'post-course', whenLabel: '课后 +30 天',
      anchor: 'post', anchorEnv: null, spanEnvs: [],
      dims: ['S1','S2','S3','S4','S5','S6','S7'],   // 7 维综合后测
      evidence: 'C',                                // 待真实课堂数据接入前默认 C
      source: '新情境迁移任务 · 待接入真实课堂',
      role: '远迁移测试（最终能力检验，与 EV0 形成完整前-后测对照）',
    },
  ];

  // ============ § 3C · 教师环节 → 学生节点 COUPLING 连线 ============
  // 取代「同列耦合」：每个教师环节通过一条主关联路径连到一个学生节点；
  // 部分环节有次要路径。COUPLING 不再是 9 个数字，而是 N 条连线的强度。
  //
  // pathStrength：关联通路的先验强度（0-1）—— 来自环节-节点的语义距离
  // decay：时间衰减（教师行为发生到学生证据出现的间隔越长越衰减）
  const ENV_TO_EVENT = {
    E01: { primary: 'EV0', secondary: null,  pathStrength: 0.6, decay: 1.0, role: '学情诊断 → 决定基线测什么' },
    E02: { primary: 'EV2', secondary: 'EV4', pathStrength: 0.6, decay: 0.7, role: '目标对齐 → 评价 + 迁移测试都用这套目标' },
    E03: { primary: 'EV1', secondary: 'EV2', pathStrength: 0.7, decay: 0.9, role: '知识与误区 → 课中体现' },
    E04: { primary: 'EV1', secondary: 'EV2', pathStrength: 0.8, decay: 0.9, role: '案例与证据 → 课中 + 评价都用' },
    E05: { primary: 'EV1', secondary: 'EV2', pathStrength: 0.6, decay: 0.9, role: '任务链设计 → 课中执行' },
    E06: { primary: 'EV1', secondary: null,  pathStrength: 1.0, decay: 1.0, role: '课中调控 ↔ 课中表现（实时双向）' },
    E07: { primary: 'EV2', secondary: null,  pathStrength: 1.0, decay: 1.0, role: '评价画像 ↔ 评价（同步）' },
    E08: { primary: 'EV3', secondary: null,  pathStrength: 0.9, decay: 0.95, role: '复盘 → 反思（学生反思文本是复盘的对位证据）' },
    E09: { primary: null,  secondary: null,  pathStrength: 0,   decay: 0,   role: '资产沉淀 → 下一轮 E01（跨课程，不计入本轮 coupling）' },
  };

  // ============ § 4 · 教学环节 × 维度 加权矩阵 ============
  // 权重：1.0 主驱动维度（×）/ 0.4 次要参与（·）/ 0 缺省
  const TEACHER_MATRIX = {
    E01: { T1: 1.0, T2: 0.4 },                    // 学情诊断 → T1 主
    E02: { T2: 1.0, T1: 0.4, T4: 0.4, T7: 0.4 },  // 目标证据 → T2 主
    E03: { T4: 1.0, T3: 0.4 },                    // 知识与误区 → T4 问题链主
    E04: { T3: 1.0, T4: 0.4 },                    // 案例与证据 → T3 转译主
    E05: { T5: 1.0, T6: 0.4 },                    // 任务链设计 → T5 主
    E06: { T6: 1.0, T7: 0.4 },                    // 课中调控 → T6 主 + T7 次
    E07: { T7: 1.0, T2: 0.4 },                    // 评价与画像 → T7 主
    E08: { T8: 1.0, T7: 0.4 },                    // 复盘与决策 → T8 主
    E09: { T8: 1.0 },                             // 资产沉淀 → T8 主
  };

  // 重平衡（2026-05）：原矩阵里 S1 工具迁移 / S4 风险合规 / S5 方案可行性 从不是任何环节的主驱动(1.0)，
  // 而 S2/S6/S7 各占 2 个主环节 → 7 维里 3 维结构性低估。现让 S1-S7 各恰有一个主驱动环节
  // （7 个有学生评估的环节 E03-E09 一一对应 7 维），并与 5 节点模型的维度覆盖对齐（EV2 测 S4/S5 不再悬空）。
  const STUDENT_MATRIX = {
    E01: { },                                     // 学情诊断阶段学生不直接评估
    E02: { S1: 0.4 },                             // 目标与量规 → S1 基线（课前，仅次要）
    E03: { S6: 1.0, S2: 0.4 },                    // 知识与误区 → S6 协作论证主（分歧锚点辩论）
    E04: { S2: 1.0, S3: 0.4, S4: 0.4 },           // 案例与证据 → S2 政策识读主
    E05: { S5: 1.0, S3: 0.4, S6: 0.4 },           // 任务链设计 → S5 方案可行性主（任务链导向可行决策）
    E06: { S3: 1.0, S6: 0.4, S7: 0.4 },           // 课中调控 → S3 利益相关者主（五方角色任务）
    E07: { S4: 1.0, S2: 0.4, S5: 0.4 },           // 评价与画像 → S4 风险合规主（表现性评价判风险）
    E08: { S7: 1.0, S1: 0.4 },                    // 复盘与决策 → S7 反思迁移主
    E09: { S1: 1.0, S7: 0.4 },                    // 资产沉淀 → S1 工具迁移主（资产复用＝迁移到下一情境）
  };

  const MATRIX_REFS = [
    { cite: 'Biggs 1996 建设性对齐', note: '活动 ↔ 目标 ↔ 评价三向对齐 → 每环节映射一主能力' },
    { cite: 'Shulman 1987 PCK',     note: '一个教学时刻同时调动多种能力 → 允许次要维度' },
    { cite: 'AACP CAPE 2013',       note: '学生子能力到课程活动的映射' },
    { cite: 'Hattie 2009 效应量',   note: '1.0 vs 0.4 二档约定的强度参照' },
    { cite: '邵蓉 / 史录文 / 杨悦', note: '药事管理 / 服务评价 / 法规三向，学生 7 维的本土锚' },
  ];

  // ============ § 5 · 聚合规则 ============
  function envScore(dimDeltas, weights) {
    let weightedSum = 0, weightTotal = 0;
    for (const dimId in weights) {
      const w = weights[dimId];
      const v = dimDeltas[dimId] ?? 0;
      weightedSum += w * v;
      weightTotal += w;
    }
    return weightTotal > 0 ? weightedSum / weightTotal : 0;
  }

  // ============ § 6 · COUPLING 公式 ============
  // COUPLING(env) = √(T_Δ × S_Δ) × syncCoef
  // 阈值：≥ 1.5 视为显著耦合（spine 上加 ★）
  const COUPLING_REFS = [
    { cite: '礼记·学记',           note: '「教学相长」— 师生互为发展条件的本土根基' },
    { cite: 'Vygotsky 1978 ZPD',  note: '耦合是最近发展区运作机制的量化' },
    { cite: 'Hattie 2009 可见的学习', note: 'visible teaching ↔ visible learning 互为前提' },
    { cite: 'Wenger 1998 实践共同体', note: 'mutual engagement 作为共生机制' },
    { cite: 'Stevens 1946 量表理论',  note: '两因子必同时存在时几何平均更稳健' },
    { cite: 'Pennings et al. 2018 课堂动力学', note: '时序同步度作为耦合的实证测度' },
  ];
  const COUPLING_THRESHOLDS = {
    weak:     { min: 0,   max: 0.8, label: '弱关联' },
    moderate: { min: 0.8, max: 1.5, label: '中等关联' },
    strong:   { min: 1.5, max: 3.0, label: '显著耦合 ★' },
  };
  function coupling(tDelta, sDelta, syncCoef) {
    if (tDelta == null || sDelta == null || tDelta <= 0 || sDelta <= 0) return null;
    const sc = syncCoef == null ? 0.45 : syncCoef;
    return Math.sqrt(tDelta * sDelta) * sc;
  }

  // ============ § 6B · COUPLING 连线公式（双时间轴版）============
  // 旧公式：COUPLING_env = √(T_Δ_env × S_Δ_env) × syncCoef        ← 同列同步耦合
  // 新公式：BRIDGE(env_i → event_j) = √(T_Δ_env_i × Event_Δ_event_j)
  //                                   × pathStrength(i,j)             ← 语义距离
  //                                   × decay(Δt)                     ← 时间衰减
  //                                   × syncCoef                      ← 同步系数
  //
  // 关键差别：教师行为与学生证据**不在同一列**，而通过 ENV_TO_EVENT 表里的关联链桥接。
  // 例：教师 E03 知识设计的质量影响学生 EV1 课中表现 (primary) + EV2 评价画像 (secondary)。
  function couplingBridge(envId, eventId, tDelta, eventDelta, syncCoef) {
    const link = ENV_TO_EVENT[envId];
    if (!link) return null;
    if (link.primary !== eventId && link.secondary !== eventId) return null;
    if (tDelta == null || eventDelta == null || tDelta <= 0 || eventDelta <= 0) return null;
    const isPrimary = (link.primary === eventId);
    const path = link.pathStrength * (isPrimary ? 1.0 : 0.5);
    const decay = link.decay;
    const sc = syncCoef == null ? 0.45 : syncCoef;
    return Math.sqrt(tDelta * eventDelta) * path * decay * sc;
  }

  // ============ § 7 · 时段基线 ============
  const BASELINES = {
    cumulative: { label: '7 周累计', detail: '第 1 周入学测 vs 第 7 周末综合测', sessionCount: 17 },
    weekly:     { label: '第 7 周',   detail: '本周第 1 节课前测 vs 本周第 3 节课后测', sessionCount: 3 },
    single:     { label: 'SESSION #3417', detail: '本节课课前测 vs 课后测', sessionCount: 1 },
  };

  // ============ § 8 · 数据来源（每个 dim 的原始信号） ============
  const DATA_SOURCES = {
    T1: ['学情诊断卡', '学生误区识别', '前测解释', '课程定位修改记录'],
    T2: ['学习目标文本', '评价证据表', '量规', '目标修改记录'],
    T3: ['药事情境卡', '政策证据卡', '案例资源', '利益相关者设定'],
    T4: ['问题链', '分歧锚点', '高阶追问', '学生回应质量'],
    T5: ['时间轴', '活动切换', '教师讲授占比', '学生说话占比', '沉默段落'],
    T6: ['分组任务卡', '角色卡', '互动热图', '即时介入记录'],
    T7: ['反馈语', '作业批注', '证据引用纠错', '能力诊断报告'],
    T8: ['AI 草案采纳率', '修改深度', '退回次数', '确认发布', '复盘文本', '资产写回'],
    S1: ['课程间迁移作业评分'],
    S2: ['案例分析作业 + AI 文本评估（政策原文引用度）'],
    S3: ['小组讨论录音转录 + AI 论证图谱'],
    S4: ['情境化判断题 + 量规打分'],
    S5: ['总结性方案评估 + 量规打分'],
    S6: ['小组讨论录音转录 + 论证质量评分'],
    S7: ['课后反思文本', '版本对比记录', '迁移作业'],
  };

  // ============ § 8B · 每环节证据卡（环节抽屉用） ============
  // 与设计文档 §11.7 对齐：每个环节展开后看到「教师证据 / 学生证据 / 耦合解释 / 写回建议」
  // 3 hot envs（E03/E06/E07）有完整叙述；其余 6 环节给最简骨架，可逐步补充。
  const ENV_EVIDENCE = {
    E01: {
      teacher: [
        '基于 32 人入学前测识别「SWOT 被列表化」为主要误区（占 18 / 32 卷）',
        '诊断卡修改 2 次，最终聚焦「药事情境下的内外因区分」作为本节核心冲突',
      ],
      student: [
        '入学前测平均 6.2 / 10；75% 学生对 SWOT 有概念但缺药事情境锚定',
      ],
      coupling: '本环节学生不直接评估能力增量，教师诊断质量为后续 8 环节定基线。',
      writeback: [
        { env: '03 问题链', note: '依据诊断把"列表化陷阱"做成第 3 题分歧锚点' },
      ],
    },
    E02: {
      teacher: [
        '把"理解 SWOT"重写为"能用 SWOT 解释一个集采替代的内外因冲突"',
        '同步设计 5 维评价证据表：政策识读 / 利益相关者 / 风险判断 / 方案可行性 / 协作论证',
      ],
      student: [
        '学生对"本节要产出什么"的清晰度从基线 5.4 → 6.4（自我反馈）',
      ],
      coupling: '目标—评价对齐是 03 问题链 + 08 评价诊断的前置条件，本身耦合不强但贡献基线。',
      writeback: [
        { env: '08 诊断', note: '量规按本环节定义的 5 维证据展开' },
      ],
    },
    E03: {
      teacher: [
        '把"什么是 SWOT"改写为递进 4 题：定义 → 应用 → 分歧锚点 → 反例修正',
        '第 3 题加入 A/B 立场切换（医保 vs 药企），分歧密度从 0.4 → 1.6 提升 4 倍',
        '<b>修改深度</b>：结构性修改（重写问题位次），非措辞调整',
      ],
      student: [
        'A/B 立场对立密度上升与协作论证表达 ↑4.2 同向上扬',
        '小组讨论中"基于证据反驳"的发言占比从 12% → 38%',
      ],
      coupling: '<b>数据提示</b>：分歧锚点的引入与学生协作论证能力增强同时出现 · COUPLING 1.8 · 证据等级 <b>B</b> · <b>建议</b>在真实课堂继续验证。',
      writeback: [
        { env: '03 问题链', note: '沉淀"分歧锚点四步问题链"为可复用模板 P-03-α' },
        { env: '资产库', note: '问题链模板写入个人教学资产库' },
      ],
    },
    E04: {
      teacher: [
        '案例改写为"集采乙类药品替代决策"，附《国办发〔2019〕2 号》集采试点方案原文',
        '增加 5 类利益相关者角色卡（医保 / 医院 / 药店 / 患者 / 药企）',
      ],
      student: [
        '学生引用政策原文从 22% → 47%；利益相关者识别覆盖度从 2.8 / 5 → 4.1 / 5',
      ],
      coupling: '案例真实度提升与学生政策识读、利益相关者分析能力同向上扬 · COUPLING 1.5。',
      writeback: [
        { env: '08 诊断', note: '把政策引用准确率纳入评价量规' },
      ],
    },
    E05: {
      teacher: [
        '把"什么是 SWOT"改写为递进 4 题：定义 → 应用 → 分歧锚点 → 反例修正',
        '第 3 题加入 A/B 立场切换（医保 vs 药企），<b>分歧密度从 0.4 → 1.6 提升 4 倍</b>',
        '<b>修改深度</b>：结构性修改（重写问题位次），非措辞调整',
      ],
      student: [
        'A/B 立场对立密度上升与 S6 协作论证表达 ↑4.2 同向上扬',
        '小组讨论中"基于证据反驳"的发言占比从 <b>12% → 38%</b>',
      ],
      coupling: '<b>数据提示</b>：分歧锚点的引入与学生协作论证能力增强同时出现 · COUPLING 1.8 · 证据等级 <b>B</b> · <b>建议</b>在真实课堂继续验证。',
      writeback: [
        { env: '05 任务链', note: '沉淀"分歧锚点四步问题链"为可复用模板 P-05-α' },
        { env: '资产库', note: '问题链模板写入个人教学资产库' },
      ],
      academic: {
        observation: '7 周 · 17 轮模拟 · n=32。分歧锚点（第 3–4 题立场切换）出现时段，<b>T4↑5.7</b> 与 <b>S6↑4.2</b> 同向上扬，COUPLING=1.8；无锚点时段两维增幅均 &lt;1.5，系数降至 0.9。差值具有描述性显著性，<b>尚未经推断检验</b>。',
        hypothesis: '基于<b>适度认知失衡理论</b> <cite>(Hmelo-Silver, 2004)</cite>：教师在第 3 题显式标注 A/B 立场分野，可能降低论证准入门槛，激活学生持续性产出辩论 <cite>(Mercer &amp; Littleton, 2007)</cite>；分歧锚点作为"最近发展区"触发器，使学生从陈述型话语转入论证型话语。',
        rival: '<b>① 话题显著性混淆</b>：集采政策与学生家庭切身相关（60% 有慢病家属），讨论密度可能由话题本身驱动，与问题链设计无关。<b>② 教师熟练度效应</b>：第 5–7 周较第 1–2 周教师整体把控能力更强，不可排除进步曲线贡献。',
      },
    },
    E06: {
      teacher: [
        '提问句式从"对吗？"改为"为什么这样安排？""谁会受影响？"',
        '即时反馈处理沉默学生 4 次（点名邀请药企背景学生发言），处理偏题 2 次',
        '<b>修改深度</b>：句式 + 介入时机双重重设',
      ],
      student: [
        '基于证据反驳的发言占比从 <b>18% → 62%</b>（手动话语编码 · 6 轮对比）',
        '沉默学生比例从 25% → 12%；协作论证表达 ↑4.2',
      ],
      coupling: '<b>数据提示</b>：认识论追问 + 即时干预与课堂参与公平度、协作论证能力同向上扬 · COUPLING 2.2 · 证据等级 <b>B</b> · <b>建议</b>验证 Hawthorne 效应。',
      writeback: [
        { env: '06 课中调控', note: '把"认识论追问 + 即时干预"固化为本课实践包默认行为' },
        { env: '资产库', note: '追问句式库写入资产库' },
      ],
      academic: {
        observation: '教师将闭合式追问（"对吗？"）替换为认识论追问（"为什么这样安排？"）后，<b>T6↑6.8、S6↑4.2</b>；话语编码显示，学生证据引用型发言比例从 <b>18% 升至 62%</b>（同一 6 轮对比，手动编码）。',
        hypothesis: '基于<b>责任话语理论</b> <cite>(Michaels et al., 2008)</cite>：认识论问题比确认性问题更能触发思维可见化（thinking aloud），使学生从断言性话语转入证据性话语；<b>即时干预沉默的时机效应</b> <cite>(Resnick, 2015)</cite> 可能降低低参与学生的发言门槛，提升课堂参与公平度。',
        rival: '<b>① 教师监控效应（Hawthorne Effect）</b>：教师有意改变提问方式本身可能引发学生警觉，独立于问题类型产生行为改变。<b>② 协同干预混淆</b>：提问方式改变与角色任务复杂度提升同期发生，难以单独归因于追问类型。',
      },
    },
    E07: {
      teacher: [
        '量规增加"证据准确性 / 证据相关性 / 证据用于决策"三级要求',
        '<b>但当前量规歧义 2 处</b>未解决（立场迁移度无可观察锚点）',
        'T7 证据反馈 ↑6.4（本轮所有维度最高）',
      ],
      student: [
        'S2 政策识读 ↑5.6 — 学生能表达立场并主动引用政策原文',
        '但 <b>25% 沉默学生在立场迁移度维度无有效评分记录</b>',
      ],
      coupling: '<b>FIX 信号</b>：COUPLING=2.7 本轮最强，但量规歧义可能<b>遮蔽</b>真实增幅 · 证据等级 <b>B</b> · <b>建议优先修正</b>量规并重新评分。',
      writeback: [
        { env: '07 评价与画像', note: '补充 3 级行为锚点量规（如"分组前后引用的政策条款是否升级"）' },
        { env: '资产库', note: '量规模板写入资产库供后续课题复用' },
      ],
      academic: {
        observation: '07 评价与画像为本轮 COUPLING 最高环节（<b>T7↑6.4、S2↑5.6，COUPLING=2.7</b>）；课后评分记录显示量规 R-04"立场迁移度"维度评分者间一致性偏低，5 类评审标注 <b>2 处歧义</b>，25% 沉默学生在该维度无有效评分记录。',
        hypothesis: '基于<b>建设性对齐框架</b> <cite>(Biggs, 1996)</cite>：可观测行为锚点是目标-活动-评价链条闭合的关键节点；锚点缺失可能使高增幅部分源于教师宽松解读而非学生真实能力迁移。<b>SRL 框架</b> <cite>(Zimmerman, 2002)</cite> 进一步预测：无清晰锚点时，学生自我监控循环无法激活，反思行为停留在断言层而非证据层。',
        rival: '<b>① 评分者宽松效应</b>：高 COUPLING 可能部分反映教师对模糊量规的宽松评分，而非学生立场迁移能力的实质提升，<b>需计算评分者间信度（κ 系数）</b>加以检验。<b>② 任务设计混淆</b>："政策引用不足"可能源于任务本身未明确要求引用格式，而非量规歧义——需通过任务说明对照组分离两种效应。',
      },
    },
    E08: {
      teacher: [
        '量规增加"证据准确性 / 证据相关性 / 证据用于决策"三级要求',
        '<b>但当前量规歧义 2 处</b>未解决（立场迁移度无可观察锚点）',
      ],
      student: [
        '学生能表达立场，但 <b>政策证据引用不足</b>（仅 38% 引用准确）',
      ],
      coupling: '<b>FIX 信号</b>：学生表达 vs 证据引用出现裂口 · COUPLING 1.5 · <b>建议</b>补充三级行为锚点量规并重跑。',
      writeback: [
        { env: '08 诊断', note: '补充 3 级行为锚点量规（如"分组前后引用的政策条款是否升级"）' },
        { env: '资产库', note: '量规模板写入资产库供后续课题复用' },
      ],
    },
    E09: {
      teacher: [
        '教师复盘文本 387 字，识别 5 条本轮改进点（其中 3 条已采纳）',
        'AI 草案采纳率 67% / 修改深度 64%（结构性修改）/ 退回 2 条',
      ],
      student: [
        '课后反思能说明"观点变化"的学生比例：18 / 32 = 56%（基线 31%）',
      ],
      coupling: '复盘质量与学生反思迁移能力中度相关 · COUPLING 0.7。',
      writeback: [
        { env: '资产库', note: '把"集采替代决策"抽象为 T-集采类 v0.1 模板' },
      ],
    },
  };

  // ============ § 9 · Sample raw 维度 Δ（cumulative · 演示用） ============
  // 选数原则：跑 deriveLane 后让 hot envs (03/06/07) 的 coupling 在 1.5-2.5 区间
  const SAMPLE_TEACHER_DELTAS = {
    cumulative: { T1: 2.5, T2: 2.2, T3: 2.2, T4: 5.7, T5: 3.0, T6: 6.8, T7: 4.2, T8: 2.0 },
    weekly:     { T1: 0.4, T2: 0.4, T3: 0.4, T4: 1.0, T5: 0.5, T6: 1.2, T7: 0.7, T8: 0.3 },
    single:     { T1: 0.1, T2: 0.1, T3: 0.1, T4: 0.4, T5: 0.2, T6: 0.5, T7: 0.2, T8: 0.1 },
  };
  const SAMPLE_STUDENT_DELTAS = {
    cumulative: { S1: 1.0, S2: 3.4, S3: 5.5, S4: 1.8, S5: 1.6, S6: 4.2, S7: 1.4 },
    weekly:     { S1: 0.2, S2: 0.5, S3: 0.9, S4: 0.3, S5: 0.3, S6: 0.8, S7: 0.2 },
    single:     { S1: 0.0, S2: 0.2, S3: 0.3, S4: 0.1, S5: 0.1, S6: 0.2, S7: 0.1 },
  };

  // ============ § 9B · 学生节点绝对分数（双时间轴版样本）============
  // 与 SAMPLE_STUDENT_DELTAS 一致的"地面真相"：EV4 - EV0 的逐维 Δ = SAMPLE_STUDENT_DELTAS.cumulative。
  // 节点之间通过经验进度系数分配 cumulative 的累计份额（基线进度模型）。
  // 当 LIVE_DATASET.studentEvents 注入后，覆盖此样本。
  //
  // 进度系数（每维 Δ 在 EV1/EV2/EV3 处累计兑现的比例）：
  //   S1 工具迁移   EV1 15% EV2 30% EV3 60% EV4 100%   （渐进迁移）
  //   S2 政策识读   EV1 25% EV2 75% EV3 90% EV4 100%   （E04 课中初见，E07 评价显化）
  //   S3 利益相关者 EV1 50% EV2 80% EV3 90% EV4 100%   （课中讨论高密度产生）
  //   S4 风险合规   EV1 20% EV2 70% EV3 85% EV4 100%   （评价时显化）
  //   S5 方案可行性 EV1 30% EV2 60% EV3 80% EV4 100%
  //   S6 协作论证   EV1 70% EV2 85% EV3 95% EV4 100%   （课中即高）
  //   S7 反思迁移   EV1 10% EV2 40% EV3 80% EV4 100%   （复盘后才大）
  const SAMPLE_EVENT_BASELINES = { S1: 5.0, S2: 4.5, S3: 3.5, S4: 5.5, S5: 5.0, S6: 4.0, S7: 5.0 };
  const SAMPLE_EVENT_PROGRESS = {
    EV0: { S1: 0,    S2: 0,    S3: 0,    S4: 0,    S5: 0,    S6: 0,    S7: 0    },
    EV1: { S1: 0.15, S2: 0.25, S3: 0.50, S4: 0.20, S5: 0.30, S6: 0.70, S7: 0.10 },
    EV2: { S1: 0.30, S2: 0.75, S3: 0.80, S4: 0.70, S5: 0.60, S6: 0.85, S7: 0.40 },
    EV3: { S1: 0.60, S2: 0.90, S3: 0.90, S4: 0.85, S5: 0.80, S6: 0.95, S7: 0.80 },
    EV4: { S1: 1.00, S2: 1.00, S3: 1.00, S4: 1.00, S5: 1.00, S6: 1.00, S7: 1.00 },
  };

  // 由进度系数 + cumulative Δ 反推每节点 7 维绝对分数
  function _deriveEventScores(cumDeltas) {
    const out = {};
    for (const ev of STUDENT_EVENTS) {
      const prog = SAMPLE_EVENT_PROGRESS[ev.id] || {};
      out[ev.id] = {};
      for (const d of STUDENT_DIMS) {
        const base = SAMPLE_EVENT_BASELINES[d.id] ?? 5.0;
        const delta = (cumDeltas[d.id] || 0) * (prog[d.id] ?? 0);
        out[ev.id][d.id] = +(base + delta).toFixed(2);
      }
    }
    return out;
  }
  // 样本节点分数（与 cumulative 模式对应）
  const SAMPLE_STUDENT_EVENT_SCORES = _deriveEventScores(SAMPLE_STUDENT_DELTAS.cumulative);

  // ============ § 10 · 派生 API ============
  function deriveLane(dimDeltas, matrix) {
    return ENVIRONMENTS.map(env => +envScore(dimDeltas, matrix[env.id] || {}).toFixed(1));
  }
  function deriveCouplingLane(tDeltas, sDeltas, syncCoef) {
    const tLane = deriveLane(tDeltas, TEACHER_MATRIX);
    const sLane = deriveLane(sDeltas, STUDENT_MATRIX);
    return ENVIRONMENTS.map((_, i) => {
      const c = coupling(tLane[i], sLane[i], syncCoef);
      return c == null ? null : +c.toFixed(1);
    });
  }

  // 派生 5 个学生节点的"综合分"（按节点 dims 加权 7 维分数）+ Δ vs 基线
  function deriveEventLane(eventScores) {
    if (!eventScores) eventScores = SAMPLE_STUDENT_EVENT_SCORES;
    const ev0 = eventScores.EV0 || {};
    const compositeOf = (scores, dims) => {
      if (!scores) return null;
      const ds = (dims && dims.length) ? dims : STUDENT_DIMS.map(d => d.id);
      const xs = ds.map(id => scores[id]).filter(v => typeof v === 'number');
      if (xs.length === 0) return null;
      return +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2);
    };
    return STUDENT_EVENTS.map(ev => {
      const cur = eventScores[ev.id];
      const composite = compositeOf(cur, ev.dims);
      const baseComposite = compositeOf(ev0, ev.dims);
      const delta = (composite != null && baseComposite != null)
        ? +(composite - baseComposite).toFixed(2) : null;
      // 证据等级：优先用导入数据里的 per-node evidence（如真实迁移测试接入后 EV4 由 C→A/B），
      // 否则回退到 STUDENT_EVENTS 的静态默认。这样"导入真数据 → 自动从预测转实测"，无需改代码。
      const evidence = (cur && typeof cur.evidence === 'string') ? cur.evidence : ev.evidence;
      return {
        id: ev.id, num: ev.num, name: ev.name,
        composite, delta,
        scores: cur || null,
        evidence,
        whenLabel: ev.whenLabel,
        anchorEnv: ev.anchorEnv,
        anchor: ev.anchor,
        dims: ev.dims || [],   // 该节点实测的学生维度（用于节点上标注"测了哪些维度"）
      };
    });
  }

  // 派生 COUPLING 连线：返回所有 env→event 连接的强度数组
  // [{ envId, envIndex, eventId, eventIndex, strength, isPrimary }]
  function deriveBridges(tDeltas, eventScores, syncCoef) {
    if (!tDeltas) tDeltas = SAMPLE_TEACHER_DELTAS.cumulative;
    if (!eventScores) eventScores = SAMPLE_STUDENT_EVENT_SCORES;
    const tLane = deriveLane(tDeltas, TEACHER_MATRIX);
    const evLane = deriveEventLane(eventScores);
    const ev0Composite = evLane.find(e => e.id === 'EV0')?.composite || 0;
    const bridges = [];
    ENVIRONMENTS.forEach((env, envIdx) => {
      const link = ENV_TO_EVENT[env.id];
      if (!link) return;
      const tDelta = tLane[envIdx];
      ['primary', 'secondary'].forEach(role => {
        const evId = link[role];
        if (!evId) return;
        const target = evLane.find(e => e.id === evId);
        if (!target || target.delta == null || target.delta <= 0) return;
        // 直接调用 couplingBridge 但传入 composite Δ 作为 event Δ
        const strength = couplingBridge(env.id, evId, tDelta, target.delta, syncCoef);
        if (strength == null || strength <= 0) return;
        bridges.push({
          envId: env.id, envIndex: envIdx,
          eventId: evId,
          eventIndex: STUDENT_EVENTS.findIndex(e => e.id === evId),
          strength: +strength.toFixed(2),
          isPrimary: role === 'primary',
          role: link.role,
        });
      });
    });
    return bridges;
  }

  // ============ § 10A · LIVE 数据覆盖层（真实课堂接入）============
  // 通过 loadDataset() 注入的真实数据写到 localStorage，刷新后仍在。
  // 校验通过后，LIVE_DATASET 覆盖 SAMPLE_* 作为 buildDataset 的输入。
  // 期望 JSON shape：
  //   {
  //     label?: string,
  //     evidenceLevel?: 'A' | 'B' | 'C',
  //     teacher: { cumulative: {T1..T8}, weekly: {...}, single: {...} },
  //     student: { cumulative: {S1..S7}, weekly: {...}, single: {...} },
  //     // 可选：双时间轴版 5 节点绝对分数；每节点可带 evidence 覆盖静态默认，
  //     // 真实迁移测试接入后给 EV4 填实测分 + evidence:'A'，节点即从"≈预测"自动转为实测。
  //     studentEvents?: { EV0:{S1..S7}, EV1:{...}, EV2:{...}, EV3:{...}, EV4:{S1..S7, evidence?:'A'} }
  //   }
  const LIVE_LS_KEY = 'pp.liveDataset';
  let LIVE_DATASET = null;

  function _validateLiveDataset(payload) {
    if (!payload || typeof payload !== 'object') return '数据必须是 JSON 对象';
    const modes = ['cumulative', 'weekly', 'single'];
    if (!payload.teacher || !payload.student) return '缺少 teacher / student 字段';
    if (payload.evidenceLevel != null && !EVIDENCE_LEVELS[payload.evidenceLevel]) {
      return 'evidenceLevel 必须是 A / B / C / D';
    }
    for (const m of modes) {
      const t = payload.teacher[m];
      const s = payload.student[m];
      if (!t || !s) return `${m} 模式：teacher 与 student 必须同时提供`;
      for (const d of TEACHER_DIMS) {
        if (typeof t[d.id] !== 'number' || isNaN(t[d.id])) return `${m}.teacher.${d.id} 必须是数字`;
        if (t[d.id] < 0) return `${m}.teacher.${d.id} 不能为负`;
        if (t[d.id] > SCALE.perDimension.max) return `${m}.teacher.${d.id} 不能超过 ${SCALE.perDimension.max}`;
      }
      for (const d of STUDENT_DIMS) {
        if (typeof s[d.id] !== 'number' || isNaN(s[d.id])) return `${m}.student.${d.id} 必须是数字`;
        if (s[d.id] < 0) return `${m}.student.${d.id} 不能为负`;
        if (s[d.id] > SCALE.perDimension.max) return `${m}.student.${d.id} 不能超过 ${SCALE.perDimension.max}`;
      }
    }
    // 可选 studentEvents 校验（双时间轴版数据）
    if (payload.studentEvents) {
      const evIds = STUDENT_EVENTS.map(e => e.id);
      for (const evId of evIds) {
        const node = payload.studentEvents[evId];
        if (!node) continue;                    // 允许部分节点缺省
        for (const d of STUDENT_DIMS) {
          if (node[d.id] != null && (typeof node[d.id] !== 'number' || isNaN(node[d.id]))) {
            return `studentEvents.${evId}.${d.id} 必须是数字`;
          }
          if (node[d.id] != null && node[d.id] < SCALE.perDimension.min) {
            return `studentEvents.${evId}.${d.id} 不能为负`;
          }
          if (node[d.id] != null && node[d.id] > SCALE.perDimension.max) {
            return `studentEvents.${evId}.${d.id} 不能超过 ${SCALE.perDimension.max}`;
          }
        }
        if (node.evidence != null && !EVIDENCE_LEVELS[node.evidence]) {
          return `studentEvents.${evId}.evidence 必须是 A / B / C / D`;
        }
      }
    }
    return null;
  }

  function _readLiveFromLS() {
    try {
      const raw = localStorage.getItem(LIVE_LS_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const err = _validateLiveDataset(parsed);
      if (err) {
        console.warn('[framework] LIVE_DATASET 校验失败，回退到样本：', err);
        return null;
      }
      return parsed;
    } catch (e) {
      console.warn('[framework] LIVE_DATASET 解析失败：', e);
      return null;
    }
  }

  // 模块初始化时读取 LS
  LIVE_DATASET = _readLiveFromLS();

  function getActiveTeacherDeltas(mode) {
    return LIVE_DATASET?.teacher?.[mode] || SAMPLE_TEACHER_DELTAS[mode];
  }
  function getActiveStudentDeltas(mode) {
    return LIVE_DATASET?.student?.[mode] || SAMPLE_STUDENT_DELTAS[mode];
  }
  function getDataSourceMeta() {
    if (!LIVE_DATASET) {
      return { isLive: false, label: '样本数据', evidenceLevel: CURRENT_EVIDENCE_LEVEL, importedAt: null };
    }
    return {
      isLive: true,
      label: LIVE_DATASET.label || '真实课堂数据',
      evidenceLevel: LIVE_DATASET.evidenceLevel || 'A',
      importedAt: LIVE_DATASET.__importedAt || null,
    };
  }
  function loadDataset(payload) {
    const err = _validateLiveDataset(payload);
    if (err) return { ok: false, error: err };
    const stamped = { ...payload, __importedAt: Date.now() };
    try { localStorage.setItem(LIVE_LS_KEY, JSON.stringify(stamped)); }
    catch (e) { return { ok: false, error: 'localStorage 写入失败：' + e.message }; }
    LIVE_DATASET = stamped;
    window.dispatchEvent(new CustomEvent('pp:dataset-changed', { detail: getDataSourceMeta() }));
    return { ok: true, meta: getDataSourceMeta() };
  }
  function clearDataset() {
    try { localStorage.removeItem(LIVE_LS_KEY); } catch (e) {}
    LIVE_DATASET = null;
    window.dispatchEvent(new CustomEvent('pp:dataset-changed', { detail: getDataSourceMeta() }));
    return { ok: true, meta: getDataSourceMeta() };
  }

  function getActiveStudentEventScores(mode) {
    // LIVE 数据如带 studentEvents 字段则使用，否则由 cumulative Δ 按样本进度系数派生
    if (LIVE_DATASET?.studentEvents && mode === 'cumulative') {
      return LIVE_DATASET.studentEvents;
    }
    const s = getActiveStudentDeltas(mode);
    return _deriveEventScores(s);
  }

  function buildDataset(mode) {
    const t = getActiveTeacherDeltas(mode);
    const s = getActiveStudentDeltas(mode);
    if (!t || !s) return null;
    const teacher = deriveLane(t, TEACHER_MATRIX);
    const student = deriveLane(s, STUDENT_MATRIX);                  // 旧 9 列学生 lane（兼容性保留）
    const couplingLane = deriveCouplingLane(t, s);                  // 旧 9 列 coupling（兼容性保留）
    // 新双时间轴产物
    const eventScores = getActiveStudentEventScores(mode);
    const studentEvents = deriveEventLane(eventScores);             // 5 节点 composite + Δ
    const bridges = deriveBridges(t, eventScores);                  // COUPLING 连线集合
    const sum = arr => arr.reduce((a, b) => a + b, 0);
    const meta = getDataSourceMeta();
    return {
      label: LIVE_DATASET?.label || BASELINES[mode]?.detail || mode,
      teacher,
      student,                                                       // 旧 lane (供兼容旧 renderLane)
      coupling: couplingLane,                                        // 旧 spine
      studentEvents,                                                 // 新 5 节点
      bridges,                                                       // 新 N 条 COUPLING 连线
      teacherTotal: `+${(sum(Object.values(t)) / TEACHER_DIMS.length / SCALE.perDimension.max * 100).toFixed(1)}%`,
      studentTotal: `+${(sum(Object.values(s)) / STUDENT_DIMS.length / SCALE.perDimension.max * 100).toFixed(1)}%`,
      raw: { teacherDims: t, studentDims: s, eventScores },
      evidenceLevel: meta.evidenceLevel,
      isLive: meta.isLive,
    };
  }

  // ============ EXPORT ============
  window.PharmacoPilotEvaluationFramework = {
    SCALE, EVIDENCE_LEVELS, CURRENT_EVIDENCE_LEVEL, DATA_SOURCE_STATUS,
    TEACHER_DIMS, STUDENT_DIMS, COUPLING_DIMS, ENV_COUPLING_X,
    ENVIRONMENTS,
    // 双时间轴新增 ↓
    STUDENT_EVENTS, ENV_TO_EVENT,
    SAMPLE_STUDENT_EVENT_SCORES, SAMPLE_EVENT_BASELINES, SAMPLE_EVENT_PROGRESS,
    TEACHER_MATRIX, STUDENT_MATRIX, MATRIX_REFS,
    COUPLING_REFS, COUPLING_THRESHOLDS,
    BASELINES, DATA_SOURCES, ENV_EVIDENCE,
    SAMPLE_TEACHER_DELTAS, SAMPLE_STUDENT_DELTAS,
    envScore, coupling, deriveLane, deriveCouplingLane, buildDataset,
    // 双时间轴新增 ↓
    couplingBridge, deriveEventLane, deriveBridges, getActiveStudentEventScores,
    // LIVE 数据接入 API
    loadDataset, clearDataset, getDataSourceMeta,
    getActiveTeacherDeltas, getActiveStudentDeltas,
    // 师生关系分类（co / solo）
    getEnvCoCategory,
  };
})();
