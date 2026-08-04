// KB 教师审核 API 与 Product Core 检索闭环测试(/api/product-core/kb/,真实 HTTP + 临时库)。
// 流程:migrations -> 真实 manifest 摄入(旧 OpenStax 管线 + 008 权威来源管线)->
// 三层单元构建(builder)-> 走 API:列表过滤 / 详情(片段+权限+时间线)/ review 四态 /
// revised 留原文 / rejected 后检索排除 / case_candidate 仅教师置位 / retrieve 全流程
// (run + evidence_links + 审计 + 工作流复用)/ gaps 只读 / 未授权 401。
// modelClient.chat 直接抛错:整条闭环零模型调用(无 MLX 也必须全绿)。
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createPharmacoServer } from "./app.mjs";
import { loadConfig } from "./config.mjs";
import { PharmacoDatabase } from "./db.mjs";
import { ingestAuthoritativeManifest } from "./product-core/kb-authoritative-ingest.mjs";
import { buildLayeredKnowledgeBase } from "./product-core/kb-unit-builder.mjs";
import { registerSourcesFromManifest } from "./product-core/knowledge-source-service.mjs";
import { extractKeyTermsDeterministic } from "./product-core/knowledge-unit-service.mjs";

const SERVER_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(SERVER_DIR, "..");
const NEW_MANIFEST_PATH = join(PROJECT_ROOT, "docs/knowledge-base/organization-design-authoritative-sources-manifest.json");
const OLD_MANIFEST_PATH = join(PROJECT_ROOT, "docs/knowledge-base/organization-design-source-manifest.json");
const COURSE_ID = "course_mgmt_principles";
const CHAPTER_ID = "ch_organization_design";
const INGEST_ACTOR = { actorType: "system", actorId: "test-kb-review-api" };
const TEACHER = "teacher-kb-api";

const noModelClient = {
  async status() {
    return { ready: false, endpoint: "http://127.0.0.1:1/v1", model: "none", advertisedModels: [] };
  },
  async chat() {
    throw new Error("KB 审核/检索闭环不允许调用任何模型");
  },
};

async function api(base, method, path, body, headers = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await response.json();
  return { status: response.status, body: json };
}

function expectError(result, status, code) {
  assert.equal(result.status, status, `期望 ${status},实际 ${result.status}: ${JSON.stringify(result.body)}`);
  assert.equal(result.body.error.code, code);
  assert.equal(typeof result.body.error.message, "string");
}

