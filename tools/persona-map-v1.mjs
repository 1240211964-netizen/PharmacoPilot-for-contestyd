#!/usr/bin/env node
/**
 * persona-map-v1：虚拟班画像 V2 派生管线（persona-v2-contract §6 / §14 P2）
 *
 *   historyEvents + silenceCauses ──R1──▶ F1–F7 潜在因子（∈[0,1]，逐因子带 derivedFrom）
 *   F1–F7 × v0.3 旧参数锚       ──R2──▶ state_init 五字段 + fatigue_rate + ally/rebut_threshold
 *
 * 纪律：
 * - 纯确定性：同输入同输出；无随机、无 LLM。LLM 校准只允许另出建议文件（adjustment.approved=false 一律不生效）；
 *   approved:true 的单点校准由 applyApprovedAdjustments 以 delta 叠加为有效值（限幅 ±0.08，§6.2），
 *   参与 R2 派生与班级指标；latentFactors.value 始终存 base，故写回可幂等重跑。
 * - A/B/C/D 字母归属只从 migration/persona-v1-legacy-map.json 读取，用于 R2 锚定时的旧引擎先验折算
 *   （契约 §0-11 允许的迁移对照用途）；字母归属不写回任何运行数据、不参与派生后的学生记录。
 * - 用法：
 *     node tools/persona-map-v1.mjs          应用 R1+R2，写回 shared/virtual-class-agents.json
 *     node tools/persona-map-v1.mjs --check  只计算并打印报告（分布/残差/微簇/相关），不写文件
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const JSON_PATH = path.join(ROOT, 'shared/virtual-class-agents.json');
const LEGACY_PATH = path.join(ROOT, 'migration/persona-v1-legacy-map.json');
const BACKUP_PATH = path.join(ROOT, 'migration/persona-v0_3-state-init-backup.json');
const CHECK_ONLY = process.argv.includes('--check');

// ---------------------------------------------------------------------------
// R1 常量（受控词表子集；同一对象经 _meta.persona_map_notes 落盘，verify 以落盘值为准）
// ---------------------------------------------------------------------------
/** 证据导向 tags：命中任一即计该事件为"证据型事件"（F3 加分） */
const EVIDENCE_TAGS = [
  'policy_document_reading', 'data_evidence_use', 'medical_insurance_audit', 'fund_payment_review',
  'clinical_monitoring', 'gmp_production', 'quality_control', 'market_research',
  'regulatory_inspection', 'clinical_trial_gcp', 'drg_payment', 'anticoagulation_management',
  'narrow_therapeutic_window', 'centralized_procurement', 'consistency_evaluation',
];
/** 证据导向角色（F3 加分；商保精算与支付方/监管/医院同列） */
const EVIDENCE_ROLES = ['payer_intern', 'regulatory_intern', 'hospital_trainee', 'commercial_insurance_intern'];
/** 隐藏型沉默因果（F4 额外减分 / F7 减分） */
const HIDE_CAUSES = ['fear_of_labeling', 'conflict_of_interest_concealment', 'self_censorship_pro_industry_image'];
/** 被动型沉默因果（F2 减分：等点名 / 点名附议 / 低效能 / 知识缺口怕反驳） */
const PASSIVE_CAUSES = ['waits_for_teacher_nomination', 'nomination_dependent_agreement_style', 'low_self_efficacy_uncertain_contribution_value', 'knowledge_gap_fear_of_rebuttal'];
/** 被动型表达 tags（F2 减分：读稿 / 附议） */
const PASSIVE_TAGS = ['agreement_style_expression', 'readaloud_expression_preference'];
/** 从众信号 tags（F6 减分） */
const CONFORM_TAGS = ['peer_influence', 'agreement_style_expression', 'readaloud_expression_preference'];
/** 高归属角色（F5 加分） */
const ATTACH_ROLES = ['family_caregiver', 'family_business_participant'];
/** 反思/调节型 tags（F7 加分） */
const REFLECT_TAGS = ['clarify_before_stance', 'contextual_supplement_preference', 'practical_operations', 'policy_document_reading'];

// ---------------------------------------------------------------------------
// R2 常量
// ---------------------------------------------------------------------------
/** 旧引擎字母先验（已随 P2 移除）折算为 speak_motivation 有效锚的调整量：A/B 曾享首发 +0.18（一次性，折算 0.09）；C/D 曾每 beat −0.5/−0.65 */
const PRIOR_ADJ = { A: 0.09, B: 0.09, C: -0.5, D: -0.65 };
/** stance_position 三侧受控 tags：归属按 (事件类型 × tags) 组合，同一 tag 在 family_livelihood 与 industry_experience 中立场方向不同（家庭语境=患者/照护亲历，行业语境=系统/产业视角） */
const PAYER_TAGS = [
  'medical_insurance_audit', 'drg_payment', 'fund_payment_review', 'centralized_procurement',
  'consistency_evaluation', 'commercial_health_insurance', 'payer_perspective',
  'outpatient_pooling_policy', 'public_budget_sensitivity',
];
const PHARMA_TAGS = [
  'pharma_marketing', 'originator_drug_industry', 'pharma_r_and_d', 'clinical_trial_gcp',
  'cro_operations', 'patent_cliff', 'gmp_production', 'pharmaceutical_manufacturing',
  'quality_control', 'generic_drug_industry', 'market_access', 'api_manufacturing',
  'business_development', 'drug_regulation', 'regulatory_perspective', 'regulatory_inspection', 'pharma_industry',
];
/** industry/career/role_social 事件中的"系统/产业侧"信号（支付方、药企、药店零售经营侧） */
const SYS_TAGS = [
  ...PAYER_TAGS, ...PHARMA_TAGS,
  'pharmacy_chain_retail', 'member_operations', 'market_research',
];
/** family 事件中的"产业/监管背景"信号（家人从业 → 产业立场接触面） */
const FAM_INDUSTRY_TAGS = [
  'pharma_marketing', 'pharma_r_and_d', 'drug_regulation', 'api_manufacturing', 'family_business',
  'originator_drug_industry', 'generic_drug_industry', 'business_development', 'clinical_trial_gcp',
];
/** 患者/照护/临床侧信号：具体病种、照护行为、临床与社区患者接触面（chronic_disease_service 为中性服务场景 tag，不入列） */
const CARE_TAGS = [
  'patient_companion_care', 'diabetes_care', 'anticoagulation_management', 'hypertension_management',
  'cardiology_antiplatelet', 'parkinsons_care', 'oncology_endocrine_therapy', 'nephrology_monitoring',
  'polypharmacy_elderly', 'medication_adherence', 'elderly_care_service', 'readmission_experience',
  'primary_care', 'community_pharmacy', 'hospital_pharmacy', 'hospital_service_process',
  'county_hospital', 'patient_price_sensitivity', 'clinical_monitoring', 'narrow_therapeutic_window',
];

const FACTOR_IDS = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7'];
const FACTOR_NAMES = {
  F1: '学业自我效能', F2: '掌握—表现动机', F3: '认识论习惯(1=证据型)', F4: '表达与社会安全',
  F5: '归属与身份', F6: '自主与从众(1=自主)', F7: '认知调节',
};

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const round4 = (x) => Math.round(x * 10000) / 10000;
const round6 = (x) => Math.round(x * 1000000) / 1000000;

// §6.2 批准校准限幅（单点 delta 绝对值上限；超出即拒绝生效）
const ADJUST_LIMIT = 0.08;

