// src\app\(protected)\doctor\_components\PatientLookupCard.tsx
"use client";

import React, { useMemo } from "react";
import { useRouter } from "next/navigation";
import DataTable, { Column } from "@/components/ui/DataTable";
import { formatISTDate } from "@/lib/datetime";
import { useDoctorPatients, MyPatientRow } from "../_hooks/useDoctorPatients";

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
      <div className="border-b px-4 py-3 flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">{title}</div>
          {subtitle && (
            <div className="text-xs text-slate-600 mt-0.5">{subtitle}</div>
          )}
        </div>
        {right}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

const inputClass =
  "w-full rounded-lg border px-3 py-2 text-sm transition-all duration-200 " +
  "bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 " +
  "focus:outline-none focus:ring-2 focus:ring-slate-400/20 focus:border-slate-400";

export default function PatientLookupCard() {
  const router = useRouter();
  const p = useDoctorPatients(15);

  const columns: Column<MyPatientRow>[] = useMemo(
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
        cell: (r) => <span className="text-slate-900">{r.name}</span>,
        className: "min-w-[220px]",
      },
      {
        header: "Phone",
        cell: (r) => <span className="text-slate-700">{r.phone ?? "—"}</span>,
        className: "w-[160px]",
      },
      {
        header: "Last Visit",
        cell: (r) => (
          <span className="text-slate-600">{formatISTDate(r.lastVisit)}</span>
        ),
        className: "w-[180px]",
      },
      {
        header: "Visits",
        cell: (r) => (
          <span className="text-slate-900">{String(r.totalVisits ?? 0)}</span>
        ),
        className: "w-[90px]",
      },
    ],
    []
  );

  return (
    <Card
      title="Patient Lookup"
      subtitle="All patients who have consulted you."
      right={
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-600">Rows</span>
            <select
              className="rounded-lg border bg-white px-2 py-2 text-sm text-slate-700 hover:bg-slate-50"
              value={p.pageSize}
              onChange={(e) => p.changePageSize(Number(e.target.value))}
              disabled={p.loading}
            >
              {p.allowedPageSizes.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() =>
              p.load({
                search: p.searchApplied,
                page: p.page,
                pageSize: p.pageSize,
              })
            }
            className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50"
          >
            {p.loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      }
    >
      <div className="flex flex-col md:flex-row gap-2 mb-3">
        <input
          className={inputClass}
          placeholder="Search by patient id / name / phone"
          value={p.search}
          onChange={(e) => p.setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && p.applySearch()}
        />

        <button
          type="button"
          className="rounded-lg border bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          onClick={p.applySearch}
          disabled={p.loading}
        >
          Search
        </button>

        <button
          type="button"
          className="rounded-lg border bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          onClick={p.clearSearch}
          disabled={!p.search && !p.searchApplied}
        >
          Clear
        </button>
      </div>

      {p.err && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {p.err}
        </div>
      )}

      <div className="overflow-x-auto">
        <DataTable
          dense
          columns={columns}
          rows={p.rows}
          emptyText={p.loading ? "Loading..." : "No patients found."}
          getRowKey={(r) => r.patientDbId}
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

      <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="text-xs text-slate-600">
          {p.total === 0 ? (
            <>No records</>
          ) : (
            <>
              Showing page <b>{p.page}</b> of <b>{p.totalPages}</b> • Total{" "}
              <b>{p.total}</b>
              {p.searchApplied ? (
                <>
                  {" "}
                  (filtered by: <b>{p.searchApplied}</b>)
                </>
              ) : null}
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
            onClick={() => p.goToPage(p.page - 1)}
            disabled={p.loading || p.page <= 1}
          >
            ← Prev
          </button>

          <button
            type="button"
            className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
            onClick={() => p.goToPage(p.page + 1)}
            disabled={p.loading || p.page >= p.totalPages}
          >
            Next →
          </button>
        </div>
      </div>
    </Card>
  );
}
