"use client";

import { cn } from "@/lib/utils";
import type { TableRow, OpenOrderRow } from "./types";
import { Armchair } from "lucide-react";

interface TablePickerProps {
  tables: TableRow[];
  selectedTableId: string | null;
  openOrders: Record<string, OpenOrderRow | null>;
  onSelectTable: (tableId: string) => void;
  t: {
    selectTable: string;
    noTables: string;
    tableStatus_available: string;
    tableStatus_occupied: string;
    tableStatus_bill_requested: string;
    openOrder: string;
    noOpenOrder: string;
    walkIn: string;
  };
}

const TABLE_STATUS_STYLES: Record<string, string> = {
  available: "border-success/40 bg-success/5 text-success",
  occupied: "border-amber-300 bg-amber-50 text-amber-700",
  bill_requested: "border-purple-300 bg-purple-50 text-purple-700",
};

const TABLE_STATUS_DOT: Record<string, string> = {
  available: "bg-success",
  occupied: "bg-amber-400",
  bill_requested: "bg-purple-400",
};

export function TablePicker({
  tables,
  selectedTableId,
  openOrders,
  onSelectTable,
  t,
}: TablePickerProps) {
  if (tables.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted">{t.noTables}</p>
    );
  }

  const statusLabel = (status: string) => {
    if (status === "available") return t.tableStatus_available;
    if (status === "occupied") return t.tableStatus_occupied;
    return t.tableStatus_bill_requested;
  };

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {tables.map((table) => {
        const openOrder = openOrders[table.id];
        const isSelected = selectedTableId === table.id;
        const statusStyle = TABLE_STATUS_STYLES[table.status] ?? TABLE_STATUS_STYLES.available;
        const dotStyle = TABLE_STATUS_DOT[table.status] ?? TABLE_STATUS_DOT.available;

        return (
          <button
            key={table.id}
            type="button"
            onClick={() => onSelectTable(table.id)}
            className={cn(
              "rounded-2xl border-2 p-4 text-start transition-all",
              isSelected
                ? "border-brand bg-brand-soft ring-2 ring-brand/30"
                : cn("hover:border-brand/40 hover:bg-surface-2", statusStyle)
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <Armchair size={18} className="shrink-0" />
                <span className="text-base font-extrabold">{table.label}</span>
              </div>
              <span className="flex items-center gap-1 text-xs font-semibold">
                <span className={cn("inline-block h-2 w-2 rounded-full", dotStyle)} />
                {statusLabel(table.status)}
              </span>
            </div>
            {table.area && (
              <p className="mt-1 text-xs text-muted">{table.area}</p>
            )}
            <p className="mt-2 text-xs text-muted">
              {openOrder
                ? `${t.openOrder} — ${openOrder.orderNumber}`
                : t.noOpenOrder}
            </p>
          </button>
        );
      })}
    </div>
  );
}
