"use client";

import React from "react";

export default function SearchBar({
  value,
  onChange,
  onSearch,
  onClear,
  placeholder = "Search…",
  loading = false,
}: {
  value: string;
  onChange: (v: string) => void;
  onSearch: () => void;
  onClear: () => void;
  placeholder?: string;
  loading?: boolean;
}) {
  return (
    <div className="flex gap-2 w-full md:w-[420px]">
      <input
        className="w-full rounded-lg border px-3 py-2 text-sm bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSearch();
          if (e.key === "Escape") onClear();
        }}
      />

      <button
        type="button"
        onClick={onSearch}
        disabled={loading}
        className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
      >
        {loading ? "…" : "Search"}
      </button>

      <button
        type="button"
        onClick={onClear}
        disabled={loading || value.trim() === ""}
        className="shrink-0 rounded-lg border bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-60"
      >
        Clear
      </button>
    </div>
  );
}
