/*
 * PharmacoPilot · Station 01 Payload · 课程定位与目标分析舱
 * ------------------------------------------------------------
 * 教学环节 S1 学习者画像与课程情境诊断 · 学习产出链的起点（无上游）。
 * 输出本节课的定位类型 + 前后节承接上下文，喂给目标与量规环节 目标 + 任务链环节 时间。
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

      // v4.2: 数据来源声明 — bars 为样例值；render 层会在用户保存 station2 前测后
      // 通过 Store.getJudgment(2) 读取 cohortExperience 数据，动态调整"学情起点适配"分值。
      // 详见 nav-render.js:figureStation01 的 dynamicScoreFromCohort() 钩子。
      dynamicScoring: {
        enabled: true,
        sourceStation: 2,
        sourceField: "cohortExperience",
        adjustsDim: "学情起点适配",
        rule: "if station2 saved AND cohortExperience exists: 学情起点适配 = baseScore + (家人慢病比例 - 0.5) * 10; 否则用 bars 默认值",
        notice: "未保存 station2 前测时，下列分值为通用样例；上传当班前测后将自动重算。",
      },
      // 4 种定位类型权重对比（用 bars）
      // breakdown 字段：每类定位在 5 维评分量规上的得分,让 Q2 反思有据可循
      // 5 维量规：课程主线对齐 / 高阶能力培养 / 避免工具化退化 / 学情起点适配 / 前后节承接
      bars: [
        ["综合决策型", 82, {
          status: "ok", source: "贯通病—证—管 4 类决策",
          breakdown: [
            { dim: "课程主线对齐",   score: 18, max: 20, note: "直接对应「循证决策能力」主线" },
            { dim: "高阶能力培养",   score: 20, max: 20, note: "强制学生做判断,而非记 SWOT 定义" },
            { dim: "避免工具化退化", score: 16, max: 20, note: "仍可能落入「教 SWOT 工具」陷阱" },
            { dim: "学情起点适配",   score: 14, max: 20, note: "Q4 仅 19% 正确,部分学生跟不上高阶" },
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
        previous: { label: "管理学原理 · 战略管理章", note: "SWOT 概念首次出现 · 偏定义" },
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
      "comprehensive": { summary: "✓ 与课程主线对齐",          riskBadges: ["定位起点", "高一致性"], detail: "本定位下，目标与量规环节 目标会被改写为「能用 SWOT 完成药事管理决策」，任务链环节 时间线 30 分钟实战段是合理预算。" },
      "research":      { summary: "△ 偏离判断属性",            riskBadges: ["定位偏移"],            detail: "证据型定位会让 30 分钟实战变成「查资料」，丧失高阶判断训练机会。" },
      "service":       { summary: "△ 分析对象不匹配",          riskBadges: ["对象错位"],            detail: "门店级 SWOT 与药企 SWOT 在权重维度上差异显著，建议换案例对象再选此项。" },
      "policy":        { summary: "△ 张力维度被放大",          riskBadges: ["政治化风险"],          detail: "若学生议程已经偏向政策（学习者议程 显示集采伦理为最高票），叠加此定位会让 SWOT 退化为政策辩论。" },
    },

    artifacts: [
      {
        id: "positioning-statement",
        buttonLabel: "⬇ 生成课程任务定位段落 + 课程位置说明",
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
