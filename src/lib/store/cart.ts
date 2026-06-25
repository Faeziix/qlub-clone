"use client";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { CartLine, SelectedModifier } from "@/lib/types";
import { lineTotal } from "@/lib/pricing";

const BIGINT_PREFIX = "__bigint__:";

function bigintReplacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") return `${BIGINT_PREFIX}${value}`;
  return value;
}

function bigintReviver(_key: string, value: unknown): unknown {
  if (typeof value === "string" && value.startsWith(BIGINT_PREFIX)) {
    return BigInt(value.slice(BIGINT_PREFIX.length));
  }
  return value;
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

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      vendorSlug: null,
      tableCode: null,
      lines: [],

      init: (vendorSlug, tableCode) => {
        const cur = get();
        // Reset cart if switching restaurants
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
      storage: createJSONStorage(() => localStorage, {
        replacer: bigintReplacer,
        reviver: bigintReviver,
      }),
      partialize: (s) => ({
        vendorSlug: s.vendorSlug,
        tableCode: s.tableCode,
        lines: s.lines,
      }),
    }
  )
);
