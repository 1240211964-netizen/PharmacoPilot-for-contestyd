// 审计事件服务:向扩展后的 audit_events(migration 003)追加事件。
// event_hash = sha256(核心字段的 canonical JSON),供完整性核验;
// payload_json 序列化事件负载。
//
// 维度纪律(migration 005 起):新事件必须带 workflow_instance_id(工作流上下文内)、
//   entity_type/entity_id、actor_type/actor_id,schema_version 固定 '1.0.0';
//   能拿到 course_id 的事件把 courseId 放入 payload_json(不新增列)。
//   审计为追加式,005 之前缺失维度的旧行不回填、保持原样。
//
// 隐私纪律(见 docs/product-core/security-and-privacy.md 与 domain-invariants B5):
//   payload 绝不写入学生原始作答、学生身份、claim/题干等长正文;
//   只允许 ID、计数、哈希、状态枚举等聚合/引用信息。调用方违反此纪律属于 bug。
import { createHash } from 'node:crypto';
import { newId, nowIso } from './ids.mjs';

// canonical JSON:对象键递归排序后序列化,保证同一内容哈希稳定。
export function canonicalJson(value) {
  return JSON.stringify(sortKeysDeep(value));
}

function sortKeysDeep(value) {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortKeysDeep(value[key])]),
    );
  }
  return value;
}

export function sha256Hex(text) {
  return createHash('sha256').update(text).digest('hex');
}

export function appendAuditEvent(
  db,
  {
    eventType,
    actorType,
    actorId,
    entityType,
    entityId,
    workflowInstanceId = null,
    previousState = null,
    nextState = null,
    payload = null,
    schemaVersion = '1.0.0',
  },
) {
  if (!eventType) throw new Error('appendAuditEvent: eventType is required');
  const id = newId('aud');
  const createdAt = nowIso();
  // event_hash 只覆盖核心字段(不含 id/created_at),保证同一逻辑事件内容可核验。
  const eventHash = sha256Hex(
    canonicalJson({
      eventType,
      actorType: actorType ?? null,
      actorId: actorId ?? null,
      entityType: entityType ?? null,
      entityId: entityId ?? null,
      workflowInstanceId,
      previousState,
      nextState,
      payload,
      schemaVersion,
    }),
  );
  db.prepare(
    `INSERT INTO audit_events(
       id, event_type, workspace_id, metadata_json, created_at,
       actor_type, actor_id, entity_type, entity_id, workflow_instance_id,
       previous_state, next_state, payload_json, event_hash, schema_version
     ) VALUES (?, ?, NULL, '{}', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    eventType,
    createdAt,
    actorType ?? null,
    actorId ?? null,
    entityType ?? null,
    entityId ?? null,
    workflowInstanceId,
    previousState,
    nextState,
    payload === null ? null : JSON.stringify(payload),
    eventHash,
    schemaVersion,
  );
  return { id, eventType, eventHash, createdAt };
}
