// src/app/(protected)/patients/[patientCode]/page.tsx
import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/db";
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
  amount: number; // consultation NET (new schema)
  payStatus: "ACCEPTED" | "PENDING" | "WAIVED";
  paymentMode: string; // last known mode (best effort)
};

type ServiceIdRow = RowDataPacket & { id: number };

type Ctx = { params: Promise<{ patientCode: string }> };

export default async function PatientSummaryPage({ params }: Ctx) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");

  // ✅ UNWRAP params (Next.js 16)
  const { patientCode: patientCodeParam } = await params;
  const patientCode = String(patientCodeParam ?? "").trim();

  // ✅ Normalize IDs
  const orgId = me.organizationId != null ? Number(me.organizationId) : NaN;
  const branchId = me.branchId != null ? Number(me.branchId) : NaN;

  if (!patientCode) {
    return <div className="p-6">Invalid patient code.</div>;
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

  // 0) Resolve CONSULTATION service_id once (new schema)
  const [svcRows] = await db.execute<ServiceIdRow[]>(
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

  if (svcRows.length === 0) {
    return (
      <div className="p-6">
        CONSULTATION service not configured for this organization.
      </div>
    );
  }

  const consultationServiceId = Number(svcRows[0].id);

  // 1) Header (new schema)
  const [phRows] = await db.execute<PatientHeaderRow[]>(
    `
    SELECT
      p.patient_code AS patientCode,
      p.full_name AS name,
      p.phone AS phone,

      o.code AS orgCode,
      b.code AS branchCode,

      MAX(v.visit_date) AS lastVisit,
      COUNT(DISTINCT v.id) AS totalVisits,

      /* pending = sum(max(net - paid, 0)) across visits */
      COALESCE(
        SUM(
          GREATEST(
            COALESCE(vc.net_amount, 0) - COALESCE(pa.paid_amount, 0),
            0
          )
        ),
        0
      ) AS pendingAmount

    FROM patients p
    JOIN visits v
      ON v.patient_id = p.id
     AND v.organization_id = :org
     AND v.branch_id = :branch

    JOIN organizations o ON o.id = v.organization_id
    JOIN branches b ON b.id = v.branch_id

    /* consultation charge per visit */
    LEFT JOIN (
      SELECT
        visit_id,
        SUM(net_amount) AS net_amount
      FROM visit_charges
      WHERE service_id = :consultationServiceId
      GROUP BY visit_id
    ) vc ON vc.visit_id = v.id

    /* paid allocations per visit */
    LEFT JOIN (
      SELECT
        visit_id,
        SUM(amount) AS paid_amount
      FROM payment_allocations
      WHERE service_id = :consultationServiceId
      GROUP BY visit_id
    ) pa ON pa.visit_id = v.id

    WHERE p.patient_code = :patientCode

    GROUP BY p.patient_code, p.full_name, p.phone, o.code, b.code
    LIMIT 1
    `,
    {
      org: orgId,
      branch: branchId,
      patientCode,
      consultationServiceId,
    }
  );

  if (phRows.length === 0) {
    return <div className="p-6">Patient not found.</div>;
  }

  const header = phRows[0];

  // 2) Visits list (latest first) - new schema
  // - amount = consultation NET
  // - payStatus derived:
  //   - WAIVED if net=0
  //   - ACCEPTED if paid >= net
  //   - PENDING otherwise
  // - paymentMode: best effort = last payment mode used for this visit+service (if any)
  const [visitRows] = await db.execute<VisitRow[]>(
    `
    SELECT
      v.id AS visitId,
      v.visit_date AS visitDate,
      d.full_name AS doctor,

      COALESCE(q.status, 'WAITING') AS status,

      COALESCE(vc.net_amount, 0) AS amount,

      CASE
        WHEN COALESCE(vc.net_amount, 0) = 0 THEN 'WAIVED'
        WHEN COALESCE(pa.paid_amount, 0) >= COALESCE(vc.net_amount, 0) THEN 'ACCEPTED'
        ELSE 'PENDING'
      END AS payStatus,

      COALESCE(pm.payment_mode_code, '—') AS paymentMode

    FROM visits v
    JOIN patients p ON p.id = v.patient_id
    JOIN doctors d ON d.id = v.doctor_id
    LEFT JOIN queue_entries q ON q.visit_id = v.id

    /* consultation net per visit */
    LEFT JOIN (
      SELECT
        visit_id,
        SUM(net_amount) AS net_amount
      FROM visit_charges
      WHERE service_id = :consultationServiceId
      GROUP BY visit_id
    ) vc ON vc.visit_id = v.id

    /* consultation paid per visit */
    LEFT JOIN (
      SELECT
        visit_id,
        SUM(amount) AS paid_amount
      FROM payment_allocations
      WHERE service_id = :consultationServiceId
      GROUP BY visit_id
    ) pa ON pa.visit_id = v.id

    /* last payment mode for this visit/service (best effort) */
    LEFT JOIN (
      SELECT
        pa.visit_id,
        /* last non-null mode by latest payment id */
        SUBSTRING_INDEX(
          GROUP_CONCAT(p.payment_mode_code ORDER BY p.id DESC SEPARATOR ','),
          ',',
          1
        ) AS payment_mode_code
      FROM payment_allocations pa
      JOIN payments p ON p.id = pa.payment_id
      WHERE pa.service_id = :consultationServiceId
      GROUP BY pa.visit_id
    ) pm ON pm.visit_id = v.id

    WHERE v.organization_id = :org
      AND v.branch_id = :branch
      AND p.patient_code = :patientCode

    ORDER BY v.visit_date DESC, v.id DESC
    `,
    {
      org: orgId,
      branch: branchId,
      patientCode,
      consultationServiceId,
    }
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
