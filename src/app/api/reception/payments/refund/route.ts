// src/app/api/reception/payments/refund/route.ts
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
    paymentModeCode?: string; // allow alias
    note?: string;
    serviceCode?: string; // default CONSULTATION
  };

  const visitId = Number(body.visitId || 0);
  const amountReq = Number(body.amount || 0);

  const paymentModeCode = String(
    (body.paymentModeCode || body.paymentMode || "") ?? ""
  )
    .trim()
    .toUpperCase();

  const note = body.note?.trim() || null;
  const serviceCode = (body.serviceCode || "CONSULTATION").trim().toUpperCase();

  if (!Number.isFinite(visitId) || visitId <= 0)
    return NextResponse.json(
      { error: "visitId is required." },
      { status: 400 }
    );

  if (!Number.isFinite(amountReq) || amountReq <= 0)
    return NextResponse.json(
      { error: "Refund amount must be greater than zero." },
      { status: 400 }
    );

  if (!paymentModeCode)
    return NextResponse.json(
      { error: "Payment mode is required." },
      { status: 400 }
    );

  const orgId = Number(me.organizationId);
  const branchId = Number(me.branchId);
  if (
    !Number.isFinite(orgId) ||
    !Number.isFinite(branchId) ||
    orgId <= 0 ||
    branchId <= 0
  ) {
    return NextResponse.json(
      { error: "Invalid org/branch in session." },
      { status: 400 }
    );
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // 1) Validate visit + scope
    const [visitRows] = await conn.execute<VisitRow[]>(
      `
      SELECT status, organization_id, branch_id
      FROM visits
      WHERE id = ?
      LIMIT 1
      FOR UPDATE
      `,
      [visitId]
    );

    if (visitRows.length === 0) {
      await conn.rollback();
      return NextResponse.json({ error: "Invalid visit." }, { status: 400 });
    }

    const v = visitRows[0];
    if (
      Number(v.organization_id) !== orgId ||
      Number(v.branch_id) !== branchId
    ) {
      await conn.rollback();
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    if (v.status === "CANCELLED" || v.status === "NO_SHOW") {
      await conn.rollback();
      return NextResponse.json(
        { error: "Cannot refund cancelled/no-show visit." },
        { status: 400 }
      );
    }

    // 2) Validate payment mode
    const [modeRows] = await conn.execute<ModeRow[]>(
      `
      SELECT code
      FROM payment_modes
      WHERE code = ? AND is_active = 1
      LIMIT 1
      `,
      [paymentModeCode]
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
      WHERE organization_id = ?
        AND code = ?
        AND is_active = 1
      LIMIT 1
      FOR UPDATE
      `,
      [orgId, serviceCode]
    );

    const serviceId = svcRows[0]?.id ?? null;
    if (!serviceId) {
      await conn.rollback();
      return NextResponse.json(
        { error: `Service not found: ${serviceCode}` },
        { status: 400 }
      );
    }

    // 4) Paid balance so far (allocations sum; refunds already negative)
    const [paidRows] = await conn.execute<PaidRow[]>(
      `
      SELECT COALESCE(SUM(amount), 0) AS paid
      FROM payment_allocations
      WHERE visit_id = ?
        AND service_id = ?
      `,
      [visitId, serviceId]
    );

    const paid = Number(paidRows[0]?.paid || 0);
    if (paid <= 0) {
      await conn.rollback();
      return NextResponse.json(
        { error: "No paid amount available to refund." },
        { status: 400 }
      );
    }

    const amount = clamp(amountReq, 0, paid);
    if (amount <= 0) {
      await conn.rollback();
      return NextResponse.json(
        { error: "Refund amount must be greater than zero." },
        { status: 400 }
      );
    }

    // 5) Insert refund ledger row (payments.amount is positive; direction=REFUND)
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
      VALUES (?, ?, ?, ?, 'ACCEPTED', 'REFUND', ?, ?)
      `,
      [visitId, serviceId, amount, paymentModeCode, note, getUserId(me)]
    );

    const paymentId = Number(payIns.insertId);

    // 6) Allocation is negative for refunds
    await conn.execute<ResultSetHeader>(
      `
      INSERT INTO payment_allocations (
        payment_id,
        visit_id,
        service_id,
        amount
      )
      VALUES (?, ?, ?, ?)
      `,
      [paymentId, visitId, serviceId, -amount]
    );

    await conn.commit();

    return NextResponse.json({
      ok: true,
      paymentId,
      visitId,
      serviceCode,
      refundedAmount: amount,
      remainingPaidBalance: paid - amount,
    });
  } catch (e) {
    await conn.rollback();
    console.error("❌ Failed to refund payment:", e);
    return NextResponse.json(
      { error: "Failed to refund payment." },
      { status: 500 }
    );
  } finally {
    conn.release();
  }
}
