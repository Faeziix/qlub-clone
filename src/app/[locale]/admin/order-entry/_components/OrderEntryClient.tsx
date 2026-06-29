"use client";

import { useState, useReducer, useCallback, useTransition } from "react";
import { nanoid } from "nanoid";
import { CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TableRow, OpenOrderRow, MenuItemRow, MenuCategoryRow, SelectedOption, CartEntry, VendorRates } from "./types";
import { cartSubtotal } from "./types";
import { TablePicker } from "./TablePicker";
import { MenuBrowser } from "./MenuBrowser";
import { WaiterCart } from "./WaiterCart";
import { BillSummary } from "./BillSummary";
import { createOrAppendWaiterOrder, getOpenOrderForTable } from "../actions";
import type { CartLine } from "@/lib/types";
import { computeBill, recomputeOrderTotals } from "@/lib/pricing";

interface OrderEntryClientProps {
  tables: TableRow[];
  menuCategories: MenuCategoryRow[];
  locale: string;
  vendorRates: VendorRates;
  t: {
    selectTable: string;
    noTables: string;
    openOrder: string;
    noOpenOrder: string;
    searchMenu: string;
    runningBill: string;
    subtotal: string;
    serviceCharge: string;
    tax: string;
    total: string;
    emptyCart: string;
    emptyCartHint: string;
    addItem: string;
    qty: string;
    notes: string;
    orderCreated: string;
    itemsAppended: string;
    errorGeneral: string;
    table: string;
    cancel: string;
    items: string;
    modifiers: string;
    required: string;
    optional: string;
    chooseUpTo: string;
    submitOrder: string;
    appendOrder: string;
    selectModifiers: string;
    tableStatus_available: string;
    tableStatus_occupied: string;
    tableStatus_bill_requested: string;
    orderNumber: string;
    changeTable: string;
    walkIn: string;
    removeItem: string;
    decreaseQty: string;
  };
}

type CartAction =
  | { type: "ADD"; entry: CartEntry }
  | { type: "SET_QTY"; lineId: string; qty: number }
  | { type: "CLEAR" };

function cartReducer(state: CartEntry[], action: CartAction): CartEntry[] {
  switch (action.type) {
    case "ADD":
      return [...state, action.entry];
    case "SET_QTY":
      if (action.qty <= 0) return state.filter((e) => e.lineId !== action.lineId);
      return state.map((e) =>
        e.lineId === action.lineId ? { ...e, quantity: action.qty } : e
      );
    case "CLEAR":
      return [];
  }
}

