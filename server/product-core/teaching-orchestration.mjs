import { createHash } from 'node:crypto';
import { appendAuditEvent } from './audit.mjs';
import { canonicalJson } from './audit.mjs';
import { failCode } from './errors.mjs';
import { newId, nowIso } from './ids.mjs';
import { runDeterministicSimulation } from '../../shared/virtual-classroom/engine.mjs';

export const TEACHING_WORKFLOW_VERSION = '1.0.0';
export const STATES = Object.freeze(['INITIALIZED','S1_CONTEXT_READY','EVIDENCE_PACKAGE_READY','S2_CANDIDATE_READY','S3_CANDIDATE_READY','S4_CANDIDATE_READY','S5_CANDIDATE_READY','S6_CANDIDATE_READY','S7_CANDIDATE_READY','TEACHER_REVIEW_PENDING','TEACHER_REVIEW_IN_PROGRESS','TEACHER_REVIEW_COMPLETED','APPROVED_FOR_SIMULATION','SIMULATION_QUEUED','SIMULATION_RUNNING','SIMULATION_COMPLETED','S8_REVISION_READY','TEACHING_DESIGN_V2_READY','S9_ASSET_CANDIDATE_CREATED','COMPLETED','BLOCKED','FAILED']);
const NEXT = Object.freeze({ initialize:'INITIALIZED', saveS1Context:'S1_CONTEXT_READY', attachEvidencePackage:'EVIDENCE_PACKAGE_READY', saveS2:'S2_CANDIDATE_READY', saveS3:'S3_CANDIDATE_READY', saveS4:'S4_CANDIDATE_READY', saveS5:'S5_CANDIDATE_READY', saveS6:'S6_CANDIDATE_READY', saveS7:'S7_CANDIDATE_READY', beginTeacherReview:'TEACHER_REVIEW_PENDING', recordTeacherDecision:'TEACHER_REVIEW_IN_PROGRESS', completeTeacherReview:'TEACHER_REVIEW_COMPLETED', approveForSimulation:'APPROVED_FOR_SIMULATION', queueSimulation:'SIMULATION_QUEUED', runSimulation:'SIMULATION_COMPLETED', createS8Revision:'S8_REVISION_READY', createDesignV2:'TEACHING_DESIGN_V2_READY', createS9Candidate:'S9_ASSET_CANDIDATE_CREATED', complete:'COMPLETED', block:'BLOCKED', fail:'FAILED' });
const FROM = Object.freeze({saveS1Context:['INITIALIZED'],attachEvidencePackage:['S1_CONTEXT_READY'],saveS2:['EVIDENCE_PACKAGE_READY'],saveS3:['S2_CANDIDATE_READY'],saveS4:['S3_CANDIDATE_READY'],saveS5:['S4_CANDIDATE_READY'],saveS6:['S5_CANDIDATE_READY'],saveS7:['S6_CANDIDATE_READY'],beginTeacherReview:['S7_CANDIDATE_READY'],recordTeacherDecision:['TEACHER_REVIEW_PENDING','TEACHER_REVIEW_IN_PROGRESS'],completeTeacherReview:['TEACHER_REVIEW_IN_PROGRESS'],approveForSimulation:['TEACHER_REVIEW_COMPLETED'],queueSimulation:['APPROVED_FOR_SIMULATION'],runSimulation:['SIMULATION_QUEUED'],createS8Revision:['SIMULATION_COMPLETED'],createDesignV2:['S8_REVISION_READY'],createS9Candidate:['TEACHING_DESIGN_V2_READY'],complete:['S9_ASSET_CANDIDATE_CREATED'],block:STATES.filter((x)=>!['COMPLETED','BLOCKED','FAILED'].includes(x)),fail:STATES.filter((x)=>!['COMPLETED','BLOCKED','FAILED'].includes(x))});
function stateOf(db,id){ const row=db.prepare('SELECT * FROM teaching_workflows WHERE id=?').get(id); if(!row) failCode('WF_INSTANCE_NOT_FOUND','教学编排工作流不存在',{workflowInstanceId:id}); return row; }
function audit(db,w,event,actor,payload={}){ appendAuditEvent(db,{eventType:event,actorType:actor.actorType??'system',actorId:actor.actorId,entityType:'teaching_workflow',entityId:w.id,workflowInstanceId:w.id,payload}); }
function transition(db,id,action,actor,{idempotencyKey,reason=null,checkpoint=null,guard=null}={}){ if(!idempotencyKey) failCode('GATE_VALIDATION_FAILED','缺少 idempotencyKey'); const w=stateOf(db,id); const prior=db.prepare('SELECT * FROM teaching_workflow_events WHERE workflow_id=? AND idempotency_key=?').get(id,idempotencyKey); if(prior) return stateOf(db,id); const target=NEXT[action]; if(!target || !FROM[action]?.includes(w.current_state)) failCode('WF_ILLEGAL_TRANSITION','非法教学编排状态转换',{from:w.current_state,action}); if(guard){const r=guard(w);if(r) failCode('GATE_VALIDATION_FAILED',r,{workflowInstanceId:id,action});} const now=nowIso(); db.exec('BEGIN IMMEDIATE'); try { db.prepare('UPDATE teaching_workflows SET current_state=?,state_version=state_version+1,updated_at=?,blocked_reason=?,last_checkpoint_json=? WHERE id=? AND state_version=?').run(target,now,target==='BLOCKED'?reason:null,checkpoint?canonicalJson(checkpoint):null,id,w.state_version); db.prepare('INSERT INTO teaching_workflow_events(id,workflow_id,previous_state,next_state,action,reason,actor_id,actor_type,idempotency_key,checkpoint_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(newId('twe'),id,w.current_state,target,action,reason,actor.actorId,actor.actorType??'system',idempotencyKey,checkpoint?canonicalJson(checkpoint):null,now); audit(db,w,'teaching.workflow.transitioned',actor,{action,reason,target}); db.exec('COMMIT'); return stateOf(db,id); } catch(e){db.exec('ROLLBACK');throw e;} }
export function createTeachingWorkflow(db,{courseId,classId,lessonId,chapterId,lessonHours,actorContext,parentWorkflowInstanceId=null,previousStatus=null,resumeReason=null}={}){ const id=newId('twf'), now=nowIso(); db.prepare('INSERT INTO teaching_workflows VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,courseId,classId,lessonId,chapterId,lessonHours,'INITIALIZED',1,TEACHING_WORKFLOW_VERSION,parentWorkflowInstanceId,previousStatus,resumeReason,null,null,actorContext.actorId,now,now); const w=stateOf(db,id); audit(db,w,'teaching.workflow.created',actorContext,{chapterId,lessonHours,parentWorkflowInstanceId,previousStatus,resumeReason}); return w; }
export function saveS1Context(db,id,payload,actor,opts){ if(payload?.fixture !==true) failCode('GATE_VALIDATION_FAILED','P2A 仅接受 fixture S1 context'); db.prepare('INSERT INTO teaching_s1_contexts VALUES (?,?,?,?,?)').run(newId('sctx'),id,1,canonicalJson(payload),nowIso()); return transition(db,id,'saveS1Context',actor,opts); }
export function attachEvidencePackage(db,id,payload,actor,opts){ const fixture=payload?.fixture===true; if(!fixture&&(!payload?.corpusVersionHash||!Array.isArray(payload?.retrievalRunIds)||!Array.isArray(payload?.evidenceLinkIds)||payload.evidenceLinkIds.length===0)) failCode('GATE_VALIDATION_FAILED','真实 evidence package 必须含冻结语料版本、retrieval runs 与 evidence links'); db.prepare('INSERT INTO teaching_evidence_packages VALUES (?,?,?,?,?,?,?)').run(newId('tep'),id,payload.corpusVersionHash??'fixture-corpus',canonicalJson(payload.retrievalRunIds??[]),canonicalJson(payload.evidenceLinkIds??[]),fixture?1:0,nowIso()); return transition(db,id,'attachEvidencePackage',actor,opts); }
const stages=['S2','S3','S4','S5','S6','S7'];
export function saveCandidateStage(db,id,stage,payload,actor,opts){ const isFixture=payload?.generationMode==='deterministic_fixture', isModel=payload?.generationMode==='local_model'; if(!stages.includes(stage)||(!isFixture&&!isModel)) failCode('GATE_VALIDATION_FAILED','candidate 必须显式标记 deterministic_fixture 或 local_model'); const prior=stateOf(db,id); const expected=stage==='S2'?'EVIDENCE_PACKAGE_READY':`${stages[stages.indexOf(stage)-1]}_CANDIDATE_READY`; if(prior.current_state!==expected) failCode('WF_ILLEGAL_TRANSITION','candidate 环节顺序非法',{from:prior.current_state,stage}); let candidate=db.prepare('SELECT * FROM teaching_design_candidates WHERE workflow_id=? ORDER BY created_at DESC LIMIT 1').get(id); if(!candidate){candidate={id:newId('tdc')}; const generationMode=isModel?'model_generated':'deterministic_fixture'; db.prepare('INSERT INTO teaching_design_candidates VALUES (?,?,?,?,?,?)').run(candidate.id,id,'1.0.0',generationMode,canonicalJson({schemaVersion:'1.0.0',workflowInstanceId:id,generationMode:payload.generationMode,stages:{[stage]:payload}}),nowIso());} else { const body=JSON.parse(candidate.payload_json); if(body.generationMode!==payload.generationMode) failCode('GATE_VALIDATION_FAILED','同一 candidate 不得混用 fixture 与模型生成'); body.stages[stage]=payload; db.prepare('UPDATE teaching_design_candidates SET payload_json=? WHERE id=?').run(canonicalJson(body),candidate.id); } return transition(db,id,`save${stage}`,actor,opts); }
export function beginReview(db,id,actor,opts){ return transition(db,id,'beginTeacherReview',actor,{...opts,guard:(w)=>w.current_state==='S7_CANDIDATE_READY'?null:'S2-S7 未齐全'}); }
export function recordDecision(db,id,{candidateId,fieldPath,decision,originalContent,revisedContent=null,reason,evidenceLinkIds=[],decisionSource='deterministic_fixture'},actor,opts){ if(!['ACCEPTED','MODIFIED','REJECTED','PENDING_EVIDENCE'].includes(decision)||(decision==='MODIFIED'&&revisedContent==null)) failCode('TEACHER_DECISION_INVALID','教师裁决无效'); db.prepare('INSERT INTO teaching_design_teacher_decisions VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(newId('tdd'),id,candidateId,fieldPath,decision,decisionSource,canonicalJson(originalContent),revisedContent==null?null:canonicalJson(revisedContent),reason,canonicalJson(evidenceLinkIds),actor.actorId,nowIso()); return transition(db,id,'recordTeacherDecision',actor,opts); }
export function completeReview(db,id,actor,opts){ const candidate=db.prepare('SELECT generation_mode FROM teaching_design_candidates WHERE workflow_id=? ORDER BY created_at DESC LIMIT 1').get(id); const rows=db.prepare('SELECT field_path,decision FROM teaching_design_teacher_decisions WHERE workflow_id=?').all(id); if(candidate?.generation_mode==='deterministic_fixture'){ if(rows.length<4) failCode('GATE_VALIDATION_FAILED','fixture 教师裁决不足'); return transition(db,id,'completeTeacherReview',actor,opts); } const effective=new Set(rows.filter((row)=>['ACCEPTED','MODIFIED','PENDING_EVIDENCE'].includes(row.decision)).map((row)=>row.field_path.split('/').filter(Boolean)[1])); const missing=stages.filter((stage)=>!effective.has(stage)); if(missing.length) failCode('GATE_VALIDATION_FAILED','每个 S2-S7 环节至少需要一项有效教师裁决',{missingStages:missing}); return transition(db,id,'completeTeacherReview',actor,opts); }
function approvedCandidatePayload(db,id,candidate){ const body=JSON.parse(candidate.payload_json); const decisions=db.prepare('SELECT * FROM teaching_design_teacher_decisions WHERE workflow_id=? ORDER BY decided_at,rowid').all(id); const approved={...body,stages:{},teacherDecisionIds:decisions.map((row)=>row.id)}; for(const stage of stages){ const decision=decisions.filter((row)=>row.field_path===`/stages/${stage}`).at(-1); if(!decision||decision.decision==='REJECTED') continue; const original=body.stages[stage]; const content=decision.decision==='MODIFIED'?JSON.parse(decision.revised_content_json):original; approved.stages[stage]={...content,teacherDecision:{id:decision.id,decision:decision.decision,reason:decision.reason,evidenceLinkIds:JSON.parse(decision.evidence_link_ids_json)}}; } return approved; }
export function approveDesignV1(db,id,actor,opts){ const candidate=db.prepare('SELECT * FROM teaching_design_candidates WHERE workflow_id=? ORDER BY created_at DESC LIMIT 1').get(id); if(!candidate) failCode('GATE_VALIDATION_FAILED','没有候选'); const payload=candidate.generation_mode==='deterministic_fixture'?JSON.parse(candidate.payload_json):approvedCandidatePayload(db,id,candidate); if(candidate.generation_mode!=='deterministic_fixture'&&Object.keys(payload.stages).length!==stages.length) failCode('GATE_VALIDATION_FAILED','教师批准版缺少 S2-S7 有效内容'); const v=newId('tdv'); db.prepare('INSERT INTO teaching_design_versions VALUES (?,?,?,?,?,?,?,?,?)').run(v,id,candidate.id,1,'approved',null,canonicalJson(payload),candidate.generation_mode==='deterministic_fixture'?'teacher-review fixture approval':'teacher-approved CH06 teaching design v1',nowIso()); transition(db,id,'approveForSimulation',actor,opts); return {workflow:stateOf(db,id),versionId:v}; }
export function runSimulation(db,id,input,actor,opts){ const version=db.prepare("SELECT * FROM teaching_design_versions WHERE workflow_id=? AND version_number=1 AND status='approved'").get(id); if(!version) failCode('GATE_VALIDATION_FAILED','未批准的设计不能仿真'); transition(db,id,'queueSimulation',actor,{...opts,idempotencyKey:`${opts.idempotencyKey}:queue`}); const result=runDeterministicSimulation(input); const runId=newId('sim'),now=nowIso(); db.prepare('INSERT INTO simulation_runs VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(runId,id,version.id,input.seed,input.simulationMode??'deterministic_fixture','completed',canonicalJson(input),canonicalJson(result.metrics),canonicalJson(result.warnings),now,now); for(const e of result.events) db.prepare('INSERT INTO simulation_events VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(e.eventId,runId,e.lessonOffset,e.studentId,e.groupId,e.eventType,e.relatedStage,e.relatedFieldPath,e.observedSignal,canonicalJson(e.evidence),e.severity); for(const m of result.criticalMoments){const ev=result.events.find(e=>e.eventId===m.eventId);db.prepare('INSERT INTO critical_moments VALUES (?,?,?,?,?,?,?)').run(newId('km'),runId,ev.eventId,m.momentType,m.relatedStage,m.reason,now);} transition(db,id,'runSimulation',actor,{...opts,idempotencyKey:`${opts.idempotencyKey}:complete`}); return {workflow:stateOf(db,id),runId,result}; }
export function createS8AndV2AndS9(db,id,actor,opts){ const moment=db.prepare('SELECT * FROM critical_moments WHERE simulation_run_id IN (SELECT id FROM simulation_runs WHERE workflow_id=?) LIMIT 1').get(id);if(!moment)failCode('GATE_VALIDATION_FAILED','S8 需要 critical moment evidence');const provenance=opts.provenance??'deterministic_fixture', v1=db.prepare('SELECT * FROM teaching_design_versions WHERE workflow_id=? AND version_number=1').get(id), s8=newId('srev');db.prepare('INSERT INTO s8_revisions VALUES (?,?,?,?,?,?)').run(s8,id,moment.id,v1.id,canonicalJson({generationMode:provenance,criticalMomentId:moment.id,actions:[{kind:'investigate',relatedStage:moment.related_stage,reason:'由虚拟试教关键时刻触发'}]}),nowIso());transition(db,id,'createS8Revision',actor,{...opts,idempotencyKey:`${opts.idempotencyKey}:s8`});const v2=newId('tdv');db.prepare('INSERT INTO teaching_design_versions VALUES (?,?,?,?,?,?,?,?,?)').run(v2,id,v1.candidate_id,2,'approved',v1.id,v1.payload_json,`S8 ${provenance} revision from critical moment ${moment.id}`,nowIso());transition(db,id,'createDesignV2',actor,{...opts,idempotencyKey:`${opts.idempotencyKey}:v2`});db.prepare('INSERT INTO s9_asset_candidates VALUES (?,?,?,?,?,?)').run(newId('sac'),id,v2,'candidate',canonicalJson({generationMode:provenance,sourceVersionId:v2,criticalMomentId:moment.id,verificationStatus:'candidate_only'}),nowIso());transition(db,id,'createS9Candidate',actor,{...opts,idempotencyKey:`${opts.idempotencyKey}:s9`});return stateOf(db,id); }
export function completeTeachingWorkflow(db,id,actor,opts){ return transition(db,id,'complete',actor,opts); }

function jsonValue(raw, fallback = null) {
  try { return JSON.parse(raw); } catch { return fallback; }
}
function payloadHash(value) {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}
function sameJson(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}
function sameIdSet(left, right) {
  return left.length === right.length && [...new Set(left)].sort().join('\n') === [...new Set(right)].sort().join('\n');
}
function revisionTarget(payload, fieldPath) {
  const match = fieldPath.match(/^\/stages\/(S5|S7)\/(items|designRecommendations)$/);
  if (!match) failCode('GATE_VALIDATION_FAILED','P2B.1 只允许修订 S5/S7 的 items 或 designRecommendations',{fieldPath});
  const [, stage, field] = match;
  if (!payload?.stages?.[stage]) failCode('GATE_VALIDATION_FAILED','修订目标环节不存在',{fieldPath});
  if (!Array.isArray(payload.stages[stage][field])) payload.stages[stage][field] = [];
  return { stage, field, value: payload.stages[stage][field] };
}
function applyChangedFields(basePayload, changedFields) {
  const revised = jsonValue(canonicalJson(basePayload));
  for (const change of changedFields) {
    if (!change?.stage || !change?.fieldPath || !change?.reason || !change?.criticalMomentId || change.before === undefined || change.after === undefined) {
      failCode('GATE_VALIDATION_FAILED','changedField 缺少 stage/fieldPath/before/after/reason/criticalMomentId');
    }
    if (sameJson(change.before, change.after)) failCode('GATE_VALIDATION_FAILED','changedField 的 before 与 after 不得相同',{fieldPath:change.fieldPath});
    const target = revisionTarget(revised, change.fieldPath);
    if (target.stage !== change.stage) failCode('GATE_VALIDATION_FAILED','changedField stage 与 fieldPath 不一致',{stage:change.stage,fieldPath:change.fieldPath});
    if (!sameJson(target.value, change.before)) failCode('GATE_VALIDATION_FAILED','changedField.before 与 v1 基线不一致',{fieldPath:change.fieldPath});
    revised.stages[target.stage][target.field] = change.after;
  }
  return revised;
}

/**
 * 将一次确定性仿真的全部关键时刻应用到已批准 v1。支持两种调用：
 * - 正常 P2B 在 SIMULATION_COMPLETED 状态生成有效 v2；
 * - P2B.1 对已经 COMPLETED 的历史 no-op 链追加有效 v3，不改写旧记录。
 */
export function createEffectiveRevision(db,id,{
  sourceDesignVersionId,sourceSimulationRunId,consumedCriticalMomentIds,changedFields,
  revisionLabel='simulation-informed revision',supersedesCandidateId=null,provenance='deterministic_simulation',
}={},actor,opts={}) {
  const workflow=stateOf(db,id);
  if(!['SIMULATION_COMPLETED','COMPLETED'].includes(workflow.current_state)) failCode('WF_ILLEGAL_TRANSITION','有效修订只能在仿真完成后创建',{from:workflow.current_state});
  const priorEffective=db.prepare('SELECT * FROM s8_revisions WHERE workflow_id=? ORDER BY rowid').all(id).find((row)=>jsonValue(row.payload_json,{})?.effectiveRevision===true);
  if(priorEffective){
    const meta=jsonValue(priorEffective.payload_json,{}),version=db.prepare('SELECT * FROM teaching_design_versions WHERE id=?').get(meta.revisedDesignVersionId),candidate=db.prepare('SELECT * FROM s9_asset_candidates WHERE design_version_id=?').get(meta.revisedDesignVersionId);
    return {workflow:stateOf(db,id),s8RevisionId:priorEffective.id,revisedDesignVersionId:version?.id??null,s9AssetCandidateId:candidate?.id??null,payloadHash:meta.payloadHash??null,idempotent:true};
  }
  const v1=db.prepare('SELECT * FROM teaching_design_versions WHERE id=? AND workflow_id=?').get(sourceDesignVersionId,id);
  if(!v1||v1.version_number!==1) failCode('GATE_VALIDATION_FAILED','有效修订必须以本 workflow 的 v1 为基线',{sourceDesignVersionId});
  const simulation=db.prepare('SELECT * FROM simulation_runs WHERE id=? AND workflow_id=?').get(sourceSimulationRunId,id);
  if(!simulation||simulation.design_version_id!==v1.id||simulation.status!=='completed') failCode('GATE_VALIDATION_FAILED','sourceSimulationRun 必须是基于 v1 的已完成仿真',{sourceSimulationRunId});
  const moments=db.prepare(`SELECT cm.*,se.related_field_path,se.observed_signal
    FROM critical_moments cm JOIN simulation_events se ON se.id=cm.event_id
    WHERE cm.simulation_run_id=? ORDER BY cm.created_at,cm.rowid`).all(sourceSimulationRunId);
  const allMomentIds=moments.map((row)=>row.id);
  if(!sameIdSet(consumedCriticalMomentIds??[],allMomentIds)) failCode('GATE_VALIDATION_FAILED','有效修订必须恰好消费该仿真的全部关键时刻',{consumedCriticalMomentIds,allMomentIds});
  if(!Array.isArray(changedFields)||changedFields.length<2) failCode('GATE_VALIDATION_FAILED','有效修订至少需要两个 changedFields');
  const consumed=new Set(allMomentIds);
  for(const change of changedFields){
    const moment=moments.find((row)=>row.id===change.criticalMomentId);
    if(!consumed.has(change.criticalMomentId)||moment?.related_stage!==change.stage) failCode('GATE_VALIDATION_FAILED','changedField 必须映射到同阶段的关键时刻',{stage:change.stage,criticalMomentId:change.criticalMomentId});
  }
  const basePayload=jsonValue(v1.payload_json);
  const revisedContent=applyChangedFields(basePayload,changedFields);
  if(sameJson(basePayload,revisedContent)) failCode('GATE_VALIDATION_FAILED','有效修订不得复制 v1 payload');
  const createdAt=nowIso(),contentHash=payloadHash(revisedContent),s8Id=newId('srev'),versionId=newId('tdv'),s9Id=newId('sac');
  const versionNumber=db.prepare('SELECT COALESCE(MAX(version_number),0)+1 AS n FROM teaching_design_versions WHERE workflow_id=?').get(id).n;
  const revisionMetadata={effectiveRevision:true,revisionLabel,parentDesignVersionId:v1.id,sourceSimulationRunId,sourceS8RevisionId:s8Id,consumedCriticalMomentIds,changedFields,payloadHash:contentHash,createdAt};
  const revisedPayload={...revisedContent,revisionMetadata};
  const s8Payload={action:'revise',effectiveRevision:true,revisionLabel,parentDesignVersionId:v1.id,sourceSimulationRunId,revisedDesignVersionId:versionId,consumedCriticalMomentIds,changedFields,payloadHash:contentHash,createdAt,generationMode:provenance};
  const s9Payload={effectiveRevision:true,revisionLabel,sourceDesignVersionId:versionId,sourceS8RevisionId:s8Id,sourceSimulationRunId,supersedesCandidateId,consumedCriticalMomentIds,payloadHash:contentHash,verificationStatus:'candidate_only',generationMode:provenance,createdAt};
  const insertRows=()=>{
    db.prepare('INSERT INTO s8_revisions VALUES (?,?,?,?,?,?)').run(s8Id,id,allMomentIds[0],v1.id,canonicalJson(s8Payload),createdAt);
    db.prepare('INSERT INTO teaching_design_versions VALUES (?,?,?,?,?,?,?,?,?)').run(versionId,id,v1.candidate_id,versionNumber,'approved',v1.id,canonicalJson(revisedPayload),`${revisionLabel}; S8 ${s8Id}; simulation ${sourceSimulationRunId}`,createdAt);
    db.prepare('INSERT INTO s9_asset_candidates VALUES (?,?,?,?,?,?)').run(s9Id,id,versionId,'candidate',canonicalJson(s9Payload),createdAt);
  };
  if(workflow.current_state==='COMPLETED'){
    db.exec('BEGIN IMMEDIATE');
    try{
      insertRows();
      audit(db,workflow,'teaching.s8.effective_revision.created',actor,{s8RevisionId:s8Id,sourceSimulationRunId,consumedCriticalMomentIds,changedFields,payloadHash:contentHash});
      audit(db,workflow,'teaching.design.effective_version.created',actor,{versionId,versionNumber,parentDesignVersionId:v1.id,s8RevisionId:s8Id,payloadHash:contentHash});
      audit(db,workflow,'teaching.s9.candidate.created',actor,{s9AssetCandidateId:s9Id,sourceDesignVersionId:versionId,supersedesCandidateId});
      db.exec('COMMIT');
    }catch(error){db.exec('ROLLBACK');throw error;}
  }else{
    insertRows();
    transition(db,id,'createS8Revision',actor,{...opts,idempotencyKey:`${opts.idempotencyKey}:s8`});
    transition(db,id,'createDesignV2',actor,{...opts,idempotencyKey:`${opts.idempotencyKey}:version`});
    transition(db,id,'createS9Candidate',actor,{...opts,idempotencyKey:`${opts.idempotencyKey}:s9`});
  }
  return {workflow:stateOf(db,id),s8RevisionId:s8Id,revisedDesignVersionId:versionId,s9AssetCandidateId:s9Id,payloadHash:contentHash,versionNumber,idempotent:false};
}

export function teachingWorkflowDetail(db,id){
  const workflow=stateOf(db,id),one=(table)=>db.prepare(`SELECT * FROM ${table} WHERE workflow_id=? ORDER BY rowid`).all(id);
  const rawVersions=one('teaching_design_versions');
  const versions=rawVersions.map((row)=>{
    const payload=jsonValue(row.payload_json,{}),parent=rawVersions.find((item)=>item.id===row.parent_version_id),meta=payload.revisionMetadata??{};
    const noOp=Boolean(parent)&&sameJson(jsonValue(parent.payload_json),payload);
    return {...row,payloadHash:meta.payloadHash??payloadHash(payload),effectiveRevision:meta.effectiveRevision===true,revisionLabel:meta.revisionLabel??null,revisionOutcome:noOp?'NO_OP':meta.effectiveRevision===true?'EFFECTIVE':row.version_number===1?'BASELINE':'CHANGED'};
  });
  const runs=one('simulation_runs'),runIds=runs.map((row)=>row.id),byRun=(table)=>runIds.flatMap((runId)=>db.prepare(`SELECT * FROM ${table} WHERE simulation_run_id=? ORDER BY rowid`).all(runId));
  const s8=one('s8_revisions').map((row)=>{const meta=jsonValue(row.payload_json,{});return {...row,action:meta.action??meta.actions?.[0]?.kind??null,effectiveRevision:meta.effectiveRevision===true,consumedCriticalMomentIds:meta.consumedCriticalMomentIds??(meta.criticalMomentId?[meta.criticalMomentId]:[]),changedFields:meta.changedFields??[]};});
  const s9=one('s9_asset_candidates').map((row)=>{const meta=jsonValue(row.payload_json,{});return {...row,sourceDesignVersionId:meta.sourceDesignVersionId??meta.sourceVersionId??row.design_version_id,supersedesCandidateId:meta.supersedesCandidateId??null,effectiveRevision:meta.effectiveRevision===true};});
  return {workflow,transitions:one('teaching_workflow_events'),s1Context:one('teaching_s1_contexts')[0]??null,evidencePackage:one('teaching_evidence_packages')[0]??null,candidates:one('teaching_design_candidates'),generationRuns:one('teaching_model_generation_runs'),teacherDecisions:one('teaching_design_teacher_decisions'),designVersions:versions,simulationRuns:runs,simulationEvents:byRun('simulation_events'),criticalMoments:byRun('critical_moments'),s8Revisions:s8,s9Candidates:s9};
}
