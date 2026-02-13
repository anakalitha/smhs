// src/app/(protected)/reception/patients/[patientCode]/ReceptionPatientSummaryClient.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import DataTable, { type Column } from "@/components/ui/DataTable";
import RegisterPatientModal from "@/components/reception/quick-opd/RegisterPatientModal";
import VisitRegistrationForm from "@/components/reception/quick-opd/VisitRegistrationForm";

type VisitRow = {
  visitId: number;
  visitDate: string; // YYYY-MM-DD
  status: string;
  doctorName: string | null;
  netAmount: number;
  payStatus: "ACCEPTED" | "PENDING" | "WAIVED";
  paymentMode: string | null;
};

type ApiOk = {
  ok: true;
  patient: {
    patientCode: string;
    name: string;
    phone: string | null;
    dob: string | null;
    gender: string | null;
    referredBy: string | null;
  };
  visits: VisitRow[];
  totalVisits: number;
};

function formatDDMMYYYY(iso: string) {
  // iso: YYYY-MM-DD
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function formatINR(n: number) {
  return n.toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });
}

export default function ReceptionPatientSummaryClient({
  patientCode,
}: {
  patientCode: string;
}) {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [patient, setPatient] = useState<ApiOk["patient"] | null>(null);
  const [visits, setVisits] = useState<VisitRow[]>([]);
  const [totalVisits, setTotalVisits] = useState(0);
  const [editOpen, setEditOpen] = useState(false);
  const [editVisitId, setEditVisitId] = useState<number | null>(null);

  function openEditVisit(visitId: number) {
    setEditVisitId(visitId);
    setEditOpen(true);
  }

  function closeEditVisit() {
    setEditOpen(false);
    setEditVisitId(null);
  }

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(
        `/api/reception/patients/${encodeURIComponent(patientCode)}/summary`,
        { cache: "no-store" }
      );
      const json = (await res.json().catch(() => ({}))) as Partial<ApiOk> & {
        error?: string;
      };

      if (!res.ok || !json.ok) {
        setErr(json.error || "Failed to load patient summary.");
        return;
      }

      setPatient(json.patient ?? null);
      setVisits(json.visits ?? []);
      setTotalVisits(Number(json.totalVisits ?? 0));
    } catch {
      setErr("Network error.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientCode]);

  const columns: Column<VisitRow>[] = useMemo(
    () => [
      {
        header: "Visit Date",
        cell: (r) => <span>{formatDDMMYYYY(r.visitDate)}</span>,
        className: "w-[140px]",
      },
      {
        header: "Doctor",
        cell: (r) => <span>{r.doctorName ?? "—"}</span>,
        className: "min-w-[220px]",
      },
      {
        header: "Consultation Fee (Net)",
        cell: (r) => <span>{formatINR(Number(r.netAmount || 0))}</span>,
        className: "w-[190px]",
      },
      {
        header: "Pay Status",
        cell: (r) => <span>{r.payStatus}</span>,
        className: "w-[120px]",
      },
      {
        header: "Mode",
        cell: (r) => <span>{r.paymentMode ?? "—"}</span>,
        className: "w-[120px]",
      },
      {
        header: "Status",
        cell: (r) => <span>{r.status}</span>,
        className: "w-[150px]",
      },
    ],
    []
  );

  return (
    <div className="min-h-[calc(100vh-120px)] bg-[#F2F2F2] p-6">
      <div className="rounded-2xl border bg-white shadow-sm">
        <div className="border-b px-5 py-4 flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-slate-900">
              Patient Summary (Reception)
            </div>
            <div className="text-sm text-slate-600 mt-0.5">
              Billing + visit history. Consultation editing is disabled for
              reception.
            </div>
          </div>

          <button
            type="button"
            className="rounded-lg border bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            onClick={() => router.push("/reception")}
          >
            Back to Reception Dashboard
          </button>
        </div>

        {loading ? (
          <div className="p-5 text-sm text-slate-600">Loading…</div>
        ) : err ? (
          <div className="p-5">
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {err}
            </div>
          </div>
        ) : (
          <>
            <div className="p-5">
              <div className="rounded-xl border bg-slate-50 p-4">
                <div className="text-sm font-semibold text-slate-900">
                  {patient?.name ?? "—"}
                </div>
                <div className="mt-1 text-sm text-slate-700">
                  Patient ID:{" "}
                  <span className="font-medium">
                    {patient?.patientCode ?? "—"}
                  </span>{" "}
                  • Phone:{" "}
                  <span className="font-medium">{patient?.phone ?? "—"}</span>{" "}
                  • Total Visits:{" "}
                  <span className="font-medium">{totalVisits}</span>
                  • Referred By:{" "}
                  <span className="font-medium">{patient?.referredBy ?? "—"}</span>
                </div>
              </div>
            </div>

            <div className="px-5 pb-5">
              <div className="text-sm font-semibold text-slate-900 mb-3">
                Visits
              </div>
              <div className="overflow-x-auto">
                <DataTable
                  dense
                  columns={columns}
                  rows={visits}
                  emptyText="No visits found."
                  getRowKey={(r) => r.visitId}
                  groupedActions={(row) => [
                    {
                      items: [
                        {
                          label: "Edit Visit Data",
                          onClick: () => openEditVisit(row.visitId),
                        },
                        {
                          label: "View Visit Summary (Billing)",
                          onClick: () => router.push(`/visits/${row.visitId}`),
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
                    {
                      separator: true,
                      items: [
                        {
                          label: "Reprint Consultation PDF",
                          onClick: () =>
                            window.open(
                              `/api/doctor/visits/${row.visitId}/consultation/pdf`,
                              "_blank",
                              "noopener,noreferrer"
                            ),
                        },
                      ],
                    },
                  ]}
                />
              </div>
            </div>
          </>
        )}
      </div>
      <RegisterPatientModal
        open={editOpen}
        onClose={closeEditVisit}
        title="Edit Visit Data"
      >
        {editVisitId ? (
          <VisitRegistrationForm
            mode="edit"
            visitId={editVisitId}
            showFetch={false}
            openBillOnCreate={false}
            onSuccess={() => {
              // after edit, refresh this page’s data
              closeEditVisit();
              // Option A: if you have a local reload() function, call it:
              void load();
              // Option B: if you're using router:
              // router.refresh();
            }}
          />
        ) : null}
      </RegisterPatientModal>

    </div>
  );
}
