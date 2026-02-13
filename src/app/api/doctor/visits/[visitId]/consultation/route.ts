// src/app/api/doctor/visits/[visitId]/consultation/route.ts
import { NextResponse } from "next/server";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import type { Pool, PoolConnection } from "mysql2/promise";

type Ctx = { params: Promise<{ visitId: string }> };
type ServiceRow = RowDataPacket & { id: number; code: string };
type DbLike = Pool | PoolConnection;

type VisitRow = RowDataPacket & {
  visitId: number;
  visitDate: string;
  patientCode: string;
  patientName: string;
  doctorId: number;
};

type NoteRow = RowDataPacket & {
  diagnosis: string | null;
  investigation: string | null;
  treatment: string | null;
  remarks: string | null;
};

type RxRow = RowDataPacket & {
  prescriptionId: number;
  notes: string | null;
};

type RxItemRow = RowDataPacket & {
  id: number;
  medicine_name: string;
  dosage: string | null;
  morning: number;
  afternoon: number;
  night: number;
  before_food: number;
  duration_days: number | null;
  instructions: string | null;
  sort_order: number;
};

type OrderRow = RowDataPacket & {
  id: number;
  service_code: string;
  notes: string | null;
  status: "ORDERED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  ordered_at: string;
};

type UserLike = { roles?: string[] } | null | undefined;

function mustBeDoctor(me: UserLike) {
  const roles = me?.roles ?? [];
  return (
    roles.includes("DOCTOR") ||
    roles.includes("ADMIN") ||
    roles.includes("SUPER_ADMIN")
  );
}

function isAdmin(me: { roles: string[] }) {
  return me.roles.includes("ADMIN") || me.roles.includes("SUPER_ADMIN");
}

