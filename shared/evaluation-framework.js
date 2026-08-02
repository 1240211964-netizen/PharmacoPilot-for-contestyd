/* ============================================================
 * evaluation-framework.js — 教学数据页 评价体系定义
 * ------------------------------------------------------------
 * 角色：
 *   1) 规范文档 — 把页面里所有数字背后的"语义"明文化
 *   2) 可执行模块 — data-render.js 从这里取常量、矩阵、公式
 *
 * 与设计文档对齐：PharmacoPilot 教学数据评价体系系统设计 v1.0
 *   · 9 个教学环节（课前 5 + 课中 1 + 课后 3）
 *   · 教师 8 维（含课程定位、课堂流程、反思性教学改进）
 *   · 学生 7 维（含反思与自我调节）
 *   · 师生耦合 5 维（X1-X5；唯一计算口径见 evaluation-contract.js）
 *   · 4 类数据源 + A/B/C/D 证据等级（系数 1.0 / 0.8 / 0.5 / 0.2）
 *   · 维度 0-10 评分锚定标准（§ 8C，草案；S1 因测量工具未接入暂缓）
 * ============================================================ */

(function () {
  'use strict';

  // ============ § 1 · 量程与单位 ============
  const SCALE = {
    name: '10 分制能力评分',
    perDimension: { min: 0, max: 10 },
    deltaMeaning: '同一维度从基线到当前的分数差',
    overallPercentMeaning: '已测维度的平均分差；不转换为相对百分比或效应量',
    refs: [
      { cite: 'AACP CAPE 2013', note: '药学教育子能力 1-4 级量表的扩展（10 分制提供更细的 Δ 分辨率）' },
      { cite: 'Hattie 2009 可见的学习', note: '效应量是标准化统计量，不能由本项目 10 分制分差直接换算' },
      { cite: 'Black & Wiliam 1998 形成性评价', note: '把评分作为可迭代信号而非终结性判断' },
    ],
    // 等级化呈现（0-4 级，与 doc §9.1 对齐）。分档采用左闭右开区间，
    // 仅最后一档包含 10 分，避免 1 / 3 / 5 / 7 等边界分同时落入两档。
    levels: [
      { range: [0, 1],  code: 'L0', name: '无证据',     upperInclusive: false },
      { range: [1, 3],  code: 'L1', name: '形式完成',   upperInclusive: false },
      { range: [3, 5],  code: 'L2', name: '基本可用',   upperInclusive: false },
      { range: [5, 7],  code: 'L3', name: '有效应用',   upperInclusive: false },
      { range: [7, 10], code: 'L4', name: '可迁移复用', upperInclusive: true },
    ],
  };

  // ============ § 1B · 证据等级（A/B/C/D） ============
  const EVIDENCE_LEVELS = {
    A: { label: '强证据',     coefficient: 1.0, badge: 'A', desc: '真实课堂数据 + 学生作品 + 教师修改记录 + 依据评价标准评分' },
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
    { id: 'T8', name: '反思性教学改进能力', short: '反思改进', refs: ['Schön 1983 反思性实践', 'Zimmerman 2002 自我调节'] },
  ];

  const STUDENT_DIMS = [
    { id: 'S1', name: '管理工具迁移能力',       short: '工具迁移',   refs: ['CAPE 2013 教育成果'] },
    { id: 'S2', name: '政策法规证据识读能力',   short: '政策识读',   refs: ['杨悦 药事法规与监管科学'] },
    { id: 'S3', name: '利益相关者分析能力',     short: '利益相关者', refs: ['邵蓉 药事管理教育'] },
    { id: 'S4', name: '风险与合规判断能力',     short: '风险合规',   refs: ['杨悦 药事法规'] },
    { id: 'S5', name: '方案设计与可行性评估能力', short: '方案可行性', refs: ['史录文 药学服务评价'] },
    { id: 'S6', name: '协作论证与表达能力',     short: '协作论证',   refs: ['ICAP 2014', 'Chi & Wylie'] },
    { id: 'S7', name: '反思与自我调节能力',     short: '反思调节',   refs: ['Zimmerman 2002 自我调节'] },
  ];

  // ============ § 2C · 师生耦合 5 维（X1-X5） ============
  // X1 是全局可信度系数；X2-X5 是局部评价维度。具体评价指标、样本分和计算公式
  // 全部由 evaluation-contract.js 维护，本文件不再保存第二套逐环节 X 值。
  const COUPLING_DIMS = [
    { id: 'X1', name: '目标—任务—评价一致性',   short: '目标对齐一致' },
    { id: 'X2', name: '问题链—高阶思维耦合',     short: '问题链—思维' },
    { id: 'X3', name: '情境—证据使用耦合',       short: '情境—证据' },
    { id: 'X4', name: '互动调控—参与公平耦合',   short: '互动—参与公平' },
    { id: 'X5', name: '反馈—修正闭环耦合',       short: '反馈—修正' },
  ];

  // ============ § 3 · 9 个教学环节（教师轴） ============
  // 课前 5 (E01-E05) + 课中 1 (E06) + 课后 3 (E07-E09)
  // co 字段：'co'=师生共在（E06 即时互动 / E07 表现性评价与学习成效诊断），'solo'=教师独立活动
  // 这一栏决定 atlas 视觉分组、KEEP/FIX 选哪个池、coupling chip 是"同步耦合"还是"延迟相关"
  //
  // 设计说明（双时间轴架构 · v2）：
  //   教师轴是过程性的，9 个环节描述「教师正在做什么」；
  //   学生轴是结果性的，5 个产出节点（见 § 3B STUDENT_EVENTS）描述「学生何时产生可观测证据」；
  //   两轴**节奏不同、不强行同列对齐**——避免在教师独立环节（solo）虚构学生增量。
  //   COUPLING 从同列耦合改为「教师环节 → 学生节点」的 COUPLING 连线（见 § 3C ENV_TO_EVENT）。
  const ENVIRONMENTS = [
    { id: 'E01', num: '01', name: '学习者与教学情境分析',       short: '学习者与教学情境分析',       phase: 'pre',  phaseName: '课前 · 设计与准备', co: 'solo' },
    { id: 'E02', num: '02', name: '预期学习结果与评价证据设计', short: '预期学习结果与评价证据设计', phase: 'pre',  phaseName: '课前 · 设计与准备', co: 'solo' },
    { id: 'E03', num: '03', name: '教学内容结构化与前概念诊断', short: '教学内容结构化与前概念诊断', phase: 'pre',  phaseName: '课前 · 设计与准备', co: 'solo' },
    { id: 'E04', num: '04', name: '真实性学习情境与资源设计',   short: '真实性学习情境与资源设计',   phase: 'pre',  phaseName: '课前 · 设计与准备', co: 'solo' },
    { id: 'E05', num: '05', name: '学习活动与教学支架设计',     short: '学习活动与教学支架设计',     phase: 'pre',  phaseName: '课前 · 设计与准备', co: 'solo' },
    { id: 'E06', num: '06', name: '形成性评价与适应性调控',     short: '形成性评价与适应性调控',     phase: 'in',   phaseName: '课中 · 实施与调控', co: 'co'   },
    { id: 'E07', num: '07', name: '表现性评价与学习成效诊断',   short: '表现性评价与学习成效诊断',   phase: 'post', phaseName: '课后 · 评价与沉淀', co: 'co'   },
    { id: 'E08', num: '08', name: '反思性实践与教学改进',       short: '反思性实践与教学改进',       phase: 'post', phaseName: '课后 · 评价与沉淀', co: 'solo' },
    { id: 'E09', num: '09', name: '教学知识建构与专业共享',     short: '教学知识建构与专业共享',     phase: 'post', phaseName: '课后 · 评价与沉淀', co: 'solo' },
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
      id: 'EV0', num: 'E0', name: '模拟基线', short: '模拟基线',
      timing: 'pre-course', whenLabel: '第 1 周 · 课前',
      anchor: 'pre', anchorEnv: null, spanEnvs: [],
      dims: ['S1','S2','S3','S4','S5','S6','S7'],   // 7 维全测，作为基线
      evidence: 'B',
      source: '虚拟演练基线 · 32 卷（真实入学前测待接入）',
      role: '基线（无增量，作为后续节点的对照参考）',
    },
    {
      id: 'EV1', num: 'E1', name: '课中证据', short: '课中证据',
      timing: 'in-class', whenLabel: '第 7 周 · 课中',
      anchor: 'inline', anchorEnv: 'E06', spanEnvs: ['E03','E04','E05','E06'],
      dims: ['S3','S6','S2'],                       // 课中讨论主要显化：利益相关者识别 / 协作论证 / 政策识读
      evidence: 'B',
      source: '任务卡评分 + 互动热图 + 话语编码',
      role: '课中即时产出（教师 E03-E05 设计 + E06 调控的兑现点）',
    },
    {
      id: 'EV2', num: 'E2', name: '作品评价', short: '作品评价',
      timing: 'post-class', whenLabel: '课后 1-3 天',
      anchor: 'inline', anchorEnv: 'E07', spanEnvs: ['E02','E04','E07'],
      dims: ['S2','S4','S5'],                       // 表现性评价主要显化：政策识读 / 风险合规 / 方案可行性
      evidence: 'B',
      source: '作品评估 + 依据评价标准评分',
      role: '课后表现性评价（教师 E02 目标 + E07 评价证据的兑现点）',
    },
    {
      id: 'EV3', num: 'E3', name: '反思证据', short: '反思证据',
      timing: 'post-class', whenLabel: '课后 7 天',
      anchor: 'inline', anchorEnv: 'E08', spanEnvs: ['E08'],
      dims: ['S7','S1'],                            // 反思文本主要显化：反思迁移 / 工具迁移
      evidence: 'B',
      source: '反思文本 + 版本对比记录',
      role: '反思产物（教师 E08 复盘前后学生侧的对位证据）',
    },
    {
      id: 'EV4', num: 'E4', name: '迁移验证', short: '迁移验证',
      timing: 'post-course', whenLabel: '课后 +30 天',
      anchor: 'post', anchorEnv: null, spanEnvs: [],
      dims: ['S1','S2','S3','S4','S5','S6','S7'],   // 7 维综合后测
      evidence: 'C',                                // 待真实课堂数据接入前默认 C
      source: '新情境迁移任务 · 待接入真实课堂',
      role: '远迁移验证（最终能力检验，与 EV0 形成完整前-后测对照）',
    },
  ];

  // ============ § 3C · 教师环节 → 学生节点 COUPLING 连线 ============
  // 只保留 evaluation-contract.STATION_COUPLING_DIMS 中有局部评价证据的环节。
  // EV0 是基线、EV4 是待接入的远迁移结果，两者不画本轮 COUPLING 连线。
  const ENV_TO_EVENT = {
    E01: { primary: null,  secondary: null,  role: '基线定义环节，不计算本轮 COUPLING' },
    E02: { primary: null,  secondary: null,  role: '目标对齐由 X1 全局系数表达，不重复计算局部 COUPLING' },
    E03: { primary: 'EV1', secondary: 'EV2', role: '教学内容结构化与前概念诊断 → 课中证据 / 作品评价' },
    E04: { primary: 'EV1', secondary: 'EV2', role: '真实性学习情境与资源设计 → 课中证据 / 作品评价' },
    E05: { primary: null,  secondary: null,  role: '当前未配置局部耦合评价指标' },
    E06: { primary: 'EV1', secondary: null,  role: '形成性评价与适应性调控 ↔ 课中证据' },
    E07: { primary: 'EV2', secondary: null,  role: '表现性评价与学习成效诊断 ↔ 作品评价' },
    E08: { primary: 'EV3', secondary: null,  role: '反思性实践与教学改进 → 反思证据' },
    E09: { primary: null,  secondary: null,  role: '跨课程资产沉淀，不计入本轮 COUPLING' },
  };

  // ============ § 4 · 教学环节 × 维度 加权矩阵 ============
  // 权重：1.0 主驱动维度（×）/ 0.4 次要参与（·）/ 0 缺省
  const TEACHER_MATRIX = {
    E01: { T1: 1.0, T2: 0.4 },                    // 学习者与教学情境分析 → T1 主
    E02: { T2: 1.0, T1: 0.4, T4: 0.4, T7: 0.4 },  // 目标证据 → T2 主
    E03: { T4: 1.0, T3: 0.4 },                    // 教学内容结构化与前概念诊断 → T4 问题链主
    E04: { T3: 1.0, T4: 0.4 },                    // 真实性学习情境与资源设计 → T3 转译主
    E05: { T5: 1.0, T6: 0.4 },                    // 学习活动与教学支架设计 → T5 主
    E06: { T6: 1.0, T7: 0.4 },                    // 形成性评价与适应性调控 → T6 主 + T7 次
    E07: { T7: 1.0, T2: 0.4 },                    // 表现性评价与学习成效诊断 → T7 主
    E08: { T8: 1.0, T7: 0.4 },                    // 反思性实践与教学改进 → T8 主
    E09: { T8: 1.0 },                             // 教学知识建构与专业共享 → T8 主
  };

  // 重平衡（2026-05）：原矩阵里 S1 工具迁移 / S4 风险合规 / S5 方案可行性 从不是任何环节的主驱动(1.0)，
  // 而 S2/S6/S7 各占 2 个主环节 → 7 维里 3 维结构性低估。现让 S1-S7 各恰有一个主驱动环节
  // （7 个有学生评估的环节 E03-E09 一一对应 7 维），并与 5 节点模型的维度覆盖对齐（EV2 测 S4/S5 不再悬空）。
  const STUDENT_MATRIX = {
    E01: { },                                     // 学习者与教学情境分析阶段学生不直接评估
    E02: { S1: 0.4 },                             // 预期学习结果与评价证据设计 → S1 基线（课前，仅次要）
    E03: { S6: 1.0, S2: 0.4 },                    // 教学内容结构化与前概念诊断 → S6 协作论证主（分歧锚点辩论）
    E04: { S2: 1.0, S3: 0.4, S4: 0.4 },           // 真实性学习情境与资源设计 → S2 政策识读主
    E05: { S5: 1.0, S3: 0.4, S6: 0.4 },           // 学习活动与教学支架设计 → S5 方案可行性主（任务链导向可行决策）
    E06: { S3: 1.0, S6: 0.4, S7: 0.4 },           // 形成性评价与适应性调控 → S3 利益相关者主（五方角色任务）
    E07: { S4: 1.0, S2: 0.4, S5: 0.4 },           // 表现性评价与学习成效诊断 → S4 风险合规主（表现性评价判风险）
    E08: { S7: 1.0, S1: 0.4 },                    // 反思性实践与教学改进 → S7 反思迁移主
    E09: { S1: 1.0, S7: 0.4 },                    // 教学知识建构与专业共享 → S1 工具迁移主（资产复用＝迁移到下一情境）
  };

  const MATRIX_REFS = [
    { cite: 'Biggs 1996 建设性对齐', note: '活动 ↔ 目标 ↔ 评价三向对齐 → 每环节映射一主能力' },
    { cite: 'Shulman 1987 PCK',     note: '一个教学时刻同时调动多种能力 → 允许次要维度' },
    { cite: 'AACP CAPE 2013',       note: '学生子能力到课程活动的映射' },
    { cite: '项目专家映射 v0.2',    note: '1.0 / 0.4 是待用真实数据校准并做敏感性分析的设计权重，不是效应量' },
    { cite: '邵蓉 / 史录文 / 杨悦', note: '药事管理 / 服务评价 / 法规三向，学生 7 维的本土锚' },
  ];

  // ============ § 5 · 聚合规则 ============
  function envScore(dimDeltas, weights) {
    let weightedSum = 0, weightTotal = 0;
    for (const dimId in weights) {
      const w = weights[dimId];
      const v = dimDeltas[dimId];
      if (typeof v !== 'number' || !Number.isFinite(v)) continue;
      weightedSum += w * v;
      weightTotal += w;
    }
    return weightTotal > 0 ? weightedSum / weightTotal : null;
  }

  // ============ § 6 · COUPLING 理论依据 ============
  // 唯一可执行公式位于 evaluation-contract.js：
  // COUPLING(env) = mean(applicable Xi) × evidenceCoef × x1GlobalCoef
  const COUPLING_REFS = [
    { cite: '礼记·学记',           note: '「教学相长」— 师生互为发展条件的本土根基' },
    { cite: 'Vygotsky 1978 ZPD',  note: '耦合是最近发展区运作机制的量化' },
    { cite: 'Hattie 2009 可见的学习', note: 'visible teaching ↔ visible learning 互为前提' },
    { cite: 'Wenger 1998 实践共同体', note: 'mutual engagement 作为共生机制' },
    { cite: 'Pennings et al. 2018 课堂动力学', note: '时序同步度作为耦合的实证测度' },
  ];
  const COUPLING_THRESHOLDS = {
    weak:     { min: 0,   max: 0.8, label: '弱关联' },
    moderate: { min: 0.8, max: 1.5, label: '中等关联' },
    strong:   { min: 1.5, max: 4.0, label: '较强关联证据 ★' },
  };
  // ============ § 7 · 时段基线 ============
  const BASELINES = {
    cumulative: { label: '7 周累计', detail: '第 1 周模拟基线与第 7 周综合观测', sessionCount: 17 },
    weekly:     { label: '第 7 周',   detail: '本周第 1 节课前测与第 3 节课后测', sessionCount: 3 },
    single:     { label: '本节课 #3417', detail: '本节课课前测与课后测', sessionCount: 1 },
  };

  // ============ § 8 · 数据来源（每个 dim 的原始信号） ============
  const DATA_SOURCES = {
    T1: ['学情诊断卡', '学生误区识别', '前测解释', '课程定位修改记录'],
    T2: ['学习目标文本', '评价证据表', '评价标准', '目标修改记录'],
    T3: ['药事情境卡', '政策证据卡', '案例资源', '利益相关者设定'],
    T4: ['问题链', '分歧锚点', '高阶追问', '反例与证据要求'],
    T5: ['时间轴', '活动切换', '计划—实际时长偏差', '认知负荷检查点'],
    T6: ['分组任务卡', '角色卡', '介入规则', '即时介入记录'],
    T7: ['反馈语', '作业批注', '证据引用纠错', '能力诊断报告'],
    T8: ['复盘文本', '改进假设', '后续验证计划', '资产写回与版本记录'],
    S1: ['课程间迁移作业评分'],
    S2: ['案例分析作业 + AI 文本评估（政策原文引用度）'],
    S3: ['小组讨论录音转录 · 利益相关者实体与关系编码（独立编码表）'],
    S4: ['情境化判断题 + 依据评价标准评分'],
    S5: ['总结性方案评估 + 依据评价标准评分'],
    S6: ['小组讨论录音转录 · 论证结构与轮次质量编码（独立编码表）'],
    S7: ['课后反思文本', '版本对比记录', '自我监控与修正记录'],
  };

  // AI 协同不再与反思能力混成同一构念。以下数据只描述工具使用过程，
  // 可作为 T8 复盘的旁证，不能单独换算为 T8 能力分。
  const AI_PROCESS_INDICATORS = [
    { id: 'ai_acceptance_rate', label: 'AI 草案采纳率', unit: '%', role: '过程描述' },
    { id: 'ai_revision_depth', label: 'AI 草案修改深度', unit: '%', role: '过程描述' },
    { id: 'ai_return_count', label: '退回次数', unit: '次', role: '过程描述' },
    { id: 'ai_publish_count', label: '确认发布次数', unit: '次', role: '过程描述' },
  ];

  // 三套评分体系只做证据路由，不做分数直换。来源评分体系必须保留原分、任务版本与评分记录，
  // 再按 mappingType 决定是否进入 T/S 能力评分。
  const RUBRIC_CROSSWALK = {
    version: '评分体系对照 v0.1',
    rule: '不同评分体系的原始分不得直接等比例换算；“可重编码”可进入指定维度的证据包，“仅旁证”不独立计分，“仅任务级”只评价任务产出。',
    systems: {
      capability10: { scale: '0–10', label: '教学数据页教师 / 学生能力评分标准', role: '跨任务能力结果' },
      virtualClass5: { scale: '0–5', label: '虚拟课堂行为评分标准', role: '过程与诊断信号' },
      station10Swot5D: { scale: '5 维表现性评分标准', label: 'SWOT / TOWS 任务评分标准', role: '任务级产出质量' },
    },
    mappings: [
      { source: 'virtualClass5.policy_citation', sourceLabel: '虚拟课堂 · 政策引用', target: 'S2', mappingType: 'direct', note: '需保留政策原文、引用准确性与任务版本' },
      { source: 'virtualClass5.evidence_use', sourceLabel: '虚拟课堂 · 证据使用', target: 'S2', mappingType: 'supporting', note: '只证明使用证据，不等于政策识读准确' },
      { source: 'virtualClass5.team_contrib', sourceLabel: '虚拟课堂 · 团队贡献', target: 'S6', mappingType: 'supporting', note: '参与量不能替代论证质量编码' },
      { source: 'virtualClass5.reflection', sourceLabel: '虚拟课堂 · 反思表现', target: 'S7', mappingType: 'direct', note: '按 S7 行为锚点重新编码，不转换原始 0–5 分' },
      { source: 'station10Swot5D.TOWS可操作性', sourceLabel: 'SWOT / TOWS 任务 · 方案可操作性', target: 'S5', mappingType: 'direct', note: '限同一任务版本，按 S5 行为锚点复核' },
      { source: 'station10Swot5D.批判意识', sourceLabel: 'SWOT / TOWS 任务 · 批判意识', target: 'S7', mappingType: 'supporting', note: '批判意识不是完整的自我调节循环' },
      { source: 'station10Swot5D.条目证据性', sourceLabel: 'SWOT / TOWS 任务 · 条目证据性', target: 'S2', mappingType: 'supporting', note: '须另核政策证据类型与引用准确性' },
      { source: 'station10Swot5D.内外分类准确性', sourceLabel: 'SWOT / TOWS 任务 · 内外分类准确性', target: null, mappingType: 'task-only', note: '评价 SWOT 分类表现，不直接代表任一跨任务能力维度' },
      { source: 'station10Swot5D.条目精炼度', sourceLabel: 'SWOT / TOWS 任务 · 条目精炼度', target: null, mappingType: 'task-only', note: '评价表达质量，不直接计入能力总分' },
    ],
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
        '虚拟演练基线七维均值 {{BASELINE_MEAN}} / 10；真实入学前测仍待接入',
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
      coupling: 'T2 记录教师的目标—评价对齐能力；X1 作为全局可信度系数只在已有局部评价指标的环节生效。本环节不重复计算局部 COUPLING。',
      writeback: [
        { env: '08 诊断', note: '按本环节定义的 5 个评价维度展开评价证据' },
      ],
    },
    E03: {
      teacher: [
        '把"什么是 SWOT"改写为递进 4 题：定义 → 应用 → 分歧锚点 → 反例修正',
        '第 3 题加入 A/B 立场切换（医保 vs 药企），分歧密度从 0.4 → 1.6 提升 4 倍',
        '<b>修改深度</b>：结构性修改（重写问题位次），非措辞调整',
      ],
      student: [
        'A/B 立场对立密度上升与协作论证表达 {{S6}} 同向上扬',
        '小组讨论中"基于证据反驳"的发言占比从 12% → 38%',
      ],
      coupling: '<b>数据提示</b>：分歧锚点的引入与学生协作论证能力增强同时出现 · {{COUPLING}} · <b>建议</b>在真实课堂继续验证。',
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
      coupling: '案例真实度提升与学生政策识读、利益相关者分析能力同向上扬 · {{COUPLING}}。',
      writeback: [
        { env: '08 诊断', note: '把政策引用准确率纳入评价标准' },
      ],
    },
    E05: {
      teacher: [
        '把分析任务拆为角色领取、证据核验、方案生成和可行性复核四步',
        '为基础薄弱组增加政策检索提示，为进阶组增加资源约束与反例卡',
        '<b>修改深度</b>：重排活动顺序并补充分层支架，非问题链措辞复制',
      ],
      student: [
        '方案中同时出现利益相关者、资源约束和执行步骤的比例增加',
        '方案可行性依据独立评价标准评分，不复用协作论证的讨论编码',
      ],
      coupling: '本环节当前未配置局部 X2–X5 评价指标，<b>不计算 COUPLING</b>；仅保留教师活动与支架设计证据。',
      writeback: [
        { env: '05 学习活动与教学支架设计', note: '沉淀"角色—证据—方案—复核"四步任务链模板 P-05-α' },
        { env: '资产库', note: '分层支架卡与方案可行性检查表写入个人教学资产库' },
      ],
      academic: {
        observation: '7 周 · 17 轮模拟 · n=32。任务链加入角色、证据和资源约束后，方案结构更完整；当前尚无本环节局部耦合评价指标，<b>不报告 COUPLING</b>。',
        hypothesis: '分层支架可能通过降低任务启动成本、显化方案约束，帮助学生把概念分析转为可执行方案；该机制需用方案评价标准而非讨论热度检验。',
        rival: '<b>① 任务熟悉度</b>：后期方案完整度提高可能来自重复练习。<b>② 角色材料提示效应</b>：完整度也可能由材料直接提供结构，而非学生能力提升。',
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
        '沉默学生比例从 25% → 12%；协作论证表达 {{S6}}',
      ],
      coupling: '<b>数据提示</b>：认识论追问 + 即时干预与课堂参与公平度、协作论证能力同向上扬 · {{COUPLING}} · <b>建议</b>验证 Hawthorne 效应。',
      writeback: [
        { env: '06 形成性评价与适应性调控', note: '把"认识论追问 + 即时干预"固化为本课实践包默认行为' },
        { env: '资产库', note: '追问句式库写入资产库' },
      ],
      academic: {
        observation: '教师将闭合式追问（"对吗？"）替换为认识论追问（"为什么这样安排？"）后，<b>{{T6}}、{{S6}}</b>；话语编码显示，学生证据引用型发言比例从 <b>18% 升至 62%</b>（同一 6 轮对比，手动编码）。',
        hypothesis: '基于<b>责任话语理论</b> <cite>(Michaels et al., 2008)</cite>：认识论问题比确认性问题更能触发思维可见化（thinking aloud），使学生从断言性话语转入证据性话语；<b>即时干预沉默的时机效应</b> <cite>(Resnick, 2015)</cite> 可能降低低参与学生的发言门槛，提升课堂参与公平度。',
        rival: '<b>① 教师监控效应（Hawthorne Effect）</b>：教师有意改变提问方式本身可能引发学生警觉，独立于问题类型产生行为改变。<b>② 协同干预混淆</b>：提问方式改变与角色任务复杂度提升同期发生，难以单独归因于追问类型。',
      },
    },
    E07: {
      teacher: [
        '评价标准增加"证据准确性 / 证据相关性 / 证据用于决策"三级要求',
        '<b>但当前评价标准歧义 2 处</b>未解决（立场迁移度无可观察锚点）',
        '{{T7_RANK}}',
      ],
      student: [
        '{{S2}} — 学生能表达立场并主动引用政策原文',
        '但 <b>25% 沉默学生在立场迁移度维度无有效评分记录</b>',
      ],
      coupling: '<b>FIX 信号</b>：{{COUPLING}}，但评价标准歧义可能<b>遮蔽</b>真实增幅 · <b>建议优先修正</b>评价标准并重新评分。',
      writeback: [
        { env: '07 表现性评价与学习成效诊断', note: '补充 3 级行为锚点评价标准（如"分组前后引用的政策条款是否升级"）' },
        { env: '资产库', note: '评价标准模板写入资产库供后续课题复用' },
      ],
      academic: {
        observation: '07 表现性评价与学习成效诊断当前读数为 <b>{{T7}}、{{S2}}、{{COUPLING}}</b>；课后评分记录显示评价标准 R-04"立场迁移度"维度评分者间一致性偏低，5 类评审标注 <b>2 处歧义</b>，25% 沉默学生在该维度无有效评分记录。',
        hypothesis: '基于<b>建设性对齐框架</b> <cite>(Biggs, 1996)</cite>：可观测行为锚点是目标-活动-评价链条闭合的关键节点；锚点缺失可能使高增幅部分源于教师宽松解读而非学生真实能力迁移。<b>SRL 框架</b> <cite>(Zimmerman, 2002)</cite> 进一步预测：无清晰锚点时，学生自我监控循环无法激活，反思行为停留在断言层而非证据层。',
        rival: '<b>① 评分者宽松效应</b>：高 COUPLING 可能部分反映教师对模糊评价标准的宽松评分，而非学生立场迁移能力的实质提升，<b>需计算评分者间信度（κ 系数）</b>加以检验。<b>② 任务设计混淆</b>："政策引用不足"可能源于任务本身未明确要求引用格式，而非评价标准歧义——需通过任务说明对照组分离两种效应。',
      },
    },
    E08: {
      teacher: [
        '教师完成本轮复盘，按“观察—解释—下一步试验”重写改进记录',
        '将泛化反思改为可验证的下一轮假设，并标注需要补采的证据',
      ],
      student: [
        '学生反思文本中能说明观点变化依据的比例提高，但远迁移仍待 EV4 验证',
      ],
      coupling: '<b>数据提示</b>：教师反思迭代与学生反思迁移证据同时出现 · {{COUPLING}}；该关联不等同于远迁移成效。',
      writeback: [
        { env: '08 反思性实践与教学改进', note: '保留“观察—解释—试验”复盘模板，并在下一轮核验假设' },
        { env: '资产库', note: '把复盘模板与证据补采清单写入资产库' },
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
      coupling: '本环节承担跨课程资产沉淀，<b>不计算本轮 COUPLING</b>；学生远迁移由 EV4 独立检验。',
      writeback: [
        { env: '资产库', note: '把"集采替代决策"抽象为 T-集采类 v0.1 模板' },
      ],
    },
  };

  // ============ § 8C · 维度评分锚定标准（草案 v0.1 · 2026-08） ============
  // 地位：补上设计文档 v1.0 缺失的一章——「信号 → 0-10 分」的换算规则。
  // 写法与 evaluation-contract.js XI_RUBRIC_LEVELS 一致：行为锚点 + 可观察证据，
  // 档位与 §1 SCALE.levels 的 L0-L4 对齐（0-1 / 1-3 / 3-5 / 5-7 / 7-10）。
  //
  // 可靠性声明：status 全部为 'draft'——未经评分者间
  // 信度（κ）检验。真实课堂数据接入后，先按本表试评，再按评分分歧点修订锚点。
  // 测量工具缺失的维度不立锚点（写了也是空中楼阁），见 DIM_RUBRICS_DEFERRED。
  const DIM_RUBRICS = {
    // ---------- 教师 8 维 ----------
    T1: {
      status: 'draft',
      signals: '学情诊断卡 · 学生误区识别 · 前测解释 · 课程定位修改记录',
      levels: [
        { band: 'L0', label: '无证据',     desc: '无前测或诊断记录，课程定位凭经验假设。' },
        { band: 'L1', label: '形式完成',   desc: '有前测但仅统计对错；误区识别停留在「学生基础差」类笼统描述。' },
        { band: 'L2', label: '基本可用',   desc: '能指出具体误区（如「SWOT 被列表化」）并给出占比 / 分布，但诊断未转化为后续设计决策。' },
        { band: 'L3', label: '有效应用',   desc: '误区诊断被转化为具体设计（如做成问题链分歧锚点），诊断卡留有可溯的修改轨迹。' },
        { band: 'L4', label: '可迁移复用', desc: '诊断方法沉淀为模板；能解释「为什么这个班这个内容要这样定位」并被他人复用。' },
      ],
    },
    T2: {
      status: 'draft',
      signals: '学习目标文本 · 评价证据表 · 评价标准 · 目标修改记录',
      levels: [
        { band: 'L0', label: '无证据',     desc: '无书面目标，或目标只用「了解 / 掌握」类不可测动词。' },
        { band: 'L1', label: '形式完成',   desc: '目标可测，但评价任务与目标各说各话。' },
        { band: 'L2', label: '基本可用',   desc: '目标—评价逐项对应（建设性对齐），但任务情境与目标能力不完全同构。' },
        { band: 'L3', label: '有效应用',   desc: '目标—任务—评价三向同构，每项目标有可观察证据锚点；修改有版本记录。' },
        { band: 'L4', label: '可迁移复用', desc: '对齐结构沉淀为评价标准模板供同类课程复用；学生能复述「本节要产出什么」。' },
      ],
    },
    T3: {
      status: 'draft',
      signals: '药事情境卡 · 政策证据卡 · 案例资源 · 利益相关者设定',
      levels: [
        { band: 'L0', label: '无证据',     desc: '纯概念讲授，无药事情境。' },
        { band: 'L1', label: '形式完成',   desc: '有案例但仅作课堂导入，与后续任务无关。' },
        { band: 'L2', label: '基本可用',   desc: '情境承载核心任务，但政策证据为转述或截图，学生无需识读原文。' },
        { band: 'L3', label: '有效应用',   desc: '情境含真实政策原文 + 多方利益相关者设定，学生必须在情境内做决策。' },
        { band: 'L4', label: '可迁移复用', desc: '情境库可迁移（替换政策 / 药品即复用）；情境真实度经学生证据验证（如原文引用率上升）。' },
      ],
    },
    T4: {
      status: 'draft',
      signals: '问题链 · 分歧锚点 · 高阶追问 · 反例与证据要求',
      levels: [
        { band: 'L0', label: '无证据',     desc: '无问题设计，讲授为主。' },
        { band: 'L1', label: '形式完成',   desc: '问题为事实回忆型（「什么是 SWOT」），无递进。' },
        { band: 'L2', label: '基本可用',   desc: '问题有递进（定义 → 应用），但缺少认知冲突、证据要求或反例修正。' },
        { band: 'L3', label: '有效应用',   desc: '含分歧锚点、证据要求与追问转向；教师问题链文本可显示从主张到证据再到反例的递进。' },
        { band: 'L4', label: '可迁移复用', desc: '问题链结构（递进 + 锚点 + 证据要求 + 反例修正）沉淀为模板，并有适用条件说明。' },
      ],
    },
    T5: {
      status: 'draft',
      signals: '时间轴 · 活动切换 · 计划—实际时长偏差 · 认知负荷检查点',
      levels: [
        { band: 'L0', label: '无证据',     desc: '无时间结构，讲授一以贯之。' },
        { band: 'L1', label: '形式完成',   desc: '有活动切分但节奏失控（拖堂 / 赶场），讲授占比 >80%。' },
        { band: 'L2', label: '基本可用',   desc: '时间轴执行基本稳定，讲授 / 活动比例有意识控制，但认知负荷峰谷无设计。' },
        { band: 'L3', label: '有效应用',   desc: '活动切换与认知负荷匹配（高强度后有缓冲）；计划—实际时长偏差有记录并触发教师调整。' },
        { band: 'L4', label: '可迁移复用', desc: '节奏策略沉淀为时间轴模板，并写明可观察的调整条件与替代流程。' },
      ],
    },
    T6: {
      status: 'draft',
      signals: '分组任务卡 · 角色卡 · 介入规则 · 即时介入记录',
      levels: [
        { band: 'L0', label: '无证据',     desc: '无互动设计，或互动无结构（自由讨论）。' },
        { band: 'L1', label: '形式完成',   desc: '有分组但任务无角色、无产出要求，也没有教师介入规则。' },
        { band: 'L2', label: '基本可用',   desc: '有角色化任务与基本介入提示，但何时介入、如何退出不明确。' },
        { band: 'L3', label: '有效应用',   desc: '教师按预设条件实施点名邀请、追问转向或角色轮换，并留下介入时间、理由与后续动作记录。' },
        { band: 'L4', label: '可迁移复用', desc: '介入策略沉淀为「如果 X 则 Y」规则表，可被其他教师直接执行。' },
      ],
    },
    T7: {
      status: 'draft',
      signals: '反馈语 · 作业批注 · 证据引用纠错 · 能力诊断报告',
      levels: [
        { band: 'L0', label: '无证据',     desc: '无反馈，或仅给分数无评语。' },
        { band: 'L1', label: '形式完成',   desc: '反馈为笼统评价（「很好 / 再努力」），不指向具体证据。' },
        { band: 'L2', label: '基本可用',   desc: '反馈指向具体证据（引用纠错 / 条目批注），但评价标准有歧义、评分者间一致性未检验。' },
        { band: 'L3', label: '有效应用',   desc: '评价标准含可观察行为锚点，评分者间信度（κ ≥ 0.6）达标；反馈明确指出证据缺口、修订动作与再次提交节点。' },
        { band: 'L4', label: '可迁移复用', desc: '反馈—修正数据写回目标设计（评价标准反向修订通道），形成跨轮迭代资产。' },
      ],
    },
    T8: {
      status: 'draft',
      signals: '复盘文本 · 改进假设 · 后续验证计划 · 资产写回与版本记录',
      levels: [
        { band: 'L0', label: '无证据',     desc: '无复盘、无修改记录，也无后续验证计划。' },
        { band: 'L1', label: '形式完成',   desc: '复盘为过程流水账，只描述发生了什么，不解释教学判断。' },
        { band: 'L2', label: '基本可用',   desc: '能识别一个具体问题并提出修改，但缺少证据依据或验证条件。' },
        { band: 'L3', label: '有效应用',   desc: '能用课堂证据解释问题，形成可检验的改进假设，并记录下一轮验证指标与时间点。' },
        { band: 'L4', label: '可迁移复用', desc: '改进经跨轮验证后写回资产库，保留适用条件、版本差异与失败案例，可供他人复用。' },
      ],
    },
    // ---------- 学生 7 维（S1 暂缓，见 DIM_RUBRICS_DEFERRED） ----------
    S2: {
      status: 'draft',
      signals: '案例分析作业 + AI 文本评估（政策原文引用度）',
      levels: [
        { band: 'L0', label: '无证据',     desc: '作业中无任何政策引用。' },
        { band: 'L1', label: '形式完成',   desc: '引用停留在「国家规定」类泛指，无具体条款 / 文号。' },
        { band: 'L2', label: '基本可用',   desc: '能引用具体条款（如《国办发〔2019〕2 号》），但仅摘录，未用于论证。' },
        { band: 'L3', label: '有效应用',   desc: '引用准确且服务于立场论证（引用 → 论点链条成立），引用准确率可测。' },
        { band: 'L4', label: '可迁移复用', desc: '能在新情境中主动检索并恰当引用未提供过的政策文件，完成识读迁移。' },
      ],
    },
    S3: {
      status: 'draft',
      signals: '小组讨论录音转录 + AI 论证图谱',
      // 与 S6 同源语料的防共线约定：S3 只编码「提及的立场方及其诉求」，
      // 不借用 S6 的论证结构分；同一语料两套编码表，分开打分。
      codingNote: '与 S6 共用讨论语料，但编码表独立：本维只数立场方覆盖与诉求分析。',
      levels: [
        { band: 'L0', label: '无证据',     desc: '分析中无利益相关者视角。' },
        { band: 'L1', label: '形式完成',   desc: '能列出 1–2 方（如「患者 / 药企」），仅标签化无诉求分析。' },
        { band: 'L2', label: '基本可用',   desc: '覆盖 ≥3 方并指出各自利益诉求，但未分析冲突与权衡关系。' },
        { band: 'L3', label: '有效应用',   desc: '覆盖 ≥4 方，能说明立场冲突与取舍（覆盖度变化可测，如 2.8 → 4.1 / 5）。' },
        { band: 'L4', label: '可迁移复用', desc: '能识别沉默方 / 间接方（监管者、未来患者）的被低估利益，并迁移到新议题。' },
      ],
    },
    S4: {
      status: 'draft',
      signals: '情境化判断题 + 评价标准评分',
      levels: [
        { band: 'L0', label: '无证据',     desc: '决策中无风险意识。' },
        { band: 'L1', label: '形式完成',   desc: '只能识别显性风险（如「假药」），无合规边界概念。' },
        { band: 'L2', label: '基本可用',   desc: '能识别合规要求（GSP / GMP / 医保目录规则），但风险判断非黑即白。' },
        { band: 'L3', label: '有效应用',   desc: '能做灰色地带的概率化权衡（如依从性 vs 临床安全），并给出合规路径。' },
        { band: 'L4', label: '可迁移复用', desc: '在新情境中主动构建风险清单并预设缓释措施，判断过程可解释。' },
      ],
    },
    S5: {
      status: 'draft',
      signals: '总结性方案评估 + 评价标准评分',
      levels: [
        { band: 'L0', label: '无证据',     desc: '未提交任何可评估的方案产出。' },
        { band: 'L1', label: '形式完成',   desc: '方案为口号式建议（「加强监管」），无操作结构。' },
        { band: 'L2', label: '基本可用',   desc: '方案有步骤，但缺资源与约束考量（成本 / 执行主体缺失）。' },
        { band: 'L3', label: '有效应用',   desc: '方案含 TOWS 式推导（策略与 SWOT 条目对应），考虑执行主体与资源约束，可落地。' },
        { band: 'L4', label: '可迁移复用', desc: '方案含风险预案与效果评估指标，结构可迁移到其他决策议题。' },
      ],
    },
    S6: {
      status: 'draft',
      signals: '小组讨论录音转录 + 论证质量评分（话语编码）',
      // 防共线约定见 S3 codingNote。
      codingNote: '与 S3 共用讨论语料，但编码表独立：本维只编码「主张—证据—反驳」论证结构。',
      levels: [
        { band: 'L0', label: '无证据',     desc: '讨论中无发言，或发言离题。' },
        { band: 'L1', label: '形式完成',   desc: '发言为断言型（「我觉得…」），无证据支持。' },
        { band: 'L2', label: '基本可用',   desc: '能引用证据支持主张，但无对他人发言的回应（各说各话）。' },
        { band: 'L3', label: '有效应用',   desc: '出现「主张—证据—反驳」结构，基于证据反驳的发言占比可测上升（如 12% → 38%）。' },
        { band: 'L4', label: '可迁移复用', desc: '能整合对立立场形成升级主张（立场切换后共识质量提升），论证图谱呈多向连接。' },
      ],
    },
    S7: {
      status: 'draft',
      signals: '课后反思文本 · 版本对比记录 · 自我监控与修正记录',
      levels: [
        { band: 'L0', label: '无证据',     desc: '无反思产出。' },
        { band: 'L1', label: '形式完成',   desc: '反思为内容复述（「今天学了 SWOT」）。' },
        { band: 'L2', label: '基本可用',   desc: '能描述观点变化（「原来同价 ≠ 同效」），但不说明变化的证据来源。' },
        { band: 'L3', label: '有效应用',   desc: '反思含证据链（对照版本指出具体修改及理由），能说明「哪个环节改变了我的判断」。' },
        { band: 'L4', label: '可迁移复用', desc: '能主动设定检查点、监控判断偏差并依据证据修正策略，形成跨任务稳定的自我调节循环。' },
      ],
    },
  };

  // 暂缓立锚点的维度及原因（测量工具缺失时不写，写了也不可靠）
  const DIM_RUBRICS_DEFERRED = {
    S1: '工具迁移的唯一测量工具（课程间迁移作业 / EV4 迁移测试）尚未接入——EV4 当前为 C 级占位，'
      + '主驱动环节 E09 的因果链也未验证。EV4 落地并提供真实迁移数据前，不立锚点。',
  };

  // ============ § 9 · Sample raw 维度 Δ（cumulative · 演示用） ============
  // 能力增量只用于教师/学生 lane 与同期观测说明，不参与 COUPLING 计算。
  const SAMPLE_TEACHER_DELTAS = {
    cumulative: { T1: 2.5, T2: 2.2, T3: 2.2, T4: 5.7, T5: 3.0, T6: 6.8, T7: 4.2, T8: 2.0 },
    weekly:     { T1: 0.4, T2: 0.4, T3: 0.4, T4: 1.0, T5: 0.5, T6: 1.2, T7: 0.7, T8: 0.3 },
    single:     { T1: 0.1, T2: 0.1, T3: 0.1, T4: 0.4, T5: 0.2, T6: 0.5, T7: 0.2, T8: 0.1 },
  };
  const SAMPLE_STUDENT_DELTAS = {
    cumulative: { S1: null, S2: 3.4, S3: 5.5, S4: 1.8, S5: 1.6, S6: 4.2, S7: 1.4 },
    weekly:     { S1: null, S2: 0.5, S3: 0.9, S4: 0.3, S5: 0.3, S6: 0.8, S7: 0.2 },
    single:     { S1: null, S2: 0.2, S3: 0.3, S4: 0.1, S5: 0.1, S6: 0.2, S7: 0.1 },
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
        const rawDelta = cumDeltas[d.id];
        out[ev.id][d.id] = (typeof rawDelta === 'number' && Number.isFinite(rawDelta))
          ? +(base + rawDelta * (prog[d.id] ?? 0)).toFixed(2)
          : null;
      }
    }
    return out;
  }
  // 样本节点分数（与 cumulative 模式对应）
  const SAMPLE_STUDENT_EVENT_SCORES = _deriveEventScores(SAMPLE_STUDENT_DELTAS.cumulative);

  // ============ § 10 · 派生 API ============
  function deriveLane(dimDeltas, matrix) {
    return ENVIRONMENTS.map(env => {
      const score = envScore(dimDeltas, matrix[env.id] || {});
      return score == null ? null : +score.toFixed(1);
    });
  }
  // 派生 5 个学生节点的"综合分"（按节点 dims 加权 7 维分数）+ Δ vs 基线
  function deriveEventLane(eventScores, measurementMode) {
    eventScores = eventScores || {};
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
        measurementMode: cur ? (measurementMode || 'observed') : 'missing',
      };
    });
  }

  // ============ § 10A · LIVE 数据覆盖层（真实课堂接入）============
  // 通过 loadDataset() 注入的真实数据写到 localStorage，刷新后仍在。
  // 校验通过后，LIVE_DATASET 覆盖 SAMPLE_* 作为 buildDataset 的输入。
  // v2 只接收绝对前测 / 当前分；Δ 由系统相减，允许为负。旧版仅提交 Δ 的 JSON
  // 无法证明量尺、基线与缺失值，必须 fail closed，不能静默兼容。
  // measurements.teacher.cumulative = { baseline:{T1..T8}, current:{T1..T8} }
  // measurements.student.cumulative = { baseline:{S1..S7}, current:{S1..S7} }
  // weekly / single 同构；某维未测时 baseline 与 current 必须同时为 null。
  const LIVE_SCHEMA_VERSION = '2.0';
  const LIVE_LS_KEY = 'pp.liveDataset';
  let LIVE_DATASET = null;

  function _isScoreOrNull(value) {
    return value === null || (typeof value === 'number' && Number.isFinite(value) &&
      value >= SCALE.perDimension.min && value <= SCALE.perDimension.max);
  }

  function _validateMeasurementPair(pair, dims, path) {
    if (!pair || typeof pair !== 'object' || !pair.baseline || !pair.current) {
      return `${path} 必须同时提供 baseline 与 current`;
    }
    let measured = 0;
    for (const d of dims) {
      const b = pair.baseline[d.id];
      const c = pair.current[d.id];
      if (!_isScoreOrNull(b)) return `${path}.baseline.${d.id} 必须是 0–10 数字或 null`;
      if (!_isScoreOrNull(c)) return `${path}.current.${d.id} 必须是 0–10 数字或 null`;
      if ((b === null) !== (c === null)) return `${path}.${d.id} 的 baseline 与 current 必须同时有值或同时为 null`;
      if (typeof b === 'number') measured += 1;
    }
    if (measured === 0) return `${path} 至少要有一个已测维度`;
    return null;
  }

  function _validateMeasurementMeta(meta) {
    if (!meta || typeof meta !== 'object') return '缺少 measurementMeta 测量元数据';
    if (typeof meta.rubricVersion !== 'string' || !meta.rubricVersion.trim()) return 'measurementMeta.rubricVersion 必填';
    if (typeof meta.taskVersion !== 'string' || !meta.taskVersion.trim()) return 'measurementMeta.taskVersion 必填';
    if (!Number.isInteger(meta.sampleSize) || meta.sampleSize <= 0) return 'measurementMeta.sampleSize 必须是正整数';
    if (typeof meta.missingRate !== 'number' || !Number.isFinite(meta.missingRate) || meta.missingRate < 0 || meta.missingRate > 1) {
      return 'measurementMeta.missingRate 必须是 0–1 的数字';
    }
    if (!Number.isInteger(meta.raterCount) || meta.raterCount <= 0) return 'measurementMeta.raterCount 必须是正整数';
    return null;
  }

  function _validateLiveDataset(payload) {
    if (!payload || typeof payload !== 'object') return '数据必须是 JSON 对象';
    const modes = ['cumulative', 'weekly', 'single'];
    if (payload.schemaVersion !== LIVE_SCHEMA_VERSION) {
      return `schemaVersion 必须是 ${LIVE_SCHEMA_VERSION}；旧版仅含 Δ 的 teacher / student JSON 已停用`;
    }
    if (!payload.measurements?.teacher || !payload.measurements?.student) return '缺少 measurements.teacher / measurements.student 字段';
    const metaError = _validateMeasurementMeta(payload.measurementMeta);
    if (metaError) return metaError;
    if (payload.evidenceLevel != null && !EVIDENCE_LEVELS[payload.evidenceLevel]) {
      return 'evidenceLevel 必须是 A / B / C / D';
    }
    for (const m of modes) {
      const tError = _validateMeasurementPair(payload.measurements.teacher[m], TEACHER_DIMS, `measurements.teacher.${m}`);
      if (tError) return tError;
      const sError = _validateMeasurementPair(payload.measurements.student[m], STUDENT_DIMS, `measurements.student.${m}`);
      if (sError) return sError;
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
    if (payload.couplingRubric != null) {
      if (!payload.couplingRubric || typeof payload.couplingRubric !== 'object') {
        return 'couplingRubric 必须是对象';
      }
      const contract = window.PharmacoPilotEvaluationContract;
      if (!contract?.validateRubricBlock) return 'COUPLING 契约未加载';
      for (const mode of modes) {
        const block = payload.couplingRubric[mode];
        if (!block) return `couplingRubric.${mode} 缺失`;
        const rubricError = contract.validateRubricBlock(block);
        if (rubricError) return `couplingRubric.${mode}: ${rubricError}`;
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

  function _deriveDeltas(pair, dims) {
    if (!pair) return null;
    return Object.fromEntries(dims.map(d => {
      const b = pair.baseline?.[d.id];
      const c = pair.current?.[d.id];
      return [d.id, (typeof b === 'number' && typeof c === 'number') ? +(c - b).toFixed(2) : null];
    }));
  }

  function getActiveTeacherDeltas(mode) {
    return LIVE_DATASET
      ? _deriveDeltas(LIVE_DATASET.measurements.teacher[mode], TEACHER_DIMS)
      : SAMPLE_TEACHER_DELTAS[mode];
  }
  function getActiveStudentDeltas(mode) {
    return LIVE_DATASET
      ? _deriveDeltas(LIVE_DATASET.measurements.student[mode], STUDENT_DIMS)
      : SAMPLE_STUDENT_DELTAS[mode];
  }
  function getActiveCouplingRubric(mode) {
    if (LIVE_DATASET) return LIVE_DATASET.couplingRubric?.[mode] || null;
    return window.PharmacoPilotEvaluationContract?.SAMPLE_XI_RUBRIC_SCORES?.[mode] || null;
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
      measurementMeta: LIVE_DATASET.measurementMeta,
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
    // LIVE 缺节点观测时保持 missing，严禁套用样本进度系数补齐。
    if (LIVE_DATASET?.studentEvents && mode === 'cumulative') {
      return LIVE_DATASET.studentEvents;
    }
    if (LIVE_DATASET) return null;
    return _deriveEventScores(getActiveStudentDeltas(mode));
  }

  function _finiteValues(obj) {
    return Object.values(obj || {}).filter(v => typeof v === 'number' && Number.isFinite(v));
  }

  function _mean(obj) {
    const values = _finiteValues(obj);
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  }

  function _formatMeanDelta(value) {
    if (value == null) return '未测';
    return `${value > 0 ? '+' : ''}${value.toFixed(1)} / 10`;
  }

  function buildDataset(mode) {
    const t = getActiveTeacherDeltas(mode);
    const s = getActiveStudentDeltas(mode);
    if (!t || !s) return null;
    const teacher = deriveLane(t, TEACHER_MATRIX);
    const student = deriveLane(s, STUDENT_MATRIX);                  // 旧 9 列学生 lane（兼容性保留）
    // 新双时间轴产物
    const eventScores = getActiveStudentEventScores(mode);
    const studentEvents = deriveEventLane(eventScores, LIVE_DATASET ? 'observed' : 'model-derived');
    const meta = getDataSourceMeta();
    const contract = window.PharmacoPilotEvaluationContract;
    const rubricBlock = LIVE_DATASET ? LIVE_DATASET.couplingRubric?.[mode] : null;
    const profile = contract?.buildCouplingProfile
      ? contract.buildCouplingProfile(mode, rubricBlock, meta.evidenceLevel)
      : { ok: false, error: 'COUPLING 契约未加载', lane: Array(9).fill(null), bridges: [] };
    // LIVE 能力数据允许先接入，但缺 X1/X2-X5 评价指标时不猜测 COUPLING。
    const liveMissingRubric = meta.isLive && !rubricBlock;
    const couplingLane = liveMissingRubric ? Array(9).fill(null) : profile.lane;
    const bridges = liveMissingRubric ? [] : profile.bridges;
    const associationSummary = (!liveMissingRubric && contract?.buildAssociationSummary)
      ? contract.buildAssociationSummary(couplingLane, ENVIRONMENTS.length)
      : { available: false, mean: null, covered: 0, total: ENVIRONMENTS.length, coverageRate: 0 };
    const teacherMeanDelta = _mean(t);
    const studentMeanDelta = _mean(s);
    const teacherMeasuredCount = _finiteValues(t).length;
    const studentMeasuredCount = _finiteValues(s).length;
    return {
      label: LIVE_DATASET?.label || BASELINES[mode]?.detail || mode,
      teacher,
      student,                                                       // 旧 lane (供兼容旧 renderLane)
      coupling: couplingLane,                                        // 旧 spine
      studentEvents,                                                 // 新 5 节点
      bridges,                                                       // 新 N 条 COUPLING 连线
      couplingRubric: liveMissingRubric ? null : profile.rubric,
      couplingStatus: liveMissingRubric
        ? { available: false, reason: 'LIVE 数据未提供 couplingRubric，未计算 COUPLING' }
        : { available: !!profile.ok, reason: profile.error || null },
      couplingSource: 'evaluation-contract',
      associationSummary,
      teacherTotal: _formatMeanDelta(teacherMeanDelta),
      studentTotal: _formatMeanDelta(studentMeanDelta),
      teacherMeanDelta,
      studentMeanDelta,
      teacherMeasuredCount,
      studentMeasuredCount,
      measurementStatus: LIVE_DATASET
        ? { type: 'observed', label: '前后测实测', meta: LIVE_DATASET.measurementMeta }
        : { type: 'simulation', label: '虚拟演练推演', meta: null },
      raw: { teacherDims: t, studentDims: s, eventScores },
      evidenceLevel: meta.evidenceLevel,
      isLive: meta.isLive,
    };
  }

  // ============ EXPORT ============
  window.PharmacoPilotEvaluationFramework = {
    SCALE, EVIDENCE_LEVELS, CURRENT_EVIDENCE_LEVEL, DATA_SOURCE_STATUS,
    TEACHER_DIMS, STUDENT_DIMS, COUPLING_DIMS,
    ENVIRONMENTS,
    // 双时间轴新增 ↓
    STUDENT_EVENTS, ENV_TO_EVENT,
    SAMPLE_STUDENT_EVENT_SCORES, SAMPLE_EVENT_BASELINES, SAMPLE_EVENT_PROGRESS,
    TEACHER_MATRIX, STUDENT_MATRIX, MATRIX_REFS,
    COUPLING_REFS, COUPLING_THRESHOLDS,
    BASELINES, DATA_SOURCES, AI_PROCESS_INDICATORS, RUBRIC_CROSSWALK, ENV_EVIDENCE,
    DIM_RUBRICS, DIM_RUBRICS_DEFERRED,
    SAMPLE_TEACHER_DELTAS, SAMPLE_STUDENT_DELTAS,
    envScore, deriveLane, buildDataset,
    // 双时间轴新增 ↓
    deriveEventLane, getActiveStudentEventScores,
    // LIVE 数据接入 API
    LIVE_SCHEMA_VERSION, loadDataset, clearDataset, getDataSourceMeta,
    getActiveTeacherDeltas, getActiveStudentDeltas,
    getActiveCouplingRubric,
    // 师生关系分类（co / solo）
    getEnvCoCategory,
  };
})();
