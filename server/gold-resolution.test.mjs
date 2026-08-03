// gold-resolution.test.mjs
// 金标准评测集与 gold re-resolution 的验收测试:
//   1. 4 个数据集全部通过 schema 校验(evaluation/schemas/dataset.schema.json 的可执行镜像);
//   2. quote 自检:每条 goldSource 的 verbatimQuote 逐字存在于对应 fixture 文档、quoteHash 正确;
//   3. dev/holdout 数据集对 fixtures 全量 resolved、0 unmatched、退出码 0;
//   4. 负例:人为改一字 -> resolve 失败、非零退出、该案例计入 unmatched 分母;
//   5. superseded 题型:引 v1 的案例在报告中带 source_status='superseded' 的 warning;
//   6. 回归模拟:切块产物变化导致 quote 定位失败时脚本能报出来。
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { runMigrations } from "./migrations.mjs";
import {
  chunkFixture,
  ingestFixtures,
  listFixtureFiles,
  normalizeText,
  parseFixture,
  sha256Hex,
} from "../evaluation/fixtures/ingest-fixtures.mjs";
import { validateDataset } from "../evaluation/scripts/validate-dataset.mjs";
import { hasFailures, reportFileName, resolveDataset } from "../evaluation/scripts/resolve-gold-evidence.mjs";

const SERVER_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = dirname(SERVER_DIR);
const DATASETS_DIR = join(PROJECT_ROOT, "evaluation", "datasets");
const FIXTURES_DIR = join(PROJECT_ROOT, "evaluation", "fixtures", "documents");
const RESOLVE_SCRIPT = join(PROJECT_ROOT, "evaluation", "scripts", "resolve-gold-evidence.mjs");
const DATASET_FILES = readdirSync(DATASETS_DIR).filter((f) => f.endsWith(".json")).sort();

function loadDataset(filename) {
  return JSON.parse(readFileSync(join(DATASETS_DIR, filename), "utf8"));
}

function openFixtureDb(t) {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  db.exec("PRAGMA foreign_keys = ON;");
  runMigrations(db);
  ingestFixtures(db, FIXTURES_DIR);
  return db;
}

test("数据集清单:恰为 4 个数据集(retrieval/refusal x dev/holdout)", () => {
  assert.deepEqual(DATASET_FILES, [
    "refusal-dev.v1.json",
    "refusal-holdout.v1.json",
    "retrieval-dev.v1.json",
    "retrieval-holdout.v1.json",
  ]);
});

test("schema 校验:所有 4 个数据集合法,且 schema 文件本身可解析", () => {
  // schema 文件是对外契约,必须存在且是合法 JSON;可执行校验由 validateDataset 承担(两者同步维护)。
  const schema = JSON.parse(
    readFileSync(join(PROJECT_ROOT, "evaluation", "schemas", "dataset.schema.json"), "utf8"),
  );
  assert.equal(schema.type, "object");
  assert.deepEqual(schema.required, ["datasetId", "schemaVersion", "kind", "split", "createdAt", "cases"]);

  for (const file of DATASET_FILES) {
    const errors = validateDataset(loadDataset(file));
    assert.deepEqual(errors, [], `${file} 未通过 schema 校验:\n${errors.join("\n")}`);
  }
});

test("schema 校验负例:answerable=true 但 goldSources 为空必须被拒", () => {
  const dataset = loadDataset("retrieval-dev.v1.json");
  const broken = structuredClone(dataset);
  broken.cases[0].goldSources = [];
  const errors = validateDataset(broken);
  assert.ok(errors.some((e) => e.includes("goldSources 不得为空")), `应报 goldSources 为空,实际: ${errors}`);
});

test("quote 自检:每条 goldSource 逐字存在于对应 fixture 文档、hash 正确、页锚与切块一致", () => {
  // 建立 (docId, version) -> fixture 文档索引
  const docs = new Map();
  for (const file of listFixtureFiles(FIXTURES_DIR)) {
    const parsed = parseFixture(readFileSync(join(FIXTURES_DIR, file), "utf8"), file);
    docs.set(`${parsed.frontMatter.docId}@${parsed.frontMatter.version}`, { parsed, file });
  }

  let goldCount = 0;
  for (const file of DATASET_FILES) {
    for (const testCase of loadDataset(file).cases) {
      for (const gold of testCase.goldSources) {
        goldCount += 1;
        const key = `${gold.documentId}@${gold.sourceVersion}`;
        const doc = docs.get(key);
        assert.ok(doc, `${file} ${testCase.caseId}: 找不到 fixture 文档 ${key}`);
        // 硬验收 1:quote 必须在文档正文中逐字存在(不含 front-matter)
        assert.ok(
          doc.parsed.body.includes(gold.verbatimQuote),
          `${file} ${testCase.caseId}: quote 未逐字出现在 ${doc.file} 正文中`,
        );
        // 硬验收 2:quoteHash = quote 原文的 sha256
        assert.equal(
          gold.quoteHash,
          `sha256:${sha256Hex(gold.verbatimQuote)}`,
          `${file} ${testCase.caseId}: quoteHash 不正确`,
        );
        // 硬验收 3:页锚与切块结果一致(切块规则见 ingest-fixtures.mjs 文件头)
        const hits = chunkFixture(doc.parsed, doc.file).filter((b) =>
          b.normalizedText.includes(normalizeText(gold.verbatimQuote)),
        );
        assert.equal(hits.length, 1, `${file} ${testCase.caseId}: quote 命中块数 ${hits.length} != 1`);
        assert.equal(hits[0].pageIndex, gold.pageIndex, `${file} ${testCase.caseId}: pageIndex 不符`);
        assert.equal(hits[0].pageLabel, gold.pageLabel, `${file} ${testCase.caseId}: pageLabel 不符`);
      }
    }
  }
  assert.equal(goldCount, 30, "goldSources 总数应为 30(题数分布见 README 报告)");
});

