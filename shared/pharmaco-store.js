/* ============================================================
   PharmacoPilot · Store
   ------------------------------------------------------------
   单机版状态总线：localStorage 持久化 + 事件订阅。
   不引入框架；纯原生 JS。所有跨站数据流（议程/判断/产物）
   都走这里，让 9 个教学环节 / 12 子节点从"演示版"升级为"单机可用工具"。

   Public API on window.PharmacoPilotStore：
     · saveJudgment(stationId, key, score, label)
     · getJudgment(stationId)
     · saveArtifact(stationId, artifactId, data)
     · getArtifacts(stationId)
     · setAgendas([{key, text, evidenceSrc?}])
     · getAgendas()
     · markAgendaFulfilled(stationId, agendaKey, evidence)
     · getAgendaFulfillment(stationId)
     · getUncoveredAgendas(stationId)
     · saveAgendaUnfulfillmentNote(agendaKey, reason)   // v4.2
     · getAgendaUnfulfillmentNotes()                    // v4.2
     · getProgress()  // {done, total, active}
     · setActiveStation(id) / getActiveStation()
     · on(event, fn) / emit(event, payload)
     · reset() / dump()

   Events:
     · judgment:saved   {stationId, key, score, label}
     · artifact:saved   {stationId, artifactId}
     · agenda:fulfilled {stationId, agendaKey, evidence}
     · agenda:unfulfillmentNoted {agendaKey, reason}    // v4.2
     · agenda:listChanged
     · progress:changed {done, total, active}
     · active:changed   {id}
     · store:reset
   ============================================================ */
