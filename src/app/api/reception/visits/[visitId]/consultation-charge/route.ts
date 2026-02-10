// src/app/api/reception/visits/[visitId]/consultation-charge/route.ts
import { NextResponse } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";

import { db } from "@/lib/db";
import { getCurrentUser, type CurrentUser } from "@/lib/session";

type Ctx = { params: Promise<{ visitId: string }> };

type SvcRow = RowDataPacket & {
  id: number;
  code: string;
  display_name: string;
};

type ChargeRow = RowDataPacket & {
  id: number;
  visit_id: number;
  service_id: number;
  gross_amount: number;
  discount_amount: number;
  net_amount: number;
  note: string | null;
};

type PaidRow = RowDataPacket & { paid_amount: number };

// ✅ NEW: visit meta for pre-fill
type VisitMetaRow = RowDataPacket & {
  patient_name: string;
  patient_phone: string | null;
  referral_id: string | null;
  referral_name: string | null;
};

function isAllowed(me: { roles: string[] }) {
  // Reception needs this; Admin/Super admin too.
  return (
    me.roles.includes("RECEPTION") ||
    me.roles.includes("ADMIN") ||
    me.roles.includes("SUPER_ADMIN")
  );
}

function mustHaveOrgBranch(me: CurrentUser) {
  const orgId = me.organizationId != null ? Number(me.organizationId) : NaN;
  const branchId = me.branchId != null ? Number(me.branchId) : NaN;
  return { orgId, branchId };
}

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}

export async function GET(_req: Request, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAllowed(me))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { orgId, branchId } = mustHaveOrgBranch(me);
  if (!Number.isFinite(orgId) || !Number.isFinite(branchId)) {
    return NextResponse.json(
      { error: "Your account is not linked to organization/branch." },
      { status: 400 }
    );
  }

  const { visitId } = await ctx.params;
  const vid = Number(visitId);
  if (!Number.isFinite(vid) || vid <= 0) {
    return NextResponse.json({ error: "Invalid visit id." }, { status: 400 });
  }

  // Resolve consultation service id (org-scoped)
  const [svcRows] = await db.execute<SvcRow[]>(
    `
    SELECT id, code, display_name
    FROM services
    WHERE organization_id = :org
      AND code = 'CONSULTATION'
      AND is_active = 1
    LIMIT 1
    `,
    { org: orgId }
  );

  if (svcRows.length === 0) {
    return NextResponse.json(
      { error: "Consultation service not configured." },
      { status: 400 }
    );
  }

  const svc = svcRows[0];
  const consultationServiceId = Number(svc.id);

  // ✅ Ensure visit belongs to org/branch + fetch patient/referral info for prefill
  const [vRows] = await db.execute<VisitMetaRow[]>(
    `
  SELECT
    p.full_name AS patient_name,
    p.phone AS patient_phone,
    v.referralperson_id AS referral_id,
    rp.name AS referral_name
  FROM visits v
  JOIN patients p ON p.id = v.patient_id
  LEFT JOIN referralperson rp ON rp.id = v.referralperson_id
  WHERE v.id = ?
    AND v.organization_id = ?
    AND v.branch_id = ?
  LIMIT 1
  `,
    [vid, orgId, branchId]
  );

  if (vRows.length === 0) {
    return NextResponse.json({ error: "Visit not found." }, { status: 404 });
  }

  const meta = vRows[0];

  // Charge row
  const [cRows] = await db.execute<ChargeRow[]>(
    `
    SELECT
      vc.id,
      vc.visit_id,
      vc.service_id,
      vc.gross_amount,
      vc.discount_amount,
      vc.net_amount,
      vc.note
    FROM visit_charges vc
    WHERE vc.visit_id = :vid
      AND vc.service_id = :sid
    LIMIT 1
    `,
    { vid, sid: consultationServiceId }
  );

  if (cRows.length === 0) {
    return NextResponse.json(
      { error: "Consultation charge row not found for this visit." },
      { status: 404 }
    );
  }

  const charge = cRows[0];

  // Paid (allocations already include refunds as negative in your implementation)
  const [paidRows] = await db.execute<PaidRow[]>(
    `
    SELECT COALESCE(SUM(pa.amount), 0) AS paid_amount
    FROM payment_allocations pa
    WHERE pa.visit_id = :vid
      AND pa.service_id = :sid
    `,
    { vid, sid: consultationServiceId }
  );

  const paidAmount = Number(paidRows?.[0]?.paid_amount ?? 0);
  const pendingAmount = clamp(
    Number(charge.net_amount) - paidAmount,
    0,
    Number(charge.net_amount)
  );

  return NextResponse.json({
    ok: true,

    // ✅ NEW: prefill data for Edit Visit Data modal
    visit: {
      patientName: meta.patient_name,
      patientPhone: meta.patient_phone,
      referredById: meta.referral_id,
      referredBy: meta.referral_name,
    },

    charge: {
      visitId: Number(charge.visit_id),
      serviceId: Number(charge.service_id),
      serviceCode: svc.code,
      serviceName: svc.display_name,
      grossAmount: Number(charge.gross_amount),
      discountAmount: Number(charge.discount_amount),
      netAmount: Number(charge.net_amount),
      paidAmount,
      pendingAmount,
      note: charge.note ?? null,
    },
  });
}

