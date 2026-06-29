"use client";

import { Minus, Plus, Trash2 } from "lucide-react";
import { formatRialAsTomanPersian, formatRialAsTomanLatin } from "@/lib/toman-formatter";
import type { CartEntry } from "./types";
import { cartLineTotal } from "./types";
import { cn } from "@/lib/utils";

interface WaiterCartProps {
  entries: CartEntry[];
  locale: string;
  onChangeQty: (lineId: string, qty: number) => void;
  t: {
    emptyCart: string;
    emptyCartHint: string;
    items: string;
    modifiers: string;
    removeItem: string;
    decreaseQty: string;
  };
}

export function WaiterCart({ entries, locale, onChangeQty, t }: WaiterCartProps) {
  const displayPrice = (rialAmount: number) =>
    locale === "fa"
      ? formatRialAsTomanPersian(BigInt(rialAmount))
      : formatRialAsTomanLatin(BigInt(rialAmount));

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <p className="text-2xl">🛒</p>
        <p className="mt-2 text-sm font-semibold">{t.emptyCart}</p>
        <p className="text-xs text-muted">{t.emptyCartHint}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 overflow-y-auto">
      {entries.map((entry) => (
        <div
          key={entry.lineId}
          className="rounded-xl border border-line bg-surface-2 p-3"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{entry.name}</p>
              {entry.selectedOptions.length > 0 && (
                <p className="mt-0.5 truncate text-xs text-muted">
                  {entry.selectedOptions.map((o) => o.optionName).join(" · ")}
                </p>
              )}
              {entry.notes && (
                <p className="mt-0.5 text-xs italic text-muted">{entry.notes}</p>
              )}
            </div>
            <p className="shrink-0 text-sm font-bold tabular-nums text-brand">
              {displayPrice(cartLineTotal(entry))}
            </p>
          </div>

          <div className={cn("mt-2 flex items-center gap-2")}>
            <button
              type="button"
              onClick={() => onChangeQty(entry.lineId, entry.quantity - 1)}
              className="grid h-6 w-6 place-items-center rounded-full bg-surface hover:bg-danger/10 hover:text-danger"
              aria-label={entry.quantity === 1 ? t.removeItem : t.decreaseQty}
            >
              {entry.quantity === 1 ? <Trash2 size={12} /> : <Minus size={12} />}
            </button>
            <span className="min-w-[2ch] text-center text-sm font-bold tabular-nums">
              {entry.quantity}
            </span>
            <button
              type="button"
              onClick={() => onChangeQty(entry.lineId, entry.quantity + 1)}
              className="grid h-6 w-6 place-items-center rounded-full bg-surface hover:bg-brand-soft hover:text-brand"
            >
              <Plus size={12} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
