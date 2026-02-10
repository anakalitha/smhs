"use client";

import React, { useMemo, useState } from "react";

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

const inputClass =
  "w-full rounded-lg border px-3 py-2 text-sm transition-all duration-200 " +
  "bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 " +
  "focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500";

function Card({
  title,
  subtitle,
  children,
  right,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  right?: React.ReactNode;
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

function openNewTab(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

export default function ReceptionReportCards() {
  const today = useMemo(() => ymd(new Date()), []);
  const [eodDate, setEodDate] = useState(today);

  const [from, setFrom] = useState("2024-01-01");
  const [to, setTo] = useState(today);

  return (
    <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-5">
      {/* EOD */}
      <Card
        title="EOD Consultations"
        subtitle="End-of-day consultations summary for selected date."
        right={
          <button
            type="button"
            className="rounded-lg border bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            onClick={() =>
              openNewTab(
                `/reports/consultations/eod?date=${encodeURIComponent(eodDate)}`
              )
            }
          >
            Open
          </button>
        }
      >
        <div className="space-y-3">
          <div>
            <div className="text-xs text-slate-600 mb-1">Date</div>
            <input
              className={inputClass}
              type="date"
              value={eodDate}
              onChange={(e) => setEodDate(e.target.value)}
            />
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              onClick={() =>
                openNewTab(
                  `/reports/consultations/eod?date=${encodeURIComponent(
                    eodDate
                  )}`
                )
              }
            >
              View
            </button>

            <button
              type="button"
              className="flex-1 rounded-lg border bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              onClick={() =>
                openNewTab(
                  `/api/reports/consultations/eod/export-xlsx?date=${encodeURIComponent(
                    eodDate
                  )}`
                )
              }
            >
              Export XLSX
            </button>
          </div>

          <div className="text-xs text-slate-600">
            Tip: Use this for daily closure / cash reconciliation.
          </div>
        </div>
      </Card>

      {/* Period */}
      <Card
        title="Period Consultations"
        subtitle="Consultations summary between two dates."
        right={
          <button
            type="button"
            className="rounded-lg border bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            onClick={() =>
              openNewTab(
                `/reports/consultations/period?start=${encodeURIComponent(
                  from
                )}&end=${encodeURIComponent(to)}`
              )
            }
          >
            Open
          </button>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-slate-600 mb-1">From</div>
              <input
                className={inputClass}
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div>
              <div className="text-xs text-slate-600 mb-1">To</div>
              <input
                className={inputClass}
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              onClick={() =>
                openNewTab(
                  `/reports/consultations/period?start=${encodeURIComponent(
                    from
                  )}&end=${encodeURIComponent(to)}`
                )
              }
            >
              View
            </button>

            <button
              type="button"
              className="flex-1 rounded-lg border bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              onClick={() =>
                openNewTab(
                  `/api/reports/consultations/period/export-xlsx?start=${encodeURIComponent(
                    from
                  )}&end=${encodeURIComponent(to)}`
                )
              }
            >
              Export XLSX
            </button>
          </div>

          <div className="text-xs text-slate-600">
            Tip: Use this for monthly/weekly review.
          </div>
        </div>
      </Card>

      {/* Pending */}
      <Card
        title="Pending Consultation Fees"
        subtitle="All partially/unpaid visits (locked report)."
        right={
          <button
            type="button"
            className="rounded-lg border bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            onClick={() => openNewTab("/reports/consultations/pending")}
          >
            Open
          </button>
        }
      >
        <div className="space-y-3">
          <div className="text-sm text-slate-700">
            View pending list and use actions to <b>Collect</b> or <b>Refund</b>
            .
          </div>

          <button
            type="button"
            className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            onClick={() => openNewTab("/reports/consultations/pending")}
          >
            Go to Pending Report
          </button>

          <div className="text-xs text-slate-600">
            Note: This is the “ledger-safe” source of truth.
          </div>
        </div>
      </Card>
    </div>
  );
}
