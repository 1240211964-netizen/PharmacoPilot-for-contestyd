/* ============================================================
   PharmacoPilot · 闻道 (Wendao) 学术服务平台 — search bar bridge
   ------------------------------------------------------------
   Upgrades every `.cmdbar` in the page into a working search
   input that opens the 闻道 对话页面 in a new tab.

   Endpoint spec (from 学术服务平台内嵌页面.docx):

     https://{domain}/api/openAccess/redirect/history
       ?agentId={agentId}
       &modelId={modelId}
       &hd=1,1
       &searchText={query}
       &internet_search=false

   {domain} is institution-specific (xxx.libsp.net). It can be
   overridden per-page with:
       <body data-wendao-domain="pharmacy.libsp.net">
   or globally before this script loads via:
       window.WENDAO_DOMAIN = "...";
   ============================================================ */
(function () {
  "use strict";

  // ---- Config ----
  const DEFAULTS = {
    domain: window.WENDAO_DOMAIN || document.body?.dataset?.wendaoDomain || "demo.libsp.net",
    // 教学设计智能体
    agentId: "6ab7fb8c-1c28-11f1-a6d8-fa163f5838c7",
    // 教学设计智能体 默认模型
    modelId: "11609df7-fee9-11ef-a29b-d039570c2aae",
  };

  function getDomain() {
    return (
      window.WENDAO_DOMAIN ||
      document.body?.dataset?.wendaoDomain ||
      DEFAULTS.domain
    );
  }

  // Build a redirect URL per the 闻道 openAccess spec.
  // kind: "history" | "home" | "knowledge_base" | "subscribe" | "project"
  //       | "ai_knowledge_base" | "search_history" | "deep_research_history"
  //       | "ai_applications" | "ai_researcher" | "ai_citation" | "houdao_research_history"
  function urlFor(opts = {}) {
    const kind = opts.kind || "history";
    const domain = opts.domain || getDomain();
    const base = `https://${domain}/api/openAccess/redirect/${kind}`;
    const params = new URLSearchParams();

    if (kind === "history") {
      params.set("agentId", opts.agentId || DEFAULTS.agentId);
      params.set("modelId", opts.modelId || DEFAULTS.modelId);
      params.set("hd", "1,1");
      if (opts.searchText) params.set("searchText", opts.searchText);
      if (opts.internetSearch) params.set("internet_search", "true");
    } else if (kind === "home") {
      params.set("hd", "0,1,1");
      params.set("select_agent_id", opts.agentId || DEFAULTS.agentId);
    } else if (kind === "search_history") {
      params.set("hd", "1,1,1");
    } else if (kind === "deep_research_history") {
      params.set("hd", "0,1,1");
      if (opts.applicationId) params.set("applicationId", opts.applicationId);
      if (opts.searchText) params.set("searchText", opts.searchText);
    } else {
      params.set("hd", "1,1");
    }
    return `${base}?${params.toString()}`;
  }

  function openWendao(opts) {
    const url = urlFor(opts);
    const note = (typeof window.showDemoToast === "function") ? window.showDemoToast : null;
    // 演示占位域名(demo.*)未接入真实闻道服务:诚实提示,不打开死链。
    // 部署方注入校内域名(window.WENDAO_DOMAIN 或 body[data-wendao-domain])后自动恢复外跳。
    if (/^demo\./.test(opts?.domain || getDomain())) {
      if (note) note("闻道学术检索 · 演示环境未接入院校平台（部署时注入校内域名即可启用）");
      return;
    }
    // 带 noopener 时 window.open 按 HTML 规范返回 null（即使成功打开），不能据返回值判断是否被拦截；
    // 用户手势触发的打开极少被拦 → 乐观提示，避免每次成功打开都误报"被拦截"
    const win = window.open(url, "_blank", "noopener,noreferrer");
    if (note) note("正在打开「闻道」学术检索平台（新页面）…");
    if (!win) console.warn("[wendao] window.open 返回 null（noopener 下属正常，无法据此判断拦截）:", url);
  }

  // ---- DOM upgrade ----
  function upgradeBar(bar) {
    if (bar.dataset.wendaoUpgraded) return;
    bar.dataset.wendaoUpgraded = "1";
    bar.classList.add("cmdbar-wendao");

    // Keep visual chrome; replace contents with form + input + kbd
    bar.innerHTML = "";

    const form = document.createElement("form");
    form.className = "cmdbar-form";
    form.setAttribute("role", "search");
    form.action = "#";

    // Brand chip: 问问闻道
    const brand = document.createElement("span");
    brand.className = "cmdbar-brand";
    brand.innerHTML = '<span class="cmdbar-brand-dot" aria-hidden="true"></span>问问闻道';

    const sep = document.createElement("span");
    sep.className = "cmdbar-sep";
    sep.setAttribute("aria-hidden", "true");

    const input = document.createElement("input");
    input.type = "search";
    input.className = "cmdbar-input";
    input.placeholder = "";
    input.setAttribute("aria-label", "问问闻道：在闻道学术服务平台中检索");
    input.autocomplete = "off";

    const kbd = document.createElement("kbd");
    kbd.textContent = "⌘K";

    form.appendChild(brand);
    form.appendChild(input);
    form.appendChild(kbd);
    bar.appendChild(form);

    // Visual click affordance: click anywhere on the bar focuses input
    bar.addEventListener("click", (e) => {
      if (e.target !== input) input.focus();
    });

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const q = input.value.trim();
      if (q) {
        openWendao({ kind: "history", searchText: q });
      } else {
        openWendao({ kind: "home" });
      }
    });
  }

  function upgradeAll() {
    document.querySelectorAll(".cmdbar").forEach(upgradeBar);
  }

  // ---- data-wendao hooks --------------------------------------------------
  // Markup contract:
  //   <textarea data-wendao="textarea" id="...">             prompt source
  //   <span data-wendao="chip">…label…</span>                click → fill textarea
  //   <button data-wendao="launch" data-wendao-source="#id">click → openWendao(history, text)
  //   <button data-wendao="home">                            click → openWendao(home)
  //   <a    data-wendao="home">                              click → openWendao(home)
  function findSourceText(trigger) {
    // explicit query string wins
    const direct = trigger.getAttribute("data-wendao-query");
    if (direct) return direct.trim();
    const sel = trigger.getAttribute("data-wendao-source");
    if (sel) {
      const node = document.querySelector(sel);
      if (node && "value" in node) return String(node.value || "").trim();
      if (node) return (node.textContent || "").trim();
    }
    // Fallback: nearest textarea in the same section/card
    const scope = trigger.closest(".wenda-c, section, .card, body");
    const ta = scope?.querySelector("[data-wendao='textarea'], textarea");
    return ta ? String(ta.value || "").trim() : "";
  }

  function bindWendaoHooks() {
    document.addEventListener("click", (e) => {
      const trig = e.target.closest("[data-wendao]");
      if (!trig) return;
      const kind = trig.getAttribute("data-wendao");

      if (kind === "launch") {
        e.preventDefault();
        const q = findSourceText(trig);
        openWendao(q ? { kind: "history", searchText: q } : { kind: "home" });
        return;
      }
      if (kind === "home") {
        e.preventDefault();
        openWendao({ kind: "home" });
        return;
      }
      if (kind === "chip") {
        e.preventDefault();
        const scope = trig.closest(".wenda-c, section, .card, body");
        const ta = scope?.querySelector("[data-wendao='textarea'], textarea");
        if (!ta) return;
        const label = (trig.textContent || "").trim();
        // Toggle-add: append the chip's label as a tag prefix to the prompt
        const existing = String(ta.value || "");
        if (existing.includes(`#${label}`)) {
          // label 来自 chip 文本，可能含正则元字符（如 "C++"）——先转义再进 RegExp
          const reSafe = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          ta.value = existing.replace(new RegExp(`\\s*#${reSafe}`, "g"), "").trim();
        } else {
          ta.value = (existing ? existing.trim() + "  " : "") + `#${label}`;
        }
        ta.focus();
        return;
      }
    });

    // ⌘+Enter inside a wendao textarea submits
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" || !(e.metaKey || e.ctrlKey)) return;
      const ta = e.target.closest("[data-wendao='textarea'], textarea");
      if (!ta) return;
      // only intercept when the textarea is inside a wenda card
      if (!ta.closest(".wenda-c, [data-wendao-host]")) return;
      e.preventDefault();
      const q = String(ta.value || "").trim();
      openWendao(q ? { kind: "history", searchText: q } : { kind: "home" });
    });
  }

  // ---- Global ⌘K / Ctrl+K ----
  function bindHotkey() {
    document.addEventListener("keydown", (e) => {
      const isK = e.key === "k" || e.key === "K";
      if (!isK) return;
      if (!(e.metaKey || e.ctrlKey)) return;
      const bar = document.querySelector(".cmdbar .cmdbar-input");
      if (!bar) return;
      e.preventDefault();
      bar.focus();
      bar.select?.();
    });
  }

  // ---- Boot ----
  function boot() {
    upgradeAll();
    bindHotkey();
    bindWendaoHooks();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }

  // Expose for other scripts (e.g. "启动一次探索" buttons).
  window.WENDAO = { urlFor, openWendao, getDomain, DEFAULTS };
})();
