"use client";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface ActiveOrderEntry {
  orderId: string;
  tableCode: string | null;
}

function activeOrderKey(vendorSlug: string, tableCode: string | null): string {
  return tableCode ? `${vendorSlug}::${tableCode}` : vendorSlug;
}

interface ActiveOrderState {
  activeOrders: Record<string, ActiveOrderEntry>;
  setActiveOrder: (
    vendorSlug: string,
    orderId: string,
    tableCode: string | null
  ) => void;
  clearActiveOrder: (vendorSlug: string, tableCode: string | null) => void;
  getActiveOrder: (
    vendorSlug: string,
    tableCode: string | null
  ) => ActiveOrderEntry | null;
}

export const useActiveOrder = create<ActiveOrderState>()(
  persist(
    (set, get) => ({
      activeOrders: {},

      setActiveOrder: (vendorSlug, orderId, tableCode) =>
        set((s) => ({
          activeOrders: {
            ...s.activeOrders,
            [activeOrderKey(vendorSlug, tableCode)]: { orderId, tableCode },
          },
        })),

      clearActiveOrder: (vendorSlug, tableCode) =>
        set((s) => {
          const next = { ...s.activeOrders };
          delete next[activeOrderKey(vendorSlug, tableCode)];
          return { activeOrders: next };
        }),

      getActiveOrder: (vendorSlug, tableCode) =>
        get().activeOrders[activeOrderKey(vendorSlug, tableCode)] ?? null,
    }),
    {
      name: "qlub-active-orders",
      storage: createJSONStorage(() => localStorage),
    }
  )
);
