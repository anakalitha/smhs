// src/app/(protected)/patients/[patientCode]/PatientSummaryClient.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import DataTable, { Column } from "@/components/ui/DataTable";
import VisitConsultationChargeModal from "@/components/billing/VisitConsultationChargeModal";
import ConsultationClient from "../../doctor/visits/[visitId]/consultation/ConsultationClient";

type VisitStatus = "WAITING" | "NEXT" | "IN_ROOM" | "DONE";
type PayStatus = "ACCEPTED" | "PENDING" | "WAIVED";

type Patient = {
  patientCode: string;
  name: string;
  phone: string;
  branch: string;
  lastVisit: string; // YYYY-MM-DD
  pending: number;
  totalVisits: number;
  totalPaidAllTime?: number;
  totalRefundedAllTime?: number;
};

type VisitRow = {
  visitId: number;
  visitDate: string; // YYYY-MM-DD
  doctor: string;

  amount: number; // consultation net amount
  paidAmount: number;
  pendingAmount: number;
  payStatus: PayStatus;

  paymentMode: string; // CASH/UPI/...

  // Refund workflow
  refundDue: number; // >0 => needs refund
  refundPaymentId: number | null; // exists => refund recorded
  voucherFileUrl: string | null; // uploaded signed voucher
  voucherOriginalName: string | null;
};

type Permissions = {
  canEditPatient: boolean;
  canViewClinical: boolean;
  canEditClinical: boolean;
  canViewBilling: boolean;
};

type SummaryOk = {
  ok: true;
  permissions: Permissions;
  me?: { roles?: string[] };
  stats?: {
    totalVisitsAllTime: number;
    totalPaidAllTime: number;
    totalRefundedAllTime?: number;
    totalNetPaidAllTime?: number;
  };
  patient: {
    id: number;
    patientCode: string;
    fullName: string;
    phone: string | null;
  };
  visits: Array<{
    visitId: number;
    visitDate: string; // YYYY-MM-DD
    doctorId: number | null;
    doctorName: string | null;
    tokenNo: number | null;
    queueStatus: VisitStatus | null;
    consultationPaymentModeCode: string | null;
  }>;
};

type ConsultationChargeOk = {
  ok: true;
  charge: {
    visitId: number;
    netAmount: number;
    paidAmount: number;
    pendingAmount: number;
  };
  refund?: {
    refundDue: number;
    refundPaymentId: number | null;
    voucher: {
      fileUrl: string;
      originalName: string | null;
      uploadedAt: string;
    } | null;
  };
};

type PaymentMode = { code: string; display_name: string };

function getStringProp(x: unknown, key: string): string | null {
  if (!isObject(x)) return null;
  const v = x[key];
  return typeof v === "string" ? v : null;
}

function getNumberProp(x: unknown, key: string): number | null {
  if (!isObject(x)) return null;
  const v = x[key];
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function getArrayProp(x: unknown, key: string): unknown[] | null {
  if (!isObject(x)) return null;
  const v = x[key];
  return Array.isArray(v) ? v : null;
}

function parsePaymentModesResponse(x: unknown): PaymentMode[] | null {
  const arr = getArrayProp(x, "modes");
  if (!arr) return null;

  const out: PaymentMode[] = [];
  for (const item of arr) {
    if (!isObject(item)) continue;
    const code = getStringProp(item, "code");
    const display_name =
      getStringProp(item, "display_name") ?? getStringProp(item, "displayName");

    if (code) {
      out.push({ code, display_name: display_name ?? code });
    }
  }
  return out;
}

function parseErrorResponse(x: unknown): string | null {
  return getStringProp(x, "error");
}

function parsePaymentIdResponse(x: unknown): number | null {
  // your refund API returns { ok:true, paymentId, ... }
  return getNumberProp(x, "paymentId");
}

function formatINR(n: number) {
  return (Number(n) || 0).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });
}

