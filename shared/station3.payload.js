/*
 * PharmacoPilot · Station 03 Payload · 学习者议程协商台
 * ------------------------------------------------------------
 * 学习者议程贯通的源头。
 * 课前向学生发 3 题协商单 · 收集回应 · 聚类成 5 条议程 · 写入 Store。
 *
 * 注册到 window.PharmacoPilotStationPayloads[3]
 * ============================================================ */
(function attachStation3Payload(global) {
  "use strict";

  const STATION_ID = 3;

  const payload = {
    id: STATION_ID,
    version: "phase11-v3",
    parentStageId: "S1",
    subNodeKey: "3",
    exampleCase: { topic: "SWOT", subject: "华海药业", scenario: "集采常态化" },

    chainTopcard: {
      layerId: "L3",
      sticky: true,
      minimizedHeight: 32,
      inputsFrom: [
        { stationId: 2, label: "学情分析", key: "学情入口要点",
          snippet: "本班 60% 学生有家人慢病 / 23% 有社区药店实习 / 一致性评价概念前测正确率 41%" },
      ],
      outputsTo: [
        { stationId: 4, label: "学习目标",  outKey: "议程主张 → 目标改写" },
        { stationId: 6, label: "情境化案例",  outKey: "议程关切 → 案例证据" },
        { stationId: 8, label: "探究协作",  outKey: "议程意愿 → 角色分配" },
        { stationId: 11, label: "教学反思", outKey: "议程兑现度回顾" },
      ],
    },

    narrative: {
      what: "为学生在课前留一个可见的议程入口，让学生提出关切、质疑点、角色意愿，作为教师备课的真实输入。",
      why:  "把学生当作可协商的合作者，而不只是被训练判断的对象——课前留一个可见的议程入口，让他们的关切先于教学预设进入备课。",
      how:  "查看学生议程协商单（3 题）+ 学生响应聚类预览，识别议程与教师预设的张力，生成议程列表写入 Store。",
    },

    evidenceFigure: {
      title: "议程协商单 + 学生响应聚类预览",
      subtitle: "看学生最想搞清楚的是什么 · 与教师预设有何张力",
      evidenceNote: "议程不是意见调查，是可协商的学习起点。",

      // 议程协商单 3 题（课前发给学生）
      surveyQuestions: [
        { id: "q1", text: "学这节 SWOT 课，你最想搞清楚的 1 件事是什么？" },
        { id: "q2", text: "看完华海药业的初步资料，你最不舒服 / 最想质疑的点是什么？" },
        { id: "q3", text: "如果要做小组任务，你最想扮演哪个角色（资料员 / 判断员 / 质询员 / 汇报员）？为什么？" },
      ],

      // 班级 28 位学生响应（mock · 课前已采集）— 聚类成 5 条议程
      mockStudentResponses: {
        sampleCount: 28,
        clusters: [
          {
            agendaKey: "ethics-pricing",
            text: "集采降价合理性",
            studentVotes: 11,
            sampleQuote: "我妈高血压药降到几毛钱一片，药企真的不亏吗？长期会不会出质量问题？",
            tensionWithTeacher: "教师预设是讲 SWOT 方法，学生想讨论政策伦理",
          },
          {
            agendaKey: "innovation-press",
            text: "创新药企挤压",
            studentVotes: 7,
            sampleQuote: "百济神州一年研发 100 亿，华海能扛多久？",
            tensionWithTeacher: "教师预设 SWOT 是单家企业分析，学生想做行业对比",
          },
          {
            agendaKey: "valsartan-trust",
            text: "2018 事件信任修复",
            studentVotes: 4,
            sampleQuote: "缬沙坦杂质事件后他们怎么自证？",
            tensionWithTeacher: "教师预设 W 维只用财务数据，学生想看声誉数据",
          },
          {
            agendaKey: "api-export",
            text: "原料药出海前景",
            studentVotes: 3,
            sampleQuote: "FDA 不是禁过他们吗？现在还能卖到美国？",
            tensionWithTeacher: "教师预设 O 维只看国内政策",
          },
          {
            agendaKey: "cdmo-window",
            text: "CDMO 机遇判断",
            studentVotes: 3,
            sampleQuote: "他们能转型做代工吗？药明康德那种？",
            tensionWithTeacher: "教师预设主线是仿制药，学生想看转型路径",
          },
        ],
        // 角色意愿分布（来自 q3）
        roleIntent: [
          { role: "资料员", count: 6,  agendas: ["innovation-press"] },
          { role: "判断员", count: 11, agendas: ["ethics-pricing", "api-export"] },
          { role: "质询员", count: 5,  agendas: ["valsartan-trust"] },
          { role: "汇报员", count: 6,  agendas: ["cdmo-window"] },
        ],
      },

      flow: ["发协商单", "看聚类", "生成议程"],
    },

    decision: {
      question: "学生议程与教师预设的目标之间，最大的张力是什么？",
      options: [
        {
          key: "ethics",
          label: "学生关心政策伦理，教师定位是 SWOT 方法",
          rationale: "命中 11 票（39%）· 最高优先级议程。建议在案例与证据环节 案例材料中显式加入伦理证据。",
          score: 3.8,
          meta: { recommended: true, lintTriggers: ["agenda-not-yet-saved"] },
        },
        {
          key: "policy",
          label: "学生想做行业对比，教师定位是单家企业",
          rationale: "建议在目标与量规环节 目标改写时纳入「与同行对比」维度。",
          score: 3.5,
        },
        {
          key: "align",
          label: "学生议程与教师预设基本一致",
          rationale: "保留议程作为课堂导入素材，提高 ownership。",
          score: 3.0,
        },
        {
          key: "narrow",
          label: "学生议程过于分散，强行收敛到教师预设",
          rationale: "过早收敛会削弱主体性，违反 contract「不得让议程站退化为调查表」。",
          score: 1.5,
          meta: { lintTriggers: ["agenda-suppressed"] },
        },
      ],
      validation: { mustSelect: true, afterSelectShow: ["rationale", "riskBadges"] },
    },

    feedbackByKey: {
      "ethics": { summary: "✓ 高优先级张力识别",      riskBadges: ["议程源头", "高优先级"],  detail: "建议在案例与证据环节 案例材料显式加入伦理证据（如医保谈判降价幅度合理性数据），让议程在下游获得证据兑现。" },
      "policy": { summary: "✓ 中等优先级张力",        riskBadges: ["议程源头"],             detail: "建议在目标与量规环节 目标改写时纳入「与同行对比」维度。" },
      "align": {  summary: "△ 无明显张力",            riskBadges: ["建议警惕过滤"],         detail: "议程与预设完全一致需警惕——可能是学生没真说，或采集方式诱导。" },
      "narrow": { summary: "✕ 违反学生主体性约束",   riskBadges: ["禁条触发"],             detail: "强行收敛违反 contract.FORBIDDEN_CHANGES 中「不得让学生议程站退化为调查表」。" },
    },

    artifacts: [
      {
        id: "agenda-list",
        buttonLabel: "⬇ 生成议程列表（5 条 · 写入 议程贯通源头）",
        outputTitle: "学生议程协商单 v1",
        outputCue: "把 28 位学生的响应聚类成 5 条可被下游引用的议程。",
        artifactLines: {
          evidence: "28 位学生响应聚类成 5 类议程，最高 11 票为「集采降价合理性」；4 个角色意愿分布均衡。",
          action: "把 5 条议程写入 Store · 4 个回响站（4/6/8/11）将自动加载议程标签。",
          constraints: [
            "议程数 ≤ 5 条（避免分散）",
            "每条议程必须有 ≥ 1 名学生具体回应",
            "议程不得被教师重写（只能补充情境）",
          ],
        },
        sideEffect: "seedAgendasFromStation3",
        writeback: { to: "artifactLibrary" },
      },
      {
        id: "agenda-action-map",
        buttonLabel: "⬇ 生成议程—课堂动作映射表",
        outputTitle: "议程→课堂动作映射 v1",
        outputCue: "为每条议程标注对应的下游动作（目标与量规环节/6/8 各做什么）。",
        writeback: { to: "artifactLibrary" },
      },
    ],

    stateMachine: {
      A: { id: "locked",       desc: "未进入 · 学情分析 学情判断未保存" },
      B: { id: "entered",      desc: "已进入未判断" },
      C: { id: "selected",     desc: "已选未保存" },
      D: { id: "saved",        desc: "已保存判断" },
      E: { id: "artifactDone", desc: "已生成议程列表 · 议程源头就位" },
    },

    lintRules: [
      { id: "agenda-not-yet-saved", when: "Store.getAgendas().length === 0", severity: "high",   onTriggerUI: "推荐选项 ethics 加「议程源头未就位」徽章" },
      { id: "agenda-suppressed",    when: "decision.userChoice === 'narrow'", severity: "block", onTriggerUI: "blockSave + 红色禁条框" },
    ],

    horizontalLayerHooks: {
      L1: { visible: false, reason: "L1 在 7/8/9" },
      L2: {
        visible: true,
        role: "source",
        writesTo: "Store.agendas",
        echoedAt: [4, 6, 8, 11],
      },
      L3: { visible: true, sticky: true, minimizedHeight: 32 },
    },

    persistence: {
      userJudgments: { path: "userJudgments[3]" },
      artifactLibrary: { path: "artifactLibrary" },
      agendas: { path: "agendas", readers: [4, 6, 8, 11] },
      qualityCheckpoints: {
        backendMappingTo20Steps: ["学生议程", "议程张力", "角色意愿", "议程兑现承诺"],
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
