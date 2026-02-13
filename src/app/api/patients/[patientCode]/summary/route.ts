// src/app/api/patients/[patientCode]/summary/route.ts
import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

type Ctx = { params: Promise<{ patientCode: string }> };
type VisitsCountRow = RowDataPacket & { total_visits: number };

type PaidAggRow = RowDataPacket & {
  total_paid: number;
  total_refunded: number;
};

function hasAnyRole(me: { roles: string[] }, roles: string[]) {
  return roles.some((r) => me.roles.includes(r));
}

function canViewPatient(me: { roles: string[] }) {
  return hasAnyRole(me, [
    "DOCTOR",
    "RECEPTION",
    "ADMIN",
    "SUPER_ADMIN",
    "DATA_ENTRY",
  ]);
}

function permissionsFor(me: { roles: string[] }) {
  const canEditPatient = hasAnyRole(me, [
    "RECEPTION",
    "ADMIN",
    "SUPER_ADMIN",
    "DATA_ENTRY",
  ]);
  const canViewClinical = hasAnyRole(me, [
    "DOCTOR",
    "ADMIN",
    "SUPER_ADMIN",
    "RECEPTION",
  ]); // reception read-only ok
  const canEditClinical = hasAnyRole(me, ["DOCTOR", "ADMIN", "SUPER_ADMIN"]);
  const canViewBilling = hasAnyRole(me, [
  "DOCTOR",
  "RECEPTION",
  "ADMIN",
  "SUPER_ADMIN",
]);
  return { canEditPatient, canViewClinical, canEditClinical, canViewBilling };
}

type PatientRow = RowDataPacket & {
  id: number;
  patient_code: string;
  full_name: string;
  phone: string | null;
};

type VisitRow = RowDataPacket & {
  visitId: number;
  visitDate: string;
  doctorId: number | null;
  doctorName: string | null;
  tokenNo: number | null;
  queueStatus: "WAITING" | "NEXT" | "IN_ROOM" | "COMPLETED" | null;

  consultationPaymentModeCode: string | null;
  consultationPayStatus: "ACCEPTED" | "PENDING" | "WAIVED" | "CANCELLED" | null;

  diagnosis: string | null;
  hasPrescription: number; // 0/1
};

