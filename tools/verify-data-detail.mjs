import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function loadFramework() {
  const storage = new Map();
  const context = {
    console,
    CustomEvent: class CustomEvent {
      constructor(type, init) {
        this.type = type;
        this.detail = init && init.detail;
      }
    },
    window: {
      dispatchEvent() {},
      addEventListener() {},
    },
    localStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { storage.set(key, String(value)); },
      removeItem(key) { storage.delete(key); },
    },
  };
  context.window.localStorage = context.localStorage;
  vm.runInNewContext(read('shared/evaluation-contract.js'), context, {
    filename: 'shared/evaluation-contract.js',
  });
  vm.runInNewContext(read('shared/evaluation-framework.js'), context, {
    filename: 'shared/evaluation-framework.js',
  });
  return {
    EF: context.window.PharmacoPilotEvaluationFramework,
    EC: context.window.PharmacoPilotEvaluationContract,
  };
}

function dimBlock(ids, value) {
  return Object.fromEntries(ids.map((id) => [id, value]));
}

function pairFor(ids, baseline, current) {
  return {
    baseline: dimBlock(ids, baseline),
    current: dimBlock(ids, current),
  };
}

function payloadFor(EF, baseline, current = baseline) {
  const teacher = {};
  const student = {};
  const teacherIds = EF.TEACHER_DIMS.map((d) => d.id);
  const studentIds = EF.STUDENT_DIMS.map((d) => d.id);
  for (const mode of ['cumulative', 'weekly', 'single']) {
    teacher[mode] = pairFor(teacherIds, baseline, current);
    student[mode] = pairFor(studentIds, baseline, current);
  }
  return {
    schemaVersion: EF.LIVE_SCHEMA_VERSION,
    label: `verify ${baseline} to ${current}`,
    evidenceLevel: 'A',
    measurementMeta: {
      rubricVersion: 'verify-rubric-v1',
      taskVersion: 'verify-task-v1',
      sampleSize: 32,
      missingRate: 0,
      raterCount: 2,
    },
    measurements: { teacher, student },
  };
}

const { EF, EC } = loadFramework();

// § 8C 维度评分锚点覆盖：每个维度必须且只能有一种状态——已立锚点（DIM_RUBRICS）或显式暂缓（DIM_RUBRICS_DEFERRED）
const rubricIds = Object.keys(EF.DIM_RUBRICS || {});
const deferredIds = Object.keys(EF.DIM_RUBRICS_DEFERRED || {});
const expectedDimIds = [...EF.TEACHER_DIMS, ...EF.STUDENT_DIMS].map((d) => d.id);
assert(
  [...rubricIds, ...deferredIds].every((id) => expectedDimIds.includes(id)),
  'DIM_RUBRICS / DIM_RUBRICS_DEFERRED must not contain orphan dimension ids'
);
for (const d of [...EF.TEACHER_DIMS, ...EF.STUDENT_DIMS]) {
  const hasRubric = rubricIds.includes(d.id);
  const isDeferred = deferredIds.includes(d.id);
  assert(
    hasRubric !== isDeferred,
    `${d.id} must appear in exactly one of DIM_RUBRICS / DIM_RUBRICS_DEFERRED`
  );
}
for (const [id, rubric] of Object.entries(EF.DIM_RUBRICS || {})) {
  assert(
    rubric.status === 'draft',
    `${id} rubric status must be draft until reliability testing is complete`
  );
  assert(
    typeof rubric.signals === 'string' && rubric.signals.trim().length >= 10,
    `${id} rubric must name its observable signals`
  );
  assert(
    Array.isArray(rubric.levels) &&
      rubric.levels.length === 5 &&
      rubric.levels.every((l, i) =>
        l.band === `L${i}` &&
        l.label === EF.SCALE.levels[i].name &&
        typeof l.desc === 'string' && l.desc.trim().length > 0
      ),
    `${id} rubric must define L0-L4 behavioral anchors with label and desc`
  );
}
for (const [id, reason] of Object.entries(EF.DIM_RUBRICS_DEFERRED || {})) {
  assert(
    typeof reason === 'string' && reason.trim().length >= 20,
    `${id} deferred rubric must retain a substantive reason`
  );
}
assert(
  EF.DIM_RUBRICS.T8?.status === 'draft' &&
    EF.TEACHER_DIMS.find((dim) => dim.id === 'T8')?.name === '反思性教学改进能力' &&
    !EF.DATA_SOURCES.T8.some((source) => /AI|采纳率|退回/.test(source)),
  'T8 must assess reflective teaching improvement while AI usage remains a separate process indicator'
);
assert(
  deferredIds.length === 1 && deferredIds[0] === 'S1',
  'S1 must remain the only deferred dimension until EV4 and the E09 causal chain are validated'
);
assert(
  Array.isArray(EF.AI_PROCESS_INDICATORS) && EF.AI_PROCESS_INDICATORS.length >= 3,
  'AI collaboration must remain available as process indicators outside T8'
);
assert(
  EF.RUBRIC_CROSSWALK?.mappings?.some((row) => row.mappingType === 'task-only') &&
    EF.RUBRIC_CROSSWALK?.mappings?.some((row) => row.mappingType === 'direct') &&
    /不得直接等比例换算/.test(EF.RUBRIC_CROSSWALK.rule),
  'the three rubric systems need an explicit no-direct-conversion crosswalk'
);
assert(
  /S3/.test(EF.DIM_RUBRICS.S6?.codingNote || '') &&
    /S6/.test(EF.DIM_RUBRICS.S3?.codingNote || ''),
  'S3 and S6 must retain their independent-coding notes'
);

