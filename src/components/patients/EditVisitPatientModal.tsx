"use client";

import { useEffect, useMemo, useState } from "react";
import ReferralComboBox from "@/components/ui/ReferralComboBox";

type PayStatus = "ACCEPTED" | "PENDING" | "WAIVED";
type Referral = { id: string; name: string };

type Doctor = { id: number; full_name: string };
type PaymentMode = { code: string; display_name: string };

type FieldErrors = Partial<
  Record<
    | "visitDate"
    | "name"
    | "phone"
    | "doctorId"
    | "consultingFee"
    | "paymentMode"
    | "form",
    string
  >
>;

function digitsOnly(s: string) {
  return (s || "").replace(/\D+/g, "").slice(0, 10);
}

function errorForMessage(msg: string): Partial<FieldErrors> {
  const m = msg.toLowerCase();
  if (m.includes("paymentmode")) return { paymentMode: msg };
  if (m.includes("doctorid") || m.includes("doctor")) return { doctorId: msg };
  if (m.includes("visitdate") || m.includes("visit date"))
    return { visitDate: msg };
  if (m.includes("name")) return { name: msg };
  if (m.includes("phone")) return { phone: msg };
  if (m.includes("fee")) return { consultingFee: msg };
  return { form: msg };
}

export default function EditVisitPatientModal({
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
  const [dirty, setDirty] = useState(false);

  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [modes, setModes] = useState<PaymentMode[]>([]);

  const [referral, setReferral] = useState<Referral | null>(null);

  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const [form, setForm] = useState<{
    visitDate: string;
    name: string;
    phone: string;
    doctorId: number;
    consultingFee: string;
    payStatus: PayStatus;
    paymentMode: string;
  }>({
    visitDate: "",
    name: "",
    phone: "",
    doctorId: 0,
    consultingFee: "",
    payStatus: "ACCEPTED",
    paymentMode: "",
  });

  const canSave = useMemo(() => {
    if (!visitId) return false;
    if (!form.visitDate) return false;
    if (!form.name.trim()) return false;
    if (!form.doctorId) return false;
    if (!form.paymentMode) return false;
    if (form.phone && form.phone.length !== 10) return false;
    return true;
  }, [visitId, form]);

  function validate(): boolean {
    const e: FieldErrors = {};

    if (!form.visitDate) e.visitDate = "Visit date is required.";
    if (!form.name.trim()) e.name = "Name is required.";
    if (!form.doctorId) e.doctorId = "Consulting doctor is required.";
    if (!form.paymentMode) e.paymentMode = "Payment mode is required.";

    const phoneDigits = digitsOnly(form.phone);
    if (phoneDigits && phoneDigits.length !== 10)
      e.phone = "Phone must be 10 digits.";

    const feeNum = Number(form.consultingFee || 0);
    if (!Number.isFinite(feeNum) || feeNum < 0)
      e.consultingFee = "Fee must be 0 or more.";

    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function clearError(field: keyof FieldErrors) {
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  function requestClose() {
    if (dirty) {
      const ok = window.confirm("You have unsaved changes. Discard and close?");
      if (!ok) return;
    }
    setErrors({});
    setFormError(null);
    onClose();
  }

  useEffect(() => {
    if (!open) return;
    let ignore = false;
    (async () => {
      try {
        const [dRes, mRes] = await Promise.all([
          fetch("/api/reception/doctors", { cache: "no-store" }),
          fetch("/api/reception/payment-modes", { cache: "no-store" }),
        ]);

        const dJson = await dRes.json().catch(() => ({}));
        const mJson = await mRes.json().catch(() => ({}));

        if (!ignore) {
          setDoctors(dJson.doctors ?? []);
          setModes(mJson.modes ?? mJson.paymentModes ?? []);
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      ignore = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !visitId) return;

    let ignore = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/reception/visits/${visitId}`, {
          cache: "no-store",
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          if (!ignore)
            setFormError(String(data?.error || "Failed to load visit."));
          return;
        }

        if (ignore) return;

        setForm({
          visitDate: data.visit?.visitDate ?? "",
          name: data.patient?.name ?? "",
          phone: digitsOnly(data.patient?.phone ?? ""),
          doctorId: Number(data.visit?.doctorId ?? 0),
          consultingFee: String(data.payment?.consultingFee ?? ""),
          payStatus: (data.payment?.payStatus ?? "ACCEPTED") as PayStatus,
          paymentMode: String(data.payment?.paymentMode ?? ""),
        });

        setReferral(data.visit?.referral ?? null);
        setDirty(false);
        setErrors({});
        setFormError(null);
      } catch {
        if (!ignore) setFormError("Network error while loading visit.");
      } finally {
        if (!ignore) setLoading(false);
      }
    })();

    return () => {
      ignore = true;
    };
  }, [open, visitId]);

  async function save() {
    if (!visitId) return;

    setFormError(null);
    if (!validate()) return;

    setLoading(true);
    try {
      const payload = {
        visitDate: form.visitDate,
        name: form.name.trim(),
        phone: form.phone ? digitsOnly(form.phone) : "",
        doctorId: form.doctorId,
        referralId: referral?.id ?? null,
        consultingFee: Number(form.consultingFee || 0),
        payStatus: form.payStatus,
        paymentMode: form.paymentMode,
      };

      const res = await fetch(`/api/reception/visits/${visitId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg = String(data?.error || "Save failed.");
        const mapped = errorForMessage(msg);
        setErrors((prev) => ({ ...prev, ...mapped }));
        if (mapped.form) setFormError(mapped.form);
        return;
      }

      setDirty(false);
      setErrors({});
      setFormError(null);
      onClose();
      onSaved();
    } catch {
      setFormError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  const inputClass = "w-full rounded-lg border px-3 py-2 text-sm bg-white";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl border">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <div className="text-lg font-semibold text-[#1f1f1f]">
              Edit Patient / Visit
            </div>
            <div className="text-sm text-[#646179]">
              Update visit + payment details
            </div>
          </div>
          <button
            type="button"
            onClick={requestClose}
            className="h-9 px-3 rounded-lg border bg-white hover:bg-gray-50"
            disabled={loading}
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-4">
          {formError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </div>
          )}

          {loading ? (
            <div className="text-sm text-[#646179]">Loading…</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="text-sm">
                Visit Date
                <input
                  className={inputClass}
                  type="date"
                  value={form.visitDate}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, visitDate: e.target.value }));
                    setDirty(true);
                    clearError("visitDate");
                  }}
                />
                {errors.visitDate && (
                  <div className="mt-1 text-xs text-red-600">
                    {errors.visitDate}
                  </div>
                )}
              </label>

              <label className="text-sm">
                Name
                <input
                  className={inputClass}
                  value={form.name}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, name: e.target.value }));
                    setDirty(true);
                    clearError("name");
                  }}
                />
                {errors.name && (
                  <div className="mt-1 text-xs text-red-600">{errors.name}</div>
                )}
              </label>

              <label className="text-sm">
                Phone
                <input
                  className={inputClass}
                  value={form.phone}
                  onChange={(e) => {
                    setForm((f) => ({
                      ...f,
                      phone: digitsOnly(e.target.value),
                    }));
                    setDirty(true);
                    clearError("phone");
                  }}
                />
                {errors.phone && (
                  <div className="mt-1 text-xs text-red-600">
                    {errors.phone}
                  </div>
                )}
              </label>

              <label className="text-sm">
                Consulting Doctor
                <select
                  className={inputClass}
                  value={form.doctorId}
                  onChange={(e) => {
                    setForm((f) => ({
                      ...f,
                      doctorId: Number(e.target.value),
                    }));
                    setDirty(true);
                    clearError("doctorId");
                  }}
                >
                  <option value={0}>Select Doctor</option>
                  {doctors.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.full_name}
                    </option>
                  ))}
                </select>
                {errors.doctorId && (
                  <div className="mt-1 text-xs text-red-600">
                    {errors.doctorId}
                  </div>
                )}
              </label>

              <label className="text-sm md:col-span-2">
                Referred By
                <div className="mt-1">
                  <ReferralComboBox
                    value={referral}
                    onChange={(v) => {
                      setReferral(v);
                      setDirty(true);
                    }}
                  />
                </div>
              </label>

              <label className="text-sm">
                Consultation Fee
                <input
                  className={inputClass}
                  type="number"
                  value={form.consultingFee}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, consultingFee: e.target.value }));
                    setDirty(true);
                    clearError("consultingFee");
                  }}
                />
                {errors.consultingFee && (
                  <div className="mt-1 text-xs text-red-600">
                    {errors.consultingFee}
                  </div>
                )}
              </label>

              <label className="text-sm">
                Payment Status
                <select
                  className={inputClass}
                  value={form.payStatus}
                  onChange={(e) => {
                    setForm((f) => ({
                      ...f,
                      payStatus: e.target.value as PayStatus,
                    }));
                    setDirty(true);
                  }}
                >
                  <option value="ACCEPTED">Collected</option>
                  <option value="PENDING">Pending</option>
                  <option value="WAIVED">Waived</option>
                </select>
              </label>

              <label className="text-sm md:col-span-2">
                Payment Mode
                <select
                  className={inputClass}
                  value={form.paymentMode}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, paymentMode: e.target.value }));
                    setDirty(true);
                    clearError("paymentMode");
                  }}
                >
                  <option value="">Select Mode</option>
                  {modes.map((m) => (
                    <option key={m.code} value={m.code}>
                      {m.display_name}
                    </option>
                  ))}
                </select>
                {errors.paymentMode && (
                  <div className="mt-1 text-xs text-red-600">
                    {errors.paymentMode}
                  </div>
                )}
              </label>

              {!canSave && (
                <div className="text-xs text-[#646179] md:col-span-2">
                  Fill required fields (date, name, doctor, payment mode). Phone
                  must be 10 digits if entered.
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t">
          <button
            type="button"
            onClick={requestClose}
            className="h-10 px-4 rounded-xl border bg-white hover:bg-gray-50"
            disabled={loading}
          >
            Close
          </button>
          <button
            type="button"
            onClick={save}
            className="h-10 px-4 rounded-xl bg-[#1f1f1f] text-white hover:bg-black disabled:opacity-60"
            disabled={loading}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
