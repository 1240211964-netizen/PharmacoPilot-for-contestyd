#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = path.resolve(import.meta.dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const expected = [
  ["S1", "学习者与教学情境分析", "学习者与教学情境分析"],
  ["S2", "预期学习结果与评价证据设计", "预期学习结果与评价证据设计"],
  ["S3", "教学内容结构化与前概念诊断", "教学内容结构化与前概念诊断"],
  ["S4", "真实性学习情境与资源设计", "真实性学习情境与资源设计"],
  ["S5", "学习活动与教学支架设计", "学习活动与教学支架设计"],
  ["S6", "形成性评价与适应性调控", "形成性评价与适应性调控"],
  ["S7", "表现性评价与学习成效诊断", "表现性评价与学习成效诊断"],
  ["S8", "反思性实践与教学改进", "反思性实践与教学改进"],
  ["S9", "教学知识建构与专业共享", "教学知识建构与专业共享"],
];

const contractContext = { window: {} };
vm.runInNewContext(read("shared/nav-stations-contract.js"), contractContext, {
  filename: "shared/nav-stations-contract.js",
});
const stages = contractContext.window.PharmacoPilotNavigationContract.NAV_STAGES;
const actualStages = JSON.parse(JSON.stringify(stages.map((stage) => [stage.id, stage.title, stage.shortLabel])));
assert.deepEqual(actualStages, expected, "NAV_STAGES must use Pharmacopilot 0801 canonical full titles in every label field");
assert.equal(
  stages.some((stage) => Object.prototype.hasOwnProperty.call(stage, "displayName")),
  false,
  "NAV_STAGES must use shortLabel instead of the ambiguous displayName field",
);

const storage = new Map();
const frameworkContext = {
  console,
  CustomEvent: class CustomEvent {
    constructor(type, init) { this.type = type; this.detail = init && init.detail; }
  },
  window: { dispatchEvent() {}, addEventListener() {} },
  localStorage: {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) { storage.set(key, String(value)); },
    removeItem(key) { storage.delete(key); },
  },
};
frameworkContext.window.localStorage = frameworkContext.localStorage;
vm.runInNewContext(read("shared/evaluation-framework.js"), frameworkContext, {
  filename: "shared/evaluation-framework.js",
});
const environments = frameworkContext.window.PharmacoPilotEvaluationFramework.ENVIRONMENTS;
const actualEnvironments = JSON.parse(JSON.stringify(environments.map((env, index) => [
  `S${index + 1}`,
  env.name,
  env.short,
])));
assert.deepEqual(actualEnvironments, expected, "evaluation framework labels must match the navigation contract");

const fallback3d = read("nav-3d.html");
for (const [id, title] of expected) {
  assert.match(fallback3d, new RegExp(`${id} · ${title}`), `3D fallback list is missing ${id} canonical title`);
}

const renderer = read("shared/nav-render.js");
assert.match(renderer, /pill pill-amber[^`]*\$\{esc\(stage\.title\)\}/, "detail badge must expose the canonical title");
assert.match(renderer, /class="node-title">\$\{esc\(g\.title\)\}<\/span>/, "primary stage navigation must render canonical titles");
assert.match(renderer, /class="ci-live" title="你在上游环节的实际判断"/, "upstream live judgment must use the dedicated layout hook");
assert.doesNotMatch(renderer, /class="ci-live"[^>]*style=/, "upstream live judgment must not carry layout-breaking inline styles");
assert.match(renderer, /class="chain-out-summary"/, "downstream count and links must be grouped separately");
assert.match(renderer, /class="chain-out-links"/, "downstream links must have a wrapping layout container");
assert.match(renderer, /class="detail-tag-context"/, "detail context badges must remain grouped when the header wraps");
assert.match(renderer, /aria-label="环节 \$\{String\(idx\)\.padStart\(2, "0"\)\} · \$\{esc\(g\.title\)\}"/, "primary stage navigation must expose canonical accessible names");
assert.match(renderer, /aria-current="step"/, "the active primary stage navigation item must be announced as current");
assert.match(renderer, /navigation\.toggleAttribute\("inert", hidden\)/, "the closed mobile stage drawer must not leave hidden controls focusable");
assert.match(renderer, /matchMedia\("\(max-width: 1180px\)"\)/, "tablet layout and drawer behavior must share the same breakpoint");
assert.match(renderer, /document\.addEventListener\("click", \(e\) => \{[\s\S]*#stageNavigation \[data-stage\][\s\S]*\}, true\)/, "selecting a stage in the mobile drawer must close it before the global route redraws the list");
assert.doesNotMatch(renderer, /function renderStageChips\(/, "the retired duplicate stage-chip navigation must not be rendered");
assert.doesNotMatch(read("nav-detail.html"), /id="stageChips"/, "top overview must not duplicate the primary stage navigation");
assert.match(read("nav-detail.html"), /nav-detail\.bundle\.js\?v=23-s1-decision-sheet/, "navigation bundle cache key must expose the S1 structured decision-sheet revision");
assert.match(read("nav-detail.html"), /class="seg-label">课中 · <b>实施<\/b><\/span>/, "phase labels must stay grouped instead of collapsing into vertical text");
assert.match(read("nav-detail.html"), /class="mast-actions"/, "masthead actions need a responsive layout hook");
assert.match(renderer, /当前 · <b>\$\{stagePadIdx\}<\/b>/, "top progress must identify the current stage rather than imply multiple stages are in progress");
assert.doesNotMatch(renderer, /\$\{stagePadIdx\} 进行中/, "top progress must not label a stage number as an in-progress count");
assert.match(renderer, /已完成 \$\{stageCounts\(\)\.done\} \/ \$\{TOTAL_STAGES\}/, "primary navigation progress must name its completion denominator");
assert.match(read("nav-detail.html"), /课中 · <b>实施<\/b>/, "top phase label must use the same concise 课中 wording as primary navigation");

const bridge = read("shared/nav-render-store-bridge.js");
assert.match(bridge, /\$\{g\.tag\} · \$\{g\.title\}/, "plan export must use canonical titles");
assert.match(bridge, /已完成 \$\{sp\.done\} \/ \$\{sp\.total\}/, "store-driven navigation progress must retain the completion label");

for (const rel of ["index.html", "practice-detail.html", "data-detail.html"]) {
  const source = read(rel);
  for (const [, title] of expected) {
    assert.ok(source.includes(title), `${rel} is missing canonical full stage title ${title}`);
  }
  assert.ok(!source.includes("表现性评价与学习成效诊断与学习成效诊断"), `${rel} contains a duplicated stage-title suffix`);
}

const dataDetail = read("data-detail.html");
for (const [, title] of expected) {
  assert.ok(dataDetail.includes(`<span class="cn">${title}</span>`), `data-detail.html full stage title missing: ${title}`);
}

for (const rel of ["shared/practice-runtime.js", "shared/data-render.js"]) {
  const source = read(rel);
  for (const [, title] of expected) {
    assert.ok(source.includes(title), `${rel} is missing runtime full stage title ${title}`);
  }
}

const agentPrompts = read("server/agents.mjs");
for (const [, title] of expected) {
  assert.ok(agentPrompts.includes(title), `server agent prompts are missing canonical title ${title}`);
}

console.log("verify-stage-names: ok");
