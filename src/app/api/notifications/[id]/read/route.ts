// src/app/api/notifications/[id]/read/route.ts
import { NextResponse } from "next/server";
import type { ResultSetHeader } from "mysql2/promise";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

type Ctx = { params: Promise<{ id: string }> };

function parseId(raw: string) {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function POST(_: Request, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!me.organizationId || !me.branchId) {
    return NextResponse.json(
      { error: "Your account is not linked to organization/branch." },
      { status: 400 }
    );
  }

  const { id } = await ctx.params;
  const notificationId = parseId(id);
  if (!notificationId) {
    return NextResponse.json(
      { error: "Invalid notification id." },
      { status: 400 }
    );
  }

  // IMPORTANT: only allow marking as read if it belongs to this user/org/branch
  const [r] = await db.execute<ResultSetHeader>(
    `
    UPDATE notifications n
    SET n.status = 'READ'
    WHERE
      n.id = ?
      AND n.organization_id = ?
      AND n.branch_id = ?
      AND n.recipient_user_id = ?
      AND n.status = 'UNREAD'
    `,
    [notificationId, me.organizationId, me.branchId, me.id]
  );

  return NextResponse.json({
    ok: true,
    changed: Number(r.affectedRows ?? 0) > 0,
  });
}
