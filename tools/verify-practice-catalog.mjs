#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = path.resolve(import.meta.dirname, "..");
const source = fs.readFileSync(path.join(root, "shared/practice-runtime.js"), "utf8");
const start = source.indexOf("const SEMESTER_WEEKS = ");
const end = source.indexOf("\n\n  let wizSelection", start);
assert.ok(start >= 0 && end > start, "WIZ_DATA catalog must remain statically inspectable");

const context = {};
vm.runInNewContext(
  `${source.slice(start, end)}\nglobalThis.__catalog = WIZ_DATA; globalThis.__semesterWeeks = SEMESTER_WEEKS;`,
  context,
  { filename: "shared/practice-runtime.js#WIZ_DATA" },
);
const catalog = context.__catalog;
const semesterWeeks = context.__semesterWeeks;

const expectedCourses = [
  ["pharm-admin", "《药事管理学》", "本科", "2024 级"],
  ["clinical-pharm", "《临床药学》", "本科", "2023 级"],
  ["pharm-regulation", "《药事法规与监管》", "本科", "2024 级"],
  ["management-principles", "《管理学原理》", "本科", "2025 级"],
  ["pharmacy-retail", "《药店经营管理》", "本科", "2023 级"],
  ["gxp-practicum", "《GXP实训》", "本科实训", "2023 级"],
];

const expectedManagementChapters = [
  "第 1 章 · 管理与管理学",
  "第 2 章 · 管理理论的产生与发展",
  "第 3 章 · 管理环境与战略分析",
  "第 4 章 · 决策",
  "第 5 章 · 计划",
  "第 6 章 · 组织设计与组织变革",
  "第 7 章 · 人员配备与人力资源管理",
  "第 8 章 · 领导、激励与沟通",
  "第 9 章 · 控制、风险与创新",
];

assert.deepEqual(
  JSON.parse(JSON.stringify(catalog.courses.map(({ id, title, level, cohort }) => [id, title, level, cohort]))),
  expectedCourses,
  "practice catalog course list must match the six intended courses",
);

assert.equal(semesterWeeks, 18, "a semester must run from week 1 through the week 18 final week");
assert.deepEqual(
  JSON.parse(JSON.stringify(catalog.chaptersByCourse["management-principles"].map((item) => item.title))),
  expectedManagementChapters,
  "management-principles chapter names must follow the management-function syllabus",
);
assert.equal(
  catalog.sessionsByCourse["management-principles"].find((item) => item.id === "mp-w05")?.chapterId,
  "mp-ch3-environment",
  "the default SWOT session must link week 5 to chapter 3",
);
assert.match(source, /course:\s*"management-principles"[\s\S]*session:\s*"mp-w05"[\s\S]*chapter:\s*"mp-ch3-environment"/, "the practice wizard must default to the SWOT chapter");

const globalSessionAndChapterIds = [];
for (const [courseId, , , cohort] of expectedCourses) {
  const classes = catalog.classesByCourse[courseId];
  const sessions = catalog.sessionsByCourse[courseId];
  const chapters = catalog.chaptersByCourse[courseId];
  assert.equal(classes.length, 2, `${courseId} must expose the two pharmacy-management classes in one cohort`);
  assert.ok(classes.every((item) => item.title.includes("药事管理")), `${courseId} must be limited to pharmacy-management classes`);
  assert.deepEqual(
    [...new Set(classes.map((item) => item.title.match(/^(\d{4}) 级/)?.[1]))],
    [cohort.replace(" 级", "")],
    `${courseId} cannot mix grade cohorts in one semester`,
  );
  assert.equal(sessions.length, semesterWeeks, `${courseId} requires week 1 through the final week`);
  assert.deepEqual([...sessions.map((item) => item.week)], Array.from({ length: semesterWeeks }, (_, index) => index + 1));
  assert.match(sessions.at(-1).title, /第 18 周（期末周）/, `${courseId} must label the final week`);
  assert.equal(chapters.length, 9, `${courseId} requires nine two-week teaching units`);
  assert.ok(sessions.every((item) => chapters.some((chapter) => chapter.id === item.chapterId)), `${courseId} sessions must link to valid chapters`);
  assert.ok(sessions.every((item, index) => index % 2 || item.chapterId === sessions[index + 1].chapterId), `${courseId} chapter plan must advance in two-week units`);
  if (courseId === "gxp-practicum") {
    assert.ok(sessions.every((item) => item.min === 180), "GXP practicum sessions must use four-period blocks");
  } else {
    assert.ok(sessions.every((item) => item.min === 90), `${courseId} sessions must use two-period 90-minute blocks`);
  }
  for (const items of [classes, sessions, chapters]) {
    const ids = items.map((item) => item.id);
    assert.equal(new Set(ids).size, ids.length, `${courseId} contains duplicate option ids`);
  }
  globalSessionAndChapterIds.push(...sessions, ...chapters);
}

