import { NextResponse } from "next/server";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { db } from "@/lib/db";
import { getCurrentUser, type CurrentUser } from "@/lib/session";
import path from "path";
import fs from "fs/promises";

type Ctx = { params: Promise<{ visitId: string }> };

function isAllowed(me: { roles: string[] }) {
  return (
    me.roles.includes("RECEPTION") ||
    me.roles.includes("DOCTOR") ||
    me.roles.includes("ADMIN") ||
    me.roles.includes("SUPER_ADMIN")
  );
}

function mustHaveOrgBranch(me: CurrentUser) {
  const orgId = me.organizationId != null ? Number(me.organizationId) : NaN;
  const branchId = me.branchId != null ? Number(me.branchId) : NaN;
  return { orgId, branchId };
}

type VisitScopeRow = RowDataPacket & {
  organization_id: number;
  branch_id: number;
  doctor_id: number | null;
};

function sanitizeCategory(x: string) {
  const v = String(x || "")
    .trim()
    .toUpperCase();
  if (v === "REPORT" || v === "BILL" || v === "NOTE" || v === "OTHER") return v;
  return "REPORT";
}

function isAllowedMime(mime: string) {
  return (
    mime === "application/pdf" || mime === "image/jpeg" || mime === "image/png"
  );
}

export async function GET(req: Request, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAllowed(me))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { orgId, branchId } = mustHaveOrgBranch(me);
  if (!Number.isFinite(orgId) || !Number.isFinite(branchId)) {
    return NextResponse.json(
      { error: "Your account is not linked to organization/branch." },
      { status: 400 }
    );
  }

  const { visitId } = await ctx.params;
  const vid = Number(visitId);
  if (!Number.isFinite(vid) || vid <= 0) {
    return NextResponse.json({ error: "Invalid visit id." }, { status: 400 });
  }

  const [vRows] = await db.execute<VisitScopeRow[]>(
    `SELECT organization_id, branch_id, doctor_id FROM visits WHERE id = :vid LIMIT 1`,
    { vid }
  );
  if (vRows.length === 0)
    return NextResponse.json({ error: "Visit not found." }, { status: 404 });

  const v = vRows[0];
  if (Number(v.organization_id) !== orgId || Number(v.branch_id) !== branchId)
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  if (me.roles.includes("DOCTOR")) {
    const myDoctorId = me.doctorId != null ? Number(me.doctorId) : NaN;
    if (
      !Number.isFinite(myDoctorId) ||
      Number(v.doctor_id ?? 0) !== myDoctorId
    ) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
  }

  const [rows] = await db.execute<RowDataPacket[]>(
    `
    SELECT id, category, file_url, original_name, uploaded_at
    FROM visit_documents
    WHERE visit_id = :vid
    ORDER BY uploaded_at DESC
    `,
    { vid }
  );

  return NextResponse.json({
    ok: true,
    documents: rows.map((r) => ({
      id: Number(r.id),
      category: String(r.category),
      fileUrl: String(r.file_url),
      originalName: r.original_name ?? null,
      uploadedAt: String(r.uploaded_at),
    })),
  });
}

export async function POST(req: Request, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAllowed(me))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { orgId, branchId } = mustHaveOrgBranch(me);
  if (!Number.isFinite(orgId) || !Number.isFinite(branchId)) {
    return NextResponse.json(
      { error: "Your account is not linked to organization/branch." },
      { status: 400 }
    );
  }

  const { visitId } = await ctx.params;
  const vid = Number(visitId);
  if (!Number.isFinite(vid) || vid <= 0) {
    return NextResponse.json({ error: "Invalid visit id." }, { status: 400 });
  }

  const [vRows] = await db.execute<VisitScopeRow[]>(
    `SELECT organization_id, branch_id, doctor_id FROM visits WHERE id = :vid LIMIT 1`,
    { vid }
  );
  if (vRows.length === 0)
    return NextResponse.json({ error: "Visit not found." }, { status: 404 });

  const v = vRows[0];
  if (Number(v.organization_id) !== orgId || Number(v.branch_id) !== branchId)
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  if (me.roles.includes("DOCTOR")) {
    const myDoctorId = me.doctorId != null ? Number(me.doctorId) : NaN;
    if (
      !Number.isFinite(myDoctorId) ||
      Number(v.doctor_id ?? 0) !== myDoctorId
    ) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
  }

  const form = await req.formData();
  const file = form.get("file");
  const category = sanitizeCategory(String(form.get("category") || "REPORT"));

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required." }, { status: 400 });
  }

  const mime = file.type || "application/octet-stream";
  if (!isAllowedMime(mime)) {
    return NextResponse.json(
      { error: "Only PDF/JPG/PNG allowed." },
      { status: 400 }
    );
  }

  const size = Number(file.size || 0);
  if (size > 5 * 1024 * 1024) {
    return NextResponse.json(
      { error: "Max file size is 5MB." },
      { status: 400 }
    );
  }

  const originalName = file.name ? String(file.name).slice(0, 255) : null;

  // store to /public/uploads/visits/{visitId}/...
  const uploadsDir = path.join(
    process.cwd(),
    "public",
    "uploads",
    "visits",
    String(vid)
  );
  await fs.mkdir(uploadsDir, { recursive: true });

  const ext =
    mime === "application/pdf"
      ? ".pdf"
      : mime === "image/png"
      ? ".png"
      : ".jpg";
  const fname = `doc_${Date.now()}_${Math.random()
    .toString(16)
    .slice(2)}${ext}`;

  const absPath = path.join(uploadsDir, fname);
  const relUrl = `/uploads/visits/${vid}/${fname}`;

  const buf = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(absPath, buf);

  await db.execute<ResultSetHeader>(
    `
    INSERT INTO visit_documents (
      visit_id, category, file_url, file_path,
      original_name, mime_type, size_bytes, uploaded_by
    )
    VALUES (
      :vid, :cat, :url, :path,
      :orig, :mime, :size, :by
    )
    `,
    {
      vid,
      cat: category,
      url: relUrl,
      path: absPath,
      orig: originalName,
      mime,
      size,
      by: me.id ? Number(me.id) : null,
    }
  );

  return NextResponse.json({ ok: true });
}
