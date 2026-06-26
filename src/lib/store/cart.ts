"use client";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { CartLine, SelectedModifier } from "@/lib/types";
import { lineTotal } from "@/lib/pricing";
import { cartMoneyReplacer, cartMoneyReviver } from "@/lib/money";

function normalizeModifier(m: SelectedModifier): SelectedModifier {
  return { ...m, priceDelta: BigInt(m.priceDelta) };
}

function normalizeLine(l: CartLine): CartLine {
  return {
    ...l,
    unitPrice: BigInt(l.unitPrice),
    modifiers: l.modifiers.map(normalizeModifier),
  };
}

function signature(itemId: string, mods: SelectedModifier[], notes?: string) {
  const m = [...mods]
    .map((x) => x.optionId)
    .sort()
    .join(",");
  return `${itemId}::${m}::${notes ?? ""}`;
}

interface CartState {
  vendorSlug: string | null;
  tableCode: string | null;
  lines: CartLine[];
  init: (vendorSlug: string, tableCode: string | null) => void;
  addLine: (line: Omit<CartLine, "lineId">) => void;
  setQty: (lineId: string, qty: number) => void;
  removeLine: (lineId: string) => void;
  clear: () => void;
  count: () => number;
  subtotal: () => bigint;
}

const bigintStorage = createJSONStorage(() => localStorage, {
  replacer: cartMoneyReplacer,
  reviver: cartMoneyReviver,
});

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      vendorSlug: null,
      tableCode: null,
      lines: [],

      init: (vendorSlug, tableCode) => {
        const cur = get();
        if (cur.vendorSlug && cur.vendorSlug !== vendorSlug) {
          set({ vendorSlug, tableCode, lines: [] });
        } else {
          set({ vendorSlug, tableCode });
        }
      },

      addLine: (line) => {
        const lineId = signature(line.itemId, line.modifiers, line.notes);
        const existing = get().lines.find((l) => l.lineId === lineId);
        if (existing) {
          set({
            lines: get().lines.map((l) =>
              l.lineId === lineId
                ? { ...l, quantity: l.quantity + line.quantity }
                : l
            ),
          });
        } else {
          set({ lines: [...get().lines, { ...line, lineId }] });
        }
      },

      setQty: (lineId, qty) => {
        if (qty <= 0) {
          set({ lines: get().lines.filter((l) => l.lineId !== lineId) });
          return;
        }
        set({
          lines: get().lines.map((l) =>
            l.lineId === lineId ? { ...l, quantity: qty } : l
          ),
        });
      },

      removeLine: (lineId) =>
        set({ lines: get().lines.filter((l) => l.lineId !== lineId) }),

      clear: () => set({ lines: [] }),

      count: () => get().lines.reduce((s, l) => s + l.quantity, 0),
      subtotal: () => get().lines.reduce((s, l) => s + lineTotal(l), 0n),
    }),
    {
      name: "qlub-cart",
      storage: bigintStorage,
      partialize: (s) => ({
        vendorSlug: s.vendorSlug,
        tableCode: s.tableCode,
        lines: s.lines,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.lines = state.lines.map(normalizeLine);
        }
      },
    }
  )
);
