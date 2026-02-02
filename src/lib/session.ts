import { cookies } from "next/headers";
import crypto from "crypto";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { db } from "@/lib/db";
import { SESSION_COOKIE_NAME, sessionTtlMs } from "@/lib/auth-config";

type SessionUserRow = RowDataPacket & {
  user_id: number;
  full_name: string;
  email: string;
  is_active: number;
  organization_id: number | null;
  branch_id: number | null;
};

type RoleRow = RowDataPacket & { role: string };

export function newSessionToken() {
  return crypto.randomBytes(32).toString("hex");
}

export async function createSession(userId: number) {
  const token = newSessionToken();
  const expiresAt = new Date(Date.now() + sessionTtlMs());

  await db.execute<ResultSetHeader>(
    `INSERT INTO sessions (user_id, session_token, expires_at)
     VALUES (:user_id, :session_token, :expires_at)`,
    {
      user_id: userId,
      session_token: token,
      expires_at: expiresAt,
    }
  );

  const cookieStore = await cookies();
  cookieStore.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });

  return token;
}

export async function revokeCurrentSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return;

  await db.execute<ResultSetHeader>(
    `UPDATE sessions
     SET revoked_at = NOW()
     WHERE session_token = :token`,
    { token }
  );

  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const [rows] = await db.execute<SessionUserRow[]>(
    `SELECT u.id as user_id, u.full_name, u.email, u.is_active,u.organization_id,
      u.branch_id
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.session_token = :token
       AND s.revoked_at IS NULL
       AND s.expires_at > NOW()
     LIMIT 1`,
    { token }
  );

  if (rows.length === 0) return null;
  if (rows[0].is_active !== 1) return null;

  const userId = rows[0].user_id;

  const [roleRows] = await db.execute<RoleRow[]>(
    `SELECT r.name AS role
     FROM user_roles ur
     JOIN roles r ON r.id = ur.role_id
     WHERE ur.user_id = :user_id`,
    { user_id: userId }
  );

  return {
    id: userId,
    fullName: rows[0].full_name,
    email: rows[0].email,
    organizationId: rows[0].organization_id,
    branchId: rows[0].branch_id,
    roles: roleRows.map((r) => r.role),
  };
}
