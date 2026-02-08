// src/app/api/doctor/patients/route.ts
import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

type PatientRow = RowDataPacket & {
  patientDbId: number;
  patientCode: string;
  name: string;
  phone: string | null;
  lastVisit: string;
  totalVisits: number;
};

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

  const search = (url.searchParams.get("search") ?? "").trim();
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
  const pageSize = Math.min(
    50,
    Math.max(5, Number(url.searchParams.get("pageSize") ?? "15"))
  );
  const offset = (page - 1) * pageSize;

  const orgId = me.organizationId != null ? Number(me.organizationId) : NaN;
  const branchId = me.branchId != null ? Number(me.branchId) : NaN;

  if (
    !Number.isFinite(orgId) ||
    orgId <= 0 ||
    !Number.isFinite(branchId) ||
    branchId <= 0
  ) {
    return NextResponse.json(
      { error: "Invalid org/branch in session." },
      { status: 400 }
    );
  }

  const isAdmin =
    me.roles.includes("ADMIN") || me.roles.includes("SUPER_ADMIN");

  // Admin can optionally pass doctorId to view a specific doctor's patients.
  // Non-admin doctor resolves their doctor profile via doctors.user_id.
  const doctorIdParam = (url.searchParams.get("doctorId") ?? "").trim();
  let doctorId: number | null = null;

  if (isAdmin) {
    if (doctorIdParam) {
      const d = Number(doctorIdParam);
      if (!Number.isFinite(d) || d <= 0) {
        return NextResponse.json(
          { error: "Invalid doctorId." },
          { status: 400 }
        );
      }
      doctorId = d;
    }
  } else {
    doctorId = await resolveDoctorIdForUser({ userId: me.id, orgId, branchId });
    if (!doctorId) {
      return NextResponse.json(
        { error: "Doctor account not linked to doctor profile." },
        { status: 400 }
      );
    }
  }

  const whereDoctor = doctorId ? "AND v.doctor_id = :doctorId" : "";
  const whereSearch = search
    ? `AND (
        p.patient_code LIKE :like
        OR p.full_name LIKE :like
        OR p.phone LIKE :like
      )`
    : "";

  // ✅ Build params ONLY for placeholders that exist in SQL
  const params: Record<string, number | string> = {
    org: orgId,
    branch: branchId,
  };

  if (doctorId) params.doctorId = Number(doctorId);
  if (search) params.like = `%${search}%`;

  // ✅ NEW: total count for pagination
  const [countRows] = await db.execute<RowDataPacket[]>(
    `
    SELECT COUNT(DISTINCT p.id) AS total
    FROM visits v
    JOIN patients p ON p.id = v.patient_id
    WHERE v.organization_id = :org
      AND v.branch_id = :branch
      ${whereDoctor}
      ${whereSearch}
    `,
    params
  );

  const total = Number(countRows[0]?.total ?? 0);

  const [rows] = await db.execute<PatientRow[]>(
    `
    SELECT
      p.id AS patientDbId,
      p.patient_code AS patientCode,
      p.full_name AS name,
      p.phone AS phone,
      MAX(v.visit_date) AS lastVisit,
      COUNT(v.id) AS totalVisits
    FROM visits v
    JOIN patients p ON p.id = v.patient_id
    WHERE v.organization_id = :org
      AND v.branch_id = :branch
      ${whereDoctor}
      ${whereSearch}
    GROUP BY p.id, p.patient_code, p.full_name, p.phone
    ORDER BY MAX(v.visit_date) DESC, p.id DESC
    LIMIT ${Number(pageSize)} OFFSET ${Number(offset)}
    `,
    params
  );

  return NextResponse.json({
    ok: true,
    rows,
    total,
    page,
    pageSize,
  });
}
