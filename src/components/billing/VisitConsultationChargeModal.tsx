// src/components/billing/VisitConsultationChargeModal.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import ConfirmDialog from "@/components/ui/confirm-dialog";

type PaymentModeRow = { code: string; displayName: string };

type ApiVisitMeta = {
  patientName: string;
  patientPhone: string | null;
  referredById: string | null;
  referredBy: string | null;
};

type ApiCharge = {
  visitId: number;
  serviceId: number;
  serviceCode: string;
  serviceName: string;
  grossAmount: number;
  discountAmount: number;
  netAmount: number;
  paidAmount: number;
  pendingAmount: number;
  note: string | null;
};

type ConsultationChargeGetOk = {
  ok: true;
  visit: ApiVisitMeta;
  charge: ApiCharge;
};

type ConsultationChargeGetErr = { error: string };

type ConsultationChargeGetResponse =
  | ConsultationChargeGetOk
  | ConsultationChargeGetErr;

type PaymentModeApiRow = {
  code: string;
  display_name?: string;
  displayName?: string;
};

type PaymentModesOk = { modes: PaymentModeApiRow[] };
type PaymentModesErr = { error: string };
type PaymentModesResponse = PaymentModesOk | PaymentModesErr;

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

function hasKey<K extends string>(
  obj: Record<string, unknown>,
  key: K
): obj is Record<K, unknown> {
  return key in obj;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}

function toNum(v: string) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function sanitizeDecimalInput(
  raw: string,
  opts: { maxIntDigits: number; maxDecimals: number; max: number }
) {
  const cleaned = raw.replace(/[^\d.]/g, "");
  const parts = cleaned.split(".");
  const intPart = (parts[0] || "").slice(0, opts.maxIntDigits);
  const decPart = (parts[1] || "").slice(0, opts.maxDecimals);
  const merged = decPart.length ? `${intPart}.${decPart}` : intPart;

  const num = Number(merged);
  if (!merged) return "";
  if (!Number.isFinite(num)) return "";
  if (num > opts.max) return String(opts.max);
  return merged;
}

function formatINR(n: number) {
  return (Number(n) || 0).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });
}

