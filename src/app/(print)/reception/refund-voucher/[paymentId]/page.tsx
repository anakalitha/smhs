import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2/promise";
import Image from "next/image";

import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import BillToolbar from "@/components/billing/BillToolbar";

type VoucherRow = RowDataPacket & {
  orgName: string;
  orgCode: string;
  branchCode: string;
  orgAddress: string | null;
  orgPhone: string | null;

  patientName: string;
  patientCode: string;
  visitDate: string;

  serviceName: string;
  amount: number;
  paymentModeCode: string;
  paymentModeName: string | null;
  note: string | null;
  createdAt: string;
};

export default async function RefundVoucherPage({
  params,
}: {
  params: Promise<{ paymentId: string }>;
}) {
  const { paymentId } = await params;
  const pid = Number(paymentId);

  const me = await getCurrentUser();
  if (!me) redirect("/login");

  const allowed =
    me.roles.includes("RECEPTION") ||
    me.roles.includes("ADMIN") ||
    me.roles.includes("SUPER_ADMIN");

  if (!allowed) return <div className="p-6">Forbidden.</div>;
  if (!Number.isFinite(pid) || pid <= 0)
    return <div className="p-6">Invalid payment.</div>;

  const orgId = Number(me.organizationId);
  const branchId = Number(me.branchId);

  const [rows] = await db.execute<VoucherRow[]>(
    `
    SELECT
      o.name AS orgName,
      o.code AS orgCode,
      b.code AS branchCode,
      o.address AS orgAddress,
      o.phone AS orgPhone,

      p.full_name AS patientName,
      p.patient_code AS patientCode,
      v.visit_date AS visitDate,

      s.display_name AS serviceName,
      pay.amount AS amount,
      pay.payment_mode_code AS paymentModeCode,
      pm.display_name AS paymentModeName,
      pay.note AS note,
      pay.created_at AS createdAt

    FROM payments pay
    JOIN visits v ON v.id = pay.visit_id
    JOIN patients p ON p.id = v.patient_id
    JOIN organizations o ON o.id = v.organization_id
    JOIN branches b ON b.id = v.branch_id
    JOIN services s ON s.id = pay.service_id
    LEFT JOIN payment_modes pm ON pm.code = pay.payment_mode_code

    WHERE pay.id = ?
      AND pay.direction = 'REFUND'
      AND v.organization_id = ?
      AND v.branch_id = ?
    LIMIT 1
    `,
    [pid, orgId, branchId]
  );

  if (rows.length === 0)
    return <div className="p-6">Refund voucher not found.</div>;

  const r = rows[0];
  const voucherNo = `${r.orgCode}_${r.branchCode}_RF_${paymentId}`;
  const modeLabel = r.paymentModeName
    ? `${r.paymentModeName} (${r.paymentModeCode})`
    : r.paymentModeCode;

  return (
    <div className="bill-wrap p-10 max-w-4xl mx-auto">
      <BillToolbar />

      <div className="p-10">
        <div className="flex items-start justify-between gap-6">
          <div className="flex items-center gap-4">
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
              <span className="font-medium">Voucher Date:</span>{" "}
              {formatDDMMYYYY(r.createdAt)}
            </div>
            <div>
              <span className="font-medium">Visit Date:</span>{" "}
              {formatDDMMYYYY(r.visitDate)}
            </div>
            <div>
              <span className="font-medium">Patient ID:</span> {r.patientCode}
            </div>
          </div>
        </div>

        <div className="mt-8 text-center text-lg tracking-wide">
          REFUND VOUCHER
        </div>

        <div className="mt-6 text-sm">
          <div>
            <span className="font-medium">Voucher Number:</span> {voucherNo}
          </div>

          <div className="mt-6 border-b pb-2">
            Paid to <span className="font-semibold">{r.patientName}</span>
          </div>

          <div className="mt-4 border-b pb-2">
            a sum of RUPEES{" "}
            <span className="font-semibold">{Number(r.amount).toFixed(0)}</span>{" "}
            ONLY as refund towards{" "}
            <span className="font-semibold">{r.serviceName}</span>
          </div>

          <div className="mt-10 flex items-center justify-between">
            <div className="border px-6 py-2 inline-block">
              Rs. {Number(r.amount).toFixed(0)}
            </div>
            <div className="text-right">
              For <span className="font-semibold">{r.orgName}</span>
            </div>
          </div>

          <div className="mt-6 text-xs text-gray-500">
            Refund Mode: {modeLabel}
            {r.note ? ` • Note: ${r.note}` : ""}
          </div>

          <div className="mt-10 grid grid-cols-2 gap-10 text-sm">
            <div>
              <div className="border-t pt-2">Patient / Attendant Signature</div>
            </div>
            <div className="text-right">
              <div className="border-t pt-2">Cashier / Reception Signature</div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @page { size: A4; margin: 10mm; }
        @media print {
          .print\\:hidden { display: none !important; }
          html, body { height: auto; }
          body { margin: 0; }
          .bill-wrap { padding: 0 !important; }
          header, nav { display: none !important; }
        }
      `}</style>
    </div>
  );
}

function formatDDMMYYYY(d: unknown) {
  if (!d) return "";
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
