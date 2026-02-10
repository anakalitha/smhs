import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import {
  fetchVisitFees,
  normalizeTestType,
  resolveDoctorId,
  safeYmd,
  totalsRow,
} from "../../../../../api/reports/_lib";

function mustBeDoctor(me: { roles?: string[] } | null) {
  const roles = me?.roles ?? [];
  return (
    roles.includes("DOCTOR") ||
    roles.includes("ADMIN") ||
    roles.includes("SUPER_ADMIN")
  );
}

export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!mustBeDoctor(me))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!me.organizationId || !me.branchId) {
    return NextResponse.json(
      { error: "Your account is not linked to organization/branch." },
      { status: 400 }
    );
  }

  const url = new URL(req.url);

  const start = safeYmd(url.searchParams.get("start"));
  const end = safeYmd(url.searchParams.get("end"));
  if (!start || !end) {
    return NextResponse.json(
      { error: "Invalid start/end date." },
      { status: 400 }
    );
  }

  const patientCode = url.searchParams.get("patientCode")?.trim() || undefined;
  const referralId = url.searchParams.get("referralId")?.trim() || undefined;
  const testType = normalizeTestType(url.searchParams.get("testType"));
  const mode =
    url.searchParams.get("mode") === "PENDING" ? "PENDING" : "SUMMARY";

  const doctorId = await resolveDoctorId({
    userId: me.id,
    organizationId: me.organizationId,
    branchId: me.branchId,
  });
  if (!doctorId) {
    return NextResponse.json(
      { error: "Doctor profile not found." },
      { status: 400 }
    );
  }

  const rows = await fetchVisitFees({
    organizationId: me.organizationId,
    branchId: me.branchId,
    doctorId,
    start,
    end,
    patientCode,
    referralId,
    testType,
    mode,
  });

  const allRows = [...rows, totalsRow(rows)];

  const jsPDF = (await import("jspdf")).default;
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF({ orientation: "landscape" });

  doc.setFontSize(12);
  doc.text(
    mode === "PENDING" ? "Pending Bills Report" : "Visit Summary Report",
    14,
    12
  );
  doc.setFontSize(9);
  doc.text(`From ${start} to ${end}`, 14, 18);

  autoTable(doc, {
    startY: 22,
    styles: { fontSize: 8 },
    head: [
      [
        "Patient ID",
        "Name",
        "Phone",
        "Visit Date",
        "Referred By",
        "Consult",
        "Scan",
        "PAP",
        "CTG",
        "Lab",
        "Pharma",
      ],
    ],
    body: allRows.map((r) => [
      r.patientId,
      r.name,
      r.phone ?? "",
      r.visitDate,
      r.referredBy ?? "",
      r.consultationFee,
      r.scanFee,
      r.papSmearFee,
      r.ctgFee,
      r.labFee,
      r.pharmaFee,
    ]),
  });

  const pdfBuffer = doc.output("arraybuffer");

  const filename =
    mode === "PENDING"
      ? `pending-bills-${start}-to-${end}.pdf`
      : `visit-summary-${start}-to-${end}.pdf`;

  return new NextResponse(Buffer.from(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
