// src\app\api\reception\visits\[visitId]\edit\route.ts
import { NextResponse } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/db";
import { getCurrentUser, type CurrentUser } from "@/lib/session";
import crypto from "crypto";

type Ctx = { params: Promise<{ visitId: string }> };

function isAllowed(me: { roles: string[] }) {
  return (
    me.roles.includes("RECEPTION") ||
    me.roles.includes("ADMIN") ||
    me.roles.includes("SUPER_ADMIN") ||
    me.roles.includes("DATA_ENTRY")
  );
}

function mustHaveOrgBranch(me: CurrentUser) {
  const orgId = me.organizationId != null ? Number(me.organizationId) : NaN;
  const branchId = me.branchId != null ? Number(me.branchId) : NaN;
  return { orgId, branchId };
}

function cleanName(v: unknown) {
  return String(v ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 120);
}

function cleanReferralName(v: unknown) {
  return String(v ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 191);
}

function cleanPhone(v: unknown) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  return /^\d{10}$/.test(s) ? s : null;
}

type VisitOwnerRow = RowDataPacket & { id: number; patient_id: number };
type ReferralRow = RowDataPacket & { id: string };

function newId() {
  // 32 hex chars, fits varchar(191)
  return crypto.randomBytes(16).toString("hex");
}

export async function PATCH(req: Request, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAllowed(me))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { orgId, branchId } = mustHaveOrgBranch(me);
  if (!Number.isFinite(orgId) || !Number.isFinite(branchId)) {
    return NextResponse.json(
      { error: "Your account is not linked to organization/branch." },
      { status: 400 }
    );
  }

  const { visitId } = await ctx.params;
  const vid = Number(visitId);
  if (!Number.isFinite(vid) || vid <= 0) {
    return NextResponse.json({ error: "Invalid visit id." }, { status: 400 });
  }

  const body = (await req.json()) as {
    patientName?: unknown;
    patientPhone?: unknown;
    referredBy?: unknown; // referralperson.name
  };

  const patientName = cleanName(body.patientName);
  if (!patientName) {
    return NextResponse.json(
      { error: "Patient name is required." },
      { status: 400 }
    );
  }

  const phone = cleanPhone(body.patientPhone);
  if (
    body.patientPhone != null &&
    String(body.patientPhone).trim() !== "" &&
    phone == null
  ) {
    return NextResponse.json(
      { error: "Phone must be 10 digits." },
      { status: 400 }
    );
  }

  const referredByName = cleanReferralName(body.referredBy);
  const hasReferral = !!referredByName;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Lock visit + confirm org/branch
    const [vRows] = await conn.execute<VisitOwnerRow[]>(
      `
      SELECT id, patient_id
      FROM visits
      WHERE id = ?
        AND organization_id = ?
        AND branch_id = ?
      LIMIT 1
      FOR UPDATE
      `,
      [vid, orgId, branchId]
    );

    if (vRows.length === 0) {
      await conn.rollback();
      return NextResponse.json({ error: "Visit not found." }, { status: 404 });
    }

    const patientId = Number(vRows[0].patient_id);

    // Update patient
    await conn.execute<ResultSetHeader>(
      `
      UPDATE patients
      SET full_name = ?, phone = ?
      WHERE id = ?
      LIMIT 1
      `,
      [patientName, phone, patientId]
    );

    // Resolve/insert referralperson and store referralperson.id (VARCHAR)
    let referralId: string | null = null;

    if (hasReferral) {
      const [rFound] = await conn.execute<ReferralRow[]>(
        `
        SELECT id
        FROM referralperson
        WHERE name = ?
        LIMIT 1
        FOR UPDATE
        `,
        [referredByName]
      );

      if (rFound.length) {
        referralId = String(rFound[0].id);
      } else {
        const id = newId();
        await conn.execute<ResultSetHeader>(
          `
          INSERT INTO referralperson (id, name)
          VALUES (?, ?)
          `,
          [id, referredByName]
        );
        referralId = id;
      }
    }

    // Update visit referral FK
    await conn.execute<ResultSetHeader>(
      `
      UPDATE visits
      SET referralperson_id = ?
      WHERE id = ?
      LIMIT 1
      `,
      [referralId, vid]
    );

    await conn.commit();
    return NextResponse.json({ ok: true });
  } catch (e) {
    await conn.rollback();
    console.error("❌ Failed to edit visit data:", e);
    return NextResponse.json(
      { error: "Failed to update visit." },
      { status: 500 }
    );
  } finally {
    conn.release();
  }
}
