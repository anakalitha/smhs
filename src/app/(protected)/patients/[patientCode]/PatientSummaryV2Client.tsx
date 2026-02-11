// src/app/(protected)/patients/[patientCode]/PatientSummaryV2Client.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import DataTable, { Column } from "@/components/ui/DataTable";

type QueueStatus = "WAITING" | "NEXT" | "IN_ROOM" | "COMPLETED";

type Gender = "MALE" | "FEMALE" | "OTHER";
type BloodGroup = "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-";

type Permissions = {
  canEditPatient: boolean;
  canViewClinical: boolean;
  canEditClinical: boolean;
  canViewBilling: boolean;
};

type Patient = {
  id: number;
  patientCode: string;
  fullName: string;
  phone: string | null;

  dob: string | null;
  gender: Gender | null;
  bloodGroup: BloodGroup | null;

  email: string | null;

  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;

  emergencyContactName: string | null;
  emergencyContactRelationship: string | null;
  emergencyContactPhone: string | null;
};

type Today = {
  visitId: number;
  visitDate: string;
  doctorId: number | null;
  tokenNo: number | null;
  queueStatus: QueueStatus | null;
} | null;

type VisitListRow = {
  visitId: number;
  visitDate: string;
  doctorId: number | null;
  doctorName: string | null;
  tokenNo: number | null;
  queueStatus: QueueStatus | null;

  // included only when permissions.canViewClinical === true
  diagnosis?: string | null;
  hasPrescription?: boolean;
};

type SummaryOk = {
  ok: true;
  permissions: Permissions;
  patient: Patient;
  today: Today;
  visits: VisitListRow[];
};

type SummaryErr = { error: string };
type SummaryResponse = SummaryOk | SummaryErr;

type OpenVisitOk = {
  ok: true;
  visitId: number;
  tokenNo: number | null;
  queueStatus: QueueStatus | null;
  doctorId: number | null;
  patientCode: string;
  visitDate: string;
};

type OpenVisitErr = { error: string };
type OpenVisitResponse = OpenVisitOk | OpenVisitErr;

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function formatDate(yyyyMmDd: string | null | undefined) {
  if (!yyyyMmDd) return "—";
  return String(yyyyMmDd).slice(0, 10);
}

function calcAge(dob: string | null) {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;

  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age >= 0 && age < 130 ? age : null;
}

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

function getErrorMessage(x: unknown): string | null {
  if (!isObject(x)) return null;
  const e = x["error"];
  return typeof e === "string" ? e : null;
}

function isSummaryOk(x: unknown): x is SummaryOk {
  if (!isObject(x)) return false;
  return x["ok"] === true;
}

function isOpenVisitOk(x: unknown): x is OpenVisitOk {
  if (!isObject(x)) return false;
  return x["ok"] === true && typeof x["visitId"] === "number";
}

function toGender(v: string): Gender | null {
  return v === "MALE" || v === "FEMALE" || v === "OTHER" ? v : null;
}

function toBloodGroup(v: string): BloodGroup | null {
  const allowed: BloodGroup[] = [
    "A+",
    "A-",
    "B+",
    "B-",
    "AB+",
    "AB-",
    "O+",
    "O-",
  ];
  return (allowed as readonly string[]).includes(v) ? (v as BloodGroup) : null;
}

function Badge({
  children,
  tone = "gray",
}: {
  children: React.ReactNode;
  tone?: "gray" | "green" | "yellow" | "blue";
}) {
  const cls =
    tone === "green"
      ? "bg-green-50 text-green-700 ring-green-200"
      : tone === "yellow"
      ? "bg-yellow-50 text-yellow-700 ring-yellow-200"
      : tone === "blue"
      ? "bg-blue-50 text-blue-700 ring-blue-200"
      : "bg-gray-50 text-gray-700 ring-gray-200";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs ring-1",
        cls
      )}
    >
      {children}
    </span>
  );
}

function SectionCard({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border bg-white shadow-sm">
      <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
        <div>
          <div className="text-sm font-semibold text-slate-900">{title}</div>
          {subtitle ? (
            <div className="mt-0.5 text-xs text-slate-500">{subtitle}</div>
          ) : null}
        </div>
        {right}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function TextRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="text-sm font-medium text-slate-900 text-right">
        {value}
      </div>
    </div>
  );
}

