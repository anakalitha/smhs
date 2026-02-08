import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

type PatientHitRow = RowDataPacket & {
  patientDbId: number;
  patientCode: string;
  name: string;
  phone: string | null;
  lastVisit: string | null;
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

function isAdmin(roles: string[]) {
  return roles.includes("ADMIN") || roles.includes("SUPER_ADMIN");
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
  const q = (url.searchParams.get("q") ?? "").trim();
  const limitRaw = (url.searchParams.get("limit") ?? "12").trim();

  const limit = Math.min(30, Math.max(5, Number(limitRaw) || 12));

  if (!q) {
    return NextResponse.json({ ok: true, rows: [] });
  }

  const orgId = me.organizationId != null ? Number(me.organizationId) : NaN;
  const branchId = me.branchId != null ? Number(me.branchId) : NaN;

  if (!Number.isFinite(orgId) || !Number.isFinite(branchId)) {
    return NextResponse.json(
      { error: "Invalid org/branch in session." },
      { status: 400 }
    );
  }

  const admin = isAdmin(me.roles);

  // Admin can optionally pass doctorId=123 to scope search
  const doctorIdParamRaw = (url.searchParams.get("doctorId") ?? "").trim();
  let doctorId: number | null = null;

  if (admin) {
    if (doctorIdParamRaw) {
      const d = Number(doctorIdParamRaw);
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

  const like = `%${q}%`;

  // Doctor scope (optional for admin)
  const whereDoctor = doctorId != null ? "AND v.doctor_id = :doctorId" : "";

  const params: Record<string, number | string> = {
    org: orgId,
    branch: branchId,
    like,
  };
  if (doctorId != null) params.doctorId = doctorId;

  // IMPORTANT:
  // We embed LIMIT as a safe number to avoid mysql2 prepared statement quirks with LIMIT ?
  const [rows] = await db.execute<PatientHitRow[]>(
    `
    SELECT
      p.id AS patientDbId,
      p.patient_code AS patientCode,
      p.full_name AS name,
      p.phone AS phone,
      MAX(v.visit_date) AS lastVisit
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
    GROUP BY p.id, p.patient_code, p.full_name, p.phone
    ORDER BY MAX(v.visit_date) DESC, p.id DESC
    LIMIT ${Number(limit)}
    `,
    params
  );

  return NextResponse.json({
    ok: true,
    rows: (rows || []).map((r) => ({
      patientDbId: Number(r.patientDbId),
      patientCode: String(r.patientCode),
      name: String(r.name),
      phone: r.phone != null ? String(r.phone) : null,
      lastVisit: r.lastVisit != null ? String(r.lastVisit) : null,
    })),
  });
}
