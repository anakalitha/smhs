"use client";

import React, { useEffect, useMemo, useState } from "react";

type ServiceOpt = { code: string; display_name: string };
type ReferralOpt = { id: string; name: string };
type DoctorOpt = { id: number; full_name: string };
type ModeOpt = { code: string; display_name: string };

type Totals = {
  gross: number;
  paid: number;
  discount: number;
  net: number;
  pending: number;
};

type DetailRow = {
  visitDate: string;
  patientCode: string;
  patientName: string;
  referredBy: string;
  phone: string;
  doctorName: string;
  serviceCode: string;
  serviceName: string;
  grossAmount: number;
  paidAmount: number;
  discountAmount: number;
  netAmount: number;
  pendingAmount: number;
  paymentMode: string;
};

type GroupRow = {
  groupKey: string;
  visitsCount: number;
  grossAmount: number;
  paidAmount: number;
  discountAmount: number;
  netAmount: number;
  pendingAmount: number;
};

type ApiResponse =
  | {
      ok: true;
      mode: "DETAIL";
      rows: DetailRow[];
      totals: Totals;
      options: {
        services: ServiceOpt[];
        referrals: ReferralOpt[];
        doctors: DoctorOpt[];
        paymentModes: ModeOpt[];
        role: string[];
      };
    }
  | {
      ok: true;
      mode: "GROUPED";
      groupBy: string;
      rows: GroupRow[];
      totals: Totals & { visits?: number };
      options: {
        services: ServiceOpt[];
        referrals: ReferralOpt[];
        doctors: DoctorOpt[];
        paymentModes: ModeOpt[];
        role: string[];
      };
    }
  | {
      ok?: false;
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

type Status = "ALL" | "PENDING" | "PAID" | "WAIVED";
type GroupBy =
  | "NONE"
  | "DATE"
  | "REFERRAL"
  | "DOCTOR"
  | "SERVICE"
  | "PAYMENT_MODE"
  | "STATUS";

export default function CommonReportsClient({ roles }: { roles: string[] }) {
  const isReception = roles.includes("RECEPTION");
  const canSeeAllServices = roles.some(
    (r) => r === "ADMIN" || r === "SUPER_ADMIN" || r === "DOCTOR"
  );

  const [startDate, setStartDate] = useState(todayYYYYMMDD());
  const [endDate, setEndDate] = useState(todayYYYYMMDD());

  const [referralId, setReferralId] = useState<string>("");
  const [doctorId, setDoctorId] = useState<string>("");
  const [serviceCode, setServiceCode] = useState<string>(
    isReception ? "CONSULTATION" : ""
  );
  const [paymentMode, setPaymentMode] = useState<string>("");

  const [status, setStatus] = useState<Status>("ALL");
  const [groupBy, setGroupBy] = useState<GroupBy>("NONE");

  const [options, setOptions] = useState<{
    services: ServiceOpt[];
    referrals: ReferralOpt[];
    doctors: DoctorOpt[];
    paymentModes: ModeOpt[];
  }>({ services: [], referrals: [], doctors: [], paymentModes: [] });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [mode, setMode] = useState<"DETAIL" | "GROUPED">("DETAIL");
  const [detailRows, setDetailRows] = useState<DetailRow[]>([]);
  const [groupRows, setGroupRows] = useState<GroupRow[]>([]);
  const [totals, setTotals] = useState<Totals>({
    gross: 0,
    paid: 0,
    discount: 0,
    net: 0,
    pending: 0,
  });

  const query = useMemo(() => {
    const q = new URLSearchParams({
      startDate,
      endDate,
      status,
      groupBy,
    });

    if (referralId) q.set("referralId", referralId);
    if (doctorId) q.set("doctorId", doctorId);
    if (serviceCode) q.set("serviceCode", serviceCode);
    if (paymentMode) q.set("paymentMode", paymentMode);

    return q;
  }, [
    startDate,
    endDate,
    referralId,
    doctorId,
    serviceCode,
    paymentMode,
    status,
    groupBy,
  ]);

  const exportXlsx = useMemo(
    () => `/api/reports/common/export.xlsx?${query.toString()}`,
    [query]
  );
  const exportPdf = useMemo(
    () => `/api/reports/common/export.pdf?${query.toString()}`,
    [query]
  );

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports/common?${query.toString()}`, {
        cache: "no-store",
      });
      const data = (await res.json().catch(() => ({}))) as ApiResponse;
      if (!res.ok || !("ok" in data) || !data.ok) {
        setError(
          (data as { error?: string })?.error || "Failed to load report."
        );
        setDetailRows([]);
        setGroupRows([]);
        return;
      }

      setOptions({
        services: data.options.services || [],
        referrals: data.options.referrals || [],
        doctors: data.options.doctors || [],
        paymentModes: data.options.paymentModes || [],
      });

      setTotals(data.totals as Totals);

      if (data.mode === "DETAIL") {
        setMode("DETAIL");
        setDetailRows(data.rows || []);
        setGroupRows([]);
      } else {
        setMode("GROUPED");
        setGroupRows(data.rows || []);
        setDetailRows([]);
      }
    } catch {
      setError("Network error.");
      setDetailRows([]);
      setGroupRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // load initial
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-[#F2F2F2] p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="rounded-2xl border bg-white shadow-sm">
          <div className="border-b p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <div className="text-lg font-semibold text-[#1f1f1f]">
                Reports
              </div>
              <div className="text-sm text-[#646179]">
                Date range reports with filters, grouping and exports.
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => window.close()}
                className="rounded-lg border border-slate-300 bg-gray-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900"
              >
                Close
              </button>
              <a
                href={exportXlsx}
                className="rounded-lg border border-slate-300 bg-gray-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900"
              >
                Export XLSX
              </a>
              <a
                href={exportPdf}
                className="rounded-lg border border-slate-300 bg-gray-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900"
              >
                Export PDF
              </a>
              <button
                type="button"
                onClick={run}
                disabled={loading}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {loading ? "Loading..." : "Search"}
              </button>
            </div>
          </div>

          <div className="p-4 grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Filters */}
            <div className="lg:col-span-4 rounded-xl border bg-white p-4">
              <div className="text-sm font-semibold text-slate-900 mb-3">
                Search Filters
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs font-medium text-slate-600 mb-1">
                    Start Date
                  </div>
                  <input
                    type="date"
                    className="w-full rounded-lg border px-3 py-2 text-sm bg-white"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>

                <div>
                  <div className="text-xs font-medium text-slate-600 mb-1">
                    End Date
                  </div>
                  <input
                    type="date"
                    className="w-full rounded-lg border px-3 py-2 text-sm bg-white"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="mt-3">
                <div className="text-xs font-medium text-slate-600 mb-1">
                  Referred By
                </div>
                <select
                  className="w-full rounded-lg border px-3 py-2 text-sm bg-white"
                  value={referralId}
                  onChange={(e) => setReferralId(e.target.value)}
                >
                  <option value="">All</option>
                  {options.referrals.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mt-3">
                <div className="text-xs font-medium text-slate-600 mb-1">
                  Doctor
                </div>
                <select
                  className="w-full rounded-lg border px-3 py-2 text-sm bg-white"
                  value={doctorId}
                  onChange={(e) => setDoctorId(e.target.value)}
                >
                  <option value="">All</option>
                  {options.doctors.map((d) => (
                    <option key={d.id} value={String(d.id)}>
                      {d.full_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mt-3">
                <div className="text-xs font-medium text-slate-600 mb-1">
                  Payment Mode
                </div>
                <select
                  className="w-full rounded-lg border px-3 py-2 text-sm bg-white"
                  value={paymentMode}
                  onChange={(e) => setPaymentMode(e.target.value)}
                >
                  <option value="">All</option>
                  {options.paymentModes.map((m) => (
                    <option key={m.code} value={m.code}>
                      {m.display_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mt-3">
                <div className="text-xs font-medium text-slate-600 mb-1">
                  Service
                </div>
                <select
                  className="w-full rounded-lg border px-3 py-2 text-sm bg-white"
                  value={serviceCode}
                  onChange={(e) => setServiceCode(e.target.value)}
                  disabled={isReception && !canSeeAllServices}
                >
                  {!serviceCode && <option value="">All</option>}
                  {options.services.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.display_name} ({s.code})
                    </option>
                  ))}
                </select>
                {isReception && !canSeeAllServices && (
                  <div className="mt-1 text-xs text-slate-500">
                    Reception defaults to Consultation.
                  </div>
                )}
              </div>

              <div className="mt-3">
                <div className="text-xs font-medium text-slate-600 mb-1">
                  Status
                </div>
                <select
                  className="w-full rounded-lg border px-3 py-2 text-sm bg-white"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as Status)}
                >
                  <option value="ALL">All</option>
                  <option value="PENDING">Pending</option>
                  <option value="PAID">Paid</option>
                  <option value="WAIVED">Waived</option>
                </select>
              </div>

              <div className="mt-3">
                <div className="text-xs font-medium text-slate-600 mb-1">
                  Group By
                </div>
                <select
                  className="w-full rounded-lg border px-3 py-2 text-sm bg-white"
                  value={groupBy}
                  onChange={(e) => setGroupBy(e.target.value as GroupBy)}
                >
                  <option value="NONE">None (Details)</option>
                  <option value="DATE">Visit Date</option>
                  <option value="REFERRAL">Referred By</option>
                  <option value="DOCTOR">Doctor</option>
                  <option value="SERVICE">Service</option>
                  <option value="PAYMENT_MODE">Payment Mode</option>
                  <option value="STATUS">Status</option>
                </select>
              </div>
            </div>

            {/* Results */}
            <div className="lg:col-span-8 space-y-4">
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="rounded-xl border bg-slate-50 p-3">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-sm">
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
                  <div className="flex items-center justify-between md:block">
                    <div className="text-slate-600">Pending</div>
                    <div className="font-semibold text-slate-900">
                      {formatINR(totals.pending)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border bg-white overflow-x-auto">
                {mode === "DETAIL" ? (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-[#646179]">
                      <tr className="border-b">
                        <th className="px-3 py-2 text-left font-medium">
                          Date
                        </th>
                        <th className="px-3 py-2 text-left font-medium">
                          Patient
                        </th>
                        <th className="px-3 py-2 text-left font-medium">
                          Name
                        </th>
                        <th className="px-3 py-2 text-left font-medium">
                          Referral
                        </th>
                        <th className="px-3 py-2 text-left font-medium">
                          Doctor
                        </th>
                        <th className="px-3 py-2 text-left font-medium">
                          Service
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                          Gross
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                          Paid
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                          Disc
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                          Net
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                          Pending
                        </th>
                        <th className="px-3 py-2 text-left font-medium">
                          Mode
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailRows.map((r, idx) => (
                        <tr
                          key={`${r.patientCode}-${r.serviceCode}-${idx}`}
                          className="border-b last:border-b-0"
                        >
                          <td className="px-3 py-2">{r.visitDate}</td>
                          <td className="px-3 py-2 font-medium">
                            {r.patientCode}
                          </td>
                          <td className="px-3 py-2">{r.patientName}</td>
                          <td className="px-3 py-2 text-[#646179]">
                            {r.referredBy}
                          </td>
                          <td className="px-3 py-2 text-[#646179]">
                            {r.doctorName}
                          </td>
                          <td className="px-3 py-2">{r.serviceCode}</td>
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
                          <td className="px-3 py-2 text-right">
                            {formatINR(r.pendingAmount)}
                          </td>
                          <td className="px-3 py-2 text-[#646179]">
                            {r.paymentMode}
                          </td>
                        </tr>
                      ))}
                      {detailRows.length === 0 && (
                        <tr>
                          <td
                            colSpan={12}
                            className="px-3 py-8 text-center text-[#646179]"
                          >
                            {loading ? "Loading..." : "No rows found."}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-[#646179]">
                      <tr className="border-b">
                        <th className="px-3 py-2 text-left font-medium">
                          Group
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                          Visits
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                          Gross
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                          Paid
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                          Disc
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                          Net
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                          Pending
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupRows.map((r, idx) => (
                        <tr
                          key={`${r.groupKey}-${idx}`}
                          className="border-b last:border-b-0"
                        >
                          <td className="px-3 py-2">{r.groupKey}</td>
                          <td className="px-3 py-2 text-right">
                            {r.visitsCount}
                          </td>
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
                          <td className="px-3 py-2 text-right">
                            {formatINR(r.pendingAmount)}
                          </td>
                        </tr>
                      ))}
                      {groupRows.length === 0 && (
                        <tr>
                          <td
                            colSpan={7}
                            className="px-3 py-8 text-center text-[#646179]"
                          >
                            {loading ? "Loading..." : "No rows found."}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="text-xs text-[#646179]">
                Note: Export XLSX downloads CSV formatted as .xlsx (Excel opens
                it).
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