function ModalShell({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-2xl rounded-3xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div className="text-sm font-semibold text-slate-900">{title}</div>
          <button
            className="rounded-xl px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

export default function PatientSummaryV2Client({
  patientCode,
}: {
  patientCode: string;
}) {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [summary, setSummary] = useState<SummaryOk | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const [form, setForm] = useState<Partial<Patient>>({});

  async function load() {
    setLoading(true);
    setErr(null);
    setActionMsg(null);

    try {
      const res = await fetch(
        `/api/patients/${encodeURIComponent(patientCode)}/summary`,
        {
          cache: "no-store",
        }
      );

      const raw: unknown = await res.json().catch(() => null);

      if (!res.ok || !isSummaryOk(raw)) {
        setErr(getErrorMessage(raw) ?? "Failed to load patient summary.");
        setSummary(null);
      } else {
        setSummary(raw);
      }
    } catch {
      setErr("Network error while loading patient summary.");
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientCode]);

  const age = summary ? calcAge(summary.patient.dob) : null;

  const visitColumns: Column<VisitListRow>[] = useMemo(() => {
    const cols: Column<VisitListRow>[] = [
      {
        header: "Date",
        className: "w-[120px]",
        cell: (r) => (
          <span className="text-slate-900">{formatDate(r.visitDate)}</span>
        ),
      },
      {
        header: "Doctor",
        className: "min-w-[180px]",
        cell: (r) => (
          <span className="text-slate-900">{r.doctorName || "—"}</span>
        ),
      },
      {
        header: "Token",
        className: "w-[90px]",
        cell: (r) => <span className="text-slate-900">{r.tokenNo ?? "—"}</span>,
      },
      {
        header: "Queue",
        className: "w-[120px]",
        cell: (r) => {
          const st = r.queueStatus;
          if (!st) return <span className="text-slate-500">—</span>;
          const tone =
            st === "COMPLETED"
              ? "green"
              : st === "IN_ROOM"
              ? "blue"
              : st === "NEXT"
              ? "yellow"
              : "gray";
          return <Badge tone={tone}>{st}</Badge>;
        },
      },
    ];

    if (summary?.permissions.canViewClinical) {
      cols.push(
        {
          header: "Diagnosis",
          className: "min-w-[220px]",
          cell: (r) => (
            <span className="text-slate-700">
              {(r.diagnosis || "—").toString().slice(0, 60)}
            </span>
          ),
        },
        {
          header: "Rx",
          className: "w-[90px]",
          cell: (r) =>
            r.hasPrescription ? (
              <Badge tone="green">Yes</Badge>
            ) : (
              <span className="text-slate-500">—</span>
            ),
        }
      );
    }

    cols.push({
      header: "Action",
      className: "w-[120px]",
      cell: (r) => (
        <button
          className="rounded-xl border px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
          onClick={() =>
            router.push(`/doctor/visits/${r.visitId}/consultation/summary`)
          }
        >
          View
        </button>
      ),
    });

    return cols;
  }, [router, summary?.permissions.canViewClinical]);

  async function openVisit() {
    setActionMsg(null);

    try {
      const res = await fetch(
        `/api/patients/${encodeURIComponent(patientCode)}/open-visit`,
        {
          method: "POST",
        }
      );
      const raw: unknown = await res.json().catch(() => null);

      if (!res.ok || !isOpenVisitOk(raw)) {
        setActionMsg(getErrorMessage(raw) ?? "Failed to open visit.");
        return;
      }

      // Doctor → go to consultation
      if (summary?.permissions.canEditClinical) {
        router.push(`/doctor/visits/${raw.visitId}/consultation`);
        return;
      }

      // Reception → stay and refresh
      setActionMsg(`Visit opened. Token: ${raw.tokenNo ?? "—"}`);
      await load();
    } catch {
      setActionMsg("Network error while opening visit.");
    }
  }

  function openEdit() {
    if (!summary) return;
    setForm({ ...summary.patient });
    setEditOpen(true);
  }

  async function saveProfile() {
    if (!summary) return;

    setSaving(true);
    setActionMsg(null);
    console.log("patientCode");
    console.log(patientCode);

    try {
      const res = await fetch(
        `/api/patients/${encodeURIComponent(patientCode)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fullName: (form.fullName ?? "").toString(),
            phone: form.phone ?? null,
            dob: form.dob ?? null,
            gender: form.gender ?? null,
            bloodGroup: form.bloodGroup ?? null,
            email: form.email ?? null,
            addressLine1: form.addressLine1 ?? null,
            addressLine2: form.addressLine2 ?? null,
            city: form.city ?? null,
            state: form.state ?? null,
            pincode: form.pincode ?? null,
            emergencyContactName: form.emergencyContactName ?? null,
            emergencyContactRelationship:
              form.emergencyContactRelationship ?? null,
            emergencyContactPhone: form.emergencyContactPhone ?? null,
          }),
        }
      );

      const raw: unknown = await res.json().catch(() => null);
      if (!res.ok || !(isObject(raw) && raw["ok"] === true)) {
        setActionMsg(getErrorMessage(raw) ?? "Failed to save patient profile.");
        return;
      }

      setEditOpen(false);
      setActionMsg("Patient profile updated.");
      await load();
    } catch {
      setActionMsg("Network error while saving profile.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="p-6 text-slate-600">Loading patient summary…</div>;
  }

  if (err) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border bg-white p-5">
          <div className="text-sm font-semibold text-slate-900">
            Could not load patient
          </div>
          <div className="mt-1 text-sm text-slate-600">{err}</div>
          <button
            className="mt-4 rounded-xl border px-4 py-2 text-sm hover:bg-slate-50"
            onClick={load}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!summary) return <div className="p-6">No data.</div>;

  const { patient, today, visits, permissions } = summary;

  const address =
    [
      patient.addressLine1,
      patient.addressLine2,
      patient.city,
      patient.state,
      patient.pincode,
    ]
      .filter(Boolean)
      .join(", ") || "—";

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="rounded-3xl border bg-gradient-to-r from-white to-slate-50 p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-xs font-medium text-slate-500">Patient</div>
            <div className="mt-1 text-2xl font-semibold text-slate-900">
              {patient.fullName}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600">
              <Badge tone="blue">{patient.patientCode}</Badge>
              <span>•</span>
              <span>{patient.phone || "No phone"}</span>
              {age != null ? (
                <>
                  <span>•</span>
                  <span>{age} yrs</span>
                </>
              ) : null}
              {patient.gender ? (
                <>
                  <span>•</span>
                  <span>{patient.gender}</span>
                </>
              ) : null}
              {patient.bloodGroup ? (
                <>
                  <span>•</span>
                  <Badge tone="yellow">{patient.bloodGroup}</Badge>
                </>
              ) : null}
            </div>

            {actionMsg ? (
              <div className="mt-3 text-sm text-slate-700">{actionMsg}</div>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              className="rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
              onClick={openVisit}
            >
              Start / Open Today’s Visit
            </button>

            {permissions.canEditPatient ? (
              <button
                className="rounded-2xl border px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-white"
                onClick={openEdit}
              >
                Edit Profile
              </button>
            ) : null}

            <button
              className="rounded-2xl border px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-white"
              onClick={() => router.back()}
            >
              Back
            </button>
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left: Profile */}
        <div className="lg:col-span-1 space-y-6">
          <SectionCard
            title="Patient Profile"
            subtitle="Demographics & contact details"
          >
            <div className="space-y-3">
              <TextRow label="Phone" value={patient.phone || "—"} />
              <TextRow label="Email" value={patient.email || "—"} />
              <TextRow
                label="DOB"
                value={patient.dob ? formatDate(patient.dob) : "—"}
              />
              <TextRow label="Address" value={address} />
              <div className="pt-2 border-t" />
              <div className="text-xs font-semibold text-slate-700">
                Emergency Contact
              </div>
              <TextRow
                label="Name"
                value={patient.emergencyContactName || "—"}
              />
              <TextRow
                label="Relation"
                value={patient.emergencyContactRelationship || "—"}
              />
              <TextRow
                label="Phone"
                value={patient.emergencyContactPhone || "—"}
              />
            </div>
          </SectionCard>

          <SectionCard title="Today’s Visit" subtitle="Token & queue status">
            {today ? (
              <div className="space-y-3">
                <TextRow label="Date" value={formatDate(today.visitDate)} />
                <TextRow label="Token" value={today.tokenNo ?? "—"} />
                <TextRow
                  label="Queue"
                  value={
                    today.queueStatus ? (
                      <Badge
                        tone={
                          today.queueStatus === "COMPLETED"
                            ? "green"
                            : today.queueStatus === "IN_ROOM"
                            ? "blue"
                            : today.queueStatus === "NEXT"
                            ? "yellow"
                            : "gray"
                        }
                      >
                        {today.queueStatus}
                      </Badge>
                    ) : (
                      "—"
                    )
                  }
                />
                {permissions.canEditClinical ? (
                  <button
                    className="mt-2 w-full rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
                    onClick={() =>
                      router.push(
                        `/doctor/visits/${today.visitId}/consultation`
                      )
                    }
                  >
                    Go to Consultation
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="text-sm text-slate-600">
                No visit for today yet. Use “Start / Open Today’s Visit”.
              </div>
            )}
          </SectionCard>
        </div>

        {/* Right: Visits table */}
        <div className="lg:col-span-2 space-y-6">
          <SectionCard
            title="Visit History"
            subtitle="Recent visits for this patient"
            right={
              <button
                className="rounded-xl border px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                onClick={load}
              >
                Refresh
              </button>
            }
          >
            <DataTable<VisitListRow>
              rows={visits}
              columns={visitColumns}
              getRowKey={(r) => r.visitId}
              emptyText="No visits found."
            />
          </SectionCard>

          {/* Billing hidden for reception */}
          {permissions.canViewBilling ? (
            <SectionCard
              title="Billing (Admin only)"
              subtitle="Fees and payments"
            >
              <div className="text-sm text-slate-600">
                This section is intentionally hidden for Reception/Doctor in v2.
                Plug billing components here later.
              </div>
            </SectionCard>
          ) : null}
        </div>
      </div>

      {/* Edit modal */}
      <ModalShell
        open={editOpen}
        title="Edit patient profile"
        onClose={() => setEditOpen(false)}
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="text-xs font-medium text-slate-600">
              Full name
            </label>
            <input
              className="mt-1 w-full rounded-2xl border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-slate-200"
              value={form.fullName ?? ""}
              onChange={(e) =>
                setForm((p) => ({ ...p, fullName: e.target.value }))
              }
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600">Phone</label>
            <input
              className="mt-1 w-full rounded-2xl border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-slate-200"
              value={form.phone ?? ""}
              onChange={(e) =>
                setForm((p) => ({ ...p, phone: e.target.value || null }))
              }
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600">Email</label>
            <input
              className="mt-1 w-full rounded-2xl border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-slate-200"
              value={form.email ?? ""}
              onChange={(e) =>
                setForm((p) => ({ ...p, email: e.target.value || null }))
              }
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600">DOB</label>
            <input
              type="date"
              className="mt-1 w-full rounded-2xl border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-slate-200"
              value={(form.dob ?? "").slice(0, 10)}
              onChange={(e) =>
                setForm((p) => ({ ...p, dob: e.target.value || null }))
              }
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600">Gender</label>
            <select
              className="mt-1 w-full rounded-2xl border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-slate-200"
              value={form.gender ?? ""}
              onChange={(e) =>
                setForm((p) => ({ ...p, gender: toGender(e.target.value) }))
              }
            >
              <option value="">—</option>
              <option value="MALE">MALE</option>
              <option value="FEMALE">FEMALE</option>
              <option value="OTHER">OTHER</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600">
              Blood group
            </label>
            <select
              className="mt-1 w-full rounded-2xl border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-slate-200"
              value={form.bloodGroup ?? ""}
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  bloodGroup: toBloodGroup(e.target.value),
                }))
              }
            >
              <option value="">—</option>
              {(
                ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const
              ).map((bg) => (
                <option key={bg} value={bg}>
                  {bg}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="text-xs font-medium text-slate-600">
              Address line 1
            </label>
            <input
              className="mt-1 w-full rounded-2xl border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-slate-200"
              value={form.addressLine1 ?? ""}
              onChange={(e) =>
                setForm((p) => ({ ...p, addressLine1: e.target.value || null }))
              }
            />
          </div>

          <div className="md:col-span-2">
            <label className="text-xs font-medium text-slate-600">
              Address line 2
            </label>
            <input
              className="mt-1 w-full rounded-2xl border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-slate-200"
              value={form.addressLine2 ?? ""}
              onChange={(e) =>
                setForm((p) => ({ ...p, addressLine2: e.target.value || null }))
              }
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600">City</label>
            <input
              className="mt-1 w-full rounded-2xl border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-slate-200"
              value={form.city ?? ""}
              onChange={(e) =>
                setForm((p) => ({ ...p, city: e.target.value || null }))
              }
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600">State</label>
            <input
              className="mt-1 w-full rounded-2xl border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-slate-200"
              value={form.state ?? ""}
              onChange={(e) =>
                setForm((p) => ({ ...p, state: e.target.value || null }))
              }
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600">
              Pincode
            </label>
            <input
              className="mt-1 w-full rounded-2xl border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-slate-200"
              value={form.pincode ?? ""}
              onChange={(e) =>
                setForm((p) => ({ ...p, pincode: e.target.value || null }))
              }
            />
          </div>

          <div className="md:col-span-2 border-t pt-4 mt-2">
            <div className="text-xs font-semibold text-slate-700">
              Emergency contact
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600">Name</label>
            <input
              className="mt-1 w-full rounded-2xl border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-slate-200"
              value={form.emergencyContactName ?? ""}
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  emergencyContactName: e.target.value || null,
                }))
              }
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600">
              Relationship
            </label>
            <input
              className="mt-1 w-full rounded-2xl border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-slate-200"
              value={form.emergencyContactRelationship ?? ""}
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  emergencyContactRelationship: e.target.value || null,
                }))
              }
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600">Phone</label>
            <input
              className="mt-1 w-full rounded-2xl border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-slate-200"
              value={form.emergencyContactPhone ?? ""}
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  emergencyContactPhone: e.target.value || null,
                }))
              }
            />
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            className="rounded-2xl border px-4 py-2.5 text-sm font-medium hover:bg-slate-50"
            onClick={() => setEditOpen(false)}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            className="rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
            onClick={saveProfile}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </ModalShell>
    </div>
  );
}
