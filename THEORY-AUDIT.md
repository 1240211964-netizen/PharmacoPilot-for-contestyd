# 理论使用审计表

> **本表的存在理由**：2026-08-02 的教学设计审查中曾出现一句结论「22 处理论归属全部准确」。
> 该句连**数量都是错的** —— 契约 `theoryDrawer` 实为 **24 条**（S1×4 / S2×3 / S3×2 / S4×3 /
> S5×3 / S6×2 / S7×2 / S8×2 / S9×3）。一个连计数都未复核的断言，
> 更不可能完成用法核验。
> 该结论**越界了**——当时核对的只是「理论名称 ↔ 原始作者」的对应关系，
> 并未检验系统对每个理论的**使用是否落在其适用边界内**。这是两件事。
>
> 名称对得上，不等于用得对。一个理论被张冠李戴、被过度延伸、
> 或被用在它本来不解释的现象上，都不会在名称核对中暴露。
>
> 因此本表分四列：**理论名称 / 原始出处 / 系统中的具体约束 / 适用边界与越界风险**。
> 第三列必须指向代码或数据中的**具体位置**；第四列必须写出**这个理论不能支撑什么**。
>
> 状态标记见下方「状态值」表。核心区分：**用法是否已检验**，而非名称是否对得上。

---

## 当前状态

**24 条全部核验完毕**（2026-08-03）。Biggs 建设性对齐已完成整改；
Chi ICAP 色带的虚假编码声称已撤下，但理论机制本身仍待结构化。其余条目按本表动作继续整改。

**目前仅 Biggs 建设性对齐可标 `✅ 已核验`**：4 个角色活动段已通过
`servesGoals` 连到 S2 目标与 S7 评价的共享 `metricId`，并加入机器门禁。
其余 23 条仍存在表述、机制或范围上的待修项。这本身是个结论：**理论标注的精度普遍低于实现的精度。**

第 1 批：Hattie 可见的学习、Vygotsky ZPD、Siemens 学习分析、Senge 学习型组织、Nonaka SECI。
第 2 批：Knowles 成人学习、Chi 概念变化、Wiggins 真实性评价、Christensen 案例法、Lave & Wenger 情境学习、Feuerstein 动态评估、Kolb 经验学习圈。
第 3 批（架构主梁）：UbD、Bloom 修订版、Biggs 建设性对齐、Chi ICAP。
第 4 批（收尾）：Bruner 螺旋、Dewey、Freire、Shulman PCK、Wood/Bruner 支架、Black & Wiliam、Hattie 与 Timperley 反馈框架、Schön。

答辩若被问到理论依据，目前可回答的范围是：
「24 条理论依据的使用边界已全部逐条核验，每条都写明了它**不能**支撑什么，并列出整改动作」——
这个说法可以讲。**但不能说「理论应用全部正确」**；目前是 1 / 24 完成整改，其余仍有待修项。

### 状态值

| 值 | 含义 |
|---|---|
| `✅ 已核验` | 名称、出处、用法三者均已比对，第三四列已填，无待整改项 |
| `⚠ 需整改` | 用法已核验，但发现具体问题，**必须附整改动作** |
| `⚠ 待核验` | 仅比对了名称与出处，**用法尚未检验** |
| `❌ 越界` | 已确认使用超出理论边界 |

### 累计核验结论

核验推翻了我在建表时的两处预判，如实记录：

0. **连"22 处"这个数量都是错的**，实为 24 条。见表头。
1. **Hattie 的效应量边界，系统早已守住。** 建表时我预标「高风险 · 常见误用」，
   但 `evaluation-framework.js:28` 已明写「效应量是标准化统计量，不能由本项目
   10 分制分差直接换算」。这是正确且主动的边界声明，**应在答辩中主动讲出来**，
   它反而是加分项。预判有误，已更正。
2. **ZPD 的主要风险不在命名。** 建表时我指向 S5 的「ZPD 锚点」命名，
   但 `nav-stations-contract.js:856` 已有硬约束禁止前台铺陈理论术语，
   命名只是内部标识符。真正强的断言在 `evaluation-framework.js:264`。
3. **S9 三条理论的问题是「无对应机制」而非「过度延伸」。**
   Siemens / SECI / Senge 全站仅出现在 `nav-stations-contract.js:491` 一处 `theoryDrawer` 标签中，
   系统内不存在任何由它们约束的行为。这是本轮最需要处置的一类——
   **答辩若被追问「SECI 体现在哪」，目前答不出来。**

**方法论教训**：不做第三列（指向具体字段），就无法判断第四列。
凭理论名称预判风险，方向可能正好相反。

### 已确认「有标签无机制」清单（截至第 2 批）

这是本次审计最集中的一类问题：理论被列入 `theoryDrawer`，
但**全站没有任何由它约束的行为**。答辩若被追问「这条体现在哪」，目前答不出来。

| 环节 | 理论 | 全站出现处 | 建议 |
|---|---|---|---|
| S1 | Knowles 成人学习 | 3 处层标签字符串 | 删（保留 Freire） |
| S3 | **Chi 概念变化** | 仅 `theoryDrawer` | 补类型判别，或删 |
| S4 | **Christensen 案例法** | 仅 `theoryDrawer` | 删（与讲授段冲突） |
| S6 | Feuerstein 动态评估 | 5 处均为标题「动态评估」四字 | Z1↔Z3 构成前后测，或删 |
| S9 | Siemens 学习分析 | 仅 `theoryDrawer` | 删或实现最小机制 |
| S9 | Senge 学习型组织 | 仅 `theoryDrawer` | 删 |
| S9 | Nonaka SECI | 仅 `theoryDrawer`（有可对应动作但无映射） | 标注四环节，或改述 |

**7 / 24 条属于此类，占比 29%。**

> **勘误（2026-08-03）**：本节原写「S3 的 Chi 与 S4 的 Christensen 分别是该环节唯一或主要的
> 理论依据，删掉后该环节将无理论支撑」——**这句不成立**。核对 `nav-stations-contract.js`：
> S3 的 `theoryDrawer` 本就有 2 条（Chi + **Shulman PCK**），S4 有 3 条（Wiggins +
> Christensen + **Lave & Wenger**）。删除后两个环节各自仍有在用的理论支撑。
> 这是一次未核对数据就下的断言，与本表要纠正的错误属同一类。

