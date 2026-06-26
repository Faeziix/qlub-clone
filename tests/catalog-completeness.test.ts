/**
 * Tests for i18n catalog completeness (issue #13).
 *
 * Verifies:
 *   - messages/fa.json and messages/en.json have identical key sets
 *   - No key in fa.json has an empty value
 *   - All keys from src/lib/i18n.ts (makeT) are present in both JSON catalogs
 *     under the "customer.*" namespace
 *   - Both catalogs export "admin.*" keys with non-empty values
 */

import { describe, it, expect } from "vitest";
import enMessages from "../messages/en.json";
import faMessages from "../messages/fa.json";
import { getDict } from "@/lib/i18n";

type JsonObject = Record<string, unknown>;

function flattenKeys(obj: JsonObject, prefix = ""): Map<string, string> {
  const result = new Map<string, string>();
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      const nested = flattenKeys(value as JsonObject, fullKey);
      for (const [k, v] of nested) result.set(k, v);
    } else {
      result.set(fullKey, String(value ?? ""));
    }
  }
  return result;
}

const enFlat = flattenKeys(enMessages as unknown as JsonObject);
const faFlat = flattenKeys(faMessages as unknown as JsonObject);

describe("catalog key parity — fa vs en", () => {
  it("every key in en.json exists in fa.json", () => {
    const missing: string[] = [];
    for (const key of enFlat.keys()) {
      if (!faFlat.has(key)) missing.push(key);
    }
    expect(missing, `Keys missing in fa.json: ${missing.join(", ")}`).toHaveLength(0);
  });

  it("every key in fa.json exists in en.json", () => {
    const missing: string[] = [];
    for (const key of faFlat.keys()) {
      if (!enFlat.has(key)) missing.push(key);
    }
    expect(missing, `Keys missing in en.json: ${missing.join(", ")}`).toHaveLength(0);
  });

  it("no fa.json value is empty or whitespace-only", () => {
    const empty: string[] = [];
    for (const [key, value] of faFlat) {
      if (!value.trim()) empty.push(key);
    }
    expect(empty, `Empty fa.json values: ${empty.join(", ")}`).toHaveLength(0);
  });

  it("no en.json value is empty or whitespace-only", () => {
    const empty: string[] = [];
    for (const [key, value] of enFlat) {
      if (!value.trim()) empty.push(key);
    }
    expect(empty, `Empty en.json values: ${empty.join(", ")}`).toHaveLength(0);
  });
});

describe("catalog sections present", () => {
  it("en.json has customer.* section", () => {
    const customerKeys = [...enFlat.keys()].filter((k) => k.startsWith("customer."));
    expect(customerKeys.length).toBeGreaterThan(30);
  });

  it("en.json has admin.nav.* section", () => {
    const navKeys = [...enFlat.keys()].filter((k) => k.startsWith("admin.nav."));
    expect(navKeys.length).toBeGreaterThan(5);
  });

  it("en.json has admin.menu.* section", () => {
    const menuKeys = [...enFlat.keys()].filter((k) => k.startsWith("admin.menu."));
    expect(menuKeys.length).toBeGreaterThan(10);
  });

  it("fa.json has customer.* section with Farsi content", () => {
    const searchValue = faFlat.get("customer.search");
    expect(searchValue).toBe("جستجو");
  });

  it("fa.json admin.menu keys are Farsi", () => {
    const pageTitleFa = faFlat.get("admin.menu.pageTitle");
    expect(pageTitleFa).toBe("منو");
  });
});

describe("makeT (src/lib/i18n.ts) keys aligned with JSON catalogs", () => {
  const coreCustomerKeys = [
    "search",
    "addToOrder",
    "cart",
    "total",
    "checkout",
    "payNow",
    "splitBill",
    "thankYou",
    "orderPlaced",
    "paymentSuccess",
    "changeLanguage",
    "priceUpdated",
    "confirmAndPay",
    "youPay",
    "processing",
    "backToMenu",
    "numberOfPeople",
    "enterAmount",
    "paymentFailed",
    "methodIpg",
    "methodCash",
    "specialPlaceholder",
    "completeRequired",
  ];

  it("all core customer keys exist in fa dict", () => {
    const t = getDict("fa");
    for (const key of coreCustomerKeys) {
      expect(t[key], `fa.${key} missing`).toBeTruthy();
    }
  });

  it("all core customer keys exist in en dict", () => {
    const t = getDict("en");
    for (const key of coreCustomerKeys) {
      expect(t[key], `en.${key} missing`).toBeTruthy();
    }
  });

  it("fa customer dict has different values than en (actually translated)", () => {
    const fa = getDict("fa");
    const en = getDict("en");
    let sameCount = 0;
    for (const key of coreCustomerKeys) {
      if (fa[key] === en[key]) sameCount++;
    }
    expect(sameCount).toBe(0);
  });
});

describe("bilingual admin menu keys present in catalogs", () => {
  const bilingualKeys = [
    "admin.menu.nameFa",
    "admin.menu.nameEn",
    "admin.menu.descriptionFa",
    "admin.menu.descriptionEn",
    "admin.menu.nameFaPlaceholder",
    "admin.menu.nameEnPlaceholder",
    "admin.menu.saveChanges",
    "admin.menu.cancel",
  ];

  it("all bilingual menu editor keys exist in en.json", () => {
    for (const key of bilingualKeys) {
      expect(enFlat.has(key), `en: missing key "${key}"`).toBe(true);
    }
  });

  it("all bilingual menu editor keys exist in fa.json", () => {
    for (const key of bilingualKeys) {
      expect(faFlat.has(key), `fa: missing key "${key}"`).toBe(true);
    }
  });
});
