#!/usr/bin/env node
// 试用间隙的安全重置:归档式,不删任何文件,不碰追加式表。
//
// 做法:把 <数据目录>/pharmaco.sqlite(连同 -wal/-shm 附属文件)重命名为
//   pharmaco.archive-<时间戳>.sqlite(…),下次启动服务时 migration 自动重建全新库。
// 原数据以归档文件形式完整保留,需要时可人工改回文件名恢复。
//
// 用法:
//   node tools/reset-trial-data.mjs            # 预演(默认 dry-run),只打印计划不动文件
//   node tools/reset-trial-data.mjs --confirm  # 真正执行归档重命名
//   node tools/reset-trial-data.mjs --data-dir <路径> [--confirm]
//
// 数据目录解析顺序:--data-dir > PHARMACO_DATA_DIR > <仓库根>/.pharmaco-data(与 server 同口径)。
// 安全纪律:路径白名单只含 pharmaco.sqlite / pharmaco.sqlite-wal / pharmaco.sqlite-shm
// 三个名字,其他文件一律不碰;重命名目标已存在时中止,绝不覆盖。
import { existsSync, readdirSync, renameSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// 白名单:只允许归档这三个文件名(SQLite 主库 + WAL 模式附属文件)。
export const RESET_WHITELIST = Object.freeze(["pharmaco.sqlite", "pharmaco.sqlite-wal", "pharmaco.sqlite-shm"]);

export function defaultDataDir(env = process.env) {
  return resolve(env.PHARMACO_DATA_DIR || resolve(PROJECT_ROOT, ".pharmaco-data"));
}

// 归档时间戳:ISO 去掉冒号/小数点,保证 macOS/Windows 文件名合法且按名字可排序。
function archiveStamp(now = new Date()) {
  return now.toISOString().replace(/[:.]/g, "-");
}

// 计算归档计划:返回 { dataDir, stamp, renames: [{ from, to, fromName, toName }] }。
// 纯函数,不触碰文件系统(除了 readdirSync 列目录);路径逐个过白名单校验。
export function planReset(dataDir, { now } = {}) {
  const dir = resolve(dataDir);
  const stamp = archiveStamp(now);
  const renames = [];
  if (existsSync(dir)) {
    for (const entry of readdirSync(dir)) {
      if (!RESET_WHITELIST.includes(entry)) continue; // 白名单外一律不动
      const from = resolve(dir, entry);
      // 双重校验:解析后必须仍位于数据目录内,且基本名就是白名单项(防符号链接/路径逃逸)。
      if (dirname(from) !== dir || basename(from) !== entry) {
        throw new Error(`路径校验失败,拒绝处理: ${from}`);
      }
      const toName = entry.replace("pharmaco.sqlite", `pharmaco.archive-${stamp}.sqlite`);
      const to = resolve(dir, toName);
      if (existsSync(to)) {
        throw new Error(`归档目标已存在,中止以免覆盖: ${to}(同一秒重复执行?请稍候再试)`);
      }
      renames.push({ from, to, fromName: entry, toName });
    }
  }
  return { dataDir: dir, stamp, renames };
}

// 执行计划:逐个 renameSync(同目录 rename 是原子操作,不经过删除)。
export function executePlan(plan) {
  for (const item of plan.renames) {
    renameSync(item.from, item.to);
  }
  return plan.renames.length;
}

export function formatPlan(plan) {
  if (plan.renames.length === 0) {
    return `数据目录 ${plan.dataDir} 中没有 pharmaco.sqlite,无需重置。`;
  }
  const lines = plan.renames.map((item) => `  ${item.fromName}  ->  ${item.toName}`);
  return [`数据目录:${plan.dataDir}`, "将归档重命名:", ...lines].join("\n");
}

function main(argv) {
  const args = argv.slice(2);
  const confirm = args.includes("--confirm");
  const dataDirFlag = args.indexOf("--data-dir");
  const dataDir = dataDirFlag >= 0 ? resolve(args[dataDirFlag + 1]) : defaultDataDir();
  const plan = planReset(dataDir);
  if (!confirm) {
    console.log("[dry-run] 预演模式,未改动任何文件。加 --confirm 才真正执行。\n" + formatPlan(plan));
    return 0;
  }
  const moved = executePlan(plan);
  if (moved === 0) {
    console.log(formatPlan(plan));
  } else {
    console.log(`已归档 ${moved} 个文件:\n${formatPlan(plan)}\n下次启动服务将自动重建全新数据库(原数据保留在归档文件中)。`);
  }
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exit(main(process.argv));
  } catch (error) {
    console.error(`重置失败: ${error.message}`);
    process.exit(1);
  }
}
