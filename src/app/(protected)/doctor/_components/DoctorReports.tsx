// src/app/(protected)/doctor/_components/DoctorReports.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type TestType = "ALL" | "SCAN" | "PAP_SMEAR" | "CTG" | "LAB_TEST";

type PatientOption = {
  patientCode: string;
  label: string; // e.g. "Lakshmi (PT000123)"
};

type ReferralOption = {
  id: string;
  name: string;
};

const inputClass =
  "w-full rounded-lg border px-3 py-2 text-sm transition-all duration-200 " +
  "bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 " +
  "focus:outline-none focus:ring-2 focus:ring-slate-400/20 focus:border-slate-400";

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

function defaultRange() {
  return { start: "2024-01-01", end: ymd(new Date()) };
}

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

function buildExportUrl(args: {
  base: "/api/doctor/reports/export/xlsx" | "/api/doctor/reports/export/pdf";
  start: string;
  end: string;
  mode: "SUMMARY" | "PENDING";
  patientCode?: string;
  referralId?: string;
  testType: TestType;
}) {
  const q = new URLSearchParams({
    start: args.start,
    end: args.end,
    mode: args.mode,
    testType: args.testType,
  });
  if (args.patientCode?.trim()) q.set("patientCode", args.patientCode.trim());
  if (args.referralId?.trim()) q.set("referralId", args.referralId.trim());
  return `${args.base}?${q.toString()}`;
}

/**
 * Minimal searchable dropdown:
 * - input to search
 * - shows a popover list
 * - returns selected option
 */
