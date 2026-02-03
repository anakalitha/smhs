"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import DataTable, { Column } from "@/components/ui/DataTable";

type QueueStatus = "WAITING" | "NEXT" | "IN_ROOM" | "DONE";

type DoctorQueueRow = {
  visitId: number;
  visitDate: string;
  status: QueueStatus;
  tokenNo: number | null;

  patientDbId: number;
  patientCode: string;
  patientName: string;
  phone: string | null;
};

function Badge({
  children,
  tone = "gray",
}: {
  children: React.ReactNode;
  tone?: "gray" | "green" | "yellow" | "blue";
}) {
  const cls =
    tone === "green"
      ? "bg-green-50 text-green-700 border-green-200"
      : tone === "yellow"
      ? "bg-yellow-50 text-yellow-700 border-yellow-200"
      : tone === "blue"
      ? "bg-blue-50 text-blue-700 border-blue-200"
      : "bg-gray-50 text-gray-700 border-gray-200";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${cls}`}
    >
      {children}
    </span>
  );
}

export default function DoctorDashboardPage() {
  const router = useRouter();
  const [rows, setRows] = useState<DoctorQueueRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  type BadgeTone = "gray" | "green" | "yellow" | "blue";

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/doctor/dashboard", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data?.error || "Failed to load doctor dashboard.");
        setRows([]);
        return;
      }
      setRows(data.todays || []);
    } catch {
      setErr("Network error.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const columns: Column<DoctorQueueRow>[] = useMemo(
    () => [
      {
        header: "Token",
        cell: (r) => (
          <span className="font-medium text-slate-900">{r.tokenNo ?? "—"}</span>
        ),
        className: "w-[90px]",
      },
      {
        header: "Patient ID",
        cell: (r) => (
          <span className="font-medium text-slate-900">{r.patientCode}</span>
        ),
        className: "w-[150px]",
      },
      {
        header: "Name",
        cell: (r) => <span className="text-slate-900">{r.patientName}</span>,
        className: "min-w-[180px]",
      },
      {
        header: "Phone",
        cell: (r) => <span className="text-slate-600">{r.phone ?? "—"}</span>,
        className: "w-[140px]",
      },
      {
        header: "Visit Date",
        cell: (r) => <span className="text-slate-600">{r.visitDate}</span>,
        className: "w-[120px]",
      },
      {
        header: "Status",
        cell: (r) => {
          const tone: BadgeTone =
            r.status === "DONE"
              ? "green"
              : r.status === "IN_ROOM"
              ? "blue"
              : r.status === "NEXT"
              ? "yellow"
              : "gray";

          return <Badge tone={tone}>{r.status}</Badge>;
        },
        className: "w-[120px]",
      },
    ],
    []
  );

  return (
    <div className="min-h-[calc(100vh-120px)] bg-[#F2F2F2]">
      <div className="p-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              Doctor Dashboard
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Today’s patients and quick actions.
            </p>
          </div>

          <button
            type="button"
            onClick={load}
            className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-gray-50"
          >
            {loading ? "Refreshing…" : "🔄 Refresh"}
          </button>
        </div>

        <div className="mt-5 rounded-2xl border bg-white shadow-sm">
          <div className="border-b px-4 py-3">
            <div className="text-sm font-semibold text-slate-900">
              Today’s Queue
            </div>
            <div className="text-xs text-slate-600 mt-0.5">
              Open consultation or view patient summary.
            </div>
          </div>

          <div className="p-4 overflow-x-auto">
            {err && (
              <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {err}
              </div>
            )}

            <DataTable
              dense
              columns={columns}
              rows={rows}
              emptyText={loading ? "Loading..." : "No patients for today."}
              getRowKey={(r) => r.visitId}
              groupedActions={(row) => [
                {
                  items: [
                    {
                      label: "Open Consultation",
                      onClick: () =>
                        router.push(
                          `/doctor/visits/${row.visitId}/consultation`
                        ),
                    },
                    {
                      label: "View Patient Summary",
                      onClick: () =>
                        router.push(`/patients/${row.patientCode}`),
                    },
                  ],
                },
              ]}
            />

            <div className="mt-3 text-xs text-slate-600">
              Tip: “Open Consultation” is where the doctor enters diagnosis,
              orders, prescription, and remarks.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
