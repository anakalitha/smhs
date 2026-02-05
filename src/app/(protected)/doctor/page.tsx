// src/app/(protected)/doctor/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import DataTable, { Column } from "@/components/ui/DataTable";
import { formatISTDate } from "@/lib/datetime";
import WalkInModal from "./WalkInModal";

// Charts (install: npm i recharts)
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

type QueueStatus = "WAITING" | "NEXT" | "IN_ROOM" | "DONE";

type DoctorQueueRow = {
  visitId: number;
  visitDate: string;
  status: QueueStatus;
  tokenNo: number | null;

  patientDbId: number;
  patientCode: string;
  patientName: string;
  phone: string | null;
};

type MyPatientRow = {
  patientDbId: number;
  patientCode: string;
  name: string;
  phone: string | null;
  lastVisit: string;
  totalVisits: number;
};

type AnalyticsResponse = {
  range: { start: string; end: string };
  totals: {
    totalPatients: number;
    repeatPatients: number;
    scanOrdered: number;
    ctgOrdered: number;
    papOrdered: number;
  };
  feeBreakdown: Array<{ feeType: string; totalAmount: number }>;
  topReferrals: Array<{ referralName: string; cnt: number }>;
  medicineBreakdown: Array<{ medicineName: string; cnt: number }>;
};

type ReportRow = {
  patientId: string;
  name: string;
  referredBy: string;
  visitDate: string;

  diagnosis: string;
  investigation: string;
  scanDetails: string;
  papSmearDetails: string;
  ctgDetails: string;
  treatment: string;
  remarks: string;
};

function formatINR(n: number) {
  return n.toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });
}

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

function defaultRange() {
  return { start: "2024-01-01", end: ymd(new Date()) };
}

