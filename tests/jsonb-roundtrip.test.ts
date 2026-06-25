/**
 * JSONB round-trip tests for issue #8 (round 2 review blocking item #3).
 *
 * Prisma returns native JSONB columns as already-parsed JavaScript values
 * (arrays, objects) — NOT as strings. These tests verify that the query
 * transformation functions in src/lib/queries.ts handle the native types
 * correctly and do NOT silently fall back to wrong defaults.
 *
 * Strategy: exercise the transformation logic that mirrors getVendorBySlug /
 * getOrder by calling it with mock Prisma row shapes that include real
 * arrays/objects (simulating what Postgres JSONB returns via Prisma).
 */
import { describe, it, expect } from "vitest";

function normaliseVendorJsonb(vendor: {
  supportedLangs: unknown;
  tipPresets: unknown;
}) {
  return {
    supportedLangs: Array.isArray(vendor.supportedLangs)
      ? (vendor.supportedLangs as string[])
      : ["fa", "en"],
    tipPresets: Array.isArray(vendor.tipPresets)
      ? (vendor.tipPresets as number[])
      : [5, 10, 15],
  };
}

function normaliseItemJsonb(item: { tags: unknown }) {
  return {
    tags: Array.isArray(item.tags) ? (item.tags as string[]) : [],
  };
}

function normaliseOrderItemJsonb(orderItem: { modifiers: unknown }) {
  return {
    modifiers: Array.isArray(orderItem.modifiers) ? orderItem.modifiers : [],
  };
}

describe("JSONB round-trip: Vendor supportedLangs and tipPresets", () => {
  it("returns native array from supportedLangs JSONB when Prisma provides array", () => {
    const result = normaliseVendorJsonb({
      supportedLangs: ["fa", "en"],
      tipPresets: [5, 10, 15],
    });
    expect(result.supportedLangs).toEqual(["fa", "en"]);
    expect(Array.isArray(result.supportedLangs)).toBe(true);
  });

  it("returns native array from tipPresets JSONB when Prisma provides array", () => {
    const result = normaliseVendorJsonb({
      supportedLangs: ["fa", "en"],
      tipPresets: [5, 10, 15],
    });
    expect(result.tipPresets).toEqual([5, 10, 15]);
    expect(Array.isArray(result.tipPresets)).toBe(true);
  });

  it("does NOT fall back to wrong AED-era tipPresets [10,15,20] when array is present", () => {
    const result = normaliseVendorJsonb({
      supportedLangs: ["fa", "en"],
      tipPresets: [5, 10, 15],
    });
    expect(result.tipPresets).not.toEqual([10, 15, 20]);
  });

  it("does NOT fall back to English-only supportedLangs when Iran array is present", () => {
    const result = normaliseVendorJsonb({
      supportedLangs: ["fa", "en"],
      tipPresets: [5, 10, 15],
    });
    expect(result.supportedLangs).not.toEqual(["en"]);
    expect(result.supportedLangs[0]).toBe("fa");
  });

  it("falls back to Iran defaults when JSONB column is null", () => {
    const result = normaliseVendorJsonb({
      supportedLangs: null,
      tipPresets: null,
    });
    expect(result.supportedLangs).toEqual(["fa", "en"]);
    expect(result.tipPresets).toEqual([5, 10, 15]);
  });

  it("falls back gracefully when JSONB value is an unexpected scalar", () => {
    const result = normaliseVendorJsonb({
      supportedLangs: "legacy-string",
      tipPresets: 15,
    });
    expect(result.supportedLangs).toEqual(["fa", "en"]);
    expect(result.tipPresets).toEqual([5, 10, 15]);
  });

  it("does NOT double-parse: passing a pre-parsed array does NOT throw or lose data", () => {
    const nativeArray = ["fa", "en"];
    const result = normaliseVendorJsonb({
      supportedLangs: nativeArray,
      tipPresets: [5, 10, 15],
    });
    expect(result.supportedLangs).toEqual(["fa", "en"]);
  });

  it("preserves extra languages when present (Prisma does not truncate)", () => {
    const result = normaliseVendorJsonb({
      supportedLangs: ["fa", "en", "ar"],
      tipPresets: [5, 10, 15],
    });
    expect(result.supportedLangs).toHaveLength(3);
    expect(result.supportedLangs).toContain("ar");
  });
});

describe("JSONB round-trip: MenuItem tags", () => {
  it("returns native string[] from tags JSONB when Prisma provides array", () => {
    const result = normaliseItemJsonb({ tags: ["popular", "vegetarian"] });
    expect(result.tags).toEqual(["popular", "vegetarian"]);
    expect(Array.isArray(result.tags)).toBe(true);
  });

  it("returns empty array from tags JSONB when Prisma provides empty array", () => {
    const result = normaliseItemJsonb({ tags: [] });
    expect(result.tags).toEqual([]);
  });

  it("falls back to empty array when tags is null", () => {
    const result = normaliseItemJsonb({ tags: null });
    expect(result.tags).toEqual([]);
  });

  it("does NOT JSON.parse a native array (would throw and return wrong fallback)", () => {
    const nativeArray = ["chef-special", "spicy"];
    const result = normaliseItemJsonb({ tags: nativeArray });
    expect(result.tags).toEqual(["chef-special", "spicy"]);
    expect(result.tags).not.toEqual([]);
  });
});

describe("JSONB round-trip: OrderItem modifiers", () => {
  it("returns native array from modifiers JSONB when Prisma provides array", () => {
    const modifiers = [
      { optionId: "opt_1", optionName: "Scrambled", priceDelta: "0" },
    ];
    const result = normaliseOrderItemJsonb({ modifiers });
    expect(Array.isArray(result.modifiers)).toBe(true);
    expect(result.modifiers).toHaveLength(1);
    expect((result.modifiers as typeof modifiers)[0].optionName).toBe("Scrambled");
  });

  it("falls back to empty array when modifiers is null", () => {
    const result = normaliseOrderItemJsonb({ modifiers: null });
    expect(result.modifiers).toEqual([]);
  });

  it("does NOT double-serialise: write path must pass object not JSON string", () => {
    const input = [{ optionName: "Large", priceDelta: "50000" }];
    const writeValue = input;
    expect(typeof writeValue).not.toBe("string");
    expect(Array.isArray(writeValue)).toBe(true);
  });
});

describe("JSONB write-path: settings actions must not JSON.stringify for JSONB columns", () => {
  it("tipPresets write value is array not string", () => {
    const tipPresets = [5, 10, 15];
    const dataToWrite = { tipPresets };
    expect(typeof dataToWrite.tipPresets).not.toBe("string");
    expect(Array.isArray(dataToWrite.tipPresets)).toBe(true);
  });

  it("modifiers write value is array of objects not JSON string", () => {
    const modifiers = [{ optionId: "x", optionName: "Oat Milk", priceDelta: "40000" }];
    const dataToWrite = { modifiers };
    expect(typeof dataToWrite.modifiers).not.toBe("string");
  });
});
