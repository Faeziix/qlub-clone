/**
 * schema-types.ts — canonical enum value sets and type definitions mirroring
 * the Prisma schema enums. These are the single source of truth for valid
 * enum values; the Prisma schema uses native enums that map 1:1 to these.
 *
 * Rules:
 * - Every Prisma enum has a matching const array here.
 * - Type guards guard runtime boundaries (server action input, gateway callbacks).
 * - Iran defaults are the ONLY place Vendor defaults are defined — do not
 *   hardcode these in components or seed files.
 */

// ──────────────────────────── order enums ────────────────────────────────────

export const ORDER_STATUSES = [
  "open",
  "placed",
  "preparing",
  "ready",
  "served",
  "paid",
  "cancelled",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_TYPES = ["qsr", "dinein"] as const;
export type OrderType = (typeof ORDER_TYPES)[number];

export const ORDER_SOURCES = ["qr", "pos"] as const;
export type OrderSource = (typeof ORDER_SOURCES)[number];

// ──────────────────────────── payment enums ──────────────────────────────────

export const PAYMENT_STATUSES = [
  "pending",
  "succeeded",
  "failed",
  "refunded",
  "expired",
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/**
 * Supported payment methods for Iran production.
 * card_to_card is intentionally excluded — it is not a settled split method
 * (PRD §6, ADR-0007). UAE-era methods (tabby, benefit, apple_pay, google_pay)
 * are also excluded. If a manual card_to_card flow is ever added as a separate
 * ManualPayment model, it must not share this enum.
 */
export const PAYMENT_METHODS = ["ipg", "cash"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const SPLIT_TYPES = ["full", "even", "items", "custom"] as const;
export type SplitType = (typeof SPLIT_TYPES)[number];

// ──────────────────────────── staff / auth enums ─────────────────────────────

export const STAFF_ROLES = ["superadmin", "owner", "manager", "staff"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

// ──────────────────────────── table enum ─────────────────────────────────────

export const TABLE_STATUSES = ["available", "occupied", "bill_requested"] as const;
export type TableStatus = (typeof TABLE_STATUSES)[number];

// ──────────────────────────── sub-merchant enum ──────────────────────────────

export const ENAMAD_STATUSES = ["none", "pending", "verified", "rejected"] as const;
export type EnamadStatus = (typeof ENAMAD_STATUSES)[number];

// ──────────────────────────── Iran vendor defaults ───────────────────────────

/**
 * Default values applied to every new Vendor record.
 * Co-located with the schema types so the schema, seed, and tests all
 * reference the same constant — no scattered hardcoded strings.
 */
export const IRAN_VENDOR_DEFAULTS = {
  country: "ir",
  currency: "IRR",
  locale: "fa",
  timezone: "Asia/Tehran",
  supportedLangs: ["fa", "en"] as string[],
  vatEnabled: false,
  vatPct: 0,
  serviceChargePct: 0,
  taxPct: 0,
  taxInclusive: true,
  tippingEnabled: true,
  tipPresets: [5, 10, 15] as number[],
  payAtTable: true,
  qsrOrdering: true,
} as const;

// ──────────────────────────── type guards ────────────────────────────────────

export function isValidOrderStatus(value: unknown): value is OrderStatus {
  return ORDER_STATUSES.includes(value as OrderStatus);
}

export function isValidPaymentStatus(value: unknown): value is PaymentStatus {
  return PAYMENT_STATUSES.includes(value as PaymentStatus);
}

export function isValidPaymentMethod(value: unknown): value is PaymentMethod {
  return PAYMENT_METHODS.includes(value as PaymentMethod);
}

export function isValidStaffRole(value: unknown): value is StaffRole {
  return STAFF_ROLES.includes(value as StaffRole);
}

// ──────────────────────────── orderNumber helpers ────────────────────────────

/**
 * Computes the next order number in a per-vendor monotonic sequence.
 *
 * The caller is responsible for:
 * 1. Fetching the current `Vendor.vendorOrderSeq` with a SELECT ... FOR UPDATE.
 * 2. Persisting the returned `seq` back to `Vendor.vendorOrderSeq`.
 * 3. Writing `formatted` to `Order.orderNumber`.
 *
 * This function is pure (no DB access) so it is testable without a live DB.
 * The formatted string is zero-padded to 6 digits for up to 999,999 orders;
 * beyond that it grows naturally without truncation.
 */
export function nextOrderNumber(
  vendorId: string,
  currentSeq: number
): { seq: number; formatted: string } {
  void vendorId; // vendorId is the partition key — included for call-site clarity
  const seq = currentSeq + 1;
  const formatted = `V-${String(seq).padStart(6, "0")}`;
  return { seq, formatted };
}

// ──────────────────────────── AuditLog entry type ────────────────────────────

/**
 * Shape of a single audit log entry.
 * Mirrors the AuditLog Prisma model — typed separately so it can be used
 * in service-layer code without importing @prisma/client.
 */
export interface AuditLogEntry {
  actorId: string;
  vendorId: string | null;
  action: string;
  entity: string;
  entityId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  at: Date;
}
