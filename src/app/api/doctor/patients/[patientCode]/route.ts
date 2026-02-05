// src/app/api/doctor/patients/[patientId]/new-visit/route.ts
import { NextResponse } from "next/server";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

type Ctx = { params: Promise<{ patientId: string }> };

type MaxTokenRow = RowDataPacket & { max_token: number };

function todayLocalYYYYMMDD() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
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

export async function POST(_req: Request, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const allowed =
    me.roles.includes("DOCTOR") ||
    me.roles.includes("ADMIN") ||
    me.roles.includes("SUPER_ADMIN");

  if (!allowed)
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

  const { patientId } = await ctx.params;
  const patientCode = String(patientId ?? "").trim();
  if (!patientCode) {
    return NextResponse.json({ error: "Invalid patient id." }, { status: 400 });
  }

  const isAdmin =
    me.roles.includes("ADMIN") || me.roles.includes("SUPER_ADMIN");

  // For now: DOCTOR can create for themselves.
  // Admin flow (choose doctor) can be added later if needed.
  if (isAdmin) {
    return NextResponse.json(
      { error: "New Visit from patient summary is doctor-only for now." },
      { status: 400 }
    );
  }

  const doctorId = await resolveDoctorIdForUser({
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

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // 1) Find patient record
    const [pRows] = await conn.execute<RowDataPacket[]>(
      `
      SELECT id
      FROM patients
      WHERE patient_code = :code
      LIMIT 1
      `,
      { code: patientCode }
    );

    if (pRows.length === 0) {
      await conn.rollback();
      return NextResponse.json(
        { error: "Patient not found." },
        { status: 404 }
      );
    }

    const patientDbId = Number(pRows[0].id);
    const today = todayLocalYYYYMMDD();

    // 2) Create visit
    const [visitIns] = await conn.execute<ResultSetHeader>(
      `
      INSERT INTO visits (
        patient_id,
        organization_id,
        branch_id,
        doctor_id,
        referralperson_id,
        visit_date
      )
      VALUES (
        :patient_id,
        :org,
        :branch,
        :doctor_id,
        NULL,
        :visit_date
      )
      `,
      {
        patient_id: patientDbId,
        org: orgId,
        branch: branchId,
        doctor_id: doctorId,
        visit_date: today,
      }
    );

    const visitId = Number(visitIns.insertId);

    // 3) Create queue entry + token (LOCK)
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
      `
      INSERT INTO queue_entries (visit_id, token_no, status)
      VALUES (:visit_id, :token_no, 'WAITING')
      `,
      { visit_id: visitId, token_no: nextToken }
    );

    await conn.commit();

    return NextResponse.json({
      ok: true,
      visitId,
      patientCode,
      tokenNo: nextToken,
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
