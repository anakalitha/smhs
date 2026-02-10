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

function esc(s: unknown) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ kind: string }> }
) {
  const { kind } = await ctx.params;

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

  if (kind !== "xlsx" && kind !== "pdf") {
    return NextResponse.json(
      { error: "Invalid export kind." },
      { status: 400 }
    );
  }

  const url = new URL(req.url);
  const start = (url.searchParams.get("start") || "").trim();
  const end = (url.searchParams.get("end") || "").trim();
  const asOf = (url.searchParams.get("asOf") || end || "").trim();

  const pendingType = (url.searchParams.get("pendingType") || "ALL").trim();
  const ageBucket = (url.searchParams.get("ageBucket") || "ALL").trim();

  if (!isYmd(start) || !isYmd(end) || !isYmd(asOf)) {
    return NextResponse.json(
      { error: "start, end, asOf must be YYYY-MM-DD" },
      { status: 400 }
    );
  }

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
        AND v.status NOT IN ('CANCELLED', 'NO_SHOW')

      GROUP BY
        v.id, v.visit_date,
        p.patient_code, p.full_name, p.phone,
        d.full_name, rp.name

      HAVING consultation_pending > 0
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

    const title = `Pending Consultation Fees (${start} to ${end})`;

    const table = `
      <table border="1" cellspacing="0" cellpadding="6">
        <thead>
          <tr>
            <th>Visit Date</th>
            <th>Age (days)</th>
            <th>Patient ID</th>
            <th>Name</th>
            <th>Phone</th>
            <th>Doctor</th>
            <th>Referred By</th>
            <th>Charged (Net)</th>
            <th>Paid</th>
            <th>Pending</th>
            <th>Visit ID</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (r) => `
            <tr>
              <td>${esc(r.visit_date)}</td>
              <td>${esc(r.age_days)}</td>
              <td>${esc(r.patient_code)}</td>
              <td>${esc(r.patient_name)}</td>
              <td>${esc(r.phone ?? "")}</td>
              <td>${esc(r.doctor_name ?? "")}</td>
              <td>${esc(r.referred_by ?? "")}</td>
              <td>${esc(Number(r.consultation_charged || 0).toFixed(2))}</td>
              <td>${esc(Number(r.consultation_paid || 0).toFixed(2))}</td>
              <td>${esc(Number(r.consultation_pending || 0).toFixed(2))}</td>
              <td>${esc(r.visit_id)}</td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    `;

    if (kind === "xlsx") {
      // Excel opens HTML tables fine; we serve as .xls to avoid needing an XLSX library.
      const html = `
        <html>
          <head><meta charset="utf-8" /></head>
          <body>
            <h3>${esc(title)}</h3>
            ${table}
          </body>
        </html>
      `;

      return new NextResponse(html, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.ms-excel; charset=utf-8",
          "Content-Disposition": `attachment; filename="pending_consultations_${start}_to_${end}.xls"`,
        },
      });
    }

    // kind === "pdf": return printable HTML (user can Print → Save as PDF)
    const html = `
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${esc(title)}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 16px; }
            h2 { margin: 0 0 12px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid #999; padding: 6px; }
            th { background: #f3f3f3; text-align: left; }
            @media print { button { display:none; } }
          </style>
        </head>
        <body>
          <button onclick="window.print()">Print / Save as PDF</button>
          <h2>${esc(title)}</h2>
          ${table}
        </body>
      </html>
    `;

    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `inline; filename="pending_consultations_${start}_to_${end}.html"`,
      },
    });
  } catch (e) {
    console.error("❌ Pending export failed:", e);
    return NextResponse.json(
      { error: "Failed to export pending report." },
      { status: 500 }
    );
  } finally {
    conn.release();
  }
}
