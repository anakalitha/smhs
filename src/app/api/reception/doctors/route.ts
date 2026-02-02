import { NextResponse } from "next/server";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

type DoctorRow = RowDataPacket & {
  id: number;
  full_name: string;
};

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!me.organizationId || !me.branchId)
    return NextResponse.json({ error: "Invalid org/branch" }, { status: 400 });

  const allowed =
    me.roles.includes("RECEPTION") ||
    me.roles.includes("ADMIN") ||
    me.roles.includes("SUPER_ADMIN");

  if (!allowed)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [rows] = await db.execute<DoctorRow[]>(
    `SELECT id, full_name
     FROM doctors
     WHERE organization_id = :org
       AND branch_id = :branch
       AND is_active = 1
     ORDER BY full_name`,
    {
      org: me.organizationId,
      branch: me.branchId,
    }
  );

  return NextResponse.json({ doctors: rows });
}

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!me.organizationId || !me.branchId)
    return NextResponse.json({ error: "Invalid org/branch" }, { status: 400 });

  if (!me.roles.includes("RECEPTION"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json()) as {
    name?: string;
    phone?: string;
  };

  const name = (body.name || "").trim();
  const phone = (body.phone || "").trim() || null;

  if (!name)
    return NextResponse.json(
      { error: "Doctor name is required." },
      { status: 400 }
    );

  // Check duplicate (branch scoped, case-insensitive)
  const [existing] = await db.execute<RowDataPacket[]>(
    `SELECT id, full_name
     FROM doctors
     WHERE branch_id = :branch
       AND LOWER(full_name) = LOWER(:name)
     LIMIT 1`,
    { branch: me.branchId, name }
  );

  if (existing.length > 0) {
    return NextResponse.json({ doctor: existing[0] });
  }

  const [ins] = await db.execute<ResultSetHeader>(
    `INSERT INTO doctors (organization_id, branch_id, full_name, phone)
     VALUES (:org, :branch, :name, :phone)`,
    {
      org: me.organizationId,
      branch: me.branchId,
      name,
      phone,
    }
  );

  return NextResponse.json({
    doctor: { id: ins.insertId, full_name: name },
  });
}
