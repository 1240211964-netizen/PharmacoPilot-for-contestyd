#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const baselinePath = path.join(root, "tools/color-token-baseline.json");
const args = new Set(process.argv.slice(2));

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (["vendor", "dist", "node_modules"].includes(entry.name)) return [];
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(abs);
    if (!/\.(?:css|js)$/.test(entry.name) || entry.name === "tokens.css") return [];
    return [abs];
  });
}

function productionFiles() {
  const html = fs.readdirSync(root)
    .filter((name) => name.endsWith(".html") && !name.endsWith("-draft.html"))
    .map((name) => path.join(root, name));
  return [...html, ...walk(path.join(root, "shared"))].sort();
}

function stripComments(source) {
  const chars = [...source];
  let quote = "";
  let escaped = false;
  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i];
    const next = chars[i + 1];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === quote) quote = "";
      continue;
    }
    if (ch === "\"" || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "/" && next === "*") {
      chars[i] = chars[i + 1] = " ";
      i += 2;
      while (i < chars.length && !(chars[i] === "*" && chars[i + 1] === "/")) {
        if (chars[i] !== "\n") chars[i] = " ";
        i += 1;
      }
      if (i < chars.length) {
        chars[i] = chars[i + 1] = " ";
        i += 1;
      }
    } else if (ch === "/" && next === "/") {
      chars[i] = chars[i + 1] = " ";
      i += 2;
      while (i < chars.length && chars[i] !== "\n") {
        chars[i] = " ";
        i += 1;
      }
    }
  }
  return chars.join("");
}

function htmlZones(source) {
  const zones = [];
  const masked = [...source];
  const blockRe = /<(style|script)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  for (const match of source.matchAll(blockRe)) {
    const content = match[2];
    const contentOffset = match.index + match[0].indexOf(content);
    zones.push({ text: content, offset: contentOffset });
    for (let i = match.index; i < match.index + match[0].length; i += 1) {
      if (masked[i] !== "\n") masked[i] = " ";
    }
  }
  const maskedSource = masked.join("");
  for (const match of maskedSource.matchAll(/<(?!\/)[^>]+>/g)) {
    zones.push({ text: match[0], offset: match.index });
  }
  return zones;
}

function normalizeHex(raw) {
  const value = raw.toLowerCase();
  if (value.length === 4 || value.length === 5) {
    return `#${[...value.slice(1)].map((ch) => ch + ch).join("")}`;
  }
  return value;
}

