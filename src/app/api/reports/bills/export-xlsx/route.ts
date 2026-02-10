import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import type { RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

type BillRow = RowDataPacket & {
  visitId: number;
  patientCode: string;
  patientName: string;
  visitDate: Date | string;
  amount: number;
};

function formatDate(d: Date | string) {
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

  if (!from || !to) {
    return NextResponse.json(
      { error: "Missing from/to dates." },
      { status: 400 }
    );
  }

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
    {
      org: me.organizationId,
      branch: me.branchId,
      from,
      to,
    }
  );

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Bill Report");

  // Header
  sheet.addRow([
    "Sl. No.",
    "Bill Receipt No",
    "Patient Id",
    "Name",
    "Visit Date",
    "Bill Amount",
  ]);

  sheet.getRow(1).font = { bold: true };

  let total = 0;

  rows.forEach((r, i) => {
    total += Number(r.amount || 0);
    sheet.addRow([
      i + 1,
      `BILL-${r.visitId}`,
      r.patientCode,
      r.patientName,
      formatDate(r.visitDate),
      r.amount,
    ]);
  });

  // Totals row (BOLD)
  const totalRow = sheet.addRow(["", "", "", "", "TOTAL", total]);
  totalRow.font = { bold: true };

  // Formatting
  sheet.getColumn(6).numFmt = "₹#,##0";
  sheet.columns.forEach((col) => {
    col.width = 20;
  });

  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Bill_Report_${from}_to_${to}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
