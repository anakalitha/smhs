// src\app\reports\consultations\pending\page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import CollectPaymentModal from "@/components/reception/CollectPaymentModal";
import RefundPaymentModal from "@/components/reception/RefundPaymentModal";

type PendingRow = {
  visit_id: number;
  visit_date: string;
  age_days: number;
  patient_code: string;
  patient_name: string;
  phone: string | null;
  doctor_name: string;
  referred_by: string | null;
  service_id: number;
  service_name: string;
  charged: number;
  paid: number;
  pending: number;
};

type Totals = {
  total_charged: number;
  total_paid: number;
  total_pending: number;
  pending_items: number;
};

type Bucket = {
  age_bucket: string;
  items_count: number;
  pending_amount: number;
};

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

function formatINR(n: number) {
  return n.toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });
}

const inputClass =
  "w-full rounded-lg border px-3 py-2 text-sm transition-all duration-200 " +
  "bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 " +
  "focus:outline-none focus:ring-2 focus:ring-slate-400/20 focus:border-slate-400";

function Card({
  title,
  right,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border bg-white shadow-sm">
      <div className="border-b px-4 py-3 flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-slate-900">{title}</div>
        {right}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

export default function PendingConsultationsPage() {
  const defStart = useMemo(() => "2024-01-01", []);
  const defEnd = useMemo(() => ymd(new Date()), []);

  const [start, setStart] = useState(defStart);
  const [end, setEnd] = useState(defEnd);
  const [pendingType, setPendingType] = useState<"ALL" | "UNPAID" | "PARTIAL">(
    "ALL"
  );
  const [ageBucket, setAgeBucket] = useState<
    "ALL" | "TODAY" | "GT_1" | "GT_7" | "GT_30"
  >("ALL");

  // Optional later: doctorId/referralId dropdowns
  const doctorId = "";
  const referralId = "";

  const [rows, setRows] = useState<PendingRow[]>([]);
  const [totals, setTotals] = useState<Totals>({
    total_charged: 0,
    total_paid: 0,
    total_pending: 0,
    pending_items: 0,
  });
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [collectOpen, setCollectOpen] = useState(false);
  const [collectVisit, setCollectVisit] = useState<{
    visitId: number;
    serviceId: number;
    patientName: string;
    pendingAmount: number;
  } | null>(null);

  const [refundOpen, setRefundOpen] = useState(false);
  const [refundVisit, setRefundVisit] = useState<{
    visitId: number;
    serviceId: number;
    patientName: string;
    netPaidAmount: number;
  } | null>(null);

  const query = useMemo(() => {
    const q = new URLSearchParams({
      start,
      end,
      asOf: end,
      pendingType,
      ageBucket,
    });
    if (doctorId) q.set("doctorId", doctorId);
    if (referralId) q.set("referralId", referralId);
    return q;
  }, [start, end, pendingType, ageBucket, doctorId, referralId]);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/reports/consultations/pending?${query}`, {
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data?.error || "Failed to load report.");
        setRows([]);
        setBuckets([]);
        return;
      }
      setRows(data.rows || []);
      setTotals(data.totals || totals);
      setBuckets(data.buckets || []);
    } catch {
      setErr("Network error.");
      setRows([]);
      setBuckets([]);
    } finally {
      setLoading(false);
    }
  }

  function exportFile(kind: "pdf" | "xlsx") {
    window.open(
      `/api/reports/consultations/pending/export/${kind}?${query.toString()}`,
      "_blank",
      "noopener,noreferrer"
    );
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-[calc(100vh-120px)] bg-[#F2F2F2] p-6">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <div className="text-2xl font-semibold tracking-tight text-[#1f1f1f]">
            Pending Fees
          </div>
          <div className="text-sm mt-1 text-[#646179]">
            Service-wise pending list with totals and ageing buckets.
          </div>
        </div>

        <div className="flex gap-2">
          <button
            className="rounded-lg border bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            disabled={loading}
            onClick={() => exportFile("xlsx")}
          >
            Export XLSX
          </button>
          <button
            className="rounded-lg border bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            disabled={loading}
            onClick={() => exportFile("pdf")}
          >
            Export PDF
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <Card
          title="Filters"
          right={
            <button
              className="text-sm text-slate-600 hover:text-slate-900"
              onClick={load}
              disabled={loading}
            >
              {loading ? "Loading..." : "Run"}
            </button>
          }
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-slate-600 mb-1">Start Date</div>
              <input
                className={inputClass}
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </div>
            <div>
              <div className="text-xs text-slate-600 mb-1">End Date</div>
              <input
                className={inputClass}
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </div>

            <div>
              <div className="text-xs text-slate-600 mb-1">Pending Type</div>
              <select
                className={inputClass}
                value={pendingType}
                onChange={(e) =>
                  setPendingType(e.target.value as typeof pendingType)
                }
              >
                <option value="ALL">All Pending</option>
                <option value="UNPAID">Unpaid Only</option>
                <option value="PARTIAL">Partial Only</option>
              </select>
            </div>

            <div>
              <div className="text-xs text-slate-600 mb-1">Ageing</div>
              <select
                className={inputClass}
                value={ageBucket}
                onChange={(e) =>
                  setAgeBucket(e.target.value as typeof ageBucket)
                }
              >
                <option value="ALL">All</option>
                <option value="TODAY">Today</option>
                <option value="GT_1">&gt; 1 day</option>
                <option value="GT_7">&gt; 7 days</option>
                <option value="GT_30">&gt; 30 days</option>
              </select>
            </div>
          </div>

          {err ? <div className="mt-3 text-sm text-red-700">{err}</div> : null}
        </Card>

        <Card title="Totals">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="text-slate-600">Pending Items</div>
            <div className="text-right font-semibold">
              {totals.pending_items}
            </div>

            <div className="text-slate-600">Charged</div>
            <div className="text-right font-semibold">
              {formatINR(Number(totals.total_charged || 0))}
            </div>

            <div className="text-slate-600">Paid (Net)</div>
            <div className="text-right font-semibold">
              {formatINR(Number(totals.total_paid || 0))}
            </div>

            <div className="text-slate-600">Pending</div>
            <div className="text-right font-semibold">
              {formatINR(Number(totals.total_pending || 0))}
            </div>
          </div>
        </Card>

        <Card title="Age Buckets">
          {buckets.length === 0 ? (
            <div className="text-sm text-slate-600">No pending data.</div>
          ) : (
            <div className="space-y-2 text-sm">
              {buckets.map((b) => (
                <div
                  key={b.age_bucket}
                  className="flex items-center justify-between"
                >
                  <div className="text-slate-700">
                    {b.age_bucket}{" "}
                    <span className="text-slate-500">({b.items_count})</span>
                  </div>
                  <div className="font-semibold">
                    {formatINR(Number(b.pending_amount || 0))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card title="Pending List">
        <div className="overflow-auto">
          <table className="min-w-[1160px] w-full text-sm">
            <thead>
              <tr className="text-left text-slate-600 border-b">
                <th className="py-2 pr-3">Visit Date</th>
                <th className="py-2 pr-3">Age</th>
                <th className="py-2 pr-3">Patient</th>
                <th className="py-2 pr-3">Doctor</th>
                <th className="py-2 pr-3">Service</th>
                <th className="py-2 pr-3 text-right">Charged</th>
                <th className="py-2 pr-3 text-right">Paid</th>
                <th className="py-2 pr-3 text-right">Pending</th>
                <th className="py-2 pr-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={`${r.visit_id}-${r.service_id}`}
                  className="border-b last:border-b-0"
                >
                  <td className="py-2 pr-3">{r.visit_date}</td>
                  <td className="py-2 pr-3">{r.age_days}d</td>
                  <td className="py-2 pr-3">
                    <div className="font-medium text-slate-900">
                      {r.patient_name}
                    </div>
                    <div className="text-xs text-slate-500">
                      {r.patient_code}
                      {r.phone ? ` • ${r.phone}` : ""}
                    </div>
                  </td>
                  <td className="py-2 pr-3">
                    <div className="text-slate-900">{r.doctor_name}</div>
                    <div className="text-xs text-slate-500">
                      {r.referred_by || "-"}
                    </div>
                  </td>
                  <td className="py-2 pr-3">{r.service_name}</td>
                  <td className="py-2 pr-3 text-right">
                    {formatINR(Number(r.charged || 0))}
                  </td>
                  <td className="py-2 pr-3 text-right">
                    {formatINR(Number(r.paid || 0))}
                  </td>
                  <td className="py-2 pr-3 text-right font-semibold">
                    {formatINR(Number(r.pending || 0))}
                  </td>
                  <td className="py-2 pr-3 text-right whitespace-nowrap">
                    <button
                      className="text-sm font-medium text-blue-600 hover:text-blue-800"
                      onClick={() => {
                        setCollectVisit({
                          visitId: r.visit_id,
                          serviceId: r.service_id,
                          patientName: r.patient_name,
                          pendingAmount: Number(r.pending),
                        });
                        setCollectOpen(true);
                      }}
                    >
                      Collect
                    </button>

                    {Number(r.paid) > 0 ? (
                      <>
                        <span className="mx-2 text-slate-300">|</span>
                        <button
                          className="text-sm font-medium text-rose-600 hover:text-rose-800"
                          onClick={() => {
                            setRefundVisit({
                              visitId: r.visit_id,
                              serviceId: r.service_id,
                              patientName: r.patient_name,
                              netPaidAmount: Number(r.paid),
                            });
                            setRefundOpen(true);
                          }}
                        >
                          Refund
                        </button>
                      </>
                    ) : null}
                  </td>
                </tr>
              ))}

              {!loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-6 text-center text-slate-600">
                    No pending visits for selected filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      <CollectPaymentModal
        open={collectOpen}
        visitId={collectVisit?.visitId ?? null}
        serviceId={collectVisit?.serviceId ?? null}
        patientName={collectVisit?.patientName ?? ""}
        pendingAmount={collectVisit?.pendingAmount ?? 0}
        onClose={() => {
          setCollectOpen(false);
          setCollectVisit(null);
        }}
        onSuccess={async () => {
          await load();
        }}
      />

      <RefundPaymentModal
        open={refundOpen}
        visitId={refundVisit?.visitId ?? null}
        serviceId={refundVisit?.serviceId ?? null}
        patientName={refundVisit?.patientName ?? ""}
        netPaidAmount={refundVisit?.netPaidAmount ?? 0}
        onClose={() => {
          setRefundOpen(false);
          setRefundVisit(null);
        }}
        onSuccess={async () => {
          await load();
        }}
      />
    </div>
  );
}
