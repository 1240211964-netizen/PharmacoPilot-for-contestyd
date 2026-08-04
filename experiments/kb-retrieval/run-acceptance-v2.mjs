#!/usr/bin/env node
/**
 * run-acceptance-v2.mjs — 知识库 v0.1 检索复验(30 题,权威语料 + 三层单元)。
 *
 * 与 run-acceptance.mjs(24 题,旧 manifest,保留不动)的关系:
 *   语料从"两份 OpenStax"扩到"旧两份 + 权威 manifest 30 条(8 theory / 15 pharma_context /
 *   8 company_fact,1 条 blocked 不摄入)";单元从 Key Terms 扩到三层 L2(builder 规则单元)。
 *   全程确定性,无任何模型调用。
 *
 * 流程:
 *   1. 临时库 + migration 000→008 全量;
 *   2. registerSourcesFromManifest 摄入旧 manifest(两份 OpenStax,manual-markdown 解析,
 *      Key Terms 提取依赖该解析器块结构);ingestAuthoritativeManifest 摄入权威 manifest
 *      (legacy 两条按 hash 判重补登 kb_source_permissions/kb_chapter_sources);
 *   3. extractKeyTermsDeterministic(theory Key Terms)+ buildLayeredKnowledgeBase(三层单元/
 *      关系/证据缺口流转);
 *   4. 30 题全量跑检索(pending_source 题也跑,验证拒答/缺口路径,不计入准确率分母);
 *   5. 判定与口径(分子分母如实写明):
 *      - 来源定位准确率:分母 = status=ready_for_reference_retrieval 的题(28 条);
 *        分子 = 结果命中任一"可解析预期来源"的题数。expectedSourceIds 为旧 manifest 聚合占位
 *        的(src_pharma_context_pack / src_annual_reports_2cos)按 layer 解析;3.7 候选来源
 *        按权威 manifest supersedes 登记解析到实例(openstax-pom-ch03-3-7);主教材/教师 PPT
 *        未到位不可解析(缺口如实记录,不移出分母——该 4 题(20/24/25/29)另有可解析预期来源)。
 *      - 核心概念召回率:同 v1 口径(单元链接或别名提及),分母 = ready 题 targetConcepts 总数。
 *      - 引用一致率:verifyCitations 逐字复核 + content_hash 重算,要求 100% / 伪引用 =0。
 *      - 无证据强答 =0:pending_source 题(od-eval-15/30)系统不得伪装返回缺失来源的内容——
 *        逐题 demandProbes(题面核心诉求的标志性短语,如 主教材"权责对等")在任何返回片段中
 *        均须不存在,或 insufficientEvidence / 仅低分证据。
 *      - 未授权内容泄漏 =0:独立复核每条结果片段的来源授权(kb_source_permissions.
 *        lexical_indexing_allowed=1 或片段级 allowedOperations 含 exact_or_lexical_search),
 *        且 blocked 来源(ocw-15-320-s11-lec01)零块零结果。
 *      - 拒答语义复核(od-eval-29/30):shouldRefuse 题在新语料下的行为锁定。29 的权变来源
 *        已到位(status 已复核为 ready,见报告),OOV 拒答不再触发属预期;30 保持
 *        pending_source,拒答契约走"诉求短语缺失"路径验证。
 *      - 课程口径优先率:主教材/大纲未到位,无法测量,如实记 N/A。
 *   6. 短词通道:10 个两字词(组织/授权/分权/集权/权责/矩阵/质量/委托/药事/采购)逐词跑检索,
 *      记录通道/命中数/中文语料命中情况;语料中不存在的中文词元(集权)如实记 miss。
 *   7. 输出 results/acceptance-v2-<ts>.json 与控制台摘要;未达门槛以退出码 1 如实反映。
 *
 * 用法:node experiments/kb-retrieval/run-acceptance-v2.mjs [--keep-db]
 */
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { runMigrations } from '../../server/migrations.mjs';
import { registerSourcesFromManifest } from '../../server/product-core/knowledge-source-service.mjs';
import { ingestAuthoritativeManifest } from '../../server/product-core/kb-authoritative-ingest.mjs';
import { extractKeyTermsDeterministic, listKnowledgeUnits } from '../../server/product-core/knowledge-unit-service.mjs';
import { buildLayeredKnowledgeBase } from '../../server/product-core/kb-unit-builder.mjs';
import {
  CONCEPT_QUERY_ALIASES,
  INSUFFICIENT_EVIDENCE_MESSAGE,
  searchKnowledge,
  verifyCitations,
} from '../../server/product-core/knowledge-retrieval-service.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(HERE, '..', '..');
const LEGACY_MANIFEST_PATH = join(PROJECT_ROOT, 'docs/knowledge-base/organization-design-source-manifest.json');
const AUTHORITATIVE_MANIFEST_PATH = join(PROJECT_ROOT, 'docs/knowledge-base/organization-design-authoritative-sources-manifest.json');
const EVALSET_PATH = join(PROJECT_ROOT, 'docs/knowledge-base/organization-design-evaluation-set.json');
const RESULTS_DIR = join(HERE, 'results');

