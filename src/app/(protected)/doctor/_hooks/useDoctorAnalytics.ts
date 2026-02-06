// src/app/(protected)/doctor/_hooks/useDoctorAnalytics.ts
"use client";

import { useCallback, useMemo, useState } from "react";

export type AnalyticsResponse = {
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

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function defaultAnalyticsRange() {
  return { start: "2024-01-01", end: ymd(new Date()) };
}

function clampYmd(raw: string) {
  // Accept YYYY-MM-DD only (input[type=date] already gives this, but keep safe)
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : ymd(new Date());
}

type AnalyticsApiError = { error?: string };

export function useDoctorAnalytics() {
  const [range, setRange] = useState(() => defaultAnalyticsRange());
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const setStart = useCallback((start: string) => {
    setRange((r) => ({ ...r, start: clampYmd(start) }));
  }, []);

  const setEnd = useCallback((end: string) => {
    setRange((r) => ({ ...r, end: clampYmd(end) }));
  }, []);

  const load = useCallback(
    async (args?: { start?: string; end?: string }) => {
      const start = clampYmd(args?.start ?? range.start);
      const end = clampYmd(args?.end ?? range.end);

      setLoading(true);
      setErr(null);

      try {
        const q = new URLSearchParams({ start, end });
        const res = await fetch(`/api/doctor/analytics?${q.toString()}`, {
          cache: "no-store",
        });

        const json = (await res.json().catch(() => ({}))) as
          | AnalyticsResponse
          | AnalyticsApiError;

        if (!res.ok) {
          setErr(
            "error" in json && json.error
              ? json.error
              : "Failed to load analytics."
          );
          setData(null);
          return;
        }

        setData(json as AnalyticsResponse);
      } catch {
        setErr("Network error.");
        setData(null);
      } finally {
        setLoading(false);
      }
    },
    [range.start, range.end]
  );

  const feeChartData = useMemo(() => {
    const ALL_FEE_TYPES = [
      "CONSULTATION",
      "SCAN",
      "CTG",
      "PAP_SMEAR",
      "PHARMACY",
      "LAB", // ✅ add if your API returns it
    ];

    const map = new Map<string, number>();
    (data?.feeBreakdown ?? []).forEach((f) => {
      map.set(String(f.feeType), Number(f.totalAmount ?? 0));
    });

    return ALL_FEE_TYPES.map((t) => ({
      name: t,
      amount: map.get(t) ?? 0,
    }));
  }, [data]);

  const referralChartData = useMemo(() => {
    if (!data) return [];
    return data.topReferrals.slice(0, 5).map((r) => ({
      name: r.referralName,
      count: Number(r.cnt ?? 0),
    }));
  }, [data]);

  return {
    range,
    setStart,
    setEnd,
    data,
    loading,
    err,
    load,
    feeChartData,
    referralChartData,
  };
}
