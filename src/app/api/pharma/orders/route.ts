import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

type Row = RowDataPacket & {
  orderId: number;
  visitId: number;
  visitDate: string;
  patientCode: string;
  patientName: string;
  doctorName: string;
  status: "PENDING" | "PURCHASED" | "NOT_PURCHASED";
  medicines: string | null;
  updatedAt: string | null;
};

function allowed(me: { roles: string[] }) {
  return (
    me.roles.includes("PHARMA_IN_CHARGE") ||
    me.roles.includes("ADMIN") ||
    me.roles.includes("SUPER_ADMIN")
  );
}

function normalizeStatus(v: string | null) {
  const s = (v || "PENDING").toUpperCase();
  if (s === "PENDING" || s === "PURCHASED" || s === "NOT_PURCHASED") return s;
  return "PENDING";
}

export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!allowed(me)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!me.organizationId || !me.branchId) {
    return NextResponse.json({ error: "Invalid org/branch." }, { status: 400 });
  }

  const url = new URL(req.url);
  const status = normalizeStatus(url.searchParams.get("status"));
  const onlyToday = (url.searchParams.get("today") || "1") !== "0";

  const dateFilter = onlyToday ? "AND DATE(v.visit_date) = CURDATE()" : "";

  const [rows] = await db.execute<Row[]>(
    `
    SELECT
      po.id AS orderId,
      v.id AS visitId,
      v.visit_date AS visitDate,
      p.patient_code AS patientCode,
      p.full_name AS patientName,
      d.full_name AS doctorName,
      po.status AS status,
      GROUP_CONCAT(pi.medicine_name ORDER BY pi.sort_order SEPARATOR ', ') AS medicines,
      po.updated_at AS updatedAt
    FROM pharma_orders po
    JOIN visits v ON v.id = po.visit_id
    JOIN patients p ON p.id = v.patient_id
    JOIN doctors d ON d.id = v.doctor_id
    LEFT JOIN prescriptions rx ON rx.id = po.prescription_id
    LEFT JOIN prescription_items pi ON pi.prescription_id = rx.id
    WHERE v.organization_id = :org
      AND v.branch_id = :branch
      ${dateFilter}
      AND po.status = :status
    GROUP BY po.id, v.id, v.visit_date, p.patient_code, p.full_name, d.full_name, po.status, po.updated_at
    ORDER BY v.visit_date DESC, po.id DESC
    `,
    { org: me.organizationId, branch: me.branchId, status }
  );

  return NextResponse.json({ rows });
}
