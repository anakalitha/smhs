import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { db } from "../../../../lib/db";
import { getCurrentUser } from "../../../../lib/session";

type CountRow = RowDataPacket & { cnt: number };

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!me.organizationId || !me.branchId) {
    return NextResponse.json(
      { error: "Your account is not linked to organization/branch." },
      { status: 400 }
    );
  }

  const [rows] = await db.execute<CountRow[]>(
    `
    SELECT COUNT(*) AS cnt
    FROM notifications n
    WHERE
      n.organization_id = ?
      AND n.branch_id = ?
      AND n.recipient_user_id = ?
      AND n.status = 'UNREAD'
    `,
    [me.organizationId, me.branchId, me.id]
  );

  return NextResponse.json({ count: Number(rows?.[0]?.cnt ?? 0) });
}
