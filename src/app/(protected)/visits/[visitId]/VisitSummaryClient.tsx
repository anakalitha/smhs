"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import DataTable, { Column } from "@/components/ui/DataTable";

type PayStatus = "ACCEPTED" | "PENDING" | "WAIVED";

type PaymentLine = {
  serviceId: number;
  serviceCode: string;
  serviceName: string;

  grossAmount: number;
  discountAmount: number;
  netAmount: number;

  paidAmount: number; // total payments
  refundedAmount: number; // total refunds
  netPaid: number; // paid - refunded

  pendingAmount: number; // max(net - netPaid, 0)
  refundDue: number; // max(netPaid - net, 0)
  status: PayStatus;
};

type RefundRow = {
  paymentId: number;
  serviceCode: string;
  serviceName: string;
  amount: number;
  mode: string;
  createdAt: string;
  note: string | null;
  voucher: {
    fileUrl: string;
    originalName: string | null;
    uploadedAt: string;
  } | null;
};

type DocRow = {
  id: number;
  category: string;
  fileUrl: string;
  originalName: string | null;
  uploadedAt: string;
};

type SummaryResponse = {
  ok: true;
  visit: {
    visitId: number;
    visitDate: string; // YYYY-MM-DD
    patientName: string;
    patientCode: string;
    patientPhone: string | null;
    referredBy: string | null;
    doctorName: string | null;
  };
  paymentLines: PaymentLine[];
  refunds: RefundRow[];
  documents: DocRow[];
};

type PaymentMode = { code: string; display_name: string };

function formatINR(n: number) {
  return (Number(n) || 0).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });
}

function formatDDMMYYYYWithDay(yyyyMmDd: string) {
  const d = new Date(`${yyyyMmDd}T00:00:00`);
  if (Number.isNaN(d.getTime())) return yyyyMmDd;

  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const day = d.toLocaleDateString("en-US", { weekday: "short" });

  return `${dd}/${mm}/${yyyy} (${day})`;
}

