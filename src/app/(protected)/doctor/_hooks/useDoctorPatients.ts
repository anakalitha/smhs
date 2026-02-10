import { useEffect, useMemo, useState } from "react";

export type MyPatientRow = {
  patientDbId: number;
  patientCode: string;
  name: string;
  phone: string | null;
  lastVisit: string; // ISO
  totalVisits: number;
};

function clampPage(n: number) {
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}

const ALLOWED_PAGE_SIZES = [5, 10, 15, 20, 25] as const;
type PageSize = (typeof ALLOWED_PAGE_SIZES)[number];

function isPageSize(n: number): n is PageSize {
  return (ALLOWED_PAGE_SIZES as readonly number[]).includes(n);
}

export function useDoctorPatients(initialPageSize = 15) {
  const [rows, setRows] = useState<MyPatientRow[]>([]);
  const [total, setTotal] = useState(0);

  const [page, setPage] = useState(1);

  const [pageSize, setPageSize] = useState<PageSize>(() => {
    const n = Number(initialPageSize);
    return isPageSize(n) ? n : 15;
  });

  const [search, setSearch] = useState("");
  const [searchApplied, setSearchApplied] = useState("");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / pageSize)),
    [total, pageSize]
  );

  async function load(args?: {
    search?: string;
    page?: number;
    pageSize?: number;
  }) {
    const nextSearch = (args?.search ?? searchApplied).trim();
    const nextPageSize: PageSize = (args?.pageSize ?? pageSize) as PageSize;
    const nextPage = clampPage(args?.page ?? page);

    setLoading(true);
    setErr(null);

    try {
      const q = new URLSearchParams({
        search: nextSearch,
        page: String(nextPage),
        pageSize: String(nextPageSize),
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
        setErr(data?.error || "Failed to load patients.");
        setRows([]);
        setTotal(0);
        return;
      }

      setRows((data.rows || []) as MyPatientRow[]);
      setTotal(Number(data.total ?? 0));
      setPage(Number(data.page ?? nextPage));

      const serverPageSizeRaw = Number(data.pageSize ?? nextPageSize);
      const serverPageSize: PageSize = isPageSize(serverPageSizeRaw)
        ? serverPageSizeRaw
        : nextPageSize;

      setPageSize(serverPageSize);
    } catch {
      setErr("Network error.");
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }

  function applySearch() {
    const s = search.trim();
    setSearchApplied(s);
    setPage(1);
    load({ search: s, page: 1 });
  }

  function clearSearch() {
    setSearch("");
    setSearchApplied("");
    setPage(1);
    load({ search: "", page: 1 });
  }

  function goToPage(next: number) {
    const p = Math.min(Math.max(1, next), totalPages);
    setPage(p);
    load({ search: searchApplied, page: p });
  }

  function changePageSize(nextSize: number) {
    const n = Number(nextSize);
    const safe: PageSize = isPageSize(n) ? n : 15;

    setPageSize(safe);
    setPage(1);
    load({ search: searchApplied, page: 1, pageSize: safe });
  }

  useEffect(() => {
    load({ search: "", page: 1, pageSize });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    rows,
    total,
    page,
    pageSize,
    totalPages,

    search,
    setSearch,
    searchApplied,

    loading,
    err,

    load,
    applySearch,
    clearSearch,
    goToPage,

    changePageSize,
    allowedPageSizes: ALLOWED_PAGE_SIZES as unknown as number[],
  };
}
