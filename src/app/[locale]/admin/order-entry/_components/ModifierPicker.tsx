"use client";

import { useState } from "react";
import { X, Plus, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRialAsTomanPersian } from "@/lib/toman-formatter";
import type { MenuItemRow, SelectedOption } from "./types";

interface ModifierPickerProps {
  item: MenuItemRow;
  locale: string;
  onConfirm: (selectedOptions: SelectedOption[], quantity: number, notes: string) => void;
  onClose: () => void;
  t: {
    selectModifiers: string;
    addItem: string;
    qty: string;
    notes: string;
    required: string;
    optional: string;
    chooseUpTo: string;
    cancel: string;
  };
}

export function ModifierPicker({ item, locale, onConfirm, onClose, t }: ModifierPickerProps) {
  const [selectedOptions, setSelectedOptions] = useState<SelectedOption[]>(() => {
    const defaults: SelectedOption[] = [];
    for (const group of item.modifierGroups) {
      for (const opt of group.options) {
        if (opt.isDefault) {
          defaults.push({
            groupId: group.id,
            groupName: group.name,
            optionId: opt.id,
            optionName: opt.name,
            priceDelta: opt.priceDelta,
          });
        }
      }
    }
    return defaults;
  });

  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");

  function toggleOption(
    groupId: string,
    groupName: string,
    optionId: string,
    optionName: string,
    priceDelta: number,
    maxSelect: number
  ) {
    const isSelected = selectedOptions.some((o) => o.optionId === optionId);
    const groupSelections = selectedOptions.filter((o) => o.groupId === groupId);

    if (isSelected) {
      setSelectedOptions((prev) => prev.filter((o) => o.optionId !== optionId));
      return;
    }

    if (maxSelect === 1) {
      setSelectedOptions((prev) => [
        ...prev.filter((o) => o.groupId !== groupId),
        { groupId, groupName, optionId, optionName, priceDelta },
      ]);
      return;
    }

    if (groupSelections.length < maxSelect) {
      setSelectedOptions((prev) => [...prev, { groupId, groupName, optionId, optionName, priceDelta }]);
    }
  }

  function isRequiredSatisfied(): boolean {
    return item.modifierGroups.every((group) => {
      if (!group.required) return true;
      return selectedOptions.some((o) => o.groupId === group.id);
    });
  }

  const optionsDeltaTotal = selectedOptions.reduce((s, o) => s + o.priceDelta, 0);
  const unitTotal = item.price + optionsDeltaTotal;
  const grandTotal = unitTotal * quantity;

  const displayPrice = (rialAmount: number) =>
    locale === "fa"
      ? formatRialAsTomanPersian(BigInt(rialAmount))
      : `${Math.round(rialAmount / 10).toLocaleString()} T`;

  return (
    <div className="fixed inset-0 z-modal flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-t-3xl bg-surface p-6 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-extrabold">{item.name}</h2>
            <p className="text-sm font-semibold text-brand">{displayPrice(item.price)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full bg-surface-2 text-muted hover:text-ink"
            aria-label={t.cancel}
          >
            <X size={16} />
          </button>
        </div>

        <div className="max-h-60 overflow-y-auto space-y-5">
          {item.modifierGroups.map((group) => {
            const groupSelections = selectedOptions.filter((o) => o.groupId === group.id);
            return (
              <div key={group.id}>
                <div className="mb-2 flex items-center gap-2">
                  <span className="font-semibold text-sm">{group.name}</span>
                  <span className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-semibold",
                    group.required
                      ? "bg-danger/10 text-danger"
                      : "bg-surface-2 text-muted"
                  )}>
                    {group.required ? t.required : t.optional}
                  </span>
                  {group.maxSelect > 1 && (
                    <span className="text-xs text-muted">
                      {t.chooseUpTo.replace("{count}", String(group.maxSelect))}
                    </span>
                  )}
                </div>
                <div className="space-y-1">
                  {group.options.map((opt) => {
                    const isSelected = selectedOptions.some((o) => o.optionId === opt.id);
                    const canSelect = groupSelections.length < group.maxSelect || isSelected;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        disabled={!canSelect && !isSelected}
                        onClick={() =>
                          toggleOption(group.id, group.name, opt.id, opt.name, opt.priceDelta, group.maxSelect)
                        }
                        className={cn(
                          "flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm transition-colors",
                          isSelected
                            ? "bg-brand text-brand-fg"
                            : canSelect
                            ? "bg-surface-2 hover:bg-brand-soft"
                            : "cursor-not-allowed bg-surface-2 opacity-40"
                        )}
                      >
                        <span>{opt.name}</span>
                        {opt.priceDelta !== 0 && (
                          <span className="text-xs font-semibold">
                            {opt.priceDelta > 0 ? "+" : ""}{displayPrice(Math.abs(opt.priceDelta))}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4">
          <label className="mb-1 block text-xs font-medium text-muted">{t.notes}</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </div>

        <div className="mt-4 flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-xl border border-line p-1">
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="grid h-7 w-7 place-items-center rounded-lg hover:bg-surface-2"
            >
              <Minus size={14} />
            </button>
            <span className="min-w-[2ch] text-center text-sm font-bold tabular-nums">{quantity}</span>
            <button
              type="button"
              onClick={() => setQuantity((q) => q + 1)}
              className="grid h-7 w-7 place-items-center rounded-lg hover:bg-surface-2"
            >
              <Plus size={14} />
            </button>
          </div>

          <button
            type="button"
            disabled={!isRequiredSatisfied()}
            onClick={() => onConfirm(selectedOptions, quantity, notes)}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold transition-colors",
              isRequiredSatisfied()
                ? "bg-brand text-brand-fg hover:opacity-90"
                : "cursor-not-allowed bg-surface-2 text-muted"
            )}
          >
            <Plus size={16} />
            <span>{displayPrice(grandTotal)}</span>
            <span>{t.addItem}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
