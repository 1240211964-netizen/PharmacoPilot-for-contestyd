// 真模型端到端：设计摘要 → 生成完整实践包 → 五路学科审校，产出落盘 output/playwright/live-review-run.json
// 用法: node tools/live-review-run.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const API = "http://127.0.0.1:4173/api";
const captured = JSON.parse(readFileSync(resolve(root, "output/playwright/review-request-capture.json"), "utf8"));

const context = {
  chapterId: "mp-ch3-environment",
  courseTitle: "《管理学原理》",
  courseLevel: "本科",
  classTitle: "2025 级药事管理 1 班",
  studentCount: 33,
  sessionTitle: "第 5 周 · 周一 1-2 节",
  durationMinutes: 90,
  chapterTitle: "第 3 章 · 管理环境与战略分析",
  topic: "医药组织环境分析与 SWOT/TOWS",
};

async function post(path, body, timeoutMs = 300_000) {
  const started = Date.now();
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* 保留原文 */ }
  return { httpStatus: res.status, ms: Date.now() - started, json, raw: json ? null : text.slice(0, 2000) };
}

const out = { startedAt: new Date().toISOString(), context, generate: null, reviews: [] };

console.error("[1/2] 生成完整实践包…");
out.generate = await post("/practice/generate", { context, designBriefs: captured.briefs });
const pack = out.generate.json?.pack;
if (!pack) {
  console.error("生成失败：", JSON.stringify(out.generate).slice(0, 1200));
  writeFileSync(resolve(root, "output/playwright/live-review-run.json"), JSON.stringify(out, null, 2));
  process.exit(1);
}
console.error(`  实践包就绪 ${out.generate.ms}ms · env 长度 ${Object.values(pack).map((v) => String(v).length).join("/")}`);

const reviewers = ["pharmacy-context", "management-tradeoff", "regulatory-citation", "instructional-design", "evidence-metrics"];
console.error("[2/2] 五路审校（并发 2）…");
const queue = [...reviewers];
async function worker() {
  while (queue.length) {
    const reviewerId = queue.shift();
    const r = await post("/practice/reviews", { reviewerId, sourceRevision: 0, context, currentPack: pack });
    out.reviews.push({ reviewerId, ...r });
    const j = r.json || {};
    console.error(`  ${reviewerId}: ${r.httpStatus} ${j.status || ""} ${j.gate?.reason ? `gate=${j.gate.reason}` : ""} attempts=${j.attempts ?? "?"} ${r.ms}ms`);
  }
}
await Promise.all([worker(), worker()]);

out.finishedAt = new Date().toISOString();
const file = resolve(root, "output/playwright/live-review-run.json");
writeFileSync(file, JSON.stringify(out, null, 2));
console.log(JSON.stringify({ file, reviews: out.reviews.map((r) => ({ reviewerId: r.reviewerId, httpStatus: r.httpStatus, status: r.json?.status, gate: r.json?.gate?.reason || null, attempts: r.json?.attempts ?? null, ms: r.ms })) }, null, 2));
