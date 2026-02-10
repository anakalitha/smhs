import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import type { RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

type Row = RowDataPacket & {
  patientId: string;
  name: string;
  phone: string | null;
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

  // ✅ export allowed only to admin/super-admin/doctor
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

  const [rows] = await db.execute<Row[]>(
    `SELECT
       p.patient_code AS patientId,
       p.full_name AS name,
       p.phone AS phone,
       v.visit_date AS visitDate,
       pay.amount AS amount,
       pay.payment_mode AS paymentMode,
       pay.pay_status AS payStatus
     FROM visits v
     JOIN patients p ON p.id = v.patient_id
     JOIN payments pay
       ON pay.visit_id = v.id
      AND pay.fee_type = 'CONSULTATION'
     WHERE v.organization_id = :org
       AND v.branch_id = :branch
       AND v.visit_date BETWEEN :from AND :to
       AND pay.pay_status = 'PENDING'
     ORDER BY v.visit_date ASC, p.patient_code ASC`,
    { org: me.organizationId, branch: me.branchId, from, to }
  );

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Pending Amount");

  ws.addRow([
    "Sl. No.",
    "Patient Id",
    "Name",
    "Phone",
    "Visit Date",
    "Consultation Fee",
    "Payment Mode",
    "Payment Status",
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
      formatDDMMYYYY(r.visitDate),
      r.amount,
      r.paymentMode,
      r.payStatus,
    ]);
  });

  const totalRow = ws.addRow(["", "", "", "", "TOTAL", total, "", ""]);
  totalRow.font = { bold: true };

  // ₹ format for fee column
  ws.getColumn(6).numFmt = "₹#,##0";

  // widths
  const widths = [8, 18, 24, 14, 14, 18, 16, 16];
  widths.forEach((w, idx) => (ws.getColumn(idx + 1).width = w));

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Pending_Amount_${from}_to_${to}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
