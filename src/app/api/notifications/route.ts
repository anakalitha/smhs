import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

type NotificationRow = RowDataPacket & {
  id: number;
  title: string;
  body: string | null;
  severity: string;
  priority: number;
  status: string;
  route: string | null;
  action_label: string | null;
  created_at: string;
};

function normalizeStatus(raw: string | null): string | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  if (s === "unread") return "UNREAD";
  if (s === "read") return "READ";
  if (s === "archived") return "ARCHIVED";
  return null;
}

export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!me.organizationId || !me.branchId) {
    return NextResponse.json(
      { error: "Your account is not linked to organization/branch." },
      { status: 400 }
    );
  }

  const url = new URL(req.url);

  // Default status = UNREAD if not provided/invalid (so SQL+params always match)
  const status = normalizeStatus(url.searchParams.get("status")) ?? "UNREAD";

  const limitRaw = url.searchParams.get("limit");
  // Clamp + force integer
  const limit = Math.max(
    1,
    Math.min(50, Math.trunc(Number(limitRaw ?? 20) || 20))
  );

  const sql = `
    SELECT
      n.id, n.title, n.body, n.severity, n.priority, n.status,
      n.route, n.action_label, n.created_at
    FROM notifications n
    WHERE
      n.organization_id = ?
      AND n.branch_id = ?
      AND n.recipient_user_id = ?
      AND n.status = ?
    ORDER BY n.created_at DESC
    LIMIT ${limit}
  `;

  // NOTE: me.id might be bigint in DB; passing as string is safest if your session stores it as number.
  const params: Array<string | number> = [
    me.organizationId,
    me.branchId,
    String(me.id),
    status,
  ];

  const [rows] = await db.execute<NotificationRow[]>(sql, params);
  return NextResponse.json({ rows });
}
