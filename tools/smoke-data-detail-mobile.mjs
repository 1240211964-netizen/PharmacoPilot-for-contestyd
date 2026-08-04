#!/usr/bin/env node
/**
 * smoke-data-detail-mobile.mjs — 教学数据页 390×844 移动端验收
 * ---------------------------------------------------------------------------
 * 本轮冻结前的最后一项验收：不再改信息架构，只验证移动端是否真实可用。
 * 覆盖样本演练与 LIVE 空状态两个模式，产出 4 张截图供人工复核。
 *
 * 运行：node tools/smoke-data-detail-mobile.mjs
 * 前置：npm install && npx playwright install chromium
 */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(root, 'output', 'playwright');
const PORT = Number(process.env.SMOKE_PORT || 4198);
const VIEWPORT = { width: 390, height: 844 };

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2',
};

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const rel = decodeURIComponent((req.url || '/').split('?')[0]).replace(/^\/+/, '') || 'index.html';
      const abs = path.join(root, rel);
      if (!abs.startsWith(root) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
        res.writeHead(404).end('not found'); return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(abs)] || 'application/octet-stream' });
      fs.createReadStream(abs).pipe(res);
    });
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

const failures = [];
const check = (ok, label, detail) => {
  if (ok) { console.log(`  ✓ ${label}`); return; }
  failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
};

async function openPage(browser, mode) {
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 2 });
  const pageErrors = [], consoleErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  if (mode === 'live-empty') {
    await page.addInitScript(() => {
      try { localStorage.setItem('pp.dataSource.live', JSON.stringify({ teacher: {}, student: {} })); }
      catch (e) { /* ignore */ }
    });
  }
  await page.goto(`http://127.0.0.1:${PORT}/data-detail.html`, { waitUntil: 'load' });
  await page.waitForFunction(
    () => document.documentElement.dataset.dataRenderState !== 'loading', null, { timeout: 8000 }
  ).catch(() => {});
  return { page, pageErrors, consoleErrors };
}

// 干净 checkout 上没有浏览器二进制时，Playwright 抛的是一长串堆栈；
// 这里先探一次，把修复命令直接说清楚。
async function launch() {
  try {
    return await chromium.launch({ channel: 'chromium' });
  } catch (e) {
    console.error(
      '\n无法启动 Chromium。请先安装浏览器二进制：\n' +
      '  npm install\n  npx playwright install chromium\n\n原始错误：' + (e && e.message) + '\n'
    );
    process.exit(1);
  }
}

