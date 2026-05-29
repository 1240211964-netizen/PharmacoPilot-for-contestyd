/*
 * PharmacoPilot · Station 07 Payload · 课堂活动编排器
 * ------------------------------------------------------------
 * 示例载荷：SWOT 分析 · 华海药业 · 45 分钟课堂（与 practice-runtime-contract.timing 一致）
 * L1 动态学情触发线第 1 个工作点：定义 3 个 学情校准点位置
 *
 * v4.2: 课时统一 45 min。ZPD 锚点重排为 Z1@10' / Z2@28' / Z3@42'，
 *       覆盖"早期诊断 / 实战段中点 / 知识封闭"三阶段，匹配虚拟班 32 人数据。
 *
 * 注册到 window.PharmacoPilotStationPayloads[7]
 * ============================================================ */
(function attachStation7Payload(global) {
  "use strict";

  const STATION_ID = 7;

  const payload = {
    id: STATION_ID,
    version: "phase11-v3",
    parentStageId: "S5",
    subNodeKey: "7",
    exampleCase: { topic: "SWOT", subject: "华海药业", scenario: "集采常态化" },

    chainTopcard: {
      layerId: "L3",
      sticky: true,
      minimizedHeight: 32,
      inputsFrom: [
        { stationId: 4, label: "学习目标", key: "学习目标",
          snippet: "30 分钟内输出带证据带权重带 TOWS 的 SWOT" },
        { stationId: 5, label: "问题链", key: "方法论严谨链",
          snippet: "6 层 · 重点 内外分类 / 证据 / 权重 / TOWS / 工具批判" },
      ],
      outputsTo: [
        { stationId: 8, label: "探究协作", outKey: "时间线 → 实战段 25–55'" },
        { stationId: 9, label: "形成性评价", outKey: "3 个 学情校准点 → 学情触发规则" },
      ],
    },

    narrative: {
      what: "设计课堂导入、概念支架、案例分析、小组展示、反馈修正和总结迁移的时间结构，并在时间线上放 ≥ 3 个 学情校准点。",
      why:  "光定讲授/分析/协作比例还不够——课堂上必须预留具体时刻供教师停下来判断'学生跟上没有'。校准点位置由教师定，学情触发规则在课中调控环节编辑。",
      how:  "查看 45 分钟时间轴，调整讲授/分析/协作/反馈比例，并在轴上标记 ≥ 3 个 学情校准点（覆盖早期诊断 / 实战段中点 / 收束封闭三阶段）。",
    },

    evidenceFigure: {
      title: "45 分钟课堂时间轴（含 3 个 学情校准点）",
      subtitle: "看 45 分钟如何分配",
      evidenceNote: "时间线决定学生有没有机会完成高阶判断；锚点必须分布在前、中、后三段，避免末端集中。",

      // 4 段比例（讲授/分析/协作/反馈）— 45 min 标准
      bars: [
        ["讲授", 27, { status: "ok",   source: "压缩到 27%（约 12 min）" }],
        ["分析", 31, { status: "ok",   source: "案例精读 + 法条分析（约 14 min）" }],
        ["协作", 29, { status: "ok",   source: "13 min 微 SWOT 实战" }],
        ["反馈", 13, { status: "warn", source: "学情触发反馈预算偏紧（约 6 min）" }],
      ],

      // 45 分钟轴上的关键节点（每 1 min 一格，9 个关键点）
      timeline: [
        { t: 0,   type: "phase",  label: "故事锚 · 泽布替尼悬念切入" },
        { t: 5,   type: "phase",  label: "法条锚 · 精读第 30 条" },
        { t: 10,  type: "anchor", anchorId: "Z1", label: "Z1 · 条文理解测温（早期诊断）" },
        { t: 12,  type: "phase",  label: "推演锚 · 微实战段开始" },
        { t: 25,  type: "phase",  label: "微实战段结束" },
        { t: 28,  type: "anchor", anchorId: "Z2", label: "Z2 · 推演后即时投票（实战段中点）" },
        { t: 30,  type: "phase",  label: "比较锚 · 中美欧对照" },
        { t: 38,  type: "phase",  label: "小结启动" },
        { t: 42,  type: "anchor", anchorId: "Z3", label: "Z3 · 知识封闭测温（收束封闭）" },
        { t: 45,  type: "phase",  label: "下课 + 沉淀任务" },
      ],

      // 3 个 学情校准点（写入 Store.setZpdAnchors）
      zpdAnchors: [
        { id: "Z1", t: 10, label: "条文理解测温",   format: "雨课堂 5 题单选" },
        { id: "Z2", t: 28, label: "推演后即时投票", format: "推演裁决投票 + 理由词云" },
        { id: "Z3", t: 42, label: "知识封闭测温",   format: "MAH/MA/生产证关系判断" },
      ],

      flow: ["压讲授", "扩分析", "钉锚点"],
    },

    decision: {
      question: "45 分钟课堂最需要修正的结构问题是什么？",
      options: [
        {
          key: "student",
          label: "压缩讲授，增加证据分析和反馈修正时间",
          rationale: "更符合高阶参与和形成性评价要求。",
          score: 3.8,
          meta: { recommended: true },
        },
        {
          key: "anchors-only",
          label: "保留讲授比例，但加密 学情校准点（≥ 3 个）",
          rationale: "锚点能改善学情可见度，但不能弥补时间结构本身的失衡。",
          score: 2.9,
        },
        {
          key: "lecture",
          label: "延长教师讲授，保证内容覆盖",
          rationale: "内容覆盖不等于学习发生。",
          score: 1.8,
          meta: { lintTriggers: ["forbidden-lecture-heavy"] },
        },
        {
          key: "free",
          label: "扩大自由讨论，弱化量规约束",
          rationale: "讨论会热闹，但证据质量难保证。",
          score: 2.0,
        },
      ],
      validation: { mustSelect: true, afterSelectShow: ["rationale", "riskBadges"] },
    },

    feedbackByKey: {
      "student": {
        summary: "✓ 符合 ICAP + 形成性评价",
        riskBadges: ["高阶参与", "学情校准点定义"],
        detail: "选择此项后，3 个 学情校准点会落入课中调控环节 等待学情触发规则编辑。下游课中调控环节 不允许在锚点决策规则为空时通过。",
      },
      "anchors-only": { summary: "△ 治标不治本", riskBadges: ["建议先压讲授"], detail: "锚点能采集学情触发数据，但若讲授占比仍 ≥ 45%，学生根本没机会暴露 ZPD。" },
      "lecture": {     summary: "✕ ICAP 塌缩",   riskBadges: ["认知参与塌缩"],   detail: "讲授为主退回 Passive 层，违反 contract「不得退化为概念讲授」的精神。" },
      "free": {        summary: "✕ 证据塌缩",   riskBadges: ["证据质量塌缩"],   detail: "失去量规约束，无法支撑后续评价证据收集。" },
    },

    artifacts: [
      {
        id: "timeline-with-anchors",
        buttonLabel: "⬇ 生成 45 分钟课堂时间表 + 3 个 学情校准点",
        outputTitle: "45 分钟课堂流程表",
        outputCue: "把时间从教师讲授转向学生证据分析，并钉上 3 个 学情校准点（前/中/后均匀分布）。",
        artifactLines: {
          evidence: "原始安排讲授占比偏高，案例分析和反馈修正时间不足。",
          action: "讲授 27% / 分析 31% / 协作 29% / 反馈 13%，并在 10'/28'/42' 设 3 个 学情校准点。",
          constraints: [
            "讲授只保留必要支架",
            "核心时间给学生产出",
            "每个活动必须留下评价证据",
            "≥ 3 个 学情校准点必须落在不同教学阶段（前 1/3 / 中 1/3 / 后 1/3）",
          ],
        },
        sideEffect: "writeZpdAnchors",
        writeback: { to: "artifactLibrary" },
      },
    ],

    stateMachine: {
      A: { id: "locked",       desc: "未进入" },
      B: { id: "entered",      desc: "已进入未判断" },
      C: { id: "selected",     desc: "已选未保存" },
      D: { id: "saved",        desc: "已保存判断" },
      E: { id: "artifactDone", desc: "已生成时间表 · 3 个 学情校准点已写入 Store" },
    },

    lintRules: [
      { id: "forbidden-lecture-heavy", when: "decision.userChoice === 'lecture'", severity: "medium", onTriggerUI: "选项 lecture 显示「ICAP 塌缩」徽章" },
      { id: "zpd-count-insufficient",   when: "zpdAnchors.length < 3",            severity: "block",  onTriggerUI: "阻止保存 · 不得少于 3 个锚点" },
    ],

    horizontalLayerHooks: {
      L1: { visible: true, role: "definition", anchorCount: 3 },
      L2: { visible: false, reason: "L2 在目标与量规环节/6/8/11 回响，任务链环节 不直接处理议程" },
      L3: { visible: true, sticky: true, minimizedHeight: 32 },
    },

    persistence: {
      userJudgments: { path: "userJudgments[7]" },
      artifactLibrary: { path: "artifactLibrary" },
      zpdAnchors: { path: "zpdAnchors", readers: [9, 11] },
      qualityCheckpoints: {
        backendMappingTo20Steps: ["问题导入", "概念支架", "案例探究", "展示总结", "时间结构", "学情校准点"],
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
