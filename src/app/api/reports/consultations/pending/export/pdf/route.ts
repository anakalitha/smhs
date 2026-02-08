import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { PDFDocument, StandardFonts } from "pdf-lib";

type PendingRow = RowDataPacket & {
  visit_date: string;
  patient_code: string;
  patient_name: string;
  doctor_name: string;
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

export async function GET(req: Request) {
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

  const params = {
    org_id: Number(me.organizationId),
    branch_id: Number(me.branchId),
    start_date: start,
    end_date: end,
    as_of_date: asOf,
    doctor_id: null,
    referralperson_id: null,
    pending_type: pendingType,
    age_bucket: ageBucket,
  };

  const conn = await db.getConnection();
  try {
    const [rows] = await conn.execute<PendingRow[]>(
      `
      SELECT
        v.visit_date,
        p.patient_code,
        p.full_name AS patient_name,
        d.full_name AS doctor_name,
        rp.name AS referred_by,

        COALESCE(SUM(vc.amount), 0) AS consultation_charged,
        COALESCE(SUM(pa.amount), 0) AS consultation_paid,
        COALESCE(SUM(vc.amount), 0) - COALESCE(SUM(pa.amount), 0) AS consultation_pending

      FROM visits v
      JOIN patients p ON p.id = v.patient_id
      JOIN doctors d ON d.id = v.doctor_id
      LEFT JOIN referralperson rp ON rp.id = v.referralperson_id

      LEFT JOIN visit_charges vc
        ON vc.visit_id = v.id AND vc.fee_type = 'CONSULTATION'
      LEFT JOIN payment_allocations pa
        ON pa.visit_id = v.id AND pa.fee_type = 'CONSULTATION'

      WHERE v.organization_id = :org_id
        AND v.branch_id = :branch_id
        AND v.visit_date BETWEEN :start_date AND :end_date
        AND v.status NOT IN ('CANCELLED', 'NO_SHOW')

      GROUP BY
        v.id, v.visit_date, p.patient_code, p.full_name, d.name, rp.name

      HAVING
        consultation_pending > 0
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

    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const page = pdfDoc.addPage([595.28, 841.89]); // A4
    const { width, height } = page.getSize();

    let y = height - 40;
    page.drawText("Pending Consultation Fees", {
      x: 40,
      y,
      font: fontBold,
      size: 14,
    });
    y -= 16;
    page.drawText(`Period: ${start} to ${end}`, { x: 40, y, font, size: 10 });
    y -= 18;

    const headers = ["Date", "Patient", "Doctor", "Pending"];
    const colX = [40, 120, 320, 520];

    page.drawText(headers[0], { x: colX[0], y, font: fontBold, size: 10 });
    page.drawText(headers[1], { x: colX[1], y, font: fontBold, size: 10 });
    page.drawText(headers[2], { x: colX[2], y, font: fontBold, size: 10 });
    page.drawText(headers[3], { x: colX[3], y, font: fontBold, size: 10 });
    y -= 12;

    const maxRows = 45; // keep simple; paginate later if needed
    for (let i = 0; i < Math.min(rows.length, maxRows); i++) {
      const r = rows[i];
      const patient = `${r.patient_name} (${r.patient_code})`;
      const pending = Number(r.consultation_pending || 0).toFixed(0);

      page.drawText(String(r.visit_date), { x: colX[0], y, font, size: 9 });
      page.drawText(patient.slice(0, 28), { x: colX[1], y, font, size: 9 });
      page.drawText(String(r.doctor_name).slice(0, 22), {
        x: colX[2],
        y,
        font,
        size: 9,
      });
      page.drawText(pending, { x: colX[3], y, font, size: 9 });
      y -= 12;
    }

    const bytes = await pdfDoc.save();

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="pending-consultations-${start}-to-${end}.pdf"`,
      },
    });
  } catch (e) {
    console.error("❌ Pending PDF export failed:", e);
    return NextResponse.json(
      { error: "Failed to export PDF." },
      { status: 500 }
    );
  } finally {
    conn.release();
  }
}