function SearchSelect<T extends { label: string }>(props: {
  value: T | null;
  onChange: (v: T | null) => void;
  placeholder: string;
  loadOptions: (q: string) => Promise<T[]>;
  disabled?: boolean;
}) {
  const { value, onChange, placeholder, loadOptions, disabled } = props;

  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(value?.label ?? "");
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setQ(value?.label ?? "");
  }, [value]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  async function runSearch(nextQ: string) {
    setLoading(true);
    setErr(null);
    try {
      const res = await loadOptions(nextQ);
      setItems(res);
    } catch (e) {
      setItems([]);
      setErr(e instanceof Error ? e.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative" ref={wrapRef}>
      <input
        className={inputClass}
        placeholder={placeholder}
        value={q}
        disabled={disabled}
        onFocus={() => {
          setOpen(true);
          // load suggestions for current query
          void runSearch(q.trim());
        }}
        onChange={(e) => {
          const next = e.target.value;
          setQ(next);
          setOpen(true);
          void runSearch(next.trim());
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
      />

      {open && !disabled && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border bg-white shadow-lg max-h-56 overflow-auto">
          <div className="p-2 border-b flex items-center justify-between gap-2">
            <div className="text-xs text-slate-600">
              {loading ? "Searching..." : "Select"}
            </div>
            <button
              type="button"
              className="text-xs text-slate-600 hover:text-slate-900"
              onClick={() => {
                onChange(null);
                setQ("");
                setOpen(false);
              }}
            >
              Clear
            </button>
          </div>

          {err ? <div className="p-2 text-sm text-red-700">{err}</div> : null}

          {!loading && items.length === 0 ? (
            <div className="p-2 text-sm text-slate-600">No results</div>
          ) : null}

          {items.map((it, idx) => (
            <button
              key={idx}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
              onClick={() => {
                onChange(it);
                setQ(it.label);
                setOpen(false);
              }}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

async function fetchPatientOptions(q: string): Promise<PatientOption[]> {
  const url = `/api/doctor/patients/search?q=${encodeURIComponent(q || "")}`;
  const res = await fetch(url, { cache: "no-store" });
  const data = (await res.json().catch(() => ({}))) as {
    rows?: Array<{ patientCode: string; label: string }>;
    error?: string;
  };
  if (!res.ok) throw new Error(data?.error || "Failed to load patients");
  return (data.rows ?? []).map((r) => ({
    patientCode: String(r.patientCode),
    label: String(r.label),
  }));
}

async function fetchReferralOptions(
  q: string
): Promise<Array<ReferralOption & { label: string }>> {
  const url = `/api/referralperson/search?q=${encodeURIComponent(q || "")}`;
  const res = await fetch(url, { cache: "no-store" });
  const data = (await res.json().catch(() => ({}))) as {
    rows?: Array<{ id: string; name: string }>;
    error?: string;
  };
  if (!res.ok) throw new Error(data?.error || "Failed to load referrals");
  return (data.rows ?? []).map((r) => ({
    id: String(r.id),
    name: String(r.name),
    label: String(r.name),
  }));
}

function ReportCard(props: {
  title: string;
  subtitle: string;
  mode: "SUMMARY" | "PENDING";
}) {
  const def = useMemo(() => defaultRange(), []);
  const [start, setStart] = useState(def.start);
  const [end, setEnd] = useState(def.end);

  const [patient, setPatient] = useState<PatientOption | null>(null);
  const [referral, setReferral] = useState<
    (ReferralOption & { label: string }) | null
  >(null);
  const [testType, setTestType] = useState<TestType>("ALL");

  const [downloading, setDownloading] = useState<"XLSX" | "PDF" | null>(null);

  const canExport = Boolean(start && end);

  function triggerDownload(kind: "XLSX" | "PDF") {
    if (!canExport) return;

    setDownloading(kind);

    const base =
      kind === "XLSX"
        ? ("/api/doctor/reports/export/xlsx" as const)
        : ("/api/doctor/reports/export/pdf" as const);

    const url = buildExportUrl({
      base,
      start,
      end,
      mode: props.mode,
      patientCode: patient?.patientCode,
      referralId: referral?.id,
      testType,
    });

    // Trigger file download (same-origin, cookies included)
    window.location.href = url;

    // We can't know when the download finishes reliably.
    // Reset after a short delay to unblock UI.
    window.setTimeout(() => setDownloading(null), 1500);
  }

  return (
    <Card title={props.title} subtitle={props.subtitle}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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

        <div className="md:col-span-2">
          <div className="text-xs text-slate-600 mb-1">Choose Patient</div>
          <SearchSelect<PatientOption>
            value={patient}
            onChange={setPatient}
            placeholder="Search patient by name / patient id / phone..."
            loadOptions={fetchPatientOptions}
          />
          <div className="text-[11px] text-slate-500 mt-1">
            Selection uses <b>patient_code</b> for export filters.
          </div>
        </div>

        <div>
          <div className="text-xs text-slate-600 mb-1">Choose Referred By</div>
          <SearchSelect<ReferralOption & { label: string }>
            value={referral}
            onChange={setReferral}
            placeholder="Search referral person..."
            loadOptions={fetchReferralOptions}
          />
        </div>

        <div>
          <div className="text-xs text-slate-600 mb-1">Choose Test Type</div>
          <select
            className={inputClass}
            value={testType}
            onChange={(e) => setTestType(e.target.value as TestType)}
          >
            <option value="ALL">All</option>
            <option value="SCAN">Scan</option>
            <option value="PAP_SMEAR">PAP Smear</option>
            <option value="CTG">CTG</option>
            <option value="LAB_TEST">Lab Test</option>
          </select>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => triggerDownload("XLSX")}
          disabled={!canExport || downloading !== null}
          className="rounded-lg border bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {downloading === "XLSX" ? "Exporting..." : "Export to Excel"}
        </button>

        <button
          type="button"
          onClick={() => triggerDownload("PDF")}
          disabled={!canExport || downloading !== null}
          className="rounded-lg border bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {downloading === "PDF" ? "Exporting..." : "Export to PDF"}
        </button>
      </div>
    </Card>
  );
}

export default function DoctorReports() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <ReportCard
        title="Visit Summary Report"
        subtitle="Charged amounts by fee component (with totals row)."
        mode="SUMMARY"
      />

      <ReportCard
        title="Pending Bills Report"
        subtitle="Only outstanding (unpaid/partial) amounts by fee component."
        mode="PENDING"
      />
    </div>
  );
}