export async function POST(req: Request, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAllowed(me))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { orgId, branchId } = mustHaveOrgBranch(me);
  if (!Number.isFinite(orgId) || !Number.isFinite(branchId)) {
    return NextResponse.json(
      { error: "Your account is not linked to organization/branch." },
      { status: 400 }
    );
  }

  const { visitId } = await ctx.params;
  const vid = Number(visitId);
  if (!Number.isFinite(vid) || vid <= 0) {
    return NextResponse.json({ error: "Invalid visit id." }, { status: 400 });
  }

  const body = (await req.json()) as {
    discountAmount?: number | string;
    note?: string | null;
  };

  const discountReq =
    typeof body.discountAmount === "string"
      ? Number(body.discountAmount)
      : Number(body.discountAmount ?? 0);

  if (!Number.isFinite(discountReq) || discountReq < 0) {
    return NextResponse.json(
      { error: "Invalid discount amount." },
      { status: 400 }
    );
  }

  const note =
    body.note != null ? String(body.note).trim().slice(0, 255) : null;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Resolve consultation service id
    const [svcRows] = await conn.execute<SvcRow[]>(
      `
      SELECT id, code, display_name
      FROM services
      WHERE organization_id = :org
        AND code = 'CONSULTATION'
        AND is_active = 1
      LIMIT 1
      FOR UPDATE
      `,
      { org: orgId }
    );

    if (svcRows.length === 0) {
      await conn.rollback();
      return NextResponse.json(
        { error: "Consultation service not configured." },
        { status: 400 }
      );
    }

    const consultationServiceId = Number(svcRows[0].id);

    // Ensure visit belongs to org/branch
    const [vRows] = await conn.execute<RowDataPacket[]>(
      `
      SELECT id
      FROM visits
      WHERE id = :vid
        AND organization_id = :org
        AND branch_id = :branch
      LIMIT 1
      FOR UPDATE
      `,
      { vid, org: orgId, branch: branchId }
    );

    if (vRows.length === 0) {
      await conn.rollback();
      return NextResponse.json({ error: "Visit not found." }, { status: 404 });
    }

    // Lock charge row
    const [cRows] = await conn.execute<ChargeRow[]>(
      `
      SELECT
        vc.id,
        vc.gross_amount,
        vc.discount_amount,
        vc.net_amount
      FROM visit_charges vc
      WHERE vc.visit_id = :vid
        AND vc.service_id = :sid
      LIMIT 1
      FOR UPDATE
      `,
      { vid, sid: consultationServiceId }
    );

    if (cRows.length === 0) {
      await conn.rollback();
      return NextResponse.json(
        { error: "Consultation charge row not found for this visit." },
        { status: 404 }
      );
    }

    const charge = cRows[0];
    const gross = Number(charge.gross_amount ?? 0);
    const discount = clamp(discountReq, 0, gross);
    const net = clamp(gross - discount, 0, gross);

    // Update visit_charges (net must match check constraint)
    await conn.execute<ResultSetHeader>(
      `
      UPDATE visit_charges
      SET
        discount_amount = :discount,
        net_amount = :net,
        note = :note,
        updated_at = NOW()
      WHERE id = :id
      `,
      { discount, net, note, id: charge.id }
    );

    await conn.commit();
    return NextResponse.json({ ok: true });
  } catch (e) {
    await conn.rollback();
    console.error("❌ Failed to update consultation charge:", e);
    return NextResponse.json(
      { error: "Failed to update charge." },
      { status: 500 }
    );
  } finally {
    conn.release();
  }
}