**另有 3 条属于「归属位置错误」而非无机制**：
Wiggins 真实性评价应从 S4 移至 S7；Hattie 与 Lave & Wenger 的前台 chip
与「不得在前台铺陈理论标签」的硬约束冲突，应移入环节抽屉。

### 第 3 批（架构主梁）结论

与前两批相反，**这四条大多有实质实现**，是答辩可用的论据：

| 理论 | 实现程度 | 关键事实 |
|---|---|---|
| UbD | **实**（Stage 1→2 强制分段落库） | 逆向设计的核心顺序成立：S2 严格先于 S5，无法跳过评价证据设计活动 |
| Bloom 修订版 | **实**（6 层 + 证据覆盖 + 前台金字塔） | 用对了修订版动词序「评价→创造」，这是识别是否真读过 2001 版的标志 |
| Biggs | **三角已闭合 ✅** | ILO↔评价以 `metricId` 校验；4 个角色活动段以 `servesGoals` 连回同一组目标，并有回归门禁 |
| **Chi ICAP** | **界面虚假声称已解除，机制仍待补** | 色带改为中性「课堂阶段」，按序号取色不再声称编码 ICAP；尚无 `icapLevel` 字段 |

**ICAP 原有的 B 类界面风险已解除**：色带现标「课堂阶段」，图例为
「讲授 · 分析 · 协作与质询 · 反馈」，内部常量与 CSS 类名也已改为 `PHASE_*`。
但这只是撤回不成立的声称；若未来要宣称「按 ICAP 设计认知参与曲线」，仍须增加
`icapLevel` 字段并重新论证各阶段归属。

**Biggs 这条已完成**：4 个角色段均已加
`servesGoals: [metricId...]`，建设性对齐三角已闭合，现在可以追溯「哪个活动在教哪条目标」。

### 当前剩余的问题分布（22 条）

| 类型 | 条数 | 理论 |
|---|---|---|
| **A · 有标签无机制** | 7 | Knowles、**Chi 概念变化**、**Christensen 案例法**、Feuerstein、Siemens、Senge、Nonaka |
| **B · 命名了但未结构化**（界面/文本声称，数据无对应字段） | 0 | 已归零：Hattie 与 Timperley 反馈框架已结构化 |
| **C · 有实质实现，仅表述或范围待修** | 11 | UbD、Bloom、**Chi ICAP**、Black & Wiliam、Shulman、Bruner 螺旋、Freire、Dewey、Kolb、Hattie 可见的学习、Vygotsky ZPD |
| **D · 归属位置错误** | 4 | Wiggins 真实性评价（S4→S7）、Lave & Wenger（前台 chip）、Wood/Bruner 支架（无 fading）、**Schön（覆盖被低估，应加挂 S6）** |

**B 类原本最危险**，因为界面主动作出了数据支撑的暗示。
ICAP 色带这一处已整改；反馈语也已改为三个可核验的组成部分，
不再使用单值 `feedbackLevel` 把整条反馈归入某一层。
这与已停用的 `dynamicScoring`、已改写的 `station6.dataNotice` 属同一族——
**「形式上数据驱动，实质上没有数据」**。建议在补字段前先移除界面上的理论字样。

**Schön 是唯一反向的一条**：系统实际做到的比声称的多（S6 的 Z1/Z2 即时调整
本就是 reflection-in-action），只是没挂标签。这条整改是「加」。

### 三条共用改造 —— 已完成（2026-08-03）

共用 Z1/Z3 这一对锚点，一次改造解决三条：

1. **Feuerstein 动态评估** ✅ —— Z1（A 卷）→ 介入 → Z3（B 卷）构成前后测。
   采用**同构平行卷而非原题重复**：原题重复引入记忆效应，测到的是「记住了答案」
   而非「理解了概念」。Δ 记入 `s6_mah_boundary_gain`，附「不得换算为效应量」的边界。
2. **Wood/Bruner 支架** ✅ —— `scaffoldFading`：Z1 达标者默认不再发放三步分类卡，
   但 `studentOptIn` / `teacherOverride` 均为 true。**撤除的是「默认供给」，不是「使用权」**——
   写成「达标者禁止使用支架」会与差异化支持和可及性原则冲突。
3. **Black & Wiliam** ✅ —— S6 契约注明 Z1/Z2 为即时形成性调控、Z3 为课末封闭测温，
   不再笼统并称为形成性评价。

### 归属修正 —— 已完成（2026-08-03）

| 理论 | 原挂 | 现挂 | 依据 |
|---|---|---|---|
| Wiggins 真实性评价 | S4 | **S7** | 真实性评价约束的是**评价任务本身**（真实情境复杂度、允许多解、要求整合判断、评分标准公开），不是「使用真实材料」。材料真实 ≠ 任务真实。S7 要求学生产出带证据的 SWOT-TOWS 并接受交叉质询、5 维 rubric 对学生公开 —— 这才是落点 |
| Schön 反思性实践 | 仅 S8 | **S6 + S8** | 系统实际覆盖两类反思却只声称一类：S6 的 Z1/Z2「依当堂证据当场调整」正是 reflection-**in**-action；S8 的五段式复盘是 reflection-**on**-action。已分别标注「行动中」/「行动后」 |

**这是全表唯一一条「加」的整改** —— Schön 的覆盖此前被低估。

---

## S1 学习者与教学情境分析

