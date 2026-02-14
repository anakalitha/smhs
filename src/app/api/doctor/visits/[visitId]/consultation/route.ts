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

  // ✅ Single source of truth for discount notes (all fee components)
  discountNotes?: Partial<
    Record<"SCAN" | "PAP" | "CTG" | "LAB" | "PHARMA" | "CONSULTATION", string>
  >;

  // (Optional legacy; safe to keep if older clients still send it)
  chargeAdjustments?: Array<{
    serviceId: number;
    waive: boolean;
    mode: "PERCENT" | "AMOUNT";
    percent?: number | null;
    amount?: number | null;
    reason?: string | null;
  }>;
};

type ServiceCode = "SCAN" | "PAP" | "CTG" | "LAB" | "PHARMA" | "CONSULTATION";

async function getServiceIds(connOrDb: DbLike, args: { orgId: number }) {
  const [rows] = await connOrDb.execute<ServiceRow[]>(
    `
    SELECT id, code
    FROM services
    WHERE organization_id = :org
      AND is_active = 1
      AND code IN ('SCAN','PAP','CTG','LAB','PHARMA','CONSULTATION')
    `,
    { org: args.orgId }
  );

  const map = new Map<ServiceCode, number>();
  for (const r of rows) {
    const code = String(r.code).toUpperCase() as ServiceCode;
    const id = Number(r.id);
    if (Number.isFinite(id) && id > 0) map.set(code, id);
  }
  return map;
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

  const user = me; // TS narrow helper
  const { visitId } = await ctx.params;
  const id = Number(visitId);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid visitId." }, { status: 400 });
  }

  const orgId = user.organizationId != null ? Number(user.organizationId) : NaN;
  const branchId = user.branchId != null ? Number(user.branchId) : NaN;
  if (!Number.isFinite(orgId) || !Number.isFinite(branchId)) {
    return NextResponse.json(
      { error: "Invalid org/branch in session." },
      { status: 400 }
    );
  }

  const admin = isAdmin(user);

  const doctorId = admin
    ? null
    : await resolveDoctorIdForUser({
        userId: user.id,
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

  // ✅ Load discount notes (single source)
  const [dnRows] = await db.execute<RowDataPacket[]>(
    `
    SELECT s.code AS code, vdn.discount_note AS discountNote
    FROM visit_discount_notes vdn
    JOIN services s ON s.id = vdn.service_id
    WHERE vdn.visit_id = :visitId
      AND s.organization_id = :org
    `,
    { visitId: id, org: orgId }
  );

  const discountNotes: Record<string, string> = {};
  for (const r of dnRows) {
    const code = String(r.code || "").toUpperCase();
    const note = (r.discountNote ?? "").toString();
    if (code) discountNotes[code] = note;
  }

  return NextResponse.json({
    ok: true,

    visit: {
      visitId: Number(vRows[0].visitId),
      visitDate: String(vRows[0].visitDate).slice(0, 10),
      patientCode: String(vRows[0].patientCode),
      patientName: String(vRows[0].patientName),
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
      details: o.notes ?? "",
      status: o.status,
      createdAt: String(o.ordered_at),
    })),

    discountNotes,
  });
}

