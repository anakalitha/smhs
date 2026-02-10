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

type CountRow = RowDataPacket & { n: number };

type UserLike = { roles?: string[] } | null | undefined;

function isDoctorOrAdmin(me: UserLike) {
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

function clampInt(raw: string | null, def: number, min: number, max: number) {
  const n = Number(raw ?? def);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isDoctorOrAdmin(me))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

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

  const url = new URL(req.url);
  const search = (url.searchParams.get("search") ?? "").trim();
  const page = clampInt(url.searchParams.get("page"), 1, 1, 100000);
  const pageSize = clampInt(url.searchParams.get("pageSize"), 15, 5, 50);
  const offset = (page - 1) * pageSize;

  const admin = isAdmin(me);
  const doctorIdParamRaw = (url.searchParams.get("doctorId") ?? "").trim();
  const doctorIdParam = doctorIdParamRaw ? Number(doctorIdParamRaw) : null;

  let doctorId: number | null = null;
  if (admin) {
    // Admin can choose doctorId; if not provided -> all doctors in branch.
    if (doctorIdParam != null) {
      if (!Number.isFinite(doctorIdParam) || doctorIdParam <= 0) {
        return NextResponse.json(
          { error: "Invalid doctorId query param." },
          { status: 400 }
        );
      }
      doctorId = doctorIdParam;
    }
  } else {
    doctorId = await resolveDoctorIdForUser({ userId: me.id, orgId, branchId });
    if (!doctorId) {
      return NextResponse.json(
        { error: "Doctor account is not linked to a doctor profile." },
        { status: 400 }
      );
    }
  }

  const whereDoctor = doctorId != null ? "AND v.doctor_id = :doctorId" : "";
  const whereSearch = search
    ? `AND (
        p.patient_code LIKE :like
        OR p.full_name LIKE :like
        OR p.phone LIKE :like
      )`
    : "";

  const params: Record<string, number | string> = {
    org: orgId,
    branch: branchId,
  };
  if (doctorId != null) params.doctorId = doctorId;
  if (search) params.like = `%${search}%`;

  // COUNT
  const [countRows] = await db.execute<CountRow[]>(
    `
    SELECT COUNT(DISTINCT p.id) AS n
    FROM visits v
    JOIN patients p ON p.id = v.patient_id
    WHERE v.organization_id = :org
      AND v.branch_id = :branch
      ${whereDoctor}
      ${whereSearch}
    `,
    params
  );

  const total = Number(countRows?.[0]?.n ?? 0);

  // DATA
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
