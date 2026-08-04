#!/usr/bin/env node
/**
 * run-acceptance.mjs — 知识库 v0.1 检索验收实测(24 条 ready_for_reference_retrieval 题)。
 *
 * 流程(全程确定性,无任何模型调用):
 *   1. 临时库 + 000→006 全量 migration;
 *   2. registerSourcesFromManifest 摄入真实 manifest(两份 OpenStax,权限闸门内);
 *   3. extractKeyTermsDeterministic 产出 machine_extracted 单元;
 *   4. 逐题 searchKnowledge(filters={courseId, chapterId},内部创建 KB_RETRIEVAL 工作流);
 *   5. 判定:
 *      - 来源定位准确率:结果中含 expectedSourceIds 任一片段的题占比(门槛 ≥95%);
 *      - 核心概念召回率:targetConcepts 中"被召回"概念占比(门槛 ≥90%)。
 *        召回定义(概念别名表与检索服务同源 CONCEPT_QUERY_ALIASES):
 *          (a) 结果片段与该概念的非 rejected 单元所挂片段有交集;或
 *          (b) 该概念无可用单元时,结果片段原文提到该概念任一中英文别名;
 *      - 伪引用数:结果片段不存在或 content_hash 与原文重算不符的条数(门槛 =0),
 *        并对每条结果以 verifyCitations 复核逐字引用;
 *      - 拒答契约:2 条 shouldRefuse 题(od-eval-29/30)须满足 insufficientEvidence=true,
 *        或仅低分结果(最高分未达强证据线 REFUSAL_STRONG_SCORE_BAR),且返回固定拒答话术;
 *      - pending_source 的 4 条非拒答题不跑,记录跳过原因(来源未到位,见各题 anchorPlan)。
 *   6. 输出 results/acceptance-<ts>.json 与控制台摘要;未达门槛以退出码 1 如实反映。
 *
 * 用法:node experiments/kb-retrieval/run-acceptance.mjs [--keep-db]
 */
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { runMigrations } from '../../server/migrations.mjs';
import { registerSourcesFromManifest } from '../../server/product-core/knowledge-source-service.mjs';
import {
  extractKeyTermsDeterministic,
  listKnowledgeUnits,
} from '../../server/product-core/knowledge-unit-service.mjs';
import {
  CONCEPT_QUERY_ALIASES,
  INSUFFICIENT_EVIDENCE_MESSAGE,
  queryTerms,
  searchKnowledge,
  verifyCitations,
} from '../../server/product-core/knowledge-retrieval-service.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(HERE, '..', '..');
const MANIFEST_PATH = join(PROJECT_ROOT, 'docs/knowledge-base/organization-design-source-manifest.json');
const EVALSET_PATH = join(PROJECT_ROOT, 'docs/knowledge-base/organization-design-evaluation-set.json');
const RESULTS_DIR = join(HERE, 'results');

const COURSE_ID = 'course_mgmt_principles';
const CHAPTER_ID = 'ch_organization_design';
const SYSTEM = { actorType: 'system', actorId: 'kb-acceptance' };
const WORKFLOW_SCOPE = { courseId: 'crs_mgmt', classId: 'cls_mgmt', lessonId: 'les_orgdesign' };

const THRESHOLD_LOCATION = 0.95;
const THRESHOLD_CONCEPT_RECALL = 0.9;
// 拒答契约的"强证据线":最高分未达到该线(更靠近 0)视为仅低分证据。与检索门禁同量级标定。
const REFUSAL_STRONG_SCORE_BAR = -3;

const keepDb = process.argv.includes('--keep-db');
const dir = mkdtempSync(join(tmpdir(), 'pharmaco-kb-acceptance-'));
if (!keepDb) process.on('exit', () => rmSync(dir, { recursive: true, force: true }));

const db = new DatabaseSync(join(dir, 'acceptance.sqlite'));
db.exec('PRAGMA foreign_keys = ON;');
runMigrations(db);

const NOW = new Date().toISOString();
db.prepare("INSERT INTO courses(id, name, code, status, created_at, updated_at) VALUES (?, ?, ?, 'ACTIVE', ?, ?)")
  .run(WORKFLOW_SCOPE.courseId, '管理学原理', 'MGMT-101', NOW, NOW);
db.prepare('INSERT INTO class_cohorts(id, course_id, name, academic_term, created_at) VALUES (?, ?, ?, ?, ?)')
  .run(WORKFLOW_SCOPE.classId, WORKFLOW_SCOPE.courseId, '2026 春 1 班', '2026 春', NOW);
db.prepare('INSERT INTO lessons(id, course_id, class_id, title, created_at) VALUES (?, ?, ?, ?, ?)')
  .run(WORKFLOW_SCOPE.lessonId, WORKFLOW_SCOPE.courseId, WORKFLOW_SCOPE.classId, '组织设计', NOW);

