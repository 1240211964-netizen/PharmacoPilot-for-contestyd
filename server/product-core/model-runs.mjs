// ModelRun 领域记录:一次模型/规则运行的完整上下文,只插不改(触发器强制,B4)。
// 入库前过 model-run schema 校验;审计 model_run.recorded。
import { appendAuditEvent } from './audit.mjs';
import { newId, nowIso } from './ids.mjs';
import { getWriteSchemaVersion, validateAgainstSchema } from './schemas.mjs';

// run 字段与 schemas/v1/model-run.schema.json 对齐(camelCase);
// actorContext 仅用于审计,不入 model_runs 表。
export async function recordModelRun(db, run) {
  const payload = {
    modelRunId: run.modelRunId ?? newId('mrn'),
    schemaVersion: await getWriteSchemaVersion('model-run'),
    workflowId: run.workflowId,
    agentId: run.agentId,
    provider: run.provider,
    model: run.model,
    thinkingMode: run.thinkingMode ?? null,
    reasoningEffort: run.reasoningEffort ?? null,
    promptVersion: run.promptVersion,
    inputRecordIds: run.inputRecordIds ?? [],
    evidenceIds: run.evidenceIds ?? [],
    inputHash: run.inputHash,
    outputHash: run.outputHash ?? null,
    rawOutputLocation: run.rawOutputLocation ?? null,
    structuredOutput: run.structuredOutput ?? null,
    latencyMs: run.latencyMs ?? null,
    tokenUsage: run.tokenUsage ?? null,
    validationStatus: run.validationStatus ?? 'PENDING',
    fallbackUsed: run.fallbackUsed ?? false,
    startedAt: run.startedAt ?? nowIso(),
    completedAt: run.completedAt ?? null,
  };
  await validateAgainstSchema('model-run', payload);
  db.prepare(
    `INSERT INTO model_runs(
       id, workflow_id, agent_id, provider, model, thinking_mode, reasoning_effort,
       prompt_version, input_record_ids_json, evidence_ids_json, input_hash, output_hash,
       raw_output_location, structured_output_json, latency_ms, token_usage_json,
       validation_status, fallback_used, started_at, completed_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    payload.modelRunId,
    payload.workflowId,
    payload.agentId,
    payload.provider,
    payload.model,
    payload.thinkingMode,
    payload.reasoningEffort,
    payload.promptVersion,
    JSON.stringify(payload.inputRecordIds),
    JSON.stringify(payload.evidenceIds),
    payload.inputHash,
    payload.outputHash,
    payload.rawOutputLocation,
    payload.structuredOutput === null ? null : JSON.stringify(payload.structuredOutput),
    payload.latencyMs,
    payload.tokenUsage === null ? null : JSON.stringify(payload.tokenUsage),
    payload.validationStatus,
    payload.fallbackUsed ? 1 : 0,
    payload.startedAt,
    payload.completedAt,
  );
  appendAuditEvent(db, {
    eventType: 'model_run.recorded',
    actorType: run.actorContext?.actorType,
    actorId: run.actorContext?.actorId,
    entityType: 'model_run',
    entityId: payload.modelRunId,
    workflowInstanceId: payload.workflowId,
    payload: { modelRunId: payload.modelRunId, provider: payload.provider, model: payload.model },
  });
  return payload;
}
