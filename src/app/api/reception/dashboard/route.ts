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

  const orgId = Number(me.organizationId);
  const branchId = Number(me.branchId);

  type OpsRow = RowDataPacket & {
    registeredToday: number | null;
    waiting: number | null;
    done: number | null;
  };

  type ServiceRow = RowDataPacket & { id: number };

  type QueueRow = RowDataPacket & {
    queueEntryId: number;
    visitId: number;
    patientDbId: number;
    token: number;
    status: "WAITING" | "NEXT" | "IN_ROOM" | "COMPLETED";
    patientId: string;
    name: string;
    phone: string | null;
    referredBy: string | null;
    doctor: string;
    createdAt: string;
  };

  type PayKpiRow = RowDataPacket & {
    accepted: number | null;
    waived: number | null;
    pending: number | null;
  };

  type PayKpis = { accepted: number; waived: number; pending: number };

  try {
    // 0) Resolve CONSULTATION service_id (org-scoped)
    const [svcRows] = await db.execute<ServiceRow[]>(
      `
      SELECT id
      FROM services
      WHERE organization_id = ?
        AND code = 'CONSULTATION'
        AND is_active = 1
      LIMIT 1
      `,
      [orgId]
    );

    const consultationServiceId = svcRows[0]?.id ?? null;

    // 1) Ops KPIs for today (visit_date)
    const [opsRows] = await db.execute<OpsRow[]>(
      `SELECT
         COUNT(DISTINCT v.id) AS registeredToday,
         COALESCE(SUM(CASE WHEN q.status = 'WAITING' or q.status = 'NEXT' THEN 1 ELSE 0 END), 0) AS waiting,
         COALESCE(SUM(CASE WHEN q.status = 'COMPLETED' THEN 1 ELSE 0 END), 0) AS done
       FROM visits v
       LEFT JOIN queue_entries q ON q.visit_id = v.id
       WHERE v.organization_id = ?
         AND v.branch_id = ?
         AND v.visit_date = CURDATE()`,
      [orgId, branchId]
    );

    const ops = opsRows[0] ?? { registeredToday: 0, waiting: 0, done: 0 };

    // 2) Financial KPIs (consultation only) for today
    let payKpis: PayKpis = { accepted: 0, waived: 0, pending: 0 };

    if (consultationServiceId) {
      const [payRows] = await db.execute<PayKpiRow[]>(
        `
  SELECT
    COALESCE((
      SELECT SUM(p.amount)
      FROM payments p
      JOIN visits v ON v.id = p.visit_id
      WHERE v.organization_id = ?
        AND v.branch_id = ?
        AND p.service_id = ?
        AND p.direction = 'PAYMENT'
        AND p.pay_status = 'ACCEPTED'
        AND p.created_at >= CURDATE()
        AND p.created_at < DATE_ADD(CURDATE(), INTERVAL 1 DAY)
    ), 0) AS accepted,

    COALESCE((
      SELECT SUM(vc.discount_amount)
      FROM visit_charges vc
      JOIN visits v ON v.id = vc.visit_id
      WHERE v.organization_id = ?
        AND v.branch_id = ?
        AND v.visit_date = CURDATE()
        AND vc.service_id = ?
    ), 0) AS waived,

    COALESCE((
      SELECT SUM(GREATEST(vc.net_amount - COALESCE(pa.paid, 0), 0))
      FROM visit_charges vc
      JOIN visits v ON v.id = vc.visit_id
      LEFT JOIN (
        SELECT visit_id, service_id, SUM(amount) AS paid
        FROM payment_allocations
        GROUP BY visit_id, service_id
      ) pa ON pa.visit_id = vc.visit_id AND pa.service_id = vc.service_id
      WHERE v.organization_id = ?
        AND v.branch_id = ?
        AND v.visit_date = CURDATE()
        AND vc.service_id = ?
    ), 0) AS pending
  `,
        [
          orgId,
          branchId,
          consultationServiceId,
          orgId,
          branchId,
          consultationServiceId,
          orgId,
          branchId,
          consultationServiceId,
        ]
      );

      const row = payRows[0];
      if (row) {
        payKpis = {
          accepted: Number(row.accepted ?? 0),
          waived: Number(row.waived ?? 0),
          pending: Number(row.pending ?? 0),
        };
      }
    }

    // 3) Today’s Queue rows (visit_date)
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
       WHERE v.organization_id = ?
         AND v.branch_id = ?
         AND v.visit_date = CURDATE()
       ORDER BY q.token_no`,
      [orgId, branchId]
    );

    return NextResponse.json({
      kpis: {
        registeredToday: Number(ops.registeredToday || 0),
        waiting: Number(ops.waiting || 0),
        done: Number(ops.done || 0),

        accepted: Number(payKpis.accepted || 0),
        pending: Number(payKpis.pending || 0),
        waived: Number(payKpis.waived || 0),
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
