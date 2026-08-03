// resolve-gold-evidence.mjs
// 用途:gold re-resolution —— 数据集里的每条 goldSource 用锚定五元组
//   (documentId + sourceVersion + pageIndex/pageLabel + verbatimQuote + quoteHash)
//   在 SQLite content_blocks 中重新定位,输出 evaluation/reports/gold-resolution-<dataset>-<ts>.json。
//
// 纪律(与 docs/product-core/evaluation-dataset-design.md 一致):
//   - 不锚 contentBlockId:块 id 只作为当次解析的临时定位结果写进报告,不作永久锚;
//   - 未匹配即失败:quote 在锚定版本里找不到 -> unmatched,计入分母,进程以非零码退出;
//     quote 在整个语料里都找不到 -> unmatched(reason: quote-not-found-in-corpus);
//   - quote 不在锚定版本但出现在其他版本 -> quoteDrift(moved),同样非零退出;
//   - 页锚与命中块页码不一致 -> pageDrift(告警,计入报告,不单独致失败);
//   - quoteHash 与 quote 原文不符 -> needsManualReview(金标准完整性问题);
//   - 锚定版本 source_status != 'active' -> 在解析记录上挂 warnings(供 superseded 题型断言)。
//
// 用法:
//   node evaluation/scripts/resolve-gold-evidence.mjs --dataset evaluation/datasets/retrieval-dev.v1.json
//     [--db path/to.sqlite]            # 默认:新建 :memory: 库,跑 migrations 并摄入 fixtures
//     [--fixtures-dir <dir>]           # 默认 evaluation/fixtures/documents
//     [--reports-dir <dir>]            # 默认 evaluation/reports
// 退出码:unmatched 或 quoteDrift 非空 -> 1;数据集不合法/运行错误 -> 2;否则 0。
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { runMigrations } from "../../server/migrations.mjs";
import { ingestFixtures, normalizeText, sha256Hex } from "../fixtures/ingest-fixtures.mjs";
import { assertValidDataset } from "./validate-dataset.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_FIXTURES_DIR = join(SCRIPT_DIR, "..", "fixtures", "documents");
const DEFAULT_REPORTS_DIR = join(SCRIPT_DIR, "..", "reports");

// 在 db 中对一个数据集做 gold re-resolution,返回报告对象(纯函数式,不写盘、不退出)。
export function resolveDataset(db, dataset, { datasetName = dataset.datasetId ?? "unknown" } = {}) {
  const resolved = [];
  const multiMatch = [];
  const unmatched = [];
  const pageDrift = [];
  const quoteDrift = [];
  const needsManualReview = [];

  const findBlocks = db.prepare(
    `SELECT cb.id, cb.asset_version_id, cb.page_index, cb.page_label, cb.block_type
     FROM content_blocks cb
     WHERE cb.asset_version_id = ? AND instr(cb.normalized_text, ?) > 0
     ORDER BY cb.order_index`,
  );
  const findBlocksCorpusWide = db.prepare(
    `SELECT cb.id, cb.asset_version_id, cb.page_index, cb.page_label, av.asset_id, av.version
     FROM content_blocks cb JOIN asset_versions av ON av.id = cb.asset_version_id
     WHERE instr(cb.normalized_text, ?) > 0
     ORDER BY av.asset_id, av.version, cb.order_index`,
  );
  const getAsset = db.prepare("SELECT id, title FROM knowledge_assets WHERE id = ?");
  const getVersion = db.prepare(
    "SELECT id, asset_id, version, source_status, superseded_by FROM asset_versions WHERE asset_id = ? AND version = ?",
  );

  let goldTotal = 0;

  for (const testCase of dataset.cases) {
    if (testCase.answerable === false) continue; // refusal 题无 gold,只计入 cases 分母
    for (const gold of testCase.goldSources) {
      goldTotal += 1;
      const base = {
        caseId: testCase.caseId,
        documentId: gold.documentId,
        sourceVersion: gold.sourceVersion,
        pageIndex: gold.pageIndex,
        pageLabel: gold.pageLabel,
        quoteHash: gold.quoteHash,
      };

      // 1) 金标准完整性:quoteHash 必须等于 quote 原文的 sha256。
      const actualHash = `sha256:${sha256Hex(gold.verbatimQuote)}`;
      if (actualHash !== gold.quoteHash) {
        needsManualReview.push({
          ...base,
          reason: "quote-hash-mismatch",
          expectedQuoteHash: gold.quoteHash,
          actualQuoteHash: actualHash,
        });
      }

      // 2) 锚定资产与版本必须存在。
      const assetId = `ka_${gold.documentId}`;
      const asset = getAsset.get(assetId);
      if (asset === undefined) {
        unmatched.push({ ...base, reason: "document-not-found", assetId });
        continue;
      }
      const version = getVersion.get(assetId, gold.sourceVersion);
      if (version === undefined) {
        unmatched.push({ ...base, reason: "version-not-found", assetId });
        continue;
      }

      // 3) 在锚定版本的 content_blocks 内按归一化包含关系定位 quote。
      const normalizedQuote = normalizeText(gold.verbatimQuote);
      const hits = findBlocks.all(version.id, normalizedQuote);

      const warnings = [];
      if (version.source_status !== "active") {
        warnings.push({
          type: "superseded-source",
          sourceStatus: version.source_status,
          supersededBy: version.superseded_by,
        });
      }

      if (hits.length === 0) {
        // 4) 锚定版本未命中:查全语料,区分 moved(quoteDrift)与 missing(unmatched)。
        const anywhere = findBlocksCorpusWide.all(normalizedQuote);
        if (anywhere.length > 0) {
          quoteDrift.push({
            ...base,
            reason: "quote-moved-out-of-anchored-version",
            foundIn: anywhere.map((hit) => ({
              documentId: hit.asset_id.replace(/^ka_/, ""),
              sourceVersion: hit.version,
              contentBlockId: hit.id,
              pageIndex: hit.page_index,
              pageLabel: hit.page_label,
            })),
            warnings,
          });
        } else {
          unmatched.push({ ...base, reason: "quote-not-found-in-corpus", warnings });
        }
        continue;
      }

      if (hits.length > 1) {
        multiMatch.push({
          ...base,
          reason: "quote-matches-multiple-blocks",
          candidates: hits.map((hit) => ({
            contentBlockId: hit.id,
            blockType: hit.block_type,
            pageIndex: hit.page_index,
            pageLabel: hit.page_label,
          })),
          warnings,
        });
        continue;
      }

      const hit = hits[0];
      if (hit.page_index !== gold.pageIndex || hit.page_label !== gold.pageLabel) {
        pageDrift.push({
          ...base,
          reason: "page-anchor-differs-from-matched-block",
          anchored: { pageIndex: gold.pageIndex, pageLabel: gold.pageLabel },
          actual: { pageIndex: hit.page_index, pageLabel: hit.page_label },
          contentBlockId: hit.id,
          warnings,
        });
      }

      resolved.push({
        ...base,
        contentBlockId: hit.id, // 临时定位结果,不作永久锚
        blockType: hit.block_type,
        quoteHashMatch: actualHash === gold.quoteHash,
        warnings,
      });
    }
  }

  return {
    reportType: "gold-resolution",
    dataset: datasetName,
    generatedAt: new Date().toISOString(),
    corpus: {
      assets: db.prepare("SELECT COUNT(*) AS c FROM knowledge_assets").get().c,
      versions: db.prepare("SELECT COUNT(*) AS c FROM asset_versions").get().c,
      blocks: db.prepare("SELECT COUNT(*) AS c FROM content_blocks").get().c,
    },
    totals: {
      cases: dataset.cases.length,
      refusalCases: dataset.cases.filter((c) => c.answerable === false).length,
      goldSources: goldTotal,
      resolved: resolved.length,
      multiMatch: multiMatch.length,
      unmatched: unmatched.length,
      pageDrift: pageDrift.length,
      quoteDrift: quoteDrift.length,
      needsManualReview: needsManualReview.length,
      // 分母恒为全部 goldSources:unmatched / quoteDrift / multiMatch 均不移出分母。
      resolutionRate: goldTotal === 0 ? null : resolved.length / goldTotal,
    },
    resolved,
    multiMatch,
    unmatched,
    pageDrift,
    quoteDrift,
    needsManualReview,
  };
}

