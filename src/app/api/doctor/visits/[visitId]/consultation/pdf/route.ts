import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { PDFDocument, StandardFonts } from "pdf-lib";

type Ctx = { params: Promise<{ visitId: string }> };

type UserLike = { roles?: string[] } | null | undefined;

function mustBeDoctor(me: UserLike) {
  const roles = me?.roles ?? [];
  return (
    roles.includes("DOCTOR") ||
    roles.includes("ADMIN") ||
    roles.includes("SUPER_ADMIN")
  );
}

function isAdmin(me: { roles: string[] }) {
  return me.roles.includes("ADMIN") || me.roles.includes("SUPER_ADMIN");
}

async function resolveDoctorIdForUser(args: {
  userId: number;
  orgId: number;
  branchId: number;
}): Promise<number | null> {
  const [rows] = await db.execute<RowDataPacket[]>(
    `
    SELECT id
    FROM doctors
    WHERE user_id = :uid
      AND organization_id = :org
      AND branch_id = :branch
      AND is_active = 1
    LIMIT 1
    `,
    { uid: args.userId, org: args.orgId, branch: args.branchId }
  );

  if (rows.length === 0) return null;
  const id = Number(rows[0].id);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function ymd(v: unknown) {
  if (!v) return "";
  if (typeof v === "string") return v.slice(0, 10);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

export async function GET(req: Request, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!mustBeDoctor(me))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { visitId } = await ctx.params;
  const id = Number(visitId);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid visitId." }, { status: 400 });
  }

  const orgId = me.organizationId != null ? Number(me.organizationId) : NaN;
  const branchId = me.branchId != null ? Number(me.branchId) : NaN;
  if (!Number.isFinite(orgId) || !Number.isFinite(branchId)) {
    return NextResponse.json(
      { error: "Invalid org/branch in session." },
      { status: 400 }
    );
  }

  const admin = isAdmin(me);
  const doctorId = admin
    ? null
    : await resolveDoctorIdForUser({ userId: me.id, orgId, branchId });

  if (!admin && !doctorId) {
    return NextResponse.json(
      { error: "Doctor account not linked to doctor profile." },
      { status: 400 }
    );
  }

  // Visit header
  const [vRows] = await db.execute<RowDataPacket[]>(
    `
    SELECT
      v.id AS visitId,
      v.visit_date AS visitDate,
      p.patient_code AS patientCode,
      p.full_name AS patientName,
      d.full_name AS doctorName,
      v.doctor_id AS doctorId
    FROM visits v
    JOIN patients p ON p.id = v.patient_id
    JOIN doctors d ON d.id = v.doctor_id
    WHERE v.id = :visitId
      AND v.organization_id = :org
      AND v.branch_id = :branch
    LIMIT 1
    `,
    { visitId: id, org: orgId, branch: branchId }
  );

  if (vRows.length === 0) {
    return NextResponse.json({ error: "Visit not found." }, { status: 404 });
  }

  if (!admin && Number(vRows[0].doctorId) !== doctorId) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const visit = {
    visitId: Number(vRows[0].visitId),
    visitDate: ymd(vRows[0].visitDate),
    patientCode: String(vRows[0].patientCode),
    patientName: String(vRows[0].patientName),
    doctorName: String(vRows[0].doctorName),
  };

  // Notes
  const [noteRows] = await db.execute<RowDataPacket[]>(
    `SELECT diagnosis, investigation, treatment, remarks FROM visit_notes WHERE visit_id = :visitId LIMIT 1`,
    { visitId: id }
  );

  const note = noteRows[0] ?? null;

  // Orders (visit_orders uses "notes")
  const [orderRows] = await db.execute<RowDataPacket[]>(
    `
    SELECT s.code AS service_code, o.notes, o.status, o.ordered_at
    FROM visit_orders o
    JOIN services s ON s.id = o.service_id
    WHERE o.visit_id = :visitId
      AND s.code IN ('SCAN','PAP','CTG','LAB')
      AND o.status <> 'CANCELLED'
    ORDER BY o.ordered_at ASC, o.id ASC
    `,
    { visitId: id }
  );

  // Prescription + items
  const [rxRows] = await db.execute<RowDataPacket[]>(
    `SELECT id, notes FROM prescriptions WHERE visit_id = :visitId LIMIT 1`,
    { visitId: id }
  );

  const rx = rxRows[0] ?? null;

  const rxItems: Array<RowDataPacket> = [];
  if (rx?.id) {
    const [itRows] = await db.execute<RowDataPacket[]>(
      `
      SELECT medicine_name, dosage, morning, afternoon, night, before_food, duration_days, instructions, sort_order
      FROM prescription_items
      WHERE prescription_id = :pid
      ORDER BY sort_order ASC, id ASC
      `,
      { pid: Number(rx.id) }
    );
    rxItems.push(...itRows);
  }

  // ---- Build PDF using pdf-lib (no filesystem fonts) ----
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const page = pdfDoc.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();

  let y = height - 50;

  function drawText(
    text: string,
    opts?: { bold?: boolean; size?: number; indent?: number }
  ) {
    const size = opts?.size ?? 11;
    const indent = opts?.indent ?? 0;
    const f = opts?.bold ? fontBold : font;

    const safe = (text ?? "").toString();
    page.drawText(safe, { x: 50 + indent, y, size, font: f });
    y -= size + 6;
  }

  function drawPara(label: string, value: string | null | undefined) {
    drawText(label, { bold: true, size: 11 });
    const v = (value ?? "").trim() || "—";
    // very simple wrapping
    const maxWidth = width - 100;
    const words = v.split(/\s+/);
    let line = "";
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      const wWidth = font.widthOfTextAtSize(next, 11);
      if (wWidth > maxWidth) {
        drawText(line, { indent: 10 });
        line = w;
      } else {
        line = next;
      }
    }
    if (line) drawText(line, { indent: 10 });
    y -= 4;
  }

  drawText("CONSULTATION SUMMARY", { bold: true, size: 16 });
  y -= 6;

  drawText(`Visit ID: ${visit.visitId}`, { bold: true });
  drawText(`Visit Date: ${visit.visitDate}`);
  drawText(`Patient: ${visit.patientName} (${visit.patientCode})`);
  drawText(`Doctor: ${visit.doctorName}`);
  y -= 10;

  drawPara("Diagnosis", note?.diagnosis ?? "");
  drawPara("Investigation", note?.investigation ?? "");
  drawPara("Treatment", note?.treatment ?? "");
  drawPara("Remarks", note?.remarks ?? "");

  drawText("Orders", { bold: true, size: 13 });
  y -= 2;

  if (orderRows.length === 0) {
    drawText("— None —", { indent: 10 });
  } else {
    for (const o of orderRows) {
      const code = String(o.service_code);
      const type = code === "PAP" ? "PAP_SMEAR" : code;
      const details = (o.notes ?? "").toString().trim() || "—";
      drawText(`${type}: ${details}`, { indent: 10 });
    }
  }
  y -= 8;

  drawText("Prescription", { bold: true, size: 13 });
  y -= 2;

  if (!rx && rxItems.length === 0) {
    drawText("— None —", { indent: 10 });
  } else {
    const rxNotes = (rx?.notes ?? "").toString().trim();
    if (rxNotes) drawPara("Notes", rxNotes);

    if (rxItems.length === 0) {
      drawText("— No medicines —", { indent: 10 });
    } else {
      for (const it of rxItems) {
        const med = String(it.medicine_name ?? "").trim() || "—";
        const dosage = String(it.dosage ?? "").trim();
        const days =
          it.duration_days == null ? "" : ` / ${String(it.duration_days)} days`;

        const timings = [
          Number(it.morning) ? "M" : "",
          Number(it.afternoon) ? "A" : "",
          Number(it.night) ? "N" : "",
        ]
          .filter(Boolean)
          .join("");

        const bf = Number(it.before_food) ? " (Before food)" : "";
        const instr = String(it.instructions ?? "").trim();

        drawText(
          `• ${med}${dosage ? ` (${dosage})` : ""} ${timings}${days}${bf}`,
          { indent: 10 }
        );
        if (instr) drawText(`  ${instr}`, { indent: 22 });
      }
    }
  }

  const pdfBytes = await pdfDoc.save();
  const body = new Uint8Array(pdfBytes);

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="consultation-${visit.visitId}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
