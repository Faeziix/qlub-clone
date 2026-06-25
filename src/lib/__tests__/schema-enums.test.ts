/**
 * Tests for schema enum and type contracts introduced in issue #8.
 *
 * These tests validate that:
 * - Enum value sets are exactly as specified in the PRD/ADR.
 * - Iran defaults are correctly defined.
 * - orderNumber uniqueness contract logic is sound.
 * - AuditLog entry shape is structurally valid.
 *
 * These tests are pure-TypeScript unit tests that do NOT require a DB
 * connection — they guard the type-level and value-level contracts so that
 * schema drift fails in CI before any runtime.
 */

import { describe, expect, it } from "vitest";
import {
  ORDER_STATUSES,
  ORDER_TYPES,
  ORDER_SOURCES,
  PAYMENT_STATUSES,
  PAYMENT_METHODS,
  STAFF_ROLES,
  TABLE_STATUSES,
  ENAMAD_STATUSES,
  IRAN_VENDOR_DEFAULTS,
  type AuditLogEntry,
  isValidOrderStatus,
  isValidPaymentStatus,
  isValidPaymentMethod,
  nextOrderNumber,
} from "@/lib/schema-types";

// ──────────────────────────── enum completeness ──────────────────────────────

describe("ORDER_STATUSES enum", () => {
  it("contains all required status values", () => {
    expect(ORDER_STATUSES).toContain("open");
    expect(ORDER_STATUSES).toContain("placed");
    expect(ORDER_STATUSES).toContain("preparing");
    expect(ORDER_STATUSES).toContain("ready");
    expect(ORDER_STATUSES).toContain("served");
    expect(ORDER_STATUSES).toContain("paid");
    expect(ORDER_STATUSES).toContain("cancelled");
  });

  it("has exactly 7 values — no undocumented states", () => {
    expect(ORDER_STATUSES).toHaveLength(7);
  });
});

describe("ORDER_TYPES enum", () => {
  it("contains qsr and dinein", () => {
    expect(ORDER_TYPES).toContain("qsr");
    expect(ORDER_TYPES).toContain("dinein");
  });

  it("has exactly 2 values", () => {
    expect(ORDER_TYPES).toHaveLength(2);
  });
});

describe("ORDER_SOURCES enum", () => {
  it("contains qr and pos", () => {
    expect(ORDER_SOURCES).toContain("qr");
    expect(ORDER_SOURCES).toContain("pos");
  });
});

describe("PAYMENT_STATUSES enum", () => {
  it("contains all lifecycle states", () => {
    expect(PAYMENT_STATUSES).toContain("pending");
    expect(PAYMENT_STATUSES).toContain("succeeded");
    expect(PAYMENT_STATUSES).toContain("failed");
    expect(PAYMENT_STATUSES).toContain("refunded");
    expect(PAYMENT_STATUSES).toContain("expired");
  });

  it("has exactly 5 values — no undocumented states", () => {
    expect(PAYMENT_STATUSES).toHaveLength(5);
  });
});

describe("PAYMENT_METHODS enum", () => {
  it("contains ipg and cash — only Iran-legal methods", () => {
    expect(PAYMENT_METHODS).toContain("ipg");
    expect(PAYMENT_METHODS).toContain("cash");
  });

  it("does NOT contain card_to_card (not a settled split method per PRD §6)", () => {
    expect(PAYMENT_METHODS).not.toContain("card_to_card");
  });

  it("does NOT contain UAE-era methods (tabby, benefit, apple_pay, google_pay)", () => {
    expect(PAYMENT_METHODS).not.toContain("tabby");
    expect(PAYMENT_METHODS).not.toContain("benefit");
    expect(PAYMENT_METHODS).not.toContain("apple_pay");
    expect(PAYMENT_METHODS).not.toContain("google_pay");
  });
});

describe("STAFF_ROLES enum", () => {
  it("contains all 4 RBAC roles", () => {
    expect(STAFF_ROLES).toContain("superadmin");
    expect(STAFF_ROLES).toContain("owner");
    expect(STAFF_ROLES).toContain("manager");
    expect(STAFF_ROLES).toContain("staff");
  });

  it("has exactly 4 values", () => {
    expect(STAFF_ROLES).toHaveLength(4);
  });
});

describe("TABLE_STATUSES enum", () => {
  it("contains available, occupied, bill_requested", () => {
    expect(TABLE_STATUSES).toContain("available");
    expect(TABLE_STATUSES).toContain("occupied");
    expect(TABLE_STATUSES).toContain("bill_requested");
  });
});

describe("ENAMAD_STATUSES enum", () => {
  it("contains all onboarding states", () => {
    expect(ENAMAD_STATUSES).toContain("none");
    expect(ENAMAD_STATUSES).toContain("pending");
    expect(ENAMAD_STATUSES).toContain("verified");
    expect(ENAMAD_STATUSES).toContain("rejected");
  });
});

// ──────────────────────────── Iran defaults ──────────────────────────────────