| 理论 | 原始出处 | 系统中的具体约束 | 适用边界与越界风险 | 状态 |
|---|---|---|---|---|
| Bruner 螺旋课程 | Bruner, *The Process of Education*, 1960（同一概念在不同阶段以递增深度反复出现） | `station1.payload.js:118-120` `spiral{previous/current/next}`：<br>· previous：管理学原理 · 管理环境与战略分析 —「SWOT 概念首次出现 · 偏定义」<br>· current：药事管理 · SWOT 应用 —「应用到药企 · 加 TOWS」<br>· next：药事管理 · PESTLE/Porter —「暴露 SWOT 局限」<br>渲染于 `nav-render.js:1596` 折叠抽屉。 | **核验结论：这是本表少数「用对了」的一条。** 三点构成 SWOT 概念的真实螺旋——定义 → 应用+推导 → 局限暴露，深度递增而非简单重复，符合 Bruner 原义。<br><br>**不能支撑**：<br>· 系统实现了**课程级**螺旋。当前只有一个三点实例（单一概念、相邻三节）；螺旋课程指**整门课程的组织原则**<br>· 螺旋＝前后节衔接。任意两节课都有衔接，只有**同一概念以递增深度重访**才是螺旋<br><br>**整改（很轻）**：注明这是「SWOT 概念的单条螺旋线索」，不宣称课程整体按螺旋组织。 | ⚠ 需整改 |
| Dewey 经验连续性 | Dewey, *Experience and Education*, 1938（连续性原则：每段经验既取自过往、又改变未来经验的质地） | ① `nav-stations-contract.js:125` 横切层 `{ id: "experience", label: "学生前经验与连续性" }`<br>② `:342` / `:760` 层标签字符串<br>③ 实际机制：`station2.payload.js` 经验入口图（家人慢病 60% / 社区药店实习 23%），及针对 12% 无接触学生的「家人慢病情境锚」前置任务 | **不能支撑**：<br>· 系统实现了经验连续性。Dewey 的连续性是**双向**的：新经验须由旧经验生长，**并反过来改造旧经验的意义**。系统只做前半段——用旧经验做**入口与分组**，无任何环节检验「这节课是否改变了学生对自身经历的理解」<br>· 「给无经验学生情境锚」＝经验连续性。那是**补偿缺失经验**<br>**可支撑 ✓**：区分「知道什么」与「见过什么」两类起点，这个区分本身是 Dewey 式的<br><br>**整改**：在 S8 复盘或 S7 反馈中增加一问「学生是否重新理解了自己的药事接触经历」；否则表述降为「前经验入口」。 | ⚠ 需整改 |
| Freire 问题提出 | Freire, *Pedagogy of the Oppressed*, 1970（问题提出式教育 vs 储蓄式教育；师生共同命名世界） | ① `nav-stations-contract.js:126` `{ id: "agency", label: "学习者议程与主体性" }`<br>② `:342` / `:760` 层标签<br>③ 实际机制：`station3.payload.js` 学生议程协商单（3 题）+ 响应聚类；议程贯通至 S2 目标、S4 证据、S5 角色、S8 兑现度回顾<br>④ `station3` 决策中「学生议程过于分散，强行收敛到教师预设」被设为明确劣项（score 1.5） | **核验结论：落点真实且贯通五个环节**，是本表实现最完整的理论之一。<br><br>**不能支撑**：<br>· 系统实现了问题提出式教育。Freire 的核心是师生**共同命名世界**——学生参与决定**学什么、为什么学**；系统中学生议程是**输入**，课程定位（S1）与学习目标（S2）仍由教师单方决定<br>· 议程协商＝打破储蓄式教育。协商发生在**备课阶段**，课堂内的知识传递结构未变<br>**可支撑 ✓**：「学生关切先于教学预设进入备课」的设计取向；S8 强制回顾议程兑现度、未兑现须写原因——**后者尤其接近 Freire 的问责精神**<br><br>**整改（轻）**：表述调整为「受 Freire 启发的学习者议程机制」，说明学生参与止于议程层、未及目标层。 | ⚠ 需整改 |
| Knowles 成人学习 | Knowles, *The Modern Practice of Adult Education*, 1970 / *The Adult Learner*, 1973 | 全站 3 处，**全部是横切层的 `theory` 标签字符串**：`nav-stations-contract.js:126` `{ id: "agency", theory: "Freire / Knowles / Andragogy" }`、`:342`、`:760` 同款。<br>无任何由 andragogy 六假设约束的行为。 | **不能支撑**：<br>· 系统「按成人学习原理设计」。andragogy 六假设（自我概念、经验储备、学习准备度、学习定向、内在动机、需知理由）在系统中无一被检验或使用<br>· 学生议程协商＝自我导向学习。议程协商是**教师采纳学生关切**，andragogy 的自我导向指学习者**自主决定学习目标与路径**<br><br>**问题性质：有标签无机制。** 且 Knowles 与 Freire 被并列在同一 `theory` 字符串中，两者立场差异很大（andragogy 是心理学取向的成人教学法，Freire 是批判教育学），并列易被追问。<br>**整改**：删除 Knowles，仅保留 Freire（S1 的议程协商确有 Freire 落点）；或补充说明本科生适用性的论证。 | ⚠ 需整改 |

## S2 预期学习结果与评价证据设计

