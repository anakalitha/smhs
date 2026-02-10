"use client";

import React, { useEffect, useMemo, useState } from "react";

type FeeType = "CONSULTATION" | "SCAN" | "PAP_SMEAR" | "CTG" | "PHARMACY";
type AdjustmentType =
  | "WAIVE"
  | "DISCOUNT_PERCENT"
  | "DISCOUNT_AMOUNT"
  | "SET_AMOUNT";

type FeeLine = {
  paymentId: number;
  feeType: FeeType;
  displayName: string;
  baseAmount: number;
  amount: number;
  payStatus: "ACCEPTED" | "PENDING" | "WAIVED";
  paymentMode: string;
};

type VisitHdr = {
  visitId: number;
  visitDate: string;
  patientCode: string;
  patientName: string;
  doctorId: number;
  doctorName: string;
};

type GetFeesOk = {
  ok: true;
  visit: VisitHdr;
  fees: FeeLine[];
};

type GetFeesErr = { error: string };

type AdjustReqItem = {
  paymentId: number;
  feeType: FeeType;
  adjustmentType: AdjustmentType;
  adjustedAmount: number;
  discountValue?: number | null;
};

type AdjustReq = {
  reason: string;
  authorizedByDoctorId?: number | null;
  items: AdjustReqItem[];
};

type AdjustOk = {
  ok: true;
  visitId: number;
  updatedFees: Array<{
    paymentId: number;
    feeType: FeeType;
    amount: number;
    payStatus: "ACCEPTED" | "PENDING" | "WAIVED";
  }>;
};

type AdjustErr = { error: string };

function inr(n: number) {
  return n.toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });
}

function getErrorMessage(e: unknown, fallback: string) {
  if (e instanceof Error) return e.message;
  return fallback;
}

