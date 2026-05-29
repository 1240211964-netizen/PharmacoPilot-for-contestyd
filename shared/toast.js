/* ============================================================
   PharmacoPilot · toast & 示例下载
   ------------------------------------------------------------
   Auto-binds on click:
     [data-demo-toast="…message…"]  → 显示底部 toast
     [data-demo-download]            → 触发示例 plan.md 下载 + toast

   Programmatic:
     window.showDemoToast(message)
     window.downloadDemoPlan()
   ============================================================ */
(function () {
  "use strict";

  // ---- CSS injection ----
  const css = `
.demo-toast {
  position: fixed; left: 50%; bottom: 32px;
  transform: translateX(-50%) translateY(20px);
  background: var(--ink, #1a1714); color: var(--ivory, #fffdf7);
  padding: 11px 20px 11px 16px; border-radius: 999px;
  font-family: var(--serif-cn, ui-serif, serif); font-size: 14px;
  line-height: 1.2;
  box-shadow: 0 8px 28px rgba(0,0,0,.18);
  opacity: 0; pointer-events: none;
  transition: opacity .25s ease, transform .25s ease;
  z-index: 9999;
  display: inline-flex; align-items: center; gap: 10px;
  max-width: 90vw;
}
.demo-toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
.demo-toast::before {
  content: ""; width: 6px; height: 6px; border-radius: 50%;
  background: var(--amber-deep, #a8492a);
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--amber-deep, #a8492a) 28%, transparent);
  flex-shrink: 0;
}
`;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  // ---- Toast ----
  let toastEl = null;
  let hideTimer = null;

  function showToast(message) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "demo-toast";
      toastEl.setAttribute("role", "status");
      toastEl.setAttribute("aria-live", "polite");
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = message || "功能接入中";
    requestAnimationFrame(() => toastEl.classList.add("show"));
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      toastEl.classList.remove("show");
    }, 2400);
  }
  window.showDemoToast = showToast;

  // ---- Sample plan.md download ----
  const SAMPLE_PLAN_MD = `# 节点 05 · 内容 · 问题链
节点: 05 / 11  ·  阶段: 课前
课程: 药事管理 · SWOT 分析
时长: 45 分钟
session: #3417

## 学习目标
- 学生能在 25 分钟内基于政策原文形成至少一个有据可依的立场
- 学生能识别 2-3 处典型的"分歧锚点"并加以解释

## 问题链 v0.1（4-6 题，含 2-3 个分歧锚）
1. 2024 国家医保谈判中，抗肿瘤药品准入条件的核心变化是什么？
2. 从 SWOT 视角看，这一变化对二级公立医院的优势/劣势分别是什么？
3. (分歧锚 ▲) 某医院的抗肿瘤药占比已超出当地预算指标，临床药师是否应主动建议替代方案？
4. (分歧锚 ▲) 替代方案如果意味着更高的住院成本，应如何向患者解释？
5. 在你所在的科室，谁是这场谈判结果的"第一执行人"？

## 评价证据
- 学生发言占比 ≥ 55%
- 至少 2 名学生引用政策原文
- 每个分歧锚至少出现 1 次真实分歧

## 下一站
05 · 案例 — 引入处方场景，把问题链转化为可演练任务

---
PharmacoPilot · plan.md 导出
`;

  function downloadPlan() {
    const blob = new Blob([SAMPLE_PLAN_MD], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "plan-station-04.md";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast("已下载 plan-station-04.md");
  }
  window.downloadDemoPlan = downloadPlan;

  // ---- Auto-bind ----
  document.addEventListener("click", (e) => {
    const dl = e.target.closest("[data-demo-download]");
    if (dl) {
      e.preventDefault();
      downloadPlan();
      return;
    }
    const t = e.target.closest("[data-demo-toast]");
    if (t) {
      e.preventDefault();
      showToast(t.getAttribute("data-demo-toast"));
      return;
    }
  });
})();
