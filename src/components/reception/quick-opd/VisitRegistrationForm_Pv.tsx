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

type PayStatus = "ACCEPTED" | "PENDING" | "WAIVED";

type FormState = {
  visitDate: string;
  name: string;
  phone: string;
  doctorId: number;

  // Create-mode fields
  serviceId: number;
  rate: number;
  discountAmount: string;
  paidNowAmount: string;

  // Both modes
  paymentMode: string;
  remarks: string;

  // Edit-mode fields
  payStatus: PayStatus;
  consultingFee: string; // keep as string for input stability
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
    | "consultingFee"
    | "payStatus"
    | "form",
    string
  >
>;

type Mode = "create" | "edit";

type Props = {
  mode?: Mode;
  visitId?: number | null; // ✅ required for edit mode
  showFetch?: boolean;
  onSuccess?: (info: { visitId: number }) => void;
  openBillOnCreate?: boolean;
  lockedDoctorId?: number; // if provided, auto-set and lock doctor
  hideDoctorField?: boolean; // hide doctor dropdown UI (doctor dashboard use-case)
};

/**
 * IST-safe "today" in YYYY-MM-DD. Works correctly on server + client.
 * (Fixes the UTC toISOString() off-by-one issue.)
 */
function todayYYYYMMDD_IST() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
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
  className = "",
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  error?: string;
  showError?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
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
  contentClassName = "",
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  contentClassName?: string;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border p-4 ${className}`}>
      <div className="text-sm font-semibold mb-4">{title}</div>
      <div className={contentClassName}>{children}</div>
    </div>
  );
}

const inputClass =
  "w-full rounded-lg border px-3 py-2 text-base transition-all duration-200 " +
  "bg-slate-50 border-slate-300 text-slate-900 " +
  "placeholder:text-slate-400 " +
  "focus:outline-none focus:ring-2 focus:ring-blue-400/30 focus:border-blue-400";

const selectClass =
  "w-full rounded-lg border px-3 py-2 text-base bg-slate-50 border-slate-300 text-slate-900 " +
  "focus:outline-none focus:ring-2 focus:ring-blue-400/30 focus:border-blue-400";

export default function VisitRegistrationForm({
  mode = "create",
  visitId = null,
  showFetch = mode === "create",
  onSuccess,
  openBillOnCreate = true,
  lockedDoctorId,
  hideDoctorField = false,
}: Props) {
  const isEdit = mode === "edit";

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

  const [loadingVisit, setLoadingVisit] = useState(false);

  const [form, setForm] = useState<FormState>({
    visitDate: todayYYYYMMDD_IST(),
    name: "",
    phone: "",
    doctorId: lockedDoctorId ?? 0,

    serviceId: 0,
    rate: 0,

    discountAmount: "",
    paidNowAmount: "",

    paymentMode: "",
    remarks: "",

    payStatus: "ACCEPTED",
    consultingFee: "",
  });

  // Create-mode computed amounts
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

  const validate = useCallback(
    (next: FormState): FieldErrors => {
      const e: FieldErrors = {};
      const name = next.name.trim();
      const phoneDigits = digitsOnly(next.phone);

      // Visit date required + ISO format
      if (!next.visitDate || !/^\d{4}-\d{2}-\d{2}$/.test(next.visitDate)) {
        e.visitDate = "Visit date is required.";
      } else {
        const today = todayYYYYMMDD_IST();
        if (next.visitDate > today) {
          e.visitDate = "Visit date cannot be in the future.";
        }
      }

      if (!name) e.name = "Name is required.";
      if (phoneDigits && phoneDigits.length !== 10)
        e.phone = "Enter a valid 10-digit phone number.";

      if (!next.doctorId) e.doctorId = "Please select a doctor.";

      if (!isEdit) {
        // Create mode validations
        if (!next.serviceId) e.serviceId = "Please select a service.";

        if (!Number.isFinite(Number(next.rate)) || Number(next.rate) < 0)
          e.serviceId = "Invalid service rate.";

        const r = Number(next.rate || 0);
        const d = toNum(next.discountAmount || "0");
        if (!Number.isFinite(d) || d < 0)
          e.discountAmount = "Invalid discount.";
        if (d > r) e.discountAmount = "Discount cannot exceed rate.";

        const pay = clamp(r - clamp(d, 0, r), 0, r);
        const pn = toNum(next.paidNowAmount || "0");
        if (!Number.isFinite(pn) || pn < 0) e.paidNowAmount = "Invalid amount.";
        if (pn > pay) e.paidNowAmount = "Amount cannot exceed payable.";

        if (pn > 0 && !next.paymentMode) e.paymentMode = "Select payment mode.";
      } else {
        // Edit mode validations
        const fee = toNum(next.consultingFee || "0");
        if (!Number.isFinite(fee) || fee < 0) e.consultingFee = "Invalid fee.";
        if (!next.paymentMode) e.paymentMode = "Select payment mode.";
        if (!["ACCEPTED", "PENDING", "WAIVED"].includes(next.payStatus))
          e.payStatus = "Invalid pay status.";
      }

      return e;
    },
    [isEdit]
  );

  const isValid = useMemo(
    () => Object.keys(validate(form)).length === 0,
    [form, validate]
  );

  // Load doctors/payment modes/services (same for both modes; services not needed in edit but harmless)
  useEffect(() => {
    async function loadDoctors() {
      if (lockedDoctorId || hideDoctorField) return;
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

          // only auto-set in create mode
          setForm((f) => {
            if (isEdit) return f;
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
  }, [isEdit, lockedDoctorId, hideDoctorField]);

  useEffect(() => {
    if (
      lockedDoctorId &&
      Number.isFinite(lockedDoctorId) &&
      lockedDoctorId > 0
    ) {
      setForm((f) => ({ ...f, doctorId: lockedDoctorId }));
    }
  }, [lockedDoctorId]);

  // Load visit details in edit mode
  useEffect(() => {
    if (!isEdit) return;
    const vid = Number(visitId || 0);
    if (!vid) return;

    async function loadVisit() {
      setLoadingVisit(true);
      setFormError(null);
      try {
        const res = await fetch(`/api/reception/visits/${vid}`, {
          cache: "no-store",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.ok) {
          setFormError(data?.error || "Failed to load visit.");
          return;
        }

        // Expected shape (based on your edit host usage):
        // data = { ok: true, visit: {...}, patient: {...}, payment: {...} }
        const v = data.visit || {};
        const p = data.patient || {};
        const pay = data.payment || {};

        // referral: allow either {id,name} or direct fields
        const referralId =
          (v.referral?.id as string | undefined) ??
          (v.referralpersonId as string | undefined) ??
          (v.referralperson_id as string | undefined) ??
          null;
        const referralName =
          (v.referral?.name as string | undefined) ??
          (v.referralpersonName as string | undefined) ??
          null;

        setReferral(
          referralId
            ? { id: String(referralId), name: String(referralName || "") }
            : null
        );

        setForm((f) => ({
          ...f,
          visitDate: String(v.visitDate || v.visit_date || todayYYYYMMDD_IST()),
          name: String(p.name || p.full_name || ""),
          phone: formatPhoneUI(digitsOnly(String(p.phone || ""))),
          doctorId: Number(v.doctorId || v.doctor_id || 0),

          // Edit mode payment fields
          consultingFee: String(
            pay.consultingFee ?? pay.consulting_fee ?? pay.fee ?? ""
          ),
          paymentMode: String(
            pay.paymentMode ?? pay.payment_mode ?? f.paymentMode ?? ""
          ),
          payStatus: (pay.payStatus ??
            pay.pay_status ??
            "ACCEPTED") as PayStatus,

          // Create-only fields untouched but irrelevant in edit
          remarks: "",
        }));

        setTouched({});
        setErrors({});
      } catch {
        setFormError("Network error while loading visit.");
      } finally {
        setLoadingVisit(false);
      }
    }

    void loadVisit();
  }, [isEdit, visitId]);

  // Clamp discount/paidNow when rate changes (create only)
  useEffect(() => {
    if (isEdit) return;

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
  }, [form.rate, isEdit]);

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
      visitDate: todayYYYYMMDD_IST(),
      name: "",
      phone: "",
      doctorId: doctors[0]?.id ?? f.doctorId,
      serviceId: firstService?.id ?? f.serviceId,
      rate: Number(firstService?.rate ?? f.rate),
      discountAmount: "",
      paidNowAmount: "",
      remarks: "",
      consultingFee: "",
      payStatus: "ACCEPTED",
      paymentMode: paymentModes[0]?.code ?? f.paymentMode,
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
      if (!isEdit) {
        // CREATE
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

        // reset form
        const firstService = services[0] || null;
        setReferral(null);
        setForm({
          visitDate: todayYYYYMMDD_IST(),
          name: "",
          phone: "",
          doctorId: lockedDoctorId ?? doctors[0]?.id ?? 0,

          serviceId: firstService?.id ?? 0,
          rate: Number(firstService?.rate ?? 0),

          discountAmount: "",
          paidNowAmount: "",

          paymentMode: paymentModes[0]?.code ?? "",
          remarks: "",

          payStatus: "ACCEPTED",
          consultingFee: "",
        });
        setTouched({});
        setErrors({});
      } else {
        // EDIT
        const vid = Number(visitId || 0);
        if (!vid) {
          setFormError("Missing visitId for edit.");
          return;
        }

        const res = await fetch(`/api/reception/visits/${vid}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            visitDate: form.visitDate,
            name: form.name.trim(),
            phone: digitsOnly(form.phone) || null,
            doctorId: form.doctorId,
            consultingFee: toNum(form.consultingFee || "0"),
            paymentMode: form.paymentMode,
            payStatus: form.payStatus,
            referralId: referral?.id ?? null,
          }),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.ok) {
          setFormError(data?.error || "Failed to update visit.");
          return;
        }

        setFormSuccess("Updated successfully.");
        onSuccess?.({ visitId: vid });
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

    const referralId =
      (hit as unknown as { referralpersonId?: string | null })
        .referralpersonId ?? null;
    const referralName =
      (hit as unknown as { referralpersonName?: string | null })
        .referralpersonName ?? null;

    if (referralId && referralName) {
      setReferral({ id: String(referralId), name: String(referralName) });
    } else {
      setReferral(null);
    }

    setPrefillQuery("");
    setPrefillHits([]);
    setPrefillError(null);

    setPickOpen(false);
    setConfirmPickOpen(false);
  }

  const singleHit = prefillHits[0] ?? null;

  return (
    <div className="rounded-2xl border bg-stone-50 shadow-sm">
      <div className="border-b px-5 py-4 flex items-start justify-between gap-3">
        <div>
          <div className="text-lg font-semibold text-slate-900">
            {isEdit ? "Edit Patient / Visit" : "Quick OPD Registration"}
          </div>
          <div className="text-sm text-slate-600 mt-0.5">
            {isEdit
              ? "Update patient details and payment status."
              : "Enter patient details and payment details."}
          </div>
        </div>

        {showFetch && !isEdit && (
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

      {/* Grouped sections (STACKED: Patient Data on top, Payment Data below) */}
      <div className="p-5 space-y-5">
        <SectionCard
          title="Patient Data"
          className="bg-slate-200 text-black"
          contentClassName="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4"
        >
          <FormField
            label="Visit Date"
            error={touched.visitDate ? errors.visitDate : undefined}
            className="lg:col-span-1"
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
            className="lg:col-span-3"
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
            className="lg:col-span-2"
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

          <FormField label="Referred By" className="lg:col-span-3">
            <ReferralComboBox value={referral} onChange={setReferral} />
          </FormField>

          {!hideDoctorField && (
            <FormField
              label={
                <div className="flex items-center justify-between">
                  <span>Consulting Doctor</span>
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
              className="lg:col-span-3"
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
          )}
        </SectionCard>

        {!isEdit ? (
          <SectionCard
            title="Payment Data"
            className="bg-slate-200 text-black"
            contentClassName="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
          >
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

            <FormField label="Remarks (optional)" className="lg:col-span-4">
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
        ) : (
          <SectionCard
            title="Payment Data"
            className="bg-slate-200 text-black"
            contentClassName="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
          >
            <FormField
              label="Consulting Fee"
              error={touched.consultingFee ? errors.consultingFee : undefined}
            >
              <input
                className={inputClass}
                type="text"
                inputMode="decimal"
                placeholder="0"
                value={form.consultingFee}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    consultingFee: sanitizeDecimalInput(e.target.value, {
                      maxIntDigits: 6,
                      maxDecimals: 2,
                      max: 999999,
                    }),
                  }))
                }
                onBlur={() => markTouched("consultingFee")}
              />
            </FormField>

            <FormField
              label="Pay Status"
              error={touched.payStatus ? errors.payStatus : undefined}
            >
              <select
                className={selectClass}
                value={form.payStatus}
                onChange={(e) => {
                  setForm((f) => ({
                    ...f,
                    payStatus: e.target.value as PayStatus,
                  }));
                  markTouched("payStatus");
                }}
              >
                <option value="ACCEPTED">ACCEPTED</option>
                <option value="PENDING">PENDING</option>
                <option value="WAIVED">WAIVED</option>
              </select>
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
                disabled={loadingModes}
              >
                {paymentModes.map((m) => (
                  <option key={m.code} value={m.code}>
                    {m.display_name}
                  </option>
                ))}
              </select>
            </FormField>

            {loadingVisit && (
              <div className="text-sm text-slate-600 lg:col-span-3">
                Loading visit…
              </div>
            )}
          </SectionCard>
        )}
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
        {!isEdit && (
          <button
            className="rounded-lg border bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            onClick={() => setConfirmResetOpen(true)}
            disabled={submitting}
          >
            Reset
          </button>
        )}

        <button
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          onClick={submit}
          disabled={
            submitting ||
            loadingDoctors ||
            loadingModes ||
            loadingServices ||
            loadingVisit ||
            !isValid
          }
        >
          {submitting ? "Saving..." : isEdit ? "Save Changes" : "Register"}
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