export default function FeeAdjustModal({
  open,
  onClose,
  visitId,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  visitId: number | null;
  onSaved?: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [visit, setVisit] = useState<VisitHdr | null>(null);
  const [fees, setFees] = useState<FeeLine[]>([]);

  const [reason, setReason] = useState("");
  const [authorizedByDoctorId, setAuthorizedByDoctorId] = useState<
    number | null
  >(null);

  // per-line edits keyed by paymentId
  const [edit, setEdit] = useState<
    Record<
      number,
      {
        adjustmentType: AdjustmentType;
        adjustedAmount: number;
        discountValue?: number;
      }
    >
  >({});

  useEffect(() => {
    if (!open || !visitId) return;

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      setReason("");
      setAuthorizedByDoctorId(null);

      try {
        const res = await fetch(`/api/visits/${visitId}/fees`, {
          cache: "no-store",
        });

        const data = (await res.json().catch(() => ({}))) as
          | GetFeesOk
          | GetFeesErr;

        if (!res.ok || !("ok" in data)) {
          throw new Error(
            ("error" in data && data.error) || "Failed to load fees."
          );
        }

        if (cancelled) return;

        setVisit(data.visit);
        setFees(data.fees);

        // init edit state to current amounts
        const next: Record<
          number,
          { adjustmentType: AdjustmentType; adjustedAmount: number }
        > = {};
        for (const f of data.fees) {
          next[f.paymentId] = {
            adjustmentType: "SET_AMOUNT",
            adjustedAmount: Number(f.amount ?? 0),
          };
        }
        setEdit(next);
      } catch (e: unknown) {
        if (!cancelled) setError(getErrorMessage(e, "Failed to load fees."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [open, visitId]);

  const anyChanges = useMemo(() => {
    return fees.some((f) => {
      const adjusted = Number(edit[f.paymentId]?.adjustedAmount ?? f.amount);
      return adjusted !== Number(f.amount);
    });
  }, [fees, edit]);

  function setLine(
    paymentId: number,
    patch: Partial<{
      adjustmentType: AdjustmentType;
      adjustedAmount: number;
      discountValue?: number;
    }>
  ) {
    setEdit((prev) => ({
      ...prev,
      [paymentId]: { ...prev[paymentId], ...patch },
    }));
  }

  function applyWaive(f: FeeLine) {
    setLine(f.paymentId, {
      adjustmentType: "WAIVE",
      adjustedAmount: 0,
      discountValue: undefined,
    });
  }

  function applyPercent(f: FeeLine, pct: number) {
    const clamped = Math.max(0, Math.min(100, pct));
    const amt = Math.round((Number(f.baseAmount) * (100 - clamped)) / 100);

    setLine(f.paymentId, {
      adjustmentType: "DISCOUNT_PERCENT",
      adjustedAmount: amt,
      discountValue: clamped,
    });
  }

  function applyDiscountAmount(f: FeeLine, disc: number) {
    const d = Math.max(0, disc);
    const amt = Math.max(0, Number(f.baseAmount) - d);

    setLine(f.paymentId, {
      adjustmentType: "DISCOUNT_AMOUNT",
      adjustedAmount: amt,
      discountValue: d,
    });
  }

  async function save() {
    setError(null);

    if (!visitId) return;

    if (!anyChanges) {
      onClose();
      return;
    }

    if (!reason.trim()) {
      setError("Reason is required.");
      return;
    }

    const items: AdjustReqItem[] = fees
      .filter((f) => {
        const adjusted = Number(edit[f.paymentId]?.adjustedAmount ?? f.amount);
        return adjusted !== Number(f.amount);
      })
      .map((f) => ({
        paymentId: f.paymentId,
        feeType: f.feeType,
        adjustmentType: edit[f.paymentId]?.adjustmentType ?? "SET_AMOUNT",
        adjustedAmount: Number(edit[f.paymentId]?.adjustedAmount ?? f.amount),
        discountValue: edit[f.paymentId]?.discountValue ?? null,
      }));

    const payload: AdjustReq = {
      reason: reason.trim(),
      authorizedByDoctorId,
      items,
    };

    setSaving(true);
    try {
      const res = await fetch(`/api/visits/${visitId}/fees/adjust`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await res.json().catch(() => ({}))) as AdjustOk | AdjustErr;

      if (!res.ok || !("ok" in data)) {
        throw new Error(
          ("error" in data && data.error) || "Failed to save adjustments."
        );
      }

      onSaved?.();
      onClose();
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Failed to save adjustments."));
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-4xl rounded-2xl border bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b p-4">
          <div>
            <div className="text-base font-semibold text-slate-900">
              Adjust Fees
            </div>
            <div className="text-xs text-slate-600 mt-1">
              {visit ? (
                <>
                  Visit #{visit.visitId} • {visit.visitDate} •{" "}
                  {visit.patientCode} • {visit.patientName} • {visit.doctorName}
                </>
              ) : (
                "—"
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            Close
          </button>
        </div>

        <div className="p-4">
          {loading ? (
            <div className="text-sm text-slate-600">Loading…</div>
          ) : error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          ) : (
            <>
              <div className="w-full overflow-x-auto rounded-xl border">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr className="border-b">
                      <th className="px-3 py-2 text-left font-medium">
                        Fee Type
                      </th>
                      <th className="px-3 py-2 text-right font-medium">Base</th>
                      <th className="px-3 py-2 text-right font-medium">
                        Current
                      </th>
                      <th className="px-3 py-2 text-left font-medium">
                        Action
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Adjusted
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {fees.map((f) => {
                      const adjusted = Number(
                        edit[f.paymentId]?.adjustedAmount ?? f.amount
                      );

                      return (
                        <tr
                          key={f.paymentId}
                          className="border-b last:border-b-0"
                        >
                          <td className="px-3 py-2 text-slate-900">
                            {f.displayName}
                          </td>

                          <td className="px-3 py-2 text-right text-slate-900">
                            {inr(Number(f.baseAmount))}
                          </td>

                          <td className="px-3 py-2 text-right text-slate-900">
                            {inr(Number(f.amount))}
                          </td>

                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                className="rounded-md border bg-white px-2 py-1 text-xs hover:bg-gray-50"
                                onClick={() => applyWaive(f)}
                              >
                                Waive
                              </button>

                              <div className="flex items-center gap-1">
                                <span className="text-xs text-slate-500">
                                  %
                                </span>
                                <input
                                  className="w-16 rounded-md border px-2 py-1 text-xs"
                                  type="number"
                                  min={0}
                                  max={100}
                                  onChange={(e) =>
                                    applyPercent(f, Number(e.target.value))
                                  }
                                  placeholder="0"
                                />
                              </div>

                              <div className="flex items-center gap-1">
                                <span className="text-xs text-slate-500">
                                  ₹
                                </span>
                                <input
                                  className="w-20 rounded-md border px-2 py-1 text-xs"
                                  type="number"
                                  min={0}
                                  onChange={(e) =>
                                    applyDiscountAmount(
                                      f,
                                      Number(e.target.value)
                                    )
                                  }
                                  placeholder="0"
                                />
                              </div>
                            </div>
                          </td>

                          <td className="px-3 py-2 text-right">
                            <input
                              className="w-28 rounded-md border px-2 py-1 text-sm text-right"
                              type="number"
                              min={0}
                              max={Number(f.baseAmount)}
                              value={Number.isFinite(adjusted) ? adjusted : 0}
                              onChange={(e) =>
                                setLine(f.paymentId, {
                                  adjustmentType: "SET_AMOUNT",
                                  adjustedAmount: Number(e.target.value),
                                  discountValue: undefined,
                                })
                              }
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <div className="text-sm font-medium text-slate-700 mb-1">
                    Reason (required)
                  </div>
                  <textarea
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    rows={3}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Example: Waived as per Dr. note dated 02/02/2026"
                  />
                </div>

                <div>
                  <div className="text-sm font-medium text-slate-700 mb-1">
                    Authorized by Doctor (optional)
                  </div>
                  <input
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    type="number"
                    placeholder="Doctor ID (optional for now)"
                    value={authorizedByDoctorId ?? ""}
                    onChange={(e) =>
                      setAuthorizedByDoctorId(
                        e.target.value ? Number(e.target.value) : null
                      )
                    }
                  />
                  <div className="mt-2 text-xs text-slate-500">
                    (We can replace this with a Doctor dropdown later.)
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={save}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {saving ? "Saving…" : "Apply Adjustment"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
