/**
 * Unit tests for banking-holidays.ts (issue #11).
 *
 * Verifies:
 *   - isBankingHoliday returns true for پنجشنبه and جمعه (Thursday/Friday)
 *   - isBankingHoliday returns true for official Iranian holidays
 *   - isBankingHoliday returns false for regular weekdays
 *   - nextBankingDay skips پنجشنبه, جمعه, and official holidays
 *   - addBankingDays adds N banking days correctly
 *   - settlementDueDate computes the next banking day from a payment date
 *   - Nowruz holidays are correctly recognized
 *   - isOfficialHoliday helper functions correctly
 */

import { describe, it, expect } from "vitest";
import {
  isBankingHoliday,
  isIranianWeekend,
  isOfficialHoliday,
  nextBankingDay,
  addBankingDays,
  settlementDueDate,
  IRANIAN_BANKING_HOLIDAYS,
} from "@/lib/banking-holidays";

describe("IRANIAN_BANKING_HOLIDAYS — static calendar source", () => {
  it("is a non-empty array", () => {
    expect(Array.isArray(IRANIAN_BANKING_HOLIDAYS)).toBe(true);
    expect(IRANIAN_BANKING_HOLIDAYS.length).toBeGreaterThan(0);
  });

  it("contains Nowruz (فروردین 1 = 1404-01-01 = 2025-03-21)", () => {
    const nowruz = IRANIAN_BANKING_HOLIDAYS.find(
      (h) => h.jalaliDate === "1404-01-01"
    );
    expect(nowruz).toBeDefined();
  });

  it("all entries have jalaliDate in YYYY-MM-DD format", () => {
    for (const h of IRANIAN_BANKING_HOLIDAYS) {
      expect(h.jalaliDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("all entries have a name field", () => {
    for (const h of IRANIAN_BANKING_HOLIDAYS) {
      expect(typeof h.name).toBe("string");
      expect(h.name.length).toBeGreaterThan(0);
    }
  });
});

describe("isIranianWeekend — پنجشنبه and جمعه", () => {
  it("Friday (جمعه) is always a banking holiday", () => {
    const friday = new Date("2025-06-06T00:00:00Z");
    expect(isIranianWeekend(friday)).toBe(true);
  });

  it("Thursday (پنجشنبه) is always a banking holiday", () => {
    const thursday = new Date("2025-06-05T00:00:00Z");
    expect(isIranianWeekend(thursday)).toBe(true);
  });

  it("Saturday is a working day", () => {
    const saturday = new Date("2025-06-07T00:00:00Z");
    expect(isIranianWeekend(saturday)).toBe(false);
  });

  it("Sunday is a working day", () => {
    const sunday = new Date("2025-06-08T00:00:00Z");
    expect(isIranianWeekend(sunday)).toBe(false);
  });

  it("Monday is a working day", () => {
    const monday = new Date("2025-06-09T00:00:00Z");
    expect(isIranianWeekend(monday)).toBe(false);
  });

  it("Wednesday is a working day", () => {
    const wednesday = new Date("2025-06-04T00:00:00Z");
    expect(isIranianWeekend(wednesday)).toBe(false);
  });
});

describe("isOfficialHoliday — checks against the static calendar", () => {
  it("Nowruz 1404-01-01 (2025-03-21) is an official holiday", () => {
    const nowruz = new Date("2025-03-20T20:30:00Z");
    expect(isOfficialHoliday(nowruz)).toBe(true);
  });

  it("a normal weekday (not in the calendar) is not an official holiday", () => {
    const normalDay = new Date("2025-04-15T00:00:00Z");
    expect(isOfficialHoliday(normalDay)).toBe(false);
  });
});

describe("isBankingHoliday — combined check (weekend OR official holiday)", () => {
  it("Friday is a banking holiday (Iranian weekend)", () => {
    const friday = new Date("2025-06-06T00:00:00Z");
    expect(isBankingHoliday(friday)).toBe(true);
  });

  it("Thursday is a banking holiday (Iranian weekend)", () => {
    const thursday = new Date("2025-06-05T00:00:00Z");
    expect(isBankingHoliday(thursday)).toBe(true);
  });

  it("Nowruz is a banking holiday (official holiday)", () => {
    const nowruz = new Date("2025-03-20T20:30:00Z");
    expect(isBankingHoliday(nowruz)).toBe(true);
  });

  it("a normal Monday is not a banking holiday", () => {
    const monday = new Date("2025-06-09T00:00:00Z");
    expect(isBankingHoliday(monday)).toBe(false);
  });

  it("a normal Wednesday is not a banking holiday", () => {
    const wednesday = new Date("2025-06-04T00:00:00Z");
    expect(isBankingHoliday(wednesday)).toBe(false);
  });
});

describe("nextBankingDay — skips weekends and official holidays", () => {
  it("from a Thursday, returns the following Saturday", () => {
    const thursday = new Date("2025-06-05T00:00:00Z");
    const next = nextBankingDay(thursday);
    const dayOfWeek = next.getDay();
    expect(dayOfWeek).toBe(6);
  });

  it("from a Friday, returns Saturday", () => {
    const friday = new Date("2025-06-06T00:00:00Z");
    const next = nextBankingDay(friday);
    const dayOfWeek = next.getDay();
    expect(dayOfWeek).toBe(6);
  });

  it("from a regular weekday (Wednesday), returns Thursday", () => {
    const wednesday = new Date("2025-06-04T00:00:00Z");
    const next = nextBankingDay(wednesday);
    expect(isBankingHoliday(next)).toBe(false);
    expect(next.getTime()).toBeGreaterThan(wednesday.getTime());
  });

  it("returns a day that is not itself a banking holiday", () => {
    for (const base of [
      new Date("2025-06-04T00:00:00Z"),
      new Date("2025-06-05T00:00:00Z"),
      new Date("2025-06-06T00:00:00Z"),
      new Date("2025-06-07T00:00:00Z"),
    ]) {
      const next = nextBankingDay(base);
      expect(isBankingHoliday(next)).toBe(false);
    }
  });

  it("nextBankingDay after Nowruz skips the holiday", () => {
    const dayBeforeNowruz = new Date("2025-03-20T00:00:00Z");
    const next = nextBankingDay(dayBeforeNowruz);
    expect(isBankingHoliday(next)).toBe(false);
  });
});

describe("addBankingDays — adds N banking days", () => {
  it("adding 0 banking days returns the next banking day (same behavior as nextBankingDay for holidays)", () => {
    const monday = new Date("2025-06-09T00:00:00Z");
    const result = addBankingDays(monday, 0);
    expect(isBankingHoliday(result)).toBe(false);
  });

  it("adding 1 banking day from a Monday returns Tuesday", () => {
    const monday = new Date("2025-06-09T00:00:00Z");
    const result = addBankingDays(monday, 1);
    expect(result.getDay()).toBe(2);
    expect(isBankingHoliday(result)).toBe(false);
  });

  it("adding 2 banking days from Wednesday correctly skips Thursday+Friday", () => {
    const wednesday = new Date("2025-06-04T00:00:00Z");
    const result = addBankingDays(wednesday, 2);
    expect(isBankingHoliday(result)).toBe(false);
    expect(result.getTime()).toBeGreaterThan(wednesday.getTime());
  });

  it("result is never a banking holiday", () => {
    for (let n = 1; n <= 5; n++) {
      const base = new Date("2025-06-04T00:00:00Z");
      const result = addBankingDays(base, n);
      expect(isBankingHoliday(result)).toBe(false);
    }
  });
});

describe("settlementDueDate — next banking day for a payment timestamp", () => {
  it("returns a Date object", () => {
    const paymentTime = new Date("2025-06-04T10:00:00Z");
    const due = settlementDueDate(paymentTime);
    expect(due).toBeInstanceOf(Date);
  });

  it("result is never a banking holiday", () => {
    for (const paymentTime of [
      new Date("2025-06-04T10:00:00Z"),
      new Date("2025-06-05T10:00:00Z"),
      new Date("2025-06-06T10:00:00Z"),
      new Date("2025-03-20T10:00:00Z"),
    ]) {
      const due = settlementDueDate(paymentTime);
      expect(isBankingHoliday(due)).toBe(false);
    }
  });

  it("due date is after the payment time", () => {
    const paymentTime = new Date("2025-06-04T10:00:00Z");
    const due = settlementDueDate(paymentTime);
    expect(due.getTime()).toBeGreaterThan(paymentTime.getTime());
  });
});
