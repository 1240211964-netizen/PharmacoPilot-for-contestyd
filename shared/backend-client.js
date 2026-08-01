/* ============================================================
   PharmacoPilot · Local Backend Client
   ------------------------------------------------------------
   将 pharmacoPilot.state.v1 与本机后端做乐观版本同步。
   第一次连接会把已有浏览器状态迁入空后端；如两端都已有
   不同数据，只报 conflict，不自动覆盖。

   Public API: window.PharmacoBackend
     · sync() / push() / pull({ force: true }) / health()
     · chat({ agentId, messages, ... })
     · generatePracticePack({ context, designBriefs, generatedPack?, targetEnv? })
     · reviewPractice({ reviewerId, sourceRevision, context, currentPack })
     · getStatus()
   ============================================================ */
(function attachBackendClient(global) {
  "use strict";

  const STATE_KEY = "pharmacoPilot.state.v1";
  const META_KEY = "pharmacoPilot.backend.meta.v1";
  const workspaceId = document.body?.dataset?.workspaceId || "default";
  const apiBase = (global.PHARMACO_API_BASE || document.body?.dataset?.apiBase || "/api").replace(/\/$/, "");
  let currentStatus = { phase: "idle", workspaceId, revision: 0, error: null };
  let syncPromise = null;
  let pushTimer = null;
  let unsubscribe = null;
  let statusEl = null;

  const STATUS_COPY = Object.freeze({
    idle: { label: "未连接", title: "等待连接本机后端" },
    connecting: { label: "连接中", title: "正在连接本机后端并核对工作区状态" },
    ready: { label: "已同步", title: "本机后端已连接，教学状态已同步" },
    browser: { label: "仅浏览器", title: "静态浏览模式；当前修改仅保存在此浏览器，点击可尝试连接本机后端" },
    unavailable: { label: "仅浏览器", title: "本机后端未连接，当前修改仅保存在此浏览器；点击重试" },
    conflict: { label: "同步冲突", title: "浏览器与后端都有未同步修改，已停止自动覆盖" },
  });

  function injectStatusStyles() {
    if (document.getElementById("pharmaco-backend-status-style")) return;
    const style = document.createElement("style");
    style.id = "pharmaco-backend-status-style";
    style.textContent = `
.backend-status-chip {
  --backend-color: var(--mute);
  display: inline-flex; align-items: center; gap: 6px; flex: 0 0 auto;
  min-height: 30px; padding: 5px 9px; border-radius: 999px;
  border: 1px solid color-mix(in oklab, var(--backend-color) 34%, transparent);
  background: color-mix(in oklab, var(--backend-color) 8%, var(--ivory));
  color: var(--backend-color); white-space: nowrap; cursor: default;
  font: 500 var(--text-caption)/1 var(--mono);
  letter-spacing: .03em;
}
.backend-status-chip[data-phase="ready"] { --backend-color: var(--sage); }
.backend-status-chip[data-phase="connecting"] { --backend-color: var(--amber-deep); }
.backend-status-chip[data-phase="conflict"] { --backend-color: #a23f32; cursor: help; }
.backend-status-chip[data-phase="browser"] { cursor: pointer; }
.backend-status-chip[data-phase="unavailable"] { cursor: pointer; }
.backend-status-chip .backend-status-dot {
  width: 7px; height: 7px; border-radius: 50%; flex: 0 0 auto;
  background: currentColor; box-shadow: 0 0 0 3px color-mix(in oklab, currentColor 14%, transparent);
}
.backend-status-chip[data-phase="connecting"] .backend-status-dot { animation: backendStatusPulse 1s ease-in-out infinite; }
@keyframes backendStatusPulse { 50% { opacity: .35; transform: scale(.82); } }
@media (prefers-reduced-motion: reduce) {
  .backend-status-chip[data-phase="connecting"] .backend-status-dot { animation: none; }
}
.backend-status-chip.backend-status-floating { position: fixed; top: 12px; right: 12px; z-index: 9998; }
html[data-theme="dark"] .backend-status-chip {
  background: color-mix(in oklab, var(--backend-color) 13%, #211f1d);
  border-color: color-mix(in oklab, var(--backend-color) 52%, transparent);
}
`;
    document.head.appendChild(style);
  }

  function statusDetail() {
    const copy = STATUS_COPY[currentStatus.phase] || STATUS_COPY.idle;
    if (currentStatus.phase === "ready") {
      return `${copy.title} · 工作区 ${workspaceId} · 修订 ${Number(currentStatus.revision || 0)}`;
    }
    if (currentStatus.error) return `${copy.title} · ${currentStatus.error}`;
    return copy.title;
  }

  function renderStatusIndicator() {
    if (!statusEl) return;
    const copy = STATUS_COPY[currentStatus.phase] || STATUS_COPY.idle;
    statusEl.dataset.phase = currentStatus.phase;
    statusEl.querySelector(".backend-status-label").textContent = copy.label;
    const detail = statusDetail();
    statusEl.title = detail;
    statusEl.setAttribute("aria-label", detail);
  }

  function mountStatusIndicator() {
    if (statusEl || !document.body) return;
    injectStatusStyles();
    statusEl = document.createElement("button");
    statusEl.type = "button";
    statusEl.className = "backend-status-chip";
    statusEl.innerHTML = '<span class="backend-status-dot" aria-hidden="true"></span><span class="backend-status-label"></span>';
    statusEl.setAttribute("aria-live", "polite");
    statusEl.addEventListener("click", () => {
      if (currentStatus.phase === "browser" || currentStatus.phase === "unavailable") {
        global.showDemoToast?.("正在重新连接本机后端…");
        sync().catch(() => global.showDemoToast?.("仍未连接 · 当前修改仅保存在此浏览器"));
      } else if (currentStatus.phase === "conflict") {
        global.showDemoToast?.("同步冲突 · 为保护修改，系统没有自动覆盖任一端");
      } else if (currentStatus.phase === "ready") {
        global.showDemoToast?.(`本机后端已同步 · 修订 ${Number(currentStatus.revision || 0)}`);
      }
    });

    const mastActions = document.querySelector(".masthead .masthead-inner > div:last-child");
    const nav3dSpacer = document.querySelector(".n3-bar .sp");
    if (mastActions) mastActions.insertBefore(statusEl, mastActions.firstChild);
    else if (nav3dSpacer?.parentElement) nav3dSpacer.parentElement.insertBefore(statusEl, nav3dSpacer);
    else {
      statusEl.classList.add("backend-status-floating");
      document.body.appendChild(statusEl);
    }
    renderStatusIndicator();
  }

  function token() {
    return global.PHARMACO_API_TOKEN || document.body?.dataset?.apiToken || "";
  }

  function backendAutoSyncEnabled() {
    const queryMode = new URLSearchParams(global.location?.search || "").get("backend");
    if (queryMode === "1") return true;
    if (queryMode === "0") return false;
    const configured = global.PHARMACO_BACKEND_ENABLED ?? document.body?.dataset?.backendEnabled;
    return configured === true || configured === "true" || configured === 1 || configured === "1";
  }

  function setStatus(patch) {
    currentStatus = Object.assign({}, currentStatus, patch);
    document.documentElement.dataset.backend = currentStatus.phase;
    renderStatusIndicator();
    global.dispatchEvent(new CustomEvent("pharmaco:backend-status", { detail: Object.assign({}, currentStatus) }));
    return currentStatus;
  }

  function getMeta() {
    try { return JSON.parse(localStorage.getItem(META_KEY) || "{}"); }
    catch { return {}; }
  }

  function setMeta(revision, hash) {
    const next = { workspaceId, revision, hash, syncedAt: new Date().toISOString() };
    localStorage.setItem(META_KEY, JSON.stringify(next));
    return next;
  }

  function localState() {
    try {
      const raw = localStorage.getItem(STATE_KEY);
      if (!raw) return null;
      const state = JSON.parse(raw);
      return state && typeof state === "object" && !Array.isArray(state) ? state : null;
    } catch { return null; }
  }

  async function stateHash(state) {
    if (!state) return null;
    const bytes = new TextEncoder().encode(JSON.stringify(state));
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  async function request(path, options) {
    const headers = Object.assign({ accept: "application/json" }, options?.headers || {});
    if (token()) headers.authorization = `Bearer ${token()}`;
    const response = await fetch(`${apiBase}${path}`, Object.assign({}, options, { headers }));
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(payload?.error?.message || `HTTP ${response.status}`);
      error.status = response.status;
      error.code = payload?.error?.code || "HTTP_ERROR";
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  function health() { return request("/health"); }
  function getRemote() { return request(`/workspaces/${encodeURIComponent(workspaceId)}/state`); }

  async function saveRemote(state, baseRevision) {
    return request(`/workspaces/${encodeURIComponent(workspaceId)}/state`, {
      method: "PUT",
      headers: { "content-type": "application/json", "if-match": `"${baseRevision}"` },
      body: JSON.stringify({ state }),
    });
  }

  function importIntoStore(state) {
    const Store = global.PharmacoPilotStore;
    if (Store?.importState) {
      const result = Store.importState(state);
      if (!result?.ok) throw new Error(result?.error || "Store import failed");
    } else {
      localStorage.setItem(STATE_KEY, JSON.stringify(state));
    }
  }

  async function pull(options = {}) {
    const remote = await getRemote();
    const local = localState();
    const localHash = await stateHash(local);
    if (local && remote.state && localHash !== remote.hash && options.force !== true) {
      const error = new Error("本机与后端状态均有改动，需显式确认后才能覆盖本机状态");
      error.code = "LOCAL_CHANGES";
      throw error;
    }
    if (remote.state) importIntoStore(remote.state);
    setMeta(remote.revision, remote.hash);
    return setStatus({ phase: "ready", revision: remote.revision, error: null, direction: "pull" });
  }

  async function push() {
    const state = localState();
    if (!state) return setStatus({ phase: "ready", error: null, direction: "none" });
    const meta = getMeta();
    try {
      const saved = await saveRemote(state, Number(meta.revision || 0));
      setMeta(saved.revision, saved.hash);
      return setStatus({ phase: "ready", revision: saved.revision, error: null, direction: "push" });
    } catch (error) {
      if (error.code === "REVISION_CONFLICT") {
        setStatus({ phase: "conflict", error: error.message, remote: error.payload?.current || null });
      }
      throw error;
    }
  }

  async function performSync() {
    setStatus({ phase: "connecting", error: null });
    await health();
    const [remote, local] = await Promise.all([getRemote(), Promise.resolve(localState())]);
    const localHash = await stateHash(local);
    const meta = getMeta();

    if (!remote.state) {
      if (!local) {
        setMeta(0, null);
        return setStatus({ phase: "ready", revision: 0, error: null, direction: "empty" });
      }
      const saved = await saveRemote(local, 0);
      setMeta(saved.revision, saved.hash);
      return setStatus({ phase: "ready", revision: saved.revision, error: null, direction: "migrate" });
    }

    if (!local) {
      importIntoStore(remote.state);
      setMeta(remote.revision, remote.hash);
      return setStatus({ phase: "ready", revision: remote.revision, error: null, direction: "pull" });
    }

    if (localHash === remote.hash) {
      setMeta(remote.revision, remote.hash);
      return setStatus({ phase: "ready", revision: remote.revision, error: null, direction: "same" });
    }

    if (meta.workspaceId === workspaceId && meta.hash) {
      if (localHash === meta.hash) {
        importIntoStore(remote.state);
        setMeta(remote.revision, remote.hash);
        return setStatus({ phase: "ready", revision: remote.revision, error: null, direction: "pull" });
      }
      if (remote.hash === meta.hash) {
        const saved = await saveRemote(local, remote.revision);
        setMeta(saved.revision, saved.hash);
        return setStatus({ phase: "ready", revision: saved.revision, error: null, direction: "push" });
      }
    }

    return setStatus({
      phase: "conflict",
      revision: remote.revision,
      error: "本机和后端都有未同步修改，已停止自动覆盖",
      remote,
    });
  }

  function sync() {
    if (syncPromise) return syncPromise;
    syncPromise = performSync()
      .catch((error) => {
        setStatus({ phase: "unavailable", error: error.message || String(error) });
        throw error;
      })
      .finally(() => { syncPromise = null; });
    return syncPromise;
  }

  function schedulePush() {
    if (currentStatus.phase !== "ready") return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      push().catch((error) => console.warn("[backend] auto push failed", error));
    }, 800);
  }

  function bindStore() {
    if (unsubscribe || !global.PharmacoPilotStore?.on) return;
    unsubscribe = global.PharmacoPilotStore.on("*", ({ event }) => {
      if (event !== "store:imported") schedulePush();
    });
  }

  function chat(options) {
    return request("/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(Object.assign({}, options, { stream: false })),
    });
  }

  function generatePracticePack(options) {
    return request("/practice/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(options),
    });
  }

  function reviewPractice(options) {
    return request("/practice/reviews", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(options),
    });
  }

  global.PharmacoBackend = {
    health, sync, push, pull, chat, generatePracticePack, reviewPractice,
    getStatus: () => Object.assign({}, currentStatus),
    workspaceId,
    apiBase,
    autoSyncEnabled: backendAutoSyncEnabled(),
  };

  function boot() {
    mountStatusIndicator();
    bindStore();
    if (backendAutoSyncEnabled()) {
      sync().catch(() => { /* 已显式启用后端，连接失败时降级为 localStorage */ });
    } else {
      setStatus({ phase: "browser", revision: 0, error: null, direction: "local-only" });
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})(window);
