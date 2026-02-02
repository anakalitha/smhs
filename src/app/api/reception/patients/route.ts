import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

type PatientRow = RowDataPacket & {
  id: number;
  patientId: string; // patient_code
  name: string;
  phone: string | null;
  lastVisit: string | null; // YYYY-MM-DD
  doctor: string | null;
};

type CountRow = RowDataPacket & { n: number };

export async function GET(req: Request) {
  const me = await getCurrentUser();

  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const allowed =
    me.roles.includes("RECEPTION") ||
    me.roles.includes("ADMIN") ||
    me.roles.includes("SUPER_ADMIN") ||
    me.roles.includes("DOCTOR");

  if (!allowed)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!me.organizationId || !me.branchId) {
    return NextResponse.json({ error: "Invalid org/branch." }, { status: 400 });
  }

  const url = new URL(req.url);
  const rawSearch = (url.searchParams.get("search") || "").trim();
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const pageSize = Math.min(
    50,
    Math.max(5, Number(url.searchParams.get("pageSize") || 15))
  );
  const offset = (page - 1) * pageSize;

  // Search term for LIKE
  const like = rawSearch ? `%${rawSearch}%` : null;

  // NOTE:
  // Patients themselves may be "global" in your model,
  // but lookup for reception should show patients relevant to THEIR branch/org.
  // So we filter patients by visits in org+branch.
  //
  // If you later want "global patient master", we can add SUPER_ADMIN override.
  const orgId = me.organizationId;
  const branchId = me.branchId;

  // Count
  const [countRows] = await db.execute<CountRow[]>(
    `
    SELECT COUNT(DISTINCT p.id) AS n
    FROM patients p
    JOIN visits v ON v.patient_id = p.id
    WHERE v.organization_id = :org
      AND v.branch_id = :branch
      AND (
        :like IS NULL
        OR p.patient_code LIKE :like
        OR p.full_name LIKE :like
        OR p.phone LIKE :like
      )
    `,
    { org: orgId, branch: branchId, like }
  );

  const total = Number(countRows[0]?.n ?? 0);

  // Data
  const [rows] = await db.execute<PatientRow[]>(
    `
  SELECT
    p.id AS id,
    p.patient_code AS patientId,
    p.full_name AS name,
    p.phone AS phone,
    MAX(v.visit_date) AS lastVisit,
    (
      SELECT d.full_name
      FROM visits v2
      JOIN doctors d ON d.id = v2.doctor_id
      WHERE v2.patient_id = p.id
        AND v2.organization_id = :org
        AND v2.branch_id = :branch
      ORDER BY v2.visit_date DESC, v2.id DESC
      LIMIT 1
    ) AS doctor
  FROM patients p
  JOIN visits v ON v.patient_id = p.id
  WHERE v.organization_id = :org
    AND v.branch_id = :branch
    AND (
      :like IS NULL
      OR p.patient_code LIKE :like
      OR p.full_name LIKE :like
      OR p.phone LIKE :like
    )
  GROUP BY p.id, p.patient_code, p.full_name, p.phone
  ORDER BY lastVisit DESC, p.id DESC
  LIMIT ${pageSize} OFFSET ${offset}
  `,
    { org: orgId, branch: branchId, like }
  );

  return NextResponse.json({
    page,
    pageSize,
    total,
    rows: rows.map((r) => ({
      id: r.patientId, // keep your UI type as string patient id
      name: r.name,
      phone: r.phone ?? "",
      lastVisit: r.lastVisit ?? "",
      doctor: r.doctor ?? "—",
    })),
  });
}
