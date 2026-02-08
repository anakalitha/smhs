// src/components/reception/quick-opd/VisitRegistrationForm.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import ReferralComboBox from "@/components/ui/ReferralComboBox";
import AddDoctorModal from "@/components/ui/AddDoctorModal";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import PickPatientModal, {
  type PatientHit,
} from "@/components/ui/PickPatientModal";

type PaymentModeRow = { code: string; display_name: string };
type DoctorOption = { id: number; full_name: string };

type ServiceOption = {
  id: number;
  code: string;
  displayName: string;
  rate: number;
};

type FormState = {
  visitDate: string;
  name: string;
  phone: string;
  doctorId: number;

  serviceId: number;
  rate: number;

  discountAmount: string;
  paidNowAmount: string;

  paymentMode: string;
  remarks: string;
};

type FieldErrors = Partial<
  Record<
    | "visitDate"
    | "name"
    | "phone"
    | "doctorId"
    | "serviceId"
    | "discountAmount"
    | "paidNowAmount"
    | "paymentMode"
    | "form",
    string
  >
>;

type Mode = "create" | "edit";

type Props = {
  mode?: Mode;
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

function toNum(v: string) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
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

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="text-sm font-semibold text-slate-900 mb-4">{title}</div>
      <div className="space-y-4">{children}</div>
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
  showFetch = mode === "create",
  onSuccess,
  openBillOnCreate = true,
}: Props) {
  const [doctors, setDoctors] = useState<DoctorOption[]>([]);
  const [loadingDoctors, setLoadingDoctors] = useState(false);

  const [paymentModes, setPaymentModes] = useState<PaymentModeRow[]>([]);
  const [loadingModes, setLoadingModes] = useState(false);

  const [services, setServices] = useState<ServiceOption[]>([]);
  const [loadingServices, setLoadingServices] = useState(false);

  const [referral, setReferral] = useState<{ id: string; name: string } | null>(
    null
  );

  const [showAddDoctor, setShowAddDoctor] = useState(false);

  const [form, setForm] = useState<FormState>({
    visitDate: todayLocalYYYYMMDD(),
    name: "",
    phone: "",
    doctorId: 0,

    serviceId: 0,
    rate: 0,

    discountAmount: "",
    paidNowAmount: "",

    paymentMode: "",
    remarks: "",
  });

  const discount = useMemo(() => {
    const r = Number(form.rate || 0);
    return clamp(toNum(form.discountAmount || "0"), 0, r);
  }, [form.discountAmount, form.rate]);

  const payable = useMemo(() => {
    const r = Number(form.rate || 0);
    return clamp(r - discount, 0, r);
  }, [form.rate, discount]);

  const paidNow = useMemo(() => {
    return clamp(toNum(form.paidNowAmount || "0"), 0, payable);
  }, [form.paidNowAmount, payable]);

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
  const [confirmPickOpen, setConfirmPickOpen] = useState(false);

  const [pickOpen, setPickOpen] = useState(false);
  const [prefillHits, setPrefillHits] = useState<PatientHit[]>([]);

  // Reset confirm
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);

  function markTouched(field: keyof FieldErrors) {
    setTouched((t) => ({ ...t, [field]: true }));
  }

  const validate = useCallback((next: FormState): FieldErrors => {
    const e: FieldErrors = {};
    const name = next.name.trim();
    const phoneDigits = digitsOnly(next.phone);

    if (!next.visitDate) e.visitDate = "Visit date is required.";
    const today = todayLocalYYYYMMDD();
    if (next.visitDate > today)
      e.visitDate = "Visit date cannot be in the future.";

    if (!name) e.name = "Name is required.";
    if (phoneDigits && phoneDigits.length !== 10)
      e.phone = "Enter a valid 10-digit phone number.";

    if (!next.doctorId) e.doctorId = "Please select a doctor.";
    if (!next.serviceId) e.serviceId = "Please select a service.";

    if (!Number.isFinite(Number(next.rate)) || Number(next.rate) < 0)
      e.serviceId = "Invalid service rate.";

    const r = Number(next.rate || 0);
    const d = toNum(next.discountAmount || "0");
    if (!Number.isFinite(d) || d < 0) e.discountAmount = "Invalid discount.";
    if (d > r) e.discountAmount = "Discount cannot exceed rate.";

    const pay = clamp(r - clamp(d, 0, r), 0, r);
    const pn = toNum(next.paidNowAmount || "0");
    if (!Number.isFinite(pn) || pn < 0) e.paidNowAmount = "Invalid amount.";
    if (pn > pay) e.paidNowAmount = "Amount cannot exceed payable.";

    if (pn > 0 && !next.paymentMode) e.paymentMode = "Select payment mode.";

    return e;
  }, []);

  const isValid = useMemo(
    () => Object.keys(validate(form)).length === 0,
    [form, validate]
  );

  useEffect(() => {
    async function loadDoctors() {
      setLoadingDoctors(true);
      try {
        const res = await fetch("/api/reception/doctors", {
          cache: "no-store",
        });
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

    async function loadPaymentModes() {
      setLoadingModes(true);
      try {
        const res = await fetch("/api/reception/payment-modes", {
          cache: "no-store",
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          const list: PaymentModeRow[] = data.modes || [];
          setPaymentModes(list);
          setForm((f) => ({
            ...f,
            paymentMode: f.paymentMode || (list[0]?.code ?? ""),
          }));
        }
      } finally {
        setLoadingModes(false);
      }
    }

    async function loadServices() {
      setLoadingServices(true);
      try {
        const res = await fetch("/api/reception/services", {
          cache: "no-store",
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          const list: ServiceOption[] = data.services || [];
          setServices(list);

          setForm((f) => {
            const chosen = f.serviceId
              ? list.find((s) => s.id === f.serviceId)
              : list[0];
            return {
              ...f,
              serviceId: chosen?.id ?? 0,
              rate: Number(chosen?.rate ?? 0),
            };
          });
        }
      } finally {
        setLoadingServices(false);
      }
    }

    void loadDoctors();
    void loadPaymentModes();
    void loadServices();
  }, []);

  // Clamp discount/paidNow when rate changes
  useEffect(() => {
    setForm((f) => {
      const r = Number(f.rate || 0);
      const d = clamp(toNum(f.discountAmount || "0"), 0, r);
      const p = clamp(r - d, 0, r);
      const pn = clamp(toNum(f.paidNowAmount || "0"), 0, p);

      return {
        ...f,
        discountAmount: f.discountAmount === "" ? "" : String(d),
        paidNowAmount: p === 0 ? "" : f.paidNowAmount === "" ? "" : String(pn),
      };
    });
  }, [form.rate]);

  function setService(serviceId: number) {
    const s = services.find((x) => x.id === serviceId) || null;
    setForm((f) => ({
      ...f,
      serviceId,
      rate: Number(s?.rate ?? 0),
      discountAmount: "",
      paidNowAmount: "",
    }));
    markTouched("serviceId");
  }

  function doReset() {
    const firstService = services[0] || null;
    setReferral(null);
    setForm((f) => ({
      ...f,
      name: "",
      phone: "",
      serviceId: firstService?.id ?? f.serviceId,
      rate: Number(firstService?.rate ?? f.rate),
      discountAmount: "",
      paidNowAmount: "",
      remarks: "",
    }));
    setErrors({});
    setTouched({});
    setFormError(null);
    setFormSuccess(null);
  }

  async function submit() {
    setFormError(null);
    setFormSuccess(null);

    const v = validate(form);
    setErrors(v);
    if (Object.keys(v).length > 0) {
      setFormError("Please correct the highlighted fields.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/reception/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visitDate: form.visitDate,
          name: form.name.trim(),
          phone: digitsOnly(form.phone) || null,
          referralId: referral?.id ?? null,
          doctorId: form.doctorId,

          serviceId: form.serviceId,
          discountAmount: discount,
          paidNowAmount: paidNow,
          paymentMode: paidNow > 0 ? form.paymentMode : undefined,
          remarks: form.remarks?.trim() || null,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError(data?.error || "Failed to register visit.");
        return;
      }

      setFormSuccess("Registered successfully.");

      const createdVisitId = Number(data?.visitId || 0);
      if (createdVisitId && onSuccess) onSuccess({ visitId: createdVisitId });

      if (openBillOnCreate && createdVisitId) {
        // optional
      }

      if (mode === "create") {
        const firstService = services[0] || null;
        setReferral(null);
        setForm({
          visitDate: todayLocalYYYYMMDD(),
          name: "",
          phone: "",
          doctorId: doctors[0]?.id ?? 0,

          serviceId: firstService?.id ?? 0,
          rate: Number(firstService?.rate ?? 0),

          discountAmount: "",
          paidNowAmount: "",

          paymentMode: paymentModes[0]?.code ?? "",
          remarks: "",
        });
        setTouched({});
        setErrors({});
      }
    } catch {
      setFormError("Network error.");
    } finally {
      setSubmitting(false);
    }
  }

  async function runPrefillSearch() {
    const q = prefillQuery.trim();
    if (!q) return;

    setPrefillLoading(true);
    setPrefillError(null);

    try {
      const res = await fetch(
        `/api/reception/patients/search?q=${encodeURIComponent(q)}`,
        { cache: "no-store" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPrefillError(data?.error || "Failed to search.");
        return;
      }

      const hits: PatientHit[] = data?.hits || [];
      setPrefillHits(hits);

      if (hits.length === 0) {
        setPrefillError("No matches found.");
        return;
      }

      if (hits.length === 1) {
        setConfirmPickOpen(true);
        return;
      }

      setPickOpen(true);
    } catch {
      setPrefillError("Network error.");
    } finally {
      setPrefillLoading(false);
    }
  }

  function applyPatient(hit: PatientHit) {
    setForm((f) => ({
      ...f,
      name: hit.name || "",
      phone: formatPhoneUI(digitsOnly(hit.phone ?? "")),
    }));
    setPickOpen(false);
    setConfirmPickOpen(false);
  }

  const singleHit = prefillHits[0] ?? null;

  return (
    <div className="rounded-2xl border bg-white shadow-sm">
      <div className="border-b px-5 py-4 flex items-start justify-between gap-3">
        <div>
          <div className="text-lg font-semibold text-slate-900">
            Quick OPD Registration
          </div>
          <div className="text-sm text-slate-600 mt-0.5">
            Enter patient details and payment details.
          </div>
        </div>

        {showFetch && (
          <div className="flex items-center gap-2">
            <input
              className={inputClass}
              placeholder="Find existing patient (name/phone/id)"
              value={prefillQuery}
              onChange={(e) => setPrefillQuery(e.target.value)}
            />
            <button
              className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              disabled={prefillLoading || !prefillQuery.trim()}
              onClick={runPrefillSearch}
            >
              {prefillLoading ? "Searching..." : "Find"}
            </button>
          </div>
        )}
      </div>

      {/* Grouped sections */}
      <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SectionCard title="Patient Data">
          <FormField
            label="Visit Date"
            error={touched.visitDate ? errors.visitDate : undefined}
          >
            <input
              className={inputClass}
              type="date"
              value={form.visitDate}
              onChange={(e) =>
                setForm((f) => ({ ...f, visitDate: e.target.value }))
              }
              onBlur={() => markTouched("visitDate")}
            />
          </FormField>

          <FormField
            label="Name"
            error={touched.name ? errors.name : undefined}
          >
            <input
              className={inputClass}
              placeholder="Full name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              onBlur={() => markTouched("name")}
            />
          </FormField>

          <FormField
            label="Phone (optional)"
            error={touched.phone ? errors.phone : undefined}
          >
            <input
              className={inputClass}
              placeholder="10-digit phone"
              value={form.phone}
              onChange={(e) => {
                const d = digitsOnly(e.target.value);
                setForm((f) => ({ ...f, phone: formatPhoneUI(d) }));
              }}
              onBlur={() => markTouched("phone")}
              inputMode="numeric"
            />
          </FormField>

          <FormField label="Referred By (optional)">
            <ReferralComboBox value={referral} onChange={setReferral} />
          </FormField>

          <FormField
            label={
              <div className="flex items-center justify-between">
                <span>Doctor</span>
                <button
                  type="button"
                  className="text-sm text-blue-700 hover:text-blue-900"
                  onClick={() => setShowAddDoctor(true)}
                >
                  + Add Doctor
                </button>
              </div>
            }
            error={touched.doctorId ? errors.doctorId : undefined}
          >
            <select
              className={selectClass}
              value={form.doctorId}
              onChange={(e) => {
                setForm((f) => ({ ...f, doctorId: Number(e.target.value) }));
                markTouched("doctorId");
              }}
              disabled={loadingDoctors}
            >
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.full_name}
                </option>
              ))}
            </select>
          </FormField>
        </SectionCard>

        <SectionCard title="Payment Data">
          <FormField
            label="Choose Service"
            error={touched.serviceId ? errors.serviceId : undefined}
          >
            <select
              className={selectClass}
              value={form.serviceId}
              onChange={(e) => setService(Number(e.target.value))}
              disabled={loadingServices}
            >
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.displayName} ({Number(s.rate || 0).toFixed(0)})
                </option>
              ))}
            </select>

            {/* <div className="mt-3 rounded-lg border bg-slate-50 px-3 py-2">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                <div className="flex items-center justify-between md:block">
                  <div className="text-slate-600">Rate</div>
                  <div className="font-semibold text-slate-900">
                    {Number(form.rate || 0).toFixed(0)}
                  </div>
                </div>

                <div className="flex items-center justify-between md:block">
                  <div className="text-slate-600">Discount</div>
                  <div className="font-semibold text-slate-900">
                    {discount.toFixed(0)}
                  </div>
                </div>

                <div className="flex items-center justify-between md:block">
                  <div className="text-slate-600">Payable</div>
                  <div className="font-semibold text-slate-900">
                    {payable.toFixed(0)}
                  </div>
                </div>

                <div className="flex items-center justify-between md:block">
                  <div className="text-slate-600">Paid Now</div>
                  <div className="font-semibold text-slate-900">
                    {paidNow.toFixed(0)}
                  </div>
                </div>
              </div>
            </div> */}
          </FormField>

          <FormField
            label="Amount to be paid"
            error={touched.paidNowAmount ? errors.paidNowAmount : undefined}
          >
            <input
              className={inputClass}
              type="text"
              inputMode="decimal"
              placeholder={String(payable.toFixed(0))}
              value={form.paidNowAmount}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  paidNowAmount: sanitizeDecimalInput(e.target.value, {
                    maxIntDigits: 6,
                    maxDecimals: 2,
                    max: payable,
                  }),
                }))
              }
              onBlur={() => markTouched("paidNowAmount")}
              disabled={payable === 0}
            />
          </FormField>

          <FormField
            label="Payment Mode"
            error={touched.paymentMode ? errors.paymentMode : undefined}
          >
            <select
              className={selectClass}
              value={form.paymentMode}
              onChange={(e) => {
                setForm((f) => ({ ...f, paymentMode: e.target.value }));
                markTouched("paymentMode");
              }}
              disabled={loadingModes || paidNow === 0}
            >
              {paymentModes.map((m) => (
                <option key={m.code} value={m.code}>
                  {m.display_name}
                </option>
              ))}
            </select>
            {paidNow === 0 && (
              <div className="mt-2 text-xs text-slate-600">
                (Payment mode not required when Amount to be paid is 0)
              </div>
            )}
          </FormField>

          <FormField
            label="Discount / Waiver"
            error={touched.discountAmount ? errors.discountAmount : undefined}
          >
            <input
              className={inputClass}
              type="text"
              inputMode="decimal"
              placeholder="0"
              value={form.discountAmount}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  discountAmount: sanitizeDecimalInput(e.target.value, {
                    maxIntDigits: 6,
                    maxDecimals: 2,
                    max: Number(f.rate || 0),
                  }),
                }))
              }
              onBlur={() => markTouched("discountAmount")}
            />
          </FormField>

          <FormField label="Remarks (optional)">
            <input
              className={inputClass}
              placeholder="Any notes..."
              value={form.remarks}
              onChange={(e) =>
                setForm((f) => ({ ...f, remarks: e.target.value }))
              }
            />
          </FormField>
        </SectionCard>
      </div>

      {prefillError && (
        <div className="px-5 pb-3 text-sm text-red-700">{prefillError}</div>
      )}

      {formError && (
        <div className="px-5 pb-3 text-sm text-red-700">{formError}</div>
      )}
      {formSuccess && (
        <div className="px-5 pb-3 text-sm text-green-700">{formSuccess}</div>
      )}

      <div className="border-t px-5 py-4 flex items-center justify-end gap-2">
        <button
          className="rounded-lg border bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          onClick={() => setConfirmResetOpen(true)}
          disabled={submitting}
        >
          Reset
        </button>

        <button
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          onClick={submit}
          disabled={
            submitting ||
            loadingDoctors ||
            loadingModes ||
            loadingServices ||
            !isValid
          }
        >
          {submitting ? "Saving..." : "Register"}
        </button>
      </div>

      <AddDoctorModal
        open={showAddDoctor}
        onClose={() => setShowAddDoctor(false)}
        onAdded={(d) => {
          setDoctors((prev) => {
            const exists = prev.some((x) => x.id === d.id);
            const next = exists ? prev : [...prev, d];
            return next.sort((a, b) => a.full_name.localeCompare(b.full_name));
          });
          setForm((f) => ({ ...f, doctorId: d.id }));
          setShowAddDoctor(false);
        }}
      />

      <PickPatientModal
        open={pickOpen}
        hits={prefillHits}
        onClose={() => setPickOpen(false)}
        onSelect={(patientCode: string) => {
          const hit = prefillHits.find((h) => h.patientCode === patientCode);
          if (hit) applyPatient(hit);
          else setPickOpen(false);
        }}
      />

      {/* Confirm: using single match for prefill */}
      <ConfirmDialog
        open={confirmPickOpen}
        title="Use this patient?"
        prompt={
          singleHit
            ? `${singleHit.name} (${singleHit.patientCode})`
            : "Use selected patient to prefill?"
        }
        yesText="Use"
        noText="Cancel"
        onYes={() => {
          if (singleHit) applyPatient(singleHit);
          else setConfirmPickOpen(false);
        }}
        onNo={() => setConfirmPickOpen(false)}
      />

      {/* Confirm: Reset */}
      <ConfirmDialog
        open={confirmResetOpen}
        title="Reset form?"
        prompt="This will clear entered fields in the form."
        yesText="Yes, Reset"
        noText="Cancel"
        onYes={() => {
          setConfirmResetOpen(false);
          doReset();
        }}
        onNo={() => setConfirmResetOpen(false)}
      />
    </div>
  );
}
