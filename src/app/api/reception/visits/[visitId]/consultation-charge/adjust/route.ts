// src/app/api/visits/[visitId]/consultation-charge/adjust/route.ts
import { NextResponse } from "next/server";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

type Ctx = { params: Promise<{ visitId: string }> };

type ChargeRow = RowDataPacket & {
  id: number;
  service_id: number;
  gross_amount: string | number;
  discount_amount: string | number;
  net_amount: string | number;
};

type PaidRow = RowDataPacket & { paid: string | number | null };

type PaymentModeRow = RowDataPacket & { payment_mode_code: string | null };

type ReqBody = {
  netAmount: number;
  reason: string;
  authorizedByDoctorId?: number | null;
  // Optional: if you want receptionist to explicitly choose refund mode later
  refundModeCode?: string | null;
};

function mustBeReceptionOrAdmin(me: { roles: string[] }) {
  return (
    me.roles.includes("RECEPTION") ||
    me.roles.includes("ADMIN") ||
    me.roles.includes("SUPER_ADMIN")
  );
}

function toMoney(n: unknown) {
  const v = typeof n === "string" ? Number(n) : typeof n === "number" ? n : NaN;
  return Number.isFinite(v) ? v : 0;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}

export async function POST(req: Request, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!mustBeReceptionOrAdmin(me))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { visitId } = await ctx.params;
  const vid = Number(visitId);
  if (!Number.isFinite(vid) || vid <= 0) {
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

  const body = (await req.json().catch(() => null)) as ReqBody | null;
  const netAmount = body?.netAmount;
  const reason = (body?.reason ?? "").trim();
  const authorizedByDoctorId =
    body?.authorizedByDoctorId != null ? Number(body.authorizedByDoctorId) : null;

  if (!Number.isFinite(netAmount) || (netAmount as number) < 0) {
    return NextResponse.json({ error: "Invalid netAmount." }, { status: 400 });
  }
  if (!reason) {
    return NextResponse.json({ error: "Reason is required." }, { status: 400 });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Ensure visit belongs to org/branch
    const [vRows] = await conn.execute<RowDataPacket[]>(
      `
      SELECT id
      FROM visits
      WHERE id = :vid AND organization_id = :org AND branch_id = :branch
      LIMIT 1
      FOR UPDATE
      `,
      { vid, org: orgId, branch: branchId }
    );
    if (vRows.length === 0) {
      await conn.rollback();
      return NextResponse.json({ error: "Visit not found." }, { status: 404 });
    }

    // Lock current charge row
    const [cRows] = await conn.execute<ChargeRow[]>(
      `
      SELECT id, service_id, gross_amount, discount_amount, net_amount
      FROM visit_charges
      WHERE visit_id = :vid
      LIMIT 1
      FOR UPDATE
      `,
      { vid }
    );
    if (cRows.length === 0) {
      await conn.rollback();
      return NextResponse.json(
        { error: "No visit_charges row found for this visit." },
        { status: 400 }
      );
    }

    const charge = cRows[0];
    const serviceId = Number(charge.service_id);
    const oldGross = toMoney(charge.gross_amount);
    const oldDiscount = toMoney(charge.discount_amount);
    const oldNet = toMoney(charge.net_amount);

    const newNet = clamp(Number(netAmount), 0, oldGross);
    const newDiscount = clamp(oldGross - newNet, 0, oldGross);

    // Calculate paid so far (allocations include refunds as negative)
    const [paidRows] = await conn.execute<PaidRow[]>(
      `
      SELECT COALESCE(SUM(pa.amount), 0) AS paid
      FROM payment_allocations pa
      JOIN payments p ON p.id = pa.payment_id
      WHERE pa.visit_id = :vid
        AND pa.service_id = :sid
        AND p.pay_status = 'ACCEPTED'
      `,
      { vid, sid: serviceId }
    );
    const paid = toMoney(paidRows[0]?.paid ?? 0);

    // Update charge
    await conn.execute<ResultSetHeader>(
      `
      UPDATE visit_charges
      SET discount_amount = :discount,
          net_amount = :net,
          updated_at = NOW()
      WHERE id = :id
      `,
      { discount: newDiscount, net: newNet, id: Number(charge.id) }
    );

    // If paid > new net => refund required
    const refundAmount = paid > newNet ? Number((paid - newNet).toFixed(2)) : 0;

    let refundPaymentId: number | null = null;

    if (refundAmount > 0) {
      // Choose refund mode:
      // 1) body.refundModeCode if provided
      // 2) fallback to last PAYMENT mode for this visit+service
      // 3) fallback to CASH
      let refundMode = (body?.refundModeCode ?? "").trim() || null;

      if (!refundMode) {
        const [modeRows] = await conn.execute<PaymentModeRow[]>(
          `
          SELECT p.payment_mode_code
          FROM payments p
          WHERE p.visit_id = :vid
            AND p.service_id = :sid
            AND p.direction = 'PAYMENT'
            AND p.pay_status = 'ACCEPTED'
          ORDER BY p.id DESC
          LIMIT 1
          `,
          { vid, sid: serviceId }
        );
        refundMode = (modeRows[0]?.payment_mode_code ?? null) as string | null;
      }
      if (!refundMode) refundMode = "CASH";

      const [pIns] = await conn.execute<ResultSetHeader>(
        `
        INSERT INTO payments (
          visit_id,
          service_id,
          amount,
          payment_mode_code,
          pay_status,
          direction,
          note,
          created_by,
          paid_at
        )
        VALUES (
          :vid,
          :sid,
          :amount,
          :mode,
          'ACCEPTED',
          'REFUND',
          :note,
          :createdBy,
          NOW()
        )
        `,
        {
          vid,
          sid: serviceId,
          amount: refundAmount,
          mode: refundMode,
          note: `Refund due to fee adjustment: ${reason}`,
          createdBy: me.id ?? null,
        }
      );
      refundPaymentId = Number(pIns.insertId);

      // IMPORTANT: refund must reduce paid total => negative allocation
      await conn.execute<ResultSetHeader>(
        `
        INSERT INTO payment_allocations (payment_id, visit_id, service_id, amount)
        VALUES (:pid, :vid, :sid, :amt)
        `,
        {
          pid: refundPaymentId,
          vid,
          sid: serviceId,
          amt: -refundAmount,
        }
      );
    }

    // Audit row
    await conn.execute<ResultSetHeader>(
      `
      INSERT INTO consultation_charge_adjustments (
        visit_id,
        service_id,
        old_gross_amount,
        old_discount_amount,
        old_net_amount,
        new_discount_amount,
        new_net_amount,
        refund_amount,
        refund_payment_id,
        reason,
        authorized_by_doctor_id,
        created_by
      )
      VALUES (
        :vid,
        :sid,
        :og,
        :od,
        :on,
        :nd,
        :nn,
        :refund,
        :refundPid,
        :reason,
        :authDoc,
        :createdBy
      )
      `,
      {
        vid,
        sid: serviceId,
        og: oldGross,
        od: oldDiscount,
        on: oldNet,
        nd: newDiscount,
        nn: newNet,
        refund: refundAmount,
        refundPid: refundPaymentId,
        reason,
        authDoc: authorizedByDoctorId,
        createdBy: me.id ?? null,
      }
    );

    await conn.commit();

    return NextResponse.json({
      ok: true,
      old: { gross: oldGross, discount: oldDiscount, net: oldNet, paid },
      updated: { discount: newDiscount, net: newNet },
      refund: refundAmount > 0 ? { amount: refundAmount, paymentId: refundPaymentId } : null,
      note:
        refundAmount > 0
          ? "Refund created. Upload signed voucher as a document with category REFUND_VOUCHER."
          : null,
    });
  } catch (e) {
    try {
      await conn.rollback();
    } catch {}
    console.error("❌ consultation-charge adjust failed:", e);
    return NextResponse.json(
      { error: "Failed to adjust consultation charge." },
      { status: 500 }
    );
  } finally {
    conn.release();
  }
}