| 理论 | 原始出处 | 系统中的具体约束 | 适用边界与越界风险 | 状态 |
|---|---|---|---|---|
| Wiggins & McTighe UbD | Wiggins & McTighe, *Understanding by Design*, 1998 / 2nd ed. 2005（Stage 1 期望结果 → Stage 2 评价证据 → Stage 3 学习计划） | **有实质实现**：<br>① `nav-stations-contract.js:407` `iterationModel: "UbD 两段：目标（Stage 1）→ 评价证据 + 评价标准（Stage 2）"`<br>② S2 拆为两个独立子节点 `"4-a"`（目标）/ `"4-b"`（评价证据 + 评价标准），各自产出独立产物<br>③ `pharmaco-store.js:100` + `nav-render-store-bridge.js:166` 用复合键 `subKey` 分别存两段判断<br>④ `nav-render.js:4389`「S2 UbD 两段：目标与评价标准分别存放」；`nav-detail.html:381` 两段 banner 样式 | **不能支撑**：<br>· 系统完整实现了 UbD 三阶段。Stage 3（学习计划）被分散到 S3／S4／S5 三个环节，**未标注其为 Stage 3**，也无任何字段把三者归为同一阶段<br>· 「UbD 两段」这一措辞本身易误读为 UbD 只有两阶段<br>**可支撑 ✓**：逆向设计的**核心顺序**成立——S2（目标+证据）严格先于 S5（活动），且 Store 强制两段分别落库，无法跳过评价证据直接设计活动。这是 UbD 最实质的要求，系统做到了<br><br>**整改（轻）**：把 `iterationModel` 改为「UbD Stage 1 → Stage 2 两段拆分；Stage 3 学习计划落在 S3/S4/S5」，避免「UbD 两段」被读作理论只有两阶段。 | ⚠ 需整改 |
| Anderson & Krathwohl Bloom 修订版 | Anderson & Krathwohl, *A Taxonomy for Learning, Teaching, and Assessing*, 2001（二维：知识维度 × 认知过程维度） | **有实质实现**：<br>① `station4.payload.js:61-67` 六层分布：记忆 8 / 理解 22 / 应用 28 / 分析 22 / 评价 14 / 创造 6 ＝ **100%**<br>② `nav-render.js:2989+` 前台渲染 6 层金字塔，含 L5/L6 高阶、L3/L4 中阶、L1/L2 基础的三档配色 + 每层证据覆盖数<br>③ `station4.payload.js:56` `["Bloom 层级覆盖", 72, ...]` 进入 S2 的对齐打分<br>④ `nav-decision-bank.js:286/342` 以 Bloom 覆盖为题眼的迁移题 | **细节正确 ✓**：使用的是修订版的**动词序**「记忆／理解／应用／分析／评价／创造」，末两级为「评价→创造」而非原版 1956 的「综合→评价」。这个顺序差异是识别是否真读过修订版的标志，系统答对了<br><br>**不能支撑**：<br>· 系统应用了 Bloom **修订版**的完整框架。修订版的标志性贡献是**二维分类表**（知识维度：事实／概念／程序／元认知 × 认知过程维度）；系统只用了**认知过程一维**<br>· 「记忆 8%」这类占比可用于跨班比较。占比是**目标条目的分布**，不是学生认知水平的测量<br><br>**性质：正确但简化**，不是错误。<br>**整改（轻）**：在环节抽屉注明「本系统只使用认知过程维度，未纳入知识维度」——主动说明简化范围，比被追问更好。 | ⚠ 需整改 |
| Biggs 建设性对齐 | Biggs, *Teaching for Quality Learning at University*, 1999（预期学习成果 ILO ↔ 教学活动 TLA ↔ 评价任务，三者须对齐） | **三条边已接通**：<br>① 目标 ↔ 评价：`station4.goalEvidenceMap` 5 条各带 `metricId` / `aggregationLevel` / `threshold`，与 `station10.rubric` 五维一一对应<br>② 评价 → 目标回写：`supportsRubricRevision` S7→S2 通道与 `rubricRevisions` 状态机已被消费<br>③ 目标 ↔ 活动：`station8.evidenceFigure.roleTimeBudget.sequence` 的 4 个角色段均以 `servesGoals` 指向 S2/S7 共用的 `metricId`<br>④ `verify-payloads.mjs` 校验每段非空、指标在 S2 定义且在 S7 取证；「批判反思」保留在 39′–42′ 反馈段 | **可支撑 ✓**：系统已建立可机器校验的 ILO ↔ TLA ↔ 评价追溯，可回答「资料员在教哪条目标」。<br><br>**不能支撑**：结构对齐已建立 ≠ 教学效果已被因果验证；`servesGoals` 证明设计意图与可追溯性，不证明学生已达成目标。 | ✅ 已核验 |

## S3 教学内容结构化与前概念诊断

| 理论 | 原始出处 | 系统中的具体约束 | 适用边界与越界风险 | 状态 |
|---|---|---|---|---|
| Chi 概念变化 | Chi, *Three Types of Conceptual Change: Belief Revision, Mental Model Transformation, and Categorical Shift*, 2008 | **`nav-stations-contract.js:427` 的 `theoryDrawer` 标签 —— 全站唯一出现处。**<br>已全文检索：无「概念变化 / conceptual change」相关字段。S3 的实际机制是 `station5.payload.js` 的 6 层问题链 + 5 类误区清单（含 `frequency` / `stage` / `intervention`）。 | **不能支撑**：<br>· 系统「应用了概念变化理论」。Chi 的核心贡献是把概念变化分为三类，**不同类型需要不同干预**：belief revision 可用反例，mental model transformation 需重构模型，categorical shift 需跨本体类别的重新归类<br>· 系统的 5 类误区**未做类型判别**，全部采用同一种干预（正反例对照卡）。若「W/T 混淆」实为 categorical shift（把外部环境错误归入内部属性这一**本体类别**错误），则正反例对照是无效干预<br><br>**问题性质：有标签无机制，且这是 S3 唯一的理论依据。**<br>**整改**：为 5 类误区各标注 Chi 三分类归属，并据此差异化 `intervention`；否则删除标签，改述为「误区清单基于教学经验归纳」。 | ⚠ 需整改 |
| Shulman PCK | Shulman, *Those Who Understand: Knowledge Growth in Teaching*, 1986；*Knowledge and Teaching*, 1987 | **有实质且贴切的应用**：<br>① `evaluation-framework.js:240` 引 Shulman 1987 PCK，注「一个教学时刻同时调动多种能力」<br>② `evaluation-framework.js:79/81` 能力项 T1「课程定位与学情解释」、T3「药事情境转译」的 refs<br>③ **`nav-decision-bank.js:156/310/384/454` 四处以 PCK 作为 `theorySource` 标注教师误判类型**：「把 subject matter 误当成 PCK」「把多元问题误归为单一动词问题」「把教学设计问题误归到学生时间」「误判为时间问题而非视角缺失」 | **核验结论：③是全表最贴切的一处应用。** PCK 本就是**教师知识的类型学**，用它分类**教师的误判**正是原生用途，比用它为「内容重构」背书恰当得多。<br><br>**不能支撑**：<br>· 系统「培养了教师的 PCK」。PCK 的增长需长期实践；系统能做的是**暴露 PCK 缺口**<br>· T3「药事情境转译能力」等同于 PCK。转译是 PCK 的表现之一，非全部<br><br>**版本小注**：①标 1987、`theoryDrawer` 标 1986，两版皆真实（1986 提出、1987 系统化），同一系统内宜统一。<br>**整改（很轻）**：统一年份；「培养」类表述改为「诊断／暴露」。 | ⚠ 需整改 |

## S4 真实性学习情境与资源设计

