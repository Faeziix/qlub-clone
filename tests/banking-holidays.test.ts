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
 *   - عید فطر, عید قربان, عید غدیر, مبعث present in 1403 and 1404
 *   - No duplicate jalaliDate keys in the calendar
 *   - 1404-11-22 is only پیروزی انقلاب اسلامی (not Eid al-Fitr)
 *   - 1404-01-10 and 1404-01-11 are the correct Eid al-Fitr entries for 1404
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

  it("contains no duplicate jalaliDate values (all keys are unique within the set)", () => {
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const h of IRANIAN_BANKING_HOLIDAYS) {
      if (seen.has(h.jalaliDate)) {
        duplicates.push(h.jalaliDate);
      }
      seen.add(h.jalaliDate);
    }
    expect(duplicates).toEqual([]);
  });

  it("covers all three years 1403, 1404, and 1405", () => {
    const years = new Set(IRANIAN_BANKING_HOLIDAYS.map((h) => h.jalaliDate.slice(0, 4)));
    expect(years.has("1403")).toBe(true);
    expect(years.has("1404")).toBe(true);
    expect(years.has("1405")).toBe(true);
  });
});

describe("lunar holiday completeness — عید فطر, عید قربان, عید غدیر, مبعث", () => {
  it("1403 contains عید فطر on 1403-01-22 (April 10, 2024)", () => {
    const entry = IRANIAN_BANKING_HOLIDAYS.find((h) => h.jalaliDate === "1403-01-22");
    expect(entry).toBeDefined();
    expect(entry?.name).toContain("عید فطر");
  });

  it("1403 contains عید فطر second day on 1403-01-23 (April 11, 2024)", () => {
    const entry = IRANIAN_BANKING_HOLIDAYS.find((h) => h.jalaliDate === "1403-01-23");
    expect(entry).toBeDefined();
  });

  it("1403 contains عید قربان on 1403-03-28 (June 17, 2024)", () => {
    const entry = IRANIAN_BANKING_HOLIDAYS.find((h) => h.jalaliDate === "1403-03-28");
    expect(entry).toBeDefined();
    expect(entry?.name).toContain("عید قربان");
  });

  it("1403 contains عید قربان second day on 1403-03-29 (June 18, 2024)", () => {
    const entry = IRANIAN_BANKING_HOLIDAYS.find((h) => h.jalaliDate === "1403-03-29");
    expect(entry).toBeDefined();
  });

  it("1403 contains عید غدیر on 1403-04-05 (June 25, 2024)", () => {
    const entry = IRANIAN_BANKING_HOLIDAYS.find((h) => h.jalaliDate === "1403-04-05");
    expect(entry).toBeDefined();
    expect(entry?.name).toContain("عید غدیر");
  });

  it("1403 contains مبعث on 1403-11-08 (January 27, 2025)", () => {
    const entry = IRANIAN_BANKING_HOLIDAYS.find((h) => h.jalaliDate === "1403-11-08");
    expect(entry).toBeDefined();
    expect(entry?.name).toContain("مبعث");
  });

  it("1404 contains عید فطر on 1404-01-10 (March 30, 2025)", () => {
    const entry = IRANIAN_BANKING_HOLIDAYS.find((h) => h.jalaliDate === "1404-01-10");
    expect(entry).toBeDefined();
    expect(entry?.name).toContain("عید فطر");
  });

  it("1404 contains عید فطر second day on 1404-01-11 (March 31, 2025)", () => {
    const entry = IRANIAN_BANKING_HOLIDAYS.find((h) => h.jalaliDate === "1404-01-11");
    expect(entry).toBeDefined();
  });

  it("1404 contains عید قربان on 1404-03-16 (June 6, 2025)", () => {
    const entry = IRANIAN_BANKING_HOLIDAYS.find((h) => h.jalaliDate === "1404-03-16");
    expect(entry).toBeDefined();
    expect(entry?.name).toContain("عید قربان");
  });

  it("1404 contains عید قربان second day on 1404-03-17 (June 7, 2025)", () => {
    const entry = IRANIAN_BANKING_HOLIDAYS.find((h) => h.jalaliDate === "1404-03-17");
    expect(entry).toBeDefined();
  });

  it("1404 contains عید غدیر on 1404-03-24 (June 14, 2025)", () => {
    const entry = IRANIAN_BANKING_HOLIDAYS.find((h) => h.jalaliDate === "1404-03-24");
    expect(entry).toBeDefined();
    expect(entry?.name).toContain("عید غدیر");
  });

  it("1404 contains مبعث on 1404-10-26 (January 16, 2026)", () => {
    const entry = IRANIAN_BANKING_HOLIDAYS.find((h) => h.jalaliDate === "1404-10-26");
    expect(entry).toBeDefined();
    expect(entry?.name).toContain("مبعث");
  });

  it("1405 contains عید قربان", () => {
    const entry = IRANIAN_BANKING_HOLIDAYS.find(
      (h) => h.jalaliDate.startsWith("1405") && h.name.includes("عید قربان")
    );
    expect(entry).toBeDefined();
  });

  it("1405 contains عید غدیر", () => {
    const entry = IRANIAN_BANKING_HOLIDAYS.find(
      (h) => h.jalaliDate.startsWith("1405") && h.name.includes("عید غدیر")
    );
    expect(entry).toBeDefined();
  });

  it("1405 contains مبعث", () => {
    const entry = IRANIAN_BANKING_HOLIDAYS.find(
      (h) => h.jalaliDate.startsWith("1405") && h.name.includes("مبعث")
    );
    expect(entry).toBeDefined();
  });

  it("1405 contains تاسوعا and عاشورا", () => {
    const tasua = IRANIAN_BANKING_HOLIDAYS.find(
      (h) => h.jalaliDate.startsWith("1405") && h.name.includes("تاسوعا")
    );
    const ashura = IRANIAN_BANKING_HOLIDAYS.find(
      (h) => h.jalaliDate.startsWith("1405") && h.name.includes("عاشورا")
    );
    expect(tasua).toBeDefined();
    expect(ashura).toBeDefined();
  });
});

