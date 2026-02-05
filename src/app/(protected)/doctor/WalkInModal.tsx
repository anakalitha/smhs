"use client";

import React, { useEffect, useMemo, useState } from "react";
import ReferralComboBox from "@/components/ui/ReferralComboBox";

type PatientHitRow = {
  patientDbId: number;
  patientCode: string;
  name: string;
  phone: string | null;
  lastVisit?: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: (r: { visitId: number; patientCode: string }) => void;
};

const inputClass =
  "w-full rounded-lg border px-3 py-2 text-sm transition-all duration-200 " +
  "bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 " +
  "focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500";

function isValidPhone10(phone: string) {
  return /^[0-9]{10}$/.test(phone);
}

function normalizePhone(v: string) {
  return v.replace(/\s+/g, "");
}

export default function WalkInModal({ open, onClose, onCreated }: Props) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // search
  const [searchQ, setSearchQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [hits, setHits] = useState<PatientHitRow[]>([]);
  const [selectedPatientDbId, setSelectedPatientDbId] = useState<number | null>(
    null
  );

  // fields
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  // referral dropdown selection
  const [referral, setReferral] = useState<{ id: string; name: string } | null>(
    null
  );

  const dirty = useMemo(() => {
    return (
      searchQ.trim() ||
      name.trim() ||
      phone.trim() ||
      referral != null ||
      selectedPatientDbId != null
    );
  }, [searchQ, name, phone, referral, selectedPatientDbId]);

  // Reset modal state on open
  useEffect(() => {
    if (!open) return;

    setErr(null);
    setLoading(false);
    setSearching(false);

    setHits([]);
    setSelectedPatientDbId(null);

    setSearchQ("");
    setName("");
    setPhone("");
    setReferral(null);
  }, [open]);

  async function doSearch() {
    const q = searchQ.trim();
    if (!q) {
      setHits([]);
      setSelectedPatientDbId(null);
      return;
    }

    setSearching(true);
    setErr(null);
    try {
      const qs = new URLSearchParams({ q, limit: "12" });
      const res = await fetch(`/api/doctor/patient-search?${qs.toString()}`, {
        cache: "no-store",
      });

      const data = (await res.json().catch(() => ({}))) as {
        rows?: PatientHitRow[];
        error?: string;
      };

      if (!res.ok) {
        setErr(data?.error || "Failed to search patients.");
        setHits([]);
        setSelectedPatientDbId(null);
        return;
      }

      const rows = (data.rows || []) as PatientHitRow[];
      setHits(rows);

      // If exactly one match, auto-select and prefill
      if (rows.length === 1) {
        selectHit(rows[0]);
      }
    } catch {
      setErr("Network error while searching.");
      setHits([]);
      setSelectedPatientDbId(null);
    } finally {
      setSearching(false);
    }
  }

  function selectHit(hit: PatientHitRow) {
    setSelectedPatientDbId(hit.patientDbId);
    setName(hit.name || "");
    setPhone(hit.phone || "");
    // Do not auto-set referral; doctor can pick/change it for this visit.
  }

  function handleCancel() {
    if (dirty) {
      const ok = window.confirm("Discard changes and close?");
      if (!ok) return;
    }
    onClose();
  }

  async function handleRegister() {
    setErr(null);

    const nm = name.trim();
    const ph = normalizePhone(phone.trim());
    const referralId = referral?.id ?? null;

    if (!nm) {
      setErr("Name is required.");
      return;
    }

    if (ph && !isValidPhone10(ph)) {
      setErr("Phone must be a valid 10-digit number (or leave it empty).");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/doctor/walkin-register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientDbId: selectedPatientDbId, // null => create new patient
          name: nm,
          phone: ph || null,
          referralId, // ✅ comes from ReferralComboBox
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        visitId?: number;
        patientCode?: string;
        error?: string;
      };

      if (!res.ok || !data.ok || !data.visitId || !data.patientCode) {
        setErr(data?.error || "Failed to register walk-in.");
        return;
      }

      onCreated({ visitId: data.visitId, patientCode: data.patientCode });
    } catch {
      setErr("Network error while registering.");
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100]">
      {/* backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={handleCancel} />

      {/* modal */}
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-3xl rounded-2xl bg-white shadow-xl border">
          {/* header */}
          <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
            <div>
              <div className="text-lg font-semibold text-slate-900">
                Register Walk-in Patient
              </div>
              <div className="text-sm text-slate-600 mt-0.5">
                Search a repeat patient or enter details to create today’s
                visit.
              </div>
            </div>

            <button
              type="button"
              onClick={handleCancel}
              className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-gray-50"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          {/* body */}
          <div className="px-5 py-4">
            {err && (
              <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {err}
              </div>
            )}

            {/* search row */}
            <div className="flex flex-col md:flex-row gap-2 mb-4">
              <input
                className={inputClass}
                placeholder="Search by Patient ID / Name / Phone"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") doSearch();
                }}
              />
              <button
                type="button"
                onClick={doSearch}
                disabled={searching}
                className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {searching ? "Searching..." : "Search"}
              </button>
            </div>

            {/* search results (only show if multiple) */}
            {hits.length > 1 && (
              <div className="mb-4 rounded-xl border bg-white">
                <div className="border-b px-3 py-2 text-sm font-medium text-slate-900">
                  Matches (click to prefill)
                </div>
                <div className="max-h-48 overflow-auto">
                  {hits.map((h) => (
                    <button
                      key={h.patientDbId}
                      type="button"
                      onClick={() => selectHit(h)}
                      className={[
                        "w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b last:border-b-0",
                        selectedPatientDbId === h.patientDbId
                          ? "bg-blue-50"
                          : "",
                      ].join(" ")}
                    >
                      <div className="font-medium text-slate-900">
                        {h.patientCode} — {h.name}
                      </div>
                      <div className="text-xs text-slate-600">
                        {h.phone ?? "—"}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-slate-600 mb-1">Full Name</div>
                <input
                  className={inputClass}
                  placeholder="Patient name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div>
                <div className="text-xs text-slate-600 mb-1">Phone</div>
                <input
                  className={inputClass}
                  placeholder="10-digit phone (optional)"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>

              <div className="md:col-span-1">
                <label className="block text-xs text-slate-600 mb-1">
                  Referred By
                </label>

                <ReferralComboBox
                  value={referral}
                  onChange={setReferral}
                  apiBase="/api/reception/referrals"
                />
              </div>
            </div>
          </div>

          {/* footer */}
          <div className="flex items-center justify-end gap-2 border-t px-5 py-4">
            <button
              type="button"
              onClick={handleCancel}
              className="rounded-lg border bg-white px-5 py-2 text-sm hover:bg-gray-50"
              disabled={loading}
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleRegister}
              className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              disabled={loading}
            >
              {loading ? "Registering..." : "Register"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
