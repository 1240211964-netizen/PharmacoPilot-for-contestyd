import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from './migrations.mjs';
import { insertCourse, insertCohort, insertLesson } from './product-core/repository.mjs';
import {
  createTeachingWorkflow,saveS1Context,attachEvidencePackage,saveCandidateStage,beginReview,recordDecision,
  completeReview,approveDesignV1,runSimulation,createS8AndV2AndS9,completeTeachingWorkflow,teachingWorkflowDetail,
} from './product-core/teaching-orchestration.mjs';
import { patchCompletedCh06RealPilot } from './product-core/ch06-real-pilot.mjs';

test('P2B.1 consumes both CH06 critical moments and persists a non-no-op append-only revision without LLM',()=>{
  const dir=mkdtempSync(join(tmpdir(),'ch06-effective-revision-')),db=new DatabaseSync(join(dir,'product-core.sqlite'));
  try{
    db.exec('PRAGMA foreign_keys=ON');runMigrations(db);
    const actor={actorType:'teacher',actorId:'teacher-effective-revision'};
    const course=insertCourse(db,{name:'CH06 effective revision test',code:'CH06-P2B1',actorContext:actor});
    const cohort=insertCohort(db,{courseId:course.id,name:'fixture cohort',actorContext:actor});
    const lesson=insertLesson(db,{courseId:course.id,classId:cohort.id,title:'组织设计',actorContext:actor});
    const workflow=createTeachingWorkflow(db,{courseId:course.id,classId:cohort.id,lessonId:lesson.id,chapterId:'CH06',lessonHours:2,actorContext:actor});
    saveS1Context(db,workflow.id,{fixture:true,fixtureType:'simulated_for_workflow_validation'},actor,{idempotencyKey:'s1'});
    attachEvidencePackage(db,workflow.id,{fixture:true,corpusVersionHash:'fixture',retrievalRunIds:['rr'],evidenceLinkIds:['ev']},actor,{idempotencyKey:'evidence'});
    for(const stage of ['S2','S3','S4','S5','S6','S7']){
      const items=stage==='S5'?[{title:'原 S5 活动',content:'结构比较',claimType:'pedagogical_recommendation'}]:stage==='S7'?[{title:'原 S7 评价标准',content:'组织设计原则',claimType:'pedagogical_recommendation'}]:[];
      saveCandidateStage(db,workflow.id,stage,{generationMode:'deterministic_fixture',fixture:true,stage,items},actor,{idempotencyKey:`candidate:${stage}`});
    }
    beginReview(db,workflow.id,actor,{idempotencyKey:'review'});
    const candidate=db.prepare('SELECT id FROM teaching_design_candidates WHERE workflow_id=?').get(workflow.id);
    for(const [index,decision] of ['ACCEPTED','MODIFIED','REJECTED','PENDING_EVIDENCE'].entries()) recordDecision(db,workflow.id,{candidateId:candidate.id,fieldPath:`/stages/S${index+2}`,decision,originalContent:{index},revisedContent:decision==='MODIFIED'?{index,modified:true}:null,reason:'fixture decision',decisionSource:'deterministic_fixture'},actor,{idempotencyKey:`decision:${index}`});
    completeReview(db,workflow.id,actor,{idempotencyKey:'review:complete'});
    const v1=approveDesignV1(db,workflow.id,actor,{idempotencyKey:'approve'});
    const simulation=runSimulation(db,workflow.id,{schemaVersion:'1.0.0',workflowInstanceId:workflow.id,teachingDesignVersionId:v1.versionId,courseId:course.id,chapterId:'CH06',lessonHours:2,seed:'p2b1-fixed',studentProfiles:[{studentId:'s1'}],studentGroups:[],lessonTimeline:[],learningActivities:[],formativeSignals:[],adaptiveActions:[],performanceTask:{},rubric:{},simulationMode:'persisted_run',scenarioConfig:{ruleEvents:[
      {ruleId:'matrix',lessonOffset:1800,eventType:'misconception',severity:4,relatedStage:'S5',relatedFieldPath:'s5LearningActivities',observedSignal:'学生将矩阵制的双重领导理解为无需协调的优势'},
      {ruleId:'authority',lessonOffset:4200,eventType:'assessment_ambiguity',severity:3,relatedStage:'S7',relatedFieldPath:'s7Rubric',observedSignal:'学生无法区分授权与分权的评价证据'},
    ]}},actor,{idempotencyKey:'simulation'});
    assert.equal(simulation.result.criticalMoments.length,2);
    createS8AndV2AndS9(db,workflow.id,actor,{idempotencyKey:'legacy-no-op',provenance:'deterministic_simulation'});
    completeTeachingWorkflow(db,workflow.id,actor,{idempotencyKey:'legacy-complete'});
    const before=teachingWorkflowDetail(db,workflow.id),oldV2=before.designVersions.find((item)=>item.version_number===2),oldS9=before.s9Candidates[0];
    assert.equal(oldV2.revisionOutcome,'NO_OP');
    const result=patchCompletedCh06RealPilot(db,{workflowId:workflow.id,actorContext:actor});
    assert.equal(result.versionNumber,3);
    const after=teachingWorkflowDetail(db,workflow.id),effective=after.designVersions.find((item)=>item.effectiveRevision),s8=after.s8Revisions.find((item)=>item.effectiveRevision),newS9=after.s9Candidates.find((item)=>item.design_version_id===effective.id);
    const v1Payload=JSON.parse(after.designVersions.find((item)=>item.version_number===1).payload_json),v2Payload=JSON.parse(oldV2.payload_json),effectivePayload=JSON.parse(effective.payload_json),s8Payload=JSON.parse(s8.payload_json),s9Payload=JSON.parse(newS9.payload_json);
    assert.deepEqual(new Set(s8Payload.consumedCriticalMomentIds),new Set(after.criticalMoments.map((item)=>item.id)));
    assert.equal(s8Payload.action,'revise');assert.equal(s8Payload.changedFields.length,2);
    assert.deepEqual(new Set(s8Payload.changedFields.map((item)=>item.stage)),new Set(['S5','S7']));
    for(const change of s8Payload.changedFields){assert.ok(change.before);assert.ok(change.after);assert.ok(change.reason);assert.ok(change.criticalMomentId);assert.notDeepEqual(change.before,change.after);}
    assert.notDeepEqual(effectivePayload,v1Payload);assert.notDeepEqual(effectivePayload,v2Payload);assert.notEqual(effective.payloadHash,after.designVersions.find((item)=>item.version_number===1).payloadHash);
    assert.match(JSON.stringify(effectivePayload.stages.S5),/矩阵制双重领导冲突诊断/);assert.match(JSON.stringify(effectivePayload.stages.S5),/角色—权责—命令来源对照表/);
    assert.match(JSON.stringify(effectivePayload.stages.S7),/授权—分权辨析评价任务与评价标准补充/);assert.match(JSON.stringify(effectivePayload.stages.S7),/最终责任/);
    assert.equal(newS9.status,'candidate');assert.equal(s9Payload.sourceDesignVersionId,effective.id);assert.equal(s9Payload.supersedesCandidateId,oldS9.id);
    assert.equal(after.designVersions.some((item)=>item.id===oldV2.id),true);assert.equal(after.s9Candidates.some((item)=>item.id===oldS9.id),true);
  }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
