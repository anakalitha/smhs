import { requireUser } from "@/lib/rbac";
import Header from "../../components/header/Header";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  return (
    <div className="min-h-screen">
      <Header user={user} />
      <main>{children}</main>
    </div>
  );
}
