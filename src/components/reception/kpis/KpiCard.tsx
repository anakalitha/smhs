import React from "react";

type KpiCardProps = {
  title: string;
  value: string;
  accent: string;
  icon: React.ReactNode; // better than string so you can use emoji or an icon component
  subtitle?: string;
};

export function KpiCard({
  title,
  value,
  accent,
  icon,
  subtitle,
}: KpiCardProps) {
  return (
    <div className="rounded-2xl border bg-white shadow-sm p-4 hover:shadow-md transition">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm" style={{ color: accent }}>
            {title}
          </div>

          <div
            className="mt-1 text-2xl font-semibold"
            style={{ color: accent }}
          >
            {value}
          </div>

          <div className="mt-1 text-xs text-[#646179]">{subtitle || " "}</div>
        </div>

        <div className="h-11 w-11 rounded-2xl bg-gray-50 border flex items-center justify-center text-xl">
          {icon}
        </div>
      </div>
    </div>
  );
}
