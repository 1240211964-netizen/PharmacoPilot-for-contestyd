/*
 * PharmacoPilot Teaching Navigation Contract v4.0 (stages overlay)
 *
 * v4 changes vs v3:
 *   1. NEW: NAV_STAGES — 9 frontend macro-stages (S1–S9)
 *   2. NEW: SUB_NODES — backend sub-nodes（含拆分/合并/回写）；不再与 station ids 一一对应
 *   3. NEW: STAGE_CHAIN — stage-level L3 product chain
 *   4. NEW: STAGE_HORIZONTAL_LAYERS — L1/L2/L3 re-mapped to stage IDs
 *   5. REMOVED: MVL_PATH — MVL 路径概念已下线（与差异化创新冲突）
 *   6. UPDATED: COPY_RULES — banner & forbidden phrases reflect 9-stages narrative
 *   7. NEW: RUBRIC_REVISION — S7 → S2 反向修订 通道
 *
 * ============================================================
 * v4.1 设计审计：子节点拆分模型（why & how）
 * ============================================================
 *
 * 9 个教学环节是顶层语言，工作台内部分子节点。每个子节点 = 一个独立判断 + 一份产物。
 * 同一个 legacy station 可以被多个子节点引用（pass 区分），用 splitOf 字段标识。
 *
 * 拆分原则总结：
 *
 *   1) 鸡和蛋型（迭代回写）—— S1 / S5
 *      问题：A 与 B 互为前提，无法一次定稿。
 *      解法：A 出 v0 草案 → B 完整设计 → A 用 B 的结果回写 v1 锁定版。
 *      字段：subNodeIds 末位是 "<stid>b" + revisionPass="v1" + revisionSource/Action/subjectName
 *      实例：
 *        - S1 = [1, "2-3", "1b"]：定位 v0 → 学情+议程合并诊断 → 定位 v1 回写
 *        - S5 = [7, 8, "7b"]：时间线 v0 → 协作任务设计 → 时间线 v1 回写
 *
 *   2) 横向并联型（多锚点 / 多 pass）—— S6
 *      问题：同一抽象层级的多个并列动作被压成一个判断（违反 L1 硬约束）。
 *      解法：每个并列动作各占一个子节点，独立编辑、独立持久化。
 *      字段：subNodeIds 用 "<stid>-<id>" 命名 + anchorId（或类似标识）字段
 *      实例：
 *        - S6 = ["9-z1", "9-z2", "9-z3"]：3 个 ZPD 锚点各一份学情触发规则
 *
 *   3) UbD / 动作粒度型（不同抽象层级分段）—— S2 / S7
 *      问题：把不同抽象层级的动作（数据 / 教学 / 元）压成一个判断，学不到框架。
 *      解法：按抽象层级 / UbD 阶段拆段，各段输出独立产物。
 *      字段：subNodeIds 用 "<stid>-<letter>" 命名 + focus 字段（区分 banner 类型）
 *      实例：
 *        - S2 = ["4-a", "4-b"]：Stage 1 学习目标 → Stage 2 评价证据 + 量规
 *        - S7 = ["10-a", "10-b", "10-c"]：评分采集 → 反馈与画像 → 量规反向修订
 *
 *   4) 单子节点合理 —— S3 / S4 / S8 / S9
 *      内容耦合度高（问题链与误区紧耦合 / 案例与议程证据一体 / 11 拆分已足）。
 *      保留 subNodeIds 单元素，UI 不显示「节点 N/M」徽章。
 *
 * 渲染层（shared/nav-render.js）对应钩子：
 *   - renderSubPassBanner 根据 sub 的字段（revisionPass / focus / anchorId / mergedWith）分支
 *   - productFilename 按子节点 key 区分产物文件名（如 positioning.v0.md vs positioning.v1.locked.md）
 *   - effectiveSubKey() 在未显式点击时回退到首个 legacyStationId 匹配的子节点
 *
 * Backward compatibility:
 *   - NAV_STATIONS / HORIZONTAL_LAYERS / PRODUCT_CHAIN preserved as-is.
 *   - station<N>.payload.js modules still register under station IDs (1–11); UI maps them to stages
 *     via SUB_NODES[stationId].stageId.
 *   - 旧 SUB_NODES 单数字键（"1"/"4"/"7"/"9"/"10"）保留并标 legacy: true，避免外部代码炸。
 */
