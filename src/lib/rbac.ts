import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";

export type Role =
  | "SUPER_ADMIN"
  | "ADMIN"
  | "DOCTOR"
  | "DATA_ENTRY"
  | "RECEPTION"
  | "SCAN_IN_CHARGE";

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireRole(allowed: Role[]) {
  const user = await requireUser();
  const ok = user.roles.some((r) => allowed.includes(r as Role));
  if (!ok) redirect("/unauthorized");
  return user;
}

export function firstDashboardForRoles(roles: string[]) {
  if (roles.includes("SUPER_ADMIN")) return "/admin";
  if (roles.includes("ADMIN")) return "/admin";
  if (roles.includes("DOCTOR")) return "/doctor";
  if (roles.includes("DATA_ENTRY")) return "/data-entry";
  if (roles.includes("RECEPTION")) return "/reception";
  if (roles.includes("SCAN_IN_CHARGE")) return "/scan";
  return "/unauthorized";
}
