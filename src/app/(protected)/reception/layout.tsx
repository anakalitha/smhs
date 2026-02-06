// src\app\(protected)\reception\layout.tsx
import { requireRole } from "@/lib/rbac";

export default async function ReceptionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole(["RECEPTION"]);
  return <>{children}</>;
}
