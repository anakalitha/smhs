"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

type ReportItem = {
  label: string;
  href: string;
  dividerAbove?: boolean;
};

type Props = {
  title?: string;
  subtitle?: string;

  registerHref?: string;
  registerLabel?: string;
  registerDisabled?: boolean;

  reportsLabel?: string;
};

export default function ReceptionHeader({
  title = "Reception Dashboard",
  subtitle = "Today&apos;s queue, quick registration, patient lookup, billing and reports.",
  registerHref = "/reception/register",
  registerLabel = "➕ Register Patient",
  registerDisabled = false,
  reportsLabel = "📄 Reports ▾",
}: Props) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const REPORTS: ReportItem[] = useMemo(
    () => [
      {
        label: "Generate EOD Summary Report",
        href: "/reports/consultations/eod",
      },
      {
        label: "Generate Period-wise Report",
        href: "/reports/consultations/period",
      },
      {
        label: "Generate Pending Amount Report",
        href: "/reports/consultations/pending",
      },
      {
        label: "Referred By Report",
        href: "/reports/consultations/referred-by",
      },
      { label: "Bill Report", href: "/reports/bills", dividerAbove: true },
    ],
    []
  );

  // Close on outside click
  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (!open) return;
      const el = menuRef.current;
      if (el && !el.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  function openReport(href: string) {
    setOpen(false);
    window.open(href, "_blank", "noopener,noreferrer");
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
        {registerDisabled ? (
          <button
            type="button"
            disabled
            className="rounded-lg bg-blue-600/60 px-4 py-2 text-sm font-medium text-white cursor-not-allowed"
            title="Coming soon"
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

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={open}
            className="rounded-lg border bg-blue-300 px-4 py-2 text-sm font-medium hover:bg-gray-50"
          >
            {reportsLabel}
          </button>

          {open && (
            <div
              role="menu"
              className="absolute right-0 mt-2 w-72 rounded-xl border bg-white shadow-lg z-50 overflow-hidden"
            >
              {REPORTS.map((r) => (
                <React.Fragment key={r.href}>
                  {r.dividerAbove && <div className="my-1 h-px bg-gray-200" />}
                  <button
                    type="button"
                    role="menuitem"
                    className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50"
                    onClick={() => openReport(r.href)}
                  >
                    {r.label}
                  </button>
                </React.Fragment>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
