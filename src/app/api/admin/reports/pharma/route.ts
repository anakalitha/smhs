import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

type Row = RowDataPacket & {
  dateKey: string;
  doctorName: string;
  pendingCount: number;
  purchasedCount: number;
  notPurchasedCount: number;
};

function isAdmin(me: { roles: string[] }) {
  return me.roles.includes("ADMIN") || me.roles.includes("SUPER_ADMIN");
}

function normalizeGroup(v: string | null) {
  const g = (v || "day").toLowerCase();
  return g === "month" ? "month" : "day";
}

function normalizeDate(v: string | null): string | null {
  if (!v) return null;
  const s = v.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(me)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!me.organizationId || !me.branchId) {
    return NextResponse.json({ error: "Invalid org/branch." }, { status: 400 });
  }

  const url = new URL(req.url);
  const from = normalizeDate(url.searchParams.get("from"));
  const to = normalizeDate(url.searchParams.get("to"));
  const group = normalizeGroup(url.searchParams.get("group"));

  const dateExpr = group === "month" ? "DATE_FORMAT(v.visit_date, '%Y-%m')" : "DATE(v.visit_date)";

  const whereParts: string[] = [
    "v.organization_id = :org",
    "v.branch_id = :branch",
  ];
  const params: Record<string, unknown> = { org: me.organizationId, branch: me.branchId };

  if (from) {
    whereParts.push("DATE(v.visit_date) >= :from");
    params.from = from;
  }
  if (to) {
    whereParts.push("DATE(v.visit_date) <= :to");
    params.to = to;
  }

  const whereSql = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";

  const [rows] = await db.execute<Row[]>(
    `
    SELECT
      ${dateExpr} AS dateKey,
      d.full_name AS doctorName,
      SUM(po.status = 'PENDING') AS pendingCount,
      SUM(po.status = 'PURCHASED') AS purchasedCount,
      SUM(po.status = 'NOT_PURCHASED') AS notPurchasedCount
    FROM pharma_orders po
    JOIN visits v ON v.id = po.visit_id
    JOIN doctors d ON d.id = v.doctor_id
    ${whereSql}
    GROUP BY dateKey, d.full_name
    ORDER BY dateKey DESC, d.full_name ASC
    `,
    params
  );

  return NextResponse.json({ ok: true, group, rows });
}
