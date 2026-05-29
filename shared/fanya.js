/* ============================================================
   PharmacoPilot · 泛雅 (Fanya / Chaoxing) — workbench entry
   ------------------------------------------------------------
   Wires every "进入工作台 →" button to open the institution's
   泛雅 课程页面 in a new tab. 泛雅 is the data source for
   teaching-data — every session, attendance, and assignment
   record flows back from here.

   Default URL is a placeholder. Override per-page with:
     <body data-fanya-url="https://cpu.fanya.chaoxing.com/...">
   or globally before this script loads:
     window.FANYA_URL = "...";

   Markup contract:
     <button data-fanya>进入工作台 →</button>
     <a      data-fanya>...</a>
   Buttons inside .masthead-inner with class `.pill-cap.fill`
   are auto-wired even without the attribute, so the existing
   four pages light up without re-templating.
   ============================================================ */
(function () {
  "use strict";

  // 中国药科大学的泛雅入口（占位 — 等用户给到真实 URL 再替换）
  const DEFAULT_URL = "https://cpu.fanya.chaoxing.com/portal";

  function getUrl(trigger) {
    return (
      trigger?.getAttribute?.("data-fanya-url") ||
      window.FANYA_URL ||
      document.body?.dataset?.fanyaUrl ||
      DEFAULT_URL
    );
  }

  function openFanya(trigger) {
    const url = getUrl(trigger);
    window.open(url, "_blank", "noopener,noreferrer");
  }

  // Tag the canonical "进入工作台 →" button in the masthead so
  // we don't accidentally hijack other primary buttons.
  function autotag() {
    document
      .querySelectorAll(".masthead-inner .pill-cap.fill")
      .forEach((b) => {
        if (!b.hasAttribute("data-fanya")) b.setAttribute("data-fanya", "");
        b.title = "在泛雅平台中打开课程工作台";
      });
  }

  function bind() {
    document.addEventListener("click", (e) => {
      const trig = e.target.closest("[data-fanya]");
      if (!trig) return;
      e.preventDefault();
      openFanya(trig);
    });
  }

  function boot() {
    autotag();
    bind();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }

  window.FANYA = { openFanya, getUrl, DEFAULT_URL };
})();
