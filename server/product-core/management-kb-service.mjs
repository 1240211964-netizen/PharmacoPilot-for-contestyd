// 冻结《管理学》课程语料库的只读适配器。
//
// 此模块刻意不依赖模型、Embedding、向量库或 Product Core 的内容表：课程 SQLite 是
// 只读事实源；Product Core 仅登记语料、记录 retrieval run、保存 evidence link 和审计。
import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import { appendAuditEvent, sha256Hex } from "./audit.mjs";
import { failCode } from "./errors.mjs";
import { newId, nowIso } from "./ids.mjs";

export const MANAGEMENT_CORPUS_ID = "management-principles";
export const MANAGEMENT_SCHEMA_VERSION = "management-course-kb-sqlite-v1";
export const MANAGEMENT_EVIDENCE_PACKAGE_VERSION = "management-kb-evidence-package-v1";

const REQUIRED_TABLE_COLUMNS = Object.freeze({
  chapters: ["chapter_id", "title", "order_no", "status"],
  chunks: [
    "chunk_id", "unit_id", "source_id", "filename", "source_type", "retrieval_layer",
    "authority_level", "authority_rank", "chapter_ids_json", "locator_type", "locator",
    "title", "text", "knowledge_type", "concept_ids_json", "content_hash", "citation_label",
  ],
  concepts: ["concept_id", "chapter_id", "name", "aliases_json"],
  learning_objectives: ["objective_id", "level", "text", "unit_id", "source_id", "chapter_ids_json"],
  relations: ["source_concept_id", "relation", "target_concept_id"],
  sources: [
    "source_id", "filename", "sha256", "source_type", "authority_level", "authority_rank",
    "chapter_ids_json", "lexical_indexing_allowed", "llm_input_allowed", "embedding_allowed",
  ],
});

const STOP_WORDS = new Set([
  "什么", "为什么", "怎么", "如何", "哪些", "一个", "这个", "那个", "以及", "关于", "是否", "可以", "进行",
  "管理", "课程", "组织", "设计", "问题", "分析", "需要", "会", "的", "了", "和", "与", "在", "是", "有", "对", "为", "从", "到",
]);