const COURSE_ID = 'course_mgmt_principles';
const CHAPTER_ID = 'ch_organization_design';
const SYSTEM = { actorType: 'system', actorId: 'kb-acceptance-v2' };
const WORKFLOW_SCOPE = { courseId: 'crs_mgmt', classId: 'cls_mgmt', lessonId: 'les_orgdesign' };

const THRESHOLD_LOCATION = 0.95;
const THRESHOLD_CONCEPT_RECALL = 0.9;
// 拒答契约的"强证据线":最高分未达到该线(更靠近 0)视为仅低分证据。与 v1 同口径。
const REFUSAL_STRONG_SCORE_BAR = -3;

// expectedSourceIds 聚合占位解析(题目内容不动;解析规则显式登记,供审查):
//   ids:直接匹配结果 sourceId;layer:结果来源在 kb_chapter_sources 的归属层;
//   missing:来源未到位,不可解析(缺口记录,不移出分母)。
const SOURCE_RESOLUTION = Object.freeze({
  src_openstax_pom_ch10: Object.freeze({ kind: 'ids', ids: Object.freeze(['src_openstax_pom_ch10']) }),
  src_openstax_pom_ch04_s4_3: Object.freeze({ kind: 'ids', ids: Object.freeze(['src_openstax_pom_ch04_s4_3']) }),
  src_openstax_pom_ch03_s3_7: Object.freeze({
    kind: 'ids',
    ids: Object.freeze(['openstax-pom-ch03-3-7']),
    note: '旧 manifest 候选来源,2026-08-04 由权威 manifest 实例化(supersedes 登记)',
  }),
  src_pharma_context_pack: Object.freeze({
    kind: 'layer',
    layer: 'pharma_context',
    note: '聚合占位,解析为权威 manifest pharma_context 层 15 条(法规 9 + 国际标准 5 + EU GMP Ch1)',
  }),
  src_annual_reports_2cos: Object.freeze({
    kind: 'layer',
    layer: 'company_fact',
    note: '聚合占位(题面"两家"),解析为权威 manifest company_fact 层 8 家年报/10-K;题目内容不改,差异在报告说明',
  }),
  src_textbook_main_orgdesign: Object.freeze({ kind: 'missing', note: '主教材 awaiting_teacher_provided' }),
  src_teacher_ppt_orgdesign: Object.freeze({ kind: 'missing', note: '教师 PPT awaiting_teacher_provided' }),
});

// pending_source 拒答/缺口验证的诉求探针(题面核心诉求的标志性短语;系统若伪装返回缺失
// 来源内容,这些短语必然出现)。od-eval-29 权变来源已到位,无探针(走 ready 题口径)。
const DEMAND_PROBES = Object.freeze({
  'od-eval-15': Object.freeze(['权责对等']),
  'od-eval-30': Object.freeze(['权责对等', '权责对等原则']),
});

