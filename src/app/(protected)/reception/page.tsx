// src/app/(protected)/reception/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import ReceptionHeader from "@/components/reception/ReceptionHeader";
import {
  ReceptionKpis,
  type ReceptionKpisData,
} from "@/components/reception/kpis/ReceptionKpis";
import VisitRegistrationForm from "@/components/reception/quick-opd/VisitRegistrationForm";
import EditVisitModalHost from "@/components/reception/edit-visit/EditVisitModalHost";
import QueueTableCard, {
  type QueueStatus,
} from "@/components/queue/QueueTableCard";
import { receptionQueueColumns } from "@/components/queue/queueColumns";
import PatientLookupTableCard from "@/components/patients/PatientLookupTableCard";
import NotificationsPanel from "@/components/notifications/NotificationsPanel";
import RegisterPatientModal from "@/components/reception/quick-opd/RegisterPatientModal";

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
  const [registerOpen, setRegisterOpen] = useState(false);

  // ✅ Edit modal state (Option A)
  const [editOpen, setEditOpen] = useState(false);
  const [editVisitId, setEditVisitId] = useState<number | null>(null);
  const [patientLookupRefreshKey, setPatientLookupRefreshKey] = useState(0);

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
        <ReceptionHeader onRegisterPatient={() => setRegisterOpen(true)} />
        <ReceptionKpis
          kpis={kpis}
          loading={loadingKpis}
          formatINR={formatINR}
        />

        <div className="mt-6 grid grid-cols-1 gap-5">
          <div className="grid grid-cols-12 gap-5 items-start">
            <div className="col-span-12 lg:col-span-8">
              <QueueTableCard
                rows={queueRows}
                columns={receptionQueueColumns}
                loading={loadingQueue}
                onRefresh={loadDashboard}
                footerHint="Tip: Use the action menu to change status, edit patient, or generate bill."
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
                          changeQueueStatus(row.queueEntryId, "COMPLETED"),
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
            </div>

            <div className="col-span-12 lg:col-span-4">
              <div className="lg:sticky lg:top-6">
                <NotificationsPanel />
              </div>
            </div>
          </div>
        </div>

        {/* Patient Lookup */}
        <PatientLookupTableCard
          refreshKey={patientLookupRefreshKey}
          onViewPatient={(patientId) => router.push(`/patients/${patientId}`)}
        />
      </div>

      {/* ✅ Edit modal host (force remount on visitId change) */}
      <EditVisitModalHost
        key={editVisitId ?? "none"}
        open={editOpen}
        visitId={editVisitId}
        onClose={() => setEditOpen(false)}
        onSaved={async () => {
          await loadDashboard();
          setPatientLookupRefreshKey((k) => k + 1);
        }}
      />

      <RegisterPatientModal
        open={registerOpen}
        onClose={() => setRegisterOpen(false)}
        title=""
      >
        <VisitRegistrationForm
          mode="create"
          showFetch={true}
          onSuccess={async () => {
            setRegisterOpen(false);
            await loadDashboard();
            setPatientLookupRefreshKey((k) => k + 1);
          }}
        />
      </RegisterPatientModal>
    </div>
  );
}
