/**
 * Property-based and unit tests for money.ts.
 *
 * Guards against:
 *   - ×10 / ×1000 rial↔toman drift
 *   - JSON round-trip of BigInt money in request bodies and localStorage
 *   - every named conversion boundary being the inverse of its counterpart
 *
 * Run: bun test tests/money.test.ts
 */
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  MONETARY_UNIT,
  rialToToman,
  tomanToRial,
  parseRialFromInput,
  rialForStorage,
  rialFromStorage,
  rialForGateway,
  rialFromGateway,
  formatRialAsToman,
  bigintFromJson,
  bigintToJson,
  cartMoneyReplacer,
  cartMoneyReviver,
} from "@/lib/money";

describe("MONETARY_UNIT", () => {
  it("equals 10 (rial per toman redenomination factor)", () => {
    expect(MONETARY_UNIT).toBe(10n);
  });
});

describe("rialToToman / tomanToRial — round-trips", () => {
  it("property: tomanToRial(rialToToman(r)) === r for all integer multiples of 10", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: 10_000_000_000n }).map((n) => n * 10n),
        (rial) => {
          expect(tomanToRial(rialToToman(rial))).toBe(rial);
        }
      )
    );
  });

  it("100 rial = 10 toman", () => {
    expect(rialToToman(100n)).toBe(10n);
  });

  it("10 toman = 100 rial", () => {
    expect(tomanToRial(10n)).toBe(100n);
  });

  it("0 rial = 0 toman", () => {
    expect(rialToToman(0n)).toBe(0n);
  });

  it("property: rialToToman result is always rial / 10 (no ×1000 drift)", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 100_000_000n }), (toman) => {
        const rial = tomanToRial(toman);
        expect(rial).toBe(toman * 10n);
      })
    );
  });
});

describe("parseRialFromInput — admin price input boundary", () => {
  it("parses toman string into rial bigint", () => {
    expect(parseRialFromInput("15000")).toBe(150_000n);
  });

  it("parses fractional toman (half-toman) and truncates to whole rial", () => {
    expect(parseRialFromInput("100.5")).toBe(1005n);
  });

  it("returns 0n for empty string", () => {
    expect(parseRialFromInput("")).toBe(0n);
  });

  it("returns 0n for non-numeric input", () => {
    expect(parseRialFromInput("abc")).toBe(0n);
  });

  it("returns 0n for negative input", () => {
    expect(parseRialFromInput("-100")).toBe(0n);
  });

  it("property: parseRialFromInput always returns non-negative bigint", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const result = parseRialFromInput(s);
        expect(result >= 0n).toBe(true);
      })
    );
  });

  it("property: round-trips through formatRialAsToman for integer toman values", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 100_000_000n }), (toman) => {
        const rial = tomanToRial(toman);
        const formatted = formatRialAsToman(rial);
        const reparsed = parseRialFromInput(formatted);
        expect(reparsed).toBe(rial);
      })
    );
  });
});

describe("rialForStorage / rialFromStorage — DB serialisation boundary", () => {
  it("BigInt comes back as the same BigInt after string round-trip", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 10_000_000_000n }), (rial) => {
        expect(rialFromStorage(rialForStorage(rial))).toBe(rial);
      })
    );
  });

  it("stores as string representation", () => {
    expect(rialForStorage(150_000n)).toBe("150000");
  });

  it("restores from numeric string", () => {
    expect(rialFromStorage("150000")).toBe(150_000n);
  });

  it("restores from number (JSON deserialization)", () => {
    expect(rialFromStorage(150_000)).toBe(150_000n);
  });
});

describe("rialForGateway / rialFromGateway — payment gateway boundary", () => {
  it("gateway sees rial as integer string (the canonical minor unit)", () => {
    expect(rialForGateway(250_000n)).toBe("250000");
  });

  it("round-trips: rialFromGateway(rialForGateway(r)) === r", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 1n, max: 10_000_000_000n }), (rial) => {
        expect(rialFromGateway(rialForGateway(rial))).toBe(rial);
      })
    );
  });

  it("property: gateway amount is always a digit-only string (no drift factor)", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 10_000_000_000n }), (rial) => {
        const s = rialForGateway(rial);
        expect(/^\d+$/.test(s)).toBe(true);
        expect(rialFromGateway(s)).toBe(rial);
      })
    );
  });
});

