#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const skippedDirectories = new Set([".git", "node_modules", "output", ".playwright-cli"]);
const textExtensions = new Set([".css", ".html", ".js", ".json", ".md", ".mjs"]);
const retiredTerm = "\u91cf\u89c4";
const hits = [];

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
console.log("verify-terminology: ok");
