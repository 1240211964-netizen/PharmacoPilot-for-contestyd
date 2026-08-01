import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const page = readFileSync(resolve(root, "practice-detail.html"), "utf8");
const runtime = readFileSync(resolve(root, "shared/practice-runtime.js"), "utf8");
const contract = readFileSync(resolve(root, "shared/practice-runtime-contract.js"), "utf8");
const backendClient = readFileSync(resolve(root, "shared/backend-client.js"), "utf8");

for (const obsolete of ["5 类专家", "5 学科专家", "5 位领域专家", "试错已验证"]) {
  assert.equal(page.includes(obsolete), false, `practice-detail.html 仍含旧口径：${obsolete}`);
}

for (const label of ["药学情境审校", "管理决策审校", "法规合规审校", "教学设计审校", "数据循证审校"]) {
  assert.equal(runtime.includes(`role: "${label}"`), true, `缺少审校标注：${label}`);
}

for (const discipline of ["临床药学", "药事管理与卫生经济", "药事法规与监管", "课程与评价", "数据科学与真实世界证据"]) {
  assert.equal(runtime.includes(`persona: "${discipline}"`), true, `缺少简洁学科标注：${discipline}`);
}
assert.equal(runtime.includes('persona: "学科视角 ·'), false, "审校卡副标题仍重复“视角”");

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
  "不采用原因",
]) {
  assert.equal(runtime.includes(required), true, `缺少教学实践审校逻辑：${required}`);
}

assert.equal(runtime.includes("EXPERT_SLOT_MAP"), false, "仍存在按专家身份硬编码的 slot 映射");
assert.equal(runtime.includes("ingestExistingComments"), false, "仍存在旧的评阅采纳流");
assert.match(runtime, /entry\.originalEnvContent\?\.\[key\]/, "教师决策卷宗未使用冻结的原文快照");
assert.match(contract, /originalEnvContent/, "运行时契约未记录原文快照字段");
assert.equal(contract.includes("mustReply"), false, "运行时契约仍使用旧的采纳/回复门禁");
assert.match(contract, /只建议关联，不自动验证/);
assert.match(page, /系统只建议关联，是否支持修订由教师判断/);
assert.match(backendClient, /function backendAutoSyncEnabled\(\)/);
assert.match(backendClient, /phase: "browser"/);
assert.match(backendClient, /if \(backendAutoSyncEnabled\(\)\)/);
assert.equal(/<body\b[^>]*data-backend-enabled/.test(page), false, "静态 HTML 不应默认启用后端探测");

// Stage 1a: review behavior must use semantic hooks so Stage 2 can reorder the dossier DOM safely.
assert.equal((page.match(/data-substage="A"/g) || []).length, 1, "Stage II 缺少唯一的 A 子阶段钩子");
assert.equal((page.match(/data-ec-role="grid"/g) || []).length, 1, "Stage II 缺少唯一的审校网格钩子");
for (const role of ["target-input", "body", "edit-panel", "target-summary", "evidence-list", "decision-note", "reject-panel", "resolution", "resolution-picker", "resolution-summary"]) {
  assert.equal(runtime.includes(`data-ec-role="${role}"`), true, `缺少审校行为钩子：${role}`);
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
assert.match(runtime, /#stage-ii \[data-substage="A"\] \.adopt-bar/, "候选摘要栏未改用 A 子阶段钩子");
assert.match(page, /data-adopt-bar="km"/, "关键时刻摘要栏缺少语义钩子");
assert.match(runtime, /#stage-ii \[data-adopt-bar="km"\]/, "关键时刻摘要仍未改用语义钩子");
assert.equal(runtime.includes('document.querySelectorAll("#stage-ii .adopt-bar")[1]'), false, "关键时刻摘要仍依赖位置下标");

// Stage 1b: the three commands are one mutually exclusive resolution, folded after completion.
for (const copy of ["原意见入候选", "修改后入候选", "不采用", "改判"]) {
  assert.equal(runtime.includes(copy), true, `缺少 Stage 1b 候选处理文案：${copy}`);
}
assert.match(runtime, /candidateMode: entry\.candidateMode/, "候选类型未持久化");
assert.match(contract, /candidateMode/, "运行时契约未记录候选类型");
assert.equal(runtime.includes('data-review-act="candidate"'), false, "旧的候选切换命令仍在");
assert.equal(runtime.includes('data-review-act="edit"'), false, "旧的独立编辑命令仍在");
assert.equal(runtime.includes(".ec-acts"), false, "旧的三按钮样式仍在运行时");
assert.equal(page.includes(".ec-acts"), false, "旧的三按钮样式仍在页面 CSS");
assert.match(runtime, /entry\.decisionNote = event\.target\.value\.trim\(\);[\s\S]{0,180}renderMigrate\(\);[\s\S]{0,80}renderStage3\(\);/, "教师判断依据未同步刷新修订摘要");
assert.match(page, /practice-runtime\.js\?v=discipline-review-v11/, "practice runtime 缓存版本未更新");
assert.match(page, /practice-runtime-contract\.js\?v=discipline-review-v4/, "practice runtime contract 缓存版本未更新");
assert.match(page, /backend-client\.js\?v=5-practice-review/, "backend client 缓存版本未更新");

// Stage 2a: 只给教学设计审校接入真实本机模型，并保留其它四路固定种子。
assert.equal((runtime.match(/<button[^>]+data-review-act="live"/g) || []).length, 1, "真实审校入口必须只渲染一个按钮模板");
assert.match(runtime, /e\.id === "expert-edu" \? `[\s\S]{0,500}data-ec-role="live-review"/, "真实审校入口未限定到教学设计卡");
assert.match(runtime, /reviewerId: "instructional-design"/, "教学设计单卡未使用独立审校 reviewerId");
assert.match(runtime, /getPackRevision\(entry\.chapterId/, "真实审校未比较稿件修订号");
assert.match(runtime, /该批注针对旧版稿件/, "旧版批注未被阻止进入候选");
assert.match(runtime, /result\?\.status !== "anchored"/, "未锚定模型输出可能进入审校卡");
assert.match(runtime, /liveReview: entry\.liveReview/, "真实审校结果未持久化");
assert.match(contract, /anchorGate/, "运行时契约缺少锚定与旧稿门禁");
assert.match(backendClient, /function reviewPractice\(options\)/, "后端客户端缺少单卡审校接口");

console.log("verify-practice-review: ok");
