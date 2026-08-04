#!/usr/bin/env node
/**
 * smoke-data-detail.mjs — 教学数据页「渲染确实完成」的运行时冒烟测试
 * ---------------------------------------------------------------------------
 * 为什么需要它：
 *   2026-08-03 一次误删 `const MODES` 导致 render() 从中途全线中断——图谱之后的
 *   队列、判断卡、证据卡全部没渲染。而当时 175 项静态门禁**全绿**，控制台**一条
 *   错误都没有**（异常被上游 catch 吞掉）。
 *
 *   静态断言只能证明「源码里有这段字符串/函数」，证明不了「页面真的渲染完成」。
 *   因此本文件断言的是**运行时 DOM 契约**，而不是源码模式。
 *
 * 覆盖两个模式：样本演练（默认）与 LIVE 空状态。
 * 运行：node tools/smoke-data-detail.mjs   （需先 npm start 或自动起静态服务）
 */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.SMOKE_PORT || 4199);

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
        res.writeHead(404).end('not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(abs)] || 'application/octet-stream' });
      fs.createReadStream(abs).pipe(res);
    });
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

const failures = [];
function check(ok, label, detail) {
  if (ok) { console.log(`  ✓ ${label}`); return; }
  failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

// 干净 checkout 上没有浏览器二进制时，Playwright 抛的是一长串堆栈；
// 这里先探一次，把修复命令直接说清楚。
async function launch() {
  try {
    // 用完整 chromium 而非 headless shell：后者是独立下载包，
    // CI/本机常只有前者，写死 shell 会让冒烟测试因缺包而假失败。
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
  const server = await startServer();
  const browser = await launch();
  try {
    for (const mode of ['sample', 'live-empty']) {
      console.log(`\n── 模式：${mode === 'sample' ? '样本演练' : 'LIVE 空状态'} ──`);
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

      // 吞掉的异常不会进 pageerror，所以 DOM 哨兵是必需的；两者都要查。
      const pageErrors = [];
      const consoleErrors = [];
      page.on('pageerror', (e) => pageErrors.push(String(e)));
      page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

      if (mode === 'live-empty') {
        // 注入空 LIVE 数据集，验证空状态下渲染链依然跑完
        await page.addInitScript(() => {
          try {
            localStorage.setItem('pp.dataSource.live', JSON.stringify({ teacher: {}, student: {} }));
          } catch (e) { /* ignore */ }
        });
      }

      await page.goto(`http://127.0.0.1:${PORT}/data-detail.html`, { waitUntil: 'load' });
      await page.waitForFunction(
        () => document.documentElement.dataset.dataRenderState !== 'loading',
        null, { timeout: 8000 }
      ).catch(() => {});

      const state = await page.getAttribute('html', 'data-data-render-state');
      const renderErr = await page.getAttribute('html', 'data-data-render-error');
      check(state === 'ready', '渲染哨兵 = ready', `实际 ${state}${renderErr ? ` / ${renderErr}` : ''}`);

      const counts = await page.evaluate(() => ({
        track: document.querySelectorAll('[data-env-track-node]').length,
        verdict: document.querySelectorAll('[data-verdict-card]').length,
        action: document.querySelectorAll('[data-action-item]').length,
        evidence: document.querySelectorAll('#evidenceGrid > *').length,
        theoryOpen: document.querySelector('.theory-disclosure')?.hasAttribute('open') ?? null,
        secondLayer: document.querySelectorAll('.theory-disclosure .theory-toggle').length,
      }));
      check(counts.track === 9, '9 环节轨道节点 = 9', `实际 ${counts.track}`);
      check(counts.verdict === 2, '判断卡 = 2', `实际 ${counts.verdict}`);
      check(counts.evidence > 0, '证据卡已渲染（render 跑到末尾的证据）', `实际 ${counts.evidence}`);
      check(counts.theoryOpen === false, '评价依据默认折叠', `实际 open=${counts.theoryOpen}`);
      check(counts.secondLayer === 0, '评价依据内无二级折叠', `实际 ${counts.secondLayer}`);
      if (mode === 'sample') {
        check(counts.action === 4, '行动项 = 4', `实际 ${counts.action}`);
      }

      check(pageErrors.length === 0, '无未捕获页面异常', pageErrors[0]);
      check(consoleErrors.length === 0, '无 console.error', consoleErrors[0]);
      await page.close();
    }
  } finally {
    await browser.close();
    server.close();
  }

  console.log('');
  if (failures.length) {
    console.error(`smoke-data-detail: FAIL — ${failures.length} 项\n  ` + failures.join('\n  '));
    process.exit(1);
  }
  console.log('smoke-data-detail: ok');
}

run().catch((e) => { console.error('smoke-data-detail: FAIL —', e); process.exit(1); });
