// src/components/reception/ReceptionHeader.tsx
"use client";

import React from "react";
import Link from "next/link";

type Props = {
  title?: string;
  subtitle?: string;

  registerHref?: string;
  registerLabel?: string;
  registerDisabled?: boolean;
  onRegisterPatient?: () => void;
};

export default function ReceptionHeader({
  title = "Reception Dashboard",
  subtitle = "Today's queue, quick registration, patient lookup, billing and reports.",
  registerHref = "/reception/register",
  registerLabel = "Register Patient",
  registerDisabled = false,
  onRegisterPatient,
}: Props) {
  function openEodReport() {
    window.open("/reports/consultations/eod", "_blank", "noopener,noreferrer");
  }

  function openReports() {
    window.open("/reports/common", "_blank", "noopener,noreferrer");
  }

  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[#1f1f1f]">
          {title}
        </h1>
        <p className="text-sm mt-1 text-[#646179]">{subtitle}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {/* Register Patient */}
        {/* Register Patient */}
        {onRegisterPatient ? (
          <button
            type="button"
            onClick={onRegisterPatient}
            disabled={registerDisabled}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {registerLabel}
          </button>
        ) : (
          <Link
            href={registerHref}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            {registerLabel}
          </Link>
        )}

        {/* EOD Summary Report (minimal secondary action) */}

        <button
          type="button"
          onClick={openEodReport}
          className="
            rounded-lg
            border
            border-slate-300
            bg-gray-200
            px-4
            py-2
            text-sm
            font-medium
            text-slate-700
            hover:bg-slate-50
            hover:text-slate-900
          "
        >
          EOD Summary Report
        </button>

        <button
          type="button"
          onClick={openReports}
          className="
            rounded-lg
            border
            border-slate-300
            bg-gray-200
            px-4
            py-2
            text-sm
            font-medium
            text-slate-700
            hover:bg-slate-50
            hover:text-slate-900
          "
        >
          Reports
        </button>
      </div>
    </div>
  );
}