async function resolveDoctorIdForUser(args: {
  userId: number;
  orgId: number;
  branchId: number;
}): Promise<number | null> {
  // Preferred (multi-branch): doctor_users + doctor_branch_assignments
  const [rows] = await db.execute<RowDataPacket[]>(
    `
    SELECT dba.doctor_id AS id
    FROM doctor_users du
    JOIN doctor_branch_assignments dba
      ON dba.organization_id = du.organization_id
     AND dba.doctor_id = du.doctor_id
     AND dba.branch_id = :branch
     AND dba.is_active = 1
     AND (dba.starts_on IS NULL OR dba.starts_on <= CURDATE())
     AND (dba.ends_on IS NULL OR dba.ends_on >= CURDATE())
    WHERE du.user_id = :uid
      AND du.organization_id = :org
      AND du.is_active = 1
    LIMIT 1
    `,
    { uid: args.userId, org: args.orgId, branch: args.branchId }
  );

  if (rows.length > 0) {
    const id = Number(rows[0].id);
    return Number.isFinite(id) && id > 0 ? id : null;
  }

  // Backward compatible fallback: doctors.user_id
  const [legacy] = await db.execute<RowDataPacket[]>(
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

  if (legacy.length === 0) return null;
  const id = Number(legacy[0].id);
  return Number.isFinite(id) && id > 0 ? id : null;
}

type SavePayload = {
  diagnosis?: string;
  investigation?: string;
  treatment?: string;
  remarks?: string;

  orders?: {
    scan?: { needed: boolean; details: string };
    pap?: { needed: boolean; details: string };
    ctg?: { needed: boolean; details: string };
    lab?: { needed: boolean; details: string };
  };

  prescription?: {
    notes?: string;
    items?: Array<{
      medicineName: string;
      dosage?: string;
      morning: boolean;
      afternoon: boolean;
      night: boolean;
      beforeFood: boolean;
      durationDays?: number | null;
      instructions?: string;
      sortOrder: number;
    }>;
  };

  chargeAdjustments?: Array<{
    serviceId: number; // 0 means "Consultation" (resolved in backend)
    waive: boolean;
    mode: "PERCENT" | "AMOUNT";
    percent?: number | null;
    amount?: number | null;
    reason?: string | null;
  }>;
};

type ServiceCode = "SCAN" | "PAP" | "CTG" | "LAB";

async function getServiceIdMap(connOrDb: DbLike, args: { orgId: number }) {
  const [rows] = await connOrDb.execute<ServiceRow[]>(
    `
    SELECT id, code
    FROM services
    WHERE organization_id = :org
      AND is_active = 1
      AND code IN ('SCAN','PAP','CTG','LAB')
    `,
    { org: args.orgId }
  );

  const map = new Map<ServiceCode, number>();
  for (const r of rows) {
    const code = String(r.code) as ServiceCode;
    const id = Number(r.id);
    if (Number.isFinite(id) && id > 0) map.set(code, id);
  }
  return map;
}

async function resolveConsultationServiceId(connOrDb: DbLike, args: { orgId: number }) {
  const [rows] = await connOrDb.execute<RowDataPacket[]>(
    `
    SELECT id, code, display_name
    FROM services
    WHERE organization_id = :org
      AND is_active = 1
      AND (
        code = 'CONSULTATION'
        OR LOWER(display_name) LIKE '%consult%'
      )
    ORDER BY
      CASE WHEN code = 'CONSULTATION' THEN 0 ELSE 1 END,
      id ASC
    LIMIT 1
    `,
    { org: args.orgId }
  );

  if (rows.length === 0) return null;
  const id = Number(rows[0].id);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function toNullableInt(v: number | "" | null | undefined): number | null {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function GET(req: Request, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!mustBeDoctor(me))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { visitId } = await ctx.params;
  const id = Number(visitId);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid visitId." }, { status: 400 });
  }

  const orgId = me.organizationId != null ? Number(me.organizationId) : NaN;
  const branchId = me.branchId != null ? Number(me.branchId) : NaN;
  if (!Number.isFinite(orgId) || !Number.isFinite(branchId)) {
    return NextResponse.json(
      { error: "Invalid org/branch in session." },
      { status: 400 }
    );
  }

  const admin = isAdmin(me);

  const doctorId = admin
    ? null
    : await resolveDoctorIdForUser({
        userId: me.id,
        orgId,
        branchId,
      });

  if (!admin && !doctorId) {
    return NextResponse.json(
      { error: "Doctor account not linked to doctor profile." },
      { status: 400 }
    );
  }

  const [vRows] = await db.execute<VisitRow[]>(
    `
    SELECT
      v.id AS visitId,
      v.visit_date AS visitDate,
      p.patient_code AS patientCode,
      p.full_name AS patientName,
      v.doctor_id AS doctorId
    FROM visits v
    JOIN patients p ON p.id = v.patient_id
    WHERE v.id = :visitId
      AND v.organization_id = :org
      AND v.branch_id = :branch
    LIMIT 1
    `,
    { visitId: id, org: orgId, branch: branchId }
  );

  if (vRows.length === 0) {
    return NextResponse.json({ error: "Visit not found." }, { status: 404 });
  }

  if (!admin && vRows[0].doctorId !== doctorId) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const [nRows] = await db.execute<NoteRow[]>(
    `SELECT diagnosis, investigation, treatment, remarks FROM visit_notes WHERE visit_id = :visitId LIMIT 1`,
    { visitId: id }
  );

  const [rxRows] = await db.execute<RxRow[]>(
    `SELECT id AS prescriptionId, notes FROM prescriptions WHERE visit_id = :visitId LIMIT 1`,
    { visitId: id }
  );

  const prescriptionId = rxRows[0]?.prescriptionId ?? null;

  const items: RxItemRow[] = [];
  if (prescriptionId) {
    const [rows] = await db.execute<RxItemRow[]>(
      `
      SELECT
        id, medicine_name, dosage, morning, afternoon, night, before_food,
        duration_days, instructions, sort_order
      FROM prescription_items
      WHERE prescription_id = :pid
      ORDER BY sort_order ASC, id ASC
      `,
      { pid: prescriptionId }
    );
    items.push(...rows);
  }

  const [orders] = await db.execute<OrderRow[]>(
    `
    SELECT o.id, s.code AS service_code, o.notes, o.status, o.ordered_at
    FROM visit_orders o
    JOIN services s ON s.id = o.service_id
    WHERE o.visit_id = :visitId
      AND s.code IN ('SCAN','PAP','CTG','LAB')
      AND o.status <> 'CANCELLED'
    ORDER BY o.ordered_at ASC, o.id ASC
    `,
    { visitId: id }
  );

  // Fee components for this visit (dropdown + computation)
  const [feeRows] = await db.execute<RowDataPacket[]>(
    `
    SELECT
      vc.service_id AS serviceId,
      s.code AS code,
      s.display_name AS displayName,
      vc.gross_amount AS grossAmount,
      vc.discount_amount AS discountAmount,
      vc.net_amount AS netAmount
    FROM visit_charges vc
    JOIN services s ON s.id = vc.service_id
    WHERE vc.visit_id = :visitId
      AND s.organization_id = :org
      AND s.is_active = 1
    ORDER BY s.display_name ASC
    `,
    { visitId: id, org: orgId }
  );

  // Latest adjustment per service for this visit (if any)
  const [adjRows] = await db.execute<RowDataPacket[]>(
    `
    SELECT a.service_id AS serviceId,
           a.old_gross_amount AS oldGrossAmount,
           a.old_discount_amount AS oldDiscountAmount,
           a.old_net_amount AS oldNetAmount,
           a.new_discount_amount AS newDiscountAmount,
           a.new_net_amount AS newNetAmount,
           a.reason,
           a.created_at AS createdAt
    FROM consultation_charge_adjustments a
    JOIN (
      SELECT service_id, MAX(created_at) AS max_created_at
      FROM consultation_charge_adjustments
      WHERE visit_id = :visitId
      GROUP BY service_id
    ) x ON x.service_id = a.service_id AND x.max_created_at = a.created_at
    WHERE a.visit_id = :visitId
    `,
    { visitId: id }
  );


  return NextResponse.json({
    ok: true,

    visit: {
      visitId: Number(vRows[0].visitId),
      visitDate: String(vRows[0].visitDate).slice(0, 10),
      patientCode: String(vRows[0].patientCode),
      patientName: String(vRows[0].patientName),
      // doctorId: Number(vRows[0].doctorId), // include ONLY if your client expects it
    },

    note: nRows[0]
      ? {
          diagnosis: nRows[0].diagnosis ?? null,
          investigation: nRows[0].investigation ?? null,
          treatment: nRows[0].treatment ?? null,
          remarks: nRows[0].remarks ?? null,
        }
      : null,

    prescription: rxRows[0]
      ? {
          prescriptionId: Number(rxRows[0].prescriptionId),
          notes: rxRows[0].notes ?? null,
        }
      : null,

    prescriptionItems: items.map((it) => ({
      id: Number(it.id),
      medicineName: String(it.medicine_name),
      dosage: it.dosage ?? null,
      morning: Number(it.morning) === 1,
      afternoon: Number(it.afternoon) === 1,
      night: Number(it.night) === 1,
      beforeFood: Number(it.before_food) === 1,
      durationDays: it.duration_days == null ? null : Number(it.duration_days),
      instructions: it.instructions ?? null,
      sortOrder: Number(it.sort_order ?? 0),
    })),

    orders: orders.map((o) => ({
      id: Number(o.id),
      orderType:
        String(o.service_code) === "PAP"
          ? "PAP_SMEAR"
          : (String(o.service_code) as "SCAN" | "PAP_SMEAR" | "CTG" | "LAB"),
      details: o.notes ?? "", // map notes -> details
      status: o.status, // "ORDERED" | "IN_PROGRESS" | "COMPLETED"
      createdAt: String(o.ordered_at), // map ordered_at -> createdAt
    })),

    feeComponents: feeRows.map((r) => ({
      serviceId: Number(r.serviceId),
      code: String(r.code),
      displayName: String(r.displayName),
      grossAmount: Number(r.grossAmount),
      discountAmount: Number(r.discountAmount),
      netAmount: Number(r.netAmount),
    })),

    chargeAdjustments: adjRows.map((r) => ({
      serviceId: Number(r.serviceId),
      oldGrossAmount: Number(r.oldGrossAmount),
      oldDiscountAmount: Number(r.oldDiscountAmount),
      oldNetAmount: Number(r.oldNetAmount),
      newDiscountAmount: Number(r.newDiscountAmount),
      newNetAmount: Number(r.newNetAmount),
      reason: String(r.reason || ""),
      createdAt: String(r.createdAt || ""),
    })),

  });
}

export async function POST(req: Request, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!mustBeDoctor(me))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { visitId } = await ctx.params;
  const id = Number(visitId);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid visitId." }, { status: 400 });
  }

  const orgId = me.organizationId != null ? Number(me.organizationId) : NaN;
  const branchId = me.branchId != null ? Number(me.branchId) : NaN;
  if (!Number.isFinite(orgId) || !Number.isFinite(branchId)) {
    return NextResponse.json(
      { error: "Invalid org/branch in session." },
      { status: 400 }
    );
  }

  const admin = isAdmin(me);

  const doctorId = admin
    ? null
    : await resolveDoctorIdForUser({
        userId: me.id,
        orgId,
        branchId,
      });

  if (!admin && !doctorId) {
    return NextResponse.json(
      { error: "Doctor account not linked to doctor profile." },
      { status: 400 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as SavePayload;

  const [vRows] = await db.execute<RowDataPacket[]>(
    `
    SELECT v.id, v.doctor_id
    FROM visits v
    WHERE v.id = :visitId
      AND v.organization_id = :org
      AND v.branch_id = :branch
    LIMIT 1
    `,
    { visitId: id, org: orgId, branch: branchId }
  );

  if (vRows.length === 0) {
    return NextResponse.json({ error: "Visit not found." }, { status: 404 });
  }

  if (!admin && Number(vRows[0].doctor_id) !== doctorId) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // 1) Upsert visit_notes
    await conn.execute<ResultSetHeader>(
      `
      INSERT INTO visit_notes (visit_id, diagnosis, investigation, treatment, remarks, created_by)
      VALUES (:visitId, :diagnosis, :investigation, :treatment, :remarks, :by)
      ON DUPLICATE KEY UPDATE
        diagnosis = VALUES(diagnosis),
        investigation = VALUES(investigation),
        treatment = VALUES(treatment),
        remarks = VALUES(remarks),
        updated_at = CURRENT_TIMESTAMP
      `,
      {
        visitId: id,
        diagnosis: body.diagnosis ?? null,
        investigation: body.investigation ?? null,
        treatment: body.treatment ?? null,
        remarks: body.remarks ?? null,
        by: me.id,
      }
    );

    // 1.5) Insert fee waiver/discount adjustments (do NOT overwrite visit_charges)
    const drafts = Array.isArray((body as any).chargeAdjustments)
      ? ((body as any).chargeAdjustments as SavePayload["chargeAdjustments"])
      : [];

    if (drafts && drafts.length > 0) {
      const [chargeRows] = await conn.execute<RowDataPacket[]>(
        `
        SELECT service_id AS serviceId, gross_amount AS grossAmount,
               discount_amount AS discountAmount, net_amount AS netAmount
        FROM visit_charges
        WHERE visit_id = :visitId
        `,
        { visitId: id }
      );

      const chargeMap = new Map<number, { gross: number; disc: number; net: number }>();
      for (const r of chargeRows) {
        chargeMap.set(Number(r.serviceId), {
          gross: Number(r.grossAmount),
          disc: Number(r.discountAmount),
          net: Number(r.netAmount),
        });
      }

      for (const d of drafts) {
        let serviceId = Number((d as any)?.serviceId);
        // ✅ Map serviceId=0 => Consultation serviceId
  if (serviceId === 0) {
    const consultationServiceId = await resolveConsultationServiceId(conn, { orgId });
    if (!consultationServiceId) {
      throw new Error(
        "Consultation service not configured (code='CONSULTATION' or display_name contains 'Consult')."
      );
    }
    serviceId = consultationServiceId;
  }

        if (!Number.isFinite(serviceId) || serviceId <= 0) continue;

        const ch = chargeMap.get(serviceId);
        if (!ch) {
          throw new Error(`No visit charge found for serviceId=${serviceId}`);
        }

        const waive = !!(d as any).waive;
        const mode = (d as any).mode === "PERCENT" ? "PERCENT" : "AMOUNT";
        const pct = Number((d as any).percent ?? 0);
        const amt = Number((d as any).amount ?? 0);

        const oldGross = ch.gross;
        const oldDisc = ch.disc;
        const oldNet = ch.net;

        let discountOff = 0;

        if (waive) {
          // Make net 0 by setting discount to gross
          discountOff = oldNet;
        } else if (mode === "PERCENT") {
          const p = Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 0));
          discountOff = (oldNet * p) / 100;
        } else {
          const a = Math.max(0, Number.isFinite(amt) ? amt : 0);
          discountOff = Math.min(oldNet, a);
        }

        discountOff = Math.round(discountOff * 100) / 100;

        const newNet = Math.round(Math.max(0, oldNet - discountOff) * 100) / 100;
        const newDisc = Math.round(Math.min(oldGross, oldDisc + discountOff) * 100) / 100;

        const reasonRaw =
          typeof (d as any).reason === "string" ? (d as any).reason.trim() : "";
        const reason =
          reasonRaw ? reasonRaw.slice(0, 500) : "Doctor discount/waiver";

        await conn.execute<ResultSetHeader>(
          `
          INSERT INTO consultation_charge_adjustments
            (visit_id, service_id,
             old_gross_amount, old_discount_amount, old_net_amount,
             new_discount_amount, new_net_amount,
             refund_amount, refund_payment_id,
             reason, authorized_by_doctor_id, created_by)
          VALUES
            (:visitId, :serviceId,
             :oldGross, :oldDisc, :oldNet,
             :newDisc, :newNet,
             0.00, NULL,
             :reason, :authDoctorId, :createdBy)
          `,
          {
            visitId: id,
            serviceId,
            oldGross,
            oldDisc,
            oldNet,
            newDisc,
            newNet,
            reason,
            authDoctorId: Number(vRows[0].doctor_id), // visits.doctor_id (doctors.id)
            createdBy: me.id, // users.id
          }
        );
      }
    }

    // 2) Orders (visit_orders uses `notes`, ordered_at, ordered_by_user_id)
    const serviceIdMap = await getServiceIdMap(conn, { orgId });

    const orderMap: Array<{
      code: ServiceCode;
      needed: boolean;
      notes: string;
    }> = [
      {
        code: "SCAN",
        needed: !!body.orders?.scan?.needed,
        notes: body.orders?.scan?.details ?? "",
      },
      {
        code: "PAP",
        needed: !!body.orders?.pap?.needed,
        notes: body.orders?.pap?.details ?? "",
      },
      {
        code: "CTG",
        needed: !!body.orders?.ctg?.needed,
        notes: body.orders?.ctg?.details ?? "",
      },
      {
        code: "LAB",
        needed: !!body.orders?.lab?.needed,
        notes: body.orders?.lab?.details ?? "",
      },
    ];

    for (const o of orderMap) {
      const serviceId = serviceIdMap.get(o.code);
      if (!serviceId) {
        throw new Error(`Service not configured for org: ${o.code}`);
      }
      const [existing] = await conn.execute<RowDataPacket[]>(
        `
        SELECT id, status
        FROM visit_orders
        WHERE visit_id = :visitId
          AND service_id = :serviceId
          AND status <> 'CANCELLED'
        ORDER BY id DESC
        LIMIT 1
        `,
        { visitId: id, serviceId }
      );

      if (o.needed) {
        if (existing.length === 0) {
          await conn.execute(
            `
            INSERT INTO visit_orders (visit_id, service_id, notes, status, ordered_by_user_id)
            VALUES (:visitId, :serviceId, :notes, 'ORDERED', :by)
            `,
            { visitId: id, serviceId, notes: o.notes || null, by: me.id }
          );
        } else {
          // allow updating notes while still ORDERED/IN_PROGRESS
          await conn.execute(
            `UPDATE visit_orders SET notes = :notes WHERE id = :id`,
            { notes: o.notes || null, id: Number(existing[0].id) }
          );
        }
      } else {
        // Cancel only if still ORDERED (don’t cancel if department already started)
        if (existing.length > 0 && String(existing[0].status) === "ORDERED") {
          await conn.execute(
            `UPDATE visit_orders SET status = 'CANCELLED' WHERE id = :id`,
            { id: Number(existing[0].id) }
          );
        }
      }
    }

    // 3) Upsert prescription header
    const [rxRows] = await conn.execute<RowDataPacket[]>(
      `SELECT id FROM prescriptions WHERE visit_id = :visitId LIMIT 1`,
      { visitId: id }
    );

    let rxId: number;
    if (rxRows.length === 0) {
      const [ins] = await conn.execute<ResultSetHeader>(
        `INSERT INTO prescriptions (visit_id, notes, created_by) VALUES (:visitId, :notes, :by)`,
        { visitId: id, notes: body.prescription?.notes ?? null, by: me.id }
      );
      rxId = Number(ins.insertId);
    } else {
      rxId = Number(rxRows[0].id);
      await conn.execute(
        `UPDATE prescriptions SET notes = :notes WHERE id = :id`,
        { notes: body.prescription?.notes ?? null, id: rxId }
      );
    }

    // 4) Replace prescription items (v1 simplest)
    await conn.execute(
      `DELETE FROM prescription_items WHERE prescription_id = :pid`,
      { pid: rxId }
    );

    const items = body.prescription?.items ?? [];
    let insertedRxItems = 0;
    for (const it of items) {
      const med = String(it.medicineName ?? "").trim();
      if (!med) continue;

      await conn.execute(
        `
        INSERT INTO prescription_items
          (prescription_id, medicine_name, dosage, morning, afternoon, night, before_food, duration_days, instructions, sort_order)
        VALUES
          (:pid, :med, :dosage, :m, :a, :n, :bf, :days, :instr, :sort)
        `,
        {
          pid: rxId,
          med,
          dosage: it.dosage ? String(it.dosage).trim() : null,
          m: it.morning ? 1 : 0,
          a: it.afternoon ? 1 : 0,
          n: it.night ? 1 : 0,
          bf: it.beforeFood ? 1 : 0,
          days: toNullableInt(it.durationDays ?? null),
          instr: it.instructions ? String(it.instructions).trim() : null,
          sort: Number.isFinite(it.sortOrder) ? it.sortOrder : 0,
        }
      );
      insertedRxItems += 1;
    }

    // 5) Upsert pharma_orders (for Pharmacy dashboard + reports)
    // Create/update PENDING order if prescription has at least one item.
    if (insertedRxItems > 0) {
      const [poRows] = await conn.execute<RowDataPacket[]>(
        `SELECT id, status FROM pharma_orders WHERE visit_id = :visitId LIMIT 1`,
        { visitId: id }
      );

      if (poRows.length === 0) {
        await conn.execute(
          `
          INSERT INTO pharma_orders (visit_id, prescription_id, status, updated_by, updated_at)
          VALUES (:visitId, :rxId, 'PENDING', :by, NOW())
          `,
          { visitId: id, rxId, by: me.id }
        );
      } else {
        const poId = Number(poRows[0].id);
        const existingStatus = String(
          poRows[0].status || "PENDING"
        ).toUpperCase();

        // Do not override PURCHASED / NOT_PURCHASED if pharmacy already acted
        const nextStatus =
          existingStatus === "PURCHASED" || existingStatus === "NOT_PURCHASED"
            ? existingStatus
            : "PENDING";

        await conn.execute(
          `
          UPDATE pharma_orders
          SET prescription_id = :rxId,
              status = :status,
              updated_by = :by,
              updated_at = NOW()
          WHERE id = :id
          `,
          { rxId, status: nextStatus, by: me.id, id: poId }
        );
      }
    } else {
      // If doctor removed all prescription items and pharmacy hasn't processed it yet, remove pending record.
      await conn.execute(
        `DELETE FROM pharma_orders WHERE visit_id = :visitId AND status = 'PENDING'`,
        { visitId: id }
      );
    }
    await conn.commit();
    return NextResponse.json({ ok: true });
  } catch (e) {
    await conn.rollback();
    console.error("❌ Save consultation failed:", e);
    return NextResponse.json(
      { error: "Failed to save consultation." },
      { status: 500 }
    );
  } finally {
    conn.release();
  }
}
