// src/app/api/reception/payments/collect/route.ts
import { NextResponse } from "next/server";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

type ModeRow = RowDataPacket & { code: string };
type VisitRow = RowDataPacket & {
  status: string;
  organization_id: number;
  branch_id: number;
};
type ServiceRow = RowDataPacket & { id: number };
type NetRow = RowDataPacket & { net: number };
type PaidRow = RowDataPacket & { paid: number };
type MeWithId = { id?: number | string } & Record<string, unknown>;

function getUserId(me: unknown): number | null {
  const m = me as MeWithId;
  const n = Number(m.id);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const allowed =
    me.roles.includes("RECEPTION") ||
    me.roles.includes("ADMIN") ||
    me.roles.includes("SUPER_ADMIN");

  if (!allowed)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json()) as {
    visitId?: number;
    amount?: number;
    paymentMode?: string;
    note?: string;

    // Optional future: allow collecting for other services later
    serviceCode?: string; // default CONSULTATION
  };

  const visitId = Number(body.visitId || 0);
  const amountReq = Number(body.amount || 0);
  const paymentModeCode = (body.paymentMode || "").trim();
  const note = body.note?.trim() || null;
  const serviceCode = (body.serviceCode || "CONSULTATION").trim();

  if (!Number.isFinite(visitId) || visitId <= 0)
    return NextResponse.json(
      { error: "visitId is required." },
      { status: 400 }
    );

  if (!Number.isFinite(amountReq) || amountReq <= 0)
    return NextResponse.json(
      { error: "Amount must be greater than zero." },
      { status: 400 }
    );

  if (!paymentModeCode)
    return NextResponse.json(
      { error: "Payment mode is required." },
      { status: 400 }
    );

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // 1) Validate visit + scope
    const [visitRows] = await conn.execute<VisitRow[]>(
      `SELECT status, organization_id, branch_id
       FROM visits
       WHERE id = :visit_id
       LIMIT 1
       FOR UPDATE`,
      { visit_id: visitId }
    );

    if (visitRows.length === 0) {
      await conn.rollback();
      return NextResponse.json({ error: "Invalid visit." }, { status: 400 });
    }

    const v = visitRows[0];
    if (
      Number(v.organization_id) !== Number(me.organizationId) ||
      Number(v.branch_id) !== Number(me.branchId)
    ) {
      await conn.rollback();
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    if (v.status === "CANCELLED" || v.status === "NO_SHOW") {
      await conn.rollback();
      return NextResponse.json(
        { error: "Cannot collect payment for cancelled/no-show visit." },
        { status: 400 }
      );
    }

    // 2) Validate payment mode
    const [modeRows] = await conn.execute<ModeRow[]>(
      `SELECT code
       FROM payment_modes
       WHERE code = :code AND is_active = 1
       LIMIT 1`,
      { code: paymentModeCode }
    );

    if (modeRows.length === 0) {
      await conn.rollback();
      return NextResponse.json(
        { error: "Invalid or inactive payment mode." },
        { status: 400 }
      );
    }

    // 3) Resolve service_id by code (org-scoped)
    const [svcRows] = await conn.execute<ServiceRow[]>(
      `
      SELECT id
      FROM services
      WHERE organization_id = :org
        AND code = :code
        AND is_active = 1
      LIMIT 1
      FOR UPDATE
      `,
      { org: Number(me.organizationId), code: serviceCode }
    );

    const serviceId = svcRows[0]?.id ?? null;
    if (!serviceId) {
      await conn.rollback();
      return NextResponse.json(
        { error: `Service not found: ${serviceCode}` },
        { status: 400 }
      );
    }

    // 4) Charged (net) from visit_charges
    const [netRows] = await conn.execute<NetRow[]>(
      `
      SELECT COALESCE(SUM(net_amount), 0) AS net
      FROM visit_charges
      WHERE visit_id = :visit_id
        AND service_id = :service_id
      `,
      { visit_id: visitId, service_id: serviceId }
    );
    const net = Number(netRows[0]?.net || 0);

    // 5) Paid so far from allocations (refunds are negative allocations)
    const [paidRows] = await conn.execute<PaidRow[]>(
      `
      SELECT COALESCE(SUM(amount), 0) AS paid
      FROM payment_allocations
      WHERE visit_id = :visit_id
        AND service_id = :service_id
      `,
      { visit_id: visitId, service_id: serviceId }
    );
    const paid = Number(paidRows[0]?.paid || 0);

    const pending = net - paid;
    if (pending <= 0) {
      await conn.rollback();
      return NextResponse.json(
        { error: "No pending amount." },
        { status: 400 }
      );
    }

    const amount = clamp(amountReq, 0, pending);
    if (amount <= 0) {
      await conn.rollback();
      return NextResponse.json(
        { error: "Amount must be greater than zero." },
        { status: 400 }
      );
    }

    // 6) Insert payment ledger row
    const [payIns] = await conn.execute<ResultSetHeader>(
      `
      INSERT INTO payments (
        visit_id,
        service_id,
        amount,
        payment_mode_code,
        pay_status,
        direction,
        note,
        created_by
      )
      VALUES (
        :visit_id,
        :service_id,
        :amount,
        :mode,
        'ACCEPTED',
        'PAYMENT',
        :note,
        :created_by
      )
      `,
      {
        visit_id: visitId,
        service_id: serviceId,
        amount,
        mode: paymentModeCode,
        note,
        created_by: getUserId(me),
      }
    );

    const paymentId = payIns.insertId;

    // 7) Allocate (+amount)
    await conn.execute(
      `
      INSERT INTO payment_allocations (
        payment_id,
        visit_id,
        service_id,
        amount
      )
      VALUES (
        :payment_id,
        :visit_id,
        :service_id,
        :amount
      )
      `,
      {
        payment_id: paymentId,
        visit_id: visitId,
        service_id: serviceId,
        amount,
      }
    );

    await conn.commit();

    return NextResponse.json({
      ok: true,
      visitId,
      serviceCode,
      paidAmount: amount,
      remainingAmount: pending - amount,
    });
  } catch (e) {
    await conn.rollback();
    console.error("❌ Failed to collect payment:", e);
    return NextResponse.json(
      { error: "Failed to collect payment." },
      { status: 500 }
    );
  } finally {
    conn.release();
  }
}
