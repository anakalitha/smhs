import { NextResponse } from "next/server";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

type SvcRow = RowDataPacket & { id: number };
type PaidRow = RowDataPacket & { paid: number };
type ExistingRow = RowDataPacket & { id: number };

function mustBeReceptionOrAdmin(me: { roles?: string[] } | null) {
  const roles = me?.roles ?? [];
  return (
    roles.includes("RECEPTION") ||
    roles.includes("ADMIN") ||
    roles.includes("SUPER_ADMIN")
  );
}

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ visitId: string }> }
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!mustBeReceptionOrAdmin(me))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!me.organizationId || !me.branchId) {
    return NextResponse.json(
      { error: "Your account is not linked to organization/branch." },
      { status: 400 }
    );
  }

  const { visitId } = await ctx.params;
  const visit_id = Number(visitId || 0);
  if (!visit_id)
    return NextResponse.json({ error: "Invalid visitId." }, { status: 400 });

  const body = (await req.json()) as {
    gross?: number;
    discount?: number;
    reason?: string;
  };

  const grossReq = Number(body.gross ?? NaN);
  const discountReq = Number(body.discount ?? NaN);
  const reason = String(body.reason || "").trim();

  if (!reason)
    return NextResponse.json({ error: "Reason is required." }, { status: 400 });

  if (!Number.isFinite(grossReq) || grossReq < 0)
    return NextResponse.json(
      { error: "Invalid gross amount." },
      { status: 400 }
    );

  if (!Number.isFinite(discountReq) || discountReq < 0)
    return NextResponse.json(
      { error: "Invalid discount amount." },
      { status: 400 }
    );

  const gross = grossReq;
  const discount = clamp(discountReq, 0, gross);
  const net = gross - discount;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const orgId = Number(me.organizationId);
    const branchId = Number(me.branchId);

    // Resolve CONSULTATION service
    const [svc] = await conn.execute<SvcRow[]>(
      `SELECT id FROM services WHERE organization_id = :org_id AND code='CONSULTATION' AND is_active=1 LIMIT 1`,
      { org_id: orgId }
    );
    if (svc.length === 0) {
      await conn.rollback();
      return NextResponse.json(
        { error: "CONSULTATION service not configured." },
        { status: 400 }
      );
    }
    const serviceId = Number(svc[0].id);

    // Ensure visit belongs to org+branch
    const [vRows] = await conn.execute<RowDataPacket[]>(
      `SELECT id FROM visits WHERE id=:visit_id AND organization_id=:org_id AND branch_id=:branch_id LIMIT 1 FOR UPDATE`,
      { visit_id, org_id: orgId, branch_id: branchId }
    );
    if (vRows.length === 0) {
      await conn.rollback();
      return NextResponse.json({ error: "Visit not found." }, { status: 404 });
    }

    // Paid so far (allocations are + for payments, - for refunds)
    const [paidRows] = await conn.execute<PaidRow[]>(
      `
      SELECT COALESCE(SUM(pa.amount),0) AS paid
      FROM payment_allocations pa
      WHERE pa.visit_id = :visit_id AND pa.service_id = :service_id
      FOR UPDATE
      `,
      { visit_id, service_id: serviceId }
    );
    const paid = Number(paidRows[0]?.paid ?? 0);

    if (net < paid) {
      await conn.rollback();
      return NextResponse.json(
        {
          error: `Cannot reduce net below paid amount. Paid=${paid}, NewNet=${net}. Refund first, then adjust.`,
          paid,
          newNet: net,
          refundRequired: paid - net,
        },
        { status: 400 }
      );
    }

    // If there are multiple consultation rows, we normalize to ONE row:
    // lock and delete all existing consultation charges then insert single correct row
    const [existing] = await conn.execute<ExistingRow[]>(
      `
      SELECT id
      FROM visit_charges
      WHERE visit_id = :visit_id AND service_id = :service_id
      FOR UPDATE
      `,
      { visit_id, service_id: serviceId }
    );

    if (existing.length > 0) {
      await conn.execute(
        `DELETE FROM visit_charges WHERE visit_id = :visit_id AND service_id = :service_id`,
        { visit_id, service_id: serviceId }
      );
    }

    await conn.execute<ResultSetHeader>(
      `
      INSERT INTO visit_charges (visit_id, service_id, gross_amount, discount_amount, net_amount)
      VALUES (:visit_id, :service_id, :gross, :discount, :net)
      `,
      { visit_id, service_id: serviceId, gross, discount, net }
    );

    // Note: We are not writing an "audit log" table yet.
    // If you want audit, we can add visit_charge_adjustments table later.
    await conn.commit();

    return NextResponse.json({
      ok: true,
      visitId: visit_id,
      gross,
      discount,
      net,
      paid,
      pending: Math.max(0, net - paid),
      reason,
    });
  } catch (e) {
    await conn.rollback();
    console.error("❌ consultation-charge adjust failed:", e);
    return NextResponse.json(
      { error: "Failed to adjust consultation charge." },
      { status: 500 }
    );
  } finally {
    conn.release();
  }
}
