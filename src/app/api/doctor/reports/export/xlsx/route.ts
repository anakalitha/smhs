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

  const XLSX = await import("xlsx");

  const sheetData = allRows.map((r) => ({
    "Patient ID": r.patientId,
    Name: r.name,
    Phone: r.phone ?? "",
    "Visit Date": r.visitDate,
    "Referred By": r.referredBy ?? "",
    "Consultant Fee": r.consultationFee,
    "Scan Fee": r.scanFee,
    "PAP Smear Fee": r.papSmearFee,
    "CTG Fee": r.ctgFee,
    "Lab Fee": r.labFee,
    "Pharma Fee": r.pharmaFee,
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(sheetData);
  XLSX.utils.book_append_sheet(wb, ws, "Report");

  const buffer: Buffer = XLSX.write(wb, {
    type: "buffer",
    bookType: "xlsx",
    compression: true,
  });

  const filename =
    mode === "PENDING"
      ? `pending-bills-${start}-to-${end}.xlsx`
      : `visit-summary-${start}-to-${end}.xlsx`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
