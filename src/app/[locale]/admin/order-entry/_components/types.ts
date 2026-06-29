import type { MenuItemRow, ModifierOptionRow, TableRow, OpenOrderRow, MenuCategoryRow, VendorRates } from "../actions";

export type { MenuItemRow, ModifierOptionRow, TableRow, OpenOrderRow, MenuCategoryRow, VendorRates };

export interface CartEntry {
  lineId: string;
  itemId: string;
  name: string;
  price: number;
  quantity: number;
  selectedOptions: SelectedOption[];
  notes: string;
}

export interface SelectedOption {
  groupId: string;
  groupName: string;
  optionId: string;
  optionName: string;
  priceDelta: number;
}

export type WaiterCartAction =
  | { type: "ADD"; entry: CartEntry }
  | { type: "REMOVE"; lineId: string }
  | { type: "SET_QTY"; lineId: string; qty: number }
  | { type: "CLEAR" };

export function cartLineTotal(entry: CartEntry): number {
  const optionsDelta = entry.selectedOptions.reduce((s, o) => s + o.priceDelta, 0);
  return (entry.price + optionsDelta) * entry.quantity;
}

export function cartSubtotal(entries: CartEntry[]): number {
  return entries.reduce((s, e) => s + cartLineTotal(e), 0);
}
