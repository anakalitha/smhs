import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

type PaymentRow = RowDataPacket & {
  id: number;
  visit_id: number;
  fee_type: "CONSULTATION" | "SCAN" | "PAP_SMEAR" | "CTG" | "PHARMACY";
  base_amount: number;
  amount: number;
  pay_status: "ACCEPTED" | "PENDING" | "WAIVED";
};

type VisitCheck = RowDataPacket & { id: number };

type AdjustmentType =
  | "WAIVE"
  | "DISCOUNT_PERCENT"
  | "DISCOUNT_AMOUNT"
  | "SET_AMOUNT";

type ReqBody = {
  reason: string;
  authorizedByDoctorId?: number | null;
  items: Array<{
    paymentId: number;
    feeType: PaymentRow["fee_type"];
    adjustmentType: AdjustmentType;
    // final amount after adjustment (must be provided by UI)
    adjustedAmount: number;
    // optional: percent or discount amount (for audit)
    discountValue?: number | null;
  }>;
};

export async function POST(
  req: Request,
  context: { params: Promise<{ visitId: string }> }
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const allowed =
    me.roles.includes("RECEPTION") ||
    me.roles.includes("ADMIN") ||
    me.roles.includes("SUPER_ADMIN"); // receptionist will do this
  if (!allowed)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!me.organizationId || !me.branchId) {
    return NextResponse.json({ error: "Invalid org/branch." }, { status: 400 });
  }

  const { visitId } = await context.params;
  const id = Number(visitId);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid visitId." }, { status: 400 });
  }

  const body = (await req.json()) as ReqBody;

  const reason = (body.reason || "").trim();
  if (!reason) {
    return NextResponse.json({ error: "Reason is required." }, { status: 400 });
  }

  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) {
    return NextResponse.json(
      { error: "No fee items provided." },
      { status: 400 }
    );
  }

  // Basic sanity
  for (const it of items) {
    const a = Number(it.adjustedAmount);
    if (!Number.isFinite(a) || a < 0) {
      return NextResponse.json(
        { error: "Adjusted amount must be >= 0." },
        { status: 400 }
      );
    }
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Confirm visit belongs to org/branch
    const [vrows] = await conn.execute<VisitCheck[]>(
      `
      SELECT v.id
      FROM visits v
      WHERE v.id = :visitId
        AND v.organization_id = :org
        AND v.branch_id = :branch
      LIMIT 1
      `,
      { visitId, org: me.organizationId, branch: me.branchId }
    );

    if (vrows.length === 0) {
      await conn.rollback();
      return NextResponse.json({ error: "Visit not found." }, { status: 404 });
    }

    const updated: Array<{
      paymentId: number;
      feeType: string;
      amount: number;
      payStatus: string;
    }> = [];

    for (const it of items) {
      const paymentId = Number(it.paymentId);
      if (!Number.isFinite(paymentId) || paymentId <= 0) {
        await conn.rollback();
        return NextResponse.json(
          { error: "Invalid paymentId." },
          { status: 400 }
        );
      }

      // Lock payment row
      const [payRows] = await conn.execute<PaymentRow[]>(
        `
        SELECT id, visit_id, fee_type, base_amount, amount, pay_status
        FROM payments
        WHERE id = :pid
          AND visit_id = :visitId
        FOR UPDATE
        `,
        { pid: paymentId, visitId }
      );

      if (payRows.length === 0) {
        await conn.rollback();
        return NextResponse.json(
          { error: `Payment not found for visit (paymentId: ${paymentId}).` },
          { status: 404 }
        );
      }

      const pay = payRows[0];

      // Validate feeType matches (avoid tampering)
      if (pay.fee_type !== it.feeType) {
        await conn.rollback();
        return NextResponse.json(
          { error: `Fee type mismatch for paymentId ${paymentId}.` },
          { status: 400 }
        );
      }

      const adjustedAmount = Number(it.adjustedAmount);
      const baseAmount = Number(pay.base_amount ?? 0);
      const previousAmount = Number(pay.amount ?? 0);

      // Hard rule: adjusted cannot exceed base (you can relax later)
      if (adjustedAmount > baseAmount) {
        await conn.rollback();
        return NextResponse.json(
          {
            error: `Adjusted amount cannot exceed base amount for ${it.feeType}.`,
          },
          { status: 400 }
        );
      }

      // Insert audit record
      await conn.execute(
        `
        INSERT INTO fee_adjustments (
          visit_id,
          payment_id,
          fee_type,
          base_amount,
          previous_amount,
          adjusted_amount,
          adjustment_type,
          discount_value,
          reason,
          authorized_by_doctor_id,
          applied_by_user_id
        ) VALUES (
          :visit_id,
          :payment_id,
          :fee_type,
          :base_amount,
          :previous_amount,
          :adjusted_amount,
          :adjustment_type,
          :discount_value,
          :reason,
          :authorized_by_doctor_id,
          :applied_by_user_id
        )
        `,
        {
          visit_id: visitId,
          payment_id: paymentId,
          fee_type: it.feeType,
          base_amount: baseAmount,
          previous_amount: previousAmount,
          adjusted_amount: adjustedAmount,
          adjustment_type: it.adjustmentType,
          discount_value: it.discountValue ?? null,
          reason,
          authorized_by_doctor_id: body.authorizedByDoctorId ?? null,
          applied_by_user_id: me.id,
        }
      );

      // Update payment row
      const newStatus = adjustedAmount === 0 ? "WAIVED" : pay.pay_status; // keep ACCEPTED/PENDING as-is
      await conn.execute(
        `
        UPDATE payments
        SET amount = :amount,
            pay_status = :status
        WHERE id = :pid
        `,
        { amount: adjustedAmount, status: newStatus, pid: paymentId }
      );

      updated.push({
        paymentId,
        feeType: it.feeType,
        amount: adjustedAmount,
        payStatus: newStatus,
      });
    }

    await conn.commit();

    return NextResponse.json({
      ok: true,
      visitId,
      updatedFees: updated,
    });
  } catch (e) {
    await conn.rollback();
    console.error("❌ fee adjust failed:", e);
    return NextResponse.json(
      { error: "Failed to adjust fees." },
      { status: 500 }
    );
  } finally {
    conn.release();
  }
}
