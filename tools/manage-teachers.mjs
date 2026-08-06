#!/usr/bin/env node
// 教师账号/令牌管理 CLI(migration 009,受控试用用)。直接用 node 运行:
//   node tools/manage-teachers.mjs add --name "张老师" --role teacher [--label "备注"]
//   node tools/manage-teachers.mjs list
//   node tools/manage-teachers.mjs revoke --token-id tok_xxx
//   node tools/manage-teachers.mjs disable --teacher tch_xxx
//
// 数据目录:PHARMACO_DATA_DIR,缺省 <仓库根>/.pharmaco-data(经 server/db.mjs 打开,
// 自动跑 migration)。
// 安全纪律:add 生成的明文令牌(pk_<48 位随机>)只在本命令 stdout 打印一次,
// 库里只存 sha256 哈希;丢失无法找回,只能 revoke 后重新 add。
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PharmacoDatabase } from "../server/db.mjs";
import { addTeacher, disableTeacher, listTeachers, revokeToken } from "../server/product-core/teachers.mjs";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function usage() {
  console.error(`用法:
  node tools/manage-teachers.mjs add --name "张老师" [--role teacher|admin] [--label "备注"]
  node tools/manage-teachers.mjs list
  node tools/manage-teachers.mjs revoke --token-id tok_xxx
  node tools/manage-teachers.mjs disable --teacher tch_xxx`);
  process.exit(2);
}

function parseFlags(args) {
  const flags = new Map();
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith("--")) usage();
    const key = arg.slice(2);
    const value = args[i + 1];
    if (value === undefined || value.startsWith("--")) usage();
    flags.set(key, value);
    i += 1;
  }
  return flags;
}

function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (!command) usage();
  const dataDir = resolve(process.env.PHARMACO_DATA_DIR || resolve(PROJECT_ROOT, ".pharmaco-data"));
  const database = new PharmacoDatabase(dataDir);
  try {
    if (command === "add") {
      const flags = parseFlags(rest);
      const name = flags.get("name");
      if (!name) usage();
      const { teacher, tokenId, token } = addTeacher(database.db, {
        name,
        role: flags.get("role") ?? "teacher",
        label: flags.get("label") ?? null,
      });
      console.log(`教师已创建: ${teacher.id} (${teacher.displayName}, role=${teacher.role})`);
      console.log(`令牌 ID: ${tokenId}`);
      console.log(`明文令牌(仅此一次显示,请立即妥善保存): ${token}`);
      return;
    }
    if (command === "list") {
      if (rest.length) usage();
      const teachers = listTeachers(database.db);
      if (!teachers.length) {
        console.log("(尚无教师账号)");
        return;
      }
      for (const teacher of teachers) {
        console.log(`${teacher.id}  ${teacher.displayName}  role=${teacher.role}  status=${teacher.status}  created=${teacher.createdAt}`);
        for (const token of teacher.tokens) {
          const state = token.active ? "active" : `revoked@${token.revokedAt}`;
          console.log(`  ${token.id}  ${state}${token.label ? `  label=${token.label}` : ""}  created=${token.createdAt}`);
        }
      }
      return;
    }
    if (command === "revoke") {
      const flags = parseFlags(rest);
      const tokenId = flags.get("token-id");
      if (!tokenId) usage();
      const { teacherId } = revokeToken(database.db, tokenId);
      console.log(`令牌已撤销: ${tokenId} (teacher=${teacherId})`);
      return;
    }
    if (command === "disable") {
      const flags = parseFlags(rest);
      const teacherId = flags.get("teacher");
      if (!teacherId) usage();
      disableTeacher(database.db, teacherId);
      console.log(`教师已禁用: ${teacherId}(其全部令牌即刻失效)`);
      return;
    }
    usage();
  } finally {
    database.close();
  }
}

try {
  main();
} catch (error) {
  console.error(`错误: ${error.message}`);
  process.exit(1);
}
