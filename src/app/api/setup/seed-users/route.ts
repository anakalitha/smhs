// src/app/api/setup/seed-users/route.ts
import { NextResponse } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

type CountRow = RowDataPacket & { c: number };
type RoleRow = RowDataPacket & { id: number };

const ORG_ID = 1;
const BRANCH_ID = 1;

// Hard-coded initial users (edit as you like)
const USERS = [
  {
    full_name: "SMNH Admin",
    email: "admin@smnh.local",
    phone: "9999999999",
    password: "Admin@123",
    roles: ["ADMIN"],
    must_change_password: 1,
  },
  {
    full_name: "Reception User",
    email: "reception@smnh.local",
    phone: "8888888888",
    password: "Reception@123",
    roles: ["RECEPTION"],
    must_change_password: 1,
  },
  {
    full_name: "Doctor User",
    email: "doctor@smnh.local",
    phone: "7777777777",
    password: "Doctor@123",
    roles: ["DOCTOR"],
    must_change_password: 1,
  },
] as const;

const REQUIRED_ROLES = ["ADMIN", "RECEPTION", "DOCTOR"] as const;

export async function GET(req: Request) {
  // Safety: never allow in production
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Not allowed in production." },
      { status: 403 }
    );
  }

  const url = new URL(req.url);
  const token = url.searchParams.get("token") || "";
  const expected = process.env.SETUP_SEED_TOKEN || "";

  if (!expected) {
    return NextResponse.json(
      { error: "SETUP_SEED_TOKEN is not configured in environment." },
      { status: 500 }
    );
  }

  if (token !== expected) {
    return NextResponse.json({ error: "Invalid token." }, { status: 401 });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Only allow seeding when there are zero users (prevents accidental reruns)
    const [cntRows] = await conn.execute<CountRow[]>(
      `SELECT COUNT(*) AS c FROM users FOR UPDATE`
    );
    const count = Number(cntRows[0]?.c || 0);

    if (count > 0) {
      await conn.rollback();
      return NextResponse.json(
        { error: "Users already exist. Seed blocked." },
        { status: 400 }
      );
    }

    // 1) Ensure roles exist
    for (const roleName of REQUIRED_ROLES) {
      await conn.execute(
        `INSERT INTO roles (name)
         VALUES (:name)
         ON DUPLICATE KEY UPDATE name = VALUES(name)`,
        { name: roleName }
      );
    }

    // Fetch role ids
    const [roleRows] = await conn.execute<RoleRow[]>(
      `SELECT id, name FROM roles WHERE name IN ('ADMIN','RECEPTION','DOCTOR')`
    );

    const roleIdByName = new Map<string, number>();
    for (const r of roleRows as any[]) {
      roleIdByName.set(String(r.name), Number(r.id));
    }

    // 2) Create users + user_roles
    const created: Array<{ email: string; id: number; roles: string[] }> = [];

    for (const u of USERS) {
      const password_hash = await bcrypt.hash(u.password, 10);

      const [ins] = await conn.execute<ResultSetHeader>(
        `INSERT INTO users (
          full_name, email, phone, password_hash,
          is_active, must_change_password,
          organization_id, branch_id
        )
        VALUES (
          :full_name, :email, :phone, :password_hash,
          1, :must_change_password,
          :org_id, :branch_id
        )`,
        {
          full_name: u.full_name,
          email: u.email,
          phone: u.phone,
          password_hash,
          must_change_password: u.must_change_password,
          org_id: ORG_ID,
          branch_id: BRANCH_ID,
        }
      );

      const userId = ins.insertId;

      for (const roleName of u.roles) {
        const roleId = roleIdByName.get(roleName);
        if (!roleId) {
          throw new Error(`Role not found: ${roleName}`);
        }

        await conn.execute(
          `INSERT INTO user_roles (user_id, role_id)
           VALUES (:user_id, :role_id)`,
          { user_id: userId, role_id: roleId }
        );
      }

      created.push({ email: u.email, id: userId, roles: [...u.roles] });
    }

    await conn.commit();

    return NextResponse.json({
      ok: true,
      message: "Seed complete.",
      created,
      loginHint: USERS.map((u) => ({
        email: u.email,
        password: u.password,
        roles: u.roles,
      })),
    });
  } catch (e) {
    await conn.rollback();
    console.error("❌ seed-users failed:", e);
    return NextResponse.json(
      { error: "Seed failed. Check server logs." },
      { status: 500 }
    );
  } finally {
    conn.release();
  }
}
