import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

type DoctorQueueRow = RowDataPacket & {
  visitId: number;
  visitDate: string;
  status: "WAITING" | "NEXT" | "IN_ROOM" | "DONE";
  tokenNo: number | null;

  patientDbId: number;
  patientCode: string;
  patientName: string;
  phone: string | null;
};

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const allowed =
    me.roles.includes("DOCTOR") ||
    me.roles.includes("ADMIN") ||
    me.roles.includes("SUPER_ADMIN");

  if (!allowed)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const orgId = me.organizationId != null ? Number(me.organizationId) : NaN;
  const branchId = me.branchId != null ? Number(me.branchId) : NaN;
  const doctorId = me.doctorId != null ? Number(me.doctorId) : NaN; // see note below

  if (!Number.isFinite(orgId) || !Number.isFinite(branchId)) {
    return NextResponse.json(
      { error: "Invalid org/branch in session." },
      { status: 400 }
    );
  }

  // ⚠️ Important:
  // You need a way to map the logged-in doctor user -> doctors.id.
  // If your session already has `doctorId`, use it (recommended).
  // If not, you must add it in getCurrentUser() or join by email.
  if (!Number.isFinite(doctorId) || doctorId <= 0) {
    return NextResponse.json(
      { error: "Doctor account is not linked to a doctor profile." },
      { status: 400 }
    );
  }

  const [rows] = await db.execute<DoctorQueueRow[]>(
    `
    SELECT
      v.id AS visitId,
      v.visit_date AS visitDate,
      COALESCE(q.status, 'WAITING') AS status,
      q.token_no AS tokenNo,

      p.id AS patientDbId,
      p.patient_code AS patientCode,
      p.full_name AS patientName,
      p.phone AS phone
    FROM visits v
    JOIN patients p ON p.id = v.patient_id
    LEFT JOIN queue_entries q ON q.visit_id = v.id
    WHERE v.organization_id = :org
      AND v.branch_id = :branch
      AND v.doctor_id = :doctorId
      AND v.visit_date = CURDATE()
    ORDER BY COALESCE(q.token_no, 999999) ASC, v.id ASC
    `,
    { org: orgId, branch: branchId, doctorId }
  );

  return NextResponse.json({ ok: true, todays: rows });
}
