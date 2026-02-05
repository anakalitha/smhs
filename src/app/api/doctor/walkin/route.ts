import { NextResponse } from "next/server";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

type MaxTokenRow = RowDataPacket & { max_token: number };

function isValidPhone(phone: string) {
  return /^[0-9]{10}$/.test(phone);
}

function todayLocalYYYYMMDD() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

async function resolveDoctorIdForUser(args: {
  userId: number;
  orgId: number;
  branchId: number;
}): Promise<number | null> {
  const [rows] = await db.execute<RowDataPacket[]>(
    `
    SELECT id
    FROM doctors
    WHERE user_id = :uid
      AND organization_id = :org
      AND branch_id = :branch
      AND is_active = 1
    LIMIT 1
    `,
    { uid: args.userId, org: args.orgId, branch: args.branchId }
  );
  if (rows.length === 0) return null;
  const id = Number(rows[0].id);
  return Number.isFinite(id) && id > 0 ? id : null;
}

type WalkInPayload =
  | {
      visitDate?: string; // YYYY-MM-DD (optional -> today)
      patientCode: string; // existing
      // optional: allow correction while creating visit
      name?: string;
      phone?: string | null;
      referralId?: string | null;
    }
  | {
      visitDate?: string;
      newPatient: {
        fullName: string;
        phone?: string | null;
      };
      referralId?: string | null;
    };

