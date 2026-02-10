// src/app/api/doctor/reports/route.ts
import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

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

function validYMD(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const allowed =
    me.roles.includes("DOCTOR") ||
    me.roles.includes("ADMIN") ||
    me.roles.includes("SUPER_ADMIN");

  if (!allowed)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const start = (url.searchParams.get("start") ?? "").trim();
  const end = (url.searchParams.get("end") ?? "").trim();
  const referralIdRaw = (url.searchParams.get("referralId") ?? "").trim();

  if (start && !validYMD(start))
    return NextResponse.json({ error: "Invalid start date." }, { status: 400 });
  if (end && !validYMD(end))
    return NextResponse.json({ error: "Invalid end date." }, { status: 400 });

  const orgId = me.organizationId != null ? Number(me.organizationId) : NaN;
  const branchId = me.branchId != null ? Number(me.branchId) : NaN;

  if (!Number.isFinite(orgId) || !Number.isFinite(branchId)) {
    return NextResponse.json(
      { error: "Invalid org/branch in session." },
      { status: 400 }
    );
  }

  const isAdmin =
    me.roles.includes("ADMIN") || me.roles.includes("SUPER_ADMIN");

  const doctorIdParam = (url.searchParams.get("doctorId") ?? "").trim();
  let doctorId: number | null = null;

  if (isAdmin && doctorIdParam) {
    const d = Number(doctorIdParam);
    if (!Number.isFinite(d) || d <= 0)
      return NextResponse.json({ error: "Invalid doctorId." }, { status: 400 });
    doctorId = d;
  } else if (!isAdmin) {
    doctorId = await resolveDoctorIdForUser({ userId: me.id, orgId, branchId });
    if (!doctorId) {
      return NextResponse.json(
        { error: "Doctor account not linked to doctor profile." },
        { status: 400 }
      );
    }
  }

  const whereDoctor = doctorId ? "AND v.doctor_id = :doctorId" : "";
  const whereDates =
    start && end ? "AND v.visit_date BETWEEN :start AND :end" : "";
  const whereReferral = referralIdRaw
    ? "AND v.referralperson_id = :referralId"
    : "";

  const params: Record<string, unknown> = {
    org: orgId,
    branch: branchId,
  };
  if (doctorId) params.doctorId = doctorId;
  if (start && end) {
    params.start = start;
    params.end = end;
  }
  if (referralIdRaw) params.referralId = referralIdRaw;

  // NOTE:
  // - visit_orders uses service_id -> services(code)
  // - We show details by taking MAX(notes) for each type (latest)
  // - Treatment: simple concatenated medicine list (top-ish)
  const [rows] = await db.execute<RowDataPacket[]>(
    `
    SELECT
      p.patient_code AS patientId,
      p.full_name AS name,
      COALESCE(rp.name, '—') AS referredBy,

      v.visit_date AS visitDate,

      vn.diagnosis AS diagnosis,
      vn.investigation AS investigation,
      vn.remarks AS remarks,

      -- Latest notes per service code
      MAX(CASE WHEN s.code='SCAN' AND o.status <> 'CANCELLED' THEN o.notes END) AS scanDetails,
      MAX(CASE WHEN s.code='PAP' AND o.status <> 'CANCELLED' THEN o.notes END) AS papSmearDetails,
      MAX(CASE WHEN s.code='CTG' AND o.status <> 'CANCELLED' THEN o.notes END) AS ctgDetails,
      MAX(CASE WHEN s.code='LAB' AND o.status <> 'CANCELLED' THEN o.notes END) AS labDetails,

      -- Treatment: prefer manual treatment text; fallback to medicine list
      COALESCE(
        NULLIF(TRIM(vn.treatment), ''),
        (
          SELECT GROUP_CONCAT(DISTINCT pi.medicine_name ORDER BY pi.medicine_name SEPARATOR ', ')
          FROM prescriptions pr
          JOIN prescription_items pi ON pi.prescription_id = pr.id
          WHERE pr.visit_id = v.id
        )
      ) AS treatment

    FROM visits v
    JOIN patients p ON p.id = v.patient_id
    LEFT JOIN referralperson rp ON rp.id = v.referralperson_id
    LEFT JOIN visit_notes vn ON vn.visit_id = v.id
      LEFT JOIN visit_orders o ON o.visit_id = v.id
      LEFT JOIN services s ON s.id = o.service_id

    WHERE v.organization_id = :org
      AND v.branch_id = :branch
      ${whereDoctor}
      ${whereDates}
      ${whereReferral}

    GROUP BY
      v.id, p.patient_code, p.full_name, rp.name, v.visit_date,
      vn.diagnosis, vn.investigation, vn.remarks

    ORDER BY v.visit_date DESC, v.id DESC
    LIMIT 500
    `,
    params
  );

  return NextResponse.json({
    ok: true,
    rows: (rows || []).map((r) => ({
      patientId: String(r.patientId),
      name: String(r.name),
      referredBy: String(r.referredBy),
      visitDate: String(r.visitDate),

      diagnosis: r.diagnosis ? String(r.diagnosis) : "",
      investigation: r.investigation ? String(r.investigation) : "",
      scanDetails: r.scanDetails ? String(r.scanDetails) : "",
      papSmearDetails: r.papSmearDetails ? String(r.papSmearDetails) : "",
      ctgDetails: r.ctgDetails ? String(r.ctgDetails) : "",
      treatment: r.treatment ? String(r.treatment) : "",
      remarks: r.remarks ? String(r.remarks) : "",
    })),
  });
}
