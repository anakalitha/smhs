import { requireRole } from "@/lib/rbac";
import { db } from "@/lib/db";
import type { RowDataPacket } from "mysql2/promise";
import CreateUserForm from "./create-user-form";

type RoleRow = RowDataPacket & { name: string };
type BranchRow = RowDataPacket & { id: number; name: string };

export default async function AdminCreateUserPage() {
  const me = await requireRole(["SUPER_ADMIN", "ADMIN"]);

  // Roles list (you may filter which roles can be created)
  const [roleRows] = await db.execute<RoleRow[]>(
    `SELECT name FROM roles ORDER BY name`
  );

  // For branch scoping:
  // - SUPER_ADMIN can choose a branch within their org
  // - ADMIN is locked to their own branch (we still fetch it for display)
  let branches: BranchRow[] = [];

  if (me.organizationId) {
    const [branchRows] = await db.execute<BranchRow[]>(
      `SELECT id, name
       FROM branches
       WHERE organization_id = :org_id AND is_active = 1
       ORDER BY name`,
      { org_id: me.organizationId }
    );
    branches = branchRows;
  }

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold">Create User</h1>
      <p className="text-gray-600 mt-1">
        Create staff users and assign roles (Admin-only).
      </p>

      <div className="mt-6 max-w-2xl">
        <CreateUserForm
          myRoles={me.roles}
          myOrgId={me.organizationId}
          myBranchId={me.branchId}
          roles={roleRows.map((r) => r.name)}
          branches={branches}
        />
      </div>
    </div>
  );
}
