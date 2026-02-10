// src/app/api/reports/consultations/eod/export.pdf/route.ts
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import type { RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/db";
import { PDFDocument, StandardFonts } from "pdf-lib";

type ServiceRow = RowDataPacket & { id: number };
type Row = RowDataPacket & {
  visitDate: string;
  patientCode: string;
  patientName: string;
  referredBy: string | null;
  phone: string | null;
  grossAmount: number;
  paidAmount: number;
  discountAmount: number;
  netAmount: number;
};

function isValidISODate(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const allowed =
    me.roles.includes("RECEPTION") ||
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
  const date = (url.searchParams.get("date") || "").trim();
  const runDate =
    date && isValidISODate(date) ? date : new Date().toISOString().slice(0, 10);

  const orgId = Number(me.organizationId);
  const branchId = Number(me.branchId);

  const [svcRows] = await db.execute<ServiceRow[]>(
    `
    SELECT id
    FROM services
    WHERE organization_id = :org
      AND code = 'CONSULTATION'
      AND is_active = 1
    LIMIT 1
    `,
    { org: orgId }
  );

  const serviceId = svcRows[0]?.id ?? null;
  if (!serviceId) {
    return NextResponse.json(
      { error: "CONSULTATION service not configured." },
      { status: 400 }
    );
  }

  const [rows] = await db.execute<Row[]>(
    `
    SELECT
      v.visit_date AS visitDate,
      p.patient_code AS patientCode,
      p.full_name AS patientName,
      rp.name AS referredBy,
      p.phone AS phone,
      COALESCE(SUM(vc.gross_amount), 0) AS grossAmount,
      COALESCE(pa.paidAmount, 0) AS paidAmount,
      COALESCE(SUM(vc.discount_amount), 0) AS discountAmount,
      COALESCE(SUM(vc.net_amount), 0) AS netAmount
    FROM visits v
    JOIN patients p ON p.id = v.patient_id
    LEFT JOIN referralperson rp ON rp.id = v.referralperson_id
    LEFT JOIN visit_charges vc
      ON vc.visit_id = v.id
     AND vc.service_id = :serviceId
    LEFT JOIN (
      SELECT visit_id, service_id, SUM(amount) AS paidAmount
      FROM payment_allocations
      GROUP BY visit_id, service_id
    ) pa ON pa.visit_id = v.id AND pa.service_id = :serviceId
    WHERE v.organization_id = :org
      AND v.branch_id = :branch
      AND v.visit_date = :runDate
      AND v.status NOT IN ('CANCELLED', 'NO_SHOW')
    GROUP BY v.visit_date, p.patient_code, p.full_name, rp.name, p.phone, pa.paidAmount
    ORDER BY p.full_name ASC
    `,
    { org: orgId, branch: branchId, runDate, serviceId }
  );

  // --- Build PDF ---
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]); // A4 portrait in points
  const { height } = page.getSize();

  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let y = height - 40;

  const title = `EOD Summary Report (Consultation) — ${runDate}`;
  page.drawText(title, { x: 40, y, size: 14, font: fontBold });
  y -= 24;

  const headers = ["Date", "Patient", "Name", "Gross", "Paid", "Disc", "Net"];
  const colX = [40, 105, 200, 380, 430, 480, 525];

  // header row
  headers.forEach((h, i) => {
    page.drawText(h, { x: colX[i], y, size: 9, font: fontBold });
  });
  y -= 12;

  const maxRows = 55; // basic single-page safe
  const sliced = rows.slice(0, maxRows);

  for (const r of sliced) {
    const line = [
      String(r.visitDate).slice(0, 10),
      r.patientCode,
      (r.patientName ?? "").slice(0, 22),
      String(Number(r.grossAmount ?? 0).toFixed(0)),
      String(Number(r.paidAmount ?? 0).toFixed(0)),
      String(Number(r.discountAmount ?? 0).toFixed(0)),
      String(Number(r.netAmount ?? 0).toFixed(0)),
    ];

    line.forEach((txt, i) => {
      page.drawText(txt, { x: colX[i], y, size: 9, font });
    });

    y -= 12;
    if (y < 60) break;
  }

  const totals = rows.reduce(
    (acc, r) => {
      acc.gross += Number(r.grossAmount ?? 0);
      acc.paid += Number(r.paidAmount ?? 0);
      acc.disc += Number(r.discountAmount ?? 0);
      acc.net += Number(r.netAmount ?? 0);
      return acc;
    },
    { gross: 0, paid: 0, disc: 0, net: 0 }
  );

  y -= 10;
  page.drawText("Totals:", { x: 300, y, size: 10, font: fontBold });
  page.drawText(String(totals.gross.toFixed(0)), {
    x: colX[3],
    y,
    size: 10,
    font: fontBold,
  });
  page.drawText(String(totals.paid.toFixed(0)), {
    x: colX[4],
    y,
    size: 10,
    font: fontBold,
  });
  page.drawText(String(totals.disc.toFixed(0)), {
    x: colX[5],
    y,
    size: 10,
    font: fontBold,
  });
  page.drawText(String(totals.net.toFixed(0)), {
    x: colX[6],
    y,
    size: 10,
    font: fontBold,
  });

  const bytes = await pdf.save();
  const body = Buffer.from(bytes);

  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="EOD_CONSULTATIONS_${runDate}.pdf"`,
    },
  });
}
