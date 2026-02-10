import { requireRole } from "@/lib/rbac";

export default async function DataEntryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole(["DATA_ENTRY"]);
  return <>{children}</>;
}