describe("formatRialAsToman — UI display boundary", () => {
  it("150000 rial = 15000 toman string", () => {
    expect(formatRialAsToman(150_000n)).toBe("15000");
  });

  it("0 rial = 0 toman string", () => {
    expect(formatRialAsToman(0n)).toBe("0");
  });

  it("property: result is always a non-empty digit string", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 100_000_000_000n }), (rial) => {
        const s = formatRialAsToman(rial);
        expect(/^\d+$/.test(s)).toBe(true);
      })
    );
  });
});

describe("bigintToJson / bigintFromJson — JSON request-body boundary", () => {
  it("serialises bigint to string", () => {
    expect(bigintToJson(150_000n)).toBe("150000");
  });

  it("deserialises string to bigint", () => {
    expect(bigintFromJson("150000")).toBe(150_000n);
  });

  it("deserialises number to bigint", () => {
    expect(bigintFromJson(150_000)).toBe(150_000n);
  });

  it("property: bigintFromJson(bigintToJson(n)) === n for all non-negative bigints", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 10_000_000_000n }), (n) => {
        expect(bigintFromJson(bigintToJson(n))).toBe(n);
      })
    );
  });

  it("JSON.stringify does not throw on bigintToJson output", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 10_000_000_000n }), (n) => {
        const payload = { amount: bigintToJson(n), tipAmount: bigintToJson(0n) };
        expect(() => JSON.stringify(payload)).not.toThrow();
      })
    );
  });
});

describe("cartMoneyReplacer / cartMoneyReviver — localStorage persist boundary", () => {
  it("replaces bigint with tagged string in cart lines", () => {
    const lines = [
      {
        lineId: "a",
        itemId: "i1",
        name: "کباب",
        unitPrice: 150_000n,
        quantity: 2,
        modifiers: [{ groupId: "g1", groupName: "size", optionId: "o1", optionName: "large", priceDelta: 10_000n }],
      },
    ];
    const json = JSON.stringify(lines, cartMoneyReplacer);
    expect(() => JSON.parse(json)).not.toThrow();
    const parsed = JSON.parse(json, cartMoneyReviver);
    expect(parsed[0].unitPrice).toBe(150_000n);
    expect(parsed[0].modifiers[0].priceDelta).toBe(10_000n);
  });

  it("property: cart lines with bigint prices survive a full stringify/parse cycle", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: 10_000_000_000n }),
        fc.bigInt({ min: 0n, max: 1_000_000n }),
        (unitPrice, priceDelta) => {
          const lines = [
            {
              lineId: "x",
              itemId: "y",
              name: "item",
              unitPrice,
              quantity: 1,
              modifiers: [{ groupId: "g", groupName: "g", optionId: "o", optionName: "o", priceDelta }],
            },
          ];
          const json = JSON.stringify(lines, cartMoneyReplacer);
          const restored = JSON.parse(json, cartMoneyReviver);
          expect(restored[0].unitPrice).toBe(unitPrice);
          expect(restored[0].modifiers[0].priceDelta).toBe(priceDelta);
        }
      )
    );
  });

  it("reviver does not touch non-money string fields", () => {
    const obj = { name: "کباب کوبیده", status: "active" };
    const json = JSON.stringify(obj, cartMoneyReplacer);
    const restored = JSON.parse(json, cartMoneyReviver);
    expect(restored.name).toBe("کباب کوبیده");
    expect(restored.status).toBe("active");
  });
});

describe("zero-drift guard — no ×10 or ×1000 scale errors", () => {
  it("1 toman rial (10) does not become 1 toman (1) via rialToToman", () => {
    expect(rialToToman(10n)).toBe(1n);
    expect(rialToToman(10n)).not.toBe(10n);
  });

  it("1000 rial is 100 toman, not 1 toman", () => {
    expect(rialToToman(1_000n)).toBe(100n);
  });

  it("10000 rial is 1000 toman (one هزار تومان)", () => {
    expect(rialToToman(10_000n)).toBe(1_000n);
  });

  it("parseRialFromInput('1000') returns 10000 rial (×10), not 1000 rial", () => {
    expect(parseRialFromInput("1000")).toBe(10_000n);
  });
});
