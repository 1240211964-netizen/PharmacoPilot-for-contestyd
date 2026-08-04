// 权威来源统一摄入服务(migration 008;知识库 v0.1 组织设计章 source-completion)。
// 依据 docs/knowledge-base/organization-design-authoritative-sources-manifest.json(31 条目,
// 合并 knowledge-sources/registry/ 四路 registry + 两条 legacy OpenStax 引用)。
//
// 与旧 knowledge-source-service.registerSourcesFromManifest 的关系:
//   旧 manifest(docs/knowledge-base/organization-design-source-manifest.json,开工闸冻结对象)
//   的条目格式(source_id/allowedOperations/file_location)与摄入逻辑保持不变;本服务只处理
//   新 manifest 的字段结构(localPath/extractedPath 或 raw_file/extracted_file 或 raw_path/extract_path、
//   layer/sourceType/authorityLevel/permissionStatus/allowed 布尔字段组),两条管线并存。
//
// 权限闸门(系统约束,非倡议):
//   - 仅 acquisitionStatus ∈ {acquired, acquired_reference_only} 且 deterministicParsingAllowed=true
//     的条目读取并解析文件;其余(如 blocked)进 skipped 并如实记录原因,不建幽灵资产;
//   - llmInputAllowed=true 的条目出现即 FAIL(KB_PERMISSION_GATE):当前权限口径全量禁模型处理,
//     任何模型处理须另行授权并留痕后才可放行;
//   - 全程只跑确定性解析(paginated-text),无模型调用。
//
// hash 复核(登记语义分 registry,manifest permissionSummary.sha256Recheck 已说明):
//   - pharma-cn:manifest sha256 指向抽取 md → 与抽取文件实算比对;
//   - theory/pharma-intl/company:manifest sha256 指向 raw 原件 → 与 raw 文件实算比对;
//     theory 条目另在 notes 登记 extractedSha256=<hex> → 与抽取文件实算比对;
//     pharma-intl/company 的抽取稿无登记 hash,实算值随块元数据落库备查;
//   - legacy_reference:localPath 即抽取 md,manifest sha256 直接比对。
//   任何一处不一致即 FAIL(KB_SOURCE_HASH_MISMATCH),绝不静默。
//
// 落库映射(008 + 001 已冻结表):
//   每份来源 = 一个 knowledge_assets 行,id 直接取 manifest sourceId(同源同 ID,
//   kb_source_permissions.source_id 以 FK 引用它);asset_versions.original_file_hash 存
//   抽取稿 sha256(幂等判重键);content_blocks 为 paginated-text 产出的片段,courseId/chapterId/
//   layer/权限状态/行号锚随 parser_metadata_json 落库(001 无列可加)。
//   knowledge_assets.type 映射(001 CHECK 枚举内取最近义,无需扩枚举):
//     textbook→textbook;ocw_course→teaching_artifact(课程教学材料,同旧服务 syllabus 先例);
//     regulation/regulatory_guidance/international_standard→policy(监管/标准文本);
//     annual_report/10-K→case(企业披露作教学案例素材,同旧服务 annual_report 先例)。
//   kb_source_permissions 逐条登记五类授权与 permission_status;kb_chapter_sources 按 layer
//   登记 course/chapter 归属(manifest 顶层 courseId/chapterId)。
//
// 幂等:asset_versions.original_file_hash 判重 —— 同 manifest 重跑不产重复版本与块;
//   两条 legacy OpenStax 已经旧管线摄入(ka_ 前缀 id),按 hash 命中后跳过解析,
//   仅补登 kb_source_permissions/kb_chapter_sources(均已存在则不动);
//   permissions 行已存在且字段一致 → 不重插;字段不一致 → FAIL(KB_SOURCE_CONFLICT);
//   sourceId 已被其他 hash 的资产占用 → FAIL(KB_SOURCE_CONFLICT)。
//
// kb_evidence_gaps 初始化:六条 pending_source 题(od-eval-15/20/24/25/29/30)各建一条
//   open 缺口,topic/needed_source_type 从审查记录
//   docs/product-core/management-principles-source-completion-audit.md §2 表格确定性强提取;
//   已存在的 question_id 跳过(幂等);表格行缺失即 FAIL。
//
// 审计:新资产 source.registered + source.parsed;legacy 补登 source.registered(registrationOnly)。
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPaginatedTextParser } from '../document-parsers/paginated-text-parser.mjs';
import { appendAuditEvent } from './audit.mjs';
import { failCode } from './errors.mjs';
import { newId, nowIso } from './ids.mjs';
import { corpusVersionHash } from './knowledge-unit-service.mjs';
import { insertAssetVersion, insertContentBlock } from './repository.mjs';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_AUDIT_PATH = 'docs/product-core/management-principles-source-completion-audit.md';

