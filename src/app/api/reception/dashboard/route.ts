// src/app/api/reception/dashboard/route.ts
import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const allowed =
    me.roles.includes("RECEPTION") ||
    me.roles.includes("ADMIN") ||
    me.roles.includes("SUPER_ADMIN");

  if (!allowed)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!me.organizationId || !me.branchId) {
    return NextResponse.json({ error: "Invalid org/branch." }, { status: 400 });
  }

  const orgId = me.organizationId;
  const branchId = me.branchId;

  type OpsRow = RowDataPacket & {
    registeredToday: number | null;
    waiting: number | null;
    done: number | null;
  };

  type PayRow = RowDataPacket & {
    accepted: number | null;
    pending: number | null;
    waived: number | null;
  };

  type QueueRow = RowDataPacket & {
    queueEntryId: number;
    token: number;
    status: "WAITING" | "NEXT" | "IN_ROOM" | "DONE";
    patientId: string;
    name: string;
    phone: string | null;
    referredBy: string | null;
    doctor: string;
    createdAt: string;
  };

  try {
    // Ops KPIs for today (visit_date)
    const [opsRows] = await db.execute<OpsRow[]>(
      `SELECT
         COUNT(DISTINCT v.id) AS registeredToday,
         COALESCE(SUM(CASE WHEN q.status = 'WAITING' THEN 1 ELSE 0 END), 0) AS waiting,
         COALESCE(SUM(CASE WHEN q.status = 'DONE' THEN 1 ELSE 0 END), 0) AS done
       FROM visits v
       LEFT JOIN queue_entries q ON q.visit_id = v.id
       WHERE v.organization_id = :org
         AND v.branch_id = :branch
         AND v.visit_date = CURDATE()`,
      { org: orgId, branch: branchId }
    );

    const ops = opsRows[0] ?? { registeredToday: 0, waiting: 0, done: 0 };

    // Financial KPIs for today (payment timestamp)
    const [payRows] = await db.execute<PayRow[]>(
      `SELECT
         COALESCE(SUM(CASE WHEN p.pay_status = 'ACCEPTED' THEN p.amount ELSE 0 END), 0) AS accepted,
         COALESCE(SUM(CASE WHEN p.pay_status = 'PENDING' THEN p.amount ELSE 0 END), 0) AS pending,
         COALESCE(SUM(CASE WHEN p.pay_status = 'WAIVED' THEN p.amount ELSE 0 END), 0) AS waived
       FROM payments p
       JOIN visits v ON v.id = p.visit_id
       WHERE v.organization_id = :org
         AND v.branch_id = :branch
         AND p.fee_type = 'CONSULTATION'
         AND p.created_at >= CURDATE()
         AND p.created_at < DATE_ADD(CURDATE(), INTERVAL 1 DAY)`,
      { org: orgId, branch: branchId }
    );

    const pay = payRows[0] ?? { accepted: 0, pending: 0, waived: 0 };

    // Today’s Queue rows (visit_date)
    const [queueRows] = await db.execute<QueueRow[]>(
      `SELECT
         q.id AS queueEntryId,
         v.id AS visitId,
         p.id AS patientDbId,
         q.token_no AS token,
         q.status AS status,
         p.patient_code AS patientId,
         p.full_name AS name,
         p.phone AS phone,
         rp.name AS referredBy,
         d.full_name AS doctor,
         q.created_at AS createdAt
       FROM queue_entries q
       JOIN visits v ON v.id = q.visit_id
       JOIN patients p ON p.id = v.patient_id
       JOIN doctors d ON d.id = v.doctor_id
       LEFT JOIN referralperson rp ON rp.id = v.referralperson_id
       WHERE v.organization_id = :org
         AND v.branch_id = :branch
         AND v.visit_date = CURDATE()
       ORDER BY q.token_no DESC`,
      { org: orgId, branch: branchId }
    );

    return NextResponse.json({
      kpis: {
        registeredToday: Number(ops.registeredToday || 0),
        waiting: Number(ops.waiting || 0),
        done: Number(ops.done || 0),
        accepted: Number(pay.accepted || 0),
        pending: Number(pay.pending || 0),
        waived: Number(pay.waived || 0),
      },
      todaysQueue: queueRows.map((r) => ({
        queueEntryId: Number(r.queueEntryId),
        visitId: Number(r.visitId),
        patientDbId: Number(r.patientDbId),
        token: Number(r.token),
        status: r.status,
        patientId: r.patientId,
        name: r.name,
        phone: r.phone ?? "",
        referredBy: r.referredBy ?? "—",
        doctor: r.doctor,
        createdAt: r.createdAt,
      })),
    });
  } catch (e: unknown) {
    console.error("Failed to load reception dashboard:", e);
    return NextResponse.json(
      { error: "Failed to load dashboard." },
      { status: 500 }
    );
  }
}
