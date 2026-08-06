// CH06 P2B 真实试点：只编排最小证据片段与本地模型，不读取 SQLite 原文件、PPT 或 PDF。
import { createHash } from 'node:crypto';
import { canonicalJson, appendAuditEvent } from './audit.mjs';
import { failCode } from './errors.mjs';
import { newId, nowIso } from './ids.mjs';
import { insertCourse, insertCohort, insertLesson } from './repository.mjs';
import { persistManagementRetrieval, managementEvidencePackage } from './management-kb-service.mjs';
import { createTeachingWorkflow, saveS1Context, attachEvidencePackage, saveCandidateStage, beginReview, completeReview, approveDesignV1, runSimulation, createS8AndV2AndS9, completeTeachingWorkflow, teachingWorkflowDetail } from './teaching-orchestration.mjs';

export const CH06_REAL_PROMPT_VERSION = 'ch06-real-pilot-p2b.v1';
export const CH06_MODEL_PROFILE = 'mlx-community/Qwen3.5-9B-4bit';
const actor = { actorType: 'system', actorId: 'ch06-real-pilot' };

const NODE_SPECS = Object.freeze([
  ['S2', '组织设计的任务 影响因素 原则', '生成可观察的学习目标与相应评价证据；至少覆盖环境、战略、技术、规模和发展阶段的适配判断。'],
  ['S3', '机械式组织 有机式组织 直线制 职能制 事业部制 矩阵制', '组织本课内容结构、先备知识与常见误解；必须比较机械式与有机式，以及直线制、职能制、事业部制和矩阵制。'],
  ['S4', '组织设计 管理幅度 管理层级 集权 分权 授权', '提出真实性学习情境候选。药事管理情境只能作为教学情境候选，不能写成教材或企业事实。'],
  ['S5', '直线制 职能制 事业部制 矩阵制 管理幅度 管理层级', '设计学习活动和支架，让学生比较组织结构，并解释管理幅度与管理层级的关系。'],
  ['S6', '集权 分权 授权 直线职权 参谋职权 职能职权 直线与参谋整合', '设计形成性信号和调节动作，用于辨别学生是否能区分集权、分权与授权及各种职权。'],
  ['S7', '矩阵制 多头指挥 职责模糊 权责 组织设计', '设计表现性任务与评价依据，要求识别多头指挥、职责模糊、权责不对等，并为医药管理情境提出组织方案。'],
]);

