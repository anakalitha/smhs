// src/app/api/reception/patients/[patientCode]/summary/route.ts
import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

type Ctx = { params: Promise<{ patientCode: string }> };

type VisitRow = RowDataPacket & {
  visitId: number;
  visitDate: string; // YYYY-MM-DD
  status: string;
  doctorName: string | null;

  netAmount: number;
  paidAmount: number;
  payStatus: "ACCEPTED" | "PENDING" | "WAIVED";
  paymentMode: string | null;
};

function isReceptionOrAdmin(me: { roles?: string[] } | null | undefined) {
  const roles = me?.roles ?? [];
  return (
    roles.includes("RECEPTION") ||
    roles.includes("ADMIN") ||
    roles.includes("SUPER_ADMIN")
  );
}

function asNumber(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function GET(req: Request, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isReceptionOrAdmin(me))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const orgId = me.organizationId != null ? Number(me.organizationId) : NaN;
  const branchId = me.branchId != null ? Number(me.branchId) : NaN;
  if (!Number.isFinite(orgId) || !Number.isFinite(branchId)) {
    return NextResponse.json(
      { error: "Invalid org/branch in session." },
      { status: 400 }
    );
  }

  const { patientCode } = await ctx.params;
  const code = String(patientCode || "").trim();
  if (!code) {
    return NextResponse.json({ error: "Invalid patientCode." }, { status: 400 });
  }

  // 1) Resolve patient by patient_code
  const [pRows] = await db.execute<RowDataPacket[]>(
    `
    SELECT id, patient_code, full_name, phone, dob, gender
    FROM patients
    WHERE patient_code = :code
    LIMIT 1
    `,
    { code }
  );

  if (pRows.length === 0) {
    return NextResponse.json({ error: "Patient not found." }, { status: 404 });
  }

  const patientId = Number(pRows[0].id);
  if (!Number.isFinite(patientId) || patientId <= 0) {
    return NextResponse.json({ error: "Invalid patient." }, { status: 500 });
  }

  // 2) Security boundary: ensure this patient has visits in THIS org+branch
  const [hasVisitRows] = await db.execute<RowDataPacket[]>(
    `
    SELECT 1 AS ok
    FROM visits
    WHERE patient_id = :pid
      AND organization_id = :org
      AND branch_id = :branch
    LIMIT 1
    `,
    { pid: patientId, org: orgId, branch: branchId }
  );

  if (hasVisitRows.length === 0) {
    return NextResponse.json(
      { error: "Patient not found in this branch." },
      { status: 404 }
    );
  }

  // 3) All visits for this patient within org+branch (include today's visit too)
  //    Compute net from visit_charges and paid from payments (ACCEPTED only)
  const [vRows] = await db.execute<VisitRow[]>(
    `
    SELECT
      v.id AS visitId,
      DATE_FORMAT(v.visit_date, '%Y-%m-%d') AS visitDate,
      v.status AS status,
      d.full_name AS doctorName,

      COALESCE(vc.net_amount, 0) AS netAmount,
      COALESCE(paid.paidAmount, 0) AS paidAmount,
      paid.paymentMode AS paymentMode
    FROM visits v
    LEFT JOIN doctors d ON d.id = v.doctor_id
    LEFT JOIN (
      SELECT visit_id, MAX(net_amount) AS net_amount
      FROM visit_charges
      GROUP BY visit_id
    ) vc ON vc.visit_id = v.id
    LEFT JOIN (
      SELECT
        visit_id,
        SUM(amount) AS paidAmount,
        SUBSTRING_INDEX(
          GROUP_CONCAT(payment_mode_code ORDER BY id DESC SEPARATOR ','),
          ',',
          1
        ) AS paymentMode
      FROM payments
      WHERE direction = 'PAYMENT'
        AND pay_status = 'ACCEPTED'
      GROUP BY visit_id
    ) paid ON paid.visit_id = v.id
    WHERE v.patient_id = :pid
      AND v.organization_id = :org
      AND v.branch_id = :branch
    ORDER BY v.visit_date DESC, v.id DESC
    `,
    { pid: patientId, org: orgId, branch: branchId }
  );

  const visits = vRows.map((r) => {
    const net = asNumber(r.netAmount);
    const paid = asNumber(r.paidAmount);

    let payStatus: "ACCEPTED" | "PENDING" | "WAIVED" = "PENDING";
    if (net <= 0) payStatus = "WAIVED";
    else if (paid >= net) payStatus = "ACCEPTED";
    else payStatus = "PENDING";

    return {
      visitId: Number(r.visitId),
      visitDate: String(r.visitDate),
      status: String(r.status),
      doctorName: r.doctorName ? String(r.doctorName) : null,
      netAmount: net,
      payStatus,
      paymentMode: r.paymentMode ? String(r.paymentMode) : null,
    };
  });

  return NextResponse.json({
    ok: true,
    patient: {
      patientCode: String(pRows[0].patient_code),
      name: String(pRows[0].full_name || ""),
      phone: pRows[0].phone ? String(pRows[0].phone) : null,
      dob: pRows[0].dob ? String(pRows[0].dob) : null,
      gender: pRows[0].gender ? String(pRows[0].gender) : null,
    },
    visits,
    totalVisits: visits.length,
  });
}
