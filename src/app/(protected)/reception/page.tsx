// src/app/(protected)/reception/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import DataTable, { Column } from "@/components/ui/DataTable";

import ReceptionHeader from "@/components/reception/ReceptionHeader";
import {
  ReceptionKpis,
  type ReceptionKpisData,
} from "@/components/reception/kpis/ReceptionKpis";
import VisitRegistrationForm from "@/components/reception/quick-opd/VisitRegistrationForm";
import EditVisitModalHost from "@/components/reception/edit-visit/EditVisitModalHost";

type QueueStatus = "WAITING" | "NEXT" | "IN_ROOM" | "DONE";

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

function formatINR(n: number) {
  return n.toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });
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

  const [kpis, setKpis] = useState<ReceptionKpisData>({
    registeredToday: 0,
    waiting: 0,
    done: 0,
    accepted: 0,
    pending: 0,
    waived: 0,
  });
  const [loadingKpis, setLoadingKpis] = useState(false);

  // Patient lookup
  const [patientRows, setPatientRows] = useState<PatientRow[]>([]);
  const [patientSearch, setPatientSearch] = useState("");
  const [patientLoading, setPatientLoading] = useState(false);
  const [patientError, setPatientError] = useState<string | null>(null);
  const [patientPage, setPatientPage] = useState(1);
  const pageSize = 15;

  // ✅ Edit modal state (Option A)
  const [editOpen, setEditOpen] = useState(false);
  const [editVisitId, setEditVisitId] = useState<number | null>(null);

  function openEditModal(visitId: number) {
    setEditVisitId(visitId);
    setEditOpen(true);
  }

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
    loadPatients("", 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  return (
    <div className="min-h-[calc(100vh-120px)] bg-[#F2F2F2]">
      <div className="p-6">
        <ReceptionHeader registerDisabled={true} />

        <ReceptionKpis
          kpis={kpis}
          loading={loadingKpis}
          formatINR={formatINR}
        />

        <div className="mt-6 grid grid-cols-1 gap-5">
          <VisitRegistrationForm
            mode="create"
            onSuccess={async () => {
              await loadDashboard();
              await loadPatients("", 1);
            }}
          />

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
                        onClick: () => openEditModal(row.visitId),
                      },
                      {
                        label: "View Patient Data",
                        onClick: () =>
                          router.push(`/patients/${row.patientId}`),
                      },
                      {
                        label: "Generate Bill",
                        onClick: () =>
                          window.open(
                            `/reception/bill/${row.visitId}`,
                            "_blank",
                            "noopener,noreferrer"
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
                      label: "View Patient Data",
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

      {/* ✅ Edit modal host (force remount on visitId change) */}
      <EditVisitModalHost
        key={editVisitId ?? "none"}
        open={editOpen}
        visitId={editVisitId}
        onClose={() => setEditOpen(false)}
        onSaved={async () => {
          await loadDashboard();
          await loadPatients("", 1);
        }}
      />
    </div>
  );
}

const inputClass =
  "w-full rounded-lg border px-3 py-2 text-sm transition-all duration-200 " +
  "bg-white border-slate-200 text-slate-900 " +
  "placeholder:text-slate-400 " +
  "focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500";

function formatDate(d: Date | string) {
  const dt = d instanceof Date ? d : new Date(d);
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const yyyy = dt.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}
