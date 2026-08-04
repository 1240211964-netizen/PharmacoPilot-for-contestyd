/*
 * PharmacoPilot · Station 06 Payload · 案例证据室
 * ------------------------------------------------------------
 * 示例载荷：SWOT 分析 ·《管理学原理》示例知识点
 * 分析对象：华海药业 · 集采常态化情境
 *
 * 注册到 window.PharmacoPilotStationPayloads[6]
 * 由 nav-render.js 在渲染真实性学习情境与资源设计环节 时读取。
 *
 * 数据结构遵循 contract v3：
 *   - chainTopcard         · 学习产出链顶卡
 *   - narrative            · 环节说明（是什么/为什么/怎么做）
 *   - evidenceFigure       · 证据图（含 bars + agendaCoverageDots）
 *   - agendaEchoCard       · L2 议程对照表
 *   - decision             · 教学判断题（4 选项，含 lintTriggers）
 *   - feedbackByKey        · 系统反馈（含 blockSave 钩子）
 *   - artifacts            · 产物生成模板（材料清单 + 议程对照表）
 *   - lintRules            · 决策银行后台 lint 规则
 *   - stateMachine         · A→B→C→D→E 状态机
 *   - horizontalLayerHooks · L1/L2/L3 钩子
 * ============================================================ */
