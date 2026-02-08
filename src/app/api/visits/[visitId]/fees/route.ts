// src/app/api/visits/[visitId]/fees/route.ts
import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

type VisitHdr = RowDataPacket & {
  visitId: number;
  visitDate: string;
  patientCode: string;
  patientName: string;
  doctorId: number;
  doctorName: string;
};

type FeeLine = RowDataPacket & {
  serviceId: number;
  serviceCode: string;
  serviceName: string;
  gross: number;
  discount: number;
  net: number;
  paid: number;
  pending: number;
};

export async function GET(
  _req: Request,
  context: { params: Promise<{ visitId: string }> }
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const allowed =
    me.roles.includes("RECEPTION") ||
    me.roles.includes("ADMIN") ||
    me.roles.includes("SUPER_ADMIN") ||
    me.roles.includes("DOCTOR");

  if (!allowed)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!me.organizationId || !me.branchId) {
    return NextResponse.json({ error: "Invalid org/branch." }, { status: 400 });
  }

  const { visitId } = await context.params;
  const id = Number(visitId);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid visitId." }, { status: 400 });
  }

  // Visit header (validate org/branch access)
  const [vh] = await db.execute<VisitHdr[]>(
    `
    SELECT
      v.id AS visitId,
      v.visit_date AS visitDate,
      p.patient_code AS patientCode,
      p.full_name AS patientName,
      d.id AS doctorId,
      d.full_name AS doctorName
    FROM visits v
    JOIN patients p ON p.id = v.patient_id
    JOIN doctors d ON d.id = v.doctor_id
    WHERE v.id = :visitId
      AND v.organization_id = :org
      AND v.branch_id = :branch
    LIMIT 1
    `,
    { visitId: id, org: me.organizationId, branch: me.branchId }
  );

  if (vh.length === 0) {
    return NextResponse.json({ error: "Visit not found." }, { status: 404 });
  }

  // Charges + paid allocations grouped by service
  const [lines] = await db.execute<FeeLine[]>(
    `
    SELECT
      s.id AS serviceId,
      s.code AS serviceCode,
      s.display_name AS serviceName,
      COALESCE(SUM(vc.gross_amount), 0) AS gross,
      COALESCE(SUM(vc.discount_amount), 0) AS discount,
      COALESCE(SUM(vc.net_amount), 0) AS net,
      COALESCE(pa.paid, 0) AS paid,
      COALESCE(SUM(vc.net_amount), 0) - COALESCE(pa.paid, 0) AS pending
    FROM visit_charges vc
    JOIN services s ON s.id = vc.service_id
    JOIN visits v ON v.id = vc.visit_id
    LEFT JOIN (
      SELECT visit_id, service_id, SUM(amount) AS paid
      FROM payment_allocations
      GROUP BY visit_id, service_id
    ) pa ON pa.visit_id = vc.visit_id AND pa.service_id = vc.service_id
    WHERE vc.visit_id = :visitId
      AND v.organization_id = :org
      AND v.branch_id = :branch
    GROUP BY s.id, s.code, s.display_name, pa.paid
    ORDER BY s.display_name ASC
    `,
    { visitId: id, org: me.organizationId, branch: me.branchId }
  );

  return NextResponse.json({
    ok: true,
    visit: vh[0],
    fees: lines.map((f) => ({
      serviceId: Number(f.serviceId),
      serviceCode: f.serviceCode,
      displayName: f.serviceName,
      gross: Number(f.gross ?? 0),
      discount: Number(f.discount ?? 0),
      net: Number(f.net ?? 0),
      paid: Number(f.paid ?? 0),
      pending: Number(f.pending ?? 0),
    })),
  });
}
