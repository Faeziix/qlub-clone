"use client";

import * as React from "react";
import Image from "next/image";
import type { ItemWithModifiers } from "@/lib/queries";
import type { SelectedModifier } from "@/lib/types";
import { useCart } from "@/lib/store/cart";
import { makeT } from "@/lib/i18n";
import { cn, formatAmount } from "@/lib/utils";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { QuantityStepper } from "@/components/ui/QuantityStepper";
import { DietBadge } from "@/components/ui/Badge";
import { Check } from "lucide-react";

type Group = ItemWithModifiers["modifierGroups"][number];

export function ItemSheet({
  item,
  currency,
  lang,
  open,
  onClose,
}: {
  item: ItemWithModifiers;
  currency: string;
  lang: string;
  open: boolean;
  onClose: () => void;
}) {
  const t = makeT(lang);
  const addLine = useCart((s) => s.addLine);
  const [qty, setQty] = React.useState(1);
  const [notes, setNotes] = React.useState("");
  const tags = Array.isArray(item.tags) ? item.tags : [];

  // selected option ids per group
  const [selected, setSelected] = React.useState<Record<string, string[]>>(
    () => {
      const init: Record<string, string[]> = {};
      for (const g of item.modifierGroups) {
        const defaults = g.options.filter((o) => o.isDefault).map((o) => o.id);
        init[g.id] = defaults;
      }
      return init;
    }
  );

  function toggle(group: Group, optionId: string) {
    setSelected((prev) => {
      const cur = prev[group.id] ?? [];
      if (group.maxSelect <= 1) {
        return { ...prev, [group.id]: [optionId] };
      }
      if (cur.includes(optionId)) {
        return { ...prev, [group.id]: cur.filter((x) => x !== optionId) };
      }
      if (cur.length >= group.maxSelect) return prev; // cap reached
      return { ...prev, [group.id]: [...cur, optionId] };
    });
  }

  const chosenModifiers: SelectedModifier[] = item.modifierGroups.flatMap((g) =>
    (selected[g.id] ?? []).map((optId) => {
      const opt = g.options.find((o) => o.id === optId)!;
      return {
        groupId: g.id,
        groupName: g.name,
        optionId: opt.id,
        optionName: opt.name,
        priceDelta: BigInt(opt.priceDelta),
      };
    })
  );

  const unitPriceRial = BigInt(item.price);
  const unitWithMods =
    unitPriceRial + chosenModifiers.reduce((s, m) => s + m.priceDelta, 0n);
  const lineTotalValue = unitWithMods * BigInt(qty);

  const missingRequired = item.modifierGroups.some(
    (g) => g.required && (selected[g.id]?.length ?? 0) < Math.max(1, g.minSelect)
  );

  function add() {
    addLine({
      itemId: item.id,
      name: item.name,
      imageUrl: item.imageUrl,
      unitPrice: unitPriceRial,
      quantity: qty,
      modifiers: chosenModifiers,
      notes: notes.trim() || undefined,
    });
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} height="full">
      <div className="flex h-full flex-col">
        <div className="flex-1 overflow-y-auto">
          {item.imageUrl && (
            <div className="relative -mt-2 mb-4 h-56 w-full overflow-hidden bg-surface-2">
              <Image
                src={item.imageUrl}
                alt={item.name}
                fill
                className="object-cover"
                unoptimized
              />
            </div>
          )}
          <div className="px-5">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-2xl font-extrabold">{item.name}</h2>
              <span className="shrink-0 pt-1 font-bold text-brand">
                {currency} {formatAmount(item.price)}
              </span>
            </div>
            {tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <DietBadge key={tag} tag={tag} />
                ))}
              </div>
            )}
            {item.description && (
              <p className="mt-3 text-[15px] leading-relaxed text-muted">
                {item.description}
              </p>
            )}
            {item.calories != null && (
              <p className="mt-2 text-sm text-muted">{item.calories} kcal</p>
            )}

            {/* Modifier groups */}
            {item.modifierGroups.map((g) => {
              const cur = selected[g.id] ?? [];
              return (
                <div key={g.id} className="mt-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-bold">{g.name}</h3>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                        g.required
                          ? "bg-brand-soft text-brand"
                          : "bg-surface-2 text-muted"
                      )}
                    >
                      {g.required ? t("required") : t("optional")}
                      {g.maxSelect > 1 && ` · ${t("chooseUpTo")} ${g.maxSelect}`}
                    </span>
                  </div>
                  <div className="mt-3 space-y-2">
                    {g.options.map((o) => {
                      const checked = cur.includes(o.id);
                      const single = g.maxSelect <= 1;
                      return (
                        <button
                          key={o.id}
                          onClick={() => toggle(g, o.id)}
                          className={cn(
                            "flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors",
                            checked
                              ? "border-brand bg-brand-soft"
                              : "border-line bg-surface"
                          )}
                        >
                          <span className="flex items-center gap-3">
                            <span
                              className={cn(
                                "grid h-5 w-5 place-items-center border-2",
                                single ? "rounded-full" : "rounded-md",
                                checked
                                  ? "border-brand bg-brand text-brand-fg"
                                  : "border-line"
                              )}
                            >
                              {checked && <Check size={14} />}
                            </span>
                            <span className="font-medium">{o.name}</span>
                          </span>
                          {o.priceDelta > 0 && (
                            <span className="text-sm font-semibold text-muted">
                              +{formatAmount(o.priceDelta)}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Special instructions */}
            <div className="mt-6">
              <h3 className="text-base font-bold">{t("special")}</h3>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="e.g. no onions, allergy info…"
                className="mt-2 w-full resize-none rounded-xl border border-line bg-surface px-4 py-3 text-sm outline-none focus:border-brand"
              />
            </div>
          </div>
        </div>

        {/* Footer add bar */}
        <div className="shrink-0 border-t border-line bg-surface p-4 safe-bottom">
          <div className="flex items-center gap-3">
            <QuantityStepper value={qty} onChange={setQty} min={1} />
            <Button
              fullWidth
              size="lg"
              disabled={missingRequired}
              onClick={add}
            >
              {t("addToOrder")} · {currency} {formatAmount(lineTotalValue)}
            </Button>
          </div>
          {missingRequired && (
            <p className="mt-2 text-center text-xs text-danger">
              Please complete the required choices.
            </p>
          )}
        </div>
      </div>
    </Sheet>
  );
}
