// src\components\header\LogoutButton.tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LogoutButton({
  variant = "icon",
}: {
  variant?: "icon" | "text";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function logout() {
    setLoading(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.replace("/login");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Logout Icon */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          variant === "text"
            ? "w-full text-left px-3 py-2 text-sm rounded-md hover:bg-red-50 text-red-600"
            : "h-10 w-10 rounded-full border bg-white hover:bg-gray-100 flex items-center justify-center"
        }
      >
        {variant === "text" ? "Logout" : "🔓"}
      </button>

      {/* Confirm Dialog */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-lg">
            <h3 className="text-lg font-semibold">Confirm Logout</h3>
            <p className="mt-2 text-sm text-gray-600">
              Are you sure you want to logout? Make sure you have saved your
              work.
            </p>

            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setOpen(false)}
                className="rounded-md border px-4 py-2 text-sm hover:bg-gray-50"
                disabled={loading}
              >
                No
              </button>

              <button
                onClick={logout}
                className="rounded-md bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-60"
                disabled={loading}
              >
                {loading ? "Logging out..." : "Yes, Logout"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
