import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import ReportToolbar from "@/components/billing/ReportToolbar"; // reuse Print/Close toolbar
import Image from "next/image";

type Row = RowDataPacket & {
  patientId: string;
  name: string;
  phone: string | null;
  referredBy: string | null;
  doctor: string;
  amount: number;
  paymentMode: string;
  payStatus: string;
};

export default async function EodConsultationsReport() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");

  const allowed =
    me.roles.includes("RECEPTION") ||
    me.roles.includes("ADMIN") ||
    me.roles.includes("SUPER_ADMIN");

  if (!allowed) redirect("/login");

  if (!me.organizationId || !me.branchId) {
    return <div className="p-6">Invalid org/branch.</div>;
  }

  const orgId = me.organizationId;
  const branchId = me.branchId;
  const canExportEod =
    me.roles.includes("SUPER_ADMIN") ||
    me.roles.includes("ADMIN") ||
    me.roles.includes("DOCTOR") ||
    me.roles.includes("RECEPTION");

  // Header info (same style as bill)
  type OrgRow = RowDataPacket & {
    orgName: string;
    orgCode: string;
    branchCode: string;
    orgAddress: string | null;
    orgPhone: string | null;
  };

  const [orgRows] = await db.execute<OrgRow[]>(
    `SELECT
       o.name AS orgName,
       o.code AS orgCode,
       b.code AS branchCode,
       o.address AS orgAddress,
       o.phone AS orgPhone
     FROM organizations o
     JOIN branches b ON b.id = :branchId
     WHERE o.id = :orgId
     LIMIT 1`,
    { orgId, branchId }
  );

  const header = orgRows[0];

  const [rows] = await db.execute<Row[]>(
    `SELECT
       p.patient_code AS patientId,
       p.full_name AS name,
       p.phone AS phone,
       rp.name AS referredBy,
       d.full_name AS doctor,
       COALESCE(pay.amount, 0) AS amount,
       pay.payment_mode AS paymentMode,
       pay.pay_status AS payStatus
     FROM visits v
     JOIN patients p ON p.id = v.patient_id
     JOIN doctors d ON d.id = v.doctor_id
     LEFT JOIN referralperson rp ON rp.id = v.referralperson_id
     JOIN payments pay
       ON pay.visit_id = v.id
      AND pay.fee_type = 'CONSULTATION'
     WHERE v.organization_id = :orgId
       AND v.branch_id = :branchId
       AND v.visit_date = CURDATE()
     ORDER BY p.patient_code ASC`,
    { orgId, branchId }
  );

  const total = rows.reduce((sum, r) => sum + Number(r.amount || 0), 0);

  return (
    <div className="report-wrap max-w-6xl mx-auto">
      <ReportToolbar
        canExport={canExportEod}
        exportXlsxUrl={`/api/reports/consultations/eod/export-xlsx`}
      />

      <div className="p-10">
        {/* Header block like bill */}
        <div className="flex items-start justify-between gap-6">
          <div className="flex items-center gap-4">
            <Image
              src="/smnh_pdf_logo.png"
              alt="Logo"
              width={120}
              height={120}
              priority
            />
            <div>
              <div className="text-xl font-bold">{header?.orgName ?? ""}</div>
              <div className="text-sm text-gray-600">
                {header?.orgAddress ?? ""}
              </div>
              <div className="text-sm text-gray-600">
                {header?.orgPhone ? `Mobile: ${header.orgPhone}` : ""}
              </div>
            </div>
          </div>

          <div className="text-right text-sm">
            <div>
              <span className="font-medium">Report Date:</span>{" "}
              {formatDDMMYYYY(new Date())}
            </div>
            <div>
              <span className="font-medium">Branch:</span>{" "}
              {header ? `${header.orgCode}_${header.branchCode}` : ""}
            </div>
          </div>
        </div>

        <div className="mt-8 text-center text-lg font-semibold tracking-wide">
          Consultations - End of Day Report
        </div>

        <div className="mt-6 overflow-x-auto border rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-left">
                <th className="px-3 py-2">Sl. No.</th>
                <th className="px-3 py-2">Patient Id</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Phone</th>
                <th className="px-3 py-2">Referred By</th>
                <th className="px-3 py-2">Consultant Doctor</th>
                <th className="px-3 py-2 text-right">Consultation Fee</th>
                <th className="px-3 py-2">Payment Mode</th>
                <th className="px-3 py-2">Paid Status</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((r, idx) => (
                <tr key={`${r.patientId}-${idx}`} className="border-t">
                  <td className="px-3 py-2">{idx + 1}</td>
                  <td className="px-3 py-2 font-medium">{r.patientId}</td>
                  <td className="px-3 py-2">{r.name}</td>
                  <td className="px-3 py-2 text-gray-700">{r.phone ?? ""}</td>
                  <td className="px-3 py-2 text-gray-700">
                    {r.referredBy ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-gray-700">{r.doctor}</td>
                  <td className="px-3 py-2 text-right">
                    {formatINR(Number(r.amount || 0))}
                  </td>
                  <td className="px-3 py-2">{r.paymentMode}</td>
                  <td className="px-3 py-2">{r.payStatus}</td>
                </tr>
              ))}

              {/* Total row */}
              <tr className="border-t bg-gray-50 font-semibold">
                <td className="px-3 py-2" colSpan={6}>
                  Total
                </td>
                <td className="px-3 py-2 text-right">{formatINR(total)}</td>
                <td className="px-3 py-2" colSpan={2} />
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <style>{`
        @page { size: A4; margin: 10mm; }
        @media print {
          .print\\:hidden { display: none !important; }
          .report-wrap { max-width: none !important; }
        }
      `}</style>
    </div>
  );
}

function formatDDMMYYYY(d: unknown) {
  if (!d) return "";
  if (d instanceof Date) {
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }
  const s = String(d);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const dt = new Date(s);
  if (!Number.isNaN(dt.getTime())) {
    const dd = String(dt.getDate()).padStart(2, "0");
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    const yyyy = dt.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }
  return s;
}

function formatINR(n: number) {
  return n.toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });
}
