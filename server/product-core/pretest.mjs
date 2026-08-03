// 前测导入与事实计算(S1 事实侧)。
// 纪律:
//   - 去标识化:只写 student_anon_id,绝不写姓名/学号;
//   - 计算确定性 + 幂等:同一批原始数据 + 同一 calculationVersion 重算,
//     runtime_observations 行数与数值完全一致(UNIQUE(metric,lesson_id,aggregation_level,calculation_version) 兜底);
//     重算命中已存在行时逐项比对,值不一致说明规则在版本号不变下被改动 -> OBSERVATION_RECALC_MISMATCH;
//   - 审计 payload 只含 ID/计数,不含学生原始作答。
import { appendAuditEvent, canonicalJson } from './audit.mjs';
import { failCode } from './errors.mjs';
import { newId, nowIso } from './ids.mjs';

export const DEFAULT_CALCULATION_VERSION = 's1-calc-1.0.0';
export const S1_STAGE_ID = 'S1';

const EPS = 1e-9;

// ---------- fixture 结构校验 ----------

export function validatePretestFixture(fixture) {
  const problems = [];
  if (fixture === null || typeof fixture !== 'object' || Array.isArray(fixture)) {
    problems.push('/: fixture 必须是对象');
    return problems;
  }
  if (fixture.schemaVersion !== '1.0.0') {
    failCode('SCHEMA_VERSION_MISMATCH', 'pretest fixture schemaVersion 必须是 "1.0.0"', {
      actual: fixture.schemaVersion ?? null,
    });
  }
  const items = fixture.items;
  if (!Array.isArray(items) || items.length === 0) problems.push('/items: 必须是非空数组');
  const itemByNo = new Map();
  for (const [index, item] of (items ?? []).entries()) {
    const p = `/items/${index}`;
    if (!Number.isInteger(item?.itemNo)) problems.push(`${p}/itemNo: 必须是整数`);
    if (typeof item?.stem !== 'string' || item.stem.length === 0) problems.push(`${p}/stem: 必须是非空字符串`);
    const keys = Array.isArray(item?.options) ? item.options.map((o) => o?.key) : [];
    if (keys.length !== 4 || new Set(keys).size !== 4 || keys.some((k) => typeof k !== 'string')) {
      problems.push(`${p}/options: 必须是 4 个 key 唯一的选项`);
    }
    if (!keys.includes(item?.correctOption)) problems.push(`${p}/correctOption: 必须存在于 options`);
    if (!Array.isArray(item?.knowledgeTags)) problems.push(`${p}/knowledgeTags: 必须是数组`);
    if (itemByNo.has(item?.itemNo)) problems.push(`${p}/itemNo: 重复`);
    itemByNo.set(item?.itemNo, item);
  }
  const students = fixture.students;
  if (!Array.isArray(students) || students.length === 0) problems.push('/students: 必须是非空数组');
  const studentIds = new Set();
  for (const [index, stu] of (students ?? []).entries()) {
    const p = `/students/${index}`;
    if (typeof stu?.anonId !== 'string' || !/^stu_[a-z0-9]+$/i.test(stu.anonId)) {
      problems.push(`${p}/anonId: 必须是匿名内部 ID(stu_ 前缀)`);
    }
    if (studentIds.has(stu?.anonId)) problems.push(`${p}/anonId: 重复`);
    studentIds.add(stu?.anonId);
  }
  const responses = fixture.responses;
  if (!Array.isArray(responses) || responses.length === 0) problems.push('/responses: 必须是非空数组');
  const seen = new Set();
  for (const [index, resp] of (responses ?? []).entries()) {
    const p = `/responses/${index}`;
    if (!studentIds.has(resp?.studentAnonId)) problems.push(`${p}/studentAnonId: 未在 students 中声明`);
    const item = itemByNo.get(resp?.itemNo);
    if (!item) problems.push(`${p}/itemNo: 未在 items 中声明`);
    const key = `${resp?.studentAnonId}#${resp?.itemNo}`;
    if (seen.has(key)) problems.push(`${p}: 同一学生同一题目重复作答`);
    seen.add(key);
    if (item && resp?.selectedOption != null && !item.options.some((o) => o.key === resp.selectedOption)) {
      problems.push(`${p}/selectedOption: 不在题目选项内`);
    }
    if (resp?.participated !== 0 && resp?.participated !== 1) problems.push(`${p}/participated: 必须是 0 或 1`);
    if (typeof resp?.submittedAt !== 'string') problems.push(`${p}/submittedAt: 必须是 ISO 时间字符串`);
  }
  return problems;
}

