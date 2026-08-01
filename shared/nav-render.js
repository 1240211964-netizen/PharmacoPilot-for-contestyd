/* ============================================================
   PharmacoPilot · 教学导航 渲染器 (v4 stages overlay)
   ------------------------------------------------------------
   Reads from PharmacoPilotNavigationContract (stages-v4):
     · NAV_STAGES (9)        — 前台侧栏主导航 + 阶段概览
     · SUB_NODES (12)        — 后台数据节点（兼容 station ids 1-11）
     · NAV_STATIONS (legacy) — 与 station<N>.payload.js 配合
   and PharmacoPilotDecisionBank, renders into pharmaco's
   editorial layout.
   ============================================================ */
(function () {
  "use strict";

  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn);
    } else {
      fn();
    }
  }

  ready(function init() {
    const C = window.PharmacoPilotNavigationContract;
    const DB = window.PharmacoPilotDecisionBank;
    if (!C || !DB) {
      console.warn("[nav-render] contract or decision bank not loaded");
      return;
    }

    const STATIONS = C.NAV_STATIONS || [];
    const stationById = Object.fromEntries(STATIONS.map((s) => [s.id, s]));

    // ---- v4 stages accessor ---------------------------------------------
    const STAGES = C.NAV_STAGES || [];
    const SUB_NODES = C.SUB_NODES || {};
    const STAGE_CHAIN = C.STAGE_CHAIN || {};
    const stageById = Object.fromEntries(STAGES.map((g) => [g.id, g]));
    const TOTAL_STAGES = STAGES.length; // 9
    const stageShortLabel = (stage) => stage
      ? (stage.title || stage.shortLabel || stage.displayName || stage.id)
      : "";
    // 子节点 key (含 "11a"/"11b") → 环节 id 的反查
    function stageOfSubNode(key) {
      const entry = SUB_NODES[String(key)];
      return entry ? entry.stageId : null;
    }
    // 当前 station id → 当前环节 id
    function stageOfStation(stid) {
      // S8 反思性实践与教学改进含 split：默认归 S8 复盘（用户可通过 chip 切到 S9）
      if (stid === 11) return "S8";
      const entry = SUB_NODES[String(stid)];
      return entry ? entry.stageId : null;
    }

    // 当前生效的子节点 key：优先 activeSubKey；未显式点击时，回退到该环节内首个映射当前 station 的子节点 key
    function effectiveSubKey() {
      if (activeSubKey) return activeSubKey;
      const sid = stageOfStation(activeId);
      const stage = sid ? stageById[sid] : null;
      if (!stage || !Array.isArray(stage.subNodeIds)) return null;
      const found = stage.subNodeIds.map(String).find((k) => {
        const e = SUB_NODES[k] || {};
        const lid = (typeof e.legacyStationId === "number") ? e.legacyStationId : Number(k);
        return lid === activeId;
      });
      return found || null;
    }

    // ---- v3 payload accessor ---------------------------------------------
    // 图表函数优先从 window.PharmacoPilotStationPayloads[id] 读数据；
    // 未注册时回退到内置默认，保持向后兼容。
    function payloadOf(sid) {
      const P = (window.PharmacoPilotStationPayloads || {});
      const sidNum = typeof sid === "object" ? sid.id : sid;
      return P[sidNum] || null;
    }
    function efigOf(sid) {
      const p = payloadOf(sid);
      return (p && p.evidenceFigure) || null;
    }

    // ---- v3 data-driven figure styles ------------------------------------
    // 注入一次，覆盖 station 03（议程聚类条）/ station 06（证据密度条+议程对照）
    (function ensureV3FigureStyles() {
      if (document.getElementById("ppl-v3-figure-styles")) return;
      const st = document.createElement("style");
      st.id = "ppl-v3-figure-styles";
      st.textContent = `
        /* ---- 03 议程聚类 ---- */
        .agenda-cluster-wrap { padding: 6px 0 4px; }
        .agcl-row {
          display: grid; grid-template-columns: 26px 1fr 3fr auto;
          align-items: center; gap: 10px; padding: 5px 0;
          font-family: var(--serif-cn); font-size: var(--fs-xs);
        }
        .agcl-rank { font-family: var(--mono); color: var(--mute); font-size: var(--fs-2xs); }
        .agcl-lbl  { color: var(--ink); }
        .agcl-bar  { display: block; height: 8px; border-radius: 4px;
                     background: color-mix(in srgb, var(--amber-deep) 8%, transparent); position: relative; overflow: hidden; }
        .agcl-bar i { display: block; height: 100%; border-radius: 4px; transition: width .35s ease; }
        .agcl-val  { font-family: var(--mono); font-size: var(--fs-2xs); color: var(--mute); white-space: nowrap; }

        /* ---- 06 证据密度 + 议程对照 ---- */
        .evdensity-wrap { padding: 6px 0 4px; }
        .evdensity-bars { display: flex; flex-direction: column; gap: 6px; }
        .evd-row {
          display: grid; grid-template-columns: 80px 1fr 90px;
          align-items: center; gap: 10px;
          font-family: var(--serif-cn); font-size: var(--fs-xs);
        }
        .evd-lbl { color: var(--ink); }
        .evd-track {
          display: block; height: 10px; border-radius: 5px;
          background: color-mix(in srgb, var(--amber-deep) 8%, transparent); overflow: hidden;
        }
        .evd-track i { display: block; height: 100%; border-radius: 5px; transition: width .35s ease; }
        .evd-val { font-family: var(--mono); font-size: var(--fs-2xs); text-align: right; }
        .evd-agendas { margin-top: 12px; padding-top: 10px; border-top: 1px dashed color-mix(in srgb, var(--amber-deep) 18%, transparent); }
        .evd-agendas-hd {
          font-family: var(--mono); font-size: var(--fs-2xs);
          color: var(--mute); letter-spacing: 0.08em; margin-bottom: 6px;
        }
        .evd-agendas-row { display: flex; flex-wrap: wrap; gap: 8px; }
        .evd-agenda {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 3px 8px; border-radius: 12px; font-size: var(--fs-2xs);
          font-family: var(--serif-cn);
          background: #faf6ee; color: var(--ink);
          border: 1px solid color-mix(in srgb, var(--amber-deep) 15%, transparent);
        }
        .evd-agenda i { width: 6px; height: 6px; border-radius: 50%; background: #d88a3a; }
        .evd-agenda.is-covered i { background: var(--sage); }
        .evd-agenda.is-miss { color: var(--amber-deep); border-color: color-mix(in srgb, var(--amber-deep) 40%, transparent); }
        .evd-agenda.is-miss i { background: var(--amber-deep); }
        .evd-callout {
          margin-top: 12px; padding: 8px 10px;
          background: #faf6ee; border-left: 3px solid var(--amber-deep);
          font-family: var(--serif-cn); font-size: var(--fs-xs);
          color: var(--ink);
        }
        .evd-callout b { color: var(--amber-deep); margin-right: 4px; }
        /* === 05 方法论严谨链 chain-row === */
        .chain-rows { display: flex; flex-direction: column; gap: 6px; padding: 4px 0; }
        .chain-row {
          display: grid; grid-template-columns: 36px 44px 1fr auto;
          align-items: center; gap: 8px;
          padding: 7px 8px; border-radius: 6px;
          background: color-mix(in srgb, var(--amber-deep) 4%, transparent);
          font-family: var(--serif-cn); font-size: var(--fs-xs);
        }
        .chain-row .cr-lvl {
          display: inline-flex; align-items: center; justify-content: center;
          width: 28px; height: 22px; border-radius: 4px;
          color: #fff; font-family: var(--mono); font-size: var(--fs-2xs);
          font-weight: 600;
        }
        .chain-row .cr-type {
          font-family: var(--mono); font-size: var(--fs-2xs);
          color: var(--ink); letter-spacing: 0.04em;
        }
        .chain-row .cr-text { color: var(--ink); line-height: 1.4; }
        .chain-row .cr-meta { display: flex; gap: 6px; align-items: center; font-family: var(--mono); font-size: var(--fs-2xs); }
        .chain-row .cr-diff { font-weight: 600; }
        .chain-row .cr-block { color: var(--amber-deep); font-weight: 500; }
        /* === M · station 11 S8 复盘视图 === */
        .s8-view .ar-section { padding: 8px 0; }
        .s8-view .ar-section + .ar-section {
          border-top: 1px dashed color-mix(in srgb, var(--amber-deep) 18%, transparent); margin-top: 8px; padding-top: 12px;
        }
        .s8-view .ar-head {
          display: flex; justify-content: space-between; align-items: baseline;
          font-family: var(--mono); font-size: var(--fs-2xs);
          color: var(--mute); letter-spacing: 0.06em;
          margin-bottom: 8px;
        }
        .s8-view .ar-head .ar-legend { color: var(--amber-deep); }
        .s8-view .ar-list { display: flex; flex-direction: column; gap: 4px; }
        .s8-view .ar-row {
          display: grid; grid-template-columns: 1fr auto auto; gap: 12px;
          align-items: center; padding: 5px 8px; border-radius: 5px;
          background: color-mix(in srgb, var(--amber-deep) 4%, transparent);
          font-family: var(--serif-cn); font-size: var(--fs-xs);
        }
        .s8-view .ar-row .ar-text { color: var(--ink); }
        .s8-view .ar-row .ar-cells {
          display: inline-flex; gap: 3px;
          font-family: var(--mono); font-size: var(--fs-2xs);
        }
        .s8-view .ar-row .ar-cell {
          width: 14px; text-align: center; display: inline-block;
        }
        .s8-view .ar-row .ar-cell.ar-yes { color: var(--sage); font-weight: 600; }
        .s8-view .ar-row .ar-cell.ar-no { color: rgba(0,0,0,.18); }
        .s8-view .ar-row .ar-score {
          font-family: var(--mono); font-size: var(--fs-2xs);
          color: var(--amber-deep); font-weight: 600;
          min-width: 28px; text-align: right;
        }
        .s8-view .ar-empty {
          padding: 14px; text-align: center;
          color: var(--mute); font-size: var(--fs-2xs);
          background: color-mix(in srgb, var(--amber-deep) 3%, transparent); border-radius: 6px;
        }
        .s8-view .pr-row {
          display: grid; grid-template-columns: 40px 38px 1fr; gap: 8px;
          align-items: center; padding: 5px 8px; border-radius: 5px;
          background: color-mix(in srgb, var(--amber-deep) 4%, transparent);
          font-family: var(--serif-cn); font-size: var(--fs-xs);
          margin-bottom: 3px;
        }
        .s8-view .pr-row .pr-id {
          font-family: var(--mono); font-size: var(--fs-2xs);
          color: var(--amber-deep); font-weight: 600;
        }
        .s8-view .pr-row .pr-t {
          font-family: var(--mono); font-size: var(--fs-2xs);
          color: var(--mute);
        }
        .s8-view .pr-row .pr-rule { color: var(--ink); font-size: var(--fs-2xs); }
        .s8-view .pr-row .pr-empty { color: var(--mute); font-style: italic; }
        /* === M · station 11 S9 资产视图 (extra) === */
        .s9-view .evd-source {
          display: block; font-family: var(--mono);
          font-size: var(--fs-2xs); color: var(--mute); margin-top: 1px;
          letter-spacing: 0.02em;
        }

        /* ====== O · DARK MODE 覆盖 · 数据驱动图表组件 ====== */
        html[data-theme="dark"] .agcl-lbl { color: var(--ivory); }
        html[data-theme="dark"] .agcl-val { color: var(--mute-2); }
        html[data-theme="dark"] .agcl-bar { background: color-mix(in srgb, var(--ivory) 6%, transparent); }
        html[data-theme="dark"] .agcl-rank { color: var(--mute-2); }

        html[data-theme="dark"] .evd-lbl { color: var(--ivory); }
        html[data-theme="dark"] .evd-track { background: color-mix(in srgb, var(--ivory) 6%, transparent); }
        html[data-theme="dark"] .evd-agendas { border-top-color: var(--on-dark-veil); }
        html[data-theme="dark"] .evd-agendas-hd { color: var(--mute-2); }
        html[data-theme="dark"] .evd-agenda {
          background: color-mix(in srgb, var(--ivory) 4%, transparent); color: var(--on-dark);
          border-color: var(--on-dark-veil);
        }
        html[data-theme="dark"] .evd-agenda.is-miss {
          background: color-mix(in srgb, var(--amber) 12%, transparent); color: var(--amber-soft); border-color: color-mix(in srgb, var(--amber) 35%, transparent);
        }
        html[data-theme="dark"] .evd-callout {
          background: color-mix(in srgb, var(--amber) 10%, transparent); color: var(--on-dark); border-left-color: var(--amber);
        }
        html[data-theme="dark"] .evd-callout b { color: var(--amber-soft); }

        html[data-theme="dark"] .chain-row {
          background: color-mix(in srgb, var(--ivory) 4%, transparent);
        }
        html[data-theme="dark"] .chain-row .cr-type { color: var(--on-dark-mute); }
        html[data-theme="dark"] .chain-row .cr-text { color: var(--ivory); }
        html[data-theme="dark"] .chain-row .cr-block { color: var(--amber-soft); }

        html[data-theme="dark"] .s8-view .ar-row {
          background: color-mix(in srgb, var(--ivory) 4%, transparent); color: var(--on-dark);
        }
        html[data-theme="dark"] .s8-view .ar-row .ar-text { color: var(--ivory); }
        html[data-theme="dark"] .s8-view .ar-row .ar-cell.ar-no { color: color-mix(in srgb, var(--ivory) 18%, transparent); }
        html[data-theme="dark"] .s8-view .ar-row .ar-score { color: var(--amber-soft); }
        html[data-theme="dark"] .s8-view .ar-empty {
          background: color-mix(in srgb, var(--ivory) 4%, transparent); color: var(--mute-2);
        }
        html[data-theme="dark"] .s8-view .pr-row {
          background: color-mix(in srgb, var(--ivory) 4%, transparent);
        }
        html[data-theme="dark"] .s8-view .pr-row .pr-rule { color: var(--on-dark); }
        html[data-theme="dark"] .s8-view .pr-row .pr-empty { color: var(--mute-2); }
      `;
      document.head.appendChild(st);
    })();

    // ---- v4 decision-card styles · 推荐收敛 + rationale + save gating ----
    (function ensureDecisionStyles() {
      if (document.getElementById("ppl-decision-v4-styles")) return;
      const st = document.createElement("style");
      st.id = "ppl-decision-v4-styles";
      st.textContent = `
        /* qchain-rich: 每个选项展开成 head + rationale 两行 */
        .qchain.qchain-rich li { padding: 10px 0 10px 32px; cursor: pointer; transition: background .12s; }
        .qchain.qchain-rich li:hover { background: color-mix(in srgb, var(--amber) 4%, transparent); }
        .qchain.qchain-rich li.is-selected { background: var(--amber-wash); }
        .qchain.qchain-rich .qopt-head {
          display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap;
          font-family: var(--serif-cn); font-size: var(--fs-sm); color: var(--ink);
          line-height: 1.5;
        }
        .qchain.qchain-rich .qopt-label { font-weight: 500; }
        .qchain.qchain-rich .qopt-score {
          margin-left: auto; font-family: var(--mono); font-size: var(--fs-2xs);
          color: var(--mute); letter-spacing: 0.02em;
        }
        .qchain.qchain-rich .qopt-score b { color: var(--ink-2); font-weight: 600; }
        .qchain.qchain-rich .qopt-rationale {
          margin-top: 5px; font-family: var(--serif-cn); font-size: var(--fs-xs);
          line-height: 1.55; color: var(--ink-soft);
        }
        /* ann 三档变体（保留 .ann.fork 作为 .ann-rec 的别名） */
        .ann.ann-alt { background: var(--paper-3); color: var(--ink-2); }
        .ann.ann-avoid {
          background: transparent; color: var(--mute);
          border: 1px solid var(--rule-2);
        }
        .ann.ann-rec {
          background: var(--amber-wash); color: var(--amber-deep);
          border: 1px solid var(--amber-deep); font-weight: 600;
        }
        /* decision-dock 按钮三档 + 保存禁用 */
        .decision-dock .btn-s.dd-opt.is-selected {
          background: var(--amber-wash);
          border-color: var(--amber-deep);
          color: var(--amber-deep); font-weight: 600;
        }
        .decision-dock .btn-s.is-avoid { color: var(--mute); border-style: dashed; }
        .decision-dock .btn-s.fill[disabled] {
          background: var(--paper-3); color: var(--mute-2);
          border-color: var(--rule);
          cursor: not-allowed;
        }
        /* 产物区门禁：保存判断前置灰 */
        .ppl-artifact-zone.is-gated .ppl-artifact-gate {
          font-family: var(--mono); font-size: var(--fs-2xs); color: var(--amber-deep);
          margin-bottom: 6px; letter-spacing: 0.04em;
        }
        .ppl-artifact-zone.is-gated button[data-artifact-id] {
          color: var(--mute-2); border-style: dashed; cursor: not-allowed; opacity: 0.65;
        }

        /* dark mode */
        html[data-theme="dark"] .qchain.qchain-rich li:hover { background: color-mix(in srgb, var(--amber) 8%, transparent); }
        html[data-theme="dark"] .qchain.qchain-rich li.is-selected { background: color-mix(in srgb, var(--amber) 18%, transparent); }
        html[data-theme="dark"] .qchain.qchain-rich .qopt-rationale { color: var(--on-dark-mute); }
        html[data-theme="dark"] .qchain.qchain-rich .qopt-score b { color: var(--ivory); }
        html[data-theme="dark"] .ann.ann-alt { background: color-mix(in srgb, var(--ivory) 6%, transparent); color: var(--on-dark); }
        html[data-theme="dark"] .ann.ann-avoid { color: var(--mute-2); border-color: color-mix(in srgb, var(--ivory) 18%, transparent); }
        html[data-theme="dark"] .ann.ann-rec { background: color-mix(in srgb, var(--amber) 25%, transparent); color: var(--amber-soft); border-color: var(--amber-soft); }
      `;
      document.head.appendChild(st);
    })();

    // ---- v5 chain-card styles · 苏格拉底 4 阶题链 ----------------------
    (function ensureChainStyles() {
      if (document.getElementById("ppl-chain-v5-styles")) return;
      const st = document.createElement("style");
      st.id = "ppl-chain-v5-styles";
      st.textContent = `
        /* ── Stepper ── */
        .qchain-stepper {
          display: flex; align-items: center; gap: 4px;
          padding: 6px 0 12px; margin-bottom: 10px;
          border-bottom: 1px dashed var(--rule);
          font-family: var(--mono); font-size: var(--fs-2xs); letter-spacing: 0.06em;
        }
        .qchain-stepper .qstep {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 3px 8px; border-radius: 12px;
          color: var(--mute-2);
          font-style: normal;
          transition: all .2s;
        }
        .qchain-stepper .qstep::before {
          content: "○"; font-size: var(--fs-2xs); line-height: 1; color: var(--mute-2);
        }
        .qchain-stepper .qstep.is-done { color: var(--sage); }
        .qchain-stepper .qstep.is-done::before { content: "●"; color: var(--sage); }
        .qchain-stepper .qstep.is-current {
          color: var(--amber-deep); background: var(--amber-wash);
          font-weight: 600;
        }
        .qchain-stepper .qstep.is-current::before { content: "◉"; color: var(--amber-deep); }
        .qchain-stepper .qstep.is-optional::before { content: "◌"; color: var(--mute-2); }
        .qchain-stepper .qstep-arrow {
          flex: 0 0 12px; height: 1px; background: var(--rule);
        }

        /* ── Chain question (Q1/Q2 单选 + 4 级 hint) ──
           适老化字号：题面 15px / 选项 14.5px / hint 13.5px / line-height 1.7 */
        .chain-q { margin-bottom: 12px; }
        .chain-q-stem {
          font-family: var(--serif-cn); font-size: var(--fs-md); color: var(--ink);
          line-height: 1.7; margin: 0 0 12px; padding: 12px 14px;
          background: var(--amber-wash); border-left: 3px solid var(--amber-deep);
          border-radius: 0 6px 6px 0;
        }
        .chain-q-opts { list-style: none; padding: 0; margin: 0; }
        .chain-q-opts li {
          padding: 11px 14px; margin-bottom: 7px;
          border: 1px solid var(--rule); border-radius: 6px;
          background: var(--paper);
          font-family: var(--serif-cn); font-size: var(--fs-sm); color: var(--ink);
          line-height: 1.65;
          cursor: pointer; transition: all .14s;
          display: flex; align-items: flex-start; gap: 8px;
        }
        .chain-q-opts li:hover {
          border-color: var(--amber-soft); background: color-mix(in srgb, var(--amber) 4%, transparent);
        }
        .chain-q-opts li.is-wrong {
          border-color: color-mix(in srgb, var(--amber-deep) 50%, transparent);
          background: color-mix(in srgb, var(--amber-deep) 4%, transparent);
          color: var(--mute);
        }
        .chain-q-opts li.is-wrong::before { content: "✕ "; color: var(--amber-deep); font-weight: 700; }
        .chain-q-opts li.is-correct {
          border-color: var(--sage); background: rgba(106,154,123,0.08);
          color: var(--ink); font-weight: 500;
        }
        .chain-q-opts li.is-correct::before { content: "✓ "; color: var(--sage); font-weight: 700; }
        .chain-q-opts li.is-locked { pointer-events: none; opacity: 0.7; }

        /* ── Hint drawer ── */
        .chain-hint-drawer {
          margin-top: 12px;
          padding: 12px 14px;
          background: var(--paper-2);
          border: 1px dashed var(--rule);
          border-radius: 6px;
          font-family: var(--serif-cn); font-size: var(--fs-sm);
          color: var(--ink-soft); line-height: 1.7;
          display: none;
        }
        .chain-hint-drawer.is-open { display: block; }
        .chain-hint-item {
          padding: 4px 0;
        }
        .chain-hint-item + .chain-hint-item {
          border-top: 1px dotted color-mix(in srgb, var(--amber-deep) 18%, transparent);
          margin-top: 6px; padding-top: 8px;
        }
        .chain-hint-lvl {
          display: inline-block;
          font-family: var(--mono); font-size: var(--fs-2xs);
          letter-spacing: 0.06em; color: var(--amber-deep);
          background: var(--paper); padding: 1px 6px;
          border-radius: 3px; margin-right: 6px;
        }
        .chain-hint-cta {
          margin-top: 8px; display: flex; gap: 8px; align-items: center;
        }
        .chain-hint-cta .btn-hint {
          font-family: var(--mono); font-size: var(--fs-xs); letter-spacing: 0.04em;
          padding: 5px 12px; background: var(--paper);
          border: 1px solid var(--amber-deep); color: var(--amber-deep);
          border-radius: 4px; cursor: pointer; transition: all .12s;
        }
        .chain-hint-cta .btn-hint:hover {
          background: var(--amber-wash);
        }
        .chain-hint-cta .btn-hint[disabled] {
          opacity: 0.4; cursor: not-allowed;
        }
        .chain-hint-meta {
          font-family: var(--mono); font-size: var(--fs-2xs); color: var(--mute);
          letter-spacing: 0.04em;
        }

        /* ── v6.1 P1: stepper 决策二级状态 + 错答 toast + 完成 CTA ── */
        .qchain-stepper .qstep[data-substep="reflection"]::after {
          content: " · 反思中";
          font-size: 0.85em; opacity: 0.7; font-style: normal;
        }
        .chain-wrong-toast {
          margin: 10px 0 0;
          padding: 8px 12px;
          background: color-mix(in srgb, var(--amber-deep) 8%, transparent);
          border-left: 3px solid var(--amber-deep);
          border-radius: 0 6px 6px 0;
          font-family: var(--serif-cn); font-size: var(--fs-sm);
          color: var(--amber-deep);
          animation: chainWrongFadeIn .2s ease-out;
          display: flex; align-items: center; gap: 6px;
        }
        @keyframes chainWrongFadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .chain-wrong-toast.is-fading { opacity: 0; transition: opacity .3s; }
        .chain-completed-cta {
          margin-top: 14px;
          display: flex; gap: 10px; justify-content: flex-end;
          padding-top: 12px;
          border-top: 1px dashed var(--rule);
        }
        .chain-completed-cta .btn-next-stage {
          font-family: var(--mono); font-size: var(--fs-xs); padding: 8px 16px;
          background: var(--amber-deep); color: var(--ivory);
          border: 1px solid var(--amber-deep); border-radius: 4px;
          cursor: pointer; letter-spacing: 0.04em;
          transition: background .14s;
        }
        .chain-completed-cta .btn-next-stage:hover { background: var(--maroon); }
        .chain-completed-cta .btn-next-stage:disabled {
          background: var(--paper-3); color: var(--mute-2);
          border-color: var(--rule); cursor: not-allowed;
        }
        /* 5×4 矩阵 cell 数字字号升 14px(适老化补完) */
        .figure-card.rich-01 .rm-cell .rm-num { font-size: var(--fs-sm); }
        .figure-card.rich-01 .rm-cell { height: 28px; }

        /* v6.2: 重置题链按钮 */
        .qchain-stepper { position: relative; }
        .qstep-reset {
          margin-left: auto;
          font-family: var(--mono); font-size: var(--fs-2xs);
          padding: 4px 10px; cursor: pointer;
          background: transparent; color: var(--mute);
          border: 1px solid var(--rule); border-radius: 4px;
          letter-spacing: 0.04em;
          transition: all .12s;
        }
        .qstep-reset:hover {
          color: var(--amber-deep); border-color: var(--amber-deep);
          background: var(--amber-wash);
        }

        /* v6.2: Q4 迁移题保存后的样本累积提示 */
        .chain-transfer-saved-note {
          margin: 10px 0 0;
          padding: 8px 12px;
          background: rgba(106,154,123,0.06);
          border-left: 3px solid var(--sage);
          border-radius: 0 6px 6px 0;
          font-family: var(--serif-cn); font-size: var(--fs-xs);
          color: var(--ink-soft); line-height: 1.6;
        }

        /* v6.4 S6 规则卡片 */
        .figure-card.rich-09 .rule-cards {
          display: flex; flex-direction: column; gap: 8px;
          margin: 12px 0 14px;
        }
        .figure-card.rich-09 .rule-card {
          padding: 10px 12px;
          border-left: 3px solid var(--rule);
          background: var(--paper-2);
          border-radius: 0 6px 6px 0;
        }
        .figure-card.rich-09 .rule-card.is-set { border-left-color: var(--sage); }
        .figure-card.rich-09 .rule-card.is-empty {
          border-left-color: var(--amber-deep); border-left-style: dashed;
        }
        .figure-card.rich-09 .rc-head {
          display: flex; align-items: baseline; gap: 8px;
          margin-bottom: 6px; flex-wrap: wrap;
        }
        .figure-card.rich-09 .rc-id {
          font-family: var(--mono); font-size: var(--fs-xs); font-weight: 700;
          color: var(--amber-deep);
          background: var(--amber-wash); padding: 2px 8px; border-radius: 3px;
        }
        .figure-card.rich-09 .rc-t {
          font-family: var(--mono); font-size: var(--fs-2xs); color: var(--mute);
        }
        .figure-card.rich-09 .rc-label {
          font-family: var(--serif-cn); font-size: var(--fs-sm);
          color: var(--ink); font-weight: 500;
        }
        .figure-card.rich-09 .rc-format {
          font-size: var(--fs-2xs); color: var(--mute);
          margin-bottom: 6px; line-height: 1.55;
        }
        .figure-card.rich-09 .rc-if,
        .figure-card.rich-09 .rc-then {
          font-family: var(--serif-cn); font-size: var(--fs-sm);
          color: var(--ink); line-height: 1.55;
          display: grid; grid-template-columns: 28px 1fr;
          gap: 8px; padding: 3px 0;
          align-items: baseline;
        }
        .figure-card.rich-09 .rc-kw {
          font-family: var(--mono); font-size: var(--fs-2xs);
          color: var(--amber-deep); font-weight: 600;
          background: var(--paper); padding: 2px 4px; border-radius: 3px;
          text-align: center;
        }

        /* v6.5 S2 Bloom 金字塔 */
        .figure-card.rich-04 .bloom-pyramid {
          display: flex; flex-direction: column;
          align-items: center; gap: 6px;
          padding: 14px 0 6px;
        }
        .figure-card.rich-04 .bp-row {
          display: grid; grid-template-columns: 96px 1fr 56px;
          gap: 12px; align-items: center;
          width: 100%; max-width: 380px;
        }
        .figure-card.rich-04 .bp-lvl {
          text-align: right;
          font-family: var(--serif-cn); font-size: var(--fs-sm);
          color: var(--ink); font-weight: 500;
        }
        .figure-card.rich-04 .bp-lvl small {
          font-family: var(--mono); font-size: var(--fs-2xs);
          color: var(--mute); margin-right: 6px;
        }
        .figure-card.rich-04 .bp-bar-wrap {
          display: flex; justify-content: center; align-items: center;
          min-height: 26px;
        }
        .figure-card.rich-04 .bp-bar {
          height: 24px;
          border-radius: 3px;
          display: flex; align-items: center; justify-content: flex-end;
          padding: 0 10px;
          font-family: var(--mono); font-size: var(--fs-2xs);
          color: var(--ivory); font-weight: 700;
          letter-spacing: 0.02em;
          transition: width .3s ease;
          min-width: 36px;
        }
        .figure-card.rich-04 .bp-bar.is-high  { background: var(--amber-deep); }
        .figure-card.rich-04 .bp-bar.is-mid   { background: var(--amber); }
        .figure-card.rich-04 .bp-bar.is-low   { background: var(--sage); }
        .figure-card.rich-04 .bp-bar.is-empty {
          background: transparent;
          border: 1px dashed var(--rule);
          color: var(--mute);
        }
        .figure-card.rich-04 .bp-cov {
          display: flex; gap: 3px; align-items: center;
        }
        .figure-card.rich-04 .bp-cov i {
          width: 10px; height: 10px; border-radius: 2px;
          background: var(--sage); display: inline-block;
        }
        .figure-card.rich-04 .bp-cov i.is-empty {
          background: transparent;
          border: 1px dashed var(--rule);
        }
        .figure-card.rich-04 .bp-meta {
          margin: 12px 22px 4px;
          font-family: var(--mono); font-size: var(--fs-2xs);
          color: var(--mute); letter-spacing: 0.04em;
          text-align: center;
        }
        .figure-card.rich-04 .bp-meta b { color: var(--amber-deep); }

        /* v6.5 S2 目标↔证据 5 对配对 */
        .figure-card.rich-04 .goal-evidence-pairs {
          margin: 14px 22px 6px;
          padding-top: 12px;
          border-top: 1px dashed color-mix(in srgb, var(--amber-deep) 18%, transparent);
        }
        .figure-card.rich-04 .ge-pairs-h {
          font-family: var(--mono); font-size: var(--fs-2xs);
          color: var(--mute); letter-spacing: 0.06em;
          margin-bottom: 10px;
        }
        .figure-card.rich-04 .ge-pair {
          display: grid; grid-template-columns: 1fr 28px 1fr;
          gap: 10px; align-items: center;
          padding: 7px 0;
          font-family: var(--serif-cn); font-size: var(--fs-xs);
          line-height: 1.55;
        }
        .figure-card.rich-04 .ge-pair + .ge-pair {
          border-top: 1px dotted color-mix(in srgb, var(--amber-deep) 12%, transparent);
        }
        .figure-card.rich-04 .ge-goal {
          color: var(--ink); text-align: right;
          font-weight: 500;
        }
        .figure-card.rich-04 .ge-arrow {
          font-family: var(--mono); font-size: var(--fs-sm);
          color: var(--amber-deep);
          text-align: center; font-weight: 600;
        }
        .figure-card.rich-04 .ge-evidence {
          color: var(--ink-soft);
          font-size: var(--fs-xs);
        }

        /* v6.4 S8 议程兑现 5×4 热力矩阵 */
        .figure-card.rich-11 .fulfill-matrix {
          display: grid;
          grid-template-columns: 110px repeat(4, 1fr) 52px;
          gap: 5px 6px;
          padding: 8px 0 4px;
        }
        .figure-card.rich-11 .fm-corner,
        .figure-card.rich-11 .fm-row-h {
          font-family: var(--serif-cn); font-size: var(--fs-xs);
          color: var(--ink); align-self: center;
          padding: 4px 0;
        }
        .figure-card.rich-11 .fm-col-h {
          font-family: var(--mono); font-size: var(--fs-2xs);
          color: var(--mute); letter-spacing: 0.06em;
          text-align: center;
          align-self: end; padding-bottom: 4px;
          font-weight: 600;
        }
        .figure-card.rich-11 .fm-cell {
          height: 28px;
          border-radius: 4px;
          display: flex; align-items: center; justify-content: center;
          font-family: var(--mono); font-size: var(--fs-xs); font-weight: 700;
          transition: transform .14s, box-shadow .14s;
        }
        .figure-card.rich-11 .fm-cell.is-fulfilled {
          background: var(--sage); color: var(--ivory);
        }
        .figure-card.rich-11 .fm-cell.is-empty {
          background: color-mix(in srgb, var(--amber-deep) 4%, transparent);
          border: 1px dashed color-mix(in srgb, var(--amber-deep) 30%, transparent);
          color: var(--mute-2);
        }
        .figure-card.rich-11 .fm-cell:hover {
          transform: translateY(-1px);
          box-shadow: 0 2px 6px rgba(0,0,0,0.12);
        }
        .figure-card.rich-11 .fm-score {
          text-align: center; align-self: center;
          font-family: var(--mono); font-size: var(--fs-xs); font-weight: 700;
          color: var(--ink); padding: 0 4px;
        }
        .figure-card.rich-11 .fm-score.is-low   { color: var(--amber-deep); }
        .figure-card.rich-11 .fm-score.is-full  { color: var(--sage); }
        .figure-card.rich-11 .fm-totals-h {
          padding: 8px 0 0; margin-top: 4px;
          border-top: 1px dashed var(--rule);
          font-family: var(--mono); font-size: var(--fs-2xs);
          color: var(--mute); letter-spacing: 0.04em;
          align-self: center;
        }
        .figure-card.rich-11 .fm-col-total {
          padding: 8px 0 4px; margin-top: 4px;
          border-top: 1px dashed var(--rule);
          text-align: center;
          font-family: var(--mono); font-size: var(--fs-sm); font-weight: 700;
          color: var(--amber-deep);
        }
        .figure-card.rich-11 .fm-corner-bot {
          padding-top: 8px; margin-top: 4px;
          border-top: 1px dashed var(--rule);
        }
        .figure-card.rich-11 .fm-unfulfill-section {
          margin-top: 14px;
          padding-top: 10px;
          border-top: 1px dashed color-mix(in srgb, var(--amber-deep) 18%, transparent);
        }
        .figure-card.rich-11 .fm-unfulfill-h {
          font-family: var(--mono); font-size: var(--fs-2xs);
          color: var(--amber-deep); letter-spacing: 0.06em;
          margin-bottom: 8px;
        }

        /* v6.4 S2 参与度 2×2 象限图 */
        .figure-card.rich-02 .participation-quads {
          display: grid; grid-template-columns: 1fr 1fr;
          gap: 4px; margin: 14px 22px 6px;
          aspect-ratio: 1.6;
          border: 1px solid var(--rule);
          border-radius: 6px;
          position: relative;
        }
        .figure-card.rich-02 .participation-quads::before,
        .figure-card.rich-02 .participation-quads::after {
          content: ""; position: absolute;
          background: var(--rule);
        }
        .figure-card.rich-02 .participation-quads::before {
          left: 50%; top: 6%; bottom: 6%; width: 1px;
        }
        .figure-card.rich-02 .participation-quads::after {
          top: 50%; left: 6%; right: 6%; height: 1px;
        }
        .figure-card.rich-02 .pq-axis-x,
        .figure-card.rich-02 .pq-axis-y {
          position: absolute;
          font-family: var(--mono); font-size: var(--fs-2xs);
          color: var(--mute); letter-spacing: 0.04em;
        }
        .figure-card.rich-02 .pq-axis-x.is-left  { bottom: -16px; left: 2px; }
        .figure-card.rich-02 .pq-axis-x.is-right { bottom: -16px; right: 2px; }
        .figure-card.rich-02 .pq-axis-y.is-top   { top: 2px; left: -54px; }
        .figure-card.rich-02 .pq-axis-y.is-bot   { bottom: 2px; left: -54px; }
        .figure-card.rich-02 .pq-cell {
          padding: 10px 12px;
          display: flex; flex-direction: column;
          justify-content: center; align-items: center;
          gap: 4px;
          font-family: var(--serif-cn); position: relative;
        }
        .figure-card.rich-02 .pq-bubble {
          width: 64px; height: 64px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-family: var(--mono); font-size: var(--fs-md); font-weight: 700;
          color: var(--ivory); position: relative;
          transition: transform .2s;
        }
        .figure-card.rich-02 .pq-bubble:hover { transform: scale(1.08); }
        .figure-card.rich-02 .pq-label {
          font-size: var(--fs-2xs); color: var(--ink); font-weight: 500;
          text-align: center;
        }
        .figure-card.rich-02 .pq-meta {
          margin: 18px 22px 6px;
          font-family: var(--mono); font-size: var(--fs-2xs);
          color: var(--mute); letter-spacing: 0.04em;
        }
        .figure-card.rich-02 .pq-h {
          margin: 14px 22px 0;
          padding-top: 12px;
          border-top: 1px dashed color-mix(in srgb, var(--amber-deep) 18%, transparent);
          font-family: var(--mono); font-size: var(--fs-2xs);
          letter-spacing: 0.08em; color: var(--mute);
        }

        /* v6.4 S5 议程→角色 Sankey 流向图 */
        .figure-card.rich-08 .sankey-wrap {
          margin: 14px 22px 6px; padding-top: 12px;
          border-top: 1px dashed color-mix(in srgb, var(--amber-deep) 18%, transparent);
        }
        .figure-card.rich-08 .sankey-h {
          font-family: var(--mono); font-size: var(--fs-2xs);
          color: var(--mute); letter-spacing: 0.08em;
          margin-bottom: 8px;
        }
        .figure-card.rich-08 .sankey-svg {
          width: 100%; height: auto; display: block;
        }
        .figure-card.rich-08 .sk-agenda-label,
        .figure-card.rich-08 .sk-role-label {
          font-family: var(--serif-cn); font-size: var(--fs-xs);
          fill: var(--ink); font-weight: 500;
        }
        .figure-card.rich-08 .sk-agenda-node {
          fill: color-mix(in srgb, var(--amber-deep) 40%, transparent); stroke: var(--amber-deep);
          stroke-width: 1;
        }
        .figure-card.rich-08 .sk-role-node {
          fill: rgba(106,154,123,0.4); stroke: var(--sage);
          stroke-width: 1;
        }
        .figure-card.rich-08 .sk-flow {
          fill: none; stroke: color-mix(in srgb, var(--amber-deep) 35%, transparent);
          stroke-width: 8; opacity: 0.65;
          transition: opacity .15s, stroke .15s;
        }
        .figure-card.rich-08 .sk-flow:hover {
          opacity: 1; stroke: var(--amber-deep);
        }

        /* v6.5 Dark mode 系统补全 — v6+ 新加的组件统一覆盖 */
        html[data-theme="dark"] .figure-card.rich-04 .bp-lvl { color: var(--ivory); }
        html[data-theme="dark"] .figure-card.rich-04 .bp-lvl small { color: var(--mute-2); }
        html[data-theme="dark"] .figure-card.rich-04 .bp-meta { color: var(--mute-2); }
        html[data-theme="dark"] .figure-card.rich-04 .bp-cov i.is-empty { border-color: color-mix(in srgb, var(--ivory) 16%, transparent); }
        html[data-theme="dark"] .figure-card.rich-04 .goal-evidence-pairs { border-top-color: var(--on-dark-veil); }
        html[data-theme="dark"] .figure-card.rich-04 .ge-pairs-h { color: var(--mute-2); }
        html[data-theme="dark"] .figure-card.rich-04 .ge-pair + .ge-pair { border-top-color: color-mix(in srgb, var(--ivory) 6%, transparent); }
        html[data-theme="dark"] .figure-card.rich-04 .ge-goal { color: var(--ivory); }
        html[data-theme="dark"] .figure-card.rich-04 .ge-evidence { color: var(--on-dark-mute); }
        html[data-theme="dark"] .figure-card.rich-04 .ge-arrow { color: var(--amber-soft); }

        /* S2 参与度象限 dark mode */
        html[data-theme="dark"] .figure-card.rich-02 .participation-quads { border-color: var(--on-dark-veil); }
        html[data-theme="dark"] .figure-card.rich-02 .participation-quads::before,
        html[data-theme="dark"] .figure-card.rich-02 .participation-quads::after { background: var(--on-dark-veil); }
        html[data-theme="dark"] .figure-card.rich-02 .pq-label { color: var(--ivory); }
        html[data-theme="dark"] .figure-card.rich-02 .pq-axis-x,
        html[data-theme="dark"] .figure-card.rich-02 .pq-axis-y { color: var(--mute-2); }
        html[data-theme="dark"] .figure-card.rich-02 .pq-meta { color: var(--mute-2); }
        html[data-theme="dark"] .figure-card.rich-02 .pq-h { color: var(--mute-2); border-top-color: var(--on-dark-veil); }

        /* S5 Sankey dark mode */
        html[data-theme="dark"] .figure-card.rich-08 .sankey-wrap { border-top-color: var(--on-dark-veil); }
        html[data-theme="dark"] .figure-card.rich-08 .sankey-h { color: var(--mute-2); }
        html[data-theme="dark"] .figure-card.rich-08 .sk-agenda-label,
        html[data-theme="dark"] .figure-card.rich-08 .sk-role-label { fill: #faf6ee; }

        /* S6 规则卡片 dark mode */
        html[data-theme="dark"] .figure-card.rich-09 .rule-card { background: color-mix(in srgb, var(--ivory) 4%, transparent); }
        html[data-theme="dark"] .figure-card.rich-09 .rc-id {
          background: color-mix(in srgb, var(--amber) 22%, transparent); color: var(--amber-soft);
        }
        html[data-theme="dark"] .figure-card.rich-09 .rc-t { color: var(--mute-2); }
        html[data-theme="dark"] .figure-card.rich-09 .rc-label { color: var(--ivory); }
        html[data-theme="dark"] .figure-card.rich-09 .rc-format { color: var(--mute-2); }
        html[data-theme="dark"] .figure-card.rich-09 .rc-if,
        html[data-theme="dark"] .figure-card.rich-09 .rc-then { color: var(--on-dark); }
        html[data-theme="dark"] .figure-card.rich-09 .rc-kw {
          background: color-mix(in srgb, var(--ivory) 6%, transparent); color: var(--amber-soft);
        }

        /* S8 议程兑现矩阵 dark mode */
        html[data-theme="dark"] .figure-card.rich-11 .fm-corner,
        html[data-theme="dark"] .figure-card.rich-11 .fm-row-h { color: var(--ivory); }
        html[data-theme="dark"] .figure-card.rich-11 .fm-col-h,
        html[data-theme="dark"] .figure-card.rich-11 .fm-totals-h { color: var(--mute-2); }
        html[data-theme="dark"] .figure-card.rich-11 .fm-cell.is-empty {
          background: color-mix(in srgb, var(--ivory) 4%, transparent);
          border-color: color-mix(in srgb, var(--ivory) 18%, transparent);
        }
        html[data-theme="dark"] .figure-card.rich-11 .fm-score { color: var(--ivory); }
        html[data-theme="dark"] .figure-card.rich-11 .fm-dim-total,
        html[data-theme="dark"] .figure-card.rich-11 .fm-col-total {
          border-top-color: var(--on-dark-veil);
          color: var(--amber-soft);
        }
        html[data-theme="dark"] .figure-card.rich-11 .fm-corner-bot { border-top-color: var(--on-dark-veil); }
        html[data-theme="dark"] .figure-card.rich-11 .fm-unfulfill-section { border-top-color: var(--on-dark-veil); }

        /* v6+ 题链 controls dark mode 补充 */
        html[data-theme="dark"] .qstep-reset { color: var(--mute-2); border-color: var(--on-dark-veil); }
        html[data-theme="dark"] .qstep-reset:hover { color: var(--amber-soft); background: color-mix(in srgb, var(--amber) 10%, transparent); border-color: var(--amber-soft); }
        html[data-theme="dark"] .chain-completed-cta { border-top-color: var(--on-dark-veil); }
        html[data-theme="dark"] .chain-reflection-helper { color: var(--mute-2); }
        html[data-theme="dark"] .chain-wrong-toast {
          background: color-mix(in srgb, var(--amber) 12%, transparent); color: var(--amber-soft);
        }
        html[data-theme="dark"] .chain-q-actions { border-top-color: var(--on-dark-veil); }
        html[data-theme="dark"] .chain-q-actions .chain-meta { color: var(--mute-2); }
        html[data-theme="dark"] .chain-transfer-saved-note {
          background: rgba(106,154,123,.10); color: var(--on-dark);
        }

        /* v6.3: figure cell ↔ question 选项 hover 联动高亮 */
        .chain-q-opts li.is-hover-linked {
          background: var(--amber-wash);
          border-color: var(--amber-deep);
          transform: translateX(2px);
        }
        .figure-card.rich-01 .rm-col-h.is-hover-linked,
        .figure-card.rich-01 .rm-cell.is-hover-linked,
        .figure-card.rich-01 .rm-total.is-hover-linked,
        .figure-card.rich-01 .rm-status.is-hover-linked {
          box-shadow: 0 0 0 2px var(--amber-deep);
          z-index: 2; position: relative;
        }
        .figure-card.rich-01 .rm-cell.is-hover-linked .rm-bar {
          opacity: 0.85;
        }

        /* 反思梯度 helper */
        .chain-reflection-helper {
          margin: 8px 0 0;
          font-family: var(--mono); font-size: var(--fs-2xs);
          color: var(--mute); letter-spacing: 0.02em;
        }
        .chain-reflection-helper b { color: var(--amber-deep); font-weight: 500; }

        /* ── v6: Q3 反思 / Q4 迁移 内嵌 question-card 样式 ── */
        .chain-q-reflection textarea,
        .chain-q-transfer textarea {
          width: 100%; box-sizing: border-box;
          min-height: 96px; padding: 12px 14px;
          font-family: var(--serif-cn); font-size: var(--fs-sm);
          line-height: 1.7; color: var(--ink);
          background: var(--ivory);
          border: 1px solid var(--rule); border-radius: 6px;
          resize: vertical;
          margin-top: 10px;
        }
        .chain-q-reflection textarea:focus,
        .chain-q-transfer textarea:focus {
          border-color: var(--amber-deep); outline: none;
        }
        .chain-q-actions {
          margin-top: 12px; padding-top: 12px;
          border-top: 1px dashed var(--rule);
          display: flex; gap: 10px;
          align-items: center; justify-content: flex-end;
        }
        .chain-q-actions .chain-meta {
          margin-right: auto;
          font-family: var(--mono); font-size: var(--fs-2xs);
          color: var(--mute); letter-spacing: 0.04em;
        }
        .chain-q-actions .btn-s.chain-save {
          font-family: var(--mono); font-size: var(--fs-xs);
          padding: 6px 16px;
          background: var(--amber-deep); color: var(--ivory);
          border: 1px solid var(--amber-deep); border-radius: 4px;
          cursor: pointer; letter-spacing: 0.04em;
          transition: background .14s;
        }
        .chain-q-actions .btn-s.chain-save:hover {
          background: var(--maroon);
        }
        .chain-q-actions .btn-s.chain-save[disabled] {
          background: var(--paper-3); color: var(--mute-2);
          border-color: var(--rule); cursor: not-allowed;
        }
        .chain-q-scaffold {
          margin: 10px 0 12px; padding: 10px 14px;
          background: var(--paper-2); border-left: 2px solid var(--sage);
          border-radius: 0 4px 4px 0;
          font-family: var(--serif-cn); font-size: var(--fs-xs);
          color: var(--ink-soft); line-height: 1.7;
        }
        .chain-q-scaffold ul { margin: 0; padding-left: 18px; }
        .chain-q-scaffold li + li { margin-top: 4px; }
        html[data-theme="dark"] .chain-q-reflection textarea,
        html[data-theme="dark"] .chain-q-transfer textarea {
          background: #211f1d; color: var(--ivory); border-color: var(--on-dark-veil);
        }

        /* ── Inline decision dock (Q3 嵌进 question-card) ── */
        .chain-q-decision .chain-q-trans {
          font-family: var(--mono); font-size: var(--fs-2xs); color: var(--mute);
          letter-spacing: 0.04em; margin: 6px 0 10px;
        }
        .decision-dock.decision-dock-inline {
          margin: 12px 0 0; padding: 0;
          background: transparent; border: none;
        }
        .decision-dock.decision-dock-inline .dd-actions {
          flex-direction: column; align-items: stretch; gap: 8px;
          padding-top: 10px; border-top: 1px dashed var(--rule);
        }
        .decision-dock.decision-dock-inline .dd-actions .btn-s.dd-opt {
          text-align: left; padding: 12px 16px;
          font-family: var(--serif-cn); font-size: var(--fs-md);
          line-height: 1.55;
          background: var(--paper); color: var(--ink);
          border: 1px solid var(--rule); border-radius: 6px;
          cursor: pointer; transition: all .14s;
        }
        .decision-dock.decision-dock-inline .dd-actions .btn-s.dd-opt:hover {
          border-color: var(--amber-soft);
          background: color-mix(in srgb, var(--amber) 4%, transparent);
        }
        .decision-dock.decision-dock-inline .dd-actions .btn-s.dd-opt.is-selected {
          border-color: var(--amber-deep); background: var(--amber-wash);
          color: var(--amber-deep); font-weight: 500;
        }
        .decision-dock.decision-dock-inline .dd-actions .btn-s.fill {
          align-self: flex-end; margin-top: 6px;
          padding: 6px 14px;
        }
        html[data-theme="dark"] .decision-dock.decision-dock-inline .dd-actions .btn-s.dd-opt {
          background: #2a2722; color: var(--on-dark); border-color: var(--on-dark-veil);
        }
        html[data-theme="dark"] .decision-dock.decision-dock-inline .dd-actions .btn-s.dd-opt:hover {
          background: color-mix(in srgb, var(--amber) 8%, transparent);
        }

        /* ── Locked artifact (chain mode + Q4 未完成) ── */
        .artifact.is-chain-locked {
          opacity: 0.55; position: relative;
        }
        /* v6.3: 已依教师决策成稿的产物卡 —— 与"待生成"的模板态区分开 */
        .artifact.is-drafted { border-color: var(--sage); }
        .artifact.is-drafted .artifact-h { color: var(--ink); }
        .artifact-body .dim { color: var(--mute-2); font-style: italic; }
        .artifact.is-chain-locked .artifact-body,
        .artifact.is-chain-locked button[data-artifact-id] {
          pointer-events: none;
        }
        .artifact-chain-lock {
          padding: 10px 16px;
          background: var(--amber-wash);
          border-bottom: 1px dashed var(--amber-deep);
          font-family: var(--mono); font-size: var(--fs-2xs);
          letter-spacing: 0.04em; color: var(--amber-deep);
          display: flex; align-items: center; gap: 8px;
        }
        .artifact-chain-lock::before { content: "🔒"; font-size: var(--fs-2xs); }
        html[data-theme="dark"] .artifact-chain-lock {
          background: color-mix(in srgb, var(--amber) 12%, transparent);
        }

        /* ── Locked decision dock (Q1/Q2 期间，独立 dock 路径已废弃,留 CSS 兜底) ── */
        .decision-dock.is-chain-locked {
          opacity: 0.55;
          position: relative;
        }
        .decision-dock.is-chain-locked::after {
          content: "请先完成读图与诊断题（Q1 / Q2）才能拍板";
          position: absolute; top: 50%; left: 0; right: 0;
          transform: translateY(-50%);
          text-align: center;
          font-family: var(--mono); font-size: var(--fs-2xs); letter-spacing: 0.06em;
          color: var(--amber-deep);
          background: color-mix(in srgb, var(--ivory) 92%, transparent);
          padding: 6px 0;
          pointer-events: none;
        }
        .decision-dock.is-chain-locked .dd-actions { pointer-events: none; }

        /* ── 证据门禁：缺上游证据/前置未完成 → 可浏览，但不可拍板/生成产物 ── */
        #stationDetail.is-evidence-locked .decision-dock { opacity: 0.5; position: relative; pointer-events: none; }
        #stationDetail.is-evidence-locked .decision-dock::after {
          content: "🔒 需先补齐上游证据，方可拍板并保存判断";
          position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
          font-family: var(--mono); font-size: var(--fs-2xs); letter-spacing: 0.05em;
          color: var(--amber-deep); background: color-mix(in srgb, var(--ivory) 86%, transparent); text-align: center; padding: 6px 10px; pointer-events: none;
        }
        #stationDetail.is-evidence-locked .artifact { opacity: 0.55; position: relative; }
        #stationDetail.is-evidence-locked .artifact .artifact-body,
        #stationDetail.is-evidence-locked .artifact button[data-artifact-id] { pointer-events: none; }
        .evidence-gate { margin: 0 0 14px; padding: 12px 16px; border-radius: 12px; background: var(--amber-wash); border: 1px solid var(--amber-deep); color: var(--ink); font-size: var(--fs-sm); line-height: 1.55; }
        .evidence-gate .eg-h { display: flex; align-items: center; gap: 8px; font-weight: 600; color: var(--amber-deep); margin-bottom: 4px; }
        .evidence-gate .eg-h::before { content: "⚠"; }
        .evidence-gate .eg-note { color: var(--ink-soft); font-size: var(--fs-xs); margin-bottom: 8px; }
        .evidence-gate .eg-list { display: flex; flex-direction: column; gap: 7px; }
        .evidence-gate .eg-row { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
        .evidence-gate .eg-go { font: var(--fs-2xs)/1.1 var(--mono); padding: 4px 11px; border: 1px solid var(--amber-deep); border-radius: 999px; color: var(--amber-deep); background: transparent; cursor: pointer; }
        .evidence-gate .eg-go:hover { background: var(--amber-deep); color: #fff; }
        .evidence-gate .eg-prod { color: var(--mute-2); font: var(--fs-2xs) var(--mono); }
        .evidence-gate.eg-sub { background: rgba(112,82,168,0.09); border-color: var(--violet); }
        .evidence-gate.eg-sub .eg-h { color: var(--violet); }
        .tile.is-locked { opacity: 0.62; }
        .tile.is-locked .t-lock { margin-left: 3px; font-size: var(--fs-2xs); opacity: 0.85; }

        /* ── Chain extras (Q3 reflection + Q4 transfer) ── */
        .chain-extras { margin-top: 18px; display: flex; flex-direction: column; gap: 14px; }
        .chain-card {
          border: 1px solid var(--rule); border-radius: 10px;
          background: var(--paper); padding: 14px 16px;
        }
        .chain-card-h {
          display: flex; justify-content: space-between; align-items: center;
          font-family: var(--mono); font-size: var(--fs-2xs); letter-spacing: 0.08em;
          text-transform: uppercase; color: var(--mute);
          padding-bottom: 8px; border-bottom: 1px solid var(--rule);
          margin-bottom: 10px;
        }
        .chain-card-h b { color: var(--ink); }
        .chain-card-stem {
          font-family: var(--serif-cn); font-size: var(--fs-sm); color: var(--ink);
          line-height: 1.7; margin: 0 0 12px;
        }
        .chain-card-scaffold {
          margin: 10px 0 12px; padding: 10px 14px;
          background: var(--paper-2); border-left: 2px solid var(--sage);
          border-radius: 0 4px 4px 0;
          font-family: var(--serif-cn); font-size: var(--fs-xs); color: var(--ink-soft);
          line-height: 1.7;
        }
        .chain-card-scaffold ul { margin: 0; padding-left: 18px; }
        .chain-card-scaffold li + li { margin-top: 4px; }
        .chain-card textarea {
          width: 100%; box-sizing: border-box;
          min-height: 80px; padding: 12px 14px;
          font-family: var(--serif-cn); font-size: var(--fs-sm); color: var(--ink);
          line-height: 1.65;
          background: var(--ivory); border: 1px solid var(--rule);
          border-radius: 6px; resize: vertical;
        }
        .chain-card textarea:focus { border-color: var(--amber-deep); outline: none; }
        .chain-card-actions {
          margin-top: 10px; display: flex; gap: 10px; align-items: center;
          justify-content: flex-end;
        }
        .chain-card-actions .chain-meta {
          margin-right: auto; font-family: var(--mono); font-size: var(--fs-2xs); color: var(--mute);
        }
        .chain-card .btn-s.chain-save {
          font-family: var(--mono); font-size: var(--fs-2xs); padding: 5px 12px;
          background: var(--amber-deep); color: var(--ivory);
          border: 1px solid var(--amber-deep); border-radius: 4px;
          cursor: pointer; letter-spacing: 0.04em;
        }
        .chain-card .btn-s.chain-save[disabled] {
          background: var(--paper-3); color: var(--mute-2);
          border-color: var(--rule); cursor: not-allowed;
        }
        .chain-card.is-saved {
          border-color: var(--sage); background: rgba(106,154,123,0.04);
        }
        .chain-card.is-saved .chain-card-h::after {
          content: "✓ 已保存"; color: var(--sage); font-weight: 600;
        }

        /* ── Consent card (fixed bottom-right) ── */
        .consent-card {
          position: fixed; bottom: 24px; right: 24px; z-index: 9000;
          width: 340px; max-width: calc(100vw - 32px);
          background: var(--ivory); border: 1px solid var(--ink);
          border-radius: 12px; padding: 14px 16px;
          box-shadow: 6px 6px 0 var(--ink);
          font-family: var(--serif-cn); animation: pplFadeIn .22s ease-out;
        }
        .consent-card.is-leaving { opacity: 0; transform: translateY(8px); transition: all .2s; }
        .consent-head {
          display: flex; justify-content: space-between; align-items: center;
          margin-bottom: 8px;
        }
        .consent-tag {
          font-family: var(--mono); font-size: var(--fs-2xs); letter-spacing: 0.08em;
          color: var(--amber-deep); font-weight: 600;
        }
        .consent-close {
          background: none; border: none; font-size: var(--fs-lg);
          color: var(--mute); cursor: pointer; line-height: 1;
          padding: 0 4px;
        }
        .consent-body .consent-lead {
          font-family: var(--serif-cn); font-size: var(--fs-sm); font-weight: 600;
          color: var(--ink); margin: 0 0 6px;
        }
        .consent-body .consent-text {
          font-size: var(--fs-xs); color: var(--ink-soft); line-height: 1.55;
          margin: 0 0 6px;
        }
        .consent-body .consent-note {
          font-family: var(--mono); font-size: var(--fs-2xs); color: var(--mute);
          letter-spacing: 0.04em; margin: 6px 0 0;
        }
        .consent-actions {
          margin-top: 10px; display: flex; gap: 8px; justify-content: flex-end;
        }
        .consent-actions .btn-s {
          font-family: var(--mono); font-size: var(--fs-2xs); padding: 5px 12px;
          border-radius: 4px; cursor: pointer; letter-spacing: 0.04em;
          border: 1px solid var(--rule); background: var(--paper); color: var(--ink);
        }
        .consent-actions .consent-accept {
          background: var(--amber-deep); color: var(--ivory);
          border-color: var(--amber-deep);
        }

        /* ── Dark mode 覆盖 ── */
        html[data-theme="dark"] .chain-q-stem { background: color-mix(in srgb, var(--amber) 10%, transparent); color: var(--ivory); }
        html[data-theme="dark"] .chain-q-opts li { background: #2a2722; border-color: var(--on-dark-veil); color: var(--on-dark); }
        html[data-theme="dark"] .chain-q-opts li:hover { background: color-mix(in srgb, var(--amber) 8%, transparent); }
        html[data-theme="dark"] .chain-q-opts li.is-correct { background: rgba(106,154,123,0.12); color: var(--ivory); }
        html[data-theme="dark"] .chain-q-opts li.is-wrong { background: color-mix(in srgb, var(--amber-deep) 10%, transparent); color: var(--mute-2); }
        html[data-theme="dark"] .chain-hint-drawer { background: color-mix(in srgb, var(--ivory) 4%, transparent); color: var(--on-dark-mute); }
        html[data-theme="dark"] .chain-card { background: #2a2722; border-color: var(--on-dark-veil); }
        html[data-theme="dark"] .chain-card-stem { color: var(--ivory); }
        html[data-theme="dark"] .chain-card textarea { background: #211f1d; color: var(--ivory); border-color: var(--on-dark-veil); }
        html[data-theme="dark"] .consent-card { background: #211f1d; border-color: color-mix(in srgb, var(--ivory) 16%, transparent); color: var(--ivory); }
        html[data-theme="dark"] .consent-body .consent-lead { color: var(--ivory); }
        html[data-theme="dark"] .consent-body .consent-text { color: var(--on-dark); }
        html[data-theme="dark"] .decision-dock.is-chain-locked::after { background: rgba(33,31,29,0.92); color: var(--amber-soft); }

        /* ── S1 三角图气泡 + 4 类定位排序条形图 (A+B 优化) ── */
        .figure-card.rich-01 .bubble .bubble-fill { transition: r .3s ease; }
        .figure-card.rich-01 .bubble.is-top .bubble-fill { fill: var(--amber-deep); }
        .figure-card.rich-01 .bubble.is-top .bubble-halo {
          fill: var(--amber-deep); opacity: 0.18;
        }
        .figure-card.rich-01 .bubble.is-ok .bubble-fill { fill: var(--sage); }
        .figure-card.rich-01 .bubble.is-warn .bubble-fill {
          fill: color-mix(in srgb, var(--amber) 42%, transparent);
          stroke: var(--amber-deep);
          stroke-width: 1.2;
          stroke-dasharray: 2,2;
        }
        .figure-card.rich-01 .bubble .bubble-val {
          fill: #fff; font-family: var(--mono);
          font-size: var(--fs-2xs); font-weight: 700;
          pointer-events: none;
        }
        .figure-card.rich-01 .bubble.is-warn .bubble-val { fill: var(--ink); }
        .figure-card.rich-01 .bubble .bubble-name {
          fill: var(--ink);
          font-family: var(--serif-cn);
          font-size: var(--fs-2xs);
          font-weight: 500;
          pointer-events: none;
        }
        .figure-card.rich-01 .bubble.is-top .bubble-name {
          fill: var(--amber-deep);
          font-weight: 600;
        }

        /* 4 类定位排序条形图 */
        .figure-card.rich-01 .loc-bars {
          padding: 10px 16px 4px;
          margin-top: 4px;
          border-top: 1px dashed color-mix(in srgb, var(--amber-deep) 18%, transparent);
        }
        .figure-card.rich-01 .loc-bars-h {
          font-family: var(--mono); font-size: var(--fs-2xs);
          letter-spacing: 0.06em; color: var(--mute);
          margin-bottom: 10px;
          display: flex; justify-content: space-between; align-items: center;
          gap: 12px; flex-wrap: wrap;
        }
        .figure-card.rich-01 .loc-expand-all {
          font-family: var(--mono); font-size: var(--fs-2xs);
          padding: 5px 12px; cursor: pointer;
          background: var(--paper); color: var(--amber-deep);
          border: 1px solid var(--amber-deep); border-radius: 4px;
          letter-spacing: 0.04em; white-space: nowrap;
          transition: background .12s, color .12s;
        }
        .figure-card.rich-01 .loc-expand-all:hover { background: var(--amber-wash); }
        .figure-card.rich-01 .loc-expand-all .arrow {
          display: inline-block; transition: transform .2s; margin-left: 4px;
        }
        .figure-card.rich-01 .loc-expand-all.is-all-open .arrow { transform: rotate(180deg); }
        .figure-card.rich-01 .loc-row {
          display: grid; grid-template-columns: 90px 1fr 32px 1.3fr 16px;
          gap: 10px; align-items: center; padding: 5px 0;
          font-size: var(--fs-sm);
        }
        .figure-card.rich-01 .loc-toggle {
          font-family: var(--mono); font-size: var(--fs-sm);
          color: var(--mute); text-align: center; line-height: 1;
          transition: transform .2s ease;
        }
        .figure-card.rich-01 .loc-detail[open] .loc-toggle { transform: rotate(180deg); }
        .figure-card.rich-01 .loc-summary {
          list-style: none; cursor: pointer;
          padding: 0; margin: 0;
        }
        .figure-card.rich-01 .loc-summary::-webkit-details-marker { display: none; }
        .figure-card.rich-01 .loc-summary::marker { display: none; }
        .figure-card.rich-01 .loc-summary:hover .loc-toggle {
          color: var(--amber-deep);
        }
        .figure-card.rich-01 .loc-detail {
          padding: 0;
        }
        .figure-card.rich-01 .loc-detail[open] {
          background: color-mix(in srgb, var(--amber-deep) 2.5%, transparent);
          border-radius: 4px;
          padding: 0 4px;
        }

        /* 5 维 rubric breakdown — 适老化字号:dim 13px / val 12px / note 12.5px */
        .figure-card.rich-01 .loc-breakdown {
          padding: 8px 0 12px 90px;
          margin: 4px 0 8px;
          border-left: 2px solid color-mix(in srgb, var(--amber-deep) 18%, transparent);
          margin-left: 4px;
        }
        .figure-card.rich-01 .loc-breakdown.is-top { border-left-color: var(--amber-deep); }
        .figure-card.rich-01 .loc-breakdown.is-ok  { border-left-color: var(--sage); }
        .figure-card.rich-01 .loc-breakdown.is-warn { border-left-color: color-mix(in srgb, var(--amber) 50%, transparent); }
        .figure-card.rich-01 .bd-row {
          display: grid; grid-template-columns: 110px 1fr 54px 1.4fr;
          gap: 10px; align-items: center; padding: 3px 8px;
          font-size: var(--fs-xs);
        }
        .figure-card.rich-01 .bd-dim {
          font-family: var(--serif-cn);
          font-size: var(--fs-xs);
          color: var(--ink-soft);
        }
        .figure-card.rich-01 .bd-track {
          height: 6px; background: color-mix(in srgb, var(--amber-deep) 5%, transparent);
          border-radius: 3px; overflow: hidden;
        }
        .figure-card.rich-01 .bd-track i {
          display: block; height: 100%; transition: width .35s ease;
        }
        .figure-card.rich-01 .loc-breakdown.is-top .bd-track i { background: var(--amber-deep); }
        .figure-card.rich-01 .loc-breakdown.is-ok .bd-track i  { background: var(--sage); }
        .figure-card.rich-01 .loc-breakdown.is-warn .bd-track i { background: color-mix(in srgb, var(--amber) 50%, transparent); }
        .figure-card.rich-01 .bd-val {
          font-family: var(--mono); font-size: var(--fs-2xs);
          text-align: right; color: var(--ink); font-weight: 600;
        }
        .figure-card.rich-01 .bd-note {
          font-family: var(--serif-cn);
          color: var(--mute); font-size: var(--fs-xs);
          line-height: 1.55;
        }
        html[data-theme="dark"] .figure-card.rich-01 .loc-detail[open] { background: color-mix(in srgb, var(--ivory) 4%, transparent); }
        html[data-theme="dark"] .figure-card.rich-01 .loc-breakdown { border-left-color: color-mix(in srgb, var(--ivory) 18%, transparent); }
        html[data-theme="dark"] .figure-card.rich-01 .bd-dim { color: var(--on-dark-mute); }
        html[data-theme="dark"] .figure-card.rich-01 .bd-val { color: var(--ivory); }
        html[data-theme="dark"] .figure-card.rich-01 .bd-note { color: var(--mute-2); }
        html[data-theme="dark"] .figure-card.rich-01 .bd-track { background: color-mix(in srgb, var(--ivory) 6%, transparent); }
        .figure-card.rich-01 .loc-name {
          font-family: var(--serif-cn);
          color: var(--ink); font-weight: 500;
        }
        .figure-card.rich-01 .loc-track {
          height: 8px; background: color-mix(in srgb, var(--amber-deep) 5%, transparent);
          border-radius: 4px; overflow: hidden;
        }
        .figure-card.rich-01 .loc-fill {
          display: block; height: 100%;
          background: var(--mute-2);
          transition: width .35s ease;
        }
        .figure-card.rich-01 .loc-row.is-top .loc-fill { background: var(--amber-deep); }
        .figure-card.rich-01 .loc-row.is-ok .loc-fill  { background: var(--sage); }
        .figure-card.rich-01 .loc-row.is-warn .loc-fill { background: color-mix(in srgb, var(--amber) 50%, transparent); }
        .figure-card.rich-01 .loc-val {
          font-family: var(--mono); font-size: var(--fs-xs);
          text-align: right; color: var(--ink); font-weight: 600;
        }
        .figure-card.rich-01 .loc-row.is-top .loc-val { color: var(--amber-deep); }
        .figure-card.rich-01 .loc-note {
          font-family: var(--serif-cn);
          color: var(--mute); font-size: var(--fs-xs);
          line-height: 1.55;
        }
        .figure-card.rich-01 .loc-row.is-top .loc-name {
          color: var(--amber-deep); font-weight: 600;
        }
        html[data-theme="dark"] .figure-card.rich-01 .loc-name { color: var(--ivory); }
        html[data-theme="dark"] .figure-card.rich-01 .loc-val { color: var(--ivory); }
        html[data-theme="dark"] .figure-card.rich-01 .loc-note { color: var(--mute-2); }
        html[data-theme="dark"] .figure-card.rich-01 .loc-bars { border-top-color: var(--on-dark-veil); }
        html[data-theme="dark"] .figure-card.rich-01 .loc-track { background: color-mix(in srgb, var(--ivory) 6%, transparent); }
        html[data-theme="dark"] .figure-card.rich-01 .bubble .bubble-name { fill: #faf6ee; }

        /* ── 候选 1：5×4 评分矩阵（替代三角图 + 4 类条形图 + breakdown 抽屉）── */
        .figure-card.rich-01 .alignment-note {
          margin: 6px 0 14px;
          padding: 10px 14px;
          background: var(--paper-2);
          border-left: 3px solid var(--amber-deep);
          border-radius: 0 6px 6px 0;
          font-family: var(--serif-cn);
          font-size: var(--fs-xs);
          line-height: 1.7;
          color: var(--ink-soft);
        }
        .figure-card.rich-01 .alignment-note b {
          color: var(--amber-deep); font-weight: 600;
        }
        .figure-card.rich-01 .rubric-matrix {
          display: grid;
          grid-template-columns: 100px repeat(4, 1fr);
          gap: 4px 6px;
          padding: 6px 0 10px;
        }
        .figure-card.rich-01 .rm-corner {
          font-family: var(--mono); font-size: var(--fs-2xs);
          letter-spacing: 0.04em; color: var(--mute);
          align-self: end; padding-bottom: 6px;
        }
        .figure-card.rich-01 .rm-col-h {
          padding: 6px 4px;
          border-radius: 4px;
          border: 1px solid transparent;
          background: var(--paper-2);
          cursor: pointer;
          font-family: var(--serif-cn);
          font-size: var(--fs-sm); font-weight: 500;
          color: var(--ink);
          text-align: center;
          transition: all .14s;
        }
        .figure-card.rich-01 .rm-col-h:hover {
          background: var(--amber-wash);
          border-color: var(--amber-soft);
        }
        .figure-card.rich-01 .rm-col-h.is-top {
          background: var(--amber-wash);
          border-color: var(--amber-deep);
          color: var(--amber-deep); font-weight: 600;
        }
        .figure-card.rich-01 .rm-col-h.is-current {
          box-shadow: 0 0 0 2px var(--amber-deep);
          outline: none;
        }
        .figure-card.rich-01 .rm-dim {
          font-family: var(--serif-cn);
          font-size: var(--fs-xs);
          color: var(--ink-soft);
          align-self: center;
          line-height: 1.4;
        }
        .figure-card.rich-01 .rm-dim-total,
        .figure-card.rich-01 .rm-dim-status {
          font-family: var(--mono);
          font-size: var(--fs-2xs);
          letter-spacing: 0.04em;
          color: var(--mute);
        }
        .figure-card.rich-01 .rm-dim-total {
          padding-top: 6px;
          border-top: 1px dashed var(--rule);
          margin-top: 4px;
        }
        .figure-card.rich-01 .rm-cell {
          position: relative;
          height: 26px;
          background: color-mix(in srgb, var(--amber-deep) 4%, transparent);
          border-radius: 3px;
          overflow: hidden;
          display: flex; align-items: center; justify-content: flex-end;
          padding: 0 8px;
          cursor: pointer;
          transition: transform .12s, box-shadow .12s;
        }
        .figure-card.rich-01 .rm-cell:hover {
          transform: translateY(-1px);
          box-shadow: 0 2px 6px color-mix(in srgb, var(--amber-deep) 18%, transparent);
        }
        .figure-card.rich-01 .rm-cell .rm-bar {
          position: absolute; left: 0; top: 0; bottom: 0;
          display: block;
          background: color-mix(in srgb, var(--amber-deep) 10%, transparent);
          transition: width .35s ease;
        }
        .figure-card.rich-01 .rm-cell.is-top .rm-bar  { background: color-mix(in srgb, var(--amber-deep) 30%, transparent); }
        .figure-card.rich-01 .rm-cell.is-ok .rm-bar   { background: rgba(106,154,123,0.28); }
        .figure-card.rich-01 .rm-cell.is-warn .rm-bar { background: color-mix(in srgb, var(--amber) 22%, transparent); }
        .figure-card.rich-01 .rm-cell .rm-num {
          position: relative; z-index: 1;
          font-family: var(--mono); font-size: var(--fs-sm); font-weight: 600;
          color: var(--ink);
        }
        .figure-card.rich-01 .rm-cell.is-top .rm-num {
          color: var(--amber-deep); font-weight: 700;
        }
        .figure-card.rich-01 .rm-total {
          padding: 6px 4px;
          text-align: center;
          font-family: var(--mono);
          font-size: var(--fs-md); font-weight: 700;
          color: var(--ink);
          margin-top: 4px;
        }
        .figure-card.rich-01 .rm-total.is-top {
          color: var(--amber-deep);
          background: var(--amber-wash);
          border-radius: 4px;
        }
        .figure-card.rich-01 .rm-total.is-warn { color: var(--mute-2); }
        .figure-card.rich-01 .rm-status {
          padding: 2px 4px;
          text-align: center;
          font-family: var(--mono);
          font-size: var(--fs-2xs);
          letter-spacing: 0.04em;
        }
        .figure-card.rich-01 .rm-status.is-top  { color: var(--amber-deep); font-weight: 600; }
        .figure-card.rich-01 .rm-status.is-ok   { color: var(--mute); }
        .figure-card.rich-01 .rm-status.is-warn { color: var(--mute-2); }

        /* 详情区 */
        .figure-card.rich-01 .rm-detail {
          margin: 8px 0 12px;
          padding-top: 12px;
          border-top: 1px dashed var(--rule);
        }
        .figure-card.rich-01 .rm-detail-pane { display: none; }
        .figure-card.rich-01 .rm-detail-pane[data-active] { display: block; }
        .figure-card.rich-01 .rm-detail-h {
          display: flex; justify-content: space-between; align-items: baseline;
          flex-wrap: wrap; gap: 8px;
          margin-bottom: 10px;
          padding-bottom: 6px;
          border-bottom: 1px solid var(--rule);
        }
        .figure-card.rich-01 .rm-detail-h span {
          font-family: var(--serif-cn); font-size: var(--fs-sm);
          color: var(--ink); font-weight: 600;
        }
        .figure-card.rich-01 .rm-detail-h small {
          font-family: var(--serif-cn); font-size: var(--fs-xs);
          font-style: italic; color: var(--amber-deep);
        }
        .figure-card.rich-01 .rm-detail-list {
          list-style: none; padding: 0; margin: 0;
        }
        .figure-card.rich-01 .rm-detail-list li {
          display: grid;
          grid-template-columns: 110px 50px 1fr;
          gap: 10px;
          padding: 5px 0;
          font-size: var(--fs-xs);
          line-height: 1.55;
        }
        .figure-card.rich-01 .rm-detail-list li + li {
          border-top: 1px dotted color-mix(in srgb, var(--amber-deep) 12%, transparent);
        }
        .figure-card.rich-01 .rm-dt-dim {
          font-family: var(--serif-cn); font-size: var(--fs-xs);
          color: var(--ink-soft);
        }
        .figure-card.rich-01 .rm-dt-val {
          font-family: var(--mono); font-size: var(--fs-2xs);
          color: var(--amber-deep); font-weight: 600;
          text-align: right;
        }
        .figure-card.rich-01 .rm-dt-note {
          font-family: var(--serif-cn); color: var(--mute);
          font-size: var(--fs-xs); line-height: 1.6;
        }

        /* dark mode */
        html[data-theme="dark"] .figure-card.rich-01 .alignment-note {
          background: color-mix(in srgb, var(--ivory) 5%, transparent); color: var(--on-dark-mute);
        }
        html[data-theme="dark"] .figure-card.rich-01 .rm-col-h {
          background: color-mix(in srgb, var(--ivory) 5%, transparent); color: var(--ivory);
        }
        html[data-theme="dark"] .figure-card.rich-01 .rm-col-h:hover {
          background: color-mix(in srgb, var(--amber) 18%, transparent);
        }
        html[data-theme="dark"] .figure-card.rich-01 .rm-cell { background: color-mix(in srgb, var(--ivory) 5%, transparent); }
        html[data-theme="dark"] .figure-card.rich-01 .rm-cell .rm-num { color: var(--ivory); }
        html[data-theme="dark"] .figure-card.rich-01 .rm-total { color: var(--ivory); }
        html[data-theme="dark"] .figure-card.rich-01 .rm-dim { color: var(--on-dark-mute); }
        html[data-theme="dark"] .figure-card.rich-01 .rm-dt-dim { color: var(--on-dark-mute); }
        html[data-theme="dark"] .figure-card.rich-01 .rm-dt-note { color: var(--mute-2); }

        /* 前后节承接 折叠抽屉(替代原 spiral-context 永远展开) */
        .figure-card.rich-01 .spiral-disclosure {
          margin-top: 12px;
          border-top: 1px dashed color-mix(in srgb, var(--amber-deep) 18%, transparent);
          padding-top: 10px;
        }
        .figure-card.rich-01 .spiral-summary {
          list-style: none; cursor: pointer;
          padding: 6px 0;
          font-family: var(--mono); font-size: var(--fs-2xs);
          letter-spacing: 0.04em; color: var(--mute);
          display: flex; align-items: center; gap: 6px;
        }
        .figure-card.rich-01 .spiral-summary::-webkit-details-marker { display: none; }
        .figure-card.rich-01 .spiral-summary::marker { display: none; }
        .figure-card.rich-01 .spiral-summary .arrow {
          display: inline-block; transition: transform .2s;
        }
        .figure-card.rich-01 .spiral-disclosure[open] .spiral-summary .arrow {
          transform: rotate(180deg);
        }
        .figure-card.rich-01 .spiral-summary:hover { color: var(--amber-deep); }
      `;
      document.head.appendChild(st);
    })();

    const TOTAL = STATIONS.length; // 11

    // ---- Presentation labels (not in contract — display choices) ----
    // 学术化命名：cn 为站名简称（4-5 字），em 为关键子维度
    const TILE_LABELS = {
      1:  { cn: "课程定位",   em: "任务分析" },
      2:  { cn: "学情分析",   em: "先备知识+经验" },
      3:  { cn: "议程协商",   em: "学习者参与" },
      4:  { cn: "学习目标",   em: "评价证据" },
      5:  { cn: "内容结构化", em: "问题链设计" },
      6:  { cn: "情境化案例", em: "教学资源" },
      7:  { cn: "教学过程",   em: "节奏+学情校准点" },
      8:  { cn: "探究协作",   em: "协作任务" },
      9:  { cn: "形成性评价", em: "动态调节" },
      10: { cn: "表现性评价与学习成效诊断", em: "评价证据" },
      11: { cn: "教学反思",   em: "资源积累" },
    };

    // ---- External "互动故事" CTA buttons inside the station workbench.
    // For stations that delegate part of the work to an outside platform,
    // we inject a CTA into the detail panel (does NOT replace tile click).
    // URL to be filled in by 编辑部.
    const STATION_EXTERNAL_CTA = {
      2: {
        text: "进入泛雅，开始互动故事",
        url: "https://demo.fanya.chaoxing.com/portal",
      },
    };

    // ---- Inline Agent suggestion shown right above the decision-dock.
    // Replaces the right rail's "本节点协同 · LIVE" zone — only the highest-
    // value piece (Agent 提议) stays, woven into the decision flow.
    const STATION_AGENT = {
      5: {
        time: "2 分钟前",
        body: '在第 3-4 题加入"立场切换"提示词，预计能把学生发言占比从 41% 拉到 55-60%。',
      },
    };

    const PHASE_META = {
      pre:  { label: "课前 · 设计", tag: "课前 · 设计与准备", pillClass: "pill-amber" },
      in:   { label: "课中 · 实施", tag: "课中 · 实施与调控", pillClass: "pill-sage" },
      post: { label: "课后 · 沉淀", tag: "课后 · 评价与改进", pillClass: "pill-indigo" },
    };

    // ---- State ----
    let activeId = 1; // 默认聚焦 S1 · 学习者与教学情境分析（首站）
    let activeStageId = null; // v4: chip 显式点击时设置；为 null 时回落到 stageOfStation(activeId)
    let activeSubKey = null;  // v4: 子节点 tile 显式点击时设置；用于区分 1 vs 1b、2 vs 2-3 等同 station 不同 pass

    // ---- Helpers ----
    const pad = (n) => String(n).padStart(2, "0");
    const esc = (s) => String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

    function statusCls(id) {
      if (id < activeId) return "is-done";
      if (id === activeId) return "is-active";
      return "";
    }

    function counts() {
      return {
        done: STATIONS.filter((s) => s.id < activeId).length,
        active: 1,
        todo: STATIONS.filter((s) => s.id > activeId).length,
      };
    }

    function nextStation(id) {
      return stationById[id + 1] || null;
    }

    // ---- L3 · 学习产出链顶卡（v4 · 改用 STAGE_CHAIN + 9 个教学环节短标签） ----
    function renderChainTopcard(s) {
      // 由 active station 反查所属环节
      const sub = SUB_NODES[String(s.id)];
      const stageId = sub ? sub.stageId : (currentStageId());
      const chain = STAGE_CHAIN[stageId] || { inputsFrom: [], outputsTo: [], topCardFromKeys: [], topCardToKeys: [] };

      const stageIdx = (sid) => STAGES.findIndex((x) => x.id === sid) + 1;
      const padN = (n) => String(n).padStart(2, "0");

      // v4.2: 上游输入优先显示教师实际保存的判断（来自 Store），回退到静态 key
      const Store = window.PharmacoPilotStore;
      const ENV_TO_STATIONS = (window.PharmacoPilotNavigationContract || {}).ENV_TO_STATIONS || {};
      const STAGE_TO_ENV = (window.PharmacoPilotNavigationContract || {}).STAGE_TO_ENV || {};
      const liveJudgmentFor = (stgId) => {
        if (!Store) return null;
        const envId = STAGE_TO_ENV[stgId];
        const stations = (envId && ENV_TO_STATIONS[envId]) || [];
        for (const st of stations) {
          const j = Store.getJudgment(st);
          if (j && j.label) return j.label;
        }
        return null;
      };
      const inputItems = chain.inputsFrom.map((sid, i) => {
        const src = stageById[sid];
        if (!src) return "";
        const key = chain.topCardFromKeys[i] || "产物";
        const live = liveJudgmentFor(sid);
        const liveTag = live
          ? `<span class="ci-live" title="你在上游环节的实际判断">✓ ${esc(live.length > 22 ? live.slice(0, 22) + "…" : live)}</span>`
          : "";
        return `<li><span class="ci-num">${padN(stageIdx(sid))}</span><span class="ci-cn">${esc(stageShortLabel(src))}</span><span class="ci-key">${esc(key)}</span>${liveTag}</li>`;
      }).filter(Boolean).join("");

      const exportKeys = chain.topCardToKeys.map((k) => `<span class="chain-key">${esc(k)}</span>`).join("");

      const outFlow = chain.outputsTo.length
        ? `<div class="chain-out-note"><span class="chain-out-summary">流向 <b>${chain.outputsTo.length}</b> 环节</span><span class="chain-out-links">${chain.outputsTo.map((sid) => {
            const target = stageById[sid];
            if (!target) return "";
            return `<a data-stage="${esc(sid)}" class="chain-out-link">${padN(stageIdx(sid))} ${esc(stageShortLabel(target))}</a>`;
          }).filter(Boolean).join("")}</span></div>`
        : `<p class="chain-empty">本环节为终点 · 无下游</p>`;

      // S7 → S2 反向修订通道（评价标准反向修订）
      const revisionNote = (chain.revisionsTo && chain.revisionsTo.length)
        ? `<div class="chain-revision-note">↩ 反向修订 · ${chain.revisionsTo.map((sid) => {
            const target = stageById[sid];
            if (!target) return "";
            return `<a data-stage="${esc(sid)}" class="chain-out-link">${padN(stageIdx(sid))} ${esc(stageShortLabel(target))}</a>`;
          }).filter(Boolean).join(" · ")}</div>`
        : "";

      return `
        <div class="chain-topcard" aria-label="学习产出链">
          <div class="chain-flow">
            <div class="chain-col chain-in">
              <div class="chain-lbl">↓ 上游输入</div>
              ${inputItems ? `<ul class="chain-list">${inputItems}</ul>` : `<p class="chain-empty">本环节为起点 · 无上游</p>`}
            </div>
            <div class="chain-col chain-out">
              <div class="chain-lbl">↑ 本环节产出</div>
              ${exportKeys ? `<div class="chain-keys">${exportKeys}</div>` : ""}
              ${outFlow}
              ${revisionNote}
            </div>
          </div>
        </div>
      `;
    }

    // ---- Render: issue strip / page hero (v4 stage-aware) ----
    function renderTopChrome() {
      const s = stationById[activeId];
      if (!s) return;
      const lbl = TILE_LABELS[s.id];
      const stageId = currentStageId();
      const g = stageById[stageId];
      const stageIdx = STAGES.findIndex((x) => x.id === stageId) + 1;
      const stagePadIdx = String(stageIdx).padStart(2, "0");
      const stageTag = g ? g.tag : "";

      const sessionEl = document.getElementById("sessionStation");
      if (sessionEl) {
        sessionEl.innerHTML = `${stagePadIdx} / ${TOTAL_STAGES} · ${esc(stageTag)} · ${esc(lbl.cn)}`;
      }

      const meta = document.getElementById("heroMeta");
      if (meta) {
        const sc = stageCounts();
        meta.innerHTML = `
          <div class="row"><dt>当前示例</dt><dd><b>《管理学原理》</b> 本科 · 药事管理 24 级</dd></div>
          <div class="row"><dt>本节主题</dt><dd>SWOT 分析</dd></div>
          <div class="row"><dt>当前环节</dt><dd><span class="it">${stagePadIdx} · ${esc(g ? g.title : lbl.cn)}</span></dd></div>
          <div class="row"><dt>进度</dt><dd>${sc.done} 完成 · ${sc.active} 进行中 · ${sc.todo} 待开始</dd></div>
        `;
      }

      const deckHead = document.getElementById("deckProgress");
      if (deckHead) {
        const sc = stageCounts();
        const pad2 = (n) => String(n).padStart(2, "0");
        deckHead.innerHTML = `
          <b>${pad2(sc.done)}</b> 已完成<span class="sep">·</span>
          <span class="stat-live" aria-label="当前环节 ${stagePadIdx}"><i></i>当前 · <b>${stagePadIdx}</b></span><span class="sep">·</span>
          <b>${pad2(sc.todo)}</b> 待开始
        `;
      }
    }

    // 环节级别的完成度统计
    function stageCounts() {
      let done = 0, active = 0, todo = 0;
      const cur = currentStageId();
      for (const g of STAGES) {
        if (g.id === cur) { active++; continue; }
        const cls = stageStatusCls(g.id);
        if (cls === "is-done") done++;
        else todo++;
      }
      return { done, active, todo };
    }

    // ---- Render: station tiles (top deck) ----
    function renderTiles() {
      const el = document.getElementById("stationTiles");
      if (!el) return;
      el.innerHTML = STATIONS.map((s) => {
        const lbl = TILE_LABELS[s.id];
        const cls = ["tile", statusCls(s.id)].filter(Boolean).join(" ");
        const num = s.id === activeId ? `${pad(s.id)} / ${TOTAL}` : pad(s.id);
        return `<div class="${cls}" data-st="${s.id}" role="button" tabindex="0">
          <span class="t-num">${num}</span>
          <span class="t-cn">${esc(lbl.cn)}</span>
          <span class="t-em">${esc(lbl.em)}</span>
        </div>`;
      }).join("");
    }

    // ---- Render: primary stage navigation (9 个教学环节分组 by phase) ----
    function renderNodeList() {
      const el = document.getElementById("nodeList");
      if (!el) return;
      const groups = [
        ["pre", "课前 · 设计"],
        ["in", "课中 · 实施"],
        ["post", "课后 · 沉淀"],
      ];
      const cur = currentStageId();
      let html = "";
      for (const [phaseId, label] of groups) {
        const stagesInPhase = STAGES.filter((g) => g.phase === phaseId);
        if (!stagesInPhase.length) continue;
        html += `<li class="node-stage-h">${label}</li>`;
        for (const g of stagesInPhase) {
          const idx = STAGES.findIndex((x) => x.id === g.id) + 1;
          const isCur = g.id === cur;
          const statusKind = stageStatusCls(g.id);
          const cls = ["node-item", statusKind, isCur ? "is-active" : ""].filter(Boolean).join(" ");
          const check = statusKind === "is-done" ? '<span class="check" aria-label="已完成">✓</span>' : "";
          // 跳转到该环节首子节点
          const firstSub = g.subNodeIds && g.subNodeIds[0];
          const firstStid = (typeof firstSub === "number") ? firstSub : ((SUB_NODES[String(firstSub)] || {}).legacyStationId);
          html += `<li class="${cls}" data-st="${firstStid || ""}" data-stage="${esc(g.id)}" role="button" tabindex="0" title="${esc(g.title)}" aria-label="环节 ${String(idx).padStart(2, "0")} · ${esc(g.title)}"${isCur ? ' aria-current="step"' : ""}>
            <span class="n">${String(idx).padStart(2, "0")}</span>
            <span class="node-title">${esc(g.title)}</span>
            <span class="node-status">${check}</span>
          </li>`;
        }
      }
      el.innerHTML = html;
      const meta = document.getElementById("nodeListMeta");
      if (meta) meta.textContent = `已完成 ${stageCounts().done} / ${TOTAL_STAGES}`;
      // 侧栏是唯一的九环节导航；重绘后让 bridge 恢复其状态徽章。
      try { if (window.__navAfterStageNavigationRender) window.__navAfterStageNavigationRender(); } catch (e) {}
    }


    // ---- Render: middle pane (detail) ----
    function renderDetail() {
      const el = document.getElementById("stationDetail");
      if (!el) return;
      const s = stationById[activeId];
      if (!s) return;
      const gate = evidenceGateState();
      el.classList.toggle("is-evidence-locked", gate.blocked);
      el.innerHTML = renderEvidenceGate(gate) + renderChainTopcard(s) + renderSubPassBanner() + renderStationBody(s) + renderMergedAppendix();
    }

    // 子节点回写/合并 banner：在 stationBody 上方显式说明当前是 v1 修订 pass 或合并节点
    function renderSubPassBanner() {
      const subKey = effectiveSubKey();
      if (!subKey) return "";
      const sub = SUB_NODES[subKey];
      if (!sub) return "";
      if (sub.revisionPass === "v1") {
        const store = window.PharmacoPilotStore;
        // 找该 stage 内对应的 v0 子节点 key，用于"先回到 N·a"提示 + 优先按复合键查找 v0 判断
        const stage = stageById[sub.stageId];
        const stageIdxNum = STAGES.findIndex((g) => g.id === sub.stageId) + 1;
        const stagePadIdx = pad(stageIdxNum);
        const v0SubKey = (stage && stage.subNodeIds || []).map(String).find((k) => {
          const e = SUB_NODES[k] || {};
          return e.revisionPass === "v0";
        });
        // 读 v0 草案判断：优先用 v0 子节点 key（复合键），回退到 legacyStationId 数字键
        let v0 = null;
        if (store && typeof store.getJudgment === "function") {
          v0 = (v0SubKey && store.getJudgment(v0SubKey)) || store.getJudgment(sub.legacyStationId || 1);
        }
        const v0Letter = v0SubKey ? String.fromCharCode(97 + (stage.subNodeIds.map(String).indexOf(v0SubKey))) : "a";
        const subjectName = sub.subjectName || "本节点产物";
        const source = sub.revisionSource || "前序节点的产出";
        const action = sub.revisionAction || `确认或修订${subjectName}，输出锁定版`;
        const v0Block = v0
          ? `
            <div class="spb-v0-ref">
              <div class="spb-v0-hd"><span class="spb-v0-tag">前轮草案</span>已保存 · ${esc(new Date(v0.savedAt).toLocaleString("zh-CN", { hour12: false }))}</div>
              <div class="spb-v0-body">
                <span class="spb-v0-lbl">${esc(v0.label || v0.key || "判断")}</span>
                ${typeof v0.score === "number" ? `<span class="spb-v0-score">${(v0.score).toFixed(1)} / 5</span>` : ""}
              </div>
            </div>
          `
          : `
            <div class="spb-v0-ref spb-v0-empty">
              <div class="spb-v0-hd"><span class="spb-v0-tag">前轮草案</span>尚未保存 · 建议先回到 ${esc(stagePadIdx)}·${esc(v0Letter)} 完成首轮判断再做回写</div>
            </div>
          `;
        return `
          <div class="sub-pass-banner sub-pass-revision">
            <span class="spb-lbl">${esc(sub.subTitle || "再修订")} · 基于下游回写</span>
            <span class="spb-body">本节点基于「${esc(source)}」的结果回写${esc(subjectName)}。前轮判断作为参考保留；本轮要${esc(action)}。</span>
            ${v0Block}
          </div>
        `;
      }
      if (sub.mergedWith && sub.mergedWith.length) {
        const stage = stageById[sub.stageId];
        const part = `步骤 ${(stage && stage.subNodeIds || []).indexOf(subKey) + 1} / ${(stage && stage.subNodeIds || []).length}`;
        return `
          <div class="sub-pass-banner sub-pass-merged">
            <span class="spb-lbl">${esc(part)} · 合并节点</span>
            <span class="spb-body">学情前测与议程协商在本节点串联完成：先做学情诊断（认知前测 + 经验入口），下拉后做议程协商；两个判断保存为一份合并产物，回写到 v1 定位。</span>
          </div>
        `;
      }
      // 学情校准点子节点（S6 内）：显示当前锚点的学情触发规则模板 + L1 硬约束提醒
      if (sub.anchorId) {
        const stage = stageById[sub.stageId];
        const part = `锚点 ${(stage && stage.subNodeIds || []).indexOf(subKey) + 1} / 3`;
        const pl = payloadOf(sub.legacyStationId || 9);
        const rules = (pl && pl.evidenceFigure && pl.evidenceFigure.pulseRules) || [];
        const rule = rules.find((r) => r.anchorId === sub.anchorId);
        const ruleBlock = rule
          ? `
            <div class="spb-anchor-rule">
              <div class="spb-anchor-row"><span class="spb-anchor-k">时间点</span><span class="spb-anchor-v">${esc(String(rule.t))}'</span></div>
              <div class="spb-anchor-row"><span class="spb-anchor-k">微评估格式</span><span class="spb-anchor-v">${esc(rule.microFormat)}</span></div>
              <div class="spb-anchor-row"><span class="spb-anchor-k spb-anchor-if">如果</span><span class="spb-anchor-v">${esc(rule.ifCond)}</span></div>
              <div class="spb-anchor-row"><span class="spb-anchor-k spb-anchor-then">则</span><span class="spb-anchor-v">${esc(rule.thenAct)}</span></div>
            </div>
          `
          : `<div class="spb-anchor-rule spb-anchor-empty">本锚点暂无规则模板。请在右侧学情触发规则编辑器写一条「如果 X 则 Y」。</div>`;
        return `
          <div class="sub-pass-banner sub-pass-anchor">
            <span class="spb-lbl">${esc(part)} · ${esc(sub.subTitle || "")}</span>
            <span class="spb-body">硬约束：每个锚点必须有一条「如果 X 则 Y」规则；本学习者议程 个锚点都需独立编辑，否则不允许通过到下一环节。</span>
            ${ruleBlock}
          </div>
        `;
      }
      // S2 两段：focus = "objectives" / "rubric"
      if (sub.focus === "objectives") {
        const stage = stageById[sub.stageId];
        const part = `步骤 ${(stage && stage.subNodeIds || []).indexOf(subKey) + 1} / ${(stage && stage.subNodeIds || []).length}`;
        return `
          <div class="sub-pass-banner sub-pass-stage1">
            <span class="spb-lbl">${esc(part)} · 学习目标</span>
            <span class="spb-body">把教学目标改写为可观察、可评价、可由学生产出证明的学习成果。3-5 条为宜，覆盖知识 / 应用 / 高阶判断三个层级；同时回应来自学习者与教学情境分析（环节 01）的课程定位、学情低分项、议程张力。</span>
          </div>
        `;
      }
      if (sub.focus === "rubric") {
        const stage = stageById[sub.stageId];
        const part = `步骤 ${(stage && stage.subNodeIds || []).indexOf(subKey) + 1} / ${(stage && stage.subNodeIds || []).length}`;
        // 检查 Store 中是否有来自表现性评价与学习成效诊断（环节 07）的待审修订
        let revisionNote = "";
        try {
          const store = window.PharmacoPilotStore;
          // 只显示 pending 状态的反向修订（已 accept/reject 的不再提醒）
          const revs = (store && store.getRubricRevisions) ? store.getRubricRevisions("pending") : [];
          if (revs && revs.length) {
            revisionNote = `
              <div class="spb-revision-pending">
                <span class="spb-rev-tag">↩ 待审反向修订 · ${revs.length} 条</span>
                <span class="spb-rev-hint">来自表现性评价与学习成效诊断（环节 07）的评价标准修订建议，必须显式确认或驳回后才能继续。</span>
              </div>
            `;
          }
        } catch (e) {}
        return `
          <div class="sub-pass-banner sub-pass-stage2">
            <span class="spb-lbl">${esc(part)} · 评价证据 + 5 维评价标准</span>
            <span class="spb-body">为每条目标设计可采集的评价证据，并配套 5 维评价标准（一致性 / 真实性 / 学情 / 高阶 / 评价）。每个维度有 4 等级描述符；预留批判意识维度。本节点同时是表现性评价与学习成效诊断（环节 07）反向修订的收件方。</span>
            ${revisionNote}
          </div>
        `;
      }
      // S7 三段：评分 → 反馈/画像 → 评价标准反向修订
      if (sub.focus === "scoring") {
        const stage = stageById[sub.stageId];
        const part = `步骤 ${(stage && stage.subNodeIds || []).indexOf(subKey) + 1} / ${(stage && stage.subNodeIds || []).length}`;
        return `
          <div class="sub-pass-banner sub-pass-data">
            <span class="spb-lbl">${esc(part)} · 数据采集 · 评分</span>
            <span class="spb-body">用预期学习结果与评价证据设计（环节 02）的 5 维评价标准给学生作品逐条打分。只采集数据，不做评价定性，不写反馈语；产出原始评分表 + 低分维度 Pareto 图。</span>
          </div>
        `;
      }
      if (sub.focus === "feedback-profile") {
        const stage = stageById[sub.stageId];
        const part = `步骤 ${(stage && stage.subNodeIds || []).indexOf(subKey) + 1} / ${(stage && stage.subNodeIds || []).length}`;
        return `
          <div class="sub-pass-banner sub-pass-teaching">
            <span class="spb-lbl">${esc(part)} · 教学动作 · 反馈与画像</span>
            <span class="spb-body">基于评分数据写可行动反馈语（Hattie 反馈层级：任务 / 过程 / 自我调节 / 自我），并把班级低分项汇总为能力画像。每位学生至少一条针对性反馈。</span>
          </div>
        `;
      }
      if (sub.focus === "rubric-revision") {
        const stage = stageById[sub.stageId];
        const part = `步骤 ${(stage && stage.subNodeIds || []).indexOf(subKey) + 1} / ${(stage && stage.subNodeIds || []).length}`;
        return `
          <div class="sub-pass-banner sub-pass-meta">
            <span class="spb-lbl">${esc(part)} · 元动作 · 评价标准反向修订</span>
            <span class="spb-body">基于本轮评分发现的评价标准问题（某维度区分度不足 / 过严 / 缺失关键维度），向预期学习结果与评价证据设计（环节 02）提交修订建议。这是表现性评价与学习成效诊断（环节 07）→ 预期学习结果与评价证据设计（环节 02）反向修订通道的发起点；建议会进入环节 02 的「评价证据 + 5 维评价标准」待审列表，下一轮备课进入该环节前必须显式确认或驳回。</span>
            <div class="spb-revision-outbound">
              <span class="spb-rev-tag">↩ 反向修订发起 · 环节 07 → 环节 02</span>
              <span class="spb-rev-hint">提交后会在环节 02「评价证据 + 5 维评价标准」节点顶部显示「待审反向修订 N 条」。</span>
            </div>
          </div>
        `;
      }
      return "";
    }

    // 合并节点（2-3）：在 station 2 内容下方追加 station 3 内容
    // 合并节点（2-3）追加渲染时屏蔽下游 station 的 detail-head（避免与主体重复显示徽章行）
    let _suppressDetailHead = false;

    function renderMergedAppendix() {
      if (!activeSubKey) return "";
      const sub = SUB_NODES[activeSubKey];
      if (!sub || !sub.mergedWith || !sub.mergedWith.length) return "";
      _suppressDetailHead = true;
      try {
        const parts = sub.mergedWith.map((stid) => {
          const s2 = stationById[stid];
          if (!s2) return "";
          return `
            <div class="merged-section">
              <div class="merged-sep" aria-hidden="true">─── 第 2 段 · 议程协商（${esc(s2.title)}） ───</div>
              ${renderStationBody(s2)}
            </div>
          `;
        }).join("");
        return parts;
      } finally {
        _suppressDetailHead = false;
      }
    }

    function renderStationBody(s) {
      if (s.id === 1) return richStation01(s);
      if (s.id === 3) return richStation03(s);
      if (s.id === 5) return richStation05(s);
      if (s.id === 7) return richStation07(s);
      return scaffoldDetail(s);
    }

    // ---- Shared sub-renderers ----
    function renderDetailHead(s, decisions) {
      // 合并节点追加渲染时屏蔽下游 station 的徽章行；改输出一个极简标题段
      if (_suppressDetailHead) {
        return `
          <div class="detail-head detail-head-compact">
            <h3>${esc(s.title).replace(/与/g, "<br/>与 ")}</h3>
          </div>
        `;
      }
      const phase = PHASE_META[s.phase];
      // 用 currentStageId() 而不是 stageOfStation(s.id) —— 后者对 station 11 硬编码到 S8，
      // 无法区分 S8（11a 复盘）vs S9（11b 资产）这种同 station 不同环节的拆分。
      const stageId = currentStageId();
      const stage = stageById[stageId];
      const stageIdx = STAGES.findIndex((g) => g.id === stageId) + 1;
      const stageBadge = stage
        ? `<span class="pill pill-amber">环节 ${pad(stageIdx)} · ${esc(stage.title)}</span>`
        : "";
      // 节点定位徽章 + h3 子节点标题
      // 多子节点环节：显示「步骤 i / N」徽章 + 用 sub.subTitle 做 h3
      // 单子节点环节：不显徽章，但 h3 仍优先用 sub.subTitle（避免 splitOf 拆分时两个环节共用同一 station 标题，如 S8/S9 都映射 station 11）
      let subBadge = "";
      let subTitle = "";
      if (stage && Array.isArray(stage.subNodeIds) && stage.subNodeIds.length) {
        let subIdx = -1;
        if (activeSubKey) {
          subIdx = stage.subNodeIds.findIndex((sid) => String(sid) === activeSubKey);
        }
        if (subIdx < 0) {
          subIdx = stage.subNodeIds.findIndex((sid) => {
            const entry = SUB_NODES[String(sid)] || {};
            const lid = (typeof entry.legacyStationId === "number") ? entry.legacyStationId : Number(sid);
            return lid === s.id;
          });
        }
        if (subIdx >= 0) {
          const subKey = String(stage.subNodeIds[subIdx]);
          const sub = SUB_NODES[subKey] || {};
          if (stage.subNodeIds.length > 1) {
            subBadge = `<span class="pill pill-indigo">步骤 ${subIdx + 1} / ${stage.subNodeIds.length}</span>`;
          }
          subTitle = sub.subTitle || "";
        }
      }
      return `
        <div class="detail-head">
          <div class="detail-tags">
            <span class="detail-tag-context">
              ${stageBadge}
              ${subBadge}
              <span class="pill ${phase.pillClass}">${esc(phase.tag)}</span>
            </span>
            <span class="right">
              <span class="pill pill-mute">${decisions.length} 个判断选项</span>
              <span class="pill pill-mute">${s.qualityDimensions.length} 维评价</span>
            </span>
          </div>
          <h3>${subTitle ? esc(subTitle) : esc(s.title).replace(/与/g, "<br/>与 ")}</h3>
        </div>
      `;
    }

    // ---- Decision bucketing ------------------------------------------------
    // 推荐：meta.recommended === true 的所有选项；都没标则取唯一最高分（严格高于第二名）作为推荐。
    //   这避免了 Station 1 旧数据「4 个分数都 ≥3.5 → 全部推荐」的悖论，也兼容 Station 6/8 的显式标记。
    // 不建议：meta.blockSave 或 score < 2.5；备选：score >= 3.0 且未被标推荐。
    function bucketize(decisions) {
      const sorted = decisions.slice().sort((a, b) => (b[3] || 0) - (a[3] || 0));
      const explicitRec = sorted.filter((d) => d[4] && d[4].recommended === true).map((d) => d[0]);
      const recKeys = new Set(explicitRec);
      if (recKeys.size === 0 && sorted.length) {
        const top = sorted[0], second = sorted[1];
        if (!second || (top[3] || 0) > (second[3] || 0)) recKeys.add(top[0]);
      }
      // 阈值 3.0：score < 3.0 划入「不建议」。校验过 11 个 station：每个站都给出
      // 1 推荐 + 0–2 备选 + 0–3 不建议 的清晰分布，旧的 `score < 2.5` 太宽松
      // 会让 Station 1 的 2.8（服务运营型）漏到「无标签」。
      return function annotate(d) {
        const [key, , , score, meta] = d;
        if (meta && meta.blockSave) return { bucket: "avoid", label: "禁条" };
        if (recKeys.has(key))       return { bucket: "rec",   label: "推荐" };
        if ((score || 0) < 3.0)     return { bucket: "avoid", label: "不建议" };
        return { bucket: "alt", label: "备选" };
      };
    }

    // ============================================================
    //  v5 · 苏格拉底 4 阶题链渲染
    // ============================================================
    function getChainBank(stationId) {
      const CB = window.PharmacoPilotQuestionChain || {};
      return CB[stationId] || null;
    }
    function getChainStep(stationId) {
      const store = window.PharmacoPilotStore;
      if (!store || !store.getChainProgress) return 1;
      return store.getChainProgress(stationId).currentStep || 1;
    }
    function getChainReflections(stationId) {
      const store = window.PharmacoPilotStore;
      if (!store || !store.getChainProgress) return {};
      return store.getChainProgress(stationId).reflections || {};
    }

    // v6: 工具——查 judgment(兼容数字 stationId 和 v4 复合 subKey 如 "2-3"/"1b")
    function lookupChainJudgment(s) {
      const store = window.PharmacoPilotStore;
      if (!store || !store.getJudgment) return null;
      let j = store.getJudgment(s.id);
      if (!j && window.__navRenderState && window.__navRenderState.currentSubKey) {
        const sk = window.__navRenderState.currentSubKey();
        if (sk) j = store.getJudgment(sk);
      }
      return j;
    }

    // v6: 题链精细状态——current 反映"教师当前应该填的阶段"
    //   1: Q1 读图未完成
    //   2: Q2 诊断未完成
    //   3: Q3 决策(判断)或反思(理由)未完成
    //   4: Q4 迁移未完成
    //   5: 全部完成
    function computeChainStateInfo(s, chainBank) {
      const store = window.PharmacoPilotStore;
      const cp = (store && store.getChainProgress) ? store.getChainProgress(s.id) : { reflections: {} };
      const judgment = lookupChainJudgment(s);
      const transfers = (store && store.getTransfer) ? store.getTransfer(s.id) : [];
      const q3 = (chainBank.chain || []).find((q) => q.step === 3);
      const reflectionField = q3 && q3.postSelectReflection && q3.postSelectReflection.field;
      const reflections = cp.reflections || {};
      const reflectionDone = !!(reflectionField && reflections[reflectionField]);
      const q1Done = !!cp.q1Done;
      const q2Done = !!cp.q2Done;
      const q3DecisionDone = !!judgment;
      const q4Done = transfers.length > 0;
      let current;
      if (!q1Done) current = 1;
      else if (!q2Done) current = 2;
      else if (!q3DecisionDone || !reflectionDone) current = 3;
      else if (!q4Done) current = 4;
      else current = 5;
      return { current, q1Done, q2Done, q3DecisionDone, q3ReflectionDone: reflectionDone, q4Done, judgment };
    }

    function renderChainStepper(stationId, stateInfo) {
      // v6.1: Q3 拆分二级状态——决策已保存但反思未保存时,显示「反思中」子标签
      const q3Half = stateInfo.q3DecisionDone && !stateInfo.q3ReflectionDone;
      const labels = [
        { step: 1, name: "读图", done: stateInfo.q1Done },
        { step: 2, name: "诊断", done: stateInfo.q2Done },
        { step: 3, name: "决策", done: stateInfo.q3DecisionDone && stateInfo.q3ReflectionDone, substep: q3Half ? "reflection" : "" },
        { step: 4, name: "迁移", done: stateInfo.q4Done, optional: true },
      ];
      const current = stateInfo.current;
      // v6.2: 重置按钮——current > 1 时显示(教师已经开始答题就可以重置)
      const showReset = current > 1;
      const resetBtn = showReset
        ? `<button class="qstep-reset" data-reset-chain="${stationId}" title="重置本节点的所有答题进度">↻ 重置题链</button>`
        : "";
      return `<div class="qchain-stepper" data-station="${stationId}">${
        labels.map((l, i) => {
          let cls = "";
          if (l.done) cls = "is-done";
          else if (l.step === current) cls = "is-current";
          else if (l.optional) cls = "is-optional";
          const sub = l.substep ? ` data-substep="${l.substep}"` : "";
          const sep = i < labels.length - 1 ? `<span class="qstep-arrow"></span>` : "";
          return `<i class="qstep ${cls}" data-step="${l.step}"${sub}>${l.name}</i>${sep}`;
        }).join("")
      }${resetBtn}</div>`;
    }

    function renderChainQuestion(stationId, q) {
      // 选项渲染：根据已点击记录，正确高亮、错误置灰但不消失
      const store = window.PharmacoPilotStore;
      const logs = (store && store.getObservations) ? store.getObservations(stationId, q.step) : [];
      const wrongKeys = new Set(
        logs.filter((l) => l.event === "chose" && l.isCorrect === false).map((l) => l.choiceKey)
      );
      const correctChosen = logs.some((l) => l.event === "chose" && l.isCorrect === true);
      const hintsRevealed = Math.max(0, ...logs.filter((l) => l.event === "hintRevealed").map((l) => l.hintLevel || 0));

      // v6.3: figure ↔ question hover 联动 — station 1 Q1 专用映射
      // key (选项内部 id) → figure 矩阵的列 data-col-name (中文全名)
      const LINK_COLS = (stationId === 1 && q.step === 1) ? {
        "comprehensive": "综合决策型",
        "research":      "证据研究型",
        "policy":        "政策治理型",
        "service":       "服务运营型",
      } : null;

      const optsHtml = q.options.map((o) => {
        let cls = "";
        if (wrongKeys.has(o.key)) cls = "is-wrong";
        if (correctChosen && o.correct === true) cls = "is-correct";
        if (correctChosen) cls += " is-locked";
        const linkAttr = (LINK_COLS && LINK_COLS[o.key])
          ? ` data-link-col="${esc(LINK_COLS[o.key])}"` : "";
        const locked = cls.includes("is-locked");
        return `<li class="${cls.trim()}" data-opt-key="${esc(o.key)}" data-correct="${o.correct ? "1" : "0"}"${linkAttr}
          role="radio" tabindex="${locked ? "-1" : "0"}" aria-checked="${correctChosen && o.correct === true ? "true" : "false"}"${locked ? ' aria-disabled="true"' : ""}>
          ${esc(o.label)}
        </li>`;
      }).join("");

      const kindLabel = q.kind === "observation" ? "读图题 · 你看到了什么"
                      : q.kind === "diagnosis" ? "诊断题 · 这意味着什么" : "题目";

      // 提示抽屉：根据 hintsRevealed 展开
      const hintItems = (q.hints || []).slice(0, hintsRevealed).map((h) => `
        <div class="chain-hint-item">
          <span class="chain-hint-lvl">L${h.level} · ${esc(h.kind)}</span>
          <span>${esc(h.text)}</span>
        </div>
      `).join("");
      const drawerCls = hintsRevealed > 0 ? "is-open" : "";
      const maxHint = (q.hints || []).length;
      const nextHintDisabled = hintsRevealed >= maxHint;

      return `
        <div class="chain-q" data-station="${stationId}" data-step="${q.step}">
          <div class="qcard-lbl"><span>${esc(kindLabel)}</span><b>Q${q.step} / 4</b></div>
          <p class="chain-q-stem">${esc(q.stem)}</p>
          <ul class="chain-q-opts" role="radiogroup" aria-label="${esc(kindLabel)}">${optsHtml}</ul>
          <div class="chain-hint-drawer ${drawerCls}" data-drawer-step="${q.step}">${hintItems}</div>
          <div class="chain-hint-cta">
            <button class="btn-hint" data-hint-station="${stationId}" data-hint-step="${q.step}" ${nextHintDisabled ? "disabled" : ""}>
              ${hintsRevealed === 0 ? "需要提示" : `查看 L${hintsRevealed + 1} 提示`}
            </button>
            <span class="chain-hint-meta">已用 ${hintsRevealed} / ${maxHint} 级提示 · 4 级是兜底答案</span>
          </div>
        </div>
      `;
    }

    // Q3 决策视图（chain-mode 下把决策选项 + 保存按钮直接嵌进 question-card,
    // 完全替代独立 decision-dock；无"推荐路径"明示、无（推荐）/(备选)/(不建议) 后缀）
    function renderChainDecisionWithDock(s, q3, decisions) {
      const transitionLine = (q3 && q3.transitionLine) || "";
      const decisionButtons = decisions.map((d) => {
        const [key, label] = d;
        // 完全移除视觉等级提示：不附加 is-recommend / is-avoid / 后缀
        // bridge 的 blockSave（违反禁条的选项）仍通过 meta.blockSave 在选完时拦截
        return `<button class="btn-s dd-opt" data-key="${esc(key)}">${esc(label)}</button>`;
      }).join("");
      const questionStem = (s && s.decisionQuestion) || "请做出你的判断";
      return `
        <div class="chain-q chain-q-decision" data-step="3">
          <div class="qcard-lbl"><span>决策题 · 你来拍板</span><b>Q3 / 4</b></div>
          <p class="chain-q-stem">${esc(questionStem)}</p>
          ${transitionLine ? `<p class="chain-q-trans">${esc(transitionLine)}</p>` : ""}
          <div class="decision-dock decision-dock-inline">
            <div class="dd-actions">
              ${decisionButtons}
              <button class="btn-s fill dd-save" disabled aria-disabled="true">保存判断</button>
            </div>
          </div>
        </div>
      `;
    }

    // v6: Q3 反向提问——嵌入 question-card（替代旧的 chain-extras 独立区域）
    function renderChainReflection(s, q3, judgment, reflections) {
      const fld = (q3 && q3.postSelectReflection && q3.postSelectReflection.field) || "reflection";
      const prompt = (q3 && q3.postSelectReflection && q3.postSelectReflection.prompt) || "用一句话写下你的理由";
      const placeholder = (q3 && q3.postSelectReflection && q3.postSelectReflection.placeholder) || "一句话说明...";
      // v6.2: 梯度只能来自题目自带的 gradient——各题动词不同（"算…吗" / "愿意…吗" / 二选一），
      // 旧版兜底 ["不算","勉强算","算"] 是为"算成功了吗"写的，漏给其余题会答非所问。
      // 因此缺省时**不显示**参考梯度：给错提示比不给提示更糟。
      const gradient = (q3 && q3.postSelectReflection && q3.postSelectReflection.gradient) || null;
      const saved = reflections[fld];
      const helperHtml = (saved || !Array.isArray(gradient) || !gradient.length) ? "" : `
        <p class="chain-reflection-helper">参考梯度: ${gradient.map((g) => `<b>${esc(g)}</b>`).join(" → ")} — 选择最贴近你判断的那个,然后说明理由</p>
      `;
      return `
        <div class="chain-q chain-q-reflection" data-chain-card="reflection" data-station="${s.id}" data-field="${esc(fld)}" data-step="3r">
          <div class="qcard-lbl"><span>Q3 反向提问 · 写下你的理由</span><b>${esc(judgment.label || judgment.key)}</b></div>
          <p class="chain-q-stem">${esc(prompt)}</p>
          ${helperHtml}
          <textarea data-reflection-input maxlength="500" placeholder="${esc(placeholder)}" ${saved ? "disabled" : ""}>${esc(saved ? saved.text : "")}</textarea>
          <div class="chain-q-actions">
            <span class="chain-meta"></span>
            <button class="btn-s chain-save" data-save-reflection ${saved ? "disabled" : ""}>${saved ? "已保存 ✓" : "保存理由"}</button>
          </div>
        </div>
      `;
    }

    // v6: Q4 迁移题——嵌入 question-card（替代旧的 chain-extras 独立区域）
    function renderChainTransfer(s, q4, chainBank) {
      const store = window.PharmacoPilotStore;
      const transfers = store && store.getTransfer ? store.getTransfer(s.id) : [];
      const latest = transfers[transfers.length - 1];
      const axis = (q4 && q4.transferAxis) || (chainBank && chainBank.transferAxis) || "";
      const scaffoldHtml = (q4 && q4.scaffold || []).map((sc) => `<li>${esc(sc)}</li>`).join("");
      return `
        <div class="chain-q chain-q-transfer" data-chain-card="transfer" data-station="${s.id}" data-axis="${esc(axis)}" data-step="4">
          <div class="qcard-lbl"><span>Q4 迁移题 · 把判断推到新场景</span><b>迁移轴 · ${esc(axis)}</b></div>
          <p class="chain-q-stem">${esc(q4.stem)}</p>
          ${scaffoldHtml ? `<div class="chain-q-scaffold"><ul>${scaffoldHtml}</ul></div>` : ""}
          <textarea data-transfer-input maxlength="800" placeholder="不评判对错,写出你的判断逻辑..." ${latest ? "disabled" : ""}>${esc(latest ? latest.text : "")}</textarea>
          <div class="chain-q-actions">
            <span class="chain-meta">开放题 · 不评判对错 · 可选(跳过不影响产物生成)</span>
            <button class="btn-s chain-skip" data-skip-transfer ${latest ? "disabled" : ""}>跳过</button>
            <button class="btn-s chain-save" data-save-transfer ${latest ? "disabled" : ""}>${latest ? "已保存 ✓" : "保存迁移判断"}</button>
          </div>
        </div>
      `;
    }

    // v6: 题链完成视图（4 阶全部走完）
    function renderChainCompleted(s) {
      // v6.1: 计算下一环节
      const curStageId = (typeof currentStageId === "function") ? currentStageId() : null;
      const curIdx = STAGES.findIndex((g) => g.id === curStageId);
      const nextStage = (curIdx >= 0 && curIdx < STAGES.length - 1) ? STAGES[curIdx + 1] : null;
      // v6.2: 教师真填迁移判断(非跳过)时显示样本贡献承认
      const store = window.PharmacoPilotStore;
      const transfers = store && store.getTransfer ? store.getTransfer(s.id) : [];
      const lastTransfer = transfers[transfers.length - 1];
      const transferActuallyFilled = lastTransfer && !lastTransfer.skipped && lastTransfer.text;
      const sampleNoteHtml = transferActuallyFilled ? `
        <p class="chain-transfer-saved-note">
          ✓ 你的迁移判断已存入本地 · 样本累积中——后续其他教师的回答会被聚合成参考分布
        </p>
      ` : "";
      let ctaHtml = "";
      if (nextStage) {
        const firstSub = (nextStage.subNodeIds || [])[0];
        const nextStid = (typeof firstSub === "number") ? firstSub
          : ((SUB_NODES[String(firstSub)] || {}).legacyStationId);
        const subKey = (typeof firstSub === "number") ? "" : String(firstSub);
        const nextIdx = pad(curIdx + 2);
        ctaHtml = `
          <div class="chain-completed-cta">
            <button class="btn-s btn-next-stage" onclick="window.__navSetStation(${nextStid}, '${esc(nextStage.id)}', '${esc(subKey)}')">
              下一环节 · ${esc(nextIdx)} ${esc(stageShortLabel(nextStage))} →
            </button>
          </div>
        `;
      } else {
        ctaHtml = `
          <div class="chain-completed-cta">
            <button class="btn-s btn-next-stage" disabled>已是最后环节 · 整套教学设计走完</button>
          </div>
        `;
      }
      return `
        <div class="chain-q" data-step="done">
          <div class="qcard-lbl"><span>题链完成</span><b>4 / 4</b></div>
          <p class="chain-q-stem">
            ✓ 读图、诊断、决策、迁移 4 步已全部完成 — 下方「产物生成区」已解锁,可生成本节点产物。
          </p>
          ${sampleNoteHtml}
          ${ctaHtml}
        </div>
      `;
    }

    // v6: chain-extras 区域已废弃——Q3 反思 + Q4 迁移已搬入 question-card 内
    function renderChainExtras(s) {
      return "";
    }

    function renderQuestionCardScaffold(s, decisions) {
      // v6 苏格拉底题链分支：station 有 questionChain 时走精细 4 阶 + 1 子状态路径
      const chainBank = getChainBank(s.id);
      if (chainBank && chainBank.chain && chainBank.chain.length) {
        const stateInfo = computeChainStateInfo(s, chainBank);
        const stepper = renderChainStepper(s.id, stateInfo);
        const current = stateInfo.current;
        const reflections = getChainReflections(s.id);

        let body = "";
        if (current === 1 || current === 2) {
          const q = chainBank.chain.find((q) => q.step === current);
          body = q ? renderChainQuestion(s.id, q) : "";
        } else if (current === 3) {
          const q3 = chainBank.chain.find((q) => q.step === 3);
          if (!stateInfo.judgment) {
            // Q3 决策（dock 嵌入）
            const decs = (window.PharmacoPilotDecisionBank || {})[s.id] || [];
            body = renderChainDecisionWithDock(s, q3, decs);
          } else {
            // Q3 反思（判断已保存,反思未保存）
            body = renderChainReflection(s, q3, stateInfo.judgment, reflections);
          }
        } else if (current === 4) {
          const q4 = chainBank.chain.find((q) => q.step === 4);
          body = renderChainTransfer(s, q4, chainBank);
        } else {
          body = renderChainCompleted(s);
        }

        return `
          <div class="question-card chain-mode" data-chain-station="${s.id}">
            ${stepper}
            ${body}
          </div>
        `;
      }
      // 旧路径（无 chain 的 station 不变）
      const annotate = bucketize(decisions);
      const counts = { rec: 0, alt: 0, avoid: 0, none: 0 };
      const optionsHtml = decisions.map((d) => {
        const [key, label, rationale, score] = d;
        const a = annotate(d);
        counts[a.bucket]++;
        const annHtml = a.label
          ? `<span class="ann ann-${a.bucket}${a.bucket === "rec" ? " fork" : ""}">${esc(a.label)}</span>`
          : "";
        const scoreHtml = typeof score === "number"
          ? `<span class="qopt-score">score <b>${score.toFixed(1)}</b></span>` : "";
        const rationaleHtml = rationale
          ? `<div class="qopt-rationale">${esc(rationale)}</div>` : "";
        return `<li data-key="${esc(key)}" data-bucket="${a.bucket}">
          <div class="qopt-head"><span class="qopt-label">${esc(label)}</span>${annHtml}${scoreHtml}</div>
          ${rationaleHtml}
        </li>`;
      }).join("");
      return `
        <div class="question-card">
          <div class="qcard-lbl"><span>DECISION · ${decisions.length} 个选项</span><b>${esc(s.artifactType.split(/[、，,]/)[0])}</b></div>
          <p class="qcard-prompt">${esc(s.decisionQuestion)}</p>
          <ol class="qchain qchain-rich">${optionsHtml}</ol>
          <div class="qchain-foot">
            <span><b>${counts.rec}</b> 推荐 · <b>${counts.alt}</b> 备选 · <b>${counts.avoid}</b> 不建议</span>
            <span class="qchain-note">本节点只做一个判断 →</span>
          </div>
        </div>
      `;
    }

    function renderDecisionDock(s, decisions) {
      // v5 苏格拉底题链：chain mode 下 dock 已嵌入 question-card,不再渲染独立 dock
      if (getChainBank(s.id)) return "";
      const annotate = bucketize(decisions);
      const recommended = decisions.find((d) => annotate(d).bucket === "rec") || decisions[0] || [null, "暂无选项", "", 0];
      const decisionButtons = decisions.map((d) => {
        const [key, label] = d;
        const a = annotate(d);
        const cls = ["btn-s", "dd-opt", a.bucket === "rec" ? "is-recommend" : "", a.bucket === "avoid" ? "is-avoid" : ""].filter(Boolean).join(" ");
        const suffix = a.bucket === "rec" ? "（推荐）" : (a.bucket === "alt" ? "（备选）" : (a.bucket === "avoid" ? "（不建议）" : ""));
        return `<button class="${cls}" data-key="${esc(key)}">${esc(label)}${suffix}</button>`;
      }).join("");
      return `
        <div class="decision-dock">
          <div class="dd-l">
            <strong>本节点只做一个判断 ——</strong>
            <p>${esc(s.decisionQuestion)} 推荐路径：<b>${esc(recommended[1])}</b>。</p>
          </div>
          <div class="dd-actions">
            ${decisionButtons}
            <button class="btn-s fill dd-save" disabled aria-disabled="true">保存判断</button>
          </div>
        </div>
      `;
    }

    function renderArtifactScaffold(s) {
      const stageId = currentStageId();
      const stage = stageById[stageId];
      const stageIdx = STAGES.findIndex((g) => g.id === stageId) + 1;
      const stagePadIdx = pad(stageIdx);
      const headTitle = stage
        ? `# 环节 ${stagePadIdx} · ${esc(stage.title)} · ${esc(s.title)}`
        : `# ${esc(s.title)}`;
      // v5 苏格拉底题链：chain mode 下，产物在题链 4 阶全部走完前锁定
      const chainBank = getChainBank(s.id);
      const store = window.PharmacoPilotStore;
      const transferDone = chainBank && store && store.getTransfer
        ? (store.getTransfer(s.id) || []).length > 0
        : false;
      const isLocked = !!chainBank && !transferDone;
      // 精确进度提示（v6）:基于 computeChainStateInfo 计算当前进度 N/4
      let progressText = "完成全部 4 阶题链后解锁";
      if (chainBank && typeof computeChainStateInfo === "function") {
        try {
          const si = computeChainStateInfo(s, chainBank);
          const done = (si.q1Done ? 1 : 0) + (si.q2Done ? 1 : 0)
            + ((si.q3DecisionDone && si.q3ReflectionDone) ? 1 : 0)
            + (si.q4Done ? 1 : 0);
          progressText = "题链进度 " + done + " / 4 · " + (
            si.current === 5 ? "已完成" :
            si.current === 4 ? "等 Q4 迁移题(可跳过)" :
            si.current === 3 ? (si.q3DecisionDone ? "等 Q3 反思" : "等 Q3 决策") :
            "等 Q" + si.current
          );
        } catch (e) {}
      }
      const lockBanner = isLocked
        ? `<div class="artifact-chain-lock">${esc(progressText)}</div>`
        : "";

      // ── v6.3 产物卡状态化 ──────────────────────────────────────────
      // 旧版整张卡是静态模板、表头永远写死"待生成"：教师做完一个环节后
      // 产物毫无变化，L3 产出链也就名不副实。现改为读 Store：
      //   未决策 → 仍显示"将产出什么"的模板（此时它是规格，合理）
      //   已决策 → 换成教师真实决策的草稿（判断 / 理由 / 流向）
      const judgmentNow = (typeof lookupChainJudgment === "function") ? lookupChainJudgment(s) : null;
      const cpNow = (store && store.getChainProgress) ? store.getChainProgress(s.id) : { reflections: {} };
      const artsNow = (store && store.getArtifacts) ? (store.getArtifacts(s.id) || []) : [];

      let stateLabel = "待生成";
      if (artsNow.length) {
        const at = artsNow[artsNow.length - 1].savedAt;
        const hhmm = at ? new Date(at).toTimeString().slice(0, 5) : "";
        stateLabel = `✓ 已生成${hhmm ? " · " + hhmm : ""}`;
      } else if (judgmentNow) {
        stateLabel = "✓ 判断已定 · 待生成产物";
      }

      // 反思正文：字段名由本站题链的 Q3 决定，取不到就退回模板态
      let reflectionText = "";
      if (chainBank) {
        const q3 = (chainBank.chain || []).find((q) => q.step === 3);
        const fld = q3 && q3.postSelectReflection && q3.postSelectReflection.field;
        // Store 里反思存为 { text, ts }；兼容早期直接存字符串的数据
        const rec = fld ? (cpNow.reflections || {})[fld] : null;
        reflectionText = (rec && typeof rec === "object") ? (rec.text || "") : (rec || "");
      }

      // 流向下游：与 L3 顶卡同源（STAGE_CHAIN），不另造一套口径
      const chainDef = STAGE_CHAIN[stageId] || { outputsTo: [], topCardToKeys: [] };
      const flowTargets = (chainDef.outputsTo || []).map((sid) => {
        const idx = STAGES.findIndex((x) => x.id === sid) + 1;
        const st = stageById[sid];
        return `${pad(idx)} ${st ? st.displayName || st.title : sid}`;
      });
      const flowLine = (chainDef.topCardToKeys || []).length
        ? `${(chainDef.topCardToKeys || []).join(" / ")} → ${flowTargets.length ? flowTargets.join(" · ") : "本环节为终点"}`
        : (flowTargets.length ? flowTargets.join(" · ") : "本环节为终点");

      const guide = stationGuide(s);
      const bodyHtml = judgmentNow
        ? `
<span class="k">${headTitle}</span><br/>
<span class="s">## 我的判断</span><br/>
${esc(judgmentNow.label || judgmentNow.key)}<br/>
<span class="s">## 我的理由</span><br/>
${reflectionText ? esc(reflectionText) : '<span class="dim">（Q3 反思未填写）</span>'}<br/>
<span class="s">## 流向下游</span><br/>
${esc(flowLine)}<br/>
<span class="s">## 评价依据</span><br/>
${s.qualityDimensions.map((q) => esc(q)).join(" · ")}
        `
        : `
<span class="k">${headTitle}</span><br/>
<span class="s">## 关键教学判断</span><br/>
${esc(s.userMindset)}<br/>
<span class="s">## 做好是什么样</span><br/>
${esc(guide.good)}<br/>
<span class="s">## 怎么做好</span><br/>
${esc(guide.how)}<br/>
<span class="s">## 设计依据</span><br/>
${esc(guide.why)}<br/>
<span class="s">## 产物类型</span><br/>
${esc(s.artifactType)}<br/>
<span class="s">## 评价依据</span><br/>
${s.qualityDimensions.map((q) => esc(q)).join(" · ")}<br/>
<span class="s">## 后台校验点（隐藏式）</span><br/>
${s.backendCheckpoints.map((b) => `[${esc(b)}]`).join(" ")}
        `;

      return `
        <div class="artifact${isLocked ? " is-chain-locked" : ""}${judgmentNow ? " is-drafted" : ""}">
          ${lockBanner}
          <div class="artifact-h">
            <span>本节点产物 · <b>${esc(productFilename(s))}</b> · ${esc(stateLabel)}</span>
            <span>评价维度 ${s.qualityDimensions.length}</span>
          </div>
          <div class="artifact-body">${bodyHtml}</div>
        </div>
      `;
    }

    // ---- 本节点说明：主视图只突出「做好是什么样」+「怎么做好」 ----
    //      设计依据保留为二级折叠，不与当前操作争夺首屏注意力。
    function stationGuide(s) {
      const subKey = effectiveSubKey();
      return C.SWOT_NODE_GUIDES?.[String(subKey)] || {
        good: s.what,
        how: s.how,
        why: s.why,
      };
    }

    function renderStationIntro(s) {
      // 合并节点 2-3 只在主体顶部呈现一次说明；
      // 下方「议程协商」追加段不再复制同两张卡。
      if (_suppressDetailHead) return "";
      const guide = stationGuide(s);
      return `
        <details class="station-intro-disclosure">
          <summary class="sid-summary">
            <span class="sid-label">本节点说明</span>
            <span class="sid-preview">${esc(guide.good)}</span>
            <span class="sid-caret" aria-hidden="true">⌄</span>
          </summary>
          <div class="station-intro">
            <div class="intro-card">
              <span class="intro-lbl">做好是什么样</span>
              <p>${esc(guide.good)}</p>
            </div>
            <div class="intro-card">
              <span class="intro-lbl">怎么做好</span>
              <p>${esc(guide.how)}</p>
            </div>
          </div>
          <details class="intro-rationale">
            <summary>设计依据 · 为什么这样做</summary>
            <p>${esc(guide.why)}</p>
          </details>
        </details>
      `;
    }

    function figureScaffold(s) {
      return `
        <div class="figure-card scaffold">
          <div class="fcard-lbl"><span>FIGURE · 图示设计中</span><b>${esc(s.evidenceFigure.split(/\s*[\/＋+]\s*/)[0])}</b></div>
          <div class="scaffold-body" aria-label="图示占位">
            <div class="scaffold-mark">◇</div>
            <p class="scaffold-lead">本节点证据图正在设计中：</p>
            <p class="scaffold-evidence">${esc(s.evidenceFigure)}</p>
          </div>
          <div class="figure-foot">
            <span>来源 · 站内数据载荷</span>
          </div>
        </div>
      `;
    }

    // ============================================================
    //  Figures for stations 2, 4, 6, 8, 9, 10, 11
    //  (stations 1, 3, 5, 7 inline their figures in their rich renderers)
    // ============================================================
    function figureFor(s) {
      if (s.id === 2)  return figureStation02();
      if (s.id === 4) {
        // S2 两段：4-a 目标 → 认知层级金字塔 + 目标↔证据；4-b 评价标准 → 5 维评价标准矩阵 + 证据覆盖热图
        const sk = effectiveSubKey();
        const sub = sk ? SUB_NODES[sk] : null;
        return (sub && sub.focus === "rubric") ? figureStation04Rubric() : figureStation04();
      }
      if (s.id === 6)  return figureStation06();
      if (s.id === 8)  return figureStation08();
      if (s.id === 9)  return figureStation09();
      if (s.id === 10) {
        // S7 三段：10-a 评分 → 评分+Pareto；10-b 反馈画像 → 评价雷达图；10-c 评价标准修订 → 反向修订对照
        const sk = effectiveSubKey();
        const sub = sk ? SUB_NODES[sk] : null;
        const f = sub && sub.focus;
        if (f === "scoring") return figureStation10Scoring();
        if (f === "rubric-revision") return figureStation10Revision();
        return figureStation10(); // feedback-profile（画像）+ 兜底
      }
      if (s.id === 11) return figureStation11();
      return figureScaffold(s);
    }

    // 02 · 学情入口 — 前测分布条形图（payload 驱动）
    function figureStation02() {
      const e2 = efigOf(2);
      const defaultRows = [
        ['Q1 · SWOT 中 W 指什么', 65, 18, 14, 3],
        ['Q2 · S 与 W 的判定边界', 32, 30, 30, 8],
        ['Q3 · O / T 来自内 / 外部', 41, 16, 36, 7],
        ['Q4 · 同时为 S 与 T 的情景', 19, 30, 38, 13],
      ];
      // payload.preTest 形式：[{q, correctPct, status, commonMisconception}]
      // 构造与默认 rows 兼容的 [q, good, partial, misc, none] 形式
      const rows = (e2 && e2.preTest && e2.preTest.length)
        ? e2.preTest.map((p) => {
            const good = Math.max(0, Math.min(100, Number(p.correctPct) || 0));
            // 剩余按 30/45/25 比例分到 partial/misc/none（粗略）
            const rest = 100 - good;
            const partial = Math.round(rest * 0.30);
            const misc = Math.round(rest * 0.45);
            const none = Math.max(0, rest - partial - misc);
            return [p.q, good, partial, misc, none];
          })
        : defaultRows;
      // 收集高频误区描述（payload 里有的话）
      const topMisconception = (e2 && e2.preTest)
        ? e2.preTest.filter((p) => p.commonMisconception).sort((a, b) => a.correctPct - b.correctPct)[0]
        : null;
      return `
        <div class="figure-card rich-02">
          <div class="fcard-lbl"><span>FIGURE · 学情分布</span><b>前测 4 题 · N=32</b></div>
          <div class="pre-legend">
            <span class="leg"><i class="seg-good"></i>掌握</span>
            <span class="leg"><i class="seg-part"></i>部分</span>
            <span class="leg"><i class="seg-misc"></i>误区</span>
            <span class="leg"><i class="seg-none"></i>未答</span>
          </div>
          <div class="prediag-rows">
            ${rows.map(([q,g,p,m,n]) => `
              <div class="pre-row">
                <span class="pre-q">${esc(q)}</span>
                <div class="pre-bar">
                  <i class="seg-good" style="width:${g}%"></i>
                  <i class="seg-part" style="width:${p}%"></i>
                  <i class="seg-misc" style="width:${m}%"></i>
                  <i class="seg-none" style="width:${n}%"></i>
                </div>
                <span class="pre-v">${g}%</span>
              </div>
            `).join("")}
          </div>
          <div class="pre-callout">
            <span class="pre-mark">★</span>
            <span><b>怎么用</b> · 最低正确率题背后藏的不是"基础差"而是具体误区(本班 → <b>${esc(topMisconception ? topMisconception.commonMisconception : "S 与 T 互斥")}</b>) — 本节问题链要专门做这个边界的澄清。</span>
          </div>
          ${(() => {
            // v6.4: 参与度 2×2 象限图 — 还原"主动/被动 × 高知/低知"二维诊断
            const quads = (e2 && e2.participationQuadrants) || [];
            if (!quads.length) return "";
            // 4 象限按位置定位:[主动+高知, 主动+低知, 被动+高知, 被动+低知]
            const getQuad = (label) => quads.find((q) => q.label === label) || { pct: 0, color: "#888" };
            const topRight = getQuad("主动 + 高知");
            const topLeft  = getQuad("被动 + 高知");
            const botRight = getQuad("主动 + 低知");
            const botLeft  = getQuad("被动 + 低知");
            const renderBubble = (q) => `
              <div class="pq-cell">
                <div class="pq-bubble" style="background:${esc(q.color || "#888")}">${q.pct}%</div>
                <div class="pq-label">${esc(q.label || "")}</div>
              </div>
            `;
            return `
              <div class="pq-h">参与度 2 维分群 · 主动性 × 知识水平 · N=32</div>
              <div class="participation-quads" aria-label="参与度二维象限">
                ${renderBubble(topLeft)}
                ${renderBubble(topRight)}
                ${renderBubble(botLeft)}
                ${renderBubble(botRight)}
                <span class="pq-axis-x is-left">← 被动</span>
                <span class="pq-axis-x is-right">主动 →</span>
                <span class="pq-axis-y is-top">↑ 高知识</span>
                <span class="pq-axis-y is-bot">↓ 低知识</span>
              </div>
              <p class="pq-meta">气泡大小 ~ 该象限学生比例 · ${botLeft.pct}% 被动低知组需低门槛入口 + 角色支持</p>
            `;
          })()}
          <div class="figure-foot">
            <span>来源 · 课前 1 周前测 · 闻道认知诊断包</span>
            ${(e2 && e2.preTest && e2.preTest.length) ? `
              <details class="figure-drill"><summary>展开题目 →</summary>
                <ol class="drill-list">
                  ${e2.preTest.map((p) => `<li><b>${esc(p.q)}</b> · 正确率 ${esc(String(p.correctPct))}%${p.commonMisconception ? ` <span class="drill-misc">误区：${esc(p.commonMisconception)}</span>` : ""}</li>`).join("")}
                </ol>
              </details>
            ` : `<span class="figure-foot-note">前测题目库（样例 4 题已在上图展示）</span>`}
          </div>
        </div>
      `;
    }

    // 04 · 学习目标 — Bloom 层级 × 证据覆盖（payload 驱动）
    function figureStation04() {
      const e4 = efigOf(4);
      // 默认 6 层 [lvl, name, percent, evidence-coverage 0-3]
      const defaultRows = [
        ['L6', '创造', 6,  0],
        ['L5', '评价', 14, 1],
        ['L4', '分析', 22, 3],
        ['L3', '应用', 28, 2],
        ['L2', '理解', 22, 2],
        ['L1', '记忆', 8,  3],
      ];
      // payload.bloomDistribution: [{level:"创造", percent:6}, ...] — 从 L1 到 L6 顺序
      const bloom = (e4 && e4.bloomDistribution) || null;
      // v6.5: 重构为金字塔形 — L6(高阶/最稀)在顶,L1(基础)在底
      // bloomDistribution 数据顺序是 L1→L6,我反转为 L6→L1
      const rows = bloom
        ? [...bloom].reverse().map((b, i) => {
            const lvl = `L${6 - i}`;
            const pct = b.percent;
            // v6.5 修正:证据覆盖按"高阶覆盖率低"的语义 — L6 创造 0/3 (难配评价证据),
            // L1 记忆 3/3 (容易出题)。i=0 是 L6,所以 cov 随 i 上升。
            const cov = Math.min(3, Math.max(0, Math.round(i * 0.65)));
            return [lvl, b.level, pct, cov];
          })
        : defaultRows;
      // 找高阶覆盖薄弱点(percent > 10 但 cov < 2)
      const weakHighOrder = rows.find(([lv, cn, pct, cov]) => (lv === "L5" || lv === "L6") && pct >= 10 && cov < 2);
      // 金字塔最大宽度像素(用于把 percent 映射到 px)
      const PYRAMID_MAX = 240;
      return `
        <div class="figure-card rich-04">
          <div class="fcard-lbl"><span>FIGURE · 认知层级金字塔</span><b>Bloom 6 层 × 证据覆盖</b></div>
          <div class="bloom-pyramid">
            ${rows.map(([lv, cn, pct, cov]) => {
              // 颜色梯度:L5/L6 高阶(amber-deep),L3/L4 中阶(amber),L1/L2 基础(sage)
              const tier = (lv === "L5" || lv === "L6") ? "is-high"
                          : (lv === "L3" || lv === "L4") ? "is-mid"
                          : "is-low";
              // 宽度:percent 直接映射,最小 36px 保证可见
              const barW = Math.max(36, Math.round(PYRAMID_MAX * (pct / 32)));
              const barCls = pct === 0 ? "is-empty" : tier;
              return `
                <div class="bp-row">
                  <span class="bp-lvl"><small>${esc(lv)}</small>${esc(cn)}</span>
                  <div class="bp-bar-wrap">
                    <div class="bp-bar ${barCls}" style="width:${barW}px;">${pct}%</div>
                  </div>
                  <div class="bp-cov" title="证据覆盖 ${cov}/3">
                    ${[0,1,2].map(j => `<i class="${j < cov ? "" : "is-empty"}"></i>`).join("")}
                  </div>
                </div>
              `;
            }).join("")}
          </div>
          <p class="bp-meta">
            ↑ 高阶能力(评价/创造) · ↓ 基础能力(记忆/理解) · 条宽 ~ 目标占比 · 右侧方块 = 评价证据覆盖
          </p>
          ${(() => {
            // v6.5: 目标↔证据 5 对配对 — Backward Design 闭环可视化
            const gem = (e4 && e4.goalEvidenceMap) || [];
            if (!gem.length) return "";
            return `
              <div class="goal-evidence-pairs">
                <div class="ge-pairs-h">目标 ↔ 评价证据 · Backward Design 闭环</div>
                ${gem.map((p) => `
                  <div class="ge-pair">
                    <div class="ge-goal">${esc(p.goal || "")}</div>
                    <div class="ge-arrow">→</div>
                    <div class="ge-evidence">${esc(p.evidence || "")}</div>
                  </div>
                `).join("")}
              </div>
            `;
          })()}
          <div class="bloom-gap">
            <b>★ 怎么用</b> · ${weakHighOrder
              ? `${esc(weakHighOrder[1])}层有目标但右侧证据方块亮得少 — 给"能${esc(weakHighOrder[1])}"配可观察证据,否则目标无法被评估`
              : "高阶层证据覆盖良好"}
          </div>
          <div class="figure-foot">
            <span>来源 · 目标设计稿 v0.2 · 10 个学习目标</span>
            <details class="figure-drill"><summary>展开数据 →</summary>
              <ol class="drill-list">
                ${rows.map(([lv, cn, pct, cov]) => `<li><b>${esc(cn)}（${esc(lv)}）</b> · ${pct}% · 证据覆盖 ${cov}/3</li>`).join("")}
              </ol>
            </details>
          </div>
        </div>
      `;
    }

    // 04 (4-b) · 评价标准设计 — 5 维评价标准矩阵 × 4 等级 + 证据覆盖热图（payload 可覆盖 e4.rubric5d）
    function figureStation04Rubric() {
      const e4 = efigOf(4);
      const defaultRubric = [
        { dim: "一致性", full: "目标—活动—评价对齐", cur: 3, cov: 2,
          levels: ["目标与评价脱节", "部分目标有证据", "多数目标可被产出证明", "每条目标都配对齐证据"] },
        { dim: "真实性", full: "药事情境真实度", cur: 3, cov: 2,
          levels: ["纯课本概念", "贴药事标签", "嵌入真实政策/案例", "高仿真集采决策情境"] },
        { dim: "学情", full: "学情诊断与差异支持", cur: 2, cov: 1,
          levels: ["不分层", "提到前测", "目标回应低分项", "为差异学生留不同入口"] },
        { dim: "高阶", full: "认知参与与高阶思维", cur: 2, cov: 1,
          levels: ["停在记忆/理解", "到应用", "到分析", "到评价/创造·TOWS"] },
        { dim: "评价", full: "评价证据与反馈效度", cur: 2, cov: 1,
          levels: ["无可采集证据", "有分数无描述符", "有 4 等级描述符", "可解释达成并导改进"] },
      ];
      const rubric = (e4 && e4.rubric5d && e4.rubric5d.length) ? e4.rubric5d : defaultRubric;
      const weak = rubric.filter((r) => (r.cov || 0) < 2).map((r) => r.dim);
      const row = (r) => {
        const cells = (r.levels || []).map((lv, i) => {
          const lvl = i + 1;
          const isCur = lvl === r.cur;
          return `<div class="r4r-cell${isCur ? " is-cur" : ""}" style="flex:1;min-width:0;padding:4px 5px;border:1px solid ${isCur ? "var(--amber-deep)" : "var(--rule)"};border-radius:4px;background:${isCur ? "rgba(217,119,87,.12)" : "transparent"};font-size: var(--fs-2xs);line-height:1.3;color:${isCur ? "var(--amber-deep)" : "var(--mute)"};"><b style="display:block;font-size: var(--fs-2xs);letter-spacing:.04em;opacity:.7;">L${lvl}</b>${esc(lv)}</div>`;
        }).join("");
        const cov = Math.max(0, Math.min(3, Number(r.cov) || 0));
        const covBlocks = [0, 1, 2].map((j) => `<i style="display:inline-block;width:8px;height:8px;margin-left:2px;border-radius:1px;background:${j < cov ? "var(--amber-deep)" : "rgba(168,73,42,.15)"};"></i>`).join("");
        return `
          <div class="r4r-row" style="display:flex;align-items:stretch;gap:8px;margin:6px 0;">
            <div class="r4r-dim" style="width:84px;flex:none;">
              <b style="display:block;font-size: var(--fs-xs);color:var(--ink);">${esc(r.dim)}</b>
              <small style="font-size: var(--fs-2xs);color:var(--mute);line-height:1.25;">${esc(r.full || "")}</small>
            </div>
            <div class="r4r-levels" style="flex:1;display:flex;gap:4px;">${cells}</div>
            <div class="r4r-cov" style="width:32px;flex:none;text-align:right;align-self:center;" title="证据覆盖 ${cov}/3">${covBlocks}</div>
          </div>
        `;
      };
      return `
        <div class="figure-card rich-04b">
          <div class="fcard-lbl"><span>FIGURE · 5 维评价标准矩阵</span><b>5 维 × 4 等级 · 证据覆盖热图</b></div>
          <div style="display:flex;gap:10px;font-size: var(--fs-2xs);color:var(--mute);letter-spacing:.04em;margin:2px 0 6px;">
            <span><i style="display:inline-block;width:8px;height:8px;border:1px solid var(--amber-deep);border-radius:2px;background:rgba(217,119,87,.12);vertical-align:middle;"></i> 当前设计等级</span>
            <span style="margin-left:auto;"><i style="display:inline-block;width:8px;height:8px;background:var(--amber-deep);border-radius:1px;vertical-align:middle;"></i> 证据覆盖 /3</span>
          </div>
          ${rubric.map(row).join("")}
          <div class="bloom-gap" style="margin-top:8px;">
            <b>★ 怎么用</b> · ${weak.length
              ? `${esc(weak.join(" / "))} 维只到 L2、证据覆盖偏低 — 先为高阶目标（TOWS / 批判）配可观察证据，并补「批判意识」描述符，否则评价标准判不出高低`
              : "5 维均 ≥ L3 且证据覆盖良好"}
          </div>
          <div class="figure-foot">
            <span>来源 · 评价标准设计稿 v0.2 · 5 维 × 4 等级</span>
            <details class="figure-drill"><summary>展开评价标准细则 →</summary>
              <ol class="drill-list">
                ${rubric.map((r) => `<li><b>${esc(r.dim)} · ${esc(r.full || "")}</b><br/>${(r.levels || []).map((lv, i) => `<span style="display:block;padding-left:6px;font-size: var(--fs-2xs);">· L${i + 1} ${esc(lv)}</span>`).join("")}</li>`).join("")}
              </ol>
            </details>
          </div>
        </div>
      `;
    }

    // 06 · 案例证据室 — 案例证据密度条形图 + 议程覆盖点（payload 驱动）
    function figureStation06() {
      const e6 = efigOf(6);
      const defaultBars = [
        ["事实", 78, { status: "ok" }],
        ["政策", 62, { status: "ok" }],
        ["数据", 55, { status: "warn" }],
        ["角色", 38, { status: "miss" }],
        ["边界", 34, { status: "miss" }],
      ];
      const bars = (e6 && e6.bars && e6.bars.length) ? e6.bars : defaultBars;
      const dots = (e6 && e6.agendaCoverageDots) || [];
      const subject = (payloadOf(6) && payloadOf(6).exampleCase && payloadOf(6).exampleCase.subject) || "案例";
      // v4.2: 显示"样例数据"提示，让教师明白当前 bars 不是基于自己上传的材料计算
      const dataNotice = (e6 && e6.dataNotice) || null;
      const STATUS_COLOR = {
        ok:   "var(--sage)",
        warn: "var(--amber)",
        miss: "var(--amber-deep)",
      };
      return `
        <div class="figure-card rich-06">
          <div class="fcard-lbl"><span>FIGURE · 案例证据密度</span><b>${esc(subject)} · ${bars.length} 维证据</b></div>
          ${dataNotice ? `
            <div class="evd-data-notice" style="margin:6px 0 10px;padding:7px 10px;background:rgba(184,134,11,.08);border-left:3px solid var(--amber);font-size: var(--fs-2xs);color:var(--amber-deep);line-height:1.45;border-radius:0 4px 4px 0;">
              ${esc(dataNotice.text || "⚠ 当前为示例数据")}
            </div>
          ` : ""}
          <div class="evdensity-wrap">
            <div class="evdensity-bars">
              ${bars.map((b) => {
                const meta = b[2] || {};
                const c = STATUS_COLOR[meta.status] || "var(--mute-2)";
                const badge = meta.status === "ok" ? "✓" : (meta.status === "warn" ? "⚠" : (meta.status === "miss" ? "✕" : ""));
                return `
                  <div class="evd-row">
                    <span class="evd-lbl">${esc(b[0])}</span>
                    <span class="evd-track"><i style="width:${Math.max(0, Math.min(100, b[1])).toFixed(1)}%;background:${c}"></i></span>
                    <span class="evd-val" style="color:${c}">${b[1]}% ${badge}</span>
                  </div>
                `;
              }).join("")}
            </div>
            ${dots.length ? `
              <div class="evd-agendas">
                <div class="evd-agendas-hd">议程 → 证据对照</div>
                <div class="evd-agendas-row">
                  ${dots.map((d) => `
                    <span class="evd-agenda ${d.covered ? "is-covered" : "is-miss"}" title="${esc(d.evidenceSrc || "缺证据")}">
                      <i></i><small>${esc(d.label || d.agendaKey)}</small>
                    </span>
                  `).join("")}
                </div>
              </div>
            ` : ""}
          </div>
          <div class="evd-callout">
            <b>★ 怎么用</b> · miss 状态 = 学生只能凭常识填表的维度 — 不补上,SWOT 就退化为"猜想 + 形容词"。
          </div>
          <div class="figure-foot">
            <span>来源 · ${esc(subject)} 材料包 · 议程对照表（来自学习者议程环节）</span>
            ${dots.length ? `
              <details class="figure-drill"><summary>展开案例资料 →</summary>
                <ol class="drill-list">
                  ${dots.map((d) => `<li><b>${esc(d.label || d.agendaKey)}</b> · ${d.covered ? `证据：${esc(d.evidenceSrc || "已覆盖")}` : `<span class="drill-misc">缺证据，待补</span>`}</li>`).join("")}
                </ol>
              </details>
            ` : `<span class="figure-foot-note">案例资料（样例已在上图展示）</span>`}
          </div>
        </div>
      `;
    }

    // 08 · 案例探究 — 小组任务泳道图（payload 角色驱动）
    function figureStation08() {
      const e8 = efigOf(8);
      const roleBars = (e8 && e8.bars) || [
        ["资料员", 72], ["判断员", 66], ["质询员", 48], ["汇报员", 58],
      ];
      // 把 4 个角色映射成 4 条泳道。每条泳道：3 段 (收集 / 辨析 / 产出)
      // 角色密度越低，"卡壳"段越长（质询员 48% 触发卡壳）。
      const lanes = roleBars.slice(0, 4).map((b, idx) => {
        const role = b[0];
        const density = Number(b[1] || 60);
        const status = (b[2] || {}).status;
        const isBlock = status === "warn" || status === "miss" || density < 55;
        if (isBlock) {
          return { role, items: [[0,28,'collect','收集'],[30,16,'block','卡壳 ★'],[48,48,'output','补救+产出']] };
        }
        const collect = Math.round(16 + density * 0.08);
        const debate = Math.round(28 + density * 0.10);
        const out = 100 - collect - debate - 4;
        return { role, items: [[0,collect,'collect','数据收集'],[collect+2,debate,'debate','立场辨析'],[collect+debate+4,out,'output','结构化产出']] };
      });
      const roleTimeBudget = (e8 && e8.roleTimeBudget) || null;
      return `
        <div class="figure-card rich-08">
          <div class="fcard-lbl"><span>FIGURE · 探究泳道</span><b>4 组 × 13 分钟微实战</b></div>
          <div class="swim-body">
            <div class="swim-axis">
              <span>0'</span><span>4'</span><span>9'</span><span>13'</span>
            </div>
            ${lanes.map(({role, items}) => `
              <div class="swim-lane">
                <span class="swim-lbl">${esc(role)}</span>
                <div class="swim-track">
                  ${items.map(([l,w,k,t]) => `
                    <span class="swim-card seg-${k}" style="left:${l}%;width:${w}%"><b>${esc(t)}</b></span>
                  `).join("")}
                </div>
              </div>
            `).join("")}
          </div>
          <div class="swim-legend">
            <span><i class="seg-collect"></i>数据收集</span>
            <span><i class="seg-debate"></i>立场辨析</span>
            <span><i class="seg-block"></i>卡壳干预</span>
            <span><i class="seg-output"></i>产出</span>
          </div>
          <div class="swim-callout">
            <b>★ 怎么用</b> · 卡壳段(amber-deep)= 教师必须介入点 — 备好"立场切换 / 反例对照 / 数据解读模板"3 类追问脚本。
          </div>
          ${(() => {
            // v6.4: 议程→角色 Sankey 流向图 — 还原议程贯通第 3 回响点的"映射关系"
            // v6.5: 扩大 viewBox + 给标签留足空间(原版 320×180 → 议程/角色标签被裁剪)
            const sugg = (e8 && e8.roleSuggestions) || [];
            if (!sugg.length) return "";
            // 4 角色固定顺序
            const ROLES = ["资料员", "判断员", "质询员", "汇报员"];
            // 布局:左标签 150 + 流线 200 + 右标签 130 = 总 480
            const W = 480, H = 220;
            const leftX = 150;   // 议程节点位置(标签向左延伸 150px)
            const rightX = 350;  // 角色节点位置(标签向右延伸 130px)
            const nodeW = 10;
            const agendaCount = sugg.length;
            // 议程节点位置(垂直均匀分布)
            const agendaY = (i) => 30 + (i / Math.max(agendaCount - 1, 1)) * (H - 60);
            // 角色节点位置
            const roleY = (i) => 30 + (i / Math.max(ROLES.length - 1, 1)) * (H - 60);
            // 流线 SVG bezier curve
            const flows = sugg.map((s, i) => {
              const ri = ROLES.indexOf(s.suggestedRole);
              if (ri < 0) return "";
              const y1 = agendaY(i), y2 = roleY(ri);
              const cx1 = leftX + 70, cx2 = rightX - 70;
              return `<path class="sk-flow" d="M${leftX + nodeW} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${rightX} ${y2}" data-agenda="${esc(s.agendaKey)}" data-role="${esc(s.suggestedRole)}"><title>${esc(s.agendaText)} → ${esc(s.suggestedRole)} · ${esc(s.reason)}</title></path>`;
            }).join("");
            const agendaNodes = sugg.map((s, i) => {
              const y = agendaY(i);
              return `
                <rect class="sk-agenda-node" x="${leftX}" y="${y - 8}" width="${nodeW}" height="16" />
                <text class="sk-agenda-label" x="${leftX - 6}" y="${y + 4}" text-anchor="end">${esc(s.agendaText)}</text>
              `;
            }).join("");
            const roleNodes = ROLES.map((r, i) => {
              const y = roleY(i);
              return `
                <rect class="sk-role-node" x="${rightX}" y="${y - 10}" width="${nodeW}" height="20" />
                <text class="sk-role-label" x="${rightX + nodeW + 6}" y="${y + 4}" text-anchor="start">${esc(r)}</text>
              `;
            }).join("");
            return `
              <div class="sankey-wrap">
                <div class="sankey-h">议程 → 角色 推荐流向 · 5 议程 × 4 角色 · 还原议程贯通第 3 回响点</div>
                <svg class="sankey-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" aria-label="议程到角色 Sankey 流向图">
                  ${flows}
                  ${agendaNodes}
                  ${roleNodes}
                </svg>
              </div>
            `;
          })()}
          <div class="figure-foot">
            <span>来源 · 课堂时间线 · 角色意愿表 ASG-3417</span>
            ${roleTimeBudget && roleTimeBudget.sequence ? `
              <details class="figure-drill"><summary>展开任务卡 →</summary>
                <ol class="drill-list">
                  ${roleTimeBudget.sequence.map((seg) => `<li><b>${esc(seg.primaryRole)}</b> · ${seg.t}'–${seg.end}' · ${esc(seg.desc)}</li>`).join("")}
                </ol>
              </details>
            ` : `<span class="figure-foot-note">任务卡（4 角色泳道已在上图展示）</span>`}
          </div>
        </div>
      `;
    }

    // 09 · 动态学情触发 — 理解曲线 + 学情校准点（payload 驱动，对齐学习活动与教学支架设计环节时间线）
    function figureStation09() {
      // S6 三锚点共用一图（同一 45' 时间轴）：高亮当前锚点而非拆图
      const __sk09 = effectiveSubKey();
      const activeAnchor = (__sk09 && SUB_NODES[__sk09] && SUB_NODES[__sk09].anchorId) || null;
      // 锚点优先取 station7 payload；fallback 用 station9 payload 的 pulseRules
      const e7 = efigOf(7);
      const e9 = efigOf(9);
      const anchors = (e7 && e7.zpdAnchors)
        || ((e9 && e9.pulseRules) || []).map((r) => ({ id: r.anchorId, t: r.t, label: r.microFormat }))
        || [
          { id: "Z1", t: 5,  label: "" },
          { id: "Z2", t: 22, label: "" },
          { id: "Z3", t: 38, label: "" },
        ];
      const totalMin = Math.max(...anchors.map((a) => a.t), 45);
      // v6.4: 把规则数据作为主视觉(规则卡片) — 理解曲线降为辅助
      const Store0 = window.PharmacoPilotStore;
      const savedRules0 = Store0 && Store0.getAllPulseRules && Store0.getAllPulseRules();
      const recRules0 = (e9 && e9.pulseRules) || [];
      const hasUserRules = savedRules0 && Object.keys(savedRules0).length > 0;
      const rulesByAnchor = {};
      if (hasUserRules) {
        Object.keys(savedRules0).forEach((id) => { rulesByAnchor[id] = Object.assign({ anchorId: id }, savedRules0[id]); });
      } else {
        recRules0.forEach((r) => { rulesByAnchor[r.anchorId] = r; });
      }
      const ruleCardsHtml = anchors.map((a) => {
        const r = rulesByAnchor[a.id] || {};
        const isSet = !!(r.ifCond || r.thenAct);
        return `
          <div class="rule-card ${isSet ? "is-set" : "is-empty"}${a.id === activeAnchor ? " is-active" : ""}" data-anchor="${esc(a.id)}"${a.id === activeAnchor ? ' style="outline:2px solid var(--amber-deep);outline-offset:1px;border-radius:5px;background:rgba(217,119,87,.06);"' : ""}>
            <div class="rc-head">
              <span class="rc-id">${esc(a.id)}</span>
              <span class="rc-t">${a.t}'</span>
              <span class="rc-label">${esc(a.label || r.microFormat || "")}</span>
              ${a.id === activeAnchor ? '<span style="margin-left:auto;font-size: var(--fs-2xs);font-weight:600;color:var(--amber-deep);letter-spacing:.06em;">▶ 当前</span>' : ""}
            </div>
            ${r.microFormat ? `<div class="rc-format">微评估: ${esc(r.microFormat)}</div>` : ""}
            <div class="rc-if">
              <span class="rc-kw">如果</span>
              <span>${esc(r.ifCond || "(待写触发条件)")}</span>
            </div>
            <div class="rc-then">
              <span class="rc-kw">则</span>
              <span>${esc(r.thenAct || "(待写课堂动作)")}</span>
            </div>
          </div>
        `;
      }).join("");
      const ruleSrcLabel = hasUserRules ? "已保存" : "推荐(待教师确认)";
      // x: 40 (left axis) → 310 (right edge), available width 270
      const xOf = (m) => 40 + (m / totalMin) * 270;
      const tickVals = [0, totalMin / 3, (totalMin * 2) / 3, totalMin].map((v) => Math.round(v));
      return `
        <div class="figure-card rich-09">
          <div class="fcard-lbl"><span>FIGURE · 反馈触发</span><b>理解曲线 + ${anchors.length} 学情校准点${activeAnchor ? ` · 当前 ${esc(activeAnchor)}` : ""} · 总 ${totalMin}'</b></div>
          <div class="pulse-wrap">
            <svg class="pulse-svg" viewBox="0 0 320 200" aria-label="理解曲线">
              <line x1="40" y1="20" x2="40" y2="160" stroke="var(--rule)"/>
              <line x1="40" y1="160" x2="310" y2="160" stroke="var(--rule)"/>
              <line x1="40" y1="68" x2="310" y2="68" stroke="var(--amber-deep)" stroke-dasharray="2,3" opacity="0.5"/>
              <text x="305" y="64" text-anchor="end" font-family="var(--mono)" font-size="9" fill="var(--amber-deep)">阈值 60%</text>
              <text x="34" y="24" text-anchor="end" font-family="var(--mono)" font-size="9" fill="var(--mute)">100%</text>
              <text x="34" y="72" text-anchor="end" font-family="var(--mono)" font-size="9" fill="var(--mute)">60%</text>
              <text x="34" y="164" text-anchor="end" font-family="var(--mono)" font-size="9" fill="var(--mute)">0%</text>
              ${tickVals.map((tv, i) => {
                const xs = [40, 130, 220, 310];
                return `<text x="${xs[i]}" y="178" text-anchor="middle" font-family="var(--mono)" font-size="9" fill="var(--mute)">${tv}'</text>`;
              }).join("")}
              <!-- area + line (固定形状，仅作示意) -->
              <path d="M 40 100 Q 80 78, 110 88 T 170 60 Q 200 95, 230 78 T 310 38 L 310 160 L 40 160 Z" fill="rgba(217,119,87,0.10)"/>
              <path d="M 40 100 Q 80 78, 110 88 T 170 60 Q 200 95, 230 78 T 310 38" fill="none" stroke="var(--amber-deep)" stroke-width="2"/>
              <!-- ZPD anchors（按 payload t 值动态定位） -->
              ${anchors.map((a) => {
                const x = xOf(a.t);
                const on = a.id === activeAnchor;
                return `
                  ${on ? `<circle cx="${x.toFixed(1)}" cy="160" r="9" fill="none" stroke="var(--amber-deep)" stroke-width="1.5"/>` : ""}
                  <g transform="translate(${x.toFixed(1)},160)"><polygon points="0,-7 -6,4 6,4" fill="var(--amber-deep)" opacity="${on ? 1 : 0.4}"/></g>
                  <text x="${x.toFixed(1)}" y="178" text-anchor="middle" font-family="var(--mono)" font-size="${on ? 10 : 9}" fill="var(--amber-deep)" font-weight="${on ? 700 : 500}" opacity="${on ? 1 : 0.55}">${esc(a.id)}</text>
                `;
              }).join("")}
            </svg>
            <div class="pulse-legend">
              <span><i class="li-amber-line"></i>班级理解率</span>
              <span><i class="li-dash"></i>反馈阈值</span>
              <span><i class="li-triangle"></i>学情校准点</span>
            </div>
          </div>
          <!-- v6.4: 规则卡片作为主视觉(规则是 S6 节点的核心产出) -->
          <div class="rule-cards" data-source="${esc(ruleSrcLabel)}">
            ${ruleCardsHtml}
          </div>
          <div class="pulse-callout">
            <b>★ 怎么用</b> · 曲线每跌破阈值线 → 立即查对应锚点规则卡 → 1 分钟内决定继续/暂停/重启。
          </div>
          <div class="figure-foot">
            <span>动态学情触发 · 实时采集自 AI 虚拟班</span>
            ${(() => {
              // v4.2: 锚点规则优先读 Store 已保存规则，回退到 payload 推荐规则
              const Store = window.PharmacoPilotStore;
              const saved = Store && Store.getAllPulseRules && Store.getAllPulseRules();
              const recRules = (e9 && e9.pulseRules) || [];
              const rules = (saved && Object.keys(saved).length)
                ? Object.keys(saved).map((id) => Object.assign({ anchorId: id }, saved[id]))
                : recRules;
              if (!rules.length) return `<span class="figure-foot-note">锚点规则（在形成性评价与适应性调控环节生成产物后写入）</span>`;
              const srcTag = (saved && Object.keys(saved).length) ? "已保存" : "推荐";
              return `<details class="figure-drill"><summary>展开锚点规则 →</summary>
                <ol class="drill-list">
                  ${rules.map((r) => `<li><b>${esc(r.anchorId)}（${r.t || "?"}'）</b> · 若 ${esc(r.ifCond || "—")} → ${esc(r.thenAct || "—")} <span class="drill-misc">[${srcTag}]</span></li>`).join("")}
                </ol>
              </details>`;
            })()}
          </div>
        </div>
      `;
    }

    // 10 · 表现性评价与学习成效诊断 — 评价雷达图（payload 驱动，支持 5 维五边形 / 6 维六边形）
    // v4.2: 若教师已在 10-a 子节点保存评分，优先用 Store 数据生成能力画像；否则用 payload 默认值
    function figureStation10() {
      const e10 = efigOf(10);
      const defaultBars = [
        ["论证严谨度",   72, { status: "ok"   }],
        ["立场清晰度",   78, { status: "ok"   }],
        ["证据丰富度",   76, { status: "ok"   }],
        ["合作贡献",     61, { status: "miss" }],
        ["表达流畅度",   58, { status: "miss" }],
        ["同伴反馈质量", 70, { status: "ok"   }],
      ];
      // v4.2: 优先读 Store 中 10-a 保存的评分作为运行时数据源
      const Store = window.PharmacoPilotStore;
      const scoringJud = Store && (Store.getJudgment("10-a") || Store.getJudgment(10));
      const scoringArtifact = Store && Store.getArtifacts && (Store.getArtifacts(10) || []).find((a) => a.artifactId === "rubric-5d");
      // 数据源判定：若教师已保存评分判断，标记为"实测数据"
      const hasUserScore = !!(scoringJud && scoringJud.score);
      let bars = (e10 && e10.bars && e10.bars.length) ? e10.bars : defaultBars;
      if (hasUserScore && scoringArtifact && scoringArtifact.data && Array.isArray(scoringArtifact.data.scores)) {
        // 如果未来 artifact 包含真实评分数组，转化为 bars 格式
        bars = scoringArtifact.data.scores.map((s) => [s.dim, s.score, { status: s.score >= 70 ? "ok" : (s.score >= 50 ? "warn" : "miss") }]);
      }
      const dataSourceLabel = hasUserScore ? "实测班级评分" : "样例评分";
      const N = bars.length;
      const R = 90;          // 雷达外环半径
      const cx = 140, cy = 130;
      const TARGET = 80;     // 目标线 80%

      // 多边形顶点角度：从 12 点方向开始，顺时针均分
      const angleAt = (i) => -Math.PI / 2 + (2 * Math.PI * i) / N;
      const pt = (i, scale) => {
        const a = angleAt(i);
        return [Math.cos(a) * R * scale, Math.sin(a) * R * scale];
      };
      // 标签位置（外推 1.18 倍 + 偏移）
      const labelXY = (i) => {
        const [x, y] = pt(i, 1.18);
        return [cx + x, cy + y + 4];
      };

      // 同心环 3 层 (33%/66%/100%) + 目标环 (80%)
      const ringPolyAt = (scale) =>
        Array.from({ length: N }, (_, i) => pt(i, scale)).map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
      // 实际班级值
      const valuePoly = bars.map((b, i) => {
        const v = Math.max(0, Math.min(100, Number(b[1] || 0))) / 100;
        const [x, y] = pt(i, v);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(" ");
      // 低分维度标记
      const lowMarks = bars.map((b, i) => {
        const meta = b[2] || {};
        if (meta.status !== "miss" && meta.status !== "warn") return "";
        const v = Number(b[1] || 0) / 100;
        const [x, y] = pt(i, v);
        return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="var(--amber-deep)"/>`;
      }).join("");

      const lowDims = bars.filter((b) => (b[2] || {}).status === "miss").map((b) => `${esc(b[0])} ${b[1]}%`);

      return `
        <div class="figure-card rich-10">
          <div class="fcard-lbl"><span>FIGURE · 评价雷达图</span><b>${N} 个评价维度 · ${dataSourceLabel}</b></div>
          ${!hasUserScore ? `
            <div class="rubric-data-notice" style="margin:6px 0 10px;padding:7px 10px;background:rgba(184,134,11,.08);border-left:3px solid var(--amber);font-size: var(--fs-2xs);color:var(--amber-deep);line-height:1.45;border-radius:0 4px 4px 0;">
              ⚠ 当前为样例评分。在子节点 10-a 完成 5 个评价维度的评分后，能力画像将基于实测数据重新生成。
            </div>
          ` : ""}
          <div class="rubric-wrap">
            <svg class="rubric-svg" viewBox="-50 -20 380 290" preserveAspectRatio="xMidYMid meet" aria-label="评价雷达图">
              <g transform="translate(${cx},${cy})">
                <polygon points="${ringPolyAt(0.33)}" fill="none" stroke="rgba(168,73,42,0.10)"/>
                <polygon points="${ringPolyAt(0.66)}" fill="none" stroke="rgba(168,73,42,0.10)"/>
                <polygon points="${ringPolyAt(1.0)}"  fill="none" stroke="rgba(168,73,42,0.20)"/>
                ${Array.from({ length: N }, (_, i) => {
                  const [x, y] = pt(i, 1.0);
                  return `<line x1="0" y1="0" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="rgba(168,73,42,0.18)"/>`;
                }).join("")}
                <!-- 目标线 ${TARGET}% -->
                <polygon points="${ringPolyAt(TARGET / 100)}" fill="rgba(106,154,123,0.08)" stroke="var(--sage)" stroke-width="1" stroke-dasharray="3,3"/>
                <!-- 当前班级 -->
                <polygon points="${valuePoly}" fill="rgba(217,119,87,0.20)" stroke="var(--amber-deep)" stroke-width="2" stroke-linejoin="round"/>
                ${lowMarks}
              </g>
              ${bars.map((b, i) => {
                const [lx, ly] = labelXY(i);
                const meta = b[2] || {};
                const star = meta.status === "miss" ? " ★" : "";
                const anchor = lx > cx + 5 ? "start" : (lx < cx - 5 ? "end" : "middle");
                return `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${anchor}" font-family="var(--serif-cn)" font-size="11" fill="var(--ink)" font-weight="500">${esc(b[0])}${star}</text>`;
              }).join("")}
            </svg>
            <div class="rubric-legend">
              <span class="leg"><i class="li-amber"></i>当前班级</span>
              <span class="leg"><i class="li-dash-sage"></i>目标线 ${TARGET}%</span>
              <span class="leg"><i class="li-star"></i>低分维度 ×${lowDims.length || 0}</span>
            </div>
          </div>
          <div class="rubric-callout">
            <b>★ 怎么用</b> · 高阶维度(批判 / TOWS)需专题训练 — 基础维度(证据性)1 节课即可改善 — 优先级见 S8 复盘。
          </div>
          <div class="figure-foot">
            <span>来源 · ${esc((e10 && e10.subtitle) || "课后作品 32 份")}</span>
            ${(e10 && e10.rubric && e10.rubric.length) ? `
              <details class="figure-drill"><summary>展开评价标准细则 →</summary>
                <ol class="drill-list">
                  ${e10.rubric.map((r) => `<li><b>${esc(r.dim)}</b><br/>${(r.levels || []).map((lv) => `<span style="display:block;padding-left:6px;font-size: var(--fs-2xs);">· ${esc(lv)}</span>`).join("")}</li>`).join("")}
                </ol>
              </details>
            ` : `<span class="figure-foot-note">评价标准细则（5 维已在雷达图展示）</span>`}
          </div>
        </div>
      `;
    }

    // 10 (10-a) · 评分采集 — 5 维原始评分条 + 低分维度 Pareto
    function figureStation10Scoring() {
      const e10 = efigOf(10);
      const bars = (e10 && e10.bars && e10.bars.length) ? e10.bars : [
        ["条目证据性", 46, { status: "miss" }], ["内外分类准确性", 78, { status: "ok" }],
        ["条目精炼度", 62, { status: "warn" }], ["TOWS 可操作性", 44, { status: "miss" }],
        ["批判意识", 38, { status: "miss" }],
      ];
      const pareto = (e10 && e10.paretoLowDimensions && e10.paretoLowDimensions.length) ? e10.paretoLowDimensions : [
        { dim: "批判意识", mean: 38, weightInTotal: 0.28 },
        { dim: "TOWS 可操作性", mean: 44, weightInTotal: 0.24 },
        { dim: "条目证据性", mean: 46, weightInTotal: 0.22 },
      ];
      const col = (st) => st === "miss" ? "var(--amber-deep)" : st === "warn" ? "var(--amber)" : "var(--sage)";
      const barRow = (b) => {
        const v = Math.max(0, Math.min(100, Number(b[1]) || 0));
        const st = (b[2] || {}).status;
        return `<div style="display:flex;align-items:center;gap:8px;margin:4px 0;">
          <span style="width:96px;flex:none;font-size: var(--fs-2xs);color:var(--ink);">${esc(b[0])}</span>
          <div style="flex:1;height:12px;background:rgba(0,0,0,.05);border-radius:3px;overflow:hidden;"><i style="display:block;height:100%;width:${v}%;background:${col(st)};border-radius:3px;"></i></div>
          <span style="width:28px;flex:none;text-align:right;font-size: var(--fs-2xs);font-weight:600;color:${col(st)};">${v}</span>
        </div>`;
      };
      const maxW = Math.max(...pareto.map((p) => p.weightInTotal || 0), 0.01);
      const totW = pareto.reduce((a, p) => a + (p.weightInTotal || 0), 0) || 1;
      let cum = 0;
      const paretoRow = (p) => {
        cum += (p.weightInTotal || 0);
        const cumPct = Math.round((cum / totW) * 100);
        return `<div style="display:flex;align-items:center;gap:8px;margin:3px 0;font-size: var(--fs-2xs);">
          <span style="width:96px;flex:none;color:var(--amber-deep);font-weight:600;">${esc(p.dim)}</span>
          <span style="width:46px;flex:none;color:var(--mute);">均分 ${p.mean}</span>
          <div style="flex:1;height:8px;background:rgba(168,73,42,.10);border-radius:2px;overflow:hidden;"><i style="display:block;height:100%;width:${Math.round(((p.weightInTotal || 0) / maxW) * 100)}%;background:var(--amber-deep);"></i></div>
          <span style="width:54px;flex:none;text-align:right;color:var(--mute);">累计 ${cumPct}%</span>
        </div>`;
      };
      const lowest = pareto[0] || { dim: "—", mean: "—" };
      return `
        <div class="figure-card rich-10a">
          <div class="fcard-lbl"><span>FIGURE · 评分采集</span><b>5 维原始评分 · 低分维度 Pareto</b></div>
          <div style="font-size: var(--fs-2xs);color:var(--mute);letter-spacing:.04em;margin:2px 0 6px;">5 组作品均分 · 只采集数据，不做定性、不写反馈</div>
          ${bars.map(barRow).join("")}
          <div style="margin-top:9px;font-size: var(--fs-2xs);color:var(--mute);letter-spacing:.04em;">低分维度 Pareto · 排下一轮优先项</div>
          ${pareto.map(paretoRow).join("")}
          <div class="bloom-gap" style="margin-top:8px;"><b>★ 怎么用</b> · 最该优先补的是「${esc(lowest.dim)}」（均分 ${lowest.mean}）— 本步只采集，反馈语在下一步「反馈与画像」写</div>
          <div class="figure-foot"><span>来源 · 课后作品 32 份 · 5 组</span></div>
        </div>
      `;
    }

    // 10 (10-c) · 评价标准反向修订 — 低分维 → 修订建议 → 回写 S2
    function figureStation10Revision() {
      const e10 = efigOf(10);
      const pareto = (e10 && e10.paretoLowDimensions && e10.paretoLowDimensions.length) ? e10.paretoLowDimensions : [
        { dim: "批判意识", mean: 38 }, { dim: "TOWS 可操作性", mean: 44 }, { dim: "条目证据性", mean: 46 },
      ];
      const proposals = pareto.map((p) => ({
        dim: p.dim, mean: p.mean,
        fix: (Number(p.mean) || 0) < 45
          ? "4 等级描述符区分度不足 — 补行为锚点 + 药事实例，明确合格线"
          : "证据要求偏宽 — 收紧合格线，要求可复核出处",
      }));
      const row = (q) => `
        <div style="display:flex;gap:8px;align-items:flex-start;margin:6px 0;padding:6px 8px;border:1px solid var(--rule);border-radius:5px;background:rgba(217,119,87,.04);">
          <span style="flex:none;width:86px;font-size: var(--fs-2xs);font-weight:600;color:var(--amber-deep);line-height:1.3;">${esc(q.dim)}<br/><small style="font-weight:400;color:var(--mute);">均分 ${q.mean}</small></span>
          <span style="flex:1;font-size: var(--fs-2xs);line-height:1.45;color:var(--ink);">${esc(q.fix)}</span>
        </div>`;
      return `
        <div class="figure-card rich-10c">
          <div class="fcard-lbl"><span>FIGURE · 评价标准反向修订</span><b>低分维 → 修订项 → 回写 S2</b></div>
          <div style="font-size: var(--fs-2xs);color:var(--mute);letter-spacing:.04em;margin:2px 0 6px;">把本轮评价标准暴露的问题反向修订到「环节 02 预期学习结果与评价证据设计」</div>
          ${proposals.map(row).join("")}
          <div class="bloom-gap" style="margin-top:6px;"><b>↩ 回写通道</b> · 确认后经 rubricRevision 通道送回 S2；S2 须显式确认或驳回后方可继续（教学评一体化闭环）</div>
          <div class="figure-foot"><span>来源 · 本轮 5 维评分 · ${proposals.length} 条修订建议</span></div>
        </div>
      `;
    }

    // 11 · 复盘 / 资产沉淀 — 按当前 stage (S8 / S9) 分别渲染
    function figureStation11() {
      const curStage = (typeof currentStageId === "function") ? currentStageId() : "S8";
      if (curStage === "S9") return figureStation11_S9();
      return figureStation11_S8();
    }

    // S8 复盘决策舱 — 议程跨站轨迹表 + L1 学情触发摘要
    function figureStation11_S8() {
      const Store = window.PharmacoPilotStore;
      const C = window.PharmacoPilotNavigationContract || {};
      const stageNameByEcho = { 4: "S2", 6: "S4", 8: "S5", 11: "S8" };
      const agendas = (Store && Store.getAgendas()) || [];
      const af = (Store && Store.dump().agendaFulfillment) || {};
      const zpdAnchors = (Store && Store.getZpdAnchors()) || [];
      const pulseRules = (Store && Store.getAllPulseRules()) || {};

      // v4.2: 议程未兑现原因记录（从 Store 读，配合 saveAgendaUnfulfillmentNote）
      const unfulfillNotes = (Store && Store.getAgendaUnfulfillmentNotes && Store.getAgendaUnfulfillmentNotes()) || {};
      // v6.4: 重构为 5×4 热力矩阵——议程行 × 站点列 + 列底总分
      const STATIONS_4 = [4, 6, 8, 11]; // S2 / S4 / S5 / S8
      const STATION_LABELS = ["S2", "S4", "S5", "S8"];
      let matrixHtml = "";
      if (agendas.length) {
        // 矩阵主体
        const matrixCells = [
          `<div class="fm-corner">议程＼站点</div>`,
          ...STATION_LABELS.map((lbl) => `<div class="fm-col-h">${esc(lbl)}</div>`),
          `<div class="fm-col-h">兑现</div>`,
        ];
        // 议程行
        agendas.forEach((a) => {
          matrixCells.push(`<span class="fm-row-h">${esc(a.text || a.key)}</span>`);
          STATIONS_4.forEach((sid) => {
            const has = af[sid] && af[sid][a.key];
            matrixCells.push(has
              ? `<div class="fm-cell is-fulfilled" title="${esc(stageNameByEcho[sid])} 已兑现">✓</div>`
              : `<div class="fm-cell is-empty" title="${esc(stageNameByEcho[sid])} 未兑现"></div>`
            );
          });
          const score = STATIONS_4.filter((sid) => af[sid] && af[sid][a.key]).length;
          const scoreCls = score === 4 ? "is-full" : (score === 0 ? "is-low" : "");
          matrixCells.push(`<span class="fm-score ${scoreCls}">${score}/4</span>`);
        });
        // 列底总分行
        matrixCells.push(`<span class="fm-totals-h">合计兑现</span>`);
        STATIONS_4.forEach((sid) => {
          const total = agendas.filter((a) => af[sid] && af[sid][a.key]).length;
          matrixCells.push(`<div class="fm-col-total">${total} / ${agendas.length}</div>`);
        });
        matrixCells.push(`<div class="fm-corner-bot"></div>`);

        // 未兑现议程的原因记录(在矩阵下方,只显示有缺口的议程)
        const incompleteAgendas = agendas.filter((a) => {
          const sc = STATIONS_4.filter((sid) => af[sid] && af[sid][a.key]).length;
          return sc < STATIONS_4.length;
        });
        const unfulfillSection = incompleteAgendas.length ? `
          <div class="fm-unfulfill-section">
            <div class="fm-unfulfill-h">未兑现原因记录 (${incompleteAgendas.length} 条有缺口)</div>
            ${incompleteAgendas.map((a) => {
              const existingNote = unfulfillNotes[a.key] && unfulfillNotes[a.key].reason;
              return `
                <details class="ar-note" style="margin: 6px 0;">
                  <summary style="cursor:pointer;font-family:var(--mono);font-size: var(--fs-2xs);color:var(--amber-deep);list-style:none;padding:4px 0;">
                    <span>${existingNote ? "✏ " + esc(a.text) + " · 已记录" : "＋ " + esc(a.text)}</span>
                  </summary>
                  <div style="display:flex;gap:6px;margin-top:5px;">
                    <textarea class="ar-note-input" data-agenda-key="${esc(a.key)}" placeholder="例：学生未在小组讨论中提及 / 证据材料不足 / 时间不够…" rows="2" style="flex:1;font-family:inherit;font-size: var(--fs-2xs);padding:5px 7px;border:1px solid rgba(168,73,42,.25);border-radius:4px;resize:vertical;">${esc(existingNote || "")}</textarea>
                    <button class="btn-s ar-note-save" data-agenda-key="${esc(a.key)}" style="white-space:nowrap;padding:5px 10px;font-size: var(--fs-2xs);">保存</button>
                  </div>
                </details>
              `;
            }).join("")}
          </div>
        ` : "";

        matrixHtml = `
          <div class="fulfill-matrix">${matrixCells.join("")}</div>
          ${unfulfillSection}
        `;
      } else {
        matrixHtml = `<div class="ar-empty">无议程数据 · 先到 S1 / S3 采集</div>`;
      }
      const traceRows = matrixHtml;

      const pulseRows = zpdAnchors.length ? zpdAnchors.map((a) => {
        const r = pulseRules[a.id] || {};
        return `<div class="pr-row">
          <span class="pr-id">${esc(a.id)}</span>
          <span class="pr-t">${a.t}'</span>
          <span class="pr-rule">${r.ifCond ? `若 ${esc(r.ifCond.slice(0, 24))} → ${esc((r.thenAct || "").slice(0, 30))}` : '<i class="pr-empty">未配规则</i>'}</span>
        </div>`;
      }).join("") : `<div class="ar-empty">无 学情校准点 · 先到 S5 / S6 设规则</div>`;

      return `
        <div class="figure-card rich-11 s8-view">
          <div class="fcard-lbl"><span>FIGURE · 复盘视图</span><b>S8 · 议程轨迹 + 学情触发摘要</b></div>

          <div class="ar-section">
            <div class="ar-head">
              <span>学生议程跨站兑现轨迹 (${agendas.length} 条)</span>
              <span class="ar-legend">S2 · S4 · S5 · S8</span>
            </div>
            <div class="ar-list">${traceRows}</div>
          </div>

          <div class="ar-section pr-section">
            <div class="ar-head">
              <span>动态学情触发规则摘要 (${zpdAnchors.length} 个)</span>
            </div>
            <div class="pr-list">${pulseRows}</div>
          </div>

          <div class="figure-foot">
            <span>议程贯通 + 动态学情 闭环数据 · 来自 Store</span>
            <a href="#" data-demo-toast="完整复盘报告由「生成教学复盘报告」按钮产出">→ 见产物按钮</a>
          </div>
        </div>
      `;
    }

    // S9 资产沉淀舱 — 资产价值条形图 (payload bars 驱动)
    function figureStation11_S9() {
      const e11 = efigOf(11);
      const defaultBars = [
        ["低分样例",   76, { status: "ok",   source: "学生 SWOT 错例" }],
        ["反馈语",     68, { status: "ok",   source: "5 类误区反馈模板" }],
        ["修订案例",   82, { status: "ok",   source: "案例 v2" }],
        ["课堂气氛",   28, { status: "miss", source: "不可复用" }],
      ];
      const bars = (e11 && e11.bars && e11.bars.length) ? e11.bars : defaultBars;
      const STATUS_COLOR = {
        ok:   "var(--sage)",
        warn: "var(--amber)",
        miss: "var(--mute-2)",
      };
      const total = bars.length;
      const valuable = bars.filter((b) => (b[2] || {}).status === "ok").length;

      return `
        <div class="figure-card rich-11 s9-view">
          <div class="fcard-lbl"><span>FIGURE · 资产价值</span><b>S9 · ${valuable}/${total} 类值得沉淀</b></div>
          <div class="evdensity-bars" style="padding-top:6px">
            ${bars.map((b) => {
              const meta = b[2] || {};
              const c = STATUS_COLOR[meta.status] || "var(--mute-2)";
              const badge = meta.status === "ok" ? "✓" : (meta.status === "warn" ? "⚠" : "✕");
              const source = meta.source ? `<small class="evd-source">${esc(meta.source)}</small>` : "";
              return `
                <div class="evd-row">
                  <span class="evd-lbl">${esc(b[0])}${source}</span>
                  <span class="evd-track"><i style="width:${Math.max(0, Math.min(100, b[1])).toFixed(1)}%;background:${c}"></i></span>
                  <span class="evd-val" style="color:${c}">${b[1]} ${badge}</span>
                </div>
              `;
            }).join("")}
          </div>
          <div class="evd-callout">
            <b>★ 沉淀策略</b> · 保留 ok 状态 (${valuable} 类) · 修订 warn 状态 · 丢弃 miss 状态（如「课堂气氛」不可复用）
          </div>
          <div class="figure-foot">
            <span>来源 · 学期资产库 / 案例 v2 / 评价标准 v2 / 法规更新日志</span>
            <a href="#" data-demo-toast="点「生成下一轮改进计划」按钮 产出完整资产清单">→ 见产物按钮</a>
          </div>
        </div>
      `;
    }

    // Agent 实时提议 · 出现在 core-grid 与 decision-dock 之间
    function renderAgentSuggestion(s) {
      const a = STATION_AGENT[s.id];
      if (!a) return "";
      return `
        <div class="agent-banner">
          <span class="agent-banner-meta">
            <span class="agent-banner-lbl">本节点协同 · LIVE</span>
            <span class="agent-banner-time">${esc(a.time)} · Agent 提议</span>
          </span>
          <p class="agent-banner-body">${a.body}</p>
        </div>
      `;
    }

    // 节点工作台外链 CTA · 出现在 detail-head 与 station-intro 之间
    function renderExternalCta(s) {
      const cta = STATION_EXTERNAL_CTA[s.id];
      if (!cta) return "";
      // 用第一个中文逗号把文案切成 "动作" + "目的" 两个重音
      const parts = String(cta.text).split(/，(.+)/);
      const head = esc(parts[0] || cta.text);
      const tail = esc(parts[1] || "");
      return `
        <a class="ext-cta" data-fanya data-fanya-url="${esc(cta.url)}" href="${esc(cta.url)}" target="_blank" rel="noopener noreferrer"
           aria-label="${esc(cta.text)} · 在新标签打开">
          <span class="ext-cta-rail" aria-hidden="true"></span>
          <span class="ext-cta-text">
            <b>${head}</b>${tail ? `，<em>${tail}</em>` : ""}
          </span>
          <span class="ext-cta-deco" aria-hidden="true">Story</span>
          <span class="ext-cta-btn" aria-hidden="true">▸</span>
        </a>
      `;
    }

    function scaffoldDetail(s) {
      const decisions = DB[s.id] || [];
      return renderDetailHead(s, decisions) +
        renderExternalCta(s) +
        renderStationIntro(s) +
        `<div class="core-grid">${figureFor(s)}${renderQuestionCardScaffold(s, decisions)}</div>` +
        renderAgentSuggestion(s) +
        renderDecisionDock(s, decisions) +
        renderArtifactScaffold(s);
    }

    // ---- Station 05 · 内容 · 问题链 — 封面深度版（保留 pharmaco 原杂志样张）----
    function richStation05(s) {
      const decisions = DB[5] || [];
      const e5 = efigOf(5);
      const subject = (payloadOf(5) && payloadOf(5).exampleCase && payloadOf(5).exampleCase.subject) || "案例";
      const chain = (e5 && e5.questionChain) || [
        { lvl: 1, type: "事实",   text: "什么是 SWOT 四象限？" },
        { lvl: 2, type: "机制",   text: "什么算「内部」？什么算「外部」？" },
        { lvl: 3, type: "证据",   text: "每条 SWOT 必须配什么证据？" },
        { lvl: 4, type: "权重",   text: "列出 20 条后，哪 3 条最重要？" },
        { lvl: 5, type: "应用",   text: "SWOT 本身不产策略，TOWS 才产" },
        { lvl: 6, type: "批判",   text: "SWOT 工具本身有哪些局限？" },
      ];
      const misc = (e5 && e5.keyMisconceptions) || [];
      const DIFF_COLOR = { low: "var(--ok)", med: "#5a7090", high: "#b8860b", "v.high": "var(--amber-deep)" };
      const DIFF_LABEL = { low: "低", med: "中", high: "高", "v.high": "极高" };

      const figure = `
        <div class="figure-card">
          <div class="fcard-lbl">
            <span>FIGURE · 方法论严谨链</span>
            <b>${chain.length} 层 × ${misc.length} 类误区</b>
          </div>
          <div class="chain-rows">
            ${chain.map((c) => {
              const blockPct = Math.round((c.blocking || 0) * 100);
              const color = DIFF_COLOR[c.difficulty] || "#999";
              return `
                <div class="chain-row">
                  <span class="cr-lvl" style="background:${color}">L${c.lvl}</span>
                  <span class="cr-type">${esc(c.type)}</span>
                  <span class="cr-text">${esc(c.text)}</span>
                  <span class="cr-meta">
                    ${c.difficulty ? `<span class="cr-diff" style="color:${color}">${DIFF_LABEL[c.difficulty] || c.difficulty}</span>` : ""}
                    ${c.blocking !== undefined ? `<span class="cr-block" title="预计卡点率">卡 ${blockPct}%</span>` : ""}
                  </span>
                </div>
              `;
            }).join("")}
          </div>
          ${misc.length ? `
            <details class="misc-disclosure" style="margin-top:12px;padding-top:10px;border-top:1px dashed var(--rule);">
              <summary style="cursor:pointer;font-family:var(--mono);font-size: var(--fs-2xs);color:var(--mute);letter-spacing:0.04em;list-style:none;">
                <span style="color:var(--amber-deep);font-weight:600;">⌄</span> 关键误区清单 · ${misc.length} 类高频误区
              </summary>
              <ol class="qchain" style="margin-top:10px;">
                ${misc.map((m) => {
                  const freqPct = Math.round((m.frequency || 0) * 100);
                  const sev = freqPct >= 60 ? "fork" : "";
                  return `<li style="font-size: var(--fs-xs);">
                    ${esc(m.text)}
                    <span class="ann ${sev}">${freqPct}% · ${esc(m.stage || "")}</span>
                    ${m.intervention ? `
                      <div style="margin-top:4px;padding:6px 9px;background:rgba(106,154,123,.08);border-left:2px solid var(--sage);font-size: var(--fs-2xs);color:var(--ink-soft);line-height:1.5;">
                        <span style="font-family:var(--mono);font-size: var(--fs-2xs);color:var(--sage);letter-spacing:.04em;">教学对策 · </span>${esc(m.intervention)}
                      </div>
                    ` : ""}
                  </li>`;
                }).join("")}
              </ol>
            </details>
          ` : ""}
        </div>
      `;

      return renderDetailHead(s, decisions) +
        renderStationIntro(s) +
        `<div class="core-grid">${figure}${renderQuestionCardScaffold(s, decisions)}</div>` +
        renderAgentSuggestion(s) +
        renderDecisionDock(s, decisions) +
        renderArtifactScaffold(s);
    }

    // ---- Station 01 · 课程任务定位 — 三角图 + 前后节承接上下文卡 ----
    function richStation01(s) {
      const decisions = DB[s.id] || [];
      const e1 = efigOf(1);

      // 4 类定位 bars（payload 提供权重 + 状态 + 原因 + 5 维 breakdown）
      const bars = (e1 && e1.bars) || [];
      const sortedBars = [].concat(bars).sort((a, b) => b[1] - a[1]);
      const topVal = sortedBars.length ? sortedBars[0][1] : 0;

      // 列信息（按总分降序排列）
      const cols = sortedBars.map(([name, val, meta]) => {
        const m = meta || {};
        const isTop = val === topVal;
        const isWarn = m.status === "warn";
        const cls = isTop ? "is-top" : (isWarn ? "is-warn" : "is-ok");
        const statusLabel = isTop ? "推荐" : (isWarn ? "不建议" : "备选");
        const short = name.replace(/(决策型|研究型|治理型|运营型)$/, "");
        return { name, short, val, cls, statusLabel, source: m.source || "", breakdown: m.breakdown || [] };
      });
      const topCol = cols.find((c) => c.cls === "is-top") || cols[0];
      const topType = topCol ? topCol.name : "综合决策型";

      // 5 维顺序（从第一列的 breakdown 抽取——所有列共享同一组维度）
      const dims = topCol && topCol.breakdown.length
        ? topCol.breakdown.map((b) => ({ dim: b.dim, max: b.max }))
        : [];
      // 矩阵化：行=维度,列=定位
      const matrix = dims.map((_, di) => cols.map((c) => {
        const bd = c.breakdown[di];
        return bd ? { score: bd.score, max: bd.max, note: bd.note } : { score: 0, max: dims[di].max, note: "" };
      }));

      const figure = `
        <div class="figure-card rich-01">
          <div class="fcard-lbl">
            <span>FIGURE · 课程对齐</span>
            <b>本节推荐定位 · ${esc(topType)}</b>
          </div>

          <!-- 对齐说明（替代三角图）-->
          <p class="alignment-note">
            本节课需对齐三件套:<b>药事·目标</b> ↔ <b>药事·任务</b> ↔ <b>药事·产出</b>。
            下方矩阵展示 4 类定位在 5 维评价上的分布——点击任一列查看细则。
          </p>

          <!-- 5×4 评分矩阵 -->
          <div class="rubric-matrix" data-current-col="${esc(topCol ? topCol.name : "")}">
            <!-- 表头行：corner + 4 类列 -->
            <div class="rm-corner">维度＼定位</div>
            ${cols.map((c, i) => `
              <button type="button" class="rm-col-h ${c.cls}${i === 0 ? " is-current" : ""}" data-col-name="${esc(c.name)}">
                <span class="rm-col-name">${esc(c.short)}</span>
              </button>
            `).join("")}

            <!-- 5 维 × 4 类 矩阵 -->
            ${dims.map((d, di) => `
              <span class="rm-dim">${esc(d.dim)}</span>
              ${matrix[di].map((cell, ci) => {
                const pct = ((cell.score / cell.max) * 100).toFixed(0);
                return `<div class="rm-cell ${cols[ci].cls}" data-col-name="${esc(cols[ci].name)}" title="${esc(cell.note || "")}">
                  <i class="rm-bar" style="width:${pct}%"></i>
                  <span class="rm-num">${cell.score}</span>
                </div>`;
              }).join("")}
            `).join("")}

            <!-- 总分行 (推荐项通过 is-top 高亮 amber 背景传达,不再单独画状态行) -->
            <span class="rm-dim rm-dim-total">总分 / 100</span>
            ${cols.map((c) => `<div class="rm-total ${c.cls}">${c.val}</div>`).join("")}
          </div>

          <!-- 详情区：默认显示 top 1（综合）,click 列切换 -->
          <div class="rm-detail">
            ${cols.map((c, idx) => `
              <div class="rm-detail-pane ${c.cls}" data-pane-col="${esc(c.name)}"${idx === 0 ? " data-active" : ""}>
                <div class="rm-detail-h">
                  <span>${esc(c.name)} · 评分细则 (${c.val} / 100 · ${c.statusLabel})</span>
                  <small>${esc(c.source)}</small>
                </div>
                <ul class="rm-detail-list">
                  ${c.breakdown.map((b) => `
                    <li>
                      <span class="rm-dt-dim">${esc(b.dim)}</span>
                      <span class="rm-dt-val">${b.score}/${b.max}</span>
                      <span class="rm-dt-note">${esc(b.note || "")}</span>
                    </li>
                  `).join("")}
                </ul>
              </div>
            `).join("")}
          </div>

        </div>
      `;
      return renderDetailHead(s, decisions) +
        renderStationIntro(s) +
        `<div class="core-grid">${figure}${renderQuestionCardScaffold(s, decisions)}</div>` +
        renderAgentSuggestion(s) +
        renderDecisionDock(s, decisions) +
        renderArtifactScaffold(s);
    }

    // ---- Station 03 · 学生议程协商 — 议程雷达 (学生 vs 教师预设) ----
    function richStation03(s) {
      const decisions = DB[s.id] || [];
      const e3 = efigOf(3);
      const clusters = (e3 && e3.mockStudentResponses && e3.mockStudentResponses.clusters) || [
        { agendaKey: "ethics-pricing",   text: "伦理边界",     studentVotes: 11 },
        { agendaKey: "innovation-press", text: "创新药企挤压", studentVotes: 7 },
        { agendaKey: "valsartan-trust",  text: "信任修复",     studentVotes: 4 },
        { agendaKey: "api-export",       text: "出海前景",     studentVotes: 3 },
        { agendaKey: "cdmo-window",      text: "CDMO 机遇",    studentVotes: 3 },
      ];
      const total = clusters.reduce((a, c) => a + (c.studentVotes || 0), 0) || 1;
      const sorted = clusters.slice().sort((a, b) => (b.studentVotes || 0) - (a.studentVotes || 0));
      const top = sorted[0];
      const sampleN = (e3 && e3.mockStudentResponses && e3.mockStudentResponses.sampleCount) || total;

      const figure = `
        <div class="figure-card rich-03">
          <div class="fcard-lbl"><span>FIGURE · 议程聚类</span><b>${clusters.length} 类 · ${total} 票 · N=${sampleN}</b></div>
          <div class="agenda-cluster-wrap">
            ${sorted.map((c, i) => {
              const pct = ((c.studentVotes || 0) / total * 100);
              const isTop = i === 0;
              const isLow = (c.studentVotes || 0) <= 3;
              const color = isTop ? "var(--amber-deep)" : (isLow ? "var(--mute-2)" : "var(--amber)");
              return `
                <div class="agcl-row">
                  <span class="agcl-rank">${String(i + 1).padStart(2, "0")}</span>
                  <span class="agcl-lbl">${esc(c.text || c.agendaKey)}${isTop ? " ★" : ""}</span>
                  <span class="agcl-bar"><i style="width:${pct.toFixed(1)}%;background:${color}"></i></span>
                  <span class="agcl-val">${c.studentVotes || 0} 票 · ${pct.toFixed(0)}%</span>
                </div>
              `;
            }).join("")}
          </div>
          <div class="tension-callouts">
            <div class="t-call"><b>${top.studentVotes}</b> 票 · ${esc(top.text)} — 最高票议程，与教师预设最大张力点</div>
          </div>
          <div class="figure-foot">
            <span>来源 · 课前议程协商单 · ${sampleN} 份学生回应</span>
            <details class="figure-drill"><summary>展开议程详情 →</summary>
              <ol class="drill-list">
                ${sorted.map((c) => `<li><b>${esc(c.text || c.agendaKey)}</b> · ${c.studentVotes || 0} 票（${((c.studentVotes || 0) / total * 100).toFixed(0)}%）${c.tensionWithTeacher ? ` <span class="drill-misc">张力：${esc(c.tensionWithTeacher)}</span>` : ""}</li>`).join("")}
              </ol>
            </details>
          </div>
        </div>
      `;
      return renderDetailHead(s, decisions) +
        renderStationIntro(s) +
        `<div class="core-grid">${figure}${renderQuestionCardScaffold(s, decisions)}</div>` +
        renderAgentSuggestion(s) +
        renderDecisionDock(s, decisions) +
        renderArtifactScaffold(s);
    }

    // ---- Station 07 · 课堂活动时间线 — payload 驱动 ----
    function richStation07(s) {
      const decisions = DB[s.id] || [];
      const efig = efigOf(7);

      // payload 优先；缺数据则回退到 45' 默认
      const defaultTl = [
        { t: 0,  type: "phase",  label: "导入" },
        { t: 5,  type: "anchor", anchorId: "Z1", label: "Z1" },
        { t: 5,  type: "phase",  label: "概念支架" },
        { t: 15, type: "phase",  label: "案例分析" },
        { t: 22, type: "anchor", anchorId: "Z2", label: "Z2" },
        { t: 25, type: "phase",  label: "小组协作" },
        { t: 35, type: "phase",  label: "反馈修正" },
        { t: 38, type: "anchor", anchorId: "Z3", label: "Z3" },
        { t: 42, type: "phase",  label: "总结" },
        { t: 45, type: "phase",  label: "下课" },
      ];
      const defaultAnchors = [
        { id: "Z1", t: 5,  label: "导入末" },
        { id: "Z2", t: 22, label: "案例分析中" },
        { id: "Z3", t: 38, label: "反馈修正前" },
      ];

      const timeline = (efig && efig.timeline) || defaultTl;
      const anchors  = (efig && efig.zpdAnchors) || defaultAnchors;
      const totalMin = Math.max(...timeline.map((t) => t.t), 1);

      // 阶段分段：phase 节点两两相邻
      const phases = timeline.filter((t) => t.type === "phase");
      const segs = [];
      const ICAP_COLORS = ["#d9d9d9", "#b8c5b0", "#a8b9d4", "var(--amber-soft)", "var(--amber)", "#c0c0c0"];
      for (let i = 0; i < phases.length - 1; i++) {
        const a = phases[i], b = phases[i + 1];
        const left = (a.t / totalMin) * 100;
        const width = ((b.t - a.t) / totalMin) * 100;
        if (width <= 0.1) continue;
        segs.push({ label: a.label, left, width, color: ICAP_COLORS[i % ICAP_COLORS.length] });
      }

      // 轴刻度 4 等分
      const ticks = [0, totalMin / 3, (totalMin * 2) / 3, totalMin].map((v) => Math.round(v) + "'");

      const figure = `
        <div class="figure-card rich-07">
          <div class="fcard-lbl"><span>FIGURE · 课堂时间线</span><b>${totalMin}' · ${anchors.length} 学情校准点</b></div>
          <div class="tl-wrap">
            <div class="tl-axis">
              ${ticks.map((t) => `<span>${esc(t)}</span>`).join("")}
            </div>
            <div class="tl-bar">
              ${segs.map((g, i) => `
                <span class="tl-seg" style="left:${g.left.toFixed(2)}%;width:${g.width.toFixed(2)}%;background:${g.color}"><b>${esc(g.label)}</b></span>
              `).join("")}
              ${anchors.map((a) => {
                const lf = ((a.t / totalMin) * 100).toFixed(2);
                return `<span class="tl-anchor" style="left:${lf}%" title="${esc(a.id)} · ${a.t}'"><i>◇</i><small>${a.t}'</small></span>`;
              }).join("")}
            </div>
            <div class="tl-icap">
              <span class="icap-lbl">ICAP 参与层级 →</span>
              <span class="icap-bar">${segs.map((g) => `<i style="left:${g.left.toFixed(2)}%;width:${g.width.toFixed(2)}%;background:${g.color}"></i>`).join("")}</span>
              <span class="icap-key"><b>P</b>assive <b>A</b>ctive <b>C</b>onstructive <b>I</b>nteractive</span>
            </div>
          </div>
          <div class="zpd-detail">
            ${anchors.map((a) => `
              <div class="zpd-row">
                <span class="zpd-num">◇ ${esc(a.id)}</span>
                <span class="zpd-t">${String(a.t).padStart(2, "0")}'</span>
                <span class="zpd-when">${esc(a.label || "")}${a.format ? " · " + esc(a.format) : ""}</span>
                <span class="zpd-rule">→ 在形成性评价与适应性调控环节设规则</span>
              </div>
            `).join("")}
          </div>
          <div class="figure-foot">
            <span>动态学情触发 · 学习活动与教学支架设计环节定义 · 形成性评价与适应性调控环节落地</span>
            <a href="#" data-demo-toast="锚点编辑器在形成性评价与适应性调控环节完成">去形成性评价与适应性调控环节编辑规则 →</a>
          </div>
        </div>
      `;
      return renderDetailHead(s, decisions) +
        renderStationIntro(s) +
        `<div class="core-grid">${figure}${renderQuestionCardScaffold(s, decisions)}</div>` +
        renderAgentSuggestion(s) +
        renderDecisionDock(s, decisions) +
        renderArtifactScaffold(s);
    }

    function productFilename(s) {
      const stem = (TILE_LABELS[s.id] || {}).cn || "station";
      const map = {
        1: "positioning.md", 2: "learner-profile.md", 3: "agenda.md",
        4: "objectives.md", 5: "question-chain.md", 6: "case-evidence.md",
        7: "lesson-timeline.md", 8: "collab-tasks.md", 9: "trigger-rules.md",
        10: "rubric.md", 11: "retrospective.md",
      };
      // 子节点上下文：合并节点(2-3) → 合并产物名；v1 回写(1b) → 锁定版定位
      const subKey = effectiveSubKey();
      if (subKey === "2-3" && (s.id === 2 || s.id === 3)) {
        return "learner-profile-and-agenda.md";
      }
      if (subKey === "1b" && s.id === 1) {
        return "positioning.locked.md";
      }
      if (subKey === "1" && s.id === 1) {
        return "positioning.md";
      }
      // S6 锚点细分：每个 学情校准点独立文件
      if (s.id === 9 && subKey && /^9-z[1-3]$/.test(subKey)) {
        const z = subKey.slice(-2).toUpperCase(); // Z1/Z2/Z3
        return `trigger-rules.${z.toLowerCase()}.md`;
      }
      // S2 UbD 两段：目标与评价标准分别存放
      if (s.id === 4 && subKey === "4-a") return "learning-objectives.md";
      if (s.id === 4 && subKey === "4-b") return "rubric.md";
      // S5 时间线 v0 vs v1 回写分文件
      if (s.id === 7 && subKey === "7")   return "lesson-timeline.md";
      if (s.id === 7 && subKey === "7b")  return "lesson-timeline.locked.md";
      // S7 评价三段分文件
      if (s.id === 10 && subKey === "10-a") return "rubric-scores.md";
      if (s.id === 10 && subKey === "10-b") return "feedback-and-profile.md";
      if (s.id === 10 && subKey === "10-c") return "rubric-revision-proposal.md";
      return map[s.id] || `${stem}.md`;
    }

    // ---- Right rail removed in favor of inline Agent banner (above decision-dock).
    //      Kept as no-op so renderAll() still works if the #rightRail node lingers.
    function renderRail() {
      const el = document.getElementById("rightRail");
      if (el) el.innerHTML = "";
    }

    // ---- Render: save strip ----
    function renderSaveStrip() {
      const el = document.getElementById("saveStrip");
      if (!el) return;
      const s = stationById[activeId];
      if (!s) return;
      const fn = productFilename(s);

      // 基于 sub-node key 推进:同环节内还有 step 就内部走;否则进入下一环节
      const curStageId = currentStageId();
      const curStg = stageById[curStageId];
      const subKeys = ((curStg && curStg.subNodeIds) || []).map(String);
      // 当前 sub-key:显式 activeSubKey 优先,否则取 stage 内第一个匹配 activeId 的 subkey
      let curSubKey = activeSubKey;
      if (!curSubKey) {
        curSubKey = subKeys.find((k) => {
          const e = SUB_NODES[k] || {};
          const lid = (typeof e.legacyStationId === "number") ? e.legacyStationId : Number(k);
          return lid === activeId;
        }) || null;
      }
      const curStepIdx = curSubKey ? subKeys.indexOf(String(curSubKey)) : -1;

      let nextLabel = "已是最后一环节";
      let nextStationId = null;
      let nextSubKey = null;
      let nextStageId = null;

      if (curStepIdx >= 0 && curStepIdx < subKeys.length - 1) {
        // 同环节,推进到下一子步骤
        nextSubKey = subKeys[curStepIdx + 1];
        const nsub = SUB_NODES[nextSubKey] || {};
        nextStationId = nsub.legacyStationId;
        nextStageId = curStageId;
        nextLabel = `下一步 · 步骤 ${curStepIdx + 2} / ${subKeys.length} →`;
      } else {
        // 跨环节
        const stageIdx = STAGES.findIndex((g) => g.id === curStageId);
        if (stageIdx >= 0 && stageIdx < STAGES.length - 1) {
          const nextStg = STAGES[stageIdx + 1];
          nextSubKey = ((nextStg.subNodeIds || []).map(String))[0];
          const nsub = SUB_NODES[nextSubKey] || {};
          nextStationId = nsub.legacyStationId;
          nextStageId = nextStg.id;
          nextLabel = `下一环节 · ${pad(stageIdx + 2)} ${stageShortLabel(nextStg)} →`;
        }
      }

      const clickHandler = nextStationId
        ? ` onclick="window.__navSetStation(${nextStationId}, '${esc(nextStageId || "")}', '${esc(String(nextSubKey || ""))}')"`
        : ' disabled';

      el.innerHTML = `
        <span>已自动保存 · <b>${activeId === 5 ? "2 分钟前" : "未开始"}</b> · ${esc(fn)}${activeId === 5 ? " v0.2" : ""}</span>
        <div class="save-actions">
          <button class="btn-s" data-demo-download data-plan-name="${esc(fn)}">⤓ 导出 ${esc(fn)}</button>
          <button class="btn-s" data-writeback-map data-station="${activeId}">＋ 写回训练地图</button>
          <button class="btn-s fill"${clickHandler}>${esc(nextLabel)}</button>
        </div>
      `;
    }

    // ---- Bind interactions ----
    function bindClicks() {
      document.addEventListener("click", (e) => {
        const t = e.target.closest("[data-st]");
        if (!t) return;
        const id = Number(t.getAttribute("data-st"));
        if (!Number.isFinite(id)) return;
        // v4: 若是 split 子节点（如 11a/11b、1b、2-3），同时切 activeStageId 与 activeSubKey
        const subkey = t.getAttribute("data-subkey");
        const stageHint = t.getAttribute("data-stage-hint") || (subkey && SUB_NODES[subkey] ? SUB_NODES[subkey].stageId : null);
        setStation(id, stageHint, subkey);
      });
      document.addEventListener("keydown", (e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        // 键盘可达:题链选项 / 环节导航 — 统一转发到既有 click 委托
        const act = e.target.closest(".chain-q-opts li[data-opt-key], [data-stage][role='button']");
        if (act) { e.preventDefault(); act.click(); return; }
        const t = e.target.closest("[data-st]");
        if (!t) return;
        e.preventDefault();
        const id = Number(t.getAttribute("data-st"));
        if (!Number.isFinite(id)) return;
        const subkey = t.getAttribute("data-subkey");
        const stageHint = t.getAttribute("data-stage-hint") || (subkey && SUB_NODES[subkey] ? SUB_NODES[subkey].stageId : null);
        setStation(id, stageHint, subkey);
      });
    }

    // 窄屏下把唯一的九环节导航收进抽屉；桌面端仍保持可见的侧栏。
    function bindNavigationDrawer() {
      const toggle = document.getElementById("stageDrawerToggle");
      const close = document.getElementById("stageDrawerClose");
      const scrim = document.getElementById("stageDrawerScrim");
      const navigation = document.getElementById("stageNavigation");
      if (!toggle || !close || !scrim || !navigation) return;

      const root = document.documentElement;
      const mobileQuery = window.matchMedia("(max-width: 1180px)");
      const syncA11y = () => {
        const hidden = mobileQuery.matches && !root.classList.contains("stage-drawer-open");
        navigation.setAttribute("aria-hidden", String(hidden));
        navigation.toggleAttribute("inert", hidden);
      };
      const setOpen = (open) => {
        const isOpen = Boolean(open && mobileQuery.matches);
        root.classList.toggle("stage-drawer-open", isOpen);
        toggle.setAttribute("aria-expanded", String(isOpen));
        scrim.setAttribute("aria-hidden", String(!isOpen));
        syncA11y();
      };

      toggle.addEventListener("click", () => setOpen(true));
      close.addEventListener("click", () => setOpen(false));
      scrim.addEventListener("click", () => setOpen(false));
      // 捕获阶段先收起抽屉：全局环节路由会同步重绘 nodeList，不能等其冒泡处理之后。
      document.addEventListener("click", (e) => {
        if (root.classList.contains("stage-drawer-open") && e.target.closest("#stageNavigation [data-stage]")) {
          setOpen(false);
        }
      }, true);
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") setOpen(false);
      });
      if (mobileQuery.addEventListener) mobileQuery.addEventListener("change", () => setOpen(false));
      syncA11y();
    }

    function setStation(id, stageOverride, subKeyOverride, opts) {
      if (!stationById[id]) return;
      const stationChanged = id !== activeId;
      const stageChanged = stageOverride && stageOverride !== activeStageId;
      const subChanged = subKeyOverride !== undefined && subKeyOverride !== activeSubKey;
      if (!stationChanged && !stageChanged && !subChanged) return;
      activeId = id;
      activeStageId = stageOverride || null;
      // 显式传入 subkey 则覆盖；否则回退到该 station 在当前环节内的默认子节点
      if (subKeyOverride !== undefined) {
        activeSubKey = subKeyOverride || null;
      } else {
        activeSubKey = null;
      }
      // 同步 Store.activeStation（bridge 用于查 DB[currentStation]）
      try {
        if (window.PharmacoPilotStore && window.PharmacoPilotStore.setActiveStation) {
          window.PharmacoPilotStore.setActiveStation(id);
        }
      } catch (e) {}
      renderAll();
      // 只有显式 opts.scrollToWorkbench 才滚动（"下一步/下一环节"按钮场景）；chip / 链接点击默认不滚
      if (opts && opts.scrollToWorkbench) {
        const wb = document.querySelector(".wb");
        if (wb) wb.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
    // 向后兼容：__navSetStation(id) 用于"下一步/下一环节"按钮，保留自动滚动
    // v4：扩展签名 (id, stageOverride?, subKeyOverride?)，让外部精准切到 v0/v1/锚点
    window.__navSetStation = function (id, stageOverride, subKeyOverride) {
      setStation(id, stageOverride || null, subKeyOverride, { scrollToWorkbench: true });
    };
    // v4: 桥层可读取当前激活 stage 用于过滤拆分 payload
    window.__navRenderState = {
      currentStageId: () => currentStageId(),
      currentStation: () => activeId,
      activeStageOverride: () => activeStageId,
      // v4 复合键：bridge 在保存判断时携带 subKey，区分 v0/v1、Z1/Z2/Z3、UbD a/b 等同 station 不同 pass
      currentSubKey: () => effectiveSubKey(),
      // 让 bridge 在 Store 事件后刷新 stage/phase 视觉 + 子节点 ✓ 标记
      refreshStageVisuals: () => {
        try { renderNodeList(); renderPhaseProgress(); renderStageBreadcrumb(); renderSubNodeRow(); } catch (e) {}
      },
      // 反向修订 / 议程兑现等需要重 render 整个 detail 面板（banner 内容依赖 Store）
      refreshDetail: () => {
        try { renderDetail(); renderSubNodeRow(); } catch (e) {}
      },
    };

    function renderAll() {
      renderTopChrome();
      renderStageBreadcrumb();
      renderSubNodeRow();
      renderPhaseProgress();
      renderNodeList();
      renderDetail();
      renderRail();
      renderSaveStrip();
    }

    // E: 课前 / 课中 / 课后 三段进度强化
    //   · 文本与进度条采用「走到第几个环节」语义：当前游标落在该 phase 第 N 个环节就显示 N/total
    //   · is-phase-done 仍按真实完成数（所有环节都有 saved judgment）触发
    function renderPhaseProgress() {
      const phaseRow = document.querySelector(".stage-deck-v4 .stage-row");
      if (!phaseRow) return;
      const curStageIdx = STAGES.findIndex((g) => g.id === currentStageId());
      [
        { id: "pre",  cls: "s-pre" },
        { id: "in",   cls: "s-in" },
        { id: "post", cls: "s-post" },
      ].forEach((ph) => {
        const seg = phaseRow.querySelector("." + ph.cls);
        if (!seg) return;
        const stagesInPhase = STAGES.filter((g) => g.phase === ph.id);
        const total = stagesInPhase.length;
        const done = stagesInPhase.filter((g) => stageStatusCls(g.id) === "is-done").length;
        // 「走到第几」= 该 phase 内全局序号 ≤ 当前游标的环节数
        const progressed = curStageIdx < 0
          ? 0
          : stagesInPhase.filter((g) => STAGES.findIndex((x) => x.id === g.id) <= curStageIdx).length;
        const cur = stagesInPhase.find((g) => g.id === currentStageId());
        const allDone = total > 0 && done === total;
        seg.classList.toggle("is-phase-done", allDone);
        seg.classList.toggle("is-phase-active", !!cur && !allDone);
        // 进度填充条（按"走到第几"百分比）
        let bar = seg.querySelector(".seg-progress");
        if (!bar) {
          bar = document.createElement("span");
          bar.className = "seg-progress";
          seg.insertBefore(bar, seg.firstChild);
        }
        const pct = total > 0 ? Math.round((progressed / total) * 100) : 0;
        bar.style.width = pct + "%";
        // 进度文本
        let txt = seg.querySelector(".seg-progress-txt");
        if (!txt) {
          txt = document.createElement("span");
          txt.className = "seg-progress-txt";
          seg.appendChild(txt);
        }
        txt.innerHTML = allDone
          ? `<i class="seg-check">✓</i> ${done}/${total}`
          : `${progressed}/${total}`;
      });
    }

    // ===================================================================
    // v4 · 9 个教学环节渲染
    // ===================================================================

    // 当前激活的环节
    // 优先用 activeStageId（chip 显式点击）；否则回落到 activeId 自然映射
    function currentStageId() {
      if (activeStageId && stageById[activeStageId]) return activeStageId;
      return stageOfStation(activeId) || (STAGES[0] && STAGES[0].id);
    }

    // 环节状态：done = 所有子节点都已完成；active = 当前；否则 todo
    function stageStatusCls(stageId) {
      const g = stageById[stageId];
      if (!g) return "";
      if (stageId === currentStageId()) return "is-active";
      // v4 E: 优先用 Store judgments；无 Store 时回退到 activeId-based
      const store = window.PharmacoPilotStore;
      const subKeys = (g.subNodeIds || []).map(String);
      if (!subKeys.length) return "";
      if (store && store.getJudgment) {
        const allSaved = subKeys.every((k) => {
          const entry = SUB_NODES[k] || {};
          const stid = (typeof entry.legacyStationId === "number") ? entry.legacyStationId : Number(k);
          return Number.isFinite(stid) && store.getJudgment(stid);
        });
        return allSaved ? "is-done" : "";
      }
      // fallback：旧 activeId-based 判断
      const subIds = (g.subNodeIds || []).filter((sid) => typeof sid === "number");
      const allDone = subIds.length && subIds.every((sid) => sid < activeId);
      return allDone ? "is-done" : "";
    }

    // ===================================================================
    // v4.3 · 教育因果链门禁：缺上游证据/前置未完成 → 可浏览，不可拍板/保存
    //   依据 STAGE_CHAIN.inputsFrom（环节级）与 SUB_NODES.enterCondition（子节点级）
    // ===================================================================
    // 某环节是否已产出（至少一个子节点有已保存判断）
    function stageProduced(stageId) {
      const store = window.PharmacoPilotStore;
      if (!store || !store.getJudgment) return true;   // 无 Store → 不阻断（兜底）
      const g = stageById[stageId]; if (!g) return true;
      return (g.subNodeIds || []).map(String).some((k) => {
        const e = SUB_NODES[k] || {};
        const stid = (typeof e.legacyStationId === "number") ? e.legacyStationId : Number(k);
        return !!(store.getJudgment(k) || (Number.isFinite(stid) && store.getJudgment(stid)));
      });
    }
    // 当前环节缺失的上游环节（连同它们应产出的产物名）
    function missingUpstreamStages(stageId) {
      const chain = STAGE_CHAIN[stageId];
      if (!chain || !chain.inputsFrom || !chain.inputsFrom.length) return [];
      return chain.inputsFrom.filter((up) => !stageProduced(up)).map((up) => {
        const g = stageById[up] || {};
        const uc = STAGE_CHAIN[up] || {};
        const idx = STAGES.findIndex((x) => x.id === up) + 1;
        return { id: up, idx, name: stageShortLabel(g) || up, products: uc.topCardToKeys || [] };
      });
    }
    // 子节点 enterCondition 是否未满足（回写/再修订节点的硬前置）
    function subEnterUnmet(subKey) {
      const sub = SUB_NODES[subKey];
      if (!sub || !sub.enterCondition || !sub.enterCondition.requires) return null;
      const store = window.PharmacoPilotStore;
      if (!store || !store.getJudgment) return null;
      const unmet = sub.enterCondition.requires.filter((r) => {
        if (r.subKey) return !store.getJudgment(r.subKey);
        if (r.stationId != null) return !store.getJudgment(r.stationId);
        return false;
      });
      if (!unmet.length) return null;
      return { unmet, reason: unmet.map((u) => u.reason).filter(Boolean) };
    }
    // 当前激活节点的综合门禁状态
    function evidenceGateState() {
      const stageId = currentStageId();
      const subKey = (typeof effectiveSubKey === "function") ? effectiveSubKey() : null;
      const missing = missingUpstreamStages(stageId);
      const subUnmet = subKey ? subEnterUnmet(subKey) : null;
      return { blocked: missing.length > 0 || !!subUnmet, missing, subUnmet };
    }
    // 缺失证据横幅（含"去完成上游"跳转 chip，复用 [data-stage] 点击）
    function renderEvidenceGate(gate) {
      if (!gate || !gate.blocked) return "";
      let html = "";
      if (gate.missing.length) {
        const rows = gate.missing.map((m) => `
          <div class="eg-row">
            <button class="eg-go" type="button" data-stage="${esc(m.id)}">去完成 ${pad(m.idx)} ${esc(m.name)}</button>
            <span class="eg-prod">缺：${esc((m.products || []).join(" / ") || "上游产物")}</span>
          </div>`).join("");
        html += `
          <div class="evidence-gate">
            <div class="eg-h">缺少上游证据 · 本环节可浏览，但暂不能拍板保存</div>
            <div class="eg-note">没有这些上游产物，这里的判断会退化成"模板填写"。请先补齐：</div>
            <div class="eg-list">${rows}</div>
          </div>`;
      }
      if (gate.subUnmet) {
        html += `
          <div class="evidence-gate eg-sub">
            <div class="eg-h">本步是「回写 / 再修订」节点 · 需先完成前置</div>
            <div>${esc((gate.subUnmet.reason || []).join("；") || "请先完成前置子节点，再做回写")}</div>
          </div>`;
      }
      return html;
    }

    // 方法依据 popover · 单例全局浮层
    function showTheoryPopover(stageId, anchorEl) {
      const g = stageById[stageId];
      if (!g || !g.theoryDrawer || !g.theoryDrawer.length) return;
      let pop = document.getElementById("ppl-theory-popover");
      if (!pop) {
        pop = document.createElement("div");
        pop.id = "ppl-theory-popover";
        document.body.appendChild(pop);
      }
      pop.innerHTML = `
        <div class="pt-title">方法依据 · ${esc(g.tag || "")}</div>
        <div class="pt-stage">${esc(g.title)}</div>
        <div class="pt-tags">
          ${g.theoryDrawer.map((t) => `<span class="pt-tag">${esc(t)}</span>`).join("")}
        </div>
        <div class="pt-foot">${g.theoryDrawer.length} 条理论支撑</div>
      `;
      const r = anchorEl.getBoundingClientRect();
      pop.style.display = "block";
      // 自适应位置：横向不超出 viewport
      const popW = 280;
      let left = window.scrollX + r.left + r.width / 2 - popW / 2;
      const maxLeft = window.scrollX + window.innerWidth - popW - 12;
      if (left > maxLeft) left = maxLeft;
      if (left < window.scrollX + 12) left = window.scrollX + 12;
      pop.style.left = left + "px";
      pop.style.top = (window.scrollY + r.bottom + 8) + "px";
    }
    function hideTheoryPopover() {
      const pop = document.getElementById("ppl-theory-popover");
      if (pop) pop.style.display = "none";
    }
    // 全局 click handler · 触发/关闭 popover
    document.addEventListener("click", (e) => {
      const trigger = e.target.closest("[data-theory-stage]");
      if (trigger) {
        e.preventDefault();
        e.stopPropagation();
        showTheoryPopover(trigger.getAttribute("data-theory-stage"), trigger);
        return;
      }
      if (!e.target.closest("#ppl-theory-popover")) hideTheoryPopover();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") hideTheoryPopover();
    });

    // breadcrumb：环节 · 子节点 · 关键判断
    function renderStageBreadcrumb() {
      const el = document.getElementById("stageBreadcrumb");
      if (!el) return;
      const stageId = currentStageId();
      const g = stageById[stageId];
      if (!g) { el.innerHTML = ""; return; }
      // v4: 当 station 是拆分主体（如 11），按 currentStageId 找对应 sub-node key
      let sub = SUB_NODES[String(activeId)];
      const subKeys = (g.subNodeIds || []).map(String);
      const splitMatch = subKeys.find((k) => {
        const s = SUB_NODES[k];
        return s && s.legacyStationId === activeId && /[a-z]$/i.test(k);
      });
      if (splitMatch) sub = SUB_NODES[splitMatch];
      const stageTitle = g.title || stageShortLabel(g);
      const subTitle = sub ? sub.subTitle : "";

      // mini-map: 9 个点按 phase 分 3 段（课前 5 / 课中 1 / 课后 3）
      let phaseTrack = "";
      ["pre", "in", "post"].forEach((ph, phIdx) => {
        const stagesInPhase = STAGES.filter((x) => x.phase === ph);
        const dots = stagesInPhase.map((sg) => {
          const isCur = sg.id === stageId;
          const isDone = stageStatusCls(sg.id) === "is-done";
          const cls = ["mm-dot", isCur ? "is-active" : "", isDone ? "is-done" : ""].filter(Boolean).join(" ");
          return `<span class="${cls}" data-stage="${esc(sg.id)}" title="${esc(sg.tag || "")} · ${esc(sg.title)}"></span>`;
        }).join("");
        phaseTrack += `<span class="mm-phase mm-phase-${ph}" data-phase-len="${stagesInPhase.length}">${dots}</span>`;
        if (phIdx < 2) phaseTrack += `<span class="mm-gap"></span>`;
      });

      el.innerHTML = `
        <span class="bc-stage">${esc(g.tag || "")} · ${esc(stageTitle)}</span>
        <span class="bc-sep">›</span>
        <span class="bc-sub">${esc(subTitle || ("子节点 " + activeId))}</span>
        ${g.keyDecision ? `<span class="bc-decision">${esc(g.keyDecision)}</span>` : ""}
        <span class="bc-minimap" aria-label="9 个教学环节进度小地图">${phaseTrack}</span>
      `;
    }

    // 当前环节内的子节点选择器
    function renderSubNodeRow() {
      const el = document.getElementById("stationTiles");
      if (!el) return;
      const g = stageById[currentStageId()];
      if (!g) { el.innerHTML = ""; return; }
      const subKeys = (g.subNodeIds || []).map((k) => String(k));
      if (!subKeys.length) { el.classList.add("is-empty"); el.innerHTML = "本环节暂无子节点"; return; }
      el.classList.remove("is-empty");
      const stageId = g.id;
      const stageIdx = STAGES.findIndex((x) => x.id === stageId) + 1;
      const stagePadIdx = pad(stageIdx);
      const multiSub = subKeys.length > 1;
      // 计算默认（未显式 click subkey）应高亮哪个 key：取首个 legacyStationId === activeId 的子节点
      const defaultActiveKey = activeSubKey || (subKeys.find((k) => {
        const e = SUB_NODES[k] || {};
        const lid = (typeof e.legacyStationId === "number") ? e.legacyStationId : Number(k);
        return lid === activeId;
      }) || null);
      // 复合键读 Store，标记本环节内已落库的子节点
      const store = window.PharmacoPilotStore;
      el.innerHTML = subKeys.map((key, i) => {
        const sub = SUB_NODES[key] || {};
        const stid = sub.legacyStationId || Number(key) || activeId;
        const isActive = (key === defaultActiveKey);
        // 屏蔽 statusCls 的 is-active（按 station id 全命中），仅保留 is-done；
        // 子节点高亮由 activeSubKey 精确决定
        const baseStatus = statusCls(stid) === "is-done" ? "is-done" : "";
        // 子节点级保存状态：优先按 subkey 复合键查；回退按 stationId 数字键（兼容旧 save）
        const subSaved = store && typeof store.getJudgment === "function"
          ? !!(store.getJudgment(key) || (subKeys.length === 1 && store.getJudgment(stid)))
          : false;
        const lockInfo = subEnterUnmet(key);
        const locked = !subSaved && !!lockInfo;   // 已保存的就不再标锁
        const lockTitle = locked ? ((lockInfo.reason && lockInfo.reason[0]) || "需先完成前置子节点") : "";
        const cls = ["tile", baseStatus, isActive ? "is-active" : "", subSaved ? "is-saved" : "", locked ? "is-locked" : ""].filter(Boolean).join(" ");
        const letter = String.fromCharCode(97 + i); // 0->a, 1->b, 2->c
        const numText = multiSub ? `${stagePadIdx}·${letter}` : stagePadIdx;
        const checkMark = subSaved ? `<span class="t-check" aria-label="已保存">✓</span>` : (locked ? `<span class="t-lock" aria-label="前置未完成">🔒</span>` : "");
        return `<div class="${cls}" data-st="${stid}" data-subkey="${esc(key)}" data-stage-hint="${esc(stageId)}" role="button" tabindex="0"${lockTitle ? ` title="${esc(lockTitle)}"` : ""}>
          <span class="t-num">${numText}</span>
          <span class="t-cn">${esc(sub.subTitle || "")}</span>
          ${checkMark}
        </div>`;
      }).join("");
    }

    // 环节 chip 点击 → 切到该环节首个子节点，同时显式设 activeStageId
    document.addEventListener("click", (e) => {
      const t = e.target.closest("[data-stage]");
      if (!t) return;
      const stageId = t.getAttribute("data-stage");
      const g = stageById[stageId];
      if (!g || !g.subNodeIds || !g.subNodeIds.length) return;
      const firstSub = g.subNodeIds[0];
      const stid = (typeof firstSub === "number") ? firstSub : (SUB_NODES[String(firstSub)] || {}).legacyStationId;
      if (Number.isFinite(stid) && stationById[stid]) setStation(stid, stageId);
    });

    // ===================================================================
    // v5 · 苏格拉底题链事件绑定（Q1/Q2 选项 / hint / 反向提问 / 迁移题）
    // ===================================================================
    function bindChainEvents() {
      const Store = window.PharmacoPilotStore;
      if (!Store) return;
      const sc = function () { return window.PharmacoPilotSampleCollection; };

      // ---- Q1/Q2 选项点击 ----
      document.addEventListener("click", (e) => {
        const li = e.target.closest(".chain-q-opts li[data-opt-key]");
        if (!li) return;
        if (li.classList.contains("is-locked")) return;
        const chainQ = li.closest(".chain-q");
        const cardEl = li.closest(".question-card.chain-mode");
        if (!cardEl) return;
        const station = Number(cardEl.getAttribute("data-chain-station") || activeId);
        const step = Number(chainQ.getAttribute("data-step"));
        const choiceKey = li.getAttribute("data-opt-key");
        const isCorrect = li.getAttribute("data-correct") === "1";

        const SC = sc();
        if (SC && SC.trackStepEntered) SC.trackStepEntered(station, step);
        if (SC && SC.trackChoice) SC.trackChoice(station, step, choiceKey, isCorrect);

        if (isCorrect) {
          // 解锁下一阶（最多到 3；Q3 通过 decision-dock 保存判断推进到 4）
          const next = Math.min(step + 1, 3);
          Store.setChainStep(station, next, { ["q" + step + "Done"]: true });
          // 正向确认：答对了要明确告诉教师/学生（之前只是静默推进）
          if (typeof window.showDemoToast === "function") {
            window.showDemoToast(step >= 3 ? "✓ 答对了 · 本题链已完成" : "✓ 答对了 · 已解锁下一题");
          }
        } else {
          // 错误：自动展开下一级 hint
          const drawer = chainQ.querySelector(".chain-hint-drawer");
          const currentRevealed = drawer ? drawer.querySelectorAll(".chain-hint-item").length : 0;
          const nextLevel = Math.min(currentRevealed + 1, 4);
          if (SC && SC.trackHintRevealed) SC.trackHintRevealed(station, step, nextLevel);
          // v6.1: 在 hint drawer 上方插入临时 toast 引导视觉焦点
          setTimeout(() => {
            const drawerAfter = document.querySelector(`.chain-q[data-step="${step}"] .chain-hint-drawer`);
            if (!drawerAfter) return;
            // 避免重复插入
            const existing = drawerAfter.parentElement.querySelector(".chain-wrong-toast");
            if (existing) existing.remove();
            const toast = document.createElement("div");
            toast.className = "chain-wrong-toast";
            toast.setAttribute("role", "status");
            toast.setAttribute("aria-live", "assertive");
            toast.innerHTML = `<span>✕</span> <span>再想想 — 下方已展开一条新视角提示 ↓</span>`;
            drawerAfter.parentElement.insertBefore(toast, drawerAfter);
            // 2.5 秒后淡出移除
            setTimeout(() => {
              toast.classList.add("is-fading");
              setTimeout(() => { try { toast.remove(); } catch (e) {} }, 320);
            }, 2500);
          }, 100);
        }
        renderDetail();
      });

      // ---- S1 评分矩阵：点击列头或 cell → 切换详情区 ----
      document.addEventListener("click", (e) => {
        const target = e.target.closest(".rm-col-h[data-col-name], .rm-cell[data-col-name]");
        if (!target) return;
        const card = target.closest(".figure-card.rich-01");
        if (!card) return;
        const colName = target.getAttribute("data-col-name");
        // 切换 panes
        card.querySelectorAll(".rm-detail-pane").forEach((p) => p.removeAttribute("data-active"));
        const pane = card.querySelector('.rm-detail-pane[data-pane-col="' + colName.replace(/"/g, '\\"') + '"]');
        if (pane) pane.setAttribute("data-active", "");
        // 切换 col header 视觉
        card.querySelectorAll(".rm-col-h").forEach((h) => h.classList.remove("is-current"));
        const colH = card.querySelector('.rm-col-h[data-col-name="' + colName.replace(/"/g, '\\"') + '"]');
        if (colH) colH.classList.add("is-current");
        // 在 matrix 容器记录 currentCol
        const matrix = card.querySelector(".rubric-matrix");
        if (matrix) matrix.setAttribute("data-current-col", colName);
      });

      // ---- 主动点击「需要提示」按钮 ----
      document.addEventListener("click", (e) => {
        const btn = e.target.closest(".btn-hint[data-hint-station]");
        if (!btn || btn.disabled) return;
        const station = Number(btn.getAttribute("data-hint-station"));
        const step = Number(btn.getAttribute("data-hint-step"));
        const drawer = document.querySelector('.chain-hint-drawer[data-drawer-step="' + step + '"]');
        const currentRevealed = drawer ? drawer.querySelectorAll(".chain-hint-item").length : 0;
        const nextLevel = Math.min(currentRevealed + 1, 4);
        const SC = sc();
        if (SC && SC.trackHintRevealed) SC.trackHintRevealed(station, step, nextLevel);
        renderDetail();
      });

      // ---- Q3 反向提问保存 ---- (v6: selector 兼容新旧 [data-chain-card])
      document.addEventListener("click", (e) => {
        const btn = e.target.closest('button[data-save-reflection]');
        if (!btn || btn.disabled) return;
        const card = btn.closest('[data-chain-card="reflection"]') || btn.closest(".chain-card");
        if (!card) return;
        const station = Number(card.getAttribute("data-station"));
        const field = card.getAttribute("data-field");
        const textarea = card.querySelector('textarea[data-reflection-input]');
        const text = textarea ? textarea.value.trim() : "";
        if (!text) {
          const meta = card.querySelector(".chain-meta");
          if (meta) { meta.style.color = "var(--amber-deep)"; meta.textContent = "请先写下你的理由"; }
          return;
        }
        Store.saveChainReflection(station, field, text);
        renderDetail();
      });

      // ---- Q4 迁移题跳过 ----
      document.addEventListener("click", (e) => {
        const btn = e.target.closest('button[data-skip-transfer]');
        if (!btn || btn.disabled) return;
        const card = btn.closest('[data-chain-card="transfer"]');
        if (!card) return;
        const station = Number(card.getAttribute("data-station"));
        Store.skipTransfer(station);
        renderDetail();
      });

      // ---- 重置题链 (v6.2) ----
      document.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-reset-chain]");
        if (!btn) return;
        const station = Number(btn.getAttribute("data-reset-chain"));
        if (!confirm("确定要重置本节点的所有答题进度吗?(读图、诊断、决策、反思、迁移都会清空)")) return;
        Store.resetChainProgress(station);
        renderDetail();
      });

      // ---- figure ↔ question hover 双向联动 (v6.3) ----
      function linkHighlightOn(colName) {
        if (!colName) return;
        // figure 列内所有元素加高亮
        document.querySelectorAll(
          '.rm-col-h[data-col-name],' +
          '.rm-cell[data-col-name]'
        ).forEach((el) => {
          if (el.getAttribute("data-col-name") === colName) el.classList.add("is-hover-linked");
        });
        // 选项加高亮
        document.querySelectorAll('.chain-q-opts li[data-link-col]').forEach((el) => {
          if (el.getAttribute("data-link-col") === colName) el.classList.add("is-hover-linked");
        });
      }
      function linkHighlightOff(colName) {
        document.querySelectorAll(".is-hover-linked").forEach((el) => {
          if (!colName || el.getAttribute("data-col-name") === colName
              || el.getAttribute("data-link-col") === colName) {
            el.classList.remove("is-hover-linked");
          }
        });
      }
      // mouseover 在事件冒泡阶段触发,适合 delegation
      document.addEventListener("mouseover", (e) => {
        if (!e.target.closest) return;
        const opt = e.target.closest(".chain-q-opts li[data-link-col]");
        if (opt) { linkHighlightOn(opt.getAttribute("data-link-col")); return; }
        const figEl = e.target.closest('.rm-col-h[data-col-name], .rm-cell[data-col-name]');
        if (figEl) { linkHighlightOn(figEl.getAttribute("data-col-name")); }
      });
      document.addEventListener("mouseout", (e) => {
        if (!e.target.closest) return;
        const opt = e.target.closest(".chain-q-opts li[data-link-col]");
        if (opt) { linkHighlightOff(opt.getAttribute("data-link-col")); return; }
        const figEl = e.target.closest('.rm-col-h[data-col-name], .rm-cell[data-col-name]');
        if (figEl) { linkHighlightOff(figEl.getAttribute("data-col-name")); }
      });

      // ---- Q4 迁移题保存 ---- (v6: selector 兼容新旧 [data-chain-card])
      document.addEventListener("click", (e) => {
        const btn = e.target.closest('button[data-save-transfer]');
        if (!btn || btn.disabled) return;
        const card = btn.closest('[data-chain-card="transfer"]') || btn.closest(".chain-card");
        if (!card) return;
        const station = Number(card.getAttribute("data-station"));
        const axis = card.getAttribute("data-axis");
        const textarea = card.querySelector('textarea[data-transfer-input]');
        const text = textarea ? textarea.value.trim() : "";
        if (!text) {
          const meta = card.querySelector(".chain-meta");
          if (meta) { meta.style.color = "var(--amber-deep)"; meta.textContent = "请先写下你的迁移判断"; }
          return;
        }
        const SC = sc();
        if (SC && SC.trackTransferSubmit) {
          SC.trackTransferSubmit(station, text, axis);
        } else {
          Store.saveTransfer(station, text, axis);
        }
        renderDetail();
      });

      // ---- Store 事件：迁移题保存 → 重 render 让产物区解锁 ----
      Store.on("transfer:saved", function (evt) {
        if (!evt || !evt.stationId) return;
        setTimeout(function () { renderDetail(); }, 60);
      });

      // ---- Store 事件：判断保存 → 推进到 Q3 完成态（解锁 Q3 反向提问 + Q4 卡） ----
      Store.on("judgment:saved", function (evt) {
        if (!evt || !evt.stationId) return;
        const chainBank = getChainBank(evt.stationId);
        if (!chainBank) return;
        // v6: 不再强推 step=4——让 computeChainStateInfo 基于实际 judgment/reflection/transfer
        //     自动判断当前阶段（Q3 决策→反思→Q4 迁移→完成）。
        //     只确保 chainProgress 标记 q3Done = true（兼容旧字段消费者）。
        const cp = Store.getChainProgress(evt.stationId);
        Store.setChainStep(evt.stationId, Math.max(cp.currentStep || 1, 3), { q3Done: true });
        // 首次保存判断时邀请样本贡献
        const SC = sc();
        if (SC && SC.showConsentCard && !Store.getConsent().enabled) {
          setTimeout(function () { SC.showConsentCard(); }, 420);
        }
        setTimeout(function () { renderDetail(); }, 80);
      });
    }

    // 同步初始 activeId 到 Store（让 bridge 第一次就知道我们在 station 1）
    try {
      if (window.PharmacoPilotStore && window.PharmacoPilotStore.setActiveStation) {
        window.PharmacoPilotStore.setActiveStation(activeId);
      }
    } catch (e) {}
    renderAll();
    bindClicks();
    bindNavigationDrawer();
    bindChainEvents();
  });
})();
