import { NextResponse } from "next/server";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

type MaxTokenRow = RowDataPacket & { max_token: number };
type ModeRow = RowDataPacket & { code: string };

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

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const allowed =
    me.roles.includes("DOCTOR") ||
    me.roles.includes("ADMIN") ||
    me.roles.includes("SUPER_ADMIN");

  if (!allowed)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!me.organizationId || !me.branchId) {
    return NextResponse.json(
      { error: "Your account is not linked to organization/branch." },
      { status: 400 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    patientDbId?: number | null;
    name?: string;
    phone?: string | null;
    referralId?: string | null;
  };

  const patientDbId =
    body.patientDbId != null ? Number(body.patientDbId) : null;
  const name = String(body.name ?? "").trim();
  const phoneRaw = String(body.phone ?? "").trim();
  const phoneClean = phoneRaw ? phoneRaw.replace(/\s+/g, "") : null;
  const referralId = body.referralId ? String(body.referralId).trim() : null;

  if (!name) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }

  if (phoneClean && !isValidPhone(phoneClean)) {
    return NextResponse.json(
      { error: "Phone must be a valid 10-digit number." },
      { status: 400 }
    );
  }

  const orgId = Number(me.organizationId);
  const branchId = Number(me.branchId);

  // Resolve doctor profile id from doctors.user_id
  const [docRows] = await db.execute<RowDataPacket[]>(
    `
    SELECT id
    FROM doctors
    WHERE user_id = :uid
      AND organization_id = :org
      AND branch_id = :branch
      AND is_active = 1
    LIMIT 1
    `,
    { uid: me.id, org: orgId, branch: branchId }
  );
  const doctorId = Number(docRows[0]?.id ?? 0);
  if (!Number.isFinite(doctorId) || doctorId <= 0) {
    return NextResponse.json(
      { error: "Doctor account is not linked to doctor profile." },
      { status: 400 }
    );
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    let patientId: number;
    let patientCode: string;

    if (patientDbId && Number.isFinite(patientDbId) && patientDbId > 0) {
      // Existing patient: verify belongs to same org/branch universe via visits
      // (or you can loosen this rule if needed)
      const [pRows] = await conn.execute<RowDataPacket[]>(
        `
        SELECT p.id, p.patient_code
        FROM patients p
        WHERE p.id = :pid
        LIMIT 1
        `,
        { pid: patientDbId }
      );

      if (pRows.length === 0) {
        await conn.rollback();
        return NextResponse.json(
          { error: "Selected patient not found." },
          { status: 404 }
        );
      }

      patientId = Number(pRows[0].id);
      patientCode = String(pRows[0].patient_code);

      // Update patient details if doctor edited them
      await conn.execute(
        `
        UPDATE patients
        SET full_name = :name,
            phone = :phone
        WHERE id = :pid
        `,
        { name, phone: phoneClean, pid: patientId }
      );
    } else {
      // New patient: generate patient_code using patient_counters (LOCKED)
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

      const [ins] = await conn.execute<ResultSetHeader>(
        `INSERT INTO patients (patient_code, full_name, phone)
         VALUES (:code, :name, :phone)`,
        { code: patientCode, name, phone: phoneClean }
      );

      patientId = Number(ins.insertId);
    }

    // Create TODAY visit
    const visitDate = todayLocalYYYYMMDD();

    const [visitIns] = await conn.execute<ResultSetHeader>(
      `INSERT INTO visits (
         patient_id,
         organization_id,
         branch_id,
         doctor_id,
         referralperson_id,
         visit_date
       )
       VALUES (
         :patient_id,
         :org_id,
         :branch_id,
         :doctor_id,
         :referralperson_id,
         :visit_date
       )`,
      {
        patient_id: patientId,
        org_id: orgId,
        branch_id: branchId,
        doctor_id: doctorId,
        referralperson_id: referralId || null,
        visit_date: visitDate,
      }
    );

    const visitId = Number(visitIns.insertId);

    // Queue token (LOCKED)
    const [tokenRows] = await conn.execute<MaxTokenRow[]>(
      `SELECT COALESCE(MAX(q.token_no), 0) AS max_token
       FROM queue_entries q
       JOIN visits v ON v.id = q.visit_id
       WHERE v.branch_id = :branch_id
         AND v.visit_date = CURDATE()
       FOR UPDATE`,
      { branch_id: branchId }
    );

    const nextToken = Number(tokenRows[0]?.max_token ?? 0) + 1;

    await conn.execute(
      `INSERT INTO queue_entries (visit_id, token_no, status)
       VALUES (:visit_id, :token_no, 'WAITING')`,
      { visit_id: visitId, token_no: nextToken }
    );

    // (Optional) Insert consultation payment here if needed.
    // We are NOT charging here because doctor-side walk-in usually just creates visit/queue.
    // If you want it to behave like reception register, tell me and I’ll add fee + payment_mode.

    await conn.commit();
    return NextResponse.json({ ok: true, visitId, patientCode });
  } catch (e: unknown) {
    await conn.rollback();
    console.error("❌ walkin-register failed:", e);
    return NextResponse.json(
      { error: "Failed to register walk-in." },
      { status: 500 }
    );
  } finally {
    conn.release();
  }
}
