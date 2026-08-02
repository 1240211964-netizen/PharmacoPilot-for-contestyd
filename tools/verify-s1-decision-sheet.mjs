import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const payload = read("shared/station1.payload.js");
const learnerPayload = read("shared/station2.payload.js");
const render = read("shared/nav-render.js");
const store = read("shared/pharmaco-store.js");
const bridge = read("shared/nav-render-store-bridge.js");

assert.match(payload, /decisionArtifactSeed:\s*\{/,
  "S1 must define a structured decision artifact seed");
for (const field of ["evidenceSummary", "aiSuggestion", "teacherDecision", "teachingActions", "hypothesis", "downstreamWrites"]) {
  assert.match(payload, new RegExp(`${field}:\\s*[\\[{]`), `S1 structured artifact must include ${field}`);
}
for (const target of ["S3", "S5", "S6", "S7"]) {
  assert.match(payload, new RegExp(`targetNode:\\s*"${target}"`), `S1 must define a writeback proposal for ${target}`);
}
assert.match(payload, /待验证假设，不代表已经产生教学效果/,
  "S1 hypothesis must retain a non-causal disclaimer");
assert.match(payload, /demoData:\s*true/,
  "prototype evidence must be labeled as demo data");

assert.match(render, /S1 学情诊断与教学情境判断单/,
  "S1 UI must use the Chinese structured artifact title");
for (const choice of ["accept", "accept_with_revision", "defer", "reject"]) {
  assert.match(render, new RegExp(`\\["${choice}",`), `teacher decision must expose ${choice}`);
}
assert.match(render, /validateS1DecisionForm/,
  "teacher confirmation must be validated before persistence");
assert.match(render, /s1DecisionMarkdown\(artifact\)/,
  "Markdown must be derived from the structured artifact");
assert.match(render, /S1-学情诊断与教学情境判断单\.md/,
  "S1 export must use the decision-sheet filename");

assert.match(store, /s1DecisionArtifact:\s*null/,
  "Store must own the structured S1 artifact");
assert.match(store, /需先由教师确认 S1 判断，才能写回后续环节/,
  "downstream writeback must be gated by teacher confirmation");
assert.match(store, /targetStationMap = \{ S3: 5, S5: 7, S6: 9, S7: 10 \}/,
  "writeback proposals must resolve to traceable target stations");
assert.match(store, /sourceVersion:\s*artifact\.version/,
  "written artifacts must preserve source version provenance");
assert.match(bridge, /currentStation === 1/,
  "generic Markdown artifact injection must be disabled for S1");

assert.doesNotMatch(learnerPayload, /主动 \+|被动 \+|S 与 T 互斥|同时为 S 与 T/,
  "S1 learner evidence must avoid stable engagement labels and the deprecated S/T scenario");
assert.match(learnerPayload, /低响应 \+ 基础待巩固/,
  "learner grouping must use temporary task-performance language");

console.log("verify-s1-decision-sheet: ok");
