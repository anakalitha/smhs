// src\app\api\visits\[visitId]\summary\route.ts
import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/db";
import { getCurrentUser, type CurrentUser } from "@/lib/session";

type Ctx = { params: Promise<{ visitId: string }> };

function isAllowed(me: { roles: string[] }) {
  return (
    me.roles.includes("RECEPTION") ||
    me.roles.includes("DOCTOR") ||
    me.roles.includes("ADMIN") ||
    me.roles.includes("SUPER_ADMIN")
  );
}

function mustHaveOrgBranch(me: CurrentUser) {
  const orgId = me.organizationId != null ? Number(me.organizationId) : NaN;
  const branchId = me.branchId != null ? Number(me.branchId) : NaN;
  return { orgId, branchId };
}

function toPayStatus(net: number, pending: number) {
  if (net <= 0) return "WAIVED" as const;
  if (pending > 0) return "PENDING" as const;
  return "ACCEPTED" as const;
}

type VisitRow = RowDataPacket & {
  id: number;
  visit_date: string;
  organization_id: number;
  branch_id: number;
  doctor_id: number | null;

  patient_code: string;
  full_name: string;
  phone: string | null;

  referred_by: string | null;
  doctor_name: string | null;
};

type LineRow = RowDataPacket & {
  service_id: number;
  service_code: string;
  service_name: string;

  gross_amount: number;
  discount_amount: number;
  net_amount: number;

  paid_amount: number;
  refunded_amount: number;
};

type RefundRow = RowDataPacket & {
  payment_id: number;
  service_code: string;
  service_name: string;
  amount: number;
  payment_mode_code: string;
  created_at: string;
  note: string | null;

  voucher_file_url: string | null;
  voucher_original_name: string | null;
  voucher_uploaded_at: string | null;
};

type DocRow = RowDataPacket & {
  id: number;
  category: string;
  file_url: string;
  original_name: string | null;
  uploaded_at: string;
};