// manifest sourceType → knowledge_assets.type(001 CHECK 枚举最近义映射,见文件头注释)。
const SOURCE_TYPE_MAP = Object.freeze({
  textbook: 'textbook',
  ocw_course: 'teaching_artifact',
  regulation: 'policy',
  regulatory_guidance: 'policy',
  international_standard: 'policy',
  annual_report: 'case',
  '10-K': 'case',
});

const INGESTIBLE_STATUSES = new Set(['acquired', 'acquired_reference_only']);
const EXTRACTED_HASH_NOTE_RE = /extractedSha256=([0-9a-f]{64})/;
// 审查记录 §2 表格中六条 pending_source 题;缺少任何一行即 FAIL(不静默降级)。
const EXPECTED_GAP_QUESTION_IDS = Object.freeze([
  'od-eval-15',
  'od-eval-20',
  'od-eval-24',
  'od-eval-25',
  'od-eval-29',
  'od-eval-30',
]);

function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function readBytes(rootDir, relPath, sourceId) {
  const abs = resolve(rootDir, relPath);
  try {
    return readFileSync(abs);
  } catch (error) {
    failCode('KB_MANIFEST_INVALID', `来源 ${sourceId} 文件不可读: ${abs}: ${error.message}`, { sourceId });
  }
}

// 四路 registry 与 legacy 条目的路径字段名不同,统一归一为工程根相对路径。
function resolveEntryPaths(source) {
  const ks = (p) => `knowledge-sources/${p}`;
  if (source.entryType === 'legacy_reference') {
    return { rawPath: null, extractedPath: source.localPath ?? null };
  }
  return {
    rawPath: source.localPath ?? (source.raw_file ? ks(source.raw_file) : null) ?? (source.raw_path ? ks(source.raw_path) : null),
    extractedPath:
      source.extractedPath ??
      (source.extracted_file ? ks(source.extracted_file) : null) ??
      (source.extract_path ? ks(source.extract_path) : null),
  };
}

// hash 复核:任一登记值不符即 FAIL;通过后用抽取稿实测 hash 作幂等判重键。
function verifyHashes(source, rootDir, paths, extractedHash) {
  const sourceId = source.sourceId;
  const registered = source.sha256;
  if (typeof registered !== 'string' || !/^[0-9a-f]{64}$/.test(registered)) {
    failCode('KB_MANIFEST_INVALID', `来源 ${sourceId} 缺少合法 sha256 登记值`, { sourceId });
  }
  const isPharmaCn = typeof source.registry === 'string' && source.registry.endsWith('pharma-cn.json');
  if (source.entryType === 'legacy_reference' || isPharmaCn) {
    // 登记值即抽取稿 hash。
    if (extractedHash !== registered) {
      failCode('KB_SOURCE_HASH_MISMATCH', `来源 ${sourceId} 抽取稿 sha256 与 manifest 登记不一致(manifest=${registered}, actual=${extractedHash});拒绝摄入`, { sourceId, manifestHash: registered, actualHash: extractedHash });
    }
    return;
  }
  // 登记值指向 raw 原件。
  if (!paths.rawPath) {
    failCode('KB_MANIFEST_INVALID', `来源 ${sourceId} 缺少 raw 文件路径,无法复核登记 sha256`, { sourceId });
  }
  const rawHash = sha256Hex(readBytes(rootDir, paths.rawPath, sourceId));
  if (rawHash !== registered) {
    failCode('KB_SOURCE_HASH_MISMATCH', `来源 ${sourceId} raw 文件 sha256 与 manifest 登记不一致(manifest=${registered}, actual=${rawHash});拒绝摄入`, { sourceId, manifestHash: registered, actualHash: rawHash });
  }
  const noteHash = typeof source.notes === 'string' ? source.notes.match(EXTRACTED_HASH_NOTE_RE)?.[1] : undefined;
  if (noteHash && extractedHash !== noteHash) {
    failCode('KB_SOURCE_HASH_MISMATCH', `来源 ${sourceId} 抽取稿 sha256 与 notes 登记 extractedSha256 不一致(manifest=${noteHash}, actual=${extractedHash});拒绝摄入`, { sourceId, manifestHash: noteHash, actualHash: extractedHash });
  }
}

