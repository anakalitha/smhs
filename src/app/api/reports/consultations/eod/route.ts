// src/app/api/reports/consultations/eod/route.ts
import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

type ServiceRow = RowDataPacket & { id: number };

type EodRow = RowDataPacket & {
  visitDate: string;
  patientCode: string;
  patientName: string;
  referredBy: string | null;
  phone: string | null;

  grossAmount: number;
  discountAmount: number;
  netAmount: number;
  paidAmount: number;
};

function isValidISODate(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const allowed =
    me.roles.includes("RECEPTION") ||
    me.roles.includes("ADMIN") ||
    me.roles.includes("SUPER_ADMIN");

  if (!allowed)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!me.organizationId || !me.branchId) {
    return NextResponse.json(
      { error: "Your account is not linked to organization/branch." },
      { status: 400 }
    );
  }

  const url = new URL(req.url);
  const date = (url.searchParams.get("date") || "").trim();

  // Default = today (server)
  const runDate =
    date && isValidISODate(date) ? date : new Date().toISOString().slice(0, 10);

  const orgId = Number(me.organizationId);
  const branchId = Number(me.branchId);

  // Resolve CONSULTATION service_id (org-scoped)
  const [svcRows] = await db.execute<ServiceRow[]>(
    `
    SELECT id
    FROM services
    WHERE organization_id = :org
      AND code = 'CONSULTATION'
      AND is_active = 1
    LIMIT 1
    `,
    { org: orgId }
  );

  const consultationServiceId = svcRows[0]?.id ?? null;
  if (!consultationServiceId) {
    return NextResponse.json(
      { error: "CONSULTATION service not configured." },
      { status: 400 }
    );
  }

  // Rows: EOD for that date (consultation only)
  const [rows] = await db.execute<EodRow[]>(
    `
    SELECT
      v.visit_date AS visitDate,
      p.patient_code AS patientCode,
      p.full_name AS patientName,
      rp.name AS referredBy,
      p.phone AS phone,

      COALESCE(SUM(vc.gross_amount), 0) AS grossAmount,
      COALESCE(SUM(vc.discount_amount), 0) AS discountAmount,
      COALESCE(SUM(vc.net_amount), 0) AS netAmount,
      COALESCE(pa.paidAmount, 0) AS paidAmount

    FROM visits v
    JOIN patients p ON p.id = v.patient_id
    LEFT JOIN referralperson rp ON rp.id = v.referralperson_id

    LEFT JOIN visit_charges vc
      ON vc.visit_id = v.id
     AND vc.service_id = :serviceId

    LEFT JOIN (
      SELECT
        visit_id,
        service_id,
        SUM(amount) AS paidAmount
      FROM payment_allocations
      GROUP BY visit_id, service_id
    ) pa
      ON pa.visit_id = v.id
     AND pa.service_id = :serviceId

    WHERE v.organization_id = :org
      AND v.branch_id = :branch
      AND v.visit_date = :runDate
      AND v.status NOT IN ('CANCELLED', 'NO_SHOW')

    GROUP BY
      v.visit_date, p.patient_code, p.full_name, rp.name, p.phone, pa.paidAmount

    ORDER BY p.full_name ASC
    `,
    {
      org: orgId,
      branch: branchId,
      runDate,
      serviceId: consultationServiceId,
    }
  );

  const totals = rows.reduce(
    (acc, r) => {
      acc.gross += Number(r.grossAmount ?? 0);
      acc.paid += Number(r.paidAmount ?? 0);
      acc.discount += Number(r.discountAmount ?? 0);
      acc.net += Number(r.netAmount ?? 0);
      return acc;
    },
    { gross: 0, paid: 0, discount: 0, net: 0 }
  );

  return NextResponse.json({
    ok: true,
    date: runDate,
    serviceCode: "CONSULTATION",
    rows: rows.map((r) => ({
      visitDate: String(r.visitDate).slice(0, 10),
      patientCode: r.patientCode,
      patientName: r.patientName,
      referredBy: r.referredBy ?? "—",
      phone: r.phone ?? "—",
      grossAmount: Number(r.grossAmount ?? 0),
      paidAmount: Number(r.paidAmount ?? 0),
      discountAmount: Number(r.discountAmount ?? 0),
      netAmount: Number(r.netAmount ?? 0),
    })),
    totals,
  });
}
