import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

type PendingRow = RowDataPacket & {
  visit_id: number;
  visit_date: string;
  age_days: number;

  patient_code: string;
  patient_name: string;
  phone: string | null;

  doctor_name: string | null;
  referred_by: string | null;

  consultation_charged: number;
  consultation_paid: number;
  consultation_pending: number;
};

type TotalsRow = RowDataPacket & {
  total_charged: number;
  total_paid: number;
  total_pending: number;
  pending_visits: number;
};

type BucketRow = RowDataPacket & {
  age_bucket: "TODAY" | "1-7" | "8-30" | "31+";
  visits_count: number;
  pending_amount: number;
};

function mustBeReceptionOrAdmin(me: { roles?: string[] } | null) {
  const roles = me?.roles ?? [];
  return (
    roles.includes("RECEPTION") ||
    roles.includes("ADMIN") ||
    roles.includes("SUPER_ADMIN")
  );
}

function isYmd(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!mustBeReceptionOrAdmin(me))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!me.organizationId || !me.branchId) {
    return NextResponse.json(
      { error: "Your account is not linked to organization/branch." },
      { status: 400 }
    );
  }

  const url = new URL(req.url);

  const start = (url.searchParams.get("start") || "").trim();
  const end = (url.searchParams.get("end") || "").trim();
  const asOf = (url.searchParams.get("asOf") || end || "").trim();

  const pendingType = (url.searchParams.get("pendingType") || "ALL").trim(); // ALL|UNPAID|PARTIAL
  const ageBucket = (url.searchParams.get("ageBucket") || "ALL").trim(); // ALL|TODAY|GT_1|GT_7|GT_30

  const doctorIdRaw = (url.searchParams.get("doctorId") || "").trim();
  const referralIdRaw = (url.searchParams.get("referralId") || "").trim();

  if (!isYmd(start) || !isYmd(end) || !isYmd(asOf)) {
    return NextResponse.json(
      { error: "start, end, asOf must be YYYY-MM-DD" },
      { status: 400 }
    );
  }

  const doctorId = doctorIdRaw ? Number(doctorIdRaw) : null;
  const referralId = referralIdRaw ? String(referralIdRaw) : null;

  const conn = await db.getConnection();
  try {
    const orgId = Number(me.organizationId);
    const branchId = Number(me.branchId);

    // Resolve CONSULTATION service id
    const [svcRows] = await conn.execute<RowDataPacket[]>(
      `SELECT id FROM services WHERE organization_id = :org_id AND code = 'CONSULTATION' LIMIT 1`,
      { org_id: orgId }
    );

    if (svcRows.length === 0) {
      return NextResponse.json(
        { error: "CONSULTATION service is not configured." },
        { status: 400 }
      );
    }
    const consultServiceId = Number(svcRows[0].id);

    const params = {
      org_id: orgId,
      branch_id: branchId,
      start_date: start,
      end_date: end,
      as_of_date: asOf,
      doctor_id: doctorId,
      referralperson_id: referralId,
      pending_type: pendingType,
      age_bucket: ageBucket,
      consult_service_id: consultServiceId,
    };

    const [rows] = await conn.execute<PendingRow[]>(
      `
      SELECT
        v.id AS visit_id,
        v.visit_date,
        DATEDIFF(:as_of_date, v.visit_date) AS age_days,

        p.patient_code,
        p.full_name AS patient_name,
        p.phone,

        d.full_name AS doctor_name,
        rp.name AS referred_by,

        COALESCE(SUM(vc.net_amount), 0) AS consultation_charged,
        COALESCE(SUM(pa.amount), 0) AS consultation_paid,
        COALESCE(SUM(vc.net_amount), 0) - COALESCE(SUM(pa.amount), 0) AS consultation_pending

      FROM visits v
      JOIN patients p ON p.id = v.patient_id
      LEFT JOIN doctors d ON d.id = v.doctor_id
      LEFT JOIN referralperson rp ON rp.id = v.referralperson_id

      LEFT JOIN visit_charges vc
        ON vc.visit_id = v.id
       AND vc.service_id = :consult_service_id

      LEFT JOIN payment_allocations pa
        ON pa.visit_id = v.id
       AND pa.service_id = :consult_service_id

      WHERE v.organization_id = :org_id
        AND v.branch_id = :branch_id
        AND v.visit_date BETWEEN :start_date AND :end_date
        AND (:doctor_id IS NULL OR v.doctor_id = :doctor_id)
        AND (:referralperson_id IS NULL OR v.referralperson_id = :referralperson_id)
        AND v.status NOT IN ('CANCELLED', 'NO_SHOW')

      GROUP BY
        v.id, v.visit_date,
        p.patient_code, p.full_name, p.phone,
        d.full_name, rp.name

      HAVING
        consultation_pending > 0
        AND (
          :pending_type = 'ALL'
          OR (:pending_type = 'UNPAID'  AND consultation_paid = 0)
          OR (:pending_type = 'PARTIAL' AND consultation_paid > 0)
        )
        AND (
          :age_bucket = 'ALL'
          OR (:age_bucket = 'TODAY' AND DATEDIFF(:as_of_date, v.visit_date) = 0)
          OR (:age_bucket = 'GT_1'  AND DATEDIFF(:as_of_date, v.visit_date) > 1)
          OR (:age_bucket = 'GT_7'  AND DATEDIFF(:as_of_date, v.visit_date) > 7)
          OR (:age_bucket = 'GT_30' AND DATEDIFF(:as_of_date, v.visit_date) > 30)
        )

      ORDER BY v.visit_date ASC, p.full_name ASC
      `,
      params
    );

    const [totalsRows] = await conn.execute<TotalsRow[]>(
      `
      SELECT
        COALESCE(SUM(x.consultation_charged), 0) AS total_charged,
        COALESCE(SUM(x.consultation_paid), 0) AS total_paid,
        COALESCE(SUM(x.consultation_pending), 0) AS total_pending,
        COUNT(*) AS pending_visits
      FROM (
        SELECT
          v.id AS visit_id,
          COALESCE(SUM(vc.net_amount), 0) AS consultation_charged,
          COALESCE(SUM(pa.amount), 0) AS consultation_paid,
          COALESCE(SUM(vc.net_amount), 0) - COALESCE(SUM(pa.amount), 0) AS consultation_pending
        FROM visits v
        LEFT JOIN visit_charges vc
          ON vc.visit_id = v.id
         AND vc.service_id = :consult_service_id
        LEFT JOIN payment_allocations pa
          ON pa.visit_id = v.id
         AND pa.service_id = :consult_service_id
        WHERE v.organization_id = :org_id
          AND v.branch_id = :branch_id
          AND v.visit_date BETWEEN :start_date AND :end_date
          AND v.status NOT IN ('CANCELLED', 'NO_SHOW')
        GROUP BY v.id
        HAVING consultation_pending > 0
      ) x
      `,
      params
    );

    const [bucketRows] = await conn.execute<BucketRow[]>(
      `
      SELECT
        CASE
          WHEN DATEDIFF(:as_of_date, v.visit_date) = 0 THEN 'TODAY'
          WHEN DATEDIFF(:as_of_date, v.visit_date) BETWEEN 1 AND 7 THEN '1-7'
          WHEN DATEDIFF(:as_of_date, v.visit_date) BETWEEN 8 AND 30 THEN '8-30'
          ELSE '31+'
        END AS age_bucket,

        COUNT(DISTINCT v.id) AS visits_count,
        COALESCE(SUM(vc.net_amount), 0) - COALESCE(SUM(pa.amount), 0) AS pending_amount

      FROM visits v
      LEFT JOIN visit_charges vc
        ON vc.visit_id = v.id
       AND vc.service_id = :consult_service_id
      LEFT JOIN payment_allocations pa
        ON pa.visit_id = v.id
       AND pa.service_id = :consult_service_id

      WHERE v.organization_id = :org_id
        AND v.branch_id = :branch_id
        AND v.visit_date BETWEEN :start_date AND :end_date
        AND v.status NOT IN ('CANCELLED', 'NO_SHOW')

      GROUP BY age_bucket
      HAVING pending_amount > 0
      ORDER BY
        CASE age_bucket
          WHEN 'TODAY' THEN 1
          WHEN '1-7' THEN 2
          WHEN '8-30' THEN 3
          ELSE 4
        END
      `,
      params
    );

    return NextResponse.json({
      ok: true,
      rows,
      totals: totalsRows[0] ?? {
        total_charged: 0,
        total_paid: 0,
        total_pending: 0,
        pending_visits: 0,
      },
      buckets: bucketRows ?? [],
    });
  } catch (e) {
    console.error("❌ Pending report failed:", e);
    return NextResponse.json(
      { error: "Failed to load pending report." },
      { status: 500 }
    );
  } finally {
    conn.release();
  }
}