test("resolve:4 个数据集对 fixtures 全量 resolved、0 unmatched、0 drift", (t) => {
  const db = openFixtureDb(t);
  for (const file of DATASET_FILES) {
    const report = resolveDataset(db, loadDataset(file), { datasetName: file.replace(/\.json$/, "") });
    assert.equal(report.totals.unmatched, 0, `${file}: unmatched=${report.totals.unmatched}`);
    assert.equal(report.totals.multiMatch, 0, `${file}: multiMatch=${report.totals.multiMatch}`);
    assert.equal(report.totals.pageDrift, 0, `${file}: pageDrift=${report.totals.pageDrift}`);
    assert.equal(report.totals.quoteDrift, 0, `${file}: quoteDrift=${report.totals.quoteDrift}`);
    assert.equal(report.totals.needsManualReview, 0, `${file}: needsManualReview=${report.totals.needsManualReview}`);
    assert.equal(report.totals.resolved, report.totals.goldSources, `${file}: 未全量 resolved`);
    assert.equal(hasFailures(report), false, `${file}: hasFailures 应为 false`);
  }
});

test("resolve CLI:dev 数据集退出码 0 并写出带时间戳的报告", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "pharmaco-gold-reports-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const run = spawnSync(
    process.execPath,
    ["--disable-warning=ExperimentalWarning", RESOLVE_SCRIPT,
      "--dataset", join(DATASETS_DIR, "retrieval-dev.v1.json"), "--reports-dir", dir],
    { encoding: "utf8" },
  );
  assert.equal(run.status, 0, `CLI 退出码非 0:\nstdout=${run.stdout}\nstderr=${run.stderr}`);
  assert.match(run.stdout, /resolved=19 multiMatch=0 unmatched=0/);
  const reports = readdirSync(dir).filter((f) => f.startsWith("gold-resolution-retrieval-dev.v1-"));
  assert.equal(reports.length, 1, "应写出 1 份报告");
  const report = JSON.parse(readFileSync(join(dir, reports[0]), "utf8"));
  assert.equal(report.totals.goldSources, 19);
  assert.equal(report.totals.resolved, 19);
});

test("负例:quote 人为改一字 -> CLI 非零退出、该案例计入 unmatched 分母", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "pharmaco-gold-negative-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const dataset = loadDataset("retrieval-dev.v1.json");
  const target = dataset.cases.find((c) => c.caseId === "retrieval-001");
  target.goldSources[0].verbatimQuote = target.goldSources[0].verbatimQuote.replace("匿名化", "实名化");
  const tamperedPath = join(dir, "retrieval-dev.tampered.json");
  writeFileSync(tamperedPath, JSON.stringify(dataset, null, 2));

  const run = spawnSync(
    process.execPath,
    ["--disable-warning=ExperimentalWarning", RESOLVE_SCRIPT,
      "--dataset", tamperedPath, "--reports-dir", dir],
    { encoding: "utf8" },
  );
  assert.notEqual(run.status, 0, "篡改 quote 后 CLI 仍退出 0,违反未匹配即失败纪律");

  const reports = readdirSync(dir).filter((f) => f.startsWith("gold-resolution-retrieval-dev.tampered-"));
  assert.equal(reports.length, 1);
  const report = JSON.parse(readFileSync(join(dir, reports[0]), "utf8"));
  // 计入 unmatched,且不移出分母
  assert.equal(report.totals.unmatched, 1);
  assert.equal(report.totals.goldSources, 19, "分母必须保持全部 goldSources");
  assert.equal(report.totals.resolved, 18);
  assert.equal(report.unmatched[0].caseId, "retrieval-001");
  assert.equal(report.unmatched[0].reason, "quote-not-found-in-corpus");
  // quote 原文被改,hash 也随之对不上 -> 同时进入 needsManualReview
  assert.ok(report.needsManualReview.some((e) => e.caseId === "retrieval-001" && e.reason === "quote-hash-mismatch"));
});

