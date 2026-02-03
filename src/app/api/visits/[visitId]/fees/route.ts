import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

type FeeRow = RowDataPacket & {
  paymentId: number;
  feeType: "CONSULTATION" | "SCAN" | "PAP_SMEAR" | "CTG" | "PHARMACY";
  baseAmount: number;
  amount: number;
  payStatus: "ACCEPTED" | "PENDING" | "WAIVED";
  paymentMode: string;
};

type VisitHdr = RowDataPacket & {
  visitId: number;
  visitDate: string;
  patientCode: string;
  patientName: string;
  doctorId: number;
  doctorName: string;
};

function feeLabel(t: FeeRow["feeType"]) {
  switch (t) {
    case "CONSULTATION":
      return "Consultation Fee";
    case "SCAN":
      return "Scan Fee";
    case "PAP_SMEAR":
      return "PAP Smear Fee";
    case "CTG":
      return "CTG Fee";
    case "PHARMACY":
      return "Pharmacy Fee";
  }
}

export async function GET(
  req: Request,
  context: { params: Promise<{ visitId: string }> }
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const allowed =
    me.roles.includes("RECEPTION") ||
    me.roles.includes("ADMIN") ||
    me.roles.includes("SUPER_ADMIN") ||
    me.roles.includes("DOCTOR"); // optional
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

  // Fee lines
  const [fees] = await db.execute<FeeRow[]>(
    `
    SELECT
      pay.id AS paymentId,
      pay.fee_type AS feeType,
      pay.base_amount AS baseAmount,
      pay.amount AS amount,
      pay.pay_status AS payStatus,
      pay.payment_mode AS paymentMode
    FROM payments pay
    WHERE pay.visit_id = :visitId
    ORDER BY pay.id ASC
    `,
    { visitId: id }
  );

  return NextResponse.json({
    ok: true,
    visit: vh[0],
    fees: fees.map((f) => ({
      paymentId: Number(f.paymentId),
      feeType: f.feeType,
      displayName: feeLabel(f.feeType),
      baseAmount: Number(f.baseAmount ?? 0),
      amount: Number(f.amount ?? 0),
      payStatus: f.payStatus,
      paymentMode: f.paymentMode,
    })),
  });
}
