import { NextResponse } from "next/server";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

type Ctx = { params: Promise<{ patientCode: string }> };

type PatientIdRow = RowDataPacket & { id: number };
type VisitRow = RowDataPacket & { id: number; doctor_id: number | null };
type QueueRow = RowDataPacket & {
  id: number;
  token_no: number;
  status: string;
};
type MaxTokenRow = RowDataPacket & { max_token: number };

function canOpenVisit(me: { roles: string[] }) {
  // allow reception to create token if needed
  return (
    me.roles.includes("DOCTOR") ||
    me.roles.includes("RECEPTION") ||
    me.roles.includes("ADMIN") ||
    me.roles.includes("SUPER_ADMIN")
  );
}

export async function POST(_req: Request, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canOpenVisit(me))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const orgId = Number(me.organizationId);
  const branchId = Number(me.branchId);
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

  const { patientCode } = await ctx.params;
  const code = String(patientCode ?? "").trim();
  if (!code)
    return NextResponse.json(
      { error: "Invalid patient code." },
      { status: 400 }
    );

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [pRows] = await conn.execute<PatientIdRow[]>(
      `SELECT id FROM patients WHERE patient_code = :code LIMIT 1`,
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

    // 1) Find today's visit (idempotent)
    const [vRows] = await conn.execute<VisitRow[]>(
      `
      SELECT id, doctor_id
      FROM visits
      WHERE patient_id = :pid
        AND organization_id = :org
        AND branch_id = :branch
        AND visit_date = CURDATE()
      LIMIT 1
      FOR UPDATE
      `,
      { pid: patientId, org: orgId, branch: branchId }
    );

    let visitId: number;
    let doctorId: number | null = vRows.length
      ? vRows[0].doctor_id != null
        ? Number(vRows[0].doctor_id)
        : null
      : null;

    if (vRows.length === 0) {
      const [ins] = await conn.execute<ResultSetHeader>(
        `
        INSERT INTO visits (patient_id, organization_id, branch_id, doctor_id, visit_date)
        VALUES (:pid, :org, :branch, :doctor_id, CURDATE())
        `,
        {
          pid: patientId,
          org: orgId,
          branch: branchId,
          doctor_id: me.doctorId ?? null,
        }
      );
      visitId = Number(ins.insertId);
      doctorId = me.doctorId ?? null;
    } else {
      visitId = Number(vRows[0].id);

      // assign doctor if caller is doctor and visit doesn't have doctor yet
      if (!doctorId && me.doctorId) {
        await conn.execute(
          `UPDATE visits SET doctor_id = :doc WHERE id = :vid LIMIT 1`,
          { doc: me.doctorId, vid: visitId }
        );
        doctorId = me.doctorId;
      }
    }

    // 2) Ensure queue entry exists
    const [qRows] = await conn.execute<QueueRow[]>(
      `SELECT id, token_no, status FROM queue_entries WHERE visit_id = :vid LIMIT 1`,
      { vid: visitId }
    );

    let tokenNo: number | null = null;
    let queueStatus: string | null = null;

    if (qRows.length) {
      tokenNo = Number(qRows[0].token_no);
      queueStatus = String(qRows[0].status);
    } else {
      // lock token generation per branch+date
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
        `INSERT INTO queue_entries (visit_id, token_no, status) VALUES (:vid, :token, 'WAITING')`,
        { vid: visitId, token: nextToken }
      );

      tokenNo = nextToken;
      queueStatus = "WAITING";
    }

    await conn.commit();

    return NextResponse.json({
      ok: true,
      visitId,
      tokenNo,
      queueStatus,
      doctorId,
      patientCode: code,
      visitDate: new Date().toISOString().slice(0, 10),
    });
  } catch (e) {
    await conn.rollback();
    console.error("❌ open-visit failed:", e);
    return NextResponse.json(
      { error: "Failed to open visit." },
      { status: 500 }
    );
  } finally {
    conn.release();
  }
}
