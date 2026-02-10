import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import ReportToolbar from "@/components/billing/ReportToolbar";
import Image from "next/image";

type BillRow = RowDataPacket & {
  visitId: number;
  patientCode: string;
  patientName: string;
  visitDate: string;
  amount: number;
};

export default async function BillReportView({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");

  if (!me.organizationId || !me.branchId) {
    return <div className="p-6">Invalid org/branch.</div>;
  }

  const canExport =
    me.roles.includes("SUPER_ADMIN") ||
    me.roles.includes("ADMIN") ||
    me.roles.includes("DOCTOR");

  const { from, to } = await searchParams;
  if (!from || !to) {
    return <div className="p-6">Invalid date range.</div>;
  }

  const orgId = me.organizationId;
  const branchId = me.branchId;

  const [rows] = await db.execute<BillRow[]>(
    `SELECT
       v.id AS visitId,
       p.patient_code AS patientCode,
       p.full_name AS patientName,
       v.visit_date AS visitDate,
       pay.amount AS amount
     FROM visits v
     JOIN patients p ON p.id = v.patient_id
     JOIN payments pay
       ON pay.visit_id = v.id
      AND pay.fee_type = 'CONSULTATION'
     WHERE v.organization_id = :org
       AND v.branch_id = :branch
       AND v.visit_date BETWEEN :from AND :to
     ORDER BY v.visit_date ASC, v.id ASC`,
    { org: orgId, branch: branchId, from, to }
  );

  const total = rows.reduce((s, r) => s + Number(r.amount || 0), 0);

  return (
    <div className="report-wrap max-w-5xl mx-auto">
      <ReportToolbar
        canExport={canExport}
        exportCsvUrl={`/api/reports/bills/export?from=${from}&to=${to}`}
        exportXlsxUrl={`/api/reports/bills/export-xlsx?from=${from}&to=${to}`}
      />

      <div className="p-10">
        <div className="flex items-center gap-4 mb-6">
          <Image src="/smnh_pdf_logo.png" alt="Logo" width={100} height={100} />
          <div>
            <div className="text-xl font-bold">Bill Report</div>
            <div className="text-sm text-gray-600">
              Period: {formatDDMMYYYY(from)} – {formatDDMMYYYY(to)}
            </div>
          </div>
        </div>

        <table className="w-full border text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="border px-3 py-2">Sl. No.</th>
              <th className="border px-3 py-2">Bill Receipt No</th>
              <th className="border px-3 py-2">Patient Id</th>
              <th className="border px-3 py-2">Name</th>
              <th className="border px-3 py-2">Visit Date</th>
              <th className="border px-3 py-2 text-right">Amount</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((r, i) => (
              <tr key={r.visitId}>
                <td className="border px-3 py-2">{i + 1}</td>
                <td className="border px-3 py-2">BILL-{r.visitId}</td>
                <td className="border px-3 py-2">{r.patientCode}</td>
                <td className="border px-3 py-2">{r.patientName}</td>
                <td className="border px-3 py-2">
                  {formatDDMMYYYY(r.visitDate)}
                </td>
                <td className="border px-3 py-2 text-right">
                  {formatINR(Number(r.amount))}
                </td>
              </tr>
            ))}

            <tr className="font-semibold bg-gray-50">
              <td className="border px-3 py-2" colSpan={5}>
                Total
              </td>
              <td className="border px-3 py-2 text-right">
                {formatINR(total)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <style>{`
        @page { size: A4; margin: 10mm; }
        @media print {
          .print\\:hidden { display: none !important; }
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