function formatDDMMYYYYWithDay(yyyyMmDd: string) {
  // expects "YYYY-MM-DD"
  const d = new Date(`${yyyyMmDd}T00:00:00`);
  if (Number.isNaN(d.getTime())) return yyyyMmDd;

  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const day = d.toLocaleDateString("en-US", { weekday: "short" }); // Mon/Tue

  return `${dd}/${mm}/${yyyy} (${day})`;
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

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

function getErrorMessage(x: unknown): string | null {
  if (!isObject(x)) return null;
  const e = x["error"];
  return typeof e === "string" ? e : null;
}

function isSummaryOk(x: unknown): x is SummaryOk {
  return isObject(x) && x["ok"] === true;
}

function toPayStatusFromCharge(
  netAmount: number,
  pendingAmount: number
): PayStatus {
  const net = Number(netAmount) || 0;
  const pending = Number(pendingAmount) || 0;

  if (net <= 0) return "WAIVED";
  if (pending > 0) return "PENDING";
  return "ACCEPTED";
}

async function safeJson(res: Response) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Patient Summary (Option A):
 * - Uses /api/patients/[patientCode]/summary (shared route)
 * - For each visit, reads consultation charge + refund state from:
 *   /api/reception/visits/[visitId]/consultation-charge
 */
export default function PatientSummaryClient({
  patientCode,
}: {
  patientCode: string;
}) {
  const router = useRouter();

  const [chargeModalOpen, setChargeModalOpen] = useState(false);
  const [chargeVisitId, setChargeVisitId] = useState<number | null>(null);

  const [refundOpen, setRefundOpen] = useState(false);
  const [refundVisit, setRefundVisit] = useState<VisitRow | null>(null);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadPaymentId, setUploadPaymentId] = useState<number | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [perms, setPerms] = useState<Permissions | null>(null);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [visits, setVisits] = useState<VisitRow[]>([]);
  const [myRoles, setMyRoles] = useState<string[]>([]);

  // For Doctor workflow: edit today's visit if present, otherwise the most recent visit.
  // NOTE: Hooks must be declared before any early returns.
  const activeVisitId = useMemo(() => {
    if (!visits.length) return null;

    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const today = `${yyyy}-${mm}-${dd}`;

    const todayVisit = visits.find(
      (vv) => String(vv.visitDate).slice(0, 10) === today
    );
    return todayVisit?.visitId ?? visits[0]?.visitId ?? null;
  }, [visits]);

  function closeChargeModal() {
    setChargeModalOpen(false);
    setChargeVisitId(null);
  }

  async function load() {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch(`/api/patients/${patientCode}/summary`, {
        cache: "no-store",
      });

      const j = await safeJson(res);
      if (!res.ok) {
        throw new Error(getErrorMessage(j) || `Failed to load (${res.status})`);
      }
      if (!isSummaryOk(j)) {
        throw new Error(
          getErrorMessage(j) || "Failed to load patient summary."
        );
      }

      setPerms(j.permissions);
      setMyRoles(Array.isArray(j.me?.roles) ? j.me.roles : []);

      const basePatient: Patient = {
        patientCode: j.patient.patientCode,
        name: j.patient.fullName,
        phone: j.patient.phone ?? "—",
        branch: "—",
        lastVisit: j.visits[0]?.visitDate ?? "—",
        pending: 0, // computed below
        totalVisits: j.stats?.totalVisitsAllTime ?? j.visits.length,
        totalPaidAllTime: j.stats?.totalPaidAllTime ?? 0,
        totalRefundedAllTime: j.stats?.totalRefundedAllTime ?? 0,
      };

      // For each visit: pull consultation charge (net/paid/pending) + refund state
      // IMPORTANT: /api/reception/... is RECEPTION-only and will 403 for doctors.
      // So we fetch charges only when the server says the user can view billing.
      const canFetchBilling = j.permissions?.canViewBilling === true;

      const rows: VisitRow[] = await Promise.all(
        j.visits.map(async (v): Promise<VisitRow> => {
          const visitId = Number(v.visitId);

          let netAmount = 0;
          let paidAmount = 0;
          let pendingAmount = 0;

          let refundDue = 0;
          let refundPaymentId: number | null = null;
          let voucherFileUrl: string | null = null;
          let voucherOriginalName: string | null = null;

          if (canFetchBilling) {
            try {
              const cRes = await fetch(
                `/api/reception/visits/${visitId}/consultation-charge`,
                { cache: "no-store" }
              );
              const cJson = (await safeJson(cRes)) as unknown;

              if (
                cRes.ok &&
                typeof cJson === "object" &&
                cJson !== null &&
                "ok" in cJson &&
                (cJson as { ok: boolean }).ok === true &&
                "charge" in cJson
              ) {
                const charge = (cJson as ConsultationChargeOk).charge;
                netAmount = Number(charge.netAmount) || 0;
                paidAmount = Number(charge.paidAmount) || 0;
                pendingAmount = Number(charge.pendingAmount) || 0;

                const refund = (cJson as ConsultationChargeOk).refund;
                if (refund) {
                  refundDue = Number(refund.refundDue) || 0;
                  refundPaymentId =
                    refund.refundPaymentId != null
                      ? Number(refund.refundPaymentId)
                      : null;
                  if (refund.voucher) {
                    voucherFileUrl = refund.voucher.fileUrl;
                    voucherOriginalName = refund.voucher.originalName ?? null;
                  }
                }
              }
            } catch {
              // ignore
            }
          }

          const payStatus = toPayStatusFromCharge(netAmount, pendingAmount);
          const paymentMode = (
            v.consultationPaymentModeCode ?? "—"
          ).toUpperCase();

          return {
            visitId,
            visitDate: v.visitDate,
            doctor: v.doctorName ?? "—",
            amount: netAmount,
            paidAmount,
            pendingAmount,
            payStatus,
            paymentMode,

            refundDue,
            refundPaymentId,
            voucherFileUrl,
            voucherOriginalName,
          };
        })
      );

      // Accurate pending dues (sum of pending amounts)
      basePatient.pending = rows.reduce(
        (sum, r) => sum + (Number(r.pendingAmount) || 0),
        0
      );
      basePatient.lastVisit = rows[0]?.visitDate ?? basePatient.lastVisit;

      setPatient(basePatient);
      setVisits(rows);
    } catch (e: unknown) {
      const msg =
        e instanceof Error ? e.message : "Failed to load patient summary.";
      setError(msg);
      setPatient(null);
      setVisits([]);
      setPerms(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientCode]);

  function refreshSummary() {
    load();
  }

  const isDoctor = myRoles.includes("DOCTOR");

  const visitColumns: Column<VisitRow>[] = useMemo(
    () => [
      {
        header: "Visit Date",
        cell: (v) => (
          <span className="text-[#1f1f1f]">
            {formatDDMMYYYYWithDay(v.visitDate)}
          </span>
        ),
        className: "w-[150px]",
      },
      {
        header: "Doctor",
        cell: (v) => <span className="text-[#1f1f1f]">{v.doctor}</span>,
        className: "min-w-[160px]",
      },
      {
        header: "Consultation Fee (Net)",
        cell: (v) => (
          <span className="text-[#1f1f1f] font-medium">
            {formatINR(v.amount)}
          </span>
        ),
        className: "w-[190px]",
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

  if (loading) {
    return <div className="p-6">Loading patient summary…</div>;
  }

  if (error || !patient) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border bg-white shadow-sm p-5">
          <div className="text-sm font-semibold text-[#1f1f1f]">
            Could not load patient
          </div>
          <div className="mt-1 text-sm text-[#646179]">
            {error ?? "Unknown error"}
          </div>

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => router.back()}
              className="rounded-lg border bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50"
            >
              ← Back
            </button>
            <button
              type="button"
              onClick={load}
              className="rounded-lg border bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  const canBillingActions = !!perms?.canViewBilling;
  // Placeholder fields (wire later from API)
  const gender = "—";
  const age = "—";
  const dob = "—";
  const email = "—";
  const address = "—";
  const bloodGroup = "—";

  const lastVisit =
    patient.lastVisit && patient.lastVisit !== "—"
      ? formatDDMMYYYYWithDay(patient.lastVisit)
      : "—";

  const totalVisits = patient.totalVisits ?? visits.length;
  const totalRevenue = visits.reduce(
    (sum, v) => sum + (Number(v.amount) || 0),
    0
  );

  return (
    <div className="min-h-[calc(100vh-120px)] bg-[#F2F2F2]">
      <div className="p-6 max-w-7xl mx-auto space-y-5">
        {/* Header row */}
        <div className="flex items-center justify-between gap-4">
          <div className="text-base font-semibold text-[#1f1f1f]">
            Patient Summary
          </div>
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-lg border bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50"
          >
            ← Back
          </button>
        </div>

        {/* Top section: Patient card (left) + Visits card (right) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-4">
            {" "}
            {/* Left = 4/12 (33%) */}
            {/* ===== Patient Card (left) ===== */}
            <div className="rounded-2xl border bg-white shadow-sm p-5 lg:h-[360px] overflow-hidden">
              <div className="h-full overflow-auto pr-1">
                <div className="flex items-start gap-5">
                  <div className="shrink-0">
                    <div className="h-28 w-28 rounded-full border bg-white overflow-hidden">
                      <Image
                        src="/images/patient-avatar.png"
                        alt="Patient"
                        className="h-full w-full object-cover"
                        width={112}
                        height={112}
                      />
                    </div>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-[#646179]">Full Name</div>
                    <div className="text-base font-semibold text-[#1f1f1f] truncate">
                      {patient.name}
                    </div>

                    <div className="mt-2 text-xs text-[#646179]">
                      Patient ID
                    </div>
                    <div className="text-sm font-semibold text-[#1f1f1f] break-all">
                      {patient.patientCode}
                    </div>

                    <div className="mt-2 text-xs text-[#646179]">
                      Phone Number
                    </div>
                    <div className="text-sm font-semibold text-[#1f1f1f]">
                      {patient.phone ?? "—"}
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <InfoItem label="Last Visit" value={lastVisit} />
                  <InfoItem
                    label="Total Visits (Count)"
                    value={String(totalVisits)}
                  />
                  <InfoItem
                    label="Total Visits (Amount)"
                    value={formatINR(patient.totalPaidAllTime ?? totalRevenue)}
                  />
                  <InfoItem
                    label="Pending Dues"
                    value={formatINR(patient.pending)}
                  />
                </div>

                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <InfoItem label="Gender" value={gender} />
                  <InfoItem label="Age" value={age} />
                  <InfoItem label="Date of Birth" value={dob} />
                  <InfoItem label="Address" value={address} />
                </div>

                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <InfoItem label="Email" value={email} />
                  <InfoItem label="Blood Group" value={bloodGroup} />
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-8 min-w-0">
            {" "}
            {/* Right = 8/12 (67%) */}
            {/* ===== Visits Card (right) ===== */}
            <div className="rounded-2xl border bg-white shadow-sm lg:h-[360px] overflow-hidden flex flex-col">
              <div className="border-b px-4 py-3 flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-[#1f1f1f]">
                    Visits
                  </div>
                  <div className="text-xs text-[#646179] mt-0.5">
                    {canBillingActions
                      ? "Edit Consultation charge to correct historical data (discount/waiver)."
                      : "Recent visits."}
                  </div>
                </div>
              </div>

              {/* Scrollable table area */}
              <div className="p-4 flex-1 overflow-auto">
                <DataTable
                  dense
                  columns={visitColumns}
                  rows={visits}
                  getRowKey={(r) => r.visitId}
                  groupedActions={(row) => {
                    const actions: {
                      label: string;
                      onClick: () => void;
                    }[] = [];

                    // ✅ Always available (Doctor + Reception): open visit summary
                    actions.push({
                      label: "View Visit Summary",
                      onClick: () =>
                        window.open(
                          `/visits/${row.visitId}`,
                          "_blank",
                          "noopener,noreferrer"
                        ),
                    });

                    // Billing-only actions
                    if (canBillingActions) {
                      actions.push({
                        label: "Edit Visit Data",
                        onClick: () => {
                          setChargeVisitId(row.visitId);
                          setChargeModalOpen(true);
                        },
                      });

                      actions.push({
                        label: "Generate Bill",
                        onClick: () =>
                          window.open(
                            `/reception/bill/${row.visitId}`,
                            "_blank",
                            "noopener,noreferrer"
                          ),
                      });

                      if ((row.refundDue || 0) > 0) {
                        actions.push({
                          label: `Pay Refund (${formatINR(row.refundDue)})`,
                          onClick: () => {
                            setRefundVisit(row);
                            setRefundOpen(true);
                          },
                        });
                      }

                      if (row.refundPaymentId) {
                        actions.push({
                          label: "Print Voucher",
                          onClick: () =>
                            window.open(
                              `/reception/refund-voucher/${row.refundPaymentId}`,
                              "_blank",
                              "noopener,noreferrer"
                            ),
                        });

                        actions.push({
                          label: row.voucherFileUrl
                            ? "Upload Voucher (Replace)"
                            : "Upload Voucher",
                          onClick: () => {
                            setUploadPaymentId(row.refundPaymentId);
                            setUploadOpen(true);
                          },
                        });
                      }
                    }

                    return actions.length ? [{ items: actions }] : [];
                  }}
                  emptyText="No visits found."
                />
              </div>
            </div>
          </div>
        </div>

        {/* Consultation entry (Doctor only) */}
        {isDoctor && activeVisitId ? (
          <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
            <div className="border-b px-5 py-4">
              <div className="text-sm font-semibold text-[#1f1f1f]">
                Visit Details
              </div>
              <div className="text-xs text-[#646179] mt-0.5">
                Enter diagnosis, investigations, treatment, orders and
                prescription for the current visit.
              </div>
            </div>
            <div className="p-4">
              <ConsultationClient visitId={activeVisitId} embedded />
            </div>
          </div>
        ) : null}

        {/* existing modals */}
        <VisitConsultationChargeModal
          open={chargeModalOpen}
          visitId={chargeVisitId}
          onClose={closeChargeModal}
          onSaved={() => {
            closeChargeModal();
            refreshSummary();
          }}
        />

        <RefundPaymentModal
          open={refundOpen}
          visit={refundVisit}
          onClose={() => {
            setRefundOpen(false);
            setRefundVisit(null);
          }}
          onSaved={refreshSummary}
        />

        <UploadVoucherModal
          open={uploadOpen}
          paymentId={uploadPaymentId}
          onClose={() => {
            setUploadOpen(false);
            setUploadPaymentId(null);
          }}
          onSaved={refreshSummary}
        />
      </div>
    </div>
  );
}

/** Small helper to mimic the icon+label rows in screenshot (no icon dependency). */
function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 h-8 w-8 rounded-lg border bg-white flex items-center justify-center text-xs text-[#646179]">
        {/* icon placeholder */}i
      </div>
      <div>
        <div className="text-xs text-[#646179]">{label}</div>
        <div className="text-sm font-semibold text-[#1f1f1f]">
          {value || "—"}
        </div>
      </div>
    </div>
  );
}

function ModalShell({
  open,
  title,
  subtitle,
  children,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[450] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-xl rounded-2xl border bg-white shadow-xl overflow-hidden">
        <div className="border-b px-4 py-3">
          <div className="text-sm font-semibold text-[#1f1f1f]">{title}</div>
          {subtitle ? (
            <div className="text-xs text-[#646179] mt-0.5">{subtitle}</div>
          ) : null}
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

function RefundPaymentModal({
  open,
  visit,
  onClose,
  onSaved,
}: {
  open: boolean;
  visit: VisitRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [modes, setModes] = useState<PaymentMode[]>([]);
  const [mode, setMode] = useState<string>("CASH");
  const [note, setNote] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const refundDue = Number(visit?.refundDue ?? 0);

  useEffect(() => {
    if (!open) return;
    setErr(null);
    setSaving(false);
    setNote("");
    setMode("CASH");

    (async () => {
      try {
        const res = await fetch(`/api/reception/payment-modes`, {
          cache: "no-store",
        });
        const j = await safeJson(res);

        const parsed = parsePaymentModesResponse(j);
        if (res.ok && parsed) {
          setModes(parsed);

          const hasCash = parsed.some(
            (x) => String(x.code).toUpperCase() === "CASH"
          );
          setMode(hasCash ? "CASH" : parsed[0]?.code ?? "CASH");
        } else {
          setModes([]);
        }
      } catch {
        setModes([]);
      }
    })();
  }, [open]);

  if (!open) return null;

  async function submit() {
    if (!visit) return;
    if (!refundDue || refundDue <= 0) {
      setErr("No refund due for this visit.");
      return;
    }
    setErr(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/reception/payments/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visitId: visit.visitId,
          amount: refundDue,
          paymentMode: mode, // API supports paymentMode + paymentModeCode
          note: note.trim() || null,
          serviceCode: "CONSULTATION",
        }),
      });

      const j = await safeJson(res);
      if (!res.ok) {
        setErr(parseErrorResponse(j) || "Failed to record refund.");
        return;
      }

      const paymentId = parsePaymentIdResponse(j);
      if (paymentId) {
        window.open(
          `/reception/refund-voucher/${paymentId}`,
          "_blank",
          "noopener,noreferrer"
        );
      }

      onSaved();
      onClose();
    } catch {
      setErr("Network error.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell
      open={open}
      title="Pay Refund"
      subtitle={`Refund amount: ${formatINR(refundDue)}`}
    >
      {err ? (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-sm text-red-700">
          {err}
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <div className="text-sm font-medium text-slate-600 mb-2">
            Refund Mode
          </div>
          <select
            className="w-full rounded-lg border px-3 py-2 text-sm bg-white border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            disabled={saving}
          >
            {(modes.length
              ? modes
              : [{ code: "CASH", display_name: "Cash" }]
            ).map((m) => (
              <option key={m.code} value={m.code}>
                {m.display_name ?? m.code}
              </option>
            ))}
          </select>
          <div className="mt-1 text-xs text-slate-600">
            Default is CASH (you can change it if refund was done via UPI,
            etc.).
          </div>
        </div>

        <div>
          <div className="text-sm font-medium text-slate-600 mb-2">
            Remarks (optional)
          </div>
          <input
            className="w-full rounded-lg border px-3 py-2 text-sm bg-white border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={saving}
            placeholder='e.g. "Paid back to patient at 4:10pm"'
          />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-60"
          disabled={saving}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          disabled={saving || !refundDue}
        >
          {saving ? "Processing..." : "Record Refund & Print"}
        </button>
      </div>
    </ModalShell>
  );
}

function UploadVoucherModal({
  open,
  paymentId,
  onClose,
  onSaved,
}: {
  open: boolean;
  paymentId: number | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setFile(null);
    setSaving(false);
    setErr(null);
  }, [open]);

  if (!open) return null;

  async function submit() {
    if (!paymentId) return;
    if (!file) {
      setErr("Please choose a file.");
      return;
    }
    setErr(null);
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/reception/payments/${paymentId}/voucher`, {
        method: "POST",
        body: fd,
      });
      const j = await safeJson(res);
      if (!res.ok) {
        setErr(parseErrorResponse(j) || "Failed to upload voucher.");
        return;
      }
      onSaved();
      onClose();
    } catch {
      setErr("Network error.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell
      open={open}
      title="Upload Signed Voucher"
      subtitle="Upload PDF/JPG/PNG (max 5MB)."
    >
      {err ? (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-sm text-red-700">
          {err}
        </div>
      ) : null}

      <input
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="block w-full text-sm"
        disabled={saving}
      />

      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-60"
          disabled={saving}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          disabled={saving || !paymentId || !file}
        >
          {saving ? "Uploading..." : "Upload"}
        </button>
      </div>
    </ModalShell>
  );
}
