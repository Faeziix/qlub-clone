"use client";
import * as React from "react";
import { Trash2 } from "lucide-react";
import { MoneyText } from "@/components/ui/MoneyText";
import { QuantityStepper } from "@/components/ui/QuantityStepper";
import { lineTotal } from "@/lib/pricing";
import type { CartLine } from "@/lib/types";

interface CartLineItemProps {
  line: CartLine;
  onQtyChange: (qty: number) => void;
  onRemove: () => void;
  removeLabel: string;
  decreaseLabel: string;
  increaseLabel: string;
}

export function CartLineItem({
  line,
  onQtyChange,
  onRemove,
  removeLabel,
  decreaseLabel,
  increaseLabel,
}: CartLineItemProps) {
  const total = lineTotal(line);

  return (
    <div className="rounded-2xl border border-line bg-surface px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <p className="flex-1 font-bold leading-snug text-ink">{line.name}</p>
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel}
          className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-danger/10 hover:text-danger"
        >
          <Trash2 size={14} aria-hidden />
        </button>
      </div>

      {line.modifiers.length > 0 && (
        <p className="mt-1 text-xs leading-relaxed text-muted">
          {line.modifiers.map((m) => m.optionName).join(" · ")}
        </p>
      )}

      {line.notes && (
        <p className="mt-0.5 text-xs italic text-muted">
          &ldquo;{line.notes}&rdquo;
        </p>
      )}

      <div className="mt-3 flex items-center justify-between">
        <QuantityStepper
          size="sm"
          value={line.quantity}
          onChange={onQtyChange}
          min={0}
          decreaseLabel={decreaseLabel}
          increaseLabel={increaseLabel}
        />
        <MoneyText rial={total} size="md" />
      </div>
    </div>
  );
}
