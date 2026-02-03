// src/app/(protected)/reception/page.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import DataTable, { Column } from "@/components/ui/DataTable";
import ReferralComboBox from "@/components/ui/ReferralComboBox";
import AddDoctorModal from "@/components/ui/AddDoctorModal";

type QueueStatus = "WAITING" | "NEXT" | "IN_ROOM" | "DONE";
type PayStatus = "ACCEPTED" | "PENDING" | "WAIVED";

type PaymentModeRow = { code: string; display_name: string };
type DoctorOption = { id: number; full_name: string };

type ReceptionKpis = {
  registeredToday: number;
  waiting: number;
  done: number;
  accepted: number; // amount
  pending: number; // amount
  waived: number; // amount
};

type QueueRow = {
  queueEntryId: number;
  visitId: number;
  patientDbId: number;
  token: number;
  patientId: string;
  name: string;
  phone: string;
  referredBy: string;
  doctor: string;
  status: QueueStatus;
  createdAt?: string;
};

type PatientRow = {
  id: string;
  name: string;
  phone: string;
  lastVisit: string;
  doctor?: string;
};

type FieldErrors = Partial<
  Record<
    | "visitDate"
    | "name"
    | "phone"
    | "doctorId"
    | "consultingFee"
    | "paymentMode",
    string
  >
>;

function digitsOnly(s: string) {
  return s.replace(/\D+/g, "");
}

function formatPhoneUI(digits: string) {
  const d = digits.slice(0, 10);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)} ${d.slice(5)}`;
}

function formatINR(n: number) {
  return n.toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });
}

function KpiCard({
  title,
  value,
  accent,
  icon,
  subtitle,
}: {
  title: string;
  value: string;
  accent: string;
  icon: string;
  subtitle?: string;
}) {
  return (
    <div className="rounded-2xl border bg-white shadow-sm p-4 hover:shadow-md transition">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm" style={{ color: accent }}>
            {title}
          </div>
          <div
            className="mt-1 text-2xl font-semibold"
            style={{ color: accent }}
          >
            {value}
          </div>
          <div className="mt-1 text-xs text-[#646179]">{subtitle || " "}</div>
        </div>

        <div className="h-11 w-11 rounded-2xl bg-gray-50 border flex items-center justify-center text-xl">
          {icon}
        </div>
      </div>
    </div>
  );
}

function FormField({
  label,
  children,
  error,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  error?: string;
}) {
  return (
    <div>
      <div className="text-sm font-medium text-slate-600 mb-2">{label}</div>
      {children}
      {error && (
        <p className="mt-1 text-sm font-medium text-red-600 mb-2">{error}</p>
      )}
    </div>
  );
}

const queueColumns: Column<QueueRow>[] = [
  {
    header: "Patient Id",
    cell: (q) => (
      <span className="font-medium text-[#1f1f1f]">{q.patientId}</span>
    ),
  },
  {
    header: "Name",
    cell: (q) => <span className="text-[#1f1f1f]">{q.name}</span>,
  },
  {
    header: "Phone",
    cell: (q) => <span className="text-[#646179]">{q.phone || "—"}</span>,
  },
  {
    header: "Referred By",
    cell: (q) => <span className="text-[#646179]">{q.referredBy || "—"}</span>,
  },
  {
    header: "Consulting Doctor",
    cell: (q) => <span className="text-[#646179]">{q.doctor}</span>,
  },
  {
    header: "Status",
    cell: (q) => {
      const label =
        q.status === "WAITING"
          ? "Waiting"
          : q.status === "NEXT"
          ? "Next"
          : q.status === "IN_ROOM"
          ? "In Room"
          : "Done";

      const pillClass =
        q.status === "WAITING"
          ? "bg-amber-50 text-amber-700 border-amber-200"
          : q.status === "NEXT"
          ? "bg-blue-50 text-blue-700 border-blue-200"
          : q.status === "IN_ROOM"
          ? "bg-green-50 text-green-700 border-green-200"
          : "bg-gray-50 text-gray-700 border-gray-200";

      return (
        <span
          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${pillClass}`}
        >
          {label}
        </span>
      );
    },
  },
];

