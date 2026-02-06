// src\components\reception\edit-visit\EditVisitModalHost.tsx
"use client";

import React from "react";
import VisitRegistrationForm from "@/components/reception/quick-opd/VisitRegistrationForm";

// Replace with your own modal component
function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-5xl rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <div className="text-base font-semibold">{title || "Edit Visit"}</div>
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-1 hover:bg-gray-100"
          >
            ✕
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

export default function EditVisitModalHost({
  open,
  visitId,
  onClose,
  onSaved,
}: {
  open: boolean;
  visitId: number | null;
  onClose: () => void;
  onSaved?: (visitId: number) => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Edit Patient / Visit">
      <VisitRegistrationForm
        mode="edit"
        visitId={visitId ?? null}
        showFetch={false}
        openBillOnCreate={false}
        onSuccess={({ visitId }) => {
          onSaved?.(visitId);
          onClose();
        }}
      />
    </Modal>
  );
}