const SHORT_WORDS = Object.freeze(['组织', '授权', '分权', '集权', '权责', '矩阵', '质量', '委托', '药事', '采购']);

const keepDb = process.argv.includes('--keep-db');
const dir = mkdtempSync(join(tmpdir(), 'pharmaco-kb-acceptance-v2-'));
if (!keepDb) process.on('exit', () => rmSync(dir, { recursive: true, force: true }));

const db = new DatabaseSync(join(dir, 'acceptance-v2.sqlite'));
db.exec('PRAGMA foreign_keys = ON;');
runMigrations(db);

const NOW = new Date().toISOString();
db.prepare("INSERT INTO courses(id, name, code, status, created_at, updated_at) VALUES (?, ?, ?, 'ACTIVE', ?, ?)")
  .run(WORKFLOW_SCOPE.courseId, '管理学原理', 'MGMT-101', NOW, NOW);
db.prepare('INSERT INTO class_cohorts(id, course_id, name, academic_term, created_at) VALUES (?, ?, ?, ?, ?)')
  .run(WORKFLOW_SCOPE.classId, WORKFLOW_SCOPE.courseId, '2026 春 1 班', '2026 春', NOW);
db.prepare('INSERT INTO lessons(id, course_id, class_id, title, created_at) VALUES (?, ?, ?, ?, ?)')
  .run(WORKFLOW_SCOPE.lessonId, WORKFLOW_SCOPE.courseId, WORKFLOW_SCOPE.classId, '组织设计', NOW);

const legacyIngestion = await registerSourcesFromManifest(db, LEGACY_MANIFEST_PATH, SYSTEM);
const ingestion = await ingestAuthoritativeManifest(db, AUTHORITATIVE_MANIFEST_PATH, SYSTEM);
const keyterms = extractKeyTermsDeterministic(db, { courseId: COURSE_ID, chapterId: CHAPTER_ID, actorContext: SYSTEM });
const built = buildLayeredKnowledgeBase(db, { courseId: COURSE_ID, chapterId: CHAPTER_ID, actorContext: SYSTEM });
const allUnits = listKnowledgeUnits(db, { courseId: COURSE_ID, chapterId: CHAPTER_ID });
const activeUnits = allUnits.filter((u) => u.review_status !== 'rejected');

// 资产 → layer 映射(kb_chapter_sources,本章)。
const layerByAssetId = new Map(
  db
    .prepare('SELECT asset_id, layer FROM kb_chapter_sources WHERE course_id = ? AND chapter_id = ?')
    .all(COURSE_ID, CHAPTER_ID)
    .map((row) => [row.asset_id, row.layer]),
);
const assetIdByVersionId = new Map(
  db.prepare('SELECT id, asset_id FROM asset_versions').all().map((row) => [row.id, row.asset_id]),
);
const layerOfResult = (r) => layerByAssetId.get(assetIdByVersionId.get(r.assetVersionId)) ?? null;

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

/** 结果是否命中某 expectedSourceId(按 SOURCE_RESOLUTION 解析)。 */
function resultMatchesExpected(result, expectedId) {
  const rule = SOURCE_RESOLUTION[expectedId];
  if (!rule || rule.kind === 'missing') return false;
  if (rule.kind === 'ids') return rule.ids.includes(result.sourceId);
  return layerOfResult(result) === rule.layer;
}

const evalSet = JSON.parse(readFileSync(EVALSET_PATH, 'utf8'));
const readyCases = evalSet.cases.filter((c) => c.status === 'ready_for_reference_retrieval');
const pendingCases = evalSet.cases.filter((c) => c.status === 'pending_source');
const outOfScopeCases = evalSet.cases.filter(
  (c) => c.status !== 'ready_for_reference_retrieval' && c.status !== 'pending_source',
);

