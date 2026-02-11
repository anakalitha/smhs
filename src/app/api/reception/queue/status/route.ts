// src\app\api\reception\queue\status\route.ts
import { NextResponse } from "next/server";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

type QueueStatus = "WAITING" | "NEXT" | "IN_ROOM" | "COMPLETED";

function isQueueStatus(s: string): s is QueueStatus {
  return (
    s === "WAITING" || s === "NEXT" || s === "IN_ROOM" || s === "COMPLETED"
  );
}

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const allowed =
    me.roles.includes("RECEPTION") ||
    me.roles.includes("ADMIN") ||
    me.roles.includes("SUPER_ADMIN");

  if (!allowed)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!me.organizationId || !me.branchId) {
    return NextResponse.json({ error: "Invalid org/branch." }, { status: 400 });
  }

  const body = (await req.json()) as {
    queueEntryId?: number;
    status?: string;
  };

  const queueEntryId = Number(body.queueEntryId || 0);
  const status = String(body.status || "");

  if (!queueEntryId) {
    return NextResponse.json(
      { error: "queueEntryId is required." },
      { status: 400 }
    );
  }
  if (!isQueueStatus(status)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  // Ensure this queue entry belongs to my org/branch and is for today
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT q.id
     FROM queue_entries q
     JOIN visits v ON v.id = q.visit_id
     WHERE q.id = :qid
       AND v.organization_id = :org
       AND v.branch_id = :branch
       AND v.visit_date = CURDATE()
     LIMIT 1`,
    { qid: queueEntryId, org: me.organizationId, branch: me.branchId }
  );

  if (rows.length === 0) {
    return NextResponse.json(
      { error: "Queue entry not found." },
      { status: 404 }
    );
  }

  await db.execute<ResultSetHeader>(
    `UPDATE queue_entries
     SET status = :status
     WHERE id = :qid`,
    { status, qid: queueEntryId }
  );

  return NextResponse.json({ ok: true });
}
