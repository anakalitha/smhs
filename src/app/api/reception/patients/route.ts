// src/app/api/reception/patients/route.ts
import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

type PatientRow = RowDataPacket & {
  id: number;
  patientId: string;
  name: string;
  phone: string | null;
  lastVisit: string | null;
  doctor: string | null;
};

type CountRow = RowDataPacket & { n: number };

type SortBy =
  | "patientId"
  | "name"
  | "phone"
  | "lastVisit"
  | "doctor"
  | "createdAt";
type SortDir = "asc" | "desc";

function parseSortBy(v: string | null): SortBy {
  if (
    v === "patientId" ||
    v === "name" ||
    v === "phone" ||
    v === "lastVisit" ||
    v === "doctor" ||
    v === "createdAt"
  )
    return v;

  // ✅ default: newest patients first
  return "createdAt";
}

function parseSortDir(v: string | null): SortDir {
  return v === "asc" || v === "desc" ? v : "desc";
}

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

  const sortBy = parseSortBy(url.searchParams.get("sortBy"));
  const sortDir = parseSortDir(url.searchParams.get("sortDir"));

  const like = rawSearch ? `%${rawSearch}%` : null;
  const phoneDigits = rawSearch ? rawSearch.replace(/\D+/g, "") : "";
  const phoneLike = phoneDigits ? `%${phoneDigits}%` : null;

  const orgId = me.organizationId;
  const branchId = me.branchId;

  // Safe ORDER BY mapping (whitelist)
  const orderExpr =
    sortBy === "createdAt"
      ? "p.created_at"
      : sortBy === "patientId"
      ? "p.patient_code"
      : sortBy === "name"
      ? "p.full_name"
      : sortBy === "phone"
      ? "p.phone"
      : sortBy === "doctor"
      ? "doctor"
      : "lastVisit";

  const orderDirSql = sortDir.toUpperCase(); // ASC/DESC only

  // ---------------- COUNT ----------------
  const countSql = `
    SELECT COUNT(DISTINCT p.id) AS n
    FROM patients p
    JOIN visits v ON v.patient_id = p.id
    WHERE v.organization_id = ?
      AND v.branch_id = ?
      AND (
        ? IS NULL
        OR p.patient_code LIKE ?
        OR p.full_name LIKE ?
        OR p.phone LIKE ?
        OR (? IS NOT NULL AND REPLACE(IFNULL(p.phone,''), ' ', '') LIKE ?)
      )
  `;

  const countParams = [
    orgId,
    branchId,
    like,
    like,
    like,
    like,
    phoneLike,
    phoneLike,
  ];

  const [countRows] = await db.execute<CountRow[]>(countSql, countParams);
  const total = Number(countRows[0]?.n ?? 0);

  // ---------------- DATA ----------------
  // ✅ IMPORTANT: Inject LIMIT/OFFSET as validated integers (avoid stmt_execute error)
  const dataSql = `
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
          AND v2.organization_id = ?
          AND v2.branch_id = ?
        ORDER BY v2.visit_date DESC, v2.id DESC
        LIMIT 1
      ) AS doctor
    FROM patients p
    JOIN visits v ON v.patient_id = p.id
    WHERE v.organization_id = ?
      AND v.branch_id = ?
      AND (
        ? IS NULL
        OR p.patient_code LIKE ?
        OR p.full_name LIKE ?
        OR p.phone LIKE ?
        OR (? IS NOT NULL AND REPLACE(IFNULL(p.phone,''), ' ', '') LIKE ?)
      )
    GROUP BY p.id, p.patient_code, p.full_name, p.phone
    ORDER BY p.created_at DESC, p.id DESC
    LIMIT ${pageSize} OFFSET ${offset}
  `;

  const dataParams = [
    // subquery org/branch
    orgId,
    branchId,

    // main query org/branch
    orgId,
    branchId,

    // filters
    like,
    like,
    like,
    like,
    phoneLike,
    phoneLike,
  ];

  const [rows] = await db.execute<PatientRow[]>(dataSql, dataParams);

  return NextResponse.json({
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    rows: rows.map((r) => ({
      id: r.patientId, // patient_code
      name: r.name,
      phone: r.phone ?? "",
      lastVisit: r.lastVisit ?? "",
      doctor: r.doctor ?? "—",
    })),
  });
}
