// src/app/(protected)/reception/patients/[patientCode]/page.tsx
import ReceptionPatientSummaryClient from "./ReceptionPatientSummaryClient";

type Ctx = { params: Promise<{ patientCode: string }> };

export default async function ReceptionPatientSummaryPage(ctx: Ctx) {
  const { patientCode } = await ctx.params;
  return <ReceptionPatientSummaryClient patientCode={patientCode} />;
}
