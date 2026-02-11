import { useEffect, useState } from "react";

export type QueueStatus = "WAITING" | "NEXT" | "IN_ROOM" | "COMPLETED";

export type DoctorQueueRow = {
  visitId: number;
  visitDate: string;
  status: QueueStatus;
  tokenNo: number | null;

  patientDbId: number;
  patientCode: string;
  patientName: string;
  phone: string | null;
};

export function useDoctorQueue() {
  const [rows, setRows] = useState<DoctorQueueRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [searchApplied, setSearchApplied] = useState("");
  const [doctorId, setDoctorId] = useState<number | null>(null);

  async function load(nextSearch = searchApplied) {
    setLoading(true);
    setErr(null);
    try {
      const q = new URLSearchParams();
      if (nextSearch.trim()) q.set("search", nextSearch.trim());

      const res = await fetch(`/api/doctor/dashboard?${q.toString()}`, {
        cache: "no-store",
      });

      const data = (await res.json().catch(() => ({}))) as {
        todays?: DoctorQueueRow[];
        doctorId?: number | null;
        error?: string;
      };

      if (res.ok) setDoctorId(data.doctorId ?? null);

      if (!res.ok) {
        setErr(data?.error || "Failed to load today's queue.");
        setRows([]);
        return;
      }

      setRows((data.todays || []) as DoctorQueueRow[]);
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
    load(s);
  }

  function clearSearch() {
    setSearch("");
    setSearchApplied("");
    load("");
  }

  useEffect(() => {
    load("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    doctorId,
    rows,
    loading,
    err,

    search,
    setSearch,
    searchApplied,

    load,
    applySearch,
    clearSearch,
  };
}
