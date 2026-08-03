/* ============================================================
 *  课程级 enrichmentPlan + 情境激活 · enrich-activation.js
 *  （persona-v2-contract §2.1 / §7 · P3）
 *
 *  §7.1 情境熟悉度：查表纯计算（每课计算、不入库）；
 *  §7.2 激活方向：熟悉度 × F5 身份调制 → 强度，sensitive 事件 → 负向；
 *  §2.1 enrichmentPlan：课程加载时生成、课结束丢弃、绝不回写 persona 永久记录。
 *
 *  暴露：window.EnrichActivation（Node 测试经 globalThis 挂取）
 *
 *  P3 说明：practice-detail.html 由并行会话冻结、暂不能加 <script>，
 *  故两引擎各内嵌一份副本（照 SIM-RNG P0 / SCHED-DERIVE P1 先例）；
 *  副本与本文件 ENRICH-ACTIVATION 标记区逐字节一致
 *  （tools/verify-sched-single-source.mjs 校验），
 *  页面解禁后改回 <script src="./shared/enrich-activation.js"> 单源引用。
 * ============================================================ */
(function attachEnrichActivation(global) {
  "use strict";

  /* ==== ENRICH-ACTIVATION-BEGIN · 引擎内嵌副本须与本区逐字节一致 ==== */
  // 本区为纯函数：不读引擎状态、不调 rng、无 DOM——同输入同输出。
  // tables = { proximity: _meta.role_proximity_table.proximity, transferability: _meta.transferability_table.by_type }

  // FNV-1a 32bit（§2.1 explorationBonus 用；与 SIM-RNG 同算法但独立命名，防标记区耦合）
  function __enrichFnv1a32(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  }
  function __jaccardTags(a, b) {
    const sa = {}, sb = {};
    (a || []).forEach((t) => { sa[t] = 1; });
    (b || []).forEach((t) => { sb[t] = 1; });
    let inter = 0, union = 0;
    Object.keys(sa).forEach((t) => { union += 1; if (sb[t]) inter += 1; });
    Object.keys(sb).forEach((t) => { if (!sa[t]) union += 1; });
    return union === 0 ? 0 : inter / union;
  }

  // §7.1 情境熟悉度：max over historyEvents of Jaccard(tags) × depth × recency × roleProximity × transferability
  // 返回 {value, event}：event 为取得最大值的事件（§7.2 sensitive 方向判定用）；无命中 value=0/event=null
  function scenarioFamiliarity(student, lesson, tables) {
    const best = { value: 0, event: null };
    if (!student || !lesson || !tables) return best;
    const proximity = tables.proximity || {};
    const transfer = tables.transferability || {};
    (student.historyEvents || []).forEach((e) => {
      const row = proximity[e.role] || {};
      let prox = 0; // 缺列兜底弱相关档 0.1（§7.1 锚定无关≈0.1–0.15）
      (lesson.requiredRole || []).forEach((r) => {
        const v = row[r] != null ? row[r] : 0.1;
        if (v > prox) prox = v;
      });
      const tr = transfer[e.type] != null ? transfer[e.type] : 0;
      const v = __jaccardTags(e.tags, lesson.tags) * (e.depth || 0) * (e.recency || 0) * prox * tr;
      if (v > best.value) { best.value = v; best.event = e; }
    });
    return best;
  }

  // 画像因子有效值：approved:true 的 §6.2 校准 delta 生效（限幅由 persona-map-v1 管线把守），未批准不动
  function personaFactorValue(agent, k) {
    const f = agent && agent.latentFactors && agent.latentFactors[k];
    if (!f || typeof f.value !== "number") return null;
    const adj = f.adjustment;
    const d = adj && adj.approved === true && typeof adj.delta === "number" ? adj.delta : 0;
    return Math.min(1, Math.max(0, f.value + d));
  }

  // §7.2 激活（方向判定，可正可负）：
  //   熟悉度 ─▶ 身份相关性（F5 调制 identity ∈ [0.5,1]）─▶ 情绪显著性（sensitive:true → 负向）─▶ 行为方向
  //   判例（契约 §7.2）：家庭成员慢病经历学生在患者负担议题 familiarity 高，但 sensitive 使方向为负——更沉默而非更积极。
  function activationOf(student, lesson, tables) {
    const fam = scenarioFamiliarity(student, lesson, tables);
    const f5 = personaFactorValue(student, "F5");
    const identity = 0.5 + 0.5 * (f5 == null ? 0.5 : f5);
    const sensitive = !!(fam.event && fam.event.sensitive);
    const magnitude = fam.value * identity;
    const direction = magnitude > 0 ? (sensitive ? -1 : 1) : 0;
    return { familiarity: fam.value, eventId: fam.event ? fam.event.id : null, identity: identity, sensitive: sensitive, magnitude: magnitude, direction: direction };
  }

  // L1 生效值调制（只调运行时初始化层，不写回 state_init）：
  //   正向 speak_motivation↑ + evidence 语料键优先（evidenceBias=true 供 pickRespKey 消费）；
  //   负向 silent 倾向↑（sm 减分；"仅小组内"语义由 silent_on 规则侧承载，不在本函数内分支）。
  var ACTIVATION_SM_GAIN = 0.2;
  function applyActivationToL1(baseSpeakMotivation, act) {
    let sm = baseSpeakMotivation;
    if (act && act.direction !== 0) sm = baseSpeakMotivation + act.direction * ACTIVATION_SM_GAIN * act.magnitude;
    return { speak_motivation: Math.min(1, Math.max(0, sm)), evidenceBias: !!(act && act.direction > 0) };
  }

  // §2.1 课程级临时资源计划（enrichmentPlan）：
  //   课程加载时生成 → 本课使用 → 课结束丢弃；不得写回 persona 永久记录（verify 硬门禁）。
  //   优先级公式六项（speakProbability 不得为主要权重——公式不含 sm 主项，sm 仅以"不确定性"形式反向进入）：
  //     scenarioActivation      §7 情境激活程度（熟悉度）
  //     personaUncertainty      参数不确定性：sm 越居中行为越难预判，越值得深建模
  //     coverageGap             班级覆盖缺口：该生最佳匹配背景类型在已激活班级中的稀缺度
  //     interventionSensitivity 干预敏感性（教学诊断价值）：有沉默因果 / 敏感经历者优先
  //     counterfactualValue     反事实价值：立场易动者在不同干预下分叉潜力更大
  //     explorationBonus        探索奖励：确定性哈希，防稳定偏向高动机学生
  //   系数依据见画像 _meta.persona_map_notes.enrichment。
  var ENRICH_WEIGHTS = { scenarioActivation: 0.3, personaUncertainty: 0.15, coverageGap: 0.15, interventionSensitivity: 0.2, counterfactualValue: 0.1, explorationBonus: 0.1 };
  var ENRICH_TOP_N = 8;
  var ENRICH_DEEP = { conceptModel: "deep", responseInventory: 6, misconceptionModel: true, learningTraceDepth: 2, interventionBranches: 3, counterfactualResponses: true };
  var ENRICH_LIGHT = { conceptModel: "light", responseInventory: 3, misconceptionModel: false, learningTraceDepth: 0, interventionBranches: 1, counterfactualResponses: false };
  function computeEnrichmentPlan(agentsData, lesson, tables) {
    const agents = (agentsData && agentsData.agents) || [];
    if (!lesson || !agents.length) return null;
    const best = agents.map((a) => ({ a: a, fam: scenarioFamiliarity(a, lesson, tables) }));
    const activated = best.filter((x) => x.fam.value > 0);
    const typeCount = {};
    activated.forEach((x) => {
      const t = x.fam.event && x.fam.event.type;
      typeCount[t] = (typeCount[t] || 0) + 1;
    });
    const rows = best.map((x) => {
      const a = x.a, fam = x.fam;
      const sm = (a.state_init && a.state_init.speak_motivation != null) ? a.state_init.speak_motivation : 0.3;
      const str = (a.persona && typeof a.persona.stance_strength === "number") ? a.persona.stance_strength : 3;
      const parts = {
        scenarioActivation: fam.value,
        personaUncertainty: 1 - Math.abs(2 * sm - 1),
        coverageGap: fam.value > 0 ? 1 - (typeCount[(fam.event && fam.event.type)] || 1) / Math.max(1, activated.length) : 0,
        interventionSensitivity: 0.5 * (((a.silenceCauses || []).length > 0) ? 1 : 0) + 0.5 * ((fam.event && fam.event.sensitive) ? 1 : 0),
        counterfactualValue: (5 - Math.min(5, Math.max(1, str))) / 4,
        explorationBonus: __enrichFnv1a32(String(lesson.lessonId) + "|" + a.id) / 4294967296,
      };
      let total = 0;
      Object.keys(ENRICH_WEIGHTS).forEach((k) => { total += ENRICH_WEIGHTS[k] * parts[k]; });
      return { id: a.id, total: Math.round(total * 10000) / 10000, parts: parts };
    });
    rows.sort((x, y) => (y.total - x.total) || (x.id < y.id ? -1 : 1));
    const top8 = rows.slice(0, ENRICH_TOP_N).map((r) => r.id);
    const students = {};
    rows.forEach((r) => {
      const deep = top8.indexOf(r.id) >= 0;
      students[r.id] = Object.assign({}, deep ? ENRICH_DEEP : ENRICH_LIGHT, { priority: r.total, priorityParts: r.parts });
    });
    return { lessonId: lesson.lessonId, lifecycle: "lesson-load（课程加载时生成 · 课结束丢弃 · 不回写 persona）", top8: top8, students: students };
  }
  /* ==== ENRICH-ACTIVATION-END ==== */

  global.EnrichActivation = {
    scenarioFamiliarity, personaFactorValue, activationOf, applyActivationToL1,
    computeEnrichmentPlan, ENRICH_WEIGHTS, ENRICH_DEEP, ENRICH_LIGHT, ENRICH_TOP_N, ACTIVATION_SM_GAIN,
  };
})(typeof window !== "undefined" ? window : globalThis);