// 把 agents JSON 中 approved:true 的 adjustment 应用为 factorsById 的有效值：
// value 改为 round4(clamp01(base + delta))，原值存 baseValue（写回时恢复，保幂等）；
// approved:false / 缺省一律不生效。R2 派生与 computeMetrics 班级指标均消费有效值。
function applyApprovedAdjustments(agents, factorsById) {
  const applied = [];
  for (const a of agents) {
    for (const k of FACTOR_IDS) {
      const adj = a.latentFactors && a.latentFactors[k] && a.latentFactors[k].adjustment;
      if (!adj || adj.approved !== true) continue;
      const delta = Number(adj.delta);
      if (!Number.isFinite(delta) || Math.abs(delta) > ADJUST_LIMIT) {
        throw new Error(`${a.id}.${k} adjustment.delta=${adj.delta} 越出限幅 ±${ADJUST_LIMIT}（§6.2）`);
      }
      const f = factorsById[a.id][k];
      const base = f.baseValue != null ? f.baseValue : f.value;
      f.baseValue = base;
      f.value = round4(clamp01(base + delta));
      applied.push({ id: a.id, factor: k, base, delta, effective: f.value, approvedBy: adj.approvedBy || null, approvedDate: adj.approvedDate || null });
    }
  }
  return applied;
}

