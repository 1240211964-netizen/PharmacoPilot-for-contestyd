/* Playwright 等待助手（verify-stage2-groups 点击沉降时序修复）
 *
 * 背景：页面 seek(2690) / 深链后有约 2s 的渲染沉降（目标 boundingBox 漂移 3–5px），
 * 期间 page.click 因 actionability 的 stability 检查持续失败而 25s 超时
 *（探针：output/playwright/probe-stage2-click.mjs）。
 *
 * 这里不用固定 waitForTimeout，改为轮询显式 DOM 稳定条件：
 * 目标元素 boundingBox 连续 stableMs 无变化 —— 这正是 Playwright 点击前
 * 自检的同一条件，因此等价于"可点击"。目标节点被替换（重渲染）时自动
 * 重新锁定并重新计时；超时或元素被移除则拒绝并给出明确信息。
 */

/**
 * 等 selector 元素的位置稳定（boundingBox 连续 stableMs 不变）。
 * @param {import('playwright').Page} page
 * @param {string} selector
 * @param {{ stableMs?: number, sampleMs?: number, timeout?: number }} [opts]
 */
export async function waitSettledBox(page, selector, { stableMs = 700, sampleMs = 100, timeout = 20000 } = {}) {
  await page.waitForSelector(selector, { timeout });
  await page.evaluate(
    ({ selector, stableMs, sampleMs, timeout }) => new Promise((resolvePromise, rejectPromise) => {
      let el = document.querySelector(selector);
      if (!el) return rejectPromise(new Error(`元素不存在：${selector}`));
      let lastBox = null;
      let lastChange = performance.now();
      const t0 = lastChange;
      const timer = setInterval(() => {
        if (!el.isConnected) el = document.querySelector(selector); // 重渲染后重新锁定
        if (!el) {
          clearInterval(timer);
          return rejectPromise(new Error(`元素被移除：${selector}`));
        }
        const r = el.getBoundingClientRect();
        const box = [r.x, r.y, r.width, r.height].map((v) => v.toFixed(1)).join(",");
        if (box !== lastBox) { lastBox = box; lastChange = performance.now(); }
        if (performance.now() - lastChange >= stableMs) {
          clearInterval(timer);
          resolvePromise();
        } else if (performance.now() - t0 >= timeout) {
          clearInterval(timer);
          rejectPromise(new Error(`布局 ${timeout}ms 内未稳定：${selector}`));
        }
      }, sampleMs);
    }),
    { selector, stableMs, sampleMs, timeout },
  );
}

/**
 * 先等目标位置稳定再点击（替代「固定等待 + click」）。
 * 透传 click 选项（button/position 等），stableMs/sampleMs/timeout 供稳定等待用。
 */
export async function clickWhenSettled(page, selector, opts = {}) {
  const { stableMs, sampleMs, timeout, ...clickOpts } = opts;
  await waitSettledBox(page, selector, { stableMs, sampleMs, timeout });
  await page.click(selector, clickOpts);
}

/**
 * 截图前字体等待：页面经 Google Fonts CDN 异步加载字体（practice-detail.html:12
 * media=print onload 技巧），headless 环境偶发加载迟缓 → page.screenshot 默认
 * 25s 字体等待超时（repeat 连跑实测 M 场景命中一次）。以有界 race 等
 * document.fonts.ready；字体挂死时放行（截图仍按页面默认字体渲染，不卡死套件）。
 * @param {import('playwright').Page} page
 * @param {{ timeout?: number }} [opts]
 */
export async function waitFontsReady(page, { timeout = 30000 } = {}) {
  await page.evaluate(
    (timeout) => Promise.race([
      document.fonts.ready,
      new Promise((r) => setTimeout(r, timeout)),
    ]),
    timeout,
  ).catch(() => {});
}