describe("1404-11-22 must be پیروزی انقلاب only — not Eid al-Fitr", () => {
  it("1404-11-22 is the Islamic Revolution Victory day (22 Bahman)", () => {
    const entries = IRANIAN_BANKING_HOLIDAYS.filter((h) => h.jalaliDate === "1404-11-22");
    expect(entries.length).toBe(1);
    expect(entries[0].name).toContain("پیروزی انقلاب");
  });

  it("there is no عید فطر entry in 1404 Bahman (month 11)", () => {
    const wrongFitr = IRANIAN_BANKING_HOLIDAYS.find(
      (h) => h.jalaliDate.startsWith("1404-11") && h.name.includes("عید فطر")
    );
    expect(wrongFitr).toBeUndefined();
  });
});

describe("isOfficialHoliday — checks against the static calendar", () => {
  it("Nowruz 1404-01-01 (2025-03-21) is an official holiday", () => {
    const nowruz = new Date("2025-03-20T20:30:00Z");
    expect(isOfficialHoliday(nowruz)).toBe(true);
  });

  it("عید فطر 1403 day 1 (2024-04-10 = 1403-01-22) is an official holiday", () => {
    const eidFitr = new Date("2024-04-10T00:00:00Z");
    expect(isOfficialHoliday(eidFitr)).toBe(true);
  });

  it("عید قربان 1403 day 1 (2024-06-17 = 1403-03-28) is an official holiday", () => {
    const eidAdha = new Date("2024-06-17T00:00:00Z");
    expect(isOfficialHoliday(eidAdha)).toBe(true);
  });

  it("عید غدیر 1403 (2024-06-25 = 1403-04-05) is an official holiday", () => {
    const eidGhadir = new Date("2024-06-25T00:00:00Z");
    expect(isOfficialHoliday(eidGhadir)).toBe(true);
  });

  it("مبعث 1403 (2025-01-27 = 1403-11-08) is an official holiday", () => {
    const mabath = new Date("2025-01-27T00:00:00Z");
    expect(isOfficialHoliday(mabath)).toBe(true);
  });

  it("عید فطر 1404 day 1 (2025-03-30 = 1404-01-10) is an official holiday", () => {
    const eidFitr1404 = new Date("2025-03-30T00:00:00Z");
    expect(isOfficialHoliday(eidFitr1404)).toBe(true);
  });

  it("عید قربان 1404 day 1 (2025-06-06 = 1404-03-16) is an official holiday", () => {
    const eidAdha1404 = new Date("2025-06-06T00:00:00Z");
    expect(isOfficialHoliday(eidAdha1404)).toBe(true);
  });

  it("عید غدیر 1404 (2025-06-14 = 1404-03-24) is an official holiday", () => {
    const eidGhadir1404 = new Date("2025-06-14T00:00:00Z");
    expect(isOfficialHoliday(eidGhadir1404)).toBe(true);
  });

  it("a normal weekday (not in the calendar) is not an official holiday", () => {
    const normalDay = new Date("2025-04-15T00:00:00Z");
    expect(isOfficialHoliday(normalDay)).toBe(false);
  });

  it("the day before عید قربان 1403 (2024-06-16) is not an official holiday", () => {
    const dayBefore = new Date("2024-06-16T00:00:00Z");
    expect(isOfficialHoliday(dayBefore)).toBe(false);
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

  it("عید فطر 1403 is a banking holiday", () => {
    const eidFitr = new Date("2024-04-10T00:00:00Z");
    expect(isBankingHoliday(eidFitr)).toBe(true);
  });

  it("عید قربان 1403 is a banking holiday", () => {
    const eidAdha = new Date("2024-06-17T00:00:00Z");
    expect(isBankingHoliday(eidAdha)).toBe(true);
  });

  it("عید غدیر 1403 is a banking holiday", () => {
    const eidGhadir = new Date("2024-06-25T00:00:00Z");
    expect(isBankingHoliday(eidGhadir)).toBe(true);
  });

  it("عید فطر 1404 is a banking holiday", () => {
    const eidFitr1404 = new Date("2025-03-30T00:00:00Z");
    expect(isBankingHoliday(eidFitr1404)).toBe(true);
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
  it("from a Thursday, returns the following Saturday (when Saturday is not a holiday)", () => {
    // June 19, 2025 is Thursday; June 21 is Saturday with no holiday in 1404
    const thursday = new Date("2025-06-19T00:00:00Z");
    const next = nextBankingDay(thursday);
    expect(next.getDay()).toBe(6);
  });

  it("from a Friday, returns Saturday (when Saturday is not a holiday)", () => {
    // June 20, 2025 is Friday; June 21 is Saturday with no holiday in 1404
    const friday = new Date("2025-06-20T00:00:00Z");
    const next = nextBankingDay(friday);
    expect(next.getDay()).toBe(6);
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

  it("nextBankingDay after عید فطر 1403 skips the holiday block", () => {
    const dayBeforeEidFitr = new Date("2024-04-09T00:00:00Z");
    const next = nextBankingDay(dayBeforeEidFitr);
    expect(isBankingHoliday(next)).toBe(false);
  });

  it("nextBankingDay after عید قربان 1403 skips both days", () => {
    const dayBeforeEidAdha = new Date("2024-06-16T00:00:00Z");
    const next = nextBankingDay(dayBeforeEidAdha);
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

  it("adding 1 banking day around عید قربان 1404 skips both holiday days", () => {
    const dayBeforeEidAdha1404 = new Date("2025-06-05T00:00:00Z");
    const result = addBankingDays(dayBeforeEidAdha1404, 1);
    expect(isBankingHoliday(result)).toBe(false);
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

  it("settlement during عید فطر 1403 block projects past both holiday days", () => {
    const paymentDuringEid = new Date("2024-04-10T10:00:00Z");
    const due = settlementDueDate(paymentDuringEid);
    expect(isBankingHoliday(due)).toBe(false);
  });

  it("settlement during عید قربان 1403 block projects past both holiday days", () => {
    const paymentDuringAdha = new Date("2024-06-17T10:00:00Z");
    const due = settlementDueDate(paymentDuringAdha);
    expect(isBankingHoliday(due)).toBe(false);
  });
});