// ---------------------------------------------------------------------------
// R1：historyEvents + silenceCauses → F1–F7（每因子 value + derivedFrom）
// ---------------------------------------------------------------------------
function deriveFactors(agent) {
  const ev = agent.historyEvents || [];
  const causes = agent.silenceCauses || [];
  const allTags = new Set(ev.flatMap((e) => e.tags || []));
  const acad = ev.filter((e) => e.type === 'academic_track');
  const ind = ev.filter((e) => e.type === 'industry_experience');
  const fam = ev.filter((e) => e.type === 'family_livelihood');
  const soc = ev.filter((e) => e.type === 'role_social');
  const car = ev.filter((e) => e.type === 'career_contact');
  const confCount = (agent.knowledge?.confident || []).length;
  const stanceStrength = agent.persona?.stance_strength ?? 3;
  const has = (c) => causes.includes(c);
  const hasTag = (t) => allTags.has(t);

  const out = {};
  // derivedFrom 不得为空（§1.2-②）：无事件/因果贡献时记录 base 出处（规则默认值）
  const mk = (value, derivedFrom) => ({ value: round4(clamp01(value)), derivedFrom: derivedFrom.length ? derivedFrom : ['base(规则默认值，无事件贡献)'] });

  { // F1 学业自我效能：学业深度 + 行业经历 − 认知超载/先备缺口/怕错 + 自信知识条数
    const from = [];
    let v = 0.5;
    const acadDepth = acad.reduce((s, e) => s + (e.depth || 0), 0);
    if (acadDepth > 0) { v += Math.min(0.08 * acadDepth, 0.24); from.push(...acad.map((e) => e.id)); }
    const indN = Math.min(ind.length, 2);
    if (indN > 0) { v += 0.05 * indN; from.push(...ind.slice(0, 2).map((e) => e.id)); }
    if (has('cognitive_overload_and_prerequisite_gap')) { v -= 0.25; from.push('cause:cognitive_overload_and_prerequisite_gap'); }
    if (hasTag('prerequisite_knowledge_gap')) { v -= 0.12; from.push('tag:prerequisite_knowledge_gap'); }
    if (hasTag('fear_of_mistake')) { v -= 0.08; from.push('tag:fear_of_mistake'); }
    if (hasTag('mandarin_expression_barrier')) { v -= 0.10; from.push('tag:mandarin_expression_barrier'); }
    const confN = Math.min(confCount, 4);
    if (confN > 0) { v += 0.03 * confN; from.push(`knowledge.confident×${confN}`); }
    out.F1 = mk(v, from);
  }
  { // F2 掌握—表现动机：社会角色 + 深度学业 + 职业接触/活动型/小组代表 − 被动沉默因果/被动表达 tags
    const from = [];
    let v = 0.5;
    if (soc.length > 0) { v += 0.05 * soc.length; from.push(...soc.map((e) => e.id)); }
    const deepAcad = acad.filter((e) => (e.depth || 0) >= 0.5);
    if (deepAcad.length > 0) { v += 0.06 * deepAcad.length; from.push(...deepAcad.map((e) => e.id)); }
    if (car.length > 0) { v += 0.06 * car.length; from.push(...car.map((e) => e.id)); }
    if (hasTag('activity_style_learner')) { v += 0.05; from.push('tag:activity_style_learner'); }
    if (ev.some((e) => e.role === 'group_delegate')) { v += 0.05; from.push('role:group_delegate'); }
    const passiveC = causes.filter((c) => PASSIVE_CAUSES.includes(c));
    if (passiveC.length > 0) { v -= 0.10 * passiveC.length; from.push(...passiveC.map((c) => `cause:${c}`)); }
    const passiveT = [...allTags].filter((t) => PASSIVE_TAGS.includes(t));
    if (passiveT.length > 0) { v -= 0.05 * passiveT.length; from.push(...passiveT.map((t) => `tag:${t}`)); }
    out.F2 = mk(v, from);
  }
  { // F3 认识论习惯（1=证据型）：证据 tags/角色 − 敏感家庭事件/陪护角色
    const from = [];
    let v = 0.5;
    const evTagEvents = ev.filter((e) => (e.tags || []).some((t) => EVIDENCE_TAGS.includes(t)));
    if (evTagEvents.length > 0) { v += 0.06 * evTagEvents.length; from.push(...evTagEvents.map((e) => e.id)); }
    const evTagHits = ev.reduce((s, e) => s + (e.tags || []).filter((t) => EVIDENCE_TAGS.includes(t)).length, 0);
    if (evTagHits > 0) { v += 0.02 * evTagHits; from.push(`evidence_tag_hits×${evTagHits}`); }
    const evRoleEvents = ev.filter((e) => EVIDENCE_ROLES.includes(e.role));
    if (evRoleEvents.length > 0) { v += 0.05 * evRoleEvents.length; from.push(...evRoleEvents.map((e) => e.id)); }
    const sensFam = fam.filter((e) => e.sensitive);
    if (sensFam.length > 0) { v -= 0.06 * sensFam.length; from.push(...sensFam.map((e) => e.id)); }
    if (ev.some((e) => e.role === 'patient_companion')) { v -= 0.05; from.push('role:patient_companion'); }
    out.F3 = mk(v, from);
  }
  { // F4 表达与社会安全：base 0.65 − 沉默因果（身体不适属暂时性不损社会安全，豁免）− 隐藏型 + 社会角色 + 无因
    const from = [];
    let v = 0.65;
    const socialCauses = causes.filter((c) => c !== 'transient_physical_indisposition');
    if (socialCauses.length > 0) { v -= 0.08 * socialCauses.length; from.push(...socialCauses.map((c) => `cause:${c}`)); }
    const hide = causes.filter((c) => HIDE_CAUSES.includes(c));
    if (hide.length > 0) { v -= 0.10 * hide.length; from.push(...hide.map((c) => `cause:${c}(hide)`)); }
    if (hasTag('fear_of_mistake')) { v -= 0.06; from.push('tag:fear_of_mistake'); }
    if (soc.length > 0) { v += 0.05 * soc.length; from.push(...soc.map((e) => e.id)); }
    if (socialCauses.length === 0) { v += 0.05; from.push('no_silence_causes'); }
    out.F4 = mk(v, from);
  }
  { // F5 归属与身份：深度家庭事件 + 敏感事件 + 高归属角色
    const from = [];
    let v = 0.3;
    const deepFam = fam.filter((e) => (e.depth || 0) >= 0.5);
    if (deepFam.length > 0) { v += 0.15 * deepFam.length; from.push(...deepFam.map((e) => e.id)); }
    const sens = ev.filter((e) => e.sensitive);
    if (sens.length > 0) { v += 0.10 * sens.length; from.push(...sens.map((e) => `${e.id}(sensitive)`)); }
    const attach = ev.filter((e) => ATTACH_ROLES.includes(e.role));
    if (attach.length > 0) { v += 0.10 * attach.length; from.push(...attach.map((e) => `role:${e.role}`)); }
    if (hasTag('family_business')) { v += 0.06; from.push('tag:family_business'); }
    out.F5 = mk(v, from);
  }
  { // F6 自主与从众（1=自主）：− 从众 tags/附议因果 + 深度行业经历 + 自信知识
    const from = [];
    let v = 0.5;
    const conform = [...allTags].filter((t) => CONFORM_TAGS.includes(t));
    if (conform.length > 0) { v -= 0.10 * conform.length; from.push(...conform.map((t) => `tag:${t}`)); }
    if (has('nomination_dependent_agreement_style')) { v -= 0.08; from.push('cause:nomination_dependent_agreement_style'); }
    if (hasTag('readaloud_expression_preference')) { v -= 0.08; from.push('tag:readaloud_expression_preference'); }
    const deepInd = ind.filter((e) => (e.depth || 0) >= 0.5);
    if (deepInd.length > 0) { v += 0.06 * deepInd.length; from.push(...deepInd.map((e) => e.id)); }
    if (car.length > 0) { v += 0.05 * car.length; from.push(...car.map((e) => e.id)); }
    if (confCount >= 2) { v += 0.05; from.push(`knowledge.confident×${confCount}`); }
    out.F6 = mk(v, from);
  }
  { // F7 认知调节：深度学业 + 职业接触 − 隐藏型因果 + 立场开放度（5−stance_strength）
    const from = [];
    let v = 0.5;
    const deepAcad = acad.filter((e) => (e.depth || 0) >= 0.5);
    if (deepAcad.length > 0) { v += 0.08 * deepAcad.length; from.push(...deepAcad.map((e) => e.id)); }
    if (car.length > 0) { v += 0.05 * car.length; from.push(...car.map((e) => e.id)); }
    const hide = causes.filter((c) => HIDE_CAUSES.includes(c));
    if (hide.length > 0) { v -= 0.08 * hide.length; from.push(...hide.map((c) => `cause:${c}`)); }
    const reflect = [...allTags].filter((t) => REFLECT_TAGS.includes(t));
    if (reflect.length > 0) { v += 0.06 * reflect.length; from.push(...reflect.map((t) => `tag:${t}`)); }
    v += 0.04 * (5 - stanceStrength);
    from.push(`persona.stance_strength=${stanceStrength}`);
    out.F7 = mk(v, from);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 最小二乘（正规方程 + 高斯消元，部分主元）
// ---------------------------------------------------------------------------
function leastSquares(X, y) {
  const n = X[0].length;
  const A = Array.from({ length: n }, () => Array(n).fill(0));
  const b = Array(n).fill(0);
  for (let i = 0; i < X.length; i++) {
    for (let j = 0; j < n; j++) {
      b[j] += X[i][j] * y[i];
      for (let k = 0; k < n; k++) A[j][k] += X[i][j] * X[i][k];
    }
  }
  // 增广矩阵消元
  const M = A.map((row, j) => [...row, b[j]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    [M[col], M[piv]] = [M[piv], M[col]];
    const d = M[col][col] || 1e-12;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / d;
      for (let k = col; k <= n; k++) M[r][k] -= f * M[col][k];
    }
  }
  return M.map((row, j) => row[n] / (row[j] || 1e-12));
}

// ---------------------------------------------------------------------------
// R2：F1–F7 → 运行参数（speak_motivation/attention/social_safety 最小二乘锚定；其余确定性公式）
// ---------------------------------------------------------------------------
function deriveParams(agents, factorsById, legacyMap, backup) {
  const ids = agents.map((a) => a.id);
  const F = (id, k) => factorsById[id][k].value;

  // ---- 第一遍：确定性公式（fatigue / fatigue_rate / stance_position / 阈值），不依赖拟合 ----
  // stance_position：按 (事件类型 × 受控 tags) 组合计侧分（家庭语境=患者/照护侧，行业语境=系统/产业侧），两侧各自班级归一后相减
  const sides = agents.map((a) => {
    let ind = 0, care = 0;
    for (const e of a.historyEvents || []) {
      const dr = (e.depth || 0) * (e.recency ?? 1);
      const tags = e.tags || [];
      if (e.type === 'family_livelihood') {
        if (tags.some((t) => CARE_TAGS.includes(t))) care += dr;
        if (tags.some((t) => FAM_INDUSTRY_TAGS.includes(t))) ind += dr;
      } else if (e.type === 'academic_track') {
        if (tags.some((t) => PAYER_TAGS.includes(t))) ind += dr;
      } else { // industry_experience / career_contact / role_social：系统侧与临床/患者接触面分开计
        if (tags.some((t) => SYS_TAGS.includes(t))) ind += dr;
        if (tags.some((t) => CARE_TAGS.includes(t))) care += dr;
        if (e.role === 'patient_companion' && !tags.includes('patient_companion_care')) care += dr; // 与 tags 命中不重复计
      }
    }
    return { ind, care };
  });
  const maxInd = Math.max(...sides.map((s) => s.ind), 1e-9);
  const maxCare = Math.max(...sides.map((s) => s.care), 1e-9);

  const params = {};
  for (const a of agents) {
    const id = a.id;
    const f = factorsById[id];
    const causes = a.silenceCauses || [];
    const has = (c) => causes.includes(c);
    const i = agents.indexOf(a);

    const fatigue = round4(clamp01(
      0.05 * (1 - f.F2.value)
      + 0.25 * (has('cognitive_overload_and_prerequisite_gap') ? 1 : 0)
      + 0.65 * (has('transient_physical_indisposition') ? 1 : 0)
      + 0.05 * (has('turn_taking_repeatedly_preempted') ? 1 : 0)
      + 0.03 * (has('knowledge_gap_fear_of_rebuttal') ? 1 : 0)
    ));
    // fatigue_rate：新 state_init 字段（引擎同批接线）：低基础 + 低效能加速 + 身体不适/认知超载特化（对标 v0.3：旧字母分支通用 0.00015、D4 特化 0.0008）
    const fatigue_rate = round6(
      0.00002 + (1 - f.F1.value) * 0.00008
      + 0.00072 * (has('transient_physical_indisposition') ? 1 : 0)
      + 0.00008 * (has('cognitive_overload_and_prerequisite_gap') ? 1 : 0)
    );
    // role_identity_confusion：监管-行业认同混乱削弱立场承诺（文档 C8 节），×0.2
    const confuse = has('role_identity_confusion_regulator_vs_industry') ? 0.2 : 1;
    const stance_position = round4(Math.min(1, Math.max(-1,
      confuse * ((sides[i].ind / maxInd) - (sides[i].care / maxCare))
    )));
    const ally_threshold = 1 + Math.floor(f.F6.value * 3); // ∈ {1,2,3}：F6 高=自主=需更多盟友先发言才跟随
    const rebut_threshold = round4(0.3 + 0.4 * (1 - f.F7.value) * (1 - f.F6.value * 0.5));

    params[id] = {
      state_init: { fatigue, stance_position, fatigue_rate },
      rules: { ally_threshold, rebut_threshold },
    };
  }

  // ---- 第二遍：最小二乘锚定（speak_motivation / social_safety / attention） ----
  // speak_motivation：有效锚 = clamp01(v0.3 备份值 + 旧引擎字母先验折算)；F1 与 fatigue 作辅助回归元（效能感支撑动机、疲劳压动机，§6.3 骨架的扩展）
  const smTarget = agents.map((a) => clamp01(backup[a.id].state_init.speak_motivation + (PRIOR_ADJ[legacyMap[a.id]?.v0_2_group] || 0)));
  const smBeta = leastSquares(ids.map((id) => [F(id, 'F4'), F(id, 'F2'), F(id, 'F5'), F(id, 'F1'), params[id].state_init.fatigue, 1]), smTarget);
  // social_safety：锚 = v0.3 备份值
  const ssTarget = agents.map((a) => backup[a.id].state_init.social_safety);
  const ssBeta = leastSquares(ids.map((id) => [F(id, 'F4'), F(id, 'F1'), 1]), ssTarget);
  // attention：锚 = v0.3 备份值（旧先验不动 attention）；fatigue 作第三回归元
  const attTarget = agents.map((a) => backup[a.id].state_init.attention);
  const attBeta = leastSquares(ids.map((id) => [F(id, 'F1'), F(id, 'F2'), params[id].state_init.fatigue, 1]), attTarget);
  for (const a of agents) {
    const f = factorsById[a.id];
    const s = params[a.id].state_init;
    const speak_motivation = round4(clamp01(smBeta[0] * f.F4.value + smBeta[1] * f.F2.value + smBeta[2] * f.F5.value + smBeta[3] * f.F1.value + smBeta[4] * s.fatigue + smBeta[5]));
    const social_safety = round4(clamp01(ssBeta[0] * f.F4.value + ssBeta[1] * f.F1.value + ssBeta[2]));
    const attention = round4(clamp01(attBeta[0] * f.F1.value + attBeta[1] * f.F2.value + attBeta[2] * s.fatigue + attBeta[3]));
    // state_init key 序与 v0.3 对齐（fatigue_rate 为新字段置末）
    params[a.id].state_init = {
      attention, speak_motivation, fatigue: s.fatigue,
      social_safety, stance_position: s.stance_position, fatigue_rate: s.fatigue_rate,
    };
  }
  return {
    params,
    fit: {
      speak_motivation: { beta: smBeta.map(round4), formula: 'clamp01(β0·F4 + β1·F2 + β2·F5 + β3·F1 + β4·fatigue + β5)', target: 'clamp01(v0.3.speak_motivation + 旧字母先验折算 A/B+0.09 C−0.5 D−0.65)' },
      attention: { beta: attBeta.map(round4), formula: 'clamp01(β0·F1 + β1·F2 + β2·fatigue + β3)', target: 'v0.3.attention' },
      social_safety: { beta: ssBeta.map(round4), formula: 'clamp01(β0·F4 + β1·F1 + β2)', target: 'v0.3.social_safety' },
      fatigue: { formula: '0.05(1−F2) + 0.25[cognitive_overload] + 0.65[transient_physical] + 0.05[turn_taking] + 0.03[knowledge_gap_fear]' },
      fatigue_rate: { formula: '0.00002 + (1−F1)·0.00008 + 0.00072[transient_physical] + 0.00008[cognitive_overload]' },
      stance_position: { formula: 'clamp((产业/系统侧归一分 − 患者/照护侧归一分) × role_identity_confusion修正(×0.2), −1, 1)；侧分 = Σ depth×recency，按 (事件类型 × 受控 tags) 组合归属', payerTags: PAYER_TAGS, pharmaTags: PHARMA_TAGS, sysTags: SYS_TAGS, famIndustryTags: FAM_INDUSTRY_TAGS, careTags: CARE_TAGS },
      ally_threshold: { formula: '1 + floor(F6 × 3) ∈ {1,2,3}（F6 高=自主=需更多盟友先发言才跟随）' },
      rebut_threshold: { formula: '0.3 + 0.4(1−F7)(1−F6×0.5)' },
    },
  };
}

// ---------------------------------------------------------------------------
// R4（P5 · §4 接线）：F1/F4/F7 × silenceCauses → 干预响应矩阵 + rules.interrupt_tolerance
// 矩阵跟随现有干预钩子（不超前建新类型）：
//   publicCall（callSilent/callC 公开点名窗口）· directMult      —— 直接点名效应乘数
//   publicCall（窗口与 openQ 铺垫叠加）· scaffoldedBonus          —— 铺垫增益（低安全感获益最大）
//   openQProbe（教师追问/开放问题窗口）· gain                     —— F7 驱动（高认知调节 +、低者微 −）
//   rules.interrupt_tolerance                                     —— 打断式干预（teacherCallOn）响应/恢复系数
// 设计直觉（以因子实现，非标签）：低 F4/F1 + 沉默因果者被直接公开点名效应近零甚至微负（被吓住），
// 先铺垫再点名效应强；高 F7 追问响应强；interrupt_tolerance 低者打断后恢复慢（残留惩罚大）。
// 与 _meta.design_notes.interrupt_tolerance 3 级原值不做单调对齐——原值语义偏对话风格（A1/A3/A4/A5/B2=low
// 与其 F4×F1 复合方向相左），按 §4/§0-3 以因子派生为唯一运行来源，原值留档仅参考。
// ---------------------------------------------------------------------------
function deriveIntervention(agents, factorsById) {
  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  const out = {};
  for (const a of agents) {
    const f = factorsById[a.id];
    const silenceLoad = Math.min(1, (a.silenceCauses || []).length / 2);
    const directMult = round4(clamp(0.8 * f.F4.value + 0.6 * f.F1.value - 0.5 * silenceLoad - 0.28, -0.4, 1.2));
    const scaffoldedBonus = round4(clamp(0.45 * (1 - f.F4.value), 0, 0.45));
    const gain = round4(clamp(0.9 * f.F7.value - 0.45, -0.15, 0.25));
    const interrupt_tolerance = round4(clamp(0.15 + 0.55 * f.F4.value + 0.45 * f.F1.value - 0.15 * silenceLoad, 0, 1));
    out[a.id] = {
      rules: { interrupt_tolerance },
      interventionResponse: {
        publicCall: { directMult, scaffoldedBonus },
        openQProbe: { gain },
      },
    };
  }
  return {
    params: out,
    formulas: {
      'rules.interrupt_tolerance': 'clamp(0.15 + 0.55×F4 + 0.45×F1 − 0.15×silenceLoad, 0, 1)；silenceLoad=min(1, 沉默因果数/2)。F4 社会安全 + F1 自我效能合成抗压韧性；消费者=teacherCallOn 打断式干预处理器（提升幅度与发言后残留惩罚均按其缩放）。',
      'interventionResponse.publicCall.directMult': 'clamp(0.8×F4 + 0.6×F1 − 0.5×silenceLoad − 0.28, −0.4, 1.2)。消费：scoreDesire 点名窗口加成 0.8(callSilent)/0.9(callC) × (directMult + 铺垫叠加时 scaffoldedBonus)。截距 −0.28 使最低 F4×F1 + 有沉默因果者≈0（直接公开点名近无效）；为负上限 −0.4 允许"被吓住"方向。',
      'interventionResponse.publicCall.scaffoldedBonus': 'clamp(0.45×(1−F4), 0, 0.45)。低安全感者从"先铺垫（openQ 窗口叠加）再点名"获益最大；高 F4 者增益小。',
      'interventionResponse.openQProbe.gain': 'clamp(0.9×F7 − 0.45, −0.15, 0.25)。消费：scoreDesire openQ 窗口 += gain。高 F7（认知调节）追问响应强（正增益），最低 F7 微负（追问压力下退缩）。',
    },
  };
}

// ---------------------------------------------------------------------------
// 班级级指标（供报告；蓝图区间落 _meta.persona_map_notes.blueprint，verify 以其为准）
// ---------------------------------------------------------------------------
function percentile(sorted, p) {
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}
function cosine(u, v) {
  let dot = 0, nu = 0, nv = 0;
  for (let i = 0; i < u.length; i++) { dot += u[i] * v[i]; nu += u[i] * u[i]; nv += v[i] * v[i]; }
  return dot / (Math.sqrt(nu) * Math.sqrt(nv) || 1e-12);
}
function pearson(x, y) {
  const n = x.length;
  const mx = x.reduce((s, v) => s + v, 0) / n, my = y.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
  return sxy / (Math.sqrt(sxx * syy) || 1e-12);
}
function computeMetrics(agents, factorsById, params) {
  const ids = agents.map((a) => a.id);
  const vectors = ids.map((id) => FACTOR_IDS.map((k) => factorsById[id][k].value));
  // 近重复/微簇判定的余弦基于班级均值中心化向量：原始量纲余弦在 sd<0.1 的因子上恒 ≈1，失去"结构雷同"判别力（§1.3 的可操作化）
  const colMeans = FACTOR_IDS.map((_, k) => vectors.reduce((s, v) => s + v[k], 0) / vectors.length);
  const cvectors = vectors.map((v) => v.map((x, k) => x - colMeans[k]));
  const distributions = {};
  for (let k = 0; k < 7; k++) {
    const vals = vectors.map((v) => v[k]).sort((a, b) => a - b);
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    const sd = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length);
    distributions[FACTOR_IDS[k]] = {
      mean: round4(mean), sd: round4(sd),
      tail: vals.filter((v) => v <= 0.2 || v >= 0.8).length,
      p15: round4(percentile(vals, 0.15)), p85: round4(percentile(vals, 0.85)),
    };
  }
  // 近重复与微簇（中心化向量余弦 ≥ 0.85 单链连通分量）
  let maxPair = { a: null, b: null, cos: -1 };
  const pairCos = [];
  const parent = ids.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const c = cosine(cvectors[i], cvectors[j]);
      pairCos.push({ a: ids[i], b: ids[j], cos: round4(c) });
      if (c > maxPair.cos) maxPair = { a: ids[i], b: ids[j], cos: round4(c) };
      if (c >= 0.85) { const ri = find(i), rj = find(j); if (ri !== rj) parent[ri] = rj; }
    }
  }
  const clusters = {};
  ids.forEach((id, i) => { const r = find(i); (clusters[r] = clusters[r] || []).push(id); });
  const clusterList = Object.values(clusters).filter((c) => c.length > 1).sort((a, b) => b.length - a.length);
  // 反典型：≥1 因子落在班级 p15/p85 之外，且存在反向组合（知识×参与 或 实践×证据素养 违反软相关方向）
  const knowProxy = agents.map((a) => (a.knowledge?.confident || []).length + (a.knowledge?.aware || []).length);
  const partProxy = ids.map((id) => params[id].state_init.speak_motivation);
  const knowSorted = [...knowProxy].sort((a, b) => a - b), partSorted = [...partProxy].sort((a, b) => a - b);
  const atypical = [];
  agents.forEach((a, i) => {
    const tailFactor = FACTOR_IDS.filter((k, kk) => {
      const dist = distributions[k];
      return vectors[i][kk] < dist.p15 || vectors[i][kk] > dist.p85;
    });
    if (tailFactor.length === 0) return;
    const knowHigh = knowProxy[i] > percentile(knowSorted, 0.5);
    const partLow = partProxy[i] < percentile(partSorted, 0.25);
    const partHigh = partProxy[i] > percentile(partSorted, 0.75);
    const knowLow = knowProxy[i] < percentile(knowSorted, 0.5);
    const hasInd = (a.historyEvents || []).some((e) => e.type === 'industry_experience');
    const f3High = vectors[i][2] > distributions.F3.p85, f3Low = vectors[i][2] < distributions.F3.p15;
    const contra = (knowHigh && partLow) || (partHigh && knowLow) || (hasInd && f3Low) || (!hasInd && f3High);
    if (contra) atypical.push({ id: a.id, tailFactor, contra: true });
  });
  // 硬相关
  const rKnowPart = pearson(knowProxy, partProxy);
  const top8Know = ids.filter((_, i) => knowProxy[i] >= [...knowProxy].sort((a, b) => b - a)[7]);
  const top8Part = new Set(ids.filter((_, i) => partProxy[i] >= [...partProxy].sort((a, b) => b - a)[7]));
  const highKnowAllHighPart = top8Know.every((id) => top8Part.has(id));
  const f3Ind = agents.map((a, i) => ({ ind: (a.historyEvents || []).some((e) => e.type === 'industry_experience'), f3: vectors[i][2] }));
  const meanF3Ind = f3Ind.filter((x) => x.ind).reduce((s, x) => s + x.f3, 0) / (f3Ind.filter((x) => x.ind).length || 1);
  const meanF3NoInd = f3Ind.filter((x) => !x.ind).reduce((s, x) => s + x.f3, 0) / (f3Ind.filter((x) => !x.ind).length || 1);
  return {
    distributions,
    maxCosinePair: maxPair,
    topCosinePairs: pairCos.sort((x, y) => y.cos - x.cos).slice(0, 8),
    microClusters: clusterList,
    atypical,
    correlations: {
      knowledge_vs_participation_r: round4(rKnowPart),
      high_knowledge_all_high_participation: highKnowAllHighPart,
      practice_vs_evidence: { meanF3_with_industry: round4(meanF3Ind), meanF3_without_industry: round4(meanF3NoInd), gap: round4(Math.abs(meanF3Ind - meanF3NoInd)) },
    },
  };
}

