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

  const id = Number(rows[0]?.id);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

type OrderType = "SCAN" | "CTG" | "PAP_SMEAR";

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

  const startRaw = url.searchParams.get("start");
  const endRaw = url.searchParams.get("end");

  const start = /^\d{4}-\d{2}-\d{2}$/.test(startRaw ?? "")
    ? startRaw!
    : "2024-01-01";
  const end = /^\d{4}-\d{2}-\d{2}$/.test(endRaw ?? "")
    ? endRaw!
    : ymd(new Date());

  const orgId = Number(me.organizationId);
  const branchId = Number(me.branchId);

  if (!orgId || !branchId) {
    return NextResponse.json(
      { error: "Invalid org/branch in session." },
      { status: 400 }
    );
  }

  const isAdmin =
    me.roles.includes("ADMIN") || me.roles.includes("SUPER_ADMIN");

  let doctorId: number | null = null;

  if (isAdmin && url.searchParams.get("doctorId")) {
    const d = Number(url.searchParams.get("doctorId"));
    if (!Number.isFinite(d) || d <= 0) {
      return NextResponse.json({ error: "Invalid doctorId." }, { status: 400 });
    }
    doctorId = d;
  } else if (!isAdmin) {
    doctorId = await resolveDoctorIdForUser({
      userId: me.id,
      orgId,
      branchId,
    });
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
    start,
    end,
  };
  if (doctorId) params.doctorId = doctorId;

  /* ---------------- KPIs ---------------- */

  const [[totalPatientsRow]] = await db.execute<RowDataPacket[]>(
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

  const [[repeatPatientsRow]] = await db.execute<RowDataPacket[]>(
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
    ) t
    `,
    params
  );

  /* ---------------- Orders ---------------- */

  const [orderCounts] = await db.execute<RowDataPacket[]>(
    `
    SELECT
      s.code AS serviceCode,
      COUNT(DISTINCT o.visit_id) AS cnt
    FROM visit_orders o
    JOIN visits v ON v.id = o.visit_id
    JOIN services s ON s.id = o.service_id
    WHERE v.organization_id = :org
      AND v.branch_id = :branch
      ${whereDoctor}
      AND v.visit_date BETWEEN :start AND :end
      AND o.status <> 'CANCELLED'
      AND s.code IN ('SCAN','CTG','PAP')
    GROUP BY s.code
    `,
    params
  );

  const orderMap: Record<OrderType, number> = {
    SCAN: 0,
    CTG: 0,
    PAP_SMEAR: 0,
  };

  orderCounts.forEach((r) => {
    const code = String(r.serviceCode);
    const key = (code === "PAP" ? "PAP_SMEAR" : code) as OrderType;
    if (key in orderMap) {
      orderMap[key] = Number(r.cnt ?? 0);
    }
  });

  /* ---------------- Fee Breakdown ---------------- */

  const [feeBreakdown] = await db.execute<RowDataPacket[]>(
    `
    SELECT
      CASE
        WHEN s.code = 'PHARMA' THEN 'PHARMACY'
        WHEN s.code = 'PAP' THEN 'PAP_SMEAR'
        ELSE s.code
      END AS feeType,
      SUM(pay.amount) AS totalAmount
    FROM payments pay
    JOIN visits v ON v.id = pay.visit_id
    JOIN services s
      ON s.id = pay.service_id
     AND s.organization_id = :org
    WHERE v.organization_id = :org
      AND v.branch_id = :branch
      ${whereDoctor}
      AND v.visit_date BETWEEN :start AND :end
      AND pay.pay_status = 'ACCEPTED'
    GROUP BY feeType
    `,
    params
  );

  /* ---------------- Referrals ---------------- */

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
    GROUP BY referralName
    ORDER BY cnt DESC
    LIMIT 5
    `,
    params
  );

  /* ---------------- Medicines ---------------- */

  const [medicineBreakdown] = await db.execute<RowDataPacket[]>(
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
    ORDER BY cnt DESC
    LIMIT 12
    `,
    params
  );

  return NextResponse.json({
    range: { start, end },
    totals: {
      totalPatients: Number(totalPatientsRow?.totalPatients ?? 0),
      repeatPatients: Number(repeatPatientsRow?.repeatPatients ?? 0),
      scanOrdered: orderMap.SCAN,
      ctgOrdered: orderMap.CTG,
      papOrdered: orderMap.PAP_SMEAR,
    },
    feeBreakdown: feeBreakdown.map((r) => ({
      feeType: String(r.feeType),
      totalAmount: Number(r.totalAmount ?? 0),
    })),
    topReferrals: topReferrals.map((r) => ({
      referralName: String(r.referralName),
      cnt: Number(r.cnt ?? 0),
    })),
    medicineBreakdown: medicineBreakdown.map((r) => ({
      medicineName: String(r.medicineName),
      cnt: Number(r.cnt ?? 0),
    })),
  });
}