(function attachStation6Payload(global) {
  "use strict";

  const STATION_ID = 6;

  const payload = {
    id: STATION_ID,
    version: "phase11-v3",
    parentStageId: "S4",
    subNodeKey: "6",
    exampleCase: { topic: "SWOT", subject: "华海药业", scenario: "集采常态化" },

    enterCondition: {
      requires: [
        { stationId: 4, key: "judgmentSaved" },
        { stationId: 3, key: "agendaCollected" },
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
          snippet: "5 条核心关切 · 含「集采降价合理性」「创新药挤压」「2018 杂质事件影响」",
        },
        {
          stationId: 4, label: "学习目标", key: "学习目标",
          snippet: "能识别 SWOT 各维度的证据来源类型，并完成 TOWS 推导",
        },
        {
          stationId: 5, label: "问题链", key: "概念边界说明",
          snippet: "方法论严谨链 6 层 · 重点：内外分类 / 证据出处 / 权重 / TOWS / 工具批判",
        },
      ],
      outputsTo: [
        { stationId: 8, label: "探究协作", outKey: "案例材料 → 协作任务单" },
      ],
      drawerFullContent: true,
    },

    // ── ② 环节说明卡 ────────────────────────────────────────
    narrative: {
      what: "准备药事管理案例、政策材料、数据资料、任务单和证据模板；显式回应学习者议程 议程中的伦理/政策关切。",
      why:  "案例必须包含事实、政策、数据、利益相关者和风险边界。加入「议程对照表」，强制把学生议程关切体现为可引用证据。",
      how:  "查看案例证据密度图 + 议程对照表，判断材料是否覆盖事实/政策/数据/角色/风险/议程关切六类。",
    },

    // ── ③ 证据图 ────────────────────────────────────────────
    evidenceFigure: {
      title: "案例证据密度图 — 华海药业 SWOT 材料包覆盖度",
      subtitle: "看案例证据是否够用",
      evidenceNote: "案例不是背景故事，而是学生判断的证据来源。",
      // v4.2: 显式声明 bars 数据为示例值，避免教师误读为"已分析自己上传的材料"
      dataNotice: {
        type: "example",
        text: "⚠ 当前显示为华海药业样例数据。证据密度为示例性判断，不随案例材料自动计算（案例上传与重算功能尚未实现）。",
        showWhenNoUserUpload: true,
      },
      bars: [
        ["S 维证据", 80, { source: "年报研发章节 + ANDA 数量榜单",      status: "ok" }],
        ["W 维证据", 42, { source: "2018 缬沙坦事件简报 + 毛利率表",    status: "warn", warnText: "事件已 8 年，需补充近期修复进展" }],
        ["O 维证据", 76, { source: "国务院仿制药意见 + 集采扩围公告",   status: "ok" }],
        ["T 维证据", 70, { source: "印度同行数据 + 创新药企竞争",        status: "ok" }],
        ["角色立场", 38, { source: "缺患者/医保局立场材料",              status: "miss" }],
        ["风险边界", 34, { source: "缺企业违规边界材料",                  status: "miss" }],
      ],
      agendaCoverageDots: [
        { agendaKey: "ethics-pricing",   label: "集采降价合理性",      covered: true,  evidenceSrc: "国家医保局历批降幅公告" },
        { agendaKey: "innovation-press", label: "创新药企挤压",        covered: true,  evidenceSrc: "百济神州 / 恒瑞年报对照" },
        { agendaKey: "valsartan-trust",  label: "2018 事件信任修复",   covered: false, evidenceSrc: null },
        { agendaKey: "api-export",       label: "原料药出海前景",      covered: true,  evidenceSrc: "海关出口数据片段" },
        { agendaKey: "cdmo-window",      label: "CDMO 机遇判断",       covered: false, evidenceSrc: null },
      ],
      flow: ["看密度", "查议程", "补证据"],
      renderRules: {
        ok:   { color: "#3a8a4e", style: "solid",  badge: "✓" },
        warn: { color: "#b8860b", style: "stripe", badge: "⚠" },
        miss: { color: "#a23a3a", style: "dash",   badge: "✕" },
        dotCovered:    { color: "#3a8a4e", fill: "solid" },
        dotUncovered:  { color: "#a23a3a", fill: "none" },
      },
    },

    // ── ④ L2 议程对照表 ─────────────────────────────────────
    agendaEchoCard: {
      layerId: "L2",
      borderColor: "amber",
      source: "来自学习者议程 · 学生议程协商单",
      totalAgendas: 5,
      coveredCount: 3,
      uncoveredCount: 2,
      uncoveredList: [
        {
          key: "valsartan-trust",
          text: "2018 缬沙坦事件后，公司信任修复到什么程度？",
          suggestAction: "补充：FDA 近 2 年针对华海的检查记录 / 出口量恢复曲线",
        },
        {
          key: "cdmo-window",
          text: "华海能否切入 CDMO 业务对冲集采压力？",
          suggestAction: "补充：公司近年 CDMO 业务披露 / 行业 CDMO 龙头对照",
        },
      ],
      hardConstraint: "议程进入预期学习结果与评价证据设计环节/6/8/11 时必须显式回应（可填可空，留空进入复盘风险列表）",
      writeback: {
        toStation: 3,
        toKey: "agendaFulfillment[6]",
        triggerStation11Risk: true,
      },
    },

    // ── ⑤ 教学判断题 ────────────────────────────────────────
    decision: {
      question: "案例材料最需要先处理什么问题？",
      options: [
        {
          key: "agenda-fill",
          label: "把未兑现的 2 条学生议程对应的证据补齐",
          rationale: "命中 议程贯通硬约束。议程被采集却无证据对应，会让学习者议程 的协商承诺退化为「调查表」。",
          score: 3.9,
          meta: { recommended: true, lintTriggers: ["L2-uncovered"], v3New: true },
        },
        {
          key: "tag",
          label: "为现有材料标注事实/政策/数据/角色/风险边界 5 类标签",
          rationale: "能让学生每条 SWOT 判断都有证据来源。但当前更紧迫的是议程兑现。",
          score: 3.4,
        },
        {
          key: "more",
          label: "继续增加背景材料，让案例更丰满",
          rationale: "材料越多不一定越好。证据图显示 S/O/T 维已 ≥70%，再加会压垮学生 27 分钟结构化实战节奏。",
          score: 1.9,
          meta: { lintTriggers: ["material-overload"] },
        },
        {
          key: "answer",
          label: "直接给出参考 SWOT 答案，降低学生难度",
          rationale: "会削弱学生探究和论证，违反 contract「不得退化为知识问答」的禁条。",
          score: 1.4,
          meta: { lintTriggers: ["forbidden-spoonfeed"], blockSave: true },
        },
      ],
      validation: {
        mustSelect: true,
        afterSelectShow: ["rationale", "riskBadges"],
      },
    },

    // ── ⑥ 系统反馈 ──────────────────────────────────────────
    feedbackByKey: {
      "agenda-fill": {
        summary: "✓ 命中议程兑现度风险",
        riskBadges: ["议程兑现", "高优先级"],
        detail: "选择此项后，请去学习者议程 议程列表标记「已被真实性学习情境与资源设计环节 兑现」，并在产物生成中输出「议程—证据对照表」。",
        nextStationHint: "完成后进入学习活动与教学支架设计环节 时，议程角色匹配会自动加载这 5 条议程作为角色意愿候选。",
      },
      "tag": {
        summary: "△ 方向正确但顺序不佳",
        riskBadges: ["建议次轮再做"],
        detail: "标签化是高价值动作，但应在议程兑现之后。建议本节点先选 A，标签化在学习活动与教学支架设计环节 协作任务单生成时一并完成。",
      },
      "more": {
        summary: "✕ 材料过载风险",
        riskBadges: ["认知负荷", "时间挤压"],
        detail: "证据图显示 S/O/T 三象限证据已充足。继续增加材料会让 27 分钟结构化实战无法完成 TOWS。",
      },
      "answer": {
        summary: "✕ 违反 contract 禁条",
        riskBadges: ["禁条触发"],
        detail: "引申自 FORBIDDEN_CHANGES「不得把 SWOT 当作产品总主题」：不得把案例退化为知识问答。",
        blockSave: true,
      },
    },

    // ── ⑦ 产物生成 ──────────────────────────────────────────
    artifacts: [
      {
        id: "case-material-list",
        buttonLabel: "⬇ 生成华海药业材料清单（15 份，按 SWOT 象限组织）",
        outputTitle: "案例材料清单 · 华海药业 SWOT",
        outputCue: "把案例材料转成可提取、可追溯的证据包。",
        artifactLines: {
          evidence: "案例已具备 S/O/T 三象限的事实与政策证据，但 W 维近期数据偏老（2018），且角色立场与风险边界仍待补充。",
          action: "为材料标注事实/政策/数据/角色/风险边界 5 类标签，并要求学生每条 SWOT 判断引用至少 1 条材料证据。",
          constraints: [
            "材料必须有可引用事实",
            "不能让学生凭个人经验完成判断",
            "案例边界必须写入任务说明",
            "W 维证据需含 2024 年后修复进展",
          ],
        },
        payload: {
          counts: { S: 4, W: 3, O: 4, T: 4 },
          sourceDirectory: "教学资产库 / 案例 / 华海药业 / v1",
        },
        writeback: { to: "artifactLibrary" },
      },
      {
        id: "agenda-evidence-map",
        buttonLabel: "⬇ 生成议程—证据对照表",
        outputTitle: "议程兑现表 · 真实性学习情境与资源设计环节 输出",
        outputCue: "标记每条议程是否在材料中获得证据对应。",
        template: {
          columns: ["议程 key", "议程文本", "对应证据来源", "兑现状态", "教师批注"],
          rows: { generateFrom: "evidenceFigure.agendaCoverageDots" },
        },
        writeback: { to: "station3.agendaFulfillment[6]", visibleAtStations: [11] },
      },
    ],

    // ── ⑧ 状态机 ────────────────────────────────────────────
    stateMachine: {
      A: { id: "locked",        desc: "未进入 · enterCondition 未满足", ui: "灰色 tile + 锁定图标" },
      B: { id: "entered",       desc: "已进入未判断",                  ui: "全显示 · 产物按钮 disabled" },
      C: { id: "selected",      desc: "已选未保存",                    ui: "反馈区展开 · 产物按钮 enabled · blockSave 时保存 disabled" },
      D: { id: "saved",         desc: "已保存判断",                    ui: "tile 变绿勾 · 滚到产物区" },
      E: { id: "artifactDone",  desc: "已生成产物",                    ui: "按钮变「已生成 ✓」· 显示「前往学习活动与教学支架设计环节」CTA" },
    },

    // ── ⑨ Lint 规则 ─────────────────────────────────────────
    lintRules: [
      {
        id: "L2-uncovered",
        when: "agendaEchoCard.uncoveredCount > 0",
        severity: "high",
        onTriggerUI: "在选项 agenda-fill 上加「推荐」pill + 列入复盘风险",
      },
      {
        id: "material-overload",
        when: "evidenceFigure.bars.filter(b => b[2].status === 'ok').length >= 4",
        severity: "medium",
        onTriggerUI: "选项 more 标灰 + 显示「认知负荷」徽章",
      },
      {
        id: "forbidden-spoonfeed",
        when: "decision.userChoice === 'answer'",
        severity: "block",
        onTriggerUI: "保存按钮 disabled + 红色违规框",
      },
    ],

    // ── ⑩ 横向层钩子 ────────────────────────────────────────
    horizontalLayerHooks: {
      L1: { visible: false, reason: "本节点不是 L1 主战场（学情触发在 7/8/9）" },
      L2: {
        visible: true,
        writebackKey: "globalAgendaRisk",
        triggerStation11Risk: true,
        topBarSyncText: "议程已加载 · {totalAgendas} 条 · 真实性学习情境与资源设计环节 兑现 {coveredCount}/{totalAgendas}",
      },
      L3: {
        visible: true,
        sticky: true,
        minimizedHeight: 32,
      },
    },

    // ── ⑪ 落库约定 ──────────────────────────────────────────
    persistence: {
      userJudgments: {
        path: "userJudgments[6]",
        shape: { key: "string", timestamp: "iso", score: "number" },
      },
      artifactLibrary: {
        path: "artifactLibrary",
        shape: { stationId: 6, artifactId: "string", html: "string", md: "string" },
      },
      agendaFulfillment: {
        path: "station3.agendaFulfillment[6]",
        readers: [11],
      },
      qualityCheckpoints: {
        backendMappingTo20Steps: ["案例材料", "政策数据", "证据模板", "来源边界", "议程兑现"],
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