export function OrderEntryClient({ tables, menuCategories, locale, vendorRates, t }: OrderEntryClientProps) {
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [openOrders, setOpenOrders] = useState<Record<string, OpenOrderRow | null>>({});
  const [cart, dispatch] = useReducer(cartReducer, []);
  const [step, setStep] = useState<"table" | "items">("table");
  const [isPending, startTransition] = useTransition();
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const showToast = useCallback((type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  }, []);

  async function handleSelectTable(tableId: string) {
    setSelectedTableId(tableId);
    if (!openOrders[tableId]) {
      const order = await getOpenOrderForTable(tableId);
      setOpenOrders((prev) => ({ ...prev, [tableId]: order }));
    }
    setStep("items");
  }

  function handleAddItem(
    item: MenuItemRow,
    selectedOptions: SelectedOption[],
    quantity: number,
    notes: string
  ) {
    const entry: CartEntry = {
      lineId: nanoid(8),
      itemId: item.id,
      name: item.name,
      price: item.price,
      quantity,
      selectedOptions,
      notes,
    };
    dispatch({ type: "ADD", entry });
  }

  function handleChangeQty(lineId: string, qty: number) {
    dispatch({ type: "SET_QTY", lineId, qty });
  }

  function toCartLines(entries: CartEntry[]): CartLine[] {
    return entries.map((entry) => ({
      lineId: entry.lineId,
      itemId: entry.itemId,
      name: entry.name,
      unitPrice: BigInt(entry.price),
      quantity: entry.quantity,
      modifiers: entry.selectedOptions.map((o) => ({
        groupId: o.groupId,
        groupName: o.groupName,
        optionId: o.optionId,
        optionName: o.optionName,
        priceDelta: BigInt(o.priceDelta),
      })),
      notes: entry.notes || undefined,
    }));
  }

  function handleSubmit() {
    if (cart.length === 0) return;
    startTransition(async () => {
      try {
        const result = await createOrAppendWaiterOrder({
          tableId: selectedTableId,
          lines: toCartLines(cart),
        });
        dispatch({ type: "CLEAR" });
        if (selectedTableId) {
          const refreshed = await getOpenOrderForTable(selectedTableId);
          setOpenOrders((prev) => ({ ...prev, [selectedTableId]: refreshed }));
        }
        showToast("success", result.appended ? t.itemsAppended : t.orderCreated);
      } catch {
        showToast("error", t.errorGeneral);
      }
    });
  }

  const openOrder = selectedTableId ? openOrders[selectedTableId] ?? null : null;

  const cartLines = toCartLines(cart);
  const newItemsSubtotalRial = BigInt(Math.round(cartSubtotal(cart)));

  const billBreakdown = openOrder
    ? recomputeOrderTotals(
        BigInt(Math.round(openOrder.subtotal)),
        newItemsSubtotalRial,
        vendorRates,
        BigInt(Math.round(openOrder.tipAmount)),
        BigInt(Math.round(openOrder.discount))
      )
    : computeBill(cartLines, vendorRates);

  const { subtotal: subtotalRial, serviceCharge, tax, total } = billBreakdown;

  const submitLabel = openOrder
    ? t.appendOrder.replace("{orderNumber}", openOrder.orderNumber)
    : t.submitOrder;

  const selectedTable = tables.find((t) => t.id === selectedTableId);

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      {toast && (
        <div
          className={cn(
            "fixed end-4 top-4 z-modal flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold shadow-float",
            toast.type === "success"
              ? "bg-success/10 text-success"
              : "bg-danger/10 text-danger"
          )}
        >
          {toast.type === "success" && <CheckCircle2 size={16} />}
          {toast.message}
        </div>
      )}

      <div className="flex-1 space-y-4">
        {step === "table" ? (
          <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
            <h2 className="mb-4 text-sm font-extrabold uppercase tracking-wide text-muted">
              {t.selectTable}
            </h2>
            <TablePicker
              tables={tables}
              selectedTableId={selectedTableId}
              openOrders={openOrders}
              onSelectTable={handleSelectTable}
              t={{
                selectTable: t.selectTable,
                noTables: t.noTables,
                tableStatus_available: t.tableStatus_available,
                tableStatus_occupied: t.tableStatus_occupied,
                tableStatus_bill_requested: t.tableStatus_bill_requested,
                openOrder: t.openOrder,
                noOpenOrder: t.noOpenOrder,
                walkIn: t.walkIn,
              }}
            />
          </div>
        ) : (
          <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-extrabold uppercase tracking-wide text-muted">
                {selectedTable ? `${t.table}: ${selectedTable.label}` : t.walkIn}
              </h2>
              <button
                type="button"
                onClick={() => setStep("table")}
                className="text-xs font-semibold text-brand hover:underline"
              >
                {t.changeTable}
              </button>
            </div>
            <div className="h-[460px]">
              <MenuBrowser
                categories={menuCategories}
                locale={locale}
                onAddItem={handleAddItem}
                t={{
                  searchMenu: t.searchMenu,
                  addItem: t.addItem,
                  selectModifiers: t.selectModifiers,
                  qty: t.qty,
                  notes: t.notes,
                  required: t.required,
                  optional: t.optional,
                  chooseUpTo: t.chooseUpTo,
                  cancel: t.cancel,
                }}
              />
            </div>
          </div>
        )}
      </div>

      <div className="w-full space-y-4 lg:w-80 lg:shrink-0">
        <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
          <h2 className="mb-3 text-sm font-extrabold uppercase tracking-wide text-muted">
            {t.items}
          </h2>
          <WaiterCart
            entries={cart}
            locale={locale}
            onChangeQty={handleChangeQty}
            t={{
              emptyCart: t.emptyCart,
              emptyCartHint: t.emptyCartHint,
              items: t.items,
              modifiers: t.modifiers,
              removeItem: t.removeItem,
              decreaseQty: t.decreaseQty,
            }}
          />
        </div>

        {cart.length > 0 && (
          <BillSummary
            subtotalRial={subtotalRial}
            serviceChargeRial={serviceCharge}
            taxRial={tax}
            totalRial={total}
            locale={locale}
            t={{
              runningBill: t.runningBill,
              subtotal: t.subtotal,
              serviceCharge: t.serviceCharge,
              tax: t.tax,
              total: t.total,
            }}
          />
        )}

        {cart.length > 0 && step === "items" && (
          <button
            type="button"
            disabled={isPending}
            onClick={handleSubmit}
            className={cn(
              "flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-extrabold transition-colors",
              isPending
                ? "cursor-not-allowed bg-surface-2 text-muted"
                : "bg-brand text-brand-fg hover:opacity-90"
            )}
          >
            {isPending ? <Loader2 size={16} className="animate-spin" /> : null}
            {submitLabel}
          </button>
        )}
      </div>
    </div>
  );
}
