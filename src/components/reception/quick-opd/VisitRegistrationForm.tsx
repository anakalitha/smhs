// src/components/reception/quick-opd/VisitRegistrationForm.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import ReferralComboBox from "@/components/ui/ReferralComboBox";
import AddDoctorModal from "@/components/ui/AddDoctorModal";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import PickPatientModal, { type PatientHit } from "../../ui/PickPatientModal";

type PayStatus = "ACCEPTED" | "PENDING" | "WAIVED";

type PaymentModeRow = { code: string; display_name: string };
type DoctorOption = { id: number; full_name: string };

type FormState = {
  visitDate: string;
  name: string;
  phone: string;
  doctorId: number;
  consultingFee: string;
  paymentMode: string;
  payStatus: PayStatus;
};

type FieldErrors = Partial<
  Record<
    | "visitDate"
    | "name"
    | "phone"
    | "doctorId"
    | "consultingFee"
    | "paymentMode"
    | "payStatus"
    | "form",
    string
  >
>;

type Mode = "create" | "edit";

type Props = {
  mode?: Mode;
  visitId?: number | null;
  showFetch?: boolean;
  onSuccess?: (info: { visitId: number }) => void;
  openBillOnCreate?: boolean;
};

function todayLocalYYYYMMDD() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function digitsOnly(s: string) {
  return s.replace(/\D+/g, "");
}

