/*
 * PharmacoPilot · Station 05 Payload · 知识结构与关键误区定位
 * ------------------------------------------------------------
 * v4 教学环节归属：S3 知识结构与关键误区定位（S3 唯一子节点）
 * 核心：6 层方法论严谨链问题链 + 关键误区清单
 *
 * 注册到 window.PharmacoPilotStationPayloads[5]
 * ============================================================ */
(function attachStation5Payload(global) {
  "use strict";

  const STATION_ID = 5;

  const payload = {
    id: STATION_ID,
    version: "stages-v4",
    parentStageId: "S3",
    subNodeKey: "5",
    exampleCase: { topic: "SWOT", subject: "华海药业", scenario: "集采常态化" },

    chainTopcard: {
      layerId: "L3",
      sticky: true,
      minimizedHeight: 32,
      inputsFrom: [
        { stationId: 4, label: "学习目标", key: "目标 + 评价证据",
          snippet: "能识别 SWOT 各维证据来源，完成 TOWS 推导 + 批判 SWOT 局限" },
      ],
      outputsTo: [
        { stationId: 6, label: "案例", outKey: "问题链 → 案例切入点" },
        { stationId: 7, label: "时间线", outKey: "问题链 → 27 分钟结构化实战节奏" },
      ],
    },

    narrative: {
      what: "把教材内容重构为问题链、概念链和任务链，帮助学生围绕真实问题推进学习。",
      why:  "直接按教材顺序讲会退化为概念讲授；药事管理课堂应围绕事实、证据、判断、策略和风险组织内容。",
      how:  "查看 6 层方法论严谨链 + 关键误区清单，选择内容组织方式，生成课堂问题链与概念边界说明。",
    },

    evidenceFigure: {
      title: "6 层方法论严谨链 + 关键误区清单",
      subtitle: "看学生最易卡在哪个误区",
      evidenceNote: "问题链每升一层，学生认知负荷上升一档；卡点恰是教学高价值点。",

      // 6 层方法论严谨链（这是 SWOT 课的灵魂）
      questionChain: [
        { lvl: 1, type: "事实",   text: "什么是 SWOT 四象限？",                       difficulty: "low",  blocking: 0.05 },
        { lvl: 2, type: "机制",   text: "什么算「内部」？什么算「外部」？",            difficulty: "med",  blocking: 0.42 },
        { lvl: 3, type: "证据",   text: "每条 SWOT 必须配什么证据？",                  difficulty: "high", blocking: 0.58 },
        { lvl: 4, type: "权重",   text: "列出 20 条后，哪 3 条最重要？",               difficulty: "high", blocking: 0.48 },
        { lvl: 5, type: "应用",   text: "SWOT 本身不产策略，TOWS 才产——怎么推 TOWS？", difficulty: "v.high",blocking: 0.62 },
        { lvl: 6, type: "批判",   text: "SWOT 工具本身有哪些局限？",                   difficulty: "v.high",blocking: 0.72 },
      ],

      // 关键误区清单（药事管理特有）+ 教学对策（v4.2 新增）
      keyMisconceptions: [
        {
          key: "policy-in-W",
          text: "政策威胁被塞进 W 维（应是 T）",
          frequency: 0.38, stage: "lvl-2",
          intervention: "在导入段用一道判断题专测「内/外因边界」（如「集采降价 30% 归入 W 还是 T？」）。课前别在讲授里提示，否则会变成「记忆题」而非「概念判断题」。",
        },
        {
          key: "adjective-only",
          text: "条目用形容词「质量好 / 管理强」无数据",
          frequency: 0.62, stage: "lvl-3",
          intervention: "在小组任务说明里硬性要求「每条 SWOT 必须引用 1 个具体数字 + 1 个来源（年报/政策号/行业排名）」。可在协作前先给一份「合格条目示例 vs 不合格示例」对照卡。",
        },
        {
          key: "laundry-list",
          text: "条目超 10 条流水账无权重",
          frequency: 0.45, stage: "lvl-4",
          intervention: "限制单象限条目数（≤6 条）并强制「三选一」权重排序。在 Z2 锚点（28'）做一次「请你的小组挑出 1 条最关键的 W 维」的实时筛选。",
        },
        {
          key: "no-tows",
          text: "做完 SWOT 不做 TOWS 直接出战略",
          frequency: 0.62, stage: "lvl-5",
          intervention: "把任务表述改为「SWOT-TOWS 二步走」并把 TOWS 列为独立评价维度（占 24%）。展示阶段强制每组展示一个 SO/WT 战略矩阵。",
        },
        {
          key: "no-self-critique",
          text: "完全不指出 SWOT 工具局限",
          frequency: 0.78, stage: "lvl-6",
          intervention: "在反馈段（39′–42′）留 3 分钟做「工具批判圆桌」，由教师抛出 2 条挑战（如「SWOT 没有时间维度」「内外边界模糊」），要求学生现场回应；随后 42′ 接 Z3 课末测温，44′–45′ 收尾。写入「批判意识」评价维度（占 28%）。",
        },
      ],

      // 4 选 1 内容组织方式权重（用 bars）
      bars: [
        ["按方法论严谨链 (6 层)", 88, { status: "ok",   source: "推荐：每层 1 题，最后批判工具" }],
        ["按教材章节顺序",         42, { status: "warn", source: "覆盖全但易退回讲授" }],
        ["按案例驱动",             68, { status: "ok",   source: "情境感强但概念跳跃" }],
        ["按学生议程倒推",         72, { status: "ok",   source: "回响 议程贯通" }],
      ],

      flow: ["看链条", "标误区", "排问题链"],
    },

    decision: {
      question: "本课内容重构的主线应是什么？",
      options: [
        {
          key: "chain",
          label: "按方法论严谨链 6 层组织（事实→机制→证据→权重→TOWS→批判）",
          rationale: "命中 SWOT 课最大失分区：3/6 个误区都在第 3 / 5 / 6 层。逐层推进可显式触发每个误区。",
          score: 3.8,
          meta: { recommended: true },
        },
        {
          key: "agenda-reverse",
          label: "按学生议程倒推",
          rationale: "回响 议程贯通（学习者议程 的 5 条议程作为问题起点）。但议程并非按方法论严谨度排序，可能跳过基础误区。",
          score: 3.5,
        },
        {
          key: "case",
          label: "按华海药业案例情境驱动",
          rationale: "情境感强，但概念跳跃风险高（学生可能记住「华海」却不会迁移到其他企业）。",
          score: 3.0,
        },
        {
          key: "textbook",
          label: "按教材章节顺序逐段讲授",
          rationale: "结构清楚但容易退回概念讲授；违反 contract 中「不得退化为概念讲授」原则。",
          score: 2.1,
          meta: { lintTriggers: ["forbidden-lecture-style"] },
        },
      ],
      validation: { mustSelect: true, afterSelectShow: ["rationale", "riskBadges"] },
    },

    feedbackByKey: {
      "chain":          { summary: "✓ 触发所有 5 类误区",       riskBadges: ["方法论主链"],     detail: "选此后建议真实性学习情境与资源设计环节 案例每条 SWOT 显式标注「事实 / 政策 / 数据 / 角色 / 风险边界」5 类标签，对应第 3 层证据要求。" },
      "agenda-reverse": { summary: "✓ 议程深度联动",         riskBadges: ["议程联动"],        detail: "5 条议程将映射为问题链 1-5 题。但需在第 6 题强制加批判（议程通常不会自带）。" },
      "case":           { summary: "△ 迁移性弱",                riskBadges: ["概念跳跃"],       detail: "建议改用 chain 主线 + 华海作为单一案例锚（而非主线）。" },
      "textbook":       { summary: "✕ 违反「不得退化讲授」禁条", riskBadges: ["禁条触发"],      detail: "教材顺序会让 27 分钟结构化实战被压缩。" },
    },

    artifacts: [
      {
        id: "question-chain",
        buttonLabel: "⬇ 生成 6 层方法论严谨链问题链",
        outputTitle: "课堂问题链 v1 · 6 层方法论严谨链",
        outputCue: "把 6 层方法论严谨度排成 6 道课堂问题，每道触发一类典型误区。",
        artifactLines: {
          evidence: "6 层难度阶梯 · 问题链卡点率（metricId: s3_question_chain_blocking，individual）：lvl-1 5% → lvl-6 72%。高价值教学点集中在 3/5/6 层。",
          action: "为每层准备 1 道触发性问题 + 1 条预设反例；第 6 层必须落到「SWOT 工具局限」。",
          constraints: [
            "≤ 6 题（避免认知过载）",
            "每题必须显式对应 1 类误区",
            "第 6 题必须问工具批判（区分本科与中专培训的关键）",
          ],
        },
        writeback: { to: "artifactLibrary" },
      },
      {
        id: "concept-map",
        buttonLabel: "⬇ 生成概念边界说明 + 关键误区清单",
        outputTitle: "概念边界说明 v1",
        outputCue: "为学生提供「内 / 外 · 事实 / 立场 · 现状 / 趋势」3 组关键边界判断卡。",
        artifactLines: {
          evidence: "5 类高频误区 · 误区发生频率（metricId: s3_misconception_frequency，individual）：集中在 lvl-2 / lvl-3 / lvl-5 / lvl-6；最高 78% 学生完全不批判 SWOT 工具。注意本项与上方「问题链卡点率」是两个不同量具，同一 lvl 的数值不可互相替代（如 lvl-6：卡点率 72% ≠ 误区频率 78%）。",
          action: "把 5 类误区编为「正反例对照卡」嵌入真实性学习情境与资源设计环节 案例材料 + 形成性评价与适应性调控环节 ZPD 锚点测温题。",
          constraints: [
            "每个误区配 1 个正例 + 1 个反例",
            "误区频率 > 50% 必须进入形成性评价与适应性调控环节 ZPD 测温",
            "概念边界须用药事管理情境（非通用商科）",
          ],
        },
        writeback: { to: "artifactLibrary" },
      },
    ],

    stateMachine: {
      A: { id: "locked",       desc: "未进入 · 预期学习结果与评价证据设计环节 目标判断未保存" },
      B: { id: "entered",      desc: "已进入未判断" },
      C: { id: "selected",     desc: "已选未保存" },
      D: { id: "saved",        desc: "已保存判断 · 数据流入真实性学习情境与资源设计环节 / 7" },
      E: { id: "artifactDone", desc: "已生成问题链 + 概念边界说明" },
    },

    lintRules: [
      { id: "forbidden-lecture-style", when: "decision.userChoice === 'textbook'", severity: "medium", onTriggerUI: "选项 textbook 显示「退化讲授」徽章" },
    ],

    horizontalLayerHooks: {
      L1: { visible: false, reason: "L1 锚点在 S5/S6" },
      L2: { visible: false, reason: "L2 议程在 S1/S2/S4/S5/S8 回响（S3 不直接处理议程）" },
      L3: { visible: true, sticky: true, minimizedHeight: 32 },
    },

    persistence: {
      userJudgments: { path: "userJudgments[5]" },
      artifactLibrary: { path: "artifactLibrary" },
      qualityCheckpoints: {
        backendMappingTo20Steps: ["核心概念", "重点难点", "问题链", "认知负荷"],
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
