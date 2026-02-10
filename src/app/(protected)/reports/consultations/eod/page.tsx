// src/app/(protected)/reports/consultations/eod/page.tsx
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import EodConsultationsClient from "./EodConsultationsClient";

export default async function EodConsultationsPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");

  const allowed =
    me.roles.includes("RECEPTION") ||
    me.roles.includes("ADMIN") ||
    me.roles.includes("SUPER_ADMIN");

  if (!allowed) {
    return <div className="p-6">Forbidden.</div>;
  }

  return <EodConsultationsClient />;
}
