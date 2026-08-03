// Model provider 契约:所有 provider(mock / existing-mlx / 未来的 deepseek-cloud)统一实现:
//   name: string
//   capabilities(): ProviderCapabilities
//   healthCheck(): Promise<{ready: boolean, ...}>
//   generate(request: ModelRequest): Promise<ModelResponse>
// 结构约定与校验集中在本文件;校验失败抛 PROVIDER_CONTRACT_VIOLATION,绝不静默。
import { createHash } from 'node:crypto';
import { failCode } from '../product-core/errors.mjs';
import { canonicalJson } from '../product-core/audit.mjs';

// ModelRequest:
//   model: string(必填)           messages: [{role, content}](必填,非空)
//   temperature/maxTokens: 可选数值
//   thinkingMode/reasoningEffort: 可选透传字段(契约不规定开关策略,由 provider 决定支持与否)
//   metadata: 可选对象(调用方上下文)
// ModelResponse:
//   text: string(必填)           inputHash/outputHash: 'sha256:<hex>'(必填,供 model_runs 留痕)
//   latencyMs: number|null        tokenUsage: {promptTokens, completionTokens, totalTokens}|null
//   providerMetadata: 可选对象(provider 私有回执)

export function sha256Prefixed(text) {
  return `sha256:${createHash('sha256').update(text).digest('hex')}`;
}

export function hashRequest(request) {
  return sha256Prefixed(canonicalJson(request));
}

export function validateModelRequest(request) {
  const problems = [];
  if (request === null || typeof request !== 'object' || Array.isArray(request)) {
    problems.push('request 必须是对象');
  } else {
    if (typeof request.model !== 'string' || request.model.length === 0) problems.push('model 必须是非空字符串');
    if (!Array.isArray(request.messages) || request.messages.length === 0) {
      problems.push('messages 必须是非空数组');
    } else {
      request.messages.forEach((m, i) => {
        if (typeof m?.role !== 'string' || typeof m?.content !== 'string') {
          problems.push(`messages[${i}] 必须含字符串 role 与 content`);
        }
      });
    }
    if (request.temperature != null && typeof request.temperature !== 'number') problems.push('temperature 必须是数值');
    if (request.maxTokens != null && !Number.isInteger(request.maxTokens)) problems.push('maxTokens 必须是整数');
    if (request.thinkingMode != null && !['on', 'off', 'auto'].includes(request.thinkingMode)) {
      problems.push('thinkingMode 必须是 on/off/auto');
    }
    if (request.reasoningEffort != null && !['low', 'medium', 'high'].includes(request.reasoningEffort)) {
      problems.push('reasoningEffort 必须是 low/medium/high');
    }
  }
  if (problems.length > 0) {
    failCode('PROVIDER_CONTRACT_VIOLATION', `ModelRequest 不合法: ${problems.join('; ')}`, { problems });
  }
  return true;
}

export function validateModelResponse(response) {
  const problems = [];
  if (response === null || typeof response !== 'object' || Array.isArray(response)) {
    problems.push('response 必须是对象');
  } else {
    if (typeof response.text !== 'string') problems.push('text 必须是字符串');
    if (typeof response.inputHash !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(response.inputHash)) {
      problems.push('inputHash 必须是 sha256:<hex>');
    }
    if (typeof response.outputHash !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(response.outputHash)) {
      problems.push('outputHash 必须是 sha256:<hex>');
    }
    if (response.latencyMs != null && typeof response.latencyMs !== 'number') problems.push('latencyMs 必须是数值或 null');
  }
  if (problems.length > 0) {
    failCode('PROVIDER_CONTRACT_VIOLATION', `ModelResponse 不合法: ${problems.join('; ')}`, { problems });
  }
  return true;
}
