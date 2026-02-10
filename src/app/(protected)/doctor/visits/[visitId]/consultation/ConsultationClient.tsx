// src/app/(protected)/doctor/visits/[visitId]/consultation/ConsultationClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type OrderType = "SCAN" | "PAP_SMEAR" | "CTG" | "LAB";

type LoadedData = {
  ok: true;
  visit: {
    visitId: number;
    visitDate: string;
    patientCode: string;
    patientName: string;
  };
  note: {
    diagnosis: string | null;
    investigation: string | null;
    treatment: string | null;
    remarks: string | null;
  } | null;
  prescription: { prescriptionId: number; notes: string | null } | null;
  prescriptionItems: Array<{
    id: number;
    medicineName: string;
    dosage: string | null;
    morning: boolean;
    afternoon: boolean;
    night: boolean;
    beforeFood: boolean;
    durationDays: number | null;
    instructions: string | null;
    sortOrder: number;
  }>;
  orders: Array<{
    id: number;
    orderType: OrderType;
    details: string;
    status: "ORDERED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
    createdAt: string;
  }>;
};

type RxItem = {
  medicineName: string;
  dosage: string;
  morning: boolean;
  afternoon: boolean;
  night: boolean;
  beforeFood: boolean;
  durationDays: string;
  instructions: string;
  sortOrder: number;
};

function inputCls() {
  return (
    "w-full rounded-lg border px-3 py-2 text-sm bg-white border-slate-200 text-slate-900 " +
    "placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
  );
}

function textAreaCls() {
  return inputCls() + " min-h-[90px]";
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-900">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="font-medium">{label}</span>
    </label>
  );
}

