import { NextResponse } from "next/server";
import type { ResultSetHeader } from "mysql2/promise";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

type Ctx = { params: Promise<{ patientCode: string }> };

function hasAnyRole(me: { roles: string[] }, roles: string[]) {
  return roles.some((r) => me.roles.includes(r));
}

function canEditPatient(me: { roles: string[] }) {
  return hasAnyRole(me, ["RECEPTION", "ADMIN", "SUPER_ADMIN", "DATA_ENTRY"]);
}

function isValidPhone(phone: string) {
  // allow empty, allow digits/+/-/space
  return /^[0-9+\-\s]{7,20}$/.test(phone);
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function PUT(req: Request, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEditPatient(me))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { patientCode } = await ctx.params;
  const code = String(patientCode ?? "").trim();
  if (!code)
    return NextResponse.json(
      { error: "Invalid patient code." },
      { status: 400 }
    );

  const body = (await req.json().catch(() => ({}))) as Partial<{
    fullName: string;
    phone: string | null;
    dob: string | null;
    gender: "MALE" | "FEMALE" | "OTHER" | null;
    bloodGroup: "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-" | null;
    email: string | null;

    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    state: string | null;
    pincode: string | null;

    emergencyContactName: string | null;
    emergencyContactRelationship: string | null;
    emergencyContactPhone: string | null;
  }>;

  const fullName = (body.fullName ?? "").trim();
  if (!fullName)
    return NextResponse.json(
      { error: "Full name is required." },
      { status: 400 }
    );

  const phone = body.phone?.trim() || null;
  if (phone && !isValidPhone(phone))
    return NextResponse.json({ error: "Invalid phone." }, { status: 400 });

  const email = body.email?.trim() || null;
  if (email && !isValidEmail(email))
    return NextResponse.json({ error: "Invalid email." }, { status: 400 });

  const [res] = await db.execute<ResultSetHeader>(
    `
    UPDATE patients
    SET
      full_name = :full_name,
      phone = :phone,
      dob = :dob,
      gender = :gender,
      blood_group = :blood_group,
      email = :email,
      address_line1 = :address_line1,
      address_line2 = :address_line2,
      city = :city,
      state = :state,
      pincode = :pincode,
      emergency_contact_name = :ecn,
      emergency_contact_relationship = :ecr,
      emergency_contact_phone = :ecp
    WHERE patient_code = :code
    LIMIT 1
    `,
    {
      code,
      full_name: fullName,
      phone,
      dob: body.dob || null,
      gender: body.gender || null,
      blood_group: body.bloodGroup || null,
      email,
      address_line1: body.addressLine1?.trim() || null,
      address_line2: body.addressLine2?.trim() || null,
      city: body.city?.trim() || null,
      state: body.state?.trim() || null,
      pincode: body.pincode?.trim() || null,
      ecn: body.emergencyContactName?.trim() || null,
      ecr: body.emergencyContactRelationship?.trim() || null,
      ecp: body.emergencyContactPhone?.trim() || null,
    }
  );

  if (res.affectedRows === 0)
    return NextResponse.json({ error: "Patient not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
