/*
 * PharmacoPilot · Station 04 Payload · 目标证据舱
 * ------------------------------------------------------------
 * 教学环节 S2 目标与评价标准 · L3 顶卡上游汇聚点（汇聚前序环节输入）。
 * 同时回应课程定位 定位 + 学情分析 学情 + 学习者议程 议程，把目标改写为
 * 可观察、可评价、可由学生产出证明的学习成果。
 *
 * 注册到 window.PharmacoPilotStationPayloads[4]
 * ============================================================ */
(function attachStation4Payload(global) {
  "use strict";

  const STATION_ID = 4;

  const payload = {
    id: STATION_ID,
    version: "phase11-v3",
    parentStageId: "S2",
    subNodeKey: "4",
    exampleCase: { topic: "SWOT", subject: "华海药业", scenario: "集采常态化" },

    chainTopcard: {
      layerId: "L3",
      sticky: true,
      minimizedHeight: 32,
      inputsFrom: [
        { stationId: 1, label: "课程定位", key: "定位类型 + 螺旋上下文",
          snippet: "综合决策型 · SWOT 是工具不是目的" },
        { stationId: 2, label: "学情分析", key: "认知前测 + 经验入口",
          snippet: "一致性评价前测 41% · 23% 有社区药店实习" },
        { stationId: 3, label: "议程协商", key: "5 条议程 · 最高票伦理",
          snippet: "ethics-pricing 11 票 / innovation-press 7 票 · 含 4 类张力" },
      ],
      outputsTo: [
        { stationId: 5,  label: "问题链", outKey: "目标 → 问题链组织" },
        { stationId: 9,  label: "形成性评价",   outKey: "目标 → 锚点测温内容" },
        { stationId: 10, label: "表现性评价与学习成效诊断", outKey: "目标 → 5 维评价标准" },
      ],
    },

    narrative: {
      what: "把教学目标改写为可观察、可评价、可由学生产出证明的学习成果；同时回应来自课程定位/2/3 的三类输入。",
      why:  "顶卡显示来自前序三个环节的关键片段，强制目标改写时同时回应定位、学情低分项、学生议程主张。本节点与表现性评价与学习成效诊断环节 的目标—评价对齐必须显性化（含评价标准反向修订通道）。",
      how:  "查看「目标—活动—产出—评价证据」矩阵 + Bloom 层级分布图 + 证据覆盖热图，识别目标缺口和证据缺口，生成学习目标与评价证据表。",
    },

    evidenceFigure: {
      title: "目标—活动—产出—评价 对齐矩阵",
      subtitle: "看每条目标是否有对应的评价证据",
      evidenceNote: "目标不能停在「理解」，必须能被学生产出证明。",

      // 4 维对齐打分（满分 100）
      bars: [
        ["可观察行为",        58, { status: "warn", source: "「理解 SWOT」类目标占 50%" }],
        ["评价证据完整度",    62, { status: "warn", source: "缺 TOWS 可操作性证据" }],
        ["Bloom 层级覆盖",   72, { status: "ok",   source: "理解 → 应用 → 分析 → 评价 4 层" }],
        ["对前序环节回应度", 44, { status: "miss", source: "议程未在目标中显式映射" }],
      ],

      // Bloom 6 层分布
      bloomDistribution: [
        { level: "记忆",   percent: 8  },
        { level: "理解",   percent: 22 },
        { level: "应用",   percent: 28 },
        { level: "分析",   percent: 22 },
        { level: "评价",   percent: 14 },
        { level: "创造",   percent: 6  },
      ],

      // 目标—评价证据 5 条对齐（推荐模板）
      // v4.3 · 每条目标显式声明量具身份。此前只写「≥ 80%」而不指明这是个人层面的
      // 分类小测、还是小组作品的评分维度,导致 S7 的小组作品得分 78 与 S2 的个人测验
      // 阈值 80% 被混写成同一个「78」。三要素缺一不可:
      //   metricId          —— 唯一量具标识,跨环节引用时不得换名
      //   aggregationLevel  —— individual / group / class,决定能否与阈值直接比较
      //   threshold         —— 达标线,由 S6/S7 各自判定 met / not_met
      goalEvidenceMap: [
        {
          goal: "能区分 SWOT 四象限并识别条目所属象限",
          evidence: "5 道分类题正确率 ≥ 80%",
          // 同一目标由两个量具分别取证,不可互相替代、更不可混写为同一个分数
          metrics: [
            { metricId: "s6_classification_quiz_accuracy", label: "证据A｜形成性评价 · 个人分类题正确率",
              aggregationLevel: "individual", threshold: ">= 80%", collectedAt: "S6" },
            { metricId: "s7_artifact_classification_score", label: "证据B｜表现性评价 · 小组作品内外分类准确性",
              aggregationLevel: "group", threshold: ">= 80", collectedAt: "S7" },
          ],
        },
        {
          goal: "能为每条 SWOT 配证据（量化 / 文件 / 政策）",
          evidence: "小组 SWOT 产出每条配出处 · 第 1 个评价维度",
          metrics: [
            { metricId: "s7_artifact_evidence_citation", label: "表现性评价 · 条目证据性",
              aggregationLevel: "group", threshold: ">= 60", collectedAt: "S7" },
          ],
        },
        {
          goal: "能从 SWOT 推导 ≥ 3 条 TOWS 战略",
          evidence: "学生在 14 分钟分析与 13 分钟协作阶段完成包含不少于 3 条策略的 TOWS 表 · 第 4 个评价维度",
          metrics: [
            { metricId: "s7_artifact_tows_actionability", label: "表现性评价 · TOWS 可操作性",
              aggregationLevel: "group", threshold: ">= 60", collectedAt: "S7" },
          ],
        },
        {
          goal: "能在质询环节为本组论据辩护",
          evidence: "交叉质询中每组至少应对 2 轮 · 录像评分 · 第 3 个评价维度",
          metrics: [
            { metricId: "s7_artifact_defense_quality", label: "表现性评价 · 质询与辩护质量",
              aggregationLevel: "group", threshold: ">= 60", collectedAt: "S7" },
          ],
        },
        {
          goal: "能指出 SWOT 工具的至少 2 个局限",
          evidence: "课末口述 · 第 5 个评价维度「批判意识」",
          metrics: [
            { metricId: "s7_artifact_critical_reflection", label: "表现性评价 · 批判意识",
              aggregationLevel: "group", threshold: ">= 60", collectedAt: "S7" },
          ],
        },
      ],

      flow: ["看缺口", "改目标", "配证据"],
    },

    decision: {
      question: "当前目标设计最应补强哪一项？",
      options: [
        {
          key: "agenda-mapping",
          label: "把学习者议程 议程显式映射到学习目标",
          rationale: "命中 议程贯通的第 2 个回响点。议程对预期学习结果与评价证据设计环节 的回应度仅 44%，是 4 维中最差。",
          score: 3.9,
          meta: { recommended: true, lintTriggers: ["L2-agenda-not-mapped"], v3New: true },
        },
        {
          key: "evidence",
          label: "为每个目标配置评价证据",
          rationale: "Backward Design 主链。建议补完 TOWS 的可操作性证据。",
          score: 3.7,
        },
        {
          key: "verb",
          label: "把「理解」改写为可观察行为",
          rationale: "可观察行为打分仅 58%，「理解 SWOT」类目标占一半，需要重写为行为动词。",
          score: 3.4,
        },
        {
          key: "more",
          label: "增加更多目标以显得完整",
          rationale: "目标过多会稀释课堂主线，违反 contract「不得堆叠目标」。",
          score: 1.7,
          meta: { lintTriggers: ["forbidden-goal-bloat"] },
        },
      ],
      validation: { mustSelect: true, afterSelectShow: ["rationale", "riskBadges"] },
    },

    feedbackByKey: {
      "agenda-mapping": { summary: "✓ 议程贯通的第 2 回响点",       riskBadges: ["议程回响", "高优先级"], detail: "选择此项后，5 条议程会在目标表中显式标注（如 ethics-pricing → 「能评价集采降价的合理性边界」）。" },
      "evidence":       { summary: "✓ Backward Design 主链",       riskBadges: ["目标—证据对齐"],     detail: "本选项是 Backward Design 的标准动作，但当前更紧迫的是议程映射。" },
      "verb":           { summary: "△ 方向正确但次要",            riskBadges: ["建议第二步做"],       detail: "动词化是基础修整，建议先补议程映射，本节末顺手把动词替换掉。" },
      "more":           { summary: "✕ 目标稀释",                  riskBadges: ["禁条触发"],          detail: "目标过多会让课堂主线模糊，违反 contract 中目标聚焦原则。" },
    },

    artifacts: [
      {
        id: "goal-evidence-table",
        buttonLabel: "⬇ 生成学习目标—评价证据对齐表",
        outputTitle: "学习目标与评价证据 v1",
        outputCue: "把 5 条目标与 5 条评价证据一一对应，确保 Backward Design 闭环。",
        artifactLines: {
          evidence: "当前 5 条候选目标 · 评价证据完整度 62% · 议程回应度 44%。",
          action: "把 5 条目标改写为行为动词形式，并为每条配置评价证据 + 议程映射。",
          constraints: [
            "目标必须用「能 + 动词 + 对象」形式",
            "每条目标必须有可观察的评价证据",
            "至少 3 条目标显式回应学习者议程 议程",
            "Bloom 层级覆盖 ≥ 4 层",
          ],
        },
        writeback: { to: "artifactLibrary" },
      },
      {
        id: "agenda-goal-map",
        buttonLabel: "⬇ 生成议程—目标映射表（议程贯通 第 2 回响）",
        outputTitle: "议程—目标映射 v1",
        outputCue: "把学习者议程 的 5 条议程映射到本节的 5 条目标。",
        sideEffect: "mapAgendasToGoals",
        writeback: { to: "artifactLibrary" },
      },
    ],

    stateMachine: {
      A: { id: "locked",       desc: "未进入 · 课程定位 判断未保存" },
      B: { id: "entered",      desc: "已进入未判断" },
      C: { id: "selected",     desc: "已选未保存" },
      D: { id: "saved",        desc: "已保存判断 · 数据流入教学内容结构化与前概念诊断环节/9/10" },
      E: { id: "artifactDone", desc: "已生成目标—评价对齐表 · 教学环节 S2 完成" },
    },

    lintRules: [
      { id: "L2-agenda-not-mapped", when: "Store.getAgendaFulfillment(4) is empty AND Store.getAgendas().length > 0", severity: "high",   onTriggerUI: "选项 agenda-mapping 加「议程回响待补」pill" },
      { id: "forbidden-goal-bloat", when: "decision.userChoice === 'more'",                                            severity: "medium", onTriggerUI: "选项 more 显示「目标稀释」徽章" },
    ],

    horizontalLayerHooks: {
      L1: { visible: false, reason: "L1 锚点在 7/9" },
      L2: { visible: true, role: "echo-2nd", echoMode: "goal-mapping", writesTo: "Store.agendaFulfillment[4]" },
      L3: { visible: true, sticky: true, minimizedHeight: 32, role: "convergence" },
    },

    persistence: {
      userJudgments: { path: "userJudgments[4]" },
      artifactLibrary: { path: "artifactLibrary" },
      agendaFulfillment: { path: "station3.agendaFulfillment[4]", readers: [11] },
      qualityCheckpoints: {
        backendMappingTo20Steps: ["教学目标", "学习成果", "评价证据", "目标对齐"],
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
