// src\components\reception\quick-opd\RegisterPatientModal.tsx
"use client";

import React, { useEffect } from "react";

export default function RegisterPatientModal({
  open,
  onClose,
  title = "Register Patient",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-5xl rounded-2xl border bg-white shadow-xl overflow-hidden">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="text-sm font-semibold text-[#1f1f1f]">{title}</div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            Close
          </button>
        </div>

        {/* Body scrolls */}
        <div className="max-h-[80vh] overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}
