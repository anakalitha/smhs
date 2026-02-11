// src/app/(protected)/reception/page.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import DataTable, { Column } from "@/components/ui/DataTable";
import ReferralComboBox from "@/components/ui/ReferralComboBox";
import AddDoctorModal from "@/components/ui/AddDoctorModal";

type QueueStatus = "WAITING" | "NEXT" | "IN_ROOM" | "COMPLETED";
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
  createdAt?: string; // optional (from API), UI doesn't require it
};

type PatientRow = {
  id: string;
  name: string;
  phone: string;
  lastVisit: string;
  doctor?: string;
};

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
    cell: (q) => <span className="text-[#646179]">{q.phone}</span>,
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
    cell: (p) => <span className="text-[#646179]">{p.lastVisit}</span>,
  },
  {
    header: "Consulting Doctor",
    cell: (p) => <span className="text-[#646179]">{p.doctor ?? "—"}</span>,
  },
];

type FieldErrors = Partial<
  Record<
    "name" | "phone" | "doctorId" | "consultingFee" | "paymentMode",
    string
  >
>;

function digitsOnly(s: string) {
  return s.replace(/\D+/g, "");
}

// Formats as "XXXXX XXXXX" when 6+ digits, otherwise raw digits.
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
      <label className="block mb-1 text-sm font-medium text-[#646179]">
        {label}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export default function ReceptionDashboard() {
  const router = useRouter();
  // ✅ Today’s Queue from DB (no mocks)
  const [queueRows, setQueueRows] = useState<QueueRow[]>([]);
  const [loadingQueue, setLoadingQueue] = useState(false);

  // ✅ KPIs from DB
  const [kpis, setKpis] = useState<ReceptionKpis>({
    registeredToday: 0,
    waiting: 0,
    done: 0,
    accepted: 0,
    pending: 0,
    waived: 0,
  });
  const [loadingKpis, setLoadingKpis] = useState(false);

  // Doctors + payment modes from DB
  const [doctors, setDoctors] = useState<DoctorOption[]>([]);
  const [loadingDoctors, setLoadingDoctors] = useState(false);

  const [paymentModes, setPaymentModes] = useState<PaymentModeRow[]>([]);
  const [loadingModes, setLoadingModes] = useState(false);

  // Referral combobox selection
  const [referral, setReferral] = useState<{ id: string; name: string } | null>(
    null
  );

  const [showAddDoctor, setShowAddDoctor] = useState(false);

  const [form, setForm] = useState<{
    name: string;
    phone: string;
    doctorId: number;
    consultingFee: string;
    paymentMode: string; // DB-driven
    payStatus: PayStatus;
  }>({
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

  // (Optional) pagination later
  const [patientPage, setPatientPage] = useState(1);
  const pageSize = 15;

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

  // ✅ One loader: KPIs + Today’s Queue
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
          if (list.length > 0) {
            setForm((f) => ({ ...f, doctorId: list[0].id }));
          }
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
          if (modes.length > 0) {
            setForm((f) => ({ ...f, paymentMode: modes[0].code }));
          }
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

    await loadDashboard(); // refresh queue + KPIs
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
      const phone = digitsOnly(form.phone).slice(0, 10); // send clean
      const fee = Number(form.consultingFee);

      const res = await fetch("/api/reception/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          phone,
          doctorId: form.doctorId,
          consultingFee: fee,
          paymentMode: form.paymentMode,
          payStatus: form.payStatus,

          // ✅ IMPORTANT: send referralpersonId properly
          referralId: referral?.id ?? null,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError(data?.error || "Registration failed.");
        return;
      }

      setFormSuccess("Patient registered and added to today’s queue.");
      setForm((f) => ({ ...f, name: "", phone: "", consultingFee: "" }));
      setReferral(null);
      if (data?.visitId) {
        router.push(`/reception/bill/${data.visitId}`);
        // window.open(
        //   `/reception/bill/${data.visitId}`,
        //   "_blank",
        //   "noopener,noreferrer"
        // );
      } else {
        console.error("Register API did not return visitId", data);
      }
      // ✅ Refresh KPIs + queue from DB (multi-receptionist safe)
      await loadDashboard();
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
      name: "",
      phone: "",
      consultingFee: "",
      payStatus: "ACCEPTED",
      doctorId: doctors.length > 0 ? doctors[0].id : 0,
      paymentMode: paymentModes.length > 0 ? paymentModes[0].code : "",
    }));
  }

  function toPayStatus(v: string): PayStatus {
    if (v === "ACCEPTED" || v === "PENDING" || v === "WAIVED") return v;
    return "ACCEPTED";
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
              Today’s queue, quick registration, patient lookup, billing and
              reports.
            </p>
          </div>

          {/* Quick actions */}
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

        {/* Queue + Quick Registration */}
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-5 w-full">
          {/* LEFT: Today’s Queue */}
          <div className="lg:col-span-7 w-full rounded-2xl border bg-white shadow-sm">
            <div className="p-4 flex items-center justify-between border-b">
              <div>
                <h2 className="text-lg font-semibold text-[#1f1f1f]">
                  Today’s Queue
                </h2>
                <p className="text-sm text-[#646179]">
                  Patients registered today (first come basis)
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={loadDashboard}
                  className="rounded-lg border px-3 py-2 text-sm hover:bg-gray-50"
                >
                  {loadingQueue ? "Refreshing…" : "🔄 Refresh"}
                </button>
              </div>
            </div>

            <div className="p-4 overflow-x-auto">
              <DataTable
                dense
                columns={queueColumns}
                rows={queueRows}
                getRowKey={(r) => r.token}
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
                        label: "Mark as Complete",
                        onClick: () =>
                          changeQueueStatus(row.queueEntryId, "COMPLETED"),
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
                          router.push(`/reception/patients/${row.patientDbId}`),
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
                Tip: Use the action menu to change status, generate bill, or
                view details.
              </div>
            </div>
          </div>

          {/* RIGHT: Quick Registration */}
          <div className="lg:col-span-5 w-full rounded-2xl border bg-[#F9FAFB] shadow-sm">
            <div className="p-4 border-b bg-white/60">
              <h2 className="text-lg font-semibold text-[#1f1f1f]">
                Quick OPD Patient Registration
              </h2>
              <p className="text-sm text-[#646179]">
                Fast registration for walk-in patients
              </p>
            </div>

            <div className="p-4">
              <form onSubmit={submitQuickRegistration} className="space-y-4">
                {formError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {formError}
                  </div>
                )}
                <FormField label="Name" error={fieldErrors.name}>
                  <input
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    placeholder="Patient name"
                    value={form.name}
                    onChange={(e) => {
                      const v = e.target.value;
                      setForm((f) => ({ ...f, name: v }));
                      setFieldErrors((prev) => ({ ...prev, name: undefined }));
                    }}
                    onBlur={() => setFieldErrors(validateForm())}
                  />
                </FormField>

                <FormField label="Referred By">
                  <ReferralComboBox value={referral} onChange={setReferral} />
                </FormField>

                <FormField label="Phone" error={fieldErrors.phone}>
                  <input
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    placeholder="Mobile number (Optional)"
                    value={formatPhoneUI(form.phone)}
                    onChange={(e) => {
                      const digits = digitsOnly(e.target.value).slice(0, 10);
                      setForm((f) => ({ ...f, phone: digits }));
                      setFieldErrors((prev) => ({ ...prev, phone: undefined }));
                    }}
                    onBlur={() => setFieldErrors(validateForm())}
                  />
                </FormField>

                <FormField
                  label={
                    <div className="flex items-center justify-between">
                      <span>Consulting Doctor</span>
                      <button
                        type="button"
                        className="text-sm text-blue-600 hover:underline"
                        onClick={() => setShowAddDoctor(true)}
                      >
                        ➕ Add Doctor
                      </button>
                    </div>
                  }
                  error={fieldErrors.doctorId}
                >
                  <select
                    className="w-full rounded-lg border px-3 py-2 text-sm"
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

                <FormField
                  label="Consulting Fee"
                  error={fieldErrors.consultingFee}
                >
                  <input
                    className="w-full rounded-lg border px-3 py-2 text-sm"
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

                <FormField label="Payment Mode" error={fieldErrors.paymentMode}>
                  <select
                    className="w-full rounded-lg border px-3 py-2 text-sm"
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
                    className="w-full rounded-lg border px-3 py-2 text-sm"
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

                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={resetQuickForm}
                    disabled={submitting}
                    className="w-full rounded-lg border bg-white py-2.5 text-sm font-medium hover:bg-gray-50 disabled:opacity-60"
                  >
                    Clear
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || !isFormValid}
                    className="w-full rounded-lg bg-[#00966D] py-2.5 text-sm font-medium text-white hover:bg-[#007f5c] disabled:opacity-60 disabled:hover:bg-[#00966D]"
                  >
                    {submitting ? "Registering..." : "➕ Register Patient"}
                  </button>
                </div>
                {formSuccess && (
                  <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
                    {formSuccess}
                  </div>
                )}

                <div className="text-xs text-[#646179]">
                  Registration will add the patient directly to today&apos;s
                  queue.
                </div>
              </form>
            </div>
          </div>
        </div>

        {/* Patient Lookup (Full Width) - static for now */}
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
                className="w-full md:w-72 rounded-lg border px-3 py-2 text-sm"
                placeholder="Search by name / phone / patient id"
                value={patientSearch}
                onChange={(e) => setPatientSearch(e.target.value)}
              />
              <button
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
              Tip: Use actions to generate bills, view reports, or open
              consultation summary.
            </div>
            {patientError && (
              <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {patientError}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function toPayStatus(v: string): PayStatus {
  if (v === "ACCEPTED" || v === "PENDING" || v === "WAIVED") return v;
  return "ACCEPTED";
}
