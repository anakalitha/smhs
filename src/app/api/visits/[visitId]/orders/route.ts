import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";

export async function POST(
  req: Request,
  context: { params: Promise<{ visitId: string }> }
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const allowed =
    me.roles.includes("DOCTOR") ||
    me.roles.includes("ADMIN") ||
    me.roles.includes("SUPER_ADMIN");

  if (!allowed)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!me.organizationId || !me.branchId)
    return NextResponse.json({ error: "Invalid org/branch." }, { status: 400 });

  const { visitId } = await context.params;
  const id = Number(visitId);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid visitId." }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    serviceCode?: "SCAN" | "CTG" | "PAP" | "PAP_SMEAR" | "LAB" | "PHARMA" | "PHARMACY";
    notes?: string;
  };

  const raw = body.serviceCode ?? "SCAN";
  const serviceCode = raw === "PAP_SMEAR" ? "PAP" : raw === "PHARMACY" ? "PHARMA" : raw;
  const notes = (body.notes ?? "").trim();

  // Ensure visit belongs to same org/branch
  const [v] = await db.execute<RowDataPacket[]>(
    `
  SELECT id
  FROM visits
  WHERE id = :visitId
    AND organization_id = :org
    AND branch_id = :branch
  LIMIT 1
  `,
    { visitId, org: me.organizationId, branch: me.branchId }
  );

  if (v.length === 0)
    return NextResponse.json({ error: "Visit not found." }, { status: 404 });

  const [svcRows] = await db.execute<RowDataPacket[]>(
    `
    SELECT id
    FROM services
    WHERE organization_id = :org
      AND code = :code
      AND is_active = 1
    LIMIT 1
    `,
    { org: me.organizationId, code: serviceCode }
  );

  if (svcRows.length === 0) {
    return NextResponse.json(
      { error: `Service not configured: ${serviceCode}` },
      { status: 400 }
    );
  }

  const serviceId = Number(svcRows[0].id);

  const [ins] = await db.execute<ResultSetHeader>(
    `
    INSERT INTO visit_orders
      (visit_id, service_id, status, notes, ordered_by_user_id)
    VALUES
      (:visitId, :serviceId, 'ORDERED', :notes, :uid)
    `,
    {
      visitId,
      serviceId,
      notes,
      uid: me.id,
    }
  );

  return NextResponse.json({ ok: true, orderId: ins.insertId });
}