export default function ConsultationClient({ visitId }: { visitId: number }) {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [visit, setVisit] = useState<LoadedData["visit"] | null>(null);

  const [diagnosis, setDiagnosis] = useState("");
  const [investigation, setInvestigation] = useState("");
  const [treatment, setTreatment] = useState("");
  const [remarks, setRemarks] = useState("");

  const [scanNeeded, setScanNeeded] = useState(false);
  const [scanDetails, setScanDetails] = useState("");
  const [papNeeded, setPapNeeded] = useState(false);
  const [papDetails, setPapDetails] = useState("");
  const [ctgNeeded, setCtgNeeded] = useState(false);
  const [ctgDetails, setCtgDetails] = useState("");

  const [labNeeded, setLabNeeded] = useState(false);
  const [labDetails, setLabDetails] = useState("");

  const [rxNotes, setRxNotes] = useState("");
  const [rxItems, setRxItems] = useState<RxItem[]>([]);

  function blankRxItem(sortOrder: number): RxItem {
    return {
      medicineName: "",
      dosage: "",
      morning: true,
      afternoon: false,
      night: true,
      beforeFood: false,
      durationDays: "",
      instructions: "",
      sortOrder,
    };
  }

  function hydrate(data: LoadedData) {
    setVisit({
      visitId: data.visit.visitId,
      visitDate: data.visit.visitDate,
      patientCode: data.visit.patientCode,
      patientName: data.visit.patientName,
    });

    setDiagnosis(data.note?.diagnosis ?? "");
    setInvestigation(data.note?.investigation ?? "");
    setTreatment(data.note?.treatment ?? "");
    setRemarks(data.note?.remarks ?? "");

    const oScan = data.orders.find(
      (o) => o.orderType === "SCAN" && o.status !== "CANCELLED"
    );
    const oPap = data.orders.find(
      (o) => o.orderType === "PAP_SMEAR" && o.status !== "CANCELLED"
    );
    const oCtg = data.orders.find(
      (o) => o.orderType === "CTG" && o.status !== "CANCELLED"
    );

    const oLab = data.orders.find(
      (o) => o.orderType === "LAB" && o.status !== "CANCELLED"
    );

    setScanNeeded(!!oScan);
    setScanDetails(oScan?.details ?? "");
    setPapNeeded(!!oPap);
    setPapDetails(oPap?.details ?? "");
    setCtgNeeded(!!oCtg);
    setCtgDetails(oCtg?.details ?? "");

    setLabNeeded(!!oLab);
    setLabDetails(oLab?.details ?? "");

    setRxNotes(data.prescription?.notes ?? "");

    const mapped = (data.prescriptionItems || []).map((i) => ({
      medicineName: i.medicineName,
      dosage: i.dosage ?? "",
      morning: !!i.morning,
      afternoon: !!i.afternoon,
      night: !!i.night,
      beforeFood: !!i.beforeFood,
      durationDays: i.durationDays != null ? String(i.durationDays) : "",
      instructions: i.instructions ?? "",
      sortOrder: Number(i.sortOrder ?? 0),
    }));

    setRxItems(mapped.length ? mapped : [blankRxItem(0)]);
  }

  async function load() {
    setLoading(true);
    setErr(null);
    setOkMsg(null);
    try {
      const res = await fetch(`/api/doctor/visits/${visitId}/consultation`, {
        cache: "no-store",
      });

      const data: unknown = await res.json().catch(() => null);

      if (!res.ok) {
        const msg = getErrorMessage(data) ?? "Failed to load consultation.";
        setErr(msg);
        return;
      }

      if (!isLoadedData(data)) {
        setErr("Unexpected response from server.");
        return;
      }

      hydrate(data);
    } catch {
      setErr("Network error.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!Number.isFinite(visitId) || visitId <= 0) {
      setErr("Invalid visitId.");
      setLoading(false);
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visitId]);

  const payload = useMemo(() => {
    return {
      diagnosis,
      investigation,
      treatment,
      remarks,
      orders: {
        scan: { needed: scanNeeded, details: scanDetails },
        pap: { needed: papNeeded, details: papDetails },
        ctg: { needed: ctgNeeded, details: ctgDetails },
        lab: { needed: labNeeded, details: labDetails },
      },
      prescription: {
        notes: rxNotes,
        items: rxItems.map((it, idx) => ({
          medicineName: it.medicineName,
          dosage: it.dosage || undefined,
          morning: it.morning,
          afternoon: it.afternoon,
          night: it.night,
          beforeFood: it.beforeFood,
          durationDays: it.durationDays ? Number(it.durationDays) : null,
          instructions: it.instructions || undefined,
          sortOrder: Number.isFinite(it.sortOrder) ? it.sortOrder : idx,
        })),
      },
    };
  }, [
    diagnosis,
    investigation,
    treatment,
    remarks,
    scanNeeded,
    scanDetails,
    papNeeded,
    papDetails,
    ctgNeeded,
    ctgDetails,
    labNeeded,
    labDetails,
    rxNotes,
    rxItems,
  ]);

  async function saveOnly(): Promise<boolean> {
    setSaving(true);
    setErr(null);
    setOkMsg(null);

    try {
      const res = await fetch(`/api/doctor/visits/${visitId}/consultation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data?.error || "Save failed.");
        return false;
      }

      setOkMsg("Saved.");
      return true;
    } catch {
      setErr("Network error while saving.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function markDone(): Promise<boolean> {
    try {
      const res = await fetch(`/api/doctor/visits/${visitId}/done`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setErr(data?.error || "Failed to mark visit as DONE.");
        return false;
      }
      return true;
    } catch {
      setErr("Network error while marking DONE.");
      return false;
    }
  }

  async function saveFinishPrintAndExit() {
    const ok = await saveOnly();
    if (!ok) return;

    const doneOk = await markDone();
    if (!doneOk) return;

    const pdfUrl = `/api/doctor/visits/${visitId}/consultation/pdf`;

    // Open PDF (single window) — no about:blank
    // Must happen synchronously after user action; keep this function directly called by button onClick.
    window.open(pdfUrl, "_blank", "noopener,noreferrer");

    // Navigate back to doctor dashboard + refresh
    router.push("/doctor");
    router.refresh();
  }

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-120px)] bg-[#F2F2F2]">
        <div className="p-6 max-w-5xl mx-auto">Loading…</div>
      </div>
    );
  }

  if (err && !visit) {
    return (
      <div className="min-h-[calc(100vh-120px)] bg-[#F2F2F2]">
        <div className="p-6 max-w-5xl mx-auto">
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {err}
          </div>
          <button
            className="mt-3 rounded-lg border bg-white px-4 py-2 text-sm hover:bg-gray-50"
            onClick={() => router.back()}
          >
            ← Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-120px)] bg-[#F2F2F2]">
      <div className="p-6 max-w-5xl mx-auto space-y-5">
        {/* Header */}
        <div className="rounded-2xl border bg-white shadow-sm p-5">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-xs text-slate-600">Consultation</div>
              <div className="mt-1 text-xl font-semibold text-slate-900">
                {visit?.patientName}{" "}
                <span className="text-slate-500">({visit?.patientCode})</span>
              </div>
              <div className="mt-1 text-sm text-slate-600">
                Visit Date: {visit?.visitDate}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-gray-50"
                onClick={() => router.push(`/patients/${visit?.patientCode}`)}
              >
                View Patient Summary
              </button>

              <button
                className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-gray-50"
                onClick={() => router.back()}
              >
                ← Back
              </button>

              <button
                type="button"
                onClick={() =>
                  window.open(
                    `/api/doctor/visits/${visitId}/consultation/pdf`,
                    "_blank",
                    "noopener,noreferrer"
                  )
                }
                className="rounded-lg border bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50"
              >
                🖨️ Print Consultation Summary
              </button>

              <button
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                disabled={saving}
                onClick={saveFinishPrintAndExit}
                title="Save consultation, mark DONE, open PDF, go back to dashboard"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>

          {err && (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {err}
            </div>
          )}
          {okMsg && (
            <div className="mt-3 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-700">
              {okMsg}
            </div>
          )}
        </div>

        {/* Diagnosis / Investigation */}
        <div className="rounded-2xl border bg-white shadow-sm p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="text-sm font-medium text-slate-700 mb-2">
                Diagnosis
              </div>
              <textarea
                className={textAreaCls()}
                value={diagnosis}
                onChange={(e) => setDiagnosis(e.target.value)}
              />
            </div>
            <div>
              <div className="text-sm font-medium text-slate-700 mb-2">
                Investigation
              </div>
              <textarea
                className={textAreaCls()}
                value={investigation}
                onChange={(e) => setInvestigation(e.target.value)}
              />
            </div>
          </div>

          <div>
            <div className="text-sm font-medium text-slate-700 mb-2">
              Treatment
            </div>
            <textarea
              className={textAreaCls()}
              value={treatment}
              onChange={(e) => setTreatment(e.target.value)}
            />
          </div>

          <div>
            <div className="text-sm font-medium text-slate-700 mb-2">
              Consultation Remarks
            </div>
            <textarea
              className={textAreaCls()}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
            />
          </div>
        </div>

        {/* Orders */}
        <div className="rounded-2xl border bg-white shadow-sm p-5 space-y-4">
          <div className="text-sm font-semibold text-slate-900">Orders</div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl border bg-slate-50 p-3">
              <Toggle
                label="Scan"
                checked={scanNeeded}
                onChange={setScanNeeded}
              />
              <textarea
                className={textAreaCls()}
                placeholder="Scan details (type, region, notes)"
                value={scanDetails}
                onChange={(e) => setScanDetails(e.target.value)}
                disabled={!scanNeeded}
              />
            </div>

            <div className="rounded-xl border bg-slate-50 p-3">
              <Toggle
                label="PAP Smear"
                checked={papNeeded}
                onChange={setPapNeeded}
              />
              <textarea
                className={textAreaCls()}
                placeholder="PAP details"
                value={papDetails}
                onChange={(e) => setPapDetails(e.target.value)}
                disabled={!papNeeded}
              />
            </div>

            <div className="rounded-xl border bg-slate-50 p-3">
              <Toggle label="CTG" checked={ctgNeeded} onChange={setCtgNeeded} />
              <textarea
                className={textAreaCls()}
                placeholder="CTG details"
                value={ctgDetails}
                onChange={(e) => setCtgDetails(e.target.value)}
                disabled={!ctgNeeded}
              />
            </div>

            <div className="rounded-xl border bg-slate-50 p-3">
              <Toggle
                label="Lab Tests"
                checked={labNeeded}
                onChange={setLabNeeded}
              />
              <textarea
                className={textAreaCls()}
                placeholder="Lab test details"
                value={labDetails}
                onChange={(e) => setLabDetails(e.target.value)}
                disabled={!labNeeded}
              />
            </div>
          </div>
        </div>

        {/* Prescription */}
        <div className="rounded-2xl border bg-white shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-900">
              Prescription
            </div>
            <button
              type="button"
              className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-gray-50"
              onClick={() => {
                setRxItems((prev) => [...prev, blankRxItem(prev.length)]);
              }}
            >
              ➕ Add Medicine
            </button>
          </div>

          <div>
            <div className="text-sm font-medium text-slate-700 mb-2">
              Prescription Notes
            </div>
            <textarea
              className={textAreaCls()}
              value={rxNotes}
              onChange={(e) => setRxNotes(e.target.value)}
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr className="border-b">
                  <th className="px-2 py-2 text-left font-medium min-w-[220px]">
                    Medicine
                  </th>
                  <th className="px-2 py-2 text-left font-medium min-w-[120px]">
                    Dosage
                  </th>
                  <th className="px-2 py-2 text-center font-medium">M</th>
                  <th className="px-2 py-2 text-center font-medium">A</th>
                  <th className="px-2 py-2 text-center font-medium">N</th>
                  <th className="px-2 py-2 text-center font-medium min-w-[120px]">
                    Before food
                  </th>
                  <th className="px-2 py-2 text-left font-medium min-w-[120px]">
                    Days
                  </th>
                  <th className="px-2 py-2 text-left font-medium min-w-[200px]">
                    Instructions
                  </th>
                  <th className="px-2 py-2 text-right font-medium">Action</th>
                </tr>
              </thead>

              <tbody>
                {rxItems.map((it, idx) => (
                  <tr key={idx} className="border-b last:border-b-0">
                    <td className="px-2 py-2">
                      <input
                        className={inputCls()}
                        value={it.medicineName}
                        onChange={(e) => {
                          const v = e.target.value;
                          setRxItems((prev) =>
                            prev.map((x, i) =>
                              i === idx ? { ...x, medicineName: v } : x
                            )
                          );
                        }}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        className={inputCls()}
                        value={it.dosage}
                        onChange={(e) => {
                          const v = e.target.value;
                          setRxItems((prev) =>
                            prev.map((x, i) =>
                              i === idx ? { ...x, dosage: v } : x
                            )
                          );
                        }}
                      />
                    </td>
                    <td className="px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={it.morning}
                        onChange={(e) =>
                          setRxItems((prev) =>
                            prev.map((x, i) =>
                              i === idx
                                ? { ...x, morning: e.target.checked }
                                : x
                            )
                          )
                        }
                      />
                    </td>
                    <td className="px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={it.afternoon}
                        onChange={(e) =>
                          setRxItems((prev) =>
                            prev.map((x, i) =>
                              i === idx
                                ? { ...x, afternoon: e.target.checked }
                                : x
                            )
                          )
                        }
                      />
                    </td>
                    <td className="px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={it.night}
                        onChange={(e) =>
                          setRxItems((prev) =>
                            prev.map((x, i) =>
                              i === idx ? { ...x, night: e.target.checked } : x
                            )
                          )
                        }
                      />
                    </td>
                    <td className="px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={it.beforeFood}
                        onChange={(e) =>
                          setRxItems((prev) =>
                            prev.map((x, i) =>
                              i === idx
                                ? { ...x, beforeFood: e.target.checked }
                                : x
                            )
                          )
                        }
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        className={inputCls()}
                        inputMode="numeric"
                        value={it.durationDays}
                        onChange={(e) => {
                          const v = e.target.value.replace(/[^0-9]/g, "");
                          setRxItems((prev) =>
                            prev.map((x, i) =>
                              i === idx ? { ...x, durationDays: v } : x
                            )
                          );
                        }}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        className={inputCls()}
                        value={it.instructions}
                        onChange={(e) => {
                          const v = e.target.value;
                          setRxItems((prev) =>
                            prev.map((x, i) =>
                              i === idx ? { ...x, instructions: v } : x
                            )
                          );
                        }}
                      />
                    </td>
                    <td className="px-2 py-2 text-right">
                      <button
                        type="button"
                        className="rounded-lg border bg-white px-3 py-1.5 text-xs hover:bg-gray-50"
                        onClick={() =>
                          setRxItems((prev) => prev.filter((_, i) => i !== idx))
                        }
                        disabled={rxItems.length === 1}
                        title={
                          rxItems.length === 1
                            ? "At least one row required"
                            : "Remove"
                        }
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Optional bottom Save (same action) */}
          <div className="flex justify-end gap-2">
            <button
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              disabled={saving}
              onClick={saveFinishPrintAndExit}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function getErrorMessage(v: unknown): string | null {
  if (v && typeof v === "object" && "error" in v) {
    const e = (v as Record<string, unknown>).error;
    return typeof e === "string" ? e : null;
  }
  return null;
}

function isLoadedData(v: unknown): v is LoadedData {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  if (o.ok !== true) return false;
  if (!o.visit || typeof o.visit !== "object") return false;
  return true;
}