(function attachStore(global) {
  "use strict";

  const KEY = "pharmacoPilot.state.v1";
  const TOTAL_STATIONS = 11;

  function defaultState() {
    return {
      version: "v1",
      activeStation: 5,
      judgments: {},
      artifacts: {},
      agendas: [],
      agendaFulfillment: {},
      // v4.2: 未兑现议程的原因记录（S8 复盘环节使用，配合 station11 五段模板）
      agendaUnfulfillmentNotes: {},  // { [agendaKey]: { reason: string, notedAt: timestamp } }
      // L1 动态学情触发线
      zpdAnchors: [],   // [{ id, t, label, definedAt }]
      pulseRules: {},   // { [anchorId]: { ifCond, thenAct, microFormat, savedAt } }
      // v4: S7 → S2 量规反向修订通道
      rubricRevisions: [],  // [{ id, dim, reason, proposedChange, status: "pending"|"accepted"|"rejected", proposedAt, resolvedAt?, resolutionNote? }]
      // v5: 苏格拉底题链 — 埋点 / 迁移题 / 同意状态
      observationLog: {},          // { [stationId]: { [step]: [{ ts, firstChoice, finalChoice, hintsUsed, dwellMs }] } }
      transferLog: {},             // { [stationId]: [{ ts, text, axis }] }
      consentSampleCollection: { enabled: false, consentedAt: null },
      chainProgress: {},           // { [stationId]: { currentStep: 1-4, q1Done, q2Done, q3Done, q4Done, reflections: {} } }
    };
  }

  let state = defaultState();
  try {
    const raw = global.localStorage && localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // version 不符(未来 schema 变更)时丢弃旧数据用默认态,防止旧嵌套结构顶掉新字段产生诡异状态
      if (parsed && typeof parsed === "object" && parsed.version === defaultState().version) {
        state = Object.assign(defaultState(), parsed);
      } else if (parsed) {
        console.warn("[store] state version mismatch, discarding persisted state:", parsed.version);
      }
    }
  } catch (e) { console.warn("[store] load failed, using default", e); }

  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { console.warn("[store] persist failed", e); }
  }

  const listeners = new Map();
  function on(event, fn) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(fn);
    return () => listeners.get(event) && listeners.get(event).delete(fn);
  }
  function emit(event, payload) {
    const set = listeners.get(event);
    if (set) set.forEach((fn) => { try { fn(payload); } catch (e) { console.warn("[store] listener error", event, e); } });
    const wild = listeners.get("*");
    if (wild) wild.forEach((fn) => { try { fn({ event, payload }); } catch (e) { console.warn(e); } });
  }

  // saveJudgment 兼容两种调用：
  //   · 旧：saveJudgment(stationId, key, score, label)            — 按 stationId 数字键存
  //   · 新：saveJudgment(stationId, key, score, label, subKey)    — 按 subKey 字符串键存（区分 v0/v1、锚点、UbD 段等同 station 不同 pass）
  function saveJudgment(stationId, key, score, label, subKey) {
    const storageKey = subKey != null ? String(subKey) : stationId;
    state.judgments[storageKey] = {
      stationId,
      subKey: subKey != null ? String(subKey) : null,
      key, score, label, savedAt: Date.now(),
    };
    // 仅在无 subKey 且 stationId 为数字时推进 activeStation
    if (subKey == null && typeof stationId === "number" && stationId >= state.activeStation && stationId < TOTAL_STATIONS) {
      state.activeStation = stationId + 1;
    }
    persist();
    emit("judgment:saved", { stationId, subKey: subKey != null ? String(subKey) : null, key, score, label });
    emit("progress:changed", getProgress());
  }
  // 同时支持数字 stationId 和字符串 subKey 查询
  function getJudgment(idOrKey) { return state.judgments[idOrKey] || null; }

  function saveArtifact(stationId, artifactId, data) {
    if (!state.artifacts[stationId]) state.artifacts[stationId] = [];
    state.artifacts[stationId].push({ artifactId, data, savedAt: Date.now() });
    persist();
    emit("artifact:saved", { stationId, artifactId });
  }
  function getArtifacts(stationId) { return state.artifacts[stationId] || []; }

  function setAgendas(agendas) {
    state.agendas = Array.isArray(agendas) ? agendas.slice() : [];
    persist();
    emit("agenda:listChanged", state.agendas);
  }
  function getAgendas() { return state.agendas.slice(); }

  function markAgendaFulfilled(stationId, agendaKey, evidence) {
    if (!state.agendaFulfillment[stationId]) state.agendaFulfillment[stationId] = {};
    state.agendaFulfillment[stationId][agendaKey] = { evidence, at: Date.now() };
    persist();
    emit("agenda:fulfilled", { stationId, agendaKey, evidence });
  }
  function getAgendaFulfillment(stationId) {
    return Object.assign({}, state.agendaFulfillment[stationId] || {});
  }
  function getUncoveredAgendas(stationId) {
    const fulfilled = state.agendaFulfillment[stationId] || {};
    return state.agendas.filter((a) => !fulfilled[a.key]);
  }

  // ── v4.2 · 未兑现议程原因记录（S8 复盘环节使用）────────────────
  function saveAgendaUnfulfillmentNote(agendaKey, reason) {
    if (!agendaKey || !reason) return { ok: false, error: "agendaKey 与 reason 必填" };
    state.agendaUnfulfillmentNotes[agendaKey] = {
      reason: String(reason).trim(),
      notedAt: Date.now(),
    };
    persist();
    emit("agenda:unfulfillmentNoted", { agendaKey, reason });
    return { ok: true };
  }
  function getAgendaUnfulfillmentNotes() {
    return Object.assign({}, state.agendaUnfulfillmentNotes || {});
  }

  function getProgress() {
    return {
      done: Object.keys(state.judgments).length,
      total: TOTAL_STATIONS,
      active: state.activeStation,
    };
  }

  function setActiveStation(id) {
    state.activeStation = id;
    persist();
    emit("active:changed", { id });
  }
  function getActiveStation() { return state.activeStation; }

  function reset() {
    state = defaultState();
    persist();
    emit("store:reset", {});
    emit("progress:changed", getProgress());
  }

  // ── L1 · 动态学情触发线 ─────────────────────────────────────────
  function setZpdAnchors(anchors) {
    state.zpdAnchors = (Array.isArray(anchors) ? anchors : []).map((a) => ({
      id: a.id, t: a.t, label: a.label, definedAt: Date.now(),
    }));
    persist();
    emit("zpd:anchorsChanged", state.zpdAnchors.slice());
  }
  function getZpdAnchors() { return state.zpdAnchors.slice(); }

  function setPulseRule(anchorId, rule) {
    state.pulseRules[anchorId] = Object.assign({}, rule, { savedAt: Date.now() });
    persist();
    emit("pulse:ruleSaved", { anchorId, rule: state.pulseRules[anchorId] });
  }
  function getPulseRule(anchorId) { return state.pulseRules[anchorId] || null; }
  function getAllPulseRules() { return Object.assign({}, state.pulseRules); }

  // ── v4 · S7 → S2 量规反向修订通道 ───────────────────────────
  function proposeRubricRevision({ dim, reason, proposedChange, evidenceArtifactId }) {
    if (!dim || !reason) return { ok: false, error: "dim 和 reason 必填" };
    const rev = {
      id: "rr-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
      dim, reason, proposedChange: proposedChange || "",
      evidenceArtifactId: evidenceArtifactId || null,
      status: "pending",
      proposedAt: Date.now(),
    };
    state.rubricRevisions.push(rev);
    persist();
    emit("rubric:revisionProposed", rev);
    return { ok: true, revision: rev };
  }
  function resolveRubricRevision(id, decision, note) {
    const rev = state.rubricRevisions.find((r) => r.id === id);
    if (!rev) return { ok: false, error: "not found" };
    if (decision !== "accepted" && decision !== "rejected") return { ok: false, error: "decision 须为 accepted | rejected" };
    rev.status = decision;
    rev.resolvedAt = Date.now();
    if (note) rev.resolutionNote = note;
    persist();
    emit("rubric:revisionResolved", rev);
    return { ok: true, revision: rev };
  }
  function getRubricRevisions(filter) {
    if (!filter) return state.rubricRevisions.slice();
    return state.rubricRevisions.filter((r) => r.status === filter);
  }

  // ── v5 · 苏格拉底题链：埋点 / 迁移 / 同意 ─────────────────────────
  function getConsent() {
    return Object.assign({ enabled: false, consentedAt: null }, state.consentSampleCollection || {});
  }
  function setConsent(enabled) {
    state.consentSampleCollection = {
      enabled: !!enabled,
      consentedAt: enabled ? new Date().toISOString() : null,
    };
    persist();
    emit("consent:changed", state.consentSampleCollection);
  }

  // logObservation 永远本地写入；上传/聚合层由 sample-collection.js 决定
  function logObservation(stationId, step, payload) {
    if (!state.observationLog[stationId]) state.observationLog[stationId] = {};
    if (!state.observationLog[stationId][step]) state.observationLog[stationId][step] = [];
    state.observationLog[stationId][step].push(Object.assign({ ts: Date.now() }, payload || {}));
    persist();
    emit("observation:logged", { stationId, step, payload });
  }
  function getObservations(stationId, step) {
    const byStation = state.observationLog[stationId] || {};
    if (step == null) return Object.assign({}, byStation);
    return (byStation[step] || []).slice();
  }

  function saveTransfer(stationId, text, axis) {
    if (!text || typeof text !== "string") return { ok: false, error: "text required" };
    if (!state.transferLog[stationId]) state.transferLog[stationId] = [];
    const entry = { ts: Date.now(), text: text.trim(), axis: axis || null };
    state.transferLog[stationId].push(entry);
    persist();
    emit("transfer:saved", { stationId, entry });
    return { ok: true, entry };
  }
  function getTransfer(stationId) {
    return (state.transferLog[stationId] || []).slice();
  }
  // v6.2: 重置题链——清空指定 station 的判断/反思/迁移/埋点/进度,让教师可以重答
  function resetChainProgress(stationId) {
    if (!stationId) return { ok: false, error: "stationId required" };
    // 清 chainProgress
    delete state.chainProgress[stationId];
    // 清 transferLog
    delete state.transferLog[stationId];
    // 清 observationLog
    delete state.observationLog[stationId];
    // 清按数字键 + 可能的 subKey 复合键判断
    delete state.judgments[stationId];
    delete state.judgments[String(stationId)];
    // 清同 station 下所有复合键(如 "2-3"/"1b"等)
    Object.keys(state.judgments).forEach((k) => {
      const j = state.judgments[k];
      if (j && j.stationId === stationId) delete state.judgments[k];
    });
    persist();
    emit("chain:reset", { stationId });
    emit("progress:changed", getProgress());
    return { ok: true };
  }

  // v6: 跳过迁移题——记录跳过状态以让产物可解锁（保留"未答完整题链"标记供 S8 复盘画像)
  function skipTransfer(stationId) {
    if (!state.transferLog[stationId]) state.transferLog[stationId] = [];
    const entry = { ts: Date.now(), skipped: true, text: "", axis: null };
    state.transferLog[stationId].push(entry);
    persist();
    emit("transfer:saved", { stationId, entry, skipped: true });
    return { ok: true, entry };
  }
  function getAllTransfers() {
    return JSON.parse(JSON.stringify(state.transferLog || {}));
  }

  // 题链进度跟踪（独立于 judgments；judgments 仍由 Q3 决策保存触发）
  function setChainStep(stationId, step, fields) {
    if (!state.chainProgress[stationId]) {
      state.chainProgress[stationId] = { currentStep: 1, reflections: {} };
    }
    const cp = state.chainProgress[stationId];
    cp.currentStep = Math.max(cp.currentStep || 1, step);
    Object.assign(cp, fields || {});
    persist();
    emit("chain:stepChanged", { stationId, step, fields });
  }
  function getChainProgress(stationId) {
    return Object.assign({ currentStep: 1, reflections: {} }, state.chainProgress[stationId] || {});
  }
  function saveChainReflection(stationId, field, text) {
    if (!state.chainProgress[stationId]) {
      state.chainProgress[stationId] = { currentStep: 1, reflections: {} };
    }
    state.chainProgress[stationId].reflections[field] = { text: String(text || "").trim(), ts: Date.now() };
    persist();
    emit("chain:reflectionSaved", { stationId, field, text });
  }

  function dump() { return JSON.parse(JSON.stringify(state)); }

  function importState(incoming) {
    if (!incoming || typeof incoming !== "object") return { ok: false, error: "invalid payload" };
    if (incoming.version && incoming.version !== state.version) {
      console.warn("[store] importing different version", incoming.version, "→", state.version);
    }
    state = Object.assign(defaultState(), incoming);
    persist();
    emit("store:imported", { judgments: Object.keys(state.judgments).length });
    emit("progress:changed", getProgress());
    return { ok: true };
  }

  global.PharmacoPilotStore = {
    on, emit,
    saveJudgment, getJudgment,
    saveArtifact, getArtifacts,
    setAgendas, getAgendas,
    markAgendaFulfilled, getAgendaFulfillment, getUncoveredAgendas,
    saveAgendaUnfulfillmentNote, getAgendaUnfulfillmentNotes,
    setZpdAnchors, getZpdAnchors,
    setPulseRule, getPulseRule, getAllPulseRules,
    proposeRubricRevision, resolveRubricRevision, getRubricRevisions,
    // v5 苏格拉底题链
    getConsent, setConsent,
    logObservation, getObservations,
    saveTransfer, skipTransfer, getTransfer, getAllTransfers,
    resetChainProgress,
    setChainStep, getChainProgress, saveChainReflection,
    getProgress, setActiveStation, getActiveStation,
    reset, dump, importState,
  };
})(window);