// ---------- 导入 ----------

export function importPretest(db, lessonId, fixture, actorContext = {}) {
  const lesson = db.prepare('SELECT id, course_id FROM lessons WHERE id = ?').get(lessonId);
  if (!lesson) failCode('PRETEST_FIXTURE_INVALID', `课时不存在: ${lessonId}`, { lessonId });
  const problems = validatePretestFixture(fixture);
  if (problems.length > 0) {
    failCode('PRETEST_FIXTURE_INVALID', `pretest fixture 结构不合法:\n${problems.join('\n')}`, { problems });
  }
  const studentByAnon = new Map(fixture.students.map((s) => [s.anonId, s]));
  const itemIdByNo = new Map();
  let itemCount = 0;
  let responseCount = 0;
  db.exec('BEGIN IMMEDIATE');
  try {
    const insertItem = db.prepare(
      `INSERT INTO pretest_items(id, lesson_id, item_no, stem, options_json, correct_option, knowledge_tags_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertResponse = db.prepare(
      `INSERT INTO pretest_responses(id, item_id, student_anon_id, selected_option, participated, knowledge_level, experience_profile, submitted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const item of fixture.items) {
      const itemId = newId('pit');
      insertItem.run(
        itemId,
        lessonId,
        item.itemNo,
        item.stem,
        JSON.stringify(item.options),
        item.correctOption,
        JSON.stringify(item.knowledgeTags ?? []),
      );
      itemIdByNo.set(item.itemNo, itemId);
      itemCount += 1;
    }
    for (const resp of fixture.responses) {
      const stu = studentByAnon.get(resp.studentAnonId);
      insertResponse.run(
        newId('prs'),
        itemIdByNo.get(resp.itemNo),
        resp.studentAnonId,
        resp.selectedOption ?? null,
        resp.participated,
        stu.knowledgeLevel ?? null,
        stu.experienceProfile ?? null,
        resp.submittedAt,
      );
      responseCount += 1;
    }
    appendAuditEvent(db, {
      eventType: 'input.imported',
      actorType: actorContext.actorType,
      actorId: actorContext.actorId,
      entityType: 'lesson',
      entityId: lessonId,
      workflowInstanceId: actorContext.workflowInstanceId ?? null,
      payload: { itemCount, responseCount, studentCount: fixture.students.length, courseId: lesson.course_id },
    });
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return { lessonId, itemCount, responseCount, itemIdByNo };
}

// ---------- 确定性重算器(机械门禁 check 8/9 复用) ----------

function loadResponsesByItem(db, lessonId) {
  return db
    .prepare(
      `SELECT r.id, r.item_id, r.student_anon_id, r.selected_option, r.participated,
              r.knowledge_level, r.experience_profile, i.item_no, i.correct_option, i.options_json
       FROM pretest_responses r
       JOIN pretest_items i ON i.id = r.item_id
       WHERE i.lesson_id = ?
       ORDER BY r.id`,
    )
    .all(lessonId);
}

function sortedIds(rows) {
  return rows.map((r) => r.id).sort();
}

// 按 metric 名从原始作答重算;无法识别的 metric 返回 null。
export function recomputeObservation(db, lessonId, metric) {
  const rows = loadResponsesByItem(db, lessonId);
  const accuracyMatch = /^pretest\.accuracy\.q(\d+)$/.exec(metric);
  const shareMatch = /^pretest\.option_share\.q(\d+)\.([A-Z])$/.exec(metric);
  if (accuracyMatch) {
    const itemRows = rows.filter((r) => r.item_no === Number(accuracyMatch[1]));
    const numerator = itemRows.filter((r) => r.selected_option === r.correct_option).length;
    const denominator = itemRows.length;
    return {
      value: denominator === 0 ? 0 : numerator / denominator,
      numerator,
      denominator,
      sourceRecordIds: sortedIds(itemRows),
      unit: 'ratio',
      observationType: 'pretest_score',
      calculationRule: 's1-calc/pretest.item_accuracy@1',
    };
  }
  if (shareMatch) {
    const itemRows = rows.filter((r) => r.item_no === Number(shareMatch[1]));
    const numerator = itemRows.filter((r) => r.selected_option === shareMatch[2]).length;
    const denominator = itemRows.length;
    return {
      value: denominator === 0 ? 0 : numerator / denominator,
      numerator,
      denominator,
      sourceRecordIds: sortedIds(itemRows),
      unit: 'ratio',
      observationType: 'pretest_option_distribution',
      calculationRule: 's1-calc/pretest.option_share@1',
    };
  }
  if (metric === 'pretest.participation') {
    const numerator = rows.filter((r) => r.participated === 1).length;
    const denominator = rows.length;
    return {
      value: denominator === 0 ? 0 : numerator / denominator,
      numerator,
      denominator,
      sourceRecordIds: sortedIds(rows),
      unit: 'ratio',
      observationType: 'pretest_participation',
      calculationRule: 's1-calc/pretest.participation@1',
    };
  }
  if (metric === 'pretest.overall_accuracy') {
    const numerator = rows.filter((r) => r.selected_option === r.correct_option).length;
    const denominator = rows.length;
    return {
      value: denominator === 0 ? 0 : numerator / denominator,
      numerator,
      denominator,
      sourceRecordIds: sortedIds(rows),
      unit: 'ratio',
      observationType: 'group_aggregate',
      calculationRule: 's1-calc/pretest.overall_accuracy@1',
    };
  }
  const levelMatch = /^knowledge_level\.share\.(.+)$/.exec(metric);
  if (levelMatch) {
    const byStudent = new Map();
    for (const r of rows) {
      if (r.knowledge_level != null && !byStudent.has(r.student_anon_id)) {
        byStudent.set(r.student_anon_id, r);
      }
    }
    const all = [...byStudent.values()];
    const hits = all.filter((r) => r.knowledge_level === levelMatch[1]);
    return {
      value: all.length === 0 ? 0 : hits.length / all.length,
      numerator: hits.length,
      denominator: all.length,
      sourceRecordIds: sortedIds(hits),
      unit: 'ratio',
      observationType: 'knowledge_level',
      calculationRule: 's1-calc/knowledge_level.share@1',
    };
  }
  const expMatch = /^experience_profile\.share\.(.+)$/.exec(metric);
  if (expMatch) {
    const byStudent = new Map();
    for (const r of rows) {
      if (r.experience_profile != null && !byStudent.has(r.student_anon_id)) {
        byStudent.set(r.student_anon_id, r);
      }
    }
    const all = [...byStudent.values()];
    const hits = all.filter((r) => r.experience_profile === expMatch[1]);
    return {
      value: all.length === 0 ? 0 : hits.length / all.length,
      numerator: hits.length,
      denominator: all.length,
      sourceRecordIds: sortedIds(hits),
      unit: 'ratio',
      observationType: 'experience_profile',
      calculationRule: 's1-calc/experience_profile.share@1',
    };
  }
  return null;
}

// 某 lesson 当前应算出的全部 metric 名(由题目选项与匿名分布字段决定,确定性)。
export function plannedMetrics(db, lessonId) {
  const items = db
    .prepare('SELECT item_no, options_json FROM pretest_items WHERE lesson_id = ? ORDER BY item_no')
    .all(lessonId);
  const metrics = [];
  for (const item of items) {
    metrics.push(`pretest.accuracy.q${item.item_no}`);
    for (const option of JSON.parse(item.options_json)) {
      metrics.push(`pretest.option_share.q${item.item_no}.${option.key}`);
    }
  }
  metrics.push('pretest.participation');
  metrics.push('pretest.overall_accuracy');
  const rows = loadResponsesByItem(db, lessonId);
  const levels = new Set();
  const profiles = new Set();
  for (const r of rows) {
    if (r.knowledge_level != null) levels.add(r.knowledge_level);
    if (r.experience_profile != null) profiles.add(r.experience_profile);
  }
  for (const level of [...levels].sort()) metrics.push(`knowledge_level.share.${level}`);
  for (const profile of [...profiles].sort()) metrics.push(`experience_profile.share.${profile}`);
  return metrics;
}

// ---------- 事实计算(幂等) ----------

export function computeFacts(
  db,
  {
    courseId,
    classId,
    lessonId,
    calculationVersion = DEFAULT_CALCULATION_VERSION,
    actorContext = {},
  } = {},
) {
  const metrics = plannedMetrics(db, lessonId);
  if (metrics.length === 0) {
    failCode('PRETEST_FIXTURE_INVALID', `课时 ${lessonId} 尚未导入前测数据,无法计算事实`, { lessonId });
  }
  const selectExisting = db.prepare(
    `SELECT id, value, numerator, denominator, source_record_ids_json FROM runtime_observations
     WHERE metric = ? AND lesson_id = ? AND aggregation_level = 'group' AND calculation_version = ?`,
  );
  const insertObservation = db.prepare(
    `INSERT INTO runtime_observations(
       id, observation_type, course_id, class_id, lesson_id, stage_id, metric,
       value, unit, numerator, denominator, calculation_rule, calculation_version,
       source_record_ids_json, aggregation_level, calculated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'group', ?)`,
  );
  const written = [];
  const reused = [];
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const metric of metrics) {
      const recomputed = recomputeObservation(db, lessonId, metric);
      if (!recomputed) failCode('OBSERVATION_RECALC_MISMATCH', `无法重算 metric: ${metric}`, { metric });
      const sourceIdsJson = JSON.stringify(recomputed.sourceRecordIds);
      const existing = selectExisting.get(metric, lessonId, calculationVersion);
      if (existing) {
        const mismatch =
          Math.abs(existing.value - recomputed.value) > EPS ||
          Math.abs(existing.numerator - recomputed.numerator) > EPS ||
          Math.abs(existing.denominator - recomputed.denominator) > EPS ||
          existing.source_record_ids_json !== sourceIdsJson;
        if (mismatch) {
          // 同 calculationVersion 下重算结果不同 = 规则被原地修改,违反 schema 版本纪律(S4)。
          failCode('OBSERVATION_RECALC_MISMATCH', `metric ${metric} 重算结果与已存储值不一致`, {
            metric,
            stored: { value: existing.value, numerator: existing.numerator, denominator: existing.denominator },
            recomputed: { value: recomputed.value, numerator: recomputed.numerator, denominator: recomputed.denominator },
          });
        }
        reused.push({ id: existing.id, metric });
        continue;
      }
      const id = newId('obs');
      insertObservation.run(
        id,
        recomputed.observationType,
        courseId,
        classId,
        lessonId,
        S1_STAGE_ID,
        metric,
        recomputed.value,
        recomputed.unit,
        recomputed.numerator,
        recomputed.denominator,
        recomputed.calculationRule,
        calculationVersion,
        sourceIdsJson,
        nowIso(),
      );
      written.push({ id, metric });
      appendAuditEvent(db, {
        eventType: 'observation.computed',
        actorType: actorContext.actorType,
        actorId: actorContext.actorId,
        entityType: 'runtime_observation',
        entityId: id,
        workflowInstanceId: actorContext.workflowInstanceId ?? null,
        payload: { metric, lessonId, calculationVersion, courseId },
      });
    }
    appendAuditEvent(db, {
      eventType: 'facts.computed',
      actorType: actorContext.actorType,
      actorId: actorContext.actorId,
      entityType: 'lesson',
      entityId: lessonId,
      workflowInstanceId: actorContext.workflowInstanceId ?? null,
      payload: {
        lessonId,
        calculationVersion,
        writtenCount: written.length,
        reusedCount: reused.length,
        metricCount: metrics.length,
        courseId,
      },
    });
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return { lessonId, calculationVersion, written, reused, metricCount: metrics.length };
}

export function listObservations(db, lessonId, calculationVersion = null) {
  if (calculationVersion) {
    return db
      .prepare('SELECT * FROM runtime_observations WHERE lesson_id = ? AND calculation_version = ? ORDER BY metric')
      .all(lessonId, calculationVersion);
  }
  return db.prepare('SELECT * FROM runtime_observations WHERE lesson_id = ? ORDER BY metric').all(lessonId);
}

export { canonicalJson };
