// src/lib/datetime.ts

const IST_TIMEZONE = "Asia/Kolkata";

/**
 * Returns today's date in YYYY-MM-DD for IST,
 * safe on both server (UTC) and client.
 */
export function todayISTYYYYMMDD(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * Strict ISO date (YYYY-MM-DD) validation incl. real calendar date.
 */
export function isValidISODate(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;

  const [y, m, d] = dateStr.split("-").map(Number);
  if (m < 1 || m > 12) return false;

  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d >= 1 && d <= daysInMonth;
}

export type VisitDateValidationOptions = {
  allowFuture?: boolean; // default false
  allowToday?: boolean; // default true
};

/**
 * Central visit-date validator for OPD flows.
 */
export function validateVisitDate(
  visitDate: string | null | undefined,
  opts: VisitDateValidationOptions = {}
): { ok: true } | { ok: false; error: string } {
  const { allowFuture = false, allowToday = true } = opts;

  if (!visitDate || visitDate.trim() === "") {
    return { ok: false, error: "Visit date is required." };
  }

  if (!isValidISODate(visitDate)) {
    return { ok: false, error: "Visit date must be in YYYY-MM-DD format." };
  }

  const today = todayISTYYYYMMDD();

  if (!allowToday && visitDate === today) {
    return { ok: false, error: "Visit date cannot be today." };
  }

  if (!allowFuture && visitDate > today) {
    return { ok: false, error: "Visit date cannot be in the future." };
  }

  return { ok: true };
}

export function formatISTDate(
  value: string | Date | null | undefined,
  fallback = "—"
): string {
  if (!value) return fallback;

  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return fallback;

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}
