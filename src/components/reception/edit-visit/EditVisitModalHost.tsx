// src/components/reception/edit-visit/EditVisitModalHost.tsx
"use client";

import React from "react";
import RegisterPatientModal from "@/components/reception/quick-opd/RegisterPatientModal";
import VisitRegistrationForm from "@/components/reception/quick-opd/VisitRegistrationForm";

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
    <RegisterPatientModal
      open={open}
      onClose={onClose}
      title="Edit Patient / Visit"
    >
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
    </RegisterPatientModal>
  );
}
