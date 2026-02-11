// src/app/(protected)/doctor/visits/[visitId]/consultation/ConsultationClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Plus } from "lucide-react";
import MedicineComboBox from "@/components/ui/MedicineComboBox";

type OrderType = "SCAN" | "PAP_SMEAR" | "CTG" | "LAB";

type LoadedData = {
  ok: true;
  admitRequested?: boolean;
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

// New UI model (kept compatible with existing DB schema)
type RxItem = {
  medicineName: string;

  // numeric doses per time
  morningDose: string; // number string
  afternoonDose: string;
  nightDose: string;

  beforeFood: boolean;
  durationDays: string;

  periodicity: string; // e.g. Daily / Alternate days / etc.
  startDate: string; // yyyy-mm-dd

  instructions: string;
  sortOrder: number;
};

function inputCls() {
  return (
    "w-full rounded-lg border px-3 py-2 text-sm bg-white border-slate-200 text-slate-900 " +
    "placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
  );
}

function textAreaClsSmall() {
  return inputCls() + " min-h-[90px] resize-y";
}

function textAreaClsMedium() {
  return inputCls() + " min-h-[90px] resize-y";
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

// ===== Helpers for backward-compatible storage =====

// dosage stored as "M-A-N" (e.g. "1-0-1")
function parseDosageToDoses(
  dosage: string | null,
  fallback: { m: boolean; a: boolean; n: boolean }
) {
  const raw = (dosage || "").trim();

  if (raw.includes("-")) {
    const parts = raw.split("-").map((x) => x.trim());
    const m = (parts[0] || "").replace(/[^0-9]/g, "");
    const a = (parts[1] || "").replace(/[^0-9]/g, "");
    const n = (parts[2] || "").replace(/[^0-9]/g, "");
    return {
      m: m,
      a: a,
      n: n,
    };
  }

  // If no structured dosage is present, use booleans as 1/blank
  return {
    m: fallback.m ? "1" : "",
    a: fallback.a ? "1" : "",
    n: fallback.n ? "1" : "",
  };
}

// instructions stored with meta header: [P=...][S=yyyy-mm-dd] actual text...
function parseInstructionsMeta(instructions: string | null) {
  const raw = (instructions || "").trim();
  const metaMatch = raw.match(/^\[P=(.*?)\]\[S=(.*?)\]\s*/);

  if (!metaMatch) {
    return {
      periodicity: "Daily",
      startDate: "",
      instructions: raw,
    };
  }

  const periodicity = (metaMatch[1] || "").trim() || "Daily";
  const startDate = (metaMatch[2] || "").trim() || "";
  const rest = raw.replace(/^\[P=(.*?)\]\[S=(.*?)\]\s*/, "");

  return {
    periodicity,
    startDate,
    instructions: rest,
  };
}

function buildInstructionsWithMeta(meta: {
  periodicity: string;
  startDate: string;
  instructions: string;
}) {
  const p = (meta.periodicity || "Daily").trim();
  const s = (meta.startDate || "").trim();
  const body = (meta.instructions || "").trim();

  // Keep meta even if empty startDate; helps future parsing consistency
  return `[P=${p}][S=${s}] ${body}`.trim();
}

function toNumStr(v: string) {
  return (v || "").replace(/[^0-9]/g, "");
}

function blankRxItem(sortOrder: number): RxItem {
  return {
    medicineName: "",
    morningDose: "",
    afternoonDose: "",
    nightDose: "",
    beforeFood: false,
    durationDays: "",
    periodicity: "Daily",
    startDate: "",
    instructions: "",
    sortOrder,
  };
}

export default function ConsultationClient({
  visitId,
  embedded = false,
}: {
  visitId: number;
  /** When embedded inside another page (e.g., Patient Summary), hide page-level chrome and don't navigate away on save. */
  embedded?: boolean;
}) {
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

  // Prescription notes now shown in the top 5-field row
  const [rxNotes, setRxNotes] = useState("");

  const [rxItems, setRxItems] = useState<RxItem[]>([]);
  const [admit, setAdmit] = useState(false);

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

    // Optional (only present after DB migration + API update)
    setAdmit(!!data.admitRequested);

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

    const mapped: RxItem[] = (data.prescriptionItems || []).map((i) => {
      const doses = parseDosageToDoses(i.dosage, {
        m: !!i.morning,
        a: !!i.afternoon,
        n: !!i.night,
      });

      const meta = parseInstructionsMeta(i.instructions);

      return {
        medicineName: i.medicineName,
        morningDose: doses.m,
        afternoonDose: doses.a,
        nightDose: doses.n,
        beforeFood: !!i.beforeFood,
        durationDays: i.durationDays != null ? String(i.durationDays) : "",
        periodicity: meta.periodicity || "Daily",
        startDate: meta.startDate || "",
        instructions: meta.instructions || "",
        sortOrder: Number(i.sortOrder ?? 0),
      };
    });

    // Default 2 rows
    if (mapped.length === 0) {
      setRxItems([blankRxItem(0), blankRxItem(1)]);
    } else if (mapped.length === 1) {
      setRxItems([mapped[0], blankRxItem(1)]);
    } else {
      setRxItems(mapped);
    }
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
      admit,
      orders: {
        scan: { needed: scanNeeded, details: scanDetails },
        pap: { needed: papNeeded, details: papDetails },
        ctg: { needed: ctgNeeded, details: ctgDetails },
        lab: { needed: labNeeded, details: labDetails },
      },
      prescription: {
        notes: rxNotes,
        items: rxItems.map((it, idx) => {
          const m = toNumStr(it.morningDose);
          const a = toNumStr(it.afternoonDose);
          const n = toNumStr(it.nightDose);

          // Store numeric doses compactly in dosage as M-A-N (varchar100)
          const dosage = [m, a, n].join("-"); // e.g. "1-0-1"

          // Store periodicity/startDate inside instructions meta header (varchar255)
          const instructions = buildInstructionsWithMeta({
            periodicity: (it.periodicity || "Daily").trim(),
            startDate: (it.startDate || "").trim(),
            instructions: (it.instructions || "").trim(),
          });

          return {
            medicineName: it.medicineName,
            dosage: dosage.replace(/^-+|-+$/g, "") || undefined,

            // keep your existing booleans (derived from dose > 0)
            morning: Number(m || "0") > 0,
            afternoon: Number(a || "0") > 0,
            night: Number(n || "0") > 0,

            beforeFood: it.beforeFood,
            durationDays: it.durationDays
              ? Number(toNumStr(it.durationDays))
              : null,
            instructions: instructions || undefined,
            sortOrder: Number.isFinite(it.sortOrder) ? it.sortOrder : idx,
          };
        }),
      },
    };
  }, [
    diagnosis,
    investigation,
    treatment,
    remarks,
    admit,
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
        const msg =
          data &&
          typeof data === "object" &&
          "error" in data &&
          typeof (data as Record<string, unknown>).error === "string"
            ? String((data as Record<string, unknown>).error)
            : "Save failed.";
        setErr(msg);
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
      const ok =
        data &&
        typeof data === "object" &&
        "ok" in data &&
        (data as Record<string, unknown>).ok === true;

      if (!res.ok || !ok) {
        const msg =
          data &&
          typeof data === "object" &&
          "error" in data &&
          typeof (data as Record<string, unknown>).error === "string"
            ? String((data as Record<string, unknown>).error)
            : "Failed to mark visit as COMPLETED.";
        setErr(msg);
        return false;
      }

      return true;
    } catch {
      setErr("Network error while marking COMPLETED.");
      return false;
    }
  }

  async function saveFinishPrintAndExit() {
    const ok = await saveOnly();
    if (!ok) return;

    const doneOk = await markDone();
    if (!doneOk) return;

    const pdfUrl = `/api/doctor/visits/${visitId}/consultation/pdf`;

    window.open(pdfUrl, "_blank", "noopener,noreferrer");

    if (embedded) {
      setOkMsg("Saved. Visit marked as COMPLETED.");
      router.push("/doctor");
      router.refresh();
      return;
    }

    router.push("/doctor");
    router.refresh();
  }

  if (loading) {
    if (embedded) return <div className="p-4 text-sm">Loading…</div>;
    return (
      <div className="min-h-[calc(100vh-120px)] bg-[#F2F2F2]">
        <div className="p-6 max-w-5xl mx-auto">Loading…</div>
      </div>
    );
  }

  if (err && !visit) {
    if (embedded) {
      return (
        <div className="p-4">
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {err}
          </div>
        </div>
      );
    }

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
    <div className={embedded ? "" : "min-h-[calc(100vh-120px)] bg-[#F2F2F2]"}>
      <div
        className={embedded ? "space-y-5" : "p-6 max-w-6xl mx-auto space-y-5"}
      >
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
              {!embedded ? (
                <>
                  <button
                    className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-gray-50"
                    onClick={() =>
                      router.push(`/patients/${visit?.patientCode}`)
                    }
                  >
                    View Patient Summary
                  </button>

                  <button
                    className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-gray-50"
                    onClick={() => router.back()}
                  >
                    ← Back
                  </button>
                </>
              ) : null}

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
                title="Save consultation, mark COMPLETED, open PDF, go back to dashboard"
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

        {/* Row 1: 5 textareas in one row */}
        <div className="rounded-2xl border bg-white shadow-sm p-5">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <div className="text-sm font-medium text-slate-700 mb-2">
                Diagnosis
              </div>
              <textarea
                className={textAreaClsSmall()}
                value={diagnosis}
                onChange={(e) => setDiagnosis(e.target.value)}
              />
            </div>

            <div>
              <div className="text-sm font-medium text-slate-700 mb-2">
                Investigation
              </div>
              <textarea
                className={textAreaClsSmall()}
                value={investigation}
                onChange={(e) => setInvestigation(e.target.value)}
              />
            </div>

            <div>
              <div className="text-sm font-medium text-slate-700 mb-2">
                Treatment
              </div>
              <textarea
                className={textAreaClsSmall()}
                value={treatment}
                onChange={(e) => setTreatment(e.target.value)}
              />
            </div>

            <div>
              <div className="text-sm font-medium text-slate-700 mb-2">
                Consultation Remarks
              </div>
              <textarea
                className={textAreaClsSmall()}
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
              />
            </div>

            <div>
              <div className="text-sm font-medium text-slate-700 mb-2">
                Prescription Notes
              </div>
              <textarea
                className={textAreaClsSmall()}
                value={rxNotes}
                onChange={(e) => setRxNotes(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Orders (unchanged layout) */}
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
                className={textAreaClsMedium()}
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
                className={textAreaClsMedium()}
                placeholder="PAP details"
                value={papDetails}
                onChange={(e) => setPapDetails(e.target.value)}
                disabled={!papNeeded}
              />
            </div>

            <div className="rounded-xl border bg-slate-50 p-3">
              <Toggle label="CTG" checked={ctgNeeded} onChange={setCtgNeeded} />
              <textarea
                className={textAreaClsMedium()}
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
                className={textAreaClsMedium()}
                placeholder="Lab test details"
                value={labDetails}
                onChange={(e) => setLabDetails(e.target.value)}
                disabled={!labNeeded}
              />
            </div>
          </div>
        </div>

        {/* Prescription (table redesigned) */}
        <div className="rounded-2xl border bg-white shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-900">
              Prescription
            </div>

            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm hover:bg-gray-50"
              onClick={() =>
                setRxItems((prev) => [...prev, blankRxItem(prev.length)])
              }
            >
              <Plus className="h-4 w-4" />
              Add Medicine
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr className="border-b">
                  <th className="px-2 py-2 text-left font-medium min-w-[220px]">
                    Medicine
                  </th>
                  <th className="px-2 py-2 text-center font-medium min-w-[170px]">
                    Dosage (M / A / N)
                  </th>
                  <th className="px-2 py-2 text-center font-medium min-w-[110px]">
                    Before food
                  </th>
                  <th className="px-2 py-2 text-left font-medium min-w-[110px]">
                    Duration
                  </th>
                  <th className="px-2 py-2 text-left font-medium min-w-[140px]">
                    Periodicity
                  </th>
                  <th className="px-2 py-2 text-left font-medium min-w-[150px]">
                    Start Date
                  </th>
                  <th className="px-2 py-2 text-left font-medium min-w-[240px]">
                    Instructions
                  </th>
                  <th className="px-2 py-2 text-right font-medium"> </th>
                </tr>
              </thead>

              <tbody>
                {rxItems.map((it, idx) => (
                  <tr key={idx} className="border-b last:border-b-0 align-top">
                    <td className="px-2 py-2">
                      <MedicineComboBox
                        value={it.medicineName}
                        onChange={(v) =>
                          setRxItems((prev) =>
                            prev.map((x, i) =>
                              i === idx ? { ...x, medicineName: v } : x
                            )
                          )
                        }
                        placeholder="Select / type medicine"
                      />
                    </td>

                    <td className="px-2 py-2">
                      <div className="grid grid-cols-3 gap-2">
                        <input
                          className={inputCls()}
                          inputMode="numeric"
                          placeholder="M"
                          value={it.morningDose}
                          onChange={(e) => {
                            const v = toNumStr(e.target.value);
                            setRxItems((prev) =>
                              prev.map((x, i) =>
                                i === idx ? { ...x, morningDose: v } : x
                              )
                            );
                          }}
                        />
                        <input
                          className={inputCls()}
                          inputMode="numeric"
                          placeholder="A"
                          value={it.afternoonDose}
                          onChange={(e) => {
                            const v = toNumStr(e.target.value);
                            setRxItems((prev) =>
                              prev.map((x, i) =>
                                i === idx ? { ...x, afternoonDose: v } : x
                              )
                            );
                          }}
                        />
                        <input
                          className={inputCls()}
                          inputMode="numeric"
                          placeholder="N"
                          value={it.nightDose}
                          onChange={(e) => {
                            const v = toNumStr(e.target.value);
                            setRxItems((prev) =>
                              prev.map((x, i) =>
                                i === idx ? { ...x, nightDose: v } : x
                              )
                            );
                          }}
                        />
                      </div>
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
                        placeholder="Days"
                        value={it.durationDays}
                        onChange={(e) => {
                          const v = toNumStr(e.target.value);
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
                        placeholder="Daily / Alternate..."
                        value={it.periodicity}
                        onChange={(e) => {
                          const v = e.target.value;
                          setRxItems((prev) =>
                            prev.map((x, i) =>
                              i === idx ? { ...x, periodicity: v } : x
                            )
                          );
                        }}
                      />
                    </td>

                    <td className="px-2 py-2">
                      <input
                        type="date"
                        className={inputCls()}
                        value={it.startDate}
                        onChange={(e) => {
                          const v = e.target.value;
                          setRxItems((prev) =>
                            prev.map((x, i) =>
                              i === idx ? { ...x, startDate: v } : x
                            )
                          );
                        }}
                      />
                    </td>

                    <td className="px-2 py-2">
                      <textarea
                        className={inputCls() + " min-h-[42px] resize-y"}
                        value={it.instructions}
                        onChange={(e) => {
                          const v = e.target.value;
                          setRxItems((prev) =>
                            prev.map((x, i) =>
                              i === idx ? { ...x, instructions: v } : x
                            )
                          );
                        }}
                        placeholder="e.g. After lunch"
                      />
                    </td>

                    <td className="px-2 py-2 text-right">
                      <button
                        type="button"
                        className="inline-flex items-center justify-center rounded-lg border bg-white p-2 hover:bg-gray-50 disabled:opacity-60"
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
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Optional bottom Save */}
          <div className="flex justify-end gap-2">
            <label className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={admit}
                onChange={(e) => setAdmit(e.target.checked)}
              />
              <span className="font-medium">Admit</span>
            </label>
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
