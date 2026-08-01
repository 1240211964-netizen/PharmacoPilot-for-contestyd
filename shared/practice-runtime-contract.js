/*
 * PharmacoPilot · Practice Runtime Contract v2.0
 * ------------------------------------------------------------
 * 教学实践（practice-detail.html）的运行时契约。
 *
 * 与 nav-stations-contract 同级，但角色不同：
 *   · nav 侧解决「一节课怎么备」，practice 不把它作为本页生成输入。
 *   · practice 侧从课程/班级/课时/章节与九环节设计摘要生成完整实践包，
 *     再在虚拟班跑一遍并把可复用片段按共同的九环节标签归位。
 *
 * 不重复造存储——所有持久化与跨页广播都走 PharmacoPilotStore。
 * 不重复造数据源——本契约只定义：
 *   1) PRACTICE_STAGES：3 阶段状态机
 *   2) EVENT_SCHEMA：模拟课堂事件流 schema（一行 beat 是什么）
 *   3) KEY_MOMENT_TYPES：Agent 用什么规则从事件流里挑出"关键时刻"
 *   4) COMMENT_SCHEMA：学科审校候选与教师决策的数据形状（保留旧导出名兼容）
 *   5) ASSET_TARGETS：每一种可复用资产能写回到 nav 哪个站、哪种 slot
 *   6) PRACTICE_TO_NAV：KM/Comment 组合 → 资产 → 写回调用 的映射表
 *
 * Public on window.PharmacoPilotPracticeContract
 * ============================================================ */
