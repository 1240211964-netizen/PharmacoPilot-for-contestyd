#!/usr/bin/env node
// 手工验收入口：真实模型 / 真实只读课程库是运行时依赖，故不加入 npm run check。
const base = (process.env.PHARMACO_PILOT_URL ?? 'http://127.0.0.1:4175').replace(/\/$/, '');
const seed = process.env.CH06_PILOT_SEED ?? 'ch06-real-pilot-cli';
const response = await fetch(`${base}/api/product-core/teaching-orchestration/ch06/run`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ seed, generationMode: 'local_model', s1ContextMode: 'simulated_fixture' }),
});
const body = await response.json();
if (!response.ok) {
  console.error(JSON.stringify(body, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify(body, null, 2));
  console.log(`教师审核页：${base}/ch06-real-pilot.html`);
}
