import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";

function csvEscape(v: unknown) {
  const s = String(v ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Reuse JSON API to avoid duplicating SQL
  const url = new URL(req.url);
  const q = url.searchParams.toString();
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

  const mode = data.mode;

  const lines: string[] = [];

  if (mode === "DETAIL") {
    const header = [
      "Visit Date",
      "Patient Id",
      "Name",
      "Referred By",
      "Phone",
      "Doctor",
      "Service",
      "Gross",
      "Paid",
      "Discount",
      "Net",
      "Pending",
      "Payment Mode",
    ];
    lines.push(header.join(","));
    for (const r of data.rows || []) {
      lines.push(
        [
          r.visitDate,
          r.patientCode,
          r.patientName,
          r.referredBy,
          r.phone,
          r.doctorName,
          `${r.serviceName} (${r.serviceCode})`,
          r.grossAmount,
          r.paidAmount,
          r.discountAmount,
          r.netAmount,
          r.pendingAmount,
          r.paymentMode,
        ]
          .map(csvEscape)
          .join(",")
      );
    }
  } else {
    const header = [
      "Group",
      "Visits",
      "Gross",
      "Paid",
      "Discount",
      "Net",
      "Pending",
    ];
    lines.push(header.join(","));
    for (const r of data.rows || []) {
      lines.push(
        [
          r.groupKey,
          r.visitsCount,
          r.grossAmount,
          r.paidAmount,
          r.discountAmount,
          r.netAmount,
          r.pendingAmount,
        ]
          .map(csvEscape)
          .join(",")
      );
    }
  }

  // Totals row
  if (data.totals) {
    lines.push("");
    lines.push(
      [
        "TOTALS",
        "",
        data.totals.gross,
        data.totals.paid,
        data.totals.discount,
        data.totals.net,
        data.totals.pending,
      ]
        .map(csvEscape)
        .join(",")
    );
  }

  const csv = lines.join("\n");
  const startDate = String(url.searchParams.get("startDate") || "");
  const endDate = String(url.searchParams.get("endDate") || "");
  const filename = `REPORT_${startDate}_to_${endDate}.xlsx`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
