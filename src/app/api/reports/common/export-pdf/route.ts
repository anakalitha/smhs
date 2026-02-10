import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { PDFDocument, StandardFonts } from "pdf-lib";

function num(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const q = url.searchParams.toString();

  // Reuse JSON API
  const res = await fetch(`${url.origin}/api/reports/common?${q}`, {
    cache: "no-store",
    headers: req.headers,
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok || !data?.ok) {
    return NextResponse.json(
      { error: data?.error || "Failed to export." },
      { status: 400 }
    );
  }

  const startDate = String(url.searchParams.get("startDate") || "");
  const endDate = String(url.searchParams.get("endDate") || "");
  const title = `Report — ${startDate} to ${endDate}`;

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]); // A4 portrait
  const { height } = page.getSize();

  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let y = height - 40;
  page.drawText(title, { x: 40, y, size: 14, font: bold });
  y -= 24;

  const mode = data.mode;

  if (mode === "DETAIL") {
    const headers = [
      "Date",
      "Patient",
      "Name",
      "Svc",
      "Gross",
      "Paid",
      "Disc",
      "Net",
      "Pend",
      "Mode",
    ];
    const colX = [40, 95, 165, 280, 355, 400, 445, 485, 525, 555];

    headers.forEach((h: string, i: number) => {
      page.drawText(h, { x: colX[i], y, size: 8, font: bold });
    });
    y -= 12;

    const rows = (data.rows || []).slice(0, 55);
    for (const r of rows) {
      const line = [
        String(r.visitDate),
        String(r.patientCode).slice(0, 10),
        String(r.patientName).slice(0, 16),
        String(r.serviceCode),
        String(num(r.grossAmount).toFixed(0)),
        String(num(r.paidAmount).toFixed(0)),
        String(num(r.discountAmount).toFixed(0)),
        String(num(r.netAmount).toFixed(0)),
        String(num(r.pendingAmount).toFixed(0)),
        String(r.paymentMode).slice(0, 6),
      ];

      line.forEach((t, i) => {
        page.drawText(t, { x: colX[i], y, size: 8, font });
      });

      y -= 11;
      if (y < 70) break;
    }
  } else {
    const headers = ["Group", "Visits", "Gross", "Paid", "Disc", "Net", "Pend"];
    const colX = [40, 280, 340, 395, 450, 505, 555];

    headers.forEach((h: string, i: number) => {
      page.drawText(h, { x: colX[i], y, size: 9, font: bold });
    });
    y -= 12;

    const rows = (data.rows || []).slice(0, 60);
    for (const r of rows) {
      const line = [
        String(r.groupKey).slice(0, 30),
        String(num(r.visitsCount)),
        String(num(r.grossAmount).toFixed(0)),
        String(num(r.paidAmount).toFixed(0)),
        String(num(r.discountAmount).toFixed(0)),
        String(num(r.netAmount).toFixed(0)),
        String(num(r.pendingAmount).toFixed(0)),
      ];

      line.forEach((t, i) => {
        page.drawText(t, { x: colX[i], y, size: 9, font });
      });

      y -= 11;
      if (y < 70) break;
    }
  }

  // Totals
  y -= 10;
  if (data.totals) {
    page.drawText("Totals:", { x: 40, y, size: 10, font: bold });
    page.drawText(`Gross ${num(data.totals.gross).toFixed(0)}`, {
      x: 110,
      y,
      size: 10,
      font: bold,
    });
    page.drawText(`Paid ${num(data.totals.paid).toFixed(0)}`, {
      x: 210,
      y,
      size: 10,
      font: bold,
    });
    page.drawText(`Disc ${num(data.totals.discount).toFixed(0)}`, {
      x: 310,
      y,
      size: 10,
      font: bold,
    });
    page.drawText(`Net ${num(data.totals.net).toFixed(0)}`, {
      x: 410,
      y,
      size: 10,
      font: bold,
    });
    page.drawText(`Pend ${num(data.totals.pending).toFixed(0)}`, {
      x: 500,
      y,
      size: 10,
      font: bold,
    });
  }

  const bytes = await pdf.save();
  const body = Buffer.from(bytes);

  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="REPORT_${startDate}_to_${endDate}.pdf"`,
    },
  });
}
