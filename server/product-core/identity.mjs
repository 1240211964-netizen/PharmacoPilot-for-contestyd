// 请求身份解析:把 API 令牌解析为真实操作者(migration 009 teachers/api_tokens)。
// 优先级与兼容纪律:
//   1. 教师令牌(api_tokens,sha256 匹配、未撤销、教师 active)→ 真实教师身份,
//      写操作路由据此绑定 actorId/reviewerId(不一致即 403 ACTOR_MISMATCH);
//   2. 旧静态 config token(PHARMACO_API_TOKEN)→ { actorId:'admin', role:'admin' },
//      兼容现有单 token 部署,不绑定具体教师;
//   3. 查无此令牌 → null(调用方 401);令牌已撤销或教师已禁用同样 null;
//   4. 无令牌且回环监听(未配置静态 token 的本地开发态)→ 由调用方维持现行放行,
//      actor 为 null,写操作沿用请求体自报身份(既有行为不变)。
import { timingSafeEqual } from "node:crypto";
import { hashToken } from "./teachers.mjs";

function tokenEquals(supplied, expected) {
  const left = Buffer.from(String(supplied));
  const right = Buffer.from(String(expected));
  return left.length === right.length && timingSafeEqual(left, right);
}

// 返回 { actorId, role, displayName, source, tokenId? } 或 null。
export function resolveActor(db, token, { staticToken = "" } = {}) {
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT t.id AS teacher_id, t.display_name, t.role, t.status, tok.id AS token_id, tok.revoked_at
       FROM api_tokens tok JOIN teachers t ON t.id = tok.teacher_id
       WHERE tok.token_hash = ?`,
    )
    .get(hashToken(token));
  if (row) {
    if (row.revoked_at !== null || row.status !== "active") return null;
    return {
      actorId: row.teacher_id,
      role: row.role,
      displayName: row.display_name,
      source: "teacher-token",
      tokenId: row.token_id,
    };
  }
  if (staticToken && tokenEquals(token, staticToken)) {
    return { actorId: "admin", role: "admin", displayName: "管理员", source: "static-token" };
  }
  return null;
}
