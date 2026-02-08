// src/components/patients/PatientLookupTableCard.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import DataTable, { Column } from "@/components/ui/DataTable";

export type PatientRow = {
  id: string;
  name: string;
  phone: string;
  lastVisit: string;
  doctor?: string;
};

type SortDir = "asc" | "desc";
type SortBy =
  | "patientId"
  | "name"
  | "phone"
  | "lastVisit"
  | "doctor"
  | "createdAt";

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

export default function PatientLookupTableCard({
  title = "Patient Lookup",
  subtitle = "Search patients for billing, reports, consultation history, and follow-ups",
  columns,
  onViewPatient,
  apiUrl = "/api/reception/patients",
  defaultPageSize = 10,
  refreshKey = 0,
}: {
  title?: string;
  subtitle?: string;

  columns?: Column<PatientRow>[];

  onViewPatient: (patientId: string) => void;

  /** Reuse in other dashboards by passing different API endpoint if needed */
  apiUrl?: string;

  defaultPageSize?: number;

  /** Parent can bump this number to force a reload without a full page refresh */
  refreshKey?: number;
}) {
  const patientColumns: Column<PatientRow>[] = useMemo(() => {
    return (
      columns ?? [
        {
          header: "Patient Id",
          cell: (p) => (
            <span className="font-medium text-[#1f1f1f]">{p.id}</span>
          ),
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
          cell: (p) => (
            <span className="text-[#646179]">{p.doctor ?? "—"}</span>
          ),
        },
      ]
    );
  }, [columns]);

  const [rows, setRows] = useState<PatientRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // query state
  const [searchText, setSearchText] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const DEFAULT_SORT_BY: SortBy = "createdAt";
  const DEFAULT_SORT_DIR: SortDir = "desc";

  // optional sort (server-side)
  const [sortBy, setSortBy] = useState<SortBy>(DEFAULT_SORT_BY);
  const [sortDir, setSortDir] = useState<SortDir>(DEFAULT_SORT_DIR);

  // server metadata
  const [totalRows, setTotalRows] = useState(0);

  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));

  function resetSort() {
    setSortBy(DEFAULT_SORT_BY);
    setSortDir(DEFAULT_SORT_DIR);
    setPage(1);
    loadPatients({
      page: 1,
      sortBy: DEFAULT_SORT_BY,
      sortDir: DEFAULT_SORT_DIR,
    });
  }

  async function loadPatients(args?: {
    search?: string;
    page?: number;
    pageSize?: number;
    sortBy?: SortBy;
    sortDir?: SortDir;
  }) {
    const nextSearch = args?.search ?? searchText;
    const nextPage = args?.page ?? page;
    const nextPageSize = args?.pageSize ?? pageSize;
    const nextSortBy = args?.sortBy ?? sortBy;
    const nextSortDir = args?.sortDir ?? sortDir;

    setLoading(true);
    setError(null);

    try {
      const q = new URLSearchParams({
        search: nextSearch,
        page: String(nextPage),
        pageSize: String(nextPageSize),
        sortBy: nextSortBy,
        sortDir: nextSortDir,
      });

      const res = await fetch(`${apiUrl}?${q.toString()}`, {
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data?.error || "Failed to load patients.");
        setRows([]);
        setTotalRows(0);
        return;
      }

      setRows(data.rows || []);
      setTotalRows(Number(data.total ?? 0));
    } catch {
      setError("Network error while loading patients.");
      setRows([]);
      setTotalRows(0);
    } finally {
      setLoading(false);
    }
  }

  // initial load + whenever page/pageSize/sort changes OR refreshKey changes
  useEffect(() => {
    // If parent bumped refreshKey, go back to page 1 so the new record is visible immediately.
    if (refreshKey !== 0) setPage(1);
    loadPatients({ page: refreshKey !== 0 ? 1 : page });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, sortBy, sortDir, refreshKey]);

  function onSearch() {
    setPage(1);
    loadPatients({ search: searchText, page: 1 });
  }

  function toggleSort(next: SortBy) {
    if (sortBy === next) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortBy(next);
    setSortDir(next === "lastVisit" || next === "createdAt" ? "desc" : "asc");
  }

  return (
    <div className="mt-8 rounded-2xl border bg-white shadow-sm">
      <div className="p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between border-b">
        <div>
          <h2 className="text-lg font-semibold text-[#1f1f1f]">{title}</h2>
          <p className="text-sm text-[#646179]">{subtitle}</p>
        </div>

        <div className="flex flex-col md:flex-row gap-2 w-full md:w-auto">
          <div className="flex gap-2 w-full md:w-[420px]">
            <input
              className={inputClass}
              placeholder="Search by name / phone / patient id"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSearch();
              }}
            />
            <button
              type="button"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              onClick={onSearch}
              disabled={loading}
            >
              {loading ? "Searching..." : "Search"}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-[#646179]">Rows</span>
            <select
              className="rounded-lg border px-2.5 py-2 text-sm bg-white"
              value={pageSize}
              onChange={(e) => {
                const next = Number(e.target.value);
                setPageSize(next);
                setPage(1);
              }}
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={15}>15</option>
              <option value={25}>25</option>
            </select>
          </div>
        </div>
      </div>

      <div className="px-4 pt-3 flex flex-wrap items-center gap-2 text-xs text-[#646179]">
        <span className="font-medium">Sort:</span>

        <button
          className="rounded-lg border px-2 py-1 hover:bg-gray-50"
          onClick={() => toggleSort("lastVisit")}
        >
          Last Visit{" "}
          {sortBy === "lastVisit" ? (sortDir === "asc" ? "↑" : "↓") : ""}
        </button>

        <button
          className="rounded-lg border px-2 py-1 hover:bg-gray-50"
          onClick={() => toggleSort("name")}
        >
          Name {sortBy === "name" ? (sortDir === "asc" ? "↑" : "↓") : ""}
        </button>

        <button
          className="rounded-lg border px-2 py-1 hover:bg-gray-50"
          onClick={() => toggleSort("patientId")}
        >
          Patient ID{" "}
          {sortBy === "patientId" ? (sortDir === "asc" ? "↑" : "↓") : ""}
        </button>

        <button
          className="rounded-lg border px-2 py-1 hover:bg-gray-50"
          onClick={() => toggleSort("phone")}
        >
          Phone {sortBy === "phone" ? (sortDir === "asc" ? "↑" : "↓") : ""}
        </button>

        <button
          className="rounded-lg border px-2 py-1 hover:bg-gray-50"
          onClick={() => toggleSort("createdAt")}
        >
          Latest {sortBy === "createdAt" ? (sortDir === "asc" ? "↑" : "↓") : ""}
        </button>

        <button
          type="button"
          onClick={resetSort}
          className="rounded-lg border px-2 py-1 hover:bg-gray-50"
          disabled={
            loading ||
            (sortBy === DEFAULT_SORT_BY && sortDir === DEFAULT_SORT_DIR)
          }
        >
          Reset Sort
        </button>
      </div>

      <div className="p-4 overflow-x-auto">
        {error && (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-sm text-red-700">
            {error}
          </div>
        )}

        <DataTable
          columns={patientColumns}
          rows={rows}
          emptyText={loading ? "Loading..." : "No patients found."}
          getRowKey={(r) => r.id}
          groupedActions={(row) => [
            {
              items: [
                {
                  label: "View Patient Data",
                  onClick: () => onViewPatient(row.id),
                },
              ],
            },
          ]}
        />

        <div className="mt-4 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          <div className="text-xs text-[#646179]">
            Showing {totalRows === 0 ? 0 : (page - 1) * pageSize + 1}–
            {Math.min(page * pageSize, totalRows)} of {totalRows}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-60"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
            >
              ◀ Prev
            </button>
            <div className="text-sm text-[#1f1f1f]">
              Page <span className="font-medium">{page}</span> / {totalPages}
            </div>
            <button
              type="button"
              className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-60"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
            >
              Next ▶
            </button>
          </div>
        </div>

        <div className="mt-3 text-xs text-[#646179]">
          Tip: Use actions to open the patient summary.
        </div>
      </div>
    </div>
  );
}