export async function POST(req: Request) {
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

  const doctorId = await resolveDoctorIdForUser({
    userId: me.id,
    orgId,
    branchId,
  });
  if (!doctorId) {
    return NextResponse.json(
      { error: "Doctor account is not linked to a doctor profile." },
      { status: 400 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as WalkInPayload;

  const visitDateRaw = (
    ("visitDate" in body ? body.visitDate : undefined) ?? ""
  ).trim();
  const visitDate =
    visitDateRaw && /^\d{4}-\d{2}-\d{2}$/.test(visitDateRaw)
      ? visitDateRaw
      : todayLocalYYYYMMDD();

  const today = todayLocalYYYYMMDD();
  if (visitDate > today) {
    return NextResponse.json(
      { error: "Visit date cannot be in the future." },
      { status: 400 }
    );
  }

  const referralId =
    "referralId" in body
      ? body.referralId ?? null
      : "referralId" in body
      ? body.referralId
      : null;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // --- Determine patient ---
    let patientId: number;
    let patientCode: string;

    if ("patientCode" in body) {
      patientCode = String(body.patientCode ?? "").trim();
      if (!patientCode) {
        await conn.rollback();
        return NextResponse.json(
          { error: "patientCode is required." },
          { status: 400 }
        );
      }

      const [pRows] = await conn.execute<RowDataPacket[]>(
        `SELECT id, patient_code, full_name, phone FROM patients WHERE patient_code = :code LIMIT 1`,
        { code: patientCode }
      );
      if (pRows.length === 0) {
        await conn.rollback();
        return NextResponse.json(
          { error: "Patient not found." },
          { status: 404 }
        );
      }

      patientId = Number(pRows[0].id);
      patientCode = String(pRows[0].patient_code);

      // Optional: let doctor correct name/phone quickly while creating visit
      const name = (body.name ?? "").trim();
      const phoneRaw = (body.phone ?? "").toString().trim();
      const phoneClean = phoneRaw ? phoneRaw.replace(/\s+/g, "") : null;

      if (name || phoneRaw) {
        if (phoneClean && !isValidPhone(phoneClean)) {
          await conn.rollback();
          return NextResponse.json(
            { error: "Phone must be a valid 10-digit number." },
            { status: 400 }
          );
        }

        // Enforce unique phone (patients.uq_patients_phone)
        if (phoneClean) {
          const [dupe] = await conn.execute<RowDataPacket[]>(
            `SELECT id FROM patients WHERE phone = :phone AND id <> :id LIMIT 1`,
            { phone: phoneClean, id: patientId }
          );
          if (dupe.length > 0) {
            await conn.rollback();
            return NextResponse.json(
              { error: "Phone number already exists for another patient." },
              { status: 400 }
            );
          }
        }

        await conn.execute(
          `
          UPDATE patients
          SET
            full_name = CASE WHEN :name = '' THEN full_name ELSE :name END,
            phone = :phone
          WHERE id = :id
          `,
          {
            id: patientId,
            name: name || "",
            phone: phoneClean,
          }
        );
      }
    } else {
      const fullName = String(body.newPatient?.fullName ?? "").trim();
      const phoneRaw = String(body.newPatient?.phone ?? "").trim();
      const phoneClean = phoneRaw ? phoneRaw.replace(/\s+/g, "") : null;

      if (!fullName) {
        await conn.rollback();
        return NextResponse.json(
          { error: "Patient name is required." },
          { status: 400 }
        );
      }
      if (phoneClean && !isValidPhone(phoneClean)) {
        await conn.rollback();
        return NextResponse.json(
          { error: "Phone must be a valid 10-digit number." },
          { status: 400 }
        );
      }

      // Validate org + branch codes
      const [codeRows] = await conn.execute<RowDataPacket[]>(
        `SELECT
           (SELECT code FROM organizations WHERE id = :org LIMIT 1) AS org_code,
           (SELECT code FROM branches WHERE id = :branch LIMIT 1) AS branch_code`,
        { org: orgId, branch: branchId }
      );

      const orgCode = String(codeRows[0]?.org_code ?? "").trim();
      const branchCode = String(codeRows[0]?.branch_code ?? "").trim();
      if (!orgCode || !branchCode) {
        await conn.rollback();
        return NextResponse.json(
          { error: "Organization/Branch code not configured." },
          { status: 400 }
        );
      }

      // Generate patient code (LOCK patient_counters)
      const [ctrRows] = await conn.execute<RowDataPacket[]>(
        `
        SELECT next_seq
        FROM patient_counters
        WHERE organization_id = :org AND branch_id = :branch
        FOR UPDATE
        `,
        { org: orgId, branch: branchId }
      );

      let seq: number;

      if (ctrRows.length === 0) {
        seq = 1;
        await conn.execute(
          `INSERT INTO patient_counters (organization_id, branch_id, next_seq)
           VALUES (:org, :branch, 2)`,
          { org: orgId, branch: branchId }
        );
      } else {
        seq = Number(ctrRows[0].next_seq);
        await conn.execute(
          `UPDATE patient_counters
           SET next_seq = next_seq + 1
           WHERE organization_id = :org AND branch_id = :branch`,
          { org: orgId, branch: branchId }
        );
      }

      patientCode = `${orgCode}_${branchCode}_${seq}`;

      // Insert patient
      const [ins] = await conn.execute<ResultSetHeader>(
        `INSERT INTO patients (patient_code, full_name, phone) VALUES (:code, :name, :phone)`,
        { code: patientCode, name: fullName, phone: phoneClean }
      );

      patientId = Number(ins.insertId);
    }

    // --- Create or reuse visit for this doctor on this date ---
    const [existingVisit] = await conn.execute<RowDataPacket[]>(
      `
      SELECT id
      FROM visits
      WHERE patient_id = :pid
        AND organization_id = :org
        AND branch_id = :branch
        AND doctor_id = :doc
        AND visit_date = :visitDate
      ORDER BY id DESC
      LIMIT 1
      `,
      { pid: patientId, org: orgId, branch: branchId, doc: doctorId, visitDate }
    );

    let visitId: number;

    if (existingVisit.length > 0) {
      visitId = Number(existingVisit[0].id);
    } else {
      const [visitIns] = await conn.execute<ResultSetHeader>(
        `
        INSERT INTO visits (
          patient_id, organization_id, branch_id, doctor_id, referralperson_id, visit_date
        )
        VALUES (
          :patient_id, :org_id, :branch_id, :doctor_id, :referralperson_id, :visit_date
        )
        `,
        {
          patient_id: patientId,
          org_id: orgId,
          branch_id: branchId,
          doctor_id: doctorId,
          referralperson_id: referralId ?? null,
          visit_date: visitDate,
        }
      );

      visitId = Number(visitIns.insertId);
    }

    // --- Ensure queue entry exists (token) ---
    const [qe] = await conn.execute<RowDataPacket[]>(
      `SELECT id, token_no, status FROM queue_entries WHERE visit_id = :visitId LIMIT 1`,
      { visitId }
    );

    let tokenNo: number | null = null;

    if (qe.length > 0) {
      tokenNo = qe[0].token_no != null ? Number(qe[0].token_no) : null;
    } else {
      // Generate token within same branch + visit_date (LOCK)
      const [tokenRows] = await conn.execute<MaxTokenRow[]>(
        `
        SELECT COALESCE(MAX(q.token_no), 0) AS max_token
        FROM queue_entries q
        JOIN visits v ON v.id = q.visit_id
        WHERE v.branch_id = :branch_id
          AND v.visit_date = :visit_date
        FOR UPDATE
        `,
        { branch_id: branchId, visit_date: visitDate }
      );

      tokenNo = Number(tokenRows[0]?.max_token ?? 0) + 1;

      await conn.execute(
        `INSERT INTO queue_entries (visit_id, token_no, status) VALUES (:visit_id, :token_no, 'WAITING')`,
        { visit_id: visitId, token_no: tokenNo }
      );
    }

    await conn.commit();

    return NextResponse.json({
      ok: true,
      patientCode,
      visitId,
      tokenNo,
      visitDate,
    });
  } catch (e: unknown) {
    await conn.rollback();
    // Common issue: duplicate phone due to uq_patients_phone
    console.error("❌ Doctor walk-in failed:", e);
    return NextResponse.json(
      { error: "Failed to register walk-in patient." },
      { status: 500 }
    );
  } finally {
    conn.release();
  }
}
