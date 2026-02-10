// src/components/reception/quick-opd/RegisterPatientModal.tsx
"use client";

import React, { useEffect, useState } from "react";
import ConfirmDialog from "@/components/ui/confirm-dialog";

export default function RegisterPatientModal({
  open,
  onClose,
  title = "",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);

  /** Ask before closing */
  function requestClose() {
    setConfirmCloseOpen(true);
  }

  useEffect(() => {
    if (!open) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        requestClose();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-5xl rounded-2xl border bg-white shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="text-sm font-semibold text-[#1f1f1f]">{title}</div>

          <button
            type="button"
            onClick={requestClose}
            className="rounded-lg border bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            Close
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[80vh] overflow-y-auto p-4">{children}</div>
      </div>

      {/* Confirm Close */}
      <ConfirmDialog
        open={confirmCloseOpen}
        title="Close registration?"
        prompt="Any unsaved changes will be lost."
        yesText="Yes, Close"
        noText="Cancel"
        onYes={() => {
          setConfirmCloseOpen(false);
          onClose();
        }}
        onNo={() => setConfirmCloseOpen(false)}
      />
    </div>
  );
}
