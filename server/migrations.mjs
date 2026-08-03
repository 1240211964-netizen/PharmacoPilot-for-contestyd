import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "migrations");
const MIGRATION_FILE_PATTERN = /^\d{3}_[a-z0-9_]+\.sql$/;
// 表重建 migration 的显式开关:文件第一行必须是该注释,runner 才会在事务外关闭外键。
const FOREIGN_KEYS_OFF_MARKER = "-- migrations:foreign-keys-off";

// 版本化 schema migration runner。
// 纪律:
// - 每个未应用的 migration 在事务内执行 SQL 并记录 name + 内容 sha256 + applied_at;
// - 已应用的 migration 必须逐字节不变:hash 不一致直接 throw,绝不静默;
// - 已应用但文件缺失同样 throw;
// - 幂等:重复执行无效果。
// 表重建例外:PRAGMA foreign_keys 在事务内是 no-op(SQLite 限制),而官方 12 步表重建
// 要求 foreign_keys=OFF 才能 drop 被引用的旧表。凡以 FOREIGN_KEYS_OFF_MARKER 作为文件
// 第一行的 migration,runner 在 BEGIN 之前关闭外键、COMMIT/ROLLBACK 之后(事务外)恢复;
// 事务与回滚语义不变。标记仅限确需表重建的 migration 使用,且该 migration 必须自行保证
// 引用完整性(如回填校验触发器),配套的迁移测试须以 PRAGMA foreign_key_check 验证。
export function runMigrations(db, { migrationsDir = DEFAULT_MIGRATIONS_DIR } = {}) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      sha256 TEXT NOT NULL,
      applied_at TEXT NOT NULL
    ) STRICT;
  `);

  const files = readdirSync(migrationsDir)
    .filter((entry) => MIGRATION_FILE_PATTERN.test(entry))
    .sort();

  const applied = new Map(
    db.prepare("SELECT name, sha256 FROM schema_migrations").all()
      .map((row) => [row.name, row.sha256]),
  );
  const fileSet = new Set(files);
  for (const name of applied.keys()) {
    if (!fileSet.has(name)) {
      throw new Error(
        `schema migration "${name}" is recorded as applied but its file is missing from ${migrationsDir}; refusing to continue`,
      );
    }
  }

  const insertRecord = db.prepare(
    "INSERT INTO schema_migrations(name, sha256, applied_at) VALUES (?, ?, ?)",
  );

  for (const name of files) {
    const content = readFileSync(join(migrationsDir, name));
    const sha256 = createHash("sha256").update(content).digest("hex");
    const recorded = applied.get(name);
    if (recorded !== undefined) {
      if (recorded !== sha256) {
        throw new Error(
          `schema migration "${name}" was modified after being applied (recorded sha256 ${recorded}, current ${sha256}); refusing to continue`,
        );
      }
      continue;
    }
    const text = content.toString("utf8");
    const foreignKeysOff = text.startsWith(FOREIGN_KEYS_OFF_MARKER);
    // 表重建需要 foreign_keys=OFF;PRAGMA 在事务内是 no-op,必须在 BEGIN 之前设置。
    if (foreignKeysOff) db.exec("PRAGMA foreign_keys = OFF");
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(text);
      insertRecord.run(name, sha256, new Date().toISOString());
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw new Error(`failed to apply schema migration "${name}": ${error.message}`, { cause: error });
    } finally {
      // 事务已结束(COMMIT/ROLLBACK 之后),恢复外键 enforcement;失败恢复绝不留 FK-off 的连接。
      if (foreignKeysOff) db.exec("PRAGMA foreign_keys = ON");
    }
  }

  return files;
}
