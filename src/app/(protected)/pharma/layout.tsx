import { requireRole } from "@/lib/rbac";

export default async function PharmaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole(["PHARMA_IN_CHARGE"]);
  return <>{children}</>;
}
