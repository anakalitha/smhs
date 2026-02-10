// src\components\ui\DataTable.tsx
"use client";

import * as React from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type CellRenderer<T> = (row: T) => React.ReactNode;

export type Column<T> = {
  header: React.ReactNode; // ✅ allow clickable header UI
  cell: CellRenderer<T>;
  className?: string;
};

export type RowAction<T> = {
  label: string;
  onClick: (row: T) => void;
  danger?: boolean;
  disabled?: boolean;
};

export type RowActionGroup<T> = {
  items: RowAction<T>[];
  separator?: boolean; // adds a separator before this group
};

type Props<T> = {
  columns: Column<T>[];
  rows: T[];
  getRowKey: (row: T) => string | number;

  // Actions are optional; if provided, an "Action" column appears.
  // Use groupedActions to show separators.
  actions?: (row: T) => RowAction<T>[];
  groupedActions?: (row: T) => RowActionGroup<T>[];

  // UX niceties
  emptyText?: string;
  dense?: boolean;
  rowClassName?: (row: T) => string;
};

function DotsIcon() {
  return (
    <span className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-gray-100">
      ⋮
    </span>
  );
}

export default function DataTable<T>({
  columns,
  rows,
  getRowKey,
  actions,
  groupedActions,
  emptyText = "No records found.",
  dense = false,
  rowClassName,
}: Props<T>) {
  const showActions = Boolean(actions || groupedActions);

  return (
    <div className="w-full overflow-hidden rounded-xl border bg-white">
      <div className="w-full overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-[#646179]">
            <tr className="border-b">
              {columns.map((c, i) => (
                <th
                  key={i}
                  className={[
                    "text-left font-medium",
                    dense ? "px-3 py-2" : "px-4 py-3",
                    c.className || "",
                  ].join(" ")}
                >
                  {c.header}
                </th>
              ))}

              {showActions && (
                <th
                  className={[
                    "text-right font-medium",
                    dense ? "px-3 py-2" : "px-4 py-3",
                  ].join(" ")}
                >
                  Action
                </th>
              )}
            </tr>
          </thead>

          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (showActions ? 1 : 0)}
                  className="px-4 py-10 text-center text-sm text-[#646179]"
                >
                  {emptyText}
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const key = getRowKey(row);
                return (
                  <tr
                    key={key}
                    className={[
                      "border-b last:border-b-0",
                      "hover:bg-gray-50/60",
                      rowClassName ? rowClassName(row) : "",
                    ].join(" ")}
                  >
                    {columns.map((c, i) => (
                      <td
                        key={i}
                        className={[
                          dense ? "px-3 py-2" : "px-4 py-3",
                          "align-middle text-[#1f1f1f]",
                          c.className || "",
                        ].join(" ")}
                      >
                        {c.cell(row)}
                      </td>
                    ))}

                    {showActions && (
                      <td
                        className={[
                          dense ? "px-3 py-2" : "px-4 py-3",
                          "align-middle text-right",
                        ].join(" ")}
                      >
                        <RowActionsMenu
                          row={row}
                          actions={actions}
                          groupedActions={groupedActions}
                        />
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RowActionsMenu<T>({
  row,
  actions,
  groupedActions,
}: {
  row: T;
  actions?: (row: T) => RowAction<T>[];
  groupedActions?: (row: T) => RowActionGroup<T>[];
}) {
  const groups: RowActionGroup<T>[] = React.useMemo(() => {
    if (groupedActions) return groupedActions(row);
    if (actions) return [{ items: actions(row) }];
    return [];
  }, [row, actions, groupedActions]);

  if (groups.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Row actions"
          className="inline-flex items-center justify-center rounded-md border bg-white text-[#1f1f1f] hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-100"
        >
          <DotsIcon />
        </button>
      </DropdownMenuTrigger>

      {/* Radix portals the menu and handles focus/keyboard */}
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="
    z-50 min-w-[220px]
    rounded-lg border border-gray-200 bg-white
    shadow-lg ring-1 ring-black/5
  "
      >
        {groups.map((g, gi) => (
          <React.Fragment key={gi}>
            {g.separator && gi !== 0 && <DropdownMenuSeparator />}
            {g.items.map((a, ai) => (
              <DropdownMenuItem
                key={ai}
                disabled={a.disabled}
                onClick={() => a.onClick(row)}
                className={a.danger ? "text-red-600 focus:text-red-600" : ""}
              >
                {a.label}
              </DropdownMenuItem>
            ))}
          </React.Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
