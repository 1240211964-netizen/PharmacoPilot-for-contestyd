/*
 * PharmacoPilot · Station 08 Payload · 案例探究室
 * ------------------------------------------------------------
 * 示例载荷：SWOT 分析 ·《管理学原理》示例知识点
 * 分析对象：华海药业 · 集采常态化情境
 * 4 角色协作：资料员 / 判断员 / 质询员 / 汇报员
 *
 * 议程贯通的第 3 个回响点：
 *   把学习者议程 议程映射到本节点的 4 个协作角色，避免随机分组让议程承诺落空。
 *
 * 注册到 window.PharmacoPilotStationPayloads[8]
 * ============================================================ */
(function attachStation8Payload(global) {
  "use strict";

  const STATION_ID = 8;

  const payload = {
    id: STATION_ID,
    version: "phase11-v3",
    parentStageId: "S5",
    subNodeKey: "8",
    exampleCase: { topic: "SWOT", subject: "华海药业", scenario: "集采常态化" },

    enterCondition: {
      requires: [
        { stationId: 6, key: "judgmentSaved" },
        { stationId: 7, key: "judgmentSaved" },
      ],
    },
    exitCondition: {
      requires: [
        { type: "judgmentSaved", stationId: STATION_ID },
        { type: "anyArtifactGenerated", count: 1 },
      ],
    },

    // ── ① 学习产出链顶卡 ─────────────────────────────────────
    chainTopcard: {
      layerId: "L3",
      sticky: true,
      minimizedHeight: 32,
      inputsFrom: [
        {
          stationId: 3, label: "议程协商", key: "学生议程协商单",
          snippet: "5 条核心关切（来自学习者议程）· 含角色意愿",
        },
        {
          stationId: 6, label: "情境化案例", key: "议程—证据对照表 / 材料清单",
          snippet: "华海药业 SWOT 材料包 15 份 · 议程兑现度数据",
        },
        {
          stationId: 7, label: "时间线", key: "课堂时间表 + ZPD 锚点",
          snippet: "25–55 分钟实战段 · 30 分钟做 SWOT + TOWS",
        },
      ],
      outputsTo: [
        { stationId: 9, label: "形成性评价", outKey: "探究产出 → 学情触发反馈规则" },
        { stationId: 10, label: "表现性评价与学习成效诊断", outKey: "学生作品 → 评价结果" },
      ],
      drawerFullContent: true,
    },

    // ── ② 环节说明卡 ────────────────────────────────────────
    narrative: {
      what: "设计学生如何围绕华海药业 SWOT 案例进行事实提取、证据判断、小组协作和成果展示；角色分配参考学习者议程 的学生意愿。",
      why:  "4 角色任务角色分配未与学生议程联动。把学习者议程 中学生表达的角色意愿成为分配参考——这是 议程贯通的第 3 个回响点。",
      how:  "查看小组任务泳道图 + 议程—角色匹配矩阵，判断每个小组角色是否有明确任务和产出，生成协作任务单和教师巡视提示。",
    },

    // ── ③ 证据图 ────────────────────────────────────────────
    evidenceFigure: {
      title: "小组协作泳道图 + 议程—角色匹配矩阵",
      subtitle: "看小组是否真的协作 · 角色分配是否回应议程",
      evidenceNote: "协作不是分组讨论，而是每个角色都有证据产出，且角色与学生意愿对应。",

      // 主图：4 角色任务密度（timeBudget：45 min 课中，26′→39′ 协作与质询阶段 13 min 的角色时间分配）
      bars: [
        ["资料员", 72, { source: "财报 + 集采数据提取",    status: "ok",   timeBudget: "实战 13 min · 资料员先行 3 min 提取关键数据" }],
        ["判断员", 66, { source: "SWOT 内外分类 + TOWS",    status: "ok",   timeBudget: "资料员后 5 min · 与质询员交叉判断" }],
        ["质询员", 48, { source: "证据强度追问",            status: "warn", warnText: "质询员任务最易塌缩", timeBudget: "全程 13 min · 实时追问，需脚本支撑" }],
        ["汇报员", 58, { source: "综合表达 + 战略输出",     status: "ok",   timeBudget: "末 3 min · 收束 SO/WT 战略矩阵" }],
      ],

      // 13 分钟协作与质询阶段的时间分配（与 station7 timeline 26'→39' 段对齐；
      // 该段是 27 分钟结构化实战的后半程，前半程是 12'→26' 的分析阶段）
      // v4.3 · 每个角色段显式声明它服务哪条学习目标(servesGoals 用 S2 的 metricId)。
      // 建设性对齐(Biggs)要求 目标 ↔ 活动 ↔ 评价 三者对齐;此前系统只接通了
      // 目标↔评价(station4.goalEvidenceMap ↔ station10.rubric,靠 metricId 一一对应),
      // 活动这条边只有顶卡上的一根连线、无数据映射,因而答不出「资料员在教哪条目标」。
      // 映射依据是各段既有的 desc,未新增教学设计。
      // 注:S2 目标 5「指出 SWOT 工具局限」→ s7_artifact_critical_reflection 不在本段,
      // 它由反馈段 39′–42′ 的「工具批判圆桌」承担(见 station5 的 no-self-critique 干预)。
      roleTimeBudget: {
        totalRoleMin: 13,
        sequence: [
          { t: 0,  end: 3,  primaryRole: "资料员", desc: "提取年报研发投入 / 集采降幅 / 出口数据 3 条核心证据",
            servesGoals: ["s7_artifact_evidence_citation"] },
          { t: 3,  end: 8,  primaryRole: "判断员", desc: "完成 SWOT 四象限填表，质询员交叉追问证据出处",
            servesGoals: ["s7_artifact_classification_score", "s7_artifact_defense_quality"] },
          { t: 8,  end: 10, primaryRole: "判断员", desc: "TOWS 推导（SO / WT 二选一）",
            servesGoals: ["s7_artifact_tows_actionability"] },
          { t: 10, end: 13, primaryRole: "汇报员", desc: "整理 1 张展示卡：1 条 SWOT 最强项 + 1 条 TOWS 战略",
            servesGoals: ["s7_artifact_tows_actionability", "s7_artifact_evidence_citation"] },
        ],
        note: "若某组质询员能力弱，建议教师巡视时主动追问该组，弥补脚本不足。",
      },

      // 辅图：议程→角色推荐矩阵（议程贯通 第 3 个回响点的核心数据）
      roleSuggestions: [
        { agendaKey: "ethics-pricing",   agendaText: "集采降价合理性",    suggestedRole: "判断员", reason: "需要做政策对比判断" },
        { agendaKey: "innovation-press", agendaText: "创新药企挤压",      suggestedRole: "资料员", reason: "需要查恒瑞 / 百济对照数据" },
        { agendaKey: "valsartan-trust",  agendaText: "2018 事件信任修复", suggestedRole: "质询员", reason: "追问 W 维证据强度" },
        { agendaKey: "api-export",       agendaText: "原料药出海前景",    suggestedRole: "判断员", reason: "O 维趋势判断" },
        { agendaKey: "cdmo-window",      agendaText: "CDMO 机遇判断",     suggestedRole: "汇报员", reason: "综合战略表达" },
      ],

      flow: ["看任务", "对议程", "配角色"],
      renderRules: {
        ok:   { color: "#3a8a4e", style: "solid",  badge: "✓" },
        warn: { color: "#b8860b", style: "stripe", badge: "⚠" },
        miss: { color: "#a23a3a", style: "dash",   badge: "✕" },
      },
    },

    // ── ④ L2 议程对照表 ─────────────────────────────────────
    agendaEchoCard: {
      layerId: "L2",
      borderColor: "amber",
      source: "来自学习者议程 · 议程意愿 · 已被真实性学习情境与资源设计环节 兑现 3/5",
      mode: "role-mapping",
      hint: "本节点把议程映射到 4 个协作角色。点击「生成协作任务单」后，所有 5 条议程会被标记为'角色匹配完成'。",
      writeback: {
        toStation: 8,
        toKey: "agendaFulfillment[8]",
        triggerStation11Risk: true,
      },
    },

    // ── ⑤ 教学判断题 ────────────────────────────────────────
    decision: {
      question: "小组协作最需要补强哪一项？",
      options: [
        {
          key: "agenda-role-match",
          label: "让学习者议程 的学生角色意愿成为本节角色分配的参考",
          rationale: "命中 议程贯通的第 3 个回响点。若学生在议程中表达「我想演患者律师」却被随机分配，会让议程承诺落空。",
          score: 3.9,
          meta: { recommended: true, lintTriggers: ["L2-agenda-role-mismatch"], v3New: true },
        },
        {
          key: "roles",
          label: "为每个角色（资料员/判断员/质询员/汇报员）设置独立证据产出",
          rationale: "能避免小组讨论由少数学生包办，但若不联动议程意愿，仍可能错配。",
          score: 3.4,
        },
        {
          key: "leader",
          label: "指定组长完成主要任务",
          rationale: "效率高但协作必要性不足。会让 3/4 学生失去证据产出机会。",
          score: 1.8,
          meta: { lintTriggers: ["forbidden-leader-only"] },
        },
        {
          key: "random",
          label: "随机分组后自由讨论",
          rationale: "灵活但过程证据薄弱，议程意愿被完全忽略。",
          score: 2.0,
          meta: { lintTriggers: ["L2-agenda-role-mismatch"] },
        },
      ],
      validation: {
        mustSelect: true,
        afterSelectShow: ["rationale", "riskBadges"],
      },
    },

    // ── ⑥ 系统反馈 ──────────────────────────────────────────
    feedbackByKey: {
      "agenda-role-match": {
        summary: "✓ 命中 议程贯通的第 3 回响点",
        riskBadges: ["议程闭环", "高优先级"],
        detail: "选择此项后，议程—角色匹配矩阵将被写入协作任务单。下游 S8 反思性实践与教学改进会显示该议程的最终落点。",
        nextStationHint: "进入形成性评价与适应性调控环节时，3 个 ZPD 锚点的学情触发规则会针对 4 个角色分别设计。",
      },
      "roles": {
        summary: "△ 方向正确但缺议程闭环",
        riskBadges: ["建议加 A 项"],
        detail: "独立证据产出是基础动作。建议本节点先选 A（议程—角色匹配），再以「roles」原则细化任务卡。",
      },
      "leader": {
        summary: "✕ 协作塌缩风险",
        riskBadges: ["认知参与塌缩", "议程贯通失效"],
        detail: "指定组长会让 3/4 学生失去证据产出，违反 ICAP 原则中的 Constructive/Interactive 层。",
      },
      "random": {
        summary: "✕ 议程承诺落空风险",
        riskBadges: ["L2 失效"],
        detail: "随机分组使学习者议程 的角色意愿完全被忽略——议程贯通的硬约束被违反。",
      },
    },

    // ── ⑦ 产物生成 ──────────────────────────────────────────
    artifacts: [
      {
        id: "role-task-card",
        buttonLabel: "⬇ 生成 4 角色协作任务单（含议程映射）",
        outputTitle: "小组协作任务单 · 4 角色 × 5 议程",
        outputCue: "把小组讨论改造成有角色、有证据、有议程映射的协作任务。",
        artifactLines: {
          evidence: "当前 4 角色密度均衡（资料员 72 / 判断员 66 / 质询员 48 / 汇报员 58），质询员略弱需补脚本。",
          action: "为 4 角色分别配证据产出 + 议程映射；质询员附「证据强度追问 5 句」脚本。",
          constraints: [
            "每名学生必须有可见贡献",
            "小组产出必须可追溯",
            "教师追问聚焦证据质量",
            "至少 3 条议程在角色任务中显式照应",
          ],
        },
        sideEffect: "markAgendaRoleMatched",
        writeback: { to: "artifactLibrary" },
      },
      {
        id: "teacher-roving-prompts",
        buttonLabel: "⬇ 生成教师巡视追问提示卡（4 角色 × 高频卡点）",
        outputTitle: "教师巡视与追问提示",
        outputCue: "把巡视从「看气氛」变成「按角色定向追问」。",
        artifactLines: {
          evidence: "13 分钟协作与质询阶段中，教师巡视若无脚本，会偏向参与活跃组、忽略沉默组。",
          action: "为每角色准备 2 句追问模板（如「质询员请指出对方证据中最弱的一条」）。",
          constraints: [
            "追问必须指向证据而非观点",
            "追问必须覆盖每组每角色至少 1 次",
            "追问要为形成性评价与适应性调控环节 学情触发采集留接口",
          ],
        },
        writeback: { to: "artifactLibrary" },
      },
    ],

    // ── ⑧ 状态机 ────────────────────────────────────────────
    stateMachine: {
      A: { id: "locked",       desc: "未进入 · 真实性学习情境与资源设计环节/7 判断未保存" },
      B: { id: "entered",      desc: "已进入未判断" },
      C: { id: "selected",     desc: "已选未保存" },
      D: { id: "saved",        desc: "已保存判断" },
      E: { id: "artifactDone", desc: "已生成协作任务单 · L2 议程角色匹配完成" },
    },

    // ── ⑨ Lint 规则 ─────────────────────────────────────────
    lintRules: [
      {
        id: "L2-agenda-role-mismatch",
        when: "decision.userChoice in ['random'] OR agendaFulfillment[8] is empty",
        severity: "high",
        onTriggerUI: "在选项 agenda-role-match 上加「推荐」pill",
      },
      {
        id: "forbidden-leader-only",
        when: "decision.userChoice === 'leader'",
        severity: "medium",
        onTriggerUI: "选项 leader 显示「协作塌缩」徽章",
      },
    ],

    // ── ⑩ 横向层钩子 ────────────────────────────────────────
    horizontalLayerHooks: {
      L1: { visible: false, reason: "锚点在学习活动与教学支架设计环节 定义、形成性评价与适应性调控环节 编辑规则；学习活动与教学支架设计环节 是学情触发面" },
      L2: {
        visible: true,
        echoMode: "role-mapping",
        topBarSyncText: "议程已加载 · {totalAgendas} 条 · 真实性学习情境与资源设计环节 兑现 {fulfilledAt6}/{totalAgendas} · 学习活动与教学支架设计环节 待匹配 {pendingAt8}",
      },
      L3: {
        visible: true,
        sticky: true,
        minimizedHeight: 32,
      },
    },

    // ── ⑪ 落库约定 ──────────────────────────────────────────
    persistence: {
      userJudgments: { path: "userJudgments[8]" },
      artifactLibrary: { path: "artifactLibrary" },
      agendaFulfillment: {
        path: "station3.agendaFulfillment[8]",
        readers: [11],
        shape: { role: "string", agendaKey: "string", studentIntent: "string?" },
      },
      qualityCheckpoints: {
        backendMappingTo20Steps: ["协作分工", "角色任务", "证据分析", "教师巡视", "展示追问", "议程角色匹配"],
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