async function safeJson(res: Response) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function Badge({
  children,
  tone = "gray",
}: {
  children: React.ReactNode;
  tone?: "gray" | "green" | "yellow" | "red" | "blue";
}) {
  const cls =
    tone === "green"
      ? "bg-green-50 text-green-700 border-green-200"
      : tone === "yellow"
      ? "bg-yellow-50 text-yellow-700 border-yellow-200"
      : tone === "red"
      ? "bg-red-50 text-red-700 border-red-200"
      : tone === "blue"
      ? "bg-blue-50 text-blue-700 border-blue-200"
      : "bg-gray-50 text-gray-700 border-gray-200";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs ${cls}`}
    >
      {children}
    </span>
  );
}

function Card({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border bg-white shadow-sm">
      <div className="border-b px-4 py-3 flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-[#1f1f1f]">{title}</div>
          {subtitle ? (
            <div className="text-xs text-[#646179] mt-0.5">{subtitle}</div>
          ) : null}
        </div>
        {right ? <div className="shrink-0">{right}</div> : null}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function ModalShell({
  open,
  title,
  subtitle,
  children,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[650] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-xl rounded-2xl border bg-white shadow-xl overflow-hidden">
        <div className="border-b px-4 py-3">
          <div className="text-sm font-semibold text-[#1f1f1f]">{title}</div>
          {subtitle ? (
            <div className="text-xs text-[#646179] mt-0.5">{subtitle}</div>
          ) : null}
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

export default function VisitSummaryClient({ visitId }: { visitId: number }) {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [data, setData] = useState<SummaryResponse | null>(null);

  const [refundOpen, setRefundOpen] = useState(false);
  const [refundLine, setRefundLine] = useState<PaymentLine | null>(null);

  const [modes, setModes] = useState<PaymentMode[]>([]);
  const [refundMode, setRefundMode] = useState("CASH");
  const [refundNote, setRefundNote] = useState("");
  const [refundSaving, setRefundSaving] = useState(false);
  const [refundErr, setRefundErr] = useState<string | null>(null);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadCategory, setUploadCategory] = useState("REPORT");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadSaving, setUploadSaving] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);

  const [voucherOpen, setVoucherOpen] = useState(false);
  const [voucherPaymentId, setVoucherPaymentId] = useState<number | null>(null);
  const [voucherFile, setVoucherFile] = useState<File | null>(null);
  const [voucherSaving, setVoucherSaving] = useState(false);
  const [voucherErr, setVoucherErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/visits/${visitId}/summary`, {
        cache: "no-store",
      });
      const j = (await safeJson(res)) as unknown;

      if (!res.ok || !j || typeof j !== "object") {
        const msg =
          (j as { error?: string } | null)?.error ||
          `Failed to load (${res.status})`;
        throw new Error(msg);
      }

      setData(j as SummaryResponse);
    } catch (e) {
      setData(null);
      setErr(e instanceof Error ? e.message : "Failed to load visit summary.");
    } finally {
      setLoading(false);
    }
  }

  async function uploadVoucher() {
    if (!voucherPaymentId) return;
    if (!voucherFile) {
      setVoucherErr("Please choose a file.");
      return;
    }

    setVoucherErr(null);
    setVoucherSaving(true);
    try {
      const fd = new FormData();
      fd.append("file", voucherFile);

      const res = await fetch(
        `/api/reception/payments/${voucherPaymentId}/voucher`,
        {
          method: "POST",
          body: fd,
        }
      );

      const j = await safeJson(res);
      if (!res.ok) {
        setVoucherErr(
          (j as { error?: string } | null)?.error || "Failed to upload voucher."
        );
        return;
      }

      setVoucherOpen(false);
      setVoucherPaymentId(null);
      setVoucherFile(null);
      await load();
    } catch {
      setVoucherErr("Network error.");
    } finally {
      setVoucherSaving(false);
    }
  }

  useEffect(() => {
    if (!Number.isFinite(visitId) || visitId <= 0) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visitId]);

  // load payment modes when opening refund modal
  useEffect(() => {
    if (!refundOpen) return;

    setRefundErr(null);
    setRefundSaving(false);
    setRefundNote("");
    setRefundMode("CASH");

    (async () => {
      try {
        const res = await fetch(`/api/reception/payment-modes`, {
          cache: "no-store",
        });
        const j = await safeJson(res);
        if (res.ok && j && typeof j === "object" && "modes" in j) {
          const list = (j as { modes: PaymentMode[] }).modes || [];
          setModes(list);
          const hasCash = list.some(
            (x) => String(x.code).toUpperCase() === "CASH"
          );
          setRefundMode(hasCash ? "CASH" : list[0]?.code ?? "CASH");
        } else {
          setModes([]);
        }
      } catch {
        setModes([]);
      }
    })();
  }, [refundOpen]);

  const paymentCols: Column<PaymentLine>[] = useMemo(
    () => [
      {
        header: "Service",
        cell: (r) => (
          <div className="text-[#1f1f1f]">
            <div className="font-medium">{r.serviceName}</div>
            <div className="text-xs text-[#646179]">{r.serviceCode}</div>
          </div>
        ),
        className: "min-w-[180px]",
      },
      {
        header: "Net",
        cell: (r) => (
          <span className="font-medium text-[#1f1f1f]">
            {formatINR(r.netAmount)}
          </span>
        ),
        className: "w-[120px]",
      },
      {
        header: "Paid",
        cell: (r) => (
          <span className="text-[#1f1f1f]">{formatINR(r.paidAmount)}</span>
        ),
        className: "w-[120px]",
      },
      {
        header: "Refunded",
        cell: (r) => (
          <span className="text-[#1f1f1f]">{formatINR(r.refundedAmount)}</span>
        ),
        className: "w-[120px]",
      },
      {
        header: "Pending",
        cell: (r) => (
          <span className="text-[#1f1f1f]">{formatINR(r.pendingAmount)}</span>
        ),
        className: "w-[120px]",
      },
      {
        header: "Status",
        cell: (r) => {
          const tone =
            r.status === "ACCEPTED"
              ? "green"
              : r.status === "PENDING"
              ? "yellow"
              : "red";
          return <Badge tone={tone}>{r.status}</Badge>;
        },
        className: "w-[120px]",
      },
      {
        header: "Refund Due",
        cell: (r) =>
          r.refundDue > 0 ? (
            <Badge tone="red">{formatINR(r.refundDue)}</Badge>
          ) : (
            <span className="text-[#646179]">—</span>
          ),
        className: "w-[140px]",
      },
    ],
    []
  );

  const refundCols: Column<RefundRow>[] = useMemo(
    () => [
      {
        header: "Refund",
        cell: (r) => (
          <div>
            <div className="font-medium text-[#1f1f1f]">
              {formatINR(r.amount)}
            </div>
            <div className="text-xs text-[#646179]">
              {r.serviceName} • {r.serviceCode}
            </div>
          </div>
        ),
        className: "min-w-[200px]",
      },
      {
        header: "Mode",
        cell: (r) => <span className="text-[#1f1f1f]">{r.mode}</span>,
        className: "w-[120px]",
      },
      {
        header: "When",
        cell: (r) => (
          <span className="text-[#646179]">
            {new Date(r.createdAt).toLocaleString()}
          </span>
        ),
        className: "min-w-[200px]",
      },
      {
        header: "Voucher",
        cell: (r) =>
          r.voucher ? (
            <a
              className="text-blue-700 underline text-sm"
              href={r.voucher.fileUrl}
              target="_blank"
              rel="noreferrer"
            >
              {r.voucher.originalName ?? "View"}
            </a>
          ) : (
            <span className="text-[#646179]">—</span>
          ),
        className: "min-w-[160px]",
      },
    ],
    []
  );

  const docCols: Column<DocRow>[] = useMemo(
    () => [
      {
        header: "Category",
        cell: (r) => <Badge tone="blue">{r.category}</Badge>,
        className: "w-[140px]",
      },
      {
        header: "File",
        cell: (r) => (
          <a
            className="text-blue-700 underline text-sm"
            href={r.fileUrl}
            target="_blank"
            rel="noreferrer"
          >
            {r.originalName ?? r.fileUrl}
          </a>
        ),
        className: "min-w-[220px]",
      },
      {
        header: "Uploaded",
        cell: (r) => (
          <span className="text-[#646179]">
            {new Date(r.uploadedAt).toLocaleString()}
          </span>
        ),
        className: "min-w-[200px]",
      },
    ],
    []
  );

  if (loading) return <div className="p-6">Loading visit summary…</div>;

  if (err || !data) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border bg-white shadow-sm p-5">
          <div className="text-sm font-semibold text-[#1f1f1f]">
            Could not load visit
          </div>
          <div className="mt-1 text-sm text-[#646179]">
            {err ?? "Unknown error"}
          </div>

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => router.back()}
              className="rounded-lg border bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50"
            >
              ← Back
            </button>
            <button
              type="button"
              onClick={load}
              className="rounded-lg border bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  const v = data.visit;

  async function submitRefund() {
    if (!refundLine) return;

    setRefundErr(null);
    setRefundSaving(true);
    try {
      const res = await fetch(`/api/reception/payments/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visitId: v.visitId,
          amount: refundLine.refundDue,
          paymentMode: refundMode,
          note: refundNote.trim() || null,
          serviceCode: refundLine.serviceCode,
        }),
      });

      const j = await safeJson(res);
      if (!res.ok) {
        setRefundErr(
          (j as { error?: string } | null)?.error || "Failed to refund."
        );
        return;
      }

      const paymentId = Number((j as { paymentId?: number } | null)?.paymentId);
      if (Number.isFinite(paymentId) && paymentId > 0) {
        window.open(
          `/reception/refund-voucher/${paymentId}`,
          "_blank",
          "noopener,noreferrer"
        );
      }

      setRefundOpen(false);
      setRefundLine(null);
      await load();
    } catch {
      setRefundErr("Network error.");
    } finally {
      setRefundSaving(false);
    }
  }

  async function uploadDoc() {
    if (!uploadFile) {
      setUploadErr("Please choose a file.");
      return;
    }

    setUploadErr(null);
    setUploadSaving(true);
    try {
      const fd = new FormData();
      fd.append("file", uploadFile);
      fd.append("category", uploadCategory);

      const res = await fetch(`/api/visits/${visitId}/documents`, {
        method: "POST",
        body: fd,
      });

      const j = await safeJson(res);
      if (!res.ok) {
        setUploadErr(
          (j as { error?: string } | null)?.error || "Upload failed."
        );
        return;
      }

      setUploadOpen(false);
      setUploadFile(null);
      await load();
    } catch {
      setUploadErr("Network error.");
    } finally {
      setUploadSaving(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-120px)] bg-[#F2F2F2]">
      <div className="p-6 max-w-7xl mx-auto space-y-5">
        <Card
          title="Visit Summary"
          subtitle={`Visit ID: ${v.visitId}`}
          right={
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() =>
                  window.open(
                    `/api/visits/${v.visitId}/summary/pdf`,
                    "_blank",
                    "noopener,noreferrer"
                  )
                }
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Generate PDF
              </button>

              <button
                type="button"
                onClick={() => router.back()}
                className="rounded-lg border bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50"
              >
                ← Back
              </button>
            </div>
          }
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl border bg-white p-3">
              <div className="text-xs text-[#646179]">Patient</div>
              <div className="mt-1 font-semibold text-[#1f1f1f]">
                {v.patientName}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge>{v.patientCode}</Badge>
                <Badge tone="gray">{v.patientPhone ?? "—"}</Badge>
              </div>
            </div>

            <div className="rounded-xl border bg-white p-3">
              <div className="text-xs text-[#646179]">Visit</div>
              <div className="mt-1 font-semibold text-[#1f1f1f]">
                {formatDDMMYYYYWithDay(v.visitDate)}
              </div>
              <div className="mt-2 text-sm text-[#646179]">
                Doctor:{" "}
                <span className="text-[#1f1f1f] font-medium">
                  {v.doctorName ?? "—"}
                </span>
              </div>
              <div className="mt-1 text-sm text-[#646179]">
                Referred By:{" "}
                <span className="text-[#1f1f1f] font-medium">
                  {v.referredBy ?? "—"}
                </span>
              </div>
            </div>
          </div>
        </Card>

        <Card
          title="Payment Details"
          subtitle="Per service: Paid | Refunded | Net | Pending | Status"
        >
          <DataTable
            dense
            rows={data.paymentLines}
            columns={paymentCols}
            getRowKey={(r) => `${r.serviceId}`}
            groupedActions={(row) => {
              const actions: { label: string; onClick: () => void }[] = [];

              if (row.refundDue > 0) {
                actions.push({
                  label: `Refund (${formatINR(row.refundDue)})`,
                  onClick: () => {
                    setRefundLine(row);
                    setRefundOpen(true);
                  },
                });
              }

              return actions.length ? [{ items: actions }] : [];
            }}
            emptyText="No charges found for this visit."
          />
        </Card>

        <Card
          title="Refund History"
          subtitle="Refunds recorded for this visit (print voucher anytime)"
        >
          <DataTable
            dense
            rows={data.refunds}
            columns={refundCols}
            getRowKey={(r) => String(r.paymentId)}
            groupedActions={(row) => [
              {
                items: [
                  {
                    label: "Print Voucher",
                    onClick: () =>
                      window.open(
                        `/reception/refund-voucher/${row.paymentId}`,
                        "_blank",
                        "noopener,noreferrer"
                      ),
                  },
                  {
                    label: row.voucher
                      ? "Upload Voucher (Replace)"
                      : "Upload Voucher",
                    onClick: () => {
                      setVoucherPaymentId(row.paymentId);
                      setVoucherFile(null);
                      setVoucherErr(null);
                      setVoucherOpen(true);
                    },
                  },
                ],
              },
            ]}
            emptyText="No refunds recorded."
          />
        </Card>

        <Card
          title="Reports & Documents"
          subtitle="Upload reports, bills, signed papers (local storage for now)"
          right={
            <button
              type="button"
              onClick={() => setUploadOpen(true)}
              className="rounded-lg border bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50"
            >
              Upload Document
            </button>
          }
        >
          <DataTable
            dense
            rows={data.documents}
            columns={docCols}
            getRowKey={(r) => String(r.id)}
            emptyText="No documents uploaded for this visit."
          />
        </Card>
      </div>

      {/* Refund modal */}
      <ModalShell
        open={refundOpen}
        title="Record Refund"
        subtitle={
          refundLine
            ? `${refundLine.serviceName} • Refund Due: ${formatINR(
                refundLine.refundDue
              )}`
            : undefined
        }
      >
        {refundErr ? (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-sm text-red-700">
            {refundErr}
          </div>
        ) : null}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <div className="text-sm font-medium text-slate-600 mb-2">
              Refund Mode
            </div>
            <select
              className="w-full rounded-lg border px-3 py-2 text-sm bg-white border-slate-200 text-slate-900"
              value={refundMode}
              onChange={(e) => setRefundMode(e.target.value)}
              disabled={refundSaving}
            >
              {(modes.length
                ? modes
                : [{ code: "CASH", display_name: "Cash" }]
              ).map((m) => (
                <option key={m.code} value={m.code}>
                  {m.display_name ?? m.code}
                </option>
              ))}
            </select>
            <div className="mt-1 text-xs text-slate-600">Default is CASH.</div>
          </div>

          <div>
            <div className="text-sm font-medium text-slate-600 mb-2">
              Remarks
            </div>
            <input
              className="w-full rounded-lg border px-3 py-2 text-sm bg-white border-slate-200 text-slate-900"
              value={refundNote}
              onChange={(e) => setRefundNote(e.target.value)}
              disabled={refundSaving}
              placeholder='e.g. "Refunded to patient at counter"'
            />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setRefundOpen(false);
              setRefundLine(null);
            }}
            className="rounded-lg border bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50"
            disabled={refundSaving}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submitRefund}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
            disabled={refundSaving || !refundLine || refundLine.refundDue <= 0}
          >
            {refundSaving ? "Processing..." : "Record & Print Voucher"}
          </button>
        </div>
      </ModalShell>

      {/* Voucher upload modal */}
      <ModalShell
        open={voucherOpen}
        title="Upload Signed Refund Voucher"
        subtitle="PDF/JPG/PNG (max 5MB). Stored locally."
      >
        {voucherErr ? (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-sm text-red-700">
            {voucherErr}
          </div>
        ) : null}

        <input
          type="file"
          accept=".pdf,.jpg,.jpeg,.png"
          onChange={(e) => setVoucherFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm"
          disabled={voucherSaving}
        />

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setVoucherOpen(false);
              setVoucherPaymentId(null);
              setVoucherFile(null);
              setVoucherErr(null);
            }}
            className="rounded-lg border bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50"
            disabled={voucherSaving}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={uploadVoucher}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            disabled={voucherSaving || !voucherPaymentId || !voucherFile}
          >
            {voucherSaving ? "Uploading..." : "Upload"}
          </button>
        </div>
      </ModalShell>

      {/* Upload modal */}
      <ModalShell
        open={uploadOpen}
        title="Upload Document"
        subtitle="PDF/JPG/PNG (max 5MB). Stored locally."
      >
        {uploadErr ? (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-sm text-red-700">
            {uploadErr}
          </div>
        ) : null}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <div className="text-sm font-medium text-slate-600 mb-2">
              Category
            </div>
            <select
              className="w-full rounded-lg border px-3 py-2 text-sm bg-white border-slate-200 text-slate-900"
              value={uploadCategory}
              onChange={(e) => setUploadCategory(e.target.value)}
              disabled={uploadSaving}
            >
              <option value="REPORT">REPORT</option>
              <option value="BILL">BILL</option>
              <option value="NOTE">NOTE</option>
              <option value="OTHER">OTHER</option>
            </select>
          </div>

          <div>
            <div className="text-sm font-medium text-slate-600 mb-2">File</div>
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm"
              disabled={uploadSaving}
            />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setUploadOpen(false);
              setUploadFile(null);
              setUploadErr(null);
            }}
            className="rounded-lg border bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50"
            disabled={uploadSaving}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={uploadDoc}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            disabled={uploadSaving || !uploadFile}
          >
            {uploadSaving ? "Uploading..." : "Upload"}
          </button>
        </div>
      </ModalShell>
    </div>
  );
}
