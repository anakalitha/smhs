import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import CommonReportsClient from "./CommonReportsClient";

export default async function CommonReportsPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");

  const allowed =
    me.roles.includes("RECEPTION") ||
    me.roles.includes("DOCTOR") ||
    me.roles.includes("ADMIN") ||
    me.roles.includes("SUPER_ADMIN");

  if (!allowed) return <div className="p-6">Forbidden.</div>;

  return <CommonReportsClient roles={me.roles} />;
}
