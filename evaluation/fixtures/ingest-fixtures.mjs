// ingest-fixtures.mjs
// 用途:把 evaluation/fixtures/documents/ 下的金标准源文档摄入 SQLite
//   knowledge_assets / asset_versions / content_blocks(供评测与 gold re-resolution 使用)。
//
// fixture 文档格式(markdown + front-matter):
//   ---
//   docId: doc_001            # 知识资产标识;knowledge_assets.id = ka_<docId>
//   title: ...
//   sourceType: policy        # 直接对应 knowledge_assets.type 的 CHECK 枚举
//   version: v1               # asset_versions.version;asset_versions.id = kav_<docId>_<version>
//   effectiveDate: 2024-03-01
//   pageMap: ["1", "2"]       # 页标签数组;页码下标 = 数组下标(0 起)
//   ---
//
// 切块规则(刻意简单、确定性强,变更即视为解析器升级):
//   1. front-matter(--- 围栏)不产块;正文按"连续非空行"分组,空行是分块边界;
//   2. 独占一行的 `<!-- page -->` 是换页标记:页码下标 +1,pageLabel 取 pageMap[下标],本身不产块;
//   3. 组内首行以 # 开头 -> heading 块(content_raw 去掉 # 前缀);markdown 标题行须独占一组;
//   4. 组内所有行以 | 开头 -> table 块,content_raw 为各行以 \n 连接(保留管道符原样);
//   5. 组内首行匹配 /^第[一二三四五六七八九十百千万零两]+条/ -> policy_article 块;
//   6. 其余 -> paragraph 块;多行组 content_raw 以 \n 连接;
//   7. normalized_text = 空白折叠为单空格;content_hash = "sha256:" + sha256(normalized_text);
//      content_segmented 复用 normalized_text(供 FTS 派生索引,非事实源);
//   8. content_blocks.id = blk_<docId>_<version>_<orderIndex(3 位零填充)>;块 id 是解析产物,不作永久锚。
//
// 版本纪律:
//   - 同一 docId 的多个版本文件都建 asset_versions;按 version 字符串排序,最高版本保持
//     source_status='active',其余置 'superseded' 且 superseded_by 指向最高版本;
//   - knowledge_assets.current_version_id 回填为最高版本 id;
//   - 幂等:重复摄入同一 fixtures 目录会先清空本脚本写入的三表行再重建(仅适用于评测库,
//     切勿指向生产库;脚本会在非评测库上拒绝运行——以 knowledge_assets.id 前缀 ka_doc_ 判定)。
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

export const INGEST_NOW = "2026-08-03T00:00:00.000Z";
export const PARSER_NAME = "fixture-markdown-parser";
export const PARSER_VERSION = "1.0.0";

const ARTICLE_PATTERN = /^第[一二三四五六七八九十百千万零两]+条/;
const HEADING_PATTERN = /^#{1,6}\s+/;
const PAGE_MARKER = "<!-- page -->";

export function sha256Hex(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function normalizeText(text) {
  return text.replace(/\s+/g, " ").trim();
}

// 解析 front-matter(刻意只支持 `key: value` 与 JSON 数组值,不引 YAML 依赖)。
export function parseFixture(markdown, filename = "<memory>") {
  const lines = markdown.split("\n");
  if (lines[0]?.trim() !== "---") {
    throw new Error(`${filename}: 缺少 front-matter 起始围栏 ---`);
  }
  const end = lines.indexOf("---", 1);
  if (end === -1) {
    throw new Error(`${filename}: 缺少 front-matter 结束围栏 ---`);
  }
  const frontMatter = {};
  for (const line of lines.slice(1, end)) {
    const match = /^([A-Za-z]+):\s*(.*)$/.exec(line);
    if (!match) {
      throw new Error(`${filename}: front-matter 行无法解析: ${line}`);
    }
    const [, key, rawValue] = match;
    frontMatter[key] = rawValue.startsWith("[") ? JSON.parse(rawValue) : rawValue;
  }
  for (const required of ["docId", "title", "sourceType", "version", "effectiveDate", "pageMap"]) {
    if (frontMatter[required] === undefined) {
      throw new Error(`${filename}: front-matter 缺少字段 ${required}`);
    }
  }
  if (!Array.isArray(frontMatter.pageMap) || frontMatter.pageMap.length === 0) {
    throw new Error(`${filename}: pageMap 必须是非空数组`);
  }
  return { frontMatter, body: lines.slice(end + 1).join("\n") };
}

// 按文件头注释的切块规则把正文切成块。
export function chunkFixture({ frontMatter, body }, filename = "<memory>") {
  const blocks = [];
  let pageIndex = 0;
  let group = [];

  const flush = () => {
    if (group.length === 0) return;
    const raw = group.join("\n");
    group = [];
    let blockType = "paragraph";
    let contentRaw = raw;
    if (HEADING_PATTERN.test(raw)) {
      blockType = "heading";
      contentRaw = raw.replace(HEADING_PATTERN, "").trim();
    } else {
      const firstLine = raw.split("\n", 1)[0];
      if (raw.split("\n").every((line) => line.startsWith("|"))) {
        blockType = "table";
      } else if (ARTICLE_PATTERN.test(firstLine)) {
        blockType = "policy_article";
      }
    }
    const normalizedText = normalizeText(contentRaw);
    blocks.push({
      blockType,
      orderIndex: blocks.length,
      pageIndex,
      pageLabel: frontMatter.pageMap[pageIndex],
      contentRaw,
      normalizedText,
      contentHash: `sha256:${sha256Hex(normalizedText)}`,
    });
  };

  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === PAGE_MARKER) {
      flush();
      pageIndex += 1;
      if (pageIndex >= frontMatter.pageMap.length) {
        throw new Error(`${filename}: 换页标记超出 pageMap 长度(${frontMatter.pageMap.length})`);
      }
      continue;
    }
    if (trimmed === "") {
      flush();
      continue;
    }
    // markdown 标题必须独占一块:遇到标题行先冲刷缓冲,标题行单独成组后立即冲刷。
    if (HEADING_PATTERN.test(trimmed)) {
      flush();
      group.push(trimmed);
      flush();
      continue;
    }
    group.push(trimmed);
  }
  flush();
  return blocks;
}