export async function GET(req: Request, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAllowed(me))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { orgId, branchId } = mustHaveOrgBranch(me);
  if (!Number.isFinite(orgId) || !Number.isFinite(branchId)) {
    return NextResponse.json(
      { error: "Your account is not linked to organization/branch." },
      { status: 400 }
    );
  }

  const { visitId } = await ctx.params;
  const vid = Number(visitId);
  if (!Number.isFinite(vid) || vid <= 0) {
    return NextResponse.json({ error: "Invalid visit id." }, { status: 400 });
  }

  // 1) Visit header
  const [vRows] = await db.execute<VisitRow[]>(
    `
    SELECT
      v.id,
      v.visit_date,
      v.organization_id,
      v.branch_id,
      v.doctor_id,
      p.patient_code,
      p.full_name,
      p.phone,
      rp.name AS referred_by,
      d.full_name AS doctor_name
    FROM visits v
    JOIN patients p ON p.id = v.patient_id
    LEFT JOIN referralperson rp ON rp.id = v.referralperson_id
    LEFT JOIN doctors d ON d.id = v.doctor_id
    WHERE v.id = :vid
    LIMIT 1
    `,
    { vid }
  );

  if (vRows.length === 0) {
    return NextResponse.json({ error: "Visit not found." }, { status: 404 });
  }

  const v = vRows[0];

  // scope check
  if (Number(v.organization_id) !== orgId || Number(v.branch_id) !== branchId) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  // doctor access restriction (optional but recommended)
  if (me.roles.includes("DOCTOR")) {
    const myDoctorId = me.doctorId != null ? Number(me.doctorId) : NaN;
    if (
      !Number.isFinite(myDoctorId) ||
      Number(v.doctor_id ?? 0) !== myDoctorId
    ) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
  }

  // 2) Payment lines from visit_charges + payments
  const [lineRows] = await db.execute<LineRow[]>(
    `
    SELECT
      vc.service_id,
      s.code AS service_code,
      s.display_name AS service_name,
      vc.gross_amount,
      vc.discount_amount,
      vc.net_amount,

      COALESCE(SUM(CASE
        WHEN p.direction = 'PAYMENT' AND p.pay_status = 'ACCEPTED' THEN p.amount
        ELSE 0 END
      ), 0) AS paid_amount,

      COALESCE(SUM(CASE
        WHEN p.direction = 'REFUND' AND p.pay_status = 'ACCEPTED' THEN p.amount
        ELSE 0 END
      ), 0) AS refunded_amount

    FROM visit_charges vc
    JOIN services s ON s.id = vc.service_id
    LEFT JOIN payments p
      ON p.visit_id = vc.visit_id AND p.service_id = vc.service_id
    WHERE vc.visit_id = :vid
    GROUP BY
      vc.service_id, s.code, s.display_name,
      vc.gross_amount, vc.discount_amount, vc.net_amount
    ORDER BY s.display_name ASC
    `,
    { vid }
  );

  const paymentLines = lineRows.map((r) => {
    const net = Number(r.net_amount) || 0;
    const paid = Number(r.paid_amount) || 0;
    const refunded = Number(r.refunded_amount) || 0;
    const netPaid = Math.max(paid - refunded, 0);

    const pending = Math.max(net - netPaid, 0);
    const refundDue = Math.max(netPaid - net, 0);
    const status = toPayStatus(net, pending);

    return {
      serviceId: Number(r.service_id),
      serviceCode: String(r.service_code),
      serviceName: String(r.service_name),

      grossAmount: Number(r.gross_amount) || 0,
      discountAmount: Number(r.discount_amount) || 0,
      netAmount: net,

      paidAmount: paid,
      refundedAmount: refunded,
      netPaid,

      pendingAmount: pending,
      refundDue,
      status,
    };
  });

  // 3) Refund history + voucher
  // 3) Refund history + voucher (Phase-1: payment_documents has no doc_type)
  // 3) Refund history + voucher (Option B: voucher stored in visit_documents)
  const [refundRows] = await db.execute<RefundRow[]>(
    `
  SELECT
    p.id AS payment_id,
    s.code AS service_code,
    s.display_name AS service_name,
    p.amount,
    p.payment_mode_code,
    p.created_at,
    p.note,

    vd.file_url AS voucher_file_url,
    vd.original_name AS voucher_original_name,
    vd.uploaded_at AS voucher_uploaded_at
  FROM payments p
  JOIN services s ON s.id = p.service_id
  LEFT JOIN visit_documents vd
    ON vd.payment_id = p.id
   AND vd.category = 'REFUND_VOUCHER'
  WHERE p.visit_id = :vid
    AND p.direction = 'REFUND'
    AND p.pay_status = 'ACCEPTED'
  ORDER BY p.created_at DESC
  `,
    { vid }
  );

  const refunds = refundRows.map((r) => ({
    paymentId: Number(r.payment_id),
    serviceCode: String(r.service_code),
    serviceName: String(r.service_name),
    amount: Number(r.amount) || 0,
    mode: String(r.payment_mode_code || "—"),
    createdAt: String(r.created_at),
    note: r.note ?? null,
    voucher: r.voucher_file_url
      ? {
          fileUrl: r.voucher_file_url,
          originalName: r.voucher_original_name ?? null,
          uploadedAt: r.voucher_uploaded_at ?? "",
        }
      : null,
  }));

  // 4) Visit documents
  const [docRows] = await db.execute<DocRow[]>(
    `
    SELECT id, category, file_url, original_name, uploaded_at
    FROM visit_documents
    WHERE visit_id = :vid
    ORDER BY uploaded_at DESC
    `,
    { vid }
  );

  const documents = docRows.map((d) => ({
    id: Number(d.id),
    category: String(d.category),
    fileUrl: String(d.file_url),
    originalName: d.original_name ?? null,
    uploadedAt: String(d.uploaded_at),
  }));

  return NextResponse.json({
    ok: true,
    visit: {
      visitId: Number(v.id),
      visitDate: String(v.visit_date),
      patientName: String(v.full_name),
      patientCode: String(v.patient_code),
      patientPhone: v.phone ?? null,
      referredBy: v.referred_by ?? null,
      doctorName: v.doctor_name ?? null,
    },
    paymentLines,
    refunds,
    documents,
  });
}
