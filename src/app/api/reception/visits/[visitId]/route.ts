// src/app/api/reception/visits/[visitId]/route.ts
import { NextResponse } from "next/server";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

type Ctx = { params: Promise<{ visitId: string }> };

function allowed(me: { roles?: string[] } | null | undefined) {
  const roles = me?.roles ?? [];
  return (
    roles.includes("RECEPTION") ||
    roles.includes("ADMIN") ||
    roles.includes("SUPER_ADMIN") ||
    roles.includes("DATA_ENTRY")
  );
}

function isAdmin(me: { roles?: string[] } | null | undefined) {
  const roles = me?.roles ?? [];
  return roles.includes("ADMIN") || roles.includes("SUPER_ADMIN");
}

type VisitRow = RowDataPacket & {
  visit_id: number;
  visit_date: string;
  doctor_id: number | null;

  patient_code: string;
  full_name: string;
  phone: string | null;

  amount: string | number | null;
  payment_mode_code: string | null;
  pay_status: "ACCEPTED" | "PENDING" | "WAIVED" | null;

  referral_id: string | null;
  referral_name: string | null;
};

function normalizeReferralId(raw: unknown) {
  // referralperson.id is VARCHAR(191) in your schema
  if (raw === null || raw === undefined || raw === "") return null;

  if (typeof raw === "string") {
    const v = raw.trim();
    if (!v) return null;
    if (v.length > 191) return "__INVALID__";
    return v;
  }

  // allow numeric -> string
  if (typeof raw === "number") return String(raw);

  return "__INVALID__";
}

type SqlRunner = {
  execute<T extends RowDataPacket[]>(
    sql: string,
    params?: unknown[]
  ): Promise<[T, unknown]>;
};

async function getConsultationServiceId(orgId: number, runner: SqlRunner = db) {
  const [svcRows] = await runner.execute<RowDataPacket[]>(
    `SELECT id
     FROM services
     WHERE organization_id = ?
       AND code = 'CONSULTATION'
     LIMIT 1`,
    [orgId]
  );
  return Number(svcRows[0]?.id ?? 0);
}

