import { requireRole } from "@/lib/rbac";

export default async function ScanLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole(["SCAN_IN_CHARGE"]);
  return <>{children}</>;
}