describe("IRAN_VENDOR_DEFAULTS", () => {
  it("sets currency to IRR", () => {
    expect(IRAN_VENDOR_DEFAULTS.currency).toBe("IRR");
  });

  it("sets locale to fa (Farsi-first)", () => {
    expect(IRAN_VENDOR_DEFAULTS.locale).toBe("fa");
  });

  it("sets timezone to Asia/Tehran", () => {
    expect(IRAN_VENDOR_DEFAULTS.timezone).toBe("Asia/Tehran");
  });

  it("sets supportedLangs to ['fa','en'] — Farsi first, English second", () => {
    expect(IRAN_VENDOR_DEFAULTS.supportedLangs).toEqual(["fa", "en"]);
  });

  it("sets country to ir", () => {
    expect(IRAN_VENDOR_DEFAULTS.country).toBe("ir");
  });

  it("defaults VAT to disabled (vatEnabled: false)", () => {
    expect(IRAN_VENDOR_DEFAULTS.vatEnabled).toBe(false);
  });
});

// ──────────────────────────── type guards ────────────────────────────────────

describe("isValidOrderStatus", () => {
  it("accepts all valid statuses", () => {
    for (const s of ORDER_STATUSES) {
      expect(isValidOrderStatus(s)).toBe(true);
    }
  });

  it("rejects unknown strings", () => {
    expect(isValidOrderStatus("unknown")).toBe(false);
    expect(isValidOrderStatus("OPEN")).toBe(false);
    expect(isValidOrderStatus("")).toBe(false);
  });
});

describe("isValidPaymentStatus", () => {
  it("accepts all valid payment statuses", () => {
    for (const s of PAYMENT_STATUSES) {
      expect(isValidPaymentStatus(s)).toBe(true);
    }
  });

  it("rejects legacy status strings", () => {
    expect(isValidPaymentStatus("success")).toBe(false);
    expect(isValidPaymentStatus("SUCCEEDED")).toBe(false);
  });
});

describe("isValidPaymentMethod", () => {
  it("accepts ipg and cash", () => {
    expect(isValidPaymentMethod("ipg")).toBe(true);
    expect(isValidPaymentMethod("cash")).toBe(true);
  });

  it("rejects UAE-era and card_to_card methods", () => {
    expect(isValidPaymentMethod("card")).toBe(false);
    expect(isValidPaymentMethod("card_to_card")).toBe(false);
    expect(isValidPaymentMethod("tabby")).toBe(false);
  });
});

// ──────────────────────────── orderNumber sequence ───────────────────────────

describe("nextOrderNumber", () => {
  it("increments counter and returns formatted order number", () => {
    expect(nextOrderNumber("vendor-1", 0)).toEqual({ seq: 1, formatted: "V-000001" });
    expect(nextOrderNumber("vendor-1", 1)).toEqual({ seq: 2, formatted: "V-000002" });
    expect(nextOrderNumber("vendor-1", 999)).toEqual({ seq: 1000, formatted: "V-001000" });
  });

  it("is zero-padded to 6 digits", () => {
    const { formatted } = nextOrderNumber("vendor-x", 0);
    expect(formatted).toMatch(/^V-\d{6}$/);
  });

  it("handles large sequence numbers without overflow", () => {
    const { seq, formatted } = nextOrderNumber("vendor-x", 999999);
    expect(seq).toBe(1000000);
    expect(formatted).toBe("V-1000000");
  });

  it("each vendor starts its own sequence — vendorId is the partition key", () => {
    const a = nextOrderNumber("vendor-a", 5);
    const b = nextOrderNumber("vendor-b", 5);
    expect(a.seq).toBe(b.seq);
    expect(a.formatted).toBe(b.formatted);
  });
});

// ──────────────────────────── AuditLog entry ─────────────────────────────────

describe("AuditLogEntry type contract", () => {
  it("accepts a minimal valid audit entry with required fields", () => {
    const entry: AuditLogEntry = {
      actorId: "staff-123",
      vendorId: "vendor-456",
      action: "UPDATE",
      entity: "MenuItem",
      entityId: "item-789",
      at: new Date(),
    };
    expect(entry.actorId).toBeTruthy();
    expect(entry.entity).toBe("MenuItem");
    expect(entry.action).toBe("UPDATE");
  });

  it("accepts an entry with before/after snapshots", () => {
    const entry: AuditLogEntry = {
      actorId: "staff-123",
      vendorId: "vendor-456",
      action: "UPDATE",
      entity: "Vendor",
      entityId: "vendor-456",
      before: { name: "Old Name" },
      after: { name: "New Name" },
      at: new Date(),
    };
    expect(entry.before).toEqual({ name: "Old Name" });
    expect(entry.after).toEqual({ name: "New Name" });
  });

  it("accepts a login audit entry without vendorId (superadmin action)", () => {
    const entry: AuditLogEntry = {
      actorId: "staff-superadmin",
      vendorId: null,
      action: "LOGIN",
      entity: "StaffUser",
      entityId: "staff-superadmin",
      at: new Date(),
    };
    expect(entry.vendorId).toBeNull();
  });
});