export function listFixtureFiles(fixturesDir) {
  return readdirSync(fixturesDir)
    .filter((entry) => entry.endsWith(".md"))
    .sort();
}

// 把 fixturesDir 下全部文档摄入 db。返回摄入摘要。
export function ingestFixtures(db, fixturesDir) {
  const files = listFixtureFiles(fixturesDir);
  if (files.length === 0) {
    throw new Error(`fixtures 目录 ${fixturesDir} 下没有任何 .md 文档`);
  }

  // 幂等:清掉本脚本此前写入的评测行(只动 ka_doc_ 前缀的资产,拒绝误伤其他数据)。
  const foreignAssets = db
    .prepare("SELECT COUNT(*) AS c FROM knowledge_assets WHERE id NOT LIKE 'ka\\_doc\\_%' ESCAPE '\\'")
    .get().c;
  if (foreignAssets > 0) {
    throw new Error(
      "目标库含非 fixtures 来源的 knowledge_assets,拒绝摄入(ingestFixtures 只用于评测库)",
    );
  }
  db.exec("DELETE FROM content_blocks");
  db.exec("DELETE FROM asset_versions");
  db.exec("DELETE FROM knowledge_assets");

  const insertAsset = db.prepare(
    "INSERT INTO knowledge_assets(id, type, title, authority, review_status, created_at) VALUES (?, ?, ?, NULL, 'TEACHER_CONFIRMED', ?)",
  );
  const getAssetTitle = db.prepare("SELECT title FROM knowledge_assets WHERE id = ?");
  const insertVersion = db.prepare(
    `INSERT INTO asset_versions(id, asset_id, version, effective_date, source_status, superseded_by,
       original_file_hash, original_file_location, parser_name, parser_version, parsed_at, created_at)
     VALUES (?, ?, ?, ?, 'active', NULL, ?, ?, ?, ?, ?, ?)`,
  );
  const insertBlock = db.prepare(
    `INSERT INTO content_blocks(id, asset_version_id, block_type, parent_block_id, order_index,
       page_index, page_label, bbox_json, bbox_coordinate_system, content_raw, content_segmented,
       normalized_text, content_hash, parser_metadata_json)
     VALUES (?, ?, ?, NULL, ?, ?, ?, NULL, 'none', ?, ?, ?, ?, NULL)`,
  );
  const markSuperseded = db.prepare(
    "UPDATE asset_versions SET source_status = 'superseded', superseded_by = ? WHERE id = ?",
  );
  const setCurrentVersion = db.prepare(
    "UPDATE knowledge_assets SET current_version_id = ? WHERE id = ?",
  );

  const versionsByAsset = new Map();
  let blockCount = 0;

  for (const file of files) {
    const filename = basename(file);
    const markdown = readFileSync(join(fixturesDir, file), "utf8");
    const parsed = parseFixture(markdown, filename);
    const { frontMatter } = parsed;
    const blocks = chunkFixture(parsed, filename);

    const assetId = `ka_${frontMatter.docId}`;
    const versionId = `kav_${frontMatter.docId}_${frontMatter.version}`;
    // 同一 docId 的多版本文件共享一行 knowledge_assets:首文件建行,后续文件校验类型一致。
    const existingAsset = getAssetTitle.get(assetId);
    if (existingAsset === undefined) {
      insertAsset.run(assetId, frontMatter.sourceType, frontMatter.title, INGEST_NOW);
    }
    insertVersion.run(
      versionId,
      assetId,
      frontMatter.version,
      frontMatter.effectiveDate,
      `sha256:${sha256Hex(markdown)}`,
      `evaluation/fixtures/documents/${filename}`,
      PARSER_NAME,
      PARSER_VERSION,
      INGEST_NOW,
      INGEST_NOW,
    );
    for (const block of blocks) {
      insertBlock.run(
        `blk_${frontMatter.docId}_${frontMatter.version}_${String(block.orderIndex).padStart(3, "0")}`,
        versionId,
        block.blockType,
        block.orderIndex,
        block.pageIndex,
        block.pageLabel,
        block.contentRaw,
        block.normalizedText,
        block.normalizedText,
        block.contentHash,
      );
      blockCount += 1;
    }
    if (!versionsByAsset.has(assetId)) versionsByAsset.set(assetId, []);
    versionsByAsset.get(assetId).push({ versionId, version: frontMatter.version });
  }

  // supersede 链:每资产最高版本 active,其余 superseded 并指向最高版本。
  for (const [assetId, versions] of versionsByAsset) {
    versions.sort((a, b) => (a.version < b.version ? -1 : 1));
    const latest = versions[versions.length - 1];
    for (const older of versions.slice(0, -1)) {
      markSuperseded.run(latest.versionId, older.versionId);
    }
    setCurrentVersion.run(latest.versionId, assetId);
  }

  return {
    files: files.length,
    assets: versionsByAsset.size,
    versions: files.length,
    blocks: blockCount,
  };
}
