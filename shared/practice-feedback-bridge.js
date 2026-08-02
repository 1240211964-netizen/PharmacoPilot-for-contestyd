/*
 * PharmacoPilot · Practice → Nav Feedback Bridge
 * ------------------------------------------------------------
 * 挂在 nav-detail.html 上的小桥。
 * 它做的事很窄：监听 PharmacoPilotStore 上由 practice 触发的
 * artifact:saved / zpd:anchorsChanged / pulse:ruleSaved 事件，
 * 在对应节点卡片上贴一枚"来自 practice 的新沉淀"徽章。
 *
 * 不重写 nav-render；只在它渲染完后追加 DOM。
 * ============================================================ */
(function attachFeedbackBridge(global) {
  "use strict";
  const Store = global.PharmacoPilotStore;
  if (!Store) return;

  const css = `
.pr-feedback-badge {
  position: absolute; top: 8px; right: 8px;
  display: inline-flex; align-items: center; gap: 5px;
  padding: 3px 8px; border-radius: 999px;
  background: var(--amber-deep); color: var(--ivory);
  font-family: var(--mono); font-size: var(--fs-2xs);
  letter-spacing: 0.06em; text-transform: uppercase;
  box-shadow: 0 2px 8px color-mix(in srgb, var(--amber-deep) 25%, transparent);
  z-index: 5;
  animation: pr-fb-pulse 2s ease-in-out infinite;
}
@keyframes pr-fb-pulse {
  0%,100% { transform: scale(1); }
  50%     { transform: scale(1.04); }
}
.pr-feedback-toast {
  position: fixed; right: 24px; bottom: 24px; max-width: 360px;
  padding: 14px 16px;
  background: var(--ink); color: var(--ivory);
  border-radius: 10px; border: 1px solid rgba(255,255,255,.08);
  box-shadow: 0 12px 32px rgba(0,0,0,.25);
  font-family: var(--serif-cn); font-size: var(--fs-xs); line-height: 1.55;
  z-index: 9999;
  opacity: 0; transform: translateY(8px);
  transition: opacity .25s, transform .25s;
}
.pr-feedback-toast.show { opacity: 1; transform: translateY(0); }
.pr-feedback-toast .lbl {
  font-family: var(--mono); font-size: var(--fs-2xs); letter-spacing: 0.1em;
  text-transform: uppercase; color: var(--amber);
  margin-bottom: 4px; display: block;
}
.pr-feedback-toast a {
  color: var(--amber-soft); text-decoration: underline;
  cursor: pointer;
}
`;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  // 注解每个节点卡片上有多少来自 practice 的沉淀
  function annotate(stationId) {
    // 节点卡片选择器：nav-render 给每个站根节点带 data-station-id
    const cards = document.querySelectorAll(`[data-station-id="${stationId}"]`);
    if (!cards.length) return;
    const artifacts = Store.getArtifacts(stationId);
    const fromPractice = artifacts.filter((a) => a.data?.sourcePractice).length;
    if (!fromPractice) return;
    cards.forEach((card) => {
      let badge = card.querySelector(".pr-feedback-badge");
      if (!badge) {
        badge = document.createElement("div");
        badge.className = "pr-feedback-badge";
        // 确保父节点 relative
        const cs = global.getComputedStyle(card);
        if (cs.position === "static") card.style.position = "relative";
        card.appendChild(badge);
      }
      badge.textContent = `↑ Practice × ${fromPractice}`;
    });
  }
  function annotateAll() {
    for (let i = 1; i <= 11; i++) annotate(i);
  }

  function flash(stationId, artifactId) {
    const artifacts = Store.getArtifacts(stationId) || [];
    const record = artifacts.slice().reverse().find((item) => item.artifactId === artifactId);
    const fromS1 = record && record.data && record.data.kind === "s1-diagnostic-writeback";
    const sourceLabel = fromS1 ? "来自 S1 判断单 · 结构化写回" : "来自教学实践 · 实时写回";
    const sourceText = fromS1
      ? `环节 ${record.data.targetNode || "后续"} 收到 V${record.data.sourceVersion || 1} 写回建议`
      : `站 ${stationId} 收到了新的沉淀片段 ${artifactId}`;
    const t = document.createElement("div");
    t.className = "pr-feedback-toast";
    t.innerHTML = `
      <span class="lbl">${sourceLabel}</span>
      <div>${sourceText}。
      <br/><a data-anchor="${stationId}">↓ 跳到这个站</a></div>
    `;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add("show"));
    t.querySelector("a").onclick = () => {
      const card = document.querySelector(`[data-station-id="${stationId}"]`);
      if (card) card.scrollIntoView({ behavior: "smooth", block: "center" });
      t.classList.remove("show");
      setTimeout(() => t.remove(), 300);
    };
    setTimeout(() => {
      t.classList.remove("show");
      setTimeout(() => t.remove(), 300);
    }, 6000);
  }

  // 首次 + 事件订阅
  function start() {
    annotateAll();
    Store.on("artifact:saved", ({ stationId, artifactId }) => {
      annotate(stationId);
      flash(stationId, artifactId);
    });
    Store.on("zpd:anchorsChanged", () => annotate(7));
    Store.on("pulse:ruleSaved", () => annotate(9));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(start, 400));
  } else {
    setTimeout(start, 400);
  }
})(window);
