import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

type Ctx = { params: Promise<{ orderId: string }> };

function allowed(me: { roles: string[] }) {
  return (
    me.roles.includes("PHARMA_IN_CHARGE") ||
    me.roles.includes("ADMIN") ||
    me.roles.includes("SUPER_ADMIN")
  );
}

type OrderRow = RowDataPacket & {
  orderId: number;
  status: "PENDING" | "PURCHASED" | "NOT_PURCHASED";
  updatedAt: string | null;
  visitId: number;
  visitDate: string;
  patientId: number;
  patientCode: string;
  patientName: string;
  doctorName: string;
  prescriptionId: number;
};

type ItemRow = RowDataPacket & {
  id: number;
  medicineName: string;
  dosage: string | null;
  morning: number;
  afternoon: number;
  night: number;
  beforeFood: number;
  durationDays: number | null;
  instructions: string | null;
  sortOrder: number;
};

export async function GET(req: Request, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!allowed(me)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!me.organizationId || !me.branchId) {
    return NextResponse.json({ error: "Invalid org/branch." }, { status: 400 });
  }

  const { orderId } = await ctx.params;
  const id = Number(orderId);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid orderId." }, { status: 400 });
  }

  const [oRows] = await db.execute<OrderRow[]>(
    `
    SELECT
      po.id AS orderId,
      po.status AS status,
      po.updated_at AS updatedAt,
      v.id AS visitId,
      v.visit_date AS visitDate,
      p.id AS patientId,
      p.patient_code AS patientCode,
      p.full_name AS patientName,
      d.full_name AS doctorName,
      po.prescription_id AS prescriptionId
    FROM pharma_orders po
    JOIN visits v ON v.id = po.visit_id
    JOIN patients p ON p.id = v.patient_id
    JOIN doctors d ON d.id = v.doctor_id
    WHERE po.id = :id
      AND v.organization_id = :org
      AND v.branch_id = :branch
    LIMIT 1
    `,
    { id, org: me.organizationId, branch: me.branchId }
  );

  if (oRows.length === 0) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  const order = oRows[0];

  const [items] = await db.execute<ItemRow[]>(
    `
    SELECT
      pi.id AS id,
      pi.medicine_name AS medicineName,
      pi.dosage AS dosage,
      pi.morning AS morning,
      pi.afternoon AS afternoon,
      pi.night AS night,
      pi.before_food AS beforeFood,
      pi.duration_days AS durationDays,
      pi.instructions AS instructions,
      pi.sort_order AS sortOrder
    FROM prescription_items pi
    WHERE pi.prescription_id = :rx
    ORDER BY pi.sort_order ASC, pi.id ASC
    `,
    { rx: order.prescriptionId }
  );

  return NextResponse.json({ ok: true, order, items });
}
