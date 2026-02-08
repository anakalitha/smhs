// src\app\api\doctor\patients\[patientCode]\new-visit\route.ts
import { NextResponse } from "next/server";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

type Ctx = { params: Promise<{ patientCode: string }> };

type UserLike = { roles?: string[] } | null | undefined;

function mustBeDoctor(me: UserLike) {
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

function todayLocalYYYYMMDD() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

type MaxTokenRow = RowDataPacket & { max_token: number };

export async function POST(req: Request, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!mustBeDoctor(me))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { patientCode } = await ctx.params;
  const code = String(patientCode ?? "").trim();
  if (!code) {
    return NextResponse.json(
      { error: "Invalid patientCode." },
      { status: 400 }
    );
  }

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

  // Body: doctorId optional for ADMIN; required for doctor scope otherwise
  const body = (await req.json().catch(() => ({}))) as { doctorId?: number };
  const doctorIdParam = body.doctorId ? Number(body.doctorId) : null;

  let doctorId: number | null = null;
  if (admin) {
    doctorId = doctorIdParam; // can be null (if you later want admin-all-doctors flows)
  } else {
    doctorId = await resolveDoctorIdForUser({ userId: me.id, orgId, branchId });
    if (!doctorId) {
      return NextResponse.json(
        { error: "Doctor account not linked to doctor profile." },
        { status: 400 }
      );
    }
  }

  if (!doctorId) {
    return NextResponse.json(
      { error: "Doctor is required to create visit." },
      { status: 400 }
    );
  }

  const visitDate = todayLocalYYYYMMDD();

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // 1) Resolve patient id by code within org/branch scope via visits OR directly from patients
    const [pRows] = await conn.execute<RowDataPacket[]>(
      `
      SELECT p.id
      FROM patients p
      WHERE p.patient_code = :code
      LIMIT 1
      `,
      { code }
    );

    if (pRows.length === 0) {
      await conn.rollback();
      return NextResponse.json(
        { error: "Patient not found." },
        { status: 404 }
      );
    }

    const patientId = Number(pRows[0].id);

    // 2) Create visit
    const [visitIns] = await conn.execute<ResultSetHeader>(
      `
      INSERT INTO visits (patient_id, organization_id, branch_id, doctor_id, visit_date)
      VALUES (:patient_id, :org, :branch, :doctor_id, :visit_date)
      `,
      {
        patient_id: patientId,
        org: orgId,
        branch: branchId,
        doctor_id: doctorId,
        visit_date: visitDate,
      }
    );

    const visitId = Number(visitIns.insertId);

    // 3) Add to queue for today (LOCKED by branch+date)
    const [tokenRows] = await conn.execute<MaxTokenRow[]>(
      `
      SELECT COALESCE(MAX(q.token_no), 0) AS max_token
      FROM queue_entries q
      JOIN visits v ON v.id = q.visit_id
      WHERE v.branch_id = :branch
        AND v.visit_date = CURDATE()
      FOR UPDATE
      `,
      { branch: branchId }
    );

    const nextToken = Number(tokenRows[0]?.max_token ?? 0) + 1;

    await conn.execute(
      `INSERT INTO queue_entries (visit_id, token_no, status)
       VALUES (:visit_id, :token_no, 'WAITING')`,
      { visit_id: visitId, token_no: nextToken }
    );

    await conn.commit();

    return NextResponse.json({
      ok: true,
      visitId,
      visitDate,
      tokenNo: nextToken,
      patientCode: code,
    });
  } catch (e) {
    await conn.rollback();
    console.error("❌ Failed to create new visit:", e);
    return NextResponse.json(
      { error: "Failed to create new visit." },
      { status: 500 }
    );
  } finally {
    conn.release();
  }
}
