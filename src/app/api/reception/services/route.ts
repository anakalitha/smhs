import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";

import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

type ServiceRow = RowDataPacket & {
  id: number;
  code: string;
  display_name: string;
  rate: number;
};

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const allowed =
    me.roles.includes("RECEPTION") ||
    me.roles.includes("ADMIN") ||
    me.roles.includes("SUPER_ADMIN") ||
    me.roles.includes("DOCTOR") ||
    me.roles.includes("DATA_ENTRY");

  if (!allowed)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!me.organizationId || !me.branchId) {
    return NextResponse.json(
      { error: "Your account is not linked to organization/branch." },
      { status: 400 }
    );
  }

  const [rows] = await db.execute<ServiceRow[]>(
    `
    SELECT
      s.id,
      s.code,
      s.display_name,
      r.rate
    FROM services s
    JOIN service_rates r ON r.service_id = s.id
    WHERE s.is_active = 1
      AND r.is_active = 1
      AND s.organization_id = :org_id
      AND r.branch_id = :branch_id
    ORDER BY s.display_name ASC
    `,
    { org_id: me.organizationId, branch_id: me.branchId }
  );

  return NextResponse.json({
    ok: true,
    services: rows.map((s) => ({
      id: Number(s.id),
      code: String(s.code),
      displayName: String(s.display_name),
      rate: Number(s.rate),
    })),
  });
}
