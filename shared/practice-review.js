/*
 * PharmacoPilot · Practice review domain
 * ------------------------------------------------------------
 * 审校域的稳定数据与纯转换。DOM 渲染、后端请求和 Store 写回暂由
 * practice-runtime.js 注入/调用；后续卷宗重排只扩展本模块，不复制状态源。
 */
(function attachPracticeReview(global) {
  "use strict";

  const EXPERTS = Object.freeze([
    { id:"expert-pharm", ec:"is-pharm", av:"药", role:"药学情境审校", func:"把课题锚定到真实临床 / 药学决策场景", persona:"临床药学", reviewerId:"pharmacy-context", scopeCopy:"只审校案例证据与任务链两个主责环节", target:5, inject:{ upload:"上传匿名病例 PDF / 临床指南", link:"链接院内临床案例库 / 药典数据库", distill:"蒸馏某位临床药学学者风格" } },
    { id:"expert-mgmt", ec:"is-design", av:"经", role:"管理决策审校", func:"审视医院管理 / 药事经济 / 政策路径", persona:"药事管理与卫生经济", reviewerId:"management-tradeoff", scopeCopy:"只审校目标与评价标准、复盘决策两个主责环节", target:4, inject:{ upload:"上传医院年报 / 政策分析报告", link:"链接科室 BI / 经管知识库", distill:"蒸馏药事经济 / 卫生经济学者风格" } },
    { id:"expert-law", ec:"is-law", av:"法", role:"法规合规审校", func:"校验法规引用 · 文号 · 年份 · 时效", persona:"药事法规与监管", reviewerId:"regulatory-citation", scopeCopy:"只审校知识误区与案例证据两个主责环节", target:6, inject:{ upload:"上传法规 PDF / 飞检通告汇编", link:"链接 NMPA / 国家医保局公开库", distill:"蒸馏某位药事法规学者风格" } },
    { id:"expert-edu", ec:"is-eval", av:"教", role:"教学设计审校", func:"审视问题链 · 目标对齐 · 评价标准设计", persona:"课程与评价", reviewerId:"instructional-design", scopeCopy:"只审校目标、误区与任务链三个主责环节", target:4, inject:{ upload:"上传课程论文 / 评价范式材料", link:"链接学校教学评价数据库", distill:"蒸馏 Bloom / Biggs / Wiggins / Stiggins 范式" } },
    { id:"expert-data", ec:"is-reflect", av:"数", role:"数据循证审校", func:"提供 RWE / 监测数据 / 循证支撑", persona:"数据科学与真实世界证据", reviewerId:"evidence-metrics", scopeCopy:"只审校案例证据与评价画像两个主责环节", target:9, inject:{ upload:"上传 CSV / 监测报表 / 真实世界数据", link:"链接 CHINET / FAERS / 院内 HIS 脱敏库", distill:"蒸馏某位数据科学学者风格" } },
  ]);

  // 固定种子没有逐字摘录，只能声明“模板建议落点”。这里显式给出每一路
  // 主环节，禁止拿 reviewer scope 或关键词推断唯一位置。
  const EXPERT_SEED_PRIMARY_ENV_KEYS = Object.freeze(["env05", "env08", "env04", "env05", "env04"]);

  const EXPERT_CHAPTER_COMMENTS = Object.freeze({
    "mp-ch3-environment": [
      { anchor:"⌗ 药学 · 慢病服务场景", body:'情境未交代总部、门店与药师的决策分工，学生无从判断哪些因素属门店可控。——建议补一段统采定价、排班与服务权限的分工说明，作为 <b>S/W 可控性判据</b>。' },
      { anchor:"⌗ 经管 · TOWS 策略", body:'复盘只核对分类对错，未检验证据能否转化为策略。——建议要求每组用同一张 SWOT 表产出 <b>SO / WO / ST / WT</b> 各一条，并写明资源条件。' },
      { anchor:"⌗ 法学 · 政策边界", body:'“门诊统筹政策摘要”未标注来源、时间与适用区域，合规性无法核验。——建议教师核实前列为<b>待核实材料</b>，只补发文机关与年份，不代写文号。' },
      { anchor:"⌗ 教育 · W/T 边界", body:'“执业药师不足”一题把门店排班短板（W）与行业人才供给（T）混为一谈。——建议拆成两问，各配一条可核对证据，再进入 <b>TOWS 转化</b>。' },
      { anchor:"⌗ 数据 · 环境证据", body:'S/W/O/T 分类只凭观点，没有证据门槛。——建议每格至少挂一条可核对来源（复购、排班、竞店或人才数据），<b>无证据不入表</b>。' },
    ],
    "ch5-procurement": [
      { anchor:"⌗ 药学 · 患者代表", body:'患者角色只有立场、没有用药史，换药分歧不贴近临床。——建议把患者代表设为<b>使用原研药 2 年以上的慢病患者</b>，写明其换药顾虑。' },
      { anchor:"⌗ 经管 · 多方博弈", body:'任务只问“替代是否合理”，医院、医保、药企的三方博弈没有显化。——建议增设“药事委员会如何在 <b>DRG 与集采双轨</b>下决策”的权衡环节。' },
      { anchor:"⌗ 法学 · 文号引用", body:'“国家医保局〔2024〕XX 号文”是占位符，引用链不完整。——建议替换为正式文号（如<b>《国办发〔2019〕2 号》</b>），补齐发文机关与年份。' },
      { anchor:"⌗ 教育 · 问题链 + 评价标准", body:'首题“你最直觉的判断”过宽，“立场迁移度”无可观测锚点。——建议改问“先注意到药价、厂家还是患者反应”；立场迁移度配 <b>3 级行为锚点</b>。' },
      { anchor:"⌗ 数据 · RWE 证据", body:'讨论只有观点，没有集采前后对照数据。——建议接入<b>本院脱敏的集采前后处方对比</b>，并约定可观测的判定标准。' },
    ],
    "ch4-gmp": [
      { anchor:"⌗ 药学 · 现场场景", body:'偏差任务没有具体车间与物理位置，现场感不足。——建议把背景设为<b>某辅料替代后的偏差处置</b>，指明固体制剂线。' },
      { anchor:"⌗ 经管 · 合规成本", body:'只讲合规动作，未呈现偏差处置对成本与上市时间的权衡。——建议加入<b>“停产排查 vs 带条件放行”</b>的决策点。' },
      { anchor:"⌗ 法学 · 通告引用", body:'引用缺年份与通告编号，法规坐标缺失。——建议补<b>近 12 个月飞检通告汇编</b>与 GMP 通则及附录 7。' },
      { anchor:"⌗ 教育 · 锚点 + 评价标准", body:'“找 3 个偏差”过于开放，CAPA 评价无分级锚点。——建议首问改为“6 张照片先看哪 1 张、依据什么”；CAPA 配 <b>3 级行为锚点</b>。' },
      { anchor:"⌗ 数据 · 偏差分布", body:'偏差类型靠抽象列举，无真实分布参照。——建议接入<b>历年飞检通告统计</b>或行业偏差分类公开报告。' },
    ],
    "ch6-supervision": [
      { anchor:"⌗ 药学 · 信号场景", body:'4 份 PSUR 摘要来自不同药品，缺少纵向研判线索。——建议改为<b>同一药品 4 个时段</b>的数据，训练信号跟踪。' },
      { anchor:"⌗ 经管 · 召回决策", body:'任务止于识别风险，未触及召回的成本与品牌信任权衡。——建议增设<b>“企业是否主动召回”</b>的决策讨论。' },
      { anchor:"⌗ 法学 · 病例合规", body:'匿名病例未去标识、未标时间窗口，易被误当当前事件。——建议补齐去标识与时段标注；引用<b>《药品上市后变更管理办法》《ADR 监测办法》</b>。' },
      { anchor:"⌗ 教育 · 锚点 + 评价标准", body:'“先看哪份摘要”平铺直叙，因果评估无锚点。——建议改问“先看安全性还是疗效”；因果评估配 <b>3 级锚点</b>（WHO-UMC / Naranjo）。' },
      { anchor:"⌗ 数据 · 真实样本", body:'信号检测停留在纸面假设。——建议接入 <b>FAERS 或国家 ADR 监测公开数据</b>，给出量化背景。' },
    ],
    "ch8-payment": [
      { anchor:"⌗ 药学 · 临床路径", body:'DRG/DIP 未落到具体病种与临床路径。——建议以一个常见病种走完<b>“医嘱—入组—付费”</b>全链条。' },
      { anchor:"⌗ 经管 · 产业博弈", body:'只讲政策概念，医院与药企两侧的真实博弈缺位。——建议分设<b>“医院药占比”与“药企市场准入”</b>两条任务线。' },
      { anchor:"⌗ 法学 · 数据合规", body:'院内付费数据未脱敏，引用无年份文号。——建议改用<b>国家医保局公开的 DRG 权重表与试点方案</b>，标注年份。' },
      { anchor:"⌗ 教育 · 锚点 + 评价标准", body:'只给分类码做入组推演，过于技术化；“处方合理性”无锚点。——建议加情境“你是医保科长，先按什么标准入组”；配 <b>3 级行为锚点</b>。' },
      { anchor:"⌗ 数据 · 公开统计", body:'付费率靠概念推演，无真实分布。——建议接入<b>医保局公开的 DRG 试点报告</b>与真实付费率分布。' },
    ],
    "cl-ch2-amr": [
      { anchor:"⌗ 药学 · 真实病房", body:'分级管理未锚定具体科室与病原情境。——建议设为<b>“某 ICU 多重耐药菌暴发”</b>的处置任务。' },
      { anchor:"⌗ 经管 · AMS 制度", body:'只讲用药规则，未呈现 AMS 考核对处方行为的反向影响。——建议引入<b>“医院如何设计 AMS 考核”</b>的制度讨论。' },
      { anchor:"⌗ 法学 · 统计合规", body:'院内统计缺时段与样本量，存在以偏概全风险。——建议标注数据时段与样本量；补<b>《抗菌药物临床应用管理办法》</b>及分级文件。' },
      { anchor:"⌗ 教育 · 锚点 + 评价标准", body:'“越级处方”只给定义，微生物匹配评价无锚点。——建议加情境“凌晨 3 点疑似革兰阴性脑膜炎如何决策”；锚点含<b>培养 / MIC 核对</b>。' },
      { anchor:"⌗ 数据 · 耐药趋势", body:'耐药讨论基于教材一般规律，无真实趋势。——建议接入 <b>CHINET 或本院耐药趋势图</b>。' },
    ],
    "cl-ch5-doseopt": [
      { anchor:"⌗ 药学 · TDM 情境", body:'剂量调整无具体药物与患者画像，PK 参数无落点。——建议设为<b>“老年肾功能不全患者万古霉素剂量调整”</b>。' },
      { anchor:"⌗ 经管 · 服务成本", body:'只算剂量，未见 TDM 服务的投入产出权衡。——建议增设<b>“医院如何评估 TDM 项目”</b>的讨论。' },
      { anchor:"⌗ 法学 · 报告合规", body:'TDM 报告作为临床决策依据的合规链条缺失。——建议补<b>《医疗器械临床使用管理办法》与 ISO 15189</b> 相关条款。' },
      { anchor:"⌗ 教育 · 锚点 + 评价标准", body:'采样时点三选一没有决策情境，调整合理性无锚点。——建议改问“第 3 天是否还要测”；锚点含 <b>PK 参数与 CrCl 计算</b>。' },
      { anchor:"⌗ 数据 · 真实关联", body:'调整与结局的关联靠推断。——建议接入<b>本院历年 TDM 数据与治疗结局关联分析</b>。' },
    ],
    "rg-ch3-newdrug": [
      { anchor:"⌗ 药学 · 临床证据", body:'审评推演无真实产品依据。——建议从 <b>CDE 公开审评报告</b>选 1 个产品，走完 IND→NDA 证据链。' },
      { anchor:"⌗ 经管 · 路径成本", body:'只讲路径分类，未呈现路径选择对研发投入与上市时间的影响。——建议增设<b>“路径选择对企业现金流的影响”</b>的权衡讨论。' },
      { anchor:"⌗ 法学 · 资料时效", body:'审评报告缺年份与受理号，存在过期资料风险。——建议补齐年份与受理号，对照<b>《药品注册管理办法》(2020)</b>。' },
      { anchor:"⌗ 教育 · 锚点 + 评价标准", body:'四条路径直选无情境，风险/效益评估无锚点。——建议改问“若为肿瘤靶向药，你争取哪条路径”；配 <b>3 级行为锚点</b>。' },
      { anchor:"⌗ 数据 · 试验信息", body:'试验设计与终点靠转述。——建议接入 <b>ClinicalTrials.gov 与国家临床试验登记平台</b>的真实记录。' },
    ],
    "rg-ch6-pv": [
      { anchor:"⌗ 药学 · 信号场景", body:'PV 体系搭建没有企业规模与风险特征前提。——建议设为<b>“刚获批 1 个 NDA 的中型创新药企”</b>。' },
      { anchor:"⌗ 经管 · 投资定位", body:'PV 只被当作合规成本，未见品牌信任价值。——建议引入<b>“PV 投资如何反哺品牌”</b>的经管讨论。' },
      { anchor:"⌗ 法学 · 规范引用", body:'仅引英文规范，缺本土依据与版本标注。——建议并引 <b>ICH E2E 与《药物警戒质量管理规范》</b>，标注年份版本。' },
      { anchor:"⌗ 教育 · 锚点 + 评价标准", body:'职责边界停留在名词，信号管理无定量锚点。——建议改问“严重 ADR 上报由谁起草”；锚点含 <b>PRR / ROR 定量方法</b>。' },
      { anchor:"⌗ 数据 · 公开数据库", body:'信号检测无真实样本。——建议接入 <b>VigiBase 或国家 ADR 监测系统公开数据</b>。' },
    ],
  });

  function getExpertCommentsForChapter(chapter) {
    if (!chapter) return null;
    const named = EXPERT_CHAPTER_COMMENTS[chapter.id];
    const comments = named || [
      { anchor:`⌗ 药学 · ${chapter.title.split("·")[1]?.trim() || "情境"}`, body:`「${chapter.topic}」未锚定真实药学决策场景，任务背景抽象。——建议把背景写到<b>具体科室 / 门店与决策节点</b>，让学生进入真实角色。` },
      { anchor:"⌗ 经管 · 管理权衡", body:`「${chapter.topic}」的管理权衡未拆开，只见技术执行。——建议引入<b>决策方之间的成本与利益博弈</b>。` },
      { anchor:"⌗ 法学 · 规范引用", body:`引用缺发文机关、年份与文号。——建议补一份 <b>${chapter.topic}</b> 相关公开规范，替换占位文本。` },
      { anchor:"⌗ 教育 · 锚点 + 评价标准", body:'问题链与评价缺可观测锚点，评分主观。——建议关键维度配 <b>3 级行为锚点</b>。' },
      { anchor:"⌗ 数据 · RWE 证据", body:`讨论缺少可核对的数据支撑。——建议接入 <b>${chapter.topic}</b> 相关的 RWE 或公开统计，约定可观测判定标准。` },
    ];
    return comments.map((comment, index) => ({ ...comment, primaryEnvKey: EXPERT_SEED_PRIMARY_ENV_KEYS[index] }));
  }

  function createHelpers({ envByKey, escapeHtml }) {
    if (!envByKey || typeof escapeHtml !== "function") throw new Error("practice-review helpers 缺少 envByKey / escapeHtml");
    function normalizeLiveReview(raw) {
      if (!raw || typeof raw !== "object" || raw.status !== "anchored") return null;
      const annotation = raw.annotation;
      const sourceRevision = Number(raw.sourceRevision);
      if (!annotation || typeof annotation !== "object" || !Number.isInteger(sourceRevision) || sourceRevision < 0
        || !envByKey[annotation.targetEnv] || typeof annotation.issue !== "string" || !annotation.issue.trim()
        || typeof annotation.suggestion !== "string" || !annotation.suggestion.trim()
        || typeof annotation.sourceExcerpt !== "string" || !annotation.sourceExcerpt.trim()) return null;
      return {
        status:"anchored", sourceRevision,
        manuscriptHash:typeof raw.manuscriptHash === "string" ? raw.manuscriptHash : "",
        model:typeof raw.model === "string" ? raw.model : "本机 Qwen",
        promptVersion:typeof raw.promptVersion === "string" ? raw.promptVersion : "",
        orchestrationVersion:typeof raw.orchestrationVersion === "string" ? raw.orchestrationVersion : "",
        generatedAt:typeof raw.generatedAt === "string" ? raw.generatedAt : "",
        attempts:Number.isInteger(Number(raw.attempts)) ? Number(raw.attempts) : 1,
        annotation:{
          targetEnv:annotation.targetEnv,
          segmentKey:typeof annotation.segmentKey === "string" ? annotation.segmentKey : "",
          sourceExcerpt:annotation.sourceExcerpt.trim(),
          sourceHash:typeof annotation.sourceHash === "string" ? annotation.sourceHash : "",
          anchorMethod:typeof annotation.anchorMethod === "string" ? annotation.anchorMethod : "",
          issue:annotation.issue.trim(), suggestion:annotation.suggestion.trim(),
          crossReferences:Array.isArray(annotation.crossReferences) ? annotation.crossReferences
            .filter((ref) => ref?.ok === true && envByKey[ref.targetEnv])
            .map((ref) => ({ ok:true, targetEnv:ref.targetEnv, segmentKey:typeof ref.segmentKey === "string" ? ref.segmentKey : "", sourceExcerpt:typeof ref.sourceExcerpt === "string" ? ref.sourceExcerpt : "", sourceHash:typeof ref.sourceHash === "string" ? ref.sourceHash : "", anchorMethod:typeof ref.anchorMethod === "string" ? ref.anchorMethod : "" })) : [],
        },
      };
    }
    function normalizeUnlocatedReview(raw) {
      if (!raw || typeof raw !== "object" || typeof raw.issue !== "string" || !raw.issue.trim()
        || typeof raw.suggestion !== "string" || !raw.suggestion.trim()
        || typeof raw.gateReason !== "string" || !raw.gateReason.trim()) return null;
      const sourceRevision = Number(raw.sourceRevision);
      return {
        reviewerId:typeof raw.reviewerId === "string" ? raw.reviewerId : "", expertId:typeof raw.expertId === "string" ? raw.expertId : "",
        issue:raw.issue.trim(), suggestion:raw.suggestion.trim(), claimedTargetEnv:envByKey[raw.claimedTargetEnv] ? raw.claimedTargetEnv : "",
        claimedSourceExcerpt:typeof raw.claimedSourceExcerpt === "string" ? raw.claimedSourceExcerpt.trim() : "", gateReason:raw.gateReason.trim(),
        sourceRevision:Number.isInteger(sourceRevision) && sourceRevision >= 0 ? sourceRevision : 0,
        manuscriptHash:typeof raw.manuscriptHash === "string" ? raw.manuscriptHash : "", model:typeof raw.model === "string" ? raw.model : "本机 Qwen",
        promptVersion:typeof raw.promptVersion === "string" ? raw.promptVersion : "", orchestrationVersion:typeof raw.orchestrationVersion === "string" ? raw.orchestrationVersion : "",
        generatedAt:typeof raw.generatedAt === "string" ? raw.generatedAt : "", state:raw.state === "dismissed" ? "dismissed" : "active",
        dismissReason:typeof raw.dismissReason === "string" ? raw.dismissReason.trim() : "",
      };
    }
    const liveReviewSourceText = (review) => `问题：${review.annotation.issue}\n建议：${review.annotation.suggestion}`;
    const liveReviewBodyMarkup = (review) => `<span class="ec-review-line"><b>问题</b><span>${escapeHtml(review.annotation.issue)}</span></span><span class="ec-review-line"><b>建议</b><span>${escapeHtml(review.annotation.suggestion)}</span></span>`;
    const seedReviewBodyMarkup = (body) => {
      const source = String(body || "").trim();
      const suggestionAt = source.search(/(?:——|；)?建议/);
      if (suggestionAt < 0) {
        const actionAt = source.indexOf("；");
        if (actionAt > 0) {
          return `<span class="ec-review-line"><b>问题</b><span>${source.slice(0, actionAt)}</span></span><span class="ec-review-line"><b>建议</b><span>${source.slice(actionAt + 1)}</span></span>`;
        }
        return `<span class="ec-review-line"><b>观察</b><span>${source}</span></span>`;
      }
      const issue = source.slice(0, suggestionAt).replace(/[—；，、：\s]+$/u, "");
      const suggestion = source.slice(suggestionAt).replace(/^[—；\s]+/u, "").replace(/^建议/u, "").replace(/^[：:\s]+/u, "");
      return `${issue ? `<span class="ec-review-line"><b>问题</b><span>${issue}</span></span>` : ""}<span class="ec-review-line"><b>建议</b><span>${suggestion}</span></span>`;
    };
    function liveReviewAnchorCopy(review) { const env=envByKey[review.annotation.targetEnv]; const segment=review.annotation.segmentKey ? ` · ${review.annotation.segmentKey}` : ""; return `⌗ ${env?.no || review.annotation.targetEnv} ${env?.short || ""}${segment}`; }
    const liveReviewTargetKeys = (review) => [...new Set([review.annotation.targetEnv, ...review.annotation.crossReferences.map((ref) => ref.targetEnv)].filter((key) => envByKey[key]))];
    function liveReviewFailureCopy(reason, hasPriorReview=false) {
      const copies={ out_of_scope:"模型把意见落到了教学设计主责范围之外。", wrong_env:"模型摘录来自另一个环节，未通过跨环节核对。", ambiguous:"同一摘录在稿件中出现多次，无法确定唯一位置。", ambiguous_env:"短摘录在多个环节重复出现，无法确定唯一位置。", too_short:"模型摘录过短，不足以形成可靠锚点。", not_found:"模型摘录未逐字命中当前稿件。", cross_reference_unanchored:"交叉引用没有全部命中当前稿件。", issue_too_long:"模型的问题描述超过 60 字凝练上限。", suggestion_too_long:"模型的修改建议超过 70 字凝练上限。" };
      return `${copies[reason] || "模型输出未通过锚定门禁。"}${hasPriorReview ? "现有批注未被替换；若其已过期，仍不能进入候选。" : "系统已保留固定审校种子。"}`;
    }
    return Object.freeze({ normalizeLiveReview, normalizeUnlocatedReview, liveReviewSourceText, liveReviewBodyMarkup, seedReviewBodyMarkup, liveReviewAnchorCopy, liveReviewTargetKeys, liveReviewFailureCopy });
  }

  function createDossierRenderer({ envMeta, escapeHtml }) {
    if (!Array.isArray(envMeta) || typeof escapeHtml !== "function") throw new Error("practice-review dossier 缺少 envMeta / escapeHtml");
    const envByKey = Object.fromEntries(envMeta.map((env) => [env.key, env]));
    const segments = global.PharmacoPracticeSegments;
    if (!segments?.splitSegments) throw new Error("practice-review dossier 缺少统一分段契约");

    const primaryEnvKey = (entry) => entry.liveReview?.annotation?.targetEnv
      || entry.seedComment?.primaryEnvKey || entry.targetEnvKeys?.[0] || "env05";

    function reviewNote(entry, marker) {
      const e = entry.expert;
      const live = entry.liveReview;
      const primary = primaryEnvKey(entry);
      const primaryMeta = envByKey[primary];
      const targetOptions = envMeta.map((env) => `<label class="ec-target-chip"><input type="checkbox" data-ec-role="target-input" value="${env.key}" ${entry.targetEnvKeys.includes(env.key) ? "checked" : ""}/><span>${env.no} ${env.short}</span></label>`).join("");
      const anchorCopy = live
        ? `精确批注 · ${primaryMeta?.no || primary}`
        : `模板建议落点 · ${primaryMeta?.no || primary} ${primaryMeta?.short || ""}`;
      const markerCopy = live ? marker : "⌗";
      const card = document.createElement("article");
      card.className = `review-note expert-card ${e.ec}`;
      card.dataset.expertId = e.id;
      card.innerHTML = `
        <div class="ec-head">
          <div class="review-note-marker${live ? "" : " is-seed"}" aria-hidden="true">${markerCopy}</div>
          <div class="ec-who">${escapeHtml(e.role)}<small>${escapeHtml(e.persona)}</small></div>
          <span class="review-anchor-kind">${escapeHtml(anchorCopy)}</span>
        </div>
        <div class="ec-body" data-ec-role="body"></div>
        <details class="review-note-meta">
          <summary><span>定位与运行信息</span><small>锚点、稿件版本、观察环节</small></summary>
          <div class="review-note-meta-body">
            <div class="ec-func">职能 · ${escapeHtml(e.func)}</div>
            <div class="ec-live-review" data-ec-role="live-review" data-state="seed">
              <span class="ec-live-status" data-ec-role="live-status">固定审校种子</span>
              <button type="button" data-review-act="live">用本机 Qwen 审校</button>
              <span class="ec-live-error" data-ec-role="live-error" role="alert" hidden></span>
            </div>
            <span class="ec-anchor" title="${live ? escapeHtml(live.annotation.sourceExcerpt) : ""}">${live ? escapeHtml(entry.sourceComment.anchor) : escapeHtml(entry.seedComment.anchor)}</span>
            <details class="ec-target-picker"><summary>观察环节 · <span class="ec-target-summary" data-ec-role="target-summary"></span></summary><div class="ec-target-grid">${targetOptions}</div></details>
            <details class="ec-inject review-inject"><summary class="ec-inject-lbl">自定义数据源</summary><div class="ec-inject-acts"><button type="button" class="ec-inject-btn" data-act="upload" title="${escapeHtml(e.inject.upload)}">上传</button><button type="button" class="ec-inject-btn" data-act="link" title="${escapeHtml(e.inject.link)}">链接</button><button type="button" class="ec-inject-btn" data-act="distill" title="${escapeHtml(e.inject.distill)}">蒸馏</button></div></details>
          </div>
        </details>`;
      return card;
    }

    function manuscript(entryList, envKey, packText, markerByExpert) {
      const ranges = segments.splitSegments(packText || "");
      const anchors = entryList.filter((entry) => entry.liveReview?.annotation?.sourceExcerpt && packText.includes(entry.liveReview.annotation.sourceExcerpt)).map((entry) => {
        const start = packText.indexOf(entry.liveReview.annotation.sourceExcerpt);
        return { start, end:start + entry.liveReview.annotation.sourceExcerpt.length, marker:markerByExpert.get(entry.expertId) };
      });
      if (!ranges.length) return '<p class="review-segment is-empty">当前环节暂无正文</p>';
      return ranges.map((range) => {
        const hits = anchors.filter((anchor) => range.start < anchor.end && range.end > anchor.start);
        return `<p class="review-segment${hits.length ? " is-anchored" : ""}">${escapeHtml(range.text)}${hits.map((hit) => `<span class="review-segment-marker">${hit.marker}</span>`).join("")}</p>`;
      }).join("");
    }

    function render({ root, indexRoot, entries, pack, mode = "env" }) {
      if (!root) return;
      const markerByExpert = new Map(entries.map((entry, index) => [entry.expertId, String.fromCharCode(65 + index)]));
      entries.forEach((entry) => { entry.card = null; });
      if (indexRoot) {
        indexRoot.hidden = mode !== "env";
        indexRoot.innerHTML = envMeta.map((env) => {
          const count = entries.filter((entry) => primaryEnvKey(entry) === env.key).length;
          return `<button type="button" data-review-env="${env.key}" class="${count ? "has-note" : ""}" ${count ? "" : 'disabled aria-label="' + escapeHtml(env.no + " " + env.short + "：本轮无批注") + '"'}><b>${env.no}</b><span>${escapeHtml(env.short)}</span>${count ? `<em>${count}</em>` : ""}</button>`;
        }).join("");
      }
      root.classList.toggle("is-discipline-mode", mode === "discipline");
      root.innerHTML = "";
      if (mode === "discipline") {
        entries.forEach((entry) => {
          const env = envByKey[primaryEnvKey(entry)];
          const group = document.createElement("section");
          group.className = "review-discipline-group";
          group.innerHTML = `<header><b>${escapeHtml(entry.expert.role)}</b><span>${escapeHtml(entry.expert.persona)} · 主落点 ${env?.no || "—"} ${escapeHtml(env?.short || "")}</span></header><div class="review-discipline-note"></div>`;
          const note = reviewNote(entry, markerByExpert.get(entry.expertId));
          group.querySelector(".review-discipline-note").appendChild(note);
          entry.card = note;
          root.appendChild(group);
        });
        return;
      }
      const quietEnvs = envMeta.filter((env) => !entries.some((entry) => primaryEnvKey(entry) === env.key));
      if (quietEnvs.length) {
        const quiet = document.createElement("section");
        quiet.className = "review-empty-summary";
        quiet.innerHTML = `<span>本轮无批注</span><div>${quietEnvs.map((env) => `<b>${env.no}</b>`).join("")}</div><small>已检查，不在主阅读区重复展开</small>`;
        root.appendChild(quiet);
      }
      envMeta.forEach((env) => {
        const list = entries.filter((entry) => primaryEnvKey(entry) === env.key);
        if (!list.length) return;
        const sheet = document.createElement("section");
        sheet.className = "review-env-sheet";
        sheet.id = `review-env-${env.key}`;
        const packText = pack?.[env.key] || "";
        const sourceRanges = segments.splitSegments(packText);
        const sourcePreview = sourceRanges[0]?.text || "当前环节暂无正文";
        const exactAnchors = list.filter((entry) => entry.liveReview?.annotation?.sourceExcerpt && packText.includes(entry.liveReview.annotation.sourceExcerpt)).length;
        const sourceState = exactAnchors ? `${exactAnchors} 处精确锚定` : "模板落点 · 等待锚定";
        sheet.innerHTML = `<header class="review-env-head"><span class="review-env-no">${env.no}</span><div><h5>${escapeHtml(env.short)}</h5><small>${list.length} 条审校重点 · 先读问题与建议</small></div></header><aside class="review-margin"><div class="review-margin-head"><span>本环节重点</span><b>${list.length} 条</b></div></aside><details class="review-source-details"><summary><span>原稿依据</span><b>${sourceState}</b><small>${escapeHtml(sourcePreview)}</small><em>展开原稿</em></summary><div class="review-manuscript">${manuscript(list, env.key, packText, markerByExpert)}</div></details>`;
        const margin = sheet.querySelector(".review-margin");
        list.forEach((entry) => {
          const note = reviewNote(entry, markerByExpert.get(entry.expertId));
          entry.card = note;
          margin.appendChild(note);
        });
        root.appendChild(sheet);
      });
    }
    return Object.freeze({ render });
  }

  global.PharmacoPracticeReview = Object.freeze({ EXPERTS, EXPERT_SEED_PRIMARY_ENV_KEYS, getExpertCommentsForChapter, createHelpers, createDossierRenderer });
})(window);
