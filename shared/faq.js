/* ============================================================
   PharmacoPilot · FAQ 弹层
   ------------------------------------------------------------
   自注入 <style> + <dialog id="faq">，所有页面共用。
   触发：点击任意 a[href="#faq"]
   关闭：× 按钮 / 背景点击 / ESC（原生 dialog 行为）
   ============================================================ */
(function () {
  "use strict";

  if (document.getElementById("faq")) return; // 幂等：避免重复注入

  // ---- CSS ----
  const CSS = `
.faq-list { margin-top: 4px; }
.faq-item {
  display: grid; grid-template-columns: 0.6fr 1.4fr; gap: 48px;
  padding: 26px 0; border-bottom: 1px solid var(--rule);
}
.faq-item:first-child { border-top: 1px solid var(--rule); }
.faq-num {
  font-family: var(--mono); font-size: 11px; letter-spacing: 0.16em;
  text-transform: uppercase; color: var(--mute); padding-top: 8px;
}
.faq-block { width: 100%; }
.faq-q {
  cursor: pointer; list-style: none; outline: none;
  font-family: var(--serif-cn); font-size: 19px; font-weight: 500;
  color: var(--ink); line-height: 1.45;
  display: flex; align-items: baseline; justify-content: space-between; gap: 18px;
}
.faq-q::-webkit-details-marker { display: none; }
.faq-toggle {
  font-family: var(--mono); color: var(--amber-deep);
  font-size: 18px; flex-shrink: 0; line-height: 1; padding-top: 2px;
  transition: transform .2s ease;
}
.faq-block[open] .faq-toggle { transform: rotate(45deg); }
.faq-a {
  font-family: var(--serif-cn); font-size: 14.5px; line-height: 1.85;
  color: var(--ink-soft); margin: 14px 0 2px; max-width: 660px;
}
.faq-a i, .faq-a em {
  font-family: var(--serif-en); font-style: italic;
  color: var(--amber-deep); font-weight: 500;
}
.faq-a a {
  color: var(--ink); border-bottom: 1px solid var(--amber-deep);
  text-decoration: none; padding-bottom: 1px;
}
.faq-a a:hover { color: var(--amber-deep); }

body.dx-bench .faq-item { padding: 18px 0; gap: 28px; }
body.dx-bench .faq-q { font-size: 17px; }
body.dx-bench .faq-a { font-size: 13.5px; line-height: 1.75; }
body.dx-mag .faq-item { padding: 34px 0; }
body.dx-mag .faq-q { font-size: 22px; }
body.dx-mag .faq-a { font-size: 16px; }

@media (max-width: 900px) {
  .faq-item { grid-template-columns: 1fr; gap: 6px; }
  .faq-num { padding-top: 0; }
}

.faq-dialog {
  border: none; padding: 0;
  width: min(880px, 92vw); max-width: none;
  max-height: 86vh;
  background: var(--paper); color: var(--ink);
  border-radius: 14px;
  box-shadow: 0 30px 80px -20px rgba(27, 25, 22, .45),
              0 0 0 1px rgba(27, 25, 22, .06);
  overflow: hidden;
}
.faq-dialog::backdrop {
  background: rgba(27, 25, 22, .55);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}
.faq-dialog-inner {
  display: flex; flex-direction: column;
  max-height: 86vh;
}
.faq-dialog-head {
  display: flex; justify-content: space-between; align-items: flex-start;
  gap: 24px; padding: 26px 32px 22px;
  border-bottom: 1px solid var(--rule);
  flex-shrink: 0;
}
.faq-dialog-eyebrow {
  font-family: var(--mono); font-size: 10.5px;
  letter-spacing: 0.16em; text-transform: uppercase;
  color: var(--mute); margin-bottom: 6px;
}
.faq-dialog-title {
  font-family: var(--serif-cn); font-size: 26px; font-weight: 500;
  margin: 0; line-height: 1.25; letter-spacing: -0.005em;
}
.faq-dialog-title .it {
  font-family: var(--serif-en); font-style: italic; color: var(--amber-deep);
}
.faq-dialog-close {
  font-family: var(--mono); font-size: 22px; line-height: 1;
  width: 36px; height: 36px; padding: 0;
  border: 1px solid var(--rule-2); border-radius: 50%;
  background: transparent; color: var(--ink-soft);
  cursor: pointer; flex-shrink: 0;
  transition: background .15s ease, border-color .15s ease, color .15s ease;
}
.faq-dialog-close:hover {
  background: var(--paper-2); border-color: var(--ink); color: var(--ink);
}
.faq-dialog .faq-list { padding: 4px 32px 28px; overflow-y: auto; margin-top: 0; }
.faq-dialog .faq-item { grid-template-columns: 0.45fr 1.55fr; gap: 28px; padding: 22px 0; }
.faq-dialog .faq-item:first-child { border-top: none; }
.faq-dialog .faq-item:last-child { border-bottom: none; }
.faq-dialog .faq-q { font-size: 17px; }
.faq-dialog .faq-a { font-size: 14px; }

@media (max-width: 700px) {
  .faq-dialog-head { padding: 20px 22px 16px; }
  .faq-dialog-title { font-size: 22px; }
  .faq-dialog .faq-list { padding: 4px 22px 22px; }
  .faq-dialog .faq-item { grid-template-columns: 1fr; gap: 6px; padding: 18px 0; }
}
`;

  // ---- HTML ----
  const HTML = `
<div class="faq-dialog-inner">
  <header class="faq-dialog-head">
    <div>
      <div class="faq-dialog-eyebrow">FAQ · 常见问题</div>
      <h2 class="faq-dialog-title">常被问到的<span class="it">六个问题</span>。</h2>
    </div>
    <button class="faq-dialog-close" type="button" aria-label="关闭" data-faq-close>×</button>
  </header>
  <div class="faq-list">
    <div class="faq-item">
      <div class="faq-num">Q · 01</div>
      <details class="faq-block" open>
        <summary class="faq-q">PharmacoPilot 是什么？面向谁？<span class="faq-toggle">＋</span></summary>
        <div class="faq-a">面向药事管理本科课程的教学协作智能体，主要服务对象是高校新教师。把课程纲要、政策案例与临床场景，编织成可审校、可复用、可追溯的教学材料，与教师共同走完<i>设计 → 演练 → 评价</i>三段路径。</div>
      </details>
    </div>

    <div class="faq-item">
      <div class="faq-num">Q · 02</div>
      <details class="faq-block">
        <summary class="faq-q">怎么防止"AI 一本正经地编"？<span class="faq-toggle">＋</span></summary>
        <div class="faq-a">三道闸：① <i>引用强制</i>——结论必须挂出处； ② <i>产物链校验</i>（纯代码、不调主 LLM）——上游变更触发下游 flag； ③ 每周 50 个测试场景的<i>离线 evals</i>，持续监控引用准确性与拒答边界。规则性工作走旁路，不掺到主对话里，错的地方好定位。</div>
      </details>
    </div>

    <div class="faq-item">
      <div class="faq-num">Q · 03</div>
      <details class="faq-block">
        <summary class="faq-q">教师的判断会被 AI 取代吗？<span class="faq-toggle">＋</span></summary>
        <div class="faq-a">不会。架构里教师是 <i>Decision Agent</i>——不可替代的判断权。AI 输出始终落在"建议、材料、数据回流"上；每一站完成都需要教师签字，才能进下一站。AI 负责把碎活揽走，教师专心做关键教学判断。</div>
      </details>
    </div>

    <div class="faq-item">
      <div class="faq-num">Q · 04</div>
      <details class="faq-block">
        <summary class="faq-q">数据从哪儿来？教学痕迹归谁？<span class="faq-toggle">＋</span></summary>
        <div class="faq-a">学术语料对接<i>闻道·科学探索</i>，模拟课堂对接<i>泛雅</i>，叠加自有案例库与量规库。教学痕迹按"班级-教师"维度持久化于 Postgres + 向量库，所有权归学校。跨教师跨班级仅以 embedding 形态复用，不暴露原始痕迹。</div>
      </details>
    </div>

    <div class="faq-item">
      <div class="faq-num">Q · 05</div>
      <details class="faq-block">
        <summary class="faq-q">理论基础是什么？<span class="faq-toggle">＋</span></summary>
        <div class="faq-a"><i>ADDIE × Backward Design × 建设性对齐（Biggs）× ICAP × ZPD × 认知负荷理论 × 教学评一体化（崔允漷）× 课例研究（顾泠沅）</i>。三个内页底栏均挂出对应 theory chip，可逐条溯源到原始文献。</div>
      </details>
    </div>

    <div class="faq-item">
      <div class="faq-num">Q · 06</div>
      <details class="faq-block">
        <summary class="faq-q">怎么开始用？合作怎么走？<span class="faq-toggle">＋</span></summary>
        <div class="faq-a"><i>所有页面无需登录即可浏览</i>，操作落在本机会话里，不写入真实数据库，可以放心点。要在自己学校落地、对接闻道与泛雅，请联系编辑部 <a href="mailto:editor@pharmacopilot.cn">editor@pharmacopilot.cn</a>，我们会安排接入账号与共建路径。</div>
      </details>
    </div>
  </div>
</div>
`;

  // ---- 注入 ----
  const styleEl = document.createElement("style");
  styleEl.textContent = CSS;
  document.head.appendChild(styleEl);

  const dlg = document.createElement("dialog");
  dlg.id = "faq";
  dlg.className = "faq-dialog";
  dlg.setAttribute("aria-label", "常见问题");
  dlg.innerHTML = HTML;
  document.body.appendChild(dlg);

  if (typeof dlg.showModal !== "function") return; // 老浏览器：仅有内容、不会弹

  function open() { if (!dlg.open) dlg.showModal(); }

  document.addEventListener("click", function (e) {
    const trigger = e.target.closest('a[href="#faq"]');
    if (trigger) { e.preventDefault(); open(); return; }
    const closer = e.target.closest("[data-faq-close]");
    if (closer) { dlg.close(); return; }
    if (e.target === dlg) { dlg.close(); }
  });

  if (location.hash === "#faq") open();
})();