function fileSha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function parseJsonFile(path, label) {
  if (!path || !existsSync(path)) {
    failCode("MANAGEMENT_KB_INTEGRITY_FAILED", `${label}不存在`, { label });
  }
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    failCode("MANAGEMENT_KB_INTEGRITY_FAILED", `${label}不是有效 JSON`, {
      label,
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalize(value) {
  return String(value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

function compact(value) {
  return normalize(value).replace(/[^\p{L}\p{N}]+/gu, "");
}

function queryTerms(query) {
  const normalized = compact(query);
  const terms = new Set();
  for (const token of normalize(query).split(/[^\p{L}\p{N}]+/u)) {
    if (token.length >= 2 && !STOP_WORDS.has(token)) terms.add(token);
  }
  for (let i = 0; i < normalized.length - 1; i += 1) {
    const gram = normalized.slice(i, i + 2);
    if (!STOP_WORDS.has(gram)) terms.add(gram);
  }
  return [...terms].slice(0, 24);
}

function overlapScore(query, text) {
  const normalizedQuery = compact(query);
  const normalizedText = compact(text);
  if (!normalizedQuery || !normalizedText) return 0;
  let score = normalizedText.includes(normalizedQuery) ? 8 : 0;
  for (const term of queryTerms(query)) {
    if (normalizedText.includes(compact(term))) score += term.length >= 3 ? 1.4 : 0.8;
  }
  return score;
}

function parseChapterIds(value) {
  const parsed = parseJson(value, []);
  return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
}

function safeExcerpt(text, maxLength = 900) {
  const original = String(text ?? "").trim();
  if (original.length <= maxLength) return { text: original, truncated: false };
  return { text: original.slice(0, maxLength), truncated: true };
}

function requireConfigured(config) {
  if (!config?.enabled || !config.path || !config.expectedSha256 || !config.manifestPath || !config.corpusVersionPath) {
    failCode("MANAGEMENT_KB_NOT_CONFIGURED", "管理学知识库未完整配置；不会回退到空库或模型记忆", {
      required: [
        "MANAGEMENT_KB_PATH",
        "MANAGEMENT_KB_EXPECTED_SHA256",
        "MANAGEMENT_KB_MANIFEST_PATH",
        "MANAGEMENT_KB_CORPUS_VERSION_PATH",
        "MANAGEMENT_KB_READ_ONLY=true",
      ],
    });
  }
  if (config.readOnly !== true) {
    failCode("MANAGEMENT_KB_INTEGRITY_FAILED", "管理学知识库必须配置为只读模式", { readOnly: config.readOnly });
  }
  if (!/^[a-f0-9]{64}$/.test(config.expectedSha256)) {
    failCode("MANAGEMENT_KB_INTEGRITY_FAILED", "MANAGEMENT_KB_EXPECTED_SHA256 必须是 64 位 SHA-256", {});
  }
}

function assertSchema(db) {
  const tables = new Map(
    db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table'").all().map((row) => [row.name, row]),
  );
  for (const [table, columns] of Object.entries(REQUIRED_TABLE_COLUMNS)) {
    if (!tables.has(table)) {
      failCode("MANAGEMENT_KB_SCHEMA_MISMATCH", `课程知识库缺少表 ${table}`, { table });
    }
    const actual = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name));
    const missing = columns.filter((column) => !actual.has(column));
    if (missing.length) {
      failCode("MANAGEMENT_KB_SCHEMA_MISMATCH", `课程知识库表 ${table} 缺少必要字段`, { table, missing });
    }
  }
  const fts = tables.get("chunks_fts");
  if (!fts || !/using\s+fts5/i.test(fts.sql ?? "")) {
    failCode("MANAGEMENT_KB_SCHEMA_MISMATCH", "课程知识库缺少 chunks_fts FTS5 索引", {});
  }
}

function currentExternalCorpus(db, corpusId, corpusVersionHash) {
  return db.prepare(
    `SELECT * FROM kb_external_corpora
     WHERE corpus_id = ? AND corpus_version_hash = ?`,
  ).get(corpusId, corpusVersionHash);
}

// 复用既有 KB_RETRIEVAL 工作流类型和审计格式；外部课程库不另起运行系统。
function resolveRetrievalWorkflow(productDb, { workflowInstanceId, workflowScope, actorContext }) {
  if (workflowInstanceId !== null && workflowInstanceId !== undefined) {
    const existing = productDb.prepare("SELECT id FROM workflow_instances WHERE id = ?").get(workflowInstanceId);
    if (!existing) {
      failCode("KB_RETRIEVAL_WORKFLOW_NOT_FOUND", `工作流实例不存在: ${workflowInstanceId}`, { workflowInstanceId });
    }
    return { workflowInstanceId, workflowCreated: false };
  }
  if (!workflowScope?.courseId || !workflowScope?.classId || !workflowScope?.lessonId) {
    failCode("KB_WORKFLOW_SCOPE_REQUIRED", "未传 workflowInstanceId 时必须提供课程、班级和课时范围", {});
  }
  const id = newId("wf");
  const now = nowIso();
  productDb.prepare(
    `INSERT INTO workflow_instances(
       id, workflow_type, course_id, class_id, lesson_id, current_state,
       state_version, state_machine_version, created_by, cancelled_reason, created_at, updated_at
     ) VALUES (?, 'KB_RETRIEVAL', ?, ?, ?, 'DRAFT', 1, '1.0.0', ?, NULL, ?, ?)`,
  ).run(id, workflowScope.courseId, workflowScope.classId, workflowScope.lessonId, actorContext.actorId ?? "system", now, now);
  appendAuditEvent(productDb, {
    eventType: "workflow.created",
    actorType: actorContext.actorType,
    actorId: actorContext.actorId,
    entityType: "workflow_instance",
    entityId: id,
    workflowInstanceId: id,
    nextState: "DRAFT",
    payload: { workflowType: "KB_RETRIEVAL", stateMachineVersion: "1.0.0" },
  });
  return { workflowInstanceId: id, workflowCreated: true };
}

/** 以只读连接打开并验证冻结 SQLite。create/open 绝不会更改外部文件。 */
export class ManagementKbService {
  constructor(config) {
    this.config = config;
    this.db = null;
    this.snapshot = null;
  }

  open() {
    if (this.snapshot) return this.snapshot;
    requireConfigured(this.config);
    if (!existsSync(this.config.path)) {
      failCode("MANAGEMENT_KB_INTEGRITY_FAILED", "管理学知识库 SQLite 不存在", {});
    }
    let canonicalPath;
    try {
      canonicalPath = realpathSync(this.config.path);
    } catch (error) {
      failCode("MANAGEMENT_KB_INTEGRITY_FAILED", "无法解析管理学知识库 SQLite 路径", {
        reason: error instanceof Error ? error.message : String(error),
      });
    }

    const sqliteSha256 = fileSha256(canonicalPath);
    if (sqliteSha256 !== this.config.expectedSha256) {
      failCode("MANAGEMENT_KB_INTEGRITY_FAILED", "管理学知识库 SHA-256 与冻结值不一致", {
        expectedSha256: this.config.expectedSha256,
        actualSha256: sqliteSha256,
      });
    }

    const manifest = parseJsonFile(this.config.manifestPath, "管理学知识库 source manifest");
    const corpusVersion = parseJsonFile(this.config.corpusVersionPath, "管理学知识库 corpus version");
    // v1.2 的冻结版本文件没有重复记录 corpus_id；Product Core 的稳定 ID 由
    // 本接入契约定义，并仅在文件声明时核对其一致性。
    const corpusId = corpusVersion.corpus_id ?? corpusVersion.corpusId ?? MANAGEMENT_CORPUS_ID;
    const corpusVersionHash = corpusVersion.corpus_version_hash ?? corpusVersion.corpusVersionHash;
    if (corpusId !== MANAGEMENT_CORPUS_ID || !/^[a-f0-9]{64}$/.test(String(corpusVersionHash ?? ""))) {
      failCode("MANAGEMENT_KB_INTEGRITY_FAILED", "管理学知识库版本文件不符合冻结语料契约", {
        corpusId: corpusId ?? null,
        hasCorpusVersionHash: Boolean(corpusVersionHash),
      });
    }

    let externalDb;
    try {
      externalDb = new DatabaseSync(canonicalPath, { readOnly: true });
      externalDb.exec("PRAGMA query_only = ON; PRAGMA trusted_schema = OFF;");
      assertSchema(externalDb);
      // 给出一个明确的只读写入探针：既验证连接选项，也避免日后有人改为 rw 后静默写库。
      try {
        externalDb.exec("CREATE TABLE __management_kb_write_probe__(id INTEGER)");
        failCode("MANAGEMENT_KB_INTEGRITY_FAILED", "管理学知识库连接不是只读连接", {});
      } catch (error) {
        if (error instanceof Error && /attempt to write a readonly database/i.test(error.message)) {
          // 预期路径。
        } else if (error?.code === "MANAGEMENT_KB_INTEGRITY_FAILED") {
          throw error;
        } else {
          failCode("MANAGEMENT_KB_INTEGRITY_FAILED", "无法确认管理学知识库为只读连接", {
            reason: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } catch (error) {
      externalDb?.close();
      throw error;
    }

    const counts = Object.fromEntries(
      ["sources", "chunks", "concepts", "relations", "learning_objectives"].map((table) => [
        table,
        externalDb.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count,
      ]),
    );
    const declaredSourceCount = corpusVersion.source_count ?? corpusVersion.sourceCount;
    const declaredChunkCount = corpusVersion.chunk_count ?? corpusVersion.chunkCount;
    if (declaredSourceCount !== counts.sources || declaredChunkCount !== counts.chunks) {
      externalDb.close();
      failCode("MANAGEMENT_KB_INTEGRITY_FAILED", "管理学知识库版本文件的数据数量与 SQLite 不一致", {
        declaredSourceCount,
        actualSourceCount: counts.sources,
        declaredChunkCount,
        actualChunkCount: counts.chunks,
      });
    }

    this.db = externalDb;
    this.snapshot = Object.freeze({
      corpusId,
      corpusVersion: corpusVersion.corpus_version ?? corpusVersion.corpusVersion ?? "cloud-kb-v1",
      corpusVersionHash,
      sqliteSha256,
      manifestSha256: fileSha256(this.config.manifestPath),
      schemaVersion: MANAGEMENT_SCHEMA_VERSION,
      sqliteUserVersion: externalDb.prepare("PRAGMA user_version").get().user_version,
      sourceCount: counts.sources,
      chunkCount: counts.chunks,
      conceptCount: counts.concepts,
      relationCount: counts.relations,
      learningObjectiveCount: counts.learning_objectives,
      createdAt: corpusVersion.created_at ?? corpusVersion.createdAt ?? corpusVersion.built_at ?? null,
      accessMode: "read-only",
      manifestSourceCount: Array.isArray(manifest) ? manifest.length : (Array.isArray(manifest.sources) ? manifest.sources.length : null),
    });
    return this.snapshot;
  }

  close() {
    this.db?.close();
    this.db = null;
    this.snapshot = null;
  }

  search({ query, chapterIds = [], authorityMaxRank = 4, limit = 5 }) {
    const snapshot = this.open();
    if (typeof query !== "string" || compact(query).length < 2) {
      failCode("MANAGEMENT_KB_RETRIEVAL_INPUT_INVALID", "query 至少需要两个有效字符", {});
    }
    if (!Array.isArray(chapterIds) || chapterIds.some((chapterId) => !/^CH(?:0[1-9]|1[0-6])$/.test(chapterId))) {
      failCode("MANAGEMENT_KB_RETRIEVAL_INPUT_INVALID", "chapterIds 必须是 CH01–CH16 数组", { chapterIds });
    }
    if (!Number.isInteger(authorityMaxRank) || authorityMaxRank < 1 || authorityMaxRank > 4) {
      failCode("MANAGEMENT_KB_RETRIEVAL_INPUT_INVALID", "authorityMaxRank 必须是 1–4", { authorityMaxRank });
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 10) {
      failCode("MANAGEMENT_KB_RETRIEVAL_INPUT_INVALID", "limit 必须是 1–10", { limit });
    }

    const concepts = this.db.prepare("SELECT concept_id, name, aliases_json FROM concepts").all();
    const conceptHits = new Map();
    for (const concept of concepts) {
      const aliases = [concept.name, ...parseJson(concept.aliases_json, [])].filter((item) => typeof item === "string");
      const score = Math.max(...aliases.map((alias) => overlapScore(query, alias)), 0);
      if (score > 0) conceptHits.set(concept.concept_id, score);
    }

    const rows = this.db.prepare(
      `SELECT c.*, s.lexical_indexing_allowed, s.llm_input_allowed
       FROM chunks c JOIN sources s ON s.source_id = c.source_id
       WHERE s.lexical_indexing_allowed = 1
         AND s.authority_rank <= ?
         AND c.retrieval_layer != 'product_design'
       ORDER BY c.chunk_id`,
    ).all(authorityMaxRank);
    const results = [];
    for (const row of rows) {
      const rowChapterIds = parseChapterIds(row.chapter_ids_json);
      if (chapterIds.length && !chapterIds.some((chapterId) => rowChapterIds.includes(chapterId))) continue;
      const rowConceptIds = parseJson(row.concept_ids_json, []);
      const conceptScore = Array.isArray(rowConceptIds)
        ? rowConceptIds.reduce((sum, conceptId) => sum + (conceptHits.get(conceptId) ?? 0), 0)
        : 0;
      const score = overlapScore(query, `${row.title} ${row.text}`) + conceptScore + (5 - row.authority_rank) * 0.05;
      if (score <= 0) continue;
      const excerpt = safeExcerpt(row.text);
      results.push({
        externalChunkId: row.chunk_id,
        sourceId: row.source_id,
        filename: row.filename,
        sourceType: row.source_type,
        authorityLevel: row.authority_level,
        authorityRank: row.authority_rank,
        chapterIds: rowChapterIds,
        conceptIds: Array.isArray(rowConceptIds) ? rowConceptIds : [],
        locatorType: row.locator_type,
        locator: row.locator,
        citationLabel: row.citation_label,
        title: row.title,
        contentHash: row.content_hash,
        excerpt: excerpt.text,
        excerptTruncated: excerpt.truncated,
        // 检索许可与模型输入许可是两道不同的门。调用方只能把这一真值为 1 的切片
        // 放入模型上下文，不能由“能检索到”推断“能给模型”。
        llmInputAllowed: Boolean(row.llm_input_allowed),
        score: Number(score.toFixed(4)),
      });
    }
    results.sort((a, b) => b.score - a.score || a.externalChunkId.localeCompare(b.externalChunkId));
    return {
      corpus: snapshot,
      query,
      filters: { chapterIds, authorityMaxRank, limit },
      results: results.slice(0, limit),
      insufficientEvidence: results.length === 0,
      embeddingUsed: false,
      llmUsed: false,
    };
  }
}

/** 将冻结版本登记到 Product Core；相同版本只允许复用，任何字段冲突均拒绝启动。 */
export function registerManagementCorpus(productDb, service, actorContext = { actorType: "system", actorId: "system" }) {
  const snapshot = service.open();
  const existing = currentExternalCorpus(productDb, snapshot.corpusId, snapshot.corpusVersionHash);
  if (existing) {
    const conflicting = [
      ["sqlite_sha256", snapshot.sqliteSha256], ["manifest_sha256", snapshot.manifestSha256],
      ["schema_version", snapshot.schemaVersion], ["source_count", snapshot.sourceCount], ["chunk_count", snapshot.chunkCount],
      ["access_mode", "read-only"],
    ].filter(([field, expected]) => existing[field] !== expected);
    if (conflicting.length) {
      failCode("MANAGEMENT_KB_CORPUS_REGISTRY_CONFLICT", "已登记的管理学语料与当前冻结输入不一致", {
        corpusId: snapshot.corpusId,
        corpusVersionHash: snapshot.corpusVersionHash,
        fields: conflicting.map(([field]) => field),
      });
    }
    return existing;
  }
  const registration = {
    id: newId("kcr"),
    corpusId: snapshot.corpusId,
    corpusVersion: snapshot.corpusVersion,
    corpusVersionHash: snapshot.corpusVersionHash,
    sqliteSha256: snapshot.sqliteSha256,
    manifestSha256: snapshot.manifestSha256,
    schemaVersion: snapshot.schemaVersion,
    sourceCount: snapshot.sourceCount,
    chunkCount: snapshot.chunkCount,
    createdAt: snapshot.createdAt ?? nowIso(),
    registeredAt: nowIso(),
    accessMode: "read-only",
    status: "active",
  };
  productDb.prepare(
    `INSERT INTO kb_external_corpora(
       id, corpus_id, corpus_version, corpus_version_hash, sqlite_sha256, manifest_sha256,
       schema_version, source_count, chunk_count, created_at, registered_at, access_mode, status
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    registration.id, registration.corpusId, registration.corpusVersion, registration.corpusVersionHash,
    registration.sqliteSha256, registration.manifestSha256, registration.schemaVersion,
    registration.sourceCount, registration.chunkCount, registration.createdAt, registration.registeredAt,
    registration.accessMode, registration.status,
  );
  appendAuditEvent(productDb, {
    eventType: "kb.external_corpus.registered",
    actorType: actorContext.actorType,
    actorId: actorContext.actorId,
    entityType: "external_corpus",
    entityId: registration.id,
    payload: {
      corpusId: registration.corpusId,
      corpusVersionHash: registration.corpusVersionHash,
      sqliteSha256: registration.sqliteSha256,
      manifestSha256: registration.manifestSha256,
      sourceCount: registration.sourceCount,
      chunkCount: registration.chunkCount,
      accessMode: registration.accessMode,
    },
  });
  return productDb.prepare("SELECT * FROM kb_external_corpora WHERE id = ?").get(registration.id);
}

/** 在既有 kb_retrieval_runs/evidence_links/audit_events 中记录外挂语料检索。 */
export function persistManagementRetrieval(productDb, service, registration, {
  query,
  chapterIds = [],
  authorityMaxRank = 4,
  limit = 5,
  workflowInstanceId = null,
  workflowScope = null,
  actorContext,
}) {
  const result = service.search({ query, chapterIds, authorityMaxRank, limit });
  const workflow = resolveRetrievalWorkflow(productDb, { workflowInstanceId, workflowScope, actorContext });
  const run = {
    id: newId("krr"),
    workflowInstanceId: workflow.workflowInstanceId,
    query,
    filters: {
      corpusId: result.corpus.corpusId,
      externalCorpusId: registration.id,
      chapterIds,
      authorityMaxRank,
      retrievalMode: "deterministic-lexical",
      embeddingUsed: false,
      llmUsed: false,
    },
    corpusVersionHash: result.corpus.corpusVersionHash,
    createdBy: actorContext.actorId,
    createdAt: nowIso(),
  };
  const storedResults = result.results.map((item) => ({ ...item, externalCorpusId: registration.id }));
  productDb.exec("BEGIN IMMEDIATE");
  try {
    productDb.prepare(
      `INSERT INTO kb_retrieval_runs(
         id, workflow_instance_id, query_text, filters_json, corpus_version_hash,
         results_json, result_count, schema_version, created_by, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, '1.0.0', ?, ?)`,
    ).run(
      run.id, run.workflowInstanceId, run.query, JSON.stringify(run.filters), run.corpusVersionHash,
      JSON.stringify(storedResults), storedResults.length, run.createdBy, run.createdAt,
    );
    if (workflow.workflowCreated) {
      productDb.prepare(
        `UPDATE workflow_instances
         SET current_state = 'EVIDENCE_RETRIEVED', state_version = state_version + 1, updated_at = ?
         WHERE id = ? AND state_version = 1`,
      ).run(run.createdAt, workflow.workflowInstanceId);
      appendAuditEvent(productDb, {
        eventType: "workflow.transitioned",
        actorType: actorContext.actorType,
        actorId: actorContext.actorId,
        entityType: "workflow_instance",
        entityId: workflow.workflowInstanceId,
        workflowInstanceId: workflow.workflowInstanceId,
        previousState: "DRAFT",
        nextState: "EVIDENCE_RETRIEVED",
        payload: { action: "completeRetrieval" },
      });
    }
    const evidence = storedResults.map((item) => {
      const id = newId("ev");
      const numericLocator = /^\d+$/.test(String(item.locator)) ? Number(item.locator) : null;
      productDb.prepare(
        `INSERT INTO evidence_links(
           id, claim_id, decision_id, evidence_type, source_id, source_version_id, content_block_id,
           external_corpus_id, external_chunk_id, external_locator_json, runtime_observation_id,
           page_index, page_label, bbox_json, bbox_coordinate_system, verbatim_quote, normalized_quote,
           source_status, effective_date, superseded_by, content_hash, retrieved_at, retrieval_run_id
         ) VALUES (?, NULL, NULL, 'external_knowledge_chunk', ?, ?, NULL, ?, ?, ?, NULL, ?, ?, NULL, 'none', ?, ?, 'active', NULL, NULL, ?, ?, ?)`,
      ).run(
        id, item.sourceId, `external:${registration.id}`, registration.id, item.externalChunkId,
        JSON.stringify({ locatorType: item.locatorType, locator: item.locator, citationLabel: item.citationLabel }),
        numericLocator, `${item.locatorType} ${item.locator}`, item.excerpt, normalize(item.excerpt),
        item.contentHash, run.createdAt, run.id,
      );
      return { id, externalChunkId: item.externalChunkId };
    });
    appendAuditEvent(productDb, {
      eventType: "kb.external_retrieval.completed",
      actorType: actorContext.actorType,
      actorId: actorContext.actorId,
      entityType: "kb_retrieval_run",
      entityId: run.id,
      workflowInstanceId: run.workflowInstanceId,
      payload: {
        externalCorpusId: registration.id,
        corpusVersionHash: run.corpusVersionHash,
        querySha256: sha256Hex(query),
        chapterIds,
        authorityMaxRank,
        resultCount: storedResults.length,
        evidenceCount: evidence.length,
        retrievalMode: "deterministic-lexical",
        embeddingUsed: false,
        llmUsed: false,
      },
    });
    productDb.exec("COMMIT");
    return {
      retrievalRunId: run.id,
      workflowInstanceId: run.workflowInstanceId,
      corpus: { ...result.corpus, externalCorpusId: registration.id },
      query,
      filters: run.filters,
      results: storedResults,
      evidence,
      insufficientEvidence: result.insufficientEvidence,
      embeddingUsed: false,
      llmUsed: false,
    };
  } catch (error) {
    productDb.exec("ROLLBACK");
    throw error;
  }
}

/** 返回可直接供 S1–S9 人工设计/审核使用的可追溯证据包；不生成教案。 */
export function managementEvidencePackage(productDb, registration, retrievalRunId) {
  const run = productDb.prepare("SELECT * FROM kb_retrieval_runs WHERE id = ?").get(retrievalRunId);
  if (!run) {
    failCode("MANAGEMENT_KB_RETRIEVAL_RUN_NOT_FOUND", `管理学检索 run 不存在: ${retrievalRunId}`, { retrievalRunId });
  }
  const filters = parseJson(run.filters_json, {});
  if (filters.externalCorpusId !== registration.id || filters.corpusId !== MANAGEMENT_CORPUS_ID) {
    failCode("MANAGEMENT_KB_RETRIEVAL_RUN_NOT_FOUND", `检索 run 不属于当前管理学冻结语料: ${retrievalRunId}`, { retrievalRunId });
  }
  const rows = productDb.prepare(
    `SELECT id, source_id, source_version_id, external_corpus_id, external_chunk_id, external_locator_json,
            page_index, page_label, verbatim_quote, normalized_quote, content_hash, retrieved_at
     FROM evidence_links
     WHERE retrieval_run_id = ? AND evidence_type = 'external_knowledge_chunk'
     ORDER BY id`,
  ).all(retrievalRunId);
  return {
    packageVersion: MANAGEMENT_EVIDENCE_PACKAGE_VERSION,
    corpus: {
      externalCorpusId: registration.id,
      corpusId: registration.corpus_id,
      corpusVersion: registration.corpus_version,
      corpusVersionHash: registration.corpus_version_hash,
      sqliteSha256: registration.sqlite_sha256,
      manifestSha256: registration.manifest_sha256,
      schemaVersion: registration.schema_version,
      accessMode: registration.access_mode,
    },
    retrievalRun: {
      id: run.id,
      workflowInstanceId: run.workflow_instance_id,
      query: run.query_text,
      filters,
      resultCount: run.result_count,
      createdAt: run.created_at,
      createdBy: run.created_by,
    },
    citations: rows.map((row) => ({
      evidenceLinkId: row.id,
      sourceId: row.source_id,
      sourceVersionId: row.source_version_id,
      externalChunkId: row.external_chunk_id,
      locator: parseJson(row.external_locator_json, null),
      pageIndex: row.page_index,
      pageLabel: row.page_label,
      verbatimQuote: row.verbatim_quote,
      normalizedQuote: row.normalized_quote,
      contentHash: row.content_hash,
      retrievedAt: row.retrieved_at,
    })),
    llmUsed: false,
    embeddingUsed: false,
  };
}
