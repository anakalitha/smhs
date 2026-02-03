import { NextResponse } from "next/server";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

type Ctx = { params: Promise<{ visitId: string }> };

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

type RxItemInput = {
  medicineName: string;
  dosage?: string | null;
  morning?: boolean;
  afternoon?: boolean;
  night?: boolean;
  beforeFood?: boolean;
  durationDays?: number | "" | null;
  instructions?: string | null;
  sortOrder?: number;
};

type OrderRow = RowDataPacket & {
  id: number;
  order_type: "SCAN" | "PAP_SMEAR" | "CTG";
  details: string | null;
  status: "ORDERED" | "BILLED" | "DONE" | "CANCELLED";
  created_at: string;
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
  const doctorId =
    me.roles.includes("ADMIN") || me.roles.includes("SUPER_ADMIN")
      ? null
      : await resolveDoctorIdForUser({
          userId: me.id,
          orgId,
          branchId,
        });

  if (
    !me.roles.includes("ADMIN") &&
    !me.roles.includes("SUPER_ADMIN") &&
    (!doctorId || doctorId <= 0)
  ) {
    return NextResponse.json(
      { error: "Doctor account not linked to doctor profile." },
      { status: 400 }
    );
  }

  if (!Number.isFinite(orgId) || !Number.isFinite(branchId)) {
    return NextResponse.json(
      { error: "Invalid org/branch in session." },
      { status: 400 }
    );
  }
  const isAdmin =
    me.roles.includes("ADMIN") || me.roles.includes("SUPER_ADMIN");

  if (!isAdmin && (!doctorId || doctorId <= 0)) {
    return NextResponse.json(
      { error: "Doctor account not linked to doctor profile." },
      { status: 400 }
    );
  }

  // Ensure visit belongs to this doctor + org/branch
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

  if (!isAdmin) {
    if (!doctorId) {
      return NextResponse.json(
        { error: "Doctor account not linked to doctor profile." },
        { status: 400 }
      );
    }
    if (Number(vRows[0].doctorId) !== doctorId) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
  }

  const [nRows] = await db.execute<NoteRow[]>(
    `SELECT diagnosis, investigation, remarks FROM visit_notes WHERE visit_id = :visitId LIMIT 1`,
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
      id, medicine_name, dosage, morning, afternoon, night, before_food, duration_days, instructions, sort_order
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
    SELECT id, order_type, details, status, created_at
    FROM visit_orders
    WHERE visit_id = :visitId
      AND order_type IN ('SCAN','PAP_SMEAR','CTG')
      AND status <> 'CANCELLED'
    ORDER BY created_at ASC, id ASC
    `,
    { visitId: id }
  );

  return NextResponse.json({
    ok: true,
    visit: vRows[0],
    note: nRows[0] ?? null,
    prescription: rxRows[0] ?? null,
    prescriptionItems: items ?? [],
    orders,
  });
}

type SavePayload = {
  diagnosis?: string;
  investigation?: string;
  remarks?: string;

  orders?: {
    scan?: { needed: boolean; details: string };
    pap?: { needed: boolean; details: string };
    ctg?: { needed: boolean; details: string };
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
};

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
  const doctorId = me.doctorId != null ? Number(me.doctorId) : NaN;

  if (!Number.isFinite(orgId) || !Number.isFinite(branchId)) {
    return NextResponse.json(
      { error: "Invalid org/branch in session." },
      { status: 400 }
    );
  }
  if (!Number.isFinite(doctorId) || doctorId <= 0) {
    return NextResponse.json(
      { error: "Doctor account not linked to doctor profile." },
      { status: 400 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as SavePayload;

  // verify visit ownership
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
  const isAdmin =
    me.roles.includes("ADMIN") || me.roles.includes("SUPER_ADMIN");
  if (!isAdmin) {
    if (!doctorId) {
      return NextResponse.json(
        { error: "Doctor account not linked to doctor profile." },
        { status: 400 }
      );
    }
    if (Number(vRows[0].doctor_id) !== doctorId) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // 1) Upsert visit_notes
    await conn.execute<ResultSetHeader>(
      `
      INSERT INTO visit_notes (visit_id, diagnosis, investigation, remarks, created_by)
      VALUES (:visitId, :diagnosis, :investigation, :remarks, :by)
      ON DUPLICATE KEY UPDATE
        diagnosis = VALUES(diagnosis),
        investigation = VALUES(investigation),
        remarks = VALUES(remarks),
        updated_at = CURRENT_TIMESTAMP
      `,
      {
        visitId: id,
        diagnosis: body.diagnosis ?? null,
        investigation: body.investigation ?? null,
        remarks: body.remarks ?? null,
        by: me.id,
      }
    );

    // 2) Orders: upsert by (visit_id + order_type) via “insert or update latest”
    // Simpler: If needed=true and no existing active order -> create.
    // If needed=false -> mark existing ORDERED as CANCELLED (if any).
    const orderMap: Array<{
      type: "SCAN" | "PAP_SMEAR" | "CTG";
      needed: boolean;
      details: string;
    }> = [
      {
        type: "SCAN",
        needed: !!body.orders?.scan?.needed,
        details: body.orders?.scan?.details ?? "",
      },
      {
        type: "PAP_SMEAR",
        needed: !!body.orders?.pap?.needed,
        details: body.orders?.pap?.details ?? "",
      },
      {
        type: "CTG",
        needed: !!body.orders?.ctg?.needed,
        details: body.orders?.ctg?.details ?? "",
      },
    ];

    for (const o of orderMap) {
      const [existing] = await conn.execute<RowDataPacket[]>(
        `
        SELECT id, status
        FROM visit_orders
        WHERE visit_id = :visitId
          AND order_type = :type
          AND status <> 'CANCELLED'
        ORDER BY id DESC
        LIMIT 1
        `,
        { visitId: id, type: o.type }
      );

      if (o.needed) {
        if (existing.length === 0) {
          await conn.execute(
            `
            INSERT INTO visit_orders (visit_id, order_type, details, status, created_by)
            VALUES (:visitId, :type, :details, 'ORDERED', :by)
            `,
            { visitId: id, type: o.type, details: o.details || null, by: me.id }
          );
        } else {
          // update details (keep status)
          await conn.execute(
            `UPDATE visit_orders SET details = :details WHERE id = :id`,
            { details: o.details || null, id: Number(existing[0].id) }
          );
        }
      } else {
        // If not needed, cancel only if still ORDERED (don’t cancel billed/done)
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
        `UPDATE prescriptions SET notes = :notes, updated_at = CURRENT_TIMESTAMP WHERE id = :id`,
        { notes: body.prescription?.notes ?? null, id: rxId }
      );
    }

    // 4) Replace prescription items (simplest + safest for v1)
    await conn.execute(
      `DELETE FROM prescription_items WHERE prescription_id = :pid`,
      {
        pid: rxId,
      }
    );

    function toNullableInt(v: number | "" | null | undefined): number | null {
      if (v === "" || v == null) return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    }

    const items = body.prescription?.items ?? [];
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
          days: toNullableInt(it.durationDays),
          instr: it.instructions ? String(it.instructions).trim() : null,
          sort: Number.isFinite(it.sortOrder) ? it.sortOrder : 0,
        }
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
