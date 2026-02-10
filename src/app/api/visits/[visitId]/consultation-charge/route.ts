import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

type SvcRow = RowDataPacket & { id: number };
type HdrRow = RowDataPacket & {
  visit_id: number;
  visit_date: string;
  patient_code: string;
  patient_name: string;
  doctor_name: string | null;
};
type ChargeRow = RowDataPacket & {
  gross: number;
  discount: number;
  net: number;
};
type PaidRow = RowDataPacket & { paid: number };

function mustBeReceptionOrAdmin(me: { roles?: string[] } | null) {
  const roles = me?.roles ?? [];
  return (
    roles.includes("RECEPTION") ||
    roles.includes("ADMIN") ||
    roles.includes("SUPER_ADMIN")
  );
}

export async function GET(
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

  const conn = await db.getConnection();
  try {
    const orgId = Number(me.organizationId);
    const branchId = Number(me.branchId);

    const [svc] = await conn.execute<SvcRow[]>(
      `SELECT id FROM services WHERE organization_id = :org_id AND code='CONSULTATION' AND is_active=1 LIMIT 1`,
      { org_id: orgId }
    );
    if (svc.length === 0)
      return NextResponse.json(
        { error: "CONSULTATION service not configured." },
        { status: 400 }
      );

    const serviceId = Number(svc[0].id);

    const [hdr] = await conn.execute<HdrRow[]>(
      `
      SELECT
        v.id AS visit_id,
        v.visit_date,
        p.patient_code,
        p.full_name AS patient_name,
        d.full_name AS doctor_name
      FROM visits v
      JOIN patients p ON p.id = v.patient_id
      LEFT JOIN doctors d ON d.id = v.doctor_id
      WHERE v.id = :visit_id
        AND v.organization_id = :org_id
        AND v.branch_id = :branch_id
      LIMIT 1
      `,
      { visit_id, org_id: orgId, branch_id: branchId }
    );
    if (hdr.length === 0)
      return NextResponse.json({ error: "Visit not found." }, { status: 404 });

    const [chargeRows] = await conn.execute<ChargeRow[]>(
      `
      SELECT
        COALESCE(SUM(gross_amount),0) AS gross,
        COALESCE(SUM(discount_amount),0) AS discount,
        COALESCE(SUM(net_amount),0) AS net
      FROM visit_charges
      WHERE visit_id = :visit_id AND service_id = :service_id
      `,
      { visit_id, service_id: serviceId }
    );

    const gross = Number(chargeRows[0]?.gross ?? 0);
    const discount = Number(chargeRows[0]?.discount ?? 0);
    const net = Number(chargeRows[0]?.net ?? 0);

    const [paidRows] = await conn.execute<PaidRow[]>(
      `
      SELECT COALESCE(SUM(pa.amount),0) AS paid
      FROM payment_allocations pa
      WHERE pa.visit_id = :visit_id AND pa.service_id = :service_id
      `,
      { visit_id, service_id: serviceId }
    );
    const paid = Number(paidRows[0]?.paid ?? 0);
    const pending = Math.max(0, net - paid);

    return NextResponse.json({
      ok: true,
      visit: {
        visitId: Number(hdr[0].visit_id),
        visitDate: String(hdr[0].visit_date),
        patientCode: String(hdr[0].patient_code),
        patientName: String(hdr[0].patient_name),
        doctorName: hdr[0].doctor_name ? String(hdr[0].doctor_name) : null,
      },
      charge: { gross, discount, net, paid, pending },
    });
  } catch (e) {
    console.error("❌ consultation-charge GET failed:", e);
    return NextResponse.json(
      { error: "Failed to load consultation charge." },
      { status: 500 }
    );
  } finally {
    conn.release();
  }
}
