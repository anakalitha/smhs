// src/app/api/medicines/route.ts
import { NextResponse } from "next/server";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

type MedicineRow = RowDataPacket & {
  id: number;
  name: string;
  is_active?: number;
};

function isAllowed(me: { roles: string[] }) {
  // Same policy as referrals: Reception + Doctor + Admins
  return (
    me.roles.includes("RECEPTION") ||
    me.roles.includes("DOCTOR") ||
    me.roles.includes("ADMIN") ||
    me.roles.includes("SUPER_ADMIN")
  );
}

export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAllowed(me))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const search = (searchParams.get("search") || "").trim();
  const like = `%${search}%`;

  // NOTE: medicines table is org-wide by default. If you later want per-org/per-branch,
  // add organization_id / branch_id columns and filter here.
  const [rows] = await db.execute<MedicineRow[]>(
    `
    SELECT id, name
    FROM medicines
    WHERE is_active = 1
      AND name LIKE :like
    ORDER BY name
    LIMIT 25
    `,
    { like }
  );

  return NextResponse.json({ ok: true, items: rows });
}

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAllowed(me))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { name?: string };
  const name = (body.name || "").trim();

  if (!name)
    return NextResponse.json({ error: "Name is required." }, { status: 400 });

  // Case-insensitive upsert behaviour (same UX as ReferralComboBox)
  const [existing] = await db.execute<MedicineRow[]>(
    `
    SELECT id, name
    FROM medicines
    WHERE LOWER(name) = LOWER(:name)
    LIMIT 1
    `,
    { name }
  );

  if (existing.length > 0) {
    return NextResponse.json({ ok: true, medicine: existing[0] });
  }

  try {
    const [ins] = await db.execute<ResultSetHeader>(
      `INSERT INTO medicines (name, is_active) VALUES (:name, 1)`,
      { name }
    );

    return NextResponse.json({
      ok: true,
      medicine: { id: Number(ins.insertId), name },
    });
  } catch {
    // Race condition safety
    const [rows] = await db.execute<MedicineRow[]>(
      `
      SELECT id, name
      FROM medicines
      WHERE LOWER(name) = LOWER(:name)
      LIMIT 1
      `,
      { name }
    );

    if (rows.length > 0)
      return NextResponse.json({ ok: true, medicine: rows[0] });

    return NextResponse.json(
      { error: "Failed to add medicine." },
      { status: 500 }
    );
  }
}
