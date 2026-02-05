// src/app/api/doctor/analytics/route.ts
import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

async function resolveDoctorIdForUser(args: {
  userId: number;
  orgId: number;
  branchId: number;
}): Promise<number | null> {
  const [rows] = await db.execute<RowDataPacket[]>(
    `
    SELECT id
    FROM doctors
    WHERE user_id = :uid
      AND organization_id = :org
      AND branch_id = :branch
      AND is_active = 1
    LIMIT 1
    `,
    { uid: args.userId, org: args.orgId, branch: args.branchId }
  );

  if (rows.length === 0) return null;
  const id = Number(rows[0].id);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const allowed =
    me.roles.includes("DOCTOR") ||
    me.roles.includes("ADMIN") ||
    me.roles.includes("SUPER_ADMIN");

  if (!allowed)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const start = (url.searchParams.get("start") ?? "").trim();
  const end = (url.searchParams.get("end") ?? "").trim();

  // ✅ Default range requested: 2024-01-01 to today
  const defaultStart = "2024-01-01";
  const defaultEnd = ymd(new Date());

  const startDate = /^\d{4}-\d{2}-\d{2}$/.test(start) ? start : defaultStart;
  const endDate = /^\d{4}-\d{2}-\d{2}$/.test(end) ? end : defaultEnd;

  const orgId = me.organizationId != null ? Number(me.organizationId) : NaN;
  const branchId = me.branchId != null ? Number(me.branchId) : NaN;

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

  const isAdmin =
    me.roles.includes("ADMIN") || me.roles.includes("SUPER_ADMIN");

  // doctor scope
  const doctorIdParam = (url.searchParams.get("doctorId") ?? "").trim();
  let doctorId: number | null = null;

  if (isAdmin && doctorIdParam) {
    const d = Number(doctorIdParam);
    if (!Number.isFinite(d) || d <= 0) {
      return NextResponse.json({ error: "Invalid doctorId." }, { status: 400 });
    }
    doctorId = d;
  } else if (!isAdmin) {
    doctorId = await resolveDoctorIdForUser({ userId: me.id, orgId, branchId });
    if (!doctorId) {
      return NextResponse.json(
        { error: "Doctor account not linked to doctor profile." },
        { status: 400 }
      );
    }
  }

  const whereDoctor = doctorId ? "AND v.doctor_id = :doctorId" : "";

  const params: Record<string, unknown> = {
    org: orgId,
    branch: branchId,
    start: startDate,
    end: endDate,
  };
  if (doctorId) params.doctorId = doctorId;

  // ✅ 1) Total Patients (correct): distinct patient_id (includes no-phone patients)
  const [totalPatientsRows] = await db.execute<RowDataPacket[]>(
    `
    SELECT COUNT(DISTINCT v.patient_id) AS totalPatients
    FROM visits v
    WHERE v.organization_id = :org
      AND v.branch_id = :branch
      ${whereDoctor}
      AND v.visit_date BETWEEN :start AND :end
    `,
    params
  );

  // ✅ 2) Repeat Patients: exact match of Name+Phone, ignoring patients without phone
  const [repeatRows] = await db.execute<RowDataPacket[]>(
    `
    SELECT COUNT(*) AS repeatPatients
    FROM (
      SELECT p.full_name, p.phone
      FROM visits v
      JOIN patients p ON p.id = v.patient_id
      WHERE v.organization_id = :org
        AND v.branch_id = :branch
        ${whereDoctor}
        AND v.visit_date BETWEEN :start AND :end
        AND p.phone IS NOT NULL AND p.phone <> ''
      GROUP BY p.full_name, p.phone
      HAVING COUNT(*) > 1
    ) x
    `,
    params
  );

  // ✅ 3) Orders counts by type (distinct visits, not number of order rows)
  const [orderCounts] = await db.execute<RowDataPacket[]>(
    `
    SELECT
      o.order_type AS orderType,
      COUNT(DISTINCT o.visit_id) AS cnt
    FROM visit_orders o
    JOIN visits v ON v.id = o.visit_id
    WHERE v.organization_id = :org
      AND v.branch_id = :branch
      ${whereDoctor}
      AND v.visit_date BETWEEN :start AND :end
      AND o.status <> 'CANCELLED'
      AND o.order_type IN ('SCAN','CTG','PAP_SMEAR')
    GROUP BY o.order_type
    `,
    params
  );

  // 4) Fee breakdown from payments
  const [feeBreakdown] = await db.execute<RowDataPacket[]>(
    `
    SELECT
      pay.fee_type AS feeType,
      SUM(pay.amount) AS totalAmount
    FROM payments pay
    JOIN visits v ON v.id = pay.visit_id
    WHERE v.organization_id = :org
      AND v.branch_id = :branch
      ${whereDoctor}
      AND v.visit_date BETWEEN :start AND :end
    GROUP BY pay.fee_type
    ORDER BY SUM(pay.amount) DESC
    `,
    params
  );

  // 5) Top referrals (assuming referralperson table + visits.referralperson_id)
  const [topReferrals] = await db.execute<RowDataPacket[]>(
    `
    SELECT
      COALESCE(rp.name, '—') AS referralName,
      COUNT(*) AS cnt
    FROM visits v
    LEFT JOIN referralperson rp ON rp.id = v.referralperson_id
    WHERE v.organization_id = :org
      AND v.branch_id = :branch
      ${whereDoctor}
      AND v.visit_date BETWEEN :start AND :end
    GROUP BY COALESCE(rp.name, '—')
    ORDER BY COUNT(*) DESC
    LIMIT 5
    `,
    params
  );

  // 6) Medicine breakdown (top 12)
  const [meds] = await db.execute<RowDataPacket[]>(
    `
    SELECT
      pi.medicine_name AS medicineName,
      COUNT(*) AS cnt
    FROM prescription_items pi
    JOIN prescriptions pr ON pr.id = pi.prescription_id
    JOIN visits v ON v.id = pr.visit_id
    WHERE v.organization_id = :org
      AND v.branch_id = :branch
      ${whereDoctor}
      AND v.visit_date BETWEEN :start AND :end
    GROUP BY pi.medicine_name
    ORDER BY COUNT(*) DESC
    LIMIT 12
    `,
    params
  );

  const totalPatients = Number(totalPatientsRows[0]?.totalPatients ?? 0);
  const repeatPatients = Number(repeatRows[0]?.repeatPatients ?? 0);

  const orderMap: Record<string, number> = { SCAN: 0, CTG: 0, PAP_SMEAR: 0 };
  for (const r of orderCounts) {
    const k = String(r.orderType);
    orderMap[k] = Number(r.cnt ?? 0);
  }

  return NextResponse.json({
    ok: true,
    range: { start: startDate, end: endDate },
    totals: {
      totalPatients,
      repeatPatients,
      scanOrdered: orderMap.SCAN ?? 0,
      ctgOrdered: orderMap.CTG ?? 0,
      papOrdered: orderMap.PAP_SMEAR ?? 0,
    },
    feeBreakdown: (feeBreakdown || []).map((r) => ({
      feeType: String(r.feeType),
      totalAmount: Number(r.totalAmount ?? 0),
    })),
    topReferrals: (topReferrals || []).map((r) => ({
      referralName: String(r.referralName),
      cnt: Number(r.cnt ?? 0),
    })),
    medicineBreakdown: (meds || []).map((r) => ({
      medicineName: String(r.medicineName),
      cnt: Number(r.cnt ?? 0),
    })),
  });
}
