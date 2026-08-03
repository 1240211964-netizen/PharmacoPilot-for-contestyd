// 组织结构与知识资产的写入 helper:统一负责 ID 生成、NOT NULL 字段与审计。
// 只提供追加式写入;状态翻转(如 asset_versions.source_status)由各领域服务显式执行。
import { appendAuditEvent, canonicalJson, sha256Hex } from './audit.mjs';
import { newId, nowIso } from './ids.mjs';
import { failCode } from './errors.mjs';

export function insertCourse(db, { name, code, actorContext } = {}) {
  if (!name || !code) failCode('PRETEST_FIXTURE_INVALID', '创建课程需要 name 与 code');
  const id = newId('crs');
  const now = nowIso();
  db.prepare(
    `INSERT INTO courses(id, name, code, status, created_at, updated_at)
     VALUES (?, ?, ?, 'ACTIVE', ?, ?)`,
  ).run(id, name, code, now, now);
  appendAuditEvent(db, {
    eventType: 'course.created',
    actorType: actorContext?.actorType,
    actorId: actorContext?.actorId,
    entityType: 'course',
    entityId: id,
    payload: { code },
  });
  return { id, name, code };
}

export function insertCohort(db, { courseId, name, academicTerm, actorContext } = {}) {
  const id = newId('coh');
  const now = nowIso();
  db.prepare(
    `INSERT INTO class_cohorts(id, course_id, name, academic_term, anonymization_policy, created_at)
     VALUES (?, ?, ?, ?, 'anonymous-internal-id', ?)`,
  ).run(id, courseId, name, academicTerm ?? '', now);
  appendAuditEvent(db, {
    eventType: 'cohort.created',
    actorType: actorContext?.actorType,
    actorId: actorContext?.actorId,
    entityType: 'class_cohort',
    entityId: id,
    payload: { courseId, name },
  });
  return { id, courseId, name };
}

export function insertLesson(db, { courseId, classId, title, actorContext } = {}) {
  const id = newId('les');
  const now = nowIso();
  db.prepare(
    `INSERT INTO lessons(id, course_id, class_id, title, stage_status, created_at)
     VALUES (?, ?, ?, ?, 'DRAFT', ?)`,
  ).run(id, courseId, classId ?? null, title, now);
  appendAuditEvent(db, {
    eventType: 'lesson.created',
    actorType: actorContext?.actorType,
    actorId: actorContext?.actorId,
    entityType: 'lesson',
    entityId: id,
    payload: { courseId, classId: classId ?? null, title },
  });
  return { id, courseId, classId: classId ?? null, title };
}

export function insertKnowledgeAsset(db, { type, title, authority = null, actorContext } = {}) {
  const id = newId('ka');
  const now = nowIso();
  db.prepare(
    `INSERT INTO knowledge_assets(id, type, title, authority, review_status, current_version_id, created_at)
     VALUES (?, ?, ?, ?, 'UNREVIEWED', NULL, ?)`,
  ).run(id, type, title, authority, now);
  appendAuditEvent(db, {
    eventType: 'asset.created',
    actorType: actorContext?.actorType,
    actorId: actorContext?.actorId,
    entityType: 'knowledge_asset',
    entityId: id,
    payload: { type, title },
  });
  return { id, type, title };
}

// 新增资产版本并维护 supersede 链:前一 active 版本 source_status -> superseded(触发器强制单向),
// 并回填 knowledge_assets.current_version_id 逻辑指针(migration 001 注释说明有意不加 FK)。
export function insertAssetVersion(
  db,
  {
    assetId,
    version,
    effectiveDate = null,
    originalFileHash = null,
    originalFileLocation = null,
    parserName = null,
    parserVersion = null,
    actorContext,
  } = {},
) {
  const id = newId('kav');
  const now = nowIso();
  let previous;
  db.exec('BEGIN IMMEDIATE');
  try {
    previous = db
      .prepare(
        `SELECT id FROM asset_versions WHERE asset_id = ? AND source_status = 'active'
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get(assetId);
    db.prepare(
      `INSERT INTO asset_versions(
         id, asset_id, version, effective_date, source_status, superseded_by,
         original_file_hash, original_file_location, parser_name, parser_version, parsed_at, created_at
       ) VALUES (?, ?, ?, ?, 'active', NULL, ?, ?, ?, ?, ?, ?)`,
    ).run(id, assetId, version, effectiveDate, originalFileHash, originalFileLocation, parserName, parserVersion, now, now);
    if (previous) {
      db.prepare(
        `UPDATE asset_versions SET source_status = 'superseded', superseded_by = ? WHERE id = ?`,
      ).run(id, previous.id);
    }
    db.prepare(`UPDATE knowledge_assets SET current_version_id = ? WHERE id = ?`).run(id, assetId);
    appendAuditEvent(db, {
      eventType: 'asset.version.created',
      actorType: actorContext?.actorType,
      actorId: actorContext?.actorId,
      entityType: 'asset_version',
      entityId: id,
      payload: { assetId, version, supersedes: previous?.id ?? null },
    });
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return { id, assetId, version, supersedes: previous?.id ?? null };
}

export function insertContentBlock(
  db,
  {
    assetVersionId,
    blockType = 'paragraph',
    parentBlockId = null,
    orderIndex,
    pageIndex = null,
    pageLabel = null,
    bbox = null,
    bboxCoordinateSystem = 'none',
    contentRaw,
    contentSegmented = null,
    normalizedText = null,
    parserMetadata = null,
  } = {},
) {
  const id = newId('blk');
  const contentHash = `sha256:${sha256Hex(contentRaw)}`;
  db.prepare(
    `INSERT INTO content_blocks(
       id, asset_version_id, block_type, parent_block_id, order_index,
       page_index, page_label, bbox_json, bbox_coordinate_system,
       content_raw, content_segmented, normalized_text, content_hash, parser_metadata_json
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    assetVersionId,
    blockType,
    parentBlockId,
    orderIndex,
    pageIndex,
    pageLabel,
    bbox === null ? null : JSON.stringify(bbox),
    bboxCoordinateSystem,
    contentRaw,
    contentSegmented,
    normalizedText,
    contentHash,
    parserMetadata === null ? null : canonicalJson(parserMetadata),
  );
  return { id, assetVersionId, contentHash };
}
