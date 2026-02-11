"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, FileText, CheckCircle2, XCircle } from "lucide-react";

type Row = {
  orderId: number;
  visitId: number;
  visitDate: string;
  patientCode: string;
  patientName: string;
  doctorName: string;
  status: "PENDING" | "PURCHASED" | "NOT_PURCHASED";
  medicines?: string | null;
  updatedAt?: string | null;
};

type DetailItem = {
  id: number;
  medicineName: string;
  dosage: string | null;
  morning: number;
  afternoon: number;
  night: number;
  beforeFood: number;
  durationDays: number | null;
  instructions: string | null;
  sortOrder: number;
};

type DetailsResponse = {
  ok: true;
  order: {
    orderId: number;
    status: Row["status"];
    updatedAt: string | null;
    visitId: number;
    visitDate: string;
    patientCode: string;
    patientName: string;
    doctorName: string;
    prescriptionId: number;
  };
  items: DetailItem[];
};

function badgeCls(status: Row["status"]) {
  if (status === "PURCHASED") return "bg-green-50 text-green-700 border-green-200";
  if (status === "NOT_PURCHASED") return "bg-red-50 text-red-700 border-red-200";
  return "bg-amber-50 text-amber-800 border-amber-200";
}

// Parse instructions meta: [P=...][S=yyyy-mm-dd] body
function parseMeta(instructions: string | null) {
  const raw = (instructions || "").trim();
  const m = raw.match(/^\[P=(.*?)\]\[S=(.*?)\]\s*/);
  if (!m) return { periodicity: "Daily", startDate: "", body: raw };
  return {
    periodicity: (m[1] || "").trim() || "Daily",
    startDate: (m[2] || "").trim() || "",
    body: raw.replace(/^\[P=(.*?)\]\[S=(.*?)\]\s*/, ""),
  };
}

function parseDosage(dosage: string | null, fallback: { m: number; a: number; n: number }) {
  const d = (dosage || "").trim();
  if (d.includes("-")) {
    const parts = d.split("-").map((x) => (x || "").trim());
    const m = Number((parts[0] || "0").replace(/[^0-9]/g, "") || "0");
    const a = Number((parts[1] || "0").replace(/[^0-9]/g, "") || "0");
    const n = Number((parts[2] || "0").replace(/[^0-9]/g, "") || "0");
    return { m, a, n };
  }
  return fallback;
}

