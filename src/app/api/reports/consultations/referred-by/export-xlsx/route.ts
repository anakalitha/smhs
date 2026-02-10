import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import type { RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

type Row = RowDataPacket & {
  patientId: string;
  name: string;
  phone: string | null;
  referredBy: string;
  doctor: string;
  visitDate: Date | string;
  amount: number;
  paymentMode: string;
  payStatus: string;
};

type RefNameRow = RowDataPacket & { name: string };

function formatDDMMYYYY(d: Date | string) {
  const dt = d instanceof Date ? d : new Date(d);
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const yyyy = dt.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
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
  const referralId = url.searchParams.get("referralId");

  if (!from || !to || !referralId) {
    return NextResponse.json(
      { error: "Missing from/to/referralId." },
      { status: 400 }
    );
  }

  // Get referral name for filename
  const [refRows] = await db.execute<RefNameRow[]>(
    `SELECT name FROM referralperson WHERE id = :id LIMIT 1`,
    { id: referralId }
  );
  const refName = (refRows[0]?.name ?? "ReferredBy")
    .replace(/[^\w\- ]+/g, "")
    .trim()
    .slice(0, 40);

  const [rows] = await db.execute<Row[]>(
    `SELECT
       p.patient_code AS patientId,
       p.full_name AS name,
       p.phone AS phone,
       rp.name AS referredBy,
       d.full_name AS doctor,
       v.visit_date AS visitDate,
       COALESCE(pay.amount, 0) AS amount,
       pay.payment_mode AS paymentMode,
       pay.pay_status AS payStatus
     FROM visits v
     JOIN patients p ON p.id = v.patient_id
     JOIN doctors d ON d.id = v.doctor_id
     JOIN referralperson rp ON rp.id = v.referralperson_id
     JOIN payments pay
       ON pay.visit_id = v.id
      AND pay.fee_type = 'CONSULTATION'
     WHERE v.organization_id = :org
       AND v.branch_id = :branch
       AND v.visit_date BETWEEN :from AND :to
       AND v.referralperson_id = :refId
     ORDER BY v.visit_date ASC, p.patient_code ASC`,
    { org: me.organizationId, branch: me.branchId, from, to, refId: referralId }
  );

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Referred By");

  ws.addRow([
    "Sl. No.",
    "Patient Id",
    "Name",
    "Phone",
    "Referred By",
    "Consultant Doctor",
    "Visit Date",
    "Consultation Fee",
    "Payment Mode",
    "Paid Status",
  ]);
  ws.getRow(1).font = { bold: true };

  let total = 0;

  rows.forEach((r, i) => {
    total += Number(r.amount || 0);
    ws.addRow([
      i + 1,
      r.patientId,
      r.name,
      r.phone ?? "",
      r.referredBy,
      r.doctor,
      formatDDMMYYYY(r.visitDate),
      r.amount,
      r.paymentMode,
      r.payStatus,
    ]);
  });

  const totalRow = ws.addRow(["", "", "", "", "", "", "TOTAL", total, "", ""]);
  totalRow.font = { bold: true };

  ws.getColumn(8).numFmt = "₹#,##0";

  const widths = [8, 18, 24, 14, 18, 20, 14, 18, 16, 14];
  widths.forEach((w, idx) => (ws.getColumn(idx + 1).width = w));

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="ReferredBy_${refName}_${from}_to_${to}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
