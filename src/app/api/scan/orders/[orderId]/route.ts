// src/app/api/scan/orders/[orderId]/route.ts
import { NextResponse, type NextRequest } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

type Row = RowDataPacket & {
  orderId: number;
  status: string;
  notes: string | null;

  visitId: number;
  visitDate: string;

  patientCode: string;
  patientName: string;
  phone: string | null;

  doctorName: string;

  defaultFee: number | null;

  chargeId: number | null;
  baseAmount: number | null;
  finalAmount: number | null;
  discountType: string | null;
  discountValue: number | null;
  reason: string | null;

  paymentId: number | null;
  paidAmount: number | null;
  payStatus: string | null;
  paymentMode: string | null;
};

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ orderId: string }> }
) {
  const { orderId: orderIdParam } = await context.params;

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

  const orderId = Number(orderIdParam);
  if (!Number.isFinite(orderId) || orderId <= 0)
    return NextResponse.json({ error: "Invalid orderId" }, { status: 400 });

  const [rows] = await db.execute<Row[]>(
    `
    SELECT
      o.id AS orderId,
      o.status AS status,
      o.notes AS notes,

      v.id AS visitId,
      v.visit_date AS visitDate,

      p.patient_code AS patientCode,
      p.full_name AS patientName,
      p.phone AS phone,

      d.full_name AS doctorName,

      fc.default_amount AS defaultFee,

      c.id AS chargeId,
      c.base_amount AS baseAmount,
      c.final_amount AS finalAmount,
      c.discount_type AS discountType,
      c.discount_value AS discountValue,
      c.reason AS reason,

      pay.id AS paymentId,
      pay.amount AS paidAmount,
      pay.pay_status AS payStatus,
      pay.payment_mode AS paymentMode

    FROM visit_orders o
    JOIN visits v ON v.id = o.visit_id
    JOIN services s ON s.id = o.service_id
    JOIN patients p ON p.id = v.patient_id
    JOIN doctors d ON d.id = v.doctor_id
    LEFT JOIN fee_catalog fc
      ON fc.organization_id = v.organization_id
     AND fc.branch_id = v.branch_id
     AND fc.fee_type = 'SCAN'
     AND fc.is_active = 1
    LEFT JOIN charges c
      ON c.visit_id = v.id
     AND c.order_id = o.id
     AND c.fee_type = 'SCAN'
    LEFT JOIN payments pay
      ON pay.visit_id = v.id
     AND pay.fee_type = 'SCAN'
    WHERE v.organization_id = :org
      AND v.branch_id = :branch
      AND s.code = 'SCAN'
      AND o.id = :orderId
    LIMIT 1
    `,
    { org: me.organizationId, branch: me.branchId, orderId }
  );

  if (rows.length === 0)
    return NextResponse.json({ error: "Order not found." }, { status: 404 });

  const r = rows[0];

  return NextResponse.json({
    order: { orderId: r.orderId, status: r.status, notes: r.notes },
    visit: {
      visitId: r.visitId,
      visitDate: r.visitDate,
      doctorName: r.doctorName,
    },
    patient: {
      patientCode: r.patientCode,
      name: r.patientName,
      phone: r.phone ?? "—",
    },
    defaults: { scanFee: Number(r.defaultFee ?? 0) },
    existing: {
      chargeId: r.chargeId,
      baseAmount: Number(r.baseAmount ?? 0),
      finalAmount: Number(r.finalAmount ?? 0),
      discountType: r.discountType ?? "NONE",
      discountValue: Number(r.discountValue ?? 0),
      reason: r.reason ?? "",
      payment: r.paymentId
        ? {
            paymentId: r.paymentId,
            amount: Number(r.paidAmount ?? 0),
            payStatus: r.payStatus ?? "PENDING",
            paymentMode: r.paymentMode ?? "CASH",
          }
        : null,
    },
  });
}
