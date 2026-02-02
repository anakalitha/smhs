import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import type { RowDataPacket } from "mysql2/promise";
import Image from "next/image";
import BillToolbar from "@/components/billing/BillToolbar";

type BillRow = RowDataPacket & {
  orgName: string;
  orgCode: string;
  branchCode: string;
  orgAddress: string | null;
  orgPhone: string | null;
  patientName: string;
  patientCode: string;
  visitDate: string;
  feeType: string;
  amount: number;
  paymentMode: string;
  payStatus: string;
};

export default async function BillPage({
  params,
}: {
  params: Promise<{ visitId: string }>;
}) {
  const { visitId } = await params;
  const id = Number(visitId);
  const me = await getCurrentUser();
  if (!me) redirect("/login");

  if (!Number.isFinite(id) || id <= 0) {
    return <div className="p-6">Invalid visit.</div>;
  }

  // SECURITY: ensure user can only access their org/branch (unless SUPER_ADMIN)
  const orgId = me.organizationId;
  const branchId = me.branchId;

  const [rows] = await db.execute<BillRow[]>(
    `SELECT
       o.name AS orgName,
       o.code AS orgCode,
       b.code AS branchCode,
       o.address AS orgAddress,
       o.phone AS orgPhone,
       p.full_name AS patientName,
       p.patient_code AS patientCode,
       v.visit_date AS visitDate,
       pay.fee_type AS feeType,
       pay.amount AS amount,
       pay.payment_mode AS paymentMode,
       pay.pay_status AS payStatus
     FROM visits v
     JOIN patients p ON p.id = v.patient_id
     JOIN organizations o ON o.id = v.organization_id
     JOIN branches b ON b.id = v.branch_id
     JOIN payments pay ON pay.visit_id = v.id AND pay.fee_type = 'CONSULTATION'
     WHERE v.id = :visitId
       AND v.organization_id = :orgId
       AND v.branch_id = :branchId
     LIMIT 1`,
    { visitId: id, orgId, branchId }
  );

  if (rows.length === 0) {
    return <div className="p-6">Bill not found.</div>;
  }

  const r = rows[0];

  // Receipt number (simple, deterministic). Later we can persist a real receipt_no counter.
  const receiptNo = `${r.orgCode}_${r.branchCode}_${visitId}`;

  return (
    <div className="bill-wrap p-10 max-w-4xl mx-auto">
      {/* Print controls */}
      <BillToolbar />
      {/* Bill */}
      <div className="p-10">
        <div className="flex items-start justify-between gap-6">
          <div className="flex items-center gap-4">
            {/* Put your logo in /public and use <img src="/logo.png" .../> */}
            <Image
              src="/smnh_pdf_logo.png"
              alt="Logo"
              width={152}
              height={152}
              className="h-40 w-40"
            />

            <div>
              <div className="text-xl font-bold">{r.orgName}</div>
              <div className="text-sm text-gray-600">{r.orgAddress ?? ""}</div>
              <div className="text-sm text-gray-600">
                {r.orgPhone ? `Mobile: ${r.orgPhone}` : ""}
              </div>
            </div>
          </div>

          <div className="text-right text-sm">
            <div>
              <span className="font-medium">Bill Date:</span>{" "}
              {formatDDMMYYYY(r.visitDate)}
            </div>
            <div>
              <span className="font-medium">ID:</span> {r.patientCode}
            </div>
          </div>
        </div>

        <div className="mt-8 text-center text-lg tracking-wide">RECEIPT</div>

        <div className="mt-6 grid grid-cols-2 gap-6 text-sm">
          <div>
            <div>
              <span className="font-medium">Receipt Number:</span> {receiptNo}
            </div>
          </div>
        </div>

        <div className="mt-8 text-sm">
          <div className="border-b pb-2">
            Received with thanks from{" "}
            <span className="font-semibold">{r.patientName}</span>
          </div>

          <div className="mt-4 border-b pb-2">
            a sum of RUPEES <span className="font-semibold">{r.amount}</span>{" "}
            ONLY towards <span className="font-semibold">{r.feeType}</span>
          </div>

          <div className="mt-10 flex items-center justify-between">
            <div className="border px-6 py-2 inline-block">Rs. {r.amount}</div>
            <div className="text-right">
              For <span className="font-semibold">{r.orgName}</span>
            </div>
          </div>

          <div className="mt-6 text-xs text-gray-500">
            Payment Mode: {r.paymentMode} • Status: {r.payStatus}
          </div>
        </div>
      </div>

      {/* Print CSS */}
      <style>{`
  @page {
    size: A4;
    margin: 10mm;
  }
  @media print {
    .print\\:hidden { display: none !important; }
    html, body { height: auto; }
    body { margin: 0; }
    /* Reduce padding so it fits one page */
    .bill-wrap { padding: 0 !important; }
    /* Avoid accidental extra page due to min-height */
    .min-h-screen { min-height: auto !important; }
  }
    @media print {
  header, nav {
    display: none !important;
  }
}

`}</style>
    </div>
  );
}

function formatDDMMYYYY(d: unknown) {
  // supports Date | string ("YYYY-MM-DD") | ISO string
  if (!d) return "";
  if (d instanceof Date) {
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }
  const s = String(d);

  // If it's already "YYYY-MM-DD"
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;

  // fallback: try Date parse
  const dt = new Date(s);
  if (!Number.isNaN(dt.getTime())) {
    const dd = String(dt.getDate()).padStart(2, "0");
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    const yyyy = dt.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }
  return s;
}