function isValidPhone10Digits(s: string) {
  const v = s.trim();
  if (!v) return true;
  return /^\d{10}$/.test(v);
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function isChargeOk(x: unknown): x is ConsultationChargeGetOk {
  if (!isObject(x)) return false;
  return x.ok === true && hasKey(x, "visit") && hasKey(x, "charge");
}

function getErrorMessage(x: unknown): string | null {
  if (!isObject(x)) return null;
  const e = x.error;
  return typeof e === "string" ? e : null;
}

function isPaymentModesOk(x: unknown): x is PaymentModesOk {
  if (!isObject(x)) return false;
  if (!hasKey(x, "modes")) return false;
  return Array.isArray(x.modes);
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
  onSaved: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refunding, setRefunding] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [charge, setCharge] = useState<ApiCharge | null>(null);

  // edit fields
  const [patientName, setPatientName] = useState("");
  const [patientPhone, setPatientPhone] = useState("");
  const [referredById, setReferredById] = useState<string | null>(null);
  const [referredBy, setReferredBy] = useState("");

  // charge fields
  const [discount, setDiscount] = useState("");
  const [note, setNote] = useState("");

  // confirm close
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [initial, setInitial] = useState<{
    patientName: string;
    patientPhone: string;
    referredById: string | null;
    referredBy: string;
    discount: string;
    note: string;
  } | null>(null);

  // refund step
  const [modes, setModes] = useState<PaymentModeRow[]>([]);
  const [refundMode, setRefundMode] = useState<string>("CASH");
  const [refundDue, setRefundDue] = useState<number>(0);

  const gross = Number(charge?.grossAmount ?? 0);
  const paid = Number(charge?.paidAmount ?? 0);

  const discountNum = useMemo(
    () => clamp(toNum(discount || "0"), 0, gross),
    [discount, gross]
  );

  const netPreview = useMemo(
    () => clamp(gross - discountNum, 0, gross),
    [gross, discountNum]
  );

  const hasPhoneError = useMemo(
    () => !isValidPhone10Digits(patientPhone),
    [patientPhone]
  );

  const isDirty = useMemo(() => {
    if (!initial) return false;
    return (
      initial.patientName !== patientName ||
      initial.patientPhone !== patientPhone ||
      initial.referredById !== referredById ||
      initial.referredBy !== referredBy ||
      initial.discount !== discount ||
      initial.note !== note
    );
  }, [
    initial,
    patientName,
    patientPhone,
    referredById,
    referredBy,
    discount,
    note,
  ]);

  useEffect(() => {
    if (!open || !visitId) return;

    async function loadAll() {
      setErr(null);
      setLoading(true);
      setRefundDue(0);

      try {
        // 1) load visit + charge (same endpoint)
        const res = await fetch(
          `/api/reception/visits/${visitId}/consultation-charge`,
          { cache: "no-store" }
        );

        const json = await safeJson(res);

        if (!res.ok) {
          setErr(getErrorMessage(json) || "Failed to load.");
          setCharge(null);
          return;
        }

        if (!isChargeOk(json)) {
          setErr(getErrorMessage(json) || "Unexpected response from server.");
          setCharge(null);
          return;
        }

        const v = json.visit;
        const ch = json.charge;

        setCharge(ch);

        setPatientName(String(v.patientName ?? ""));
        setPatientPhone(String(v.patientPhone ?? ""));
        setReferredById(v.referredById ?? null);
        setReferredBy(String(v.referredBy ?? ""));

        const d = String(ch.discountAmount ?? 0);
        const n = String(ch.note ?? "");
        setDiscount(d);
        setNote(n);

        setInitial({
          patientName: String(v.patientName ?? ""),
          patientPhone: String(v.patientPhone ?? ""),
          referredById: v.referredById ?? null,
          referredBy: String(v.referredBy ?? ""),
          discount: d,
          note: n,
        });

        // 2) load payment modes for refund dropdown (default CASH)
        const mRes = await fetch("/api/reception/payment-modes", {
          cache: "no-store",
        });
        const mJson = await safeJson(mRes);

        if (mRes.ok && isPaymentModesOk(mJson)) {
          const mapped: PaymentModeRow[] = mJson.modes
            .filter(
              (x): x is PaymentModeApiRow =>
                isObject(x) && typeof x.code === "string"
            )
            .map((x) => ({
              code: String(x.code).toUpperCase(),
              displayName: String(x.displayName ?? x.display_name ?? x.code),
            }));

          setModes(mapped);

          const hasCash = mapped.some((x) => x.code === "CASH");
          setRefundMode(hasCash ? "CASH" : mapped[0]?.code ?? "CASH");
        } else {
          setModes([]);
          setRefundMode("CASH");
        }
      } catch {
        setErr("Network error.");
        setCharge(null);
      } finally {
        setLoading(false);
      }
    }

    void loadAll();
  }, [open, visitId]);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (saving || refunding) return;

      if (isDirty) setConfirmOpen(true);
      else onClose();
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, isDirty, saving, refunding, onClose]);

  if (!open) return null;

  function requestClose() {
    if (saving || refunding) return;
    if (isDirty) setConfirmOpen(true);
    else onClose();
  }

  async function save() {
    if (!visitId || !charge) return;

    if (!patientName.trim()) {
      setErr("Patient name is required.");
      return;
    }
    if (hasPhoneError) {
      setErr("Phone must be 10 digits (or blank).");
      return;
    }

    setErr(null);
    setSaving(true);

    try {
      // 1) save patient/referral
      const editRes = await fetch(`/api/reception/visits/${visitId}/edit`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientName: patientName.trim(),
          patientPhone: patientPhone.trim() || null,
          referredById: referredById ?? null,
          referredBy: referredBy.trim() || null,
        }),
      });

      const editJson = await safeJson(editRes);
      if (!editRes.ok) {
        setErr(getErrorMessage(editJson) || "Failed to save visit data.");
        return;
      }

      // 2) save consultation charge
      const res = await fetch(
        `/api/reception/visits/${visitId}/consultation-charge`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            discountAmount: discountNum,
            note: note.trim() || null,
          }),
        }
      );

      const json = await safeJson(res);
      if (!res.ok) {
        setErr(getErrorMessage(json) || "Failed to save charge.");
        return;
      }

      // compute refund due using the *preview* net
      const due = Math.max(
        (Number(charge.paidAmount ?? 0) || 0) - netPreview,
        0
      );
      setRefundDue(due);

      if (due <= 0) {
        onClose();
        onSaved();
      } else {
        // stay open for refund step; mark as clean
        setInitial({
          patientName,
          patientPhone,
          referredById,
          referredBy,
          discount,
          note,
        });
      }
    } catch {
      setErr("Network error.");
    } finally {
      setSaving(false);
    }
  }

  async function recordRefundAndPrint() {
    if (!visitId || !charge) return;
    if (refundDue <= 0) return;

    setErr(null);
    setRefunding(true);

    try {
      const res = await fetch(`/api/reception/payments/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visitId,
          serviceCode: charge.serviceCode,
          amount: refundDue,
          paymentMode: refundMode || "CASH", // matches your refund API body
          note: note.trim() || null,
        }),
      });

      const json = await safeJson(res);
      if (!res.ok) {
        setErr(getErrorMessage(json) || "Failed to record refund.");
        return;
      }

      if (
        isObject(json) &&
        typeof json.paymentId === "number" &&
        json.paymentId > 0
      ) {
        window.open(
          `/reception/refund-voucher/${json.paymentId}`,
          "_blank",
          "noopener,noreferrer"
        );
      }

      onSaved();
      onClose();
    } catch {
      setErr("Network error.");
    } finally {
      setRefunding(false);
    }
  }

  const showRefundStep = refundDue > 0;

  return (
    <>
      <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/40 p-4">
        <div className="w-full max-w-2xl rounded-2xl border bg-white shadow-xl overflow-hidden max-h-[calc(100vh-2rem)] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b px-4 py-3 shrink-0">
            <div>
              <div className="text-sm font-semibold text-[#1f1f1f]">
                Edit Visit Data
              </div>
              <div className="text-xs text-[#646179]">
                Update patient/referral + adjust consultation discount/waiver.
              </div>
            </div>

            <button
              type="button"
              onClick={requestClose}
              className="rounded-lg border bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
              disabled={saving || refunding}
            >
              Close
            </button>
          </div>

          <div className="p-4 overflow-y-auto flex-1">
            {err && (
              <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-sm text-red-700">
                {err}
              </div>
            )}

            {loading ? (
              <div className="text-sm text-[#646179]">Loading...</div>
            ) : !charge ? (
              <div className="text-sm text-[#646179]">No data.</div>
            ) : (
              <>
                {/* Patient / Referral */}
                <div className="rounded-xl border bg-white p-3">
                  <div className="text-sm font-semibold text-slate-900">
                    Patient / Referral
                  </div>

                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <div className="text-sm font-medium text-slate-600 mb-2">
                        Patient Name <span className="text-red-600">*</span>
                      </div>
                      <input
                        className="w-full rounded-lg border px-3 py-2 text-sm bg-white border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                        value={patientName}
                        onChange={(e) => setPatientName(e.target.value)}
                        placeholder="Enter patient name"
                      />
                    </div>

                    <div>
                      <div className="text-sm font-medium text-slate-600 mb-2">
                        Phone
                      </div>
                      <input
                        className="w-full rounded-lg border px-3 py-2 text-sm bg-white border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                        value={patientPhone}
                        onChange={(e) => setPatientPhone(e.target.value)}
                        placeholder="10-digit phone (optional)"
                        inputMode="numeric"
                      />
                      {hasPhoneError ? (
                        <div className="mt-1 text-xs text-red-600">
                          Phone must be 10 digits.
                        </div>
                      ) : null}
                    </div>

                    <div className="md:col-span-2">
                      <div className="text-sm font-medium text-slate-600 mb-2">
                        Referred By
                      </div>
                      <input
                        className="w-full rounded-lg border px-3 py-2 text-sm bg-white border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                        value={referredBy}
                        onChange={(e) => setReferredBy(e.target.value)}
                        placeholder='e.g. "Dr. Sharma" / "Clinic XYZ" (optional)'
                      />
                      <div className="mt-1 text-[11px] text-slate-500">
                        {referredById ? `Referral ID: ${referredById}` : ""}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Charge Summary */}
                <div className="mt-4 rounded-xl border bg-slate-50 p-3">
                  <div className="text-xs text-slate-600">
                    Service:{" "}
                    <span className="font-semibold text-slate-900">
                      {charge.serviceName} ({charge.serviceCode})
                    </span>
                  </div>

                  <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                    <div className="flex items-center justify-between md:block">
                      <div className="text-slate-600">Gross</div>
                      <div className="font-semibold text-slate-900">
                        {formatINR(gross)}
                      </div>
                    </div>

                    <div className="flex items-center justify-between md:block">
                      <div className="text-slate-600">Paid</div>
                      <div className="font-semibold text-slate-900">
                        {formatINR(paid)}
                      </div>
                    </div>

                    <div className="flex items-center justify-between md:block">
                      <div className="text-slate-600">Preview Net</div>
                      <div className="font-semibold text-slate-900">
                        {formatINR(netPreview)}
                      </div>
                    </div>

                    <div className="flex items-center justify-between md:block">
                      <div className="text-slate-600">Current Net</div>
                      <div className="font-semibold text-slate-900">
                        {formatINR(Number(charge.netAmount ?? 0))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Discount + Note */}
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm font-medium text-slate-600 mb-2">
                      Discount / Waiver
                    </div>
                    <input
                      className="w-full rounded-lg border px-3 py-2 text-sm bg-white border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      type="text"
                      inputMode="decimal"
                      value={discount}
                      onChange={(e) =>
                        setDiscount(
                          sanitizeDecimalInput(e.target.value, {
                            maxIntDigits: 6,
                            maxDecimals: 2,
                            max: gross,
                          })
                        )
                      }
                      placeholder="0"
                    />
                    <div className="mt-2 text-xs text-slate-600">
                      Preview Net:{" "}
                      <span className="font-semibold text-slate-900">
                        {formatINR(netPreview)}
                      </span>
                    </div>
                  </div>

                  <div>
                    <div className="text-sm font-medium text-slate-600 mb-2">
                      Remarks (optional)
                    </div>
                    <input
                      className="w-full rounded-lg border px-3 py-2 text-sm bg-white border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder='e.g. "As per Dr. AHS orders on 05/08/2024"'
                    />
                  </div>
                </div>

                {/* Refund Step */}
                {showRefundStep ? (
                  <div className="mt-4 rounded-xl border border-yellow-200 bg-yellow-50 p-3">
                    <div className="text-sm font-semibold text-yellow-900">
                      Refund required: {formatINR(refundDue)}
                    </div>
                    <div className="mt-1 text-xs text-yellow-800">
                      Paid is greater than the new net. Please record refund and
                      print voucher for signature/audit trail.
                    </div>

                    <div className="mt-3 flex flex-col md:flex-row gap-2 md:items-center">
                      <div className="text-sm font-medium text-yellow-900">
                        Refund Mode
                      </div>
                      <select
                        className="rounded-lg border bg-white px-3 py-2 text-sm"
                        value={refundMode}
                        onChange={(e) => setRefundMode(e.target.value)}
                        disabled={refunding}
                      >
                        {modes.length ? (
                          modes.map((m) => (
                            <option key={m.code} value={m.code}>
                              {m.displayName}
                            </option>
                          ))
                        ) : (
                          <option value="CASH">CASH</option>
                        )}
                      </select>

                      <button
                        type="button"
                        onClick={recordRefundAndPrint}
                        className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                        disabled={refunding}
                      >
                        {refunding
                          ? "Recording..."
                          : "Record Refund + Print Voucher"}
                      </button>
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>

          <div className="border-t px-4 py-3 flex items-center justify-end gap-2 shrink-0 bg-white">
            <button
              type="button"
              onClick={requestClose}
              className="rounded-lg border bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-60"
              disabled={saving || refunding}
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={save}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              disabled={
                saving ||
                refunding ||
                loading ||
                !charge ||
                hasPhoneError ||
                patientName.trim().length === 0
              }
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Discard changes?"
        prompt="You have unsaved changes. If you close now, your edits will be lost."
        yesText="Discard"
        noText="Continue Editing"
        onYes={() => {
          setConfirmOpen(false);
          onClose();
        }}
        onNo={() => setConfirmOpen(false)}
      />
    </>
  );
}