| 理论 | 原始出处 | 系统中的具体约束 | 适用边界与越界风险 | 状态 |
|---|---|---|---|---|
| Wiggins 真实性评价 | Wiggins, *The Case for Authentic Assessment*, 1990 | 全站 4 处，**全部是质量维度名 `"authenticity"`**：`nav-stations-contract.js:119` 定义 `{ id: "authenticity", label: "药事管理情境真实性", theory: "Authentic Learning" }`，`:143/228/262` 在 `qualityDimensions` 数组中被引用。<br>注意 `theory` 值写的是泛称 `"Authentic Learning"`，未指向 Wiggins。 | **不能支撑**：<br>· 系统实施了真实性评价。Wiggins 的真实性评价指**评价任务本身**须具备真实情境的复杂性、允许多解、要求整合判断、并公开评分标准——它是**对评价的要求**，不是「使用真实材料」<br>· 「案例材料来自 NMPA 文件与年报」＝真实性评价。材料真实 ≠ 任务真实<br>**可支撑**：S7 的 5 维评分表要求学生产出带证据的 SWOT-TOWS 并接受质询，**这一项本身相当接近**真实性评价的要求——但该落点在 S7，不在 S4<br><br>**整改**：把 Wiggins 从 S4 移到 S7（S7 的表现性评价才是真实性评价的落点），S4 保留 Lave & Wenger 与 Christensen 即可。 | ⚠ 需整改 |
| Christensen 哈佛案例法 | C. R. Christensen, *Education for Judgment: The Artistry of Discussion Leadership*, 1991 | **`nav-stations-contract.js:432` 的 `theoryDrawer` 标签 —— 全站唯一出现处。**<br>已全文检索：无「案例法 / case method / 冷点名」相关字段。S4 的实际机制是 `station6.payload.js` 的案例材料证据密度图与议程—证据覆盖表。 | **不能支撑**：<br>· 系统采用了哈佛案例法。该方法的定义特征是**讨论主导（discussion leadership）**：教师不讲授、通过提问序列推进，学生须课前完成案例阅读并随时可能被点名（cold call），课堂契约明确<br>· 45 分钟结构中有 12 分钟讲授段（27%），与案例法「教师不讲授」的基本前提相冲突<br>· 「使用真实企业案例」＝案例法。案例法是**教学法**，不是材料类型<br><br>**问题性质：有标签无机制，且与既有课堂结构存在直接冲突。**<br>**整改二选一**：<br>(a) 删除标签，改述为「案例材料设计参考商学院案例写作规范」；<br>(b) 若确实想用案例法，须重构 S5 时间线（取消讲授段、建立点名契约）——但这与已拍板的 12/14/13/6 结构冲突，不建议。 | ⚠ 需整改 |
| Lave & Wenger 情境学习 | Lave & Wenger, *Situated Learning: Legitimate Peripheral Participation*, 1991；实践共同体另见 Wenger, *Communities of Practice*, 1998 | 全站 4 处：`index.html:1752`、`nav-detail.html:1730` 前台 `theory-chip`（展示用）；`evaluation-framework.js:266` `COUPLING_REFS` 引 `Wenger 1998 实践共同体`，注「mutual engagement 作为共生机制」。<br>S4/S5 的 4 角色分工（资料员／判断员／质询员／汇报员）**未与该理论建立显式关联**。 | **不能支撑**：<br>· 课堂 4 角色分组构成实践共同体。实践共同体的三要素是共同事业（joint enterprise）、相互投入（mutual engagement）、共享技艺库（shared repertoire），且需要**跨时间的持续存在**；一节课内的临时角色分配不满足<br>· 学生扮演资料员／判断员＝合法的边缘性参与。LPP 描述的是**新手在真实实践共同体中由边缘向核心移动**的轨迹，课堂角色扮演是模拟，不是真实参与<br>**可支撑**：`COUPLING_REFS` 借 mutual engagement 说明师生共生，这是**概念借用**且已注明，尚可<br><br>**整改**：前台 chip 与 `nav-stations-contract.js:856`「不得在前台铺陈理论标签」冲突，应移入环节抽屉；若要保留该理论，须说明它约束的是**设计取向**（让学习贴近真实实践）而非声称实现了 LPP。 | ⚠ 需整改 |

## S5 学习活动与教学支架设计

| 理论 | 原始出处 | 系统中的具体约束 | 适用边界与越界风险 | 状态 |
|---|---|---|---|---|
| Chi ICAP | Chi & Wylie, *The ICAP Framework: Linking Cognitive Engagement to Active Learning Outcomes*, 2014（Interactive > Constructive > Active > Passive） | ① `nav-stations-contract.js` 横切评价维度与方法依据仍保留 ICAP<br>② `evaluation-framework.js` 能力项 T6/S6 的 `refs`<br>③ 时间轴色带现为中性「课堂阶段」，常量与类名改为 `PHASE_COLORS` / `.tl-phase` / `.phase-*`<br>④ `nav-decision-bank.js` 仍有「讲授(Passive)→分析(Active)→协作(Constructive)→反馈(Interactive)」映射 | **已解决：不成立的界面编码声称已撤回。** 色带仍按阶段序号区分颜色，但不再暗示颜色编码了 ICAP 层级；门禁禁止恢复 `ICAP_COLORS` 或 `icap-*` 色带命名。<br><br>**仍未解决**：系统没有 `icapLevel` 字段，④的四段映射仍需重新论证；协作与交叉质询可能更接近 Interactive，教师主导的反馈段不应自动视为 Interactive。<br><br>**不能支撑**：系统「按 ICAP 设计了认知参与曲线」。<br>**后续二选一**：(a) 补 `icapLevel` 并经教学论证后由字段驱动；(b) 保持当前中性阶段色带，ICAP 只作方法依据，不声称映射具体阶段。 | ⚠ 需整改（界面风险已解除） |
| Vygotsky ZPD | Vygotsky, *Mind in Society*, 1978（ZPD＝独立表现与受助表现之间的距离） | ① `nav-stations-contract.js:444` `theoryDrawer` 标签<br>② `nav-stations-contract.js:127` 横切层 `{ id: "zpd", label: "动态学情与即时校准", theory: "Vygotsky / Dynamic Assessment" }` —— 前台标签已改为功能描述<br>③ `nav-stations-contract.js:335/753` 硬约束：每个锚点必须有「如果 X 则 Y」规则<br>④ `station9.payload.js:pulseRules[0..2]` 三条规则，含 `checkpointType` / `actionTiming` / `metricId` / `threshold`<br>⑤ **`evaluation-framework.js:264` `COUPLING_REFS`：「耦合是最近发展区运作机制的量化」** | **不能支撑**：<br>· **耦合公式量化了 ZPD 的运作机制**。ZPD 是独立表现与受助表现之**差**；`COUPLING(env) = mean(applicable Xi) × evidenceCoef × x1GlobalCoef` 测的是师生维度关联度，两者构念不同。Vygotsky 从未把 ZPD 操作化为公式<br>· Z1–Z3 的正确率／票数分歧度是**掌握程度**指标，不是 ZPD 宽度——除非同时测「无辅助」与「有辅助」两种条件下的表现<br>**可支撑**：「教学应作用于学生尚不能独立完成、但在支持下可完成的区域」这一设计取向<br><br>**已有防护 ✓**：`nav-stations-contract.js:856` 硬约束禁止前台铺陈 ZPD 等术语；②的前台标签已是功能描述而非理论名<br>**主要待整改**：⑤的「量化」措辞须降级为「受 ZPD 启发的关联度指标，非 ZPD 本身的测量」<br>**次要**：内部标识仍用「ZPD 锚点」，建议统一为「学情校准点」以免内部文档外泄时被追问 | ⚠ 需整改 |
| Wood/Bruner 支架理论 | Wood, Bruner & Ross, *The Role of Tutoring in Problem Solving*, 1976（六项助教功能；核心特征是**逐步撤除** fading） | 全站「支架」133 处，**逐条甄别后绝大多数是阶段名而非支架设计**：<br>· `station7.payload.js:41`、`nav-stations-contract.js:239`「课堂导入、**概念支架**、案例分析…」——**课堂阶段名词**<br>· `nav-stations-contract.js:246/667` `backendCheckpoints` 的「概念支架」「边界支架」——同为阶段名<br>· **唯一具体的支架物**：`station1.payload.js:219`「为低响应＋基础待巩固学生提供**三步分类卡**和低门槛对比案例」<br>· **`fading` 命中 13 处，全部是视觉淡出的 CSS 类名**（学生注意力、toast），与支架撤除无关 | **❗核心问题：无撤除机制。**<br>Wood/Bruner 支架的**定义性特征**是逐步撤除——支持随能力增长而递减，最终独立完成。系统提供三步分类卡，但**没有任何环节规定何时、依据什么撤除**。<br><br>**不能支撑**：<br>· 系统「设计了教学支架」。无撤除路径的持续支持是**辅助工具**，不是支架；长期不撤反造成依赖<br>· 「概念支架」这一阶段名＝支架理论<br><br>**整改（可低成本落地）**：三步分类卡已有天然撤除点——Z1（10′）测条文理解、Z3（42′）测同类构念。可规定「Z1 达标者在协作段不再发卡」，即构成一次真实 fading，且与 Feuerstein 的前后测改造**共用同一机制**。<br>否则应把该条改为「分层任务支持」，不称支架理论。 | ⚠ 需整改 |