export async function GET(_req: Request, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me || !allowed(me)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!me.organizationId) {
    return NextResponse.json({ error: "Invalid org." }, { status: 400 });
  }
  const orgId = me.organizationId;

  const { visitId } = await ctx.params;
  const vid = Number(visitId);
  if (!Number.isFinite(vid) || vid <= 0) {
    return NextResponse.json({ error: "Invalid visitId" }, { status: 400 });
  }

  const consultationServiceId = await getConsultationServiceId(orgId, db);
  if (!consultationServiceId) {
    return NextResponse.json(
      { error: "CONSULTATION service not configured." },
      { status: 500 }
    );
  }

  const [rows] = await db.execute<VisitRow[]>(
    `
    SELECT
      v.id AS visit_id,
      DATE_FORMAT(v.visit_date, '%Y-%m-%d') AS visit_date,
      v.doctor_id,

      p.patient_code,
      p.full_name,
      p.phone,

      pay.amount,
      pay.payment_mode_code,
      pay.pay_status,

      v.referralperson_id AS referral_id,
      rp.name AS referral_name
    FROM visits v
    JOIN patients p ON p.id = v.patient_id

    /* latest consultation PAYMENT row */
    LEFT JOIN payments pay
      ON pay.id = (
        SELECT p2.id
        FROM payments p2
        WHERE p2.visit_id = v.id
          AND p2.service_id = ?
          AND p2.direction = 'PAYMENT'
        ORDER BY p2.id DESC
        LIMIT 1
      )

    LEFT JOIN referralperson rp
      ON rp.id = v.referralperson_id

    WHERE v.id = ?
    LIMIT 1
    `,
    [consultationServiceId, vid]
  );

  if (!rows.length) {
    return NextResponse.json({ error: "Visit not found" }, { status: 404 });
  }

  const r = rows[0];
  const amountNum = r.amount === null ? 0 : Number(r.amount);

  const canEditPayment = isAdmin(me);
  const canEditVisitDate = isAdmin(me);

  return NextResponse.json({
    ok: true,
    permissions: { canEditPayment, canEditVisitDate },
    visit: {
      id: r.visit_id,
      visitDate: r.visit_date,
      doctorId: r.doctor_id ?? 0,
      referral: r.referral_id
        ? { id: String(r.referral_id), name: r.referral_name ?? "" }
        : null,
    },
    patient: {
      patientCode: r.patient_code,
      name: r.full_name,
      phone: r.phone ?? "",
    },
    payment: {
      consultingFee: Number.isFinite(amountNum) ? amountNum : 0,
      paymentMode: r.payment_mode_code ?? "",
      payStatus: (r.pay_status ?? "ACCEPTED") as
        | "ACCEPTED"
        | "PENDING"
        | "WAIVED",
    },
  });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me || !allowed(me)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!me.organizationId) {
    return NextResponse.json({ error: "Invalid org." }, { status: 400 });
  }
  const orgId = me.organizationId;

  const { visitId } = await ctx.params;
  const vid = Number(visitId);
  if (!Number.isFinite(vid) || vid <= 0) {
    return NextResponse.json({ error: "Invalid visitId" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  if (!body)
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const name = String(body.name || "").trim();
  const phone = String(body.phone || "")
    .replace(/\D+/g, "")
    .slice(0, 10);

  const doctorId = Number(body.doctorId || 0);

  const referralId = normalizeReferralId(body.referralId);
  if (referralId === "__INVALID__") {
    return NextResponse.json(
      {
        error:
          "Invalid referral selected. Please choose from dropdown (don’t type a long name).",
      },
      { status: 400 }
    );
  }

  if (!name)
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  if (phone && phone.length !== 10)
    return NextResponse.json(
      { error: "phone must be 10 digits" },
      { status: 400 }
    );
  if (!doctorId)
    return NextResponse.json(
      { error: "doctorId is required" },
      { status: 400 }
    );

  const canEditPayment = isAdmin(me);
  const canEditVisitDate = isAdmin(me);

  // ✅ Reception/Data Entry: patient + doctor + referral only (NO visit_date, NO payment changes)
  if (!canEditPayment || !canEditVisitDate) {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const [vRows] = await conn.execute<RowDataPacket[]>(
        `SELECT id, patient_id FROM visits WHERE id = ? FOR UPDATE`,
        [vid]
      );
      if (!vRows.length) {
        await conn.rollback();
        return NextResponse.json({ error: "Visit not found" }, { status: 404 });
      }
      const patientId = Number(vRows[0].patient_id);

      await conn.execute(
        `UPDATE patients SET full_name = ?, phone = ? WHERE id = ?`,
        [name, phone || null, patientId]
      );

      await conn.execute(
        `UPDATE visits
         SET doctor_id = ?, referralperson_id = ?
         WHERE id = ?`,
        [doctorId, referralId, vid]
      );

      await conn.commit();
      return NextResponse.json({ ok: true });
    } catch (e) {
      console.error(e);
      try {
        await conn.rollback();
      } catch {}
      return NextResponse.json(
        { error: "Failed to update visit" },
        { status: 500 }
      );
    } finally {
      conn.release();
    }
  }

  // ✅ Admin/Super Admin: can edit visit_date + payment
  const visitDate = String(body.visitDate || "").trim();
  const consultingFee = Number(body.consultingFee || 0);
  const paymentModeCode = String(body.paymentMode || "").trim();
  const payStatus = String(body.payStatus || "").trim() as
    | "ACCEPTED"
    | "PENDING"
    | "WAIVED";

  if (!visitDate)
    return NextResponse.json(
      { error: "visitDate is required" },
      { status: 400 }
    );
  if (!Number.isFinite(consultingFee) || consultingFee < 0)
    return NextResponse.json(
      { error: "Invalid consultingFee" },
      { status: 400 }
    );
  if (!paymentModeCode)
    return NextResponse.json(
      { error: "paymentMode is required" },
      { status: 400 }
    );
  if (!["ACCEPTED", "PENDING", "WAIVED"].includes(payStatus))
    return NextResponse.json({ error: "Invalid payStatus" }, { status: 400 });

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const consultationServiceId = await getConsultationServiceId(orgId, conn);
    if (!consultationServiceId) {
      await conn.rollback();
      return NextResponse.json(
        { error: "CONSULTATION service not configured." },
        { status: 500 }
      );
    }

    const [vRows] = await conn.execute<RowDataPacket[]>(
      `SELECT id, patient_id FROM visits WHERE id = ? FOR UPDATE`,
      [vid]
    );
    if (!vRows.length) {
      await conn.rollback();
      return NextResponse.json({ error: "Visit not found" }, { status: 404 });
    }
    const patientId = Number(vRows[0].patient_id);

    await conn.execute(
      `UPDATE patients SET full_name = ?, phone = ? WHERE id = ?`,
      [name, phone || null, patientId]
    );

    await conn.execute(
      `UPDATE visits
       SET visit_date = ?, doctor_id = ?, referralperson_id = ?
       WHERE id = ?`,
      [visitDate, doctorId, referralId, vid]
    );

    // Lock latest consultation payment row
    const [pRows] = await conn.execute<RowDataPacket[]>(
      `
      SELECT id
      FROM payments
      WHERE visit_id = ?
        AND service_id = ?
        AND direction = 'PAYMENT'
      ORDER BY id DESC
      LIMIT 1
      FOR UPDATE
      `,
      [vid, consultationServiceId]
    );

    if (pRows.length) {
      const payId = Number(pRows[0].id);

      if (payStatus === "WAIVED") {
        await conn.execute<ResultSetHeader>(
          `UPDATE payments
           SET payment_mode_code = ?, pay_status = ?
           WHERE id = ?`,
          [paymentModeCode, payStatus, payId]
        );
      } else {
        const amt = Math.max(consultingFee, 0.01);
        await conn.execute<ResultSetHeader>(
          `UPDATE payments
           SET amount = ?, payment_mode_code = ?, pay_status = ?
           WHERE id = ?`,
          [amt, paymentModeCode, payStatus, payId]
        );
      }
    } else {
      if (payStatus !== "WAIVED") {
        const amt = Math.max(consultingFee, 0.01);
        await conn.execute<ResultSetHeader>(
          `
          INSERT INTO payments (visit_id, service_id, amount, payment_mode_code, pay_status, direction)
          VALUES (?, ?, ?, ?, ?, 'PAYMENT')
          `,
          [vid, consultationServiceId, amt, paymentModeCode, payStatus]
        );
      }
    }

    await conn.commit();
    return NextResponse.json({ ok: true });
  } catch (e) {
    await conn.rollback();
    console.error(e);
    return NextResponse.json(
      { error: "Failed to update visit" },
      { status: 500 }
    );
  } finally {
    conn.release();
  }
}
