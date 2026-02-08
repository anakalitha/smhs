// src/app/api/setup/reset-db/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * Resets ONLY transactional tables (patients/visits/queue/charges/payments/etc)
 * while preserving master/config tables (users/roles/services/rates/modes/doctors).
 *
 * SAFETY:
 * - Blocked in production
 * - Requires ?token=... and ?confirm=YES
 */

const DEFAULT_TOKEN_ENV = "SETUP_RESET_TOKEN";

// Adjust only if your initial org/branch IDs differ
const ORG_ID = 1;
const BRANCH_ID = 1;

// Transactional tables to TRUNCATE (order matters; children first).
// If a table doesn't exist, it will be skipped.
const TRUNCATE_TABLES_IN_ORDER: string[] = [
  // Payments ledger
  "payment_allocations",
  "payments",

  // Charges
  "visit_charges",

  // Queue / reception workflow
  "queue_entries",

  // Visits (depends on patients)
  "visits",

  // Patients last (visits references patients)
  "patients",

  // Add more transactional tables here if your schema contains them.
  // Example (uncomment if they exist in your DB):
  // "visit_notes",
  // "visit_files",
  // "lab_orders",
  // "lab_results",
  // "scan_orders",
  // "scan_results",
  // "prescriptions",
  // "consultation_notes",
  // "notifications",
];

async function tableExists(conn: any, tableName: string): Promise<boolean> {
  const [rows] = await conn.execute(
    `
    SELECT COUNT(*) AS c
    FROM information_schema.tables
    WHERE table_schema = DATABASE()
      AND table_name = ?
    `,
    [tableName]
  );
  const c = Number((rows as any[])[0]?.c || 0);
  return c > 0;
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

  try {
    await conn.beginTransaction();

    // Disable FK checks during truncate
    await conn.execute("SET FOREIGN_KEY_CHECKS=0");

    for (const t of TRUNCATE_TABLES_IN_ORDER) {
      const exists = await tableExists(conn, t);
      if (!exists) {
        skippedMissing.push(t);
        continue;
      }

      // TRUNCATE resets auto-increment
      await conn.execute(`TRUNCATE TABLE \`${t}\``);
      truncated.push(t);
    }

    // Reset patient counter so patient_code starts from 1 again
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

    await conn.execute("SET FOREIGN_KEY_CHECKS=1");
    await conn.commit();

    return NextResponse.json({
      ok: true,
      message: "Transactional data reset completed.",
      truncated,
      skippedMissing,
      notes: [
        "Master tables were preserved (users/roles/services/rates/payment_modes/doctors/etc).",
        "patient_counters.next_seq reset to 1 (org=1, branch=1).",
      ],
    });
  } catch (e) {
    await conn.rollback();
    try {
      await conn.execute("SET FOREIGN_KEY_CHECKS=1");
    } catch {}
    console.error("❌ reset-db failed:", e);
    return NextResponse.json(
      { error: "Reset failed. Check server logs." },
      { status: 500 }
    );
  } finally {
    conn.release();
  }
}
