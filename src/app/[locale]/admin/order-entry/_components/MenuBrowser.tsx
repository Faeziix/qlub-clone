"use client";

import { useState, useDeferredValue } from "react";
import { Search, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRialAsTomanPersian } from "@/lib/toman-formatter";
import type { MenuCategoryRow, MenuItemRow, SelectedOption } from "./types";
import { ModifierPicker } from "./ModifierPicker";

interface MenuBrowserProps {
  categories: MenuCategoryRow[];
  locale: string;
  onAddItem: (
    item: MenuItemRow,
    selectedOptions: SelectedOption[],
    quantity: number,
    notes: string
  ) => void;
  t: {
    searchMenu: string;
    addItem: string;
    selectModifiers: string;
    qty: string;
    notes: string;
    required: string;
    optional: string;
    chooseUpTo: string;
    cancel: string;
  };
}

export function MenuBrowser({ categories, locale, onAddItem, t }: MenuBrowserProps) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(
    categories[0]?.id ?? null
  );
  const [pickerItem, setPickerItem] = useState<MenuItemRow | null>(null);

  const filteredCategories = deferredQuery.trim()
    ? categories
        .map((cat) => ({
          ...cat,
          items: cat.items.filter(
            (item: MenuItemRow) =>
              item.name.toLowerCase().includes(deferredQuery.toLowerCase()) ||
              (item.description ?? "").toLowerCase().includes(deferredQuery.toLowerCase())
          ),
        }))
        .filter((cat) => cat.items.length > 0)
    : categories;

  const activeCategory = deferredQuery.trim()
    ? filteredCategories[0] ?? null
    : filteredCategories.find((c) => c.id === activeCategoryId) ?? filteredCategories[0] ?? null;

  const displayPrice = (rialAmount: number) =>
    locale === "fa"
      ? formatRialAsTomanPersian(BigInt(rialAmount))
      : `${Math.round(rialAmount / 10).toLocaleString()} T`;

  function handleItemClick(item: MenuItemRow) {
    if (item.modifierGroups.length > 0) {
      setPickerItem(item);
    } else {
      onAddItem(item, [], 1, "");
    }
  }

  function handlePickerConfirm(selectedOptions: SelectedOption[], quantity: number, notes: string) {
    if (!pickerItem) return;
    onAddItem(pickerItem, selectedOptions, quantity, notes);
    setPickerItem(null);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="relative mb-3">
        <Search size={16} className="absolute start-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.searchMenu}
          className="w-full rounded-xl border border-line bg-surface-2 py-2 pe-3 ps-9 text-sm outline-none focus:border-brand"
        />
      </div>

      {!deferredQuery.trim() && filteredCategories.length > 1 && (
        <div className="no-scrollbar mb-3 flex gap-2 overflow-x-auto pb-1">
          {filteredCategories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCategoryId(cat.id)}
              className={cn(
                "shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                activeCategoryId === cat.id
                  ? "bg-brand text-brand-fg"
                  : "bg-surface-2 text-muted hover:bg-brand-soft hover:text-brand"
              )}
            >
              {cat.name}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto space-y-2">
        {(deferredQuery.trim() ? filteredCategories : activeCategory ? [activeCategory] : []).map((cat) => (
          <div key={cat.id}>
            {deferredQuery.trim() && (
              <p className="mb-1 text-xs font-semibold text-muted uppercase tracking-wide">{cat.name}</p>
            )}
            {cat.items.map((item: MenuItemRow) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleItemClick(item)}
                className="group mb-2 flex w-full items-center gap-3 rounded-xl border border-line bg-surface p-3 text-start transition-colors hover:border-brand/40 hover:bg-brand-soft"
              >
                {item.imageUrl ? (
                  <img
                    src={item.imageUrl}
                    alt={item.name}
                    className="h-12 w-12 shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-surface-2 text-xl text-muted">
                    <span aria-hidden>{"🍽"}</span>
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{item.name}</p>
                  {item.description && (
                    <p className="truncate text-xs text-muted">{item.description}</p>
                  )}
                  <p className="mt-0.5 text-sm font-bold text-brand tabular-nums">
                    {displayPrice(item.price)}
                  </p>
                </div>
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand text-brand-fg opacity-0 transition-opacity group-hover:opacity-100">
                  <Plus size={16} />
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>

      {pickerItem && (
        <ModifierPicker
          item={pickerItem}
          locale={locale}
          onConfirm={handlePickerConfirm}
          onClose={() => setPickerItem(null)}
          t={{
            selectModifiers: t.selectModifiers,
            addItem: t.addItem,
            qty: t.qty,
            notes: t.notes,
            required: t.required,
            optional: t.optional,
            chooseUpTo: t.chooseUpTo,
            cancel: t.cancel,
          }}
        />
      )}
    </div>
  );
}