function runCase(evalCase) {
  return searchKnowledge(db, {
    query: evalCase.question,
    filters: { courseId: COURSE_ID, chapterId: CHAPTER_ID },
    actorContext: SYSTEM,
    workflowScope: WORKFLOW_SCOPE,
  });
}

// --- 全部 30 题跑检索(pending 也跑,验证拒答/缺口路径)。 ---
const runByCaseId = new Map();
for (const evalCase of evalSet.cases) runByCaseId.set(evalCase.caseId, runCase(evalCase));

// --- ready 题:来源定位 + 概念召回 + 引用一致/伪引用。 ---
const caseReports = [];
let locationHits = 0;
let conceptRecalled = 0;
let conceptTotal = 0;
let fabricatedCitations = 0;
let citationClaimsChecked = 0;
let citationClaimsPassed = 0;

for (const evalCase of readyCases) {
  const run = runByCaseId.get(evalCase.caseId);
  const returnedSourceIds = [...new Set(run.results.map((r) => r.sourceId))];
  const matchedExpected = evalCase.expectedSourceIds.filter((sid) => run.results.some((r) => resultMatchesExpected(r, sid)));
  const unresolvableExpected = evalCase.expectedSourceIds.filter((sid) => SOURCE_RESOLUTION[sid]?.kind === 'missing');
  const locationHit = matchedExpected.length > 0;
  if (locationHit) locationHits += 1;

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

  const claims = run.results.map((r) => ({ statement: r.verbatimQuote, citedFragmentIds: [r.fragmentId] }));
  const citationVerdict = verifyCitations(db, { answerClaims: claims });
  const hashMismatches = run.results.filter((r) => {
    const raw = contentRawById(r.fragmentId);
    return raw === null || `sha256:${createHash('sha256').update(raw).digest('hex')}` !== r.contentHash;
  }).length;
  const citationFailures = citationVerdict.claims.filter((c) => c.status === 'FAILED').length;
  citationClaimsChecked += claims.length;
  citationClaimsPassed += claims.length - citationFailures;
  fabricatedCitations += hashMismatches + citationFailures;

  caseReports.push({
    caseId: evalCase.caseId,
    type: evalCase.type,
    expectedSourceIds: evalCase.expectedSourceIds,
    matchedExpectedSourceIds: matchedExpected,
    unresolvableExpectedSourceIds: unresolvableExpected,
    returnedSourceIds,
    returnedLayers: [...new Set(run.results.map(layerOfResult))],
    locationHit,
    resultCount: run.resultCount,
    topScore: run.results[0]?.score ?? null,
    topCoverage: run.results[0]?.queryTermCoverage ?? null,
    channel: run.channel,
    insufficientEvidence: run.insufficientEvidence,
    missingTerms: run.missingTerms,
    distinctiveTerms: run.gateDiagnostics.distinctiveTerms,
    bridgeTerms: run.gateDiagnostics.bridgeTerms,
    bridgeKeptCount: run.gateDiagnostics.bridgeKeptCount,
    concepts: conceptDetails,
    citationClaimsChecked: claims.length,
    citationFailures,
    hashMismatches,
    retrievalRunId: run.retrievalRunId,
  });
}

