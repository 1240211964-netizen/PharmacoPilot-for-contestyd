/*
 * PharmacoPilot · Station 10 Payload · 表现性评价实验台
 * ------------------------------------------------------------
 * 读预期学习结果与评价证据设计环节 目标 + 学习活动与教学支架设计环节 学生作品 + 形成性评价与适应性调控环节 学情触发数据 → 生成 5 维评价标准 + 反馈语。
 *
 * 5 维：条目证据性 / 内外分类 / 条目精炼度 / TOWS 可操作性 / 批判意识
 *
 * 注册到 window.PharmacoPilotStationPayloads[10]
 * ============================================================ */
(function attachStation10Payload(global) {
  "use strict";

  const STATION_ID = 10;

  const payload = {
    id: STATION_ID,
    version: "phase11-v3",
    parentStageId: "S7",
    subNodeKey: "10",
    supportsRubricRevision: { to: "S2", storeKey: "rubricRevisions" },
    exampleCase: { topic: "SWOT", subject: "华海药业", scenario: "集采常态化" },

    chainTopcard: {
      layerId: "L3",
      sticky: true,
      minimizedHeight: 32,
      inputsFrom: [
        { stationId: 4, label: "学习目标", key: "学习目标 + 评价证据",
          snippet: "30 分钟内输出带证据 / 带权重 / 带 TOWS 的 SWOT" },
        { stationId: 8, label: "探究协作", key: "学生作品 + 4 角色产出",
          snippet: "5 组 SWOT-TOWS · 含议程角色映射 5/5" },
        { stationId: 9, label: "形成性评价", key: "课堂学情触发记录",
          snippet: "3 个 ZPD 锚点规则 · Z1 触发 1 次 · Z2 触发 0 次 · Z3 触发 1 次" },
      ],
      outputsTo: [
        { stationId: 11, label: "教学反思", outKey: "评价维度得分 + 低分维度 → 复盘报告" },
      ],
    },

    narrative: {
      what: "用 5 维评价标准判断学生作品是否真正体现 SWOT 判断能力，并生成可行动反馈语。",
      why:  "学生作品可能格式完整但质量较低，例如缺少证据、分类错误、策略与分析不匹配或缺少风险边界。",
      how:  "查看评价雷达图 + 低分维度 Pareto 图，判断作品主要问题，生成评价标准与反馈语模板。",
    },

    evidenceFigure: {
      title: "5 维评价雷达图 + 低分维度 Pareto",
      subtitle: "看学生作品在哪一维塌缩",
      evidenceNote: "评分不能只看矩阵完整，还要看证据和策略质量。",

      // 5 维平均分（来自 5 个小组的 mock 评分）
      bars: [
        ["条目证据性",        46, { status: "miss", source: "5 组中 4 组条目缺出处" }],
        ["内外分类准确性",    78, { status: "ok",   source: "仅 1 组把集采放入 W" }],
        ["条目精炼度",        62, { status: "warn", source: "2 组列了 >10 条流水账" }],
        ["TOWS 可操作性",     44, { status: "miss", source: "3 组停在 SWOT 未做 TOWS" }],
        ["批判意识",          38, { status: "miss", source: "无组主动指出 SWOT 工具局限" }],
      ],

      // Pareto · 低分维度排序（用于确定下一轮优先项）
      paretoLowDimensions: [
        { dim: "批判意识",      mean: 38, weightInTotal: 0.28 },
        { dim: "TOWS 可操作性", mean: 44, weightInTotal: 0.24 },
        { dim: "条目证据性",    mean: 46, weightInTotal: 0.22 },
      ],

      // 5 维评价标准定义（v4.2：每级补行为锚点 + 药事管理实例，解决评分者间信度问题）
      rubric: [
        {
          dim: "条目证据性",
          levels: [
            "4 优秀 = 每条 SWOT 引用具体出处（如「华海 2024 年报 P.18 研发投入 5.43 亿元」、「国办发〔2018〕20 号文件第 4 条」）；可被他人复核",
            "3 合格 = 多数条目有出处但精度不足（如仅写「年报数据」、「医保局文件」未指明页码或文号）",
            "2 不合格 = 多为形容词（如「研发能力强」「政策支持好」），缺可验证数据；评分者无法判断真伪",
          ],
        },
        {
          dim: "内外分类准确性",
          levels: [
            "4 优秀 = 全部象限分类正确（如集采降价归入 T 而非 W；MAH 政策归入 O 而非 S）",
            "3 合格 = 偶有错位（1-2 条放错象限），能在追问下自我修正",
            "2 不合格 = 多处错位（≥3 条），如把外部政策威胁塞入 W 维或把内部劣势塞入 T 维",
          ],
        },
        {
          dim: "条目精炼度",
          levels: [
            "4 优秀 = ≤6 条抓主要矛盾，每条 1 句话，按重要度排序",
            "3 合格 = 7-10 条条目，存在并列但仍能识别主次",
            "2 不合格 = >10 条流水账，无权重无排序，评分者无法识别核心结论",
          ],
        },
        {
          dim: "TOWS 可操作性",
          levels: [
            "4 优秀 = TOWS 含可量化 KPI（如「SO 战略：2025 年原料药出口额提升 15%」、「ST 战略：CDMO 业务占比从 8% 提升到 20%」）",
            "3 合格 = TOWS 有方向但不具体（如「加大研发投入」「拓展海外市场」），缺时间表与指标",
            "2 不合格 = 仅口号（如「积极应对集采」「抓住机遇」），未形成可执行战略；或完全跳过 TOWS",
          ],
        },
        {
          dim: "批判意识",
          levels: [
            "4 优秀 = 主动指出 SWOT 工具局限（如「SWOT 是快照不含时间维度，不适合 5 年长期战略」、「内外边界因企业边界变化而模糊」）",
            "3 合格 = 教师追问后能答出 1-2 条局限",
            "2 不合格 = 完全无批判，把 SWOT 当作客观真理使用",
          ],
        },
      ],

      flow: ["看雷达", "排 Pareto", "写反馈"],
    },

    decision: {
      question: "表现性评价最应强调什么？",
      options: [
        {
          key: "evidence-first",
          label: "条目证据性（5 组中 4 组最低分维度）",
          rationale: "Pareto 排序第 3，但是最可教、最可短期改善的维度。建议第 1 优先级。",
          score: 3.9,
          meta: { recommended: true },
        },
        {
          key: "tows-action",
          label: "TOWS 可操作性（半数小组停在 SWOT）",
          rationale: "命中 SWOT 课的标志性失分区。但需要 30 分钟时间预算，本节课已不够。",
          score: 3.4,
        },
        {
          key: "format",
          label: "主要看矩阵格式是否完整",
          rationale: "形式完整不代表思维质量。会让评价退化为「四象限填满即满分」。",
          score: 1.9,
          meta: { lintTriggers: ["format-only-grading"] },
        },
        {
          key: "impression",
          label: "按小组展示印象给分",
          rationale: "主观性过强，证据不足，无法支撑下一轮迭代。",
          score: 1.6,
          meta: { lintTriggers: ["forbidden-impression-grading"] },
        },
      ],
      validation: { mustSelect: true, afterSelectShow: ["rationale", "riskBadges"] },
    },

    feedbackByKey: {
      "evidence-first": { summary: "✓ Pareto 优先级合理",  riskBadges: ["高 ROI"],   detail: "证据性是基础维度。先抓这一维，TOWS 与批判意识在下一轮再补。" },
      "tows-action":    { summary: "△ 时间预算不够",       riskBadges: ["延后处理"], detail: "TOWS 训练需要 30 分钟独立时段，建议放下一节专题。" },
      "format":         { summary: "✕ 评价退化风险",       riskBadges: ["退化"],    detail: "format-only 评价会让学生形成「填满 = 完成」的误解。" },
      "impression":     { summary: "✕ 主观偏差",          riskBadges: ["不可解释"], detail: "印象分无法支撑下一轮迭代，违反 contract 评价证据可解释性约束。" },
    },

    artifacts: [
      {
        id: "rubric-5d",
        buttonLabel: "⬇ 生成 5 维 SWOT 评价标准",
        outputTitle: "5 维表现性评价标准",
        outputCue: "把评价重心从格式完整转向判断质量。",
        artifactLines: {
          evidence: "5 维平均分：条目证据性 46 / 内外分类 78 / 精炼度 62 / TOWS 44 / 批判意识 38。",
          action: "用 5 维评价标准逐项评分；条目证据性与 TOWS 进入二次修改要求。",
          constraints: [
            "评分依据必须可解释",
            "反馈必须指向下一步修改",
            "评价不能只看表格是否填满",
          ],
        },
        writeback: { to: "artifactLibrary" },
      },
      {
        id: "feedback-language",
        buttonLabel: "⬇ 生成 5 类典型问题的反馈语模板",
        outputTitle: "反馈语模板（针对 5 类低分作品）",
        outputCue: "把评价转化为可被学生改进的具体话术。",
        artifactLines: {
          evidence: "5 类典型问题：① 形容词条目 ② 政策错位 ③ 流水账 ④ 只做 SWOT 不做 TOWS ⑤ 缺批判意识。",
          action: "为每类问题写 2 句反馈语（含「需要做什么」+ 「为什么」）。",
          constraints: [
            "反馈语必须可执行",
            "反馈语必须给出修改样例",
            "避免「不够好」「再深入」类无信息词",
          ],
        },
        writeback: { to: "artifactLibrary" },
      },
    ],

    stateMachine: {
      A: { id: "locked",       desc: "未进入 · 学习活动与教学支架设计环节 学生作品未生成" },
      B: { id: "entered",      desc: "已进入未判断" },
      C: { id: "selected",     desc: "已选未保存" },
      D: { id: "saved",        desc: "已保存判断" },
      E: { id: "artifactDone", desc: "已生成 5 维评价标准 + 反馈语 · 数据流入 S8 反思性实践与教学改进" },
    },

    lintRules: [
      { id: "format-only-grading",        when: "decision.userChoice === 'format'",     severity: "medium", onTriggerUI: "选项 format 显示「评价退化」徽章" },
      { id: "forbidden-impression-grading", when: "decision.userChoice === 'impression'", severity: "medium", onTriggerUI: "选项 impression 显示「不可解释」徽章" },
    ],

    horizontalLayerHooks: {
      L1: { visible: true, role: "trace-consumer", readsFromStore: "pulseRules" },
      L2: { visible: false, reason: "L2 在 4/6/8/11" },
      L3: { visible: true, sticky: true, minimizedHeight: 32 },
    },

    persistence: {
      userJudgments: { path: "userJudgments[10]" },
      artifactLibrary: { path: "artifactLibrary" },
      qualityCheckpoints: {
        backendMappingTo20Steps: ["学生作品", "评价标准", "评分说明", "反馈语", "二次修改"],
      },
    },
  };

  function deepFreeze(obj) {
    Object.freeze(obj);
    Object.getOwnPropertyNames(obj).forEach((p) => {
      const v = obj[p];
      if (v && typeof v === "object" && !Object.isFrozen(v)) deepFreeze(v);
    });
    return obj;
  }

  if (!global.PharmacoPilotStationPayloads) global.PharmacoPilotStationPayloads = {};
  global.PharmacoPilotStationPayloads[STATION_ID] = deepFreeze(payload);
})(window);
