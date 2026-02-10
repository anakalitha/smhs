// src\app\api\auth\login\route.ts
import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { createSession } from "@/lib/session";

type UserRow = RowDataPacket & {
  id: number;
  password_hash: string;
  is_active: number;
};

export async function POST(req: Request) {
  const { email, password } = (await req.json()) as {
    email?: string;
    password?: string;
  };

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required." },
      { status: 400 }
    );
  }

  const normalizedEmail = email.trim().toLowerCase();

  const [rows] = await db.execute<UserRow[]>(
    `SELECT id, password_hash, is_active
     FROM users
     WHERE email = :email
     LIMIT 1`,
    { email: normalizedEmail }
  );

  if (rows.length === 0) {
    return NextResponse.json(
      { error: "Invalid credentials." },
      { status: 401 }
    );
  }

  const user = rows[0];
  if (user.is_active !== 1) {
    return NextResponse.json(
      { error: "Account is inactive." },
      { status: 403 }
    );
  }

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) {
    return NextResponse.json(
      { error: "Invalid credentials." },
      { status: 401 }
    );
  }

  await createSession(user.id);

  return NextResponse.json({ ok: true });
}
