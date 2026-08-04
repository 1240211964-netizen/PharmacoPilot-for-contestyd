// 知识来源登记与摄入服务(知识库 v0.1,组织设计章首发)。
// 依据 docs/knowledge-base/management-principles-kb-v0.1-spec.md 与 source manifest
// (docs/knowledge-base/organization-design-source-manifest.json)的逐项授权模型:
//
// 权限闸门(系统约束,非倡议):
//   - 仅当条目 allowedOperations 含 deterministic_parsing、blockedOperations 不含它、
//     且文件已落盘(file_location + file_hash 非空)时,才读取并解析该文件;
//   - 检索(exact_or_lexical_search/page_anchor_location)与模型处理(embedding/LLM)是两类权限,
//     本服务只执行确定性解析(manual-markdown),全程无模型调用;
//   - 有文件但未授权 deterministic_parsing 的条目:跳过并在返回值 skipped 中显式记录原因;
//   - 无文件的条目(awaiting_teacher_provided / awaiting_company_selection / candidate):
//     不建幽灵资产,只在返回值 pending 清单中如实列出;
//   - file_hash 实测复核:manifest 登记值与实际文件 sha256 不一致即抛错 FAIL,绝不静默。
//
// 落库映射(spec §3.5):
//   每份来源 = 一个 knowledge_asset(review_status='UNREVIEWED',如实继承 reviewed=false);
//   每次解析 = 一个 asset_version(original_file_hash=manifest 登记 hash,version=edition_or_version);
//   Fragment = 该 version 下的 content_block。
//   knowledge_assets/asset_versions 是 001 已冻结表,无列可存许可/授权元数据,故
//   allowedOperations/blockedOperations/license/acquisitionStatus/attribution/courseId/chapterId
//   随每个 content_block 的 parser_metadata_json 落库(片段级携带来源权限,服务证据链)。
//
// 幂等:asset_versions.original_file_hash 判重 —— 同 manifest 重跑不产生重复版本与块,
//   已摄入条目以 alreadyIngested=true 如实返回;解析器确定性保证重跑内容一致(repeatability)。
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createManualMarkdownParser } from '../document-parsers/manual-markdown-parser.mjs';
import { appendAuditEvent } from './audit.mjs';
import { failCode } from './errors.mjs';
import { insertAssetVersion, insertContentBlock, insertKnowledgeAsset } from './repository.mjs';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

// manifest source_type → knowledge_assets.type(migration 001 CHECK 枚举)。未知类型显式报错,不静默猜。
const SOURCE_TYPE_MAP = Object.freeze({
  textbook: 'textbook',
  syllabus: 'teaching_artifact',
  teacher_slides: 'teaching_artifact',
  industry_context: 'policy',
  annual_report: 'case',
});

function sourceStatusOf(source) {
  return source.acquisitionStatus ?? source.status ?? 'unknown';
}

/**
 * 按 manifest 登记来源并通过权限闸门摄入允许确定性解析的条目。
 * @param {object} db node:sqlite DatabaseSync(已完成 migrations)
 * @param {string} manifestPath manifest 路径(绝对,或相对 rootDir)
 * @param {{actorType?: string, actorId?: string}} actorContext
 * @param {{rootDir?: string}} options 工程根(file_location 相对它解析),默认 pharmaco网页/
 * @returns {Promise<{ingested: object[], skipped: object[], pending: object[]}>}
 */