function sha256(value) { return `sha256:${createHash('sha256').update(value).digest('hex')}`; }
function cleanJson(text) {
  const stripped = String(text ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = stripped.indexOf('{'); const end = stripped.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('模型输出未包含 JSON 对象');
  return JSON.parse(stripped.slice(start, end + 1));
}
function citationView(citation) {
  return { sourceFile: citation.sourceId, pageOrSlide: citation.locator?.locator ?? citation.pageLabel, contentHash: citation.contentHash };
}
function assertStructured(stage, value, allowed) {
  if (!value || value.stage !== stage || !Array.isArray(value.items) || value.items.length === 0) {
    throw new Error(`${stage} 输出不符合最小结构`);
  }
  const allowedLinks = new Set(allowed.map((item) => item.evidenceLinkId));
  const allowedChunks = new Set(allowed.map((item) => item.externalChunkId));
  for (const item of value.items) {
    if (!item || typeof item.title !== 'string' || typeof item.content !== 'string' || typeof item.claimType !== 'string') throw new Error(`${stage} item 缺少 title/content/claimType`);
    item.evidenceLinkIds = Array.isArray(item.evidenceLinkIds) ? item.evidenceLinkIds.filter((id) => allowedLinks.has(id)) : [];
    item.chunkIds = Array.isArray(item.chunkIds) ? item.chunkIds.filter((id) => allowedChunks.has(id)) : [];
    if (item.claimType === 'evidence_based_claim' && (!item.evidenceLinkIds.length || !item.chunkIds.length)) throw new Error(`${stage} 的事实性陈述缺少允许的引用`);
    item.citations = item.evidenceLinkIds.map((id) => citationView(allowed.find((item) => item.evidenceLinkId === id)));
  }
  for (const key of ['evidenceBasedClaims', 'pedagogicalInferences', 'designRecommendations', 'evidenceGaps']) {
    if (!Array.isArray(value[key])) value[key] = [];
  }
  return value;
}
function messagesFor(stage, task, citations) {
  const evidence = citations.map((citation) => ({
    evidenceLinkId: citation.evidenceLinkId, chunkId: citation.externalChunkId,
    sourceFile: citation.sourceId, pageOrSlide: citation.locator?.locator ?? citation.pageLabel,
    contentHash: citation.contentHash, // 仅给本节点一条定位明确的短摘录；完整摘录只在 evidence package 中供教师查看。
    excerpt: String(citation.verbatimQuote ?? '').slice(0, 360),
  }));
  return [
    { role: 'system', content: '只输出 JSON，不解释推理。教材事实只能来自证据；证据不足时写 evidenceGaps，绝不补造事实。' },
    { role: 'user', content: `CH06 组织设计（2课时，药事管理本科）。节点 ${stage}：${task}\n教学目标、活动和情境本身是 pedagogical_recommendation，不是教材事实，可无引用；只有 evidence_based_claim 才必须引用。不要分析“证据不足”和任务的冲突，直接输出候选和 gaps。\n返回：{"stage":"${stage}","items":[{"title":"","content":"","claimType":"evidence_based_claim|pedagogical_inference|pedagogical_recommendation","evidenceLinkIds":["给定ID"],"chunkIds":["给定ID"]}],"evidenceBasedClaims":[],"pedagogicalInferences":[],"designRecommendations":[],"evidenceGaps":[]}\n证据：${JSON.stringify(evidence)}\n/no_think` },
  ];
}
function saveGeneration(db, { workflowId, stage, requestHash, rawOutput, parsedOutput, inputChunkIds, evidenceLinkIds, startedAt }) {
  db.prepare(`INSERT INTO teaching_model_generation_runs VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    newId('tmgr'), workflowId, stage, 'existing-mlx', CH06_MODEL_PROFILE, CH06_REAL_PROMPT_VERSION,
    canonicalJson(inputChunkIds), canonicalJson(evidenceLinkIds), requestHash, rawOutput,
    parsedOutput ? canonicalJson(parsedOutput) : null, parsedOutput ? 'PASSED' : 'FAILED', 0, startedAt, nowIso(),
  );
}
function s1Fixture() {
  return {
    fixture: true, fixtureType: 'simulated_for_workflow_validation', generationMode: 'deterministic_fixture',
    studentCount: 36, pretestItems: ['区分集权与授权', '判断矩阵制适用情形', '解释管理幅度与层级', '识别直线与参谋职权', '比较机械式与有机式组织'],
    prerequisiteResults: { organizationBasics: 'mixed', authorityConcepts: 'weak' },
    commonMisconceptions: ['把授权等同于分权', '把矩阵制理解为天然高效', '只按组织名称判断适配性'],
    completionBehavior: { pretestCompletionRate: 0.89 }, groupingBasis: ['前测概念掌握', '案例论证完整性'],
  };
}

export async function runCh06RealPilot(db, { modelClient, managementKbService, managementCorpus, seed = 'ch06-real-pilot-001' }) {
  const status = await modelClient.status();
  if (!status.ready || !status.advertisedModels?.includes(CH06_MODEL_PROFILE)) {
    failCode('PROVIDER_NOT_ENABLED', '本地模型未就绪或模型 ID 与冻结配置不一致', { status, expectedModel: CH06_MODEL_PROFILE });
  }
  const suffix = newId('run').slice(-6);
  const course = insertCourse(db, { name: '管理学 CH06 真实教学设计试点', code: `MGT-PHARM-001-CH06-${suffix}`, actorContext: actor });
  const cohort = insertCohort(db, { courseId: course.id, name: '药事管理本科生（模拟学情）', academicTerm: 'pilot', actorContext: actor });
  const lesson = insertLesson(db, { courseId: course.id, classId: cohort.id, title: '组织设计（2课时）', actorContext: actor });
  const workflow = createTeachingWorkflow(db, { courseId: course.id, classId: cohort.id, lessonId: lesson.id, chapterId: 'CH06', lessonHours: 2, actorContext: actor, previousStatus: 'BLOCKED', resumeReason: 'LOCAL_MODEL_SERVICE_RESTORED' });
  const key = (name) => `${seed}:${workflow.id}:${name}`;
  saveS1Context(db, workflow.id, s1Fixture(), actor, { idempotencyKey: key('s1') });

  const nodeEvidence = [];
  for (const [stage, query] of NODE_SPECS) {
    const retrieval = persistManagementRetrieval(db, managementKbService, managementCorpus, {
      query, chapterIds: ['CH06'], authorityMaxRank: 4, limit: 3,
      workflowScope: { courseId: course.id, classId: cohort.id, lessonId: lesson.id }, actorContext: actor,
    });
    const pack = managementEvidencePackage(db, managementCorpus, retrieval.retrievalRunId);
    const allowedChunks = new Set(retrieval.results.filter((item) => item.llmInputAllowed === true).map((item) => item.externalChunkId));
    // P2B 不把“最多 121 个可授权切片”当成上下文预算。每节点只给分值最高的一条，
    // 其余仍在 retrieval run/evidence package 内供教师展开核对。
    const allowed = pack.citations.filter((item) => allowedChunks.has(item.externalChunkId)).slice(0, 1);
    if (!allowed.length) failCode('KB_PERMISSION_GATE', `${stage} 没有 llm_input_allowed=true 的最小证据`, { retrievalRunId: retrieval.retrievalRunId });
    nodeEvidence.push({ stage, retrieval, pack, allowed });
  }
  const corpusVersionHash = managementCorpus.corpus_version_hash;
  attachEvidencePackage(db, workflow.id, {
    fixture: false, corpusVersionHash,
    retrievalRunIds: nodeEvidence.map(({ retrieval }) => retrieval.retrievalRunId),
    evidenceLinkIds: nodeEvidence.flatMap(({ allowed }) => allowed.map((item) => item.evidenceLinkId)),
  }, actor, { idempotencyKey: key('evidence') });

  for (const [stage, , task] of NODE_SPECS) {
    const node = nodeEvidence.find((item) => item.stage === stage);
    const messages = messagesFor(stage, task, node.allowed);
    const startedAt = nowIso(); const requestHash = sha256(canonicalJson({ model: CH06_MODEL_PROFILE, messages, promptVersion: CH06_REAL_PROMPT_VERSION }));
    let rawOutput = ''; let parsed = null;
    try {
      const response = await modelClient.chat({ messages, stream: false, temperature: 0.15, maxTokens: 1500, chatTemplateKwargs: { enable_thinking: false } });
      const payload = await response.json(); const modelText = payload?.choices?.[0]?.message?.content ?? '';
      // 原始回包（含 finish_reason / reasoning）完整留存；解析只看最终 content，避免把思考文本当教学结论。
      rawOutput = JSON.stringify(payload);
      parsed = assertStructured(stage, cleanJson(modelText), node.allowed);
      saveGeneration(db, { workflowId: workflow.id, stage, requestHash, rawOutput, parsedOutput: parsed, inputChunkIds: node.allowed.map((x) => x.externalChunkId), evidenceLinkIds: node.allowed.map((x) => x.evidenceLinkId), startedAt });
    } catch (error) {
      saveGeneration(db, { workflowId: workflow.id, stage, requestHash, rawOutput: rawOutput || String(error?.message ?? error), parsedOutput: null, inputChunkIds: node.allowed.map((x) => x.externalChunkId), evidenceLinkIds: node.allowed.map((x) => x.evidenceLinkId), startedAt });
      throw error;
    }
    saveCandidateStage(db, workflow.id, stage, { ...parsed, generationMode: 'local_model', promptVersion: CH06_REAL_PROMPT_VERSION, modelProfile: CH06_MODEL_PROFILE, retrievalRunId: node.retrieval.retrievalRunId, corpusVersionHash, inputEvidenceLinkIds: node.allowed.map((x) => x.evidenceLinkId) }, actor, { idempotencyKey: key(stage) });
  }
  beginReview(db, workflow.id, actor, { idempotencyKey: key('teacher-review') });
  appendAuditEvent(db, { eventType: 'teaching.real_pilot.generated', actorType: actor.actorType, actorId: actor.actorId, entityType: 'teaching_workflow', entityId: workflow.id, workflowInstanceId: workflow.id, payload: { chapterId: 'CH06', corpusVersionHash, generationMode: 'local_model', promptVersion: CH06_REAL_PROMPT_VERSION, modelProfile: CH06_MODEL_PROFILE, llmInputEvidenceCount: nodeEvidence.reduce((sum, node) => sum + node.allowed.length, 0) } });
  return { workflowInstanceId: workflow.id, status: 'TEACHER_REVIEW_PENDING', corpusVersionHash, generationMode: 'local_model', modelProfile: CH06_MODEL_PROFILE, retrievalRunIds: nodeEvidence.map(({ retrieval }) => retrieval.retrievalRunId) };
}

export function completeCh06RealPilot(db, { workflowId, seed, actorContext }) {
  const key = (name) => `${seed}:${workflowId}:${name}`;
  completeReview(db, workflowId, actorContext, { idempotencyKey: key('review-complete') });
  const v1 = approveDesignV1(db, workflowId, actorContext, { idempotencyKey: key('approve-v1') });
  const workflow = teachingWorkflowDetail(db, workflowId).workflow;
  const input = {
    schemaVersion: '1.0.0', workflowInstanceId: workflowId, teachingDesignVersionId: v1.versionId,
    courseId: workflow.course_id, chapterId: 'CH06', lessonHours: 2, seed,
    studentProfiles: [{ studentId: 'sim-group-a' }, { studentId: 'sim-group-b' }], studentGroups: [{ groupId: 'sim-g1' }], lessonTimeline: [],
    learningActivities: [{ stage: 'S5' }], formativeSignals: [{ stage: 'S6' }], adaptiveActions: [{ stage: 'S6' }], performanceTask: { stage: 'S7' }, rubric: { stage: 'S7' }, simulationMode: 'persisted_run',
    scenarioConfig: { ruleEvents: [
      { ruleId: 'matrix-misconception', lessonOffset: 1800, eventType: 'misconception', severity: 4, relatedStage: 'S5', relatedFieldPath: 's5LearningActivities', observedSignal: '学生将矩阵制的双重领导理解为无需协调的优势' },
      { ruleId: 'authority-ambiguity', lessonOffset: 4200, eventType: 'assessment_ambiguity', severity: 3, relatedStage: 'S7', relatedFieldPath: 's7Rubric', observedSignal: '学生无法区分授权与分权的评价证据' },
    ] },
  };
  const simulation = runSimulation(db, workflowId, input, actorContext, { idempotencyKey: key('simulation') });
  createS8AndV2AndS9(db, workflowId, actorContext, { idempotencyKey: key('s8-v2-s9'), provenance: 'deterministic_simulation' });
  const completed = completeTeachingWorkflow(db, workflowId, actorContext, { idempotencyKey: key('complete') });
  const detail = teachingWorkflowDetail(db, workflowId);
  return { workflowInstanceId: workflowId, status: completed.current_state, teachingDesignV1Id: v1.versionId, simulationRunId: simulation.runId, teachingDesignV2Id: detail.designVersions.find((item) => item.version_number === 2)?.id ?? null, s9AssetCandidateId: detail.s9Candidates[0]?.id ?? null, criticalMomentCount: detail.criticalMoments.length };
}