test("KB 教师审核 API 与检索闭环(真实语料)", async (t) => {
  const tempDir = mkdtempSync(join(tmpdir(), "pharmaco-kb-review-api-"));
  const config = loadConfig({
    rootDir: PROJECT_ROOT,
    dataDir: tempDir,
    host: "127.0.0.1",
    port: 0,
    modelBaseUrl: "http://127.0.0.1:1/v1",
    modelName: "no-model",
  });
  const database = new PharmacoDatabase(config.dataDir);
  const db = database.db;

  // 真实语料:旧 manifest(OpenStax 两份)+ 008 权威来源 manifest,再三层层构建(幂等纪律同 builder 测试)。
  await registerSourcesFromManifest(db, OLD_MANIFEST_PATH, INGEST_ACTOR);
  await ingestAuthoritativeManifest(db, NEW_MANIFEST_PATH, INGEST_ACTOR);
  extractKeyTermsDeterministic(db, { courseId: COURSE_ID, chapterId: CHAPTER_ID, actorContext: INGEST_ACTOR });
  buildLayeredKnowledgeBase(db, { courseId: COURSE_ID, chapterId: CHAPTER_ID, actorContext: INGEST_ACTOR });

  const server = createPharmacoServer({ config, database, modelClient: noModelClient, logger: { error() {} } });
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const base = `http://127.0.0.1:${server.address().port}`;

  t.after(async () => {
    await new Promise((resolveClose) => server.close(resolveClose));
    database.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  // ------------------------------------------------------------------
  await t.test("列表:三层统一视图与 layer/reviewStatus/concept/chapterId 过滤", async () => {
    const all = await api(base, "GET", "/api/product-core/kb/units");
    assert.equal(all.status, 200, JSON.stringify(all.body).slice(0, 400));
    assert.ok(all.body.unitCount > 0);
    assert.equal(all.body.units.length, all.body.unitCount);
    const layers = new Set(all.body.units.map((u) => u.layer));
    for (const layer of ["theory", "pharma_context", "company_fact"]) {
      assert.ok(layers.has(layer), `列表缺 ${layer} 层`);
    }
    for (const unit of all.body.units) {
      assert.ok(unit.id && unit.reviewStatus && unit.knowledgePoint, `列表项缺字段: ${JSON.stringify(unit)}`);
      assert.ok(unit.sourceCount >= 1, `${unit.id} 来源数必须 ≥1(无孤儿单元)`);
      assert.ok(unit.content && typeof unit.content === "object");
    }

    const pharmaOnly = await api(base, "GET", "/api/product-core/kb/units?layer=pharma_context");
    assert.equal(pharmaOnly.status, 200);
    assert.ok(pharmaOnly.body.unitCount >= 20);
    assert.ok(pharmaOnly.body.units.every((u) => u.layer === "pharma_context"));

    const needsReview = await api(base, "GET", "/api/product-core/kb/units?reviewStatus=needs_review");
    assert.ok(needsReview.body.unitCount > 0);
    assert.ok(needsReview.body.units.every((u) => u.reviewStatus === "needs_review"));

    const chapter = await api(base, "GET", `/api/product-core/kb/units?chapterId=${CHAPTER_ID}`);
    assert.ok(chapter.body.unitCount > 0);
    assert.ok(chapter.body.units.every((u) => u.chapterId === CHAPTER_ID));

    // concept 过滤按层落各自知识点字段:theory→concept(精确,大小写不敏感)。
    const theoryOne = all.body.units.find((u) => u.layer === "theory");
    const byConcept = await api(base, "GET", `/api/product-core/kb/units?layer=theory&concept=${encodeURIComponent(theoryOne.content.concept)}`);
    assert.ok(byConcept.body.unitCount >= 1);
    assert.ok(byConcept.body.units.every((u) => u.content.concept.toLowerCase() === theoryOne.content.concept.toLowerCase()));
    // pharma_context→aspect。
    const byAspect = await api(base, "GET", "/api/product-core/kb/units?layer=pharma_context&concept=dtc_committee");
    assert.ok(byAspect.body.unitCount >= 1);
    assert.ok(byAspect.body.units.every((u) => u.content.aspect === "dtc_committee"));

    expectError(await api(base, "GET", "/api/product-core/kb/units?layer=market"), 400, "KB_LAYER_INVALID");
    expectError(await api(base, "GET", "/api/product-core/kb/units?reviewStatus=maybe"), 400, "KB_REVIEW_STATUS_INVALID");
  });

  // ------------------------------------------------------------------
  await t.test("详情:内容/来源/权限/片段/模型状态/审计时间线齐全", async () => {
    const list = await api(base, "GET", "/api/product-core/kb/units?layer=pharma_context&concept=dtc_committee");
    const summary = list.body.units[0];
    const detail = await api(base, "GET", `/api/product-core/kb/units/pharma_context/${summary.id}`);
    assert.equal(detail.status, 200, JSON.stringify(detail.body).slice(0, 400));
    const unit = detail.body.unit;
    assert.equal(unit.id, summary.id);
    assert.equal(unit.layer, "pharma_context");
    assert.equal(unit.reviewStatus, "needs_review");
    assert.ok(unit.content.statement.length > 0);
    assert.equal(unit.knowledgePoint, "dtc_committee");

    // 来源:asset 标题 / authorityLevel / permissionStatus + 五项权限。
    assert.ok(unit.sources.length >= 1);
    const source = unit.sources[0];
    assert.ok(source.title, "来源缺 asset 标题");
    assert.ok([1, 2].includes(source.authorityLevel), `authorityLevel 异常: ${source.authorityLevel}`);
    assert.equal(typeof source.permissionStatus, "string");
    for (const key of ["deterministicParsingAllowed", "lexicalIndexingAllowed", "llmInputAllowed", "embeddingAllowed", "publicRedistributionAllowed"]) {
      assert.equal(typeof source.permissions[key], "boolean", `权限缺 ${key}`);
    }
    assert.equal(source.permissions.deterministicParsingAllowed, true, "已摄入来源必须授权确定性解析");
    assert.equal(source.permissions.llmInputAllowed, false, "当前口径全量禁模型处理");

    // 原文片段:verbatim 含单元 statement(摘录原文),带页码或章节锚。
    assert.ok(unit.fragments.length >= 1);
    assert.ok(unit.fragments.some((f) => f.verbatim.includes(unit.content.statement)), "片段 verbatim 必须包含单元 statement");
    const fragment = unit.fragments[0];
    assert.ok(fragment.fragmentId && fragment.contentHash?.startsWith("sha256:"));
    assert.ok(fragment.pageLabel !== undefined && "sectionAnchor" in fragment, "片段须带回显页码/章节锚字段");

    // 模型处理状态:当前恒"未使用模型"。
    assert.equal(unit.modelProcessing.status, "unused");
    assert.equal(unit.modelProcessing.label, "未使用模型");

    // 审计时间线:至少含 kb.unit.created(builder 建档)。
    assert.ok(unit.auditTimeline.some((e) => e.eventType === "kb.unit.created" && e.entityId === unit.id));
    for (const event of unit.auditTimeline) assert.match(event.eventHash, /^[a-f0-9]{64}$/);

    // 404/400。
    expectError(await api(base, "GET", "/api/product-core/kb/units/theory/ku_000000000000000000000"), 404, "KB_UNIT_NOT_FOUND");
    expectError(await api(base, "GET", "/api/product-core/kb/units/market/pcx_x"), 400, "KB_LAYER_INVALID");
  });

  // ------------------------------------------------------------------
  await t.test("review:四态流转 + 审计;非法状态/缺 reviewerId 被拒", async () => {
    const theory = (await api(base, "GET", "/api/product-core/kb/units?layer=theory&reviewStatus=machine_extracted")).body.units[0];
    const verified = await api(base, "POST", `/api/product-core/kb/units/theory/${theory.id}/review`, {
      reviewStatus: "teacher_verified", reviewerId: TEACHER, comment: "定义与原文一致",
    });
    assert.equal(verified.status, 200, JSON.stringify(verified.body));
    assert.equal(verified.body.previousStatus, "machine_extracted");
    assert.equal(verified.body.reviewStatus, "teacher_verified");
    assert.equal(verified.body.revisedUnitId, null);

    const pharma = (await api(base, "GET", "/api/product-core/kb/units?layer=pharma_context&reviewStatus=needs_review")).body.units[0];
    for (const target of ["teacher_verified", "needs_review", "rejected"]) {
      const result = await api(base, "POST", `/api/product-core/kb/units/pharma_context/${pharma.id}/review`, {
        reviewStatus: target, reviewerId: TEACHER,
      });
      assert.equal(result.status, 200, JSON.stringify(result.body));
      assert.equal(result.body.reviewStatus, target);
    }
    const detail = await api(base, "GET", `/api/product-core/kb/units/pharma_context/${pharma.id}`);
    assert.equal(detail.body.unit.reviewStatus, "rejected");
    const reviewed = detail.body.unit.auditTimeline.filter((e) => e.eventType === "kb.unit.reviewed");
    assert.equal(reviewed.length, 3);
    assert.deepEqual(reviewed.map((e) => e.nextState), ["teacher_verified", "needs_review", "rejected"]);
    assert.equal(reviewed[0].previousState, "needs_review");
    assert.ok(reviewed.every((e) => e.actorId === TEACHER && e.actorType === "teacher"));

    const company = (await api(base, "GET", "/api/product-core/kb/units?layer=company_fact")).body.units[0];
    const companyReview = await api(base, "POST", `/api/product-core/kb/units/company_fact/${company.id}/review`, {
      reviewStatus: "machine_extracted", reviewerId: TEACHER,
    });
    assert.equal(companyReview.status, 200);
    assert.equal(companyReview.body.previousStatus, "needs_review");

    expectError(
      await api(base, "POST", `/api/product-core/kb/units/theory/${theory.id}/review`, { reviewStatus: "approved", reviewerId: TEACHER }),
      400, "KB_REVIEW_STATUS_INVALID",
    );
    expectError(
      await api(base, "POST", `/api/product-core/kb/units/theory/${theory.id}/review`, { reviewStatus: "teacher_verified" }),
      400, "INVALID_PRODUCT_CORE_BODY",
    );
    expectError(
      await api(base, "POST", "/api/product-core/kb/units/pharma_context/pcx_000000000000000000000/review", { reviewStatus: "rejected", reviewerId: TEACHER }),
      404, "KB_UNIT_NOT_FOUND",
    );
  });

  // ------------------------------------------------------------------
  await t.test("review+editedStatement:supersedes 链建修订版,原单元保留原文", async () => {
    const target = (await api(base, "GET", "/api/product-core/kb/units?layer=pharma_context&reviewStatus=needs_review")).body.units[0];
    const before = (await api(base, "GET", `/api/product-core/kb/units/pharma_context/${target.id}`)).body.unit;
    const EDITED = `${before.content.statement}(教师修订:表述收紧,原文保留于原单元)`;

    const result = await api(base, "POST", `/api/product-core/kb/units/pharma_context/${target.id}/review`, {
      reviewStatus: "teacher_verified", reviewerId: TEACHER, comment: "修订措辞", editedStatement: EDITED,
    });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.match(result.body.revisedUnitId, /^pcx_/);
    assert.equal(result.body.unitId, result.body.revisedUnitId);
    assert.equal(result.body.reviewedUnitId, target.id);

    // 原单元:原文只字不动,superseded_by 指向修订版。
    const original = (await api(base, "GET", `/api/product-core/kb/units/pharma_context/${target.id}`)).body.unit;
    assert.equal(original.content.statement, before.content.statement, "原单元 statement 不可改");
    assert.equal(original.supersededBy, result.body.revisedUnitId);

    // 修订版:statement 为教师修订文本,supersedes 链回指,继承来源片段,状态已流转。
    const revised = (await api(base, "GET", `/api/product-core/kb/units/pharma_context/${result.body.revisedUnitId}`)).body.unit;
    assert.equal(revised.content.statement, EDITED);
    assert.equal(revised.supersedesUnitId, target.id);
    assert.equal(revised.reviewStatus, "teacher_verified");
    assert.deepEqual(
      revised.fragments.map((f) => f.fragmentId).sort(),
      before.fragments.map((f) => f.fragmentId).sort(),
      "修订版必须继承原单元来源片段",
    );
    const eventTypes = revised.auditTimeline.map((e) => e.eventType);
    assert.ok(eventTypes.includes("kb.unit.revised"));
    assert.ok(eventTypes.includes("kb.unit.reviewed"));
    const revisedEvent = revised.auditTimeline.find((e) => e.eventType === "kb.unit.revised");
    assert.equal(revisedEvent.payload.supersedesUnitId, target.id);
    assert.match(revisedEvent.payload.editedStatementSha256, /^[a-f0-9]{64}$/);
  });

  // ------------------------------------------------------------------
  await t.test("case_candidate:仅教师 + teacher_verified + company_fact 可置位", async () => {
    const company = (await api(base, "GET", "/api/product-core/kb/units?layer=company_fact&reviewStatus=needs_review")).body.units[0];

    // 非教师身份置位 → 403。
    expectError(
      await api(base, "POST", `/api/product-core/kb/units/company_fact/${company.id}/review`, {
        reviewStatus: "teacher_verified", reviewerId: "student-1", actorType: "student", caseCandidate: true,
      }),
      403, "KB_CASE_CANDIDATE_TEACHER_ONLY",
    );
    // 非 company_fact 层置位 → 400。
    const theory = (await api(base, "GET", "/api/product-core/kb/units?layer=theory")).body.units[0];
    expectError(
      await api(base, "POST", `/api/product-core/kb/units/theory/${theory.id}/review`, {
        reviewStatus: "teacher_verified", reviewerId: TEACHER, caseCandidate: true,
      }),
      400, "KB_CASE_CANDIDATE_INVALID",
    );
    // 非 teacher_verified 结论置位 → 400。
    expectError(
      await api(base, "POST", `/api/product-core/kb/units/company_fact/${company.id}/review`, {
        reviewStatus: "needs_review", reviewerId: TEACHER, caseCandidate: true,
      }),
      400, "KB_CASE_CANDIDATE_INVALID",
    );

    // 教师 + teacher_verified → 置位成功并审计。
    const ok = await api(base, "POST", `/api/product-core/kb/units/company_fact/${company.id}/review`, {
      reviewStatus: "teacher_verified", reviewerId: TEACHER, caseCandidate: true, comment: "可作教学案例",
    });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.caseCandidateSet, true);
    const detail = (await api(base, "GET", `/api/product-core/kb/units/company_fact/${company.id}`)).body.unit;
    assert.equal(detail.content.caseCandidate, true);
    assert.equal(detail.reviewStatus, "teacher_verified");
    assert.ok(detail.auditTimeline.some((e) => e.eventType === "kb.unit.case_candidate.set" && e.actorId === TEACHER));
  });

  // ------------------------------------------------------------------
  await t.test("retrieve:全流程留痕(run + evidence_links + 审计),工作流创建/复用", async () => {
    const first = await api(base, "POST", "/api/product-core/kb/retrieve", {
      query: "matrix structure", filters: { courseId: COURSE_ID, chapterId: CHAPTER_ID }, limit: 10, actorId: TEACHER,
    });
    assert.equal(first.status, 200, JSON.stringify(first.body).slice(0, 400));
    assert.match(first.body.retrievalRunId, /^krr_/);
    assert.match(first.body.workflowInstanceId, /^wf_/);
    assert.equal(first.body.workflowCreated, true, "首次检索应创建 KB_RETRIEVAL 工作流");
    assert.ok(first.body.corpusVersionHash.startsWith("sha256:"));
    assert.ok(Array.isArray(first.body.results));
    assert.equal(first.body.resultCount, first.body.results.length);
    assert.equal(first.body.evidenceIds.length, first.body.results.length, "每条结果落一条 evidence_links");
    assert.equal(typeof first.body.insufficientEvidence, "boolean");

    const workflow = db.prepare("SELECT * FROM workflow_instances WHERE id = ?").get(first.body.workflowInstanceId);
    assert.equal(workflow.workflow_type, "KB_RETRIEVAL");
    assert.equal(workflow.current_state, "EVIDENCE_RETRIEVED");

    // 同 actor 再次检索:复用同一工作流,不新建。
    const second = await api(base, "POST", "/api/product-core/kb/retrieve", {
      query: "span of control", filters: { courseId: COURSE_ID, chapterId: CHAPTER_ID }, actorId: TEACHER,
    });
    assert.equal(second.status, 200);
    assert.equal(second.body.workflowCreated, false);
    assert.equal(second.body.workflowInstanceId, first.body.workflowInstanceId);

    // run 详情:查询/过滤/corpusVersionHash/结果(单元/片段/来源/scores)/证据齐全。
    const run = await api(base, "GET", `/api/product-core/kb/retrieval-runs/${first.body.retrievalRunId}`);
    assert.equal(run.status, 200, JSON.stringify(run.body).slice(0, 400));
    assert.equal(run.body.query, "matrix structure");
    assert.deepEqual(run.body.filters, { courseId: COURSE_ID, chapterId: CHAPTER_ID });
    assert.equal(run.body.corpusVersionHash, first.body.corpusVersionHash);
    assert.equal(run.body.resultCount, first.body.resultCount);
    assert.deepEqual(run.body.results, first.body.results);
    assert.equal(run.body.evidenceLinks.length, first.body.evidenceIds.length);
    assert.deepEqual(run.body.evidenceLinks.map((e) => e.id).sort(), [...first.body.evidenceIds].sort());
    for (const link of run.body.evidenceLinks) {
      assert.equal(link.evidenceType, "knowledge_block");
      assert.equal(link.claimId, null, "检索阶段证据未绑定断言(007)");
      assert.ok(link.contentBlockId && link.verbatimQuote && link.contentHash);
    }

    // 审计:kb.retrieval.completed + kb.evidence.attached(有结果时)挂在该 run 上。
    const completed = db.prepare("SELECT * FROM audit_events WHERE event_type = 'kb.retrieval.completed' AND entity_id = ?").get(first.body.retrievalRunId);
    assert.ok(completed, "缺 kb.retrieval.completed 审计");
    assert.equal(JSON.parse(completed.payload_json).corpusVersionHash, first.body.corpusVersionHash);
    if (first.body.resultCount > 0) {
      const attached = db.prepare("SELECT * FROM audit_events WHERE event_type = 'kb.evidence.attached' AND entity_id = ?").get(first.body.retrievalRunId);
      assert.ok(attached, "缺 kb.evidence.attached 审计");
      assert.equal(JSON.parse(attached.payload_json).evidenceCount, first.body.evidenceIds.length);
    }

    // 参数校验与 404。
    expectError(await api(base, "POST", "/api/product-core/kb/retrieve", { query: "x", actorId: TEACHER, filters: { bogus: "y" } }), 400, "KB_RETRIEVAL_INPUT_INVALID");
    expectError(await api(base, "POST", "/api/product-core/kb/retrieve", { query: "matrix", actorId: TEACHER, limit: 0 }), 400, "KB_RETRIEVAL_INPUT_INVALID");
    expectError(await api(base, "POST", "/api/product-core/kb/retrieve", { query: "matrix structure" }), 400, "INVALID_PRODUCT_CORE_BODY");
    expectError(await api(base, "POST", "/api/product-core/kb/retrieve", { actorId: TEACHER }), 400, "INVALID_PRODUCT_CORE_BODY");
    expectError(await api(base, "GET", "/api/product-core/kb/retrieval-runs/krr_000000000000000000000"), 404, "KB_RETRIEVAL_RUN_NOT_FOUND");
  });

  // ------------------------------------------------------------------
  await t.test("rejected 单元的独占片段在检索中排除", async () => {
    // 选一个 theory 单元:其片段仅被该单元链接(rejected 独占排除才生效)。
    const candidate = db
      .prepare(
        `SELECT u.id AS unit_id, u.concept AS concept, uf.fragment_id AS fragment_id
         FROM kb_knowledge_units u
         JOIN kb_unit_fragments uf ON uf.unit_id = u.id
         WHERE u.review_status <> 'rejected'
           AND (SELECT COUNT(*) FROM kb_unit_fragments x WHERE x.fragment_id = uf.fragment_id) = 1
         ORDER BY u.id
         LIMIT 1`,
      )
      .get();
    assert.ok(candidate, "语料中应存在独占片段的 theory 单元");

    const retrieve = () => api(base, "POST", "/api/product-core/kb/retrieve", {
      query: candidate.concept, filters: { courseId: COURSE_ID, chapterId: CHAPTER_ID }, actorId: TEACHER,
    });
    const before = await retrieve();
    assert.equal(before.status, 200, JSON.stringify(before.body).slice(0, 400));
    assert.ok(
      before.body.results.some((r) => r.mergedFragmentIds.includes(candidate.fragment_id)),
      `拒绝前检索应命中该单元片段(concept=${candidate.concept}): ${JSON.stringify(before.body.results.map((r) => r.fragmentId))}`,
    );

    const reject = await api(base, "POST", `/api/product-core/kb/units/theory/${candidate.unit_id}/review`, {
      reviewStatus: "rejected", reviewerId: TEACHER, comment: "内容不适用,拒绝",
    });
    assert.equal(reject.status, 200);

    const after = await retrieve();
    assert.equal(after.status, 200);
    assert.ok(
      !after.body.results.some((r) => r.mergedFragmentIds.includes(candidate.fragment_id)),
      "rejected 单元独占片段必须从检索结果排除",
    );
  });

  // ------------------------------------------------------------------
  await t.test("gaps:只读列表与 status 过滤;resolve 路由本轮不开放", async () => {
    const all = await api(base, "GET", "/api/product-core/kb/gaps");
    assert.equal(all.status, 200);
    assert.equal(all.body.gapCount, all.body.gaps.length);
    const questionIds = new Set(all.body.gaps.map((g) => g.questionId));
    for (const id of ["od-eval-15", "od-eval-20", "od-eval-24", "od-eval-25", "od-eval-29", "od-eval-30"]) {
      assert.ok(questionIds.has(id), `缺缺口 ${id}`);
    }

    const open = await api(base, "GET", "/api/product-core/kb/gaps?status=open");
    assert.ok(open.body.gapCount >= 2);
    assert.ok(open.body.gaps.every((g) => g.status === "open"));
    const resolved = await api(base, "GET", "/api/product-core/kb/gaps?status=resolved");
    assert.ok(resolved.body.gapCount >= 4);
    assert.ok(resolved.body.gaps.every((g) => g.status === "resolved" && g.resolutionNote && g.resolvedAt));

    expectError(await api(base, "GET", "/api/product-core/kb/gaps?status=closed"), 400, "KB_GAP_INPUT_INVALID");
    expectError(
      await api(base, "POST", `/api/product-core/kb/gaps/${all.body.gaps[0].id}/resolve`, { resolutionNote: "x" }),
      404, "API_NOT_FOUND",
    );
  });
});

// 未授权:配置 apiToken 后,KB 路由与其余 /api 一样走统一 401(独立于语料,轻量库即可)。
test("KB 路由未授权:无 token / 错 token → 401 UNAUTHORIZED", async (t) => {
  const tempDir = mkdtempSync(join(tmpdir(), "pharmaco-kb-review-auth-"));
  const config = loadConfig({
    rootDir: PROJECT_ROOT,
    dataDir: tempDir,
    host: "127.0.0.1",
    port: 0,
    modelBaseUrl: "http://127.0.0.1:1/v1",
    modelName: "no-model",
    apiToken: "kb-secret-token",
  });
  const database = new PharmacoDatabase(config.dataDir);
  const server = createPharmacoServer({ config, database, modelClient: noModelClient, logger: { error() {} } });
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const base = `http://127.0.0.1:${server.address().port}`;

  t.after(async () => {
    await new Promise((resolveClose) => server.close(resolveClose));
    database.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  expectError(await api(base, "GET", "/api/product-core/kb/units"), 401, "UNAUTHORIZED");
  expectError(
    await api(base, "POST", "/api/product-core/kb/retrieve", { query: "q", actorId: "a" }, { authorization: "Bearer wrong" }),
    401, "UNAUTHORIZED",
  );
  const ok = await api(base, "GET", "/api/product-core/kb/units", undefined, { authorization: "Bearer kb-secret-token" });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.unitCount, 0);
});
