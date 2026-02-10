// src/app/api/doctor/patients/search/route.ts
import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

type OptRow = RowDataPacket & {
  patientCode: string;
  name: string;
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

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();

  // dropdown helper
  if (!q) return NextResponse.json({ rows: [] });

  const admin = isAdmin(me);
  const doctorIdParamRaw = (url.searchParams.get("doctorId") ?? "").trim();
  const doctorIdParam = doctorIdParamRaw ? Number(doctorIdParamRaw) : null;

  let doctorId: number | null = null;
  if (admin) {
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
  const params: Record<string, number | string> = {
    org: orgId,
    branch: branchId,
    like: `%${q}%`,
  };
  if (doctorId != null) params.doctorId = doctorId;

  const [rows] = await db.execute<OptRow[]>(
    `
    SELECT DISTINCT
      p.patient_code AS patientCode,
      p.full_name AS name,
      p.phone AS phone
    FROM visits v
    JOIN patients p ON p.id = v.patient_id
    WHERE v.organization_id = :org
      AND v.branch_id = :branch
      ${whereDoctor}
      AND (
        p.patient_code LIKE :like
        OR p.full_name LIKE :like
        OR p.phone LIKE :like
      )
    ORDER BY p.full_name ASC, p.patient_code ASC
    LIMIT 20
    `,
    params
  );

  return NextResponse.json({
    rows: (rows || []).map((r) => ({
      patientCode: String(r.patientCode),
      label:
        String(r.name) +
        " (" +
        String(r.patientCode) +
        ")" +
        (r.phone ? " • " + String(r.phone) : ""),
    })),
  });
}
