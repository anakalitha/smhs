import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2/promise";
import { db } from "@lib/db";
import { getCurrentUser } from "@/lib/session";
import PatientSummaryClient from "./PatientSummaryClient";

type PatientHeaderRow = RowDataPacket & {
  patientCode: string;
  name: string;
  phone: string | null;
  orgCode: string;
  branchCode: string;
  lastVisit: string | null;
  totalVisits: number;
  pendingAmount: number;
};

type VisitRow = RowDataPacket & {
  visitId: number;
  visitDate: string; // YYYY-MM-DD
  doctor: string;
  status: "WAITING" | "NEXT" | "IN_ROOM" | "DONE";
  amount: number;
  payStatus: "ACCEPTED" | "PENDING" | "WAIVED";
  paymentMode: string;
};

export default async function PatientSummaryPage({
  params,
}: {
  params: { patientId: string };
}) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");

  // console.log("🧾 PatientSummary getCurrentUser:", {
  //   id: me.id,
  //   roles: me.roles,
  //   organizationId: me.organizationId,
  //   branchId: me.branchId,
  // });

  // ✅ UNWRAP params (Next.js 16)
  const { patientId } = await params;
  const patientCode = String(patientId ?? "").trim();

  // ✅ Normalize IDs
  const orgId = me.organizationId != null ? Number(me.organizationId) : NaN;
  const branchId = me.branchId != null ? Number(me.branchId) : NaN;

  if (!patientCode) {
    return <div className="p-6">Invalid patient id.</div>;
  }

  if (
    !Number.isFinite(orgId) ||
    orgId <= 0 ||
    !Number.isFinite(branchId) ||
    branchId <= 0
  ) {
    return (
      <div className="p-6">
        Invalid org/branch in session. Please logout and login again.
      </div>
    );
  }

  // ✅ Now your DB queries can use patientCode/orgId/branchId safely
  const [phRows] = await db.execute<PatientHeaderRow[]>(
    `
    SELECT
      p.patient_code AS patientCode,
      p.full_name AS name,
      p.phone AS phone,
      o.code AS orgCode,
      b.code AS branchCode,
      MAX(v.visit_date) AS lastVisit,
      COUNT(v.id) AS totalVisits,
      COALESCE(SUM(CASE WHEN pay.pay_status = 'PENDING' THEN pay.amount ELSE 0 END), 0) AS pendingAmount
    FROM patients p
    JOIN visits v
      ON v.patient_id = p.id
     AND v.organization_id = :org
     AND v.branch_id = :branch
    JOIN organizations o ON o.id = v.organization_id
    JOIN branches b ON b.id = v.branch_id
    LEFT JOIN payments pay
      ON pay.visit_id = v.id
     AND pay.fee_type = 'CONSULTATION'
    WHERE p.patient_code = :patientCode
    GROUP BY p.patient_code, p.full_name, p.phone, o.code, b.code
    LIMIT 1
    `,
    { org: orgId, branch: branchId, patientCode }
  );

  if (phRows.length === 0) {
    return <div className="p-6">Patient not found.</div>;
  }

  const header = phRows[0];

  // Visits list (latest first)
  const [visitRows] = await db.execute<VisitRow[]>(
    `
    SELECT
      v.id AS visitId,
      v.visit_date AS visitDate,
      d.full_name AS doctor,
      COALESCE(q.status, 'WAITING') AS status,
      COALESCE(pay.amount, 0) AS amount,
      COALESCE(pay.pay_status, 'PENDING') AS payStatus,
      COALESCE(pay.payment_mode, '—') AS paymentMode
    FROM visits v
    JOIN patients p ON p.id = v.patient_id
    JOIN doctors d ON d.id = v.doctor_id
    LEFT JOIN queue_entries q ON q.visit_id = v.id
    LEFT JOIN payments pay
      ON pay.visit_id = v.id
     AND pay.fee_type = 'CONSULTATION'
    WHERE v.organization_id = :org
      AND v.branch_id = :branch
      AND p.patient_code = :patientCode
    ORDER BY v.visit_date DESC, v.id DESC
    `,
    { org: me.organizationId, branch: me.branchId, patientCode }
  );

  return (
    <PatientSummaryClient
      patient={{
        patientCode: header.patientCode,
        name: header.name,
        phone: header.phone ?? "—",
        branch: `${header.orgCode} / ${header.branchCode}`,
        lastVisit: toYYYYMMDD(header.lastVisit),
        pending: Number(header.pendingAmount ?? 0),
        totalVisits: Number(header.totalVisits ?? 0),
      }}
      visits={visitRows.map((v) => ({
        ...v,
        visitDate: toYYYYMMDD(v.visitDate),
        amount: Number(v.amount ?? 0),
      }))}
    />
  );
}

function toYYYYMMDD(v: unknown): string {
  if (!v) return "—";
  if (typeof v === "string") return v.slice(0, 10);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}
