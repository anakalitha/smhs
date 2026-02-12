// src\app\api\doctor\visits\[visitId]\consultation\pdf\route.ts
import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFImage,
} from "pdf-lib";
import fs from "fs";
import path from "path";

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

function fmtDDMMYYYY(dateYmd: string): string {
  // expects "YYYY-MM-DD"
  const m = dateYmd.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return dateYmd || "—";
  return `${m[3]}/${m[2]}/${m[1]}`;
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

function safeStr(v: unknown) {
  return (v ?? "").toString().trim();
}

function calcAge(dobYmd: string): string {
  // dobYmd: YYYY-MM-DD
  const m = dobYmd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d))
    return "";
  const today = new Date();
  let age = today.getFullYear() - y;
  const hadBirthday =
    today.getMonth() + 1 > mo ||
    (today.getMonth() + 1 === mo && today.getDate() >= d);
  if (!hadBirthday) age -= 1;
  return age >= 0 && age <= 130 ? String(age) : "";
}

// instructions stored with meta header: [P=...][S=yyyy-mm-dd] actual text...
function parseInstructionsMeta(instructions: string) {
  const raw = (instructions || "").trim();
  const metaMatch = raw.match(/^\[P=(.*?)\]\[S=(.*?)\]\s*/);

  if (!metaMatch) {
    return {
      periodicity: "Daily",
      startDate: "",
      instruction: raw,
    };
  }

  const periodicity = (metaMatch[1] || "").trim() || "Daily";
  const startDate = (metaMatch[2] || "").trim() || "";
  const rest = raw.replace(/^\[P=(.*?)\]\[S=(.*?)\]\s*/, "").trim();

  return { periodicity, startDate, instruction: rest };
}

function parseDosage(dosage: string) {
  // stored as "M-A-N" e.g. "1-0-1"
  const raw = (dosage || "").trim();
  const parts = raw.includes("-") ? raw.split("-") : [raw];
  const m = (parts[0] ?? "").replace(/[^0-9]/g, "");
  const a = (parts[1] ?? "").replace(/[^0-9]/g, "");
  const n = (parts[2] ?? "").replace(/[^0-9]/g, "");
  return { m: m || "", a: a || "", n: n || "" };
}

function loadLogoBytes(): Uint8Array | null {
  // Client requirement: logo stored at public/images/smnh_pdf_logo.jpg
  const tryPaths = [
    path.join(process.cwd(), "public", "images", "smnh_pdf_logo.jpg"),
    path.join(process.cwd(), "public", "images", "smnh_pdf_logo.jpeg"),
    path.join(process.cwd(), "public", "images", "smnh_pdf_logo.png"),
    path.join(process.cwd(), "public", "smnh-logo.png"),
    path.join(process.cwd(), "public", "smnh-logo.jpg"),
    path.join(process.cwd(), "public", "logo.png"),
    path.join(process.cwd(), "public", "logo.jpg"),
  ];

  for (const p of tryPaths) {
    try {
      if (fs.existsSync(p)) {
        const b = fs.readFileSync(p);
        return new Uint8Array(b);
      }
    } catch {
      // ignore
    }
  }
  return null;
}

