import { requireRole } from "@/lib/rbac";

export default async function DoctorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole(["DOCTOR"]);
  return <>{children}</>;
}
