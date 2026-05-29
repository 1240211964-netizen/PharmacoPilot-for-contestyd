/* ============================================================
   PharmacoPilot · live-stats — gives static "17 教师 LIVE" / timer
   counters a soft drift / tick so the page feels alive without
   pretending to be real telemetry.

   Markup contract:
     <span data-live="teachers" data-baseline="17">17</span>
     <span data-live="timer"  data-start="132" data-cap="2700">02:12</span>
     <span data-live="ticker" data-min="300" data-max="320">312</span>
   ============================================================ */
(function () {
  "use strict";

  function pad(n) { return String(n).padStart(2, "0"); }
  function fmt(s) { return pad(Math.floor(s / 60)) + ":" + pad(s % 60); }

  function tickTeachers() {
    // Legacy random-drift fallback — only runs if peer-channel didn't init.
    document.querySelectorAll('[data-live="teachers"]').forEach((el) => {
      const baseline = Number(el.dataset.baseline || 1);
      el.textContent = String(baseline);
    });
  }

  function tickGenericTicker() {
    document.querySelectorAll('[data-live="ticker"]').forEach((el) => {
      const min = Number(el.dataset.min || 0);
      const max = Number(el.dataset.max || 999);
      const cur = Number(el.textContent) || min;
      let next = cur + (Math.random() < 0.55 ? 1 : 0);
      if (next > max) next = min + Math.floor((max - min) / 2);
      el.textContent = String(next);
    });
  }

  function bootTimers() {
    document.querySelectorAll('[data-live="timer"]').forEach((el) => {
      const start = Number(el.dataset.start || 0);
      const cap = Number(el.dataset.cap || Infinity);
      let t = start;
      el.textContent = fmt(t);
      setInterval(() => {
        t = Math.min(t + 1, cap);
        el.textContent = fmt(t);
      }, 1000);
    });
  }

  // ---- Honest LIVE count via BroadcastChannel ----
  // Counts open tabs of this site within the same browser. Each tab pings
  // every few seconds; stale peers are pruned. Cross-user "真 LIVE" needs a
  // backend — for now this gives an honest single-browser tab count.
  function bootLivePeers() {
    if (typeof BroadcastChannel === "undefined") return false;
    const ch = new BroadcastChannel("pp-live-teachers");
    const myId = Math.random().toString(36).slice(2) + "-" + Date.now();
    const peers = new Map();
    peers.set(myId, Date.now());

    const STALE_MS = 8000;
    const PING_MS = 2800;

    function render(n) {
      document.querySelectorAll('[data-live="teachers"]').forEach((el) => {
        if (el.textContent !== String(n)) {
          el.textContent = String(n);
          el.style.transition = "opacity .35s";
          el.style.opacity = "0.5";
          setTimeout(() => { el.style.opacity = "1"; }, 120);
        }
      });
    }
    function recount() {
      const cutoff = Date.now() - STALE_MS;
      for (const [id, t] of peers) {
        if (id !== myId && t < cutoff) peers.delete(id);
      }
      render(peers.size);
    }
    function announce(kind) {
      ch.postMessage({ kind: kind || "hi", id: myId, t: Date.now() });
    }
    ch.onmessage = (e) => {
      const d = e.data || {};
      if (!d.id || d.id === myId) return;
      if (d.kind === "bye") { peers.delete(d.id); recount(); return; }
      peers.set(d.id, d.t || Date.now());
      if (d.kind === "hi") announce("ack");
      recount();
    };

    announce("hi");
    setInterval(() => {
      peers.set(myId, Date.now());
      announce("ping");
      recount();
    }, PING_MS);

    window.addEventListener("beforeunload", () => announce("bye"));
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) announce("ping");
    });

    render(1);
    return true;
  }

  function boot() {
    bootTimers();
    const livePeers = bootLivePeers();
    if (!livePeers) {
      // BroadcastChannel unavailable: render baseline once.
      tickTeachers();
    }
    setInterval(tickGenericTicker, 6800);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
