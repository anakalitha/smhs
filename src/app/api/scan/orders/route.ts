import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

type OrderRow = RowDataPacket & {
  orderId: number;
  visitId: number;
  visitDate: string;
  patientCode: string;
  patientName: string;
  doctorName: string;
  status: string;
  notes: string | null;
};

export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const allowed =
    me.roles.includes("SCAN_IN_CHARGE") ||
    me.roles.includes("ADMIN") ||
    me.roles.includes("SUPER_ADMIN");

  if (!allowed)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!me.organizationId || !me.branchId)
    return NextResponse.json({ error: "Invalid org/branch." }, { status: 400 });

  const url = new URL(req.url);
  const status = (url.searchParams.get("status") || "ORDERED").toUpperCase();

  const [rows] = await db.execute<OrderRow[]>(
    `
    SELECT
      o.id AS orderId,
      v.id AS visitId,
      v.visit_date AS visitDate,
      p.patient_code AS patientCode,
      p.full_name AS patientName,
      d.full_name AS doctorName,
      o.status AS status,
      o.notes AS notes
    FROM visit_orders o
    JOIN visits v ON v.id = o.visit_id
    JOIN services s ON s.id = o.service_id
    JOIN patients p ON p.id = v.patient_id
    JOIN doctors d ON d.id = v.doctor_id
    WHERE v.organization_id = :org
      AND v.branch_id = :branch
      AND s.code = 'SCAN'
      AND o.status = :status
    ORDER BY v.visit_date DESC, o.id DESC
    `,
    { org: me.organizationId, branch: me.branchId, status }
  );

  return NextResponse.json({ rows });
}
