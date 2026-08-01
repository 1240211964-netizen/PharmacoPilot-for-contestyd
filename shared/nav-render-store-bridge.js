/* ============================================================
   PharmacoPilot · Render ⇄ Store Bridge
   ------------------------------------------------------------
   不修改 nav-render.js / toast.js，通过 capture-phase 拦截
   + DOM 增强，把"演示版"按钮升级为真保存：

     · 判断选项点击    → 暂存到 staged
     · 「保存判断」     → 写入 Store + 更新侧栏进度
     · 任意站产物按钮  → 数据驱动注入 + 写入 artifactLibrary
     · L2 议程横条     → 顶部 sticky 显示真实兑现度（多站累计）
     · blockSave 选项 → 阻止保存 + 红色提示
     · 节点 sideEffect → 数据驱动议程标记（节点 6 evidence / 节点 8 role）

   依赖：PharmacoPilotStore, PharmacoPilotDecisionBank,
        PharmacoPilotStationPayloads (任意子集)
   ============================================================ */
(function attachBridge(global) {
  "use strict";

  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn);
    } else { fn(); }
  }

  ready(function init() {
    const Store = global.PharmacoPilotStore;
    const DB = global.PharmacoPilotDecisionBank;
    const payloads = global.PharmacoPilotStationPayloads || {};
    if (!Store) { console.warn("[bridge] Store missing"); return; }
    if (!DB) { console.warn("[bridge] DecisionBank missing"); return; }

    // -------- 1. 一次性 seed: 议程线 --------
    // 若有 station3 payload，优先从节点 3 mock 响应聚类作为 L2 源头种子；
    // 否则回退到 station6 payload 的 dots（兼容旧行为）。
    if (Store.getAgendas().length === 0) {
      const s3 = payloads[3];
      const s6 = payloads[6];
      if (s3 && s3.evidenceFigure && s3.evidenceFigure.mockStudentResponses) {
        const clusters = s3.evidenceFigure.mockStudentResponses.clusters || [];
        Store.setAgendas(clusters.map((c) => ({
          key: c.agendaKey, text: c.text, votes: c.studentVotes, sourceStation: 3,
        })));
      } else if (s6 && s6.evidenceFigure) {
        const dots = s6.evidenceFigure.agendaCoverageDots || [];
        Store.setAgendas(dots.map((d) => ({
          key: d.agendaKey, text: d.label, evidenceSrc: d.evidenceSrc, preFulfilled: d.covered,
        })));
        dots.filter((d) => d.covered).forEach((d) => {
          Store.markAgendaFulfilled(6, d.agendaKey, d.evidenceSrc);
        });
      }
    }

    // -------- 2. 当前站追踪（无法访问 nav-render 内部 activeId）--------
    let currentStation = Store.getActiveStation() || 1;
    // 监听 active:changed 事件 — nav-render 切站时同步 bridge 的 currentStation
    Store.on("active:changed", function (evt) {
      if (evt && Number.isFinite(evt.id)) {
        currentStation = evt.id;
        setTimeout(injectArtifactsForCurrentStation, 60);
      }
    });
    document.addEventListener("click", (e) => {
      const tile = e.target.closest("[data-st][role='button']");
      if (tile) {
        const sid = parseInt(tile.getAttribute("data-st"), 10);
        if (!isNaN(sid)) {
          currentStation = sid;
          Store.setActiveStation(sid);
          setTimeout(injectArtifactsForCurrentStation, 60);
          return;
        }
      }
      // v4: chip 切换 stage（如 S8 → S9，station 不变但 splitMap 过滤变化）
      const chip = e.target.closest("[data-stage]");
      if (chip) {
        // 同步 bridge 的 currentStation 到 chip 对应的首子节点 station id
        const stageId = chip.getAttribute("data-stage");
        const C = global.PharmacoPilotNavigationContract;
        const stages = (C && C.NAV_STAGES) || [];
        const subNodes = (C && C.SUB_NODES) || {};
        const stage = stages.find((g) => g.id === stageId);
        if (stage && stage.subNodeIds && stage.subNodeIds.length) {
          const firstSub = stage.subNodeIds[0];
          const sid = (typeof firstSub === "number") ? firstSub : ((subNodes[String(firstSub)] || {}).legacyStationId);
          if (Number.isFinite(sid)) currentStation = sid;
        }
        setTimeout(injectArtifactsForCurrentStation, 80);
      }
    });

    // -------- 3. 拦截判断选项点击（暂存 + 视觉同步）--------
    // 优先使用 data-key（v4 渲染器输出），缺失时回退到 label 前缀匹配（保持旧渲染路径兼容）
    let staged = null;
    function currentSubKey() {
      return (global.__navRenderState && global.__navRenderState.currentSubKey) ? global.__navRenderState.currentSubKey() : null;
    }
    function markSelected(key) {
      document.querySelectorAll(".decision-dock .dd-opt").forEach((b) => {
        b.classList.toggle("is-selected", b.getAttribute("data-key") === key);
      });
      document.querySelectorAll(".qchain.qchain-rich li").forEach((li) => {
        li.classList.toggle("is-selected", li.getAttribute("data-key") === key);
      });
      const saveBtn = document.querySelector(".decision-dock .btn-s.fill");
      if (saveBtn && !saveBtn.classList.contains("is-saved")) {
        saveBtn.disabled = false;
        saveBtn.removeAttribute("aria-disabled");
      }
    }
    // 取实时 active station：优先从 Store（涵盖 __navSetStation 路径）,
    // 回退到 click 维护的本地 currentStation（兼容旧 tile/chip 点击）。
    function effectiveStation() {
      try {
        const fromStore = Store.getActiveStation && Store.getActiveStation();
        if (Number.isFinite(fromStore)) return fromStore;
      } catch (e) {}
      return currentStation;
    }

    document.addEventListener("click", (e) => {
      const btn = e.target.closest(".decision-dock .btn-s");
      if (!btn || btn.classList.contains("fill")) return;
      if (btn.hasAttribute("data-artifact-id")) return;

      const stationId = effectiveStation();
      const options = DB[stationId] || [];
      const dkey = btn.getAttribute("data-key");
      const matched = dkey ? options.find((o) => o[0] === dkey) : null;
      if (!matched) {
        // 渲染器已保证输出 data-key;匹配失败说明渲染层/决策库脱节 — 必须报错,绝不静默吞掉落库
        console.error("[bridge] 选项无法匹配决策库:station", stationId, "data-key =", dkey, "文案 =", (btn.textContent || "").trim().slice(0, 20));
        return;
      }

      const meta = matched[4] || {};
      staged = { stationId, key: matched[0], score: matched[3], label: matched[1], meta, subKey: currentSubKey() };
      if (meta.blockSave) {
        btn.setAttribute("data-demo-toast", "✕ 此选项违反禁条 · 已阻止保存");
      } else {
        const rec = meta.recommended ? " · 推荐项" : "";
        const shortLabel = matched[1].length > 18 ? matched[1].slice(0, 18) + "…" : matched[1];
        btn.setAttribute("data-demo-toast", `已暂存「${shortLabel}」${rec} · 点保存判断落库`);
        markSelected(matched[0]);
      }
    }, true);

    // -------- 4. 拦截「保存判断」--------
    document.addEventListener("click", (e) => {
      const btn = e.target.closest(".decision-dock .btn-s.fill");
      if (!btn) return;

      if (!staged) {
        btn.setAttribute("data-demo-toast", "请先选择一个判断选项");
        return;
      }
      if (staged.meta && staged.meta.blockSave) {
        btn.setAttribute("data-demo-toast", "✕ 当前暂存选项违反禁条 · 请重选");
        return;
      }

      // v4 复合键：保存时携带当前子节点 subKey（区分 v0/v1/锚点/UbD 段）
      const subKey = currentSubKey();
      // 防错位：暂存后若切换了站点或子节点，staged 属于旧上下文——直接落库会产生
      // 「旧 stationId + 新 subKey」的错位 judgment，进度/门禁/S7→S2 反修订全跟着错。
      // 丢弃暂存并要求在当前节点重选（视觉选中态本来也随重渲染被清掉）。
      if (staged.stationId !== effectiveStation() || staged.subKey !== subKey) {
        staged = null;
        btn.setAttribute("data-demo-toast", "已切换站点/节点 · 请重新选择判断选项");
        return;
      }
      Store.saveJudgment(staged.stationId, staged.key, staged.score, staged.label, subKey);

      // v4 反向修订闭环：在 S7 节点 10-c（量规反向修订）保存判断时，同时向 S2 提交一条 pending revision
      // 通道由 contract.RUBRIC_REVISION 描述，S2·02-b 顶部待审条会自动亮起。
      let revisionToast = "";
      if (subKey === "10-c" && Store.proposeRubricRevision) {
        const subLbl = staged.label || staged.key;
        const dim = (subLbl.match(/(一致性|真实性|学情|高阶|评价|批判意识)/) || [])[0] || "未指明维度";
        const res = Store.proposeRubricRevision({
          dim,
          reason: `S7 评分发现：${subLbl}`,
          proposedChange: `根据本轮学生作品的 ${dim} 维度评分分布，建议在 S2·02-b 重新审视该维度的描述符或权重。`,
          evidenceArtifactId: `rubric-revision-proposal.md@${Date.now()}`,
        });
        if (res && res.ok) {
          const pendCount = Store.getRubricRevisions("pending").length;
          revisionToast = ` · ↩ 已向 S2 提交反向修订（待审 ${pendCount} 条）`;
        }
      }

      const p = Store.getProgress();
      const subLabel = subKey ? ` · ${subKey}` : "";
      btn.setAttribute(
        "data-demo-toast",
        `✓ 节点 ${pad2(staged.stationId)}${subLabel} 判断已落库「${staged.key}」 · 进度 ${p.done}/${p.total}${revisionToast}`,
      );
      // 视觉收尾：按钮置为已保存态（再次切换 station 时由重新 render 重置）
      btn.textContent = "已保存判断 ✓";
      btn.disabled = true;
      btn.classList.add("is-saved");
      btn.setAttribute("aria-disabled", "true");
      staged = null;
    }, true);

    // -------- 5. 侧栏进度同步 --------
    function getStageProgressV4() {
      const C = global.PharmacoPilotNavigationContract;
      const stages = (C && C.NAV_STAGES) || [];
      const subNodes = (C && C.SUB_NODES) || {};
      if (!stages.length) return null;
      const judgments = Store.dump().judgments || {};
      // 一个教学环节算 done = 它所有子节点都有 saved judgment
      const done = stages.filter((g) => {
        const subs = (g.subNodeIds || []).filter((k) => typeof k === "number" || (subNodes[String(k)] && subNodes[String(k)].legacyStationId));
        if (!subs.length) return false;
        return subs.every((k) => {
          const sid = (typeof k === "number") ? k : subNodes[String(k)].legacyStationId;
          return judgments[sid];
        });
      }).length;
      return { done, total: stages.length };
    }

    function refreshSidebarProgress() {
      const sp = getStageProgressV4();
      // v4 进度计数器只有 #nodeListMeta 一处（"n / 9" 纯文本）；
      // 历史上这里用 querySelectorAll("*") 全 DOM 扫描 + 文本正则猜测，会误伤任何形如 "n / 9" 的无关文本。
      // nav-render 重渲染时也会以会话口径写它（nav-render.js:1862），此处保持 Store 口径覆盖。
      const meta = document.getElementById("nodeListMeta");
      if (meta && sp) meta.textContent = `${sp.done} / ${sp.total}`;
      Object.keys(Store.dump().judgments).forEach((sid) => {
        const tile = document.querySelector(`[data-st="${sid}"][role="button"]`);
        if (tile && !tile.classList.contains("is-active")) tile.classList.add("is-done");
      });
      // v4 E: 触发 stage chip + phase 进度视觉刷新
      if (global.__navRenderState && global.__navRenderState.refreshStageVisuals) {
        global.__navRenderState.refreshStageVisuals();
      }
    }
    Store.on("judgment:saved", refreshSidebarProgress);
    Store.on("store:reset", refreshSidebarProgress);
    setTimeout(refreshSidebarProgress, 80);

    // 反向修订（S7 → S2）触发 detail 面板重 render，让 02-b 的"待审反向修订 N 条"红色条立刻亮
    function refreshDetailAfterRevision() {
      if (global.__navRenderState && global.__navRenderState.refreshDetail) {
        global.__navRenderState.refreshDetail();
      }
    }
    Store.on("rubric:revisionProposed", refreshDetailAfterRevision);
    Store.on("rubric:revisionResolved", refreshDetailAfterRevision);

    // -------- 6. L2 议程横条（sticky 顶部）--------
    function ensureAgendaStripStyles() {
      if (document.getElementById("ppl-bridge-styles")) return;
      const s = document.createElement("style");
      s.id = "ppl-bridge-styles";
      s.textContent = `
        /* === G · Settings 抽屉 === */
        #ppl-settings-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,.32);
          opacity: 0; pointer-events: none; transition: opacity .25s;
          z-index: 90;
        }
        #ppl-settings-overlay.is-open { opacity: 1; pointer-events: auto; }
        #ppl-settings-drawer {
          position: fixed; top: 0; right: 0; height: 100vh; width: 360px;
          max-width: 90vw; background: #faf6ee; box-shadow: -8px 0 24px rgba(0,0,0,.18);
          transform: translateX(100%); transition: transform .28s cubic-bezier(.4,0,.2,1);
          font-family: var(--serif-cn); z-index: 95;
          display: flex; flex-direction: column; overflow: hidden;
        }
        #ppl-settings-drawer.is-open { transform: translateX(0); }
        #ppl-settings-drawer .pst-head {
          padding: 14px 18px; border-bottom: 1px solid rgba(168,73,42,.18);
          display: flex; align-items: center; gap: 10px; flex-shrink: 0;
        }
        #ppl-settings-drawer .pst-head h3 {
          margin: 0; font-size: var(--fs-md); font-weight: 500; color: var(--ink);
          font-family: var(--serif-cn);
        }
        #ppl-settings-drawer .pst-close {
          margin-left: auto; cursor: pointer; font-size: var(--fs-lg); line-height: 1;
          color: var(--gold-deep); opacity: .6; padding: 4px 8px; border-radius: 4px;
          background: none; border: none;
        }
        #ppl-settings-drawer .pst-close:hover {
          opacity: 1; background: rgba(168,73,42,.1);
        }
        #ppl-settings-drawer .pst-body {
          flex: 1; overflow-y: auto; padding: 16px 18px 24px;
        }
        #ppl-settings-drawer .pst-section {
          margin-bottom: 22px;
        }
        #ppl-settings-drawer .pst-section-h {
          font-family: var(--mono);
          font-size: var(--fs-2xs); color: var(--gold-deep);
          letter-spacing: 0.08em; text-transform: uppercase;
          margin-bottom: 9px; display: flex; align-items: center; gap: 5px;
        }
        #ppl-settings-drawer .pst-stat-row {
          display: flex; justify-content: space-between; align-items: baseline;
          padding: 5px 0; font-size: var(--fs-xs); color: var(--ink);
          border-bottom: 1px dashed rgba(168,73,42,.12);
        }
        #ppl-settings-drawer .pst-stat-row:last-child { border-bottom: 0; }
        #ppl-settings-drawer .pst-stat-row .pst-k { color: #5a4a3a; }
        #ppl-settings-drawer .pst-stat-row .pst-v {
          font-family: var(--mono); font-size: var(--fs-2xs);
          color: var(--amber-deep, #a8492a); font-weight: 600;
        }
        #ppl-settings-drawer .pst-btn {
          display: block; width: 100%; text-align: left;
          margin-bottom: 7px; padding: 9px 12px;
          background: #fff; border: 1px solid rgba(168,73,42,.2);
          border-radius: 7px; cursor: pointer;
          font-family: var(--serif-cn); font-size: var(--fs-xs);
          color: var(--ink); transition: all .15s;
        }
        #ppl-settings-drawer .pst-btn:hover {
          background: #fff5ec; border-color: rgba(168,73,42,.4);
          transform: translateX(2px);
        }
        #ppl-settings-drawer .pst-btn.is-danger {
          color: var(--amber-deep); border-color: rgba(168,73,42,.3);
        }
        #ppl-settings-drawer .pst-btn.is-danger:hover {
          background: rgba(168,73,42,.08); color: #8a3a1f;
        }
        #ppl-settings-drawer .pst-btn small {
          display: block; font-family: var(--mono);
          font-size: var(--fs-2xs); color: #998877; margin-top: 2px;
          letter-spacing: 0.04em;
        }
        #ppl-settings-drawer .pst-code {
          font-family: var(--mono); font-size: var(--fs-2xs);
          background: #1a1714; color: var(--ivory);
          padding: 6px 10px; border-radius: 4px; margin: 4px 0;
          display: block; white-space: pre-wrap; word-break: break-all;
        }
        /* === L · 完成 9 个教学环节庆祝面板 === */
        #ppl-celebrate-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,.5);
          opacity: 0; pointer-events: none; transition: opacity .35s;
          z-index: 110; display: flex; align-items: center; justify-content: center;
          backdrop-filter: blur(2px);
        }
        #ppl-celebrate-overlay.is-open { opacity: 1; pointer-events: auto; }
        #ppl-celebrate-modal {
          width: 580px; max-width: 92vw; max-height: 88vh;
          background: linear-gradient(180deg, #faf6ee 0%, #fff8ed 100%);
          border-radius: 14px;
          box-shadow: 0 24px 64px rgba(0,0,0,.32), 0 0 0 1px rgba(106,154,123,.3);
          font-family: var(--serif-cn);
          display: flex; flex-direction: column; overflow: hidden;
          transform: scale(.92) translateY(12px); transition: transform .35s cubic-bezier(.16,1,.3,1);
        }
        #ppl-celebrate-overlay.is-open #ppl-celebrate-modal { transform: scale(1) translateY(0); }
        #ppl-celebrate-modal .pcl-banner {
          padding: 22px 28px 18px;
          background: linear-gradient(135deg, var(--sage, #6a9a7b) 0%, #8eb89f 100%);
          color: #fff;
          position: relative; overflow: hidden;
        }
        #ppl-celebrate-modal .pcl-banner::after {
          content: ""; position: absolute; right: -40px; top: -40px;
          width: 180px; height: 180px; border-radius: 50%;
          background: rgba(255,255,255,.08);
        }
        #ppl-celebrate-modal .pcl-banner h2 {
          margin: 0 0 4px; font-size: var(--fs-xl); font-weight: 500;
          letter-spacing: 0.02em; position: relative; z-index: 1;
        }
        #ppl-celebrate-modal .pcl-banner .pcl-sub {
          font-size: var(--fs-xs); opacity: .9; font-family: var(--mono);
          letter-spacing: 0.06em; position: relative; z-index: 1;
        }
        #ppl-celebrate-modal .pcl-banner .pcl-close {
          position: absolute; top: 14px; right: 16px;
          background: rgba(255,255,255,.18); color: #fff; border: none;
          width: 28px; height: 28px; border-radius: 50%; cursor: pointer;
          font-size: var(--fs-sm); line-height: 1; z-index: 2;
        }
        #ppl-celebrate-modal .pcl-banner .pcl-close:hover { background: rgba(255,255,255,.28); }
        #ppl-celebrate-modal .pcl-body {
          flex: 1; overflow-y: auto; padding: 20px 28px 8px;
        }
        #ppl-celebrate-modal .pcl-section {
          margin-bottom: 18px;
        }
        #ppl-celebrate-modal .pcl-section-h {
          font-family: var(--mono); font-size: var(--fs-2xs);
          color: var(--gold-deep); letter-spacing: 0.1em; text-transform: uppercase;
          margin-bottom: 8px; display: flex; align-items: center; gap: 6px;
        }
        #ppl-celebrate-modal .pcl-stage-list {
          display: flex; flex-direction: column; gap: 5px;
        }
        #ppl-celebrate-modal .pcl-stage-row {
          display: grid; grid-template-columns: 28px 1fr auto;
          align-items: baseline; gap: 10px; padding: 5px 8px;
          background: rgba(168,73,42,.04); border-radius: 6px;
          font-size: var(--fs-xs); color: var(--ink);
        }
        #ppl-celebrate-modal .pcl-stage-row .pcl-sn {
          font-family: var(--mono); font-size: var(--fs-2xs);
          color: var(--amber-deep, #a8492a); font-weight: 600;
        }
        #ppl-celebrate-modal .pcl-stage-row .pcl-cn { font-weight: 500; }
        #ppl-celebrate-modal .pcl-stage-row .pcl-jud {
          font-family: var(--mono); font-size: var(--fs-2xs);
          color: #5a4a3a; font-weight: 500; opacity: .8;
        }
        #ppl-celebrate-modal .pcl-stat-grid {
          display: grid; grid-template-columns: 1fr 1fr; gap: 8px;
        }
        #ppl-celebrate-modal .pcl-stat-card {
          background: #fff; border: 1px solid rgba(168,73,42,.15);
          border-radius: 8px; padding: 9px 12px;
        }
        #ppl-celebrate-modal .pcl-stat-card .pcl-stat-l {
          font-family: var(--mono); font-size: var(--fs-2xs);
          color: #998877; letter-spacing: 0.06em;
        }
        #ppl-celebrate-modal .pcl-stat-card .pcl-stat-v {
          font-family: var(--serif-cn); font-size: var(--fs-md);
          color: var(--amber-deep, #a8492a); font-weight: 500; margin-top: 2px;
        }
        #ppl-celebrate-modal .pcl-stat-card .pcl-stat-v small {
          font-family: var(--mono); font-size: var(--fs-2xs);
          color: #998877; font-weight: 400; margin-left: 4px;
        }
        #ppl-celebrate-modal .pcl-foot {
          padding: 14px 28px 20px; border-top: 1px solid rgba(168,73,42,.12);
          display: flex; gap: 8px; flex-wrap: wrap; flex-shrink: 0;
          background: rgba(168,73,42,.03);
        }
        #ppl-celebrate-modal .pcl-foot button {
          flex: 1; min-width: 0;
          padding: 9px 14px; border-radius: 7px; cursor: pointer;
          font-family: var(--serif-cn); font-size: var(--fs-xs);
          border: 1px solid rgba(168,73,42,.25); background: #fff;
          color: var(--ink); transition: all .15s;
        }
        #ppl-celebrate-modal .pcl-foot button:hover {
          background: #fff5ec; transform: translateY(-1px);
        }
        #ppl-celebrate-modal .pcl-foot button.is-primary {
          background: var(--amber-deep, #a8492a); color: #fff; border-color: var(--amber-deep, #a8492a);
        }
        #ppl-celebrate-modal .pcl-foot button.is-primary:hover {
          background: #8a3a1f;
        }

        /* ======= O · DARK MODE 覆盖 ======= */
        /* Settings 抽屉 */
        html[data-theme="dark"] #ppl-settings-drawer {
          background: linear-gradient(180deg, #211f1d 0%, #1a1916 100%);
          box-shadow: -8px 0 24px rgba(0,0,0,.5);
        }
        html[data-theme="dark"] #ppl-settings-drawer .pst-head { border-bottom-color: rgba(255,253,247,.10); }
        html[data-theme="dark"] #ppl-settings-drawer .pst-head h3 { color: var(--ivory); }
        html[data-theme="dark"] #ppl-settings-drawer .pst-close { color: var(--on-dark-mute); }
        html[data-theme="dark"] #ppl-settings-drawer .pst-close:hover { background: rgba(255,253,247,.08); }
        html[data-theme="dark"] #ppl-settings-drawer .pst-section-h { color: var(--on-dark-mute); }
        html[data-theme="dark"] #ppl-settings-drawer .pst-stat-row {
          color: var(--on-dark); border-bottom-color: rgba(255,253,247,.08);
        }
        html[data-theme="dark"] #ppl-settings-drawer .pst-stat-row .pst-k { color: var(--mute-2); }
        html[data-theme="dark"] #ppl-settings-drawer .pst-stat-row .pst-v { color: var(--amber-soft, #f1cdb9); }
        html[data-theme="dark"] #ppl-settings-drawer .pst-btn {
          background: rgba(255,253,247,.06);
          border-color: rgba(255,253,247,.12);
          color: var(--ivory);
        }
        html[data-theme="dark"] #ppl-settings-drawer .pst-btn:hover {
          background: rgba(255,253,247,.10); border-color: rgba(217,119,87,.4);
        }
        html[data-theme="dark"] #ppl-settings-drawer .pst-btn small { color: var(--mute-2); }
        html[data-theme="dark"] #ppl-settings-drawer .pst-btn.is-danger { color: var(--amber); border-color: rgba(217,119,87,.4); }
        html[data-theme="dark"] #ppl-settings-drawer .pst-btn.is-danger:hover {
          background: rgba(217,119,87,.15); color: var(--amber-soft);
        }
        html[data-theme="dark"] #ppl-settings-drawer .pst-code {
          background: #0d0c0a; color: var(--amber-soft, #f1cdb9);
        }

        /* 主题切换器（segment control） */
        .pst-theme-row {
          display: flex; gap: 4px; padding: 3px;
          background: rgba(168,73,42,.08); border-radius: 8px;
        }
        html[data-theme="dark"] .pst-theme-row { background: rgba(255,253,247,.06); }
        .pst-theme-row button {
          flex: 1; padding: 6px 8px; font-size: var(--fs-2xs);
          background: transparent; border: 0; border-radius: 5px;
          color: var(--gold-deep); cursor: pointer;
          font-family: var(--serif-cn);
          transition: all .15s;
        }
        html[data-theme="dark"] .pst-theme-row button { color: var(--on-dark-mute); }
        .pst-theme-row button:hover { background: rgba(255,255,255,.5); }
        html[data-theme="dark"] .pst-theme-row button:hover { background: rgba(255,253,247,.08); }
        .pst-theme-row button.is-active {
          background: #fff; color: var(--amber-deep, #a8492a);
          box-shadow: 0 1px 3px rgba(0,0,0,.1);
        }
        html[data-theme="dark"] .pst-theme-row button.is-active {
          background: #2a2722; color: var(--amber-soft, #f1cdb9);
        }

        /* 庆祝面板 dark */
        html[data-theme="dark"] #ppl-celebrate-modal {
          background: linear-gradient(180deg, #211f1d 0%, #1a1916 100%);
          box-shadow: 0 24px 64px rgba(0,0,0,.6), 0 0 0 1px rgba(106,154,123,.4);
        }
        html[data-theme="dark"] #ppl-celebrate-modal .pcl-body { color: var(--on-dark); }
        html[data-theme="dark"] #ppl-celebrate-modal .pcl-section-h { color: var(--on-dark-mute); }
        html[data-theme="dark"] #ppl-celebrate-modal .pcl-stage-row {
          background: rgba(255,253,247,.04); color: var(--ivory);
        }
        html[data-theme="dark"] #ppl-celebrate-modal .pcl-stage-row .pcl-jud { color: var(--mute-2); }
        html[data-theme="dark"] #ppl-celebrate-modal .pcl-stat-card {
          background: rgba(255,253,247,.04); border-color: rgba(255,253,247,.10);
        }
        html[data-theme="dark"] #ppl-celebrate-modal .pcl-stat-card .pcl-stat-l { color: var(--mute-2); }
        html[data-theme="dark"] #ppl-celebrate-modal .pcl-stat-card .pcl-stat-v { color: var(--amber-soft, #f1cdb9); }
        html[data-theme="dark"] #ppl-celebrate-modal .pcl-stat-card .pcl-stat-v small { color: var(--mute-2); }
        html[data-theme="dark"] #ppl-celebrate-modal .pcl-foot {
          background: rgba(255,253,247,.03); border-top-color: rgba(255,253,247,.10);
        }
        html[data-theme="dark"] #ppl-celebrate-modal .pcl-foot button {
          background: rgba(255,253,247,.06); color: var(--ivory);
          border-color: rgba(255,253,247,.14);
        }
        html[data-theme="dark"] #ppl-celebrate-modal .pcl-foot button:hover { background: rgba(255,253,247,.10); }

        /* L2 议程横条 · 量规修订面板 · 产物按钮区 dark */
        html[data-theme="dark"] #ppl-agenda-strip {
          background: linear-gradient(90deg, rgba(217,119,87,.12), rgba(217,119,87,.06));
          border-bottom-color: rgba(217,119,87,.3);
          color: var(--amber-soft);
        }
        html[data-theme="dark"] #ppl-agenda-strip a { color: var(--amber-soft); }
        html[data-theme="dark"] #ppl-agenda-strip .ppl-settings-btn { color: var(--amber-soft); }
        html[data-theme="dark"] #ppl-agenda-strip .ppl-settings-btn:hover { background: rgba(217,119,87,.2); }
        html[data-theme="dark"] .ppl-artifact-zone {
          background: rgba(255,253,247,.03); border-left-color: var(--amber);
        }
        html[data-theme="dark"] .ppl-artifact-zone .ppl-zone-title { color: var(--amber-soft); }
        html[data-theme="dark"] .ppl-revision-zone {
          background: rgba(217,119,87,.08); border-left-color: var(--amber);
        }
        html[data-theme="dark"] .ppl-revision-zone .ppl-rv-title { color: var(--amber-soft); }
        html[data-theme="dark"] .ppl-rv-form select,
        html[data-theme="dark"] .ppl-rv-form textarea {
          background: rgba(255,253,247,.06); color: var(--ivory);
          border-color: rgba(255,253,247,.14);
        }
        html[data-theme="dark"] .ppl-rv-card {
          background: rgba(255,253,247,.04); border-color: rgba(255,253,247,.10);
          color: var(--on-dark);
        }
        html[data-theme="dark"] .ppl-rv-card .ppl-rv-dim { color: var(--amber-soft); }
        html[data-theme="dark"] .ppl-rv-card .ppl-rv-meta { color: var(--mute-2); }
        .ppl-artifact-zone {
          margin-top: 14px; padding: 12px 14px;
          background: #faf6ee; border-left: 3px solid #a8492a;
          font-family: var(--serif-cn);
        }
        .ppl-artifact-zone .ppl-zone-title {
          font-size: var(--fs-2xs); color: var(--gold-deep); margin-bottom: 8px; letter-spacing: .04em;
        }
        .ppl-artifact-zone button { margin: 4px 8px 4px 0; }
        .ppl-artifact-zone button[disabled] { opacity: .5; cursor: default; }
      `;
      document.head.appendChild(s);
    }

    function renderAgendaStrip() {
      const existing = document.getElementById("ppl-agenda-strip");
      if (existing) existing.remove();
    }

    function doExport() {
      const data = Store.dump();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const ts = new Date().toISOString().slice(0, 16).replace(/[T:]/g, "-");
      a.href = url; a.download = `pharmacoPilot-${ts}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      if (global.showDemoToast) global.showDemoToast("✓ 已导出 JSON · " + a.download);
    }

    function doImport() {
      const input = document.createElement("input");
      input.type = "file"; input.accept = "application/json,.json";
      input.addEventListener("change", () => {
        const f = input.files && input.files[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const parsed = JSON.parse(reader.result);
            const r = Store.importState(parsed);
            if (r.ok) {
              if (global.showDemoToast) global.showDemoToast("✓ 已导入 · 刷新页面以应用");
              setTimeout(() => location.reload(), 800);
            } else {
              alert("导入失败：" + (r.error || "未知错误"));
            }
          } catch (e) {
            alert("JSON 解析失败：" + e.message);
          }
        };
        reader.readAsText(f);
      });
      input.click();
    }

    // -------- O · 主题管理（dark/light/auto） --------
    const THEME_KEY = "pharmacoPilot.theme.v1";
    function getTheme() {
      // 隐私模式/阻止 Cookie 时 localStorage 会抛 SecurityError — 降级为 auto,不中断脚本
      try { return localStorage.getItem(THEME_KEY) || "auto"; } catch (e) { return "auto"; }
    }
    function effectiveTheme() {
      const t = getTheme();
      if (t === "auto") {
        return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      }
      return t;
    }
    function applyTheme() {
      const eff = effectiveTheme();
      document.documentElement.setAttribute("data-theme", eff);
    }
    function setTheme(t) {
      if (!["light", "dark", "auto"].includes(t)) return;
      try { localStorage.setItem(THEME_KEY, t); } catch (e) { /* 无存储权限时仅本次会话生效 */ }
      applyTheme();
      // 立即刷新 Settings drawer 按钮高亮
      const d = document.getElementById("ppl-settings-drawer");
      if (d && d.classList.contains("is-open")) renderSettingsBody();
    }
    // 初始化：尽早 apply（防闪烁）+ 监听系统切换
    applyTheme();
    if (window.matchMedia) {
      try {
        const mq = matchMedia("(prefers-color-scheme: dark)");
        const onChange = () => { if (getTheme() === "auto") applyTheme(); };
        if (mq.addEventListener) mq.addEventListener("change", onChange);
        else if (mq.addListener) mq.addListener(onChange);
      } catch (e) {}
    }
    global.__pharmaco = global.__pharmaco || {};
    global.__pharmaco.setTheme = setTheme;
    global.__pharmaco.getTheme = getTheme;

    // -------- G · Settings 抽屉 --------
    function ensureSettingsDom() {
      if (document.getElementById("ppl-settings-drawer")) return;
      const overlay = document.createElement("div");
      overlay.id = "ppl-settings-overlay";
      overlay.addEventListener("click", closeSettingsDrawer);
      const drawer = document.createElement("aside");
      drawer.id = "ppl-settings-drawer";
      drawer.setAttribute("role", "dialog");
      drawer.setAttribute("aria-label", "设置面板");
      drawer.innerHTML = `
        <div class="pst-head">
          <h3>⚙ 设置</h3>
          <button class="pst-close" data-pst-action="close" aria-label="关闭">✕</button>
        </div>
        <div class="pst-body" id="pst-body"></div>
      `;
      document.body.appendChild(overlay);
      document.body.appendChild(drawer);
      drawer.addEventListener("click", (e) => {
        // 主题切换器
        const themeBtn = e.target.closest("[data-pst-theme]");
        if (themeBtn) {
          setTheme(themeBtn.getAttribute("data-pst-theme"));
          return;
        }
        const a = e.target.closest("[data-pst-action]");
        if (!a) return;
        const action = a.getAttribute("data-pst-action");
        if (action === "close") closeSettingsDrawer();
        else if (action === "export") doExport();
        else if (action === "import") doImport();
        else if (action === "open-celebrate") {
          closeSettingsDrawer();
          setTimeout(() => global.__pharmaco && global.__pharmaco.openCelebrate && global.__pharmaco.openCelebrate(), 300);
        }
        else if (action === "reset") {
          if (confirm("确认清空所有已保存的判断、产物、议程、量规修订数据吗？此操作不可撤销。")) {
            Store.reset();
            location.reload();
          }
        }
      });
      // ESC 关闭
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && drawer.classList.contains("is-open")) {
          closeSettingsDrawer();
        }
      });
    }

    function formatBytes(bytes) {
      if (bytes < 1024) return bytes + " B";
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
      return (bytes / 1024 / 1024).toFixed(2) + " MB";
    }

    function renderSettingsBody() {
      const body = document.getElementById("pst-body");
      if (!body) return;
      const C = global.PharmacoPilotNavigationContract || {};
      const dump = Store.dump();
      const agendas = (dump.agendas || []).length;
      const judgments = Object.keys(dump.judgments || {}).length;
      const artifacts = Object.values(dump.artifacts || {}).reduce((acc, arr) => acc + (arr ? arr.length : 0), 0);
      const revisions = dump.rubricRevisions || [];
      const pendingRev = revisions.filter((r) => r.status === "pending").length;
      const acceptedRev = revisions.filter((r) => r.status === "accepted").length;
      const zpdAnchors = (dump.zpdAnchors || []).length;
      const pulseRules = Object.keys(dump.pulseRules || {}).length;
      const stageProgress = getStageProgressV4();

      // 议程跨站兑现汇总
      const af = dump.agendaFulfillment || {};
      const fulfilled = (sid) => Object.keys(af[sid] || {}).length;

      // localStorage 使用量
      let lsSize = 0;
      try {
        const raw = localStorage.getItem("pharmacoPilot.state.v1") || "";
        lsSize = new Blob([raw]).size;
      } catch (e) {}

      body.innerHTML = `
        <div class="pst-section">
          <div class="pst-section-h">📊 进度概览</div>
          <div class="pst-stat-row"><span class="pst-k">9 个教学环节完成</span><span class="pst-v">${stageProgress ? stageProgress.done : 0} / 9</span></div>
          <div class="pst-stat-row"><span class="pst-k">子节点判断已保存</span><span class="pst-v">${judgments} / 11</span></div>
          <div class="pst-stat-row"><span class="pst-k">产物已生成</span><span class="pst-v">${artifacts}</span></div>
          <div class="pst-stat-row"><span class="pst-k">学生议程</span><span class="pst-v">${agendas} 条</span></div>
          <div class="pst-stat-row"><span class="pst-k">议程兑现轨迹</span><span class="pst-v">S2 ${fulfilled(4)} · S4 ${fulfilled(6)} · S5 ${fulfilled(8)} · S8 ${fulfilled(11)}</span></div>
          <div class="pst-stat-row"><span class="pst-k">学情校准点</span><span class="pst-v">${zpdAnchors} 个 · 规则 ${pulseRules} 条</span></div>
          <div class="pst-stat-row"><span class="pst-k">量规反向修订</span><span class="pst-v">待审 ${pendingRev} · 已采纳 ${acceptedRev}</span></div>
        </div>

        <div class="pst-section">
          <div class="pst-section-h">💾 数据管理</div>
          <button class="pst-btn" data-pst-action="export">
            ⬇ 导出 JSON
            <small>跨设备搬数据 · 当前 ${formatBytes(lsSize)}</small>
          </button>
          <button class="pst-btn" data-pst-action="import">
            ⬆ 导入 JSON
            <small>从其他设备的导出文件恢复</small>
          </button>
          <button class="pst-btn is-danger" data-pst-action="reset">
            🗑 重置全部
            <small>清空判断 / 产物 / 议程 / 量规修订（不可撤销）</small>
          </button>
        </div>

        <div class="pst-section">
          <div class="pst-section-h">ℹ 系统信息</div>
          <div class="pst-stat-row"><span class="pst-k">Contract 版本</span><span class="pst-v">${escapeHtml(C.VERSION || "?")}</span></div>
          <div class="pst-stat-row"><span class="pst-k">教学环节数</span><span class="pst-v">${(C.NAV_STAGES || []).length}</span></div>
          <div class="pst-stat-row"><span class="pst-k">子节点数</span><span class="pst-v">${Object.keys(C.SUB_NODES || {}).length}</span></div>
          <div class="pst-stat-row"><span class="pst-k">横向机制</span><span class="pst-v">动态评估 · 议程贯通 · 产出链</span></div>
          <div class="pst-stat-row"><span class="pst-k">量规反向修订通道</span><span class="pst-v">${C.RUBRIC_REVISION ? "S7 → S2" : "未启用"}</span></div>
        </div>

        ${stageProgress && stageProgress.done === stageProgress.total ? `
        <div class="pst-section">
          <div class="pst-section-h">🎉 教学设计已完整</div>
          <button class="pst-btn" data-pst-action="open-celebrate">
            📋 查看完成总结面板
            <small>9 个教学环节速览 + 横向闭环统计 + 导出 plan.md</small>
          </button>
        </div>` : ""}

        <div class="pst-section">
          <div class="pst-section-h">🎨 外观主题</div>
          <div class="pst-theme-row" data-pst-theme-row>
            <button data-pst-theme="light" class="${getTheme() === 'light' ? 'is-active' : ''}">◐ 浅色</button>
            <button data-pst-theme="dark" class="${getTheme() === 'dark' ? 'is-active' : ''}">◑ 深色</button>
            <button data-pst-theme="auto" class="${getTheme() === 'auto' ? 'is-active' : ''}">☉ 跟随系统</button>
          </div>
        </div>

        <div class="pst-section">
          <div class="pst-section-h">🛠 调试</div>
          <span class="pst-code">__pharmaco.dump()</span>
          <span class="pst-code">__pharmaco.export()</span>
          <span class="pst-code">__pharmaco.openCelebrate()</span>
        </div>
      `;
    }

    function openSettingsDrawer() {
      ensureSettingsDom();
      renderSettingsBody();
      document.getElementById("ppl-settings-overlay").classList.add("is-open");
      document.getElementById("ppl-settings-drawer").classList.add("is-open");
    }
    function closeSettingsDrawer() {
      const o = document.getElementById("ppl-settings-overlay");
      const d = document.getElementById("ppl-settings-drawer");
      if (o) o.classList.remove("is-open");
      if (d) d.classList.remove("is-open");
    }
    // 打开时 store 变化也刷新
    Store.on("judgment:saved", () => {
      const d = document.getElementById("ppl-settings-drawer");
      if (d && d.classList.contains("is-open")) renderSettingsBody();
    });
    Store.on("artifact:saved", () => {
      const d = document.getElementById("ppl-settings-drawer");
      if (d && d.classList.contains("is-open")) renderSettingsBody();
    });

    Store.on("agenda:fulfilled", renderAgendaStrip);
    Store.on("agenda:listChanged", renderAgendaStrip);
    setTimeout(renderAgendaStrip, 100);

    // -------- L · 完成 9 个教学环节庆祝面板 --------
    const CELEBRATED_KEY = "pharmacoPilot.celebrated.v1";

    function ensureCelebrateDom() {
      if (document.getElementById("ppl-celebrate-overlay")) return;
      const overlay = document.createElement("div");
      overlay.id = "ppl-celebrate-overlay";
      overlay.innerHTML = `<div id="ppl-celebrate-modal" role="dialog" aria-label="教学设计已成形"></div>`;
      overlay.addEventListener("click", (e) => {
        if (e.target.id === "ppl-celebrate-overlay") closeCelebrateModal();
      });
      document.body.appendChild(overlay);
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && overlay.classList.contains("is-open")) closeCelebrateModal();
      });
    }

    function isAllDone() {
      const sp = getStageProgressV4();
      return sp && sp.done === sp.total;
    }

    function renderCelebrateBody() {
      const modal = document.getElementById("ppl-celebrate-modal");
      if (!modal) return;
      const C = global.PharmacoPilotNavigationContract || {};
      const stages = (C.NAV_STAGES || []);
      const subNodes = (C.SUB_NODES || {});
      const dump = Store.dump();
      const judgments = dump.judgments || {};
      const agendas = (dump.agendas || []).length;
      const af = dump.agendaFulfillment || {};
      const fulfilled = (sid) => Object.keys(af[sid] || {}).length;
      const artifacts = Object.values(dump.artifacts || {}).reduce((acc, arr) => acc + (arr ? arr.length : 0), 0);
      const zpdAnchors = (dump.zpdAnchors || []).length;
      const pulseRules = Object.keys(dump.pulseRules || {}).length;
      const revisions = dump.rubricRevisions || [];
      const pendingRev = revisions.filter((r) => r.status === "pending").length;
      const acceptedRev = revisions.filter((r) => r.status === "accepted").length;

      // 9 个教学环节摘要
      const stagesHtml = stages.map((g, idx) => {
        const subKeys = (g.subNodeIds || []).map(String);
        const judSummaries = subKeys.map((k) => {
          const entry = subNodes[k] || {};
          const stid = (typeof entry.legacyStationId === "number") ? entry.legacyStationId : Number(k);
          const j = judgments[stid];
          return j ? (j.label || j.key || "?") : "—";
        });
        const judText = judSummaries.length === 1 ? judSummaries[0] : judSummaries.join(" · ");
        const shortJud = judText.length > 28 ? judText.slice(0, 28) + "…" : judText;
        return `<div class="pcl-stage-row">
          <span class="pcl-sn">${String(idx + 1).padStart(2, "0")}</span>
          <span class="pcl-cn">${escapeHtml(g.tag || "")} · ${escapeHtml(g.displayName || g.title)}</span>
          <span class="pcl-jud" title="${escapeHtml(judText)}">${escapeHtml(shortJud)}</span>
        </div>`;
      }).join("");

      // L2 议程闭环度
      const echoSegs = [4, 6, 8, 11].map((sid) => fulfilled(sid));
      const echoTotal = echoSegs.reduce((a, b) => a + b, 0);
      const echoMaxPossible = agendas * 4;
      const echoPct = echoMaxPossible ? Math.round((echoTotal / echoMaxPossible) * 100) : 0;

      modal.innerHTML = `
        <div class="pcl-banner">
          <button class="pcl-close" data-pcl-action="close" aria-label="关闭">✕</button>
          <h2>✓ 一节完整的教学设计已成形</h2>
          <div class="pcl-sub">9 个教学环节 · 12 子节点 · 全部判断已落库</div>
        </div>
        <div class="pcl-body">
          <div class="pcl-section">
            <div class="pcl-section-h">📋 9 个教学环节速览</div>
            <div class="pcl-stage-list">${stagesHtml}</div>
          </div>

          <div class="pcl-section">
            <div class="pcl-section-h">🔗 横向机制闭环</div>
            <div class="pcl-stat-grid">
              <div class="pcl-stat-card">
                <div class="pcl-stat-l">L2 议程线</div>
                <div class="pcl-stat-v">${agendas} 条<small>· 跨站兑现 ${echoPct}%</small></div>
              </div>
              <div class="pcl-stat-card">
                <div class="pcl-stat-l">动态学情触发</div>
                <div class="pcl-stat-v">${zpdAnchors} 锚点<small>· ${pulseRules} 条规则</small></div>
              </div>
              <div class="pcl-stat-card">
                <div class="pcl-stat-l">量规反向修订</div>
                <div class="pcl-stat-v">${acceptedRev}<small>· 已采纳${pendingRev ? " · 待审 " + pendingRev : ""}</small></div>
              </div>
              <div class="pcl-stat-card">
                <div class="pcl-stat-l">教学产物</div>
                <div class="pcl-stat-v">${artifacts}<small>份</small></div>
              </div>
            </div>
          </div>
        </div>
        <div class="pcl-foot">
          <button data-pcl-action="export-plan" class="is-primary">⬇ 导出完整教案 plan.md</button>
          <button data-pcl-action="export-json">⬇ 导出 JSON 备份</button>
          <button data-pcl-action="close">稍后</button>
        </div>
      `;

      modal.addEventListener("click", celebrateClickHandler);
    }

    function celebrateClickHandler(e) {
      const btn = e.target.closest("[data-pcl-action]");
      if (!btn) return;
      const action = btn.getAttribute("data-pcl-action");
      if (action === "close") closeCelebrateModal();
      else if (action === "export-json") doExport();
      else if (action === "export-plan") doExportPlanMd();
    }

    function doExportPlanMd() {
      const C = global.PharmacoPilotNavigationContract || {};
      const stages = C.NAV_STAGES || [];
      const subNodes = C.SUB_NODES || {};
      const payloadsMap = global.PharmacoPilotStationPayloads || {};
      const dump = Store.dump();
      const judgments = dump.judgments || {};

      let md = `# 一节完整的教学设计（v4 · 9 个教学环节）\n\n`;
      md += `生成时间：${new Date().toLocaleString("zh-CN", { hour12: false })}\n`;
      md += `Contract：${C.VERSION || "?"}\n`;
      md += `示例案例：药事管理 · SWOT · 华海药业 · 集采常态化\n\n`;
      md += `---\n\n## 9 个教学环节速览\n\n`;

      stages.forEach((g, idx) => {
        md += `### ${String(idx + 1).padStart(2, "0")} ${g.tag} · ${g.displayName || g.title}\n\n`;
        md += `**关键判断**：${g.keyDecision || "—"}\n\n`;
        const subs = (g.subNodeIds || []);
        subs.forEach((k) => {
          const entry = subNodes[String(k)] || {};
          const stid = (typeof entry.legacyStationId === "number") ? entry.legacyStationId : Number(k);
          const j = judgments[stid];
          md += `- **子节点 ${k}** ${entry.subTitle || ""}\n`;
          md += `  - 判断：${j ? (j.label || j.key) : "（未保存）"}\n`;
          // 产物
          const arts = dump.artifacts && dump.artifacts[stid];
          if (arts && arts.length) {
            arts.forEach((a) => { md += `  - 产物：${a.data && a.data.title || a.artifactId}\n`; });
          }
        });
        md += `\n`;
      });

      md += `---\n\n## 横向机制\n\n`;
      md += `### L2 学习者议程线\n\n`;
      (dump.agendas || []).forEach((a, i) => {
        md += `${i + 1}. ${a.text || a.key} · 票数 ${a.votes || 0}\n`;
        const trace = [];
        [4, 6, 8, 11].forEach((sid) => {
          if ((dump.agendaFulfillment || {})[sid] && (dump.agendaFulfillment[sid][a.key])) {
            trace.push(`S${sid === 4 ? 2 : sid === 6 ? 4 : sid === 8 ? 5 : 8}`);
          }
        });
        if (trace.length) md += `   兑现：${trace.join(" → ")}\n`;
      });
      md += `\n### 动态学情触发（学情校准点 + 决策规则）\n\n`;
      (dump.zpdAnchors || []).forEach((a) => {
        const rule = (dump.pulseRules || {})[a.id];
        md += `- **${a.id}** · ${a.t}' · ${a.label}\n`;
        if (rule) {
          md += `  - 微评估：${rule.microFormat || ""}\n`;
          md += `  - 如果：${rule.ifCond || ""}\n`;
          md += `  - 则：${rule.thenAct || ""}\n`;
        }
      });

      md += `\n### 量规反向修订（S7 → S2）\n\n`;
      (dump.rubricRevisions || []).forEach((r) => {
        md += `- **${r.dim}** [${r.status}]\n`;
        md += `  - 问题：${r.reason}\n`;
        if (r.proposedChange) md += `  - 建议：${r.proposedChange}\n`;
      });

      md += `\n---\n*由 PharmacoPilot ${C.VERSION || "v4"} 生成*\n`;

      const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const ts = new Date().toISOString().slice(0, 16).replace(/[T:]/g, "-");
      a.href = url; a.download = `pharmacoPilot-plan-${ts}.md`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      if (global.showDemoToast) global.showDemoToast("✓ 已导出完整教案 · " + a.download);
    }

    function openCelebrateModal() {
      ensureCelebrateDom();
      renderCelebrateBody();
      document.getElementById("ppl-celebrate-overlay").classList.add("is-open");
    }
    function closeCelebrateModal() {
      const o = document.getElementById("ppl-celebrate-overlay");
      if (o) o.classList.remove("is-open");
    }

    function maybeTriggerCelebration() {
      if (!isAllDone()) return;
      try { if (localStorage.getItem(CELEBRATED_KEY) === "1") return; } catch (e) { return; }
      try { localStorage.setItem(CELEBRATED_KEY, "1"); } catch (e) {}
      setTimeout(openCelebrateModal, 350);  // 让用户看到最后一次保存的反馈再弹
    }

    Store.on("judgment:saved", maybeTriggerCelebration);
    Store.on("store:reset", () => {
      try { localStorage.removeItem(CELEBRATED_KEY); } catch (e) {}
    });

    // 暴露给 Settings drawer 的"再次查看"按钮调用
    global.__pharmaco = global.__pharmaco || {};
    global.__pharmaco.openCelebrate = openCelebrateModal;

    // -------- 7. 通用产物按钮注入（数据驱动） --------
    function applyArtifactSideEffect(stationId, artifactId, art, payload) {
      // 节点 6 · agenda-evidence-map · 把 covered=true 的议程标为已被节点 6 兑现
      if (stationId === 6 && artifactId === "agenda-evidence-map") {
        const dots = (payload.evidenceFigure && payload.evidenceFigure.agendaCoverageDots) || [];
        dots.filter((d) => d.covered).forEach((d) => {
          Store.markAgendaFulfilled(6, d.agendaKey, d.evidenceSrc);
        });
        return;
      }
      // 节点 8 · role-task-card · 把 5 条议程按推荐角色标为已匹配
      if (stationId === 8 && (artifactId === "role-task-card" || art.sideEffect === "markAgendaRoleMatched")) {
        const sugs = (payload.evidenceFigure && payload.evidenceFigure.roleSuggestions) || [];
        sugs.forEach((s) => {
          Store.markAgendaFulfilled(8, s.agendaKey, { role: s.suggestedRole, reason: s.reason });
        });
        return;
      }
      // 节点 7 · timeline-with-anchors · 把 3 个 学情校准点写入 Store
      if (stationId === 7 && (artifactId === "timeline-with-anchors" || art.sideEffect === "writeZpdAnchors")) {
        const anchors = (payload.evidenceFigure && payload.evidenceFigure.zpdAnchors) || [];
        if (anchors.length) Store.setZpdAnchors(anchors);
        return;
      }
      // 节点 9 · pulse-rule-table · 把每个锚点的「如果 X 则 Y」规则写入 Store
      if (stationId === 9 && (artifactId === "pulse-rule-table" || art.sideEffect === "writePulseRules")) {
        const rules = (payload.evidenceFigure && payload.evidenceFigure.pulseRules) || [];
        rules.forEach((r) => {
          Store.setPulseRule(r.anchorId, {
            t: r.t, microFormat: r.microFormat, ifCond: r.ifCond, thenAct: r.thenAct,
          });
        });
        return;
      }
      // 节点 11 · review-report · L2 议程线闭环：把所有议程标为已复盘回顾
      if (stationId === 11 && (artifactId === "review-report" || art.sideEffect === "closeL2Loop")) {
        Store.getAgendas().forEach((a) => {
          const a6 = (Store.getAgendaFulfillment(6) || {})[a.key];
          const a8 = (Store.getAgendaFulfillment(8) || {})[a.key];
          Store.markAgendaFulfilled(11, a.key, {
            stationsCovered: [a6 && 6, a8 && 8].filter(Boolean),
            reviewedAt: Date.now(),
          });
        });
        return;
      }
      // 节点 3 · agenda-list · L2 源头：把聚类的 5 条议程写入 Store（覆盖）
      if (stationId === 3 && (artifactId === "agenda-list" || art.sideEffect === "seedAgendasFromStation3")) {
        const clusters = (payload.evidenceFigure && payload.evidenceFigure.mockStudentResponses && payload.evidenceFigure.mockStudentResponses.clusters) || [];
        if (clusters.length) {
          Store.setAgendas(clusters.map((c) => ({
            key: c.agendaKey, text: c.text, votes: c.studentVotes, sourceStation: 3,
          })));
        }
        return;
      }
      // 节点 4 · agenda-goal-map · L2 第 2 回响：把议程映射到学习目标
      if (stationId === 4 && (artifactId === "agenda-goal-map" || art.sideEffect === "mapAgendasToGoals")) {
        const goalMap = (payload.evidenceFigure && payload.evidenceFigure.goalEvidenceMap) || [];
        Store.getAgendas().forEach((a, idx) => {
          const goalIdx = idx % Math.max(goalMap.length, 1);
          Store.markAgendaFulfilled(4, a.key, {
            mappedToGoal: goalMap[goalIdx] && goalMap[goalIdx].goal,
            evidence: goalMap[goalIdx] && goalMap[goalIdx].evidence,
          });
        });
        return;
      }
    }

    // 「判断是否已存」：v4 复合键优先（区分 v0/v1/锚点/UbD 段），回退到 stationId 数字键
    function hasJudgmentForCurrentStation() {
      const ren = global.__navRenderState || {};
      const subKey = (ren.currentSubKey && ren.currentSubKey()) || null;
      if (subKey && Store.getJudgment(subKey)) return true;
      return !!Store.getJudgment(currentStation);
    }

    function injectArtifactsForCurrentStation(opts) {
      const payload = payloads[currentStation];
      if (!payload || !payload.artifacts) return;

      const dock = document.querySelector(".decision-dock");
      if (!dock) return;
      const existing = dock.querySelector(".ppl-artifact-zone");
      if (existing && !(opts && opts.force)) return;
      if (existing) existing.remove();

      ensureAgendaStripStyles();
      const generated = Store.getArtifacts(currentStation).map((a) => a.artifactId);

      // v4: 拆分 payload（如 station 11 在 S8/S9 之间）按当前 stage 过滤产物
      let visibleArtifacts = payload.artifacts;
      let zoneSubtitle = "";
      if (payload.isSplit && payload.splitMap) {
        const C = global.PharmacoPilotNavigationContract;
        const ren = window.__navRenderState || {};
        const curStage = ren.currentStageId && ren.currentStageId();
        let matchedSplit = null;
        Object.keys(payload.splitMap).forEach((k) => {
          if (payload.splitMap[k].stageId === curStage) matchedSplit = payload.splitMap[k];
        });
        if (matchedSplit && matchedSplit.artifactIds) {
          visibleArtifacts = payload.artifacts.filter((a) => matchedSplit.artifactIds.indexOf(a.id) !== -1);
          zoneSubtitle = " · " + matchedSplit.subTitle;
        }
      }

      const zoneTitle = (currentStation === 8
        ? "产物生成区 · L2 议程角色匹配"
        : currentStation === 6
          ? "产物生成区 · 议程兑现"
          : "产物生成区") + zoneSubtitle;

      // 门禁：未保存判断时，产物按钮置灰 + 顶部加锁提示
      const isGated = !hasJudgmentForCurrentStation();
      const gateNotice = isGated
        ? `<div class="ppl-artifact-gate">⛌ 先保存判断才能解锁产物生成</div>` : "";

      const zone = document.createElement("div");
      zone.className = "ppl-artifact-zone" + (isGated ? " is-gated" : "");
      zone.innerHTML =
        `<div class="ppl-zone-title">${escapeHtml(zoneTitle)}</div>` +
        gateNotice +
        visibleArtifacts.map((a) => {
          const done = generated.indexOf(a.id) !== -1;
          const disabled = done || isGated;
          return `<button class="btn-s${done || isGated ? "" : " is-recommend"}" data-artifact-id="${a.id}"${disabled ? " disabled" : ""}>${done ? "✓ " + escapeHtml(a.outputTitle) + " · 已落库" : escapeHtml(a.buttonLabel)}</button>`;
        }).join("");
      dock.appendChild(zone);

      zone.querySelectorAll("button[data-artifact-id]").forEach((b) => {
        b.addEventListener("click", () => {
          if (isGated) {
            if (global.showDemoToast) global.showDemoToast("先保存判断才能生成产物");
            return;
          }
          const aid = b.getAttribute("data-artifact-id");
          const art = payload.artifacts.find((x) => x.id === aid);
          if (!art) return;
          Store.saveArtifact(currentStation, aid, {
            title: art.outputTitle,
            cue: art.outputCue,
            payload: art.payload || art.template,
          });
          applyArtifactSideEffect(currentStation, aid, art, payload);
          b.textContent = "✓ " + art.outputTitle + " · 已落库";
          b.classList.remove("is-recommend");
          b.disabled = true;
          if (global.showDemoToast) global.showDemoToast("✓ 已生成产物 · " + art.outputTitle);
        });
      });
    }
    setTimeout(injectArtifactsForCurrentStation, 120);
    // 判断保存后强制重渲产物区 → 解锁按钮
    Store.on("judgment:saved", () => {
      setTimeout(() => injectArtifactsForCurrentStation({ force: true }), 30);
    });

    // ===================================================================
    // v4 · S7 → S2 量规反向修订通道
    // ===================================================================
    function ensureRubricStyles() {
      if (document.getElementById("ppl-rubric-revision-styles")) return;
      const st = document.createElement("style");
      st.id = "ppl-rubric-revision-styles";
      st.textContent = `
        .ppl-revision-zone {
          margin-top: 14px; padding: 12px 14px;
          background: #fff5ec; border-left: 3px solid #a8492a;
          font-family: var(--serif-cn);
        }
        .ppl-revision-zone .ppl-rv-title {
          font-size: var(--fs-2xs); color: var(--gold-deep); margin-bottom: 8px; letter-spacing: 0.04em;
          display: flex; align-items: center; gap: 8px;
        }
        .ppl-revision-zone .ppl-rv-badge {
          background: #a8492a; color: #fff; padding: 1px 7px; border-radius: 10px; font-size: var(--fs-2xs);
        }
        .ppl-rv-form { display: grid; grid-template-columns: 160px 1fr 1fr auto; gap: 6px; align-items: start; }
        .ppl-rv-form select, .ppl-rv-form textarea {
          font-family: inherit; font-size: var(--fs-xs); padding: 6px 8px;
          border: 1px solid rgba(168,73,42,.25); border-radius: 6px;
          background: #fff; color: var(--ink);
        }
        .ppl-rv-form textarea { min-height: 52px; resize: vertical; }
        .ppl-rv-form button { white-space: nowrap; }
        .ppl-rv-list { margin-top: 10px; display: flex; flex-direction: column; gap: 8px; }
        .ppl-rv-card {
          background: #fff; border: 1px solid rgba(168,73,42,.18); border-radius: 8px;
          padding: 10px 12px; font-size: var(--fs-xs);
        }
        .ppl-rv-card.is-resolved { opacity: .55; }
        .ppl-rv-card .ppl-rv-meta {
          display: flex; align-items: center; gap: 8px; margin-bottom: 5px;
          font-family: var(--mono); font-size: var(--fs-2xs); color: var(--gold-deep);
        }
        .ppl-rv-card .ppl-rv-dim { color: var(--amber-deep, #a8492a); font-weight: 600; }
        .ppl-rv-card .ppl-rv-status { margin-left: auto; padding: 1px 6px; border-radius: 8px; font-size: var(--fs-2xs); }
        .ppl-rv-card .ppl-rv-status.s-pending  { background: #fef0d9; color: var(--amber-deep); }
        .ppl-rv-card .ppl-rv-status.s-accepted { background: #e3f0e3; color: var(--ok); }
        .ppl-rv-card .ppl-rv-status.s-rejected { background: #eaeaea; color: #777; }
        .ppl-rv-card .ppl-rv-actions { margin-top: 6px; display: flex; gap: 6px; }
        .ppl-rv-card .ppl-rv-actions button {
          font-size: var(--fs-2xs); padding: 3px 10px; border-radius: 4px;
          border: 1px solid rgba(168,73,42,.3); background: #fff; cursor: pointer;
        }
        .ppl-rv-card .ppl-rv-actions button.accept { background: var(--sage, #6a9a7b); color: #fff; border-color: var(--sage, #6a9a7b); }
        .ppl-rv-card .ppl-rv-actions button.reject { color: #777; }
        /* Chip 徽章：S2 待审修订 N 条 */
        [data-stage="S2"] .stage-revision-badge {
          position: absolute; top: 7px; left: 6px;
          background: var(--amber-deep, #a8492a); color: #fff;
          font-family: var(--mono); font-size: var(--fs-2xs);
          padding: 1px 5px; border-radius: 8px;
          box-shadow: 0 0 0 2px rgba(217,119,87,.25);
        }
      `;
      document.head.appendChild(st);
    }

    function renderRubricRevisionPanel() {
      ensureRubricStyles();
      // S2 → 显示「待审修订」面板（在 currentStation === 4 时）
      // S7 → 显示「向 S2 提出量规修订」面板（在 currentStation === 10 时）
      if (currentStation === 4) injectS2ReviewPanel();
      else if (currentStation === 10) injectS7ProposePanel();
      // chip 徽章每次都更新
      updateChipRevisionBadge();
    }

    function injectS7ProposePanel() {
      const dock = document.querySelector(".decision-dock");
      if (!dock || dock.querySelector(".ppl-revision-zone")) return;
      const payload = payloads[10];
      const rubric = (payload && payload.evidenceFigure && payload.evidenceFigure.rubric) || [];
      const myProposed = Store.getRubricRevisions().slice().sort((a, b) => b.proposedAt - a.proposedAt);

      const zone = document.createElement("div");
      zone.className = "ppl-revision-zone";
      zone.innerHTML = `
        <div class="ppl-rv-title">
          <span>S7 → S2 量规反向修订通道</span>
          ${myProposed.length ? `<span class="ppl-rv-badge">已提 ${myProposed.length} 条</span>` : ""}
        </div>
        <div class="ppl-rv-form">
          <select id="ppl-rv-dim">
            <option value="">选择维度…</option>
            ${rubric.map((r) => `<option value="${escapeHtml(r.dim)}">${escapeHtml(r.dim)}</option>`).join("")}
          </select>
          <textarea id="ppl-rv-reason" placeholder="发现的问题（如：该维度区分度不足 / 阈值过严 / 缺失关键观察点）"></textarea>
          <textarea id="ppl-rv-proposed" placeholder="建议的修订（如：4 分阈值由 80 改为 75 / 新增「批判意识」子维度）"></textarea>
          <button class="btn-s is-recommend" id="ppl-rv-submit">向 S2 提出修订</button>
        </div>
        <div class="ppl-rv-list" id="ppl-rv-list"></div>
      `;
      dock.appendChild(zone);

      const refreshList = () => {
        const list = zone.querySelector("#ppl-rv-list");
        const items = Store.getRubricRevisions().slice().sort((a, b) => b.proposedAt - a.proposedAt);
        if (!items.length) { list.innerHTML = ""; return; }
        list.innerHTML = items.map((r) => `
          <div class="ppl-rv-card${r.status !== "pending" ? " is-resolved" : ""}">
            <div class="ppl-rv-meta">
              <span class="ppl-rv-dim">${escapeHtml(r.dim)}</span>
              <span>${new Date(r.proposedAt).toLocaleString("zh-CN", { hour12: false })}</span>
              <span class="ppl-rv-status s-${r.status}">${r.status === "pending" ? "待审" : (r.status === "accepted" ? "✓ 已采纳" : "✗ 已驳回")}</span>
            </div>
            <div>${escapeHtml(r.reason)}</div>
            ${r.proposedChange ? `<div style="margin-top:4px;color:var(--gold-deep)">建议：${escapeHtml(r.proposedChange)}</div>` : ""}
          </div>
        `).join("");
      };
      refreshList();
      Store.on("rubric:revisionProposed", refreshList);
      Store.on("rubric:revisionResolved", refreshList);

      zone.querySelector("#ppl-rv-submit").addEventListener("click", () => {
        const dim = zone.querySelector("#ppl-rv-dim").value;
        const reason = zone.querySelector("#ppl-rv-reason").value.trim();
        const proposedChange = zone.querySelector("#ppl-rv-proposed").value.trim();
        if (!dim || !reason) {
          if (global.showDemoToast) global.showDemoToast("✕ 维度和问题描述必填");
          return;
        }
        const r = Store.proposeRubricRevision({ dim, reason, proposedChange });
        if (r.ok) {
          if (global.showDemoToast) global.showDemoToast("✓ 已向 S2 提出修订 · " + dim);
          zone.querySelector("#ppl-rv-dim").value = "";
          zone.querySelector("#ppl-rv-reason").value = "";
          zone.querySelector("#ppl-rv-proposed").value = "";
        }
      });
    }

    function injectS2ReviewPanel() {
      const dock = document.querySelector(".decision-dock");
      if (!dock || dock.querySelector(".ppl-revision-zone")) return;
      const pending = Store.getRubricRevisions("pending");
      const all = Store.getRubricRevisions();
      if (!all.length) return;  // 无任何修订记录则不显示

      const zone = document.createElement("div");
      zone.className = "ppl-revision-zone";
      zone.innerHTML = `
        <div class="ppl-rv-title">
          <span>来自 S7 的量规修订建议</span>
          ${pending.length ? `<span class="ppl-rv-badge">待审 ${pending.length} 条</span>` : `<span style="color:var(--ok)">✓ 全部处理完毕</span>`}
        </div>
        <div class="ppl-rv-list" id="ppl-rv-s2-list"></div>
      `;
      dock.appendChild(zone);

      const refreshList = () => {
        const list = zone.querySelector("#ppl-rv-s2-list");
        const items = Store.getRubricRevisions().slice().sort((a, b) => {
          if (a.status === "pending" && b.status !== "pending") return -1;
          if (a.status !== "pending" && b.status === "pending") return 1;
          return b.proposedAt - a.proposedAt;
        });
        list.innerHTML = items.map((r) => `
          <div class="ppl-rv-card${r.status !== "pending" ? " is-resolved" : ""}" data-rev-id="${escapeHtml(r.id)}">
            <div class="ppl-rv-meta">
              <span class="ppl-rv-dim">${escapeHtml(r.dim)}</span>
              <span>${new Date(r.proposedAt).toLocaleString("zh-CN", { hour12: false })}</span>
              <span class="ppl-rv-status s-${r.status}">${r.status === "pending" ? "待审" : (r.status === "accepted" ? "✓ 已采纳" : "✗ 已驳回")}</span>
            </div>
            <div>${escapeHtml(r.reason)}</div>
            ${r.proposedChange ? `<div style="margin-top:4px;color:var(--gold-deep)">建议：${escapeHtml(r.proposedChange)}</div>` : ""}
            ${r.status === "pending" ? `
              <div class="ppl-rv-actions">
                <button class="accept" data-rev-act="accepted">采纳并写入量规 v2</button>
                <button class="reject" data-rev-act="rejected">驳回（保留备注）</button>
              </div>` : ""}
          </div>
        `).join("");
      };
      refreshList();
      Store.on("rubric:revisionResolved", refreshList);

      zone.addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-rev-act]");
        if (!btn) return;
        const card = btn.closest("[data-rev-id]");
        const revId = card.getAttribute("data-rev-id");
        const decision = btn.getAttribute("data-rev-act");
        const r = Store.resolveRubricRevision(revId, decision);
        if (r.ok) {
          if (global.showDemoToast) global.showDemoToast((decision === "accepted" ? "✓ 已采纳" : "✗ 已驳回") + " · " + r.revision.dim);
          updateChipRevisionBadge();
        }
      });
    }

    function updateChipRevisionBadge() {
      const chip = document.querySelector('[data-stage="S2"]');
      if (!chip) return;
      let badge = chip.querySelector(".stage-revision-badge");
      const pending = Store.getRubricRevisions("pending").length;
      if (!pending) { if (badge) badge.remove(); return; }
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "stage-revision-badge";
        chip.appendChild(badge);
      }
      badge.textContent = "修订 " + pending;
      badge.title = `来自 S7 的待审量规修订 ${pending} 条`;
    }

    // 触发：每次切换节点 / 触发修订事件时重新注入
    setTimeout(renderRubricRevisionPanel, 140);
    Store.on("rubric:revisionProposed", () => setTimeout(renderRubricRevisionPanel, 60));
    Store.on("rubric:revisionProposed", updateChipRevisionBadge);
    Store.on("rubric:revisionResolved", () => setTimeout(renderRubricRevisionPanel, 60));
    // chip 栏重渲染会清掉徽章——挂到 nav-render 暴露的重渲染钩子上补回（替代原来的 1.5s 永久轮询）
    global.__navAfterStageChipsRender = updateChipRevisionBadge;
    updateChipRevisionBadge();
    // 切换节点时重新决定显示哪个面板
    const origInject = injectArtifactsForCurrentStation;
    if (!origInject.__rubricPatched) {
      injectArtifactsForCurrentStation = function patchedInject() {
        origInject.apply(this, arguments);
        renderRubricRevisionPanel();
      };
      injectArtifactsForCurrentStation.__rubricPatched = true;
    }

    // -------- 7b · S8 议程未兑现原因记录 (v4.2) --------
    // capture-phase 监听 .ar-note-save 点击，把对应 textarea 的内容写入 Store
    document.addEventListener("click", (e) => {
      const btn = e.target.closest(".ar-note-save");
      if (!btn) return;
      const agendaKey = btn.getAttribute("data-agenda-key");
      if (!agendaKey) return;
      const wrap = btn.closest(".ar-note") || document;
      const textarea = wrap.querySelector(`textarea.ar-note-input[data-agenda-key="${agendaKey}"]`);
      const reason = textarea ? textarea.value.trim() : "";
      if (!reason) {
        if (global.showDemoToast) global.showDemoToast("✕ 请先填写未兑现原因");
        return;
      }
      const r = Store.saveAgendaUnfulfillmentNote(agendaKey, reason);
      if (r && r.ok) {
        btn.textContent = "已保存 ✓";
        btn.disabled = true;
        setTimeout(() => { btn.textContent = "保存"; btn.disabled = false; }, 1800);
        if (global.showDemoToast) global.showDemoToast(`✓ 议程「${agendaKey}」未兑现原因已记录`);
      }
    }, true);
    // 监听原因更新事件，重新触发 detail 渲染
    Store.on("agenda:unfulfillmentNoted", () => {
      if (global.__navRenderState && global.__navRenderState.refreshDetail) {
        global.__navRenderState.refreshDetail();
      }
    });

    // -------- 7c · 写回训练地图 (v4.2) --------
    // 把当前环节的判断 + 产物打包为一份"训练地图资产"写回 Store
    document.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-writeback-map]");
      if (!btn) return;
      const sid = parseInt(btn.getAttribute("data-station"), 10) || effectiveStation();
      const jud = Store.getJudgment(sid);
      const arts = Store.getArtifacts(sid) || [];
      const C = global.PharmacoPilotNavigationContract || {};
      const sub = (C.SUB_NODES && C.SUB_NODES[String(sid)]) || {};
      const assetId = `trainmap-writeback-${sid}-${Date.now()}`;
      Store.saveArtifact(sid, assetId, {
        title: `训练地图写回 · 节点 ${pad2(sid)}`,
        kind: "trainmap-writeback",
        stageId: sub.stageId || null,
        judgment: jud ? { key: jud.key, label: jud.label, score: jud.score } : null,
        artifactCount: arts.length,
        writtenAt: new Date().toISOString(),
      });
      btn.textContent = "✓ 已写回训练地图";
      btn.disabled = true;
      if (global.showDemoToast) global.showDemoToast(`✓ 节点 ${pad2(sid)} 已写回训练地图 · 判断 + ${arts.length} 份产物`);
    }, true);

    // -------- 8. Helpers --------
    function pad2(n) { return String(n).padStart(2, "0"); }
    function escapeHtml(s) {
      return String(s == null ? "" : s)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }

    // MVL 路径引导已下线（按团队决定）。如未来需要"教学设计模式"引导，
    // 重写为模式选择器而非 MVL 简化路径。
    // 旧 localStorage key 一次性清理：
    (function cleanupLegacyMvlKeys() {
      try {
        localStorage.removeItem("pharmacoPilot.mvl.dismissed.v1");
        localStorage.removeItem("pharmacoPilot.mvl.afterPrompted.v1");
      } catch (e) {}
      const existing = document.getElementById("ppl-mvl-banner");
      if (existing) existing.remove();
    })();

    // -------- 9. Debug --------
    Object.assign(global.__pharmaco = global.__pharmaco || {}, {
      store: Store,
      dump: () => Store.dump(),
      reset: () => Store.reset(),
      progress: () => Store.getProgress(),
      currentStation: () => currentStation,
      export: doExport,
    });

    console.log("[pharmaco-bridge] ✓ initialized · localStorage state bus + payload wiring active");
  });
})(window);
