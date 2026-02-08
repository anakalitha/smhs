"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import DataTable, { Column } from "@/components/ui/DataTable";
import VisitConsultationChargeModal from "@/components/billing/VisitConsultationChargeModal";

type VisitStatus = "WAITING" | "NEXT" | "IN_ROOM" | "DONE";
type PayStatus = "ACCEPTED" | "PENDING" | "WAIVED";

type Patient = {
  patientCode: string;
  name: string;
  phone: string;
  branch: string;
  lastVisit: string;
  pending: number;
  totalVisits: number;
};

type VisitRow = {
  visitId: number;
  visitDate: string;
  doctor: string;
  status: VisitStatus;

  // Keep these for now (your server component can map to them)
  amount: number; // should be consultation net amount
  payStatus: PayStatus; // derived: ACCEPTED if pending==0, etc.
  paymentMode: string; // optional/last mode
};

function formatINR(n: number) {
  return n.toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });
}

function Badge({
  children,
  tone = "gray",
}: {
  children: React.ReactNode;
  tone?: "gray" | "green" | "yellow" | "red" | "blue";
}) {
  const cls =
    tone === "green"
      ? "bg-green-50 text-green-700 border-green-200"
      : tone === "yellow"
      ? "bg-yellow-50 text-yellow-700 border-yellow-200"
      : tone === "red"
      ? "bg-red-50 text-red-700 border-red-200"
      : tone === "blue"
      ? "bg-blue-50 text-blue-700 border-blue-200"
      : "bg-gray-50 text-gray-700 border-gray-200";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs ${cls}`}
    >
      {children}
    </span>
  );
}

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border bg-white shadow-sm">
      <div className="border-b px-4 py-3">
        <div className="text-sm font-semibold text-[#1f1f1f]">{title}</div>
        {subtitle && (
          <div className="text-xs text-[#646179] mt-0.5">{subtitle}</div>
        )}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function KpiMini({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-white shadow-sm p-4">
      <div className="text-sm text-[#646179]">{title}</div>
      <div className="mt-1 text-xl font-semibold text-[#1f1f1f]">{value}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="text-[#646179]">{label}</div>
      <div className="text-[#1f1f1f] font-medium text-right">{value}</div>
    </div>
  );
}

export default function PatientSummaryClient({
  patient,
  visits,
}: {
  patient: Patient;
  visits: VisitRow[];
}) {
  const router = useRouter();

  const [chargeModalOpen, setChargeModalOpen] = useState(false);
  const [chargeVisitId, setChargeVisitId] = useState<number | null>(null);

  const [newVisitLoading, setNewVisitLoading] = useState(false);
  const [newVisitErr, setNewVisitErr] = useState<string | null>(null);

  function refreshSummary() {
    router.refresh();
  }

  async function createNewVisitAndOpen() {
    setNewVisitErr(null);

    const ok = window.confirm(
      "Create a new visit for today and open consultation?"
    );
    if (!ok) return;

    setNewVisitLoading(true);
    try {
      const res = await fetch(
        `/api/doctor/patients/${encodeURIComponent(
          patient.patientCode
        )}/new-visit`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }
      );

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.ok || !data?.visitId) {
        alert(data?.error || "Failed to create new visit.");
        return;
      }

      router.push(`/doctor/visits/${data.visitId}/consultation`);
    } catch {
      setNewVisitErr("Network error while creating new visit.");
    } finally {
      setNewVisitLoading(false);
    }
  }

  const visitColumns: Column<VisitRow>[] = useMemo(
    () => [
      {
        header: "Visit Date",
        cell: (v) => <span className="text-[#1f1f1f]">{v.visitDate}</span>,
        className: "w-[120px]",
      },
      {
        header: "Doctor",
        cell: (v) => <span className="text-[#1f1f1f]">{v.doctor}</span>,
        className: "min-w-[160px]",
      },
      {
        header: "Status",
        cell: (v) => {
          const tone =
            v.status === "DONE"
              ? "green"
              : v.status === "IN_ROOM"
              ? "blue"
              : v.status === "NEXT"
              ? "yellow"
              : "gray";
          return <Badge tone={tone}>{v.status}</Badge>;
        },
        className: "w-[120px]",
      },
      {
        header: "Consultation Fee (Net)",
        cell: (v) => (
          <span className="text-[#1f1f1f] font-medium">
            {formatINR(v.amount)}
          </span>
        ),
        className: "w-[170px]",
      },
      {
        header: "Pay Status",
        cell: (v) => {
          const tone =
            v.payStatus === "ACCEPTED"
              ? "green"
              : v.payStatus === "PENDING"
              ? "yellow"
              : "red";
          return <Badge tone={tone}>{v.payStatus}</Badge>;
        },
        className: "w-[130px]",
      },
      {
        header: "Mode",
        cell: (v) => <span className="text-[#646179]">{v.paymentMode}</span>,
        className: "w-[110px]",
      },
    ],
    []
  );

  return (
    <div className="min-h-[calc(100vh-120px)] bg-[#F2F2F2]">
      <div className="p-6 max-w-7xl mx-auto">
        <div className="rounded-2xl border bg-white shadow-sm p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-xs text-[#646179]">Patient Summary</div>
              <div className="mt-1 flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-semibold text-[#1f1f1f]">
                  {patient.name}
                </h1>
                <Badge>{patient.patientCode}</Badge>
                <Badge tone="blue">{patient.branch}</Badge>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <Badge>{patient.phone}</Badge>
                <Badge tone="gray">Last visit: {patient.lastVisit}</Badge>
              </div>

              {newVisitErr && (
                <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {newVisitErr}
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => router.back()}
                className="rounded-lg border bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50"
              >
                ← Back
              </button>

              <button
                type="button"
                onClick={() => alert("Print Summary (later)")}
                className="rounded-lg border bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50"
              >
                🖨️ Print Summary
              </button>

              <button
                type="button"
                onClick={createNewVisitAndOpen}
                disabled={newVisitLoading}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {newVisitLoading ? "Creating..." : "➕ New Visit"}
              </button>
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiMini title="Total Visits" value={String(patient.totalVisits)} />
          <KpiMini title="Pending Dues" value={formatINR(patient.pending)} />
          <KpiMini title="Last Visit" value={patient.lastVisit} />
          <KpiMini title="Last Fee" value={formatINR(visits[0]?.amount ?? 0)} />
        </div>

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-4 space-y-5">
            <SectionCard title="Personal Details" subtitle="Core patient info">
              <div className="space-y-2 text-sm">
                <Row label="Full Name" value={patient.name} />
                <Row label="Patient ID" value={patient.patientCode} />
              </div>
            </SectionCard>

            <SectionCard
              title="Contact"
              subtitle="Phone and address (optional)"
            >
              <div className="space-y-2 text-sm">
                <Row label="Phone" value={patient.phone} />
                <Row label="Address" value="—" />
              </div>
            </SectionCard>
          </div>

          <div className="lg:col-span-8 space-y-5">
            <SectionCard
              title="Visits"
              subtitle="Edit visit charge (Consultation) to correct historical data."
            >
              <DataTable
                dense
                columns={visitColumns}
                rows={visits}
                getRowKey={(r) => r.visitId}
                groupedActions={(row) => [
                  {
                    items: [
                      {
                        label: "Edit Visit Data",
                        onClick: () => {
                          setChargeVisitId(row.visitId);
                          setChargeModalOpen(true);
                        },
                      },
                      {
                        label: "Generate Bill",
                        onClick: () =>
                          window.open(
                            `/reception/bill/${row.visitId}`,
                            "_blank",
                            "noopener,noreferrer"
                          ),
                      },
                    ],
                  },
                ]}
                emptyText="No visits found."
              />
            </SectionCard>
          </div>
        </div>
      </div>

      <VisitConsultationChargeModal
        open={chargeModalOpen}
        visitId={chargeVisitId}
        onClose={() => setChargeModalOpen(false)}
        onSaved={refreshSummary}
      />
    </div>
  );
}
