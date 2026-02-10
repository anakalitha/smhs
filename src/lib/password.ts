import bcrypt from "bcryptjs";

export async function hashPassword(password: string) {
  // 12 is a good balance for most servers
  const saltRounds = 12;
  return bcrypt.hash(password, saltRounds);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}
