/* ============================================================
   PharmacoPilot · Sample Collection (Socratic chain telemetry)
   ------------------------------------------------------------
   苏格拉底题链的样本收集层。

   职责分离：
     · Store.logObservation / saveTransfer / setConsent  —— 持久化（永远本地）
     · 本文件 sampleCollection                            —— 业务封装 + 同意门禁
                                                            + 同意卡 UI

   重要：
     1. 同意默认关闭。未启用时，trackStep/trackChoice/trackHint 跳过埋点；
        但 transferLog 始终本地保存（供教师本人复盘用，不上传）。
     2. 本版本不做"上传到远端"；只是把数据按 schema 沉淀到 localStorage。
        远端聚合通道留给后续接入。
     3. dwell 时长按"step 进入 → step 选定"差值计算，跨 step 切换重置。

   暴露在 window.PharmacoPilotSampleCollection。
   ============================================================ */
(function attachSampleCollection(global) {
  "use strict";

  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn);
    } else { fn(); }
  }

  ready(function init() {
    const Store = global.PharmacoPilotStore;
    if (!Store) { console.warn("[sample-collection] Store missing"); return; }

    // ---- 内部状态：step 进入时间戳 + 当前 step 已积累的提示数 + 第一次选项 ----
    const sessionState = {
      // key = `${stationId}:${step}`，value = { enteredAt, hintsUsed, firstChoice }
      stepCtx: new Map(),
    };
    function ctxKey(stationId, step) { return `${stationId}:${step}`; }

    function isEnabled() {
      try { return !!Store.getConsent().enabled; } catch (e) { return false; }
    }

    // -------- Public API --------

    // 关键设计：
    //   · observationLog 始终本地写入（UI 状态恢复依赖它：错答标记、hint 等级）
    //   · isEnabled() 决定 entry 上是否打 shared:true 标记（远端聚合时只取 shared:true 的）
    //   · 这样未同意的用户也能拿到完整的本地交互体验（hint 升级、错题留痕），
    //     只是这部分数据不会被汇聚到样本库。

    function trackStepEntered(stationId, step) {
      const key = ctxKey(stationId, step);
      sessionState.stepCtx.set(key, {
        enteredAt: Date.now(),
        hintsUsed: 0,
        firstChoice: null,
      });
      Store.logObservation(stationId, step, { event: "entered", shared: isEnabled() });
    }

    function trackHintRevealed(stationId, step, hintLevel) {
      const key = ctxKey(stationId, step);
      const ctx = sessionState.stepCtx.get(key);
      if (ctx) ctx.hintsUsed = Math.max(ctx.hintsUsed, hintLevel);
      Store.logObservation(stationId, step, { event: "hintRevealed", hintLevel, shared: isEnabled() });
    }

    function trackChoice(stationId, step, choiceKey, isCorrect) {
      const key = ctxKey(stationId, step);
      const ctx = sessionState.stepCtx.get(key) || { enteredAt: Date.now(), hintsUsed: 0, firstChoice: null };
      if (ctx.firstChoice == null) ctx.firstChoice = choiceKey;
      sessionState.stepCtx.set(key, ctx);

      const dwellMs = Date.now() - ctx.enteredAt;
      Store.logObservation(stationId, step, {
        event: "chose",
        choiceKey,
        firstChoice: ctx.firstChoice,
        hintsUsed: ctx.hintsUsed,
        dwellMs,
        isCorrect: !!isCorrect,
        shared: isEnabled(),
      });
    }

    function trackTransferSubmit(stationId, text, axis) {
      const res = Store.saveTransfer(stationId, text, axis);
      Store.logObservation(stationId, 4, { event: "transferSubmitted", textLen: (text || "").length, axis, shared: isEnabled() });
      return res;
    }

    function trackSelfReport(stationId, step, comment) {
      Store.logObservation(stationId, step, { event: "selfReport", comment: String(comment || "").slice(0, 200), shared: isEnabled() });
    }

    // -------- 同意卡 UI --------
    // 触发时机：Q3 决策保存后；只显示一次（用户已 enabled 或显式 declined 后不再弹）
    let declinedThisSession = false;

    function showConsentCard(opts) {
      if (isEnabled()) return;
      if (declinedThisSession) return;
      if (document.getElementById("ppl-consent-card")) return;

      const card = document.createElement("div");
      card.id = "ppl-consent-card";
      card.className = "consent-card";
      card.innerHTML = `
        <div class="consent-head">
          <span class="consent-tag">○ 样本贡献邀请</span>
          <button class="consent-close" aria-label="关闭">×</button>
        </div>
        <div class="consent-body">
          <p class="consent-lead">你的判断很有价值</p>
          <p class="consent-text">
            愿意把你在 9 个教学环节里的判断匿名贡献到样本库吗?
            这会帮助系统识别新教师的常见思维盲点,让后续教师少走弯路。
          </p>
          <p class="consent-note">数据仅本地保存,可随时在设置里关闭。</p>
        </div>
        <div class="consent-actions">
          <button class="btn-s consent-accept">启用并继续</button>
          <button class="btn-s consent-decline">暂不启用</button>
        </div>
      `;
      document.body.appendChild(card);

      function close() {
        card.classList.add("is-leaving");
        setTimeout(() => { try { card.remove(); } catch (e) {} }, 220);
      }

      card.querySelector(".consent-accept").addEventListener("click", () => {
        Store.setConsent(true);
        close();
        if (opts && typeof opts.onAccept === "function") opts.onAccept();
      });
      card.querySelector(".consent-decline").addEventListener("click", () => {
        declinedThisSession = true;
        close();
        if (opts && typeof opts.onDecline === "function") opts.onDecline();
      });
      card.querySelector(".consent-close").addEventListener("click", () => {
        declinedThisSession = true;
        close();
      });
    }

    // -------- 调试 / 检查 API --------
    function dumpSamples() {
      return {
        consent: Store.getConsent(),
        observations: Store.dump().observationLog || {},
        transfers: Store.getAllTransfers(),
      };
    }

    global.PharmacoPilotSampleCollection = {
      isEnabled,
      trackStepEntered, trackHintRevealed, trackChoice,
      trackTransferSubmit, trackSelfReport,
      showConsentCard,
      dumpSamples,
    };
  });
})(window);