## S6 形成性评价与适应性调控

| 理论 | 原始出处 | 系统中的具体约束 | 适用边界与越界风险 | 状态 |
|---|---|---|---|---|
| Black & Wiliam 形成性评价 | Black & Wiliam, *Assessment and Classroom Learning*, 1998（判准：证据须被**实际用于调整教学**） | **有实质实现。** 注：关键词「形成性评价」83 处中 **50 处是 S6 环节名本身**，计数具误导性；甄别后的真实落点：<br>① `station9.payload.js:pulseRules[0..2]` 三条规则，各含 `ifCond`（可量化阈值）/ `thenAct`（具体动作）/ `metricId` / `aggregationLevel` / `threshold` / `checkpointType` / `actionTiming`<br>② `nav-stations-contract.js:335/753` **硬约束**：每个锚点必须有「如果 X 则 Y」规则，为空不允许通过<br>③ `evaluation-framework.js:29` 注「把评分作为可迭代信号而非终结性判断」 | **核验结论：这是全表实现最完整的一条。** ②的硬约束尤其关键——它在**结构上**阻止形成性评价退化为「随便提问几个学生」，正是 Black & Wiliam 批评的典型失败态。<br><br>**不能支撑**：<br>· 三个锚点都是形成性的。Z3（`actionTiming: next_session`）的证据**不用于调整本节课**，按判准它对本节而言不是形成性的——字段已诚实标注，但**表述上仍把三者并称**<br>· 有规则＝规则被执行。系统能强制规则**存在**，无法保证教师**照做**；触发记录进 S8 复盘是间接约束<br><br>**整改（轻）**：S6 描述中区分「2 个即时形成性锚点 + 1 个课末封闭测温」。 | ⚠ 需整改 |
| Feuerstein 动态评估 | Feuerstein, *Instrumental Enrichment*, 1980；中介性学习经验（MLE）见 Feuerstein et al., 1988 | 全站 5 处，**全部是标题中的「动态评估」四字**：`nav-stations-contract.js:327/328/744/745` 的 `title: "形成性评价与 ZPD 动态评估"` 与 `shortTitle`；`nav-render-store-bridge.js:792` 的 UI 统计行。<br>无 `Feuerstein` 字样出现在 `theoryDrawer` 之外，无测—介入—再测结构。 | **不能支撑**：<br>· 系统实施了动态评估。动态评估的定义结构是**前测 → 中介性介入 → 后测**，通过比较介入前后的表现来测量**学习潜能**而非当前水平；系统的 Z1/Z2/Z3 是三个**独立的单次测温**，彼此不构成前后测<br>· Z1 的 `thenAct`（回炉精讲）＝中介性学习经验。MLE 有明确判准（意向性与互惠性、超越性、意义中介），单纯的再讲一遍不满足<br><br>**问题性质：有标签无机制。** 但**存在最小改造路径**：Z1（10′）与 Z3（42′）若测同一构念，即天然构成前测—介入—后测。<br>**整改二选一**：<br>(a) 让 Z3 复用 Z1 的题目构念（当前 Z1 测条文理解、Z3 测 MAH/MA/生产证关系，已相近），并显式记录 Δ；<br>(b) 删除标签，S6 仅保留 Black & Wiliam。 | ⚠ 需整改 |

## S7 表现性评价与学习成效诊断

