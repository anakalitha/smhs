"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type ActionItem = {
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
};

export default function ActionMenu({
  items,
  ariaLabel = "Row actions",
}: {
  items: ActionItem[];
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const visibleItems = useMemo(() => items.filter(Boolean), [items]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node;
      if (!open) return;
      if (btnRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    }

    function onKeyDown(e: KeyboardEvent) {
      if (!open) return;
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative inline-flex">
      <button
        ref={btnRef}
        type="button"
        title="Actions"
        aria-label={ariaLabel}
        onClick={() => setOpen((v) => !v)}
        className="h-9 w-9 rounded-lg border bg-white hover:bg-gray-50 flex items-center justify-center"
      >
        <span className="text-lg leading-none">⋮</span>
      </button>

      {open && (
        <div
          ref={menuRef}
          className="absolute right-0 mt-2 w-56 rounded-xl border bg-white shadow-lg z-50 overflow-hidden"
        >
          {visibleItems.map((item) => (
            <button
              key={item.label}
              type="button"
              disabled={item.disabled}
              onClick={() => {
                if (item.disabled) return;
                setOpen(false);
                item.onClick();
              }}
              className={[
                "w-full text-left px-3 py-2 text-sm",
                "hover:bg-gray-50 disabled:opacity-50 disabled:hover:bg-white",
                item.danger ? "text-red-600" : "text-gray-800",
              ].join(" ")}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