export async function GET(_req: Request, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canViewPatient(me))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const orgId = Number(me.organizationId);
  const branchId = Number(me.branchId);
  if (
    !Number.isFinite(orgId) ||
    orgId <= 0 ||
    !Number.isFinite(branchId) ||
    branchId <= 0
  ) {
    return NextResponse.json(
      { error: "Invalid org/branch in session." },
      { status: 400 }
    );
  }

  const { patientCode } = await ctx.params;
  const code = String(patientCode ?? "").trim();
  if (!code) {
    return NextResponse.json(
      { error: "Invalid patient code." },
      { status: 400 }
    );
  }

  const perms = permissionsFor(me);

  const [pRows] = await db.execute<PatientRow[]>(
    `
    SELECT id, patient_code, full_name, phone
    FROM patients
    WHERE patient_code = :code
  AND organization_id = :orgId
  AND branch_id = :branchId
LIMIT 1
    `,
    { code, orgId, branchId }
  );

  if (pRows.length === 0) {
    return NextResponse.json({ error: "Patient not found." }, { status: 404 });
  }
  const patient = pRows[0];

  // ✅ Stats: total visits (all time)
  const [countRows] = await db.execute<VisitsCountRow[]>(
    `
    SELECT COUNT(*) AS total_visits
    FROM visits v
    WHERE v.patient_id = :pid
      AND v.organization_id = :org
      AND v.branch_id = :branch
    `,
    { pid: patient.id, org: orgId, branch: branchId }
  );

  const totalVisitsAllTime = Number(countRows?.[0]?.total_visits ?? 0);

  // ✅ Stats: total paid/refunded (ALL services, all time)
  // Uses payments.direction for robustness.
  const [paidRowsAll] = await db.execute<PaidAggRow[]>(
    `
    SELECT
      COALESCE(SUM(CASE WHEN p.direction = 'PAYMENT' THEN pa.amount ELSE 0 END), 0) AS total_paid,
      COALESCE(SUM(CASE WHEN p.direction = 'REFUND'  THEN ABS(pa.amount) ELSE 0 END), 0) AS total_refunded
    FROM payment_allocations pa
    JOIN payments p ON p.id = pa.payment_id
    JOIN visits v ON v.id = pa.visit_id
    WHERE v.patient_id = :pid
      AND v.organization_id = :org
      AND v.branch_id = :branch
    `,
    { pid: patient.id, org: orgId, branch: branchId }
  );

  const totalPaidAllTime = Number(paidRowsAll?.[0]?.total_paid ?? 0);
  const totalRefundedAllTime = Number(paidRowsAll?.[0]?.total_refunded ?? 0);
  const totalNetPaidAllTime = totalPaidAllTime - totalRefundedAllTime;

  const [visitRows] = await db.execute<VisitRow[]>(
    `
    SELECT
      v.id AS visitId,
      DATE_FORMAT(v.visit_date, '%Y-%m-%d') AS visitDate,
      v.doctor_id AS doctorId,
      d.full_name AS doctorName,
      q.token_no AS tokenNo,
      q.status AS queueStatus,

      ${
        perms.canViewClinical
          ? "vn.diagnosis AS diagnosis,"
          : "NULL AS diagnosis,"
      }
      ${
        perms.canViewClinical
          ? "CASE WHEN pr.id IS NULL THEN 0 ELSE 1 END AS hasPrescription,"
          : "0 AS hasPrescription,"
      }

      pay_cons.payment_mode_code AS consultationPaymentModeCode,
      pay_cons.pay_status AS consultationPayStatus


    FROM visits v
    LEFT JOIN queue_entries q ON q.visit_id = v.id
    LEFT JOIN doctors d ON d.id = v.doctor_id

    ${
      perms.canViewClinical
        ? "LEFT JOIN visit_notes vn ON vn.visit_id = v.id"
        : ""
    }
    ${
      perms.canViewClinical
        ? "LEFT JOIN prescriptions pr ON pr.visit_id = v.id"
        : ""
    }

    -- Resolve CONSULTATION service for org
    LEFT JOIN services s_cons
      ON s_cons.organization_id = v.organization_id
     AND s_cons.code = 'CONSULTATION'
     AND s_cons.is_active = 1

    -- Latest CONSULTATION payment for this visit
    LEFT JOIN payments pay_cons
      ON pay_cons.id = (
        SELECT p2.id
        FROM payments p2
        WHERE p2.visit_id = v.id
          AND p2.service_id = s_cons.id
          AND p2.direction = 'PAYMENT'
        ORDER BY p2.created_at DESC, p2.id DESC
        LIMIT 1
      )

    WHERE v.patient_id = :pid
      AND v.organization_id = :org
      AND v.branch_id = :branch
    ORDER BY v.visit_date DESC, v.id DESC
    LIMIT 20
    `,
    { pid: patient.id, org: orgId, branch: branchId }
  );

  return NextResponse.json({
    ok: true,
    permissions: perms,
    me: { roles: me.roles },
    stats: {
      totalVisitsAllTime,
      totalPaidAllTime,
      totalRefundedAllTime,
      totalNetPaidAllTime,
    },
    patient: {
      id: Number(patient.id),
      patientCode: patient.patient_code,
      fullName: patient.full_name,
      phone: patient.phone,
    },
    visits: visitRows.map((r) => ({
      visitId: Number(r.visitId),
      visitDate: String(r.visitDate).slice(0, 10),
      doctorId: r.doctorId != null ? Number(r.doctorId) : null,
      doctorName: r.doctorName,
      tokenNo: r.tokenNo != null ? Number(r.tokenNo) : null,
      queueStatus: r.queueStatus,
      consultationPaymentModeCode: r.consultationPaymentModeCode ?? null,
      consultationPayStatus: r.consultationPayStatus ?? null,
      ...(perms.canViewClinical
        ? { diagnosis: r.diagnosis, hasPrescription: !!r.hasPrescription }
        : {}),
    })),
  });
}