(function attachPharmacoPilotNavigationContract(global) {
  const VERSION = "stages-v4";

  const NAVIGATION_PHASES = [
    {
      id: "pre",
      title: "课前设计与准备",
      subtitle: "把课程、学生、议程、目标、内容与材料准备清楚。",
      stationIds: [1, 2, 3, 4, 5, 6],
      outputPackage: "教学设计包",
      colorToken: "accent",
    },
    {
      id: "in",
      title: "课中实施与调控",
      subtitle: "把课堂活动、学生探究、形成性评价机制与即时反馈设计清楚。",
      stationIds: [7, 8, 9],
      outputPackage: "课堂实施包",
      colorToken: "sage",
    },
    {
      id: "post",
      title: "课后评价与改进",
      subtitle: "把学生作品、评价反馈、议程兑现度与教学资产沉淀清楚。",
      stationIds: [10, 11],
      outputPackage: "评价迭代包",
      colorToken: "blue",
    },
  ];

  const PHARMACY_SCENARIOS = [
    {
      id: "pharmacy-service",
      title: "药事服务管理",
      subtitle: "慢病服务、药师角色、患者需求、服务质量。",
      evidenceBoundary: "服务流程、患者需求、药师能力、患者安全与质量管理边界。",
    },
    {
      id: "insurance-access",
      title: "医保支付与可及性",
      subtitle: "政策目标、支付边界、患者负担、资源配置。",
      evidenceBoundary: "医保政策、支付约束、药物经济性、患者负担与利益相关者立场。",
    },
    {
      id: "regulatory-compliance",
      title: "监管合规风险",
      subtitle: "处方审核、药师在岗、宣传边界、质量安全。",
      evidenceBoundary: "监管要求、处方流程、人员资质、宣传合规与患者安全风险。",
    },
    {
      id: "drug-operation",
      title: "药品经营与组织管理",
      subtitle: "库存、供应链、门店绩效、服务能力。",
      evidenceBoundary: "品类结构、供应链稳定性、门店资源、药师服务能力与竞争环境。",
    },
  ];

  const QUALITY_DIMENSIONS = [
    { id: "alignment", label: "目标—活动—评价一致性", shortLabel: "一致性", theory: "Backward Design / Constructive Alignment", diagnosticQuestion: "目标、活动、学生产出和评价证据是否指向同一类能力？" },
    { id: "authenticity", label: "药事管理情境真实性", shortLabel: "真实性", theory: "Authentic Learning", diagnosticQuestion: "案例是否嵌入真实或高仿真的药事管理问题？" },
    { id: "learner", label: "学情诊断与差异支持", shortLabel: "学情", theory: "UDL / Danielson Framework", diagnosticQuestion: "教学设计是否回应学生先备知识、常见误区和学习差异？" },
    { id: "cognition", label: "认知参与与高阶思维", shortLabel: "高阶", theory: "Bloom / ICAP", diagnosticQuestion: "课堂任务是否推动学生从理解走向应用、分析、评价和互动建构？" },
    { id: "assessment", label: "评价证据与反馈效度", shortLabel: "评价", theory: "Formative Assessment / Rubric", diagnosticQuestion: "评价和反馈能否解释学习目标达成并指导改进？" },
    { id: "improvement", label: "数据复盘与资产沉淀", shortLabel: "复盘", theory: "Learning Analytics / Reflective Practice", diagnosticQuestion: "是否能基于学生证据、低分维度和反馈语持续改进？" },
    // v3 NEW dimensions
    { id: "experience", label: "学生前经验与连续性", shortLabel: "经验", theory: "Dewey / Experiential Continuity", diagnosticQuestion: "教学设计是否把学生的真实经验（实习、家人慢病、社区药店等）作为学习起点？" },
    { id: "agency", label: "学习者议程与主体性", shortLabel: "议程", theory: "Freire / Knowles / Andragogy", diagnosticQuestion: "学生是否在备课阶段有结构化的可见入口提出关切与议程？" },
    { id: "zpd", label: "动态学情与即时校准", shortLabel: "动态", theory: "Vygotsky / Dynamic Assessment", diagnosticQuestion: "课堂内是否有 3 个以上 ZPD 重新校准的学情触发锚点？" },
  ];

  const NAV_STATIONS = [
    {
      id: 1,
      phase: "pre",
      title: "课程定位与目标分析",
      displayName: "课程定位与目标分析",
      userMindset: "这节课为什么教？服务什么药事管理能力？在整门课里它接什么、推什么？",
      what: "明确本节课在课程体系、专业能力培养和学生任务产出中的位置，写清它与前一节、下一节的承接关系。",
      why: "防止从“讲知识点”直接开始备课——先把这节课在整门课中的位置说清楚，避免讲完了与前后失联。",
      how: "查看“课程目标—药事任务—学生产出”定位图与“前一节—本节—下一节”上下文卡，选择定位类型，生成课程定位段落 + 课程位置说明。",
      evidenceFigure: "课程目标—药事任务—学生产出三角图 + 前后节承接上下文卡",
      decisionQuestion: "本节 SWOT 课最应该被定位为什么？",
      artifactType: "课程定位段落、课程位置说明",
      qualityDimensions: ["alignment", "authenticity"],
      backendCheckpoints: ["教学情境", "课程任务", "专业能力", "产出边界", "课程位置"],
      v3Status: "upgraded",
      v3Note: "v2 节点 1 + 螺旋上下文卡",
    },
    {
      id: 2,
      phase: "pre",
      title: "学情分析与经验起点",
      displayName: "学情分析与经验诊断室",
      userMindset: "学生进入本课时，认知和经验上分别带着什么？",
      what: "显性区分两类入口：认知前测（先备知识、误区、参与度）+ 经验入口（学生与药事现场的真实接触经历）。",
      why: "新教师常常只看学生'知道什么'，忽略他们'见过什么'。学生进入药事管理课时的家人慢病/实习/社区药店经历是学习的真实起点。",
      how: "查看认知前测分布图 + 学生经验图，识别认知和经验两类断层，生成学情分析、导学任务、诊断题、经验入口任务。",
      evidenceFigure: "前测分布图 / 误区结构条形图 / 学生药事经验图 / 参与度二维分群图",
      decisionQuestion: "本班进入案例探究前最需要处理的入口问题是什么？",
      artifactType: "学情分析段落、课前导学任务、诊断题、经验入口任务",
      qualityDimensions: ["learner", "assessment", "experience"],
      backendCheckpoints: ["学情分析", "先备知识", "常见误区", "经验入口", "预习任务", "诊断题"],
      v3Status: "restructured",
      v3Note: "v2 节点 2 拆分：议程移到 v3 节点 3，新增经验入口维度",
    },
    {
      id: 3,
      phase: "pre",
      title: "学习者议程协商",
      displayName: "学习者议程协商台",
      userMindset: "学生最想从这个案例里看清楚什么？哪里让他们觉得不太对劲？",
      what: "为学生在课前留一个可见的议程入口，让学生提出关切、质疑点、角色意愿，作为教师备课的真实输入。",
      why: "把学生当作可协商的合作者，而不只是被训练判断的对象——课前留一个可见的议程入口，让他们的关切先于教学预设进入备课。",
      how: "设计学习者议程协商单（3 个问题），收集学生回应，查看议程聚类雷达图，判断议程与教师预设目标之间的张力，生成议程—课堂动作映射表。",
      evidenceFigure: "学习者议程聚类雷达图 / 议程—预设张力矩阵 / 角色意愿分布图",
      decisionQuestion: "学习者议程与教师预设的目标之间，最大的张力是什么？",
      artifactType: "学习者议程协商单、议程—课堂动作映射表",
      qualityDimensions: ["agency", "experience", "learner"],
      backendCheckpoints: ["学习者议程", "议程张力", "角色意愿", "议程兑现承诺"],
      v3Status: "new",
      v3Note: "v3 全新增。L2 学习者议程贯通的源头。",
    },
    {
      id: 4,
      phase: "pre",
      title: "学习目标与评价证据",
      displayName: "目标—证据—量规",
      userMindset: "学生学完后要能做什么？怎么证明？目标如何同时回应定位、学情分析和学习者议程？",
      what: "把教学目标改写为可观察、可评价、可由学生产出证明的学习成果；同时回应来自前面三个环节的输入（课程定位、学情诊断、学习者议程）。",
      why: "目标若不回应学情和议程，再漂亮也是空的——这里强制让目标改写时同时回应前面三个环节(定位、学情低分项、学习者议程主张)。",
      how: "查看“目标—活动—产出—评价证据”矩阵 + 产出链顶卡（前序环节输入摘要），识别目标缺口和证据缺口，生成学习目标与评价证据表。",
      evidenceFigure: "目标—活动—产出—评价矩阵 / 认知层级分布图 / 证据覆盖热图",
      decisionQuestion: "当前目标设计最应补强哪一项？",
      artifactType: "学习目标表、目标—活动—评价证据对齐表",
      qualityDimensions: ["alignment", "assessment", "cognition"],
      backendCheckpoints: ["教学目标", "学习成果", "评价证据", "目标对齐"],
      v3Status: "kept",
      v3Note: "v2 节点 3。新增产出链顶卡（节点 1/2/3 输入）。",
    },
    {
      id: 5,
      phase: "pre",
      title: "学科内容结构化与问题链",
      displayName: "内容结构化与问题链工作台",
      userMindset: "教材内容怎么变成课堂问题链？",
      what: "把教材内容重构为问题链、概念链和任务链，帮助学生围绕真实问题推进学习。",
      why: "直接按教材顺序讲会退化为概念讲授；药事管理课堂应围绕事实、证据、判断、策略和风险组织内容。",
      how: "查看“教材内容—核心概念—问题链—学生任务”结构图，选择内容组织方式，生成课堂问题链和核心概念边界说明。",
      evidenceFigure: "概念网络图 / 问题链流程图 / 认知负荷热图",
      decisionQuestion: "本课内容重构的主线应是什么？",
      artifactType: "内容结构图、课堂问题链、核心概念边界说明",
      qualityDimensions: ["alignment", "learner", "cognition"],
      backendCheckpoints: ["核心概念", "重点难点", "问题链", "认知负荷"],
      v3Status: "kept",
      v3Note: "v2 节点 4。新增产出链顶卡。",
    },
    {
      id: 6,
      phase: "pre",
      title: "情境化案例与教学资源",
      displayName: "情境化案例资源室",
      userMindset: "药事管理案例、政策、数据、任务材料怎么准备？学习者议程里关心的伦理/政策点是否在材料里有对应证据？",
      what: "准备药事管理案例、政策材料、数据资料、任务单和证据模板；显式回应学习者议程里的伦理/政策关切。",
      why: "案例必须包含事实、政策、数据、利益相关者和风险边界。这里强制把学习者议程关切体现为可引用证据，避免议程被收集后束之高阁。",
      how: "查看案例证据密度图与议程对照表，判断材料中的事实、政策、数据、角色、风险边界与议程关切是否都有对应证据。",
      evidenceFigure: "案例证据密度图 / 材料来源矩阵 / 利益相关者关系图 / 证据链图 / 议程对照表",
      decisionQuestion: "案例材料最需要先处理什么问题？",
      artifactType: "案例材料说明、证据标注表、学生任务材料包、议程—证据对照表",
      qualityDimensions: ["authenticity", "assessment", "agency"],
      backendCheckpoints: ["案例材料", "政策数据", "证据模板", "来源边界", "议程兑现"],
      v3Status: "upgraded",
      v3Note: "v2 节点 5 + 议程兑现卡（L2 第 1 个回响点）。",
    },
    {
      id: 7,
      phase: "in",
      title: "教学过程设计与节奏编排",
      displayName: "教学过程编排器",
      userMindset: "45 分钟课堂怎么展开？什么时候停下来看学生跟没跟上？",
      what: "设计课堂导入、概念支架、案例分析、小组展示、反馈修正和总结迁移的时间结构，并在时间线上预留至少 3 个'学情校准点'（看学生跟没跟上的关键时刻）。",
      why: "光定讲授/分析/协作比例还不够——课堂上必须预留具体时刻供教师停下来判断'学生跟上没有'，否则形成性评价无法在课中落地。",
      how: "查看 45 分钟课堂时间线图，调整讲授/分析/协作/反馈比例，并在时间线上显式标记至少 3 个学情校准点（前 1/3 / 中 1/3 / 后 1/3 各一）。",
      evidenceFigure: "课堂时间轴 / 参与层级图 / 活动—产出流向图",
      decisionQuestion: "45 分钟课堂最需要修正的结构问题是什么？",
      artifactType: "45 分钟课堂流程、活动—产出—评价节点表、3 个学情校准点位置",
      qualityDimensions: ["alignment", "cognition", "assessment", "zpd"],
      backendCheckpoints: ["问题导入", "概念支架", "案例探究", "展示总结", "时间结构", "学情校准点"],
      v3Status: "upgraded",
      v3Note: "v2 节点 6 + 3 ZPD 锚点（L1 锚点定义点）。",
    },
    {
      id: 8,
      phase: "in",
      title: "探究式学习与协作任务",
      displayName: "探究协作工作室",
      userMindset: "学生如何分析、讨论、协作、产出？角色分配是否参考了学习者议程中的意愿？",
      what: "设计学生如何围绕药事管理案例进行事实提取、证据判断、小组协作和成果展示，角色分配参考学习者议程里的学生意愿。",
      why: "四角色任务（资料员/判断员/质询员/汇报员）若由教师强分，学生未必投入——让学生在议程里表达过的角色意愿成为分配参考。",
      how: "查看小组任务泳道图 + 学生角色意愿分布，判断每个小组角色是否有明确任务和产出，生成协作任务单和教师巡视提示。",
      evidenceFigure: "小组任务泳道图 / 案例证据链图 / 角色—产出矩阵 / 学生角色意愿分布",
      decisionQuestion: "小组协作最需要补强哪一项？",
      artifactType: "小组协作任务单、案例探究任务单、教师巡视与追问提示",
      qualityDimensions: ["authenticity", "cognition", "learner", "agency"],
      backendCheckpoints: ["协作分工", "角色任务", "证据分析", "教师巡视", "展示追问", "议程角色匹配"],
      v3Status: "upgraded",
      v3Note: "v2 节点 7 + 议程角色匹配（L2 第 3 个回响点）。",
    },
    {
      id: 9,
      phase: "in",
      title: "形成性评价与动态调节",
      displayName: "形成性评价与动态调节台",
      userMindset: "课堂中如何用微评估重新校准学情？每个校准点的反馈—调节规则是什么？",
      what: "为时间线上预留的 3 个学情校准点设计微评估格式（≤ 3 min），并为每个点写一条“如果 X 则 Y”的反馈—调节规则。",
      why: "光设触发点不够——每个校准点必须有可执行的决策规则，教师才能在 1 分钟内判断'继续/暂停/重启'。",
      how: "查看形成性评价触发点曲线 + 3 个学情校准点位置，为每个点设计微评估格式与决策规则，生成学情触发—反馈—调节规则表。",
      evidenceFigure: "反馈触发点曲线 / 误区—反馈语匹配表 / 课堂风险预警卡 / 3 个学情校准点的学情触发设计",
      decisionQuestion: "3 个学情校准点中，哪个的学情触发—反馈规则最关键？",
      artifactType: "3 个学情校准点的学情触发—反馈—调节规则表、反馈语模板、课堂调节阈值",
      qualityDimensions: ["assessment", "learner", "improvement", "zpd"],
      backendCheckpoints: ["课堂检查点", "即时反馈", "学习预警", "教学调控", "学情重新校准"],
      v3Status: "upgraded",
      v3Note: "v2 节点 8 升级。L1 形成性评价机制的设计点。",
    },
    {
      id: 10,
      phase: "post",
      title: "表现性评价与反馈",
      displayName: "评价量规实验台",
      userMindset: "学生作品怎么评？反馈怎么写？",
      what: "用评价量规判断学生作品是否真正体现药事管理判断能力，并生成可行动反馈。",
      why: "学生作品可能格式完整但质量较低，例如缺少证据、分类错误、策略与分析不匹配或缺少风险边界。",
      how: "查看量规雷达图或低分维度分布图 + 产出链顶卡（学习目标 + 课中学情触发记录），判断作品主要问题，生成评价量规、评分说明和反馈语模板。",
      evidenceFigure: "量规雷达图 / 学生作品质量分布图 / 低分维度分布图",
      decisionQuestion: "表现性评价最应强调什么？",
      artifactType: "表现性评价量规、学生作品评分表、反馈语模板、二次修改要求",
      qualityDimensions: ["assessment", "alignment"],
      backendCheckpoints: ["学生作品", "评价量规", "评分说明", "反馈语", "二次修改"],
      v3Status: "kept",
      v3Note: "v2 节点 9。新增产出链顶卡（节点 4 + 节点 9 输入）。",
    },
    {
      id: 11,
      phase: "post",
      title: "教学反思与资源积累",
      displayName: "教学反思与资源库",
      userMindset: "这次课如何变成下一轮教学资产？学习者议程被兑现了多少？",
      what: "把学生作品、典型误区、低分维度、反馈语、案例材料和改进建议沉淀为下一轮教学资产；强制完成学习者议程兑现度回顾。",
      why: "学生在课前提出的议程关切，如果只是被'收集'但没在课后回顾兑现度，整条反馈闭环就断了——这里强制做一次'议程兑现回顾'。",
      how: "查看资产沉淀优先级图 + 议程兑现度回顾表，选择最值得保存的资产，生成教学复盘报告和资产沉淀清单。",
      evidenceFigure: "低分维度趋势图 / 资产沉淀网络图 / 下一轮改进优先级矩阵 / 议程兑现度回顾表",
      decisionQuestion: "复盘时最值得沉淀的资产是什么？",
      artifactType: "教学复盘报告（含议程兑现度回顾）、资产沉淀清单、下一轮改进计划",
      qualityDimensions: ["improvement", "assessment", "agency"],
      backendCheckpoints: ["数据复盘", "教学反思", "资源沉淀", "下一轮改进", "议程兑现度回顾"],
      v3Status: "upgraded",
      v3Note: "v2 节点 10 + 议程兑现度回顾（L2 闭环点）。",
    },
  ];

  // ============================================================
  // v3 NEW: HORIZONTAL_LAYERS
  // 三条横向机制，贯穿多个节点
  // ============================================================
  const HORIZONTAL_LAYERS = [
    {
      id: "L1",
      title: "形成性评价与 ZPD 动态评估",
      shortTitle: "动态评估",
      theory: "Vygotsky / Black & Wiliam",
      crossStations: [7, 8, 9],
      anchorStation: 9,
      definitionStation: 7,
      anchorCount: 3,
      anchorFormat: "≤ 3 min 微评估（举手投票 / 错题快闪 / 典型作品口述 / 纸条提交 / 小组互判）",
      hardConstraint: "每个 ZPD 锚点必须有一条“如果 X 则 Y”的反馈—调节规则；否则节点 9 不允许通过。",
      uiHint: "节点 7 时间线上 ◇ 符号标记锚点；节点 9 顶部固定学情触发规则编辑器；节点 11 复盘显示锚点触发摘要。",
    },
    {
      id: "L2",
      title: "学习者议程贯通",
      shortTitle: "议程贯通",
      theory: "Freire / Knowles / Dewey",
      crossStations: [3, 4, 6, 8, 11],
      sourceStation: 3,
      echoStations: [4, 6, 8, 11],
      hardConstraint: "议程进入节点 4/6/8/11 时必须在产物模板里显式回应（可填可空，但留空会进入复盘风险列表）。",
      uiHint: "节点 3 完成后主导航上方出现橙色细条提示议程已加载；相关节点产出链顶卡附议程标签。",
    },
    {
      id: "L3",
      title: "学习产出链",
      shortTitle: "产出链",
      theory: "Wiggins & McTighe / UX 可发现性",
      crossStations: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
      hardConstraint: "每站顶卡 ≤ 3 行片段，可展开抽屉看完整上游产物；不允许堆所有内容。",
      uiHint: "灰底卡片在每站顶部固定；左侧 breadcrumb 显示「← 上一站 ・ 本节点 ・ 下一站 →」。",
    },
  ];

  // MVL_PATH 已下线（v4 决定）：原概念与差异化创新冲突——
  // 跳过 S3 议程、S4 案例使新教师走完 MVL 仍未接触核心特色。
  // 如未来需要"渐进式上手"，建议改用模式选择器（"快速骨架/完整一节/完整闭环"）。

  // ============================================================
  // v3 NEW: PRODUCT_CHAIN
  // 站间产物输入/输出关系，供 L3 UI 渲染产出链顶卡
  // ============================================================
  const PRODUCT_CHAIN = {
    1: { inputsFrom: [], outputsTo: [4, 7], topCardFromKeys: [], topCardToKeys: ["定位类型", "螺旋上下文"] },
    2: { inputsFrom: [1], outputsTo: [3, 4], topCardFromKeys: ["定位类型"], topCardToKeys: ["最低指标项", "经验入口任务"] },
    3: { inputsFrom: [2], outputsTo: [4, 6, 8, 11], topCardFromKeys: ["学情分析要点"], topCardToKeys: ["学习者议程协商单"] },
    4: { inputsFrom: [1, 2, 3], outputsTo: [5, 9, 10], topCardFromKeys: ["定位类型", "学情低分项", "议程主张"], topCardToKeys: ["学习目标", "评价证据表"] },
    5: { inputsFrom: [4], outputsTo: [6, 7], topCardFromKeys: ["学习目标"], topCardToKeys: ["问题链", "概念边界说明"] },
    6: { inputsFrom: [3, 4, 5], outputsTo: [8], topCardFromKeys: ["议程", "目标", "问题链"], topCardToKeys: ["案例材料", "议程—证据对照表"] },
    7: { inputsFrom: [4, 5], outputsTo: [8, 9], topCardFromKeys: ["目标", "问题链"], topCardToKeys: ["时间线", "3 个 ZPD 锚点"] },
    8: { inputsFrom: [3, 6, 7], outputsTo: [9, 10], topCardFromKeys: ["议程意愿", "案例", "时间线"], topCardToKeys: ["协作任务单", "探究产出"] },
    9: { inputsFrom: [7, 8], outputsTo: [11], topCardFromKeys: ["锚点位置", "探究产出"], topCardToKeys: ["学情触发—反馈—调节规则"] },
    10: { inputsFrom: [4, 8], outputsTo: [11], topCardFromKeys: ["评价证据", "学生作品"], topCardToKeys: ["量规", "评分", "反馈语"] },
    11: { inputsFrom: [3, 9, 10], outputsTo: [], topCardFromKeys: ["议程", "学情触发记录", "评价结果"], topCardToKeys: ["复盘报告", "资产清单", "下一轮改进"] },
  };

  // ============================================================
  // v4 NEW: NAV_STAGES — 9 frontend macro-stages
  // ============================================================
  const NAV_STAGES = [
    {
      id: "S1", phase: "pre", title: "课程定位 · 学情诊断 · 学习者议程协商", displayName: "定位·学情·议程",
      tag: "诊断", pillClass: "pill-amber",
      keyDecision: "本节最大冲突点是什么？",
      learnObjective: "识别学生真实的认知与经验起点",
      doAction: "看前测 + 议程，定位本节最大冲突点",
      getDeliverable: "学情画像 + 议程协商单 + 锁定版课程定位",
      subNodeIds: [1, "2-3", "1b"],
      iterationModel: "v0 草拟 → 学情议程综合诊断 → v1 回写修订",
      pharmacyContext: "药学生家人慢病比例 / 社区药店实习 / 一致性评价前测 / 集采伦理议程张力",
      theoryDrawer: ["Bruner 螺旋课程", "Dewey 经验连续性", "Freire 问题提出", "Knowles 成人学习"],
    },
    {
      id: "S2", phase: "pre", title: "学习目标—评价证据—量规对齐", displayName: "目标与量规",
      tag: "目标", pillClass: "pill-amber",
      keyDecision: "目标与量规第一应补强哪一项？",
      learnObjective: "把目标改成可观察、可评价的成果",
      doAction: "先写 3-5 条目标，再配 5 维量规",
      getDeliverable: "学习目标表 + 5 维量规",
      subNodeIds: ["4-a", "4-b"],
      iterationModel: "UbD 两段：目标（Stage 1）→ 评价证据 + 量规（Stage 2）",
      pharmacyContext: "药事管理决策能力目标 + 5 维量规（含批判意识维度）",
      theoryDrawer: ["Wiggins & McTighe UbD", "Anderson Bloom 修订版", "Biggs 建设性对齐"],
      acceptsRubricRevision: { from: "S7", channelKey: "rubricRevision" },
    },
    {
      id: "S3", phase: "pre", title: "知识结构与关键误区定位", displayName: "知识与误区",
      tag: "知识", pillClass: "pill-amber",
      keyDecision: "学生最易卡在哪个误区？",
      learnObjective: "找出学生最易卡住的概念误区",
      doAction: "把教材重构为围绕误区的问题链",
      getDeliverable: "问题链 + 误区清单",
      subNodeIds: [5],
      pharmacyContext: "MAH / MA / 生产证概念边界 / 法规条文易混点",
      theoryDrawer: ["Chi 概念变化", "Shulman PCK"],
    },
    {
      id: "S4", phase: "pre", title: "真实药事管理案例与证据包", displayName: "案例与证据",
      tag: "案例", pillClass: "pill-amber",
      keyDecision: "议程关切对应的证据是否齐？",
      learnObjective: "把真实药事案例转化为证据包",
      doAction: "准备案例 + 核对每条议程都有证据",
      getDeliverable: "案例包 + 议程—证据对照表",
      subNodeIds: [6],
      pharmacyContext: "NMPA 文件 + 医保政策 + 药企财报 + 利益相关者立场",
      theoryDrawer: ["Wiggins 真实性评价", "Christensen 哈佛案例法", "Lave & Wenger 情境学习"],
    },
    {
      id: "S5", phase: "pre", title: "课堂任务链与支架设计", displayName: "任务链设计",
      tag: "任务", pillClass: "pill-amber",
      keyDecision: "协作任务最应补强哪一项？",
      learnObjective: "用任务链 + 支架让学生主动参与",
      doAction: "先按经验排时间线 → 设计协作任务 → 基于任务复杂度回写时间线",
      getDeliverable: "锁定版时间线 + 协作任务单 + 3 个学情校准点位置",
      subNodeIds: [7, 8, "7b"],
      iterationModel: "时间线 v0（经验值）→ 协作任务设计 → 时间线 v1 回写（基于任务复杂度调整）",
      pharmacyContext: "30 分钟实战段 / 4 角色（资料员 / 判断员 / 质询员 / 汇报员）/ 3 个 ZPD 锚点",
      theoryDrawer: ["Chi ICAP", "Vygotsky ZPD", "Wood/Bruner 支架理论"],
    },
    {
      id: "S6", phase: "in", title: "课中学情捕捉与即时干预", displayName: "课中调控",
      tag: "课中", pillClass: "pill-sage",
      keyDecision: "本校准点的「如果 X 则 Y」规则是什么？",
      learnObjective: "用形成性评价实时校准课堂节奏",
      doAction: "为 3 个学情校准点分别写「如果 X 则 Y」反馈规则",
      getDeliverable: "3 条学情触发—反馈规则 + 反馈语模板",
      subNodeIds: ["9-z1", "9-z2", "9-z3"],
      iterationModel: "Z1 条文测温 → Z2 推演投票 → Z3 知识封闭，每锚点独立编辑规则",
      pharmacyContext: "条文测温 / 推演投票 / 知识封闭测温 三类微评估",
      theoryDrawer: ["Black & Wiliam 形成性评价", "Feuerstein 动态评估"],
    },
    {
      id: "S7", phase: "post", title: "表现性评价与学生能力画像", displayName: "评价与画像",
      tag: "评价", pillClass: "pill-indigo",
      keyDecision: "下一轮要补强哪一维？",
      learnObjective: "把作品评分转化为可行动反馈，并把量规问题回写到「目标与量规」",
      doAction: "评分采集 → 反馈语与能力画像 → 量规反向修订",
      getDeliverable: "评分表 + 能力画像 + 反馈语 + 量规修订建议",
      subNodeIds: ["10-a", "10-b", "10-c"],
      iterationModel: "数据采集（评分）→ 教学动作（反馈/画像）→ 元动作（量规修订回写 S2）",
      pharmacyContext: "5 维量规评分 / 低分维度 Pareto / 能力画像 / 反馈语模板 / 量规反修订建议",
      theoryDrawer: ["Hattie 可见的学习", "Hattie 反馈层级"],
      supportsRubricRevision: { to: "S2", channelKey: "rubricRevision" },
    },
    {
      id: "S8", phase: "post", title: "教师教学复盘与改进决策", displayName: "复盘与决策",
      tag: "复盘", pillClass: "pill-indigo",
      keyDecision: "下一轮第一改进项是什么？",
      learnObjective: "把课堂证据复盘为改进决策",
      doAction: "回顾议程兑现 + 定下一轮第 1 改进项",
      getDeliverable: "复盘报告 + 改进决策",
      subNodeIds: ["11a"],
      pharmacyContext: "议程兑现回顾 + 学情触发摘要 + 学生作品低分诊断",
      theoryDrawer: ["Schön 反思性实践", "Kolb 经验学习圈"],
    },
    {
      id: "S9", phase: "post", title: "课例资产沉淀与知识库更新", displayName: "资产沉淀",
      tag: "资产", pillClass: "pill-indigo",
      keyDecision: "本轮最值得沉淀什么？",
      learnObjective: "把单次课例沉淀为可复用资产",
      doAction: "挑选并入库本轮最值得保存的资产",
      getDeliverable: "资产清单 + 知识库更新",
      subNodeIds: ["11b"],
      pharmacyContext: "案例 v2 / 量规 v2 / 法规更新日志 / 学期末汇编",
      theoryDrawer: ["Senge 学习型组织", "Nonaka SECI 知识转化", "Siemens 学习分析"],
    },
  ];

  // ============================================================
  // C1 NEW: STATION ↔ ENV bridge (与 evaluation-framework.js 对接)
  // ------------------------------------------------------------
  // 关键事实：NAV_STAGES S1-S9 与 evaluation-framework.js ENVIRONMENTS E01-E09
  // 是 1:1 对应的同一组 9 个教学环节。本节提供：
  //   · STAGE_TO_ENV  / ENV_TO_STAGE   — Sn ↔ E0n 直接映射
  //   · STATION_TO_ENV / ENV_TO_STATIONS — 旧 11 station ID ↔ 新 9 env ID
  //   · stationToEnv(id) / envToStations(envId) / stageToEnv(stageId) — helper
  //
  // 历史背景：11 station 是早期 v3 设计，9 stage/env 是 v4 后的统一口径。
  // 两者目前并存——本桥让任何代码可以从 station ID 反查到 env ID，反之亦然。
  // ============================================================

  // S1-S9 ↔ E01-E09 直映射（NAV_STAGES.id 与 evaluation-framework ENVIRONMENTS.id 共享同一组语义）
  const STAGE_TO_ENV = {
    S1: 'E01', S2: 'E02', S3: 'E03', S4: 'E04', S5: 'E05',
    S6: 'E06', S7: 'E07', S8: 'E08', S9: 'E09',
  };
  const ENV_TO_STAGE = Object.fromEntries(
    Object.entries(STAGE_TO_ENV).map(([s, e]) => [e, s])
  );

  // 11 station ID → env ID（多对一，11 → 2 envs）
  // 注：本表对齐 SUB_NODES[stationId].stageId 的现有事实（已是 canonical）
  //   旧 station 1+2+3 → E01 学情诊断（合并课程定位 + 学情 + 学习者议程协商）
  //   旧 station 4   → E02 目标与量规
  //   旧 station 5   → E03 知识与误区
  //   旧 station 6   → E04 案例与证据
  //   旧 station 7+8 → E05 任务链设计
  //   旧 station 9   → E06 课中调控（前称「动态学情触发台」）
  //   旧 station 10  → E07 评价与画像
  //   旧 station 11  → E08 复盘 + E09 资产（split via "11a"/"11b" sub-nodes）
  const STATION_TO_ENV = {
    1:  'E01', 2:  'E01', 3:  'E01',     // 学情诊断三合一
    4:  'E02',
    5:  'E03',
    6:  'E04',
    7:  'E05', 8:  'E05',
    9:  'E06',
    10: 'E07',
    11: 'E08',     // 默认归 E08；11a→E08, 11b→E09 见 SUB_NODES_TO_ENV
  };
  // env → station(s)，反向多值
  const ENV_TO_STATIONS = {
    E01: [1, 2, 3],
    E02: [4],
    E03: [5],
    E04: [6],
    E05: [7, 8],
    E06: [9],
    E07: [10],
    E08: [11],     // station 11 主体（复盘）
    E09: [11],     // station 11 副体（资产）— 在 sub-node 层面是 11b
  };
  // 子节点 key → env ID（精确到子节点；处理 "11a" / "11b" 拆分）
  const SUB_NODES_TO_ENV = {
    "1":    'E01',   "2":    'E01',   "3":    'E01',   "2-3":  'E01',   "1b":   'E01',
    "4":    'E02',   "4-a":  'E02',   "4-b":  'E02',
    "5":    'E03',
    "6":    'E04',
    "7":    'E05',   "7b":   'E05',   "8":    'E05',
    "9":    'E06',   "9-z1": 'E06',   "9-z2": 'E06',   "9-z3": 'E06',
    "10":   'E07',   "10-a": 'E07',   "10-b": 'E07',   "10-c": 'E07',
    "11":   'E08',
    "11a":  'E08',
    "11b":  'E09',
  };

  // Helpers
  function stationToEnv(stationId) {
    return STATION_TO_ENV[stationId] || null;
  }
  function envToStations(envId) {
    return ENV_TO_STATIONS[envId] || [];
  }
  function stageToEnv(stageId) {
    return STAGE_TO_ENV[stageId] || null;
  }
  function envToStage(envId) {
    return ENV_TO_STAGE[envId] || null;
  }
  function subNodeToEnv(subKey) {
    return SUB_NODES_TO_ENV[String(subKey)] || null;
  }

  // ============================================================
  // v4 NEW: SUB_NODES — 12 backend sub-nodes
  // (key = legacy station id as string; 11 split to "11a"/"11b")
  // ============================================================
  const SUB_NODES = {
    "1":   { stageId: "S1", subTitle: "课程定位",                  legacyStationId: 1,  order: 1, revisionPass: "v0", subjectName: "课程定位" },
    "2":   { stageId: "S1", subTitle: "学情分析",                  legacyStationId: 2,  order: 2, legacy: true },
    "3":   { stageId: "S1", subTitle: "学习者议程协商",            legacyStationId: 3,  order: 3, legacy: true },
    "2-3": { stageId: "S1", subTitle: "学情诊断 + 议程协商",       legacyStationId: 2,  order: 2, mergedWith: [3] },
    "1b":  { stageId: "S1", subTitle: "再定位",                    legacyStationId: 1,  order: 3, splitOf: 1, revisionPass: "v1", subjectName: "课程定位", revisionSource: "学情诊断 + 议程协商", revisionAction: "确认或修订定位类型、能力锚定与产出边界，输出锁定版定位",
      // v4.2: 鸡蛋型回写硬约束 — 必须先完成 "2-3" 合并诊断才能进入 v1 回写
      enterCondition: {
        requires: [{ subKey: "2-3", type: "judgmentSaved", reason: "v1 回写必须基于学情+议程合并诊断结果，否则等同于 v0 草拟" }],
        onUnmetUI: "节点 chip 显示锁定图标 + 提示「请先完成 2-3 学情议程合并诊断」",
      },
    },
    "4":   { stageId: "S2", subTitle: "学习目标与评价证据 + 量规设计", legacyStationId: 4,  order: 1, legacy: true },
    "4-a": { stageId: "S2", subTitle: "学习目标",                  legacyStationId: 4,  order: 1, splitOf: 4, focus: "objectives" },
    "4-b": { stageId: "S2", subTitle: "评价证据 + 5 维量规",        legacyStationId: 4,  order: 2, splitOf: 4, focus: "rubric", acceptsRubricRevision: { from: "S7", channelKey: "rubricRevision" } },
    "5":   { stageId: "S3", subTitle: "知识结构与问题链",          legacyStationId: 5,  order: 1 },
    "6":   { stageId: "S4", subTitle: "真实案例与证据包",          legacyStationId: 6,  order: 1 },
    "7":   { stageId: "S5", subTitle: "课堂时间线",                legacyStationId: 7,  order: 1, revisionPass: "v0", subjectName: "课堂时间线" },
    "8":   { stageId: "S5", subTitle: "协作任务与角色分配",        legacyStationId: 8,  order: 2 },
    "7b":  { stageId: "S5", subTitle: "再校准时间线",              legacyStationId: 7,  order: 3, splitOf: 7, revisionPass: "v1", subjectName: "课堂时间线", revisionSource: "协作任务与角色分配", revisionAction: "基于任务复杂度和角色任务量回写时间分配，调整 13 分钟微实战段配比与 3 个学情校准点位置",
      // v4.2: 鸡蛋型回写硬约束 + 数据联动 — 必须先完成 station 8 协作任务判断
      enterCondition: {
        requires: [{ stationId: 8, type: "judgmentSaved", reason: "v1 时间线回写必须读取协作任务设计的 4 角色任务密度与时间预算" }],
        onUnmetUI: "节点 chip 显示锁定图标 + 提示「请先完成协作任务与角色分配（节点 8）」",
      },
      readsFromStation: 8,   // 渲染时读 station 8 的 roleTimeBudget 与判断结果，动态生成时间线调整建议
    },
    "9":    { stageId: "S6", subTitle: "课中学情触发与反馈",        legacyStationId: 9,  order: 1, legacy: true },
    "9-z1": { stageId: "S6", subTitle: "Z1 · 条文测温（10'）",      legacyStationId: 9,  order: 1, splitOf: 9, anchorId: "Z1" },
    "9-z2": { stageId: "S6", subTitle: "Z2 · 推演投票（28'）",      legacyStationId: 9,  order: 2, splitOf: 9, anchorId: "Z2" },
    "9-z3": { stageId: "S6", subTitle: "Z3 · 知识封闭（42'）",      legacyStationId: 9,  order: 3, splitOf: 9, anchorId: "Z3" },
    "10":   { stageId: "S7", subTitle: "表现性评价 + 量规反向修订", legacyStationId: 10, order: 1, legacy: true },
    "10-a": { stageId: "S7", subTitle: "评分采集（5 维量规打分）",   legacyStationId: 10, order: 1, splitOf: 10, focus: "scoring" },
    "10-b": { stageId: "S7", subTitle: "反馈语 + 能力画像",         legacyStationId: 10, order: 2, splitOf: 10, focus: "feedback-profile" },
    "10-c": { stageId: "S7", subTitle: "量规反向修订",                 legacyStationId: 10, order: 3, splitOf: 10, focus: "rubric-revision", supportsRubricRevision: { to: "S2", channelKey: "rubricRevision" } },
    "11a": { stageId: "S8", subTitle: "教师复盘与改进决策",        legacyStationId: 11, order: 1, splitOf: 11 },
    "11b": { stageId: "S9", subTitle: "资产沉淀与知识库更新",      legacyStationId: 11, order: 1, splitOf: 11 },
  };

  // ============================================================
  // v4 NEW: STAGE_CHAIN — stage-level L3 product chain
  // (NOTE S7 → S2 边表示量规反向修订通道，前台显示为虚线返回箭头)
  // ============================================================
  const STAGE_CHAIN = {
    S1: { inputsFrom: [],                outputsTo: ["S2", "S4", "S5"],         topCardFromKeys: [],                                 topCardToKeys: ["课程定位", "学情低分项", "议程张力"] },
    S2: { inputsFrom: ["S1"],            outputsTo: ["S3", "S5", "S7"],         topCardFromKeys: ["定位", "学情", "议程"],            topCardToKeys: ["学习目标", "评价证据", "5 维量规"] },
    S3: { inputsFrom: ["S2"],            outputsTo: ["S4", "S5"],               topCardFromKeys: ["学习目标"],                       topCardToKeys: ["概念边界", "误区清单", "问题链"] },
    S4: { inputsFrom: ["S1","S2","S3"],  outputsTo: ["S5"],                     topCardFromKeys: ["议程", "目标", "问题链"],          topCardToKeys: ["案例材料", "议程—证据对照"] },
    S5: { inputsFrom: ["S2","S3","S4"],  outputsTo: ["S6", "S7"],               topCardFromKeys: ["目标", "问题链", "案例"],          topCardToKeys: ["时间线", "学情校准点", "协作任务单"] },
    S6: { inputsFrom: ["S5"],            outputsTo: ["S7", "S8"],               topCardFromKeys: ["锚点位置"],                       topCardToKeys: ["学情触发—反馈—调节规则", "触发记录"] },
    S7: { inputsFrom: ["S2","S5","S6"],  outputsTo: ["S8"], revisionsTo: ["S2"], topCardFromKeys: ["量规", "学生作品", "学情触发数据"],   topCardToKeys: ["评分", "能力画像"] },
    S8: { inputsFrom: ["S1","S6","S7"],  outputsTo: ["S9"],                     topCardFromKeys: ["议程兑现", "学情触发摘要", "评价结果"], topCardToKeys: ["复盘报告", "改进决策"] },
    S9: { inputsFrom: ["S8"],            outputsTo: [],                         topCardFromKeys: ["改进决策"],                       topCardToKeys: ["案例 v2", "量规 v2", "法规日志"] },
  };

  // ============================================================
  // v4 NEW: STAGE_HORIZONTAL_LAYERS — L1/L2/L3 re-mapped to stages
  // ============================================================
  const STAGE_HORIZONTAL_LAYERS = [
    {
      id: "L1",
      title: "形成性评价与 ZPD 动态评估",
      shortTitle: "动态评估",
      theory: "Vygotsky / Black & Wiliam",
      crossStages: ["S5", "S6", "S8"],
      definitionStage: "S5",
      anchorStage: "S6",
      summaryStage: "S8",
      anchorCount: 3,
      anchorFormat: "≤ 3 min 微评估（举手投票 / 错题快闪 / 典型作品口述 / 纸条提交 / 小组互判）",
      hardConstraint: "每个 ZPD 锚点必须有一条「如果 X 则 Y」反馈—调节规则；S6 不允许在锚点规则为空时通过。",
      uiHint: "S5 内子节点 07 时间线上 ◇ 符号标记锚点；S6 顶部固定学情触发规则编辑器；S8 显示触发摘要。",
    },
    {
      id: "L2",
      title: "学习者议程贯通",
      shortTitle: "议程贯通",
      theory: "Freire / Knowles / Dewey",
      crossStages: ["S1", "S2", "S4", "S5", "S8"],
      sourceStage: "S1",
      echoStages: ["S2", "S4", "S5", "S8"],
      hardConstraint: "议程进入 S2/S4/S5/S8 时必须在产物模板里显式回应；留空进入 S8 复盘风险列表。",
      uiHint: "S1 完成后主导航上方出现橙色细条；S2/S4/S5/S8 顶卡附议程标签。",
    },
    {
      id: "L3",
      title: "学习产出链",
      shortTitle: "产出链",
      theory: "Wiggins & McTighe / UX 可发现性",
      crossStages: ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9"],
      hardConstraint: "每个教学环节顶卡 ≤ 3 行片段，可展开抽屉看完整上游产物。",
      uiHint: "灰底卡片固定；breadcrumb 显示「教学环节 · 子节点」。",
    },
  ];

  // ============================================================
  // v4 NEW: RUBRIC_REVISION — S7 → S2 反向修订通道
  // ============================================================
  const RUBRIC_REVISION = {
    from: "S7",
    to: "S2",
    purpose: "学生作品发现的量规维度问题（如某维度区分度不足、过度严格、缺失关键维度）可回写到教学环节 2 修订量规",
    payloadShape: { dim: "string", reason: "string", proposedChange: "string", evidenceArtifactId: "string?" },
    storeKey: "rubricRevisions",
    storeEvent: "rubric:revisionProposed",
    uiHint: "S7 评分完成后显示「向 S2 提出量规修订」按钮；S2 顶部显示「待审修订 N 条」徽章。",
    hardConstraint: "下一轮备课进入 S2 时，未处理的量规修订必须在量规设计前显式确认或驳回。",
  };

  const INTERACTION_CONTRACT = {
    stationTemplate: [
      "产出链顶卡：显示上一站产物片段 + 本节点要在哪些方面回应（L3 全站生效）",
      "环节说明卡：是什么、为什么、用户如何做",
      "证据图：展示可支持教学判断的数据、案例、目标、活动或评价证据",
      "教学判断题：必须是教学决策题，不是知识问答题",
      "系统反馈：解释判断合理性、风险和修正建议",
      "产物生成：生成可写入教案、任务单、量规、反馈语或复盘清单的文本",
      "保存资产：写入教学数据页或教学资产库",
    ],
    artifactRequiredSections: [
      "图表观察",
      "教学判断",
      "药事管理情境",
      "课堂动作或评价动作",
      "证据与资产沉淀",
    ],
    horizontalLayerHooks: {
      // v4 stage-level（前台引用）
      L1_stage: "S5 定义 ZPD 锚点；S6 不允许在锚点决策规则为空时通过；S8 显示触发摘要。",
      L2_stage: "S2/S4/S5/S8 顶卡显式呈现议程标签；S8 强制完成议程兑现度回顾。",
      L3_stage: "9 个教学环节顶卡 + breadcrumb 全部展示产出链。",
      // v3 station-level（后台兼容）
      L1: "子节点 7/8/9 必须显式处理 ZPD 锚点；子节点 9 不允许在锚点决策规则为空时通过。",
      L2: "子节点 4/6/8/11 在产物模板中显式呈现议程标签；子节点 11 强制完成议程兑现度回顾。",
      L3: "所有子节点顶部固定产出链顶卡组件。",
    },
  };

  const COPY_RULES = {
    pageTitle: "面向新教师的药事管理课程教学导航工作台",
    pageSubtitle: "9 个教学环节 · 12 子节点 · 一节课的证据化设计、实施、复盘与沉淀。",
    forbiddenVisiblePhrases: [
      "20环节教学模拟工作台",
      "20环节教学导航路径",
      "20个教学环节导航图",
      // v4: 旧版"11 节点"叙事禁止再出现在前台
      "11 节点工作台",
      "11 个并列节点",
      "10 tiles",
      "10 个节点",
      "缩略图 10",
      "0 / 11",
    ],
    allowedTwentyStepUsage: "20 环节只允许作为后台质量检查点；前台暴露为「9 个教学环节 + 12 子节点」。",
    counterDisplayFormat: "{done} / 9",
    breadcrumbFormat: "{stageTitle} · {subNodeTitle}",
    stageTheoryDrawerLabel: "方法依据",
  };

  const FORBIDDEN_CHANGES = [
    // v2 原有
    "不得把前台改回 20 个可见环节。",
    "不得把页面做成通用后台 dashboard。",
    "不得把页面做成学生闯关游戏；服务对象是新教师。",
    "不得增加大段前端说明文字；应由图表、判断题、反馈和产物驱动。",
    "不得把 SWOT 当作产品总主题；它只是《管理学原理》中的示例知识点。",
    "不得移除药事管理情境。",
    "不得大改 app.js 或全局工程结构。",
    "不得引入外部依赖；优先使用静态 HTML / CSS / 原生 JS / SVG。",
    // v3 新增
    "不得让学习者议程站（子节点 3）退化为“学生意见调查表”；议程必须在至少 4 个回响点显式回应（S2/S4/S5/S8）。",
    "不得让形成性评价机制（L1）退化为“随便提问几个学生”；每个 ZPD 锚点必须有“如果 X 则 Y”的决策规则。",
    // v4 新增
      "不得在前台铺陈教育理论标签（如 ZPD / UbD / Bloom 等术语）；理论收进每个教学环节的「方法依据」抽屉。",
      "不得让教学环节 7 的「量规反向修订」失效；学生作品发现的量规问题必须可回写到教学环节 2。",
    "不得把横向机制（L1/L2/L3）退化为内部数据；议程横条 / 锚点 ◇ 标 / 顶卡产出链必须前台可见。",
    "不得在前台出现「11 节点」「10 tiles」「0/11」等旧叙事；统一为「9 个教学环节 + 12 子节点」。",
  ];

  function deepFreeze(obj) {
    Object.freeze(obj);
    Object.getOwnPropertyNames(obj).forEach((prop) => {
      const value = obj[prop];
      if (value && typeof value === "object" && !Object.isFrozen(value)) deepFreeze(value);
    });
    return obj;
  }

  global.PharmacoPilotNavigationContract = deepFreeze({
    VERSION,
    NAVIGATION_PHASES,
    NAV_STATIONS,
    PHARMACY_SCENARIOS,
    QUALITY_DIMENSIONS,
    INTERACTION_CONTRACT,
    COPY_RULES,
    FORBIDDEN_CHANGES,
    // v3 (legacy)
    HORIZONTAL_LAYERS,
    PRODUCT_CHAIN,
    // v4 新增导出 — 9 stages overlay
    NAV_STAGES,
    SUB_NODES,
    STAGE_CHAIN,
    STAGE_HORIZONTAL_LAYERS,
    RUBRIC_REVISION,
    // C1 新增 — station/stage ↔ env 桥
    STAGE_TO_ENV,
    ENV_TO_STAGE,
    STATION_TO_ENV,
    ENV_TO_STATIONS,
    SUB_NODES_TO_ENV,
    stationToEnv,
    envToStations,
    stageToEnv,
    envToStage,
    subNodeToEnv,
  });
})(window);
