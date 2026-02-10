import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { db } from "@/lib/db";
import { getCurrentUser, type CurrentUser } from "@/lib/session";
import type { RowDataPacket } from "mysql2/promise";

type Ctx = { params: Promise<{ visitId: string }> };

function isAllowed(me: { roles: string[] }) {
  return (
    me.roles.includes("RECEPTION") ||
    me.roles.includes("DOCTOR") ||
    me.roles.includes("ADMIN") ||
    me.roles.includes("SUPER_ADMIN")
  );
}

function mustHaveOrgBranch(me: CurrentUser) {
  const orgId = me.organizationId != null ? Number(me.organizationId) : NaN;
  const branchId = me.branchId != null ? Number(me.branchId) : NaN;
  return { orgId, branchId };
}

type VisitRow = RowDataPacket & {
  id: number;
  visit_date: string;
  organization_id: number;
  branch_id: number;
  doctor_id: number | null;
  patient_code: string;
  full_name: string;
  phone: string | null;
  referred_by: string | null;
  doctor_name: string | null;
};

type LineRow = RowDataPacket & {
  service_name: string;
  service_code: string;
  net_amount: number;
  paid_amount: number;
  refunded_amount: number;
};

type RefundRow = RowDataPacket & {
  amount: number;
  payment_mode_code: string;
  created_at: string;
  note: string | null;
  service_code: string;
};

type DocRow = RowDataPacket & {
  category: string;
  original_name: string | null;
  file_url: string;
  uploaded_at: string;
};

function fmtINR(n: number) {
  const x = Number(n) || 0;
  return `₹${x.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export async function GET(req: Request, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAllowed(me))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { orgId, branchId } = mustHaveOrgBranch(me);
  if (!Number.isFinite(orgId) || !Number.isFinite(branchId)) {
    return NextResponse.json(
      { error: "Your account is not linked to organization/branch." },
      { status: 400 }
    );
  }

  const { visitId } = await ctx.params;
  const vid = Number(visitId);
  if (!Number.isFinite(vid) || vid <= 0) {
    return NextResponse.json({ error: "Invalid visit id." }, { status: 400 });
  }

  const [vRows] = await db.execute<VisitRow[]>(
    `
    SELECT
      v.id,
      v.visit_date,
      v.organization_id,
      v.branch_id,
      v.doctor_id,
      p.patient_code,
      p.full_name,
      p.phone,
      rp.name AS referred_by,
      d.full_name AS doctor_name
    FROM visits v
    JOIN patients p ON p.id = v.patient_id
    LEFT JOIN referralperson rp ON rp.id = v.referralperson_id
    LEFT JOIN doctors d ON d.id = v.doctor_id
    WHERE v.id = :vid
    LIMIT 1
    `,
    { vid }
  );

  if (vRows.length === 0)
    return NextResponse.json({ error: "Visit not found." }, { status: 404 });

  const v = vRows[0];

  if (Number(v.organization_id) !== orgId || Number(v.branch_id) !== branchId) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  if (me.roles.includes("DOCTOR")) {
    const myDoctorId = me.doctorId != null ? Number(me.doctorId) : NaN;
    if (
      !Number.isFinite(myDoctorId) ||
      Number(v.doctor_id ?? 0) !== myDoctorId
    ) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
  }

  const [lines] = await db.execute<LineRow[]>(
    `
    SELECT
      s.display_name AS service_name,
      s.code AS service_code,
      vc.net_amount,
      COALESCE(SUM(CASE WHEN p.direction='PAYMENT' AND p.pay_status='ACCEPTED' THEN p.amount ELSE 0 END),0) AS paid_amount,
      COALESCE(SUM(CASE WHEN p.direction='REFUND'  AND p.pay_status='ACCEPTED' THEN p.amount ELSE 0 END),0) AS refunded_amount
    FROM visit_charges vc
    JOIN services s ON s.id = vc.service_id
    LEFT JOIN payments p ON p.visit_id = vc.visit_id AND p.service_id = vc.service_id
    WHERE vc.visit_id = :vid
    GROUP BY s.display_name, s.code, vc.net_amount
    ORDER BY s.display_name ASC
    `,
    { vid }
  );

  const [refunds] = await db.execute<RefundRow[]>(
    `
    SELECT
      p.amount,
      p.payment_mode_code,
      p.created_at,
      p.note,
      s.code AS service_code
    FROM payments p
    JOIN services s ON s.id = p.service_id
    WHERE p.visit_id = :vid
      AND p.direction = 'REFUND'
      AND p.pay_status = 'ACCEPTED'
    ORDER BY p.created_at DESC
    `,
    { vid }
  );

  const [docs] = await db.execute<DocRow[]>(
    `
    SELECT category, original_name, file_url, uploaded_at
    FROM visit_documents
    WHERE visit_id = :vid
    ORDER BY uploaded_at DESC
    `,
    { vid }
  );

  // --- Build PDF ---
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]); // A4
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let y = 800;
  const left = 50;

  function drawText(text: string, size = 11, isBold = false) {
    page.drawText(text, {
      x: left,
      y,
      size,
      font: isBold ? bold : font,
    });
    y -= size + 6;
  }

  drawText("Visit Summary", 18, true);
  drawText(`Visit ID: ${v.id}`, 11);
  drawText(`Visit Date: ${String(v.visit_date)}`, 11);
  y -= 4;

  drawText(`Patient: ${v.full_name} (${v.patient_code})`, 11, true);
  drawText(`Phone: ${v.phone ?? "—"}`, 11);
  drawText(`Doctor: ${v.doctor_name ?? "—"}`, 11);
  drawText(`Referred By: ${v.referred_by ?? "—"}`, 11);

  y -= 10;
  drawText("Payment Details", 14, true);

  // simple table
  drawText("Service | Net | Paid | Refunded", 10, true);
  for (const r of lines) {
    const line = `${r.service_name} (${r.service_code}) | ${fmtINR(
      r.net_amount
    )} | ${fmtINR(r.paid_amount)} | ${fmtINR(r.refunded_amount)}`;
    drawText(line, 10);
    if (y < 90) break; // phase-1: avoid page overflow
  }

  if (refunds.length) {
    y -= 6;
    drawText("Refund History", 14, true);
    for (const r of refunds.slice(0, 10)) {
      drawText(
        `${fmtINR(r.amount)} • ${r.service_code} • ${
          r.payment_mode_code
        } • ${new Date(r.created_at).toLocaleString()}${
          r.note ? ` • ${r.note}` : ""
        }`,
        10
      );
      if (y < 90) break;
    }
  }

  if (docs.length) {
    y -= 6;
    drawText("Documents", 14, true);
    for (const d of docs.slice(0, 10)) {
      drawText(
        `${d.category} • ${d.original_name ?? d.file_url} • ${new Date(
          d.uploaded_at
        ).toLocaleString()}`,
        10
      );
      if (y < 90) break;
    }
  }

  const bytes = await pdf.save();

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="visit_${v.id}_summary.pdf"`,
    },
  });
}
