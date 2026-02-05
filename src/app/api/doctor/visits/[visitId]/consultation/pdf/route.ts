// src/app/api/doctor/visits/[visitId]/consultation/pdf/route.ts
import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

import PDFDocument from "pdfkit"; // ✅ ESM import (no require)

type Ctx = { params: Promise<{ visitId: string }> };

type VisitRow = RowDataPacket & {
  visitId: number;
  visitDate: string;
  patientCode: string;
  patientName: string;
  patientPhone: string | null;
  doctorName: string;
  branchName: string;
};

type NoteRow = RowDataPacket & {
  diagnosis: string | null;
  investigation: string | null;
  remarks: string | null;
};

type OrderRow = RowDataPacket & {
  order_type: "SCAN" | "PAP_SMEAR" | "CTG";
  notes: string | null;
  status: "ORDERED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
};

type RxRow = RowDataPacket & {
  notes: string | null;
};

type RxItemRow = RowDataPacket & {
  medicine_name: string;
  dosage: string | null;
  morning: number;
  afternoon: number;
  night: number;
  before_food: number;
  duration_days: number | null;
  instructions: string | null;
  sort_order: number;
};

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

function yn(v: number) {
  return v ? "Yes" : "No";
}

export async function GET(_req: Request, ctx: Ctx) {
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

  // Visit + doctor + patient + branch name
  const [vRows] = await db.execute<VisitRow[]>(
    `
    SELECT
      v.id AS visitId,
      v.visit_date AS visitDate,
      p.patient_code AS patientCode,
      p.full_name AS patientName,
      p.phone AS patientPhone,
      d.full_name AS doctorName,
      CONCAT(o.code, ' / ', b.code) AS branchName
    FROM visits v
    JOIN patients p ON p.id = v.patient_id
    JOIN doctors d ON d.id = v.doctor_id
    JOIN organizations o ON o.id = v.organization_id
    JOIN branches b ON b.id = v.branch_id
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

  // Ownership check (doctor can only print their own visit)
  if (!admin) {
    const [own] = await db.execute<RowDataPacket[]>(
      `SELECT doctor_id FROM visits WHERE id = :visitId LIMIT 1`,
      { visitId: id }
    );
    if (Number(own?.[0]?.doctor_id) !== doctorId) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
  }

  const visit = vRows[0];

  const [nRows] = await db.execute<NoteRow[]>(
    `SELECT diagnosis, investigation, remarks FROM visit_notes WHERE visit_id = :visitId LIMIT 1`,
    { visitId: id }
  );
  const note = nRows[0] ?? null;

  const [orders] = await db.execute<OrderRow[]>(
    `
    SELECT order_type, notes, status
    FROM visit_orders
    WHERE visit_id = :visitId
      AND order_type IN ('SCAN','PAP_SMEAR','CTG')
      AND status <> 'CANCELLED'
    ORDER BY id ASC
    `,
    { visitId: id }
  );

  const [rxRows] = await db.execute<RxRow[]>(
    `SELECT notes FROM prescriptions WHERE visit_id = :visitId LIMIT 1`,
    { visitId: id }
  );
  const rx = rxRows[0] ?? null;

  const [rxItems] = await db.execute<RxItemRow[]>(
    `
    SELECT medicine_name, dosage, morning, afternoon, night, before_food,
           duration_days, instructions, sort_order
    FROM prescription_items pi
    JOIN prescriptions pr ON pr.id = pi.prescription_id
    WHERE pr.visit_id = :visitId
    ORDER BY pi.sort_order ASC, pi.id ASC
    `,
    { visitId: id }
  );

  // ---- Build PDF ----
  const doc = new PDFDocument({ size: "A4", margin: 40 });
  const chunks: Buffer[] = [];

  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  // Header
  doc.fontSize(16).text("Consultation Summary", { align: "center" });
  doc.moveDown(0.5);
  doc.fontSize(10).text(`Visit ID: ${visit.visitId}`, { align: "center" });
  doc.text(`Date: ${String(visit.visitDate).slice(0, 10)}`, {
    align: "center",
  });
  doc.text(`Branch: ${visit.branchName}`, { align: "center" });
  doc.moveDown(1);

  // Patient/Doctor block
  doc.fontSize(12).text("Patient", { underline: true });
  doc.fontSize(10).text(`Patient ID: ${visit.patientCode}`);
  doc.text(`Name: ${visit.patientName}`);
  doc.text(`Phone: ${visit.patientPhone ?? "—"}`);
  doc.moveDown(0.75);

  doc.fontSize(12).text("Doctor", { underline: true });
  doc.fontSize(10).text(`${visit.doctorName}`);
  doc.moveDown(1);

  // Notes
  doc.fontSize(12).text("Clinical Notes", { underline: true });
  doc.moveDown(0.25);
  doc.fontSize(10).text(`Diagnosis: ${note?.diagnosis ?? "—"}`);
  doc.moveDown(0.25);
  doc.text(`Investigation: ${note?.investigation ?? "—"}`);
  doc.moveDown(0.25);
  doc.text(`Remarks: ${note?.remarks ?? "—"}`);
  doc.moveDown(1);

  // Orders
  const scan = orders.find((o) => o.order_type === "SCAN");
  const pap = orders.find((o) => o.order_type === "PAP_SMEAR");
  const ctg = orders.find((o) => o.order_type === "CTG");

  doc.fontSize(12).text("Orders", { underline: true });
  doc.moveDown(0.25);
  doc.fontSize(10).text(`Scan Ordered: ${yn(scan ? 1 : 0)}`);
  if (scan?.notes) doc.text(`  Details: ${scan.notes}`);
  doc.moveDown(0.25);

  doc.text(`PAP Smear Ordered: ${yn(pap ? 1 : 0)}`);
  if (pap?.notes) doc.text(`  Details: ${pap.notes}`);
  doc.moveDown(0.25);

  doc.text(`CTG Ordered: ${yn(ctg ? 1 : 0)}`);
  if (ctg?.notes) doc.text(`  Details: ${ctg.notes}`);
  doc.moveDown(1);

  // Prescription
  doc.fontSize(12).text("Prescription", { underline: true });
  doc.moveDown(0.25);
  doc.fontSize(10).text(`Notes: ${rx?.notes ?? "—"}`);
  doc.moveDown(0.5);

  if (rxItems.length === 0) {
    doc.fontSize(10).text("No medicines prescribed.");
  } else {
    rxItems.forEach((it, idx) => {
      const timing =
        [it.morning ? "M" : "", it.afternoon ? "A" : "", it.night ? "N" : ""]
          .filter(Boolean)
          .join("-") || "—";

      doc
        .fontSize(10)
        .text(
          `${idx + 1}. ${it.medicine_name}${it.dosage ? ` (${it.dosage})` : ""}`
        );
      doc.text(
        `   Timing: ${timing}  •  Before Food: ${
          it.before_food ? "Yes" : "No"
        }  •  Duration: ${it.duration_days ?? "—"} days`
      );
      if (it.instructions) doc.text(`   Instructions: ${it.instructions}`);
      doc.moveDown(0.25);
    });
  }

  doc.moveDown(1);
  doc.fontSize(9).text("Signature: ____________________", { align: "right" });

  doc.end();

  const pdfBuffer = await done;

  // ✅ Convert Buffer -> Uint8Array so TS is happy with BodyInit
  const body = new Uint8Array(pdfBuffer);

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="consultation-${visit.visitId}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
