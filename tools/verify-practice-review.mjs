import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";

const root = resolve(import.meta.dirname, "..");
const page = readFileSync(resolve(root, "practice-detail.html"), "utf8");
const runtime = readFileSync(resolve(root, "shared/practice-runtime.js"), "utf8");
const contract = readFileSync(resolve(root, "shared/practice-runtime-contract.js"), "utf8");
const backendClient = readFileSync(resolve(root, "shared/backend-client.js"), "utf8");
const segmentContract = readFileSync(resolve(root, "shared/practice-segments.js"), "utf8");
const reviewDomain = readFileSync(resolve(root, "shared/practice-review.js"), "utf8");
const metaverseCore = readFileSync(resolve(root, "shared/mv-classroom-core.js"), "utf8");
const metaverse2d = readFileSync(resolve(root, "shared/metaverse-classroom.js"), "utf8");
const metaverse3d = readFileSync(resolve(root, "shared/metaverse-classroom-3d.js"), "utf8");
const reviewContext = { window: {} };
vm.runInNewContext(reviewDomain, reviewContext, { filename: "practice-review.js" });
const reviewApi = reviewContext.window.PharmacoPracticeReview;
assert.equal(reviewApi.EXPERTS.length, 5, "独立审校域必须保留五路定义");
for (const chapterId of ["ch5-procurement", "ch4-gmp", "ch6-supervision", "ch8-payment", "cl-ch2-amr", "cl-ch5-doseopt", "rg-ch3-newdrug", "rg-ch6-pv"]) {
  assert.equal(reviewApi.getExpertCommentsForChapter({ id: chapterId, title: "测试 · 章节", topic: "测试课题" }).length, 5, `审校种子迁移漏掉章节：${chapterId}`);
}
const fallbackComments = reviewApi.getExpertCommentsForChapter({ id: "unknown", title: "测试 · 章节", topic: "测试课题" });
assert.equal(fallbackComments.map((item) => item.primaryEnvKey).join(","), "env05,env08,env04,env05,env04", "模板建议落点发生漂移");

// 审校内容质量门禁（2026-08 凝练版）：
// 每条种子必须能拆成非空「问题 + 建议」；问题必须是具体缺口（不得写成肯定句残留逗号），
// 建议必须是可执行动作；两者都须凝练。旧的错误表述不得回潮。
{
  const stripTags = (s) => String(s || "").replace(/<[^>]+>/g, "");
  const chapterIds = ["mp-ch3-environment", "ch5-procurement", "ch4-gmp", "ch6-supervision", "ch8-payment", "cl-ch2-amr", "cl-ch5-doseopt", "rg-ch3-newdrug", "rg-ch6-pv", "unknown"];
  for (const chapterId of chapterIds) {
    const comments = reviewApi.getExpertCommentsForChapter({ id: chapterId, title: "测试 · 章节", topic: "测试课题" });
    for (const comment of comments) {
      const body = comment.body;
      assert.match(body, /——建议/, `${chapterId} 种子未使用「问题——建议」结构：${stripTags(body).slice(0, 24)}…`);
      const suggestionAt = body.search(/(?:——|；)?建议/);
      const issue = stripTags(body.slice(0, suggestionAt)).replace(/[—；，、：\s]+$/u, "");
      const suggestion = stripTags(body.slice(suggestionAt)).replace(/^[—；\s]+/u, "").replace(/^建议/u, "").replace(/^[：:\s]+/u, "");
      assert.ok(issue.length >= 8 && issue.length <= 60, `${chapterId} 问题须凝练（8–60 字），实得 ${issue.length}：${issue}`);
      assert.ok(suggestion.length >= 8 && suggestion.length <= 80, `${chapterId} 建议须凝练（8–80 字），实得 ${suggestion.length}：${suggestion}`);
      assert.ok(!/[，、：；]$/.test(issue), `${chapterId} 问题不得以逗号/冒号结尾：${issue}`);
    }
  }
  assert.equal(reviewDomain.includes("内部可控能力 W"), false, "SWOT 术语错误表述回潮：内部可控能力 W");
}

