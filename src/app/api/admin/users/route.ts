import { NextResponse } from "next/server";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { getCurrentUser } from "@/lib/session";

type RoleIdRow = RowDataPacket & { id: number };
type BranchOrgRow = RowDataPacket & { organization_id: number };
type DoctorRow = RowDataPacket & { id: number; user_id: number | null };


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

  const branchIdNum = branchId as number;

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
        branch_id: branchIdNum,
      }
    );

    const userId = userRes.insertId;

    // Assign role
    await db.execute<ResultSetHeader>(
      `INSERT INTO user_roles (user_id, role_id) VALUES (:user_id, :role_id)`,
      { user_id: userId, role_id: roleId }
    );

    // If role is DOCTOR, ensure doctor profile exists and is linked to this user + branch
    if (roleName === "DOCTOR") {
      const phoneStr = typeof phone === "string" ? phone.trim() : "";
      const hasPhone = !!phoneStr;

      // Try to find an existing doctor record in this org+branch (prefer phone match, else name match)
      let doctorId: number | null = null;

      if (hasPhone) {
        const [drows] = await db.execute<DoctorRow[]>(
          `SELECT id, user_id
           FROM doctors
           WHERE organization_id = :org
             AND branch_id = :branch
             AND phone = :phone
           LIMIT 1`,
          { org: orgId, branch: branchIdNum, phone: phoneStr }
        );
        if (drows.length > 0) {
          doctorId = Number(drows[0].id);
          const existingUserId = drows[0].user_id == null ? null : Number(drows[0].user_id);
          if (existingUserId != null && existingUserId !== Number(userId)) {
            return NextResponse.json(
              { error: "Doctor profile is already linked to another user." },
              { status: 400 }
            );
          }
          if (existingUserId == null) {
            await db.execute<ResultSetHeader>(
              `UPDATE doctors SET user_id = :userId WHERE id = :id`,
              { userId, id: doctorId }
            );
          }
        }
      }

      if (!doctorId) {
        const [drows2] = await db.execute<DoctorRow[]>(
          `SELECT id, user_id
           FROM doctors
           WHERE organization_id = :org
             AND branch_id = :branch
             AND full_name = :name
           LIMIT 1`,
          { org: orgId, branch: branchIdNum, name: fullName }
        );
        if (drows2.length > 0) {
          doctorId = Number(drows2[0].id);
          const existingUserId = drows2[0].user_id == null ? null : Number(drows2[0].user_id);
          if (existingUserId != null && existingUserId !== Number(userId)) {
            return NextResponse.json(
              { error: "Doctor profile is already linked to another user." },
              { status: 400 }
            );
          }
          if (existingUserId == null) {
            await db.execute<ResultSetHeader>(
              `UPDATE doctors SET user_id = :userId WHERE id = :id`,
              { userId, id: doctorId }
            );
          }
        }
      }

      if (!doctorId) {
        const [docRes] = await db.execute<ResultSetHeader>(
          `INSERT INTO doctors (organization_id, branch_id, full_name, phone, user_id, is_active)
           VALUES (:org, :branch, :name, :phone, :userId, 1)`,
          { org: orgId, branch: branchIdNum, name: fullName, phone: phoneStr || null, userId }
        );
        doctorId = Number(docRes.insertId);
      }

      // New multi-branch mapping tables (safe even if you still rely on doctors.user_id in legacy code)
      await db.execute<ResultSetHeader>(
        `INSERT IGNORE INTO doctor_users (organization_id, doctor_id, user_id, is_active)
         VALUES (:org, :doctorId, :userId, 1)`,
        { org: orgId, doctorId, userId }
      );

      await db.execute<ResultSetHeader>(
        `INSERT IGNORE INTO doctor_branch_assignments (organization_id, doctor_id, branch_id, is_active)
         VALUES (:org, :doctorId, :branch, 1)`,
        { org: orgId, doctorId, branch: branchIdNum }
      );
    }

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