export default function PharmaOrdersPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<"PENDING" | "PURCHASED" | "NOT_PURCHASED">("PENDING");

  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [detailsByOrder, setDetailsByOrder] = useState<Record<number, DetailsResponse>>({});
  const [detailsLoading, setDetailsLoading] = useState<Record<number, boolean>>({});

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/pharma/orders?status=${status}&today=1`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setRows(data.rows || []);
    } finally {
      setLoading(false);
    }
  }

  async function setOrderStatus(orderId: number, newStatus: "PURCHASED" | "NOT_PURCHASED") {
    try {
      const res = await fetch(`/api/pharma/orders/${orderId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          data && typeof data === "object" && data !== null && "error" in data && typeof (data as Record<string, unknown>).error === "string"
            ? String((data as Record<string, unknown>).error)
            : "Failed";
        alert(msg);
        return;
      }
      await load();
    } catch {
      alert("Network error.");
    }
  }

  async function ensureDetails(orderId: number) {
    if (detailsByOrder[orderId]) return;
    if (detailsLoading[orderId]) return;

    setDetailsLoading((p) => ({ ...p, [orderId]: true }));
    try {
      const res = await fetch(`/api/pharma/orders/${orderId}/details`, {
        cache: "no-store",
      });
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok || !data || typeof data !== "object") return;
      if (!("ok" in data) || (data as Record<string, unknown>).ok !== true) return;
      setDetailsByOrder((p) => ({ ...p, [orderId]: data as DetailsResponse }));
    } finally {
      setDetailsLoading((p) => ({ ...p, [orderId]: false }));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const headerText = useMemo(() => {
    if (status === "PENDING") return "Pending Pharma Orders (Today)";
    if (status === "PURCHASED") return "Purchased (Today)";
    return "Not Purchased (Today)";
  }, [status]);

  return (
    <div className="p-6">
      <div className="rounded-2xl border bg-white shadow-sm">
        <div className="p-4 border-b flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-lg font-semibold">{headerText}</div>
            <div className="text-sm text-slate-600">
              Mark each prescription as Purchased / Not Purchased.
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <select
              className="rounded-lg border bg-white px-3 py-2 text-sm"
              value={status}
              onChange={(e) => {
                const v = e.target.value as string;
                if (v === "PENDING" || v === "PURCHASED" || v === "NOT_PURCHASED") setStatus(v);
              }}
            >
              <option value="PENDING">Pending</option>
              <option value="PURCHASED">Purchased</option>
              <option value="NOT_PURCHASED">Not Purchased</option>
            </select>

            <button
              className="rounded-lg border px-3 py-2 text-sm hover:bg-gray-50"
              onClick={load}
            >
              {loading ? "Refreshing…" : "🔄 Refresh"}
            </button>
          </div>
        </div>

        <div className="p-4">
          <div className="w-full overflow-x-auto rounded-xl border bg-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-[#646179]">
                <tr className="border-b">
                  <th className="px-3 py-2 text-left font-medium w-[44px]"></th>
                  <th className="px-3 py-2 text-left font-medium">Order</th>
                  <th className="px-3 py-2 text-left font-medium">Visit Date</th>
                  <th className="px-3 py-2 text-left font-medium">Patient</th>
                  <th className="px-3 py-2 text-left font-medium">Doctor</th>
                  <th className="px-3 py-2 text-left font-medium">Medicines</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                  <th className="px-3 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>

              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-10 text-center text-sm text-[#646179]"
                    >
                      {loading ? "Loading…" : "No pharma orders."}
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => {
                    const isOpen = !!expanded[r.orderId];
                    const details = detailsByOrder[r.orderId];
                    const isDetLoading = !!detailsLoading[r.orderId];

                    return (
                      <Fragment key={r.orderId}>
                        <tr
                          key={r.orderId}
                          className="border-b last:border-b-0 hover:bg-gray-50/60"
                        >
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md border bg-white hover:bg-gray-50"
                              onClick={async () => {
                                setExpanded((p) => ({ ...p, [r.orderId]: !isOpen }));
                                if (!isOpen) await ensureDetails(r.orderId);
                              }}
                              aria-label={isOpen ? "Collapse" : "Expand"}
                            >
                              {isOpen ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </button>
                          </td>

                          <td className="px-3 py-2 font-medium">#{r.orderId}</td>
                          <td className="px-3 py-2">{r.visitDate}</td>
                          <td className="px-3 py-2">
                            <div className="font-medium">{r.patientName}</div>
                            <div className="text-xs text-slate-600">{r.patientCode}</div>
                          </td>
                          <td className="px-3 py-2 text-slate-700">{r.doctorName}</td>
                          <td className="px-3 py-2 text-slate-700">
                            {r.medicines || "—"}
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className={
                                "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium " +
                                badgeCls(r.status)
                              }
                            >
                              {r.status}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap justify-end gap-2">
                              <button
                                className="rounded-lg border bg-white px-3 py-1.5 text-xs hover:bg-gray-50"
                                onClick={() => router.push(`/patients/${r.patientCode}`)}
                              >
                                Patient
                              </button>

                              <button
                                className="inline-flex items-center gap-1 rounded-lg border bg-white px-3 py-1.5 text-xs hover:bg-gray-50"
                                onClick={() =>
                                  window.open(
                                    `/api/doctor/visits/${r.visitId}/consultation/pdf`,
                                    "_blank",
                                    "noopener,noreferrer"
                                  )
                                }
                              >
                                <FileText className="h-3.5 w-3.5" />
                                PDF
                              </button>

                              <button
                                className="inline-flex items-center gap-1 rounded-lg border bg-white px-3 py-1.5 text-xs hover:bg-gray-50"
                                onClick={() => setOrderStatus(r.orderId, "PURCHASED")}
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Purchased
                              </button>

                              <button
                                className="inline-flex items-center gap-1 rounded-lg border bg-white px-3 py-1.5 text-xs hover:bg-gray-50"
                                onClick={() => setOrderStatus(r.orderId, "NOT_PURCHASED")}
                              >
                                <XCircle className="h-3.5 w-3.5" />
                                Not purchased
                              </button>
                            </div>
                          </td>
                        </tr>

                        {isOpen && (
                          <tr key={`${r.orderId}-details`} className="border-b bg-white">
                            <td colSpan={8} className="px-3 py-3">
                              <div className="rounded-xl border bg-slate-50 p-3">
                                {isDetLoading ? (
                                  <div className="text-sm text-slate-600">Loading details…</div>
                                ) : !details ? (
                                  <div className="text-sm text-slate-600">
                                    Could not load details.
                                  </div>
                                ) : (
                                  <div className="space-y-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <div>
                                        <div className="text-sm font-semibold text-slate-900">
                                          Prescription Details
                                        </div>
                                        <div className="text-xs text-slate-600">
                                          Rx #{details.order.prescriptionId}
                                        </div>
                                      </div>

                                      <button
                                        className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-xs hover:bg-gray-50"
                                        onClick={() =>
                                          window.open(
                                            `/api/doctor/visits/${r.visitId}/consultation/pdf`,
                                            "_blank",
                                            "noopener,noreferrer"
                                          )
                                        }
                                      >
                                        <FileText className="h-4 w-4" />
                                        Open Consultation PDF
                                      </button>
                                    </div>

                                    <div className="w-full overflow-x-auto rounded-lg border bg-white">
                                      <table className="w-full text-xs">
                                        <thead className="bg-slate-50 text-slate-600">
                                          <tr className="border-b">
                                            <th className="px-2 py-2 text-left font-medium min-w-[220px]">
                                              Medicine
                                            </th>
                                            <th className="px-2 py-2 text-center font-medium min-w-[90px]">
                                              M
                                            </th>
                                            <th className="px-2 py-2 text-center font-medium min-w-[90px]">
                                              A
                                            </th>
                                            <th className="px-2 py-2 text-center font-medium min-w-[90px]">
                                              N
                                            </th>
                                            <th className="px-2 py-2 text-center font-medium min-w-[110px]">
                                              Before Food
                                            </th>
                                            <th className="px-2 py-2 text-left font-medium min-w-[80px]">
                                              Days
                                            </th>
                                            <th className="px-2 py-2 text-left font-medium min-w-[140px]">
                                              Periodicity
                                            </th>
                                            <th className="px-2 py-2 text-left font-medium min-w-[120px]">
                                              Start
                                            </th>
                                            <th className="px-2 py-2 text-left font-medium min-w-[240px]">
                                              Instructions
                                            </th>
                                          </tr>
                                        </thead>

                                        <tbody>
                                          {details.items.length === 0 ? (
                                            <tr>
                                              <td
                                                colSpan={9}
                                                className="px-3 py-6 text-center text-slate-600"
                                              >
                                                No prescription items.
                                              </td>
                                            </tr>
                                          ) : (
                                            details.items.map((it) => {
                                              const meta = parseMeta(it.instructions);
                                              const dose = parseDosage(it.dosage, {
                                                m: it.morning ? 1 : 0,
                                                a: it.afternoon ? 1 : 0,
                                                n: it.night ? 1 : 0,
                                              });

                                              return (
                                                <tr key={it.id} className="border-b last:border-b-0">
                                                  <td className="px-2 py-2 font-medium text-slate-900">
                                                    {it.medicineName}
                                                  </td>
                                                  <td className="px-2 py-2 text-center">{dose.m || "—"}</td>
                                                  <td className="px-2 py-2 text-center">{dose.a || "—"}</td>
                                                  <td className="px-2 py-2 text-center">{dose.n || "—"}</td>
                                                  <td className="px-2 py-2 text-center">
                                                    {it.beforeFood ? "Yes" : "No"}
                                                  </td>
                                                  <td className="px-2 py-2">{it.durationDays ?? "—"}</td>
                                                  <td className="px-2 py-2">{meta.periodicity || "—"}</td>
                                                  <td className="px-2 py-2">{meta.startDate || "—"}</td>
                                                  <td className="px-2 py-2">{meta.body || "—"}</td>
                                                </tr>
                                              );
                                            })
                                          )}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
