"use client";

import React, { useMemo } from "react";
import { useRouter } from "next/navigation";
import DataTable, { Column } from "@/components/ui/DataTable";
import { formatISTDate } from "@/lib/datetime";
import { ReportRow, useDoctorReports } from "../_hooks/useDoctorReports";

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

async function exportReportsXlsx(args: {
  rowsToExport: ReportRow[];
  start: string;
  end: string;
}) {
  const { rowsToExport, start, end } = args;
  const xlsx = await import("xlsx");

  const wsData = rowsToExport.map((r) => ({
    "Visit Date": formatISTDate(r.visitDate),
    "Patient ID": r.patientId,
    Name: r.name,
    "Referred By": r.referredBy,
    Diagnosis: r.diagnosis || "",
    Investigation: r.investigation || "",
    "Scan Details": r.scanDetails || "",
    "PAP Smear Details": r.papSmearDetails || "",
    "CTG Details": r.ctgDetails || "",
    Treatment: r.treatment || "",
    Remarks: r.remarks || "",
  }));

  const wb = xlsx.utils.book_new();
  const ws = xlsx.utils.json_to_sheet(wsData);
  xlsx.utils.book_append_sheet(wb, ws, "Report");
  xlsx.writeFile(wb, `doctor-report-${start}-to-${end}.xlsx`, {
    compression: true,
  });
}

async function exportReportsPdf(args: {
  rowsToExport: ReportRow[];
  start: string;
  end: string;
}) {
  const { rowsToExport, start, end } = args;

  const jsPDFmod = await import("jspdf");
  const autoTable = await import("jspdf-autotable");

  const doc = new jsPDFmod.default({ orientation: "landscape" });
  doc.setFontSize(12);
  doc.text(`Doctor Report: ${start} to ${end}`, 14, 12);

  const head = [
    [
      "Visit Date",
      "Patient ID",
      "Name",
      "Referred By",
      "Diagnosis",
      "Investigation",
      "Scan",
      "PAP",
      "CTG",
      "Treatment",
      "Remarks",
    ],
  ];

  const body = rowsToExport.map((r) => [
    formatISTDate(r.visitDate),
    r.patientId,
    r.name,
    r.referredBy,
    r.diagnosis || "—",
    r.investigation || "—",
    r.scanDetails || "—",
    r.papSmearDetails || "—",
    r.ctgDetails || "—",
    r.treatment || "—",
    r.remarks || "—",
  ]);

  autoTable.default(doc, {
    head,
    body,
    startY: 18,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 26 },
      1: { cellWidth: 26 },
      2: { cellWidth: 35 },
      3: { cellWidth: 28 },
    },
  });

  doc.save(`doctor-report-${start}-to-${end}.pdf`);
}

