/*
 * PharmacoPilot · Station 01 Payload · 课程定位与目标分析舱
 * ------------------------------------------------------------
 * 教学环节 S1 学习者画像与课程情境诊断 · 学习产出链的起点（无上游）。
 * 输出本节课的定位类型 + 前后节承接上下文，喂给预期学习结果与评价证据设计环节 目标 + 学习活动与教学支架设计环节 时间。
 *
 * 注册到 window.PharmacoPilotStationPayloads[1]
 * ============================================================ */
(function attachStation1Payload(global) {
  "use strict";

  const STATION_ID = 1;

  const payload = {
    id: STATION_ID,
    version: "phase11-v3",
    parentStageId: "S1",
    subNodeKey: "1",
    exampleCase: { topic: "SWOT", subject: "华海药业", scenario: "集采常态化" },

    chainTopcard: {
      layerId: "L3",
      sticky: true,
      minimizedHeight: 32,
      inputsFrom: [],
      isOrigin: true,
      originNote: "学习产出链起点 · 本节点为整条链路的源头",
      outputsTo: [
        { stationId: 4, label: "学习目标", outKey: "定位类型 → 学习目标改写" },
        { stationId: 7, label: "教学过程", outKey: "定位类型 → 时间分配策略" },
      ],
    },

    narrative: {
      what: "明确本节课在课程体系、专业能力培养和学生任务产出中的位置，写清它与前一节、下一节的承接关系。",
      why:  "防止从「讲知识点」直接开始备课——先把这节课在整门课中的位置说清楚，避免讲完了与前后失联。",
      how:  "查看「药事 · 目标—药事 · 任务—药事 · 产出」定位图与「前一节—本节—下一节」上下文卡，选择定位类型，生成课程定位段落 + 课程位置说明。",
    },

    evidenceFigure: {
      title: "药事 · 目标—药事 · 任务—药事 · 产出 三角图 + 前后节承接上下文卡",
      subtitle: "看本节课在课程序列中处在哪个位置",
      evidenceNote: "定位决定 SWOT 是「方法训练」还是「决策训练」——同一案例可以走出完全不同的课。",

      // 三角图三个端点
      triangle: [
        { vertex: "药事 · 目标", label: "培养循证决策能力", weight: 0.40 },
        { vertex: "药事 · 任务", label: "企业战略 SWOT 分析",  weight: 0.32 },
        { vertex: "药事 · 产出", label: "带证据带 TOWS 的 SWOT 报告", weight: 0.28 },
      ],

      // v4.3 · 答辩版停用。此前声明 enabled:true 并承诺"上传当班前测后将自动重算",
      // 但其渲染层消费钩子从未实现,属于功能过度声明。且原模型即使
      // 接上线也不能产生有效决策:
      //   (1) 变量选错 —— 家人慢病经历反映药学服务共情,不能直接推导 SWOT 认知准备度;
      //       真正相关的是 Q4 的 W/T 分类正确率(19%);
      //   (2) 对 4 类候选定位同幅加减分,排序恒定不变,推荐结果永远是"综合决策型"。
      // 宁可明确尚未实现,也不保留一个形式上数据驱动、实质上永不改变结论的算法。
      dynamicScoring: {
        enabled: false,
        status: "not_implemented",
        disclaimer: "下列分值为示例性判断，不随班级数据自动计算。",
        plannedInputs: [
          "Q4 内外分类错误率（个人层面）",
          "课前任务响应率",
          "基础待巩固群体占比",
        ],
        plannedDesign: "各候选定位需配置不同权重，否则同幅调整不改变排序；实现前不得对外承诺自动重算。",
      },
      // 4 种定位类型权重对比（用 bars）
      // breakdown 字段：每类定位按 5 维评价标准得出的分数，让 Q2 反思有据可循
      // 5 维评价标准：课程主线对齐 / 高阶能力培养 / 避免工具化退化 / 学情起点适配 / 前后节承接
      bars: [
        ["综合决策型", 82, {
          status: "ok", source: "贯通病—证—管 4 类决策",
          breakdown: [
            { dim: "课程主线对齐",   score: 18, max: 20, note: "直接对应「循证决策能力」主线" },
            { dim: "高阶能力培养",   score: 20, max: 20, note: "强制学生做判断,而非记 SWOT 定义" },
            { dim: "避免工具化退化", score: 16, max: 20, note: "仍可能落入「教 SWOT 工具」陷阱" },
            { dim: "学情起点适配",   score: 14, max: 20, note: "Q4 仅 19% 正确，需先检验 W/T 分类边界误解" },
            { dim: "前后节承接",     score: 14, max: 20, note: "推到 PESTLE/Porter 自然" },
          ],
        }],
        ["证据研究型", 64, {
          status: "ok", source: "强调循证查询",
          breakdown: [
            { dim: "课程主线对齐",   score: 14, max: 20, note: "偏向「证据检索」,弱判断属性" },
            { dim: "高阶能力培养",   score: 14, max: 20, note: "检索/综述 < 判断" },
            { dim: "避免工具化退化", score: 12, max: 20, note: "容易变成「教查文献」" },
            { dim: "学情起点适配",   score: 14, max: 20, note: "课前可以补先备知识" },
            { dim: "前后节承接",     score: 10, max: 20, note: "偏离判断主线" },
          ],
        }],
        ["服务运营型", 48, {
          status: "warn", source: "贴近基层但偏离 SWOT 本质",
          breakdown: [
            { dim: "课程主线对齐",   score:  8, max: 20, note: "偏离循证决策主线" },
            { dim: "高阶能力培养",   score: 10, max: 20, note: "服务训练偏应用" },
            { dim: "避免工具化退化", score:  8, max: 20, note: "SWOT 用于门店,分析对象错位" },
            { dim: "学情起点适配",   score: 12, max: 20, note: "学生药店实习经验有限" },
            { dim: "前后节承接",     score: 10, max: 20, note: "与战略管理章弱关联" },
          ],
        }],
        ["政策治理型", 56, {
          status: "ok", source: "适合医保/监管班型",
          breakdown: [
            { dim: "课程主线对齐",   score: 10, max: 20, note: "偏向「政策分析」" },
            { dim: "高阶能力培养",   score: 14, max: 20, note: "政策判断含高阶元素" },
            { dim: "避免工具化退化", score: 10, max: 20, note: "容易变成政策辩论" },
            { dim: "学情起点适配",   score: 12, max: 20, note: "学生对政策细节不熟" },
            { dim: "前后节承接",     score: 10, max: 20, note: "政策 ↔ 战略弱关联" },
          ],
        }],
      ],

      // 前后节承接上下文卡（前一节—本节—下一节）
      spiral: {
        previous: { label: "管理学原理 · 管理环境与战略分析", note: "SWOT 概念首次出现 · 偏定义" },
        current:  { label: "药事管理 · SWOT 应用",     note: "本节 · 把 SWOT 应用到药企 · 加 TOWS" },
        next:     { label: "药事管理 · PESTLE/Porter", note: "下节 · 引入更结构化战略工具 · 暴露 SWOT 局限" },
      },

      flow: ["看三角", "选定位", "钉位置"],
    },

    decision: {
      question: "本节 SWOT 课最应该被定位为什么？",
      options: [
        {
          key: "comprehensive",
          label: "综合决策型定位 · 贯通病—证—管 4 类决策",
          rationale: "能让本节服务于课程主线（药事管理证据决策能力）。SWOT 仅是工具，主目标是循证决策训练。",
          score: 3.8,
          meta: { recommended: true },
        },
        {
          key: "research",
          label: "证据研究型定位 · 强调循证查询与综述",
          rationale: "强化文献检索与综述训练，但偏离了 SWOT 的判断属性。",
          score: 3.4,
        },
        {
          key: "service",
          label: "服务运营型定位 · 贴近基层药学服务实务",
          rationale: "贴近实务，但 SWOT 分析对象通常是企业不是门店，定位偏移。",
          score: 2.8,
        },
        {
          key: "policy",
          label: "政策治理型定位 · 适合医保/监管/合规导向",
          rationale: "适合医保/监管班型，与「集采常态化」情境契合，但会让 W/T 维分析过度政治化。",
          score: 3.2,
        },
      ],
      validation: { mustSelect: true, afterSelectShow: ["rationale", "riskBadges"] },
    },

    feedbackByKey: {
      "comprehensive": { summary: "✓ 与课程主线对齐",          riskBadges: ["定位起点", "高一致性"], detail: "本定位下，预期学习结果与评价证据设计环节 目标会被改写为「能用 SWOT 完成药事管理决策」，学习活动与教学支架设计环节 时间线 27 分钟结构化实战（14′ 分析 + 13′ 协作与质询）是合理预算。" },
      "research":      { summary: "△ 偏离判断属性",            riskBadges: ["定位偏移"],            detail: "证据型定位会让 27 分钟结构化实战变成「查资料」，丧失高阶判断训练机会。" },
      "service":       { summary: "△ 分析对象不匹配",          riskBadges: ["对象错位"],            detail: "门店级 SWOT 与药企 SWOT 在权重维度上差异显著，建议换案例对象再选此项。" },
      "policy":        { summary: "△ 张力维度被放大",          riskBadges: ["政治化风险"],          detail: "若学生议程已经偏向政策（学习者议程 显示集采伦理为最高票），叠加此定位会让 SWOT 退化为政策辩论。" },
    },

    // S1 的结构化事实源。适用课程、班级、课时与样本量由渲染层读取当前教学选择后补入；
    // 本对象只提供课例证据、诊断边界、行动模板与可追溯写回目标。
    decisionArtifactSeed: {
      id: "s1-learner-context-decision",
      nodeId: "S1",
      artifactType: "learner_context_decision",
      version: 1,
      status: "pending_teacher_review",
      scope: {
        course: null,
        className: null,
        lesson: null,
        task: "区分内部条件与外部环境，重点辨析内部劣势 W 与外部威胁 T",
        sampleSize: null,
        evidenceStage: "课前",
        demoData: true,
      },
      evidenceSummary: [
        {
          id: "evidence-q4",
          category: "common_misconception",
          title: "内部条件与外部环境的分类边界不清",
          finding: "Q4 正确率为 19%；38% 的学生将外部威胁误判为内部劣势。",
          source: "课前诊断题 Q4（演示数据）",
          timepoint: "课前",
          limitations: "只反映本次题目与当前课时，不能据此推断稳定能力。",
        },
        {
          id: "evidence-group",
          category: "group_difference",
          title: "部分学生需要更显性的基础支持",
          finding: "低响应＋基础待巩固学生占 32%，属于当前任务中的暂时性分组。",
          source: "前测作答与响应记录（演示数据）",
          timepoint: "课前",
          limitations: "响应表现来自一次课前任务，不能解释为长期学习主动性。",
        },
      ],
      aiSuggestion: {
        diagnosis: "学生已能识别部分 SWOT 基本术语，但尚未普遍建立‘先确定分析对象，再判断证据来源，最后判断正负影响’的分类规则。",
        suggestedAction: "增加 W/T 对比案例，为基础待巩固学生提供三步分类支架，并在课堂中设置两次即时检查。",
        confidenceLabel: "待教师确认",
        disclaimer: "这是基于当前演示证据形成的建议，不代表已经证明学生能力不足，也不代表教学调整已经有效。",
      },
      teacherDecision: {
        decision: null,
        judgment: "当前证据可支持‘SWOT 分类边界存在共性误解’的暂时性判断，但学生分组只适用于本课时，仍需在课堂活动中继续验证。",
        rationale: "题目作答分布与前测响应表现能够相互补充，但一次前测不足以判断学生的稳定学习特征。",
        scopeLimit: ["本班", "本课时", "当前 SWOT 分类任务"],
        unresolvedQuestion: "更换案例和分析对象后，学生能否继续正确区分内部条件与外部环境？",
        confirmedBy: null,
        confirmedAt: null,
      },
      teachingActions: {
        wholeClass: "增加 W 与 T 的对比案例，显性讲解‘分析对象—证据来源—正负影响’判断路径。",
        targetGroup: "为低响应＋基础待巩固学生提供三步分类卡和低门槛对比案例。",
        teacherActions: "在概念讲解后和案例迁移时各设置一次即时分类检查。",
      },
      hypothesis: {
        statement: "若在 S5 增加三步分类支架，并在 S6 设置即时反馈，学生的 W/T 区分准确率与当前重点群体的任务响应表现可能改善。",
        status: "pending_validation",
        disclaimer: "待验证假设，不代表已经产生教学效果。",
      },
      downstreamWrites: [
        { targetNode: "S3", targetName: "教学内容结构化与前概念诊断", action: "将内部条件与外部环境的分类边界列为重点前概念和常见误解。", status: "pending" },
        { targetNode: "S5", targetName: "学习活动与教学支架设计", action: "增加‘分析对象—证据来源—类别判断’三步分类卡、W/T 对比案例和分层任务。", status: "pending" },
        { targetNode: "S6", targetName: "形成性评价与适应性调控", action: "增加两次课堂即时分类检查，记录错误类型、修正情况和学生响应表现。", status: "pending" },
        { targetNode: "S7", targetName: "表现性评价与学习成效诊断", action: "比较支架使用前后的分类正确率、错误结构及案例迁移表现。", status: "pending" },
      ],
    },

    artifacts: [
      {
        id: "positioning-statement",
        buttonLabel: "生成课程任务定位段落 + 课程位置说明",
        outputTitle: "课程任务定位 v1",
        outputCue: "把本节课的定位类型 + 前后节承接上下文写成可挂在教案首页的一段话。",
        artifactLines: {
          evidence: "本节定位为综合决策型 · 药事 · 目标权重 0.40 · 药事 · 任务权重 0.32 · 药事 · 产出权重 0.28。",
          action: "把定位段落写入教案首页；并把「前一节—本节—下一节」前后节承接链记入备课文档。",
          constraints: [
            "定位类型必须落到 4 类之一",
            "必须显式回答「本节 SWOT 是工具还是目的」",
            "必须显式标注前一节与下一节",
          ],
        },
        writeback: { to: "artifactLibrary" },
      },
    ],

    stateMachine: {
      A: { id: "locked",       desc: "永不锁 · 本节点是起点" },
      B: { id: "entered",      desc: "已进入未判断" },
      C: { id: "selected",     desc: "已选未保存" },
      D: { id: "saved",        desc: "已保存判断 · 数据流入学习目标 + 任务链" },
      E: { id: "artifactDone", desc: "已生成定位段落 · 教学环节 S1 完成" },
    },

    lintRules: [
      { id: "stage-1-pending", when: "Store.getJudgment(1) === null", severity: "info", onTriggerUI: "首屏提示「建议从 S1 开始」" },
    ],

    horizontalLayerHooks: {
      L1: { visible: false, reason: "L1 在 7/8/9" },
      L2: { visible: false, reason: "议程源头在学习者议程" },
      L3: { visible: true, sticky: true, minimizedHeight: 32, role: "origin" },
    },

    persistence: {
      userJudgments: { path: "userJudgments[1]" },
      artifactLibrary: { path: "artifactLibrary" },
      qualityCheckpoints: {
        backendMappingTo20Steps: ["教学情境", "课程任务", "专业能力", "产出边界", "课程位置"],
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
