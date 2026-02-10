import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

type ServiceOptRow = RowDataPacket & { code: string; display_name: string };
type ReferralOptRow = RowDataPacket & { id: string; name: string };
type DoctorOptRow = RowDataPacket & { id: number; full_name: string };
type ModeOptRow = RowDataPacket & { code: string; display_name: string };

type DetailRow = RowDataPacket & {
  visitDate: string;
  patientCode: string;
  patientName: string;
  phone: string | null;
  referredBy: string | null;
  doctorName: string;

  serviceCode: string;
  serviceName: string;

  grossAmount: number;
  discountAmount: number;
  netAmount: number;

  paidAmount: number;
  pendingAmount: number;

  paymentModeCode: string | null;
};

type GroupRow = RowDataPacket & {
  groupKey: string;
  visitsCount: number;

  grossAmount: number;
  discountAmount: number;
  netAmount: number;
  paidAmount: number;
  pendingAmount: number;
};

function isValidISODate(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function num(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

type StatusFilter = "ALL" | "PENDING" | "PAID" | "WAIVED";
type GroupBy =
  | "NONE"
  | "DATE"
  | "REFERRAL"
  | "DOCTOR"
  | "SERVICE"
  | "PAYMENT_MODE"
  | "STATUS";

function buildStatusHaving(status: StatusFilter) {
  // We compute pending = net - paid
  if (status === "PENDING") return "HAVING pendingAmount > 0";
  if (status === "PAID") return "HAVING pendingAmount <= 0 AND paidAmount > 0";
  if (status === "WAIVED") return "HAVING netAmount = 0";
  return "";
}

function groupKeyExpr(groupBy: GroupBy) {
  switch (groupBy) {
    case "DATE":
      return "DATE(v.visit_date)";
    case "REFERRAL":
      return "COALESCE(rp.name, '—')";
    case "DOCTOR":
      return "d.full_name";
    case "SERVICE":
      return "s.code";
    case "PAYMENT_MODE":
      return "COALESCE(pm.code, '—')";
    case "STATUS":
      return `
        CASE
          WHEN (COALESCE(vc.netAmount,0) - COALESCE(pa.paidAmount,0)) > 0 THEN 'PENDING'
          WHEN COALESCE(vc.netAmount,0) = 0 THEN 'WAIVED'
          WHEN COALESCE(pa.paidAmount,0) > 0 THEN 'PAID'
          ELSE 'UNPAID'
        END
      `;
    default:
      return "''";
  }
}

export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const allowed =
    me.roles.includes("RECEPTION") ||
    me.roles.includes("DOCTOR") ||
    me.roles.includes("ADMIN") ||
    me.roles.includes("SUPER_ADMIN");

  if (!allowed)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!me.organizationId || !me.branchId) {
    return NextResponse.json(
      { error: "Your account is not linked to organization/branch." },
      { status: 400 }
    );
  }

  const url = new URL(req.url);

  const startDate = (url.searchParams.get("startDate") || "").trim();
  const endDate = (url.searchParams.get("endDate") || "").trim();

  if (!isValidISODate(startDate) || !isValidISODate(endDate)) {
    return NextResponse.json(
      { error: "startDate and endDate are required in YYYY-MM-DD format." },
      { status: 400 }
    );
  }

  const referralId = (url.searchParams.get("referralId") || "").trim() || null;
  const doctorIdRaw = (url.searchParams.get("doctorId") || "").trim();
  const doctorId = doctorIdRaw ? Number(doctorIdRaw) : null;

  let serviceCode = (url.searchParams.get("serviceCode") || "").trim() || null;
  const paymentMode =
    (url.searchParams.get("paymentMode") || "").trim() || null;

  const status = ((url.searchParams.get("status") || "ALL")
    .trim()
    .toUpperCase() || "ALL") as StatusFilter;

  const groupBy = ((url.searchParams.get("groupBy") || "NONE")
    .trim()
    .toUpperCase() || "NONE") as GroupBy;

  // Reception default
  if (me.roles.includes("RECEPTION") && !serviceCode) {
    serviceCode = "CONSULTATION";
  }

  const orgId = Number(me.organizationId);
  const branchId = Number(me.branchId);

  // Dropdown options (for UI)
  const [services] = await db.execute<ServiceOptRow[]>(
    `
    SELECT code, display_name
    FROM services
    WHERE organization_id = :org
      AND is_active = 1
    ORDER BY display_name ASC
    `,
    { org: orgId }
  );

  const [referrals] = await db.execute<ReferralOptRow[]>(
    `
    SELECT id, name
    FROM referralperson
    ORDER BY name ASC
    `
  );

  const [doctors] = await db.execute<DoctorOptRow[]>(
    `
    SELECT id, full_name
    FROM doctors
    WHERE organization_id = :org
      AND branch_id = :branch
      AND is_active = 1
    ORDER BY full_name ASC
    `,
    { org: orgId, branch: branchId }
  );

  const [modes] = await db.execute<ModeOptRow[]>(
    `
    SELECT code, display_name
    FROM payment_modes
    WHERE is_active = 1
    ORDER BY display_name ASC
    `
  );

  // Core query: build aggregated charge + aggregated paid per visit+service
  const baseWhere = `
    v.organization_id = :org
    AND v.branch_id = :branch
    AND v.visit_date BETWEEN :startDate AND :endDate
    AND v.status NOT IN ('CANCELLED', 'NO_SHOW')
    AND (:referralId IS NULL OR v.referralperson_id = :referralId)
    AND (:doctorId IS NULL OR v.doctor_id = :doctorId)
    AND (:serviceCode IS NULL OR s.code = :serviceCode)
    AND (:paymentMode IS NULL OR pm.code = :paymentMode)
  `;

  const params = {
    org: orgId,
    branch: branchId,
    startDate,
    endDate,
    referralId,
    doctorId,
    serviceCode,
    paymentMode,
  };

  // Detail rows
  if (groupBy === "NONE") {
    const statusHaving = buildStatusHaving(status);

    const [rows] = await db.execute<DetailRow[]>(
      `
      SELECT
        v.visit_date AS visitDate,
        p.patient_code AS patientCode,
        p.full_name AS patientName,
        p.phone AS phone,
        rp.name AS referredBy,
        d.full_name AS doctorName,

        s.code AS serviceCode,
        s.display_name AS serviceName,

        COALESCE(vc.grossAmount, 0) AS grossAmount,
        COALESCE(vc.discountAmount, 0) AS discountAmount,
        COALESCE(vc.netAmount, 0) AS netAmount,

        COALESCE(pa.paidAmount, 0) AS paidAmount,
        (COALESCE(vc.netAmount, 0) - COALESCE(pa.paidAmount, 0)) AS pendingAmount,

        pm.code AS paymentModeCode

      FROM visits v
      JOIN patients p ON p.id = v.patient_id
      JOIN doctors d ON d.id = v.doctor_id
      LEFT JOIN referralperson rp ON rp.id = v.referralperson_id

      -- Expand visit->service via visit_charges (one row per charged service)
      JOIN visit_charges vc_raw ON vc_raw.visit_id = v.id
      JOIN services s ON s.id = vc_raw.service_id

      -- Aggregate charges for the same visit+service (safety)
      JOIN (
        SELECT
          visit_id,
          service_id,
          SUM(gross_amount) AS grossAmount,
          SUM(discount_amount) AS discountAmount,
          SUM(net_amount) AS netAmount
        FROM visit_charges
        GROUP BY visit_id, service_id
      ) vc ON vc.visit_id = v.id AND vc.service_id = vc_raw.service_id

      -- Aggregate allocations (paid) per visit+service
      LEFT JOIN (
        SELECT
          visit_id,
          service_id,
          SUM(amount) AS paidAmount
        FROM payment_allocations
        GROUP BY visit_id, service_id
      ) pa ON pa.visit_id = v.id AND pa.service_id = vc_raw.service_id

      -- Payment mode: pick the latest ACCEPTED payment mode for that visit (optional)
      LEFT JOIN (
        SELECT
          p1.visit_id,
          p1.payment_mode_code AS code
        FROM payments p1
        JOIN (
          SELECT visit_id, MAX(id) AS max_id
          FROM payments
          WHERE direction = 'PAYMENT'
            AND pay_status = 'ACCEPTED'
          GROUP BY visit_id
        ) lastp ON lastp.visit_id = p1.visit_id AND lastp.max_id = p1.id
      ) pm ON pm.visit_id = v.id

      WHERE ${baseWhere}

      GROUP BY
        v.visit_date, p.patient_code, p.full_name, p.phone, rp.name, d.full_name,
        s.code, s.display_name,
        vc.grossAmount, vc.discountAmount, vc.netAmount,
        pa.paidAmount,
        pm.code

      ${statusHaving}

      ORDER BY v.visit_date ASC, p.full_name ASC, s.display_name ASC
      `,
      params
    );

    const totals = rows.reduce(
      (acc, r) => {
        acc.gross += num(r.grossAmount);
        acc.discount += num(r.discountAmount);
        acc.net += num(r.netAmount);
        acc.paid += num(r.paidAmount);
        acc.pending += num(r.pendingAmount);
        return acc;
      },
      { gross: 0, discount: 0, net: 0, paid: 0, pending: 0 }
    );

    return NextResponse.json({
      ok: true,
      mode: "DETAIL",
      rows: rows.map((r) => ({
        visitDate: String(r.visitDate).slice(0, 10),
        patientCode: r.patientCode,
        patientName: r.patientName,
        referredBy: r.referredBy ?? "—",
        phone: r.phone ?? "—",
        doctorName: r.doctorName,
        serviceCode: r.serviceCode,
        serviceName: r.serviceName,
        grossAmount: num(r.grossAmount),
        paidAmount: num(r.paidAmount),
        discountAmount: num(r.discountAmount),
        netAmount: num(r.netAmount),
        pendingAmount: num(r.pendingAmount),
        paymentMode: r.paymentModeCode ?? "—",
      })),
      totals,
      options: {
        services,
        referrals,
        doctors,
        paymentModes: modes,
        role: me.roles,
      },
    });
  }

  // Grouped rows
  const groupExpr = groupKeyExpr(groupBy);
  const statusHaving = buildStatusHaving(status);

  const [grows] = await db.execute<GroupRow[]>(
    `
    SELECT
      ${groupExpr} AS groupKey,
      COUNT(DISTINCT v.id) AS visitsCount,

      COALESCE(SUM(vc.grossAmount), 0) AS grossAmount,
      COALESCE(SUM(vc.discountAmount), 0) AS discountAmount,
      COALESCE(SUM(vc.netAmount), 0) AS netAmount,
      COALESCE(SUM(pa.paidAmount), 0) AS paidAmount,
      COALESCE(SUM(vc.netAmount), 0) - COALESCE(SUM(pa.paidAmount), 0) AS pendingAmount

    FROM visits v
    LEFT JOIN referralperson rp ON rp.id = v.referralperson_id
    JOIN doctors d ON d.id = v.doctor_id

    -- Expand visit->service via visit_charges
    JOIN visit_charges vc_raw ON vc_raw.visit_id = v.id
    JOIN services s ON s.id = vc_raw.service_id

    JOIN (
      SELECT
        visit_id,
        service_id,
        SUM(gross_amount) AS grossAmount,
        SUM(discount_amount) AS discountAmount,
        SUM(net_amount) AS netAmount
      FROM visit_charges
      GROUP BY visit_id, service_id
    ) vc ON vc.visit_id = v.id AND vc.service_id = vc_raw.service_id

    LEFT JOIN (
      SELECT
        visit_id,
        service_id,
        SUM(amount) AS paidAmount
      FROM payment_allocations
      GROUP BY visit_id, service_id
    ) pa ON pa.visit_id = v.id AND pa.service_id = vc_raw.service_id

    LEFT JOIN (
      SELECT
        p1.visit_id,
        p1.payment_mode_code AS code
      FROM payments p1
      JOIN (
        SELECT visit_id, MAX(id) AS max_id
        FROM payments
        WHERE direction = 'PAYMENT'
          AND pay_status = 'ACCEPTED'
        GROUP BY visit_id
      ) lastp ON lastp.visit_id = p1.visit_id AND lastp.max_id = p1.id
    ) pm ON pm.visit_id = v.id

    WHERE ${baseWhere}

    GROUP BY groupKey

    ${statusHaving}

    ORDER BY groupKey ASC
    `,
    params
  );

  const totals = grows.reduce(
    (acc, r) => {
      acc.gross += num(r.grossAmount);
      acc.discount += num(r.discountAmount);
      acc.net += num(r.netAmount);
      acc.paid += num(r.paidAmount);
      acc.pending += num(r.pendingAmount);
      acc.visits += num(r.visitsCount);
      return acc;
    },
    { gross: 0, discount: 0, net: 0, paid: 0, pending: 0, visits: 0 }
  );

  return NextResponse.json({
    ok: true,
    mode: "GROUPED",
    groupBy,
    rows: grows.map((r) => ({
      groupKey: String(r.groupKey ?? "—"),
      visitsCount: num(r.visitsCount),
      grossAmount: num(r.grossAmount),
      paidAmount: num(r.paidAmount),
      discountAmount: num(r.discountAmount),
      netAmount: num(r.netAmount),
      pendingAmount: num(r.pendingAmount),
    })),
    totals,
    options: {
      services,
      referrals,
      doctors,
      paymentModes: modes,
      role: me.roles,
    },
  });
}
