import React from "react";
import { KpiCard } from "./KpiCard";

export type ReceptionKpisData = {
  registeredToday: number;
  waiting: number;
  done: number;
  accepted: number; // amount
  pending: number; // amount
  waived: number; // amount
};

type Props = {
  kpis: ReceptionKpisData;
  loading?: boolean;
  formatINR: (n: number) => string;
};

type KpiKey = keyof ReceptionKpisData;

type KpiDef =
  | {
      key: KpiKey;
      title: string;
      accent: string;
      icon: React.ReactNode;
      subtitle?: string;
      kind: "count";
    }
  | {
      key: KpiKey;
      title: string;
      accent: string;
      icon: React.ReactNode;
      subtitle?: string;
      kind: "amount";
    };

const KPI_DEFS: readonly KpiDef[] = [
  {
    key: "registeredToday",
    title: "Registered Today",
    accent: "#000000",
    icon: "🧾",
    kind: "count",
  },
  {
    key: "waiting",
    title: "Waiting",
    accent: "#000000",
    icon: "⏳",
    kind: "count",
  },
  { key: "done", title: "Done", accent: "#000000", icon: "✅", kind: "count" },

  {
    key: "accepted",
    title: "Collected (Today)",
    accent: "#000000",
    icon: "💳",
    subtitle: "Consultation fee",
    kind: "amount",
  },
  {
    key: "pending",
    title: "Pending (Today)",
    accent: "#000000",
    icon: "🕒",
    subtitle: "Consultation fee",
    kind: "amount",
  },
  {
    key: "waived",
    title: "Waived (Today)",
    accent: "#000000",
    icon: "🧾",
    subtitle: "Consultation fee",
    kind: "amount",
  },
] as const;

export function ReceptionKpis({ kpis, loading = false, formatINR }: Props) {
  return (
    <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
      {KPI_DEFS.map((def) => {
        const raw = kpis[def.key];

        const value = loading
          ? "…"
          : def.kind === "amount"
          ? formatINR(Number(raw))
          : String(raw);

        return (
          <KpiCard
            key={def.key}
            title={def.title}
            value={value}
            accent={def.accent}
            icon={def.icon}
            subtitle={def.subtitle}
          />
        );
      })}
    </div>
  );
}