// 模型审校表达规则：prompt 必须含缺口句式与字数上限，promptVersion 升级使旧缓存失效
const agentsSource = readFileSync(resolve(root, "server/agents.mjs"), "utf8");
assert.match(agentsSource, /表达规则：/, "审校 prompt 缺少表达规则段");
assert.match(agentsSource, /不超过 60 字/, "审校 prompt 缺少 issue 字数上限");
assert.match(agentsSource, /不超过 70 字/, "审校 prompt 缺少 suggestion 字数上限");
assert.match(agentsSource, /禁止写成肯定句/, "审校 prompt 未禁止 issue 写成肯定句");
assert.equal(/-v\d+-concise"/.test(agentsSource), true, "审校 promptVersion 未升级到凝练版");
assert.equal(agentsSource.includes("-swot-fidelity"), false, "旧 promptVersion 残留");

for (const obsolete of ["5 类专家", "5 学科专家", "5 位领域专家", "试错已验证"]) {
  assert.equal(page.includes(obsolete), false, `practice-detail.html 仍含旧口径：${obsolete}`);
}

for (const label of ["药学情境审校", "管理决策审校", "法规合规审校", "教学设计审校", "数据循证审校"]) {
  assert.equal(reviewDomain.includes(`role:"${label}"`), true, `缺少审校标注：${label}`);
}

for (const discipline of ["临床药学", "药事管理与卫生经济", "药事法规与监管", "课程与评价", "数据科学与真实世界证据"]) {
  assert.equal(reviewDomain.includes(`persona:"${discipline}"`), true, `缺少简洁学科标注：${discipline}`);
}
assert.equal(reviewDomain.includes('persona:"学科视角 ·'), false, "审校卡副标题仍重复“视角”");

for (const required of [
  "PRACTICE_ENV_META",
  "SLOT_TO_ENV_KEYS",
  "slotForReviewTarget",
  "inferReviewTargetEnvKeys",
  'entry.state === "candidate" && entry.decision === "supported"',
  "suggestedEvidenceIdsForEntry",
  "readMetaverseKeyMoments",
  "pp.practice.keyMoments.v1",
  "originalEnvContent",
  "candidateMode",
  "captureOriginalEnvContent",
  "renderLoopClose",
  "教师确认支持",
  "证据不足",
  "暂不修改的原因",
]) {
  assert.equal(runtime.includes(required), true, `缺少教学实践审校逻辑：${required}`);
}

assert.equal(runtime.includes("EXPERT_SLOT_MAP"), false, "仍存在按专家身份硬编码的 slot 映射");
assert.equal(runtime.includes("ingestExistingComments"), false, "仍存在旧的评阅采纳流");
assert.match(runtime, /entry\.originalEnvContent\?\.\[key\]/, "教师决策卷宗未使用冻结的原文快照");
assert.match(contract, /originalEnvContent/, "运行时契约未记录原文快照字段");
assert.equal(contract.includes("mustReply"), false, "运行时契约仍使用旧的采纳/回复门禁");
assert.match(contract, /只建议关联，不自动验证/);
assert.match(contract, /preEvidenceReadOnly/, "运行时契约未冻结证据前只读时序");
assert.match(contract, /candidateMode 必须保持 null/, "运行时契约未明确证据前禁止候选状态迁移");
assert.match(contract, /postEvidenceSingleDecision/, "运行时契约未冻结证据后统一判断时序");
assert.match(contract, /COMMENT_SCHEMA 字段保持不变/, "运行时契约未声明数据模型保持不变");
assert.match(page, /系统先匹配相关试教记录，具体怎么处理由教师决定/);
assert.match(backendClient, /function backendAutoSyncEnabled\(\)/);
assert.match(backendClient, /phase: "browser"/);
assert.match(backendClient, /if \(backendAutoSyncEnabled\(\)\)/);
assert.equal(/<body\b[^>]*data-backend-enabled/.test(page), false, "静态 HTML 不应默认启用后端探测");
assert.match(page, /practice-segments\.js\?v=review-dossier-v1/, "页面未加载统一实践包分段契约");
assert.match(page, /practice-review\.js\?v=review-domain-v7-concise/, "页面未加载凝练版审校卷宗模块");
assert.match(runtime, /Review\.createHelpers/, "运行时未通过显式接口接入审校域");
assert.match(runtime, /Review\.createDossierRenderer/, "运行时未通过独立审校域创建卷宗渲染器");
assert.match(reviewDomain, /function createDossierRenderer\(/, "独立审校域缺少卷宗渲染器");
assert.match(reviewDomain, /review-empty-summary/, "无批注环节仍未压缩为摘要");
assert.match(reviewDomain, /review-source-details/, "原稿没有收入按需展开的证据区");
assert.match(reviewDomain, /review-note-meta/, "锚点、版本与观察环节没有收入二级信息");
assert.match(reviewDomain, /seedReviewBodyMarkup/, "固定审校种子未拆分为问题与建议");
assert.match(segmentContract, /·\|；\|;/, "统一分段契约未覆盖教师编辑允许的三类分隔符");

// Stage 2c: 卷宗仍保留两种只读投影，但候选处理必须搬到试教后统一判断列表。
assert.match(runtime, /renderExpertDossier\(chapter\);/, "Stage II 未启用卷宗渲染入口");
assert.equal(runtime.includes("function renderExpertCards("), false, "已退役的五卡渲染器仍留在运行时");
assert.equal(runtime.includes("renderExpertCards(chapter);"), false, "Stage II 仍调用已退役的五卡渲染器");
for (const hook of [
  'data-review-view="env"',
  'data-review-view="discipline"',
  'data-ec-role="env-index"',
  'data-ec-role="unlocated-basket"',
  'data-ec-role="verdict-band"',
  'data-review-surface="drawer"',
  'data-review-role="focus-summary"',
]) {
  assert.equal(page.includes(hook), true, `卷宗视图缺少语义钩子：${hook}`);
}
assert.match(page, /修改实践包会提升修订号，并使本轮模型批注变为“针对旧稿”/, "回 Stage I 编辑缺少作废批注警示");
assert.match(runtime, /不能进入修订候选/, "未定位意见未明确禁止绕过锚定门禁");

// Stage 1a: review behavior must use semantic hooks so Stage II can move the dossier off-canvas safely.
assert.equal((page.match(/data-ec-role="grid"/g) || []).length, 1, "Stage II 缺少唯一的审校网格钩子");
const reviewSurfaceSources = `${runtime}\n${reviewDomain}`;
for (const role of ["target-input", "body", "edit-panel", "target-summary", "evidence-list", "decision-note", "reject-panel", "resolution", "resolution-picker", "resolution-summary", "candidate-error"]) {
  assert.equal(reviewSurfaceSources.includes(`data-ec-role="${role}"`), true, `缺少审校行为钩子：${role}`);
}
for (const oldSelector of [
  '#stage-ii .expert-grid',
  '.ec-body',
  '.ec-edit-panel',
  '.ec-target-summary',
  '.ec-target-chip input',
  '.ec-evidence-list',
  '.ec-decision-note',
  '.ec-reject-panel',
  '.substage:nth-of-type(1)',
]) {
  const escaped = oldSelector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  assert.equal(new RegExp(`querySelector(?:All)?\\(["']${escaped}`).test(runtime), false, `运行时仍使用脆弱选择器：${oldSelector}`);
}
assert.match(page, /data-adopt-bar="km"/, "关键时刻摘要栏缺少语义钩子");
assert.match(runtime, /#stage-ii \[data-adopt-bar="km"\]/, "关键时刻摘要仍未改用语义钩子");
assert.equal(runtime.includes('document.querySelectorAll("#stage-ii .adopt-bar")[1]'), false, "关键时刻摘要仍依赖位置下标");

// Stage 1b: 三种处理命令只允许出现在试教后的判断列表；卷宗本身不承载决策。
for (const copy of ["按建议修改", "调整后修改", "暂不修改", "改判"]) {
  assert.equal(reviewSurfaceSources.includes(copy), true, `缺少 Stage 1b 候选处理文案：${copy}`);
}
assert.equal(runtime.includes("本次试教中发生了什么"), false, "试教后处理卡仍保留冗长的证据问句");
assert.equal(runtime.includes("结合本次试教，你准备如何处理这条建议"), false, "试教后处理卡仍保留冗长的决策问句");
assert.match(runtime, /data-source-act="toggle"/, "完整审校建议缺少按需展开入口");
assert.match(runtime, /data-note-act="toggle"/, "可选补充说明仍未改为按需展开");
assert.match(runtime, /class="review-verdict-workspace"/, "五路审校仍未收束为主从式工作台");
assert.match(runtime, /data-review-select=/, "审校工作台缺少可切换的五路索引");
assert.match(runtime, /state\.activeVerdictExpertId/, "审校工作台未记录当前聚焦意见");
assert.match(runtime, /reviewVerdictPriority\(/, "默认聚焦未优先考虑待处理且已有证据的建议");
assert.match(runtime, /detail\.hidden = !selected/, "切换审校时未保证只展开当前一路");
assert.match(page, /\.review-verdict-row\.is-posttrial\[hidden\]/, "非当前审校缺少可靠的隐藏样式");
assert.match(page, /一次聚焦一条 · 五路意见均保留/, "试教后处理区未解释主从式呈现规则");
assert.match(runtime, /记录编号 KM-/, "关键时刻内部编号未降级到证据详情");
assert.equal(runtime.includes('data-decision="supported"'), false, "教师仍需在处理方式之外重复选择支持状态");
assert.match(runtime, /entry\.decision = "supported"/, "一次处理动作未映射到后台支持状态");
assert.match(runtime, /candidateMode: entry\.candidateMode/, "候选类型未持久化");
assert.match(contract, /candidateMode/, "运行时契约未记录候选类型");
assert.equal(reviewDomain.includes('data-review-choice="original"'), false, "审校卷宗仍藏有证据前候选决策入口");
assert.match(runtime, /function hasTrialEvidence\(/, "运行时缺少统一的仿真证据门禁");
assert.match(runtime, /证据出现前只能阅读审校与标记观察点/, "运行时未阻止证据前状态迁移");
assert.equal(runtime.includes('data-review-act="candidate"'), false, "旧的候选切换命令仍在");
assert.equal(runtime.includes('data-review-act="edit"'), false, "旧的独立编辑命令仍在");
assert.equal(runtime.includes(".ec-acts"), false, "旧的三按钮样式仍在运行时");
assert.equal(page.includes(".ec-acts"), false, "旧的三按钮样式仍在页面 CSS");
assert.match(runtime, /entry\.decisionNote = event\.target\.value\.trim\(\);[\s\S]{0,180}renderMigrate\(\);[\s\S]{0,80}renderStage3\(\);/, "教师判断依据未同步刷新修订摘要");
assert.match(page, /practice-runtime\.js\?v=41-env-hotspot/, "practice runtime 缓存版本未更新");
assert.match(page, /practice-runtime-contract\.js\?v=trial-first-v6-single-decision/, "practice runtime contract 缓存版本未更新");
assert.match(page, /mv-classroom-core\.js\?v=2-swot-context/, "虚拟班核心缓存版本未更新");
assert.match(page, /metaverse-classroom\.js\?v=21-recovery-first/, "2.5D 虚拟班缓存版本未更新");
assert.match(page, /metaverse-classroom-3d\.js\?v=21-recovery-first/, "3D 虚拟班缓存版本未更新");
assert.match(page, /backend-client\.js\?v=7-structured-pack/, "backend client 缓存版本未更新");
assert.match(metaverse3d, /mount\.closest\("#stage-ii"\) \|\| mount/, "3D 虚拟班未改为进入 Stage II 即挂载");
assert.match(metaverse3d, /function setLifecycle\(state, reason\)/, "3D 虚拟班缺少统一生命周期状态机");
assert.match(metaverse3d, /setLifecycle\("active"\)/, "3D 成功挂载后未结束 pending 状态");
assert.match(metaverse3d, /setLifecycle\("fallback", reason\)/, "3D 失败回退未留下可诊断状态");
assert.match(metaverse3d, /3D 初始化失败/, "3D 初始化中途异常仍可能留下空白挂载点");
assert.match(metaverse3d, /webglcontextlost/, "3D 虚拟班未处理 WebGL 上下文丢失");
assert.match(metaverse3d, /webglcontextrestored/, "3D 虚拟班未监听 WebGL 上下文恢复");
assert.match(metaverse3d, /beginContextRecovery\(event\)/, "WebGL 丢失后仍未进入恢复优先流程");
assert.match(metaverse3d, /CONTEXT_RECOVERY_MS = 3000/, "3D 恢复窗口缺少明确上限");
assert.match(metaverse3d, /setLifecycle\("recovering"/, "3D 恢复中状态未对外可见");
assert.match(metaverse3d, /failContextRecovery\("WebGL 恢复超时"\)/, "3D 恢复超时后未进入最终回退");
assert.equal(/onContextLost\s*=\s*\(event\)[\s\S]{0,220}fallback2D\(/.test(metaverse3d), false, "WebGL 丢失仍直接跳过恢复窗口进入 2.5D");
assert.match(metaverse3d, /dispose\(\) \{/, "3D 回退前未释放动画与渲染资源");
assert.match(metaverse2d, /mount\.className = "mv-root"/, "2.5D 回退未清除残留 3D 根样式");
assert.match(metaverse2d, /id="mv-retry-3d"/, "2.5D 回退界面缺少重试 3D 入口");
assert.equal(/window\.__MV3D_ACTIVE = true;\s*const MV/.test(metaverse3d), false, "3D 仍在初始化成功前提前声明 active");
assert.equal(page.includes("泛雅"), false, "教学实践页仍与泛雅平台耦合");
assert.ok(page.indexOf('id="mv-classroom"') < page.indexOf('data-review-surface="drawer"'), "Stage II 主轴未从审校还给虚拟班试教");
assert.match(runtime, /function maybeAutoRunLiveReviews\(/, "Stage II 缺少后端 ready 后的自动五路审校");

// 动态派生关键时刻会替换整组卡片；录播捕获态必须重新绑定新节点。
assert.match(runtime, /practice:keymoments-rendered/, "关键时刻重绘后未广播状态重绑定事件");
assert.match(runtime, /function registerMetaverseMomentSync\(/, "运行时未订阅录播时间以自动记录关键时刻");
assert.match(runtime, /mv\.onTime\(\(rawT\) =>/, "关键时刻未随录播时间自动同步");
assert.match(runtime, /isInitialCallback && tSec <= 0 && state\.keyMoments\.length/, "播放器初始化可能误清已保存证据");
assert.match(runtime, /showEvidenceGate\("这条建议尚未关联/, "候选被证据门禁拦截时缺少页内可见反馈");
assert.match(runtime, /function deriveKeyMoments\([\s\S]{0,1200}updateBottomAdoptBar\(\);/, "手动重新同步后底部关键时刻计数未刷新");
assert.match(page, /function bindCards\(\)/, "关键时刻录播控制器缺少动态卡片重绑定");
assert.match(page, /addEventListener\('practice:keymoments-rendered', bindCards\)/, "关键时刻重绘事件未接入录播控制器");
assert.match(page, /\.km-card\.is-captured\{ filter: saturate\(1\) opacity\(1\); \}/, "已捕获关键时刻未恢复完整色彩");

// 当前默认章节是 SWOT/TOWS，静态首屏、章节脚本与 2.5D/3D 仿真必须使用同一案例语境。
assert.match(runtime, /"mp-ch3-environment": \[/, "SWOT 章节缺少独立问题链脚本");
assert.match(runtime, /T-SWOT\/TOWS 环境分析类/, "SWOT 章节缺少对应资产模板类型");
assert.match(page, /SWOT 内外部边界出现结构性分歧/, "关键时刻静态首屏仍未切换到 SWOT 语境");
assert.match(metaverseCore, /SWOT 内外部边界分歧/, "虚拟班核心未切换到 SWOT 语境");
assert.match(metaverse2d, /SWOT 内外部边界/, "2.5D 虚拟班未切换到 SWOT 语境");
assert.match(metaverse3d, /SWOT <b>内外部边界<\/b>/, "3D 虚拟班未切换到 SWOT 语境");
assert.match(runtime, /function isLegacyProcurementMomentSet\(/, "缺少旧集采关键时刻识别逻辑");
assert.match(runtime, /global\.addEventListener\("mv:ready", replayMigratedKeyMoments\)/, "旧记录未在虚拟班就绪后自动重演");
assert.match(runtime, /旧集采仿真记录已失效/, "旧记录迁移缺少明确提示");
assert.match(reviewDomain, /"mp-ch3-environment": \[/, "SWOT 章节缺少专用五路固定审校建议");
assert.match(runtime, /REVIEW_CONTEXT_VERSION = "management-swot-review-v2"/, "旧 SWOT 审校记录未设置一次性失效版本");
assert.match(runtime, /function reviewAlignmentError\(/, "真实审校缺少章节语境门禁");
for (const obsolete of ["成本可及 vs 患者连续性", "原研 → 仿制", "反对替代", "支持替代", "集采替代讨论课"]) {
  assert.equal(`${metaverseCore}\n${metaverse2d}\n${metaverse3d}\n${page}`.includes(obsolete), false, `默认 SWOT 仿真仍含旧集采语境：${obsolete}`);
}

// Stage 2b: 五路审校全部接入真模型——scope 隔离职责,已有锚点提示 + 并发 2 批量扇出,
// 后端未连接时保留固定种子，未锚定结果进入独立记录。(2026-08-01 由 Stage 2a 单路升级)
assert.equal((reviewSurfaceSources.match(/<button[^>]+data-review-act="live"/g) || []).length, 1, "真实审校入口必须只渲染一个按钮模板");
assert.equal(runtime.includes('e.id === "expert-edu" ?'), false, "真实审校入口不应再限定到教学设计卡");
for (const reviewerId of ["pharmacy-context", "management-tradeoff", "regulatory-citation", "instructional-design", "evidence-metrics"]) {
  assert.equal(reviewDomain.includes(`reviewerId:"${reviewerId}"`), true, `缺少五路审校 reviewerId：${reviewerId}`);
}
assert.match(runtime, /function collectAvoidAnchors\(/, "五路扇出缺少段落避让收集");
assert.match(runtime, /LIVE_REVIEW_CONCURRENCY = 2/, "批量审校未把并发上限定为 2");
assert.match(runtime, /data-review-act="run-all"/, "运行时缺少五路批量审校入口");
assert.match(page, /data-review-act="run-all"/, "页面缺少五路批量审校控件");
assert.match(runtime, /liveReviewDupNote/, "同环节批注缺少共同关注标注");

// 跨学科关注热点（第一期）：聚类键只用 envId；只有 ready 意见进热点，
// 种子/进行中/降级只作观察重点；页面不得再出现“同段”或无条件“共识”。
assert.match(runtime, /function buildEnvReviewProjection\(/, "缺少环节热点投影");
assert.match(runtime, /function liveReviewState\(/, "缺少五路状态归一函数");
assert.match(runtime, /共同关注/, "热点标签未切换为共同关注");
assert.match(runtime, /跨学科关注热点/, "摘要行缺少跨学科关注热点口径");
assert.equal(runtime.includes("同段"), false, "运行时仍含“同段”旧口径");
assert.equal(page.includes("同段"), false, "页面仍含“同段”旧口径");
assert.match(runtime, /readyReviewCount === total[\s\S]{0,200}各学科关注点分布在不同环节/, "全部完成无热点时缺少分散态文案");
assert.match(runtime, /路显示预置观察重点/, "降级路未与实时审校完成数分轨");
assert.match(page, /review-focus-env/, "右栏缺少环节热点展开结构");
assert.match(runtime, /entry\.expert\?\.scopeCopy/, "各卡重审按钮未标注学科主责范围");
assert.match(runtime, /getPackRevision\(entry\.chapterId/, "真实审校未比较稿件修订号");
assert.match(runtime, /该批注针对旧版稿件/, "旧版批注未被阻止进入候选");
assert.match(runtime, /result\?\.status !== "anchored"/, "未锚定模型输出可能进入审校卡");
assert.match(runtime, /liveReview: entry\.liveReview/, "真实审校结果未持久化");
assert.match(contract, /anchorGate/, "运行时契约缺少锚定与旧稿门禁");
assert.match(backendClient, /function reviewPractice\(options\)/, "后端客户端缺少单卡审校接口");

console.log("verify-practice-review: ok");
