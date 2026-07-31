import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export class RevisionConflictError extends Error {
  constructor(current) {
    super("状态版本已变更");
    this.name = "RevisionConflictError";
    this.current = current;
  }
}

export class PharmacoDatabase {
  constructor(dataDir) {
    mkdirSync(dataDir, { recursive: true });
    this.path = join(dataDir, "pharmaco.sqlite");
    this.db = new DatabaseSync(this.path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 5000;

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
    `);

    this.selectState = this.db.prepare(
      "SELECT workspace_id, revision, state_json, state_hash, updated_at FROM workspace_states WHERE workspace_id = ?",
    );
    this.insertState = this.db.prepare(
      "INSERT INTO workspace_states(workspace_id, revision, state_json, state_hash, updated_at) VALUES (?, ?, ?, ?, ?)",
    );
    this.updateState = this.db.prepare(
      "UPDATE workspace_states SET revision = ?, state_json = ?, state_hash = ?, updated_at = ? WHERE workspace_id = ?",
    );
    this.insertAudit = this.db.prepare(
      "INSERT INTO audit_events(id, event_type, workspace_id, metadata_json, created_at) VALUES (?, ?, ?, ?, ?)",
    );
    this.insertInference = this.db.prepare(
      "INSERT INTO inference_events(id, agent_id, model_name, status, latency_ms, input_chars, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );
  }

  ping() {
    return this.db.prepare("SELECT 1 AS ok").get().ok === 1;
  }

  getState(workspaceId) {
    const row = this.selectState.get(workspaceId);
    if (!row) {
      return { workspaceId, revision: 0, state: null, hash: null, updatedAt: null };
    }
    return {
      workspaceId: row.workspace_id,
      revision: row.revision,
      state: JSON.parse(row.state_json),
      hash: row.state_hash,
      updatedAt: row.updated_at,
    };
  }

  putState(workspaceId, baseRevision, state, stateHash) {
    const stateJson = JSON.stringify(state);
    const now = new Date().toISOString();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const current = this.getState(workspaceId);
      if (current.revision !== baseRevision) throw new RevisionConflictError(current);
      const revision = current.revision + 1;
      if (current.revision === 0) {
        this.insertState.run(workspaceId, revision, stateJson, stateHash, now);
      } else {
        this.updateState.run(revision, stateJson, stateHash, now, workspaceId);
      }
      this.insertAudit.run(
        randomUUID(),
        "workspace.state.updated",
        workspaceId,
        JSON.stringify({ fromRevision: current.revision, toRevision: revision, bytes: Buffer.byteLength(stateJson) }),
        now,
      );
      this.db.exec("COMMIT");
      return { workspaceId, revision, state, hash: stateHash, updatedAt: now };
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  recordInference({ agentId, modelName, status, latencyMs, inputChars }) {
    this.insertInference.run(
      randomUUID(), agentId, modelName, status, Math.max(0, Math.round(latencyMs)), inputChars, new Date().toISOString(),
    );
  }

  close() {
    this.db.close();
  }
}
