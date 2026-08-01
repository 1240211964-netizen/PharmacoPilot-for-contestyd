/* ============================================================
 * theory-chips.js — "评价依据 / INFORMED BY" chip 行的增删逻辑
 * ------------------------------------------------------------
 * 把原本在 data-detail.html / nav-detail.html 等页面里内联的
 * 同一段脚本抽到 shared/，每页只需在 .theory-row 上加：
 *
 *   <div class="theory-row" data-store-key="pp.theoryAdds.data">
 *     ...
 *   </div>
 *
 * 自定义 chips 存到 localStorage[storeKey]，
 * 隐藏的内置 chips 存到 localStorage[storeKey + ".hidden"]。
 * data-store-key 缺省时退回 'pp.theoryAdds.default'。
 * ============================================================ */

(function () {
  'use strict';

  function init(row) {
    const btn    = row.querySelector('#theoryAddBtn') || document.getElementById('theoryAddBtn');
    const panel  = row.querySelector('#theoryAddPanel') || document.getElementById('theoryAddPanel');
    const form   = row.querySelector('#theoryAddForm') || document.getElementById('theoryAddForm');
    const cancel = row.querySelector('#theoryAddCancel') || document.getElementById('theoryAddCancel');
    if (!btn || !panel || !form) return;

    const STORE_KEY = row.dataset.storeKey || 'pp.theoryAdds.default';
    const HIDE_KEY  = STORE_KEY + '.hidden';

    const submitBtn = form.querySelector('.submit');
    const titleEl   = form.elements.title;
    const sourceEl  = form.elements.source;

    /* ---------- Custom chips: load / save / render ---------- */

    function load() {
      try { return JSON.parse(localStorage.getItem(STORE_KEY) || '[]'); }
      catch { return []; }
    }
    function save(list) {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(list)); } catch {}
    }

    function makeChip(item) {
      const chip = document.createElement('span');
      chip.className = 'theory-chip is-custom';
      chip.dataset.id = item.id;
      chip.appendChild(document.createTextNode(item.title + (item.source ? ' ' : '')));
      if (item.source) {
        const s = document.createElement('small');
        s.textContent = item.source;
        chip.appendChild(s);
      }
      const x = makeRemoveButton('移除', () => {
        save(load().filter(it => it.id !== item.id));
        chip.remove();
      });
      chip.appendChild(x);
      return chip;
    }

    function renderAll() {
      row.querySelectorAll('.theory-chip.is-custom').forEach(c => c.remove());
      load().forEach(item => row.insertBefore(makeChip(item), btn));
    }

    /* ---------- Built-in chips: hide / reveal ---------- */

    function loadHidden() {
      try { return new Set(JSON.parse(localStorage.getItem(HIDE_KEY) || '[]')); }
      catch { return new Set(); }
    }
    function saveHidden(set) {
      try { localStorage.setItem(HIDE_KEY, JSON.stringify([...set])); } catch {}
    }
    function chipText(chip) {
      return (chip.textContent || '').replace(/\s+/g, ' ').replace('×', '').trim();
    }
    function attachRemoveBuiltin(chip) {
      if (chip.classList.contains('is-custom')) return;
      if (chip.querySelector('.x')) return;
      chip.appendChild(makeRemoveButton('隐藏此引用', () => {
        const key = chipText(chip);
        const set = loadHidden();
        set.add(key);
        saveHidden(set);
        chip.style.transition = 'opacity .2s, transform .2s';
        chip.style.opacity = '0';
        chip.style.transform = 'scale(.85)';
        setTimeout(() => chip.remove(), 220);
      }));
    }
    function applyHidden() {
      const hidden = loadHidden();
      row.querySelectorAll('.theory-chip:not(.is-custom)').forEach((chip) => {
        if (hidden.has(chipText(chip))) chip.remove();
        else attachRemoveBuiltin(chip);
      });
    }

    /* ---------- Common: × button factory ---------- */

    function makeRemoveButton(label, handler) {
      const x = document.createElement('button');
      x.type = 'button';
      x.className = 'x';
      x.setAttribute('aria-label', label);
      x.title = label;
      x.textContent = '×';
      x.addEventListener('click', (e) => { e.stopPropagation(); handler(); });
      return x;
    }

    /* ---------- Panel: open / close ---------- */

    function open() {
      panel.classList.add('is-open');
      btn.classList.add('is-open');
      btn.setAttribute('aria-expanded', 'true');
      setTimeout(() => titleEl && titleEl.focus(), 50);
    }
    function close() {
      panel.classList.remove('is-open');
      btn.classList.remove('is-open');
      btn.setAttribute('aria-expanded', 'false');
      form.reset();
      if (submitBtn) submitBtn.disabled = true;
    }

    /* ---------- Bindings ---------- */

    btn.addEventListener('click', () => {
      panel.classList.contains('is-open') ? close() : open();
    });
    if (cancel) cancel.addEventListener('click', close);

    if (titleEl && submitBtn) {
      titleEl.addEventListener('input', () => {
        submitBtn.disabled = !titleEl.value.trim();
      });
    }

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const title = (titleEl && titleEl.value || '').trim();
      if (!title) return;
      const item = {
        id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        title,
        source: (sourceEl && sourceEl.value || '').trim(),
      };
      const list = load();
      list.push(item);
      save(list);
      row.insertBefore(makeChip(item), btn);
      close();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && panel.classList.contains('is-open')) close();
    });

    /* ---------- Initial render ---------- */

    applyHidden();
    renderAll();
    setupCollapse(row, btn);   // 默认折叠过长的理论引用，降低新教师"认知超载"
  }

  /* ---------- Collapse long theory rows (默认折叠，避免一墙文献吓退新教师) ---------- */
  const COLLAPSE_LIMIT = 6;
  function ensureCollapseCSS() {
    if (document.getElementById('theory-collapse-css')) return;
    const s = document.createElement('style');
    s.id = 'theory-collapse-css';
    s.textContent =
      '.theory-row.is-collapsed .theory-chip.thy-overflow{display:none;}' +
      '.theory-toggle{font-family:var(--mono);font-weight:500;letter-spacing:0.04em;' +
      'cursor:pointer;border:1px dashed var(--line,#d8d2c4);' +
      'background:transparent;color:var(--mute,#8a8478);border-radius:999px;' +
      'padding:3px 10px;font-size: var(--fs-2xs);line-height:1.4;white-space:nowrap;}' +
      '.theory-toggle:hover{color:var(--ink,#1a1714);border-color:var(--ink,#1a1714);}';
    document.head.appendChild(s);
  }
  function setupCollapse(row, addBtn) {
    if (row.dataset.theoryCollapseBound === '1') return;
    const builtins = [...row.querySelectorAll('.theory-chip:not(.is-custom)')];
    // 每行可用 data-theory-limit 覆盖默认显示条数；导航页设 0 = 整条理论收进抽屉
    // （契约硬约束：前台不铺陈教育理论标签，理论收进每环节「方法依据」抽屉）
    const limit = (row.dataset.theoryLimit != null && row.dataset.theoryLimit !== '')
      ? Math.max(0, parseInt(row.dataset.theoryLimit, 10) || 0) : COLLAPSE_LIMIT;
    if (builtins.length <= limit) return;
    row.dataset.theoryCollapseBound = '1';
    ensureCollapseCSS();
    builtins.slice(limit).forEach((c) => c.classList.add('thy-overflow'));
    row.classList.add('is-collapsed');
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'theory-toggle';
    const sync = () => {
      const collapsed = row.classList.contains('is-collapsed');
      toggle.textContent = collapsed
        ? `+${builtins.length - limit} 更多理论依据 ▾`
        : '收起理论依据 ▴';
      toggle.setAttribute('aria-expanded', String(!collapsed));
    };
    toggle.addEventListener('click', () => { row.classList.toggle('is-collapsed'); sync(); });
    row.insertBefore(toggle, addBtn || null);
    sync();
  }

  function bootstrap() {
    document.querySelectorAll('.theory-row').forEach(row => {
      if (row.dataset.theoryChipsBound === '1') return;
      // Only bind rows that actually have the add UI present
      if (!row.querySelector('#theoryAddBtn') && !document.getElementById('theoryAddBtn')) return;
      row.dataset.theoryChipsBound = '1';
      init(row);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
