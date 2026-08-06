// 教师账号/令牌服务(migration 009 表):受控试用的最小身份体系。
// 纪律:
//   - 令牌明文(pk_<48 位随机>)只在生成时经返回值给出一次,库里只存 sha256 哈希;
//   - 撤销=置 revoked_at(行保留可审计),禁用教师=status 'disabled';两者都使
//     identity.mjs resolveActor 返回 null;
//   - 每个管理操作写审计事件(actor_type='admin'),与产品内核同 appendAuditEvent 纪律;
//   - 错误不静默:查无目标 / 重复撤销 / 重复禁用一律抛错。
import { randomInt } from "node:crypto";
import { appendAuditEvent, sha256Hex } from "./audit.mjs";
import { newId, nowIso } from "./ids.mjs";

// 与 ids.mjs 同口径的无偏 base62 随机;48 位主体 + pk_ 前缀。
const TOKEN_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const TOKEN_BODY_LENGTH = 48;
export const TOKEN_PREFIX = "pk_";
export const TEACHER_ROLES = Object.freeze(["teacher", "admin"]);

export function generateToken() {
  let body = "";
  for (let i = 0; i < TOKEN_BODY_LENGTH; i += 1) {
    body += TOKEN_ALPHABET[randomInt(0, TOKEN_ALPHABET.length)];
  }
  return `${TOKEN_PREFIX}${body}`;
}

export function hashToken(token) {
  return sha256Hex(String(token));
}

function requireName(name) {
  const text = typeof name === "string" ? name.trim() : "";
  if (!text) throw new Error("addTeacher: name 必填且必须是非空文本");
  if (text.length > 80) throw new Error("addTeacher: name 不能超过 80 字符");
  return text;
}

// 新增教师并签发首枚令牌。返回的 token 是唯一一次明文出口,调用方(CLI)打印后不得落盘。
export function addTeacher(db, { name, role = "teacher", label = null, actorId = "admin" } = {}) {
  const displayName = requireName(name);
  if (!TEACHER_ROLES.includes(role)) {
    throw new Error(`addTeacher: role 必须是 ${TEACHER_ROLES.join("/")},收到 ${JSON.stringify(role)}`);
  }
  const teacherId = newId("tch");
  const tokenId = newId("tok");
  const token = generateToken();
  const now = nowIso();
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("INSERT INTO teachers(id, display_name, role, status, created_at) VALUES (?, ?, ?, 'active', ?)")
      .run(teacherId, displayName, role, now);
    db.prepare("INSERT INTO api_tokens(id, token_hash, teacher_id, label, created_at, revoked_at) VALUES (?, ?, ?, ?, ?, NULL)")
      .run(tokenId, hashToken(token), teacherId, label ?? null, now);
    appendAuditEvent(db, {
      eventType: "teacher.created",
      actorType: "admin",
      actorId,
      entityType: "teacher",
      entityId: teacherId,
      payload: { displayName, role },
    });
    appendAuditEvent(db, {
      eventType: "token.created",
      actorType: "admin",
      actorId,
      entityType: "token",
      entityId: tokenId,
      // 审计只记归属与标签;哈希与明文都不落 payload。
      payload: { teacherId, label: label ?? null },
    });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return {
    teacher: { id: teacherId, displayName, role, status: "active", createdAt: now },
    tokenId,
    token,
  };
}

// 教师列表(含各令牌元数据,不含哈希)。
export function listTeachers(db) {
  const teachers = db
    .prepare("SELECT id, display_name, role, status, created_at FROM teachers ORDER BY created_at, id")
    .all();
  const tokensByTeacher = new Map();
  for (const row of db
    .prepare("SELECT id, teacher_id, label, created_at, revoked_at FROM api_tokens ORDER BY created_at, id")
    .all()) {
    if (!tokensByTeacher.has(row.teacher_id)) tokensByTeacher.set(row.teacher_id, []);
    tokensByTeacher.get(row.teacher_id).push({
      id: row.id,
      label: row.label,
      createdAt: row.created_at,
      revokedAt: row.revoked_at,
      active: row.revoked_at === null,
    });
  }
  return teachers.map((row) => ({
    id: row.id,
    displayName: row.display_name,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
    tokens: tokensByTeacher.get(row.id) ?? [],
  }));
}

// 撤销令牌:置 revoked_at。已撤销再撤销视为操作错误(显式抛错,不静默成功)。
export function revokeToken(db, tokenId, { actorId = "admin" } = {}) {
  const row = db.prepare("SELECT id, teacher_id, revoked_at FROM api_tokens WHERE id = ?").get(tokenId);
  if (!row) throw new Error(`revokeToken: 令牌不存在: ${tokenId}`);
  if (row.revoked_at !== null) throw new Error(`revokeToken: 令牌已撤销: ${tokenId}`);
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("UPDATE api_tokens SET revoked_at = ? WHERE id = ?").run(nowIso(), tokenId);
    appendAuditEvent(db, {
      eventType: "token.revoked",
      actorType: "admin",
      actorId,
      entityType: "token",
      entityId: tokenId,
      payload: { teacherId: row.teacher_id },
    });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return { tokenId, teacherId: row.teacher_id };
}

// 禁用教师:其全部令牌即刻失效(resolveActor 校验 teachers.status)。已禁用再禁用显式抛错。
export function disableTeacher(db, teacherId, { actorId = "admin" } = {}) {
  const row = db.prepare("SELECT id, status FROM teachers WHERE id = ?").get(teacherId);
  if (!row) throw new Error(`disableTeacher: 教师不存在: ${teacherId}`);
  if (row.status === "disabled") throw new Error(`disableTeacher: 教师已禁用: ${teacherId}`);
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("UPDATE teachers SET status = 'disabled' WHERE id = ?").run(teacherId);
    appendAuditEvent(db, {
      eventType: "teacher.disabled",
      actorType: "admin",
      actorId,
      entityType: "teacher",
      entityId: teacherId,
      previousState: "active",
      nextState: "disabled",
    });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return { teacherId };
}