function Badge({
  children,
  tone = "gray",
}: {
  children: React.ReactNode;
  tone?: "gray" | "green" | "yellow" | "blue";
}) {
  const cls =
    tone === "green"
      ? "bg-green-50 text-green-700 border-green-200"
      : tone === "yellow"
      ? "bg-yellow-50 text-yellow-700 border-yellow-200"
      : tone === "blue"
      ? "bg-blue-50 text-blue-700 border-blue-200"
      : "bg-gray-50 text-gray-700 border-gray-200";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${cls}`}
    >
      {children}
    </span>
  );
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
  "focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500";

const tabBtn = (active: boolean) =>
  [
    "rounded-lg px-3 py-2 text-sm font-medium border",
    active
      ? "bg-blue-600 text-white border-blue-600"
      : "bg-white hover:bg-gray-50 text-slate-900",
  ].join(" ");

type TabKey = "QUEUE" | "PATIENTS" | "ANALYTICS" | "REPORTS";

function clampPage(n: number) {
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}

function safeStr(v: unknown) {
  return v == null ? "" : String(v);
}

function contains(hay: string, needle: string) {
  return hay.toLowerCase().includes(needle.toLowerCase());
}

export default function DoctorDashboardPage() {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("QUEUE");

  // ===== Today Queue =====
  const [queueRows, setQueueRows] = useState<DoctorQueueRow[]>([]);
  const [queueLoading, setQueueLoading] = useState(false);
  const [queueErr, setQueueErr] = useState<string | null>(null);
  const [queueSearch, setQueueSearch] = useState("");
  const [queueSearchApplied, setQueueSearchApplied] = useState("");
  const [walkInOpen, setWalkInOpen] = useState(false);
  const referralColors = [
    "#2563eb",
    "#16a34a",
    "#f59e0b",
    "#ef4444",
    "#8b5cf6",
  ];

  async function loadQueue(search = queueSearchApplied) {
    setQueueLoading(true);
    setQueueErr(null);
    try {
      const q = new URLSearchParams();
      if (search.trim()) q.set("search", search.trim()); // requires API support; harmless if ignored

      const res = await fetch(`/api/doctor/dashboard?${q.toString()}`, {
        cache: "no-store",
      });
      const data = (await res.json().catch(() => ({}))) as {
        todays?: DoctorQueueRow[];
        error?: string;
      };
      if (!res.ok) {
        setQueueErr(data?.error || "Failed to load today's queue.");
        setQueueRows([]);
        return;
      }
      setQueueRows((data.todays || []) as DoctorQueueRow[]);
    } catch {
      setQueueErr("Network error.");
      setQueueRows([]);
    } finally {
      setQueueLoading(false);
    }
  }

  useEffect(() => {
    loadQueue("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyQueueSearch() {
    const s = queueSearch.trim();
    setQueueSearchApplied(s);
    loadQueue(s);
  }

  function clearQueueSearch() {
    setQueueSearch("");
    setQueueSearchApplied("");
    loadQueue("");
  }

  const queueColumns: Column<DoctorQueueRow>[] = useMemo(() => {
    type BadgeTone = "gray" | "green" | "yellow" | "blue";
    return [
      {
        header: "Token",
        cell: (r) => (
          <span className="font-medium text-slate-900">{r.tokenNo ?? "—"}</span>
        ),
        className: "w-[90px]",
      },
      {
        header: "Patient ID",
        cell: (r) => (
          <span className="font-medium text-slate-900">{r.patientCode}</span>
        ),
        className: "w-[150px]",
      },
      {
        header: "Name",
        cell: (r) => <span className="text-slate-900">{r.patientName}</span>,
        className: "min-w-[180px]",
      },
      {
        header: "Phone",
        cell: (r) => <span className="text-slate-600">{r.phone ?? "—"}</span>,
        className: "w-[140px]",
      },
      {
        header: "Visit Date",
        cell: (r) => (
          <span className="text-slate-600">{formatISTDate(r.visitDate)}</span>
        ),
        className: "w-[180px]",
      },
      {
        header: "Status",
        cell: (r) => {
          const tone: BadgeTone =
            r.status === "DONE"
              ? "green"
              : r.status === "IN_ROOM"
              ? "blue"
              : r.status === "NEXT"
              ? "yellow"
              : "gray";
          return <Badge tone={tone}>{r.status}</Badge>;
        },
        className: "w-[120px]",
      },
    ];
  }, []);

  // ===== My Patients =====
  const [patRows, setPatRows] = useState<MyPatientRow[]>([]);
  const [patSearch, setPatSearch] = useState("");
  const [patSearchApplied, setPatSearchApplied] = useState("");
  const [patPage, setPatPage] = useState(1);
  const [patTotal, setPatTotal] = useState(0);
  const [patLoading, setPatLoading] = useState(false);
  const [patErr, setPatErr] = useState<string | null>(null);
  const patPageSize = 15;
  const patTotalPages = Math.max(1, Math.ceil(patTotal / patPageSize));

  async function loadPatients(args?: { search?: string; page?: number }) {
    const search = (args?.search ?? patSearchApplied).trim();
    const page = clampPage(args?.page ?? patPage);

    setPatLoading(true);
    setPatErr(null);
    try {
      const q = new URLSearchParams({
        search,
        page: String(page),
        pageSize: String(patPageSize),
      });
      const res = await fetch(`/api/doctor/patients?${q.toString()}`, {
        cache: "no-store",
      });
      const data = (await res.json().catch(() => ({}))) as {
        rows?: MyPatientRow[];
        total?: number;
        page?: number;
        pageSize?: number;
        error?: string;
      };

      if (!res.ok) {
        setPatErr(data?.error || "Failed to load patients.");
        setPatRows([]);
        setPatTotal(0);
        return;
      }

      setPatRows((data.rows || []) as MyPatientRow[]);
      setPatTotal(Number(data.total ?? 0));
      setPatPage(Number(data.page ?? page));
    } catch {
      setPatErr("Network error.");
      setPatRows([]);
      setPatTotal(0);
    } finally {
      setPatLoading(false);
    }
  }

  useEffect(() => {
    if (tab === "PATIENTS" && patRows.length === 0 && !patLoading) {
      setPatSearch("");
      setPatSearchApplied("");
      setPatPage(1);
      loadPatients({ search: "", page: 1 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  function applyPatientSearch() {
    const s = patSearch.trim();
    setPatSearchApplied(s);
    setPatPage(1);
    loadPatients({ search: s, page: 1 });
  }

  function clearPatientSearch() {
    setPatSearch("");
    setPatSearchApplied("");
    setPatPage(1);
    loadPatients({ search: "", page: 1 });
  }

  function goPatientsPage(nextPage: number) {
    const p = Math.min(Math.max(1, nextPage), patTotalPages);
    setPatPage(p);
    loadPatients({ search: patSearchApplied, page: p });
  }

  const patientColumns: Column<MyPatientRow>[] = useMemo(
    () => [
      {
        header: "Patient ID",
        cell: (p) => (
          <span className="font-medium text-slate-900">{p.patientCode}</span>
        ),
        className: "w-[160px]",
      },
      {
        header: "Name",
        cell: (p) => <span className="text-slate-900">{p.name}</span>,
        className: "min-w-[200px]",
      },
      {
        header: "Phone",
        cell: (p) => <span className="text-slate-600">{p.phone ?? "—"}</span>,
        className: "w-[160px]",
      },
      {
        header: "Last Visit",
        cell: (p) => (
          <span className="text-slate-600">{formatISTDate(p.lastVisit)}</span>
        ),
        className: "w-[180px]",
      },
      {
        header: "Visits",
        cell: (p) => (
          <span className="text-slate-900">{String(p.totalVisits ?? 0)}</span>
        ),
        className: "w-[90px]",
      },
    ],
    []
  );

  // ===== Analytics =====
  const [range, setRange] = useState(defaultRange());
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsErr, setAnalyticsErr] = useState<string | null>(null);

  async function loadAnalytics() {
    setAnalyticsLoading(true);
    setAnalyticsErr(null);
    try {
      const q = new URLSearchParams({ start: range.start, end: range.end });
      const res = await fetch(`/api/doctor/analytics?${q.toString()}`, {
        cache: "no-store",
      });
      const data = (await res.json().catch(() => ({}))) as AnalyticsResponse & {
        error?: string;
      };
      if (!res.ok) {
        setAnalyticsErr(data?.error || "Failed to load analytics.");
        setAnalytics(null);
        return;
      }
      setAnalytics(data as AnalyticsResponse);
    } catch {
      setAnalyticsErr("Network error.");
      setAnalytics(null);
    } finally {
      setAnalyticsLoading(false);
    }
  }

  useEffect(() => {
    if (tab === "ANALYTICS" && !analytics && !analyticsLoading) {
      loadAnalytics();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const feeChartData = useMemo(() => {
    const ALL_FEE_TYPES = [
      "CONSULTATION",
      "SCAN",
      "CTG",
      "PAP_SMEAR",
      "PHARMACY",
    ];

    const map = new Map<string, number>();
    (analytics?.feeBreakdown ?? []).forEach((f) => {
      map.set(String(f.feeType), Number(f.totalAmount ?? 0));
    });

    return ALL_FEE_TYPES.map((t) => ({
      name: t,
      amount: map.get(t) ?? 0,
    }));
  }, [analytics]);

  const referralChartData = useMemo(() => {
    if (!analytics) return [];
    return analytics.topReferrals.slice(0, 5).map((r) => ({
      name: r.referralName,
      count: Number(r.cnt ?? 0),
    }));
  }, [analytics]);

  // ===== Reports =====
  const [repStart, setRepStart] = useState(defaultRange().start);
  const [repEnd, setRepEnd] = useState(defaultRange().end);
  const [repReferralId, setRepReferralId] = useState("");
  const [repRows, setRepRows] = useState<ReportRow[]>([]);
  const [repLoading, setRepLoading] = useState(false);
  const [repErr, setRepErr] = useState<string | null>(null);

  // Search + pagination (client-side)
  const [repSearch, setRepSearch] = useState("");
  const [repSearchApplied, setRepSearchApplied] = useState("");
  const [repPage, setRepPage] = useState(1);
  const repPageSize = 20;

  async function runReport() {
    setRepLoading(true);
    setRepErr(null);
    try {
      const q = new URLSearchParams({
        start: repStart,
        end: repEnd,
      });
      if (repReferralId.trim()) q.set("referralId", repReferralId.trim());

      const res = await fetch(`/api/doctor/reports?${q.toString()}`, {
        cache: "no-store",
      });
      const data = (await res.json().catch(() => ({}))) as {
        rows?: ReportRow[];
        error?: string;
      };

      if (!res.ok) {
        setRepErr(data?.error || "Failed to run report.");
        setRepRows([]);
        return;
      }

      setRepRows((data.rows || []) as ReportRow[]);
      // Reset search/pagination whenever a report is run
      setRepSearch("");
      setRepSearchApplied("");
      setRepPage(1);
    } catch {
      setRepErr("Network error.");
      setRepRows([]);
    } finally {
      setRepLoading(false);
    }
  }

  function applyReportSearch() {
    const s = repSearch.trim();
    setRepSearchApplied(s);
    setRepPage(1);
  }

  function clearReportSearch() {
    setRepSearch("");
    setRepSearchApplied("");
    setRepPage(1);
  }

  const repFiltered = useMemo(() => {
    const s = repSearchApplied.trim();
    if (!s) return repRows;

    return repRows.filter((r) => {
      const hay = [
        r.patientId,
        r.name,
        r.referredBy,
        r.visitDate,
        r.diagnosis,
        r.investigation,
        r.scanDetails,
        r.papSmearDetails,
        r.ctgDetails,
        r.treatment,
        r.remarks,
      ]
        .map(safeStr)
        .join(" | ");

      return contains(hay, s);
    });
  }, [repRows, repSearchApplied]);

  const repTotal = repFiltered.length;
  const repTotalPages = Math.max(1, Math.ceil(repTotal / repPageSize));

  const repPageRows = useMemo(() => {
    const page = Math.min(Math.max(1, repPage), repTotalPages);
    const start = (page - 1) * repPageSize;
    return repFiltered.slice(start, start + repPageSize);
  }, [repFiltered, repPage, repTotalPages]);

  function goReportPage(nextPage: number) {
    const p = Math.min(Math.max(1, nextPage), repTotalPages);
    setRepPage(p);
  }

  async function exportReportsXlsx(rowsToExport: ReportRow[]) {
    try {
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
      xlsx.writeFile(wb, `doctor-report-${repStart}-to-${repEnd}.xlsx`, {
        compression: true,
      });
    } catch (e) {
      alert(
        "XLSX export requires packages. Run: npm i xlsx\n\nThen restart dev server."
      );
      console.error(e);
    }
  }

  async function exportReportsPdf(rowsToExport: ReportRow[]) {
    try {
      const jsPDFmod = await import("jspdf");
      const autoTable = await import("jspdf-autotable");

      const doc = new jsPDFmod.default({ orientation: "landscape" });
      doc.setFontSize(12);
      doc.text(`Doctor Report: ${repStart} to ${repEnd}`, 14, 12);

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

      doc.save(`doctor-report-${repStart}-to-${repEnd}.pdf`);
    } catch (e) {
      alert(
        "PDF export requires packages. Run: npm i jspdf jspdf-autotable\n\nThen restart dev server."
      );
      console.error(e);
    }
  }

  const reportColumns: Column<ReportRow>[] = useMemo(
    () => [
      {
        header: "Visit Date",
        cell: (r) => (
          <span className="text-slate-600">{formatISTDate(r.visitDate)}</span>
        ),
        className: "w-[180px]",
      },
      {
        header: "Patient ID",
        cell: (r) => (
          <span className="font-medium text-slate-900">{r.patientId}</span>
        ),
        className: "w-[160px]",
      },
      {
        header: "Name",
        cell: (r) => <span className="text-slate-900">{r.name}</span>,
        className: "min-w-[200px]",
      },
      {
        header: "Referred By",
        cell: (r) => <span className="text-slate-600">{r.referredBy}</span>,
        className: "min-w-[140px]",
      },
      {
        header: "Diagnosis",
        cell: (r) => (
          <span className="text-slate-900">{r.diagnosis || "—"}</span>
        ),
        className: "min-w-[220px]",
      },
      {
        header: "Investigation",
        cell: (r) => (
          <span className="text-slate-900">{r.investigation || "—"}</span>
        ),
        className: "min-w-[220px]",
      },
      {
        header: "Scan",
        cell: (r) => (
          <span className="text-slate-900">{r.scanDetails || "—"}</span>
        ),
        className: "min-w-[200px]",
      },
      {
        header: "PAP",
        cell: (r) => (
          <span className="text-slate-900">{r.papSmearDetails || "—"}</span>
        ),
        className: "min-w-[200px]",
      },
      {
        header: "CTG",
        cell: (r) => (
          <span className="text-slate-900">{r.ctgDetails || "—"}</span>
        ),
        className: "min-w-[200px]",
      },
      {
        header: "Treatment",
        cell: (r) => (
          <span className="text-slate-900">{r.treatment || "—"}</span>
        ),
        className: "min-w-[240px]",
      },
      {
        header: "Remarks",
        cell: (r) => <span className="text-slate-900">{r.remarks || "—"}</span>,
        className: "min-w-[240px]",
      },
    ],
    []
  );

  return (
    <div className="min-h-[calc(100vh-120px)] bg-[#F2F2F2]">
      <div className="p-6 max-w-7xl mx-auto">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              Doctor Dashboard
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Queue, patient history, analytics and reports.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              className={tabBtn(tab === "QUEUE")}
              onClick={() => setTab("QUEUE")}
            >
              Today&apos;s Queue
            </button>
            <button
              className={tabBtn(tab === "PATIENTS")}
              onClick={() => setTab("PATIENTS")}
            >
              My Patients
            </button>
            <button
              className={tabBtn(tab === "ANALYTICS")}
              onClick={() => setTab("ANALYTICS")}
            >
              Analytics
            </button>
            <button
              className={tabBtn(tab === "REPORTS")}
              onClick={() => setTab("REPORTS")}
            >
              Reports
            </button>
          </div>
        </div>

        {/* ===== TAB: QUEUE ===== */}
        {tab === "QUEUE" && (
          <div className="mt-5">
            <Card
              title="Today's Queue"
              subtitle="Open consultation or view patient summary."
              right={
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setWalkInOpen(true)}
                    className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
                  >
                    ➕ Register Walk-in
                  </button>

                  <button
                    type="button"
                    onClick={() => loadQueue(queueSearchApplied)}
                    className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-gray-50"
                  >
                    {queueLoading ? "Refreshing…" : "🔄 Refresh"}
                  </button>
                </div>
              }
            >
              <div className="flex flex-col md:flex-row gap-2 mb-3">
                <input
                  className={inputClass}
                  placeholder="Search by patient id / name / phone"
                  value={queueSearch}
                  onChange={(e) => setQueueSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") applyQueueSearch();
                  }}
                />

                <button
                  type="button"
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                  onClick={applyQueueSearch}
                  disabled={queueLoading}
                >
                  Search
                </button>

                <button
                  type="button"
                  className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-gray-50"
                  onClick={clearQueueSearch}
                  disabled={!queueSearch && !queueSearchApplied}
                >
                  Clear
                </button>
              </div>

              {queueErr && (
                <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {queueErr}
                </div>
              )}

              <div className="overflow-x-auto">
                <DataTable
                  dense
                  columns={queueColumns}
                  rows={queueRows}
                  emptyText={
                    queueLoading ? "Loading..." : "No patients for today."
                  }
                  getRowKey={(r) => r.visitId}
                  groupedActions={(row) => [
                    {
                      items: [
                        {
                          label: "Open Consultation",
                          onClick: () =>
                            router.push(
                              `/doctor/visits/${row.visitId}/consultation`
                            ),
                        },
                        {
                          label: "View Patient Summary",
                          onClick: () =>
                            router.push(`/patients/${row.patientCode}`),
                        },
                      ],
                    },
                  ]}
                />
              </div>
            </Card>
          </div>
        )}

        {/* ===== TAB: PATIENTS ===== */}
        {tab === "PATIENTS" && (
          <div className="mt-5">
            <Card
              title="My Patients"
              subtitle="Patients who have consulted you (latest first)."
              right={
                <button
                  type="button"
                  onClick={() =>
                    loadPatients({ search: patSearchApplied, page: patPage })
                  }
                  className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-gray-50"
                >
                  {patLoading ? "Refreshing…" : "🔄 Refresh"}
                </button>
              }
            >
              <div className="flex flex-col md:flex-row gap-2 mb-3">
                <input
                  className={inputClass}
                  placeholder="Search by patient id / name / phone"
                  value={patSearch}
                  onChange={(e) => setPatSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") applyPatientSearch();
                  }}
                />

                <button
                  type="button"
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                  onClick={applyPatientSearch}
                  disabled={patLoading}
                >
                  Search
                </button>

                <button
                  type="button"
                  className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-gray-50"
                  onClick={clearPatientSearch}
                  disabled={!patSearch && !patSearchApplied}
                >
                  Clear
                </button>
              </div>

              {patErr && (
                <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {patErr}
                </div>
              )}

              <div className="overflow-x-auto">
                <DataTable
                  dense
                  columns={patientColumns}
                  rows={patRows}
                  emptyText={patLoading ? "Loading..." : "No patients found."}
                  getRowKey={(r) => r.patientDbId}
                  groupedActions={(row) => [
                    {
                      items: [
                        {
                          label: "View Patient Summary",
                          onClick: () =>
                            router.push(`/patients/${row.patientCode}`),
                        },
                      ],
                    },
                  ]}
                />
              </div>

              <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="text-xs text-slate-600">
                  {patTotal === 0 ? (
                    <>No records</>
                  ) : (
                    <>
                      Showing page <b>{patPage}</b> of <b>{patTotalPages}</b> •{" "}
                      Total <b>{patTotal}</b>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
                    onClick={() => goPatientsPage(patPage - 1)}
                    disabled={patLoading || patPage <= 1}
                  >
                    ← Prev
                  </button>

                  <button
                    type="button"
                    className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
                    onClick={() => goPatientsPage(patPage + 1)}
                    disabled={patLoading || patPage >= patTotalPages}
                  >
                    Next →
                  </button>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* ===== TAB: ANALYTICS ===== */}
        {tab === "ANALYTICS" && (
          <div className="mt-5 space-y-4">
            <Card
              title="Analytics"
              subtitle="Counts and trends for your consultations."
              right={
                <button
                  type="button"
                  onClick={loadAnalytics}
                  className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-gray-50"
                >
                  {analyticsLoading ? "Loading…" : "🔄 Refresh"}
                </button>
              }
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                <div>
                  <div className="text-xs text-slate-600 mb-1">Start Date</div>
                  <input
                    className={inputClass}
                    type="date"
                    value={range.start}
                    onChange={(e) =>
                      setRange((r) => ({ ...r, start: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <div className="text-xs text-slate-600 mb-1">End Date</div>
                  <input
                    className={inputClass}
                    type="date"
                    value={range.end}
                    onChange={(e) =>
                      setRange((r) => ({ ...r, end: e.target.value }))
                    }
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => {
                      setAnalytics(null); // force reload
                      loadAnalytics();
                    }}
                    className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                  >
                    Apply
                  </button>
                </div>
              </div>

              {analyticsErr && (
                <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {analyticsErr}
                </div>
              )}

              {!analytics ? (
                <div className="text-sm text-slate-600">
                  {analyticsLoading ? "Loading..." : "No analytics yet."}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                    <KpiMini
                      title="Total Patients"
                      value={String(analytics.totals.totalPatients)}
                    />
                    <KpiMini
                      title="Repeat Patients"
                      value={String(analytics.totals.repeatPatients)}
                    />
                    <KpiMini
                      title="Scan Ordered"
                      value={String(analytics.totals.scanOrdered)}
                    />
                    <KpiMini
                      title="CTG Ordered"
                      value={String(analytics.totals.ctgOrdered)}
                    />
                    <KpiMini
                      title="PAP Ordered"
                      value={String(analytics.totals.papOrdered)}
                    />
                  </div>

                  {/* Charts */}
                  <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="rounded-xl border bg-white p-4">
                      <div className="text-sm font-semibold text-slate-900">
                        Fee Breakdown (Chart)
                      </div>
                      <div className="text-xs text-slate-600 mt-0.5">
                        Total amount per fee type
                      </div>

                      <div className="mt-3 h-[260px]">
                        {feeChartData.length === 0 ? (
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
                              {formatINR(f.amount)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-xl border bg-white p-4">
                      <div className="text-sm font-semibold text-slate-900">
                        Top Referrals (Chart)
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
                            <BarChart
                              data={referralChartData}
                              margin={{ bottom: 20 }}
                            >
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
                                    fill={
                                      referralColors[
                                        idx % referralColors.length
                                      ]
                                    }
                                  />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        )}
                      </div>

                      <div className="mt-2 space-y-1">
                        {analytics.topReferrals.slice(0, 5).map((r, idx) => (
                          <div
                            key={idx}
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
                    </div>
                  </div>

                  <div className="mt-4 rounded-xl border bg-white p-4">
                    <div className="text-sm font-semibold text-slate-900">
                      Medicines Prescribed
                    </div>
                    <div className="text-xs text-slate-600 mt-0.5">
                      Top medicines by frequency
                    </div>
                    <div className="mt-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                      {analytics.medicineBreakdown.length === 0 ? (
                        <div className="text-sm text-slate-600">
                          No prescriptions in this period.
                        </div>
                      ) : (
                        analytics.medicineBreakdown.map((m, idx) => (
                          <div
                            key={idx}
                            className="rounded-lg border bg-gray-50 px-3 py-2 text-sm flex items-center justify-between"
                          >
                            <div className="text-slate-900">
                              {m.medicineName}
                            </div>
                            <div className="font-medium text-slate-700">
                              {m.cnt}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </Card>
          </div>
        )}

        {/* ===== TAB: REPORTS ===== */}
        {tab === "REPORTS" && (
          <div className="mt-5">
            <Card
              title="Reports"
              subtitle="Filter and view detailed clinical report rows."
              right={
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => exportReportsXlsx(repFiltered)}
                    className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-gray-50"
                    disabled={repFiltered.length === 0}
                  >
                    ⬇️ Export XLSX
                  </button>
                  <button
                    type="button"
                    onClick={() => exportReportsPdf(repFiltered)}
                    className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-gray-50"
                    disabled={repFiltered.length === 0}
                  >
                    ⬇️ Export PDF
                  </button>
                </div>
              }
            >
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
                <div>
                  <div className="text-xs text-slate-600 mb-1">Start Date</div>
                  <input
                    className={inputClass}
                    type="date"
                    value={repStart}
                    onChange={(e) => setRepStart(e.target.value)}
                  />
                </div>
                <div>
                  <div className="text-xs text-slate-600 mb-1">End Date</div>
                  <input
                    className={inputClass}
                    type="date"
                    value={repEnd}
                    onChange={(e) => setRepEnd(e.target.value)}
                  />
                </div>
                <div>
                  <div className="text-xs text-slate-600 mb-1">
                    Referred By (ID)
                  </div>
                  <input
                    className={inputClass}
                    placeholder="Optional referral ID"
                    value={repReferralId}
                    onChange={(e) => setRepReferralId(e.target.value)}
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={runReport}
                    className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                    disabled={repLoading}
                  >
                    {repLoading ? "Running..." : "Run Report"}
                  </button>
                </div>
              </div>

              {/* Report Search + Clear */}
              <div className="flex flex-col md:flex-row gap-2 mb-3">
                <input
                  className={inputClass}
                  placeholder="Search inside report results (patient id/name/diagnosis/orders/treatment/remarks...)"
                  value={repSearch}
                  onChange={(e) => setRepSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") applyReportSearch();
                  }}
                />

                <button
                  type="button"
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                  onClick={applyReportSearch}
                  disabled={repLoading}
                >
                  Search
                </button>

                <button
                  type="button"
                  className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-gray-50"
                  onClick={clearReportSearch}
                  disabled={!repSearch && !repSearchApplied}
                >
                  Clear
                </button>
              </div>

              {repErr && (
                <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {repErr}
                </div>
              )}

              <div className="overflow-x-auto">
                <DataTable
                  dense
                  columns={reportColumns}
                  rows={repPageRows}
                  emptyText={repLoading ? "Loading..." : "No rows."}
                  getRowKey={(r) => `${r.patientId}-${r.visitDate}-${r.name}`}
                  groupedActions={(row) => [
                    {
                      items: [
                        {
                          label: "View Patient Summary",
                          onClick: () =>
                            router.push(`/patients/${row.patientId}`),
                        },
                      ],
                    },
                  ]}
                />
              </div>

              {/* Report Pagination */}
              <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="text-xs text-slate-600">
                  {repTotal === 0 ? (
                    <>No records</>
                  ) : (
                    <>
                      Showing page <b>{repPage}</b> of <b>{repTotalPages}</b> •{" "}
                      Total <b>{repTotal}</b>
                      {repSearchApplied ? (
                        <>
                          {" "}
                          (filtered by: <b>{repSearchApplied}</b>)
                        </>
                      ) : null}
                    </>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
                    onClick={() => goReportPage(repPage - 1)}
                    disabled={repPage <= 1}
                  >
                    ← Prev
                  </button>

                  <button
                    type="button"
                    className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
                    onClick={() => goReportPage(repPage + 1)}
                    disabled={repPage >= repTotalPages}
                  >
                    Next →
                  </button>
                </div>
              </div>

              <div className="mt-3 text-xs text-slate-600">
                Note: Export buttons export the <b>filtered</b> dataset (not
                just the current page).
              </div>
            </Card>
          </div>
        )}
      </div>
      <WalkInModal
        open={walkInOpen}
        onClose={() => setWalkInOpen(false)}
        onCreated={(r) => {
          setWalkInOpen(false);
          loadQueue("");
          // go to Patient Summary page after successful register
          router.push(`/patients/${r.patientCode}`);
        }}
      />
    </div>
  );
}
