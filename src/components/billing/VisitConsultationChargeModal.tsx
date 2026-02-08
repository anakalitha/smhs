"use client";

import React, { useEffect, useMemo, useState } from "react";

type GetOk = {
  ok: true;
  visit: {
    visitId: number;
    visitDate: string;
    patientCode: string;
    patientName: string;
    doctorName: string | null;
  };
  charge: {
    gross: number;
    discount: number;
    net: number;
    paid: number;
    pending: number;
  };
};

type GetErr = { error: string };

function inr(n: number) {
  return n.toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });
}

function toNum(v: string) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}

export default function VisitConsultationChargeModal({
  open,
  visitId,
  onClose,
  onSaved,
}: {
  open: boolean;
  visitId: number | null;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [hdr, setHdr] = useState<GetOk["visit"] | null>(null);
  const [orig, setOrig] = useState<GetOk["charge"] | null>(null);

  const [gross, setGross] = useState("");
  const [discount, setDiscount] = useState("");
  const [reason, setReason] = useState("");

  const computed = useMemo(() => {
    const g = Math.max(0, toNum(gross));
    const d = clamp(Math.max(0, toNum(discount)), 0, g);
    const net = Math.max(0, g - d);
    return { g, d, net };
  }, [gross, discount]);

  const paid = orig?.paid ?? 0;
  const pendingAfter = useMemo(() => {
    if (!orig) return 0;
    return Math.max(0, computed.net - paid);
  }, [orig, computed.net, paid]);

  const invalidNetBelowPaid = useMemo(() => {
    if (!orig) return false;
    return computed.net < paid;
  }, [orig, computed.net, paid]);

  const changed = useMemo(() => {
    if (!orig) return false;
    const g0 = Number(orig.gross);
    const d0 = Number(orig.discount);
    return computed.g !== g0 || computed.d !== d0;
  }, [orig, computed.g, computed.d]);

  useEffect(() => {
    if (!open || !visitId) return;

    let cancelled = false;

    async function load() {
      setLoading(true);
      setSaving(false);
      setError(null);
      setReason("");

      try {
        const res = await fetch(`/api/visits/${visitId}/consultation-charge`, {
          cache: "no-store",
        });
        const data = (await res.json().catch(() => ({}))) as GetOk | GetErr;

        if (!res.ok || !("ok" in data)) {
          throw new Error(("error" in data && data.error) || "Failed to load.");
        }

        if (cancelled) return;

        setHdr(data.visit);
        setOrig(data.charge);

        setGross(String(Number(data.charge.gross || 0)));
        setDiscount(String(Number(data.charge.discount || 0)));
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [open, visitId]);

  async function save() {
    setError(null);
    if (!visitId) return;

    if (!changed) {
      onClose();
      return;
    }

    if (!reason.trim()) {
      setError("Reason is required.");
      return;
    }

    if (invalidNetBelowPaid) {
      const needRefund = Math.max(0, paid - computed.net);
      setError(
        `Cannot reduce net below already paid (${inr(paid)}). Refund ${inr(
          needRefund
        )} first, then adjust the charge.`
      );
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(
        `/api/visits/${visitId}/consultation-charge/adjust`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            gross: computed.g,
            discount: computed.d,
            reason: reason.trim(),
          }),
        }
      );
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Failed to save changes.");
      }

      onSaved?.();
      onClose();
    } catch (e: any) {
      setError(e?.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-3xl rounded-2xl border bg-white shadow-xl overflow-hidden">
        <div className="flex items-start justify-between gap-4 border-b p-4">
          <div>
            <div className="text-base font-semibold text-slate-900">
              Edit Visit Data (Consultation Charge)
            </div>
            <div className="text-xs text-slate-600 mt-1">
              {hdr ? (
                <>
                  Visit #{hdr.visitId} • {hdr.visitDate} • {hdr.patientCode} •{" "}
                  {hdr.patientName}
                  {hdr.doctorName ? ` • ${hdr.doctorName}` : ""}
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
              {/* Summary */}
              <div className="rounded-xl border bg-slate-50 p-3">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
                  <div>
                    <div className="text-slate-600">Gross</div>
                    <div className="font-semibold text-slate-900">
                      {inr(computed.g)}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-600">Discount</div>
                    <div className="font-semibold text-slate-900">
                      {inr(computed.d)}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-600">Net</div>
                    <div className="font-semibold text-slate-900">
                      {inr(computed.net)}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-600">Paid</div>
                    <div className="font-semibold text-slate-900">
                      {inr(paid)}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-600">Pending (after)</div>
                    <div className="font-semibold text-slate-900">
                      {inr(pendingAfter)}
                    </div>
                  </div>
                </div>
                {invalidNetBelowPaid && (
                  <div className="mt-2 text-xs text-red-700">
                    Net cannot be lower than Paid. Refund first if needed.
                  </div>
                )}
              </div>

              {/* Inputs */}
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="text-sm font-medium text-slate-700 mb-1">
                    Gross Amount
                  </div>
                  <input
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    type="number"
                    min={0}
                    value={gross}
                    onChange={(e) => setGross(e.target.value)}
                  />
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      className="rounded-lg border bg-white px-3 py-1.5 text-xs hover:bg-gray-50"
                      onClick={() => {
                        setDiscount(String(toNum(gross)));
                      }}
                    >
                      Waive (Net=0)
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border bg-white px-3 py-1.5 text-xs hover:bg-gray-50"
                      onClick={() => {
                        // Common correction helper: set gross 200, discount 0
                        setGross("200");
                        setDiscount("0");
                      }}
                    >
                      Set to 200
                    </button>
                  </div>
                </div>

                <div>
                  <div className="text-sm font-medium text-slate-700 mb-1">
                    Discount / Waiver
                  </div>
                  <input
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    type="number"
                    min={0}
                    value={discount}
                    onChange={(e) => setDiscount(e.target.value)}
                  />
                </div>
              </div>

              <div className="mt-4">
                <div className="text-sm font-medium text-slate-700 mb-1">
                  Reason (required)
                </div>
                <textarea
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Example: Corrected historical entry (was wrongly entered as 500)."
                />
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
                  disabled={saving || invalidNetBelowPaid}
                  onClick={save}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {saving ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