// 分档必须连续、无重叠，并完整覆盖 0–10：前四档左闭右开，L4 包含 10。
assert(EF.SCALE.levels.length === 5, 'SCALE.levels must define five bands');
EF.SCALE.levels.forEach((level, i, levels) => {
  assert(level.code === `L${i}`, `SCALE level ${i} must be L${i}`);
  assert(level.range[0] < level.range[1], `${level.code} must have an increasing range`);
  if (i > 0) {
    assert(
      level.range[0] === levels[i - 1].range[1],
      `${level.code} must start exactly where ${levels[i - 1].code} ends`
    );
  }
  assert(
    level.upperInclusive === (i === levels.length - 1),
    `${level.code} must follow half-open boundaries, with only L4 including its upper bound`
  );
});
assert(
  EF.SCALE.levels[0].range[0] === EF.SCALE.perDimension.min &&
    EF.SCALE.levels.at(-1).range[1] === EF.SCALE.perDimension.max,
  'SCALE levels must cover the full per-dimension score range'
);

const sampleData = EF.buildDataset('cumulative');
assert(
  JSON.stringify(sampleData.coupling) === JSON.stringify([null, null, 1.9, 1.5, null, 2.3, 2.3, 1.5, null]),
  `sample coupling must come from the X1-global contract, got ${JSON.stringify(sampleData.coupling)}`
);
assert(sampleData.couplingSource === 'evaluation-contract', 'dataset must declare evaluation-contract as coupling source');
assert(
  sampleData.associationSummary.mean === 1.9 &&
    sampleData.associationSummary.covered === 5 &&
    sampleData.associationSummary.total === 9,
  `association summary must report mean plus coverage, got ${JSON.stringify(sampleData.associationSummary)}`
);
assert(
  sampleData.teacherTotal === '+3.6 / 10' && sampleData.studentTotal === '+3.0 / 10' &&
    sampleData.studentMeasuredCount === 6 && sampleData.raw.studentDims.S1 === null,
  'sample overview must use mean absolute score differences and exclude deferred S1 from the denominator'
);
assert(
  sampleData.bridges.every((b) => !['E01', 'E02', 'E05', 'E09'].includes(b.envId)) &&
    sampleData.bridges.every((b) => !['EV0', 'EV4'].includes(b.eventId)),
  `baseline, pending migration, and no-rubric envs must not render coupling bridges: ${JSON.stringify(sampleData.bridges)}`
);
assert(
  EF.STUDENT_EVENTS.find((event) => event.id === 'EV0')?.evidence === 'B',
  'EV0 virtual rehearsal baseline must be B evidence, not A'
);
assert(
  EF.STUDENT_DIMS.find((dim) => dim.id === 'S5')?.name === '方案设计与可行性评估能力',
  'S5 must name the assessed ability rather than an attribute of the plan'
);

const legacyDeltaOnly = {
  label: 'legacy', evidenceLevel: 'A',
  teacher: { cumulative: dimBlock(EF.TEACHER_DIMS.map((d) => d.id), 1) },
  student: { cumulative: dimBlock(EF.STUDENT_DIMS.map((d) => d.id), 1) },
};
assert(!EF.loadDataset(legacyDeltaOnly).ok, 'v2 must fail closed on legacy delta-only LIVE data');

