"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type DiscountType = "NONE" | "PERCENT" | "AMOUNT" | "WAIVE";
type PayStatus = "ACCEPTED" | "PENDING" | "WAIVED";

function num(v: string) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

type ScanBillingInfo = {
  order: {
    orderId: number;
    status: string;
    notes?: string | null;
  };
  visit: {
    visitId: number;
    visitDate: string;
    doctorName: string;
  };
  patient: {
    patientCode: string;
    name: string;
    phone: string;
  };
  defaults: {
    scanFee: number;
  };
  existing: {
    chargeId: number | null;
    baseAmount: number;
    finalAmount: number;
    discountType: "NONE" | "PERCENT" | "AMOUNT" | "WAIVE";
    discountValue: number;
    reason: string;
    payment: {
      paymentId: number;
      amount: number;
      payStatus: "ACCEPTED" | "PENDING" | "WAIVED";
      paymentMode: string;
    } | null;
  };
};

export default function ScanBillingPage() {
  const router = useRouter();
  const params = useParams<{ orderId: string }>();
  const orderId = params.orderId;

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [info, setInfo] = useState<ScanBillingInfo | null>(null);

  const [baseAmount, setBaseAmount] = useState("0");
  const [discountType, setDiscountType] = useState<DiscountType>("NONE");
  const [discountValue, setDiscountValue] = useState("0");
  const [reason, setReason] = useState("");

  const [paymentMode, setPaymentMode] = useState("CASH");
  const [payStatus, setPayStatus] = useState<PayStatus>("ACCEPTED");

  const finalAmount = useMemo(() => {
    const base = num(baseAmount);
    const dv = num(discountValue);
    if (discountType === "WAIVE") return 0;
    if (discountType === "PERCENT")
      return Math.max(0, base - (base * dv) / 100);
    if (discountType === "AMOUNT") return Math.max(0, base - dv);
    return base;
  }, [baseAmount, discountType, discountValue]);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/scan/orders/${orderId}`, {
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data?.error || "Failed to load order.");
        return;
      }
      setInfo(data);

      const defaultFee = Number(data.defaults?.scanFee ?? 0);
      const existing = data.existing;

      // prefer existing charge values if present
      const initialBase = existing?.chargeId
        ? Number(existing.baseAmount ?? 0)
        : defaultFee;
      setBaseAmount(String(initialBase));

      setDiscountType((existing?.discountType ?? "NONE") as DiscountType);
      setDiscountValue(String(existing?.discountValue ?? 0));
      setReason(existing?.reason ?? "");

      setPaymentMode(existing?.payment?.paymentMode ?? "CASH");
      setPayStatus((existing?.payment?.payStatus ?? "ACCEPTED") as PayStatus);
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    setErr(null);

    const changed =
      discountType !== "NONE" ||
      Math.round(finalAmount * 100) !== Math.round(num(baseAmount) * 100);

    if (changed && reason.trim().length === 0) {
      setErr("Reason is required when discount/waive is applied.");
      return;
    }

    const res = await fetch(`/api/scan/orders/${orderId}/bill`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        baseAmount: num(baseAmount),
        discountType,
        discountValue: num(discountValue),
        finalAmount,
        reason,
        paymentMode,
        payStatus,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(data?.error || "Save failed.");
      return;
    }

    // reload so the UI reflects “COMPLETED/IN_PROGRESS”
    await load();
    alert("Saved scan bill successfully.");
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  if (loading) return <div className="p-6">Loading…</div>;
  if (err) return <div className="p-6 text-red-600">{err}</div>;
  if (!info) return <div className="p-6">Not found.</div>;

  const { patient, visit, order } = info;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="rounded-2xl border bg-white shadow-sm">
        <div className="p-4 border-b">
          <div className="text-lg font-semibold">Scan Billing</div>
          <div className="text-sm text-slate-600">
            Patient: <span className="font-medium">{patient.name}</span> (
            {patient.patientCode}) • Visit:{" "}
            <span className="font-medium">{visit.visitDate}</span> • Doctor:{" "}
            <span className="font-medium">{visit.doctorName}</span>
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Order #{order.orderId} • Status: {order.status}
          </div>
        </div>

        <div className="p-4 space-y-4">
          {err && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {err}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <div className="text-sm font-medium text-slate-700 mb-1">
                Base Fee
              </div>
              <input
                className="w-full rounded-lg border px-3 py-2 text-sm"
                value={baseAmount}
                onChange={(e) =>
                  setBaseAmount(e.target.value.replace(/[^0-9.]/g, ""))
                }
              />
              <div className="text-xs text-slate-500 mt-1">
                Default from fee catalog
              </div>
            </div>

            <div>
              <div className="text-sm font-medium text-slate-700 mb-1">
                Final Fee
              </div>
              <div className="w-full rounded-lg border px-3 py-2 text-sm bg-slate-50">
                ₹ {finalAmount.toFixed(2)}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                Computed after discount
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <div className="text-sm font-medium text-slate-700 mb-1">
                Discount Type
              </div>
              <select
                className="w-full rounded-lg border px-3 py-2 text-sm"
                value={discountType}
                onChange={(e) =>
                  setDiscountType(e.target.value as DiscountType)
                }
              >
                <option value="NONE">None</option>
                <option value="PERCENT">Percent (%)</option>
                <option value="AMOUNT">Amount (₹)</option>
                <option value="WAIVE">Waive (Free)</option>
              </select>
            </div>

            <div>
              <div className="text-sm font-medium text-slate-700 mb-1">
                Discount Value
              </div>
              <input
                className="w-full rounded-lg border px-3 py-2 text-sm"
                value={discountValue}
                disabled={discountType === "NONE" || discountType === "WAIVE"}
                onChange={(e) =>
                  setDiscountValue(e.target.value.replace(/[^0-9.]/g, ""))
                }
              />
            </div>

            <div>
              <div className="text-sm font-medium text-slate-700 mb-1">
                Payment Status
              </div>
              <select
                className="w-full rounded-lg border px-3 py-2 text-sm"
                value={payStatus}
                onChange={(e) => setPayStatus(e.target.value as PayStatus)}
              >
                <option value="ACCEPTED">Accepted</option>
                <option value="PENDING">Pending</option>
                <option value="WAIVED">Waived</option>
              </select>
            </div>
          </div>

          <div>
            <div className="text-sm font-medium text-slate-700 mb-1">
              Reason (required if discounted/waived)
            </div>
            <input
              className="w-full rounded-lg border px-3 py-2 text-sm"
              placeholder="Eg: Waived by Dr. X, note shown by patient"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <div className="text-sm font-medium text-slate-700 mb-1">
                Payment Mode
              </div>
              <input
                className="w-full rounded-lg border px-3 py-2 text-sm"
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value)}
              />
              <div className="text-xs text-slate-500 mt-1">
                You can switch to select later
              </div>
            </div>

            <div className="flex items-end justify-end gap-2">
              <button
                className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
                onClick={() => router.push("/scan/orders")}
              >
                ← Back to Orders
              </button>
              <button
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                onClick={save}
              >
                Save
              </button>
            </div>
          </div>

          <div className="text-xs text-slate-500">
            Note: This writes to <b>charges</b> + <b>payments</b>, and logs
            audit in <b>charge_adjustments</b> when fee changes.
          </div>
        </div>
      </div>
    </div>
  );
}
