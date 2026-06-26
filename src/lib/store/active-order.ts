"use client";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface ActiveOrderEntry {
  orderId: string;
  tableCode: string | null;
}

interface ActiveOrderState {
  activeOrders: Record<string, ActiveOrderEntry>;
  setActiveOrder: (
    vendorSlug: string,
    orderId: string,
    tableCode: string | null
  ) => void;
  clearActiveOrder: (vendorSlug: string) => void;
  getActiveOrder: (vendorSlug: string) => ActiveOrderEntry | null;
}

export const useActiveOrder = create<ActiveOrderState>()(
  persist(
    (set, get) => ({
      activeOrders: {},

      setActiveOrder: (vendorSlug, orderId, tableCode) =>
        set((s) => ({
          activeOrders: {
            ...s.activeOrders,
            [vendorSlug]: { orderId, tableCode },
          },
        })),

      clearActiveOrder: (vendorSlug) =>
        set((s) => {
          const next = { ...s.activeOrders };
          delete next[vendorSlug];
          return { activeOrders: next };
        }),

      getActiveOrder: (vendorSlug) => get().activeOrders[vendorSlug] ?? null,
    }),
    {
      name: "qlub-active-orders",
      storage: createJSONStorage(() => localStorage),
    }
  )
);
