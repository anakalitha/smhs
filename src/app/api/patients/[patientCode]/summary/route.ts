// src\app\api\doctor\patients\[patientCode]\summary\route.ts
import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

type Ctx = { params: Promise<{ patientCode: string }> };

function hasAnyRole(me: { roles: string[] }, roles: string[]) {
  return roles.some((r) => me.roles.includes(r));
}

function canViewPatient(me: { roles: string[] }) {
  return hasAnyRole(me, [
    "DOCTOR",
    "RECEPTION",
    "ADMIN",
    "SUPER_ADMIN",
    "DATA_ENTRY",
  ]);
}

function permissionsFor(me: { roles: string[] }) {
  const canEditPatient = hasAnyRole(me, [
    "RECEPTION",
    "ADMIN",
    "SUPER_ADMIN",
    "DATA_ENTRY",
  ]);
  const canViewClinical = hasAnyRole(me, [
    "DOCTOR",
    "ADMIN",
    "SUPER_ADMIN",
    "RECEPTION",
  ]); // reception read-only ok
  const canEditClinical = hasAnyRole(me, ["DOCTOR", "ADMIN", "SUPER_ADMIN"]);
  const canViewBilling = hasAnyRole(me, ["ADMIN", "SUPER_ADMIN"]);
  return { canEditPatient, canViewClinical, canEditClinical, canViewBilling };
}

type PatientRow = RowDataPacket & {
  id: number;
  patient_code: string;
  full_name: string;
  phone: string | null;
  dob: string | null;
  gender: string | null;
  blood_group: string | null;
  email: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  emergency_contact_name: string | null;
  emergency_contact_relationship: string | null;
  emergency_contact_phone: string | null;
};

type TodayRow = RowDataPacket & {
  visitId: number;
  visitDate: string;
  doctorId: number | null;
  tokenNo: number | null;
  queueStatus: "WAITING" | "NEXT" | "IN_ROOM" | "DONE" | null;
};

type VisitRow = RowDataPacket & {
  visitId: number;
  visitDate: string;
  doctorId: number | null;
  doctorName: string | null;
  tokenNo: number | null;
  queueStatus: "WAITING" | "NEXT" | "IN_ROOM" | "DONE" | null;
  diagnosis: string | null;
  hasPrescription: number; // 0/1
};

export async function GET(_req: Request, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canViewPatient(me))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const orgId = Number(me.organizationId);
  const branchId = Number(me.branchId);
  if (
    !Number.isFinite(orgId) ||
    orgId <= 0 ||
    !Number.isFinite(branchId) ||
    branchId <= 0
  ) {
    return NextResponse.json(
      { error: "Invalid org/branch in session." },
      { status: 400 }
    );
  }

  const { patientCode } = await ctx.params;
  const code = String(patientCode ?? "").trim();
  if (!code)
    return NextResponse.json(
      { error: "Invalid patient code." },
      { status: 400 }
    );

  const perms = permissionsFor(me);

  const [pRows] = await db.execute<PatientRow[]>(
    `
    SELECT
      id, patient_code, full_name, phone,
      dob, gender, blood_group, email,
      address_line1, address_line2, city, state, pincode,
      emergency_contact_name, emergency_contact_relationship, emergency_contact_phone
    FROM patients
    WHERE patient_code = :code
    LIMIT 1
    `,
    { code }
  );

  if (pRows.length === 0)
    return NextResponse.json({ error: "Patient not found." }, { status: 404 });
  const patient = pRows[0];

  const [todayRows] = await db.execute<TodayRow[]>(
    `
    SELECT
      v.id AS visitId,
      v.visit_date AS visitDate,
      v.doctor_id AS doctorId,
      q.token_no AS tokenNo,
      q.status AS queueStatus
    FROM visits v
    LEFT JOIN queue_entries q ON q.visit_id = v.id
    WHERE v.patient_id = :pid
      AND v.organization_id = :org
      AND v.branch_id = :branch
      AND v.visit_date = CURDATE()
    LIMIT 1
    `,
    { pid: patient.id, org: orgId, branch: branchId }
  );

  const [visitRows] = await db.execute<VisitRow[]>(
    `
    SELECT
      v.id AS visitId,
      v.visit_date AS visitDate,
      v.doctor_id AS doctorId,
      d.full_name AS doctorName,
      q.token_no AS tokenNo,
      q.status AS queueStatus,
      ${
        perms.canViewClinical
          ? "vn.diagnosis AS diagnosis,"
          : "NULL AS diagnosis,"
      }
      ${
        perms.canViewClinical
          ? "CASE WHEN pr.id IS NULL THEN 0 ELSE 1 END AS hasPrescription"
          : "0 AS hasPrescription"
      }
    FROM visits v
    LEFT JOIN queue_entries q ON q.visit_id = v.id
    LEFT JOIN doctors d ON d.id = v.doctor_id
    ${
      perms.canViewClinical
        ? "LEFT JOIN visit_notes vn ON vn.visit_id = v.id"
        : ""
    }
    ${
      perms.canViewClinical
        ? "LEFT JOIN prescriptions pr ON pr.visit_id = v.id"
        : ""
    }
    WHERE v.patient_id = :pid
      AND v.organization_id = :org
      AND v.branch_id = :branch
    ORDER BY v.visit_date DESC, v.id DESC
    LIMIT 20
    `,
    { pid: patient.id, org: orgId, branch: branchId }
  );

  return NextResponse.json({
    ok: true,
    permissions: perms,
    patient: {
      id: Number(patient.id),
      patientCode: patient.patient_code,
      fullName: patient.full_name,
      phone: patient.phone,
      dob: patient.dob,
      gender: patient.gender,
      bloodGroup: patient.blood_group,
      email: patient.email,
      addressLine1: patient.address_line1,
      addressLine2: patient.address_line2,
      city: patient.city,
      state: patient.state,
      pincode: patient.pincode,
      emergencyContactName: patient.emergency_contact_name,
      emergencyContactRelationship: patient.emergency_contact_relationship,
      emergencyContactPhone: patient.emergency_contact_phone,
    },
    today: todayRows.length ? todayRows[0] : null,
    visits: visitRows.map((r) => ({
      visitId: Number(r.visitId),
      visitDate: String(r.visitDate).slice(0, 10),
      doctorId: r.doctorId != null ? Number(r.doctorId) : null,
      doctorName: r.doctorName,
      tokenNo: r.tokenNo != null ? Number(r.tokenNo) : null,
      queueStatus: r.queueStatus,
      ...(perms.canViewClinical
        ? { diagnosis: r.diagnosis, hasPrescription: !!r.hasPrescription }
        : {}),
    })),
  });
}
