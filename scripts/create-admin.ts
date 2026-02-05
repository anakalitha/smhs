import "dotenv/config";
import { db } from "../src/lib/db";
import { hashPassword } from "../src/lib/password";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";

type RoleRow = RowDataPacket & { id: number };

async function main() {
  // console.log("DB_USER=", process.env.DB_USER);
  // console.log("DB_PASSWORD set?", !!process.env.DB_PASSWORD);

  const fullName = "System Admin";
  const email = "admin@smnh.local";
  const password = "ChangeMe@123";

  const passwordHash = await hashPassword(password);

  // Insert user
  const [userResult] = await db.execute<ResultSetHeader>(
    `INSERT INTO users (full_name, email, password_hash, must_change_password)
     VALUES (:full_name, :email, :password_hash, 1)`,
    { full_name: fullName, email, password_hash: passwordHash }
  );

  const userId = userResult.insertId;

  // Fetch ADMIN role id
  const [roleRows] = await db.execute<RoleRow[]>(
    `SELECT id FROM roles WHERE name = :name LIMIT 1`,
    { name: "ADMIN" }
  );

  if (roleRows.length === 0) {
    throw new Error("ADMIN role not found. Did you seed the roles table?");
  }

  const roleId = roleRows[0].id;

  // Link user to role
  await db.execute<ResultSetHeader>(
    `INSERT INTO user_roles (user_id, role_id)
     VALUES (:user_id, :role_id)`,
    { user_id: userId, role_id: roleId }
  );

  // console.log("✅ Admin created");
  // console.log("Email:", email);
  // console.log("Temp password:", password);
  process.exit(0);
}

main().catch((e) => {
  console.error("❌ Failed to create admin:", e);
  process.exit(1);
});
