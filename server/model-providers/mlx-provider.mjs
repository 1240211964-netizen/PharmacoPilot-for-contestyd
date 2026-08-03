// existing-mlx provider:对既有 ModelClient(server/model-client.mjs)的薄包装,只 import 不修改。
// 注意:ModelClient.chat 的请求体是冻结的,thinkingMode/reasoningEffort 无法透传到上游请求,
// 本 provider 将它们作为可选透传字段保留在 providerMetadata 中(供 model_runs 留痕),
// 真正透传需待 model-client 契约演进(见重构报告)。
import { ModelClient } from '../model-client.mjs';
import { hashRequest, sha256Prefixed, validateModelRequest, validateModelResponse } from './provider-contract.mjs';

export class MlxProvider {
  // config 需含 modelBaseUrl/modelName/modelApiKey/modelTimeoutMs/modelStatusTimeoutMs(即 loadConfig() 的形状)。
  constructor(config) {
    this.name = 'existing-mlx';
    this.client = new ModelClient(config);
    this.modelName = config.modelName;
  }

  capabilities() {
    return {
      name: 'existing-mlx',
      mock: false,
      deterministic: false,
      streaming: true,
      // 透传字段仅记录留痕,不进入上游请求体(见文件头注释)。
      thinkingMode: 'record-only',
      reasoningEffort: 'record-only',
    };
  }

  async healthCheck() {
    return this.client.status();
  }

  async generate(request) {
    validateModelRequest(request);
    const started = performance.now();
    const response = await this.client.chat({
      messages: request.messages,
      stream: false,
      temperature: request.temperature,
      maxTokens: request.maxTokens,
      signal: request.signal,
    });
    const payload = await response.json();
    const text = payload?.choices?.[0]?.message?.content ?? '';
    const result = {
      text,
      inputHash: hashRequest({
        model: request.model,
        messages: request.messages,
        temperature: request.temperature ?? null,
        maxTokens: request.maxTokens ?? null,
      }),
      outputHash: sha256Prefixed(text),
      latencyMs: Math.round(performance.now() - started),
      tokenUsage: payload?.usage
        ? {
            promptTokens: payload.usage.prompt_tokens ?? 0,
            completionTokens: payload.usage.completion_tokens ?? 0,
            totalTokens: payload.usage.total_tokens ?? 0,
          }
        : null,
      providerMetadata: {
        model: payload?.model ?? request.model,
        thinkingMode: request.thinkingMode ?? null,
        reasoningEffort: request.reasoningEffort ?? null,
      },
    };
    validateModelResponse(result);
    return result;
  }
}
