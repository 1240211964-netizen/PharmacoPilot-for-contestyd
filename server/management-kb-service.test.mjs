import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { PharmacoDatabase } from "./db.mjs";
import {
  ManagementKbService,
  managementEvidencePackage,
  persistManagementRetrieval,
  registerManagementCorpus,
} from "./product-core/management-kb-service.mjs";
import { insertCohort, insertCourse, insertLesson } from "./product-core/s1-service.mjs";

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "pharmaco-management-kb-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const sqlitePath = join(dir, "management_course_kb.sqlite");
  const db = new DatabaseSync(sqlitePath);
  db.exec(`
    CREATE TABLE chapters(chapter_id TEXT, title TEXT, order_no INTEGER, status TEXT);
    CREATE TABLE sources(source_id TEXT, filename TEXT, sha256 TEXT, source_type TEXT, authority_level TEXT, authority_rank INTEGER, chapter_ids_json TEXT, lexical_indexing_allowed INTEGER, llm_input_allowed INTEGER, embedding_allowed INTEGER);
    CREATE TABLE chunks(chunk_id TEXT, unit_id TEXT, source_id TEXT, filename TEXT, source_type TEXT, retrieval_layer TEXT, authority_level TEXT, authority_rank INTEGER, chapter_ids_json TEXT, locator_type TEXT, locator TEXT, title TEXT, text TEXT, knowledge_type TEXT, concept_ids_json TEXT, content_hash TEXT, citation_label TEXT);
    CREATE VIRTUAL TABLE chunks_fts USING fts5(chunk_id UNINDEXED, title, text);
    CREATE TABLE concepts(concept_id TEXT, chapter_id TEXT, name TEXT, aliases_json TEXT);
    CREATE TABLE learning_objectives(objective_id TEXT, level TEXT, text TEXT, unit_id TEXT, source_id TEXT, chapter_ids_json TEXT);
    CREATE TABLE relations(source_concept_id TEXT, relation TEXT, target_concept_id TEXT);
  `);
  db.prepare("INSERT INTO chapters VALUES ('CH06', '组织设计', 6, 'ready')").run();
  db.prepare("INSERT INTO sources VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0, 0)").run(
    "SRC-CH06", "组织设计.pptx", "a".repeat(64), "textbook", "A", 1, '["CH06"]',
  );
  db.prepare("INSERT INTO concepts VALUES ('CON-MATRIX', 'CH06', '矩阵制', '[\"矩阵组织\",\"多头指挥\"]')").run();
  db.prepare("INSERT INTO chunks VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
    "CHK-CH06-MATRIX", "UNT-CH06-1", "SRC-CH06", "组织设计.pptx", "textbook", "textbook_core", "A", 1,
    '["CH06"]', "slide", "25", "矩阵制的优点与局限", "矩阵制兼有职能制和事业部制特点，但成员同时接受双重领导，容易产生多头指挥。", "concept", '["CON-MATRIX"]', "b".repeat(64), "《管理学》第六章 · slide 25",
  );
  db.prepare("INSERT INTO chunks_fts VALUES (?, ?, ?)").run("CHK-CH06-MATRIX", "矩阵制的优点与局限", "矩阵制兼有职能制和事业部制特点，但成员同时接受双重领导，容易产生多头指挥。");
  db.prepare("INSERT INTO learning_objectives VALUES ('OBJ-CH06', '掌握', '解释矩阵制的局限', 'UNT-CH06-1', 'SRC-CH06', '[\"CH06\"]')").run();
  db.close();
  const manifestPath = join(dir, "source_manifest.json");
  const versionPath = join(dir, "corpus_version.json");
  writeFileSync(manifestPath, JSON.stringify([{ source_id: "SRC-CH06" }]));
  writeFileSync(versionPath, JSON.stringify({
    corpus_version: "cloud-kb-v1", corpus_version_hash: "c".repeat(64), source_count: 1, chunk_count: 1, built_at: "2026-08-06T00:00:00.000Z",
  }));
  return { dir, sqlitePath, manifestPath, versionPath };
}

test("冻结管理学语料：只读校验、同一证据链留痕、无模型/Embedding", (t) => {
  const external = fixture(t);
  const before = sha256(external.sqlitePath);
  const service = new ManagementKbService({
    enabled: true, path: external.sqlitePath, expectedSha256: before,
    manifestPath: external.manifestPath, corpusVersionPath: external.versionPath, readOnly: true,
  });
  const snapshot = service.open();
  assert.equal(snapshot.accessMode, "read-only");
  assert.equal(snapshot.chunkCount, 1);
  const found = service.search({ query: "矩阵制为什么容易产生多头指挥", chapterIds: ["CH06"] });
  assert.equal(found.embeddingUsed, false);
  assert.equal(found.llmUsed, false);
  assert.equal(found.results[0].externalChunkId, "CHK-CH06-MATRIX");

  const productDir = mkdtempSync(join(tmpdir(), "pharmaco-management-core-test-"));
  t.after(() => rmSync(productDir, { recursive: true, force: true }));
  const product = new PharmacoDatabase(productDir);
  t.after(() => product.close());
  product.db.exec("BEGIN IMMEDIATE");
  const registration = registerManagementCorpus(product.db, service);
  product.db.exec("COMMIT");
  assert.throws(
    () => product.db.prepare("UPDATE kb_external_corpora SET status = 'revoked' WHERE id = ?").run(registration.id),
    /append-only/,
  );
  const actor = { actorType: "teacher", actorId: "teacher-management-kb" };
  const course = insertCourse(product.db, { name: "管理学", code: "MGT-TEST", actorContext: actor });
  const cohort = insertCohort(product.db, { courseId: course.id, name: "测试班", academicTerm: "", actorContext: actor });
  const lesson = insertLesson(product.db, { courseId: course.id, classId: cohort.id, title: "组织设计", actorContext: actor });
  const persisted = persistManagementRetrieval(product.db, service, registration, {
    query: "矩阵制为什么容易产生多头指挥", chapterIds: ["CH06"],
    workflowScope: { courseId: course.id, classId: cohort.id, lessonId: lesson.id }, actorContext: actor,
  });
  const evidence = product.db.prepare("SELECT * FROM evidence_links WHERE retrieval_run_id = ?").all(persisted.retrievalRunId);
  assert.equal(evidence.length, 1);
  assert.equal(evidence[0].evidence_type, "external_knowledge_chunk");
  assert.equal(evidence[0].external_corpus_id, registration.id);
  assert.equal(evidence[0].external_chunk_id, "CHK-CH06-MATRIX");
  const evidencePackage = managementEvidencePackage(product.db, registration, persisted.retrievalRunId);
  assert.equal(evidencePackage.citations[0].externalChunkId, "CHK-CH06-MATRIX");
  const audit = product.db.prepare("SELECT payload_json FROM audit_events WHERE event_type = 'kb.external_retrieval.completed'").get();
  assert.ok(audit);
  assert.ok(!audit.payload_json.includes("矩阵制为什么容易产生多头指挥"));
  service.close();
  assert.equal(sha256(external.sqlitePath), before, "外部 SQLite 不得写入任何字节");
});

test("管理学语料 SHA 不匹配时 fail closed", (t) => {
  const external = fixture(t);
  const service = new ManagementKbService({
    enabled: true, path: external.sqlitePath, expectedSha256: "0".repeat(64),
    manifestPath: external.manifestPath, corpusVersionPath: external.versionPath, readOnly: true,
  });
  assert.throws(() => service.open(), (error) => error.code === "MANAGEMENT_KB_INTEGRITY_FAILED");
});
