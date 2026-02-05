// src/app/api/reception/referrals/route.ts
import { NextResponse } from "next/server";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import crypto from "crypto";

type ReferralRow = RowDataPacket & {
  id: string;
  name: string;
};

function isAllowed(me: { roles: string[] }) {
  return (
    me.roles.includes("RECEPTION") ||
    me.roles.includes("DOCTOR") || // ✅ allow doctors
    me.roles.includes("ADMIN") ||
    me.roles.includes("SUPER_ADMIN")
  );
}

export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // console.log("GET /api/reception/referrals roles:", me.roles);

  if (!isAllowed(me))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const search = (searchParams.get("search") || "").trim();
  const like = `%${search}%`;

  const [rows] = await db.execute<ReferralRow[]>(
    `SELECT id, name
     FROM referralperson
     WHERE name LIKE :like
     ORDER BY name
     LIMIT 25`,
    { like }
  );

  return NextResponse.json({ referrals: rows });
}

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // console.log("POST /api/reception/referrals roles:", me.roles);

  if (!isAllowed(me))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json()) as { name?: string };
  const name = (body.name || "").trim();

  if (!name)
    return NextResponse.json({ error: "Name is required." }, { status: 400 });

  // Check existing (case-insensitive)
  const [existing] = await db.execute<ReferralRow[]>(
    `SELECT id, name
     FROM referralperson
     WHERE LOWER(name) = LOWER(:name)
     LIMIT 1`,
    { name }
  );

  if (existing.length > 0) {
    return NextResponse.json({ referral: existing[0] });
  }

  const id = crypto.randomUUID();

  try {
    await db.execute<ResultSetHeader>(
      `INSERT INTO referralperson (id, name)
       VALUES (:id, :name)`,
      { id, name }
    );

    return NextResponse.json({ referral: { id, name } });
  } catch {
    // race condition safety
    const [rows] = await db.execute<ReferralRow[]>(
      `SELECT id, name
       FROM referralperson
       WHERE LOWER(name) = LOWER(:name)
       LIMIT 1`,
      { name }
    );

    if (rows.length > 0) return NextResponse.json({ referral: rows[0] });

    return NextResponse.json(
      { error: "Failed to add referral." },
      { status: 500 }
    );
  }
}
