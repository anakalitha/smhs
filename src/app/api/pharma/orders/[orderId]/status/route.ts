import { NextResponse } from "next/server";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

type Ctx = { params: Promise<{ orderId: string }> };

function allowed(me: { roles: string[] }) {
  return (
    me.roles.includes("PHARMA_IN_CHARGE") ||
    me.roles.includes("ADMIN") ||
    me.roles.includes("SUPER_ADMIN")
  );
}

function normalizeStatus(v: unknown): "PURCHASED" | "NOT_PURCHASED" | null {
  if (typeof v !== "string") return null;
  const s = v.trim().toUpperCase();
  if (s === "PURCHASED" || s === "NOT_PURCHASED") return s;
  return null;
}

export async function POST(req: Request, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!allowed(me)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!me.organizationId || !me.branchId) {
    return NextResponse.json({ error: "Invalid org/branch." }, { status: 400 });
  }

  const { orderId } = await ctx.params;
  const id = Number(orderId);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid orderId." }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const status = normalizeStatus(body?.status);
  if (!status) {
    return NextResponse.json(
      { error: "Invalid status. Use PURCHASED or NOT_PURCHASED." },
      { status: 400 }
    );
  }

  // Verify order belongs to org/branch via visit
  const [rows] = await db.execute<RowDataPacket[]>(
    `
    SELECT po.id
    FROM pharma_orders po
    JOIN visits v ON v.id = po.visit_id
    WHERE po.id = :id
      AND v.organization_id = :org
      AND v.branch_id = :branch
    LIMIT 1
    `,
    { id, org: me.organizationId, branch: me.branchId }
  );

  if (rows.length === 0) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  await db.execute<ResultSetHeader>(
    `
    UPDATE pharma_orders
    SET status = :status,
        updated_by = :by,
        updated_at = NOW()
    WHERE id = :id
    `,
    { status, by: me.id, id }
  );

  return NextResponse.json({ ok: true });
}
