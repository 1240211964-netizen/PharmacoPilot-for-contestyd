#!/usr/bin/env node
// 真实《管理学》冻结语料的 P1 验收。显式提供环境变量才运行，避免把本地课程资产写入 Git。
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { createPharmacoServer } from "../server/app.mjs";
import { loadConfig } from "../server/config.mjs";
import { PharmacoDatabase } from "../server/db.mjs";

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} 未设置；真实冻结语料验收拒绝猜测路径`);
  return value;
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

async function request(baseUrl, method, pathname, body) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json() };
}

const kbPath = requiredEnv("MANAGEMENT_KB_PATH");
const expectedSha256 = requiredEnv("MANAGEMENT_KB_EXPECTED_SHA256");
const projectRoot = resolve(new URL("..", import.meta.url).pathname);
const tempDir = mkdtempSync(join(tmpdir(), "pharmaco-management-kb-p1-"));
const beforeHash = sha256File(kbPath);
assert.equal(beforeHash, expectedSha256.toLowerCase(), "验收输入 SQLite 与冻结 SHA-256 不一致");

const config = loadConfig({
  rootDir: projectRoot,
  dataDir: tempDir,
  host: "127.0.0.1",
  port: 0,
  managementKbPath: kbPath,
  managementKbExpectedSha256: expectedSha256,
  managementKbManifestPath: process.env.MANAGEMENT_KB_MANIFEST_PATH,
  managementKbCorpusVersionPath: process.env.MANAGEMENT_KB_CORPUS_VERSION_PATH,
  managementKbReadOnly: true,
});
const database = new PharmacoDatabase(config.dataDir);
const modelClient = {
  async status() { throw new Error("P1 验收不应调用模型"); },
  async streamChat() { throw new Error("P1 验收不应调用模型"); },
};
const server = createPharmacoServer({ config, database, modelClient, logger: { error: console.error } });

try {
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const status = await request(baseUrl, "GET", "/api/product-core/kb/management/status");
  assert.equal(status.status, 200, JSON.stringify(status.body));
  assert.equal(status.body.corpus.corpusId, "management-principles");
  assert.equal(status.body.corpus.sqliteSha256, expectedSha256.toLowerCase());
  assert.equal(status.body.corpus.accessMode, "read-only");
  assert.equal(status.body.runtime.embeddingUsed, false);
  assert.equal(status.body.runtime.llmUsed, false);

  const actorId = "management-kb-p1-verifier";
  const course = await request(baseUrl, "POST", "/api/product-core/courses", {
    name: "管理学", code: "MGT-P1", actorId,
  });
  const cohort = await request(baseUrl, "POST", `/api/product-core/courses/${course.body.course.id}/cohorts`, {
    name: "P1 验收班", actorId,
  });
  const lesson = await request(baseUrl, "POST", "/api/product-core/lessons", {
    courseId: course.body.course.id, classId: cohort.body.cohort.id, title: "第六章 组织设计", actorId,
  });
  for (const response of [course, cohort, lesson]) assert.equal(response.status, 201, JSON.stringify(response.body));

  const query = "矩阵制为什么容易产生多头指挥";
  const first = await request(baseUrl, "POST", "/api/product-core/kb/management/retrieve", {
    query, chapterIds: ["CH06"], limit: 5, actorId,
  });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.embeddingUsed, false);
  assert.equal(first.body.llmUsed, false);
  assert.ok(first.body.results.length > 0, "CH06 应返回至少一条来源内证据");
  assert.ok(first.body.results.every((item) => item.chapterIds.includes("CH06")), "章节过滤不得串到 CH06 外");
  assert.ok(first.body.results.every((item) => item.externalChunkId && item.contentHash && item.citationLabel));
  assert.equal(first.body.evidence.length, first.body.results.length);

  // 这不是自动教案，也不宣称九环节已有教学结论；它仅证明每个后续设计环节都能
  // 从同一 CH06 冻结语料取得带定位和 hash 的候选证据包。
  const stageEvidenceQueries = [
    ["S1", "组织设计的影响因素"],
    ["S2", "组织设计的任务"],
    ["S3", "机械式组织与有机式组织的区别"],
    ["S4", "化工企业组织结构"],
    ["S5", "直线制职能制事业部制矩阵制"],
    ["S6", "管理幅度 集权 分权 授权"],
    ["S7", "组织设计如何评价"],
    ["S8", "组织结构如何影响沟通协调"],
    ["S9", "组织设计知识如何迁移"],
  ];
  for (const [stage, stageQuery] of stageEvidenceQueries) {
    const stageResult = await request(baseUrl, "POST", "/api/product-core/kb/management/retrieve", {
      query: stageQuery, chapterIds: ["CH06"], limit: 3, actorId,
    });
    assert.equal(stageResult.status, 200, `${stage}: ${JSON.stringify(stageResult.body)}`);
    assert.ok(stageResult.body.results.length > 0, `${stage} 未取得 CH06 来源内证据`);
    assert.ok(stageResult.body.results.every((item) => item.chapterIds.includes("CH06")), `${stage} 出现跨章节结果`);
    assert.ok(stageResult.body.results.every((item) => item.contentHash && item.citationLabel), `${stage} 缺少可追溯引用`);
  }

  const second = await request(baseUrl, "POST", "/api/product-core/kb/management/retrieve", {
    query, chapterIds: ["CH06"], limit: 5, actorId,
  });
  assert.equal(second.status, 200, JSON.stringify(second.body));
  assert.deepEqual(
    second.body.results.map((item) => [item.externalChunkId, item.score]),
    first.body.results.map((item) => [item.externalChunkId, item.score]),
    "同一冻结语料与输入必须得到相同排序和分数",
  );

  const evidencePackage = await request(
    baseUrl,
    "GET",
    `/api/product-core/kb/management/retrieval-runs/${first.body.retrievalRunId}/evidence-package`,
  );
  assert.equal(evidencePackage.status, 200, JSON.stringify(evidencePackage.body));
  assert.equal(evidencePackage.body.packageVersion, "management-kb-evidence-package-v1");
  assert.equal(evidencePackage.body.citations.length, first.body.results.length);
  assert.ok(evidencePackage.body.citations.every((item) => item.externalChunkId && item.locator && item.contentHash));
  assert.equal(evidencePackage.body.embeddingUsed, false);
  assert.equal(evidencePackage.body.llmUsed, false);

  const audit = database.db.prepare(
    "SELECT payload_json FROM audit_events WHERE event_type = 'kb.external_retrieval.completed' ORDER BY rowid",
  ).all();
  assert.equal(audit.length, 11, "每次真实检索必须追加审计事件");
  assert.ok(audit.every((row) => !row.payload_json.includes(query)), "审计负载不得记录查询原文");
  assert.equal(sha256File(kbPath), beforeHash, "运行后课程 SQLite 不得发生任何写入");
  console.log("verify-management-kb-product-integration: ok (CH06 deterministic retrieval + evidence package + read-only hash)");
} finally {
  await new Promise((resolveClose) => server.close(resolveClose));
  database.close();
  rmSync(tempDir, { recursive: true, force: true });
}
