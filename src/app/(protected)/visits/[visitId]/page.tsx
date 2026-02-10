// src/app/(protected)/visits/[visitId]/page.tsx
import VisitSummaryClient from "./VisitSummaryClient";

export default async function VisitSummaryPage({
  params,
}: {
  params: Promise<{ visitId: string }>;
}) {
  const { visitId } = await params;
  return <VisitSummaryClient visitId={Number(visitId)} />;
}