function findAssetVersionByHash(db, hashRef) {
  return db
    .prepare(
      `SELECT av.id AS version_id, av.asset_id AS asset_id,
              (SELECT COUNT(*) FROM content_blocks cb WHERE cb.asset_version_id = av.id) AS block_count
       FROM asset_versions av
       WHERE av.original_file_hash = ?
       ORDER BY av.created_at DESC
       LIMIT 1`,
    )
    .get(hashRef);
}

// kb_source_permissions 幂等登记:不存在则插入;已存在则逐字段比对,不一致即 FAIL。
function registerPermission(db, source, assetId, actorContext) {
  const row = {
    source_id: assetId,
    canonical_url: source.canonicalUrl ?? source.source_url ?? null,
    authority_level: source.authorityLevel,
    deterministic_parsing_allowed: source.deterministicParsingAllowed ? 1 : 0,
    lexical_indexing_allowed: source.lexicalIndexingAllowed ? 1 : 0,
    llm_input_allowed: source.llmInputAllowed ? 1 : 0,
    embedding_allowed: source.embeddingAllowed ? 1 : 0,
    public_redistribution_allowed: source.publicRedistributionAllowed ? 1 : 0,
    permission_basis: source.permissionBasis ?? null,
    permission_status: source.permissionStatus ?? 'pending_teacher_confirmation',
  };
  const existing = db.prepare('SELECT * FROM kb_source_permissions WHERE source_id = ?').get(assetId);
  if (existing) {
    const mismatches = Object.entries(row).filter(([key, value]) => existing[key] !== value);
    if (mismatches.length > 0) {
      failCode(
        'KB_SOURCE_CONFLICT',
        `来源 ${source.sourceId} 权限登记与库内既有行不一致: ${mismatches.map(([k, v]) => `${k}(db=${JSON.stringify(existing[k])}, manifest=${JSON.stringify(v)})`).join('; ')}`,
        { sourceId: source.sourceId, mismatches: mismatches.map(([k]) => k) },
      );
    }
    return false;
  }
  db.prepare(
    `INSERT INTO kb_source_permissions(
       source_id, canonical_url, authority_level,
       deterministic_parsing_allowed, lexical_indexing_allowed, llm_input_allowed,
       embedding_allowed, public_redistribution_allowed,
       permission_basis, permission_status, permission_updated_by, permission_updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    row.source_id,
    row.canonical_url,
    row.authority_level,
    row.deterministic_parsing_allowed,
    row.lexical_indexing_allowed,
    row.llm_input_allowed,
    row.embedding_allowed,
    row.public_redistribution_allowed,
    row.permission_basis,
    row.permission_status,
    actorContext?.actorId ?? null,
    nowIso(),
  );
  return true;
}

// kb_chapter_sources 幂等登记(PK 即幂等键)。
function registerChapterSource(db, source, assetId, courseId, chapterId) {
  const existing = db
    .prepare('SELECT layer FROM kb_chapter_sources WHERE course_id = ? AND chapter_id = ? AND asset_id = ?')
    .get(courseId, chapterId, assetId);
  if (existing) {
    if (existing.layer !== source.layer) {
      failCode('KB_SOURCE_CONFLICT', `来源 ${source.sourceId} 的 layer 与库内归属不一致(db=${existing.layer}, manifest=${source.layer})`, { sourceId: source.sourceId });
    }
    return false;
  }
  db.prepare(
    `INSERT INTO kb_chapter_sources(course_id, chapter_id, asset_id, layer, priority) VALUES (?, ?, ?, ?, 0)`,
  ).run(courseId, chapterId, assetId, source.layer);
  return true;
}

// 从审查记录 §2 表格确定性强提取六条 pending 题的缺口信息;行缺失即 FAIL。
function loadEvidenceGapSeeds(rootDir, auditPath) {
  const abs = isAbsolute(auditPath) ? auditPath : resolve(rootDir, auditPath);
  let text;
  try {
    text = readFileSync(abs, 'utf8');
  } catch (error) {
    failCode('KB_MANIFEST_INVALID', `证据缺口审查记录不可读: ${abs}: ${error.message}`);
  }
  const seeds = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('| od-eval-')) continue;
    const cells = trimmed.split('|').slice(1, -1).map((cell) => cell.trim());
    if (cells.length < 4) {
      failCode('KB_MANIFEST_INVALID', `审查记录表格行列数不足(期望 ≥4): ${trimmed.slice(0, 80)}`);
    }
    seeds.push({ questionId: cells[0], topic: cells[2], neededSourceType: cells[3] });
  }
  const missing = EXPECTED_GAP_QUESTION_IDS.filter((id) => !seeds.some((seed) => seed.questionId === id));
  if (missing.length > 0) {
    failCode('KB_MANIFEST_INVALID', `审查记录缺少 pending 题缺口行: ${missing.join(', ')}(${abs})`, { missing });
  }
  return seeds.filter((seed) => EXPECTED_GAP_QUESTION_IDS.includes(seed.questionId));
}

function initEvidenceGaps(db, rootDir, auditPath, actorContext) {
  const seeds = loadEvidenceGapSeeds(rootDir, auditPath);
  let created = 0;
  for (const seed of seeds) {
    const existing = db.prepare('SELECT id FROM kb_evidence_gaps WHERE question_id = ?').get(seed.questionId);
    if (existing) continue;
    db.prepare(
      `INSERT INTO kb_evidence_gaps(id, question_id, topic, needed_source_type, status, created_at)
       VALUES (?, ?, ?, ?, 'open', ?)`,
    ).run(newId('gap'), seed.questionId, seed.topic, seed.neededSourceType, nowIso());
    created += 1;
    appendAuditEvent(db, {
      eventType: 'kb.evidence_gap.registered',
      actorType: actorContext?.actorType,
      actorId: actorContext?.actorId,
      entityType: 'kb_evidence_gap',
      entityId: seed.questionId,
      payload: { questionId: seed.questionId, neededSourceType: seed.neededSourceType },
    });
  }
  return created;
}

/**
 * 按权威来源 manifest 登记权限并摄入允许确定性解析的条目。
 * @param {object} db node:sqlite DatabaseSync(已完成 migrations 000–008)
 * @param {string} manifestPath manifest 路径(绝对,或相对 rootDir)
 * @param {{actorType?: string, actorId?: string}} actorContext
 * @param {{rootDir?: string, auditPath?: string}} options
 * @returns {Promise<{ingested: object[], skipped: object[], gapsCreated: number,
 *   corpusVersionBefore: string, corpusVersionAfter: string,
 *   totalBlocks: number, layerBlockCounts: object}>}
 */
export async function ingestAuthoritativeManifest(db, manifestPath, actorContext, { rootDir = PROJECT_ROOT, auditPath = DEFAULT_AUDIT_PATH } = {}) {
  const manifestAbs = isAbsolute(manifestPath) ? manifestPath : resolve(rootDir, manifestPath);
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestAbs, 'utf8'));
  } catch (error) {
    failCode('KB_MANIFEST_INVALID', `authoritative sources manifest 读取/解析失败: ${manifestAbs}: ${error.message}`);
  }
  if (!Array.isArray(manifest.sources)) {
    failCode('KB_MANIFEST_INVALID', `authoritative sources manifest 缺少 sources 数组: ${manifestAbs}`);
  }
  const courseId = manifest.courseId;
  const chapterId = manifest.chapterId;
  if (typeof courseId !== 'string' || courseId.length === 0 || typeof chapterId !== 'string' || chapterId.length === 0) {
    failCode('KB_MANIFEST_INVALID', 'manifest 缺少顶层 courseId/chapterId');
  }

  const corpusVersionBefore = corpusVersionHash(db, { courseId, chapterId });

  const ingested = [];
  const skipped = [];
  const parser = createPaginatedTextParser();

  for (const source of manifest.sources) {
    const sourceId = source.sourceId ?? source.docId;
    if (typeof sourceId !== 'string' || sourceId.length === 0) {
      failCode('KB_MANIFEST_INVALID', 'manifest 条目缺少 sourceId');
    }

    // 权限闸门 1:llmInputAllowed=true 即 FAIL(当前口径全量禁模型处理,出现即异常)。
    if (source.llmInputAllowed === true) {
      failCode('KB_PERMISSION_GATE', `来源 ${sourceId} 声明 llmInputAllowed=true,与当前全量禁模型处理口径冲突;须另行授权并留痕后方可摄入`, { sourceId });
    }

    // 权限闸门 2:获取状态与确定性解析授权。
    const acquisitionStatus = source.acquisitionStatus ?? 'unknown';
    if (!INGESTIBLE_STATUSES.has(acquisitionStatus) || source.deterministicParsingAllowed !== true) {
      skipped.push({
        sourceId,
        status: acquisitionStatus,
        reason: `权限闸门:acquisitionStatus=${acquisitionStatus},deterministicParsingAllowed=${source.deterministicParsingAllowed ?? 'missing'}(blockedReason=${source.blockedReason ?? '无'})`,
      });
      continue;
    }

    const paths = resolveEntryPaths(source);
    if (!paths.extractedPath) {
      skipped.push({ sourceId, status: acquisitionStatus, reason: '抽取稿未落盘(无 extractedPath),不建占位资产' });
      continue;
    }
    const extractedBytes = readBytes(rootDir, paths.extractedPath, sourceId);
    const extractedHash = sha256Hex(extractedBytes);
    verifyHashes(source, rootDir, paths, extractedHash);
    const hashRef = `sha256:${extractedHash}`;

    // 幂等:同 hash 的 asset_version 已存在 → 跳过解析,仅补登权限与章归属。
    const existing = findAssetVersionByHash(db, hashRef);
    if (existing) {
      const permissionRegistered = registerPermission(db, source, existing.asset_id, actorContext);
      const chapterSourceRegistered = registerChapterSource(db, source, existing.asset_id, courseId, chapterId);
      appendAuditEvent(db, {
        eventType: 'source.registered',
        actorType: actorContext?.actorType,
        actorId: actorContext?.actorId,
        entityType: 'knowledge_asset',
        entityId: existing.asset_id,
        payload: {
          sourceId,
          registrationOnly: true,
          alreadyIngested: true,
          permissionRegistered,
          chapterSourceRegistered,
          layer: source.layer,
          fileHash: hashRef,
        },
      });
      ingested.push({
        sourceId,
        assetId: existing.asset_id,
        assetVersionId: existing.version_id,
        blockCount: existing.block_count,
        fileHash: hashRef,
        alreadyIngested: true,
        permissionRegistered,
        chapterSourceRegistered,
      });
      continue;
    }

    // sourceId 被其他 hash 的资产占用 → 冲突,FAIL(不静默覆盖)。
    const idOwner = db.prepare('SELECT id FROM knowledge_assets WHERE id = ?').get(sourceId);
    if (idOwner) {
      failCode('KB_SOURCE_CONFLICT', `sourceId ${sourceId} 已被其他 hash 的资产占用;拒绝重复登记`, { sourceId, fileHash: hashRef });
    }

    const assetType = SOURCE_TYPE_MAP[source.sourceType];
    if (!assetType) {
      failCode('KB_MANIFEST_INVALID', `来源 ${sourceId} 的 sourceType 无法映射: ${JSON.stringify(source.sourceType)}`, { sourceId });
    }

    // 确定性解析(paginated-text;无模型)。
    const parsed = await parser.parse({ fileRef: resolve(rootDir, paths.extractedPath), fileHash: extractedHash });

    // knowledge_assets id 直接取 manifest sourceId(同源同 ID;kb_source_permissions FK 之)。
    const now = nowIso();
    db.prepare(
      `INSERT INTO knowledge_assets(id, type, title, authority, review_status, current_version_id, created_at)
       VALUES (?, ?, ?, ?, 'UNREVIEWED', NULL, ?)`,
    ).run(sourceId, assetType, source.canonicalTitle ?? source.title ?? sourceId, source.publisher ?? source.author_or_issuer ?? null, now);
    appendAuditEvent(db, {
      eventType: 'asset.created',
      actorType: actorContext?.actorType,
      actorId: actorContext?.actorId,
      entityType: 'knowledge_asset',
      entityId: sourceId,
      payload: { type: assetType, title: source.canonicalTitle ?? source.title ?? sourceId, sourceId },
    });

    const version = insertAssetVersion(db, {
      assetId: sourceId,
      version: source.edition_or_version ?? 'unversioned',
      effectiveDate: source.documentDate ?? source.publication_date ?? null,
      originalFileHash: hashRef,
      originalFileLocation: paths.extractedPath,
      parserName: parser.id,
      parserVersion: parser.version,
      actorContext,
    });

    // 片段级来源元数据:课程范围/层级/权限状态/行号锚随块落库(001 表已冻结,不加列)。
    const blockMeta = {
      docId: parsed.documentMeta.docId,
      sourceId,
      courseId,
      chapterId,
      layer: source.layer,
      sourceType: source.sourceType,
      authorityLevel: source.authorityLevel,
      permissionStatus: source.permissionStatus ?? 'pending_teacher_confirmation',
      acquisitionStatus,
      reviewStatus: parsed.documentMeta.reviewStatus ?? 'unreviewed',
      extractedFileHash: hashRef,
    };
    const idByParserBlockId = new Map();
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const block of parsed.blocks) {
        const inserted = insertContentBlock(db, {
          assetVersionId: version.id,
          blockType: block.blockType,
          parentBlockId: block.parentBlockId ? (idByParserBlockId.get(block.parentBlockId) ?? null) : null,
          orderIndex: block.readingOrder,
          pageIndex: block.pageIndex,
          pageLabel: block.pageLabel,
          contentRaw: block.contentRaw,
          normalizedText: block.normalizedText,
          parserMetadata: { ...blockMeta, parserBlockId: block.blockId, anchor: block.anchor ?? null },
        });
        idByParserBlockId.set(block.blockId, inserted.id);
      }
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }

    const permissionRegistered = registerPermission(db, source, sourceId, actorContext);
    const chapterSourceRegistered = registerChapterSource(db, source, sourceId, courseId, chapterId);

    appendAuditEvent(db, {
      eventType: 'source.registered',
      actorType: actorContext?.actorType,
      actorId: actorContext?.actorId,
      entityType: 'knowledge_asset',
      entityId: sourceId,
      payload: {
        sourceId,
        sourceType: source.sourceType,
        courseId,
        chapterId,
        layer: source.layer,
        authorityLevel: source.authorityLevel,
        permissionStatus: blockMeta.permissionStatus,
        fileHash: hashRef,
        fileLocation: paths.extractedPath,
        canonicalUrl: source.canonicalUrl ?? source.source_url ?? null,
        acquisitionStatus,
      },
    });
    appendAuditEvent(db, {
      eventType: 'source.parsed',
      actorType: actorContext?.actorType,
      actorId: actorContext?.actorId,
      entityType: 'asset_version',
      entityId: version.id,
      payload: {
        sourceId,
        fileHash: hashRef,
        parserName: parser.id,
        parserVersion: parser.version,
        docId: parsed.documentMeta.docId,
        blockCount: parsed.blocks.length,
        warningCount: parsed.warnings.length,
        reviewStatus: blockMeta.reviewStatus,
      },
    });

    ingested.push({
      sourceId,
      assetId: sourceId,
      assetVersionId: version.id,
      blockCount: parsed.blocks.length,
      fileHash: hashRef,
      alreadyIngested: false,
      permissionRegistered,
      chapterSourceRegistered,
      warnings: parsed.warnings.map((w) => w.code),
    });
  }

  const gapsCreated = initEvidenceGaps(db, rootDir, auditPath, actorContext);
  const corpusVersionAfter = corpusVersionHash(db, { courseId, chapterId });

  const layerBlockCounts = {};
  let totalBlocks = 0;
  for (const entry of ingested) {
    totalBlocks += entry.blockCount;
    const layer = manifest.sources.find((s) => (s.sourceId ?? s.docId) === entry.sourceId)?.layer ?? 'unknown';
    layerBlockCounts[layer] = (layerBlockCounts[layer] ?? 0) + entry.blockCount;
  }

  return { ingested, skipped, gapsCreated, corpusVersionBefore, corpusVersionAfter, totalBlocks, layerBlockCounts };
}
