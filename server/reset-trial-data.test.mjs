// reset-trial-data 工具行为测试:dry-run 不动文件、confirm 归档式重命名、
// 白名单外文件不碰、归档目标冲突时中止、重置后可被 migration 重建为全新库。
// 全部在临时目录内进行,绝不触碰真实 .pharmaco-data。
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { PharmacoDatabase } from "./db.mjs";
import {
  defaultDataDir,
  executePlan,
  formatPlan,
  planReset,
  RESET_WHITELIST,
} from "../tools/reset-trial-data.mjs";

function makeDataDir(files = ["pharmaco.sqlite", "pharmaco.sqlite-wal", "pharmaco.sqlite-shm"]) {
  const dir = mkdtempSync(join(tmpdir(), "pharmaco-reset-"));
  for (const name of files) writeFileSync(join(dir, name), `fake-${name}`);
  return dir;
}

test("dry-run(默认):只产出计划,目录内容一个字节不动", () => {
  const dir = makeDataDir();
  try {
    const before = readdirSync(dir).sort();
    const plan = planReset(dir, { now: new Date("2026-08-06T07:00:00.000Z") });
    assert.equal(plan.renames.length, 3);
    // 不调用 executePlan = dry-run;目录保持原样
    assert.deepEqual(readdirSync(dir).sort(), before);
    for (const name of before) {
      assert.equal(String(readFileSync(join(dir, name))), `fake-${name}`);
    }
    // 计划内容:白名单三个文件 → archive-<ts> 名
    for (const item of plan.renames) {
      assert.ok(RESET_WHITELIST.includes(item.fromName));
      assert.ok(item.toName.startsWith("pharmaco.archive-2026-08-06T07-00-00-000Z.sqlite"));
    }
    assert.ok(formatPlan(plan).includes("pharmaco.archive-"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("confirm:归档式重命名,原文件内容完整保留,可改回恢复", () => {
  const dir = makeDataDir();
  try {
    const plan = planReset(dir);
    const moved = executePlan(plan);
    assert.equal(moved, 3);
    const after = readdirSync(dir).sort();
    assert.equal(after.length, 3);
    assert.ok(after.every((name) => name.startsWith("pharmaco.archive-")));
    // 原名文件已不在,内容在归档文件里逐字节保留
    assert.ok(!existsSync(join(dir, "pharmaco.sqlite")));
    const archived = after.find((name) => name.endsWith(".sqlite") && !name.includes("-wal") && !name.includes("-shm"));
    assert.equal(String(readFileSync(join(dir, archived))), "fake-pharmaco.sqlite");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("白名单:目录内其他文件一律不碰", () => {
  const dir = makeDataDir(["pharmaco.sqlite", "notes.txt", "backup-2026.zip", ".keep"]);
  try {
    const plan = planReset(dir);
    assert.equal(plan.renames.length, 1);
    assert.equal(plan.renames[0].fromName, "pharmaco.sqlite");
    executePlan(plan);
    const after = readdirSync(dir).sort();
    assert.ok(after.includes("notes.txt"));
    assert.ok(after.includes("backup-2026.zip"));
    assert.ok(after.includes(".keep"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("空目录 / 无库文件:计划为空,formatPlan 提示无需重置", () => {
  const dir = makeDataDir([]);
  try {
    const plan = planReset(dir);
    assert.equal(plan.renames.length, 0);
    assert.ok(formatPlan(plan).includes("无需重置"));
    assert.equal(executePlan(plan), 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("归档目标已存在:中止且不改动任何文件(不覆盖旧归档)", () => {
  const now = new Date("2026-08-06T07:00:00.000Z");
  const dir = makeDataDir(["pharmaco.sqlite", "pharmaco.archive-2026-08-06T07-00-00-000Z.sqlite"]);
  try {
    assert.throws(() => planReset(dir, { now }), (err) => {
      assert.match(err.message, /归档目标已存在/);
      return true;
    });
    // 原库与旧归档都还在
    assert.ok(existsSync(join(dir, "pharmaco.sqlite")));
    assert.ok(existsSync(join(dir, "pharmaco.archive-2026-08-06T07-00-00-000Z.sqlite")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("端到端:真实库归档后,下次打开自动 migration 重建全新库", () => {
  const dir = mkdtempSync(join(tmpdir(), "pharmaco-reset-e2e-"));
  try {
    // 建真实库并写入一行工作区状态
    const first = new PharmacoDatabase(dir);
    first.db
      .prepare("INSERT INTO workspace_states(workspace_id, revision, state_json, state_hash, updated_at) VALUES('ws_old', 1, '{}', 'h', '2026-08-06T00:00:00Z')")
      .run();
    first.close();
    const check = new PharmacoDatabase(dir);
    assert.equal(check.db.prepare("SELECT COUNT(*) AS n FROM workspace_states").get().n, 1);
    check.close();

    // dry-run 产出计划但不执行;confirm 路径才归档
    const dry = planReset(dir);
    assert.ok(dry.renames.length >= 1);
    assert.ok(existsSync(join(dir, "pharmaco.sqlite")), "dry-run 不得动文件");
    executePlan(planReset(dir));

    // 重新打开:migration 重建,旧数据不在新库;归档文件留在目录里
    const reopened = new PharmacoDatabase(dir);
    assert.equal(reopened.db.prepare("SELECT COUNT(*) AS n FROM workspace_states").get().n, 0);
    reopened.close();
    assert.ok(readdirSync(dir).some((name) => name.startsWith("pharmaco.archive-")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("defaultDataDir:PHARMACO_DATA_DIR 优先,缺省 <仓库根>/.pharmaco-data", () => {
  assert.equal(defaultDataDir({ PHARMACO_DATA_DIR: "/tmp/custom-data" }), "/tmp/custom-data");
  assert.ok(defaultDataDir({}).endsWith(join(".pharmaco-data")));
});
