"use client";

import { useState } from "react";

export default function BillReportFilter() {
  const today = new Date().toISOString().slice(0, 10);

  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);

  function generate() {
    if (!from || !to) return;

    const url = `/reports/bills/view?from=${from}&to=${to}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="p-8 max-w-xl mx-auto">
      <h1 className="text-xl font-semibold mb-4">Bill Report</h1>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm mb-1">From Date</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm mb-1">To Date</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm"
          />
        </div>
      </div>

      <button
        onClick={generate}
        className="mt-6 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white"
      >
        Generate
      </button>
    </div>
  );
}
