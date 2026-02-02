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
  // Draft mode: when typing, we use draftQuery; otherwise show value?.name
  const [draftQuery, setDraftQuery] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  const [items, setItems] = useState<Referral[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // Keyboard highlight index (includes add-row if visible)
  const [activeIndex, setActiveIndex] = useState<number>(-1);

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounce timer + in-flight request cancellation
  const debounceRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const inputValue = isEditing ? draftQuery : value?.name ?? "";

  const canAdd = useMemo(() => {
    const q = inputValue.trim();
    if (!q) return false;
    return !items.some((i) => i.name.toLowerCase() === q.toLowerCase());
  }, [inputValue, items]);

  // Total rows in dropdown for keyboard nav:
  // items + (addRow ? 1 : 0)
  const totalRows = items.length + (canAdd ? 1 : 0);

  // Close on outside click (no setState-in-effect lint issue — this syncs to DOM events)
  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  function clearDebounce() {
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
  }

  function abortInflight() {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }

  async function loadList(search: string) {
    abortInflight();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const res = await fetch(
        `/api/reception/referrals?search=${encodeURIComponent(search)}`,
        { signal: controller.signal }
      );
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setItems(data.referrals || []);
      } else {
        setItems([]);
      }
    } catch (e: unknown) {
      // Ignore abort errors
      if (!(e instanceof DOMException && e.name === "AbortError")) {
        setItems([]);
      }
    } finally {
      setLoading(false);
    }
  }

  function scheduleLoad(search: string) {
    clearDebounce();
    // debounce 250ms (tweakable)
    debounceRef.current = window.setTimeout(() => {
      loadList(search);
    }, 250);
  }

  async function addNew() {
    const name = inputValue.trim();
    if (!name) return;

    const res = await fetch("/api/reception/referrals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok && data.referral) {
      onChange(data.referral);
      setIsEditing(false);
      setDraftQuery("");
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  function selectReferral(r: Referral) {
    onChange(r);
    setIsEditing(false);
    setDraftQuery("");
    setOpen(false);
    setActiveIndex(-1);
  }

  function openAndSearch(seed?: string) {
    setOpen(true);
    setActiveIndex(-1);
    scheduleLoad(seed ?? "");
  }

  function handleFocus() {
    setOpen(true);
    setActiveIndex(-1);

    // Enter editing mode and seed draft from current value
    if (!isEditing) {
      setIsEditing(true);
      setDraftQuery(value?.name ?? "");
      scheduleLoad(value?.name ?? "");
    } else {
      scheduleLoad(draftQuery);
    }
  }

  function handleChange(next: string) {
    if (!isEditing) setIsEditing(true);
    setDraftQuery(next);
    setOpen(true);
    setActiveIndex(-1);
    onChange(null); // typing resets selection
    scheduleLoad(next);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      openAndSearch(inputValue);
      e.preventDefault();
      return;
    }

    if (!open) return;

    if (e.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
      e.preventDefault();
      return;
    }

    if (e.key === "ArrowDown") {
      setActiveIndex((i) => {
        const next = Math.min(i + 1, totalRows - 1);
        return totalRows === 0 ? -1 : next;
      });
      e.preventDefault();
      return;
    }

    if (e.key === "ArrowUp") {
      setActiveIndex((i) => {
        const next = Math.max(i - 1, 0);
        return totalRows === 0 ? -1 : next;
      });
      e.preventDefault();
      return;
    }

    if (e.key === "Enter") {
      // If highlight is on a referral row
      if (activeIndex >= 0 && activeIndex < items.length) {
        selectReferral(items[activeIndex]);
        e.preventDefault();
        return;
      }

      // If highlight is on add-row (or no highlight but canAdd)
      const addRowIndex = items.length; // add row lives after items
      if ((activeIndex === addRowIndex || activeIndex === -1) && canAdd) {
        addNew();
        e.preventDefault();
        return;
      }
    }
  }

  // Cleanup timers/requests on unmount
  useEffect(() => {
    return () => {
      clearDebounce();
      abortInflight();
    };
  }, []);

  return (
    <div ref={rootRef} className="relative">
      <input
        ref={inputRef}
        className="w-full rounded-lg border px-3 py-2 text-sm"
        placeholder="Type referral name"
        value={inputValue}
        onFocus={handleFocus}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
      />

      {open && (
        <div className="absolute z-50 mt-2 w-full rounded-xl border bg-white shadow-lg overflow-hidden">
          {loading ? (
            <div className="px-3 py-2 text-sm text-gray-600">Loading…</div>
          ) : (
            <>
              {items.map((r, idx) => {
                const active = idx === activeIndex;
                return (
                  <button
                    key={r.id}
                    type="button"
                    className={[
                      "block w-full text-left px-3 py-2 text-sm",
                      active ? "bg-gray-100" : "hover:bg-gray-50",
                    ].join(" ")}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => selectReferral(r)}
                  >
                    {r.name}
                  </button>
                );
              })}

              {items.length === 0 && !canAdd && (
                <div className="px-3 py-2 text-sm text-gray-600">
                  No matches
                </div>
              )}

              {canAdd && (
                <button
                  type="button"
                  className={[
                    "block w-full text-left px-3 py-2 text-sm text-blue-700",
                    activeIndex === items.length
                      ? "bg-blue-50"
                      : "hover:bg-blue-50",
                  ].join(" ")}
                  onMouseEnter={() => setActiveIndex(items.length)}
                  onClick={addNew}
                >
                  ➕ Add “{inputValue.trim()}”
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
