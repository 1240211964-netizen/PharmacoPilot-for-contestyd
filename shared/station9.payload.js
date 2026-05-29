/*
 * PharmacoPilot · Station 09 Payload · 动态学情触发台
 * ------------------------------------------------------------
 * L1 动态学情触发线的核心站：为任务链环节 定义的 3 个 学情校准点
 * 编写「如果 X 则 Y」反馈—调节规则。
 *
 * 硬约束：每个锚点必须有规则；否则本节点不允许通过。
 *
 * 注册到 window.PharmacoPilotStationPayloads[9]
 * ============================================================ */
(function attachStation9Payload(global) {
  "use strict";

  const STATION_ID = 9;

  const payload = {
    id: STATION_ID,
    version: "phase11-v3",
    parentStageId: "S6",
    subNodeKey: "9",
    exampleCase: { topic: "SWOT", subject: "华海药业", scenario: "集采常态化" },

    chainTopcard: {
      layerId: "L3",
      sticky: true,
      minimizedHeight: 32,
      inputsFrom: [
        { stationId: 7, label: "时间线", key: "3 个 学情校准点位置",
          snippet: "Z1 10' 条文测温 · Z2 28' 推演投票 · Z3 42' 知识封闭测温（45 min 课堂）" },
        { stationId: 8, label: "探究协作", key: "协作产出",
          snippet: "4 角色 × 5 议程映射 · SWOT + TOWS 实战段产出" },
      ],
      outputsTo: [
        { stationId: 11, label: "教学反思", outKey: "学情触发规则 + 触发记录 → 复盘报告" },
      ],
    },

    narrative: {
      what: "为任务链环节 时间线上的 3 个 学情校准点设计微评估格式（≤ 3 min），并为每个锚点写一条「如果 X 则 Y」的反馈—调节规则。",
      why:  "光设触发点不够——每个校准点必须有可执行的决策规则，教师才能在 1 分钟内判断「继续/暂停/重启」。",
      how:  "查看 3 个锚点位置 + 微评估格式，为每个锚点编辑一条「如果 X 则 Y」规则，生成学情触发规则表。",
    },

    evidenceFigure: {
      title: "3 个 学情校准点的学情触发规则设计板",
      subtitle: "看每个锚点的反馈—调节规则",
      evidenceNote: "锚点没有规则等于没有锚点；规则没有阈值等于没有规则。",

      // 3 个锚点 · 推荐规则模板（从 station7 读取位置，本节点补规则）
      bars: [
        ["Z1 · 条文测温", 0, { status: "miss", source: "尚未编辑规则" }],
        ["Z2 · 推演投票", 0, { status: "miss", source: "尚未编辑规则" }],
        ["Z3 · 知识测温", 0, { status: "miss", source: "尚未编辑规则" }],
      ],

      // 3 个锚点的推荐规则（生成产物时写入 Store.setPulseRule）— 45 min 课堂
      pulseRules: [
        {
          anchorId: "Z1",
          t: 10,
          microFormat: "雨课堂 5 题单选 · ≤ 3 min",
          ifCond: "条文正确率 < 70%",
          thenAct: "回炉精讲《药品管理法》第 30 条，并要求学生口头复述「持有人 vs 生产者」差异",
        },
        {
          anchorId: "Z2",
          t: 28,
          microFormat: "推演裁决投票 + 理由词云 · ≤ 3 min",
          ifCond: "争议票数差距 < 15%（即学生分歧显著）",
          thenAct: "延伸 3 分钟立场切换辩论，让支持方与反对方角色互换",
        },
        {
          anchorId: "Z3",
          t: 42,
          microFormat: "MAH/MA/生产证 3 选 1 判断 · ≤ 2 min",
          ifCond: "错误率 > 30%",
          thenAct: "次节课首 5 分钟回炉，并在期末考前再做 1 次同题测温",
        },
      ],

      flow: ["看锚点", "写规则", "定阈值"],
    },

    decision: {
      question: "3 个 学情校准点中，哪个的学情触发—反馈规则最关键？",
      options: [
        {
          key: "z1-concept",
          label: "Z1 条文理解（10'）· 防止学生带着误区进入推演",
          rationale: "推演若建立在错误条文理解上，12-25 分钟微实战段全部浪费。Z1 是最高 ROI 锚点。",
          score: 3.9,
          meta: { recommended: true },
        },
        {
          key: "z2-controversy",
          label: "Z2 推演分歧（28'）· 把分歧转化为学习机会",
          rationale: "分歧本身就是 ZPD 信号。但若 Z1 未保证理解，Z2 的分歧反而是误区扩散。",
          score: 3.2,
        },
        {
          key: "z3-closure",
          label: "Z3 知识封闭（42'）· 检测最终学习成果",
          rationale: "终结性测试价值有限——出问题时已无课内补救空间。",
          score: 2.4,
        },
        {
          key: "none",
          label: "不必每个都写规则，课堂临场判断即可",
          rationale: "违反 contract L1 硬约束：每个锚点必须有「如果 X 则 Y」规则。",
          score: 1.2,
          meta: { lintTriggers: ["L1-rule-missing"], blockSave: true },
        },
      ],
      validation: { mustSelect: true, afterSelectShow: ["rationale", "riskBadges"] },
    },

    feedbackByKey: {
      "z1-concept":      { summary: "✓ 最高 ROI 选择",        riskBadges: ["关键学情锚"],     detail: "Z1 是误区扩散的最后防线。建议规则阈值 70%。" },
      "z2-controversy":  { summary: "△ 价值高但顺序不佳",     riskBadges: ["建议先 Z1"],     detail: "推演分歧需要建立在条文理解之上才有教学价值。" },
      "z3-closure":      { summary: "△ 终结性价值有限",       riskBadges: ["反馈过晚"],     detail: "Z3 仅能为下一节课提供改进信号，对本节学习已无救治空间。" },
      "none":            { summary: "✕ 违反 学情触发硬约束",   riskBadges: ["禁条触发"],     detail: "每个学情校准点必须有「如果 X 则 Y」规则（来自 contract.HORIZONTAL_LAYERS.L1.hardConstraint），否则课中调控环节不允许通过。", blockSave: true },
    },

    artifacts: [
      {
        id: "pulse-rule-table",
        buttonLabel: "⬇ 生成 3 个 学情校准点的学情触发—反馈—调节规则表",
        outputTitle: "学情触发规则表 · 3 个 学情校准点",
        outputCue: "把每个锚点变成可执行的课堂决策规则。",
        artifactLines: {
          evidence: "目前 3 个锚点尚无规则（status: miss）；课堂将退化为「教师凭感觉调节」。",
          action: "为 Z1/Z2/Z3 分别写 microFormat + ifCond + thenAct，确保阈值可量化、动作可执行。",
          constraints: [
            "每条规则必须有可量化的 ifCond（如「正确率 < 70%」）",
            "thenAct 必须是教师当场可做的动作",
            "微评估时长 ≤ 3 min",
          ],
        },
        sideEffect: "writePulseRules",
        writeback: { to: "artifactLibrary" },
      },
      {
        id: "feedback-language-templates",
        buttonLabel: "⬇ 生成反馈语模板（针对 5 类典型误区）",
        outputTitle: "课堂反馈语模板",
        outputCue: "把学情触发后的教师话术沉淀为模板。",
        artifactLines: {
          evidence: "教师即时反馈常陷入「点评对错」而非「指明下一步」。",
          action: "为 5 类典型误区（条文混淆 / 责任错配 / 立场偏移 / 数据缺失 / 角色塌缩）各写 2 句反馈模板。",
          constraints: [
            "反馈必须指向证据而非观点",
            "反馈必须给出下一步动作",
            "避免「这个答案不对」类无信息反馈",
          ],
        },
        writeback: { to: "artifactLibrary" },
      },
    ],

    stateMachine: {
      A: { id: "locked",       desc: "未进入 · 任务链环节 未生成 学情校准点" },
      B: { id: "entered",      desc: "已进入未判断" },
      C: { id: "selected",     desc: "已选未保存" },
      D: { id: "saved",        desc: "已保存判断" },
      E: { id: "artifactDone", desc: "已生成学情触发规则表 · 学情触发闭环完成" },
    },

    lintRules: [
      {
        id: "L1-rule-missing",
        when: "Store.getAllPulseRules() does not cover all anchors",
        severity: "block",
        onTriggerUI: "选项 none 触发 blockSave + 红色禁条框",
      },
    ],

    horizontalLayerHooks: {
      L1: {
        visible: true,
        role: "rule-editor",
        readsFromStation: 7,
        writesTo: "Store.pulseRules",
        hardConstraint: "每个 学情校准点必须有「如果 X 则 Y」规则",
      },
      L2: { visible: false, reason: "L2 在 4/6/8/11，课中调控环节 不直接处理议程" },
      L3: { visible: true, sticky: true, minimizedHeight: 32 },
    },

    persistence: {
      userJudgments: { path: "userJudgments[9]" },
      artifactLibrary: { path: "artifactLibrary" },
      pulseRules: { path: "pulseRules", readers: [11] },
      qualityCheckpoints: {
        backendMappingTo20Steps: ["课堂检查点", "即时反馈", "学习预警", "教学调控", "ZPD 重新校准"],
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
