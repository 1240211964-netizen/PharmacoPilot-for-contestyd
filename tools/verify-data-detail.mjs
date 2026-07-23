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
  vm.runInNewContext(read('shared/evaluation-framework.js'), context, {
    filename: 'shared/evaluation-framework.js',
  });
  return context.window.PharmacoPilotEvaluationFramework;
}

function dimBlock(ids, value) {
  return Object.fromEntries(ids.map((id) => [id, value]));
}

function payloadFor(EF, value) {
  const teacher = {};
  const student = {};
  for (const mode of ['cumulative', 'weekly', 'single']) {
    teacher[mode] = dimBlock(EF.TEACHER_DIMS.map((d) => d.id), value);
    student[mode] = dimBlock(EF.STUDENT_DIMS.map((d) => d.id), value);
  }
  return { label: `verify ${value}`, evidenceLevel: 'A', teacher, student };
}

const EF = loadFramework();

const partial = {
  label: 'partial',
  evidenceLevel: 'A',
  teacher: { cumulative: dimBlock(EF.TEACHER_DIMS.map((d) => d.id), 1) },
  student: { cumulative: dimBlock(EF.STUDENT_DIMS.map((d) => d.id), 1) },
};
assert(!EF.loadDataset(partial).ok, 'LIVE dataset must reject missing weekly/single modes');

const overRange = payloadFor(EF, 99);
assert(!EF.loadDataset(overRange).ok, 'LIVE dataset must reject values above 10');

const zero = EF.loadDataset(payloadFor(EF, 0));
assert(zero.ok, `zero dataset should be valid: ${zero.error || ''}`);
const zeroData = EF.buildDataset('cumulative');
assert(zeroData.teacherTotal === '+0.0%', `zero teacher total should be +0.0%, got ${zeroData.teacherTotal}`);
assert(zeroData.studentTotal === '+0.0%', `zero student total should be +0.0%, got ${zeroData.studentTotal}`);
assert(
  zeroData.coupling.every((v) => v == null || v === 0),
  `zero dataset coupling should be null/0, got ${JSON.stringify(zeroData.coupling)}`
);

const dataRender = read('shared/data-render.js');
assert(
  /function\s+resolveCouplingArr/.test(dataRender) && /data\.isLive/.test(dataRender),
  'data-render must resolve coupling from LIVE dataset before sample contract'
);
assert(
  /function\s+renderQueue/.test(dataRender) && /pp\.dataActions/.test(dataRender),
  'data-render must render queue from active data and persist queue actions'
);

const dataHtml = read('data-detail.html');
assert(
  /\.summary-row\s*\{[^}]*min-width:\s*0/s.test(dataHtml) &&
    /\.s-cell\s*\{[^}]*min-width:\s*0/s.test(dataHtml),
  'mobile summary cards must be allowed to shrink without page-level overflow'
);
assert(
  !/data-live="teachers" data-baseline="17">17<\/span> 教师 LIVE/.test(dataHtml),
  'data-detail top strip must not label same-browser tab count as teacher LIVE'
);

console.log('verify-data-detail: ok');
