/* ============================================================
 *  确定性随机 · sim-rng.js  (persona-v2-contract §9 · P0)
 *  mulberry32 PRNG + FNV-1a 32bit 种子派生：
 *    seed = fnv1a(simVersion | personaSetVersion | lessonId | scenarioId | runSeed)
 *  同一组输入可复放；改课程、画像版本或显式 runSeed，结果自然改变。
 *
 *  暴露：window.SimRNG（Node 测试经 globalThis 挂取）
 *
 *  P0 说明：practice-detail.html 由并行会话冻结、暂不能加 <script>，
 *  故 mv-classroom-core.js / practice-runtime.js 各内嵌一份副本；
 *  副本与本文件 SIM-RNG 标记区逐字节一致（verify-agent-persona 校验），
 *  页面解禁后改回 <script src="./shared/sim-rng.js"> 单源引用。
 * ============================================================ */
(function attachSimRng(global) {
  "use strict";

  /* ==== SIM-RNG-BEGIN · 引擎内嵌副本须与本区逐字节一致 ==== */
  // FNV-1a 32bit：seed 字符串 → 32 位无符号整数
  function fnv1a32(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  }
  // mulberry32：32 位种子 PRNG，输出 [0,1)，无依赖、可复现
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function next() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // seed 串 = simVersion | personaSetVersion | lessonId | scenarioId | runSeed
  function seedStringOf(cfg) {
    return [cfg.simVersion, cfg.personaSetVersion, cfg.lessonId, cfg.scenarioId, cfg.runSeed].join("|");
  }
  function createSeededRng(cfg) {
    return mulberry32(fnv1a32(seedStringOf(cfg)));
  }
  /* ==== SIM-RNG-END ==== */

  /* 默认 seed 配置：与现行 SWOT 章节（mp-ch3-environment · 华康连锁慢病服务）一致。
     画像 _meta.simVersion / _meta.version 加载后由引擎 reseed 自动跟随前两项；
     runSeed 供显式复放/分叉使用。 */
  const DEFAULT_SEED_CONFIG = Object.freeze({
    simVersion: "sim-1.0.0",
    personaSetVersion: "virtual-class-agents-v0.2",
    lessonId: "mp-ch3-environment",
    scenarioId: "swot-huakang-chronic",
    runSeed: "run-0",
  });

  global.SimRNG = { fnv1a32, mulberry32, seedStringOf, createSeededRng, DEFAULT_SEED_CONFIG };
})(typeof window !== "undefined" ? window : globalThis);
