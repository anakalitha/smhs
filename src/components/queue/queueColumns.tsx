import React from "react";
import type { Column } from "@/components/ui/DataTable";
import type { BaseQueueRow } from "./QueueTableCard";

export const receptionQueueColumns: Column<BaseQueueRow>[] = [
  {
    header: "Patient Id",
    cell: (q) => (
      <span className="font-medium text-[#1f1f1f]">{q.patientId}</span>
    ),
  },
  {
    header: "Name",
    cell: (q) => <span className="text-[#1f1f1f]">{q.name}</span>,
  },
  {
    header: "Phone",
    cell: (q) => <span className="text-[#646179]">{q.phone || "—"}</span>,
  },
  {
    header: "Doctor",
    cell: (q) => <span className="text-[#646179]">{q.doctor}</span>,
  },
  {
    header: "Status",
    cell: (q) => {
      const label =
        q.status === "WAITING"
          ? "Waiting"
          : q.status === "NEXT"
          ? "Next"
          : q.status === "IN_ROOM"
          ? "In Room"
          : "Done";

      const pillClass =
        q.status === "WAITING"
          ? "bg-amber-50 text-amber-700 border-amber-200"
          : q.status === "NEXT"
          ? "bg-blue-50 text-blue-700 border-blue-200"
          : q.status === "IN_ROOM"
          ? "bg-green-50 text-green-700 border-green-200"
          : "bg-gray-50 text-gray-700 border-gray-200";

      return (
        <span
          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${pillClass}`}
        >
          {label}
        </span>
      );
    },
  },
];
