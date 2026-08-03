-- 000_baseline.sql
-- 用途:基线。把 PharmacoDatabase 构造函数原先内联 exec 建立的 4 张表原样搬入版本化 migration。
-- 约束说明:全部 STRICT 表;audit_events 保留原有 (workspace_id, created_at DESC) 索引。
-- 不可变规则:本文件一经应用即被 schema_migrations 记录 sha256,此后任何修改都会被 runner 拒绝。
-- 对既有数据库平滑升级:全部使用 CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS,
-- 已存在这 4 张表的老库执行本文件为空操作,仅被记录为已应用。

CREATE TABLE IF NOT EXISTS workspace_states (
  workspace_id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL,
  state_json TEXT NOT NULL,
  state_hash TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  workspace_id TEXT,
  metadata_json TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS audit_events_workspace_time
  ON audit_events(workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS inference_events (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  model_name TEXT NOT NULL,
  status TEXT NOT NULL,
  latency_ms INTEGER NOT NULL,
  input_chars INTEGER NOT NULL,
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS practice_review_cache (
  cache_key TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;