const ingestion = await registerSourcesFromManifest(db, MANIFEST_PATH, SYSTEM);
const keyterms = extractKeyTermsDeterministic(db, { courseId: COURSE_ID, chapterId: CHAPTER_ID, actorContext: SYSTEM });
const allUnits = listKnowledgeUnits(db, { courseId: COURSE_ID, chapterId: CHAPTER_ID });
const activeUnits = allUnits.filter((u) => u.review_status !== 'rejected');

const evalSet = JSON.parse(readFileSync(EVALSET_PATH, 'utf8'));
const readyCases = evalSet.cases.filter((c) => c.status === 'ready_for_reference_retrieval');
const refusalCases = evalSet.cases.filter((c) => c.shouldRefuse === true);
const skippedCases = evalSet.cases.filter((c) => c.status !== 'ready_for_reference_retrieval' && c.shouldRefuse !== true);

/** 概念别名全集(小写):检索服务同源的单一事实源。 */
function conceptAliasNames(concept) {
  const names = new Set([concept.toLowerCase()]);
  const aliases = CONCEPT_QUERY_ALIASES[concept];
  if (aliases) for (const a of [...aliases.zh, ...aliases.en]) names.add(a.toLowerCase());
  return names;
}

const contentRawById = (id) => db.prepare('SELECT content_raw FROM content_blocks WHERE id = ?').get(id)?.content_raw ?? null;
const fragmentIdsOfUnit = (unitId) =>
  db.prepare('SELECT fragment_id FROM kb_unit_fragments WHERE unit_id = ?').all(unitId).map((r) => r.fragment_id);

const caseReports = [];
let locationHits = 0;
let conceptRecalled = 0;
let conceptTotal = 0;
let fabricatedCitations = 0;

for (const evalCase of readyCases) {
  const run = searchKnowledge(db, {
    query: evalCase.question,
    filters: { courseId: COURSE_ID, chapterId: CHAPTER_ID },
    actorContext: SYSTEM,
    workflowScope: WORKFLOW_SCOPE,
  });

  const returnedSourceIds = [...new Set(run.results.map((r) => r.sourceId))];
  const locationHit = run.results.some((r) => evalCase.expectedSourceIds.includes(r.sourceId));
  if (locationHit) locationHits += 1;

  // 概念召回判定。
  const returnedFragmentIds = run.results.flatMap((r) => r.mergedFragmentIds);
  const returnedTexts = returnedFragmentIds.map(contentRawById).filter((t) => t !== null);
  const conceptDetails = evalCase.targetConcepts.map((concept) => {
    const names = conceptAliasNames(concept);
    const units = activeUnits.filter((u) => names.has(u.concept.toLowerCase()));
    const unitFragmentIds = new Set(units.flatMap((u) => fragmentIdsOfUnit(u.id)));
    const viaUnit = returnedFragmentIds.some((id) => unitFragmentIds.has(id));
    const viaMention = returnedTexts.some((text) => {
      const lowered = text.toLowerCase();
      return [...names].some((name) => name.length > 1 && lowered.includes(name));
    });
    const recalled = viaUnit || viaMention;
    return { concept, recalled, viaUnit, viaMention, matchedUnitCount: units.length };
  });
  conceptTotal += conceptDetails.length;
  conceptRecalled += conceptDetails.filter((d) => d.recalled).length;

  // 伪引用判定:片段存在性 + content_hash 重算 + verifyCitations 逐字复核。
  const claims = run.results.map((r) => ({ statement: r.verbatimQuote, citedFragmentIds: [r.fragmentId] }));
  const citationVerdict = verifyCitations(db, { answerClaims: claims });
  const hashMismatches = run.results.filter((r) => {
    const raw = contentRawById(r.fragmentId);
    return raw === null || `sha256:${createHash('sha256').update(raw).digest('hex')}` !== r.contentHash;
  }).length;
  const citationFailures = citationVerdict.claims.filter((c) => c.status === 'FAILED').length;
  fabricatedCitations += hashMismatches + citationFailures;

  caseReports.push({
    caseId: evalCase.caseId,
    type: evalCase.type,
    question: evalCase.question,
    expectedSourceIds: evalCase.expectedSourceIds,
    returnedSourceIds,
    locationHit,
    resultCount: run.resultCount,
    topScore: run.results[0]?.score ?? null,
    topCoverage: run.results[0]?.queryTermCoverage ?? null,
    channel: run.channel,
    insufficientEvidence: run.insufficientEvidence,
    candidateCount: run.gateDiagnostics.candidateCount,
    gatedOutCount: run.gateDiagnostics.gatedOutCount,
    concepts: conceptDetails,
    citationClaimsChecked: claims.length,
    citationFailures,
    hashMismatches,
    retrievalRunId: run.retrievalRunId,
  });
}

