-- 009_teachers.sql
-- 用途:最小教师账号/令牌体系,支撑 3–5 位教师受控试用(feat/teacher-trial-v0.1)。
--   - teachers:教师账号(显示名、角色、启用状态);
--   - api_tokens:每教师独立的 API 令牌,鉴权时由 server/product-core/identity.mjs
--     解析为真实教师身份,写操作路由据此绑定 actor/reviewerId(不一致即 403 ACTOR_MISMATCH),
--     审计事件的 actor_id 由此成为真实教师 ID。
--
-- 安全纪律:
--   - api_tokens.token_hash 只存明文令牌的 sha256 十六进制哈希,任何环节(库、审计、
--     日志、CLI 回显之外的持久化)绝不落明文令牌;明文格式 pk_<48 位随机>,仅在
--     tools/manage-teachers.mjs add 时打印一次;
--   - 撤销是置 revoked_at(行保留,可审计),禁用教师是 teachers.status='disabled',
--     两者都使 resolveActor 返回 null(401);
--   - 纯新增表:000–008 已冻结对象一律不改动,无需表重建,不需要 foreign-keys-off 标记。
--
-- 约束说明:全部 STRICT 表;enum 一律 TEXT + 命名 CHECK;外键显式命名指向 teachers(id)。
-- 失败保护:runner 在单事务(BEGIN IMMEDIATE ... COMMIT)内执行本文件,任何一步失败即整体
--   ROLLBACK,数据库保持迁移前原状;绝不静默丢数据。

CREATE TABLE teachers (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'teacher' CONSTRAINT teachers_role_check CHECK (role IN ('teacher', 'admin')),
  status TEXT NOT NULL DEFAULT 'active' CONSTRAINT teachers_status_check CHECK (status IN ('active', 'disabled')),
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE api_tokens (
  id TEXT PRIMARY KEY,
  -- 只存 sha256 哈希,不存明文(见文件头安全纪律)。
  token_hash TEXT NOT NULL CONSTRAINT api_tokens_token_hash_unique UNIQUE,
  teacher_id TEXT NOT NULL,
  label TEXT,
  created_at TEXT NOT NULL,
  revoked_at TEXT,
  CONSTRAINT api_tokens_teacher_fk FOREIGN KEY (teacher_id) REFERENCES teachers(id)
) STRICT;

-- active token 查询索引:按教师列出未撤销令牌(管理端 list/审计用);
-- 按哈希的点查由 token_hash 的 UNIQUE 约束索引覆盖。
CREATE INDEX api_tokens_teacher_active ON api_tokens(teacher_id) WHERE revoked_at IS NULL;
