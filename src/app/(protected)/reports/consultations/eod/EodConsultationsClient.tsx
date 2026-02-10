// src/app/(protected)/reports/consultations/eod/EodConsultationsClient.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";

type Row = {
  visitDate: string;
  patientCode: string;
  patientName: string;
  referredBy: string;
  phone: string;
  grossAmount: number;
  paidAmount: number;
  discountAmount: number;
  netAmount: number;
};

type ApiResponse = {
  ok: boolean;
  date: string;
  rows: Row[];
  totals: { gross: number; paid: number; discount: number; net: number };
  error?: string;
};

function todayYYYYMMDD() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatINR(n: number) {
  return n.toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });
}

export default function EodConsultationsClient() {
  const [date, setDate] = useState(todayYYYYMMDD());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [totals, setTotals] = useState<ApiResponse["totals"]>({
    gross: 0,
    paid: 0,
    discount: 0,
    net: 0,
  });

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/reports/consultations/eod?date=${encodeURIComponent(date)}`,
        {
          cache: "no-store",
        }
      );
      const data = (await res.json().catch(() => ({}))) as Partial<ApiResponse>;
      if (!res.ok || !data.ok) {
        setError(data?.error || "Failed to load report.");
        setRows([]);
        return;
      }
      setRows(data.rows || []);
      setTotals(data.totals || { gross: 0, paid: 0, discount: 0, net: 0 });
    } catch {
      setError("Network error.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exportXlsxHref = useMemo(
    () =>
      `/api/reports/consultations/eod/export.xlsx?date=${encodeURIComponent(
        date
      )}`,
    [date]
  );
  const exportPdfHref = useMemo(
    () =>
      `/api/reports/consultations/eod/export.pdf?date=${encodeURIComponent(
        date
      )}`,
    [date]
  );

  return (
    <div className="min-h-screen bg-[#F2F2F2] p-6">
      <div className="mx-auto max-w-6xl rounded-2xl border bg-white shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between border-b p-4">
          <div>
            <div className="text-lg font-semibold text-[#1f1f1f]">
              EOD Summary Report — Consultation
            </div>
            <div className="text-sm text-[#646179]">
              Shows Consultation charges & collections for selected date.
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              className="rounded-lg border px-3 py-2 text-sm bg-white"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />

            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {loading ? "Loading..." : "Refresh"}
            </button>

            <button
              type="button"
              onClick={() => window.close()}
              className="rounded-lg border border-slate-300 bg-gray-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900"
            >
              Close
            </button>

            <a
              href={exportXlsxHref}
              className="rounded-lg border border-slate-300 bg-gray-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900"
            >
              Export XLSX
            </a>

            <a
              href={exportPdfHref}
              className="rounded-lg border border-slate-300 bg-gray-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900"
            >
              Export PDF
            </a>
          </div>
        </div>

        <div className="p-4">
          {error && (
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="mb-4 rounded-xl border bg-slate-50 p-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div className="flex items-center justify-between md:block">
                <div className="text-slate-600">Gross</div>
                <div className="font-semibold text-slate-900">
                  {formatINR(totals.gross)}
                </div>
              </div>
              <div className="flex items-center justify-between md:block">
                <div className="text-slate-600">Paid</div>
                <div className="font-semibold text-slate-900">
                  {formatINR(totals.paid)}
                </div>
              </div>
              <div className="flex items-center justify-between md:block">
                <div className="text-slate-600">Discount</div>
                <div className="font-semibold text-slate-900">
                  {formatINR(totals.discount)}
                </div>
              </div>
              <div className="flex items-center justify-between md:block">
                <div className="text-slate-600">Net</div>
                <div className="font-semibold text-slate-900">
                  {formatINR(totals.net)}
                </div>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-[#646179]">
                <tr className="border-b">
                  <th className="px-3 py-2 text-left font-medium">
                    Visit Date
                  </th>
                  <th className="px-3 py-2 text-left font-medium">
                    Patient Id
                  </th>
                  <th className="px-3 py-2 text-left font-medium">Name</th>
                  <th className="px-3 py-2 text-left font-medium">
                    Referred By
                  </th>
                  <th className="px-3 py-2 text-left font-medium">Phone</th>
                  <th className="px-3 py-2 text-right font-medium">Gross</th>
                  <th className="px-3 py-2 text-right font-medium">Paid</th>
                  <th className="px-3 py-2 text-right font-medium">Discount</th>
                  <th className="px-3 py-2 text-right font-medium">Net</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => (
                  <tr
                    key={`${r.patientCode}-${idx}`}
                    className="border-b last:border-b-0"
                  >
                    <td className="px-3 py-2">{r.visitDate}</td>
                    <td className="px-3 py-2 font-medium text-[#1f1f1f]">
                      {r.patientCode}
                    </td>
                    <td className="px-3 py-2">{r.patientName}</td>
                    <td className="px-3 py-2 text-[#646179]">{r.referredBy}</td>
                    <td className="px-3 py-2 text-[#646179]">{r.phone}</td>
                    <td className="px-3 py-2 text-right">
                      {formatINR(r.grossAmount)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {formatINR(r.paidAmount)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {formatINR(r.discountAmount)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {formatINR(r.netAmount)}
                    </td>
                  </tr>
                ))}

                {rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-3 py-8 text-center text-[#646179]"
                    >
                      {loading
                        ? "Loading..."
                        : "No records found for selected date."}
                    </td>
                  </tr>
                )}
              </tbody>

              {rows.length > 0 && (
                <tfoot className="bg-slate-50">
                  <tr className="border-t">
                    <td
                      colSpan={5}
                      className="px-3 py-2 font-semibold text-right"
                    >
                      Totals
                    </td>
                    <td className="px-3 py-2 text-right font-semibold">
                      {formatINR(totals.gross)}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold">
                      {formatINR(totals.paid)}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold">
                      {formatINR(totals.discount)}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold">
                      {formatINR(totals.net)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          <div className="mt-3 text-xs text-[#646179]">
            Note: Export XLSX downloads a CSV formatted file with .xlsx
            extension (Excel opens it normally).
          </div>
        </div>
      </div>
    </div>
  );
}