export async function registerSourcesFromManifest(db, manifestPath, actorContext, { rootDir = PROJECT_ROOT } = {}) {
  const manifestAbs = isAbsolute(manifestPath) ? manifestPath : resolve(rootDir, manifestPath);
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestAbs, 'utf8'));
  } catch (error) {
    failCode('KB_MANIFEST_INVALID', `source manifest 读取/解析失败: ${manifestAbs}: ${error.message}`);
  }
  if (!Array.isArray(manifest.sources)) {
    failCode('KB_MANIFEST_INVALID', `source manifest 缺少 sources 数组: ${manifestAbs}`);
  }

  const ingested = [];
  const skipped = [];
  const pending = [];

  for (const source of manifest.sources) {
    const sourceId = source.source_id;
    if (typeof sourceId !== 'string' || sourceId.length === 0) {
      failCode('KB_MANIFEST_INVALID', 'manifest 条目缺少 source_id');
    }
    const allowed = Array.isArray(source.allowedOperations) ? source.allowedOperations : [];
    const blocked = Array.isArray(source.blockedOperations) ? source.blockedOperations : [];
    const hasFile =
      typeof source.file_location === 'string' &&
      source.file_location.length > 0 &&
      typeof source.file_hash?.value === 'string' &&
      source.file_hash.value.length > 0;

    // 权限闸门(优先于一切文件操作):未授权 deterministic_parsing 的条目不碰文件。
    if (!allowed.includes('deterministic_parsing') || blocked.includes('deterministic_parsing')) {
      if (!hasFile) {
        pending.push({
          sourceId,
          status: sourceStatusOf(source),
          reason: '来源文件未到位且未授权;到位并完成权利确认(manifest 逐项填写 allowedOperations)后方可摄入',
        });
      } else {
        skipped.push({
          sourceId,
          status: sourceStatusOf(source),
          reason: `权限闸门:deterministic_parsing 不在 allowedOperations 或被 blockedOperations 禁止(license=${source.license ?? 'unknown'})`,
        });
      }
      continue;
    }
    if (!hasFile) {
      pending.push({
        sourceId,
        status: sourceStatusOf(source),
        reason: '来源文件未到位(待教师提供/待课程组选定/候选未抓取),不建占位资产',
      });
      continue;
    }

    // hash 复核:manifest 登记值必须与实际文件一致,不一致即 FAIL(不静默降级)。
    if (source.file_hash.algorithm !== 'sha256') {
      failCode('KB_MANIFEST_INVALID', `来源 ${sourceId} 的 file_hash.algorithm 必须是 sha256`, { sourceId });
    }
    const fileAbs = resolve(rootDir, source.file_location);
    let fileBytes;
    try {
      fileBytes = readFileSync(fileAbs);
    } catch (error) {
      failCode('KB_MANIFEST_INVALID', `来源 ${sourceId} 文件不可读: ${fileAbs}: ${error.message}`, { sourceId });
    }
    const actualHash = createHash('sha256').update(fileBytes).digest('hex');
    if (actualHash !== source.file_hash.value) {
      failCode(
        'KB_SOURCE_HASH_MISMATCH',
        `来源 ${sourceId} 文件 sha256 与 manifest 登记不一致(manifest=${source.file_hash.value}, actual=${actualHash});拒绝摄入`,
        { sourceId, manifestHash: source.file_hash.value, actualHash },
      );
    }
    const hashRef = `sha256:${actualHash}`;

    // 幂等:同 hash 的 asset_version 已存在 → 不重复摄入,如实返回已登记信息(不重插块)。
    const existing = db
      .prepare(
        `SELECT av.id AS version_id, av.asset_id AS asset_id,
                (SELECT COUNT(*) FROM content_blocks cb WHERE cb.asset_version_id = av.id) AS block_count
         FROM asset_versions av
         WHERE av.original_file_hash = ?
         ORDER BY av.created_at DESC
         LIMIT 1`,
      )
      .get(hashRef);
    if (existing) {
      ingested.push({
        sourceId,
        assetId: existing.asset_id,
        assetVersionId: existing.version_id,
        blockCount: existing.block_count,
        fileHash: hashRef,
        alreadyIngested: true,
      });
      continue;
    }

    // 确定性解析(manual-markdown;无模型)。parser 复核 fileHash 并产出契约校验过的 blocks。
    const parser = createManualMarkdownParser();
    const parsed = await parser.parse({ fileRef: fileAbs, fileHash: actualHash });

    const assetType = SOURCE_TYPE_MAP[source.source_type];
    if (!assetType) {
      failCode('KB_MANIFEST_INVALID', `来源 ${sourceId} 的 source_type 无法映射: ${JSON.stringify(source.source_type)}`, { sourceId });
    }
    const asset = insertKnowledgeAsset(db, {
      type: assetType,
      title: source.title,
      authority: source.author_or_issuer ?? null,
      actorContext,
    });
    const version = insertAssetVersion(db, {
      assetId: asset.id,
      version: source.edition_or_version ?? 'unversioned',
      effectiveDate: source.publication_date ?? null,
      originalFileHash: hashRef,
      originalFileLocation: source.file_location,
      parserName: parser.id,
      parserVersion: parser.version,
      actorContext,
    });

    // 片段级来源元数据:权限/许可/课程范围随块落库(001 表已冻结,不加列)。
    const blockMeta = {
      docId: parsed.documentMeta.docId,
      sourceId,
      courseId: source.course_id ?? manifest.courseId ?? null,
      chapterId: source.chapter_id ?? manifest.chapterId ?? null,
      reviewStatus: parsed.documentMeta.reviewStatus ?? 'unreviewed',
      license: source.license ?? null,
      acquisitionStatus: sourceStatusOf(source),
      allowedOperations: allowed,
      blockedOperations: blocked,
      attribution: source.permissionDetails?.attribution ?? null,
    };
    // 块插入包成一个事务(asset/version 由 repository 各自保证);中途失败即回滚本批块。
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
          parserMetadata: { ...blockMeta, parserBlockId: block.blockId },
        });
        idByParserBlockId.set(block.blockId, inserted.id);
      }
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }

    appendAuditEvent(db, {
      eventType: 'source.registered',
      actorType: actorContext?.actorType,
      actorId: actorContext?.actorId,
      entityType: 'knowledge_asset',
      entityId: asset.id,
      payload: {
        sourceId,
        sourceType: source.source_type,
        courseId: blockMeta.courseId,
        chapterId: blockMeta.chapterId,
        fileHash: hashRef,
        fileLocation: source.file_location,
        license: blockMeta.license,
        acquisitionStatus: blockMeta.acquisitionStatus,
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
      assetId: asset.id,
      assetVersionId: version.id,
      blockCount: parsed.blocks.length,
      fileHash: hashRef,
      alreadyIngested: false,
      warnings: parsed.warnings.map((w) => w.code),
    });
  }

  return { ingested, skipped, pending };
}
