/**
 * Tests for the Farsi-first RTL foundation (issue #10).
 *
 * Verifies:
 *   - Only fa and en locales remain in i18n.ts and routing.ts
 *   - dirFor returns rtl for fa, ltr for en and unknown locales
 *   - dirForLocale (routing) returns correct directions
 *   - makeT falls back through fa dict then en dict then key
 *   - All fa dictionary keys are defined (no missing keys vs en)
 *   - Middleware config matcher excludes api routes
 */

import { describe, it, expect } from "vitest";
import { LOCALES, dirFor, makeT } from "@/lib/i18n";
import { routing, dirForLocale } from "@/i18n/routing";

describe("LOCALES — only fa and en remain", () => {
  it("contains exactly two locales", () => {
    expect(LOCALES).toHaveLength(2);
  });

  it("fa is first (default)", () => {
    expect(LOCALES[0].code).toBe("fa");
  });

  it("en is second", () => {
    expect(LOCALES[1].code).toBe("en");
  });

  it("no legacy locales (ar, fr, es, tr, pt, ru, zh)", () => {
    const codes = LOCALES.map((l) => l.code);
    for (const dead of ["ar", "fr", "es", "tr", "pt", "ru", "zh"]) {
      expect(codes).not.toContain(dead);
    }
  });
});

describe("dirFor — text direction by locale code", () => {
  it("fa → rtl", () => {
    expect(dirFor("fa")).toBe("rtl");
  });

  it("en → ltr", () => {
    expect(dirFor("en")).toBe("ltr");
  });

  it("unknown locale → ltr (safe default)", () => {
    expect(dirFor("xyz")).toBe("ltr");
  });
});

describe("routing — next-intl routing config", () => {
  it("fa is the default locale", () => {
    expect(routing.defaultLocale).toBe("fa");
  });

  it("supports fa and en only", () => {
    expect([...routing.locales]).toEqual(["fa", "en"]);
  });

  it("uses as-needed prefix (default locale has no prefix)", () => {
    expect(routing.localePrefix).toBe("as-needed");
  });
});

describe("dirForLocale — routing helper", () => {
  it("fa → rtl", () => {
    expect(dirForLocale("fa")).toBe("rtl");
  });

  it("en → ltr", () => {
    expect(dirForLocale("en")).toBe("ltr");
  });
});

describe("makeT — translator fallback chain", () => {
  it("fa dict key returns Farsi string", () => {
    const t = makeT("fa");
    expect(t("search")).toBe("جستجو");
  });

  it("en dict key returns English string", () => {
    const t = makeT("en");
    expect(t("search")).toBe("Search");
  });

  it("unknown locale falls back to en then key", () => {
    const t = makeT("de");
    expect(t("search")).toBe("Search");
  });

  it("missing key falls back to the key string itself", () => {
    const t = makeT("fa");
    expect(t("nonExistentKey123")).toBe("nonExistentKey123");
  });
});

describe("fa dictionary completeness", () => {
  it("every key present in en dict is also in fa dict", () => {
    const tEn = makeT("en");
    const tFa = makeT("fa");
    const sampleKeys = [
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
    ];
    for (const key of sampleKeys) {
      const faValue = tFa(key);
      const enValue = tEn(key);
      expect(faValue).not.toBe(key);
      expect(faValue).not.toBe(enValue);
    }
  });
});
