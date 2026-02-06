// src\app\api\reception\visits\[visitId]\route.ts
import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

type Ctx = { params: Promise<{ visitId: string }> };

function allowed(me: { roles?: string[] } | null | undefined) {
  const roles = me?.roles ?? [];
  return (
    roles.includes("RECEPTION") ||
    roles.includes("ADMIN") ||
    roles.includes("SUPER_ADMIN")
  );
}

type VisitRow = RowDataPacket & {
  visit_id: number;
  visit_date: string;
  doctor_id: number | null;

  patient_code: string;
  full_name: string;
  phone: string | null;

  amount: number | null;
  payment_mode: string | null;
  pay_status: "ACCEPTED" | "PENDING" | "WAIVED" | null;

  referral_id: string | number | null;
  referral_name: string | null;
};

function normalizeReferralId(raw: unknown) {
  if (raw === null || raw === undefined || raw === "") return null;

  if (typeof raw === "number") return raw;

  if (typeof raw === "string") {
    const v = raw.trim();

    // numeric id
    if (/^\d+$/.test(v)) return Number(v);

    // if your DB stores referralperson_id as VARCHAR code, allow short values only
    if (v.length > 64) return "__INVALID__";
    return v;
  }

  return "__INVALID__";
}

export async function GET(_req: Request, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me || !allowed(me)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { visitId } = await ctx.params;
  const vid = Number(visitId);
  if (!Number.isFinite(vid) || vid <= 0) {
    return NextResponse.json({ error: "Invalid visitId" }, { status: 400 });
  }

  // NOTE: change `referralperson rp` to your actual referral table name if different.
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
      pay.payment_mode,
      pay.pay_status,

      v.referralperson_id AS referral_id,
      rp.name AS referral_name
    FROM visits v
    JOIN patients p ON p.id = v.patient_id
    LEFT JOIN payments pay
      ON pay.visit_id = v.id AND pay.fee_type = 'CONSULTATION'
    LEFT JOIN referralperson rp
      ON rp.id = v.referralperson_id
    WHERE v.id = ?
    LIMIT 1
    `,
    [vid]
  );

  if (!rows.length) {
    return NextResponse.json({ error: "Visit not found" }, { status: 404 });
  }

  const r = rows[0];

  return NextResponse.json({
    ok: true,
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
      consultingFee: r.amount ?? 0,
      paymentMode: r.payment_mode ?? "",
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

  const { visitId } = await ctx.params;
  const vid = Number(visitId);
  if (!Number.isFinite(vid) || vid <= 0) {
    return NextResponse.json({ error: "Invalid visitId" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  if (!body)
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const visitDate = String(body.visitDate || "").trim();
  const name = String(body.name || "").trim();
  const phone = String(body.phone || "")
    .replace(/\D+/g, "")
    .slice(0, 10);

  const doctorId = Number(body.doctorId || 0);
  const consultingFee = Number(body.consultingFee || 0);
  const paymentMode = String(body.paymentMode || "").trim();
  const payStatus = String(body.payStatus || "").trim() as
    | "ACCEPTED"
    | "PENDING"
    | "WAIVED";

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

  if (!visitDate)
    return NextResponse.json(
      { error: "visitDate is required" },
      { status: 400 }
    );
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
  if (!Number.isFinite(consultingFee) || consultingFee < 0)
    return NextResponse.json(
      { error: "Invalid consultingFee" },
      { status: 400 }
    );
  if (!paymentMode)
    return NextResponse.json(
      { error: "paymentMode is required" },
      { status: 400 }
    );
  if (!["ACCEPTED", "PENDING", "WAIVED"].includes(payStatus))
    return NextResponse.json({ error: "Invalid payStatus" }, { status: 400 });

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
       SET visit_date = ?, doctor_id = ?, referralperson_id = ?
       WHERE id = ?`,
      [visitDate, doctorId, referralId, vid]
    );

    const [pRows] = await conn.execute<RowDataPacket[]>(
      `SELECT id FROM payments WHERE visit_id = ? AND fee_type = 'CONSULTATION' FOR UPDATE`,
      [vid]
    );

    if (pRows.length) {
      await conn.execute(
        `UPDATE payments
         SET amount = ?, payment_mode = ?, pay_status = ?
         WHERE visit_id = ? AND fee_type = 'CONSULTATION'`,
        [consultingFee, paymentMode, payStatus, vid]
      );
    } else {
      await conn.execute(
        `INSERT INTO payments (visit_id, fee_type, amount, payment_mode, pay_status)
         VALUES (?, 'CONSULTATION', ?, ?, ?)`,
        [vid, consultingFee, paymentMode, payStatus]
      );
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