async function run() {
  fs.mkdirSync(SHOTS, { recursive: true });
  const server = await startServer();
  const browser = await launch();
  try {
    // ═══ 样本演练模式 ═══
    console.log('\n══ 样本演练 · 390×844 ══');
    const { page, pageErrors, consoleErrors } = await openPage(browser, 'sample');

    // ① 无横向溢出（整页 + 逐个高风险元素）
    // 逐个检查本轮重构涉及的高风险元素；图谱区（.bi-atlas 内的 lane / coupling-bridge）
    // 是既有的宽内容，被祖先 overflow-x:hidden 裁切，不属本轮范围，单独记录不判失败。
    const of = await page.evaluate(() => {
      const de = document.documentElement;
      const scoped = ['[data-slot="stage-track"]', '.vc-deltas', '.vc-gauge',
                      '[data-action-item]', '.theory-disclosure', '.ac-actions'];
      const wide = [];
      scoped.forEach((sel) => document.querySelectorAll(sel).forEach((el) => {
        if (el.getBoundingClientRect().width > de.clientWidth + 1) wide.push(sel);
      }));
      const atlasClipped = [...document.querySelectorAll('.bi-atlas *')]
        .some((el) => el.getBoundingClientRect().width > de.clientWidth + 1);
      return { doc: de.scrollWidth - window.innerWidth, wide: [...new Set(wide)], atlasClipped };
    });
    check(of.doc <= 1, '整页无横向溢出', `溢出 ${of.doc}px`);
    check(of.wide.length === 0, '本轮重构元素均未宽于视口', of.wide.join(', '));
    if (of.atlasClipped) console.log('  ⓘ 图谱区内容宽于视口且被祖先裁切（既有问题，不在本轮范围）');

    // ② 单列顺序
    const order = await page.evaluate(() => {
      const y = (s) => { const e = document.querySelector(s); return e ? Math.round(e.getBoundingClientRect().top + scrollY) : -1; };
      return {
        标题: y('.data-h1'), 轨道: y('[data-slot="stage-track"]'),
        卡06: y('[data-summary-role="keep"]'), 卡07: y('[data-summary-role="fix"]'),
        行动: y('.action-col'), 评价依据: y('.theory-disclosure'), 证据带: y('.evidence-strip'),
        轨道列数: getComputedStyle(document.querySelector('[data-slot="stage-track"]')).gridTemplateColumns.split(' ').length,
        判断区列数: getComputedStyle(document.querySelector('.decision-layout')).gridTemplateColumns.split(' ').length,
      };
    });
    const seq = ['标题', '轨道', '卡06', '卡07', '行动', '评价依据', '证据带'];
    const ok = seq.every((k, i) => i === 0 || order[k] > order[seq[i - 1]]);
    check(ok, '单列顺序正确（标题→轨道→06→07→行动→依据→证据）', JSON.stringify(order));
    check(order.轨道列数 === 3, '轨道降为 3×3 宫格', `实际 ${order.轨道列数} 列`);
    check(order.判断区列数 === 1, '判断区降为单列（非 8/4）', `实际 ${order.判断区列数} 列`);

    // ③ 轨道交互
    const idle = await page.evaluate(() =>
      [...document.querySelectorAll('[data-env-track-node]')].filter((n) => n.tagName !== 'BUTTON').length);
    check(idle === 5, '5 个空闲节点不可点击（非 button）', `实际 ${idle}`);

    await page.click('[data-summary-target^="verdict-"]');
    await page.waitForTimeout(400);
    const hit06 = await page.evaluate(() => {
      const t = document.querySelector('.verdict-card.is-track-highlighted');
      return { 命中: !!t, 聚焦: document.activeElement === t,
               抽屉未开: (document.getElementById('envDrawer') || {}).hidden !== false };
    });
    check(hit06.命中 && hit06.聚焦, '点 06 → 定位并聚焦判断卡');
    check(hit06.抽屉未开, '点轨道不打开环节抽屉');
    await page.screenshot({ path: path.join(SHOTS, 'data-summary-mobile-track-focus.png') });

    await page.waitForTimeout(1100);
    const faded = await page.evaluate(() => !document.querySelector('.is-track-highlighted'));
    check(faded, '高亮自动消失');

    const actBtn = await page.$('[data-summary-target^="action-"]');
    if (actBtn) {
      await actBtn.click(); await page.waitForTimeout(400);
      const hitAct = await page.evaluate(() => !!document.querySelector('.ac-item.is-track-highlighted'));
      check(hitAct, '点待写回节点 → 定位到行动项');
    } else { check(false, '存在待写回轨道节点'); }

    // ④ 判断卡可读性
    const card = await page.evaluate(() => {
      const c = document.querySelector('[data-summary-role="keep"]');
      const vals = [...c.querySelectorAll('.vd-val')];
      const gv = c.querySelector('[data-slot="gauge-val"]');
      const track = c.querySelector('.vg-track');
      const cs = (el) => getComputedStyle(el);
      return {
        Δ字号: vals[0] ? parseFloat(cs(vals[0]).fontSize) : 0,
        Δ换行: vals.map((v) => v.getBoundingClientRect().height > parseFloat(cs(v).lineHeight) * 1.6),
        量表值: gv ? gv.textContent.trim() : '',
        量表值行数: gv ? Math.round(gv.getBoundingClientRect().height / parseFloat(cs(gv).lineHeight)) : 0,
        轨道宽: track ? Math.round(track.getBoundingClientRect().width) : 0,
        档位字号: parseFloat(cs(c.querySelector('[data-slot="gauge-band"]')).fontSize),
        有折线元素: !!c.querySelector('polyline, .spark'),
      };
    });
    check(card.Δ字号 >= 16, 'Δ 数字未缩成微字', `${card.Δ字号}px`);
    check(!card.Δ换行.some(Boolean), 'Δ 数字未被拆行');
    check(card.量表值行数 <= 1, '「2.3 / 4」保持一行', `${card.量表值行数} 行`);
    check(card.轨道宽 >= 60, '关联量表轨道完整可见', `${card.轨道宽}px`);
    check(card.档位字号 < card.Δ字号, '档位不与数值争抢', `档位 ${card.档位字号} vs Δ ${card.Δ字号}`);
    check(!card.有折线元素, '判断卡内无折线类时间趋势元素');

    // ⑤ 行动区
    const act = await page.evaluate(() => {
      const col = document.querySelector('.action-col');
      const primary = col.querySelector('.q-btn.is-primary');
      const pr = primary.getBoundingClientRect();
      return {
        主按钮宽: Math.round(pr.width), 容器宽: Math.round(col.getBoundingClientRect().width - 36),
        主按钮高: Math.round(pr.height),
        行动条数: col.querySelectorAll('[data-action-item]').length,
        次级数: col.querySelectorAll('.q-btn.is-text').length,
      };
    });
    check(act.主按钮宽 >= act.容器宽 * 0.9, '主按钮占满可用宽度', `${act.主按钮宽}/${act.容器宽}`);
    check(act.主按钮高 >= 44, '主按钮触控高度 ≥44px', `${act.主按钮高}px`);
    check(act.行动条数 === 4, '4 条行动项', `实际 ${act.行动条数}`);

    // ⑥ 评价依据折叠
    const td0 = await page.evaluate(() => {
      const d = document.querySelector('.theory-disclosure');
      const sum = d.querySelector('summary');
      return { open: d.hasAttribute('open'),
               计数截断: sum.scrollWidth > sum.clientWidth + 1,
               二级: d.querySelectorAll('.theory-toggle').length };
    });
    check(td0.open === false, '评价依据默认关闭');
    check(!td0.计数截断, 'summary 计数与预览词未被截断');
    await page.click('.theory-disclosure > summary');
    await page.waitForTimeout(300);
    const td1 = await page.evaluate(() => {
      const d = document.querySelector('.theory-disclosure');
      const de = document.documentElement;
      return { open: d.hasAttribute('open'), chips: d.querySelectorAll('.theory-chip').length,
               二级: d.querySelectorAll('.theory-toggle').length,
               溢出: de.scrollWidth - window.innerWidth };
    });
    check(td1.open, '点击 summary 可展开');
    check(td1.chips === 12, '展开后 12 个 chip 全部出现', `实际 ${td1.chips}`);
    check(td1.二级 === 0, '内部无第二层「更多理论依据」', `实际 ${td1.二级}`);
    check(td1.溢出 <= 1, 'chip 换行不造成横向滚动', `溢出 ${td1.溢出}px`);
    await page.screenshot({ path: path.join(SHOTS, 'data-summary-mobile-theory-open.png'), fullPage: false });
    await page.click('.theory-disclosure > summary');
    await page.waitForTimeout(200);
    check(await page.evaluate(() => !document.querySelector('.theory-disclosure').hasAttribute('open')), '可再次收起');

    // ⑦ 运行时契约
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(SHOTS, 'data-summary-mobile.png') });
    const st = await page.getAttribute('html', 'data-data-render-state');
    check(st === 'ready', '渲染哨兵 = ready', `实际 ${st}`);
    check(pageErrors.length === 0, '无未捕获页面异常', pageErrors[0]);
    check(consoleErrors.length === 0, '无 console.error', consoleErrors[0]);
    await page.close();

    // ═══ LIVE 空状态 ═══
    console.log('\n══ LIVE 空状态 · 390×844 ══');
    const live = await openPage(browser, 'live-empty');
    const lof = await live.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(lof <= 1, '整页无横向溢出', `溢出 ${lof}px`);
    const lst = await live.page.getAttribute('html', 'data-data-render-state');
    check(lst === 'ready', '渲染哨兵 = ready', `实际 ${lst}`);
    check(live.pageErrors.length === 0, '无未捕获页面异常', live.pageErrors[0]);
    check(live.consoleErrors.length === 0, '无 console.error', live.consoleErrors[0]);
    const stale = await live.page.evaluate(() => ({
      track: document.querySelectorAll('[data-env-track-node]').length,
      verdict: document.querySelectorAll('[data-verdict-card]').length,
    }));
    check(stale.track === 9 && stale.verdict === 2, '空状态下结构完整（无残缺）', JSON.stringify(stale));
    await live.page.screenshot({ path: path.join(SHOTS, 'data-summary-mobile-live-empty.png') });
    await live.page.close();
  } finally {
    await browser.close(); server.close();
  }

  console.log(`\n截图已写入 ${path.relative(root, SHOTS)}/`);
  if (failures.length) {
    console.error(`\nsmoke-data-detail-mobile: FAIL — ${failures.length} 项\n  ` + failures.join('\n  '));
    process.exit(1);
  }
  console.log('smoke-data-detail-mobile: ok');
}

run().catch((e) => { console.error('smoke-data-detail-mobile: FAIL —', e); process.exit(1); });
