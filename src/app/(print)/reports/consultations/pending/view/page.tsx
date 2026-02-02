import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import ReportToolbar from "@/components/billing/ReportToolbar";
import Image from "next/image";

type Row = RowDataPacket & {
  patientId: string;
  name: string;
  phone: string | null;
  visitDate: string;
  amount: number;
  paymentMode: string;
  payStatus: string;
};

export default async function PendingAmountReportView({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");

  if (!me.organizationId || !me.branchId) {
    return <div className="p-6">Invalid org/branch.</div>;
  }

  const { from, to } = await searchParams;
  if (!from || !to) {
    return <div className="p-6">Invalid date range.</div>;
  }

  const allowed =
    me.roles.includes("RECEPTION") ||
    me.roles.includes("ADMIN") ||
    me.roles.includes("SUPER_ADMIN");

  if (!allowed) redirect("/login");

  const orgId = me.organizationId;
  const branchId = me.branchId;
  const canExport =
    me.roles.includes("SUPER_ADMIN") ||
    me.roles.includes("ADMIN") ||
    me.roles.includes("DOCTOR");

  const [rows] = await db.execute<Row[]>(
    `SELECT
       p.patient_code AS patientId,
       p.full_name AS name,
       p.phone AS phone,
       v.visit_date AS visitDate,
       pay.amount AS amount,
       pay.payment_mode AS paymentMode,
       pay.pay_status AS payStatus
     FROM visits v
     JOIN patients p ON p.id = v.patient_id
     JOIN payments pay
       ON pay.visit_id = v.id
      AND pay.fee_type = 'CONSULTATION'
     WHERE v.organization_id = :org
       AND v.branch_id = :branch
       AND v.visit_date BETWEEN :from AND :to
       AND pay.pay_status = 'PENDING'
     ORDER BY v.visit_date ASC, p.patient_code ASC`,
    { org: orgId, branch: branchId, from, to }
  );

  const totalPending = rows.reduce((sum, r) => sum + Number(r.amount || 0), 0);

  return (
    <div className="report-wrap max-w-6xl mx-auto">
      <ReportToolbar
        canExport={canExport}
        exportCsvUrl={`/api/reports/consultations/pending/export?from=${from}&to=${to}`} // if you have CSV
        exportXlsxUrl={`/api/reports/consultations/pending/export-xlsx?from=${from}&to=${to}`}
      />
      <div className="p-10">
        <div className="flex items-center gap-4 mb-6">
          <Image src="/smnh_pdf_logo.png" alt="Logo" width={100} height={100} />
          <div>
            <div className="text-xl font-bold">Pending Amount Report</div>
            <div className="text-sm text-gray-600">
              Period: {formatDDMMYYYY(from)} – {formatDDMMYYYY(to)}
            </div>
          </div>
        </div>

        <table className="w-full border text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="border px-3 py-2">Sl. No.</th>
              <th className="border px-3 py-2">Patient Id</th>
              <th className="border px-3 py-2">Name</th>
              <th className="border px-3 py-2">Phone</th>
              <th className="border px-3 py-2">Visit Date</th>
              <th className="border px-3 py-2 text-right">Consultation Fee</th>
              <th className="border px-3 py-2">Payment Mode</th>
              <th className="border px-3 py-2">Payment Status</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.patientId}-${i}`}>
                <td className="border px-3 py-2">{i + 1}</td>
                <td className="border px-3 py-2 font-medium">{r.patientId}</td>
                <td className="border px-3 py-2">{r.name}</td>
                <td className="border px-3 py-2">{r.phone ?? ""}</td>
                <td className="border px-3 py-2">
                  {formatDDMMYYYY(r.visitDate)}
                </td>
                <td className="border px-3 py-2 text-right">
                  {formatINR(Number(r.amount))}
                </td>
                <td className="border px-3 py-2">{r.paymentMode}</td>
                <td className="border px-3 py-2 text-red-600 font-medium">
                  {r.payStatus}
                </td>
              </tr>
            ))}

            <tr className="font-semibold bg-gray-50">
              <td className="border px-3 py-2" colSpan={5}>
                Total Pending
              </td>
              <td className="border px-3 py-2 text-right">
                {formatINR(totalPending)}
              </td>
              <td className="border px-3 py-2" colSpan={2} />
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

function formatDDMMYYYY(d: string) {
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : d;
}

function formatINR(n: number) {
  return n.toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });
}
