// S1 编排门面:把各领域服务串成高层流程,供 API 层与测试调用。
// 每个方法内部按"领域服务 -> 状态机转移"的顺序组合;事务由各服务自行管理(不嵌套)。
import { generateClaimsRuleBased } from './claims.mjs';
import { createDecisionRecords } from './decisions.mjs';
import { runMechanicalValidation } from './mechanical-gates.mjs';
import { computeFacts, importPretest } from './pretest.mjs';
import { publishS1 } from './publish.mjs';
import { insertCohort, insertCourse, insertLesson } from './repository.mjs';
import { runSemanticReview } from './semantic-review.mjs';
import { createWorkflow, transitionWorkflow } from './workflow.mjs';

// 课程/班级/课时创建(带 ID 生成与审计,实现见 repository.mjs)。
export { insertCourse, insertCohort, insertLesson } from './repository.mjs';

export function setupOrganization(db, { courseName, courseCode, cohortName, academicTerm, lessonTitle, actorContext = {} } = {}) {
  const course = insertCourse(db, { name: courseName, code: courseCode, actorContext });
  const cohort = insertCohort(db, { courseId: course.id, name: cohortName, academicTerm, actorContext });
  const lesson = insertLesson(db, { courseId: course.id, classId: cohort.id, title: lessonTitle, actorContext });
  return { courseId: course.id, classId: cohort.id, lessonId: lesson.id };
}

export function startS1Workflow(db, { courseId, classId, lessonId, createdBy, actorContext = {} } = {}) {
  return createWorkflow(db, { courseId, classId, lessonId, createdBy, actorContext });
}

// 前测导入 -> INPUT_READY
export function importPretestAndAdvance(db, { workflowId, fixture, actorContext = {} } = {}) {
  const wf = db.prepare('SELECT * FROM workflow_instances WHERE id = ?').get(workflowId);
  // workflowInstanceId 随 actorContext 透传:005 起 input.imported 等审计事件必带 workflow 维度。
  importPretest(db, wf.lesson_id, fixture, { ...actorContext, workflowInstanceId: workflowId });
  return transitionWorkflow(db, workflowId, 'markInputReady', actorContext);
}

// 事实计算 -> FACTS_COMPUTED
export function computeFactsAndAdvance(db, { workflowId, calculationVersion, actorContext = {} } = {}) {
  const wf = db.prepare('SELECT * FROM workflow_instances WHERE id = ?').get(workflowId);
  const facts = computeFacts(db, {
    courseId: wf.course_id,
    classId: wf.class_id,
    lessonId: wf.lesson_id,
    calculationVersion,
    actorContext: { ...actorContext, workflowInstanceId: workflowId },
  });
  const workflow = transitionWorkflow(db, workflowId, 'computeFacts', actorContext);
  return { workflow, facts };
}

// 规则生成 claim -> EVIDENCE_RETRIEVED -> 建 TDR -> CLAIMS_GENERATED
export async function generateClaimsAndAdvance(db, { workflowId, actorContext = {} } = {}) {
  const wf = db.prepare('SELECT * FROM workflow_instances WHERE id = ?').get(workflowId);
  const generated = await generateClaimsRuleBased(db, {
    workflowInstanceId: workflowId,
    courseId: wf.course_id,
    classId: wf.class_id,
    lessonId: wf.lesson_id,
    actorContext,
  });
  let workflow = transitionWorkflow(db, workflowId, 'attachEvidence', actorContext);
  const records = await createDecisionRecords(db, { workflowInstanceId: workflowId, actorContext });
  workflow = transitionWorkflow(db, workflowId, 'generateClaims', actorContext);
  return { workflow, ...generated, ...records };
}

// 机械门禁 -> MECHANICAL_VALIDATED
export function validateAndAdvance(db, { workflowId, actorContext = {} } = {}) {
  const wf = db.prepare('SELECT * FROM workflow_instances WHERE id = ?').get(workflowId);
  const gate = runMechanicalValidation(db, { lessonId: wf.lesson_id, workflowInstanceId: workflowId, actorContext });
  const workflow = transitionWorkflow(db, workflowId, 'runMechanicalValidation', actorContext);
  return { workflow, gate };
}

// 语义审查(mock)-> SEMANTIC_REVIEWED
export function reviewAndAdvance(db, { workflowId, actorContext = {} } = {}) {
  const wf = db.prepare('SELECT * FROM workflow_instances WHERE id = ?').get(workflowId);
  const review = runSemanticReview(db, { lessonId: wf.lesson_id, workflowInstanceId: workflowId, actorContext });
  const workflow = transitionWorkflow(db, workflowId, 'runSemanticReview', actorContext);
  return { workflow, review };
}

export function enterTeacherReview(db, { workflowId, actorContext = {} } = {}) {
  return transitionWorkflow(db, workflowId, 'enterTeacherReview', actorContext);
}

// 一键跑到 TEACHER_REVIEW(教师裁决与发布由调用方按决策驱动)。
export async function runDiagnosisUpToTeacherReview(db, { workflowId, fixture, actorContext = {} } = {}) {
  importPretestAndAdvance(db, { workflowId, fixture, actorContext });
  computeFactsAndAdvance(db, { workflowId, actorContext });
  const generated = await generateClaimsAndAdvance(db, { workflowId, actorContext });
  const validated = validateAndAdvance(db, { workflowId, actorContext });
  reviewAndAdvance(db, { workflowId, actorContext });
  const workflow = enterTeacherReview(db, { workflowId, actorContext });
  return { workflow, claims: generated.claims, records: generated.records, gate: validated.gate };
}

export function publish(db, { workflowId, actorContext = {} } = {}) {
  return publishS1(db, { workflowInstanceId: workflowId, actorContext });
}
