// src\components\ui\confirm-dialog.tsx
"use client";

import React, { useEffect } from "react";

export default function ConfirmDialog({
  open,
  title = "Are you sure?",
  prompt = "You may lose data!",
  yesText = "Yes",
  noText = "No",
  onYes,
  onNo,
}: {
  open: boolean;
  title?: string;
  prompt?: string;
  yesText?: string;
  noText?: string;
  onYes: () => void;
  onNo: () => void;
}) {
  useEffect(() => {
    if (!open) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onNo();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onNo]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl border bg-white shadow-xl">
        <div className="p-4 border-b">
          <div className="text-base font-semibold text-[#1f1f1f]">{title}</div>
          <div className="mt-1 text-sm text-[#646179]">{prompt}</div>
        </div>

        <div className="p-4 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onNo}
            className="rounded-lg border bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50"
          >
            {noText}
          </button>
          <button
            type="button"
            onClick={onYes}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            {yesText}
          </button>
        </div>
      </div>
    </div>
  );
}
