// src/components/ui/MedicineComboBox.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Medicine = { id: number; name: string };

export default function MedicineComboBox({
  value,
  onChange,
  apiBase = "/api/medicines",
  placeholder = "Type medicine name",
}: {
  value: string;
  onChange: (v: string) => void;
  apiBase?: string;
  placeholder?: string;
}) {
  const [items, setItems] = useState<Medicine[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);

  const rootRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const inputValue = value;

  const canAdd = useMemo(() => {
    const q = inputValue.trim();
    if (!q) return false;
    return !items.some((i) => i.name.toLowerCase() === q.toLowerCase());
  }, [inputValue, items]);

  const totalRows = items.length + (canAdd ? 1 : 0);

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
        `${apiBase}?search=${encodeURIComponent(search)}`,
        { signal: controller.signal }
      );
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.ok === true) {
        setItems(data.items || []);
      } else {
        setItems([]);
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) {
        setItems([]);
      }
    } finally {
      setLoading(false);
    }
  }

  function scheduleLoad(search: string) {
    clearDebounce();
    debounceRef.current = window.setTimeout(() => {
      loadList(search);
    }, 250);
  }

  async function addNew() {
    const name = inputValue.trim();
    if (!name) return;

    const res = await fetch(apiBase, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.ok === true && data?.medicine?.name) {
      onChange(String(data.medicine.name));
      setOpen(false);
      setActiveIndex(-1);
      scheduleLoad(String(data.medicine.name));
    }
  }

  function selectMedicine(m: Medicine) {
    onChange(m.name);
    setOpen(false);
    setActiveIndex(-1);
  }

  function handleFocus() {
    setOpen(true);
    setActiveIndex(-1);
    scheduleLoad(inputValue);
  }

  function handleChange(next: string) {
    onChange(next);
    setOpen(true);
    setActiveIndex(-1);
    scheduleLoad(next);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) return;

    if (e.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
      return;
    }

    if (e.key === "ArrowDown") {
      setActiveIndex((i) => Math.min(i + 1, totalRows - 1));
      e.preventDefault();
      return;
    }

    if (e.key === "ArrowUp") {
      setActiveIndex((i) => Math.max(i - 1, 0));
      e.preventDefault();
      return;
    }

    if (e.key === "Enter") {
      if (activeIndex >= 0 && activeIndex < items.length) {
        selectMedicine(items[activeIndex]);
        e.preventDefault();
        return;
      }

      if ((activeIndex === items.length || activeIndex === -1) && canAdd) {
        addNew();
        e.preventDefault();
      }
    }
  }

  useEffect(() => {
    return () => {
      clearDebounce();
      abortInflight();
    };
  }, []);

  return (
    <div ref={rootRef} className="relative">
      <input
        className="w-full rounded-lg border px-3 py-2 text-sm"
        placeholder={placeholder}
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
              {items.map((m, idx) => (
                <button
                  key={m.id}
                  type="button"
                  className={[
                    "block w-full text-left px-3 py-2 text-sm",
                    idx === activeIndex ? "bg-gray-100" : "hover:bg-gray-50",
                  ].join(" ")}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => selectMedicine(m)}
                >
                  {m.name}
                </button>
              ))}

              {items.length === 0 && !canAdd && (
                <div className="px-3 py-2 text-sm text-gray-600">No matches</div>
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
