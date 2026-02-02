import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

type PrefillRow = RowDataPacket & {
  patientCode: string;
  name: string;
  phone: string | null;
  doctorId: number | null;
  doctorName: string | null;
  referralId: string | null;
  referralName: string | null;
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ patientCode: string }> }
) {
  const { patientCode } = await params;

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

  const orgId = me.organizationId;
  const branchId = me.branchId;

  try {
    const [rows] = await db.execute<PrefillRow[]>(
      `
      SELECT
        p.patient_code AS patientCode,
        p.full_name AS name,
        p.phone AS phone,

        v.id AS lastVisitId,
        v.doctor_id AS doctorId,
        d.full_name AS doctorName,

        v.referralperson_id AS referralId,
        rp.name AS referralName

      FROM patients p
      JOIN visits v ON v.patient_id = p.id
      LEFT JOIN doctors d ON d.id = v.doctor_id
      LEFT JOIN referralperson rp ON rp.id = v.referralperson_id

      WHERE v.organization_id = :org
        AND v.branch_id = :branch
        AND p.patient_code = :code

      ORDER BY v.visit_date DESC, v.id DESC
      LIMIT 1
      `,
      { org: orgId, branch: branchId, code: patientCode }
    );

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "Patient not found." },
        { status: 404 }
      );
    }

    const r = rows[0];

    return NextResponse.json({
      patient: {
        patientCode: r.patientCode,
        name: r.name,
        phone: r.phone ?? "",
      },
      latest: {
        doctor: r.doctorId
          ? { id: r.doctorId, name: r.doctorName ?? "—" }
          : null,
        referral: r.referralId
          ? { id: r.referralId, name: r.referralName ?? "—" }
          : null,
      },
    });
  } catch (e: unknown) {
    console.error("❌ prefill failed:", e);
    return NextResponse.json(
      { error: "Failed to fetch patient details." },
      { status: 500 }
    );
  }
}