export default function ReportsSection() {
  const router = useRouter();
  const r = useDoctorReports(20);

  const columns: Column<ReportRow>[] = useMemo(
    () => [
      {
        header: "Visit Date",
        cell: (row) => (
          <span className="text-slate-600">{formatISTDate(row.visitDate)}</span>
        ),
        className: "w-[180px]",
      },
      {
        header: "Patient ID",
        cell: (row) => (
          <span className="font-medium text-slate-900">{row.patientId}</span>
        ),
        className: "w-[160px]",
      },
      {
        header: "Name",
        cell: (row) => <span className="text-slate-900">{row.name}</span>,
        className: "min-w-[200px]",
      },
      {
        header: "Referred By",
        cell: (row) => <span className="text-slate-600">{row.referredBy}</span>,
        className: "min-w-[140px]",
      },
      {
        header: "Diagnosis",
        cell: (row) => (
          <span className="text-slate-900">{row.diagnosis || "—"}</span>
        ),
        className: "min-w-[220px]",
      },
      {
        header: "Investigation",
        cell: (row) => (
          <span className="text-slate-900">{row.investigation || "—"}</span>
        ),
        className: "min-w-[220px]",
      },
      {
        header: "Scan",
        cell: (row) => (
          <span className="text-slate-900">{row.scanDetails || "—"}</span>
        ),
        className: "min-w-[200px]",
      },
      {
        header: "PAP",
        cell: (row) => (
          <span className="text-slate-900">{row.papSmearDetails || "—"}</span>
        ),
        className: "min-w-[200px]",
      },
      {
        header: "CTG",
        cell: (row) => (
          <span className="text-slate-900">{row.ctgDetails || "—"}</span>
        ),
        className: "min-w-[200px]",
      },
      {
        header: "Treatment",
        cell: (row) => (
          <span className="text-slate-900">{row.treatment || "—"}</span>
        ),
        className: "min-w-[240px]",
      },
      {
        header: "Remarks",
        cell: (row) => (
          <span className="text-slate-900">{row.remarks || "—"}</span>
        ),
        className: "min-w-[240px]",
      },
    ],
    []
  );

  return (
    <Card
      title="Reports"
      subtitle="Filter and view detailed clinical report rows."
      right={
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={async () => {
              try {
                await exportReportsXlsx({
                  rowsToExport: r.filtered,
                  start: r.start,
                  end: r.end,
                });
              } catch (e) {
                alert("XLSX export requires packages. Run: npm i xlsx");
                console.error(e);
              }
            }}
            className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
            disabled={r.filtered.length === 0}
          >
            Export XLSX
          </button>

          <button
            type="button"
            onClick={async () => {
              try {
                await exportReportsPdf({
                  rowsToExport: r.filtered,
                  start: r.start,
                  end: r.end,
                });
              } catch (e) {
                alert(
                  "PDF export requires packages. Run: npm i jspdf jspdf-autotable"
                );
                console.error(e);
              }
            }}
            className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
            disabled={r.filtered.length === 0}
          >
            Export PDF
          </button>
        </div>
      }
    >
      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
        <div>
          <div className="text-xs text-slate-600 mb-1">Start Date</div>
          <input
            className={inputClass}
            type="date"
            value={r.start}
            onChange={(e) => r.setStart(e.target.value)}
          />
        </div>
        <div>
          <div className="text-xs text-slate-600 mb-1">End Date</div>
          <input
            className={inputClass}
            type="date"
            value={r.end}
            onChange={(e) => r.setEnd(e.target.value)}
          />
        </div>
        <div>
          <div className="text-xs text-slate-600 mb-1">Referred By (ID)</div>
          <input
            className={inputClass}
            placeholder="Optional referral ID"
            value={r.referralId}
            onChange={(e) => r.setReferralId(e.target.value)}
          />
        </div>
        <div className="flex items-end">
          <button
            type="button"
            onClick={r.runReport}
            className="w-full rounded-lg border bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            disabled={r.loading}
          >
            {r.loading ? "Running..." : "Run Report"}
          </button>
        </div>
      </div>

      {/* Search inside results */}
      <div className="flex flex-col md:flex-row gap-2 mb-3">
        <input
          className={inputClass}
          placeholder="Search inside report results (patient id/name/diagnosis/orders/treatment/remarks...)"
          value={r.search}
          onChange={(e) => r.setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && r.applySearch()}
        />

        <button
          type="button"
          className="rounded-lg border bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          onClick={r.applySearch}
          disabled={r.loading}
        >
          Search
        </button>

        <button
          type="button"
          className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
          onClick={r.clearSearch}
          disabled={!r.search && !r.searchApplied}
        >
          Clear
        </button>
      </div>

      {r.err && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {r.err}
        </div>
      )}

      <div className="overflow-x-auto">
        <DataTable
          dense
          columns={columns}
          rows={r.pageRows}
          emptyText={r.loading ? "Loading..." : "No rows."}
          getRowKey={(row) => `${row.patientId}-${row.visitDate}-${row.name}`}
          groupedActions={(row) => [
            {
              items: [
                {
                  label: "View Patient Summary",
                  onClick: () => router.push(`/patients/${row.patientId}`),
                },
              ],
            },
          ]}
        />
      </div>

      {/* Pagination */}
      <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="text-xs text-slate-600">
          {r.total === 0 ? (
            <>No records</>
          ) : (
            <>
              Showing page <b>{r.page}</b> of <b>{r.totalPages}</b> • Total{" "}
              <b>{r.total}</b>
              {r.searchApplied ? (
                <>
                  {" "}
                  (filtered by: <b>{r.searchApplied}</b>)
                </>
              ) : null}
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
            onClick={() => r.goToPage(r.page - 1)}
            disabled={r.page <= 1}
          >
            ← Prev
          </button>

          <button
            type="button"
            className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
            onClick={() => r.goToPage(r.page + 1)}
            disabled={r.page >= r.totalPages}
          >
            Next →
          </button>
        </div>
      </div>

      <div className="mt-3 text-xs text-slate-600">
        Note: Export buttons export the <b>filtered</b> dataset (not just the
        current page).
      </div>
    </Card>
  );
}