// ---------------------------------------------------------------------------
// main（仅直接执行时运行；verify-agent-persona 等以模块方式 import 派生与指标函数）
// ---------------------------------------------------------------------------
export { deriveFactors, deriveParams, deriveIntervention, computeMetrics, applyApprovedAdjustments, FACTOR_IDS, ADJUST_LIMIT };

const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) {
const data = JSON.parse(readFileSync(JSON_PATH, 'utf8'));
const legacy = JSON.parse(readFileSync(LEGACY_PATH, 'utf8')).map;
// 标定锚与残差对比一律以 v0.3 备份为准（幂等：重跑不因 state_init 已被替换而漂移）
const backup = JSON.parse(readFileSync(BACKUP_PATH, 'utf8')).backup;
const agents = data.agents;

const factorsById = {};
for (const a of agents) factorsById[a.id] = deriveFactors(a);
// §6.2 批准校准生效（approved:false 一律不动；锚仍读 backup，幂等）
const appliedAdjustments = applyApprovedAdjustments(agents, factorsById);
const { params, fit } = deriveParams(agents, factorsById, legacy, backup);
const { params: intervention, formulas: interventionFormulas } = deriveIntervention(agents, factorsById);
const metrics = computeMetrics(agents, factorsById, params);

// 残差（新值 vs v0.3 备份值，五字段；ally/rebut 语义已变，只记录映射不判残差）
const RESIDUAL_LIMIT = 0.15;
const residualFlags = [];
for (const a of agents) {
  const old = backup[a.id].state_init;
  const nw = params[a.id].state_init;
  for (const k of ['attention', 'speak_motivation', 'fatigue', 'social_safety', 'stance_position']) {
    const r = Math.abs(nw[k] - old[k]);
    if (r > RESIDUAL_LIMIT) residualFlags.push({ id: a.id, field: `state_init.${k}`, old: old[k], new: nw[k], residual: round4(r) });
  }
}

// 报告
const log = (...s) => console.log(...s);
log('persona-map-v1', CHECK_ONLY ? '（--check 只读模式）' : '（写回模式）');
if (appliedAdjustments.length) {
  log('\n== 批准校准生效（§6.2，有效值 = base + delta）==');
  for (const x of appliedAdjustments) log(`${x.id} ${x.factor}: base ${x.base} + delta ${x.delta} → ${x.effective}（${x.approvedBy} @ ${x.approvedDate}）`);
}
log('\n== F1–F7 因子值 ==');
log('id    F1    F2    F3    F4    F5    F6    F7');
for (const a of agents) log(a.id.padEnd(4), FACTOR_IDS.map((k) => factorsById[a.id][k].value.toFixed(2).padStart(5)).join(' '));
log('\n== R2 拟合系数 ==');
log('speak_motivation β(F4,F2,F5,1):', fit.speak_motivation.beta.join(', '));
log('attention       β(F1,F2,1):  ', fit.attention.beta.join(', '));
log('social_safety   β(F4,F1,1):  ', fit.social_safety.beta.join(', '));
log('\n== 派生参数 ==');
log('id    att    sm     fat    ss     stance  frate     ally rebut');
for (const a of agents) {
  const p = params[a.id];
  log(a.id.padEnd(4),
    p.state_init.attention.toFixed(2).padStart(5), p.state_init.speak_motivation.toFixed(2).padStart(6),
    p.state_init.fatigue.toFixed(2).padStart(6), p.state_init.social_safety.toFixed(2).padStart(6),
    p.state_init.stance_position.toFixed(2).padStart(7), String(p.state_init.fatigue_rate).padStart(9),
    String(p.rules.ally_threshold).padStart(5), p.rules.rebut_threshold.toFixed(2).padStart(6));
}
log('\n== 分布 ==');
for (const k of FACTOR_IDS) {
  const d = metrics.distributions[k];
  log(`${k} ${FACTOR_NAMES[k]}：mean=${d.mean} sd=${d.sd} tail=${d.tail} p15=${d.p15} p85=${d.p85}`);
}
log('\n== 结构 ==');
log('最大余弦对:', JSON.stringify(metrics.maxCosinePair));
log('Top8 余弦对:', metrics.topCosinePairs.map((p) => `${p.a}-${p.b}:${p.cos}`).join(' '));
log('微簇(≥2人):', JSON.stringify(metrics.microClusters));
log('反典型:', metrics.atypical.map((x) => `${x.id}(${x.tailFactor.join('/')})`).join(' ') || '（无）');
log('知识×参与 r =', metrics.correlations.knowledge_vs_participation_r,
  '| 高知识全员高参与:', metrics.correlations.high_knowledge_all_high_participation,
  '| 实践×证据素养 gap =', metrics.correlations.practice_vs_evidence.gap);
log('\n== 残差 flag（|Δ|>0.15）==');
for (const f of residualFlags) log(`${f.id} ${f.field}: ${f.old} → ${f.new} (Δ${f.residual})`);
log(`共 ${residualFlags.length} 条`);

log('\n== R4 干预响应矩阵（P5）==');
log('id    direct  scaf   probeGain  intTol');
for (const a of agents) {
  const iv = intervention[a.id];
  log(a.id.padEnd(4),
    iv.interventionResponse.publicCall.directMult.toFixed(3).padStart(7),
    iv.interventionResponse.publicCall.scaffoldedBonus.toFixed(3).padStart(7),
    iv.interventionResponse.openQProbe.gain.toFixed(3).padStart(10),
    iv.rules.interrupt_tolerance.toFixed(3).padStart(8));
}

if (!CHECK_ONLY) {
  // ---- 写回学生记录 ----
  for (const a of agents) {
    const f = factorsById[a.id];
    const p = params[a.id];
    // latentFactors：value(base) + derivedFrom + derivationRule + adjustment（§6.2 校准槽；
    // 已存在的 adjustment 原样保留——approved:true 由 applyApprovedAdjustments 生效，base value 不回写有效值，保幂等）
    const prevFactors = a.latentFactors || {};
    a.latentFactors = {};
    for (const k of FACTOR_IDS) {
      a.latentFactors[k] = {
        value: f[k].baseValue != null ? f[k].baseValue : f[k].value,
        derivedFrom: f[k].derivedFrom,
        derivationRule: 'persona-map-v1.R1',
        adjustment: (prevFactors[k] && prevFactors[k].adjustment) || { delta: 0, approved: false },
      };
    }
    // state_init 五字段替换 + fatigue_rate 新增（引擎同批接线）
    a.state_init.attention = p.state_init.attention;
    a.state_init.speak_motivation = p.state_init.speak_motivation;
    a.state_init.fatigue = p.state_init.fatigue;
    a.state_init.social_safety = p.state_init.social_safety;
    a.state_init.stance_position = p.state_init.stance_position;
    a.state_init.fatigue_rate = p.state_init.fatigue_rate;
    // ally/rebut_threshold 接线语义（§4）
    a.rules.ally_threshold = p.rules.ally_threshold;
    a.rules.rebut_threshold = p.rules.rebut_threshold;
    // R4（P5）：interrupt_tolerance 复活接线 + 干预响应矩阵（consumer=引擎干预处理器，同批落地 §1.2-①）
    const iv = intervention[a.id];
    a.rules.interrupt_tolerance = iv.rules.interrupt_tolerance;
    a.interventionResponse = iv.interventionResponse;
    // 学生级派生出处（契约 §1.2-②）
    a.derived = {
      'state_init.attention': { from: ['F1', 'F2', 'silenceCauses'], rule: 'persona-map-v1.R2' },
      'state_init.speak_motivation': { from: ['F4', 'F2', 'F5', 'F1', 'silenceCauses'], rule: 'persona-map-v1.R2' },
      'state_init.fatigue': { from: ['F2', 'silenceCauses'], rule: 'persona-map-v1.R2' },
      'state_init.fatigue_rate': { from: ['F1', 'silenceCauses'], rule: 'persona-map-v1.R2' },
      'state_init.social_safety': { from: ['F4', 'F1'], rule: 'persona-map-v1.R2' },
      'state_init.stance_position': { from: ['historyEvents.tags'], rule: 'persona-map-v1.R2' },
      'rules.ally_threshold': { from: ['F6'], rule: 'persona-map-v1.R2' },
      'rules.rebut_threshold': { from: ['F7', 'F6'], rule: 'persona-map-v1.R2' },
      'rules.interrupt_tolerance': { from: ['F4', 'F1', 'silenceCauses'], rule: 'persona-map-v1.R4' },
      'interventionResponse.publicCall.directMult': { from: ['F4', 'F1', 'silenceCauses'], rule: 'persona-map-v1.R4' },
      'interventionResponse.publicCall.scaffoldedBonus': { from: ['F4'], rule: 'persona-map-v1.R4' },
      'interventionResponse.openQProbe.gain': { from: ['F7'], rule: 'persona-map-v1.R4' },
    };
  }
  // ---- 装饰字段降级（§4）：openness/register/interrupt_tolerance → _meta.design_notes（幂等：已降级则跳过） ----
  if (!data._meta.design_notes) {
    const notes = { openness: {}, register: {}, interrupt_tolerance: {} };
    for (const a of agents) {
      if ('openness' in a.persona) { notes.openness[a.id] = a.persona.openness; delete a.persona.openness; }
      if ('register' in a.persona) { notes.register[a.id] = a.persona.register; delete a.persona.register; }
      if ('interrupt_tolerance' in a.rules) { notes.interrupt_tolerance[a.id] = a.rules.interrupt_tolerance; delete a.rules.interrupt_tolerance; }
    }
    data._meta.design_notes = {
      _note: '契约 §4 装饰字段降级存档（P2 执行）：以下字段从运行层移除，原值保留于此仅供生成时设计参考；verify-agent-persona 断言其不得复活到运行层。interrupt_tolerance 按 §4 待 P5 跟随干预面接线。',
      ...notes,
    };
  }
  // ---- _meta.persona_map_notes（R1/R2 规则 + 蓝图 + 指标，verify 的单一来源） ----
  data._meta.persona_map_notes = {
    rule: 'persona-map-v1',
    contract: 'persona-v2-contract §6（派生链）/ §13（班级级门禁）/ §14 P2',
    R1: {
      F1: '0.5 + 0.08×Σacademic.depth(cap +0.24) + 0.05×min(行业事件数,2) − 0.25[cause cognitive_overload] − 0.12[tag prerequisite_knowledge_gap] − 0.08[tag fear_of_mistake] − 0.10[tag mandarin_expression_barrier] + 0.03×min(confident条数,4)',
      F2: '0.5 + 0.05×role_social事件数 + 0.06×(academic depth≥0.5 数) + 0.06×career_contact事件数 + 0.05[tag activity_style_learner] + 0.05[role group_delegate] − 0.10×被动沉默因果数(等点名/附议/低效能) − 0.05×被动表达 tags 数(读稿/附议)',
      F3: '0.5 + 0.06×证据型事件数 + 0.02×证据型 tags 命中总数 + 0.05×证据型角色事件数 − 0.06×敏感家庭事件数 − 0.05[role patient_companion]',
      F4: '0.65 − 0.08×沉默因果数(transient_physical 豁免：身体不适不损社会安全) − 0.10×隐藏型因果数(怕标签/利益隐藏/自我审查) + 0.05×role_social事件数 + 0.05[无计分沉默因果]',
      F5: '0.3 + 0.15×(家庭事件 depth≥0.5 数) + 0.10×敏感事件数 + 0.10×高归属角色数(family_caregiver/family_business_participant) + 0.06[tag family_business]',
      F6: '0.5 − 0.10×从众 tags 数 − 0.08[cause nomination_dependent] − 0.08[tag readaloud] + 0.06×(行业事件 depth≥0.5 数) + 0.05×career_contact事件数 + 0.05[confident≥2]',
      F7: '0.5 + 0.08×(academic depth≥0.5 数) + 0.05×career_contact事件数 − 0.08×隐藏型因果数 + 0.06×反思型 tags 数 + 0.04×(5−stance_strength)',
      vocab: { EVIDENCE_TAGS, EVIDENCE_ROLES, HIDE_CAUSES, PASSIVE_CAUSES, PASSIVE_TAGS, CONFORM_TAGS, ATTACH_ROLES, REFLECT_TAGS },
    },
    R2: fit,
    R4: {
      contract: 'persona-v2-contract §4（interrupt_tolerance 接线 P5）/ §14 P5（干预响应矩阵，跟随 UI 干预面不超前）',
      formulas: interventionFormulas,
      _note: '干预响应矩阵（P5）：系数逐人由 F1/F4/F7 × silenceCauses 确定性派生（铁律③：无分组/字母模板）。消费点与字段同批落地（§1.2-①）：scoreDesire/scoreSpeakDesire 点名窗口加成逐人缩放（两引擎对称）、scoreDesire openQ 窗口增益（MVCore；practice-runtime 无 openQ 钩子不消费）、teacherCallOn 打断式干预（仅 MVCore 有该钩子）。与 _meta.design_notes.interrupt_tolerance 3 级原值故意不做单调对齐：原值偏对话风格语义（A1/A3/A4/A5/B2=low 与 F4×F1 复合相左），§0-3 以因子派生为唯一运行来源。',
    },
    blueprint: {
      _note: '班级级硬门禁蓝图区间（persona-v2-contract §13；P2 自定/标定）。依据：32 人小班 7 因子需可区分但禁极端工程化分布——均值限中带防整体漂移，sd 下限保个体可区分、上限防人为拉散，尾部上限防堆边；F4 均值带 [0.3,0.65] 下移因 17/32 人带沉默因果属设计事实（上沿即规则 base 0.65）。近重复/微簇的余弦基于班级均值中心化向量——原始量纲余弦在 sd<0.1 的因子上恒 ≈1，中心化是 §1.3"结构雷同"的可操作化。cosineMax 标定：§1.3 初拟 0.92，P2 实测 496 对中仅 3 对同经历类型组合（医保支付实习×2、医院见习+照护家庭×2、家庭照护+志愿服务×2）落 0.924–0.928，属 §0-2 明示允许的同培养方案 2 人自然邻近、非模板复制痕迹；判重目标（防整班模板化）在 0.93 下依然成立且无一对触及，故标定为 0.93，任何新对超阈即失败',
      mean: { default: [0.35, 0.65], F4: [0.3, 0.65] },
      sd: [0.05, 0.35],
      tailMax: 8,
      cosineMax: 0.93,
      microClusterMax: 5,
      atypicalMin: 3,
      knowledgeParticipationAbsR: 0.6,
      practiceEvidenceGapMax: 0.25,
    },
    metrics,
    appliedAdjustments,
    residualFlags,
    // §2.1 enrichmentPlan 优先级系数依据（P3 落地；运行时每课生成、课结束丢弃、不回写——verify-agent-persona (q) 门禁）
    enrichment: {
      weights: { scenarioActivation: 0.3, personaUncertainty: 0.15, coverageGap: 0.15, interventionSensitivity: 0.2, counterfactualValue: 0.1, explorationBonus: 0.1 },
      topN: 8,
      _note: '§2.1 优先级公式六项系数依据（P3 自定并记录）：scenarioActivation 权重最大（0.3）——深度资源首先服务"与本课有经历连接"的学生，speakProbability 不为主要权重（公式不含 sm 主项，sm 仅以 personaUncertainty=1−|2sm−1| 形式反向进入：动机越居中行为越难预判越值得深建模）；interventionSensitivity 次高（0.2）——契约判例"沉默者不得系统性沦为背景板"：有沉默因果（+0.5）与敏感经历（+0.5）是教学干预最能改变行为的位置；coverageGap/personaUncertainty 各 0.15——班级背景类型覆盖与行为不可预测性次之；counterfactualValue/explorationBonus 各 0.10——立场易动者（(5−stance_strength)/4）分叉潜力与确定性哈希探索奖励（fnv1a32(lessonId|id)/2^32，防稳定偏向高动机学生）。deep 配置按 §2.1 结构（conceptModel/responseInventory 6/misconceptionModel/learningTraceDepth 2/interventionBranches 3/counterfactualResponses），其余 light。计算实现单源 shared/enrich-activation.js（ENRICH-ACTIVATION 标记区，两引擎内嵌副本同字节）。',
    },
    // L2/L3 运行时层取值依据（§2 铁律①：字段与消费者同批落地——verify-agent-persona (r) 门禁）
    runtime_layer: {
      L1_activation: '§7.2：L1 生效 speak_motivation = base ± 0.2×magnitude（magnitude=familiarity×(0.5+0.5×F5有效值)）；正向另置 evidenceBias（pickRespKey 证据子池 80%）。0.2 增益使全激活（mag≈0.5）位移 ≤0.1，小于 P2 sm 重标定量级，保行为变化可控可对照；sensitive 事件方向为负（§7.2 判例，一切"经历=正向加成"判 bug）。只调 L1 生效值，不写回 state_init。',
      L2_cognitiveConflict: '认知冲突：任一发言与听者立场差>0.5 → +0.1×gap（全班轻量）；说出即 −0.15 部分消解；tick 衰减 0.00005/s。消费：conflict>0.5 × F7有效值≥0.55 → scoreDesire +0.2（高冲突×高认知调节 → 反驳/立场迁移倾向）。取值依据：0.5 立场差是 SWOT 课内外部边界分歧的操作化阈值；+0.2 与 rivals 加成（0.25）同量级，不喧宾夺主。',
      L2_perceivedUnderstanding: '理解度：init=0.35+0.4×F1（学业自我效能作先验）；盟友阐发 +0.05、自己发言 +0.02；tick 衰减 0.00003/s。消费：<0.3 → pickRespKey 优先 clarifying_question（低理解 → 澄清请求）；<0.25 → scoreDesire −0.15（不懂不敢开口）。',
      L2_participationDebt: '参与欠账：每个决策轮次未发言 +1，发言即清零（连续未发言轮次计数）。消费：点名窗口内 +min(0.3, 0.05×debt)（callC/callSilent 目标权重上调，沉默风险对冲；cap 0.3 不盖过窗口本身加成 0.8/0.9）。',
      L3_learningTrace: 'L3 轨迹 {t, event, concept, effect}：peer_counterexample（冲突 +Δ）、self_revision（说出消解，preConflict>0.2）、teacher_scaffold（点名窗口响应）。仅 enrichmentPlan learningTraceDepth≥2 的 deep 学生追加（light 空数组，深度分层由 verify harness 门禁）。消费者：MVCore.learningTraceMoments() 派生 KM 候选（conflict_resolution=反例后 240s 内自我修正；scaffold_uptake=支架后首次响应）；证明 tools/prove-learning-trace-km.mjs；UI 接线（practice-detail.html）PENDING——页面解禁后任务。',
    },
    priorAdjustNote: 'speak_motivation 有效锚含旧引擎字母先验折算（A/B+0.09、C−0.5、D−0.65，来源 migration/persona-v1-legacy-map.json）；折算仅用于标定目标，不写回运行数据。残差 flag 集中处即 v0.3 手工对称结构（旧 D 组 sm≈0）与事件证据不符的位置，属预期暴露而非拟合失败。',
  };
  // ---- _meta._field_consumers 同步（铁律①） ----
  const fields = data._meta._field_consumers.fields;
  fields['latentFactors'] = { consumer: 'engine', use: 'F1–F7 潜在因子（persona-map-v1 R1 派生，带 derivedFrom/adjustment 槽）；F3 接 pickRespKey 语料键调序（认识论习惯运行载体，§4）；全量供 verify 班级级门禁与 R2 再派生' };
  fields['derived'] = { consumer: 'derived', use: '学生级派生出处映射：R2 重写字段的 from + rule（契约 §1.2-② provenance 强制）' };
  fields['state_init.fatigue_rate'] = { consumer: 'engine', use: 'tickRT 疲劳累积速率（persona-map-v1 R2 派生），替代 v0.3 的字母分支疲劳加速' };
  fields['rules.primary_style'] = { consumer: 'display', disposition: 'P2 已接线：运行载体为 latentFactors.F3（pickRespKey 语料键调序），本字段为 F3 的展示投影；P4 语料重生成时对齐（§4）' };
  fields['rules.ally_threshold'] = { consumer: 'engine', use: 'scoreDesire allies 加成生效阈值：近期发言盟友数 ≥ 阈值才 +0.15（§4，P2 已接线）', disposition: '接线 P2 已执行（§4）：allies 加成生效阈值，scoreDesire 近期发言盟友数 ≥ 阈值才 +0.15' };
  fields['rules.rebut_threshold'] = { consumer: 'engine', use: 'scoreDesire rivals 加成触发阈值：立场差 × rival 在场强度 ≥ 阈值才 +0.25（§4，P2 已接线）', disposition: '接线 P2 已执行（§4）：rivals 加成触发阈值，立场差 × rival 在场强度 ≥ 阈值才 +0.25' };
  fields['persona.openness'] = { consumer: 'design_notes', disposition: 'P2 已降级 _meta.design_notes；与认识论习惯因子重叠（§4）' };
  fields['persona.register'] = { consumer: 'design_notes', disposition: 'P2 已降级 _meta.design_notes；语域由语料承载（§4）' };
  fields['rules.interrupt_tolerance'] = { consumer: 'engine', disposition: 'P5 已接线（§4）：persona-map-v1.R4 由 F4×F1×silenceCauses 派生，teacherCallOn 打断式干预处理器消费（提升幅度与发言后残留惩罚）；P2 曾降级 _meta.design_notes 留档', use: 'teacherCallOn 打断式干预响应/恢复系数（MVCore 干预处理器）' };
  fields['interventionResponse.publicCall'] = { consumer: 'engine', use: '干预响应矩阵·公开点名行（persona-map-v1.R4）：scoreDesire/scoreSpeakDesire 的 callSilent 0.8 / callC 0.9 加成按 directMult（+openQ 铺垫叠加 scaffoldedBonus）逐人缩放；两引擎对称' };
  fields['interventionResponse.openQProbe'] = { consumer: 'engine', use: '干预响应矩阵·追问行（persona-map-v1.R4）：scoreDesire openQ 窗口 += gain（F7 驱动，高者正低者微负）；MVCore 消费（practice-runtime 无 openQ 钩子）' };

  writeFileSync(JSON_PATH, JSON.stringify(data, null, 2) + '\n');
  log('\n已写回 shared/virtual-class-agents.json（latentFactors/state_init/rules/derived/design_notes/_meta.persona_map_notes/_field_consumers）');
}
} // IS_MAIN
