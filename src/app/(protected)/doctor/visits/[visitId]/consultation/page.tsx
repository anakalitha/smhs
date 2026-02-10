// src\app\(protected)\doctor\visits\[visitId]\consultation\page.tsx
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import ConsultationClient from "./ConsultationClient";

export default async function ConsultationPage(props: {
  params: Promise<{ visitId: string }>;
}) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");

  const allowed =
    me.roles.includes("DOCTOR") ||
    me.roles.includes("ADMIN") ||
    me.roles.includes("SUPER_ADMIN");

  if (!allowed) {
    return <div className="p-6">Forbidden.</div>;
  }

  const { visitId } = await props.params;

  return <ConsultationClient visitId={Number(visitId)} />;
}