// --- pending_source 题:拒答/缺口路径验证(不计入准确率分母)。 ---
const pendingReports = [];
let strongAnswerWithoutEvidence = 0;
for (const evalCase of pendingCases) {
  const run = runByCaseId.get(evalCase.caseId);
  const topScore = run.results[0]?.score ?? null;
  const weakOnly = topScore === null || topScore > REFUSAL_STRONG_SCORE_BAR;
  const returnedTexts = run.results.flatMap((r) => r.mergedFragmentIds).map(contentRawById).filter((t) => t !== null);
  const probes = DEMAND_PROBES[evalCase.caseId] ?? [];
  const probesPresent = probes.filter((p) => returnedTexts.some((text) => text.includes(p)));
  const demandedContentAbsent = probes.length > 0 && probesPresent.length === 0;
  const satisfied = run.insufficientEvidence === true || weakOnly || demandedContentAbsent;
  if (!satisfied) strongAnswerWithoutEvidence += 1;
  pendingReports.push({
    caseId: evalCase.caseId,
    question: evalCase.question,
    shouldRefuse: evalCase.shouldRefuse === true,
    resultCount: run.resultCount,
    topScore,
    channel: run.channel,
    insufficientEvidence: run.insufficientEvidence,
    missingTerms: run.missingTerms,
    returnedSourceIds: [...new Set(run.results.map((r) => r.sourceId))],
    demandProbes: probes,
    demandProbesPresentInResults: probesPresent,
    demandedContentAbsent,
    weakOnly,
    satisfiedVia: run.insufficientEvidence ? 'insufficientEvidence' : weakOnly ? 'weak_only' : demandedContentAbsent ? 'demanded_content_absent' : null,
    gapContractSatisfied: satisfied,
    missingExpectedSources: evalCase.expectedSourceIds.filter((sid) => SOURCE_RESOLUTION[sid]?.kind === 'missing'),
  });
}

// --- 拒答语义复核(od-eval-29/30 行为锁定;29 已随权变来源到位复核为 ready)。 ---
const refusalSemantics = [];
for (const caseId of ['od-eval-29', 'od-eval-30']) {
  const evalCase = evalSet.cases.find((c) => c.caseId === caseId);
  const run = runByCaseId.get(caseId);
  refusalSemantics.push({
    caseId,
    status: evalCase.status,
    shouldRefuse: evalCase.shouldRefuse,
    oovRefusalTriggered: run.insufficientEvidence && (run.missingTerms ?? []).length > 0,
    insufficientEvidence: run.insufficientEvidence,
    missingTerms: run.missingTerms,
    resultCount: run.resultCount,
    topScore: run.results[0]?.score ?? null,
    topSourceId: run.results[0]?.sourceId ?? null,
    channel: run.channel,
    note:
      caseId === 'od-eval-29'
        ? '权变来源(3.7)到位后 OOV 拒答不再触发属预期;该题正确终态=可定位权变来源,回答层须声明部分覆盖(完整清单仍缺主教材口径),不得凭常识补全。'
        : '主教材未到位;OOV 词 OpenStax 因语料元数据含该字面而不再触发拒答,拒答契约改由"诉求短语(权责对等)缺失"路径承载(见 pendingReports)。',
  });
}

// --- 未授权内容泄漏独立复核:全部 30 个 run 的每条结果。 ---
const leakCheck = { resultsChecked: 0, violations: [], blockedSourceId: 'ocw-15-320-s11-lec01', blockedSourceBlocks: 0, blockedSourceResults: 0 };
leakCheck.blockedSourceBlocks = db
  .prepare('SELECT COUNT(*) AS c FROM content_blocks cb JOIN asset_versions av ON av.id = cb.asset_version_id WHERE av.asset_id = ?')
  .get(leakCheck.blockedSourceId).c;
for (const evalCase of evalSet.cases) {
  const run = runByCaseId.get(evalCase.caseId);
  for (const r of run.results) {
    leakCheck.resultsChecked += 1;
    if (r.sourceId === leakCheck.blockedSourceId) leakCheck.blockedSourceResults += 1;
    const assetId = assetIdByVersionId.get(r.assetVersionId);
    const sp = db.prepare('SELECT lexical_indexing_allowed, llm_input_allowed FROM kb_source_permissions WHERE source_id = ?').get(assetId);
    const meta = db.prepare('SELECT parser_metadata_json FROM content_blocks WHERE id = ?').get(r.fragmentId);
    const allowedOps = JSON.parse(meta?.parser_metadata_json ?? '{}').allowedOperations ?? [];
    const lexicalOk = sp?.lexical_indexing_allowed === 1 || allowedOps.includes('exact_or_lexical_search');
    const llmDenied = (sp?.llm_input_allowed ?? 0) === 0;
    if (!lexicalOk || !llmDenied) {
      leakCheck.violations.push({ caseId: evalCase.caseId, fragmentId: r.fragmentId, sourceId: r.sourceId, lexicalOk, llmDenied });
    }
  }
}

