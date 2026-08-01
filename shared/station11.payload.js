/*
 * PharmacoPilot · Station 11 Payload · 复盘资产库
 * ------------------------------------------------------------
 * 议程贯通的第 4 回响点（闭环点）+ L1 学情触发摘要汇总。
 * 把学习者议程、情境资源兑现、活动角色匹配、形成性评价与适应性调控触发规则
 * 与表现性评价与学习成效诊断环节评分一并复盘，并把资产沉淀进教学资产库。
 *
 * 注册到 window.PharmacoPilotStationPayloads[11]
 * ============================================================ */
(function attachStation11Payload(global) {
  "use strict";

  const STATION_ID = 11;

  const payload = {
    id: STATION_ID,
    version: "phase11-v3",
    // S8 反思性实践与教学改进、S9 教学知识建构与专业共享沿用两个 legacy 子节点：11a + 11b
    isSplit: true,
    parentStageId: ["S8", "S9"],
    subNodeKey: ["11a", "11b"],
    splitMap: {
      "11a": { stageId: "S8", subTitle: "教师复盘与改进决策",   artifactIds: ["review-report"] },
      "11b": { stageId: "S9", subTitle: "资产沉淀与知识库更新", artifactIds: ["next-round-plan"] },
    },
    exampleCase: { topic: "SWOT", subject: "华海药业", scenario: "集采常态化" },

    chainTopcard: {
      layerId: "L3",
      sticky: true,
      minimizedHeight: 32,
      inputsFrom: [
        { stationId: 3,  label: "议程协商", key: "议程列表 + 兑现轨迹",
          snippet: "5 条议程 · 跨站兑现链：真实性学习情境与资源设计环节 → 学习活动与教学支架设计环节 → S8 反思性实践与教学改进" },
        { stationId: 9,  label: "形成性评价", key: "学情触发规则 + 触发记录",
          snippet: "3 个 ZPD 锚点规则 + 课堂触发摘要" },
        { stationId: 10, label: "表现性评价与学习成效诊断", key: "学生作品评分 + 低分维度",
          snippet: "5 维评价标准 · Pareto 低分维度" },
      ],
      outputsTo: [],
    },

    narrative: {
      what: "把学生作品、典型误区、低分维度、反馈语、案例材料和改进建议沉淀为下一轮教学资产；强制完成学生议程兑现度回顾。",
      why:  "复盘第 1 部分强制回顾学生议程的兑现度，关上 学习者议程贯通的闭环，避免议程被收集后束之高阁。",
      how:  "查看议程兑现度回顾表（来自学习者议程）+ 资产沉淀优先级图，选择最值得保存的资产，生成教学复盘报告。",
    },

    evidenceFigure: {
      title: "议程兑现度回顾表 + 资产沉淀优先级",
      subtitle: "看议程是否真闭环 · 看哪些值得保存",
      evidenceNote: "复盘不是写感想，而是保存下一轮可复用的证据和材料。",

      // 资产价值（保留原有 v2 结构）
      bars: [
        ["低分样例",   76, { status: "ok",   source: "学生 SWOT 错例 · 内外错位 6 例" }],
        ["反馈语",     68, { status: "ok",   source: "5 类误区反馈模板" }],
        ["修订案例",   82, { status: "ok",   source: "华海药业材料包 v2 · 补 W 维近期数据" }],
        ["课堂气氛",   28, { status: "miss", source: "不值得沉淀 · 不可复用" }],
      ],

      // 议程兑现追踪表（运行时从 Store.agendaFulfillment 渲染）
      // v4.2: 加"未兑现原因"列，从 Store.agendaUnfulfillmentNotes 读取（用户在 S8 figureStation11_S8 输入）
      agendaTraceColumns: ["议程文本", "真实性学习情境与资源设计环节 证据", "学习活动与教学支架设计环节 角色", "S8 反思性实践与教学改进回顾", "本轮兑现度", "未兑现原因（如有）"],
      agendaTraceFromStore: true,
      agendaUnfulfillmentInputEnabled: true,
      agendaUnfulfillmentNoteHint: "针对未兑现议程，记录原因（如「学生未在小组讨论中提及」、「证据材料不足」、「时间不够」），供下一轮迭代参考。",

      // L1 学情触发摘要（运行时从 Store.pulseRules 渲染）
      pulseTriggerSummaryColumns: ["锚点", "微评估格式", "如果 X", "则 Y"],
      pulseTriggerFromStore: true,

      flow: ["看议程链", "看学情触发链", "存资产"],
    },

    agendaEchoCard: {
      layerId: "L2",
      borderColor: "amber",
      source: "议程贯通闭环点 · 5 条议程的完整兑现轨迹",
      mode: "closure-review",
      hint: "本节点把议程从「学习者议程 提出」→「真实性学习情境与资源设计环节 证据」→「学习活动与教学支架设计环节 角色」→「S8 反思性实践与教学改进」整条链路总结。生成复盘报告时所有议程被标记为「已回顾」。",
      writeback: {
        toStation: 11,
        toKey: "agendaFulfillment[11]",
        closesL2Loop: true,
      },
    },

    decision: {
      question: "复盘时最值得沉淀的资产是什么？",
      options: [
        {
          key: "asset-with-agenda",
          label: "沉淀低分样例 + 反馈语 + 修订案例 + 议程闭环回顾",
          rationale: "命中 议程贯通闭环约束。同时保留评价标准改进、案例 v2、议程兑现度三类资产。",
          score: 3.9,
          meta: { recommended: true, lintTriggers: ["L2-closure-pending"], v3New: true },
        },
        {
          key: "asset",
          label: "沉淀低分样例、反馈语和修订后的案例材料",
          rationale: "能直接服务下一轮教学优化，但缺议程闭环回顾会让 议程贯通断尾。",
          score: 3.2,
        },
        {
          key: "plan",
          label: "只保存最终教案",
          rationale: "缺少学生证据和迭代依据。",
          score: 2.1,
        },
        {
          key: "mood",
          label: "只记录课堂气氛是否活跃",
          rationale: "不能形成可验证改进。",
          score: 1.6,
        },
      ],
      validation: { mustSelect: true, afterSelectShow: ["rationale", "riskBadges"] },
    },

    feedbackByKey: {
      "asset-with-agenda": {
        summary: "✓ 完成 议程贯通闭环",
        riskBadges: ["议程闭环", "高优先级"],
        detail: "选择此项后，生成复盘报告时 5 条议程会被标记为「已回顾」。整条议程贯通从学习者议程走到 S8 反思性实践与教学改进，真正闭合。",
        nextStationHint: "本节课已无下游。资产将进入教学资产库，供下一轮调用。",
      },
      "asset": {
        summary: "△ 资产沉淀完整但议程未闭环",
        riskBadges: ["议程断尾"],
        detail: "建议改选 A，让 5 条议程获得完整兑现轨迹。",
      },
      "plan": {
        summary: "✕ 资产价值最低",
        riskBadges: ["不可迭代"],
        detail: "最终教案缺少学生证据，无法支撑下一轮迭代。",
      },
      "mood": {
        summary: "✕ 不可验证",
        riskBadges: ["伪复盘"],
        detail: "课堂气氛是结果而非原因，不能形成可验证改进。",
      },
    },

    artifacts: [
      {
        id: "review-report",
        buttonLabel: "⬇ 生成教学复盘报告（含议程兑现度回顾）",
        outputTitle: "教学复盘报告 v1",
        outputCue: "把本次教学的议程链、学情触发链、评价链合成一份可迭代的复盘报告。",
        artifactLines: {
          evidence: "议程链：真实性学习情境与资源设计环节 兑现 5/5 · 学习活动与教学支架设计环节 角色匹配 5/5。学情触发链：3 个 ZPD 锚点规则齐备。评价链：低分维度集中在「条目证据性」与「TOWS 可操作性」。",
          action: "把以上三链汇总，生成《教学复盘报告 v1》，并把 5 条议程标记为「已回顾」。",
          constraints: [
            "复盘报告必须含议程兑现轨迹表",
            "必须含学情触发规则与触发摘要",
            "必须含下一轮改进的可执行清单",
          ],
        },
        // v4.2：五段式复盘模板，避免新教师面对空白脚手架（Schön 反思性实践 + Kolb 经验学习圈）
        templateSections: [
          {
            id: "context",
            title: "1. 课堂概况",
            placeholder: "本节课时长、班级、议程关键字、关键节点（如「微实战段超时 3 min」「Z2 触发 1 次」）。",
            requiredFields: ["classDuration", "agendaCount", "criticalMoments"],
          },
          {
            id: "agenda-fulfillment",
            title: "2. 议程兑现度",
            placeholder: "5 条议程的跨站兑现轨迹（S2 → S4 → S5 → S8 全链路）；未兑现议程及原因。",
            requiredFields: ["fulfilledCount", "unfulfilledList", "unfulfilledReasons"],
          },
          {
            id: "pulse-triggers",
            title: "3. 学情触发摘要",
            placeholder: "3 个 ZPD 锚点的实际触发情况：触发率、教师响应动作、后续调整。",
            requiredFields: ["z1Triggered", "z2Triggered", "z3Triggered", "teacherActions"],
          },
          {
            id: "low-dimensions",
            title: "4. 低分维度诊断",
            placeholder: "5 维评价标准中得分最低的 2-3 个维度；学生作品中最典型的错例；可能的根因。",
            requiredFields: ["lowDimList", "errorExamples", "rootCauseHypothesis"],
          },
          {
            id: "next-improvement",
            title: "5. 下一轮第一改进项",
            placeholder: "本次复盘最值得在下一轮优先改进的 1 项动作（具体到环节、时间、动作）。",
            requiredFields: ["targetStage", "targetActivity", "successCriterion"],
          },
        ],
        sideEffect: "closeL2Loop",
        writeback: { to: "artifactLibrary" },
      },
      {
        id: "next-round-plan",
        buttonLabel: "⬇ 生成下一轮改进计划（3 条优先项）",
        outputTitle: "下一轮改进优先级清单",
        outputCue: "把本轮低分维度转化为下一轮的设计动作。",
        artifactLines: {
          evidence: "本轮低分集中在：① 学生 SWOT 条目证据性 ② TOWS 策略可操作性 ③ Z2 推演分歧反馈过快。",
          action: "下一轮在学习活动与教学支架设计环节加 1 个「证据出处强制校验」锚点；真实性学习情境与资源设计环节案例 v2 补 2024 年后 W 维数据；形成性评价与适应性调控环节 Z2 阈值由 15% 调到 20%。",
          constraints: [
            "改进项必须落到具体节点",
            "每项必须有可观察的成功指标",
            "≤ 3 项 · 不超过下一轮可处理的认知预算",
          ],
        },
        // v4.2：法规版本记录（S9 教学知识建构与专业共享的法规日志手动维护入口，对应 STAGE_CHAIN.S9.topCardToKeys[2] 法规日志）
        regulationLog: {
          required: true,
          schema: [
            { field: "regulationName",     label: "法规名称", example: "《药品管理法》" },
            { field: "version",            label: "版本号 / 发布日期", example: "2019 年修订 / 2019-08-26" },
            { field: "citedClauses",       label: "本课引用条款", example: "第 30 条（持有人义务）/ 第 100 条（仿制药一致性评价）" },
            { field: "lastChecked",        label: "本次复盘核查日期", example: "2026-05-29" },
            { field: "updateNeeded",       label: "是否需要更新", example: "否 / 是（备注：新政策待并入）" },
            { field: "nextReviewDate",     label: "下一次复核计划", example: "2026-11-29（每 6 个月）" },
          ],
          note: "建议每次资产沉淀时核对本课所引法规是否仍为最新版本；若有更新，本课案例与证据包需同步修订。",
        },
        writeback: { to: "artifactLibrary" },
      },
    ],

    stateMachine: {
      A: { id: "locked",       desc: "未进入 · 表现性评价与学习成效诊断环节 未生成评分" },
      B: { id: "entered",      desc: "已进入未判断" },
      C: { id: "selected",     desc: "已选未保存" },
      D: { id: "saved",        desc: "已保存判断" },
      E: { id: "artifactDone", desc: "已生成复盘报告 · 议程贯通闭环完成 · 整节课归档" },
    },

    lintRules: [
      {
        id: "L2-closure-pending",
        when: "agendaFulfillment[11] is empty AND agendas.length > 0",
        severity: "high",
        onTriggerUI: "在选项 asset-with-agenda 上加「推荐 · 议程闭环」pill",
      },
    ],

    horizontalLayerHooks: {
      L1: { visible: true, role: "trace-summary", readsFromStore: "pulseRules" },
      L2: { visible: true, role: "closure-point", echoMode: "closure-review", readsFromStore: "agendaFulfillment" },
      L3: { visible: true, sticky: true, minimizedHeight: 32 },
    },

    persistence: {
      userJudgments: { path: "userJudgments[11]" },
      artifactLibrary: { path: "artifactLibrary" },
      agendaFulfillment: { path: "station3.agendaFulfillment[11]", closesL2Loop: true },
      qualityCheckpoints: {
        backendMappingTo20Steps: ["数据复盘", "教学反思", "资源沉淀", "下一轮改进", "议程兑现度回顾"],
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