| 理论 | 原始出处 | 系统中的具体约束 | 适用边界与越界风险 | 状态 |
|---|---|---|---|---|
| Hattie 可见的学习 | Hattie, *Visible Learning*, 2009（800+ 项元分析综述） | ① `nav-stations-contract.js:468` `theoryDrawer` 标签<br>② `evaluation-framework.js:28` `SCALE.refs` —— **已声明边界**：「效应量是标准化统计量，不能由本项目 10 分制分差直接换算」<br>③ `evaluation-framework.js:85` 能力项 `T7.refs`<br>④ `evaluation-framework.js:265` `COUPLING_REFS` —— 注「visible teaching ↔ visible learning 互为前提」<br>⑤ 前台展示：`index.html:2067`、`data-detail.html:1990` 的 `theory-chip` | **不能支撑**：<br>· 本项目 10 分制维度分差换算为效应量，或与 Hattie 的 d 值对照<br>· 宣称某教学动作「效应量高／排名靠前」<br>· 为「5 维评分 + 能力画像」这一**方法**背书（Hattie 是效应量排序，不提供评价方法或量表）<br>**可支撑**：「教学应使学习可见、师生互为镜像」这一**理念层**主张<br><br>**已有防护 ✓**：②处的禁换算声明是正确且主动的边界守卫，答辩应主动讲出<br>**待整改**：④处把 Hattie 列为耦合公式的参考文献，但 Hattie 未提供任何耦合公式，须改标为「概念启发」而非「方法来源」<br>**次要张力**：⑤前台 chip 与 `nav-stations-contract.js:856`「不得在前台铺陈教育理论标签」的硬约束冲突 | ⚠ 需整改 |
| Hattie & Timperley 反馈框架 | Hattie & Timperley, *The Power of Feedback*, 2007（反馈可作用于 task / process / self-regulation / self 四个层面；self 层通常缺少与学习任务的关联） | ① `nav-stations-contract.js:468` 保留在「方法依据」抽屉<br>② `station10.payload.js.feedbackArchitecture` 定义三个必填组成部分：`task` / `process` / `selfRegulation`，并把 `self` 设为禁止聚焦<br>③ 5 个计分维度与 1 个不计分观察项均提供三部分反馈模板<br>④ `verify-payloads.mjs` 拒绝缺字段、恢复单值 `feedbackLevel` 或前台恢复理论分类标签 | **口径边界**：单值 `feedbackLevel` 不能表达一条反馈可以同时包含的多种学习信息，因此不采用。本项目将任务差距、过程调整与自我调节设为每条模板的必填槽位，这是为保证反馈完整性所做的**项目操作化**，不声称论文规定每一句话都必须同时覆盖三层。<br><br>**已落地**：前台改用中文说明“任务差距—过程调整—后续自检”，并禁止用对人格或天赋的笼统评价代替学习信息。 | ✅ 已整改 |

## S8 反思性实践与教学改进

| 理论 | 原始出处 | 系统中的具体约束 | 适用边界与越界风险 | 状态 |
|---|---|---|---|---|
| Schön 反思性实践 | Schön, *The Reflective Practitioner*, 1983（区分 reflection-**in**-action 行动中反思 / reflection-**on**-action 行动后反思） | ① `nav-stations-contract.js:480` `theoryDrawer` 标签<br>② `evaluation-framework.js:86` 能力项 T8「反思性教学改进能力」的 refs<br>③ `station11.payload.js:160` 注释「五段式复盘模板（Schön + Kolb）」，实际机制为 `templateSections` 五段 | **核验结论：系统实际覆盖了两类反思，却只把 Schön 挂在 S8。**<br>· **reflection-on-action**（行动后）＝ S8 五段式复盘 ✓ 已挂标签<br>· **reflection-in-action**（行动中）＝ S6 的 Z1/Z2 即时规则——教师依当场证据当场调整，**这正是行动中反思**，但 S6 的 `theoryDrawer` 只列 Black & Wiliam 与 Feuerstein<br><br>**不能支撑**：<br>· S8 覆盖了 Schön 的完整框架。S8 只是 on-action 一半<br>· 填写复盘模板＝反思性实践。Schön 强调**与情境的对话**与**框架实验**，模板化填空有把反思变成流程作业的风险<br><br>**整改（这条是「加」不是「减」）**：把 Schön 同时挂到 S6，注明 S6＝in-action、S8＝on-action。**这是全表唯一一条理论覆盖被低估的情况——系统实际做到的比声称的多。** | ⚠ 需整改 |
| Kolb 经验学习圈 | Kolb, *Experiential Learning: Experience as the Source of Learning and Development*, 1984（CE → RO → AC → AE 四阶段） | `station11.payload.js:160` 代码注释「五段式复盘模板（Schön 反思性实践 + Kolb 经验学习圈）」；实际机制为 `templateSections` 五段：① 课堂概况 ② 议程兑现度 ③ 学情触发摘要 ④ 低分维度诊断 ⑤ 下一轮第一改进项。<br>另有前台 `theory-chip`：`index.html:1749`、`nav-detail.html:1727`。 | **不能支撑**：<br>· 五段式模板＝Kolb 循环。逐段比对：①≈CE 具体经验，②③≈RO 反思观察，④**部分** AC 抽象概念化（「低分维度诊断」是归因，未上升为可迁移的教学原则），⑤是 AE 的**计划**而非 AE 本身——主动实验只有在下一轮真正实施时才发生<br>· 单次复盘完成了一个 Kolb 循环。循环只在下一轮开课时闭合<br>· Kolb 圈描述**学习者**的学习过程；此处用于**教师**的教学改进，属类比迁移，须明示而非默认成立<br><br>**已有支持 ✓**：系统确实支持跨轮次迭代（S9 资产 → 下一轮），所以「循环可闭合」有结构基础，不是空谈<br>**整改**：在模板中显式标注各段所属阶段，并把第 ④ 段的产出要求从「诊断」提升为「形成一条可迁移的教学原则」，否则 AC 阶段实质缺失。 | ⚠ 需整改 |

## S9 教学知识建构与专业共享