// --- 短词通道:10 个两字词。 ---
const shortWordReports = [];
for (const word of SHORT_WORDS) {
  const run = searchKnowledge(db, {
    query: word,
    filters: { courseId: COURSE_ID, chapterId: CHAPTER_ID },
    actorContext: SYSTEM,
    workflowScope: WORKFLOW_SCOPE,
  });
  const texts = run.results.flatMap((r) => r.mergedFragmentIds).map(contentRawById).filter((t) => t !== null);
  const layers = run.results.map(layerOfResult);
  shortWordReports.push({
    word,
    channel: run.channel,
    resultCount: run.resultCount,
    insufficientEvidence: run.insufficientEvidence,
    verbatimPresentInResults: texts.some((t) => t.includes(word)),
    pharmaContextHits: layers.filter((l) => l === 'pharma_context').length,
    companyFactHits: layers.filter((l) => l === 'company_fact').length,
    theoryHits: layers.filter((l) => l === 'theory').length,
    topSourceId: run.results[0]?.sourceId ?? null,
    topScore: run.results[0]?.score ?? null,
  });
}

// --- 来源命中分布(全部 30 题结果,按 layer / sourceId)。 ---
const hitDistribution = { byLayer: {}, bySourceId: {} };
for (const evalCase of evalSet.cases) {
  for (const r of runByCaseId.get(evalCase.caseId).results) {
    const layer = layerOfResult(r) ?? 'unknown';
    hitDistribution.byLayer[layer] = (hitDistribution.byLayer[layer] ?? 0) + 1;
    hitDistribution.bySourceId[r.sourceId] = (hitDistribution.bySourceId[r.sourceId] ?? 0) + 1;
  }
}

// --- evidence_links 集成核对(同 v1)。 ---
const evidenceCheck = { runsChecked: 0, rowsLinked: 0, mismatches: [] };
for (const evalCase of evalSet.cases) {
  const run = runByCaseId.get(evalCase.caseId);
  const rows = db.prepare('SELECT claim_id, retrieval_run_id FROM evidence_links WHERE retrieval_run_id = ?').all(run.retrievalRunId);
  evidenceCheck.runsChecked += 1;
  evidenceCheck.rowsLinked += rows.length;
  if (rows.length !== run.resultCount || rows.some((row) => row.claim_id !== null || row.retrieval_run_id !== run.retrievalRunId)) {
    evidenceCheck.mismatches.push({ caseId: evalCase.caseId, retrievalRunId: run.retrievalRunId, expected: run.resultCount, actual: rows.length });
  }
}

const locationAccuracy = readyCases.length === 0 ? 0 : locationHits / readyCases.length;
const conceptRecallRate = conceptTotal === 0 ? 0 : conceptRecalled / conceptTotal;
const citationConsistency = citationClaimsChecked === 0 ? 1 : citationClaimsPassed / citationClaimsChecked;
const gaps = {
  locationAccuracy: {
    value: locationAccuracy,
    detail: `${locationHits}/${readyCases.length}`,
    threshold: THRESHOLD_LOCATION,
    passed: locationAccuracy >= THRESHOLD_LOCATION,
  },
  conceptRecall: {
    value: conceptRecallRate,
    detail: `${conceptRecalled}/${conceptTotal}`,
    threshold: THRESHOLD_CONCEPT_RECALL,
    passed: conceptRecallRate >= THRESHOLD_CONCEPT_RECALL,
  },
  citationConsistency: { value: citationConsistency, detail: `${citationClaimsPassed}/${citationClaimsChecked}`, threshold: 1, passed: citationConsistency === 1 },
  fabricatedCitations: { value: fabricatedCitations, threshold: 0, passed: fabricatedCitations === 0 },
  strongAnswerWithoutEvidence: { value: strongAnswerWithoutEvidence, threshold: 0, passed: strongAnswerWithoutEvidence === 0 },
  unauthorizedLeak: { value: leakCheck.violations.length + leakCheck.blockedSourceResults, threshold: 0, passed: leakCheck.violations.length === 0 && leakCheck.blockedSourceResults === 0 },
  evidenceLinks: {
    value: `${evidenceCheck.rowsLinked} 行/${evidenceCheck.runsChecked} run`,
    threshold: '每 run 行数=结果数',
    passed: evidenceCheck.mismatches.length === 0,
  },
};
const allPassed = Object.values(gaps).every((g) => g.passed);