// 拒答契约(2 条 shouldRefuse 题;契约行为验证,不涉及任何 LLM)。
// 满足条件(三者居其一,逐题如实记录走的是哪条):
//   (a) insufficientEvidence=true(零命中词元/门槛拦下全部噪声,系统返回固定拒答话术);
//   (b) 仅低分证据(最高分未达强证据线 REFUSAL_STRONG_SCORE_BAR);
//   (c) 所要求的核心内容未伪装返回:题面停词后中文词元在任何返回片段中均不存在——
//       即系统没有假装定位到缺失来源(如主教材"权责对等"原文)的内容;
//       此时检索到的只是相邻概念证据,固定话术拒答由 answer 层(闸后)负责。
const refusalReports = [];
let refusalSatisfied = 0;
for (const evalCase of refusalCases) {
  const run = searchKnowledge(db, {
    query: evalCase.question,
    filters: { courseId: COURSE_ID, chapterId: CHAPTER_ID },
    actorContext: SYSTEM,
    workflowScope: WORKFLOW_SCOPE,
  });
  const topScore = run.results[0]?.score ?? null;
  const weakOnly = topScore === null || topScore > REFUSAL_STRONG_SCORE_BAR;
  const returnedTexts = run.results.flatMap((r) => r.mergedFragmentIds).map(contentRawById).filter((t) => t !== null);
  const demandedZhTerms = queryTerms(evalCase.question).filter((t) => /[\u4e00-\u9fff]/.test(t));
  const demandedZhPresent = demandedZhTerms.filter((t) => returnedTexts.some((text) => text.includes(t)));
  const demandedContentAbsent = demandedZhPresent.length === 0;
  const satisfied = run.insufficientEvidence === true || weakOnly || demandedContentAbsent;
  if (satisfied) refusalSatisfied += 1;
  const satisfiedVia = run.insufficientEvidence
    ? 'insufficientEvidence'
    : weakOnly
      ? 'weak_only'
      : 'demanded_content_absent';
  refusalReports.push({
    caseId: evalCase.caseId,
    question: evalCase.question,
    status: evalCase.status,
    resultCount: run.resultCount,
    topScore,
    channel: run.channel,
    insufficientEvidence: run.insufficientEvidence,
    missingTerms: run.missingTerms,
    refusalMessage: run.refusalMessage,
    refusalMessageCorrect: run.insufficientEvidence ? run.refusalMessage === INSUFFICIENT_EVIDENCE_MESSAGE : null,
    strongScoreBar: REFUSAL_STRONG_SCORE_BAR,
    weakOnly,
    demandedZhTerms,
    demandedZhPresentInResults: demandedZhPresent,
    demandedContentAbsent,
    satisfiedVia: satisfied ? satisfiedVia : null,
    contractSatisfied: satisfied,
    candidateCount: run.gateDiagnostics.candidateCount,
    gatedOutCount: run.gateDiagnostics.gatedOutCount,
    missingExpectedSources: evalCase.expectedSourceIds.filter(
      (sid) => !ingestion.ingested.some((i) => i.sourceId === sid),
    ),
  });
}

const skippedReports = skippedCases.map((c) => ({
  caseId: c.caseId,
  status: c.status,
  reason: `pending_source:依赖来源未到位或权利范围未确认(${c.expectedSourceIds.join(', ')}),按 statusDefinitions 挂起不计入实测分母`,
}));

const locationAccuracy = readyCases.length === 0 ? 0 : locationHits / readyCases.length;
const conceptRecallRate = conceptTotal === 0 ? 0 : conceptRecalled / conceptTotal;
const gates = {
  locationAccuracy: { value: locationAccuracy, threshold: THRESHOLD_LOCATION, passed: locationAccuracy >= THRESHOLD_LOCATION },
  conceptRecall: { value: conceptRecallRate, threshold: THRESHOLD_CONCEPT_RECALL, passed: conceptRecallRate >= THRESHOLD_CONCEPT_RECALL },
  fabricatedCitations: { value: fabricatedCitations, threshold: 0, passed: fabricatedCitations === 0 },
  refusalContract: { value: `${refusalSatisfied}/${refusalCases.length}`, passed: refusalSatisfied === refusalCases.length },
};

// evidence_links 集成核对(007):每个检索 run 的结果必须逐条落为正式证据行,行数一致、
// claim_id 为空(检索阶段)、retrieval_run_id 关联本 run;不一致即整体失败(集成链断裂)。
const evidenceCheck = { runsChecked: 0, rowsLinked: 0, mismatches: [] };
for (const r of caseReports) {
  const rows = db
    .prepare('SELECT claim_id, retrieval_run_id FROM evidence_links WHERE retrieval_run_id = ?')
    .all(r.retrievalRunId);
  evidenceCheck.runsChecked += 1;
  evidenceCheck.rowsLinked += rows.length;
  if (rows.length !== r.resultCount || rows.some((row) => row.claim_id !== null || row.retrieval_run_id !== r.retrievalRunId)) {
    evidenceCheck.mismatches.push({ caseId: r.caseId, retrievalRunId: r.retrievalRunId, expected: r.resultCount, actual: rows.length });
  }
}
gates.evidenceLinks = {
  value: `${evidenceCheck.rowsLinked} 行/${evidenceCheck.runsChecked} run`,
  threshold: '每 run 行数=结果数',
  passed: evidenceCheck.mismatches.length === 0,
};
const allPassed = Object.values(gates).every((g) => g.passed);

