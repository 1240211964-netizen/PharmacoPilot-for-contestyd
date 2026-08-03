// Mock provider:确定性输出——同一 ModelRequest 永远得到同一 ModelResponse。
// 输出文本由 inputHash 派生,携带 inputHash/outputHash,供契约测试与离线开发使用。
import { hashRequest, sha256Prefixed, validateModelRequest, validateModelResponse } from './provider-contract.mjs';

export class MockProvider {
  constructor() {
    this.name = 'mock';
  }

  capabilities() {
    return {
      name: 'mock',
      mock: true,
      deterministic: true,
      streaming: false,
      thinkingMode: false,
      reasoningEffort: false,
    };
  }

  async healthCheck() {
    return { ready: true, provider: 'mock', model: 'mock-deterministic' };
  }

  async generate(request) {
    validateModelRequest(request);
    const inputHash = hashRequest({
      model: request.model,
      messages: request.messages,
      temperature: request.temperature ?? null,
      maxTokens: request.maxTokens ?? null,
      thinkingMode: request.thinkingMode ?? null,
      reasoningEffort: request.reasoningEffort ?? null,
    });
    const text = JSON.stringify({
      mock: true,
      model: request.model,
      echoHash: inputHash.slice(0, 23), // 'sha256:' + 前 16 位 hex
      message: 'mock provider deterministic response',
    });
    const response = {
      text,
      inputHash,
      outputHash: sha256Prefixed(text),
      latencyMs: 0,
      tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      providerMetadata: { mock: true },
    };
    validateModelResponse(response);
    return response;
  }
}