const report = {
  schemaVersion: '2.0.0',
  generatedAt: new Date().toISOString(),
  datasetId: evalSet.datasetId,
  courseId: COURSE_ID,
  chapterId: CHAPTER_ID,
  corpus: {
    legacyIngested: legacyIngestion.ingested.map((i) => ({ sourceId: i.sourceId, blockCount: i.blockCount })),
    ingestedSources: ingestion.ingested.map((i) => ({ sourceId: i.sourceId, blockCount: i.blockCount, alreadyIngested: i.alreadyIngested === true })),
    skippedSources: ingestion.skipped,
    totalBlocks: db.prepare('SELECT COUNT(*) AS c FROM content_blocks').get().c,
    layerBlockCounts: ingestion.layerBlockCounts,
    theoryUnits: allUnits.length,
    pharmaContextUnits: db.prepare('SELECT COUNT(*) AS c FROM kb_pharma_context_units').get().c,
    companyFactUnits: db.prepare('SELECT COUNT(*) AS c FROM kb_company_fact_units').get().c,
    relations: db.prepare('SELECT COUNT(*) AS c FROM kb_unit_relations').get().c,
    keytermExtraction: { created: keyterms.created.length, warnings: keyterms.warnings.length },
    builder: {
      theoryCreated: built.theory.created.length,
      pharmaCreated: built.pharmaContext.created.length,
      companyCreated: built.companyFact.created.length,
      relationsCreated: built.relations.created.length,
      companyMissed: built.missed.length,
      relationsNotBuilt: built.notBuiltRelations.length,
      gapsResolved: built.gaps.resolved.map((g) => g.questionId),
      gapsKeptOpen: built.gaps.keptOpen.map((g) => g.questionId),
    },
  },
  caseStatusDistribution: {
    ready_for_reference_retrieval: readyCases.length,
    pending_source: pendingCases.length,
    ready_for_ai_pipeline: evalSet.cases.filter((c) => c.status === 'ready_for_ai_pipeline').length,
    out_of_scope: outOfScopeCases.length,
  },
  denominatorDiscipline:
    '来源定位准确率/概念召回率分母 = status=ready_for_reference_retrieval 的题;pending_source 题全量跑检索验证拒答/缺口路径但不计入分母;无 out_of_scope 题。',
  metrics: {
    readyCaseCount: readyCases.length,
    pendingCaseCount: pendingCases.length,
    locationHits,
    locationAccuracy,
    conceptRecalled,
    conceptTotal,
    conceptRecallRate,
    citationClaimsChecked,
    citationClaimsPassed,
    citationConsistency,
    fabricatedCitations,
    strongAnswerWithoutEvidence,
    unauthorizedLeakViolations: leakCheck.violations.length,
    evidenceLinks: evidenceCheck,
    courseVoicePriorityRate: 'N/A(主教材/大纲未到位,课程口径来源缺失,无法测量)',
  },
  gates: gaps,
  allPassed,
  sourceResolution: SOURCE_RESOLUTION,
  hitDistribution,
  shortWords: shortWordReports,
  refusalSemantics,
  leakCheck,
  cases: caseReports,
  pendingCases: pendingReports,
};

