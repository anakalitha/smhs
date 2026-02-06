import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

type NotificationRow = RowDataPacket & {
  id: number;
  title: string;
  body: string | null;
  severity: "info" | "task" | "critical";
  priority: "low" | "normal" | "high" | "critical";
  status: "unread" | "read" | "acted";
  route: string | null;
  action_label: string | null;
  created_at: Date;
};

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
  const status = (url.searchParams.get("status") || "unread").toLowerCase();
  const limit = Math.min(
    parseInt(url.searchParams.get("limit") || "20", 10) || 20,
    50
  );

  const whereStatus = status === "all" ? "" : "AND n.status = ?";

  const params: any[] = [me.organizationId, me.branchId, me.id];
  if (status !== "all") params.push(status);

  params.push(limit);

  const [rows] = await db.execute<NotificationRow[]>(
    `
    SELECT
      n.id, n.title, n.body, n.severity, n.priority, n.status,
      n.route, n.action_label, n.created_at
    FROM notifications n
    WHERE
      n.organization_id = ?
      AND n.branch_id = ?
      AND n.recipient_user_id = ?
      ${whereStatus}
    ORDER BY n.created_at DESC
    LIMIT ?
    `,
    params
  );

  return NextResponse.json({
    items: rows.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      severity: r.severity,
      priority: r.priority,
      status: r.status,
      route: r.route,
      actionLabel: r.action_label,
      createdAt: r.created_at.toISOString(),
    })),
  });
}
