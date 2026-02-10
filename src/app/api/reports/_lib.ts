import type { RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/db";

export type FeeType =
  | "CONSULTATION"
  | "SCAN"
  | "PAP_SMEAR"
  | "CTG"
  | "LAB"
  | "PHARMACY";
export type TestType = "ALL" | "SCAN" | "PAP_SMEAR" | "CTG" | "LAB_TEST";

export type VisitFeesRow = RowDataPacket & {
  patientId: string;
  name: string;
  phone: string | null;
  visitDate: string;
  referredBy: string | null;

  consultationFee: number;
  scanFee: number;
  papSmearFee: number;
  ctgFee: number;
  labFee: number;
  pharmaFee: number;
};

export function safeYmd(raw: string | null) {
  if (!raw) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

export function normalizeTestType(raw: string | null): TestType {
  const s = (raw ?? "").trim().toUpperCase();
  if (s === "SCAN") return "SCAN";
  if (s === "PAP_SMEAR") return "PAP_SMEAR";
  if (s === "CTG") return "CTG";
  if (s === "LAB" || s === "LAB_TEST") return "LAB_TEST";
  return "ALL";
}

export function testTypeToFeeType(t: TestType): FeeType | null {
  if (t === "SCAN") return "SCAN";
  if (t === "PAP_SMEAR") return "PAP_SMEAR";
  if (t === "CTG") return "CTG";
  if (t === "LAB_TEST") return "LAB";
  return null;
}

export async function resolveDoctorId(args: {
  userId: number;
  organizationId: number;
  branchId: number;
}) {
  const [rows] = await db.execute<RowDataPacket[]>(
    `
    SELECT d.id
    FROM doctors d
    WHERE d.user_id = ?
      AND d.organization_id = ?
      AND d.branch_id = ?
      AND d.is_active = 1
    LIMIT 1
    `,
    [args.userId, args.organizationId, args.branchId]
  );

  const id = rows?.[0]?.id;
  return typeof id === "number" ? id : null;
}

/**
 * mode:
 * - "SUMMARY": uses charged amounts (charges.final_amount)
 * - "PENDING": uses pending amounts (final_amount - accepted payments)
 */
export async function fetchVisitFees(args: {
  organizationId: number;
  branchId: number;
  doctorId: number;
  start: string;
  end: string;
  patientCode?: string; // ✅ changed
  referralId?: string;
  testType?: TestType;
  mode: "SUMMARY" | "PENDING";
}) {
  const feeFilter = testTypeToFeeType(args.testType ?? "ALL");

  const where: string[] = [
    "v.organization_id = ?",
    "v.branch_id = ?",
    "v.doctor_id = ?",
    "v.visit_date >= ?",
    "v.visit_date <= ?",
  ];
  const params: unknown[] = [
    args.organizationId,
    args.branchId,
    args.doctorId,
    args.start,
    args.end,
  ];

  if (args.patientCode?.trim()) {
    where.push("p.patient_code = ?");
    params.push(args.patientCode.trim());
  }
  if (args.referralId) {
    where.push("v.referralperson_id = ?");
    params.push(args.referralId);
  }

  // Filter visits by testType (based on existence of that fee_type in charges)
  if (feeFilter) {
    where.push(`
      EXISTS (
        SELECT 1 FROM charges cx
        WHERE cx.visit_id = v.id AND cx.fee_type = ?
      )
    `);
    params.push(feeFilter);
  }

  const valueExpr =
    args.mode === "SUMMARY"
      ? "c.final_amount"
      : "GREATEST(c.final_amount - COALESCE(paid.paid, 0), 0)";

  const [rows] = await db.execute<VisitFeesRow[]>(
    `
    SELECT
      p.patient_code AS patientId,
      p.full_name AS name,
      p.phone AS phone,
      v.visit_date AS visitDate,
      rp.name AS referredBy,

      SUM(CASE WHEN c.fee_type='CONSULTATION' THEN ${valueExpr} ELSE 0 END) AS consultationFee,
      SUM(CASE WHEN c.fee_type='SCAN'         THEN ${valueExpr} ELSE 0 END) AS scanFee,
      SUM(CASE WHEN c.fee_type='PAP_SMEAR'    THEN ${valueExpr} ELSE 0 END) AS papSmearFee,
      SUM(CASE WHEN c.fee_type='CTG'          THEN ${valueExpr} ELSE 0 END) AS ctgFee,
      SUM(CASE WHEN c.fee_type='LAB'          THEN ${valueExpr} ELSE 0 END) AS labFee,
      SUM(CASE WHEN c.fee_type='PHARMACY'     THEN ${valueExpr} ELSE 0 END) AS pharmaFee

    FROM visits v
    JOIN patients p ON p.id = v.patient_id
    LEFT JOIN referralperson rp ON rp.id = v.referralperson_id
    LEFT JOIN charges c ON c.visit_id = v.id

    LEFT JOIN (
      SELECT
        pay.charge_id,
        SUM(pay.amount) AS paid
      FROM payments pay
      WHERE pay.pay_status = 'ACCEPTED'
        AND pay.charge_id IS NOT NULL
      GROUP BY pay.charge_id
    ) paid ON paid.charge_id = c.id

    WHERE ${where.join("\n      AND ")}

    GROUP BY
      p.patient_code, p.full_name, p.phone, v.visit_date, rp.name

    ORDER BY v.visit_date DESC
    `,
    params
  );

  return rows;
}

export function totalsRow(rows: VisitFeesRow[]) {
  const sum = (k: keyof VisitFeesRow) =>
    rows.reduce((acc, r) => acc + Number(r[k] ?? 0), 0);

  return {
    patientId: "",
    name: "TOTAL",
    phone: null,
    visitDate: "",
    referredBy: "",

    consultationFee: sum("consultationFee"),
    scanFee: sum("scanFee"),
    papSmearFee: sum("papSmearFee"),
    ctgFee: sum("ctgFee"),
    labFee: sum("labFee"),
    pharmaFee: sum("pharmaFee"),
  } satisfies Omit<VisitFeesRow, keyof RowDataPacket>;
}
