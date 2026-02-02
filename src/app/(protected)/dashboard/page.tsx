import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { firstDashboardForRoles } from "@/lib/rbac";

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  redirect(firstDashboardForRoles(user.roles));
}
