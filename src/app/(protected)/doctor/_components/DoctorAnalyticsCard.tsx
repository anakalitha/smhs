// src/app/(protected)/doctor/_components/DoctorAnalyticsCard.tsx
"use client";

import React, { useEffect, useMemo } from "react";
import {
  BarChart,
  Bar,
  Cell,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useDoctorAnalytics } from "../_hooks/useDoctorAnalytics";

function formatINR(n: number) {
  return n.toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });
}

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
          {subtitle ? (
            <div className="text-xs text-slate-600 mt-0.5">{subtitle}</div>
          ) : null}
        </div>
        {right}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function KpiMini({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-white shadow-sm p-4">
      <div className="text-sm text-slate-600">{title}</div>
      <div className="mt-1 text-xl font-semibold text-slate-900">{value}</div>
    </div>
  );
}

const inputClass =
  "w-full rounded-lg border px-3 py-2 text-sm transition-all duration-200 " +
  "bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 " +
  "focus:outline-none focus:ring-2 focus:ring-slate-400/20 focus:border-slate-400";

export default function DoctorAnalyticsCard() {
  const {
    range,
    setStart,
    setEnd,
    data,
    loading,
    err,
    load,
    feeChartData,
    referralChartData,
  } = useDoctorAnalytics();

  // Load once on mount
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const referralColors = useMemo(
    () => ["#2563eb", "#16a34a", "#f59e0b", "#ef4444", "#8b5cf6"],
    []
  );

  return (
    <Card
      title="Analytics"
      subtitle="Counts and trends for your consultations."
      right={
        <button
          type="button"
          onClick={() => load()}
          className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-gray-50"
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      }
    >
      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <div>
          <div className="text-xs text-slate-600 mb-1">Start Date</div>
          <input
            className={inputClass}
            type="date"
            value={range.start}
            onChange={(e) => setStart(e.target.value)}
          />
        </div>

        <div>
          <div className="text-xs text-slate-600 mb-1">End Date</div>
          <input
            className={inputClass}
            type="date"
            value={range.end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </div>

        <div className="flex items-end">
          <button
            type="button"
            onClick={() => load({ start: range.start, end: range.end })}
            className="w-full rounded-lg border bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-gray-50"
            disabled={loading}
          >
            Apply
          </button>
        </div>
      </div>

      {err ? (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {err}
        </div>
      ) : null}

      {!data ? (
        <div className="text-sm text-slate-600">
          {loading ? "Loading..." : "No analytics yet."}
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <KpiMini
              title="Total Patients"
              value={String(data.totals.totalPatients)}
            />
            <KpiMini
              title="Repeat Patients"
              value={String(data.totals.repeatPatients)}
            />
            <KpiMini
              title="Scan Ordered"
              value={String(data.totals.scanOrdered)}
            />
            <KpiMini
              title="CTG Ordered"
              value={String(data.totals.ctgOrdered)}
            />
            <KpiMini
              title="PAP Ordered"
              value={String(data.totals.papOrdered)}
            />
          </div>

          {/* Charts */}
          <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Fee Breakdown */}
            <div className="rounded-xl border bg-white p-4">
              <div className="text-sm font-semibold text-slate-900">
                Fee Breakdown
              </div>
              <div className="text-xs text-slate-600 mt-0.5">
                Total amount per fee type
              </div>

              <div className="mt-3 h-[260px]">
                {feeChartData.every((x) => (x.amount ?? 0) === 0) ? (
                  <div className="text-sm text-slate-600">
                    No payments in this period.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={feeChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Bar
                        dataKey="amount"
                        fill="#2563eb"
                        radius={[6, 6, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className="mt-2 space-y-1">
                {feeChartData.map((f) => (
                  <div
                    key={f.name}
                    className="flex items-center justify-between text-sm"
                  >
                    <div className="text-slate-700">{f.name}</div>
                    <div className="font-medium text-slate-900">
                      {formatINR(Number(f.amount ?? 0))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Referrals */}
            <div className="rounded-xl border bg-white p-4">
              <div className="text-sm font-semibold text-slate-900">
                Top Referrals
              </div>
              <div className="text-xs text-slate-600 mt-0.5">
                Top 5 by visit count
              </div>

              <div className="mt-3 h-[260px]">
                {referralChartData.length === 0 ? (
                  <div className="text-sm text-slate-600">
                    No referrals in this period.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={referralChartData} margin={{ bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="name"
                        interval={0}
                        angle={-20}
                        textAnchor="end"
                        height={60}
                      />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                        {referralChartData.map((_, idx) => (
                          <Cell
                            key={`cell-${idx}`}
                            fill={referralColors[idx % referralColors.length]}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              {data.topReferrals.length > 0 ? (
                <div className="mt-2 space-y-1">
                  {data.topReferrals.slice(0, 5).map((r, idx) => (
                    <div
                      key={`${r.referralName}-${idx}`}
                      className="flex items-center justify-between text-sm"
                    >
                      <div className="flex items-center gap-2 text-slate-700">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full"
                          style={{
                            backgroundColor:
                              referralColors[idx % referralColors.length],
                          }}
                        />
                        <span>{r.referralName}</span>
                      </div>
                      <div className="font-medium text-slate-900">
                        {String(r.cnt)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          {/* Medicines */}
          <div className="mt-4 rounded-xl border bg-white p-4">
            <div className="text-sm font-semibold text-slate-900">
              Medicines Prescribed
            </div>
            <div className="text-xs text-slate-600 mt-0.5">
              Top medicines by frequency
            </div>

            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {data.medicineBreakdown.length === 0 ? (
                <div className="text-sm text-slate-600">
                  No prescriptions in this period.
                </div>
              ) : (
                data.medicineBreakdown.map((m, idx) => (
                  <div
                    key={`${m.medicineName}-${idx}`}
                    className="rounded-lg border bg-gray-50 px-3 py-2 text-sm flex items-center justify-between"
                  >
                    <div className="text-slate-900">{m.medicineName}</div>
                    <div className="font-medium text-slate-700">
                      {String(m.cnt)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
