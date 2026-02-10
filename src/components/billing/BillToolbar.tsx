"use client";
import { useRouter } from "next/navigation";

export default function BillToolbar() {
  const router = useRouter();
  return (
    <div className="p-4 border-b flex gap-2 print:hidden">
      <button
        type="button"
        onClick={() => window.close()}
        className="rounded-lg border px-4 py-2 text-sm font-medium"
      >
        Close
      </button>
      <button
        type="button"
        onClick={() => window.print()}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white"
      >
        Print / Save PDF
      </button>
    </div>
  );
}
