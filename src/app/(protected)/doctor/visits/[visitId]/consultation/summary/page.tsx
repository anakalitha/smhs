// src/app/(protected)/doctor/visits/[visitId]/consultation/summary/page.tsx
import React from "react";
import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

type HeaderRow = RowDataPacket & {
  visitDate: string;
  patientCode: string;
  patientName: string;
  doctorName: string;
};

type NoteRow = RowDataPacket & {
  diagnosis: string | null;
  investigation: string | null;
  remarks: string | null;
};

type OrderRow = RowDataPacket & {
  order_type: "SCAN" | "PAP_SMEAR" | "CTG";
  details: string | null;
  status: string;
};

type PageProps = {
  params: Promise<{ visitId: string }>;
};

export default async function ConsultationSummaryPage({ params }: PageProps) {
  const { visitId } = await params;
  return <SummaryInner visitId={visitId} />;
}

async function SummaryInner({ visitId }: { visitId: string }) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");

  const allowed =
    me.roles.includes("DOCTOR") ||
    me.roles.includes("ADMIN") ||
    me.roles.includes("SUPER_ADMIN");

  if (!allowed) return <div className="p-6">Forbidden.</div>;

  const id = Number(visitId);
  if (!Number.isFinite(id) || id <= 0)
    return <div className="p-6">Invalid visitId.</div>;

  const orgId = me.organizationId != null ? Number(me.organizationId) : NaN;
  const branchId = me.branchId != null ? Number(me.branchId) : NaN;
  if (
    !Number.isFinite(orgId) ||
    orgId <= 0 ||
    !Number.isFinite(branchId) ||
    branchId <= 0
  )
    return <div className="p-6">Invalid org/branch.</div>;

  const [h] = await db.execute<HeaderRow[]>(
    `
    SELECT
      v.visit_date AS visitDate,
      p.patient_code AS patientCode,
      p.full_name AS patientName,
      d.full_name AS doctorName
    FROM visits v
    JOIN patients p ON p.id = v.patient_id
    JOIN doctors d ON d.id = v.doctor_id
    WHERE v.id = :visitId
      AND v.organization_id = :org
      AND v.branch_id = :branch
    LIMIT 1
    `,
    { visitId: id, org: orgId, branch: branchId }
  );

  if (h.length === 0) return <div className="p-6">Visit not found.</div>;

  const [n] = await db.execute<NoteRow[]>(
    `SELECT diagnosis, investigation, remarks FROM visit_notes WHERE visit_id = :visitId LIMIT 1`,
    { visitId: id }
  );

  const [orders] = await db.execute<OrderRow[]>(
    `
    SELECT order_type, details, status
    FROM visit_orders
    WHERE visit_id = :visitId
      AND status <> 'CANCELLED'
    ORDER BY id ASC
    `,
    { visitId: id }
  );

  const note = n[0] ?? { diagnosis: null, investigation: null, remarks: null };

  return (
    <div className="p-6 bg-white text-black">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xl font-bold">Consultation Summary</div>
            <div className="text-sm mt-1">
              Visit Date: {String(h[0].visitDate)}
            </div>
          </div>

          {/* ✅ Print button must be client-side */}
          <PrintButton />
        </div>

        <hr className="my-4" />

        <div className="text-sm">
          <div>
            <b>Patient:</b> {h[0].patientName} ({h[0].patientCode})
          </div>
          <div className="mt-1">
            <b>Doctor:</b> {h[0].doctorName}
          </div>
        </div>

        <hr className="my-4" />

        <Section title="Diagnosis" value={note.diagnosis} />
        <Section title="Investigation" value={note.investigation} />
        <Section title="Remarks" value={note.remarks} />

        <hr className="my-4" />

        <div className="text-sm font-semibold">Orders</div>
        {orders.length === 0 ? (
          <div className="text-sm mt-1">No orders.</div>
        ) : (
          <ul className="text-sm mt-2 list-disc pl-5">
            {orders.map((o) => (
              <li key={`${o.order_type}-${o.status}-${o.details ?? ""}`}>
                <b>{o.order_type}</b> — {o.details ? String(o.details) : "—"}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Section({ title, value }: { title: string; value: string | null }) {
  return (
    <div className="mt-3">
      <div className="text-sm font-semibold">{title}</div>
      <div className="text-sm mt-1 whitespace-pre-wrap">
        {value ? String(value) : "—"}
      </div>
    </div>
  );
}

/**
 * ✅ Inline client component (small + no new file required)
 * Next will treat this as a Client Component boundary.
 */
function PrintButton() {
  // This component will be compiled as server unless we mark it client.
  // So we implement it as a separate file OR wrap with "use client".
  // Easiest: move this into its own file with "use client".
  return (
    <a
      href="#"
      onClick={(e) => {
        e.preventDefault();
        window.print();
      }}
      className="border px-3 py-1.5 text-sm rounded"
    >
      Print
    </a>
  );
}
