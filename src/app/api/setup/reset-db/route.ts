import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";

/**
 * Resets ONLY transactional tables (patients/visits/queue/charges/payments/etc)
 * while preserving master/config tables (users/roles/services/rates/modes/doctors/...).
 *
 * SAFETY:
 * - Blocked in production
 * - Requires ?token=... and ?confirm=YES
 */

const DEFAULT_TOKEN_ENV = "SETUP_RESET_TOKEN";

// Adjust if your initial org/branch IDs differ
const ORG_ID = 1;
const BRANCH_ID = 1;

/**
 * Transactional tables to TRUNCATE (order matters; children first).
 * If a table doesn't exist, it will be skipped.
 *
 * ✅ This list includes newer workflow tables:
 * - notifications (+ children)
 * - visit_notes / visit_orders
 * - prescriptions + items
 * - pharma_orders
 * - visit_documents / payment_documents
 */
const TRUNCATE_TABLES_IN_ORDER: string[] = [
  // Notifications (children first)
  "notification_actions",
  "notification_events",
  "notifications",

  // Pharma workflow
  "pharma_orders",

  // Prescriptions (items first)
  "prescription_items",
  "prescriptions",

  // Visit clinical data
  "visit_orders",
  "visit_notes",
  "visit_documents",

  // Payments (children first)
  "payment_allocations",
  "payment_documents",
  "payments",

  // Charges
  "visit_charges",

  // Queue / workflow
  "queue_entries",

  // Visits -> Patients
  "visits",
  "patients",

  // Optional: wipe sessions for clean testing (uncomment if you want)
  // "sessions",
];

type CountRow = RowDataPacket & { c: number };

async function tableExists(
  conn: PoolConnection,
  tableName: string
): Promise<boolean> {
  const [rows] = await conn.execute<CountRow[]>(
    `
    SELECT COUNT(*) AS c
    FROM information_schema.tables
    WHERE table_schema = DATABASE()
      AND table_name = ?
    `,
    [tableName]
  );

  const c = Number(rows?.[0]?.c ?? 0);
  return c > 0;
}

async function setFkChecks(conn: PoolConnection, on: boolean) {
  await conn.execute(`SET FOREIGN_KEY_CHECKS=${on ? 1 : 0}`);
}

export async function POST(req: Request) {
  // Safety: never allow in production
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Not allowed in production." },
      { status: 403 }
    );
  }

  const url = new URL(req.url);
  const token = url.searchParams.get("token") || "";
  const confirm = url.searchParams.get("confirm") || "";

  const expected =
    process.env[DEFAULT_TOKEN_ENV] || process.env.SETUP_SEED_TOKEN || "";

  if (!expected) {
    return NextResponse.json(
      {
        error: `${DEFAULT_TOKEN_ENV} is not configured. Set it in .env (or SETUP_SEED_TOKEN).`,
      },
      { status: 500 }
    );
  }

  if (token !== expected) {
    return NextResponse.json({ error: "Invalid token." }, { status: 401 });
  }

  if (confirm !== "YES") {
    return NextResponse.json(
      {
        error: "Confirmation required. Call with ?confirm=YES to proceed.",
        hint: `POST /api/setup/reset-db?token=...&confirm=YES`,
      },
      { status: 400 }
    );
  }

  const conn = await db.getConnection();
  const truncated: string[] = [];
  const skippedMissing: string[] = [];

  let step = "init";
  try {
    step = "beginTransaction";
    await conn.beginTransaction();

    step = "disableFK";
    await setFkChecks(conn, false);

    for (const t of TRUNCATE_TABLES_IN_ORDER) {
      step = `check:${t}`;
      const exists = await tableExists(conn, t);
      if (!exists) {
        skippedMissing.push(t);
        continue;
      }

      step = `truncate:${t}`;
      // TRUNCATE resets auto-increment
      await conn.execute(`TRUNCATE TABLE \`${t}\``);
      truncated.push(t);
    }

    // Reset patient counter so patient_code starts from 1 again
    step = "resetPatientCounters";
    const counterExists = await tableExists(conn, "patient_counters");
    if (counterExists) {
      await conn.execute(
        `
        UPDATE patient_counters
        SET next_seq = 1
        WHERE organization_id = ? AND branch_id = ?
        `,
        [ORG_ID, BRANCH_ID]
      );
    }

    step = "enableFK";
    await setFkChecks(conn, true);

    step = "commit";
    await conn.commit();

    return NextResponse.json({
      ok: true,
      message: "Transactional data reset completed.",
      truncated,
      skippedMissing,
      notes: [
        "Master tables were preserved (users/roles/services/rates/payment_modes/doctors/referralperson/medicines/etc).",
        `patient_counters.next_seq reset to 1 (org=${ORG_ID}, branch=${BRANCH_ID}).`,
        "If you want to force logout for all users during testing, uncomment sessions in TRUNCATE_TABLES_IN_ORDER.",
      ],
    });
  } catch (e: unknown) {
    try {
      step = `rollback(${step})`;
      await conn.rollback();
    } catch {}

    try {
      // Best-effort FK re-enable
      await setFkChecks(conn, true);
    } catch {}

    const msg =
      e instanceof Error ? e.message : "Reset failed. Check server logs.";
    console.error("❌ reset-db failed at step:", step, e);

    return NextResponse.json(
      {
        error: "Reset failed.",
        failedStep: step,
        details: msg,
        truncatedSoFar: truncated,
        skippedMissing,
      },
      { status: 500 }
    );
  } finally {
    conn.release();
  }
}