const patientColumns: Column<PatientRow>[] = [
  {
    header: "Patient Id",
    cell: (p) => <span className="font-medium text-[#1f1f1f]">{p.id}</span>,
  },
  {
    header: "Name",
    cell: (p) => <span className="text-[#1f1f1f]">{p.name}</span>,
  },
  {
    header: "Phone",
    cell: (p) => <span className="text-[#646179]">{p.phone}</span>,
  },
  {
    header: "Last Visit",
    cell: (p) => (
      <span className="text-[#646179]">{formatDate(p.lastVisit)}</span>
    ),
  },
  {
    header: "Consulting Doctor",
    cell: (p) => <span className="text-[#646179]">{p.doctor ?? "—"}</span>,
  },
];

export default function ReceptionDashboard() {
  const router = useRouter();

  const [queueRows, setQueueRows] = useState<QueueRow[]>([]);
  const [loadingQueue, setLoadingQueue] = useState(false);

  const [kpis, setKpis] = useState<ReceptionKpis>({
    registeredToday: 0,
    waiting: 0,
    done: 0,
    accepted: 0,
    pending: 0,
    waived: 0,
  });
  const [loadingKpis, setLoadingKpis] = useState(false);

  const [doctors, setDoctors] = useState<DoctorOption[]>([]);
  const [loadingDoctors, setLoadingDoctors] = useState(false);

  const [paymentModes, setPaymentModes] = useState<PaymentModeRow[]>([]);
  const [loadingModes, setLoadingModes] = useState(false);

  const [referral, setReferral] = useState<{ id: string; name: string } | null>(
    null
  );
  const [showAddDoctor, setShowAddDoctor] = useState(false);

  const [form, setForm] = useState<{
    visitDate: string;
    name: string;
    phone: string;
    doctorId: number;
    consultingFee: string;
    paymentMode: string;
    payStatus: PayStatus;
  }>({
    visitDate: todayLocalYYYYMMDD(),
    name: "",
    phone: "",
    doctorId: 0,
    consultingFee: "",
    paymentMode: "",
    payStatus: "ACCEPTED",
  });

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [showReports, setShowReports] = useState(false);

  const [patientRows, setPatientRows] = useState<PatientRow[]>([]);
  const [patientSearch, setPatientSearch] = useState("");
  const [patientLoading, setPatientLoading] = useState(false);
  const [patientError, setPatientError] = useState<string | null>(null);
  const [patientPage, setPatientPage] = useState(1);
  const pageSize = 15;

  // Prefill search
  const [prefillQuery, setPrefillQuery] = useState("");
  const [prefillLoading, setPrefillLoading] = useState(false);
  const [prefillHits, setPrefillHits] = useState<
    { patientCode: string; name: string; phone: string | null }[]
  >([]);
  const [showPickPatient, setShowPickPatient] = useState(false);
  const [prefillError, setPrefillError] = useState<string | null>(null);

  async function loadPatients(search = patientSearch, page = patientPage) {
    setPatientLoading(true);
    setPatientError(null);
    try {
      const q = new URLSearchParams({
        search,
        page: String(page),
        pageSize: String(pageSize),
      });

      const res = await fetch(`/api/reception/patients?${q.toString()}`, {
        cache: "no-store",
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPatientError(data?.error || "Failed to load patients.");
        return;
      }
      setPatientRows(data.rows || []);
    } catch {
      setPatientError("Network error while loading patients.");
    } finally {
      setPatientLoading(false);
    }
  }

  async function loadDashboard() {
    setLoadingKpis(true);
    setLoadingQueue(true);
    try {
      const res = await fetch("/api/reception/dashboard", {
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        if (data.kpis) setKpis(data.kpis);
        if (data.todaysQueue) setQueueRows(data.todaysQueue);
      }
    } finally {
      setLoadingKpis(false);
      setLoadingQueue(false);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  useEffect(() => {
    async function loadDoctors() {
      setLoadingDoctors(true);
      try {
        const res = await fetch("/api/reception/doctors");
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          const list: DoctorOption[] = data.doctors || [];
          setDoctors(list);
          if (list.length > 0) setForm((f) => ({ ...f, doctorId: list[0].id }));
        }
      } finally {
        setLoadingDoctors(false);
      }
    }
    loadDoctors();
  }, []);

  useEffect(() => {
    async function loadPaymentModes() {
      setLoadingModes(true);
      try {
        const res = await fetch("/api/reception/payment-modes");
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          const modes: PaymentModeRow[] = data.modes || [];
          setPaymentModes(modes);
          if (modes.length > 0)
            setForm((f) => ({ ...f, paymentMode: modes[0].code }));
        }
      } finally {
        setLoadingModes(false);
      }
    }
    loadPaymentModes();
  }, []);

  useEffect(() => {
    loadPatients("", 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const validateForm = useCallback(
    (nextForm = form): FieldErrors => {
      const errs: FieldErrors = {};
      const name = nextForm.name.trim();
      const phoneDigits = digitsOnly(nextForm.phone);
      const fee = Number(nextForm.consultingFee);

      if (!name) errs.name = "Name is required.";
      if (phoneDigits && phoneDigits.length !== 10) {
        errs.phone = "Enter a valid 10-digit phone number.";
      }
      if (!nextForm.doctorId) errs.doctorId = "Please select a doctor.";

      if (!nextForm.visitDate) errs.visitDate = "Visit date is required.";
      const today = todayLocalYYYYMMDD();
      if (nextForm.visitDate > today)
        errs.visitDate = "Visit date cannot be in the future.";

      if (nextForm.consultingFee === "")
        errs.consultingFee = "Fee is required.";
      else if (!Number.isFinite(fee) || fee < 0)
        errs.consultingFee = "Enter a valid amount.";
      else if (nextForm.payStatus !== "WAIVED" && fee === 0)
        errs.consultingFee = "Fee cannot be 0 unless Waived.";

      if (!nextForm.paymentMode) errs.paymentMode = "Select payment mode.";
      return errs;
    },
    [form]
  );

  const isFormValid = useMemo(() => {
    const errs = validateForm(form);
    return Object.keys(errs).length === 0;
  }, [form, validateForm]);

  async function changeQueueStatus(queueEntryId: number, status: QueueStatus) {
    const res = await fetch("/api/reception/queue/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ queueEntryId, status }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "Failed to change status.");
    await loadDashboard();
  }

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
      phone: (data.patient?.phone ?? "").replace(/\D+/g, ""),
      doctorId: data.latest?.doctor?.id ?? f.doctorId,
    }));

    if (data.latest?.referral?.id) {
      setReferral({
        id: data.latest.referral.id,
        name: data.latest.referral.name,
      });
    } else {
      setReferral(null);
    }

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

    // ✅ Clear input immediately after click (requested)
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

      if (hits.length === 1) {
        await fetchPrefillByPatientCode(hits[0].patientCode);
        return;
      }

      setPrefillHits(hits);
      setShowPickPatient(true);
    } catch (e: unknown) {
      setPrefillError(e instanceof Error ? e.message : "Fetch failed.");
    } finally {
      setPrefillLoading(false);
    }
  }

  async function submitQuickRegistration(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    const errs = validateForm(form);
    setFieldErrors(errs);

    if (Object.keys(errs).length > 0) {
      setFormError("Please fix the highlighted fields.");
      return;
    }

    setSubmitting(true);
    try {
      const name = form.name.trim();
      const phone = digitsOnly(form.phone).slice(0, 10);
      const fee = Number(form.consultingFee);

      const res = await fetch("/api/reception/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visitDate: form.visitDate,
          name,
          phone,
          doctorId: form.doctorId,
          consultingFee: fee,
          paymentMode: form.paymentMode,
          payStatus: form.payStatus,
          referralId: referral?.id ?? null,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError(data?.error || "Registration failed.");
        return;
      }

      setFormSuccess("Patient registered and added to today&apos;s queue.");
      setForm((f) => ({
        ...f,
        visitDate: todayLocalYYYYMMDD(),
        name: "",
        phone: "",
        consultingFee: "",
      }));
      setReferral(null);

      if (data?.visitId) {
        window.open(
          `/reception/bill/${data.visitId}`,
          "_blank",
          "noopener,noreferrer"
        );
      } else {
        console.error("Register API did not return visitId", data);
      }

      await loadPatients("", 1);
      if (data?.queued) {
        await loadDashboard();
      }
    } catch {
      setFormError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function resetQuickForm() {
    setFormError(null);
    setFormSuccess(null);
    setFieldErrors({});
    setReferral(null);

    setForm((f) => ({
      ...f,
      visitDate: todayLocalYYYYMMDD(),
      name: "",
      phone: "",
      consultingFee: "",
      payStatus: "ACCEPTED",
      doctorId: doctors.length > 0 ? doctors[0].id : 0,
      paymentMode: paymentModes.length > 0 ? paymentModes[0].code : "",
    }));
  }

  return (
    <div className="min-h-[calc(100vh-120px)] bg-[#F2F2F2]">
      <div className="p-6">
        {/* Header row */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[#1f1f1f]">
              Reception Dashboard
            </h1>
            <p className="text-sm mt-1 text-[#646179]">
              Today&apos;s queue, quick registration, patient lookup, billing
              and reports.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/reception/register"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              ➕ Register Patient
            </Link>

            <div className="relative">
              <button
                type="button"
                onClick={() => setShowReports((v) => !v)}
                className="rounded-lg border bg-blue-300 px-4 py-2 text-sm font-medium hover:bg-gray-50"
              >
                📄 Reports ▾
              </button>

              {showReports && (
                <div
                  className="absolute right-0 mt-2 w-72 rounded-xl border bg-white shadow-lg z-50"
                  onMouseLeave={() => setShowReports(false)}
                >
                  <button
                    className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50"
                    onClick={() => {
                      setShowReports(false);
                      window.open(
                        "/reports/consultations/eod",
                        "_blank",
                        "noopener,noreferrer"
                      );
                    }}
                  >
                    Generate EOD Summary Report
                  </button>

                  <button
                    className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50"
                    onClick={() => {
                      setShowReports(false);
                      window.open(
                        "/reports/consultations/period",
                        "_blank",
                        "noopener,noreferrer"
                      );
                    }}
                  >
                    Generate Period-wise Report
                  </button>

                  <button
                    className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50"
                    onClick={() => {
                      setShowReports(false);
                      window.open(
                        "/reports/consultations/pending",
                        "_blank",
                        "noopener,noreferrer"
                      );
                    }}
                  >
                    Generate Pending Amount Report
                  </button>

                  <button
                    className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50"
                    onClick={() => {
                      setShowReports(false);
                      window.open(
                        "/reports/consultations/referred-by",
                        "_blank",
                        "noopener,noreferrer"
                      );
                    }}
                  >
                    Referred By Report
                  </button>

                  <div className="my-1 h-px bg-gray-200" />

                  <button
                    className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50"
                    onClick={() => {
                      setShowReports(false);
                      window.open(
                        "/reports/bills",
                        "_blank",
                        "noopener,noreferrer"
                      );
                    }}
                  >
                    Bill Report
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* KPI cards */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <KpiCard
            title="Registered Today"
            value={loadingKpis ? "…" : String(kpis.registeredToday)}
            accent="#008080"
            icon="🧾"
          />
          <KpiCard
            title="Waiting"
            value={loadingKpis ? "…" : String(kpis.waiting)}
            accent="#00BA88"
            icon="⏳"
          />
          <KpiCard
            title="Done"
            value={loadingKpis ? "…" : String(kpis.done)}
            accent="#00966D"
            icon="✅"
          />
          <KpiCard
            title="Collected"
            value={loadingKpis ? "…" : formatINR(kpis.accepted)}
            accent="#00966D"
            icon="💳"
            subtitle="Consultation fee"
          />
          <KpiCard
            title="Pending"
            value={loadingKpis ? "…" : formatINR(kpis.pending)}
            accent="#F4B740"
            icon="🕒"
            subtitle="Consultation fee"
          />
          <KpiCard
            title="Waived"
            value={loadingKpis ? "…" : formatINR(kpis.waived)}
            accent="#EF4747"
            icon="🧾"
            subtitle="Consultation fee"
          />
        </div>

        {/* ✅ NEW LAYOUT: Quick OPD Registration on top (compact), Queue below */}
        <div className="mt-6 grid grid-cols-1 gap-5">
          {/* Quick Registration */}
          <div className="rounded-2xl border shadow-sm bg-[var(--form-bg)] border-[var(--form-border)]">
            {/* Header row with Fetch on RHS */}
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

                {/* ✅ Fetch Repeat Patient (compact, top-right) */}
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
                    <div className="mt-1 text-xs text-red-600">
                      {prefillError}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="p-4">
              <form onSubmit={submitQuickRegistration} className="space-y-3">
                {formError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-sm text-red-700">
                    {formError}
                  </div>
                )}

                {/* ✅ Row 1: Name | Phone | Referred By */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <FormField label="Visit Date" error={fieldErrors.visitDate}>
                    <input
                      type="date"
                      className={inputClass}
                      value={form.visitDate}
                      max={todayLocalYYYYMMDD()}
                      onChange={(e) => {
                        setForm((f) => ({ ...f, visitDate: e.target.value }));
                        setFieldErrors((prev) => ({
                          ...prev,
                          visitDate: undefined,
                        }));
                      }}
                      onBlur={() => setFieldErrors(validateForm())}
                    />
                  </FormField>

                  <FormField label="Name" error={fieldErrors.name}>
                    <input
                      className={inputClass}
                      placeholder="Patient name"
                      value={form.name}
                      onChange={(e) => {
                        const v = e.target.value;
                        setForm((f) => ({ ...f, name: v }));
                        setFieldErrors((prev) => ({
                          ...prev,
                          name: undefined,
                        }));
                      }}
                      onBlur={() => setFieldErrors(validateForm())}
                    />
                  </FormField>

                  <FormField label="Phone" error={fieldErrors.phone}>
                    <input
                      className={inputClass}
                      placeholder="Mobile number (Optional)"
                      value={formatPhoneUI(form.phone)}
                      onChange={(e) => {
                        const digits = digitsOnly(e.target.value).slice(0, 10);
                        setForm((f) => ({ ...f, phone: digits }));
                        setFieldErrors((prev) => ({
                          ...prev,
                          phone: undefined,
                        }));
                      }}
                      onBlur={() => setFieldErrors(validateForm())}
                    />
                  </FormField>

                  <FormField label="Referred By">
                    <ReferralComboBox value={referral} onChange={setReferral} />
                  </FormField>
                </div>

                {/* ✅ Row 2: Doctor | Fee | Payment Mode | Payment Status */}
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
                            xmlns="http://www.w3.org"
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
                    error={fieldErrors.doctorId}
                  >
                    <select
                      className={selectClass}
                      value={form.doctorId}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          doctorId: Number(e.target.value),
                        }))
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
                    error={fieldErrors.consultingFee}
                  >
                    <input
                      className={inputClass}
                      placeholder="Amount"
                      value={form.consultingFee}
                      onChange={(e) => {
                        const v = e.target.value.replace(/[^0-9.]/g, "");
                        setForm((f) => ({ ...f, consultingFee: v }));
                        setFieldErrors((prev) => ({
                          ...prev,
                          consultingFee: undefined,
                        }));
                      }}
                      onBlur={() => setFieldErrors(validateForm())}
                    />
                  </FormField>

                  <FormField
                    label="Payment Mode"
                    error={fieldErrors.paymentMode}
                  >
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
                  onAdded={(d) => {
                    setDoctors((prev) =>
                      [...prev, d].sort((a, b) =>
                        a.full_name.localeCompare(b.full_name)
                      )
                    );
                    setForm((f) => ({ ...f, doctorId: d.id }));
                  }}
                />

                {/* ✅ Buttons aligned like requested */}
                <div className="flex items-center justify-end gap-3 pt-1">
                  <button
                    type="button"
                    onClick={resetQuickForm}
                    disabled={submitting}
                    className="rounded-lg border bg-white px-5 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-60"
                  >
                    Clear
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || !isFormValid}
                    className="rounded-lg bg-[#00966D] px-6 py-2 text-sm font-medium text-white hover:bg-[#007f5c] disabled:opacity-60 disabled:hover:bg-[#00966D]"
                  >
                    {submitting ? "Registering..." : "➕ Register Patient"}
                  </button>
                </div>

                {formSuccess && (
                  <div className="rounded-lg border border-green-200 bg-green-50 px-2.5 py-1.5 text-sm text-green-700">
                    {formSuccess}
                  </div>
                )}
              </form>
            </div>
          </div>

          {/* Today’s Queue */}
          <div className="w-full rounded-2xl border bg-white shadow-sm">
            <div className="p-4 flex items-center justify-between border-b">
              <div>
                <h2 className="text-lg font-semibold text-[#1f1f1f]">
                  Today’s Queue
                </h2>
                <p className="text-sm text-[#646179]">
                  Patients registered today (first come basis)
                </p>
              </div>

              <button
                type="button"
                onClick={loadDashboard}
                className="rounded-lg border px-2.5 py-1.5 text-sm hover:bg-gray-50"
              >
                {loadingQueue ? "Refreshing…" : "🔄 Refresh"}
              </button>
            </div>

            <div className="p-4 overflow-x-auto">
              <DataTable
                dense
                columns={queueColumns}
                rows={queueRows}
                emptyText={
                  loadingQueue ? "Loading..." : "No patients in queue."
                }
                getRowKey={(r) => r.queueEntryId}
                groupedActions={(row) => [
                  {
                    items: [
                      {
                        label: "Mark as Waiting",
                        onClick: () =>
                          changeQueueStatus(row.queueEntryId, "WAITING"),
                      },
                      {
                        label: "Mark as Next",
                        onClick: () =>
                          changeQueueStatus(row.queueEntryId, "NEXT"),
                      },
                      {
                        label: "Mark as In Room",
                        onClick: () =>
                          changeQueueStatus(row.queueEntryId, "IN_ROOM"),
                      },
                      {
                        label: "Mark as Done",
                        onClick: () =>
                          changeQueueStatus(row.queueEntryId, "DONE"),
                      },
                    ],
                  },
                  {
                    separator: true,
                    items: [
                      {
                        label: "Edit Patient",
                        onClick: () =>
                          router.push(
                            `/reception/patients/${row.patientDbId}/edit`
                          ),
                      },
                      {
                        label: "View Patient Data",
                        onClick: () =>
                          router.push(`/patients/${row.patientDbId}`),
                      },
                      {
                        label: "Generate Bill",
                        onClick: () =>
                          window.open(
                            `/reception/bill/${row.visitId}`,
                            "_blank"
                          ),
                      },
                    ],
                  },
                ]}
              />

              <div className="mt-3 text-xs text-[#646179]">
                Tip: Use the action menu to change status, edit patient, or
                generate bill.
              </div>
            </div>
          </div>
        </div>

        {/* Patient Lookup */}
        <div className="mt-8 rounded-2xl border bg-white shadow-sm">
          <div className="p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between border-b">
            <div>
              <h2 className="text-lg font-semibold text-[#1f1f1f]">
                Patient Lookup
              </h2>
              <p className="text-sm text-[#646179]">
                Search patients for billing, reports, consultation history, and
                follow-ups
              </p>
            </div>

            <div className="flex gap-2 w-full md:w-auto">
              <input
                className={inputClass}
                placeholder="Search by name / phone / patient id"
                value={patientSearch}
                onChange={(e) => setPatientSearch(e.target.value)}
              />
              <button
                type="button"
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                onClick={() => {
                  setPatientPage(1);
                  loadPatients(patientSearch, 1);
                }}
              >
                Search
              </button>
            </div>
          </div>

          <div className="p-4 overflow-x-auto">
            {patientError && (
              <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-sm text-red-700">
                {patientError}
              </div>
            )}

            <DataTable
              columns={patientColumns}
              rows={patientRows}
              emptyText={patientLoading ? "Loading..." : "No patients found."}
              getRowKey={(r) => r.id}
              groupedActions={(row) => [
                {
                  items: [
                    {
                      label: "View Details",
                      onClick: () => router.push(`/patients/${row.id}`),
                    },
                  ],
                },
              ]}
            />

            <div className="mt-3 text-xs text-[#646179]">
              Tip: Use actions to open the patient summary.
            </div>
          </div>
        </div>
      </div>

      {/* Pick patient modal */}
      {showPickPatient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-2xl rounded-2xl border bg-white shadow-lg">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div>
                <div className="text-sm font-semibold text-[#1f1f1f]">
                  Select Patient
                </div>
                <div className="text-xs text-[#646179]">
                  Multiple matches found. Choose the correct patient to prefill.
                </div>
              </div>
              <button
                type="button"
                className="rounded-lg border bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
                onClick={() => setShowPickPatient(false)}
              >
                Close
              </button>
            </div>

            <div className="p-4">
              <div className="w-full overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-[#646179]">
                    <tr className="border-b">
                      <th className="px-3 py-2 text-left font-medium">
                        Patient ID
                      </th>
                      <th className="px-3 py-2 text-left font-medium">Name</th>
                      <th className="px-3 py-2 text-left font-medium">Phone</th>
                      <th className="px-3 py-2 text-right font-medium">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {prefillHits.map((h) => (
                      <tr
                        key={h.patientCode}
                        className="border-b last:border-b-0"
                      >
                        <td className="px-3 py-2 font-medium text-[#1f1f1f]">
                          {h.patientCode}
                        </td>
                        <td className="px-3 py-2 text-[#1f1f1f]">{h.name}</td>
                        <td className="px-3 py-2 text-[#646179]">
                          {h.phone ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                            onClick={async () => {
                              setShowPickPatient(false);
                              setPrefillLoading(true);
                              try {
                                await fetchPrefillByPatientCode(h.patientCode);
                              } catch (e: unknown) {
                                setPrefillError(
                                  e instanceof Error
                                    ? e.message
                                    : "Prefill failed."
                                );
                              } finally {
                                setPrefillLoading(false);
                              }
                            }}
                          >
                            Select
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function toPayStatus(v: string): PayStatus {
  if (v === "ACCEPTED" || v === "PENDING" || v === "WAIVED") return v;
  return "ACCEPTED";
}

const inputClass =
  "w-full rounded-lg border px-3 py-2 text-sm transition-all duration-200 " +
  "bg-white border-slate-200 text-slate-900 " + // Soft border and dark text
  "placeholder:text-slate-400 " +
  "focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500";

const selectClass =
  "w-full rounded-lg border px-3 py-2 text-sm bg-[var(--input-bg)] border-[var(--input-border)] text-[var(--input-text)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]";

function todayLocalYYYYMMDD() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatDate(d: Date | string) {
  const dt = d instanceof Date ? d : new Date(d);
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const yyyy = dt.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}
