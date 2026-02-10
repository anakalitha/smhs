// src\components\ui\PickPatientModal.tsx
"use client";

import React, { useEffect, useMemo } from "react";

export type PatientHit = {
  patientCode: string;
  name: string;
  phone: string | null;

  referralpersonId?: string | null;
  referralpersonName?: string | null;
};

export default function PickPatientModal({
  open,
  hits,
  loading,
  error,
  onClose,
  onSelect,
  title = "Select Patient",
  subtitle = "Multiple matches found. Choose the correct patient to prefill.",
}: {
  open: boolean;
  hits: PatientHit[];
  loading?: boolean;
  error?: string | null;
  onClose: () => void;
  onSelect: (patientCode: string) => void;
  title?: string;
  subtitle?: string;
}) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const rows = useMemo(() => hits ?? [], [hits]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-2xl border bg-white shadow-xl overflow-hidden">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-[#1f1f1f]">{title}</div>
            <div className="text-xs text-[#646179]">{subtitle}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            Close
          </button>
        </div>

        <div className="p-4">
          {error && (
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="w-full overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-[#646179]">
                <tr className="border-b">
                  <th className="px-3 py-2 text-left font-medium">
                    Patient ID
                  </th>
                  <th className="px-3 py-2 text-left font-medium">Name</th>
                  <th className="px-3 py-2 text-left font-medium">Phone</th>
                  <th className="px-3 py-2 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((h) => (
                  <tr key={h.patientCode} className="border-b last:border-b-0">
                    <td className="px-3 py-2 font-medium text-[#1f1f1f]">
                      {h.patientCode}
                    </td>
                    <td className="px-3 py-2 text-[#1f1f1f]">{h.name}</td>
                    <td className="px-3 py-2 text-[#646179]">
                      {h.phone ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        disabled={loading}
                        className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                        onClick={() => onSelect(h.patientCode)}
                      >
                        {loading ? "Selecting..." : "Select"}
                      </button>
                    </td>
                  </tr>
                ))}

                {rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-3 py-6 text-center text-[#646179]"
                    >
                      No matches.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-3 text-xs text-[#646179]">
            Tip: Use Patient ID or exact phone for faster matching.
          </div>
        </div>
      </div>
    </div>
  );
}
