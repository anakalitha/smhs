import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import type { RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

type Row = RowDataPacket & {
  patientId: string;
  name: string;
  phone: string | null;
  referredBy: string | null;
  doctor: string;
  visitDate: Date | string;
  amount: number;
  paymentMode: string;
  payStatus: string;
};

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

  // ✅ EOD export is allowed for RECEPTION also
  const allowed =
    me.roles.includes("SUPER_ADMIN") ||
    me.roles.includes("ADMIN") ||
    me.roles.includes("DOCTOR") ||
    me.roles.includes("RECEPTION");

  if (!allowed)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!me.organizationId || !me.branchId) {
    return NextResponse.json({ error: "Invalid org/branch." }, { status: 400 });
  }

  const url = new URL(req.url);
  const date = url.searchParams.get("date"); // YYYY-MM-DD (optional)

  // Default = today
  const day = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;

  const orgId = me.organizationId;
  const branchId = me.branchId;

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
     LEFT JOIN referralperson rp ON rp.id = v.referralperson_id
     JOIN payments pay
       ON pay.visit_id = v.id
      AND pay.fee_type = 'CONSULTATION'
     WHERE v.organization_id = :org
       AND v.branch_id = :branch
       AND v.visit_date = COALESCE(:day, CURDATE())
     ORDER BY p.patient_code ASC`,
    { org: orgId, branch: branchId, day }
  );

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("EOD Report");

  const reportDate =
    rows.length > 0
      ? formatDDMMYYYY(rows[0].visitDate)
      : formatDDMMYYYY(day ?? new Date());

  // Title row
  ws.addRow([`Consultations - End of Day Report (${reportDate})`]);
  ws.getRow(1).font = { bold: true, size: 14 };
  ws.mergeCells("A1:I1");

  ws.addRow([]); // blank row

  // Header row
  ws.addRow([
    "Sl. No.",
    "Patient Id",
    "Name",
    "Phone",
    "Referred By",
    "Consultant Doctor",
    "Consultation Fee",
    "Payment Mode",
    "Paid Status",
  ]);
  ws.getRow(3).font = { bold: true };

  let total = 0;
  rows.forEach((r, i) => {
    total += Number(r.amount || 0);
    ws.addRow([
      i + 1,
      r.patientId,
      r.name,
      r.phone ?? "",
      r.referredBy ?? "—",
      r.doctor,
      r.amount,
      r.paymentMode,
      r.payStatus,
    ]);
  });

  // Totals row
  const totalRow = ws.addRow(["", "", "", "", "", "TOTAL", total, "", ""]);
  totalRow.font = { bold: true };

  // Formatting
  ws.getColumn(7).numFmt = "₹#,##0";

  const widths = [8, 18, 24, 14, 18, 22, 18, 16, 14];
  widths.forEach((w, idx) => (ws.getColumn(idx + 1).width = w));

  const buffer = await wb.xlsx.writeBuffer();

  const ymd = day ?? new Date().toISOString().slice(0, 10);

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="EOD_Consultations_${ymd}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
