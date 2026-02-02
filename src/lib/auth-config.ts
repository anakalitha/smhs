export const SESSION_COOKIE_NAME =
  process.env.SESSION_COOKIE_NAME || "smnh_hms_session";

export const SESSION_TTL_DAYS = Number(process.env.SESSION_TTL_DAYS || 7);

export function sessionTtlMs() {
  return SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;
}