| 理论 | 原始出处 | 系统中的具体约束 | 适用边界与越界风险 | 状态 |
|---|---|---|---|---|
| Senge 学习型组织 | Senge, *The Fifth Discipline*, 1990 | **`nav-stations-contract.js:491` 的 `theoryDrawer` 标签 —— 全站唯一出现处。**<br>无对应机制：系统内不存在团队学习、共同愿景、系统思考等五项修炼的任何实现。 | **不能支撑**：<br>· 系统构成或促成了「学习型组织」。五项修炼作用于**组织**（团队心智模式、共同愿景、系统思考）；本系统面向单一教师的课后资产沉淀<br>· 单人资产库＝组织学习<br><br>**问题性质：有标签无机制。** 与 Siemens 同类。<br>**整改**：删除标签；或若答辩要讲「教研组共享」，须先说明该功能尚未实现，不能以 Senge 为其背书。 | ⚠ 需整改 |
| Nonaka SECI | Nonaka & Takeuchi, *The Knowledge-Creating Company*, 1995 | **`nav-stations-contract.js:491` 的 `theoryDrawer` 标签 —— 全站唯一出现处。**<br>相关实际动作在 `station11.payload.js`：资产价值排序 + 资产入库写回 `artifactLibrary`，**但未与 SECI 四环节建立任何显式对应**。 | **不能支撑**：<br>· 系统实现了 SECI 知识转化循环。SECI 四环节为共同化（隐性→隐性）／表出化（隐性→显性）／联结化（显性→显性）／内在化（显性→隐性）；系统当前动作至多覆盖**表出化与联结化**的一部分，且无任何环节标注<br>· 资产入库＝知识创造螺旋<br><br>**问题性质：有标签无机制（比 Siemens/Senge 稍好，存在可对应的动作但未建立映射）。**<br>**整改二选一**：<br>(a) 为 `station11` 的资产动作逐一标注所属 SECI 环节，并说明共同化／内在化两环缺失的原因；<br>(b) 删除标签，改述为「资产沉淀受知识管理研究启发」。 | ⚠ 需整改 |
| Siemens 学习分析 | Siemens & Long, *Penetrating the Fog: Analytics in Learning and Education*, 2011；连通主义另见 Siemens, *Connectivism*, 2005 | **`nav-stations-contract.js:491` 的 `theoryDrawer` 标签 —— 全站唯一出现处。**<br>已全文检索 `shared/*.js` 与所有页面：无学习分析相关计算、无学习者数据建模、无预测或干预推荐机制。S9 的实际动作是 `station11.payload.js` 的资产价值排序与资产入库写回。 | **不能支撑**：<br>· 系统「应用了学习分析」。学习分析的定义要素是**对学习者数据的测量、收集、分析与报告，用以理解并优化学习及其发生环境**；本系统在 S9 无任何此类机制<br>· 资产入库＝学习分析。资产沉淀是**教师侧的知识管理**，不涉及学习者数据分析<br><br>**问题性质不是过度延伸，而是「有标签无机制」**——理论被列出，但系统中不存在任何由它约束的行为。<br>**整改二选一**：<br>(a) 删除该标签，S9 只保留 Senge / Nonaka；<br>(b) 若确实想保留，须先实现最小机制（如跨轮次的低分维度趋势分析），并把归属改为 Siemens & Long 2011。<br>**若系统实际想表达的是「知识在网络中连接与流动」，那是连通主义（2005），不是学习分析，须改注。** | ⚠ 需整改 |

---

## 填表规则

1. **第三列必须可跳转**：写清文件名与字段路径（如 `station9.payload.js:pulseRules[2].actionTiming`），不接受「体现在整体设计中」这类表述。
2. **第四列必须写否定命题**：明确「这个理论**不能**支撑什么」。写不出否定命题，说明尚未真正理解边界。
3. **改状态需要证据**：`⚠ → ✅` 必须同时填好三、四列，并注明核验人与日期。
4. **发现越界不要删理论**：标 `❌ 越界` 并写明如何整改（改用法、换理论、或降级为「受其启发」）。
5. 本表与 `TYPOGRAPHY.md` 同级，属于长期规范文档，不随单次会话失效。

---

## 2026-08-03 · 整改落地记录

三组教学决定已由项目负责人拍板并实施完毕。

### ① 理论标签收缩与归属修正：24 条 → 20 条

| 环节 | 动作 | 理由 |
|---|---|---|
| S1 | 删 Knowles 成人学习 | 仅 3 处层标签字符串，andragogy 六假设无一被使用 |
| S3 | 删 Chi 概念变化 | 未对 5 类误区做三分类判别，全部共用同一干预 |
| S4 | 删 Christensen 案例法 | 与 12 分钟讲授段（27%）直接冲突 |
| S9 | 删 Senge、Siemens；Nonaka 降级 | 前两者零机制；SECI 仅覆盖表出化/联结化部分，改述为「受知识管理研究启发」 |
| S6 | **保留** Feuerstein | 条件已满足，见 ② |

S3 删后仍由 Shulman PCK 支撑，S4 仍由 Wiggins + Lave & Wenger 支撑。

### ② Z1/Z3 同构平行卷 + 柔性渐隐（一次改造解决三条）

`station9.payload.js` 新增 `construct` / `deltaMeasure` / `scaffoldFading`：

- **同构平行卷**：Z1 为 A 卷、Z3 为 B 卷，测同一构念「MAH 概念边界」，
  题量题型一致但表层情境不同。**不重复原题** —— 原题重复引入记忆效应，
  测到的是「记住了答案」而非「理解了概念」。
- **Feuerstein 动态评估**：由此构成 前测 → 介入 → 后测，Δ 记入
  `s6_mah_boundary_gain`，并标注「单班单课时，不得换算为效应量」。
- **Wood/Bruner 支架渐隐**：Z1 达标者默认不再发放三步分类卡，
  但 `studentOptIn: true` / `teacherOverride: true` —— **撤除的是「默认供给」，
  不是「使用权」**。写成「达标者禁止使用支架」会与差异化支持和可及性原则冲突。
- **Black & Wiliam 表述分轨**：S6 契约注明 Z1/Z2 为即时形成性调控、
  Z3 为课末封闭测温，不再笼统并称。

### ③ Hattie 与 Timperley：三层结构，而非单值标签

**原先本表建议的「为每类反馈加 `feedbackLevel` 单值字段」是错的。**
Hattie & Timperley 的四层不是「这条反馈属于哪一层」的分类标签，而是
**一条有效反馈应当同时包含 task + process + self-regulation 三类信息、
并避开 self 层**。单值字段把框架降维成了标签。

现行结构：每个 `feedbackTemplate` 同时含 `task` / `process` / `selfRegulation`
三字段，`feedbackArchitecture.excludedFocus.key === "self"` 显式禁止人格化评价，
且全部由 `verify-payloads.mjs` 机器校验（含「不得出现 feedbackLevel」的反向断言）。

### 门禁

`verify-payloads.mjs` 新增三组防回退断言：ICAP 命名与取色、Biggs `servesGoals`
闭环（含 metricId 双向存在性校验）、反馈三层结构。全量 20/20 通过。