const partial = payloadFor(EF, 4, 5);
delete partial.measurements.teacher.weekly;
assert(!EF.loadDataset(partial).ok, 'LIVE dataset must reject missing weekly/single modes');

const overRange = payloadFor(EF, 4, 99);
assert(!EF.loadDataset(overRange).ok, 'LIVE dataset must reject values above 10');

const negative = EF.loadDataset(payloadFor(EF, 8, 6));
assert(negative.ok, `negative-delta dataset should be valid: ${negative.error || ''}`);
const negativeData = EF.buildDataset('cumulative');
assert(negativeData.teacherTotal === '-2.0 / 10', `negative teacher change must retain its sign, got ${negativeData.teacherTotal}`);
assert(
  negativeData.studentEvents.every((event) => event.measurementMode === 'missing' && event.delta === null),
  'LIVE data without studentEvents must keep every node unmeasured instead of using sample progress coefficients'
);

const zero = EF.loadDataset(payloadFor(EF, 4, 4));
assert(zero.ok, `zero-change dataset should be valid: ${zero.error || ''}`);
const zeroData = EF.buildDataset('cumulative');
assert(zeroData.teacherTotal === '0.0 / 10', `zero teacher total should be 0.0 / 10, got ${zeroData.teacherTotal}`);
assert(zeroData.studentTotal === '0.0 / 10', `zero student total should be 0.0 / 10, got ${zeroData.studentTotal}`);
assert(
  zeroData.coupling.every((v) => v == null || v === 0),
  `zero dataset coupling should be null/0, got ${JSON.stringify(zeroData.coupling)}`
);
assert(
  zeroData.couplingStatus.available === false && /未提供 couplingRubric/.test(zeroData.couplingStatus.reason),
  'LIVE ability deltas without couplingRubric must not be converted into COUPLING'
);

const liveWithRubric = payloadFor(EF, 1);
liveWithRubric.couplingRubric = structuredClone(EC.SAMPLE_XI_RUBRIC_SCORES);
const liveRubricLoad = EF.loadDataset(liveWithRubric);
assert(liveRubricLoad.ok, `LIVE dataset with valid couplingRubric should load: ${liveRubricLoad.error || ''}`);
const liveRubricData = EF.buildDataset('cumulative');
assert(liveRubricData.couplingStatus.available, 'LIVE couplingRubric must enable COUPLING');
assert(
  JSON.stringify(liveRubricData.coupling) === JSON.stringify([null, null, 2.4, 1.9, null, 2.9, 2.9, 1.9, null]),
  `A-level LIVE rubric must use the same contract with A evidence coefficient, got ${JSON.stringify(liveRubricData.coupling)}`
);
assert(
  EC.computeStationCoupling('E06', { X4: 3 }, 3, 'A') === 2.9,
  'contract must apply stable decimal half-up rounding: 3 × 1.0 × 0.95 = 2.85 → 2.9'
);

const invalidRubric = payloadFor(EF, 1);
invalidRubric.couplingRubric = structuredClone(EC.SAMPLE_XI_RUBRIC_SCORES);
invalidRubric.couplingRubric.cumulative.perEnv.E06.X4 = 5;
assert(
  !EF.loadDataset(invalidRubric).ok,
  'LIVE couplingRubric must reject local Xi values outside the 0–4 contract range'
);

const dataRender = read('shared/data-render.js');
assert(
  /function\s+resolveCouplingArr[\s\S]*?return data\?\.coupling \|\| \[\]/.test(dataRender) &&
    /function\s+resolveBridgeArr[\s\S]*?return data\?\.bridges \|\| \[\]/.test(dataRender) &&
    !/EF\.ENV_COUPLING_X/.test(dataRender),
  'data-render must consume the dataset contract result without a LIVE/sample switch or legacy X table'
);
assert(
  /function\s+renderQueue/.test(dataRender) && /pp\.dataActions/.test(dataRender),
  'data-render must render queue from active data and persist queue actions'
);
assert(
  /function\s+renderEnvRubrics/.test(dataRender) &&
    /DIM_RUBRICS_DEFERRED/.test(dataRender) &&
    /不能用页面上的增量 Δ 直接反推当前档位/.test(dataRender),
  'environment drawer must expose rubric anchors on demand without mapping delta values to absolute levels'
);
assert(
  /associationSummary/.test(dataRender) &&
    /覆盖/.test(dataRender) &&
    !/const couplingIndex = \(couplingArr \|\| \[\]\)\.reduce/.test(dataRender) &&
    !/const tPts =/.test(dataRender) &&
    !/const sPts =/.test(dataRender),
  'overview must use association mean plus coverage and must not fabricate interpolated trajectories'
);
assert(
  /measurementMode === 'missing'/.test(dataRender) && /未导入观测/.test(dataRender),
  'student node rendering must expose missing observations explicitly'
);

