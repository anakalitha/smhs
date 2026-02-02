import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

type BillRow = RowDataPacket & {
  visitId: number;
  patientCode: string;
  patientName: string;
  visitDate: string; // YYYY-MM-DD
  amount: number;
};

function csvEscape(v: unknown) {
  const s = v === null || v === undefined ? "" : String(v);
  // Escape quotes and wrap in quotes if needed
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function formatDDMMYYYY(d: unknown) {
  if (!d) return "";

  // If MySQL gives Date object
  if (d instanceof Date) {
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }

  const s = String(d);

  // If already YYYY-MM-DD
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;

  // Fallback
  const dt = new Date(s);
  if (!Number.isNaN(dt.getTime())) {
    const dd = String(dt.getDate()).padStart(2, "0");
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    const yyyy = dt.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }

  return s;
}

export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const allowed =
    me.roles.includes("SUPER_ADMIN") ||
    me.roles.includes("ADMIN") ||
    me.roles.includes("DOCTOR");

  if (!allowed)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!me.organizationId || !me.branchId) {
    return NextResponse.json({ error: "Invalid org/branch." }, { status: 400 });
  }

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  if (!from || !to) {
    return NextResponse.json(
      { error: "Missing from/to dates." },
      { status: 400 }
    );
  }

  const orgId = me.organizationId;
  const branchId = me.branchId;

  const [rows] = await db.execute<BillRow[]>(
    `SELECT
       v.id AS visitId,
       p.patient_code AS patientCode,
       p.full_name AS patientName,
       v.visit_date AS visitDate,
       pay.amount AS amount
     FROM visits v
     JOIN patients p ON p.id = v.patient_id
     JOIN payments pay
       ON pay.visit_id = v.id
      AND pay.fee_type = 'CONSULTATION'
     WHERE v.organization_id = :org
       AND v.branch_id = :branch
       AND v.visit_date BETWEEN :from AND :to
     ORDER BY v.visit_date ASC, v.id ASC`,
    { org: orgId, branch: branchId, from, to }
  );

  // Build CSV
  const header = [
    "SlNo",
    "BillReceiptNo",
    "PatientId",
    "Name",
    "VisitDate",
    "BillAmount",
  ];

  const lines: string[] = [];
  lines.push(header.map(csvEscape).join(","));

  rows.forEach((r, i) => {
    const receiptNo = `BILL-${r.visitId}`;
    lines.push(
      [
        i + 1,
        receiptNo,
        r.patientCode,
        r.patientName,
        formatDDMMYYYY(r.visitDate),
        r.amount,
      ]
        .map(csvEscape)
        .join(",")
    );
  });

  const csv = lines.join("\n");

  const filename = `Bill_Report_${from}_to_${to}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
