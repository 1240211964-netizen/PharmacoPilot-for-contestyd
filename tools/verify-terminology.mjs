#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const skippedDirectories = new Set([".git", "node_modules", "output", ".playwright-cli"]);
const textExtensions = new Set([".css", ".html", ".js", ".json", ".md", ".mjs"]);
const retiredTerm = "\u91cf\u89c4";
const hits = [];
const productionUiFiles = [
  "index.html",
  "nav-detail.html",
  "practice-detail.html",
  "data-detail.html",
  "login.html",
  "nav-3d.html",
  "opening-story.html",
  "shared/nav-render.js",
  "shared/practice-runtime.js",
  "shared/practice-runtime-contract.js",
  "shared/metaverse-classroom.js",
  "shared/metaverse-classroom-3d.js",
  "shared/data-render.js",
];
const retiredUiLabels = [
  "KEY MOMENT",
  "PROFESSIONAL REVIEW DOSSIER",
  "TRIAL & EVIDENCE",
  "WRITE-BACK",
  "INFORMED BY",
  "STAGE OVERVIEW",
  "FIGURE ·",
  "· ACCOUNT",
  "· EMAIL",
  "· PASSWORD",
  "EXPERIMENTAL",
  "· INTERPRET",
  "· ACTION",
  "· EVIDENCE",
  "· SOURCE",
  "· VERIFY",
  "· FRAMEWORK",
  "SECTION ·",
  "FEATURE 0",
  "SESSION #",
  "VOL. ",
  ">Insights<",
  ">PROMPT<",
  "AI Agent",
  "Shot 0",
  "Opening Story",
  "本 demo",
  "常见问题 · FAQ",
  "· BASELINE",
  "No. 0",
  "Vol. ",
  "Issue 0",
  "45 min",
  "90 min",
];

function scan(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && skippedDirectories.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      scan(absolute);
      continue;
    }
    if (!textExtensions.has(path.extname(entry.name))) continue;
    const source = fs.readFileSync(absolute, "utf8");
    source.split(/\r?\n/).forEach((line, index) => {
      if (line.includes(retiredTerm)) hits.push(`${path.relative(root, absolute)}:${index + 1}`);
    });
  }
}

scan(root);
assert.deepEqual(hits, [], `retired evaluation term found in: ${hits.join(", ")}`);

const uiHits = [];
for (const relative of productionUiFiles) {
  const absolute = path.join(root, relative);
  const source = fs.readFileSync(absolute, "utf8")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\s+\/\/.*$/gm, "");
  source.split(/\r?\n/).forEach((line, index) => {
    for (const label of retiredUiLabels) {
      if (line.includes(label)) uiHits.push(`${relative}:${index + 1} [${label}]`);
    }
  });
}
assert.deepEqual(uiHits, [], `retired decorative English found in production UI: ${uiHits.join(", ")}`);

// 品牌名与英文副标不属于装饰性英文，不得随界面术语一起中文化。
for (const relative of [
  "index.html", "login.html", "opening-story.html",
  "nav-detail.html", "practice-detail.html", "data-detail.html",
]) {
  const source = fs.readFileSync(path.join(root, relative), "utf8");
  assert.match(source, /<span class="ed">for Pharmacy Education<\/span>/,
    `${relative} 必须保留 PharmacoPilot 英文品牌副标`);
}
console.log("verify-terminology: ok");