export async function POST(req: Request, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!mustBeDoctor(me))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const user = me; // TS narrow helper
  const { visitId } = await ctx.params;
  const id = Number(visitId);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid visitId." }, { status: 400 });
  }

  const orgId = user.organizationId != null ? Number(user.organizationId) : NaN;
  const branchId = user.branchId != null ? Number(user.branchId) : NaN;
  if (!Number.isFinite(orgId) || !Number.isFinite(branchId)) {
    return NextResponse.json(
      { error: "Invalid org/branch in session." },
      { status: 400 }
    );
  }

  const admin = isAdmin(user);

  const doctorId = admin
    ? null
    : await resolveDoctorIdForUser({
        userId: user.id,
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
        by: user.id,
      }
    );

    // 2) Orders
    const serviceIdMap = await getServiceIds(conn, { orgId });

    const orderMap: Array<{
      code: "SCAN" | "PAP" | "CTG" | "LAB";
      needed: boolean;
      notes: string;
    }> = [
      { code: "SCAN", needed: !!body.orders?.scan?.needed, notes: body.orders?.scan?.details ?? "" },
      { code: "PAP", needed: !!body.orders?.pap?.needed, notes: body.orders?.pap?.details ?? "" },
      { code: "CTG", needed: !!body.orders?.ctg?.needed, notes: body.orders?.ctg?.details ?? "" },
      { code: "LAB", needed: !!body.orders?.lab?.needed, notes: body.orders?.lab?.details ?? "" },
    ];

    for (const o of orderMap) {
      const serviceId = serviceIdMap.get(o.code);
      if (!serviceId) throw new Error(`Service not configured for org: ${o.code}`);

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
            { visitId: id, serviceId, notes: o.notes || null, by: user.id }
          );
        } else {
          await conn.execute(
            `UPDATE visit_orders SET notes = :notes WHERE id = :id`,
            { notes: o.notes || null, id: Number(existing[0].id) }
          );
        }
      } else {
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
        { visitId: id, notes: body.prescription?.notes ?? null, by: user.id }
      );
      rxId = Number(ins.insertId);
    } else {
      rxId = Number(rxRows[0].id);
      await conn.execute(`UPDATE prescriptions SET notes = :notes WHERE id = :id`, {
        notes: body.prescription?.notes ?? null,
        id: rxId,
      });
    }

    // 4) Replace prescription items
    await conn.execute(`DELETE FROM prescription_items WHERE prescription_id = :pid`, { pid: rxId });

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

    // 5) Upsert pharma_orders
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
          { visitId: id, rxId, by: user.id }
        );
      } else {
        const poId = Number(poRows[0].id);
        const existingStatus = String(poRows[0].status || "PENDING").toUpperCase();

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
          { rxId, status: nextStatus, by: user.id, id: poId }
        );
      }
    } else {
      await conn.execute(
        `DELETE FROM pharma_orders WHERE visit_id = :visitId AND status = 'PENDING'`,
        { visitId: id }
      );
    }

    // ✅ 6) Upsert discount notes into visit_discount_notes (single source)
    const dn = (body.discountNotes ?? {}) as Record<string, string>;
    const codes: ServiceCode[] = ["SCAN", "PAP", "CTG", "LAB", "PHARMA", "CONSULTATION"];
    const neededMap: Record<string, boolean> = {
      SCAN: !!body.orders?.scan?.needed,
      PAP:  !!body.orders?.pap?.needed,
      CTG:  !!body.orders?.ctg?.needed,
      LAB:  !!body.orders?.lab?.needed,
      // these are not tied to orders checkbox
      PHARMA: true,
      CONSULTATION: true,
    };

    async function upsertOrDeleteDiscountNote(serviceId: number, note: string) {
      const clean = (note || "").trim();

      if (!clean) {
        await conn.execute(
          `DELETE FROM visit_discount_notes WHERE visit_id = :visitId AND service_id = :serviceId`,
          { visitId: id, serviceId }
        );
        return;
      }

      await conn.execute(
        `
        INSERT INTO visit_discount_notes (visit_id, service_id, discount_note, created_by)
        VALUES (:visitId, :serviceId, :note, :by)
        ON DUPLICATE KEY UPDATE
          discount_note = VALUES(discount_note),
          updated_at = CURRENT_TIMESTAMP
        `,
        {
          visitId: id,
          serviceId,
          note: clean.slice(0, 500),
          by: user.id, // ✅ FIXED (was wrongly using visitId)
        }
      );
    }

    for (const code of codes) {
      const sid = serviceIdMap.get(code);
      if (!sid) continue; // service not configured in org
      if (!neededMap[code]) dn[code] = "";
      await upsertOrDeleteDiscountNote(sid, dn[code] || "");
    }

    await conn.commit();
    return NextResponse.json({ ok: true });
  } catch (e) {
    await conn.rollback();
    console.error("❌ Save consultation failed:", e);
    return NextResponse.json({ error: "Failed to save consultation." }, { status: 500 });
  } finally {
    conn.release();
  }
}
