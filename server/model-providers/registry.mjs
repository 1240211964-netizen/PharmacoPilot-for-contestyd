// Provider registry:按名取 provider。未知/未启用的 provider 显式抛错,绝不静默回退。
import { fail, failCode } from '../product-core/errors.mjs';
import { loadConfig } from '../config.mjs';
import { MlxProvider } from './mlx-provider.mjs';
import { MockProvider } from './mock-provider.mjs';

// 'deepseek-cloud' 是契约预留位(model_runs.provider 枚举含之),本轮未接入,抛 PROVIDER_NOT_ENABLED。
const PROVIDERS = Object.freeze({
  mock: (options) => new MockProvider(options),
  'existing-mlx': (options) => new MlxProvider(options.config ?? loadConfig()),
});

export function getProvider(name, options = {}) {
  if (name === 'deepseek-cloud') {
    failCode('PROVIDER_NOT_ENABLED', 'provider "deepseek-cloud" 尚未启用(契约占位)', { provider: name });
  }
  const factory = PROVIDERS[name];
  if (!factory) fail(404, 'PROVIDER_NOT_FOUND', `未知 provider: ${name}`, { provider: name });
  return factory(options);
}

export function listProviders() {
  return [...Object.keys(PROVIDERS), 'deepseek-cloud(disabled)'];
}
