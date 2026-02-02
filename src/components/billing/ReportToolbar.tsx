"use client";

export default function ReportToolbar({
  canExport,
  exportCsvUrl,
  exportXlsxUrl,
}: {
  canExport?: boolean;
  exportCsvUrl?: string;
  exportXlsxUrl?: string;
}) {
  return (
    <div className="p-4 border-b flex gap-2 print:hidden">
      <button
        type="button"
        onClick={() => window.close()}
        className="rounded-lg border px-4 py-2 text-sm font-medium"
      >
        Close
      </button>

      <button
        type="button"
        onClick={() => window.print()}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white"
      >
        Print / Save PDF
      </button>

      {canExport && exportCsvUrl && (
        <a
          href={exportCsvUrl}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white"
        >
          Export CSV
        </a>
      )}

      {canExport && exportXlsxUrl && (
        <a
          href={exportXlsxUrl}
          className="rounded-lg bg-green-700 px-4 py-2 text-sm font-medium text-white"
        >
          Export XLSX
        </a>
      )}
    </div>
  );
}
