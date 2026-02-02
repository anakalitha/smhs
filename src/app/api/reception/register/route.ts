// src/app/api/reception/register/route.ts
import { NextResponse } from "next/server";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

type MaxTokenRow = RowDataPacket & { max_token: number };
type ModeRow = RowDataPacket & { code: string };

function isValidPhone(phone: string) {
  return /^[0-9]{10}$/.test(phone);
}

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const allowed =
    me.roles.includes("RECEPTION") ||
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

  const body = (await req.json()) as {
    visitDate?: string; // YYYY-MM-DD
    name?: string;
    phone?: string;
    referralId?: string | null;
    doctorId?: number;
    consultingFee?: number | string;
    paymentMode?: string;
    payStatus?: "ACCEPTED" | "PENDING" | "WAIVED";
  };

  const visitDate = String(body.visitDate || "").trim();
  const name = (body.name || "").trim();
  const phoneRaw = (body.phone || "").trim();
  const phoneClean = phoneRaw ? phoneRaw.replace(/\s+/g, "") : null;
  const referralId = body.referralId || null;
  const doctorId = Number(body.doctorId || 0);
  const paymentMode = body.paymentMode || "CASH";
  const payStatus = body.payStatus || "ACCEPTED";

  const feeNum =
    typeof body.consultingFee === "string"
      ? Number(body.consultingFee)
      : Number(body.consultingFee);

  console.log("🔎 Register payload:", {
    visitDate,
    name,
    phoneClean,
    referralId,
    doctorId,
    paymentMode,
    payStatus,
    feeNum,
  });

  // --- Validation ---
  if (!visitDate || !/^\d{4}-\d{2}-\d{2}$/.test(visitDate)) {
    return NextResponse.json(
      { error: "Visit date is required." },
      { status: 400 }
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  if (visitDate > today) {
    return NextResponse.json(
      { error: "Visit date cannot be in the future." },
      { status: 400 }
    );
  }

  if (!name)
    return NextResponse.json({ error: "Name is required." }, { status: 400 });

  if (phoneClean && !isValidPhone(phoneClean))
    return NextResponse.json(
      { error: "Phone must be a valid 10-digit number." },
      { status: 400 }
    );

  if (!doctorId)
    return NextResponse.json(
      { error: "Consulting doctor is required." },
      { status: 400 }
    );

  if (!Number.isFinite(feeNum) || feeNum < 0)
    return NextResponse.json(
      { error: "Consulting fee must be a valid number." },
      { status: 400 }
    );

  if (payStatus !== "WAIVED" && feeNum === 0) {
    return NextResponse.json(
      { error: "Fee cannot be 0 unless Waived." },
      { status: 400 }
    );
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // 1) Validate doctor
    const [docRows] = await conn.execute<RowDataPacket[]>(
      `SELECT d.id
       FROM doctors d
       WHERE d.id = :doctor_id
         AND d.is_active = 1
         AND d.organization_id = :org_id
         AND d.branch_id = :branch_id
       LIMIT 1`,
      {
        doctor_id: doctorId,
        org_id: me.organizationId,
        branch_id: me.branchId,
      }
    );

    if (docRows.length === 0) {
      await conn.rollback();
      return NextResponse.json(
        { error: "Invalid doctor selection." },
        { status: 400 }
      );
    }

    // 2) Get org + branch codes
    const orgId = Number(me.organizationId);
    const branchId = Number(me.branchId);

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

    // 3) Generate patient code (LOCKED)
    const [ctrRows] = await conn.execute<RowDataPacket[]>(
      `SELECT next_seq
       FROM patient_counters
       WHERE organization_id = :org AND branch_id = :branch
       FOR UPDATE`,
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

    const patientCode = `${orgCode}_${branchCode}_${seq}`;

    // 4) Insert patient (ALWAYS NEW for Quick OPD)
    const [ins] = await conn.execute<ResultSetHeader>(
      `INSERT INTO patients (patient_code, full_name, phone)
       VALUES (:code, :name, :phone)`,
      { code: patientCode, name, phone: phoneClean }
    );

    const patientId = ins.insertId;

    // 5) Create visit
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
        org_id: me.organizationId,
        branch_id: me.branchId,
        doctor_id: doctorId,
        referralperson_id: referralId,
        visit_date: visitDate,
      }
    );

    const visitId = visitIns.insertId;

    // 6) Generate token (LOCKED)
    const today = new Date().toISOString().slice(0, 10);
    const isToday = visitDate === today;

    let nextToken: number | null = null;

    if (isToday) {
      const [tokenRows] = await conn.execute<MaxTokenRow[]>(
        `SELECT COALESCE(MAX(q.token_no), 0) AS max_token
       FROM queue_entries q
       JOIN visits v ON v.id = q.visit_id
       WHERE v.branch_id = :branch_id
         AND v.visit_date = CURDATE()
       FOR UPDATE`,
        { branch_id: me.branchId }
      );

      nextToken = Number(tokenRows[0]?.max_token ?? 0) + 1;

      await conn.execute(
        `INSERT INTO queue_entries (visit_id, token_no, status)
       VALUES (:visit_id, :token_no, 'WAITING')`,
        { visit_id: visitId, token_no: nextToken }
      );
    }

    // 7) Validate payment mode
    const [modeRows] = await conn.execute<ModeRow[]>(
      `SELECT code FROM payment_modes
       WHERE code = :code AND is_active = 1
       LIMIT 1`,
      { code: paymentMode }
    );

    if (modeRows.length === 0) {
      await conn.rollback();
      return NextResponse.json(
        { error: "Invalid or inactive payment mode." },
        { status: 400 }
      );
    }

    // 8) Insert payment
    await conn.execute(
      `INSERT INTO payments (visit_id, fee_type, amount, payment_mode, pay_status)
       VALUES (:visit_id, 'CONSULTATION', :amount, :mode, :status)`,
      {
        visit_id: visitId,
        amount: feeNum,
        mode: paymentMode,
        status: payStatus,
      }
    );

    await conn.commit();
    console.log("✅ Returning visitId:", visitId);
    return NextResponse.json({
      ok: true,
      visitId,
      queued: isToday,
      queueRow: isToday
        ? {
            token: nextToken,
            patientId: patientCode,
            visitId,
            name,
            phone: phoneClean ?? "",
            status: "WAITING",
          }
        : null,
    });
  } catch (e: unknown) {
    await conn.rollback();
    console.error("❌ Failed to register patient:", e);
    return NextResponse.json(
      { error: "Failed to register patient." },
      { status: 500 }
    );
  } finally {
    conn.release();
  }
}
