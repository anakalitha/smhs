// src\app\(protected)\doctor\_components\TodayQueueCard.tsx
"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import DataTable, { Column } from "@/components/ui/DataTable";
import RegisterPatientModal from "@/components/reception/quick-opd/RegisterPatientModal";
import VisitRegistrationForm from "@/components/reception/quick-opd/VisitRegistrationForm";
import { DoctorQueueRow, useDoctorQueue } from "../_hooks/useDoctorQueue";

function Card({
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
    <div className="rounded-2xl border bg-white shadow-sm">
      <div className="border-b px-4 py-3 flex items-start justify-between gap-3 bg-white">
        <div>
          <div className="text-sm font-semibold text-slate-900">{title}</div>
          {subtitle && (
            <div className="text-xs text-slate-600 mt-0.5">{subtitle}</div>
          )}
        </div>
        {right}
      </div>

      {/* soft body tint */}
      <div className="p-4 bg-slate-50/40">{children}</div>
    </div>
  );
}

const inputClass =
  "w-full rounded-lg border px-3 py-2 text-sm transition-all duration-200 " +
  "bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 " +
  "focus:outline-none focus:ring-2 focus:ring-slate-400/20 focus:border-slate-400";

export default function TodayQueueCard() {
  const router = useRouter();
  const q = useDoctorQueue();
  const [walkInOpen, setWalkInOpen] = useState(false);

  const columns: Column<DoctorQueueRow>[] = useMemo(
    () => [
      {
        header: "Patient ID",
        cell: (r) => (
          <span className="font-medium text-slate-900">{r.patientCode}</span>
        ),
        className: "w-[160px]",
      },
      {
        header: "Name",
        cell: (r) => <span className="text-slate-900">{r.patientName}</span>,
        className: "min-w-[220px]",
      },
      {
        header: "Phone",
        cell: (r) => <span className="text-slate-700">{r.phone ?? "—"}</span>,
        className: "w-[160px]",
      },
    ],
    []
  );

  return (
    <>
      <Card
        title="Today's Queue"
        subtitle="Search and open patient details for consultation."
        right={
          <button
            type="button"
            onClick={() => setWalkInOpen(true)}
            className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100"
          >
            + Walk-in
          </button>
        }
      >
        {/* Search toolbar */}
        <div className="flex flex-col md:flex-row gap-2 mb-3">
          <input
            className={inputClass}
            placeholder="Search by patient id / name / phone"
            value={q.search}
            onChange={(e) => q.setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && q.applySearch()}
          />

          <button
            type="button"
            className="rounded-lg border bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            onClick={q.applySearch}
            disabled={q.loading}
          >
            Search
          </button>

          <button
            type="button"
            className="rounded-lg border bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            onClick={q.clearSearch}
            disabled={!q.search && !q.searchApplied}
          >
            Clear
          </button>
        </div>

        {q.err && (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {q.err}
          </div>
        )}

        <div className="overflow-x-auto">
          <DataTable
            dense
            columns={columns}
            rows={q.rows}
            emptyText={q.loading ? "Loading..." : "No patients for today."}
            getRowKey={(r) => r.visitId}
            groupedActions={(row) => [
              {
                items: [
                  {
                    label: "View Patient Details",
                    onClick: () => router.push(`/patients/${row.patientCode}`),
                  },
                ],
              },
            ]}
          />
        </div>

        {/* optional subtle “updated” line */}
        <div className="mt-3 text-xs text-slate-500">
          Tip: Press <b>Enter</b> to search quickly.
        </div>
      </Card>

      <RegisterPatientModal
        open={walkInOpen}
        onClose={() => setWalkInOpen(false)}
        title=""
      >
        <VisitRegistrationForm
          mode="create"
          showFetch={true}
          lockedDoctorId={q.doctorId ?? undefined}
          hideDoctorField={true}
          openBillOnCreate={false}
          onSuccess={async ({ visitId }) => {
            setWalkInOpen(false);
            await q.load(""); // refresh today's queue
            // Optional: route to consultation flow instead of patient summary
            // router.push(`/doctor/visits/${visitId}/consultation`);
          }}
        />
      </RegisterPatientModal>
    </>
  );
}
