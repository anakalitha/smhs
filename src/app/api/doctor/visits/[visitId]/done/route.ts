import { NextResponse } from "next/server";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

type Ctx = { params: Promise<{ visitId: string }> };

function mustBeDoctor(me: { roles: string[] }) {
  return (
    me.roles.includes("DOCTOR") ||
    me.roles.includes("ADMIN") ||
    me.roles.includes("SUPER_ADMIN")
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

export async function POST(req: Request, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!mustBeDoctor(me))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { visitId } = await ctx.params;
  const id = Number(visitId);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid visitId." }, { status: 400 });
  }

  const orgId = me.organizationId != null ? Number(me.organizationId) : NaN;
  const branchId = me.branchId != null ? Number(me.branchId) : NaN;
  if (!Number.isFinite(orgId) || !Number.isFinite(branchId)) {
    return NextResponse.json(
      { error: "Invalid org/branch in session." },
      { status: 400 }
    );
  }

  const admin = isAdmin(me);
  const doctorId = admin
    ? null
    : await resolveDoctorIdForUser({ userId: me.id, orgId, branchId });

  if (!admin && !doctorId) {
    return NextResponse.json(
      { error: "Doctor account not linked to doctor profile." },
      { status: 400 }
    );
  }

  // Verify visit belongs to org/branch (+ ownership if non-admin)
  const [vRows] = await db.execute<RowDataPacket[]>(
    `
    SELECT id, doctor_id
    FROM visits
    WHERE id = :visitId
      AND organization_id = :org
      AND branch_id = :branch
    LIMIT 1
    `,
    { visitId: id, org: orgId, branch: branchId }
  );

  if (vRows.length === 0) {
    return NextResponse.json({ error: "Visit not found." }, { status: 404 });
  }

  if (!admin && Number(vRows[0].doctor_id) !== doctorId) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  // Mark queue entry as DONE
  await db.execute<ResultSetHeader>(
    `
    UPDATE queue_entries
    SET status = 'DONE'
    WHERE visit_id = :visitId
    `,
    { visitId: id }
  );

  return NextResponse.json({ ok: true });
}
