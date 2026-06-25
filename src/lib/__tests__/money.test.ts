import { describe, expect, it } from "vitest";
import { test, fc } from "@fast-check/vitest";
import {
  MONETARY_UNIT,
  rialToToman,
  tomanToRial,
  rialToGatewayUnit,
  gatewayUnitToRial,
  formatRialAsToman,
  parseRialFromInput,
  isFullyPaid,
} from "@/lib/money";

// ─────────────────────────── constants ────────────────────────────────────────

describe("MONETARY_UNIT", () => {
  it("is the string 'IRR' matching canonical storage unit", () => {
    expect(MONETARY_UNIT).toBe("IRR");
  });
});

// ─────────────────────────── rial ↔ toman ─────────────────────────────────────

describe("rialToToman / tomanToRial", () => {
  it("converts 10n rial to 1n toman", () => {
    expect(rialToToman(10n)).toBe(1n);
  });

  it("converts 1_000_000n rial to 100_000n toman", () => {
    expect(rialToToman(1_000_000n)).toBe(100_000n);
  });

  it("rounds toward zero for non-divisible amounts", () => {
    expect(rialToToman(15n)).toBe(1n);
    expect(rialToToman(19n)).toBe(1n);
  });

  it("tomanToRial is the inverse for multiples of 10", () => {
    expect(tomanToRial(100_000n)).toBe(1_000_000n);
    expect(tomanToRial(1n)).toBe(10n);
  });

  it("handles zero", () => {
    expect(rialToToman(0n)).toBe(0n);
    expect(tomanToRial(0n)).toBe(0n);
  });
});

// ─────────────────────────── gateway unit ─────────────────────────────────────

describe("rialToGatewayUnit / gatewayUnitToRial", () => {
  it("converts rial to gateway unit (rial, factor 1)", () => {
    expect(rialToGatewayUnit(50_000n)).toBe(50_000n);
  });

  it("round-trips rial → gateway → rial with zero drift", () => {
    const amount = 123_456_789n;
    expect(gatewayUnitToRial(rialToGatewayUnit(amount))).toBe(amount);
  });

  it("handles zero without drift", () => {
    expect(rialToGatewayUnit(0n)).toBe(0n);
    expect(gatewayUnitToRial(0n)).toBe(0n);
  });
});

// ─────────────────────────── display formatter ────────────────────────────────

describe("formatRialAsToman", () => {
  it("formats 1_000_000 rial as toman string", () => {
    const result = formatRialAsToman(1_000_000n);
    expect(result).toBe("100,000");
  });

  it("formats 0 rial as '0'", () => {
    expect(formatRialAsToman(0n)).toBe("0");
  });

  it("formats 10_000_000 rial as '1,000,000'", () => {
    expect(formatRialAsToman(10_000_000n)).toBe("1,000,000");
  });
});

// ─────────────────────────── parseRialFromInput ────────────────────────────────

describe("parseRialFromInput", () => {
  it("parses a toman input string to rial bigint", () => {
    expect(parseRialFromInput("100000")).toBe(1_000_000n);
  });

  it("parses zero", () => {
    expect(parseRialFromInput("0")).toBe(0n);
  });

  it("strips commas before parsing", () => {
    expect(parseRialFromInput("100,000")).toBe(1_000_000n);
  });

  it("returns 0n for empty string", () => {
    expect(parseRialFromInput("")).toBe(0n);
  });

  it("produces exactly 10x the numeric input (toman→rial, no x10 undercharge)", () => {
    // Regression: if user types 50000 (toman), we must store 500000n rial, not 50000n.
    // The pre-fix bug was BigInt("50000") = 50000n rial, a 10x undercharge.
    expect(parseRialFromInput("50000")).toBe(500_000n);
    expect(parseRialFromInput("1")).toBe(10n);
  });

  it("parseRialFromInput result is always 10x the integer the user typed", () => {
    const userTyped = 12345n;
    expect(parseRialFromInput(String(userTyped))).toBe(userTyped * 10n);
  });
});

// ─────────────────────────── isFullyPaid ──────────────────────────────────────

describe("isFullyPaid", () => {
  it("returns true when amount paid equals total", () => {
    expect(isFullyPaid(1_000_000n, 1_000_000n)).toBe(true);
  });

  it("returns true when amount paid exceeds total (overpay)", () => {
    expect(isFullyPaid(1_000_001n, 1_000_000n)).toBe(true);
  });

  it("returns false when amount paid is less than total", () => {
    expect(isFullyPaid(999_999n, 1_000_000n)).toBe(false);
  });

  it("returns false for zero paid against non-zero total", () => {
    expect(isFullyPaid(0n, 1_000_000n)).toBe(false);
  });

  it("handles zero total as fully paid", () => {
    expect(isFullyPaid(0n, 0n)).toBe(true);
  });
});

// ─────────────────────────── property-based tests ────────────────────────────

const positiveRial = fc.bigInt({ min: 0n, max: 1_000_000_000_000n });

describe("property-based: no drift across boundaries", () => {
  test.prop([positiveRial])(
    "rial → gateway → rial round-trips with zero drift",
    (rial) => {
      return gatewayUnitToRial(rialToGatewayUnit(rial)) === rial;
    }
  );

  test.prop([positiveRial])(
    "tomanToRial(rialToToman(rial)) loses at most 9 rial (truncation only, no x10 drift)",
    (rial) => {
      const reconstructed = tomanToRial(rialToToman(rial));
      const loss = rial - reconstructed;
      return loss >= 0n && loss < 10n;
    }
  );

  test.prop([positiveRial])(
    "rialToToman never produces a value larger than input (no x10 amplification)",
    (rial) => {
      return rialToToman(rial) <= rial;
    }
  );

  test.prop([positiveRial])(
    "tomanToRial is always exactly 10x the input (no redenomination drift)",
    (toman) => {
      return tomanToRial(toman) === toman * 10n;
    }
  );

  test.prop([positiveRial])(
    "formatRialAsToman produces a non-empty string for any positive amount",
    (rial) => {
      const result = formatRialAsToman(rial);
      return typeof result === "string" && result.length > 0;
    }
  );

  test.prop([positiveRial, positiveRial])(
    "isFullyPaid is consistent: paid >= total iff fully paid",
    (paid, total) => {
      return isFullyPaid(paid, total) === (paid >= total);
    }
  );

  test.prop([
    fc.bigInt({ min: 1n, max: 1_000_000_000n }).map((t) => t * 10n),
  ])(
    "parseRialFromInput(formatRialAsToman(rial)) round-trips for multiples of 10",
    (rial) => {
      const displayed = formatRialAsToman(rial);
      const reparsed = parseRialFromInput(displayed);
      return reparsed === rial;
    }
  );

  test.prop([fc.bigInt({ min: 0n, max: 1_000_000_000n })])(
    "parseRialFromInput always produces exactly 10x the integer the user typed (no x10 undercharge)",
    (tomanTyped) => {
      const result = parseRialFromInput(String(tomanTyped));
      return result === tomanTyped * 10n;
    }
  );
});
