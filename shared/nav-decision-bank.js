/*
 * PharmacoPilot · Nav Decision Bank
 * 每个 legacy station 的决策选项；前台统一映射为 v4 9 个教学环节
 * 摘自 课程智能体/前端核心/teaching-navigation-productized.js
 * Format: { stationId: [ [key, label, rationale, score, meta?], ... ] }
 *   - key:       内部 id（保存判断时用）
 *   - label:     按钮文案
 *   - rationale: 选中后反馈语
 *   - score:    推荐度（4=强推荐, 1=不建议）
 *   - meta?:     可选元数据（v3 新增，旧消费者按索引读取不受影响）
 *                { recommended?: bool, lintTriggers?: string[],
 *                  blockSave?: bool,   v3New?: bool }
 */
(function attachDecisionBank(global) {
  const decisionBank = {
    1: [
      ["comprehensive", "综合决策型定位",
        "贯通「病—证—管」四类决策。SWOT 是工具不是目的，主目标是循证决策训练——与课程主线一致。",
        3.8, { recommended: true }],
      ["research", "证据研究型定位",
        "强化文献检索与综述训练。若本班型偏研究方向可选；否则会让 SWOT 的判断属性被稀释。",
        3.4],
      ["policy", "政策治理型定位",
        "与「集采常态化」情境契合，但会让 W/T 维分析过度政治化——SWOT 退化为政策辩论。",
        3.2],
      ["service", "服务运营型定位",
        "贴近基层药学服务实务，但 SWOT 分析对象通常是企业不是门店——与本案例对象（华海药业）错位。",
        2.8],
    ],
    2: [
      ["evidence", "学生会填表，但证据链表达不足", "这是最容易被忽略的高风险问题，应前置证据引用训练。", 3.7],
      ["boundary", "内部条件与外部环境边界混淆", "需要通过正反例和判断流程卡澄清。", 3.3],
      ["participation", "低参与学生无法进入任务", "需要低门槛入口和小组角色支持。", 3.0],
    ],
    3: [
      ["ethics", "学生关心案例伦理边界，教师设计偏管理判断", "建议在案例与证据环节 把伦理边界加入案例材料。", 3.8],
      ["policy", "学生希望讨论政策合理性，教师定位是服务运营", "建议在目标与量规环节 调整目标涵盖政策维度。", 3.7],
      ["align", "学生议程与教师预设一致", "保留议程作为课堂导入素材，提高 ownership。", 3.2],
      ["narrow", "学生议程过于分散，需要教师收敛", "过早收敛会削弱主体性，必须提示风险。", 1.9],
    ],
    4: [
      ["evidence", "为每个目标配置评价证据", "最能建立目标、活动、产出和评价之间的闭环。", 3.8],
      ["verb", "把「理解」改写为可观察行为", "能减少空泛目标，是必要改进。", 3.4],
      ["more", "增加更多目标以显得完整", "目标过多会稀释课堂主线。", 1.7],
    ],
    5: [
      ["chain", "按「概念边界—证据判断—策略建议」组织", "能把教材内容转化为学生可操作的问题链。", 3.8],
      ["textbook", "按教材章节顺序逐段讲授", "结构清楚，但容易退回概念讲授。", 2.1],
      ["all", "尽量覆盖所有内容点", "会显著增加认知负荷。", 1.6],
    ],
    6: [
      ["agenda-fill", "把未兑现的 2 条学生议程对应的证据补齐",
        "命中 议程贯通硬约束。议程被采集却无证据对应，会让学习者议程 的协商承诺退化为「调查表」。",
        3.9, { recommended: true, lintTriggers: ["L2-uncovered"], v3New: true }],
      ["tag", "为现有材料标注事实/政策/数据/角色/风险边界 5 类标签",
        "能让学生每条判断都有证据来源；但当前更紧迫的是议程兑现。",
        3.4],
      ["more", "继续增加背景材料，让案例更丰满",
        "材料越多不一定越好，证据图已显示 S/O/T 维 ≥70%，再加会压垮学生实战节奏。",
        1.9, { lintTriggers: ["material-overload"] }],
      ["answer", "直接给出参考 SWOT 答案，降低学生难度",
        "会削弱学生探究和论证，违反 contract「不得退化为知识问答」的禁条。",
        1.4, { lintTriggers: ["forbidden-spoonfeed"], blockSave: true }],
    ],
    7: [
      ["student", "压缩讲授，增加证据分析和反馈修正时间", "更符合高阶参与和形成性评价要求。", 3.8],
      ["lecture", "延长教师讲授，保证内容覆盖", "内容覆盖不等于学习发生。", 1.8],
      ["free", "扩大自由讨论，弱化量规约束", "讨论会热闹，但证据质量难保证。", 2.0],
    ],
    8: [
      ["agenda-role-match", "让学习者议程 的学生角色意愿成为本节角色分配的参考",
        "命中议程贯通的第 3 个回响点。若学生表达「想演患者律师」却被随机分配，议程承诺落空。",
        3.9, { recommended: true, lintTriggers: ["L2-agenda-role-mismatch"], v3New: true }],
      ["roles", "为每个角色（资料员/判断员/质询员/汇报员）设置独立证据产出",
        "能避免小组讨论由少数学生包办；但若不联动议程意愿，仍可能错配。",
        3.4],
      ["leader", "指定组长完成主要任务",
        "效率高但协作必要性不足，会让 3/4 学生失去证据产出机会。",
        1.8, { lintTriggers: ["forbidden-leader-only"] }],
      ["random", "随机分组后自由讨论",
        "灵活但过程证据薄弱，议程意愿被完全忽略。",
        2.0, { lintTriggers: ["L2-agenda-role-mismatch"] }],
    ],
    9: [
      ["checkpoint", "在案例探究前设置概念边界即时判断", "能防止学生带着误区进入核心任务。", 3.7],
      ["after", "课后再通过作业判断", "反馈过晚，不能调节课堂。", 1.8],
      ["random", "随机提问几名学生", "有互动，但覆盖面和证据强度不足。", 2.0],
    ],
    10: [
      ["rubric", "按量规逐项对照学生证据评分", "能保证评分解释性和反馈效度。", 3.8],
      ["format", "主要看矩阵格式是否完整", "形式完整不代表思维质量。", 1.9],
      ["impression", "按小组展示印象给分", "主观性过强，证据不足。", 1.6],
    ],
    11: [
      ["asset", "沉淀低分样例、反馈语和改进后的案例材料", "能直接服务下一轮教学优化。", 3.8],
      ["plan", "只保存最终教案", "缺少学生证据和迭代依据。", 2.1],
      ["mood", "只记录课堂气氛是否活跃", "不能形成可验证改进。", 1.6],
    ],
  };

  global.PharmacoPilotDecisionBank = Object.freeze(decisionBank);

  /* ============================================================
   * PharmacoPilotQuestionChain · 苏格拉底式 4 阶题链
   * ------------------------------------------------------------
   * 每个 station 的题链结构：
   *   { chain: [Q1, Q2, Q3, Q4] }
   *
   * 题型（kind）：
   *   · observation —— 读图题（从证据图提取事实）
   *   · diagnosis   —— 诊断题（解释背后原因，错误选项标注 mistakeType + theorySource）
   *   · decision    —— 决策题（沿用 decisionBank 现有 4 选项 + 反向提问）
   *   · transfer    —— 迁移题（开放题，不阻断，写入 transferLog）
   *
   * 4 级 hint：direction → contrast → principle → answer
   *
   * 仅 S1 已填充；S2-S9 待 S1 标杆验证通过后批量填充。
   * 渲染器在 station.questionChain 存在时走新路径，缺失时回落到旧 decisionBank。
   * ============================================================ */
  const questionChainBank = {
    1: {
      transferAxis: "学习者群体",
      chain: [
        // ━━━ Q1 读图题 ━━━
        {
          step: 1, kind: "observation",
          stem: "看「四类定位权重对比」条形图,权重最高的是哪一种定位?",
          options: [
            { key: "comprehensive", label: "综合决策型(82)", correct: true },
            { key: "research",      label: "证据研究型(64)", mistakeType: "misread" },
            { key: "policy",        label: "政策治理型(56)", mistakeType: "misread" },
            { key: "service",       label: "服务运营型(48)", mistakeType: "misread" },
          ],
          hints: [
            { level: 1, kind: "direction", text: "图里每种定位都有一个数值,对比一下,最大的是哪个?" },
            { level: 2, kind: "contrast",  text: "82 和 48 之间差了 34 个点——这种差距说明什么?" },
            { level: 3, kind: "principle", text: "条形图里数值最高的那一项,就是当前所有证据最支持的定位。" },
            { level: 4, kind: "answer",    text: "答案是综合决策型(82)。它贯通「病—证—管」四类决策,与课程主线最匹配。" },
          ],
        },
        // ━━━ Q2 诊断题（错误选项带理论标注） ━━━
        {
          step: 2, kind: "diagnosis",
          stem: "综合决策型为什么会拿到 82 分?根本原因是什么?",
          options: [
            { key: "form",
              label: "因为名字带「综合」二字,听上去最全面",
              mistakeType: "form-judgment",
              theorySource: "Berliner novice 阶段 · 用形式特征做决定" },
            { key: "alignment",
              label: "因为它最贴近课程目标「循证决策能力」(三角图里课程目标权重 0.40 最大)",
              correct: true },
            { key: "object",
              label: "因为案例对象是药企,所以一定要选企业战略导向的定位",
              mistakeType: "single-cue-matching",
              theorySource: "Shulman PCK · 把 subject matter 误当成 PCK" },
            { key: "safe",
              label: "因为综合决策型覆盖面最广,选它最不容易出错",
              mistakeType: "overcoverage",
              theorySource: "Hammerness · 新教师贪多倾向" },
          ],
          hints: [
            { level: 1, kind: "direction", text: "三角图三个端点各自的权重是多少?和定位类型对应一下看看。" },
            { level: 2, kind: "contrast",  text: "如果只是名字带「综合」就拿高分,那为什么没有「综合服务型」「综合管理型」这种选项?" },
            { level: 3, kind: "principle", text: "权重排序的依据是「与课程目标的匹配度」,不是名称、对象或顺序。" },
            { level: 4, kind: "answer",    text: "答案是 B。三角图里课程目标权重 0.40 最高,所以最贴近课程目标的定位拿到最高分。" },
          ],
        },
        // ━━━ Q3 决策题（沿用 decisionBank + 反向提问） ━━━
        {
          step: 3, kind: "decision",
          reuseExistingDecisionBank: true,
          transitionLine: "你已经看清证据指向(Q1),也理解了为什么是这个指向(Q2)。现在你来拍板——",
          postSelectReflection: {
            prompt: "学生学完只会填 SWOT 4 个格子,你这节课算成功了吗?用一句话说明。",
            field: "swotRoleReflection",
            placeholder: "例：不算,因为他们没学会用 SWOT 做判断…",
          },
        },
        // ━━━ Q4 迁移题（开放、不阻断） ━━━
        {
          step: 4, kind: "transfer", openEnded: true, blocksProgress: false,
          transferAxis: "学习者群体",
          stem: "假设下学期你要把这节课教给「社区药师在职培训班」(而不是药学专业研究生),你的定位选择会变吗?为什么?",
          scaffold: [
            "学习者起点:在职药师 vs 研究生,已有经验有何不同?",
            "学生产出形式:报告 vs 实战话术,哪个更合适?",
            "课程目标:是否依然是「循证决策」?还是会偏向「门店实务」?",
          ],
        },
      ],
    },
    // ============================================================
    // S2 · 学情分析与经验起点(stationId 2)
    // 迁移轴:换班型 · 测学情诊断框架本身的可迁移性
    // ============================================================
    2: {
      transferAxis: "换班型",
      chain: [
        // ━━━ Q1 读图题 ━━━
        {
          step: 1, kind: "observation",
          stem: "看「认知前测 4 题分布图」,4 道前测里学生最普遍卡住的是哪一题?",
          options: [
            { key: "q1", label: "Q1 · W 含义(65% 正确)",      mistakeType: "misread" },
            { key: "q2", label: "Q2 · S/W 边界(32% 正确)",    mistakeType: "misread" },
            { key: "q3", label: "Q3 · 内外来源(41% 正确)",    mistakeType: "misread" },
            { key: "q4", label: "Q4 · S 与 T 并存(19% 正确)", correct: true },
          ],
          hints: [
            { level: 1, kind: "direction", text: "条形图越短代表正确率越低,看哪一条最短?" },
            { level: 2, kind: "contrast",  text: "Q1 是 65% 正确,Q4 是 19% 正确——两者之间差了 46 个点,说明什么?" },
            { level: 3, kind: "principle", text: "正确率最低的那一题,就是本班最普遍的认知断层。" },
            { level: 4, kind: "answer",    text: "答案是 Q4。仅 19% 正确率,远低于其他三题。" },
          ],
        },
        // ━━━ Q2 诊断题(错误选项映射真实归因谬误) ━━━
        {
          step: 2, kind: "diagnosis",
          stem: "Q4「S 与 T 并存」只有 19% 正确率,说明本班的核心问题是什么?",
          options: [
            { key: "review",
              label: "学生没认真背概念,需要再讲一遍 SWOT 定义",
              mistakeType: "knowledge-gap-misread",
              theorySource: "Berliner novice 阶段 · 不区分「不知道」和「错误地知道」" },
            { key: "misconception",
              label: "学生存在「S 与 T 互斥」的概念误区,需要做边界训练",
              correct: true },
            { key: "moral",
              label: "学生学习不认真,下节课加强课堂纪律和督促",
              mistakeType: "moral-attribution",
              theorySource: "新教师道德归因 · 把可教的认知问题归到不可教的态度问题" },
            { key: "general",
              label: "全班基础差,整节课难度都要降下来",
              mistakeType: "overgeneralization",
              theorySource: "Hammerness · 单点扩展为全局判断" },
          ],
          hints: [
            { level: 1, kind: "direction", text: "看 Q4 数据右侧的注释——「高频误区」那一行写的是什么?" },
            { level: 2, kind: "contrast",  text: "如果是「没背概念」,那 65% 正确的 Q1 学生为什么背得动?" },
            { level: 3, kind: "principle", text: "学情数据不是评估「学生能不能」,而是诊断「他们错在哪一种具体方式上」。低正确率背后通常有具体的认知误区,不是泛泛的「基础差」或「态度差」。" },
            { level: 4, kind: "answer",    text: "答案是 B。Q4 注释明确写了「38% 学生认为 S 与 T 互斥」——这是一个具体的概念误区,可以通过边界训练直接干预。" },
          ],
        },
        // ━━━ Q3 决策题(沿用 decisionBank + 反向提问) ━━━
        {
          step: 3, kind: "decision",
          reuseExistingDecisionBank: true,
          transitionLine: "你已经看清最严峻的认知断层(Q1),也理解了它背后是一个具体的概念误区而不是泛泛的「基础差」(Q2)。现在你来拍板——",
          postSelectReflection: {
            prompt: "学生交上来的 SWOT 表 4 个格子都填对了,但每条判断都没写证据来源——你愿意把这种作业当成「达标」吗?用一句话说明。",
            field: "evidenceLinkReflection",
            placeholder: "例：不愿意,没有证据的 SWOT 判断只是猜测…",
          },
        },
        // ━━━ Q4 迁移题(迁移轴:换班型) ━━━
        {
          step: 4, kind: "transfer", openEnded: true, blocksProgress: false,
          transferAxis: "换班型",
          stem: "假设你下学期把这节课教给「成人药师在职班」(已经在岗 2-3 年的执业药师),本班最严峻的两个学情信号——Q4 概念误区 + 12% 零经验——会怎么变?你原来排第一的「证据链训练」还排第一吗?",
          scaffold: [
            "认知前测:在职药师对 SWOT 概念的熟悉度会变化在哪?",
            "经验入口:12% 零经验会变成 0%(在职药师都有现场经验)吗?",
            "优先级:原来排第一的「证据链训练」,在职班会被什么挤掉?",
          ],
        },
      ],
    },

    // ============================================================
    // S2 · 学习目标—评价证据(stationId 4) · 迁移轴:换班型
    // ============================================================
    4: {
      transferAxis: "换班型",
      chain: [
        {
          step: 1, kind: "observation",
          stem: "看「目标—活动—产出—评价 对齐矩阵」4 维评分,得分最低、最需补强的是哪一维?",
          options: [
            { key: "behavior",   label: "可观察行为 (58, warn)",        mistakeType: "misread" },
            { key: "evidence",   label: "评价证据完整度 (62, warn)",     mistakeType: "misread" },
            { key: "bloom",      label: "Bloom 层级覆盖 (72, ok)",       mistakeType: "misread" },
            { key: "agenda-echo", label: "对前序环节回应度 (44, miss)",   correct: true },
          ],
          hints: [
            { level: 1, kind: "direction", text: "看 4 维右侧的 status,哪一维是 miss?" },
            { level: 2, kind: "contrast",  text: "72 vs 44,差了 28 个点——这意味着什么?" },
            { level: 3, kind: "principle", text: "最低分维度就是目标设计最薄弱的环节。" },
            { level: 4, kind: "answer",    text: "答案是 D。对前序环节回应度 44%——议程没被显式映射到目标。" },
          ],
        },
        {
          step: 2, kind: "diagnosis",
          stem: "「对前序环节回应度」44 分最低,意味着目标设计的核心问题是什么?",
          options: [
            { key: "agenda-broken",
              label: "学生议程没有被显式映射到学习目标,议程承诺断尾",
              correct: true },
            { key: "more-goals",
              label: "目标数量太少了,要再加几条",
              mistakeType: "overcoverage",
              theorySource: "Hammerness · 贪多倾向" },
            { key: "verb-only",
              label: "目标动词写得不好,要全部改写动词",
              mistakeType: "single-cue",
              theorySource: "Shulman PCK · 把多元问题误归为单一动词问题" },
            { key: "ignore-prior",
              label: "前序环节的数据不准,不必管它",
              mistakeType: "process-blindness",
              theorySource: "新教师过程盲点 · 否定前序输入的价值" },
          ],
          hints: [
            { level: 1, kind: "direction", text: "看 chainTopcard 的 inputsFrom,前序环节有哪些?定位/学情/议程的哪一类没被本节目标显式回应?" },
            { level: 2, kind: "contrast",  text: "如果是「目标少」,加几条就能解决吗?加完仍然不映射议程,问题依旧。" },
            { level: 3, kind: "principle", text: "目标对前序环节的回应度 = 议程贯通的第 2 回响点。议程在 S1 被采集,目标若不映射,议程承诺就断尾了。" },
            { level: 4, kind: "answer",    text: "答案是 A。5 条议程未在学习目标中显式映射(如 ethics-pricing → 「能评价集采降价合理性边界」)——议程在 S2 断尾。" },
          ],
        },
        {
          step: 3, kind: "decision",
          reuseExistingDecisionBank: true,
          transitionLine: "你已经看清目标设计最薄弱的维度(Q1),也理解了它是议程贯通断尾的根因(Q2)。现在你来拍板——",
          postSelectReflection: {
            prompt: "你课前收了 5 条议程,但学习目标里只字未提议程关切——你愿意让议程留在「调查表」里而不进入目标吗?用一句话说明。",
            field: "agendaIntoGoalReflection",
            placeholder: "例:不愿意,议程不进目标等于没收过…",
          },
        },
        {
          step: 4, kind: "transfer", openEnded: true, blocksProgress: false,
          transferAxis: "换班型",
          stem: "假设下学期教成人药师在职班(已是执业药师),5 条议程会变(不会问入门级议程),你的学习目标改写策略还成立吗?Bloom 覆盖会怎么调?",
          scaffold: [
            "议程内容:在职班可能换成什么张力?(医保实操 / 创新药临床应用 / 等)",
            "目标动词:在职班的「能 + 动词」是不是要直接从「评价/创造」开始,跳过「理解」?",
            "Bloom 覆盖:理解层是否可以压到 0%,重心移到「评价/创造」?",
          ],
        },
      ],
    },

    // ============================================================
    // S3 · 知识结构与误区(stationId 5) · 迁移轴:换先备知识
    // ============================================================
    5: {
      transferAxis: "换先备知识",
      chain: [
        {
          step: 1, kind: "observation",
          stem: "看「方法论严谨链 6 层 + 关键误区清单」,学生卡点频率最高的是哪一类误区?",
          options: [
            { key: "lvl2-policy", label: "政策威胁被塞进 W 维(38%)", mistakeType: "misread" },
            { key: "lvl3-adj",    label: "条目用形容词无数据(62%)", mistakeType: "misread" },
            { key: "lvl5-notows", label: "做完 SWOT 不做 TOWS(62%)", mistakeType: "misread" },
            { key: "lvl6-nocrit", label: "完全不批判 SWOT 工具局限(78%)", correct: true },
          ],
          hints: [
            { level: 1, kind: "direction", text: "看 5 类误区右侧的 frequency 数字,哪个最高?" },
            { level: 2, kind: "contrast",  text: "78% 远高于 62%——「批判」比「TOWS」更普遍,意味着什么?" },
            { level: 3, kind: "principle", text: "卡点最普遍的层级就是教学盲区——绝大多数学生在那里被忽略过。" },
            { level: 4, kind: "answer",    text: "答案是 D。78% 学生不批判 SWOT 工具局限——这是 SWOT 教学最普遍的盲区。" },
          ],
        },
        {
          step: 2, kind: "diagnosis",
          stem: "78% 学生不批判 SWOT 工具局限,根本原因是什么?",
          options: [
            { key: "not-taught",
              label: "学生没学过批判思维,这节课先教批判技巧再说",
              mistakeType: "knowledge-gap-misread",
              theorySource: "Berliner novice · 把教学盲区误判为能力缺失" },
            { key: "hidden-core",
              label: "工具批判是 SWOT 教学的隐性内核,学生没被引导过去思考",
              correct: true },
            { key: "no-time",
              label: "学生时间不够,做完 SWOT 已经没空批判了",
              mistakeType: "single-cue",
              theorySource: "Shulman PCK · 把教学设计问题误归到学生时间" },
            { key: "too-high",
              label: "工具批判是研究生水平,本科生不必要",
              mistakeType: "overgeneralization",
              theorySource: "Hammerness · 用学生层次为教学盲区开脱" },
          ],
          hints: [
            { level: 1, kind: "direction", text: "看 6 层难度阶梯——lvl-1 事实卡点仅 5%。基础能力是有的吗?" },
            { level: 2, kind: "contrast",  text: "如果是「学生没学过批判」,为什么 lvl-1 / lvl-2 都做得不错?基础认知是没问题的。" },
            { level: 3, kind: "principle", text: "工具批判是 SWOT 教学的「压舱石」——区分本科和中专培训的关键就在这一层是否做。" },
            { level: 4, kind: "answer",    text: "答案是 B。工具批判是 SWOT 教学的隐性内核,但 78% 学生从未被显式引导去思考工具的边界。这是教学盲区,不是学生能力问题。" },
          ],
        },
        {
          step: 3, kind: "decision",
          reuseExistingDecisionBank: true,
          transitionLine: "你已经看清最普遍的卡点(Q1),也理解了它背后是教学盲区而不是学生能力(Q2)。现在你来拍板——",
          postSelectReflection: {
            prompt: "学生把 SWOT 四象限填得很满,但被问「SWOT 工具有什么局限」时哑口——你愿意把这种产出当成「达标」吗?用一句话说明。",
            field: "criticalAwarenessReflection",
            placeholder: "例:不愿意,工具批判是 SWOT 教学的灵魂…",
          },
        },
        {
          step: 4, kind: "transfer", openEnded: true, blocksProgress: false,
          transferAxis: "换先备知识",
          stem: "假设下学期教给已经学过 PESTLE / 五力模型的班级(已具备战略工具批判经验),本节的 lvl-6「批判」卡点会变吗?6 层问题链的顺序还合理吗?",
          scaffold: [
            "先备工具批判能力:有基础 vs 无基础,引导路径要变吗?",
            "第 6 层「批判」位置:仍放最后,还是提前到第 3 层做工具对照?",
            "学生能力:能否直接对比 SWOT 与 PESTLE 的局限,而非从零学批判?",
          ],
        },
      ],
    },

    // ============================================================
    // S4 · 案例与证据(stationId 6) · 迁移轴:医疗体系/地域
    // ============================================================
    6: {
      transferAxis: "换医疗体系/地域",
      chain: [
        {
          step: 1, kind: "observation",
          stem: "看「华海药业案例证据密度图」6 个维度,最缺证据的两个维度是哪一对?",
          options: [
            { key: "s-o",       label: "S 维 (80%) + O 维 (76%)", mistakeType: "misread" },
            { key: "w-t",       label: "W 维 (42%) + T 维 (70%)", mistakeType: "misread" },
            { key: "role-risk", label: "角色立场 (38%) + 风险边界 (34%)", correct: true },
            { key: "enough",    label: "全都够 70%+,案例没问题",  mistakeType: "misread" },
          ],
          hints: [
            { level: 1, kind: "direction", text: "条形图越短代表证据越缺,最短的两条是哪两个?" },
            { level: 2, kind: "contrast",  text: "S 维 80% vs 风险边界 34%,差了 46 个点——这是什么类型差异?" },
            { level: 3, kind: "principle", text: "经典 SWOT 4 维(S/W/O/T)是已有的;真正缺的是利益相关者立场和监管边界——这是药事现场的复杂性所在。" },
            { level: 4, kind: "answer",    text: "答案是 C。角色立场 38% + 风险边界 34% 是最低两项,反映本案例只有「企业视角」证据。" },
          ],
        },
        {
          step: 2, kind: "diagnosis",
          stem: "角色立场 + 风险边界证据最缺,意味着案例最严重的问题是什么?",
          options: [
            { key: "missing-stake",
              label: "案例需要补「患者/医保局立场材料」和「企业违规边界材料」,学生才能做多元判断",
              correct: true },
            { key: "case-old",
              label: "案例太老了(2018 缬沙坦事件),换新企业就好",
              mistakeType: "single-cue",
              theorySource: "Shulman PCK · 误判为「时间问题」而非「视角缺失」" },
            { key: "students-fix",
              label: "学生不会自己脑补立场,这节课先教共情技巧",
              mistakeType: "knowledge-gap-misread",
              theorySource: "Berliner novice · 把材料缺失误判为学生能力缺失" },
            { key: "stick-swot",
              label: "缺这两类就缺吧,SWOT 主要看 S/W/O/T 四象限",
              mistakeType: "overcoverage-shrink",
              theorySource: "Hammerness · 用工具框架为案例缺陷开脱" },
          ],
          hints: [
            { level: 1, kind: "direction", text: "「角色立场」「风险边界」对学生做 SWOT 判断起什么作用?能否凭空脑补?" },
            { level: 2, kind: "contrast",  text: "如果学生只有「企业视角」材料,SWOT 4 象限会变成什么?——会全是企业自评。" },
            { level: 3, kind: "principle", text: "药事决策本质是多方利益博弈;只有企业视角的案例只能训练「自评」,无法训练「多元判断」。" },
            { level: 4, kind: "answer",    text: "答案是 A。学生没有患者/医保局立场材料就只能做「企业视角」SWOT,失去多元利益相关者的判断训练。" },
          ],
        },
        {
          step: 3, kind: "decision",
          reuseExistingDecisionBank: true,
          transitionLine: "你已经看清证据缺口(Q1),也理解了缺这两类材料学生只能做单一视角判断(Q2)。现在你来拍板——",
          postSelectReflection: {
            prompt: "学生交上来的 SWOT 全是企业视角(管理者立场),没有患者/医保局/竞争者的角度——你愿意把这种作业当成「达标」吗?用一句话说明。",
            field: "stakeholderViewReflection",
            placeholder: "例:不愿意,药事决策本质是多方利益博弈…",
          },
        },
        {
          step: 4, kind: "transfer", openEnded: true, blocksProgress: false,
          transferAxis: "换医疗体系/地域",
          stem: "假设案例换成「县域药店供应链」(不是华海这种大药企),证据密度图的优先级会怎么变?哪些维度的「补证据」优先级会调换?",
          scaffold: [
            "现场可获得证据:县域药店有公开年报吗?替代证据从哪里来?",
            "角色立场:县域药店的患者/医保局视角和省级三甲药事的视角有何不同?",
            "风险边界:不同医疗体系下,合规风险的具体类型会变吗?",
          ],
        },
      ],
    },

    // ============================================================
    // S5 · 任务链 · 时间线(stationId 7) · 迁移轴:班级规模
    // ============================================================
    7: {
      transferAxis: "换班级规模",
      chain: [
        {
          step: 1, kind: "observation",
          stem: "看「45 分钟课堂时间分配」4 段比例,占比最高的是哪一段?",
          options: [
            { key: "lecture",  label: "讲授 27%",        mistakeType: "misread" },
            { key: "analyze",  label: "分析 31%",        correct: true },
            { key: "collab",   label: "协作 29%",        mistakeType: "misread" },
            { key: "feedback", label: "反馈 13%",        mistakeType: "misread" },
          ],
          hints: [
            { level: 1, kind: "direction", text: "看 4 个百分比哪个最大?" },
            { level: 2, kind: "contrast",  text: "讲授 27% 与协作 29% 接近,但分析 31% 是 4 段中最高。" },
            { level: 3, kind: "principle", text: "占比最高的段就是教师投入认知设计最多的环节——本节课重心在哪里。" },
            { level: 4, kind: "answer",    text: "答案是 B。分析 31% 占比最高,反映本节课的重心是案例精读 + 法条分析。" },
          ],
        },
        {
          step: 2, kind: "diagnosis",
          stem: "分析占 31%(案例精读 + 法条分析)是占比最高的段,这意味着什么?",
          options: [
            { key: "cut-more",
              label: "教师讲授太多了,要继续压缩",
              mistakeType: "label-misread",
              theorySource: "Berliner novice · 没看清「分析」≠「讲授」" },
            { key: "high-order-core",
              label: "案例分析是 SWOT 课的高阶训练核心,31% 是合理预算",
              correct: true },
            { key: "force-collab",
              label: "应该把分析也压到 25%,让协作占 35%+ 才算「以学生为中心」",
              mistakeType: "overgeneralization",
              theorySource: "Hammerness · 学生中心 ≠ 协作占比" },
            { key: "equal-split",
              label: "45 分钟课所有段都该 25% 均分才公平",
              mistakeType: "mechanical-equalize",
              theorySource: "新教师形式归因 · 比例均分 ≠ 教学合理" },
          ],
          hints: [
            { level: 1, kind: "direction", text: "看 4 段标签,「分析」和「讲授」是同一回事吗?谁是教师主导,谁是学生主导?" },
            { level: 2, kind: "contrast",  text: "如果分析压到 25%,协作扩到 35%,反馈仍 12%——学生分析没做透就跳协作,会怎样?" },
            { level: 3, kind: "principle", text: "4 段比例的本质是「学生认知参与曲线」:讲授(Passive)→分析(Active)→协作(Constructive)→反馈(Interactive)。不是「谁高谁好」。" },
            { level: 4, kind: "answer",    text: "答案是 B。案例分析(32%)是 SWOT 课的高阶训练核心——学生需要时间精读法条、对比数据、形成判断。32% 是合理预算。" },
          ],
        },
        {
          step: 3, kind: "decision",
          reuseExistingDecisionBank: true,
          transitionLine: "你已经看清各段占比(Q1),也理解了分析 31% 是高阶训练的合理预算(Q2)。现在你来拍板——",
          postSelectReflection: {
            prompt: "你这堂 45 分钟课,如果学生在 12-25 分钟微实战段做不完 SWOT+TOWS(只做了 SWOT),你愿意把这堂课当成「按计划完成」吗?用一句话说明。",
            field: "towsCompletionReflection",
            placeholder: "例:不愿意,TOWS 是 SWOT 的终点,缺它整节课失重…",
          },
        },
        {
          step: 4, kind: "transfer", openEnded: true, blocksProgress: false,
          transferAxis: "换班级规模",
          stem: "假设班级从 40 人减到 15 人,4 段比例(讲授/分析/协作/反馈)该怎么调?协作段的 30 分钟实战还合适吗?",
          scaffold: [
            "协作单位:15 人能否拆 3-4 组(每组 3-5 人),还是 1 大组 + 2 小组?",
            "巡视密度:15 人比 40 人教师更容易追问到每个学生,反馈段是否可以缩到 8%?",
            "实战时长:小班需要更长(因为追问更深入)还是更短(因为讨论更聚焦)实战时间?",
          ],
        },
      ],
    },

    // ============================================================
    // S5 子节点 · 探究协作(stationId 8) · 迁移轴:协作单元规模
    // ============================================================
    8: {
      transferAxis: "换协作单元",
      chain: [
        {
          step: 1, kind: "observation",
          stem: "看「4 角色任务密度条形图」,任务密度最低、最易塌缩的是哪个角色?",
          options: [
            { key: "info",     label: "资料员 (72)",  mistakeType: "misread" },
            { key: "judge",    label: "判断员 (66)",  mistakeType: "misread" },
            { key: "question", label: "质询员 (48)",  correct: true },
            { key: "report",   label: "汇报员 (58)",  mistakeType: "misread" },
          ],
          hints: [
            { level: 1, kind: "direction", text: "看 4 个角色的密度数字,哪个最小?" },
            { level: 2, kind: "contrast",  text: "资料员 72 vs 质询员 48,差了 24 个点——这种差距说明什么?" },
            { level: 3, kind: "principle", text: "密度最低的角色是协作中「最易塌缩」的——任务设计不够具体,学生不知道做什么。" },
            { level: 4, kind: "answer",    text: "答案是 C。质询员 48 分最低,被标 warn——任务最易塌缩,需要补脚本。" },
          ],
        },
        {
          step: 2, kind: "diagnosis",
          stem: "质询员任务最易塌缩(48 分),根本原因是什么?",
          options: [
            { key: "personality",
              label: "学生性格内向不敢质询,换性格外向的同学分这个角色",
              mistakeType: "trait-attribution",
              theorySource: "新教师性格归因 · 把任务设计缺陷误归到学生性格" },
            { key: "no-script",
              label: "质询「追问证据强度」是抽象动作,缺具体追问脚本学生不知道怎么质询",
              correct: true },
            { key: "drop-role",
              label: "质询员可以省掉,4 角色改成 3 角色",
              mistakeType: "overcoverage-shrink",
              theorySource: "Hammerness · 用减角色为设计缺陷开脱" },
            { key: "students-shy",
              label: "学生不会就是不会,等他们成熟了就好",
              mistakeType: "moral-attribution",
              theorySource: "新教师道德归因 · 把可教问题归到不可教属性" },
          ],
          hints: [
            { level: 1, kind: "direction", text: "看资料员的任务描述「财报+集采数据提取」——具体动作明确;质询员「证据强度追问」——动作明确吗?" },
            { level: 2, kind: "contrast",  text: "如果是「学生性格」,为什么资料员/判断员/汇报员都不塌缩?这 3 类性格特征也不一样。" },
            { level: 3, kind: "principle", text: "协作塌缩 ≠ 学生不愿意 = 任务设计不够具体。教师需要给抽象动作配脚本(如「请指出对方证据中最弱的一条」)。" },
            { level: 4, kind: "answer",    text: "答案是 B。质询是抽象动作,缺具体脚本学生无所适从。补 5-10 句追问模板就能让密度回到 65+。" },
          ],
        },
        {
          step: 3, kind: "decision",
          reuseExistingDecisionBank: true,
          transitionLine: "你已经看清质询员是任务塌缩点(Q1),也理解了塌缩源于任务设计抽象而非学生性格(Q2)。现在你来拍板——",
          postSelectReflection: {
            prompt: "你设计的协作任务,如果质询员小组每次都靠组长包办——你愿意把这种「协作」当成「真协作」吗?用一句话说明。",
            field: "trueCollaborationReflection",
            placeholder: "例:不愿意,4 个学生都该有自己的证据产出…",
          },
        },
        {
          step: 4, kind: "transfer", openEnded: true, blocksProgress: false,
          transferAxis: "换协作单元",
          stem: "假设把 4 角色协作改为 2 人小组协作(只剩判断员 + 质询员),你设计的议程—角色映射还成立吗?哪些角色被并掉了?承担它们任务的人会怎么样?",
          scaffold: [
            "角色合并:资料员功能并入哪个角色?汇报员呢?",
            "议程映射:原本 5 议程映射到 4 角色,2 人组要怎么映射?会不会过载?",
            "证据产出:每人产出量翻倍,会不会反而降低质量?",
          ],
        },
      ],
    },

    // ============================================================
    // S6 · 课中调控(stationId 9) · 迁移轴:换触发类型
    // ============================================================
    9: {
      transferAxis: "换触发类型",
      chain: [
        {
          step: 1, kind: "observation",
          stem: "看「3 个学情校准点(Z1/Z2/Z3)规则状态」,目前几个锚点已经写了「如果 X 则 Y」规则?",
          options: [
            { key: "zero",   label: "0 个(全部 miss 状态)",     correct: true },
            { key: "one",    label: "1 个",                       mistakeType: "misread" },
            { key: "two",    label: "2 个",                       mistakeType: "misread" },
            { key: "three",  label: "3 个(全部已配规则)",        mistakeType: "misread" },
          ],
          hints: [
            { level: 1, kind: "direction", text: "看 3 行状态,有几个是「miss」(尚未编辑规则)?" },
            { level: 2, kind: "contrast",  text: "如果有锚点已配规则,会标 ok 状态——但 3 行全是 miss。" },
            { level: 3, kind: "principle", text: "状态 miss 表示「锚点位置已定但规则未配」——这正是 S6 节点要做的事。" },
            { level: 4, kind: "answer",    text: "答案是 A。Z1/Z2/Z3 三个锚点目前都是 miss 状态——尚未编辑「如果 X 则 Y」规则。" },
          ],
        },
        {
          step: 2, kind: "diagnosis",
          stem: "3 个锚点全部未编辑规则,意味着什么?",
          options: [
            { key: "improvise",
              label: "规则可以课中临场判断,不必事先写",
              mistakeType: "no-prep-fallacy",
              theorySource: "新教师即兴主义 · 高估课堂临场认知容量" },
            { key: "anchor-without-rule",
              label: "锚点没有规则等于没有锚点——本节点不允许通过",
              correct: true },
            { key: "self-resolving",
              label: "课中调控不重要,反正学生做完会暴露问题",
              mistakeType: "process-blindness",
              theorySource: "新教师过程盲点 · 假设学生会自我暴露 ZPD" },
            { key: "experience",
              label: "这是新教师才需要,有经验老师靠直觉就行",
              mistakeType: "experience-myth",
              theorySource: "Hammerness · 经验主义对外置认知工具的误解" },
          ],
          hints: [
            { level: 1, kind: "direction", text: "课堂中你做完微评估,要在 1 分钟内决定「继续/暂停/重启」——这 1 分钟的认知容量够做新决策吗?" },
            { level: 2, kind: "contrast",  text: "如果可以「课堂临场」,为什么 contract 要规定硬约束「每个锚点必须有规则」?" },
            { level: 3, kind: "principle", text: "课堂 1 分钟决策远低于「凭感觉判断」需要的认知容量。规则是「教师外置认知」,不是约束,是节省思考。" },
            { level: 4, kind: "answer",    text: "答案是 B。锚点没有规则等于没有锚点。L1 形成性评价硬约束:每锚点必须配「如果 X 则 Y」,否则课堂学情捕捉会退化为「凭感觉」。" },
          ],
        },
        {
          step: 3, kind: "decision",
          reuseExistingDecisionBank: true,
          transitionLine: "你已经看清 3 锚点规则全空(Q1),也理解了规则是教师外置认知不是约束(Q2)。现在你来拍板——",
          postSelectReflection: {
            prompt: "课堂上你的 ZPD 锚点收到学情数据,你愿意「凭感觉」决定继续/暂停/重启吗?还是希望事先写好规则?用一句话说明。",
            field: "ruleVsIntuitionReflection",
            placeholder: "例:希望事先写好,1 分钟决策容量太小不能凭感觉…",
          },
        },
        {
          step: 4, kind: "transfer", openEnded: true, blocksProgress: false,
          transferAxis: "换触发类型",
          stem: "假设你设计的「如果 X 则 Y」规则,X 从「认知正确率」换成「学生情绪冷场」(非认知信号),Y 还成立吗?你怎么改写规则?",
          scaffold: [
            "触发条件 X:认知误区可以量化(正确率),情绪/参与度怎么量化?",
            "反馈动作 Y:认知卡点对应「再讲一遍」,情绪冷场对应什么动作?",
            "阈值:认知触发用百分比,情绪触发用什么阈值?(沉默时长?举手率?)",
          ],
        },
      ],
    },

    // ============================================================
    // S7 · 评价与画像(stationId 10) · 迁移轴:换学生分布
    // ============================================================
    10: {
      transferAxis: "换学生分布",
      chain: [
        {
          step: 1, kind: "observation",
          stem: "看「5 维量规雷达 + Pareto 低分」,5 维中平均分最低的是哪一维?",
          options: [
            { key: "classify",  label: "内外分类准确性 (78)",  mistakeType: "misread" },
            { key: "concise",   label: "条目精炼度 (62)",      mistakeType: "misread" },
            { key: "evidence",  label: "条目证据性 (46)",      mistakeType: "misread" },
            { key: "critical",  label: "批判意识 (38)",        correct: true },
          ],
          hints: [
            { level: 1, kind: "direction", text: "看 5 个分数哪个最小?" },
            { level: 2, kind: "contrast",  text: "「批判意识」38 分 vs 「内外分类」78 分——差了 40 个点。" },
            { level: 3, kind: "principle", text: "最低分维度就是 SWOT 课最大的失分区。" },
            { level: 4, kind: "answer",    text: "答案是 D。批判意识 38 分最低——无组主动指出 SWOT 工具局限。" },
          ],
        },
        {
          step: 2, kind: "diagnosis",
          stem: "批判意识 38 分最低,但下一轮评价该重点抓什么?",
          options: [
            { key: "pick-lowest",
              label: "抓批判意识(38)——既然最低分,就该重点改进",
              mistakeType: "naive-pareto",
              theorySource: "Pareto 误用 · 单看分数不看可教性 + 投入" },
            { key: "drop-difficulty",
              label: "学生不会批判,下次降低难度让分数提上来",
              mistakeType: "overgeneralization",
              theorySource: "Hammerness · 用降难度为评价退化开脱" },
            { key: "evidence-first",
              label: "抓条目证据性(46)——虽不是最低,但最可教、1 节课内能提到 70+",
              correct: true },
            { key: "format-only",
              label: "看格式是否完整就行,不必逐维评分",
              mistakeType: "format-only",
              theorySource: "新教师评价退化 · 评价从「质量」退化到「格式」" },
          ],
          hints: [
            { level: 1, kind: "direction", text: "看 5 维右侧的 source 描述——「批判意识」需要多久能提升?「条目证据性」呢?" },
            { level: 2, kind: "contrast",  text: "最低分一定是优先项吗?如果「批判意识」要 4-5 节课、「证据性」要 1 节课——你选哪个?" },
            { level: 3, kind: "principle", text: "Pareto 优先级 = 影响 ÷ 投入,不只看分数。低分但难教的维度先放,低分且可教的优先抓。" },
            { level: 4, kind: "answer",    text: "答案是 C。条目证据性 46 分,Pareto 第 3,但基础维度——加「每条 SWOT 配 1 条出处」训练,1 节课内能提 30 分。" },
          ],
        },
        {
          step: 3, kind: "decision",
          reuseExistingDecisionBank: true,
          transitionLine: "你已经看清最低分维度(Q1),也理解了 Pareto 优先级不是简单按分数排(Q2)。现在你来拍板——",
          postSelectReflection: {
            prompt: "学生作品 5 维全部「形式上完成」(都打了 60 分以上),但低分维度集中在「批判意识」和「证据性」——你愿意把这种作业当成「达标」吗?用一句话说明。",
            field: "rubricSubstanceReflection",
            placeholder: "例:不愿意,基础维度不过关,高阶维度无意义…",
          },
        },
        {
          step: 4, kind: "transfer", openEnded: true, blocksProgress: false,
          transferAxis: "换学生分布",
          stem: "假设这次评的不是混合班,而是高分组(基础已掌握)——5 维 Pareto 排序会变吗?反馈语模板需要重写吗?",
          scaffold: [
            "高分组的基础维度:条目证据性可能不是低分,直接跳过吗?",
            "高阶维度:对高分组,TOWS 可操作性 + 批判意识反而是低分?",
            "反馈语:针对高分组,「指明下一步」会变成什么(更深批判 + 更复杂场景)?",
          ],
        },
      ],
    },

    // ============================================================
    // S8 / S9 · 复盘与资产沉淀(stationId 11) · 迁移轴:换下轮约束
    // ============================================================
    11: {
      transferAxis: "换下轮约束",
      chain: [
        {
          step: 1, kind: "observation",
          stem: "看「资产沉淀价值图」4 类资产,哪一类被标为「不可复用 / miss 状态」?",
          options: [
            { key: "sample",      label: "低分样例 (76 · ok)",         mistakeType: "misread" },
            { key: "feedback",    label: "反馈语 (68 · ok)",            mistakeType: "misread" },
            { key: "case-revise", label: "修订案例 (82 · ok)",          mistakeType: "misread" },
            { key: "mood",        label: "课堂气氛 (28 · miss)",         correct: true },
          ],
          hints: [
            { level: 1, kind: "direction", text: "看 4 类资产右侧的 status 标记,哪个是「miss」?" },
            { level: 2, kind: "contrast",  text: "「修订案例」82 vs 「课堂气氛」28——差了 54 个点。它们的本质区别是什么?" },
            { level: 3, kind: "principle", text: "可复用性 = 下一轮课能否直接调用。「样例/反馈语/案例」可复用,「气氛」是过程结果,不可复用。" },
            { level: 4, kind: "answer",    text: "答案是 D。课堂气氛 28 分被标 miss——它是结果不是工具,不能被下一轮课直接调用。" },
          ],
        },
        {
          step: 2, kind: "diagnosis",
          stem: "课堂气氛 28 分「不可复用」,这意味着复盘时该重点保存什么?",
          options: [
            { key: "subjective",
              label: "气氛活跃就够了,可以记下来作为「这次教得不错」的依据",
              mistakeType: "process-blindness",
              theorySource: "新教师过程盲点 · 把结果误判为可复用资产" },
            { key: "reusable",
              label: "保留可被下一轮直接调用的具体资产(样例/反馈语/案例)",
              correct: true },
            { key: "keep-all",
              label: "全部保留,资产越多越好",
              mistakeType: "overcoverage",
              theorySource: "Hammerness · 贪多倾向" },
            { key: "drop-samples",
              label: "学生 SWOT 错例不重要,下次学生不同就用不上",
              mistakeType: "overgeneralization",
              theorySource: "新教师 · 错例的迁移性被低估" },
          ],
          hints: [
            { level: 1, kind: "direction", text: "看 ok 状态的 3 类资产——它们有什么共同点?都能被下一轮课直接拿来用吗?" },
            { level: 2, kind: "contrast",  text: "「样例」可以拿来给下届学生看,「气氛」呢?你能给下届「气氛」吗?" },
            { level: 3, kind: "principle", text: "教学资产 = 可被下一轮重复调用的具体材料/规则/反馈/案例。「气氛」是结果不是工具。" },
            { level: 4, kind: "answer",    text: "答案是 B。资产的判断标准是「可复用性」。气氛 miss 状态浪费精力保存——保留可被下一轮调用的样例/反馈/案例。" },
          ],
        },
        {
          step: 3, kind: "decision",
          reuseExistingDecisionBank: true,
          transitionLine: "你已经看清哪类资产不可复用(Q1),也理解了资产的核心标准是可复用性(Q2)。现在你来拍板——",
          postSelectReflection: {
            prompt: "你这次教完只记下「学生反应好/不好」(气氛印象),没保留任何具体错例、反馈语、案例修订——你愿意把这种复盘当成「完成」吗?用一句话说明。",
            field: "assetReusabilityReflection",
            placeholder: "例:不愿意,这种复盘下次还是要从头来…",
          },
        },
        {
          step: 4, kind: "transfer", openEnded: true, blocksProgress: false,
          transferAxis: "换下轮约束",
          stem: "假设下学期教学时长砍 30%(90 → 60 分钟),你这次写的「下一轮第 1 改进项」还排第一吗?哪条会被挤掉?",
          scaffold: [
            "时长压缩:90→60,讲授/分析/协作/反馈的比例怎么调?",
            "改进项优先级:你列的 3 条改进,哪条最依赖时间预算?",
            "牺牲项:哪条改进必须放弃?为什么?",
          ],
        },
      ],
    },
  };

  global.PharmacoPilotQuestionChain = Object.freeze(questionChainBank);
})(window);
