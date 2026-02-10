// src\app\api\reception\register\route.ts
import { NextResponse } from "next/server";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";

import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { validateVisitDate } from "@/lib/datetime";

type MaxTokenRow = RowDataPacket & { max_token: number };
type ModeRow = RowDataPacket & { code: string };
type RateRow = RowDataPacket & { rate: number };
type BranchRow = RowDataPacket & { code: string };

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

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}

export async function POST(req: Request) {
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
    return NextResponse.json(
      { error: "Your account is not linked to organization/branch." },
      { status: 400 }
    );
  }

  const body = (await req.json()) as {
    visitDate?: string;
    name?: string;
    phone?: string;
    referralId?: string | null;
    doctorId?: number;

    serviceId?: number;
    discountAmount?: number | string;
    paidNowAmount?: number | string;
    paymentMode?: string; // required only if paidNowAmount > 0
    remarks?: string;
  };

  const visitDate = String(body.visitDate || "").trim();
  const name = (body.name || "").trim();
  const phoneRaw = (body.phone || "").trim();
  const phoneClean = phoneRaw ? phoneRaw.replace(/\s+/g, "") : null;

  const referralId = body.referralId || null;
  const doctorId = Number(body.doctorId || 0);
  const serviceId = Number(body.serviceId || 0);

  const discountReq =
    typeof body.discountAmount === "string"
      ? Number(body.discountAmount)
      : Number(body.discountAmount || 0);

  const paidNowReq =
    typeof body.paidNowAmount === "string"
      ? Number(body.paidNowAmount)
      : Number(body.paidNowAmount || 0);

  const paymentModeCode = (body.paymentMode || "").trim();
  const remarks = body.remarks?.trim() || null;

  // ---------------- Validation ----------------
  const v = validateVisitDate(visitDate, { allowFuture: false });
  if (!v.ok) {
    return NextResponse.json({ error: v.error }, { status: 400 });
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

  if (!serviceId)
    return NextResponse.json(
      { error: "Service is required." },
      { status: 400 }
    );

  if (!Number.isFinite(discountReq) || discountReq < 0)
    return NextResponse.json(
      { error: "Discount must be a valid number." },
      { status: 400 }
    );

  if (!Number.isFinite(paidNowReq) || paidNowReq < 0)
    return NextResponse.json(
      { error: "Paid-now must be a valid number." },
      { status: 400 }
    );

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // 1) Validate doctor
    const [docRows] = await conn.execute<RowDataPacket[]>(
      `SELECT id FROM doctors
       WHERE id = :doctor_id
         AND is_active = 1
         AND organization_id = :org_id
         AND branch_id = :branch_id
       LIMIT 1`,
      {
        doctor_id: doctorId,
        org_id: me.organizationId,
        branch_id: me.branchId,
      }
    );
    if (docRows.length === 0) {
      await conn.rollback();
      return NextResponse.json({ error: "Invalid doctor." }, { status: 400 });
    }

    // 2) Validate service + branch rate
    const [rateRows] = await conn.execute<RateRow[]>(
      `
      SELECT r.rate
      FROM services s
      JOIN service_rates r ON r.service_id = s.id
      WHERE s.id = :service_id
        AND s.organization_id = :org_id
        AND s.is_active = 1
        AND r.branch_id = :branch_id
        AND r.is_active = 1
      LIMIT 1
      FOR UPDATE
      `,
      {
        service_id: serviceId,
        org_id: me.organizationId,
        branch_id: me.branchId,
      }
    );
    if (rateRows.length === 0) {
      await conn.rollback();
      return NextResponse.json(
        { error: "Invalid service or rate not configured for this branch." },
        { status: 400 }
      );
    }

    const gross = Number(rateRows[0].rate || 0);
    if (!Number.isFinite(gross) || gross < 0) {
      await conn.rollback();
      return NextResponse.json(
        { error: "Invalid configured rate for this service." },
        { status: 400 }
      );
    }

    const discount = clamp(discountReq, 0, gross);
    const net = clamp(gross - discount, 0, gross);
    const paidNow = clamp(paidNowReq, 0, net);

    if (paidNow > 0 && !paymentModeCode) {
      await conn.rollback();
      return NextResponse.json(
        { error: "Payment mode is required when collecting paid-now amount." },
        { status: 400 }
      );
    }

    // 3) Patient counter
    // 3) Patient counter + branch code + YYYYMM from visitDate
    const orgId = Number(me.organizationId);
    const branchId = Number(me.branchId);

    // Parse visit date parts
    const parts = visitDate.split("-");
    const admissionYear = parseInt(parts[0], 10);
    const admissionMonth = parseInt(parts[1], 10);
    const yyyy = String(admissionYear);
    const mm = String(admissionMonth).padStart(2, "0");

    // Get branch code (SMNH-MCC)
    const [branchRows] = await conn.execute<BranchRow[]>(
      `SELECT code
   FROM branches
   WHERE id = :branch_id
     AND organization_id = :org_id
   LIMIT 1
   FOR UPDATE`,
      { branch_id: branchId, org_id: orgId }
    );

    if (branchRows.length === 0 || !branchRows[0].code) {
      await conn.rollback();
      return NextResponse.json({ error: "Invalid branch." }, { status: 400 });
    }

    const branchCode = String(branchRows[0].code).trim();

    // Atomic counter (safe)
    const [ctrRows] = await conn.execute<RowDataPacket[]>(
      `SELECT next_seq FROM patient_counters
   WHERE organization_id = :org AND branch_id = :branch
   FOR UPDATE`,
      { org: orgId, branch: branchId }
    );

    let seq = 1;
    if (ctrRows.length === 0) {
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

    // Final code: OP_SMNH-MCC_2025091
    const patientCode = `OP_${branchCode}_${yyyy}${mm}${seq}`;

    // 4) Insert patient
    const [pIns] = await conn.execute<ResultSetHeader>(
      `INSERT INTO patients (patient_code, full_name, phone)
       VALUES (:code, :name, :phone)`,
      { code: patientCode, name, phone: phoneClean }
    );
    const patientId = pIns.insertId;

    // 5) Create visit
    const [vIns] = await conn.execute<ResultSetHeader>(
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
    const visitId = vIns.insertId;

    // 6) Insert visit charge
    await conn.execute(
      `INSERT INTO visit_charges (
         visit_id,
         service_id,
         gross_amount,
         discount_amount,
         net_amount
       )
       VALUES (
         :visit_id,
         :service_id,
         :gross,
         :discount,
         :net
       )`,
      {
        visit_id: visitId,
        service_id: serviceId,
        gross,
        discount,
        net,
      }
    );

    // 7) Queue token (only if visitDate == today local)
    const todayLocal = todayLocalYYYYMMDD();
    let nextToken: number | null = null;
    if (visitDate === todayLocal) {
      const [tokenRows] = await conn.execute<MaxTokenRow[]>(
        `SELECT COALESCE(MAX(q.token_no), 0) AS max_token
         FROM queue_entries q
         JOIN visits v ON v.id = q.visit_id
         WHERE v.branch_id = :branch_id
           AND v.visit_date = CURDATE()
         FOR UPDATE`,
        { branch_id: me.branchId }
      );
      nextToken = Number(tokenRows[0].max_token) + 1;
      await conn.execute(
        `INSERT INTO queue_entries (visit_id, token_no, status)
         VALUES (:visit_id, :token_no, 'WAITING')`,
        { visit_id: visitId, token_no: nextToken }
      );
    }

    // 8) Payment (optional)
    if (paidNow > 0) {
      const [modeRows] = await conn.execute<ModeRow[]>(
        `SELECT code FROM payment_modes
         WHERE code = :code AND is_active = 1
         LIMIT 1`,
        { code: paymentModeCode }
      );
      if (modeRows.length === 0) {
        await conn.rollback();
        return NextResponse.json(
          { error: "Invalid payment mode." },
          { status: 400 }
        );
      }

      const [payIns] = await conn.execute<ResultSetHeader>(
        `INSERT INTO payments (
           visit_id,
           service_id,
           amount,
           payment_mode_code,
           pay_status,
           direction,
           note,
           created_by
         )
         VALUES (
           :visit_id,
           :service_id,
           :amount,
           :mode,
           'ACCEPTED',
           'PAYMENT',
           :note,
           :user_id
         )`,
        {
          visit_id: visitId,
          service_id: serviceId,
          amount: paidNow,
          mode: paymentModeCode,
          note: remarks,
          user_id: (me as any).id ?? null,
        }
      );
      const paymentId = payIns.insertId;

      await conn.execute(
        `INSERT INTO payment_allocations (
           payment_id,
           visit_id,
           service_id,
           amount
         )
         VALUES (
           :payment_id,
           :visit_id,
           :service_id,
           :amount
         )`,
        {
          payment_id: paymentId,
          visit_id: visitId,
          service_id: serviceId,
          amount: paidNow,
        }
      );
    }

    await conn.commit();

    return NextResponse.json({
      ok: true,
      visitId,
      queued: visitDate === todayLocal,
      queueRow:
        visitDate === todayLocal
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
  } catch (e) {
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
