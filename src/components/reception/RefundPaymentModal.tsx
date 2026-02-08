"use client";

import React, { useEffect, useState } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  onSuccess: () => Promise<void>;

  visitId: number | null;
  serviceId: number | null;

  patientName: string;
  netPaidAmount: number;
};

const inputClass =
  "w-full rounded-lg border px-3 py-2 text-sm bg-white border-slate-200 " +
  "focus:outline-none focus:ring-2 focus:ring-slate-400/20";

export default function RefundPaymentModal({
  open,
  onClose,
  onSuccess,
  visitId,
  serviceId,
  patientName,
  netPaidAmount,
}: Props) {
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState("CASH");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setAmount(String(netPaidAmount));
      setMode("CASH");
      setReason("");
      setErr(null);
    }
  }, [open, netPaidAmount]);

  if (!open || !visitId || !serviceId) return null;

  async function submit() {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setErr("Enter a valid amount.");
      return;
    }
    if (amt > netPaidAmount) {
      setErr("Refund cannot exceed net paid amount.");
      return;
    }

    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/reception/payments/refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visitId,
          serviceId,
          amount: amt,
          paymentMode: mode,
          reason: reason.trim() || null,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data?.error || "Failed to refund.");
        return;
      }

      await onSuccess();
      onClose();
    } catch {
      setErr("Network error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-xl bg-white shadow-lg">
        <div className="border-b px-4 py-3">
          <div className="text-sm font-semibold text-slate-900">
            Refund Payment
          </div>
          <div className="text-xs text-slate-600 mt-0.5">{patientName}</div>
        </div>

        <div className="p-4 space-y-3">
          <div>
            <div className="text-xs text-slate-600 mb-1">Net Paid Amount</div>
            <input
              className={inputClass}
              value={netPaidAmount.toFixed(0)}
              disabled
            />
          </div>

          <div>
            <div className="text-xs text-slate-600 mb-1">Amount to Refund</div>
            <input
              className={inputClass}
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div>
            <div className="text-xs text-slate-600 mb-1">Payment Mode</div>
            <select
              className={inputClass}
              value={mode}
              onChange={(e) => setMode(e.target.value)}
            >
              <option value="CASH">Cash</option>
              <option value="UPI">UPI</option>
              <option value="CARD">Card</option>
              <option value="GooglePay">Google Pay</option>
              <option value="PhonePe">PhonePe</option>
              <option value="AmazonPay">Amazon Pay</option>
              <option value="INSURANCE">Insurance</option>
            </select>
          </div>

          <div>
            <div className="text-xs text-slate-600 mb-1">Reason (optional)</div>
            <input
              className={inputClass}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., cancelled / overpaid"
            />
          </div>

          {err && <div className="text-sm text-red-700">{err}</div>}
        </div>

        <div className="border-t px-4 py-3 flex justify-end gap-2">
          <button
            className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            onClick={submit}
            disabled={loading}
          >
            {loading ? "Processing..." : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
