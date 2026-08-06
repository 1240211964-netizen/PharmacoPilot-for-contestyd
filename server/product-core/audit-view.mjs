// 审计读时规范视图(eventNameCanonical 1.0)。
//
// 背景:历史写入侧对同一逻辑时刻双名并写(服务层事件 + 工作流转移事件各写一条,
// 或汇总事件 + 逐实体细分事件),教师看时间线会看到一对/一簇近义事件,
// 难以判断"到底发生了几件事"。本模块只在读出时做规范视图:不改写入点、不改库,
// 事件落库原样保留(可重放/可核验),时间线 API 返回前过 canonicalizeAuditEvents 折叠。
//
// 规范映射表(显式常量 AUDIT_EVENT_GROUPS;规范名 → { 别名, 折叠策略 }):
//   input.imported                    ← inputs.submitted              导入前测(服务事件 ← 转移标记)
//   facts.computed                    ← observation.computed          算事实(汇总事件 ← 逐 metric 行)
//   version.published                 ← lesson.published              发布(版本维度 ← 课时维度)
//   mechanical.validation.completed   ← gate.mechanical.completed     机械校验(逐 claim 行 ← 转移标记)
//   semantic.review.completed         ← review.semantic.completed     语义审查(逐 claim 行 ← 转移标记)
//   teacher.decision.recorded         ← teacher.accepted/revised/rejected/deferred
//                                                                     教师裁决(统一裁决事件 ← 动作细分名)
// 不在表内的事件名(含未知事件名)原样保留,绝不静默丢弃或改名。
//
// 折叠维度:workflow_instance_id(无 workflow 维度的旧行退化为 entity_id)× 规范事件组 ×
// 秒级时间窗(created_at 截断到秒,ISO 前 19 字符)。折叠策略按组区分:
//   fold 'bucket':同维度同秒同组全部折为一条。适用于"一次操作写一簇"的组
//     (导入/算事实/发布/校验/审查),逐实体细分行折进汇总/主事件,实体 ID 留在 aliases 可溯。
//   fold 'entity':同维度同秒同组还须同 entity_id 才折。适用于教师裁决组——
//     同一裁决记录的双名对折叠,不同裁决记录(同秒连续裁决多条)必须保持独立事件。
//
// 主事件选取与 payload 合并策略:
//   1. 组内已有规范名事件优先作主事件(如 facts.computed 汇总行);
//   2. 都是别名时取 payload 信息更全者(键数更多;并列取先到者),其事件名记入 originalEventType;
//   3. 主事件 payload 原样保留,不并入别名行内容;其余成员进入 aliases[](含 id/eventType/
//      entityType/entityId),其 payload 中主事件没有的或与主事件值不同的键以 payloadExtra 记录;
//   4. aliasCount = aliases.length,供 UI 显示"含 N 条别名事件"。
// 落单的别名事件(旧数据只有别名名)也规范化为规范名,记 originalEventType,aliasCount 0。
export const AUDIT_VIEW_VERSION = '1.0';

// 规范事件组。新增映射只追加新组/组内追加别名,不改已有键(读时视图,语义对外可见)。
export const AUDIT_EVENT_GROUPS = Object.freeze({
  'input.imported': Object.freeze({ aliases: Object.freeze(['inputs.submitted']), fold: 'bucket' }),
  'facts.computed': Object.freeze({ aliases: Object.freeze(['observation.computed']), fold: 'bucket' }),
  'version.published': Object.freeze({ aliases: Object.freeze(['lesson.published']), fold: 'bucket' }),
  'mechanical.validation.completed': Object.freeze({ aliases: Object.freeze(['gate.mechanical.completed']), fold: 'bucket' }),
  'semantic.review.completed': Object.freeze({ aliases: Object.freeze(['review.semantic.completed']), fold: 'bucket' }),
  'teacher.decision.recorded': Object.freeze({
    aliases: Object.freeze(['teacher.accepted', 'teacher.revised', 'teacher.rejected', 'teacher.deferred']),
    fold: 'entity',
  }),
});

// 别名 → 规范名(由组表派生,便于单名查询)。
export const AUDIT_EVENT_ALIASES = Object.freeze(
  Object.fromEntries(
    Object.entries(AUDIT_EVENT_GROUPS).flatMap(([canonical, group]) =>
      group.aliases.map((alias) => [alias, canonical]),
    ),
  ),
);

export function canonicalEventType(eventType) {
  return AUDIT_EVENT_ALIASES[eventType] ?? eventType;
}

function secondOf(createdAt) {
  return typeof createdAt === 'string' ? createdAt.slice(0, 19) : '';
}

function payloadKeyCount(payload) {
  return payload && typeof payload === 'object' ? Object.keys(payload).length : 0;
}

// 别名 payload 中主事件没有的键(含值不同的键),避免折叠丢信息。
function payloadExtra(aliasPayload, primaryPayload) {
  if (!aliasPayload || typeof aliasPayload !== 'object') return undefined;
  const base = primaryPayload && typeof primaryPayload === 'object' ? primaryPayload : {};
  const extra = Object.fromEntries(
    Object.entries(aliasPayload).filter(([key, value]) => !(key in base) || base[key] !== value),
  );
  return Object.keys(extra).length > 0 ? extra : undefined;
}

// rows:app.mjs 审计读口的 camelCase 行(id/eventType/actorType/actorId/entityType/entityId/
// workflowInstanceId/previousState/nextState/payload/eventHash/createdAt),已按 created_at 排序。
// 返回新数组;未涉及映射的事件原对象原样通过(不新增字段、不改引用)。
export function canonicalizeAuditEvents(rows) {
  const groups = new Map(); // foldKey → { canonical, members: [row] }
  const output = []; // 元素:直过 row 或 group 占位(保持首见顺序)
  for (const row of rows) {
    const canonical = canonicalEventType(row.eventType);
    const group = AUDIT_EVENT_GROUPS[canonical];
    if (!group) {
      output.push(row); // 不在任何规范组:未知/单名事件原样通过
      continue;
    }
    const dimension = row.workflowInstanceId ?? row.entityId ?? row.id;
    const entityPart = group.fold === 'entity' ? `${row.entityId ?? row.id}` : '';
    const foldKey = `${dimension}${canonical}${entityPart}${secondOf(row.createdAt)}`;
    let bucket = groups.get(foldKey);
    if (!bucket) {
      bucket = { canonical, members: [] };
      groups.set(foldKey, bucket);
      output.push(bucket);
    }
    bucket.members.push(row);
  }

  return output.map((entry) => ('members' in entry ? mergeGroup(entry.canonical, entry.members) : entry));
}

function mergeGroup(canonical, members) {
  // 主事件:规范名成员优先;否则 payload 键数更多者;再否则先到者(members 保序)。
  let primary = members[0];
  for (const member of members) {
    if (primary.eventType !== canonical && member.eventType === canonical) {
      primary = member;
    } else if ((primary.eventType === canonical) === (member.eventType === canonical)) {
      if (payloadKeyCount(member.payload) > payloadKeyCount(primary.payload)) primary = member;
    }
  }
  const aliases = members
    .filter((member) => member !== primary)
    .map((member) => {
      const extra = payloadExtra(member.payload, primary.payload);
      return {
        id: member.id,
        eventType: member.eventType,
        entityType: member.entityType,
        entityId: member.entityId,
        ...(extra ? { payloadExtra: extra } : {}),
      };
    });
  const merged = { ...primary, eventType: canonical, aliasCount: aliases.length, aliases };
  if (primary.eventType !== canonical) merged.originalEventType = primary.eventType;
  return merged;
}
