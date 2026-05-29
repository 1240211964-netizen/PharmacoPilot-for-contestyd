/* ============================================================
 * rerun-bridge.js — 教学数据 ↔ 教学实践 重跑闭环
 * ------------------------------------------------------------
 * 流程：
 *   1) 用户在 data-detail.html 点击「→ 进入教学实践重跑 06 探究」
 *      链接形如 practice-detail.html#stage-iii?env=06&from=data&intent=验证五方角色任务
 *   2) practice-detail 加载后，本模块解析 hash query：
 *      - 显示 banner：「← 来自教学数据 · 重跑请求：验证 06 探究的五方角色任务」
 *      - 把 stage-iii 高亮
 *   3) 教师在 stage iii 点击「确认写回」按钮（btn-publish）时：
 *      - 本模块把 { env, intent, completedAt } 写入 localStorage.pp.rerun.lastCompleted
 *   4) data-detail 加载时检查 localStorage：
 *      - 如果有新的 lastCompleted（< 30 分钟内）则在 evidence-strip 顶部显示通知条
 *      - 「上一次重跑 06 探究 · 5 分钟前 · 已写回 → 查看变化」
 * ============================================================ */

(function () {
  'use strict';

  const STORAGE_KEY = 'pp.rerun.lastCompleted';

  /* ---------- 通用 ---------- */

  function parseHashQuery() {
    const hash = window.location.hash || '';
    const qIdx = hash.indexOf('?');
    if (qIdx < 0) return {};
    const params = new URLSearchParams(hash.slice(qIdx + 1));
    const out = {};
    for (const [k, v] of params) out[k] = v;
    return out;
  }

  function loadLastRerun() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); }
    catch { return null; }
  }
  function saveLastRerun(info) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...info, completedAt: Date.now() }));
  }
  function timeAgo(ts) {
    const sec = Math.floor((Date.now() - ts) / 1000);
    if (sec < 60) return `${sec} 秒前`;
    if (sec < 3600) return `${Math.floor(sec / 60)} 分钟前`;
    if (sec < 86400) return `${Math.floor(sec / 3600)} 小时前`;
    return `${Math.floor(sec / 86400)} 天前`;
  }

  /* ---------- practice-detail 侧：banner + 写回拦截 ---------- */

  function initPracticeDetail() {
    const params = parseHashQuery();
    if (params.from === 'data' && params.env) {
      showIncomingBanner(params);
    }

    // 拦截「教师确认写回」按钮，写入 localStorage
    const publishBtn = document.getElementById('inline-publish')
      || document.querySelector('.btn-publish');
    if (publishBtn) {
      publishBtn.addEventListener('click', () => {
        const env = params.env || '';
        const intent = params.intent || '';
        saveLastRerun({ env, intent });
        // 显示完成提示
        showCompletedToast(env);
      });
    }
  }

  function showIncomingBanner(params) {
    const stage3 = document.getElementById('stage-iii');
    if (!stage3) return;
    const banner = document.createElement('div');
    banner.className = 'rerun-banner';
    banner.innerHTML = `
      <span class="rb-tag">← 来自教学数据</span>
      <span class="rb-text">重跑请求：<b>${decodeURIComponent(params.intent || '验证本环节')}</b>（环节 ${params.env}）</span>
      <a class="rb-back" href="./data-detail.html">返回教学数据</a>
    `;
    // Insert before stage iii content
    stage3.insertBefore(banner, stage3.firstChild);
    // Also scroll to it
    setTimeout(() => stage3.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200);
  }

  function showCompletedToast(env) {
    const toast = document.createElement('div');
    toast.className = 'rerun-toast';
    toast.textContent = `✓ ${env} 环节重跑已写回，教学数据将刷新`;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('is-show'));
    setTimeout(() => {
      toast.classList.remove('is-show');
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  /* ---------- data-detail 侧：上次重跑通知条 ---------- */

  function initDataDetail() {
    const last = loadLastRerun();
    if (!last || !last.completedAt) return;
    // 只在 30 分钟内显示
    const ageMin = (Date.now() - last.completedAt) / 60000;
    if (ageMin > 30) return;

    const strip = document.getElementById('evidenceStrip');
    if (!strip) return;
    const notice = document.createElement('div');
    notice.className = 'rerun-notice';
    notice.innerHTML = `
      <span class="rn-tag">✓ 上一次重跑</span>
      <span class="rn-text">环节 <b>${last.env}</b> · <b>${timeAgo(last.completedAt)}</b> 已写回${last.intent ? `：${decodeURIComponent(last.intent)}` : ''}</span>
      <button type="button" class="rn-dismiss" aria-label="关闭">×</button>
    `;
    strip.insertBefore(notice, strip.firstChild);
    notice.querySelector('.rn-dismiss')?.addEventListener('click', () => {
      notice.style.opacity = '0';
      setTimeout(() => notice.remove(), 200);
    });
  }

  /* ---------- 启动 ---------- */

  function init() {
    const path = window.location.pathname;
    if (path.endsWith('practice-detail.html')) {
      initPracticeDetail();
    } else if (path.endsWith('data-detail.html')) {
      initDataDetail();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // 暴露给调试
  window.PharmacoPilotRerunBridge = { loadLastRerun, saveLastRerun };
})();