function normalizeFunctional(raw) {
  return raw.toLowerCase()
    .replace(/\s+/g, "")
    .replace(/([,(])\.(\d+)/g, "$10.$2");
}

function lineAt(source, index) {
  return source.slice(0, index).split("\n").length;
}

function scanZone(zone, source, rel, matches, fallbacks) {
  const cleaned = stripComments(zone.text);
  const colorPatterns = [
    { type: "hex", re: /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{4}|[0-9a-f]{3})(?![0-9a-f])/gi, normalize: normalizeHex },
    { type: "functional", re: /\b(?:rgba?|hsla?)\([^()]*\)/gi, normalize: normalizeFunctional },
  ];
  for (const { type, re, normalize } of colorPatterns) {
    for (const match of cleaned.matchAll(re)) {
      const absolute = zone.offset + match.index;
      matches.push({
        type,
        raw: match[0],
        value: normalize(match[0]),
        file: rel,
        line: lineAt(source, absolute),
      });
    }
  }

  const fallbackRe = /var\(\s*(--[\w-]+)\s*,\s*(#(?:[0-9a-f]{3,8})\b|(?:rgba?|hsla?)\([^()]*\))/gi;
  for (const match of cleaned.matchAll(fallbackRe)) {
    const absolute = zone.offset + match.index;
    const color = match[2].startsWith("#") ? normalizeHex(match[2]) : normalizeFunctional(match[2]);
    fallbacks.push({
      value: `${match[1]}=>${color}`,
      file: rel,
      line: lineAt(source, absolute),
    });
  }
}

function countValues(items) {
  return Object.fromEntries(
    [...items.reduce((map, item) => map.set(item.value, (map.get(item.value) || 0) + 1), new Map())]
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}

function snapshot() {
  const allMatches = [];
  const allFallbacks = [];
  const files = {};
  for (const abs of productionFiles()) {
    const rel = path.relative(root, abs);
    const source = fs.readFileSync(abs, "utf8");
    const zones = rel.endsWith(".html") ? htmlZones(source) : [{ text: source, offset: 0 }];
    const matches = [];
    const fallbacks = [];
    for (const zone of zones) scanZone(zone, source, rel, matches, fallbacks);
    const hex = matches.filter((item) => item.type === "hex");
    const functional = matches.filter((item) => item.type === "functional");
    files[rel] = {
      hex: hex.length,
      functional: functional.length,
      tokenFallbacks: fallbacks.length,
      unique: new Set(matches.map((item) => item.value)).size,
      values: countValues(matches),
      fallbackValues: countValues(fallbacks),
    };
    allMatches.push(...matches);
    allFallbacks.push(...fallbacks);
  }

  const inventory = [...allMatches.reduce((map, item) => {
    const current = map.get(item.value) || { value: item.value, type: item.type, count: 0, locations: [] };
    current.count += 1;
    current.locations.push(`${item.file}:${item.line}`);
    map.set(item.value, current);
    return map;
  }, new Map()).values()].sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));

  return {
    schemaVersion: 1,
    scope: {
      included: "root production HTML + shared CSS/JS",
      excluded: ["*-draft.html", "shared/tokens.css", "shared/vendor/**", "dist/**", "node_modules/**"],
      counted: ["hex", "rgb/rgba", "hsl/hsla", "color token fallbacks"],
    },
    totals: {
      files: Object.keys(files).length,
      hex: allMatches.filter((item) => item.type === "hex").length,
      functional: allMatches.filter((item) => item.type === "functional").length,
      occurrences: allMatches.length,
      unique: inventory.length,
      tokenFallbacks: allFallbacks.length,
    },
    files,
    inventory,
  };
}

function compareRatchet(current, baseline) {
  const failures = [];
  for (const [file, now] of Object.entries(current.files)) {
    const before = baseline.files[file];
    if (!before) {
      if (now.hex + now.functional + now.tokenFallbacks > 0) {
        failures.push(`${file}: 新生产文件必须从 0 裸色开始`);
      }
      continue;
    }
    for (const metric of ["hex", "functional", "tokenFallbacks", "unique"]) {
      if (now[metric] > before[metric]) failures.push(`${file}: ${metric} ${before[metric]} → ${now[metric]}`);
    }
    for (const [value, count] of Object.entries(now.values)) {
      const allowed = before.values[value] || 0;
      if (count > allowed) failures.push(`${file}: 新增裸色 ${value} (${allowed} → ${count})`);
    }
    for (const [value, count] of Object.entries(now.fallbackValues)) {
      const allowed = before.fallbackValues[value] || 0;
      if (count > allowed) failures.push(`${file}: 新增 token fallback ${value} (${allowed} → ${count})`);
    }
  }
  return failures;
}

function report(data) {
  const rows = Object.entries(data.files)
    .filter(([, value]) => value.hex + value.functional + value.tokenFallbacks > 0)
    .sort(([, a], [, b]) => (b.hex + b.functional) - (a.hex + a.functional));
  console.log(`color-token audit: ${data.totals.occurrences} raw colors / ${data.totals.unique} unique / ${data.totals.tokenFallbacks} token fallbacks`);
  for (const [file, value] of rows) {
    console.log(`${file.padEnd(43)} raw=${String(value.hex + value.functional).padStart(4)}  unique=${String(value.unique).padStart(3)}  fallback=${String(value.tokenFallbacks).padStart(3)}`);
  }
}

if (args.has("--self-test")) {
  const baseline = { files: { "x.js": { hex: 1, functional: 0, tokenFallbacks: 0, unique: 1, values: { "#aabbcc": 1 }, fallbackValues: {} } } };
  const decreased = { files: { "x.js": { hex: 0, functional: 0, tokenFallbacks: 0, unique: 0, values: {}, fallbackValues: {} } } };
  const newColor = { files: { "x.js": { hex: 1, functional: 0, tokenFallbacks: 0, unique: 1, values: { "#112233": 1 }, fallbackValues: {} } } };
  assert.deepEqual(compareRatchet(decreased, baseline), []);
  assert.ok(compareRatchet(newColor, baseline).some((line) => line.includes("新增裸色")));
  console.log("verify-color-tokens self-test: ok");
  process.exit(0);
}

const current = snapshot();
if (args.has("--write-baseline")) {
  const output = { generatedAt: new Date().toISOString(), ...current };
  fs.writeFileSync(baselinePath, `${JSON.stringify(output, null, 2)}\n`);
  report(current);
  console.log(`baseline written: ${path.relative(root, baselinePath)}`);
  process.exit(0);
}

if (args.has("--report")) report(current);
assert.ok(fs.existsSync(baselinePath), "缺少 tools/color-token-baseline.json，先运行 --write-baseline");
const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
assert.equal(baseline.schemaVersion, 1, "color token baseline schema 版本不支持");
const failures = compareRatchet(current, baseline);
assert.deepEqual(failures, [], `颜色 token 棘轮门禁失败:\n${failures.join("\n")}`);
console.log(`verify-color-tokens: ok (${current.totals.occurrences} raw / ${current.totals.unique} unique / ${current.totals.tokenFallbacks} fallbacks)`);
