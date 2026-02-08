// src\app\(protected)\doctor\visits\[visitId]\consultation\prescription\page.tsx
import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export default async function PrescriptionPrintPage(props: {
  params: Promise<{ visitId: string }>;
}) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");

  const allowed =
    me.roles.includes("DOCTOR") ||
    me.roles.includes("ADMIN") ||
    me.roles.includes("SUPER_ADMIN");

  if (!allowed) return <div className="p-6">Forbidden.</div>;

  type PrescriptionItemRow = RowDataPacket & {
    medicine_name: string;
    dosage: string | null;
    morning: 0 | 1;
    afternoon: 0 | 1;
    night: 0 | 1;
    before_food: 0 | 1;
    duration_days: number | null;
    instructions: string | null;
    sort_order: number | null;
  };

  const { visitId } = await props.params;
  const id = Number(visitId);
  if (!Number.isFinite(id) || id <= 0)
    return <div className="p-6">Invalid visitId.</div>;

  const orgId = me.organizationId != null ? Number(me.organizationId) : NaN;
  const branchId = me.branchId != null ? Number(me.branchId) : NaN;
  if (!Number.isFinite(orgId) || !Number.isFinite(branchId))
    return <div className="p-6">Invalid org/branch.</div>;

  const [h] = await db.execute<RowDataPacket[]>(
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

  const [rx] = await db.execute<RowDataPacket[]>(
    `SELECT id, notes FROM prescriptions WHERE visit_id = :visitId LIMIT 1`,
    { visitId: id }
  );

  const rxId = rx[0]?.id ? Number(rx[0].id) : null;

  const [items] = rxId
    ? await db.execute<PrescriptionItemRow[]>(
        `
      SELECT medicine_name, dosage, morning, afternoon, night, before_food, duration_days, instructions, sort_order
      FROM prescription_items
      WHERE prescription_id = :pid
      ORDER BY sort_order ASC, id ASC
      `,
        { pid: rxId }
      )
    : ([[]] as unknown as [PrescriptionItemRow[]]); // (works but still ugly)

  return (
    <div className="p-6 bg-white text-black">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xl font-bold">Prescription</div>
            <div className="text-sm mt-1">
              Visit Date: {String(h[0].visitDate)}
            </div>
          </div>
          <button
            onClick={() => window.print()}
            className="border px-3 py-1.5 text-sm rounded"
          >
            Print
          </button>
        </div>

        <hr className="my-4" />

        <div className="text-sm">
          <div>
            <b>Patient:</b> {String(h[0].patientName)} (
            {String(h[0].patientCode)})
          </div>
          <div className="mt-1">
            <b>Doctor:</b> {String(h[0].doctorName)}
          </div>
        </div>

        <hr className="my-4" />

        {rx[0]?.notes ? (
          <div className="text-sm whitespace-pre-wrap">
            {String(rx[0].notes)}
          </div>
        ) : null}

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm border">
            <thead className="bg-gray-50">
              <tr className="border-b">
                <th className="px-2 py-2 text-left">Medicine</th>
                <th className="px-2 py-2 text-left">Dosage</th>
                <th className="px-2 py-2 text-center">M</th>
                <th className="px-2 py-2 text-center">A</th>
                <th className="px-2 py-2 text-center">N</th>
                <th className="px-2 py-2 text-center">Before food</th>
                <th className="px-2 py-2 text-left">Days</th>
                <th className="px-2 py-2 text-left">Instructions</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td className="px-2 py-3" colSpan={8}>
                    No medicines.
                  </td>
                </tr>
              ) : (
                items.map((it, idx) => (
                  <tr key={idx} className="border-b last:border-b-0">
                    <td className="px-2 py-2">{String(it.medicine_name)}</td>
                    <td className="px-2 py-2">
                      {it.dosage ? String(it.dosage) : "—"}
                    </td>
                    <td className="px-2 py-2 text-center">
                      {it.morning === 1 ? "✓" : ""}
                    </td>
                    <td className="px-2 py-2 text-center">
                      {it.afternoon === 1 ? "✓" : ""}
                    </td>
                    <td className="px-2 py-2 text-center">
                      {it.night === 1 ? "✓" : ""}
                    </td>
                    <td className="px-2 py-2 text-center">
                      {it.before.food === 1 ? "✓" : ""}
                    </td>
                    <td className="px-2 py-2">
                      {it.duration_days != null
                        ? String(it.duration_days)
                        : "—"}
                    </td>
                    <td className="px-2 py-2">
                      {it.instructions ? String(it.instructions) : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="text-xs text-gray-600 mt-4">
          Note: This is a generated prescription from the hospital system.
        </div>
      </div>
    </div>
  );
}
