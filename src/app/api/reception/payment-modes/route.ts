import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

type ModeRow = RowDataPacket & {
  code: string;
  display_name: string;
};

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const allowed =
    me.roles.includes("RECEPTION") ||
    me.roles.includes("DOCTOR") ||
    me.roles.includes("ADMIN") ||
    me.roles.includes("SUPER_ADMIN");

  if (!allowed)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [rows] = await db.execute<ModeRow[]>(
    `SELECT code, display_name
     FROM payment_modes
     WHERE is_active = 1
     ORDER BY sort_order, display_name`
  );

  return NextResponse.json({ modes: rows });
}