const ids = globalSessionAndChapterIds.map((item) => item.id);
assert.equal(new Set(ids).size, ids.length, "session and chapter ids must be globally unique");
assert.match(source, /WIZ_DATA\.sessionsByCourse\[c\]/, "session chips must update with the selected course");
assert.match(source, /chaptersForSession\(courseId, wizSelection\.session\)/, "chapter chips must update with the selected session");
assert.match(source, /disabledOf: \(item\) => !availableChapterIds\.has\(item\.id\)/, "chapters outside the selected session must be locked");
assert.match(source, /renderChips\("chapter", allChapters/, "chapter selector must display the complete course catalog");
assert.doesNotMatch(source, /WIZ_DATA\.sessions\b/, "the obsolete global session list must not be used");

const page = fs.readFileSync(path.join(root, "practice-detail.html"), "utf8");
assert.ok(page.includes("全部显示 · 非本课时锁定"), "practice page must explain the chapter lock behavior");
assert.doesNotMatch(page, /class="fanya-lnk"/, "the classroom practice pack preview must not expose a Fanya link");
assert.match(page, /课堂教学设计摘要/, "the nine-card input must be named as a design summary, not a finished practice pack");
assert.match(page, /data-brief-field="env01"/, "design summary cards must expose editable generation briefs");
assert.match(page, /完整课堂实践包/, "the generated practice pack must have a separate output surface");
assert.match(page, /data-pack-workspace/, "design briefs and generated output must share one stateful workspace");
for (const view of ["briefs", "generating", "output"]) {
  assert.match(page, new RegExp(`data-pack-panel="${view}"`), `practice workspace must expose the ${view} state`);
}
assert.match(page, /data-pack-edit-briefs/, "generated output must expose a compact return-to-briefs control");
assert.match(page, /data-pack-return-output/, "brief editing must allow returning to the existing generated pack");
assert.match(source, /startViewTransition/, "practice workspace state changes must use a view transition when supported");
assert.match(source, /prefers-reduced-motion: reduce/, "practice workspace motion must respect reduced-motion preferences");
assert.doesNotMatch(source, /if \(!preview \|\| preview\.hidden\) return null/, "a collapsed generated pack must remain available to review and export logic");
for (const format of ["docx", "pdf", "md", "zip"]) {
  assert.match(page, new RegExp(`data-pack-export="${format}"`), `generated pack must expose ${format} download`);
}
const env01Start = page.indexOf('<div class="pack-item" data-env="01">');
const env02Start = page.indexOf('<div class="pack-item" data-env="02">', env01Start);
assert.ok(env01Start >= 0 && env02Start > env01Start, "practice page must contain ordered env01 and env02 cards");
assert.match(page.slice(env01Start, env02Start), /class="env-count"/, "env01 must expose the same runtime count target as env02-env09");

const builderStart = source.indexOf("function buildEnvPackContent(chapter, mock)");
const builderEnd = source.indexOf("\n  }\n\n  // ============================================================", builderStart);
assert.ok(builderStart >= 0 && builderEnd > builderStart, "practice pack builder must remain statically inspectable");
const builderContext = {};
vm.runInNewContext(
  `${source.slice(builderStart, builderEnd + 4)}\nglobalThis.__buildEnvPackContent = buildEnvPackContent;`,
  builderContext,
  { filename: "shared/practice-runtime.js#buildEnvPackContent" },
);
const swotPack = builderContext.__buildEnvPackContent(
  { title: "第 3 章 · 管理环境与战略分析", topic: "医药组织环境分析与 SWOT/TOWS" },
  {
    tasks: "起步问题（围绕「医药组织环境分析与 SWOT/TOWS」开口） · 进阶问题 · 分歧锚点",
    roles: "教师 · 学生",
    rubric: "概念准确 · 证据引用",
    citations: "教材本章 · 政策原文 · 行业指南",
  },
);
assert.match(swotPack.env01, /SWOT\/TOWS/, "env01 must preserve the complete chapter topic");
assert.match(swotPack.env09, /SWOT\/TOWS/, "env09 must preserve the complete task label without a forced ellipsis");
assert.doesNotMatch(swotPack.env01 + swotPack.env09, /SW…/, "practice preview must not replace SWOT/TOWS with an ambiguous abbreviation");

console.log("verify-practice-catalog: ok");