const dataHtml = read('data-detail.html');
const contractPos = dataHtml.indexOf('shared/evaluation-contract.js');
const frameworkPos = dataHtml.indexOf('shared/evaluation-framework.js');
assert(
  contractPos >= 0 && frameworkPos >= 0 && contractPos < frameworkPos,
  'evaluation-contract must load before framework so persisted LIVE rubrics validate on startup'
);
assert(
  /\.ed-rubric-summary\s*\{/.test(dataHtml) &&
    /\.ed-rubric-summary:focus-visible\s*\{/.test(dataHtml) &&
    /evaluation-framework\.js\?v=14-measurement-contract/.test(dataHtml) &&
    /data-render\.js\?v=18-measurement-state/.test(dataHtml),
  'rubric disclosure must be styled, keyboard-visible, and cache-busted'
);
assert(
  !/COUPLING\(env[^<]*=\s*√/.test(dataHtml) &&
    /COUPLING\(env\) = mean\(X2–X5 适用评价指标\) × 证据系数 × X1 全局系数/.test(dataHtml),
  'data-detail must publish only the rubric-based COUPLING formula'
);
assert(
  /X4=3\.0 × 证据系数 B=0\.80 × 全局系数 X1\(3\.0\)=0\.95 = 2\.3/.test(dataHtml) &&
    /X2=2\.5 × 证据系数 B=0\.80 × 全局系数 X1\(3\.0\)=0\.95 = 1\.9/.test(dataHtml),
  'static lede cards must expose a reproducible rubric equation for their displayed COUPLING values'
);
assert(
  !/<path class="bridge-path/.test(dataHtml) &&
    /EV0 基线与 EV4 待接入节点不画线/.test(dataHtml),
  'static HTML must fail closed instead of shipping stale/dead coupling paths'
);
assert(
  /data-event="EV0"[\s\S]*?node-evidence lv-B/.test(dataHtml),
  'static EV0 badge must match the B-level virtual rehearsal baseline'
);
assert(
  /S5 方案设计与可行性评估/.test(dataHtml) &&
    /T8 反思改进/.test(dataHtml) && /S7 反思调节/.test(dataHtml),
  'static dimension legend must use the corrected S5, T8, and S7 constructs'
);
assert(
  /schemaVersion:\s*EF\.LIVE_SCHEMA_VERSION/.test(dataHtml) &&
    /buildMeasurementPair/.test(dataHtml) &&
    /measurementMeta/.test(dataHtml),
  'downloaded LIVE template must use the v2 baseline/current measurement contract with metadata'
);
assert(
  !/COUPLING INDEX/.test(dataHtml) &&
    !/\+9\.5/.test(dataHtml) &&
    /环节—证据关联均值/.test(dataHtml) && /覆盖 <b>5\/9<\/b>/.test(dataHtml),
  'static overview must not publish the additive coupling index'
);
assert(
  (dataHtml.match(/<button type="button" class="ab-chip is-dim-tag [^"]*" data-dim="[TS]\d"/g) || []).length === 15,
  'all 15 dimension chips must be buttons carrying data-dim for the rubric popover'
);
assert(
  /id="dimPopover" hidden role="dialog"/.test(dataHtml) &&
    /function\s+bindDimRubricPopovers/.test(dataRender),
  'dimension rubric popover container and binder must exist'
);

const evidenceText = JSON.stringify(EF.ENV_EVIDENCE);
assert(
  !/COUPLING(?:=|\s)\d+(?:\.\d+)?/.test(evidenceText),
  'ENV_EVIDENCE must not hard-code active COUPLING numbers'
);
assert(
  !EF.ENV_EVIDENCE.E05.teacher.join(' ').includes('什么是 SWOT') &&
    !EF.ENV_EVIDENCE.E08.teacher.join(' ').includes('评价标准增加'),
  'E05 and E08 evidence must not copy E03/E07 narratives'
);
assert(
  /\{\{BASELINE_MEAN\}\}/.test(EF.ENV_EVIDENCE.E01.student.join(' ')) &&
    /\{\{T7_RANK\}\}/.test(EF.ENV_EVIDENCE.E07.teacher.join(' ')),
  'baseline and ranking claims must be runtime-derived tokens'
);
assert(
  /\.summary-row\s*\{[^}]*min-width:\s*0/s.test(dataHtml) &&
    /\.s-cell\s*\{[^}]*min-width:\s*0/s.test(dataHtml),
  'mobile summary cards must be allowed to shrink without page-level overflow'
);
assert(
  !/data-live="teachers" data-baseline="17">17<\/span> 教师 LIVE/.test(dataHtml),
  'data-detail top strip must not label same-browser tab count as teacher LIVE'
);
assert(
  /\.station-numbers \.num-cell \.cn\s*\{[^}]*writing-mode:\s*horizontal-tb[^}]*text-wrap:\s*balance/s.test(dataHtml) &&
    !/\.station-numbers \.num-cell \.cn\s*\{[^}]*writing-mode:\s*vertical-rl/s.test(dataHtml),
  'long station names must use balanced multi-line text instead of a single vertical column'
);
assert(
  !/\.station-numbers \.num-cell\.is-env-(?:co|solo)::after\s*\{/.test(dataHtml) &&
    !/\.station-numbers \.num-cell\.is-env-co::before\s*\{/.test(dataHtml),
  'teacher axis must not repeat ambiguous teacher/co-presence markers above each station'
);
assert(
  /class="av t" aria-hidden="true">\s*<svg/.test(dataHtml) &&
    /class="av" aria-hidden="true">\s*<svg/.test(dataHtml) &&
    /class="ll">环节—证据关联<small>/.test(dataHtml) &&
    !/class="bridge-icon"/.test(dataHtml),
  'teacher/student axes keep their markers while the association channel uses a compact Chinese legend'
);
assert(
  /\.coupling-bridge \.bridge-track\s*\{[^}]*height:\s*56px/s.test(dataHtml) &&
    /<svg viewBox="0 0 900 56"/.test(dataHtml),
  'association channel must remain visually subordinate at 56px high'
);
assert(
  /\.event-node \.node-evidence\s*\{[^}]*width:\s*18px[^}]*height:\s*18px[^}]*line-height:\s*1[^}]*overflow:\s*hidden/s.test(dataHtml),
  'A/B/C evidence badges must remain centered and clipped inside their node cards'
);
assert(
  /class="evidence-key"[^>]*aria-label="A、B、C 证据等级说明"/.test(dataHtml) &&
    /强证据 · 真实课堂与多源材料/.test(dataHtml) &&
    /中强证据 · 虚拟演练与行为\/版本记录/.test(dataHtml) &&
    /弱证据 · 单一日志或作品，待验证/.test(dataHtml),
  'student nodes must expose an in-context legend for evidence levels A, B, and C'
);
const atlasHeader = dataHtml.match(/<section class="atlas-section">([\s\S]*?)<div class="bi-atlas">/)?.[1] || '';
assert(
  (atlasHeader.match(/<p\b/g) || []).length === 1 &&
    /<p class="atlas-intro">这是教学设计预演，不是真实学习成效测量。/.test(atlasHeader) &&
    !/先说这是什么|完整评价框架见下方面板/.test(atlasHeader),
  'atlas introduction must stay to one concise paragraph before the chart'
);
assert(
  /data\.isLive[\s\S]*当前显示已接入的前后测分差/.test(dataRender),
  'atlas introduction must switch from sample-preview copy to LIVE measurement copy'
);
assert(
  /if \(!bridges\.length\)[\s\S]*svg\.setAttribute\('aria-label', data\?\.couplingStatus\?\.reason/.test(dataRender) &&
    (dataRender.match(/setSpark\([^\n]*当前未计算环节关联/g) || []).length >= 2,
  'empty LIVE association state must clear stale bridge and summary-chart accessibility labels'
);
assert(
  !/<meta name="description"[^>]*师生耦合指数/.test(dataHtml),
  'page metadata must not advertise a retired additive coupling index'
);

console.log('verify-data-detail: ok');
