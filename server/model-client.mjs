export class ModelUnavailableError extends Error {
  constructor(message, cause) {
    super(message, { cause });
    this.name = "ModelUnavailableError";
  }
}

export class ModelUpstreamError extends Error {
  constructor(status, detail) {
    super(`本地模型服务返回 ${status}`);
    this.name = "ModelUpstreamError";
    this.status = status;
    this.detail = detail;
  }
}

export class ModelClient {
  constructor(config) {
    this.baseUrl = config.modelBaseUrl;
    this.modelName = config.modelName;
    this.apiKey = config.modelApiKey;
    this.timeoutMs = config.modelTimeoutMs;
    this.statusTimeoutMs = config.modelStatusTimeoutMs;
  }

  headers() {
    const headers = { "content-type": "application/json" };
    if (this.apiKey) headers.authorization = `Bearer ${this.apiKey}`;
    return headers;
  }

  async status() {
    const started = performance.now();
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(this.statusTimeoutMs),
      });
      if (!response.ok) {
        return { ready: false, endpoint: this.baseUrl, model: this.modelName, status: response.status };
      }
      const payload = await response.json();
      const models = Array.isArray(payload?.data) ? payload.data.map((item) => item.id).filter(Boolean) : [];
      return {
        ready: true,
        endpoint: this.baseUrl,
        model: this.modelName,
        advertisedModels: models,
        latencyMs: Math.round(performance.now() - started),
      };
    } catch (error) {
      return {
        ready: false,
        endpoint: this.baseUrl,
        model: this.modelName,
        error: error?.name === "TimeoutError" ? "timeout" : "unreachable",
      };
    }
  }

  async chat({ messages, stream, temperature, maxTokens, signal }) {
    const timeoutSignal = AbortSignal.timeout(this.timeoutMs);
    const combinedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
    let response;
    try {
      response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: this.headers(),
        signal: combinedSignal,
        body: JSON.stringify({
          model: this.modelName,
          messages,
          stream,
          temperature,
          max_tokens: maxTokens,
        }),
      });
    } catch (error) {
      throw new ModelUnavailableError("本地模型服务尚未就绪", error);
    }
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 2_000);
      throw new ModelUpstreamError(response.status, detail);
    }
    return response;
  }
}