mkdirSync(RESULTS_DIR, { recursive: true });
const outPath = join(RESULTS_DIR, `acceptance-v2-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
writeFileSync(outPath, JSON.stringify(report, null, 2));

console.log('=== 知识库 v0.1 检索复验(30 题,权威语料) ===');
console.log(`语料:${report.corpus.totalBlocks} 块(theory ${ingestion.layerBlockCounts.theory} / pharma_context ${ingestion.layerBlockCounts.pharma_context} / company_fact ${ingestion.layerBlockCounts.company_fact});单元 theory ${allUnits.length} / pharma ${report.corpus.pharmaContextUnits} / company ${report.corpus.companyFactUnits};关系 ${report.corpus.relations}`);
console.log(`三态:ready ${readyCases.length} / pending ${pendingCases.length} / out_of_scope ${outOfScopeCases.length}`);
console.log(`来源定位准确率:${locationHits}/${readyCases.length} = ${(locationAccuracy * 100).toFixed(1)}%(门槛 ≥95%)`);
console.log(`核心概念召回率:${conceptRecalled}/${conceptTotal} = ${(conceptRecallRate * 100).toFixed(1)}%(门槛 ≥90%)`);
console.log(`引用一致率:${citationClaimsPassed}/${citationClaimsChecked} = ${(citationConsistency * 100).toFixed(1)}%(门槛 =100%);伪引用 ${fabricatedCitations}(门槛 =0)`);
console.log(`无证据强答:${strongAnswerWithoutEvidence}(门槛 =0);未授权内容泄漏:${leakCheck.violations.length + leakCheck.blockedSourceResults}(门槛 =0)`);
console.log(`课程口径优先率:N/A(主教材/大纲未到位)`);
console.log(`evidence_links 集成:${evidenceCheck.rowsLinked} 行/${evidenceCheck.runsChecked} run${evidenceCheck.mismatches.length === 0 ? '(全一致)' : ` 不一致:${JSON.stringify(evidenceCheck.mismatches)}`}`);
console.log('--- 逐题(ready) ---');
for (const r of caseReports) {
  const missed = r.concepts.filter((c) => !c.recalled).map((c) => c.concept);
  console.log(
    `${r.locationHit ? '✓' : '✗'} ${r.caseId} [${r.type}] 命中:${r.matchedExpectedSourceIds.join('/') || '(无)'} 来源:${r.returnedSourceIds.slice(0, 4).join(',')}${r.returnedSourceIds.length > 4 ? '…' : ''} ch=${r.channel}` +
      (missed.length > 0 ? ` 概念未召回:${missed.join('/')}` : ''),
  );
}
console.log('--- pending_source(拒答/缺口路径) ---');
for (const r of pendingReports) {
  console.log(
    `${r.gapContractSatisfied ? '✓' : '✗'} ${r.caseId} insufficient=${r.insufficientEvidence} top=${r.topScore === null ? '—' : Number(r.topScore).toFixed(3)} 经由:${r.satisfiedVia ?? '—'} 诉求短语在场:${r.demandProbesPresentInResults.join('/') || '无'} 缺来源:${r.missingExpectedSources.join('/')}`,
  );
}
console.log('--- 短词通道 ---');
for (const w of shortWordReports) {
  console.log(
    `${w.resultCount > 0 ? '✓' : '✗'} ${w.word} ch=${w.channel} n=${w.resultCount} 逐字=${w.verbatimPresentInResults} 层分布 t/p/c=${w.theoryHits}/${w.pharmaContextHits}/${w.companyFactHits} top=${w.topSourceId ?? '—'}`,
  );
}
console.log(`总体:${allPassed ? '全部门槛达成' : '存在未达门槛项(详见 JSON)'} → ${outPath}`);
if (keepDb) console.log(`保留临时库:${join(dir, 'acceptance-v2.sqlite')}`);

db.close();
process.exit(allPassed ? 0 : 1);
