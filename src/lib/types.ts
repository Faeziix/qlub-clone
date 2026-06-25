/** Shared domain types used across customer app, admin, and API. */

export type DietaryTag =
  | "vegetarian"
  | "vegan"
  | "gluten-free"
  | "spicy"
  | "new"
  | "popular"
  | "chef-special"
  | "contains-nuts"
  | "halal";

export interface SelectedModifier {
  groupId: string;
  groupName: string;
  optionId: string;
  optionName: string;
  priceDelta: number;
}

export interface CartLine {
  /** stable id for the cart line (item + modifier signature) */
  lineId: string;
  itemId: string;
  name: string;
  imageUrl?: string | null;
  unitPrice: number; // base price
  quantity: number;
  modifiers: SelectedModifier[];
  notes?: string;
}

export type { BillBreakdownRial as BillBreakdown } from "./pricing";

export type OrderStatus =
  | "open"
  | "placed"
  | "preparing"
  | "ready"
  | "served"
  | "paid"
  | "cancelled";

export type PaymentMethod = "ipg" | "cash";

export type SplitType = "full" | "even" | "items" | "custom";

export type StaffRole = "superadmin" | "owner" | "manager" | "staff";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: StaffRole;
  vendorId: string | null;
}