(function attachPracticeContract(global) {
  "use strict";

  const VERSION = "practice-v2";

  // ============================================================
  // 1. 3 阶段状态机
  // ============================================================
  // 每一阶段都明确：本阶段读什么、产出什么、下一阶段消费什么。
  // 这是 practice 内部的"小 PRODUCT_CHAIN"。
  const PRACTICE_STAGES = [
    {
      id: "i",
      key: "generate",
      seq: "i",
      cn: "生成实践包",
      en: "GENERATE",
      anchor: "#stage-i",
      reads: {
        inputs: ["course", "class", "session", "chapter", "designBriefs.env01-env09"],
        meaning: "教师确认九环节课堂教学设计摘要后，由本地模型展开完整课堂实践包；导航页不是本阶段的数据源。",
      },
      produces: {
        practicePack: "{ env01…env09 } — 可编辑、可分环节重生成并导出 DOCX/PDF/MD/ZIP 的完整实践包",
      },
      consumedBy: ["ii"],
    },
    {
      // 旧 i/ii/iii 三阶段（simulate/capture/review）合并为「试错+证据」单一阶段。
      // 同时承载：A · 五路学科审校；B · 虚拟班仿真记录 + 风险信号 + 评价标准歧义。
      id: "ii",
      key: "trial-evidence",
      seq: "ii",
      cn: "试错+证据",
      en: "TRIAL & EVIDENCE",
      anchor: "#stage-ii",
      reads: { from: "i.practicePack", plan: "store.artifacts" },
      produces: {
        comments: "Comment[] — 五路学科审校建议；证据出现前只作为观察焦点，不允许进入候选或形成教师判断",
        observationFocus: "审校建议压缩出的 3 个观察重点；用于指导教师看仿真，不构成采纳决定",
        eventStream: "时间步进的 beats 数组（教师/Agent/学生发言 + 沉默标记）",
        keyMoments: "KeyMoment[] — 3 到 5 条仿真记录，每条含时间戳和可引用片段；只建议关联，不自动验证",
        participation: "32 学生发言计数 + 教师讲/学生说/停顿三段比例",
        consensus: "本轮共识纪要（用于环节 09 复盘）",
      },
      consumedBy: ["iii"],
      timing: { simulatedMin: 45, realtimeSec: 270, tickMs: 1000 },
    },
    {
      id: "iii",
      key: "writeback",
      seq: "iii",
      cn: "确认写回",
      en: "WRITE-BACK",
      anchor: "#stage-iii",
      reads: { from: ["ii.keyMoments", "ii.reviewCandidates", "ii.teacherDecisions"] },
      produces: {
        reusableAssets: "ReusableAsset[] — 已打包为 P-{stationId}-{α/β/...}",
        writebackCalls: "对 PharmacoPilotStore 的 saveArtifact / setZpdAnchors / setPulseRule 调用",
      },
      consumedBy: ["nav.station[targetId]"], // 跨页：下一轮 nav 进入该环节时能看到
    },
  ];

  // ============================================================
  // 2. 事件流 schema
  // ============================================================
  // 模拟课堂里每一行字幕就是一个 beat。Agent 用这些 beat 来检测"关键时刻"。
  const EVENT_SCHEMA = {
    beat: {
      tSec: "number — 仿真时间秒，0 = 课堂开始",
      role: "'T' | 'S' | 'A' | 'marker'  (教师/学生/Agent/段落标记)",
      who: "string? — 学生编号或姓名",
      kind: "'speech' | 'question' | 'answer' | 'silence' | 'agentSuggest' | 'agentDetect' | 'phaseMarker'",
      text: "string — 内容",
      links: {
        questionChainId: "string? — 来自实践包问题链第几题",
        envOrigin: "number? — 这一拍对应 9 个教学环节中的哪一个（仅作写回标签）",
      },
      flags: {
        conflict: "boolean — 是否构成观点对立",
        breakout: "boolean — 是否是分组节点",
        unplanned: "boolean — 是否超出 plan.md 预设",
      },
    },
    participationTick: {
      tSec: "number",
      perStudent: "Map<studentId, speakCount>",
      breakdown: "{ teacher: 0..1, student: 0..1, silent: 0..1 }",
    },
  };

  // ============================================================
  // 3. KeyMoment 类型 + 检测规则
  // ============================================================
  // Agent 不评分，只标"哪一处发生了真正的学习"。三类规则各对应一类学习事件。
  const KEY_MOMENT_TYPES = [
    {
      id: "structural-conflict",
      cn: "学生观点结构性冲突",
      detectRule: "同一问题链下，≥ 2 名学生在 ≤ 30 秒内表达对立立场 (flags.conflict)",
      suggestStation: 5, // 问题链
      suggestSlot: "questionChain.divergenceAnchor",
      copyTemplate: '在问题链第 {qid} 题处加一个"分歧锚点"，并准备一条立场切换提示词。',
      priority: 1,
    },
    {
      id: "high-response-density",
      cn: "开放问题应答密度高于预期",
      detectRule: "教师提开放题后 15 秒内 ≥ 5 位学生应答",
      suggestStation: 5,
      suggestSlot: "questionChain.openerTemplate",
      copyTemplate: '把这种"先开放后分析"的破冰句式存入节点 5 模版库。',
      priority: 2,
    },
    {
      id: "unplanned-dimension",
      cn: "学生意外提及超出预设维度",
      detectRule: "学生发言含 flags.unplanned = true",
      suggestStation: 8, // 探究
      suggestSlot: "explore.studentInitiatedDimension",
      copyTemplate: '把"{quote}"作为协作任务的可选入口加入节点 8。',
      priority: 3,
    },
    {
      id: "agent-intervention-adopted",
      cn: "Agent 介入后教师执行了对应动作",
      detectRule: "Agent 发出 agentSuggest 后，≤ 60 秒内教师执行对应动作（breakout/重述等）",
      suggestStation: 9, // 形成性评价 / ZPD 锚点学情触发规则
      suggestSlot: "pulseRule.ifThen",
      copyTemplate: "为当前时间锚点 Z{ZPD-id} 写一条规则：如果出现 {condition}，则 {action}。",
      priority: 1,
    },
    {
      id: "silence-cliff",
      cn: "长时间沉默",
      detectRule: "连续 ≥ 30 秒无学生发言",
      suggestStation: 7, // 时间线
      suggestSlot: "timeline.scaffoldInsertion",
      copyTemplate: "在 {tStart}'–{tEnd}' 之间插入一个支架（提示卡/示例/小组互判）。",
      priority: 2,
    },
  ];

  // ============================================================
  // 4. ReviewCandidate schema（保留 COMMENT_SCHEMA 名称作兼容导出）
  // ============================================================
  const COMMENT_SCHEMA = {
    fields: {
      expertId: "string — 审校视角标识",
      draftText: "string — 教师可编辑的修订候选文本",
      targetEnvKeys: "envKey[] — 当前 S1–S9 目标环节，可多选",
      originalEnvContent: "Record<envKey,string> — 加入候选时冻结的原文快照",
      evidenceLinks: "KeyMoment.id[] — 系统建议、教师可调整的仿真记录关联",
      state: "'pending' | 'candidate' | 'rejected'",
      candidateMode: "'original' | 'modified' | null — 原意见或修改后意见进入候选",
      decision: "'pending' | 'supported' | 'unsupported' | 'insufficient'",
      decisionNote: "string? — 教师判断依据",
      rejectionReason: "string? — 不采用时必填",
      writtenBack: "boolean — 仅 supported 候选可写回",
      liveReview: "PracticeLiveReview? — 本机模型单卡审校结果；含原文摘录、稿件修订号、模型与提示词版本",
    },
    decisionRules: {
      preEvidenceReadOnly: "证据出现前只允许阅读审校、调整目标环节和标记观察点；state 必须保持 pending，candidateMode 必须保持 null，decision 必须保持 pending",
      postEvidenceSingleDecision: "至少出现一条 KeyMoment 后，教师只回答一次如何处理建议；界面将该动作映射到 candidateMode、evidenceLinks 与 decision，修改编辑器和暂不修改原因按需展开",
      supportedNeedsEvidence: "按建议修改或调整后修改必须关联至少一条仿真记录；没有相关记录时只能暂不修改并记录证据不足",
      teacherAuthority: "系统只建议关联，不自动宣布验证结论",
      writebackGate: "仅教师确认支持的候选可按目标环节打包写回",
      anchorGate: "模型批注仅在摘录通过逐字或规范化定位门禁后标记为已锚定；旧修订批注不得进入候选",
      schemaStable: "COMMENT_SCHEMA 字段保持不变；本次只改变决策时序与界面位置，不改变审计记录的数据形状",
    },
  };

  // ============================================================
  // 5. Asset 类型 → nav station slot 映射
  // ============================================================
  // 每一种 ReusableAsset 都精确说明：
  //   - 写到哪个站（targetStation）
  //   - 走 store 的哪个 API
  //   - 在 nav 那一站显示在哪个 slot
  const ASSET_TARGETS = {
    // 节点 1 · 课程定位（极少从 practice 写回；只在"定位被实战推翻"时触发）
    "positioning.spiralCorrection": {
      stationId: 1,
      storeCall: "saveArtifact",
      slot: "spiral-context-card",
      kind: "asset · correction",
      autoTriggerWhen: "本节实战暴露出与上下游课程的接续断层",
    },
    // 节点 4 · 目标与评价（评阅高频写回此处：目标应可被学生产出证明）
    "goal.observableCriterion": {
      stationId: 4,
      storeCall: "saveArtifact",
      slot: "learning-goal.observable-criterion",
      kind: "asset · goal-rewrite",
    },
    "evidence.rubricRowAdd": {
      stationId: 4,
      storeCall: "saveArtifact",
      slot: "evidence-table.row",
      kind: "asset · rubric",
    },
    // 节点 5 · 问题链（最高频写回；演练里冒出的"好问句"基本都落这里）
    "questionChain.openerTemplate": {
      stationId: 5,
      storeCall: "saveArtifact",
      slot: "question-chain.opener",
      kind: "asset · template",
    },
    "questionChain.divergenceAnchor": {
      stationId: 5,
      storeCall: "saveArtifact",
      slot: "question-chain.divergence-anchor",
      kind: "asset · template",
    },
    // 节点 6 · 案例与议程兑现
    "case.evidenceForAgenda": {
      stationId: 6,
      storeCall: "saveArtifact",
      slot: "case.agenda-evidence-row",
      kind: "asset · case-row",
    },
    // 节点 7 · 时间线 + ZPD 锚点（演练里发现的新锚点位置）
    "timeline.scaffoldInsertion": {
      stationId: 7,
      storeCall: "saveArtifact",
      slot: "timeline.scaffold-slot",
      kind: "asset · timeline-patch",
    },
    "timeline.zpdAnchorAdd": {
      stationId: 7,
      storeCall: "setZpdAnchors", // 直接改 L1 数据
      kind: "asset · zpd-anchor",
      mergeStrategy: "append-unique-by-tSec",
    },
    // 节点 8 · 探究（学生意外维度变成协作入口）
    "explore.studentInitiatedDimension": {
      stationId: 8,
      storeCall: "saveArtifact",
      slot: "explore.optional-task",
      kind: "asset · task-option",
    },
    "explore.roleRebalance": {
      stationId: 8,
      storeCall: "saveArtifact",
      slot: "explore.role-rebalance",
      kind: "asset · role-tip",
    },
    // 节点 9 · 学情触发规则（Agent 介入复盘出来的 if/then 规则）
    "pulseRule.ifThen": {
      stationId: 9,
      storeCall: "setPulseRule", // 直接改 L1 数据
      kind: "asset · pulse-rule",
      mustHave: ["anchorId", "ifCond", "thenAct"],
    },
    // 节点 11 · 复盘资产 + 议程兑现度回顾
    "retro.consensusPull": {
      stationId: 11,
      storeCall: "saveArtifact",
      slot: "retro.consensus",
      kind: "asset · consensus",
    },
    "retro.agendaFulfillment": {
      stationId: 11,
      storeCall: "markAgendaFulfilled",
      kind: "asset · agenda-evidence",
    },
  };

  // ============================================================
  // 6. PRACTICE_TO_NAV：写回路径表
  // ============================================================
  // 对每一种 (KM类型 + 是否带评阅) 组合，规定打包资产编号与目标 slot。
  // 这张表是 Stage iii 在教师确认支持后建议“打包合并”的数据来源。
  const PRACTICE_TO_NAV = [
    {
      from: { km: "structural-conflict", withComment: true },
      assetPrefix: "P-05-",
      packages: ["questionChain.divergenceAnchor", "questionChain.openerTemplate"],
      copyHint: "把分歧锚点 + 立场切换提示词一起打包写回节点 5",
    },
    {
      from: { km: "structural-conflict", withComment: false },
      assetPrefix: "P-05-",
      packages: ["questionChain.divergenceAnchor"],
    },
    {
      from: { km: "high-response-density" },
      assetPrefix: "P-05-",
      packages: ["questionChain.openerTemplate"],
    },
    {
      from: { km: "unplanned-dimension" },
      assetPrefix: "P-08-",
      packages: ["explore.studentInitiatedDimension"],
    },
    {
      from: { km: "agent-intervention-adopted" },
      assetPrefix: "P-09-",
      packages: ["pulseRule.ifThen"],
      copyHint: "Agent 介入后的教师执行动作可由教师确认为「如果 X 则 Y」候选规则",
    },
    {
      from: { km: "silence-cliff" },
      assetPrefix: "P-07-",
      packages: ["timeline.scaffoldInsertion"],
    },
  ];

  // ============================================================
  // 7. 默认示例剧本（PharmacoPilotStore 为空时回落使用）
  // ============================================================
  // 不依赖任何外部 plan.md 文件；让 practice 在 nav 未跑过任何站时也能跑。
  const DEFAULT_SCRIPT = {
    plan: {
      title: "《管理学原理》— SWOT · 45 min · v 0.3",
      version: "0.3",
      durationMin: 45,
      blocks: [
        {
          id: "b1",
          tStart: 0, tEnd: 60,
          phase: "开场",
          questionChainId: 1, type: "open",
          text: '教师抛第 1 题："看到这张图，你最直觉的判断是什么？"',
        },
        {
          id: "b2",
          tStart: 60, tEnd: 150,
          phase: "分歧锚点",
          questionChainId: 3, type: "stance",
          text: '教师抛第 3 题："如果你是企业负责人，会优先回应哪一项？"',
        },
        {
          id: "b3",
          tStart: 140, tEnd: 440,
          phase: "分组讨论",
          questionChainId: null,
          text: "A 组从 5 年视角谈，B 组从 1 年视角谈，5 分钟后回到课堂。",
        },
      ],
    },
    // 完整 beat 流由 practice-runtime.js 根据 plan 程序化生成；这里只放种子
    seeds: {
      teachers: ["首席讲师 · 王老师"],
      students: 32,
      activeStudentIds: [12, 7, 22, 18, 25],
      conflictPair: ["S-7", "S-22"], // 用于触发 structural-conflict KM
      unplannedQuote: "企业研发投入会不会被压缩？",
    },
  };

  // ============================================================
  // 8. 防退化约束（与 nav contract 的 FORBIDDEN_CHANGES 对齐）
  // ============================================================
  const FORBIDDEN_CHANGES = [
    "不得让模拟课堂退化为「自动答题剧本」；事件流必须如实记录 Agent 检测与教师实际动作。",
    '不得让关键时刻退化为打分；只能输出"标记 + 引用 + 写回建议"，不出分数。',
    '不得让学科审校退化为“赞/踩”；必须可编辑、可选目标环节、可关联仿真记录并保留教师判断。',
    "不得在仿真证据出现前改变 Comment.state / candidateMode / decision；审校在此时只产生观察焦点。",
    '不得让写回地图退化为"再存一份归档"；每个 Asset 必须显式落到 nav 某站某 slot，且通过 PharmacoPilotStore 广播。',
    "不得绕过 PharmacoPilotStore 自建持久化；practice 与 nav 必须共用同一份 state。",
    "不得创建无目标站的资产；ASSET_TARGETS 表未列出的 slot 一律拒绝写回。",
  ];

  function deepFreeze(obj) {
    Object.freeze(obj);
    Object.getOwnPropertyNames(obj).forEach((p) => {
      const v = obj[p];
      if (v && typeof v === "object" && !Object.isFrozen(v)) deepFreeze(v);
    });
    return obj;
  }

  // ============================================================
  // 9. 工具函数
  // ============================================================
  function assetTargetFor(slotId) {
    return ASSET_TARGETS[slotId] || null;
  }
  function packageFor(kmTypeId, withComment) {
    return PRACTICE_TO_NAV.find(
      (r) => r.from.km === kmTypeId &&
             (r.from.withComment === undefined || r.from.withComment === !!withComment)
    ) || null;
  }
  function nextAssetId(prefix, existingIds) {
    const greek = ["α", "β", "γ", "δ", "ε", "ζ", "η", "θ"];
    for (const g of greek) {
      const id = prefix + g;
      if (!existingIds || !existingIds.includes(id)) return id;
    }
    return prefix + (existingIds ? existingIds.length + 1 : "x");
  }

  global.PharmacoPilotPracticeContract = deepFreeze({
    VERSION,
    PRACTICE_STAGES,
    EVENT_SCHEMA,
    KEY_MOMENT_TYPES,
    COMMENT_SCHEMA,
    ASSET_TARGETS,
    PRACTICE_TO_NAV,
    DEFAULT_SCRIPT,
    FORBIDDEN_CHANGES,
    // helpers
    assetTargetFor,
    packageFor,
    nextAssetId,
  });
})(window);
