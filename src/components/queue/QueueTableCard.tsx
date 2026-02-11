// src/components/queue/QueueTableCard.tsx
"use client";

import React from "react";
import DataTable, { Column } from "@/components/ui/DataTable";

export type QueueStatus = "WAITING" | "NEXT" | "IN_ROOM" | "COMPLETED";

export type BaseQueueRow = {
  queueEntryId: number;
  visitId: number;
  patientId: string;
  name: string;
  phone: string;
  referredBy: string;
  doctor: string;
  status: QueueStatus;
  token?: number;
  createdAt?: string;
};

type ActionGroup = {
  separator?: boolean;
  items: { label: string; onClick: () => void; disabled?: boolean }[];
};

export default function QueueTableCard<Row extends BaseQueueRow>({
  title = "Today’s Queue",
  subtitle = "Patients registered today (first come basis)",
  rows,
  columns,
  loading,
  emptyText,
  onRefresh,
  getRowKey = (row) => row.queueEntryId, // ✅ no any
  groupedActions,
  footerHint,
  dense = true,
}: {
  title?: string;
  subtitle?: string;
  rows: Row[];
  columns: Column<Row>[];
  loading?: boolean;
  emptyText?: string;
  onRefresh?: () => void;

  getRowKey?: (row: Row) => string | number;
  groupedActions?: (row: Row) => ActionGroup[];

  footerHint?: string;
  dense?: boolean;
}) {
  return (
    <div className="w-full rounded-2xl border bg-white shadow-sm">
      <div className="p-4 flex items-center justify-between border-b">
        <div>
          <h2 className="text-lg font-semibold text-[#1f1f1f]">{title}</h2>
          <p className="text-sm text-[#646179]">{subtitle}</p>
        </div>

        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            className="rounded-lg border px-2.5 py-1.5 text-sm hover:bg-gray-50"
          >
            {loading ? "Refreshing…" : "🔄 Refresh"}
          </button>
        )}
      </div>

      <div className="p-4 overflow-x-auto">
        <DataTable
          dense={dense}
          columns={columns}
          rows={rows}
          emptyText={
            emptyText ?? (loading ? "Loading..." : "No patients in queue.")
          }
          getRowKey={getRowKey}
          groupedActions={groupedActions}
        />

        {footerHint && (
          <div className="mt-3 text-xs text-[#646179]">{footerHint}</div>
        )}
      </div>
    </div>
  );
}