function formatPhoneUI(digits: string) {
  const d = digits.slice(0, 10);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)} ${d.slice(5)}`;
}

function toPayStatus(v: string): PayStatus {
  if (v === "ACCEPTED" || v === "PENDING" || v === "WAIVED") return v;
  return "ACCEPTED";
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

function FormField({
  label,
  children,
  error,
  showError = true,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  error?: string;
  showError?: boolean;
}) {
  return (
    <div>
      <div className="text-sm font-medium text-slate-600 mb-2">{label}</div>
      {children}
      {showError && error && (
        <p className="mt-1 text-sm font-medium text-red-600 mb-2">{error}</p>
      )}
    </div>
  );
}

const inputClass =
  "w-full rounded-lg border px-3 py-2 text-sm transition-all duration-200 " +
  "bg-white border-slate-200 text-slate-900 " +
  "placeholder:text-slate-400 " +
  "focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500";

const selectClass =
  "w-full rounded-lg border px-3 py-2 text-sm bg-white border-slate-200 text-slate-900 " +
  "focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500";

export default function VisitRegistrationForm({
  mode = "create",
  visitId = null,
  showFetch = mode === "create",
  onSuccess,
  openBillOnCreate = true,
}: Props) {
  const [doctors, setDoctors] = useState<DoctorOption[]>([]);
  const [loadingDoctors, setLoadingDoctors] = useState(false);

  const [paymentModes, setPaymentModes] = useState<PaymentModeRow[]>([]);
  const [loadingModes, setLoadingModes] = useState(false);

  const [referral, setReferral] = useState<{ id: string; name: string } | null>(
    null
  );

  const [showAddDoctor, setShowAddDoctor] = useState(false);

  const [form, setForm] = useState<FormState>({
    visitDate: todayLocalYYYYMMDD(),
    name: "",
    phone: "",
    doctorId: 0,
    consultingFee: "",
    paymentMode: "",
    payStatus: "ACCEPTED",
  });

  const [errors, setErrors] = useState<FieldErrors>({});
  const [touched, setTouched] = useState<
    Partial<Record<keyof FieldErrors, boolean>>
  >({});
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Prefill search (repeat patient) — create mode only
  const [prefillQuery, setPrefillQuery] = useState("");
  const [prefillLoading, setPrefillLoading] = useState(false);
  const [prefillError, setPrefillError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [pickOpen, setPickOpen] = useState(false);
  const [prefillHits, setPrefillHits] = useState<PatientHit[]>([]);
  const [pickLoading, setPickLoading] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);

  function markTouched(field: keyof FieldErrors) {
    setTouched((t) => ({ ...t, [field]: true }));
  }

  const validate = useCallback((next: FormState): FieldErrors => {
    const e: FieldErrors = {};
    const name = next.name.trim();
    const phoneDigits = digitsOnly(next.phone);
    const fee = Number(next.consultingFee);

    if (!next.visitDate) e.visitDate = "Visit date is required.";
    const today = todayLocalYYYYMMDD();
    if (next.visitDate > today)
      e.visitDate = "Visit date cannot be in the future.";

    if (!name) e.name = "Name is required.";
    if (phoneDigits && phoneDigits.length !== 10)
      e.phone = "Enter a valid 10-digit phone number.";
    if (!next.doctorId) e.doctorId = "Please select a doctor.";

    if (next.consultingFee === "") e.consultingFee = "Fee is required.";
    else if (!Number.isFinite(fee) || fee < 0)
      e.consultingFee = "Enter a valid amount.";
    else if (fee > 9999.99) e.consultingFee = "Fee cannot exceed 9999.99.";
    else if (next.payStatus !== "WAIVED" && fee === 0)
      e.consultingFee = "Fee cannot be 0 unless Waived.";

    if (!next.paymentMode) e.paymentMode = "Select payment mode.";

    return e;
  }, []);

  const isValid = useMemo(
    () => Object.keys(validate(form)).length === 0,
    [form, validate]
  );

  // Load dropdown data once
  useEffect(() => {
    async function loadDoctors() {
      setLoadingDoctors(true);
      try {
        const res = await fetch("/api/reception/doctors");
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          const list: DoctorOption[] = data.doctors || [];
          setDoctors(list);
          setForm((f) => ({
            ...f,
            doctorId: f.doctorId || (list[0]?.id ?? 0),
          }));
        }
      } finally {
        setLoadingDoctors(false);
      }
    }

    async function loadModes() {
      setLoadingModes(true);
      try {
        const res = await fetch("/api/reception/payment-modes");
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          const modes: PaymentModeRow[] = data.modes || [];
          setPaymentModes(modes);
          setForm((f) => ({
            ...f,
            paymentMode: f.paymentMode || (modes[0]?.code ?? ""),
          }));
        }
      } finally {
        setLoadingModes(false);
      }
    }

    loadDoctors();
    loadModes();
  }, []);

  // ✅ Edit mode: load visit details and prefill (matches YOUR API response shape)
  useEffect(() => {
    if (mode !== "edit" || !visitId) return;

    let cancelled = false;

    async function loadVisit() {
      setFormError(null);
      setFormSuccess(null);
      setErrors({});
      setSubmitting(false);

      try {
        const res = await fetch(`/api/reception/visits/${visitId}`, {
          cache: "no-store",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || "Failed to load visit.");
        if (cancelled) return;

        const v = data.visit ?? {};
        const p = data.patient ?? {};
        const pay = data.payment ?? {};

        setForm((f) => ({
          ...f,
          visitDate: v.visitDate ?? f.visitDate,
          name: p.name ?? "",
          phone: String(p.phone ?? "").replace(/\D+/g, ""),
          doctorId: Number(v.doctorId ?? f.doctorId ?? 0),
          consultingFee: String(pay.consultingFee ?? ""),
          paymentMode: String(pay.paymentMode ?? f.paymentMode ?? ""),
          payStatus: toPayStatus(String(pay.payStatus ?? "ACCEPTED")),
        }));

        setReferral(
          v.referral?.id
            ? { id: String(v.referral.id), name: v.referral.name ?? "" }
            : null
        );
      } catch (e: unknown) {
        setFormError(e instanceof Error ? e.message : "Failed to load visit.");
      }
    }

    loadVisit();
    return () => {
      cancelled = true;
    };
  }, [mode, visitId]);

  async function fetchPrefillByPatientCode(patientCode: string) {
    const res = await fetch(
      `/api/reception/patients/${encodeURIComponent(patientCode)}/prefill`,
      { cache: "no-store" }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "Failed to fetch patient.");

    setForm((f) => ({
      ...f,
      name: data.patient?.name ?? "",
      phone: String(data.patient?.phone ?? "").replace(/\D+/g, ""),
      doctorId: data.latest?.doctor?.id ?? f.doctorId,
    }));

    setReferral(
      data.latest?.referral?.id
        ? {
            id: String(data.latest.referral.id),
            name: data.latest.referral.name,
          }
        : null
    );

    setTouched({});
    setFormSuccess(
      `Fetched patient ${patientCode}. You can edit and register.`
    );
  }

  async function handleFetchPatient() {
    const q = prefillQuery.trim();
    setPrefillError(null);
    setFormSuccess(null);

    if (!q) {
      setPrefillError("Enter Patient ID / Name / Phone to fetch.");
      return;
    }

    setPrefillQuery("");
    setPrefillLoading(true);

    try {
      const res = await fetch(
        `/api/reception/patients/search?q=${encodeURIComponent(q)}`,
        { cache: "no-store" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Search failed.");

      const hits = (data.hits || []) as {
        patientCode: string;
        name: string;
        phone: string | null;
      }[];

      if (hits.length === 0) {
        setPrefillError("No matching patient found. You can register as new.");
        return;
      }

      // ✅ For now, support single-hit prefill only to avoid unused prefillHits warning.
      // If multiple hits are common, we can add the pick modal back inside this component.
      if (hits.length === 1) {
        await fetchPrefillByPatientCode(hits[0].patientCode);
        return;
      }

      setPrefillError(null);
      setPrefillHits(hits);
      setPickError(null);
      setPickOpen(true);
      return;
    } catch (e: unknown) {
      setPrefillError(e instanceof Error ? e.message : "Fetch failed.");
    } finally {
      setPrefillLoading(false);
    }
  }

  function resetForm() {
    setFormError(null);
    setFormSuccess(null);
    setErrors({});
    setReferral(null);
    setTouched({});

    setForm((f) => ({
      ...f,
      visitDate: todayLocalYYYYMMDD(),
      name: "",
      phone: "",
      consultingFee: "",
      payStatus: "ACCEPTED",
      doctorId: doctors[0]?.id ?? 0,
      paymentMode: paymentModes[0]?.code ?? "",
    }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    const v = validate(form);
    setErrors(v);

    if (Object.keys(v).length) {
      setFormError("Please fix the highlighted fields.");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        visitDate: form.visitDate,
        name: form.name.trim(),
        phone: digitsOnly(form.phone).slice(0, 10),
        doctorId: form.doctorId,
        consultingFee: Number(form.consultingFee),
        paymentMode: form.paymentMode,
        payStatus: form.payStatus,
        referralId: referral?.id ?? null,
      };

      const url =
        mode === "edit" && visitId
          ? `/api/reception/visits/${visitId}`
          : "/api/reception/register";

      // ✅ Your API uses PATCH (not PUT)
      const method = mode === "edit" ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError(
          data?.error ||
            (mode === "edit" ? "Update failed." : "Registration failed.")
        );
        return;
      }

      const returnedVisitId: number =
        mode === "edit" ? visitId ?? 0 : data?.visitId ?? 0;

      setFormSuccess(
        mode === "edit"
          ? "Visit updated successfully."
          : "Patient registered and added to today's queue."
      );

      if (mode === "create") resetForm();

      if (mode === "create" && openBillOnCreate && data?.visitId) {
        window.open(
          `/reception/bill/${data.visitId}`,
          "_blank",
          "noopener,noreferrer"
        );
      }

      onSuccess?.({ visitId: returnedVisitId });
    } catch {
      setFormError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-2xl border shadow-sm bg-[var(--form-bg)] border-[var(--form-border)]">
      {/* Header */}
      <div className="p-4 border-b bg-[var(--panel-bg)]/60 border-[var(--form-border)]">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[#1f1f1f]">
              Quick OPD Patient Registration
            </h2>
            <p className="text-sm text-[#646179]">
              Fast registration for walk-in patients
            </p>
          </div>

          {showFetch && (
            <div className="w-full md:w-auto">
              <div className="text-sm font-medium text-slate-600 mb-2">
                Fetch Repeat Patient
              </div>
              <div className="flex gap-2 w-full md:w-[420px]">
                <input
                  className={inputClass}
                  placeholder="Patient ID / Name / Phone"
                  value={prefillQuery}
                  onChange={(e) => {
                    setPrefillQuery(e.target.value);
                    setPrefillError(null);
                  }}
                />
                <button
                  type="button"
                  onClick={handleFetchPatient}
                  disabled={prefillLoading}
                  className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {prefillLoading ? "Fetching..." : "Fetch"}
                </button>
              </div>

              {prefillError && (
                <div className="mt-1 text-xs text-red-600">{prefillError}</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="p-4">
        <form onSubmit={submit} className="space-y-3">
          {formError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-sm text-red-700">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <FormField label="Visit Date" error={errors.visitDate}>
              <input
                type="date"
                className={inputClass}
                value={form.visitDate}
                max={todayLocalYYYYMMDD()}
                onChange={(e) => {
                  setForm((f) => ({ ...f, visitDate: e.target.value }));
                  setErrors((p) => ({ ...p, visitDate: undefined }));
                }}
                onBlur={() => setErrors(validate(form))}
              />
            </FormField>

            <FormField label="Name" error={errors.name}>
              <input
                className={inputClass}
                placeholder="Patient name"
                value={form.name}
                onChange={(e) => {
                  setForm((f) => ({ ...f, name: e.target.value }));
                  setErrors((p) => ({ ...p, name: undefined }));
                }}
                onBlur={() => setErrors(validate(form))}
              />
            </FormField>

            <FormField label="Phone" error={errors.phone}>
              <input
                className={inputClass}
                placeholder="Mobile number (Optional)"
                value={formatPhoneUI(form.phone)}
                onChange={(e) => {
                  const digits = digitsOnly(e.target.value).slice(0, 10);
                  setForm((f) => ({ ...f, phone: digits }));
                  setErrors((p) => ({ ...p, phone: undefined }));
                }}
                onBlur={() => setErrors(validate(form))}
              />
            </FormField>

            <FormField label="Referred By">
              <ReferralComboBox value={referral} onChange={setReferral} />
            </FormField>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <FormField
              label={
                <div className="flex items-center justify-between">
                  <span>Consulting Doctor</span>
                  <button
                    type="button"
                    onClick={() => setShowAddDoctor(true)}
                    className="group flex items-center rounded-md text-sm font-medium text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-all duration-200"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="w-4 h-4 text-red-400 group-hover:text-blue-500"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 4v16m8-8H4"
                      />
                    </svg>
                    Add Doctor
                  </button>
                </div>
              }
              error={errors.doctorId}
            >
              <select
                className={selectClass}
                value={form.doctorId}
                onChange={(e) =>
                  setForm((f) => ({ ...f, doctorId: Number(e.target.value) }))
                }
                disabled={loadingDoctors || doctors.length === 0}
              >
                {doctors.length === 0 ? (
                  <option value={0}>No doctors</option>
                ) : (
                  doctors.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.full_name}
                    </option>
                  ))
                )}
              </select>
            </FormField>

            <FormField
              label="Consulting Fee"
              error={errors.consultingFee}
              showError={!!touched.consultingFee}
            >
              <input
                className={inputClass}
                placeholder="Amount"
                value={form.consultingFee}
                onChange={(e) => {
                  const v = sanitizeDecimalInput(e.target.value, {
                    maxIntDigits: 4,
                    maxDecimals: 2,
                    max: 9999.99,
                  });
                  setForm((f) => ({ ...f, consultingFee: v }));
                  setErrors((p) => ({ ...p, consultingFee: undefined }));
                }}
                onBlur={() => {
                  markTouched("consultingFee");
                  setErrors(validate(form));
                }}
              />
            </FormField>

            <FormField label="Payment Mode" error={errors.paymentMode}>
              <select
                className={selectClass}
                value={form.paymentMode}
                onChange={(e) =>
                  setForm((f) => ({ ...f, paymentMode: e.target.value }))
                }
                disabled={loadingModes || paymentModes.length === 0}
              >
                {paymentModes.length === 0 ? (
                  <option value="">No payment modes</option>
                ) : (
                  paymentModes.map((m) => (
                    <option key={m.code} value={m.code}>
                      {m.display_name}
                    </option>
                  ))
                )}
              </select>
            </FormField>

            <FormField label="Payment Status">
              <select
                className={selectClass}
                value={form.payStatus}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    payStatus: toPayStatus(e.target.value),
                  }))
                }
              >
                <option value="ACCEPTED">Accepted</option>
                <option value="PENDING">Pending</option>
                <option value="WAIVED">Waived</option>
              </select>
            </FormField>
          </div>

          <AddDoctorModal
            open={showAddDoctor}
            onClose={() => setShowAddDoctor(false)}
            onAdded={(d: DoctorOption) => {
              setDoctors((prev) =>
                [...prev, d].sort((a, b) =>
                  a.full_name.localeCompare(b.full_name)
                )
              );
              setForm((f) => ({ ...f, doctorId: d.id }));
            }}
          />

          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              disabled={submitting}
              className="rounded-lg border bg-white px-5 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-60"
            >
              Clear
            </button>
            <button
              type="submit"
              disabled={submitting || !isValid}
              className="rounded-lg bg-[#00966D] px-6 py-2 text-sm font-medium text-white hover:bg-[#007f5c] disabled:opacity-60 disabled:hover:bg-[#00966D]"
            >
              {submitting
                ? mode === "edit"
                  ? "Saving..."
                  : "Registering..."
                : mode === "edit"
                ? "Save Changes"
                : "➕ Register Patient"}
            </button>
          </div>

          {formSuccess && (
            <div className="rounded-lg border border-green-200 bg-green-50 px-2.5 py-1.5 text-sm text-green-700">
              {formSuccess}
            </div>
          )}
        </form>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Are you sure?"
        prompt="You may lose data!"
        onYes={() => {
          setConfirmOpen(false);
          resetForm();
        }}
        onNo={() => setConfirmOpen(false)}
      />

      <PickPatientModal
        open={pickOpen}
        hits={prefillHits}
        loading={pickLoading}
        error={pickError}
        onClose={() => {
          setPickOpen(false);
          setPickError(null);
        }}
        onSelect={async (patientCode) => {
          setPickLoading(true);
          setPickError(null);
          try {
            await fetchPrefillByPatientCode(patientCode);
            setPickOpen(false);
          } catch (e: unknown) {
            setPickError(e instanceof Error ? e.message : "Prefill failed.");
          } finally {
            setPickLoading(false);
          }
        }}
      />
    </div>
  );
}
