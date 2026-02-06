export type SanitizeDecimalOptions = {
  maxIntDigits: number; // digits before decimal
  maxDecimals: number; // digits after decimal
  max?: number; // optional numeric cap (e.g. 9999.99)
};

export function sanitizeDecimalInput(
  raw: string,
  { maxIntDigits, maxDecimals, max }: SanitizeDecimalOptions
): string {
  if (!raw) return "";

  // allow only digits and dot
  let v = raw.replace(/[^0-9.]/g, "");

  // allow only one dot
  const dotIndex = v.indexOf(".");
  if (dotIndex !== -1) {
    v = v.slice(0, dotIndex + 1) + v.slice(dotIndex + 1).replace(/\./g, "");
  }

  const [intRaw = "", decRaw = ""] = v.split(".");

  // trim integer and decimal parts
  const intPart = intRaw.slice(0, maxIntDigits);
  const decPart = decRaw.slice(0, maxDecimals);

  v = dotIndex !== -1 ? `${intPart}.${decPart}` : intPart;

  // enforce numeric max if provided
  if (max !== undefined) {
    const n = Number(v);
    if (Number.isFinite(n) && n > max) {
      return max.toFixed(maxDecimals);
    }
  }

  return v;
}
