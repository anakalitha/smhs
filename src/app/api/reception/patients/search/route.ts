import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

type PatientHit = RowDataPacket & {
  patientCode: string;
  name: string;
  phone: string | null;

  // NEW: latest referral info (nullable)
  referralpersonId: string | null;
  referralpersonName: string | null;
};

export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const allowed =
    me.roles.includes("RECEPTION") ||
    me.roles.includes("DOCTOR") ||
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

  const limit = 20;
  const like = `%${q}%`;

  try {
    const [rows] = await db.execute<PatientHit[]>(
      `
      SELECT
        p.patient_code AS patientCode,
        p.full_name AS name,
        p.phone AS phone,

        v.referralperson_id AS referralpersonId,
        rp.name AS referralpersonName
      FROM patients p

      /* latest visit for patient in this org+branch */
      LEFT JOIN visits v
        ON v.id = (
          SELECT v2.id
          FROM visits v2
          WHERE v2.patient_id = p.id
            AND v2.organization_id = :org
            AND v2.branch_id = :branch
          ORDER BY v2.visit_date DESC, v2.id DESC
          LIMIT 1
        )

      LEFT JOIN referralperson rp
        ON rp.id = v.referralperson_id

      WHERE
        (
          p.patient_code = :exact
          OR p.patient_code LIKE :like
          OR p.full_name LIKE :like
          OR (p.phone IS NOT NULL AND p.phone LIKE :like)
        )

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
