import { NextResponse } from "next/server";
import { revokeCurrentSession } from "@/lib/session";

export async function POST() {
  await revokeCurrentSession();
  return NextResponse.json({ ok: true });
}
