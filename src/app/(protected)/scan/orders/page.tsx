"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import DataTable, { Column } from "@/components/ui/DataTable";

type Row = {
  orderId: number;
  visitId: number;
  visitDate: string;
  patientCode: string;
  patientName: string;
  doctorName: string;
  status: string;
  notes?: string | null;
};

const columns: Column<Row>[] = [
  {
    header: "Order ID",
    cell: (r) => <span className="font-medium">{r.orderId}</span>,
  },
  { header: "Visit Date", cell: (r) => <span>{r.visitDate}</span> },
  {
    header: "Patient ID",
    cell: (r) => <span className="font-medium">{r.patientCode}</span>,
  },
  { header: "Name", cell: (r) => <span>{r.patientName}</span> },
  {
    header: "Doctor",
    cell: (r) => <span className="text-slate-600">{r.doctorName}</span>,
  },
  {
    header: "Status",
    cell: (r) => <span className="text-slate-600">{r.status}</span>,
  },
];

export default function ScanOrdersPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/scan/orders?status=ORDERED", {
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setRows(data.rows || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="p-6">
      <div className="rounded-2xl border bg-white shadow-sm">
        <div className="p-4 border-b flex items-center justify-between">
          <div>
            <div className="text-lg font-semibold">Scan Orders</div>
            <div className="text-sm text-slate-600">
              Orders pending billing (SCAN)
            </div>
          </div>
          <button
            className="rounded-lg border px-3 py-2 text-sm hover:bg-gray-50"
            onClick={load}
          >
            {loading ? "Refreshing…" : "🔄 Refresh"}
          </button>
        </div>

        <div className="p-4">
          <DataTable
            dense
            columns={columns}
            rows={rows}
            getRowKey={(r) => r.orderId}
            emptyText={loading ? "Loading..." : "No scan orders."}
            groupedActions={(row) => [
              {
                items: [
                  {
                    label: "Bill / Update",
                    onClick: () => router.push(`/scan/orders/${row.orderId}`),
                  },
                  {
                    label: "Open Patient Summary",
                    onClick: () => router.push(`/patients/${row.patientCode}`),
                  },
                ],
              },
            ]}
          />
        </div>
      </div>
    </div>
  );
}
