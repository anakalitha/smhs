// src\app\(protected)\doctor\_hooks\useDoctorReports.ts
import { useMemo, useState } from "react";

export type ReportRow = {
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

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function defaultReportRange() {
  return { start: "2024-01-01", end: ymd(new Date()) };
}

function safeStr(v: unknown) {
  return v == null ? "" : String(v);
}

function contains(hay: string, needle: string) {
  return hay.toLowerCase().includes(needle.toLowerCase());
}

export function useDoctorReports(pageSize = 20) {
  const def = defaultReportRange();

  // server filters
  const [start, setStart] = useState(def.start);
  const [end, setEnd] = useState(def.end);
  const [referralId, setReferralId] = useState("");

  // server result
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // client filter
  const [search, setSearch] = useState("");
  const [searchApplied, setSearchApplied] = useState("");

  // client pagination
  const [page, setPage] = useState(1);

  async function runReport() {
    setLoading(true);
    setErr(null);

    try {
      const q = new URLSearchParams({ start, end });
      if (referralId.trim()) q.set("referralId", referralId.trim());

      const res = await fetch(`/api/doctor/reports?${q.toString()}`, {
        cache: "no-store",
      });

      const data = (await res.json().catch(() => ({}))) as {
        rows?: ReportRow[];
        error?: string;
      };

      if (!res.ok) {
        setErr(data?.error || "Failed to run report.");
        setRows([]);
        return;
      }

      setRows((data.rows || []) as ReportRow[]);

      // reset local search/pagination for new dataset
      setSearch("");
      setSearchApplied("");
      setPage(1);
    } catch {
      setErr("Network error.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  function applySearch() {
    const s = search.trim();
    setSearchApplied(s);
    setPage(1);
  }

  function clearSearch() {
    setSearch("");
    setSearchApplied("");
    setPage(1);
  }

  const filtered = useMemo(() => {
    const s = searchApplied.trim();
    if (!s) return rows;

    return rows.filter((r) => {
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
  }, [rows, searchApplied]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const pageRows = useMemo(() => {
    const p = Math.min(Math.max(1, page), totalPages);
    const startIdx = (p - 1) * pageSize;
    return filtered.slice(startIdx, startIdx + pageSize);
  }, [filtered, page, totalPages, pageSize]);

  function goToPage(next: number) {
    const p = Math.min(Math.max(1, next), totalPages);
    setPage(p);
  }

  return {
    // server filters
    start,
    setStart,
    end,
    setEnd,
    referralId,
    setReferralId,

    // result
    rows,
    loading,
    err,

    runReport,

    // client search
    search,
    setSearch,
    searchApplied,
    applySearch,
    clearSearch,

    // paging + derived
    page,
    total,
    totalPages,
    pageRows,
    filtered,

    goToPage,

    // constants
    pageSize,
  };
}
