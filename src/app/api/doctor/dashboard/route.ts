// src/app/api/doctor/dashboard/route.ts
import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

type DoctorQueueRow = RowDataPacket & {
  visitId: number;
  visitDate: string;
  status: "WAITING" | "NEXT" | "IN_ROOM" | "DONE";
  tokenNo: number | null;

  patientDbId: number;
  patientCode: string;
  patientName: string;
  phone: string | null;
};

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

  const admin = isAdmin(me);

  const url = new URL(req.url);

  // ✅ NEW: search support for Today's Queue
  const search = (url.searchParams.get("search") ?? "").trim();
  const whereSearch = search
    ? `AND (
        p.patient_code LIKE :like
        OR p.full_name LIKE :like
        OR p.phone LIKE :like
      )`
    : "";

  // Admins can optionally request a specific doctorId: /api/doctor/dashboard?doctorId=2
  const doctorIdParamRaw = url.searchParams.get("doctorId");
  const doctorIdParam =
    doctorIdParamRaw != null && doctorIdParamRaw.trim() !== ""
      ? Number(doctorIdParamRaw)
      : null;

  let doctorId: number | null = null;

  if (admin) {
    // If admin provided doctorId, validate it; else leave null (meaning "all doctors")
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
    // Normal DOCTOR user: doctorId must come from doctors.user_id mapping
    doctorId = await resolveDoctorIdForUser({
      userId: me.id,
      orgId,
      branchId,
    });

    if (!doctorId) {
      return NextResponse.json(
        { error: "Doctor account is not linked to a doctor profile." },
        { status: 400 }
      );
    }
  }

  // Build WHERE with optional doctor filter for admins
  const whereDoctor = doctorId != null ? "AND v.doctor_id = :doctorId" : "";

  // ✅ params must match only the placeholders present
  const params: Record<string, number | string> = {
    org: orgId,
    branch: branchId,
  };
  if (doctorId != null) params.doctorId = doctorId;
  if (search) params.like = `%${search}%`;

  const [rows] = await db.execute<DoctorQueueRow[]>(
    `
    SELECT
      v.id AS visitId,
      v.visit_date AS visitDate,
      COALESCE(q.status, 'WAITING') AS status,
      q.token_no AS tokenNo,

      p.id AS patientDbId,
      p.patient_code AS patientCode,
      p.full_name AS patientName,
      p.phone AS phone
    FROM visits v
    JOIN patients p ON p.id = v.patient_id
    LEFT JOIN queue_entries q ON q.visit_id = v.id
    WHERE v.organization_id = :org
      AND v.branch_id = :branch
      ${whereDoctor}
      ${whereSearch}
      AND v.visit_date = CURDATE()
    ORDER BY
      CASE WHEN q.token_no IS NULL THEN 1 ELSE 0 END ASC,
      q.token_no ASC,
      v.id ASC
    `,
    params
  );

  return NextResponse.json({
    ok: true,
    doctorId: doctorId ?? null, // null when admin viewing all doctors
    todays: rows,
  });
}
