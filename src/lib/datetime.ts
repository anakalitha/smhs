// src/lib/datetime.ts

/**
 * Convert a UTC-ish Date/string (ex: "2024-08-04T18:30:00.000Z" or Date object)
 * to IST in "DD/MM/YYYY HH:mm:ss" (24h) format.
 *
 * Notes:
 * - If input is already a JS Date, it still formats it in Asia/Kolkata.
 * - If input is null/empty/invalid, returns "—".
 */
export function formatISTDateTime(
  value: string | Date | null | undefined,
  fallback = "—"
): string {
  if (!value) return fallback;

  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return fallback;

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";

  // en-GB already gives DD/MM/YYYY, but using parts avoids any locale quirks.
  const dd = get("day");
  const mm = get("month");
  const yyyy = get("year");
  const hh = get("hour");
  const min = get("minute");
  const ss = get("second");

  return `${dd}/${mm}/${yyyy} ${hh}:${min}:${ss}`;
}

/**
 * If you also want a date-only formatter for visit_date etc.
 */
export function formatISTDate(
  value: string | Date | null | undefined,
  fallback = "—"
): string {
  if (!value) return fallback;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return fallback;

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(d);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";

  return `${get("day")}/${get("month")}/${get("year")}`;
}

export function todayLocalYYYYMMDD() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
