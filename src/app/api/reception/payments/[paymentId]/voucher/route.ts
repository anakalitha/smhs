import { NextResponse } from "next/server";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import path from "path";
import fs from "fs/promises";

type Ctx = { params: Promise<{ paymentId: string }> };

type PayRow = RowDataPacket & {
  id: number;
  visit_id: number;
  service_id: number;
  organization_id: number;
  branch_id: number;
};

function isAllowed(me: { roles: string[] }) {
  return (
    me.roles.includes("RECEPTION") ||
    me.roles.includes("ADMIN") ||
    me.roles.includes("SUPER_ADMIN")
  );
}

export async function POST(req: Request, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAllowed(me))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!me.organizationId || !me.branchId) {
    return NextResponse.json({ error: "Invalid org/branch." }, { status: 400 });
  }

  const { paymentId } = await ctx.params;
  const pid = Number(paymentId);
  if (!Number.isFinite(pid) || pid <= 0) {
    return NextResponse.json({ error: "Invalid payment id." }, { status: 400 });
  }

  // Parse multipart
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required." }, { status: 400 });
  }

  // Validate file
  const maxBytes = 5 * 1024 * 1024;
  if (file.size > maxBytes) {
    return NextResponse.json(
      { error: "Max file size is 5MB." },
      { status: 400 }
    );
  }

  const mime = file.type || "application/octet-stream";
  const allowedMime =
    mime === "application/pdf" ||
    mime === "image/jpeg" ||
    mime === "image/png";
  if (!allowedMime) {
    return NextResponse.json(
      { error: "Only PDF/JPG/PNG allowed." },
      { status: 400 }
    );
  }

  const originalName = file.name ? String(file.name).slice(0, 255) : "voucher";

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // 1) resolve payment -> visit_id + service_id and scope check
    const [payRows] = await conn.execute<PayRow[]>(
      `
      SELECT id, visit_id, service_id, organization_id, branch_id
      FROM payments
      WHERE id = :pid
      LIMIT 1
      FOR UPDATE
      `,
      { pid }
    );

    if (payRows.length === 0) {
      await conn.rollback();
      return NextResponse.json(
        { error: "Payment not found." },
        { status: 404 }
      );
    }

    const p = payRows[0];

    if (
      Number(p.organization_id) !== Number(me.organizationId) ||
      Number(p.branch_id) !== Number(me.branchId)
    ) {
      await conn.rollback();
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    // Store file to /public/uploads/visits/{visitId}/refund-vouchers/
    // (local storage for now – matches visit documents approach)
    const uploadsDir = path.join(
      process.cwd(),
      "public",
      "uploads",
      "visits",
      String(Number(p.visit_id)),
      "refund-vouchers"
    );
    await fs.mkdir(uploadsDir, { recursive: true });

    const ext =
      mime === "application/pdf"
        ? ".pdf"
        : mime === "image/png"
        ? ".png"
        : ".jpg";

    const fname = `refund_voucher_${pid}_${Date.now()}_${Math.random()
      .toString(16)
      .slice(2)}${ext}`;
    const absPath = path.join(uploadsDir, fname);
    const relUrl = `/uploads/visits/${Number(p.visit_id)}/refund-vouchers/${fname}`;

    const buf = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(absPath, buf);

    // 2) Upsert into visit_documents for this payment voucher (Option B)
    // If you want “replace”, delete old and insert new.
    await conn.execute<ResultSetHeader>(
      `
      DELETE FROM visit_documents
      WHERE payment_id = :pid
        AND category = 'REFUND_VOUCHER'
      `,
      { pid }
    );

    await conn.execute<ResultSetHeader>(
      `
      INSERT INTO visit_documents (
        visit_id,
        category,
        file_url,
        file_path,
        original_name,
        mime_type,
        size_bytes,
        uploaded_by,
        uploaded_at,
        payment_id,
        service_id
      )
      VALUES (
        :visit_id,
        'REFUND_VOUCHER',
        :file_url,
        :file_path,
        :original_name,
        :mime_type,
        :size_bytes,
        :uploaded_by,
        NOW(),
        :payment_id,
        :service_id
      )
      `,
      {
        visit_id: Number(p.visit_id),
        file_url: relUrl,
        file_path: absPath,
        original_name: originalName,
        mime_type: mime,
        size_bytes: Number(file.size || 0),
        uploaded_by: me.id ? Number(me.id) : null,
        payment_id: pid,
        service_id: Number(p.service_id),
      }
    );

    await conn.commit();

    return NextResponse.json({
      ok: true,
      fileUrl: relUrl,
      originalName,
    });
  } catch (e) {
    await conn.rollback();
    console.error("❌ Failed to upload voucher:", e);
    return NextResponse.json(
      { error: "Failed to upload voucher." },
      { status: 500 }
    );
  } finally {
    conn.release();
  }
}
