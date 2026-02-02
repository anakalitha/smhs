import { NextResponse } from "next/server";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { getCurrentUser } from "@/lib/session";

type RoleIdRow = RowDataPacket & { id: number };
type BranchOrgRow = RowDataPacket & { organization_id: number };

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isSuperAdmin = me.roles.includes("SUPER_ADMIN");
  const isAdmin = me.roles.includes("ADMIN");

  if (!isSuperAdmin && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as {
    fullName?: string;
    email?: string;
    phone?: string | null;
    role?: string;
    branchId?: number | null;
    password?: string;
  };

  const fullName = (body.fullName || "").trim();
  const email = (body.email || "").trim().toLowerCase();
  const phone = body.phone ?? null;
  const roleName = (body.role || "").trim();
  const requestedBranchId = body.branchId ?? null;
  const password = (body.password || "").trim();
  if (!password) {
    return NextResponse.json(
      { error: "Password is required." },
      { status: 400 }
    );
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters." },
      { status: 400 }
    );
  }

  if (!fullName || !email || !roleName) {
    return NextResponse.json(
      { error: "Missing required fields." },
      { status: 400 }
    );
  }

  if (!me.organizationId) {
    return NextResponse.json(
      { error: "Your account is not linked to an organization." },
      { status: 400 }
    );
  }

  // Determine org/branch to assign
  const orgId = me.organizationId;

  let branchId: number | null = null;

  if (isSuperAdmin) {
    if (!requestedBranchId) {
      return NextResponse.json(
        { error: "Branch is required." },
        { status: 400 }
      );
    }

    // Ensure requested branch belongs to same org
    const [brows] = await db.execute<BranchOrgRow[]>(
      `SELECT organization_id FROM branches WHERE id = :id LIMIT 1`,
      { id: requestedBranchId }
    );
    if (brows.length === 0 || brows[0].organization_id !== orgId) {
      return NextResponse.json(
        { error: "Invalid branch for your organization." },
        { status: 400 }
      );
    }
    branchId = requestedBranchId;
  } else {
    // Branch ADMIN can only create users in their own branch
    if (!me.branchId) {
      return NextResponse.json(
        { error: "Your account is not linked to a branch." },
        { status: 400 }
      );
    }
    branchId = me.branchId;
  }

  // Optional hard rule: Only SUPER_ADMIN can create ADMIN/SUPER_ADMIN
  if (!isSuperAdmin && (roleName === "ADMIN" || roleName === "SUPER_ADMIN")) {
    return NextResponse.json(
      { error: "Only SUPER_ADMIN can create admin users." },
      { status: 403 }
    );
  }

  // Get role id
  const [roleRows] = await db.execute<RoleIdRow[]>(
    `SELECT id FROM roles WHERE name = :name LIMIT 1`,
    { name: roleName }
  );
  if (roleRows.length === 0) {
    return NextResponse.json({ error: "Invalid role." }, { status: 400 });
  }
  const roleId = roleRows[0].id;

  const passwordHash = await hashPassword(password);

  try {
    // Create user
    const [userRes] = await db.execute<ResultSetHeader>(
      `INSERT INTO users (full_name, email, phone, password_hash, must_change_password, is_active, organization_id, branch_id)
       VALUES (:full_name, :email, :phone, :password_hash, 0, 1, :org_id, :branch_id)`,
      {
        full_name: fullName,
        email,
        phone,
        password_hash: passwordHash,
        org_id: orgId,
        branch_id: branchId,
      }
    );

    const userId = userRes.insertId;

    // Assign role
    await db.execute<ResultSetHeader>(
      `INSERT INTO user_roles (user_id, role_id) VALUES (:user_id, :role_id)`,
      { user_id: userId, role_id: roleId }
    );

    return NextResponse.json({
      ok: true,
      id: userId,
      email,
    });
  } catch (e: unknown) {
    let msg = "Failed to create user.";

    if (
      typeof e === "object" &&
      e !== null &&
      "code" in e &&
      typeof (e as { code: unknown }).code === "string"
    ) {
      if ((e as { code: string }).code === "ER_DUP_ENTRY") {
        msg = "Email already exists.";
      }
    }

    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