export function hasFailures(report) {
  return report.totals.unmatched > 0 || report.totals.quoteDrift > 0;
}

export function reportFileName(datasetName, now = new Date()) {
  const ts = now.toISOString().replace(/[:.]/g, "-");
  return `gold-resolution-${datasetName}-${ts}.json`;
}

export function main(argv = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: argv,
    options: {
      dataset: { type: "string" },
      db: { type: "string" },
      "fixtures-dir": { type: "string", default: DEFAULT_FIXTURES_DIR },
      "reports-dir": { type: "string", default: DEFAULT_REPORTS_DIR },
    },
  });
  if (!values.dataset) {
    console.error("缺少必填参数 --dataset <path>");
    return 2;
  }

  const datasetPath = resolve(values.dataset);
  const dataset = JSON.parse(readFileSync(datasetPath, "utf8"));
  try {
    assertValidDataset(dataset, datasetPath);
  } catch (error) {
    console.error(error.message);
    return 2;
  }
  const datasetName = basename(datasetPath).replace(/\.json$/, "");

  const db = values.db ? new DatabaseSync(resolve(values.db)) : new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys = ON;");
    runMigrations(db);
    if (values.db) {
      const assetCount = db.prepare("SELECT COUNT(*) AS c FROM knowledge_assets").get().c;
      if (assetCount === 0) {
        ingestFixtures(db, values["fixtures-dir"]);
        console.error(`--db 目标库为空,已摄入 fixtures(${values["fixtures-dir"]})`);
      }
    } else {
      ingestFixtures(db, values["fixtures-dir"]);
    }

    const report = resolveDataset(db, dataset, { datasetName });

    const reportsDir = resolve(values["reports-dir"]);
    mkdirSync(reportsDir, { recursive: true });
    const reportPath = join(reportsDir, reportFileName(datasetName));
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

    const t = report.totals;
    console.log(
      [
        `dataset=${datasetName} cases=${t.cases}(refusal=${t.refusalCases}) goldSources=${t.goldSources}`,
        `resolved=${t.resolved} multiMatch=${t.multiMatch} unmatched=${t.unmatched}`,
        `pageDrift=${t.pageDrift} quoteDrift=${t.quoteDrift} needsManualReview=${t.needsManualReview}`,
        `resolutionRate=${t.resolutionRate === null ? "n/a" : (t.resolutionRate * 100).toFixed(1) + "%"}`,
        `report=${reportPath}`,
      ].join("\n"),
    );
    return hasFailures(report) ? 1 : 0;
  } finally {
    db.close();
  }
}

const invokedAsScript = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsScript) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(`resolve-gold-evidence 运行失败: ${error.message}`);
    process.exitCode = 2;
  }
}
