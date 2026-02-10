// src\lib\session.ts
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

type DoctorLinkRow = RowDataPacket & { doctor_id: number };

export type CurrentUser = {
  id: number;
  fullName: string;
  email: string;
  organizationId: number | null;
  branchId: number | null;
  roles: string[];
  doctorId: number | null; // ✅ add
};

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const [rows] = await db.execute<SessionUserRow[]>(
    `
    SELECT
      u.id as user_id,
      u.full_name,
      u.email,
      u.is_active,
      u.organization_id,
      u.branch_id
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.session_token = :token
      AND s.revoked_at IS NULL
      AND s.expires_at > NOW()
    LIMIT 1
    `,
    { token }
  );

  if (rows.length === 0) return null;
  if (rows[0].is_active !== 1) return null;

  const userId = Number(rows[0].user_id);

  const [roleRows] = await db.execute<RoleRow[]>(
    `
    SELECT r.name AS role
    FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = :user_id
    `,
    { user_id: userId }
  );

  const roles = roleRows.map((r) => r.role);

  // ✅ Link doctor user -> doctors.id (only if role includes DOCTOR)
  let doctorId: number | null = null;

  if (roles.includes("DOCTOR")) {
    const [drows] = await db.execute<DoctorLinkRow[]>(
      `
      SELECT d.id AS doctor_id
      FROM doctors d
      WHERE d.user_id = :uid
        AND d.is_active = 1
        AND d.organization_id = :org
        AND d.branch_id = :branch
      LIMIT 1
      `,
      {
        uid: userId,
        org: rows[0].organization_id,
        branch: rows[0].branch_id,
      }
    );

    doctorId = drows.length ? Number(drows[0].doctor_id) : null;
  }

  return {
    id: userId,
    fullName: rows[0].full_name,
    email: rows[0].email,
    organizationId: rows[0].organization_id,
    branchId: rows[0].branch_id,
    roles,
    doctorId, // ✅ now available everywhere
  };
}
