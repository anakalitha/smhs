import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

type PatientHit = RowDataPacket & {
  patientCode: string;
  name: string;
  phone: string | null;
};

export async function GET(req: Request) {
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

  const url = new URL(req.url);
  const qRaw = (url.searchParams.get("q") || "").trim();
  const q = qRaw.length ? qRaw : null;

  if (!q) return NextResponse.json({ hits: [] });

  // Safe hard limit (do not bind LIMIT in MySQL2)
  const limit = 20;

  const like = `%${q}%`;

  try {
    const [rows] = await db.execute<PatientHit[]>(
      `
      SELECT
        p.patient_code AS patientCode,
        p.full_name AS name,
        p.phone AS phone
      FROM patients p
      JOIN visits v ON v.patient_id = p.id
      WHERE v.organization_id = :org
        AND v.branch_id = :branch
        AND (
          p.patient_code = :exact
          OR p.patient_code LIKE :like
          OR p.full_name LIKE :like
          OR (p.phone IS NOT NULL AND p.phone LIKE :like)
        )
      GROUP BY p.patient_code, p.full_name, p.phone
      ORDER BY
        (p.patient_code = :exact) DESC,
        p.full_name ASC
      LIMIT ${limit}
      `,
      {
        org: me.organizationId,
        branch: me.branchId,
        exact: q,
        like,
      }
    );

    return NextResponse.json({ hits: rows });
  } catch (e: unknown) {
    console.error("❌ /api/reception/patients/search failed:", e);
    return NextResponse.json(
      { error: "Failed to search patients." },
      { status: 500 }
    );
  }
}