test("superseded 题型:引 v1 的案例在报告中带 superseded warning", (t) => {
  const db = openFixtureDb(t);
  const report = resolveDataset(db, loadDataset("retrieval-dev.v1.json"), { datasetName: "retrieval-dev.v1" });

  // retrieval-013 锚定 doc_010 v1(已被 v2 supersede)
  const entry = report.resolved.find((e) => e.caseId === "retrieval-013");
  assert.ok(entry, "retrieval-013 应 resolved");
  const warning = entry.warnings.find((w) => w.type === "superseded-source");
  assert.ok(warning, "retrieval-013 应带 superseded-source warning");
  assert.equal(warning.sourceStatus, "superseded");
  assert.equal(warning.supersededBy, "kav_doc_010_v2");

  // 对照:锚定 active 版本的 retrieval-014 不得有 warning
  const current = report.resolved.find((e) => e.caseId === "retrieval-014");
  assert.deepEqual(current.warnings, []);

  // holdout 的 superseded 题(retrieval-holdout-006 锚 doc_009 v1)同样标出
  const holdout = resolveDataset(db, loadDataset("retrieval-holdout.v1.json"), { datasetName: "retrieval-holdout.v1" });
  const holdoutEntry = holdout.resolved.find((e) => e.caseId === "retrieval-holdout-006");
  assert.ok(holdoutEntry.warnings.some((w) => w.type === "superseded-source" && w.sourceStatus === "superseded"));
});

test("回归模拟:切块产物变化导致 quote 定位失败时能报出来(quoteDrift 或非零判定)", (t) => {
  const db = openFixtureDb(t);
  // 模拟"解析器升级后二次摄入":doc_001 v1 的第十二条被切块策略变化改写(块内容缺字),
  // 金标准 quote 在锚定版本里定位不到,但在别处也找不到 -> unmatched。
  db.prepare(
    "UPDATE content_blocks SET content_raw = '第十二条 学情诊断应当以数据为基础。', normalized_text = '第十二条 学情诊断应当以数据为基础。' WHERE id = 'blk_doc_001_v1_008'",
  ).run();

  const report = resolveDataset(db, loadDataset("retrieval-dev.v1.json"), { datasetName: "retrieval-dev.v1" });
  assert.ok(report.totals.unmatched >= 1, "切块变化未报出 unmatched");
  const affected = report.unmatched.filter((e) => e.documentId === "doc_001" && e.sourceVersion === "v1");
  // retrieval-001 与 retrieval-011(多证据组合,其中一条锚 doc_001 v1 第十二条)都必须进 unmatched
  assert.deepEqual(
    affected.map((e) => e.caseId).sort(),
    ["retrieval-001", "retrieval-011"],
    `受影响案例不符: ${JSON.stringify(affected)}`,
  );
  assert.equal(report.totals.goldSources, 19, "分母不得因失败而缩小");
  assert.equal(hasFailures(report), true);
});

test("回归模拟:quote 只在其他版本命中时记为 quoteDrift(moved)", (t) => {
  const db = openFixtureDb(t);
  // 模拟:doc_010 v2 的第五条块被解析器丢掉(删除),quote 只剩 v1 的相似文本;
  // 但 v1 文本(百分之三十)与 v2 quote(百分之五十)不同,所以这里反过来:
  // 删除 doc_010 v1 的第五条块 -> retrieval-013 的 v1 quote 在全语料找不到 -> unmatched。
  // 再单独构造:把 v2 块改成与 v1 quote 相同文本 -> v1 quote 在 v2 命中 -> quoteDrift。
  db.prepare(
    "UPDATE content_blocks SET content_raw = '第五条 处方点评覆盖率不得低于百分之三十。', normalized_text = '第五条 处方点评覆盖率不得低于百分之三十。' WHERE id = 'blk_doc_010_v2_003'",
  ).run();
  db.prepare("DELETE FROM content_blocks WHERE id = 'blk_doc_010_v1_003'").run();

  const report = resolveDataset(db, loadDataset("retrieval-dev.v1.json"), { datasetName: "retrieval-dev.v1" });
  const drift = report.quoteDrift.find((e) => e.caseId === "retrieval-013");
  assert.ok(drift, "v1 块被删、v2 块同文时应记 quoteDrift");
  assert.equal(drift.reason, "quote-moved-out-of-anchored-version");
  assert.deepEqual(
    drift.foundIn.map((f) => f.sourceVersion),
    ["v2"],
  );
  assert.equal(hasFailures(report), true, "quoteDrift 同样视为失败");
});

test("reportFileName 含数据集名与时间戳,不覆盖旧报告", () => {
  const name = reportFileName("retrieval-dev.v1", new Date("2026-08-03T10:00:00.000Z"));
  assert.match(name, /^gold-resolution-retrieval-dev\.v1-2026-08-03T10-00-00-000Z\.json$/);
});
