"use client";

import { useEffect, useState } from "react";

type Referral = { id: string; name: string };

export default function ReferredByFilter() {
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);

  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [referralId, setReferralId] = useState<string>("");

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch("/api/reports/referrals", {
          cache: "no-store",
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          const list: Referral[] = data.referrals || [];
          setReferrals(list);
          if (list.length > 0) setReferralId(list[0].id);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function generate() {
    if (!from || !to || !referralId) return;

    const url = `/reports/consultations/referred-by/view?from=${from}&to=${to}&referralId=${encodeURIComponent(
      referralId
    )}`;

    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="p-8 max-w-xl mx-auto">
      <h1 className="text-xl font-semibold mb-4">Referred By Report</h1>

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

      <div className="mt-4">
        <label className="block text-sm mb-1">Referred By</label>
        <select
          className="w-full rounded-lg border px-3 py-2 text-sm"
          value={referralId}
          onChange={(e) => setReferralId(e.target.value)}
          disabled={loading || referrals.length === 0}
        >
          {referrals.length === 0 ? (
            <option value="">No referral persons found</option>
          ) : (
            referrals.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))
          )}
        </select>
      </div>

      <button
        onClick={generate}
        disabled={!referralId}
        className="mt-6 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60"
      >
        Generate
      </button>
    </div>
  );
}
