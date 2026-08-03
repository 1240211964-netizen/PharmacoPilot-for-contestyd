#!/usr/bin/env node
/* verify-stage2-groups 连跑包装（点击沉降时序修复的验收门禁）
 * 用法：node tools/verify-stage2-groups-repeat.mjs [--repeat N]（默认 5）
 * 每次以独立子进程完整重跑 tools/verify-stage2-groups.mjs；
 * 全部 exit 0 才算绿（避免"偶发绿偶发红"蒙混），任一失败即 exit 1。
 */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rIdx = process.argv.indexOf("--repeat");
const N = rIdx >= 0 ? Number(process.argv[rIdx + 1]) : 5;
if (!Number.isInteger(N) || N < 1) {
  console.error("用法：node tools/verify-stage2-groups-repeat.mjs [--repeat N]（N ≥ 1）");
  process.exit(1);
}

let failures = 0;
for (let i = 1; i <= N; i++) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [resolve(root, "tools/verify-stage2-groups.mjs")], {
    cwd: root,
    stdio: ["ignore", "pipe", "inherit"],
    encoding: "utf8",
  });
  const ok = r.status === 0;
  console.log(`[repeat ${i}/${N}] ${ok ? "✓ 绿" : `✗ 红 (exit ${r.status})`} · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  if (!ok) {
    failures++;
    const tail = (r.stdout || "").trim().split("\n").slice(-12).join("\n");
    if (tail) console.log(tail);
  }
}
console.log(failures === 0 ? `\n✓ verify-stage2-groups ${N} 连全绿` : `\n✗ verify-stage2-groups ${failures}/${N} 次失败`);
process.exit(failures ? 1 : 0);
