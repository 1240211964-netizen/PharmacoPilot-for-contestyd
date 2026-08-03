/* ============================================================
 *  SCHED 单源派生 · sched-from-drama.js  (persona-v2-contract §8.2 · P1)
 *  drama.events（画像 JSON L0 层）是 SCHED 的唯一事实源；
 *  mv-classroom-core.js buildSched 与 practice-runtime.js
 *  buildScheduledEvents 统一由 deriveSchedFromDrama 派生，
 *  消灭手工双份维护漂移（§8.1 因果链断裂点）。
 *
 *  暴露：window.SchedFromDrama（Node 测试经 globalThis 挂取）
 *
 *  P1 说明：practice-detail.html 由并行会话冻结、暂不能加 <script>，
 *  故两引擎各内嵌一份副本（照 SIM-RNG P0 先例）；
 *  副本与本文件 SCHED-DERIVE 标记区逐字节一致
 *  （tools/verify-sched-single-source.mjs 校验），
 *  页面解禁后改回 <script src="./shared/sched-from-drama.js"> 单源引用。
 * ============================================================ */
(function attachSchedFromDrama(global) {
  "use strict";

  /* ==== SCHED-DERIVE-BEGIN · 引擎内嵌副本须与本区逐字节一致 ==== */
  // drama.events → SCHED：agent 由所属学生隐含，产物按 t 升序。
  function deriveSchedFromDrama(agentsData) {
    const out = [];
    ((agentsData && agentsData.agents) || []).forEach((a) => {
      const evs = (a && a.drama && a.drama.events) || [];
      evs.forEach((e) => {
        out.push({ t: e.t, agent: a.id, fx: e.fx, why: e.why });
      });
    });
    out.sort((x, y) => x.t - y.t);
    return out;
  }
  /* ==== SCHED-DERIVE-END ==== */

  global.SchedFromDrama = { deriveSchedFromDrama };
})(typeof window !== "undefined" ? window : globalThis);
