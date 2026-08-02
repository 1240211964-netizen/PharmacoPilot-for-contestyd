/*
 * PharmacoPilot · Station 02 Payload · 学情分析与经验起点
 * ------------------------------------------------------------
 * v4 教学环节归属：S1 学习者画像与课程情境诊断（与子节点 01/03 共享 S1）
 * 核心：认知前测 + 经验入口（家人慢病 / 社区药店 / 见习）
 *
 * 注册到 window.PharmacoPilotStationPayloads[2]
 * ============================================================ */
(function attachStation2Payload(global) {
  "use strict";

  const STATION_ID = 2;

  const payload = {
    id: STATION_ID,
    version: "stages-v4",
    parentStageId: "S1",
    subNodeKey: "2",
    exampleCase: { topic: "SWOT", subject: "华海药业", scenario: "集采常态化" },

    chainTopcard: {
      layerId: "L3",
      sticky: true,
      minimizedHeight: 32,
      inputsFrom: [
        { stationId: 1, label: "课程定位", key: "定位类型",
          snippet: "综合决策型 · SWOT 是工具不是目的" },
      ],
      outputsTo: [
        { stationId: 3, label: "议程协商", outKey: "学情低分项 → 议程关切" },
        { stationId: 4, label: "学习目标", outKey: "学情前测 → 目标补强" },
      ],
    },

    narrative: {
      what: "显性区分两类入口：认知前测（先备知识、误区、参与度）+ 经验入口（学生与药事现场的真实接触经历）。",
      why:  "新教师常常只看学生「知道什么」，忽略他们「见过什么」。学生进入药事管理课时的家人慢病 / 社区药店实习 / 院内见习经历是学习的真实起点。",
      how:  "查看认知前测分布图 + 经验入口图，识别认知和经验两类断层，生成学情分析、导学任务、诊断题、经验入口任务。",
    },

    evidenceFigure: {
      title: "认知前测 4 题 + 经验入口分布",
      subtitle: "看本班最可能卡在哪里",
      evidenceNote: "学情入口决定 SWOT 课能否在 30 分钟实战段真正起飞。",

      // 4 题前测（与 figureStation02 默认值兼容）
      preTest: [
        { q: "Q1 · SWOT 中 W 指什么", correctPct: 65, status: "ok",   commonMisconception: null },
        { q: "Q2 · S 与 W 的判定边界", correctPct: 32, status: "warn", commonMisconception: "误把外部威胁当成内部劣势" },
        { q: "Q3 · O / T 来自内 / 外部",correctPct: 41, status: "warn", commonMisconception: "认为政策一定是 O 而非 T" },
        { q: "Q4 · 根据分析对象区分 W 与 T", correctPct: 19, status: "miss", commonMisconception: "38% 的学生将外部威胁误判为内部劣势" },
      ],

      // 经验入口（药事管理学科特有）
      cohortExperience: [
        { type: "家人慢病服药",     pct: 60, evidenceSrc: "高血压 / 糖尿病 / 慢病" },
        { type: "社区药店打工 / 实习", pct: 23, evidenceSrc: "校内或寒暑假经历" },
        { type: "院内药剂科见习",   pct: 18, evidenceSrc: "课程见习 / 医院实践" },
        { type: "无任何药事接触",   pct: 12, evidenceSrc: "需补充情境锚" },
      ],

      // 当前任务中的暂时性分组：只描述本次响应与掌握表现，不推断稳定主动性或人格。
      participationQuadrants: [
        { label: "高响应 + 掌握较好",  pct: 22, color: "#3a8a4e" },
        { label: "高响应 + 基础待巩固", pct: 28, color: "#b8860b" },
        { label: "低响应 + 掌握较好",  pct: 18, color: "#5a7090" },
        { label: "低响应 + 基础待巩固", pct: 32, color: "#a8492a" },
      ],

      // 兼容 figureStation02 的 bars 写法（条形图渲染）
      bars: [
        ["Q1 · W 含义",          65, { status: "ok"   }],
        ["Q2 · S/W 边界",        32, { status: "warn" }],
        ["Q3 · 内外来源",        41, { status: "warn" }],
        ["Q4 · W/T 分类边界",    19, { status: "miss" }],
      ],

      flow: ["看分布", "找断层", "定支架"],
    },

    decision: {
      question: "本班进入案例探究前最需要处理的入口问题是什么？",
      options: [
        {
          key: "evidence",
          label: "学生会填表但证据链表达不足",
          rationale: "最容易被忽略的高风险问题。Q4 仅 19% 正确率，说明学生尚未稳定依据分析对象和证据来源完成 W/T 分类。建议前置证据引用训练。",
          score: 3.7,
          meta: { recommended: true, lintTriggers: ["pre-test-low"] },
        },
        {
          key: "boundary",
          label: "内部条件与外部环境边界混淆",
          rationale: "Q3 仅 41% 正确率。需要通过正反例和判断流程卡澄清。建议提供「政策 = T 而非 O」反例。",
          score: 3.3,
        },
        {
          key: "experience",
          label: "缺药事接触经验的 12% 学生进不去情境",
          rationale: "经验入口缺口。建议为这部分学生准备「家人慢病情境锚」前置任务。",
          score: 3.5,
          meta: { v3New: true },
        },
        {
          key: "participation",
          label: "低响应且基础待巩固学生缺少任务入口",
          rationale: "当前任务中 32% 的学生呈现低响应且基础待巩固，需要低门槛入口和小组角色支持；该分组不外推到其他课时。",
          score: 3.0,
        },
      ],
      validation: { mustSelect: true, afterSelectShow: ["rationale", "riskBadges"] },
    },

    feedbackByKey: {
      "evidence":      { summary: "✓ 命中最高风险维度",     riskBadges: ["前置训练", "高优先级"], detail: "选择此项后，建议在教学内容结构化与前概念诊断环节 问题链第 3 题前加入「为本条 SWOT 配 1 条证据出处」即时训练。" },
      "boundary":      { summary: "△ 第二优先级",          riskBadges: ["概念边界"],            detail: "建议真实性学习情境与资源设计环节 案例材料显式标注「政策 / 数据 / 角色 / 风险边界」5 类标签。" },
      "experience":    { summary: "✓ 经验入口缺口",     riskBadges: ["经验入口"],            detail: "为 12% 无药事接触学生提供「家人慢病情境锚」前置任务（约 15 分钟阅读）。" },
      "participation": { summary: "△ 协作设计层面",        riskBadges: ["延后到学习活动与教学支架设计环节"],          detail: "参与度问题属于协作设计范畴，建议在学习活动与教学支架设计环节 协作任务里通过 4 角色分工解决。" },
    },

    artifacts: [
      {
        id: "learner-profile",
        buttonLabel: "⬇ 生成学情分析段落（认知 + 经验双入口）",
        outputTitle: "学情分析 v1 · 双入口诊断",
        outputCue: "把前测数据 + 经验分布合并为一段可挂教案首页的学情诊断。",
        artifactLines: {
          evidence: "Q4 正确率 19% · 38% 的学生将外部威胁误判为内部劣势；12% 学生无任何药事接触经验。",
          action: "前置「证据出处训练」+ 为 12% 无经验学生准备「家人慢病情境锚」阅读。",
          constraints: [
            "学情诊断须同时含认知前测与经验入口",
            "高频误区须显式标注（Q4 38%）",
            "经验入口须落到具体药事场景（家人慢病 / 药店 / 见习）",
          ],
        },
        writeback: { to: "artifactLibrary" },
      },
      {
        id: "experience-onramp",
        buttonLabel: "⬇ 生成经验入口导学任务（针对 12% 无接触学生）",
        outputTitle: "经验入口导学任务 v1",
        outputCue: "为零经验学生提供 15 分钟情境锚阅读。",
        artifactLines: {
          evidence: "12% 学生无家人慢病 / 无社区药店 / 无见习经历，进入 SWOT 案例时缺情境感。",
          action: "选 2-3 段「老人慢病用药日常」「社区药店服务场景」短文（≤ 1500 字）作课前阅读。",
          constraints: [
            "≤ 1500 字 / 15 分钟阅读",
            "必须有具体场景（不能纯概念）",
            "结尾要含 1 个引导问题（衔接学习者议程 议程协商）",
          ],
        },
        writeback: { to: "artifactLibrary" },
      },
    ],

    stateMachine: {
      A: { id: "locked",       desc: "未进入 · 课程定位 定位判断未保存" },
      B: { id: "entered",      desc: "已进入未判断" },
      C: { id: "selected",     desc: "已选未保存" },
      D: { id: "saved",        desc: "已保存判断 · 数据流入学习者议程 / 4" },
      E: { id: "artifactDone", desc: "已生成学情双入口诊断" },
    },

    lintRules: [
      { id: "pre-test-low", when: "preTest.find(q => q.correctPct < 30) exists", severity: "high",  onTriggerUI: "在选项 evidence 上加「高风险」徽章" },
    ],

    horizontalLayerHooks: {
      L1: { visible: false, reason: "L1 锚点在 S5/S6/S8" },
      L2: { visible: false, reason: "议程源头在子节点 03（议程协商）" },
      L3: { visible: true, sticky: true, minimizedHeight: 32 },
    },

    persistence: {
      userJudgments: { path: "userJudgments[2]" },
      artifactLibrary: { path: "artifactLibrary" },
      qualityCheckpoints: {
        backendMappingTo20Steps: ["学情分析", "先备知识", "常见误区", "经验入口", "预习任务", "诊断题"],
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
