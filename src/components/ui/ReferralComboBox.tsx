"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Referral = { id: string; name: string };

export default function ReferralComboBox({
  value,
  onChange,
}: {
  value: Referral | null;
  onChange: (v: Referral | null) => void;
}) {
  const [query, setQuery] = useState(value?.name ?? "");
  const [items, setItems] = useState<Referral[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const canAdd = useMemo(() => {
    const q = query.trim();
    if (!q) return false;
    return !items.some((i) => i.name.toLowerCase() === q.toLowerCase());
  }, [query, items]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    async function load() {
      setLoading(true);
      const res = await fetch(
        `/api/reception/referrals?search=${encodeURIComponent(query)}`
      );
      const data = await res.json().catch(() => ({}));
      if (!cancelled && res.ok) setItems(data.referrals || []);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [query, open]);

  async function addNew() {
    const name = query.trim();
    if (!name) return;

    const res = await fetch("/api/reception/referrals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.referral) {
      onChange(data.referral);
      setQuery(data.referral.name);
      setOpen(false);
    }
  }

  return (
    <div ref={ref} className="relative">
      <input
        className="w-full rounded-lg border px-3 py-2 text-sm"
        placeholder="Type referral name"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          onChange(null);
        }}
        onFocus={() => setOpen(true)}
      />

      {open && (
        <div className="absolute z-50 mt-2 w-full rounded-xl border bg-white shadow-lg">
          {loading ? (
            <div className="px-3 py-2 text-sm text-gray-600">Loading…</div>
          ) : (
            <>
              {items.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                  onClick={() => {
                    onChange(r);
                    setQuery(r.name);
                    setOpen(false);
                  }}
                >
                  {r.name}
                </button>
              ))}

              {items.length === 0 && !canAdd && (
                <div className="px-3 py-2 text-sm text-gray-600">
                  No matches
                </div>
              )}

              {canAdd && (
                <button
                  type="button"
                  className="block w-full text-left px-3 py-2 text-sm text-blue-700 hover:bg-blue-50"
                  onClick={addNew}
                >
                  ➕ Add “{query.trim()}”
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