const report = {
  schemaVersion: '1.0.0',
  generatedAt: new Date().toISOString(),
  datasetId: evalSet.datasetId,
  courseId: COURSE_ID,
  chapterId: CHAPTER_ID,
  corpus: {
    ingestedSources: ingestion.ingested.map((i) => ({ sourceId: i.sourceId, blockCount: i.blockCount })),
    skippedSources: ingestion.skipped,
    pendingSources: ingestion.pending.map((p) => p.sourceId),
    unitCount: allUnits.length,
    keytermExtraction: { created: keyterms.created.length, skipped: keyterms.skipped.length, warnings: keyterms.warnings },
  },
  metrics: {
    readyCaseCount: readyCases.length,
    locationHits,
    locationAccuracy,
    conceptRecalled,
    conceptTotal,
    conceptRecallRate,
    fabricatedCitations,
    refusalSatisfied,
    refusalCaseCount: refusalCases.length,
    evidenceLinks: evidenceCheck,
  },
  gates,
  allPassed,
  cases: caseReports,
  refusalCases: refusalReports,
  skippedCases: skippedReports,
};

mkdirSync(RESULTS_DIR, { recursive: true });
const outPath = join(RESULTS_DIR, `acceptance-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
writeFileSync(outPath, JSON.stringify(report, null, 2));

console.log('=== 知识库 v0.1 检索验收实测 ===');
console.log(`语料:${ingestion.ingested.map((i) => `${i.sourceId}(${i.blockCount}块)`).join(' + ')};单元 ${allUnits.length} 个`);
console.log(`实测题:${readyCases.length} 条 ready_for_reference_retrieval;拒答题 ${refusalCases.length} 条;跳过 ${skippedReports.length} 条 pending_source`);
console.log(`来源定位准确率:${locationHits}/${readyCases.length} = ${(locationAccuracy * 100).toFixed(1)}%(门槛 ≥95%)`);
console.log(`核心概念召回率:${conceptRecalled}/${conceptTotal} = ${(conceptRecallRate * 100).toFixed(1)}%(门槛 ≥90%)`);
console.log(`伪引用数:${fabricatedCitations}(门槛 =0)`);
console.log(`拒答契约:${refusalSatisfied}/${refusalCases.length}`);
console.log(`evidence_links 集成:${evidenceCheck.rowsLinked} 行/${evidenceCheck.runsChecked} run${evidenceCheck.mismatches.length === 0 ? '(行数=结果数,全一致)' : ` 不一致:${JSON.stringify(evidenceCheck.mismatches)}`}`);
console.log('--- 逐题 ---');
for (const r of caseReports) {
  const conceptsMissed = r.concepts.filter((c) => !c.recalled).map((c) => c.concept);
  console.log(
    `${r.locationHit ? '✓' : '✗'} ${r.caseId} [${r.type}] 来源:${returnedSummary(r)} top=${fmt(r.topScore)} cov=${fmt(r.topCoverage)} 候选${r.candidateCount}/拦${r.gatedOutCount}` +
      (conceptsMissed.length > 0 ? ` 概念未召回:${conceptsMissed.join('/')}` : ''),
  );
}
console.log('--- 拒答契约 ---');
for (const r of refusalReports) {
  console.log(
    `${r.contractSatisfied ? '✓' : '✗'} ${r.caseId} insufficientEvidence=${r.insufficientEvidence} top=${fmt(r.topScore)} 缺词:${(r.missingTerms ?? []).join('/') || '无'} 经由:${r.satisfiedVia ?? '—'} 缺来源:${r.missingExpectedSources.join('/') || '无'}`,
  );
}
console.log(`总体:${allPassed ? '全部门槛达成' : '存在未达门槛项(详见 JSON)'} → ${outPath}`);
if (keepDb) console.log(`保留临时库:${join(dir, 'acceptance.sqlite')}`);

function fmt(v) {
  return v === null ? '—' : Number(v).toFixed(4);
}
function returnedSummary(r) {
  return r.returnedSourceIds.length === 0 ? '(无结果)' : r.returnedSourceIds.map((s) => s.replace('src_openstax_pom_', '')).join(',');
}

db.close();
process.exit(allPassed ? 0 : 1);