type LogoImg = { width: number; height: number; embed: PDFImage };

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

  // Header: branch details for letterhead (client requirement)
  const [branchRows] = await db.execute<RowDataPacket[]>(
    `
    SELECT name, address, mobile_phone
    FROM branches
    WHERE id = :branch
      AND organization_id = :org
      AND is_active = 1
    LIMIT 1
    `,
    { org: orgId, branch: branchId }
  );

  const branch = branchRows[0]
    ? {
        name: safeStr(branchRows[0].name),
        address: safeStr(branchRows[0].address),
        mobile: safeStr(branchRows[0].mobile_phone),
      }
    : { name: "", address: "", mobile: "" };

  // Visit + patient + doctor
  const [vRows] = await db.execute<RowDataPacket[]>(
    `
    SELECT
      v.id AS visitId,
      v.visit_date AS visitDate,
      v.admit_requested AS admitRequested,
      v.doctor_id AS doctorId,

      p.patient_code AS patientCode,
      p.full_name AS patientName,
      p.phone AS patientPhone,
      p.dob AS patientDob,
      p.gender AS patientGender,
      rp.name AS referredByName,

      d.full_name AS doctorName,
      d.specialization AS doctorSpecialization,
      d.qualification AS doctorQualification
    FROM visits v
    JOIN patients p ON p.id = v.patient_id
    JOIN doctors d ON d.id = v.doctor_id
    LEFT JOIN referralperson rp ON rp.id = v.referralperson_id
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
    patientCode: safeStr(vRows[0].patientCode),
    patientName: safeStr(vRows[0].patientName),
    patientPhone: safeStr(vRows[0].patientPhone),
    patientDob: ymd(vRows[0].patientDob),
    patientGender: safeStr(vRows[0].patientGender),
    doctorName: safeStr(vRows[0].doctorName),
    doctorSpecialization: safeStr(vRows[0].doctorSpecialization),
    doctorQualification: safeStr(vRows[0].doctorQualification),
    admitRequested: Number(vRows[0].admitRequested || 0) === 1,
    referredByName: safeStr(vRows[0].referredByName),
  };

  const age = visit.patientDob ? calcAge(visit.patientDob) : "";

  const [cntRows] = await db.execute<RowDataPacket[]>(
    `
  SELECT COUNT(*) AS c
  FROM visits
  WHERE patient_id = (
    SELECT patient_id FROM visits WHERE id = :visitId LIMIT 1
  )
    AND organization_id = :org
    AND branch_id = :branch
  `,
    { visitId: id, org: orgId, branch: branchId }
  );

  const visitCount = Number(cntRows[0]?.c ?? 0);

  // Notes
  const [noteRows] = await db.execute<RowDataPacket[]>(
    `SELECT diagnosis, investigation, treatment, remarks FROM visit_notes WHERE visit_id = :visitId LIMIT 1`,
    { visitId: id }
  );
  const note = noteRows[0] ?? null;

  // Orders
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

  // ---- Build PDF using pdf-lib ----
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Embed logo if available
  const logoBytes = loadLogoBytes();
  let logoImg: LogoImg | null = null;

  if (logoBytes) {
    try {
      // Try PNG first, fallback to JPG
      const asPng = await pdfDoc.embedPng(logoBytes);
      logoImg = { width: asPng.width, height: asPng.height, embed: asPng };
    } catch {
      try {
        const asJpg = await pdfDoc.embedJpg(logoBytes);
        logoImg = { width: asJpg.width, height: asJpg.height, embed: asJpg };
      } catch {
        logoImg = null;
      }
    }
  }

  const page = pdfDoc.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();

  const marginX = 40;
  let y = height - 35;

  function drawLine(x1: number, y1: number, x2: number, y2: number, w = 0.6) {
    page.drawLine({
      start: { x: x1, y: y1 },
      end: { x: x2, y: y2 },
      thickness: w,
      // soft grey instead of black
      color: rgb(0.75, 0.75, 0.75),
    });
  }

  function drawText(
    text: string,
    x: number,
    yPos: number,
    opts?: {
      bold?: boolean;
      size?: number;
      color?: { r: number; g: number; b: number };
    }
  ) {
    const size = opts?.size ?? 10.5;
    const f = opts?.bold ? fontBold : font;
    const c = opts?.color
      ? rgb(opts.color.r, opts.color.g, opts.color.b)
      : rgb(0, 0, 0);

    page.drawText((text ?? "").toString(), {
      x,
      y: yPos,
      size,
      font: f,
      color: c,
    });
  }

  function wrapText(
    text: string,
    maxWidth: number,
    size: number,
    fnt: PDFFont
  ) {
    const words = (text ?? "").toString().trim().split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let line = "";
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      const wWidth = fnt.widthOfTextAtSize(next, size);
      if (wWidth > maxWidth && line) {
        lines.push(line);
        line = w;
      } else {
        line = next;
      }
    }
    if (line) lines.push(line);
    return lines.length ? lines : [""];
  }

  function drawLabelValueRow(args: {
    x: number;
    y: number;
    label: string;
    value: string;
    labelW: number;
    valueW: number;
    h: number;
  }) {
    const { x, y, label, value, labelW, valueW, h } = args;
    drawLine(x, y, x + labelW + valueW, y);
    drawLine(x, y - h, x + labelW + valueW, y - h);
    drawLine(x, y, x, y - h);
    drawLine(x + labelW, y, x + labelW, y - h);
    drawLine(x + labelW + valueW, y, x + labelW + valueW, y - h);

    drawText(label, x + 6, y - 15, { bold: true, size: 9 });
    const vLines = wrapText(value || "—", valueW - 12, 10.5, fontBold);
    drawText(vLines[0], x + labelW + 6, y - 16, { bold: true, size: 10.5 });
  }

  // ===== Header (match client screenshot) =====
  const headerTop = y;
  const rightX = width - marginX;

  // Logo
  const logoBox = 72;
  const logoX = marginX;
  const logoYTop = headerTop;
  if (logoImg) {
    const scale = Math.min(logoBox / logoImg.width, logoBox / logoImg.height);
    const w = logoImg.width * scale;
    const h = logoImg.height * scale;

    page.drawImage(logoImg.embed, {
      x: logoX,
      y: logoYTop - h,
      width: w,
      height: h,
    });
  } else {
    // placeholder box
    drawLine(logoX, logoYTop, logoX + logoBox, logoYTop);
    drawLine(logoX, logoYTop - logoBox, logoX + logoBox, logoYTop - logoBox);
    drawLine(logoX, logoYTop, logoX, logoYTop - logoBox);
    drawLine(logoX + logoBox, logoYTop, logoX + logoBox, logoYTop - logoBox);
  }

  // Hospital name (no rectangle) — right aligned above address
  const hospitalName = branch.name || "Sri Mruthyunjaya Nursing Home";
  const titleSize = 16;
  const titleW = fontBold.widthOfTextAtSize(hospitalName, titleSize);
  const titleY = headerTop - 24;
  drawText(hospitalName, rightX - titleW, titleY, {
    bold: true,
    size: titleSize,
  });

  // Address (right aligned)
  const addrSize = 10.5;
  const addrMaxW = 220;
  const addrText = (branch.address || "").replace(/\s+/g, " ").trim();
  const addrLines = (() => {
    if (!addrText) return [] as string[];
    const parts = addrText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (parts.length >= 3) {
      return [`${parts[0]}, ${parts[1]}`, parts.slice(2).join(", ")];
    }
    if (parts.length === 2) return [parts[0], parts[1]];
    return wrapText(addrText, addrMaxW, addrSize, font);
  })();

  let addrY = titleY - 16;
  for (const line of addrLines.slice(0, 2)) {
    const wLine = font.widthOfTextAtSize(line, addrSize);
    drawText(line, rightX - wLine, addrY, { size: addrSize });
    addrY -= 13;
  }
  if (branch.mobile) {
    const mobLine = `Mobile: ${branch.mobile}`;
    const wLine = font.widthOfTextAtSize(mobLine, addrSize);
    drawText(mobLine, rightX - wLine, addrY, { size: addrSize });
  }

  // Doctor block under logo
  const docX = logoX;

  drawText("Delivering Happiness....", docX, headerTop - logoBox - 10, {
    size: 9,
    color: { r: 0.0, g: 0.6, b: 0.65 },
  });

  let docY = headerTop - logoBox - 42;
  drawText(`Dr. ${visit.doctorName}`, docX, docY, { bold: true, size: 12 });
  docY -= 14;
  if (visit.doctorSpecialization) {
    drawText(visit.doctorSpecialization, docX, docY, { size: 10.5 });
    docY -= 12;
  }
  if (visit.doctorQualification) {
    drawText(visit.doctorQualification, docX, docY, { size: 10.5 });
    docY -= 12;
  }

  // Header separator — keep below doctor block and address block
  const sepY = Math.min(docY - 10, addrY - 18);
  y = Math.min(sepY, headerTop - 130);
  drawLine(marginX, y, width - marginX, y, 0.8);
  y -= 14;

  // ===== Patient/visit info table =====
  const boxX = marginX;
  const boxW = width - marginX * 2;
  const col1 = boxW * 0.62;
  const col2 = boxW - col1;

  let rowH = 26;

  // Row 1 (Name / Age-Sex)
  const topY = y;
  drawLabelValueRow({
    x: boxX,
    y: topY,
    label: "Name:",
    value: visit.patientName,
    labelW: 85,
    valueW: col1 - 85,
    h: rowH,
  });
  drawLabelValueRow({
    x: boxX + col1,
    y: topY,
    label: "Age / Sex:",
    value: `${age || "—"} / ${visit.patientGender || "—"}`,
    labelW: 85,
    valueW: col2 - 85,
    h: rowH,
  });

  // Row 2 (Patient ID / Visit Date)
  const row2Y = topY - rowH;
  drawLabelValueRow({
    x: boxX,
    y: row2Y,
    label: "Patient ID:",
    value: visit.patientCode,
    labelW: 85,
    valueW: col1 - 85,
    h: rowH,
  });
  drawLabelValueRow({
    x: boxX + col1,
    y: row2Y,
    label: "Visit Date:",
    value: fmtDDMMYYYY(visit.visitDate),
    labelW: 85,
    valueW: col2 - 85,
    h: rowH,
  });

  // Row 3 (Doctor / Phone)
  const row3Y = row2Y - rowH;
  drawLabelValueRow({
    x: boxX,
    y: row3Y,
    label: "Referred By:",
    value: visit.referredByName || "—",
    labelW: 85,
    valueW: col1 - 85,
    h: rowH,
  });
  drawLabelValueRow({
    x: boxX + col1,
    y: row3Y,
    label: "Phone:",
    value: visit.patientPhone || "—",
    labelW: 85,
    valueW: col2 - 85,
    h: rowH,
  });

  // Row 4 (Admission advised)
  const row4Y = row3Y - rowH;
  drawLabelValueRow({
    x: boxX,
    y: row4Y,
    label: "Visit Type:",
    value: String(visitCount || 1),
    labelW: 85,
    valueW: boxW - 85,
    h: rowH,
  });

  y = row4Y - rowH - 24;

  // ===== Sections =====
  function drawSection(label: string, value: string) {
    const labelSize = 10.5;
    const valueSize = 10.5;

    const maxW = width - marginX * 2;

    const lbl = (label ?? "").toString().trim();
    const val = ((value ?? "").toString().trim() || "—").replace(/\s+/g, " ");

    // "Diagnosis:" should appear as "Diagnosis: value"
    const prefix = `${lbl} `;
    const prefixW = fontBold.widthOfTextAtSize(prefix, labelSize);

    // Wrap value based on remaining width in the first line
    const firstLineMax = Math.max(40, maxW - prefixW);
    const valLines = wrapText(val, firstLineMax, valueSize, font);

    // Draw first line: label (bold) + first chunk of value
    drawText(prefix, marginX, y, { bold: true, size: labelSize });
    drawText(valLines[0] ?? "", marginX + prefixW, y, { size: valueSize });

    // Draw remaining wrapped lines (if any), aligned under the value (not under label)
    let yy = y - 13;
    if (valLines.length > 1) {
      const remainingText = valLines.slice(1).join(" ");
      const remainingLines = wrapText(
        remainingText,
        maxW - prefixW,
        valueSize,
        font
      );

      for (const ln of remainingLines) {
        drawText(ln, marginX + prefixW, yy, { size: valueSize });
        yy -= 13;
      }
    }

    y = yy - 12;
  }

  drawSection("Diagnosis:", safeStr(note?.diagnosis));
  drawSection("Investigation:", safeStr(note?.investigation));
  drawSection("Treatment:", safeStr(note?.treatment));
  drawSection("Consultation Remarks:", safeStr(note?.remarks));

  // Orders section (compact)
  drawText("Orders:", marginX, y, { bold: true, size: 10.5 });
  let ordersLineY = y - 14;

  if (orderRows.length === 0) {
    drawText("—", marginX + 10, ordersLineY, { size: 10.5 });
    ordersLineY -= 16;
  } else {
    for (const o of orderRows) {
      const code = safeStr(o.service_code);
      const title = code === "PAP" ? "PAP Smear" : code;
      const details = safeStr(o.notes) || "—";

      const lines = wrapText(
        `${title}: ${details}`,
        width - marginX * 2 - 10,
        10.5,
        font
      );

      for (const ln of lines.slice(0, 2)) {
        drawText(ln, marginX + 10, ordersLineY, { size: 10.5 });
        ordersLineY -= 13;
      }
      ordersLineY -= 2;
    }
  }

  y = ordersLineY - 6;

  // Prescription Notes (if any)
  const rxNotes = safeStr(rx?.notes);
  if (rxNotes) drawSection("Prescription Notes:", rxNotes);

  // ===== Rx Table (match sample layout) =====
  drawText("Rx", marginX, y, { bold: true, size: 12 });
  y -= 12;

  const tableX = marginX;
  const tableW = width - marginX * 2;

  // Columns: # | Medication | Dosage (Morn/Aft/Night) | Instruction | Periodicity | Start Date | Duration
  const wNo = 22;

  // ↓ reduce medication width
  const wMed = tableW * 0.34;

  // keep these similar
  const wDose = tableW * 0.18;
  const wInstr = tableW * 0.16;

  // ↑ widen these three so headers + values fit
  const wPer = tableW * 0.12;
  const wStart = tableW * 0.1;
  const wDur = tableW - (wNo + wMed + wDose + wInstr + wPer + wStart);

  const wDoseSub = wDose / 3;

  // Header has two lines like sample:
  // Line 1: Medication | Dosage | Instruction | Periodicity | Start Date | Duration
  // Line 2:            | Morn | Aft | Night
  const headerH1 = 16;
  const headerH2 = 14;
  const headerH = headerH1 + headerH2;

  rowH = 26; // row height similar to sample
  const lineGap = 11;

  const tableTop = y;

  // Light underline under header (no heavy box)
  // Top line
  drawLine(tableX, tableTop, tableX + tableW, tableTop, 0.6);

  // Bottom line of header
  drawLine(
    tableX,
    tableTop - headerH,
    tableX + tableW,
    tableTop - headerH,
    0.6
  );

  // Vertical boundaries (subtle)
  const x = tableX;
  const xNo = x + wNo;
  const xMed = xNo + wMed;
  const xDose = xMed + wDose;
  const xInstr = xDose + wInstr;
  const xPer = xInstr + wPer;
  const xStart = xPer + wStart;
  const xEnd = tableX + tableW;

  // Main column separators across full header height
  for (const xv of [xNo, xMed, xDose, xInstr, xPer, xStart]) {
    drawLine(xv, tableTop, xv, tableTop - headerH, 0.6);
  }

  // Dosage subcolumns separators only for header second line + body rows
  const xDoseM = xMed + wDoseSub;
  const xDoseA = xMed + wDoseSub * 2;

  // Header: dosage sub lines (only across second header row)
  drawLine(xDoseM, tableTop - headerH1, xDoseM, tableTop - headerH, 0.6);
  drawLine(xDoseA, tableTop - headerH1, xDoseA, tableTop - headerH, 0.6);

  // Header labels (line 1)
  drawText("Medication", xNo + 6, tableTop - 12, { bold: true, size: 9.5 });
  drawText("Dosage", xMed + 6, tableTop - 12, { bold: true, size: 9.5 });
  drawText("Instruction", xDose + 6, tableTop - 12, { bold: true, size: 9.5 });
  drawText("Periodicity", xInstr + 6, tableTop - 12, { bold: true, size: 9 });
  drawText("Start Date", xPer + 6, tableTop - 12, { bold: true, size: 9 });
  drawText("Duration", xStart + 6, tableTop - 12, { bold: true, size: 9 });

  // Header labels (line 2 under dosage)
  drawText("Morn", xMed + 6, tableTop - headerH1 - 11, { size: 9 });
  drawText("Aft", xDoseM + 6, tableTop - headerH1 - 11, { size: 9 });
  drawText("Night", xDoseA + 6, tableTop - headerH1 - 11, { size: 9 });

  let curY = tableTop - headerH;

  // Helper to split medication into "main" + "(details)" if present
  function splitMedication(m: string): { main: string; detail: string } {
    const s = (m || "").trim();
    if (!s) return { main: "—", detail: "" };

    // If already contains parentheses, show that as detail line
    const idxParen = s.indexOf("(");
    if (idxParen > 0) {
      const main = s.slice(0, idxParen).trim();
      const detail = s.slice(idxParen).trim();
      return { main: main || s, detail };
    }
    return { main: s, detail: "" };
  }

  // Draw body rows
  const itemsToPrint = rxItems.length ? rxItems : [];

  if (itemsToPrint.length === 0) {
    // one empty row
    drawLine(tableX, curY, tableX + tableW, curY, 0.6);
    drawLine(tableX, curY - rowH, tableX + tableW, curY - rowH, 0.6);

    // Column verticals for row
    for (const xv of [xNo, xMed, xDose, xInstr, xPer, xStart]) {
      drawLine(xv, curY, xv, curY - rowH, 0.6);
    }
    drawLine(xDoseM, curY, xDoseM, curY - rowH, 0.6);
    drawLine(xDoseA, curY, xDoseA, curY - rowH, 0.6);

    drawText("1", tableX + 6, curY - 16, { size: 10 });
    drawText("—", xNo + 6, curY - 16, { size: 10 });
    curY -= rowH;
  } else {
    let rowNo = 1;
    for (const it of itemsToPrint) {
      // Simple page overflow protection (no multipage yet)
      if (curY < 90) break;

      drawLine(tableX, curY, tableX + tableW, curY, 0.6);
      drawLine(tableX, curY - rowH, tableX + tableW, curY - rowH, 0.6);

      // Verticals
      for (const xv of [xNo, xMed, xDose, xInstr, xPer, xStart]) {
        drawLine(xv, curY, xv, curY - rowH, 0.6);
      }
      drawLine(xDoseM, curY, xDoseM, curY - rowH, 0.6);
      drawLine(xDoseA, curY, xDoseA, curY - rowH, 0.6);

      const medRaw = safeStr(it.medicine_name);
      const med = splitMedication(medRaw);

      const dosageObj = parseDosage(safeStr(it.dosage));
      const meta = parseInstructionsMeta(safeStr(it.instructions)); // keep for periodicity/startDate
      const instruction = Number(it.before_food) ? "Before Food" : "After Food";

      const periodicity = (meta.periodicity || "Daily").trim();
      const startDate = meta.startDate ? fmtDDMMYYYY(meta.startDate) : "";
      const duration =
        it.duration_days != null ? `${String(it.duration_days)} Days` : "";

      // Row number
      drawText(String(rowNo), tableX + 6, curY - 16, { size: 10 });

      // Medication (bold main + smaller detail)
      const medMainLines = wrapText(med.main, wMed - 12, 9.6, fontBold);
      drawText(medMainLines[0] || "—", xNo + 6, curY - 14, {
        bold: true,
        size: 9.6,
      });

      if (med.detail) {
        const detailLines = wrapText(med.detail, wMed - 12, 8.4, font);
        drawText(detailLines[0] || "", xNo + 6, curY - 14 - lineGap, {
          size: 8.4,
        });
      }

      // Dosage subcolumns
      const m = dosageObj.m || "x";
      const a = dosageObj.a || "x";
      const n = dosageObj.n || "x";
      drawText(m, xMed + 10, curY - 16, { size: 10 });
      drawText(a, xDoseM + 10, curY - 16, { size: 10 });
      drawText(n, xDoseA + 10, curY - 16, { size: 10 });

      // Instruction
      const instrLines = wrapText(instruction, wInstr - 12, 9.2, font);
      drawText(instrLines[0] || "", xDose + 6, curY - 16, { size: 9.2 });

      // Periodicity
      drawText(periodicity, xInstr + 6, curY - 16, { size: 9.2 });

      // Start Date
      drawText(startDate, xPer + 2, curY - 16, { size: 9.2 });

      // Duration
      drawText(duration, xStart + 6, curY - 16, { size: 9.2 });

      curY -= rowH;
      rowNo += 1;
    }
  }

  y = curY - 18;

  // Footer small note
  const footer = `Generated on ${new Date().toLocaleString()}`;
  const footerW = font.widthOfTextAtSize(footer, 8.5);
  drawText(footer, width - marginX - footerW, 30, { size: 8.5 });

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
