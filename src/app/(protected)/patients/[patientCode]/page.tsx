// src/app/(protected)/patients/[patientCode]/page.tsx

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import PatientSummaryClient from "./PatientSummaryClient";

type Ctx = { params: Promise<{ patientCode: string }> };

export default async function PatientSummaryPage({ params }: Ctx) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");

  const { patientCode: patientCodeParam } = await params;
  const patientCode = String(patientCodeParam ?? "").trim();

  if (!patientCode) {
    return <div className="p-6">Invalid patient code.</div>;
  }

  return <PatientSummaryClient patientCode={patientCode} />;
}
