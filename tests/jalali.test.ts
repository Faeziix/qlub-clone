/**
 * Unit tests for jalali.ts (issue #11).
 *
 * Verifies:
 *   - All formatting operations use Asia/Tehran timezone
 *   - Jalali year/month/day extraction from a JS Date
 *   - formatJalaliDate produces a Persian-numeral Jalali date string
 *   - formatJalaliDateTime produces date+time string
 *   - toTehranDate normalizes a JS Date to Asia/Tehran perspective
 *   - Day-of-week helpers: isTehranFriday, isTehranThursday
 *   - addJalaliDays arithmetic
 */

import { describe, it, expect } from "vitest";
import {
  toTehranDate,
  getJalaliParts,
  formatJalaliDate,
  formatJalaliDateTime,
  isTehranFriday,
  isTehranThursday,
  addDaysTehran,
  TEHRAN_TIMEZONE,
} from "@/lib/jalali";

describe("TEHRAN_TIMEZONE constant", () => {
  it("equals 'Asia/Tehran'", () => {
    expect(TEHRAN_TIMEZONE).toBe("Asia/Tehran");
  });
});

describe("toTehranDate — wraps a Date in Asia/Tehran perspective", () => {
  it("returns a Date-like object representing the given moment in Tehran time", () => {
    const utc = new Date("2025-03-21T20:30:00Z");
    const tehran = toTehranDate(utc);
    expect(tehran).toBeInstanceOf(Date);
  });

  it("accepts a numeric timestamp", () => {
    const ts = Date.now();
    const tehran = toTehranDate(ts);
    expect(tehran).toBeInstanceOf(Date);
  });
});

describe("getJalaliParts — extract Jalali year/month/day in Tehran timezone", () => {
  it("returns { year, month, day } for a UTC date in Jalali calendar", () => {
    const utc = new Date("2025-03-21T00:00:00Z");
    const parts = getJalaliParts(utc);
    expect(typeof parts.year).toBe("number");
    expect(typeof parts.month).toBe("number");
    expect(typeof parts.day).toBe("number");
    expect(parts.year).toBeGreaterThan(1400);
  });

  it("Nowruz 1404 is on 2025-03-21 in Tehran", () => {
    const nowruz = new Date("2025-03-20T20:30:00Z");
    const parts = getJalaliParts(nowruz);
    expect(parts.year).toBe(1404);
    expect(parts.month).toBe(1);
    expect(parts.day).toBe(1);
  });

  it("month is 1-indexed (1 = فروردین)", () => {
    const nowruz = new Date("2025-03-20T20:30:00Z");
    const parts = getJalaliParts(nowruz);
    expect(parts.month).toBe(1);
  });
});

describe("formatJalaliDate — produces a Jalali date string with Persian numerals", () => {
  it("output contains Persian numerals", () => {
    const date = new Date("2025-06-01T00:00:00Z");
    const result = formatJalaliDate(date);
    expect(result).toMatch(/[۰-۹]/);
  });

  it("output does not contain ASCII digits", () => {
    const date = new Date("2025-06-01T00:00:00Z");
    const result = formatJalaliDate(date);
    expect(result).not.toMatch(/[0-9]/);
  });

  it("Nowruz 1404 formats as ۱ فروردین ۱۴۰۴", () => {
    const nowruz = new Date("2025-03-20T20:30:00Z");
    const result = formatJalaliDate(nowruz);
    expect(result).toContain("۱۴۰۴");
    expect(result).toContain("فروردین");
  });

  it("includes the month name in Farsi", () => {
    const nowruz = new Date("2025-03-20T20:30:00Z");
    const result = formatJalaliDate(nowruz);
    expect(result).toMatch(
      /فروردین|اردیبهشت|خرداد|تیر|مرداد|شهریور|مهر|آبان|آذر|دی|بهمن|اسفند/
    );
  });
});

describe("formatJalaliDateTime — date + time in Tehran timezone", () => {
  it("output contains Persian numerals", () => {
    const date = new Date("2025-06-01T12:30:00Z");
    const result = formatJalaliDateTime(date);
    expect(result).toMatch(/[۰-۹]/);
  });

  it("output does not contain ASCII digits", () => {
    const date = new Date("2025-06-01T12:30:00Z");
    const result = formatJalaliDateTime(date);
    expect(result).not.toMatch(/[0-9]/);
  });

  it("includes time component (colon-separated)", () => {
    const date = new Date("2025-06-01T12:30:00Z");
    const result = formatJalaliDateTime(date);
    expect(result).toContain(":");
  });
});

describe("isTehranFriday — weekend day check (Iran's off-day)", () => {
  it("returns true for a Friday in Tehran", () => {
    const friday = new Date("2025-06-06T00:00:00Z");
    expect(isTehranFriday(friday)).toBe(true);
  });

  it("returns false for a Saturday in Tehran", () => {
    const saturday = new Date("2025-06-07T00:00:00Z");
    expect(isTehranFriday(saturday)).toBe(false);
  });

  it("returns false for a Wednesday in Tehran", () => {
    const wednesday = new Date("2025-06-04T00:00:00Z");
    expect(isTehranFriday(wednesday)).toBe(false);
  });
});

describe("isTehranThursday — half-day / pre-weekend", () => {
  it("returns true for a Thursday in Tehran", () => {
    const thursday = new Date("2025-06-05T00:00:00Z");
    expect(isTehranThursday(thursday)).toBe(true);
  });

  it("returns false for a Friday in Tehran", () => {
    const friday = new Date("2025-06-06T00:00:00Z");
    expect(isTehranThursday(friday)).toBe(false);
  });
});

describe("addDaysTehran — add calendar days in Tehran timezone", () => {
  it("adding 1 day to a date advances by one calendar day", () => {
    const base = new Date("2025-06-01T00:00:00Z");
    const next = addDaysTehran(base, 1);
    const baseParts = getJalaliParts(base);
    const nextParts = getJalaliParts(next);
    expect(nextParts.day - baseParts.day).toBe(1);
  });

  it("adding 0 days returns the same day", () => {
    const base = new Date("2025-06-01T00:00:00Z");
    const same = addDaysTehran(base, 0);
    const baseParts = getJalaliParts(base);
    const sameParts = getJalaliParts(same);
    expect(sameParts.day).toBe(baseParts.day);
    expect(sameParts.month).toBe(baseParts.month);
    expect(sameParts.year).toBe(baseParts.year);
  });

  it("adding 7 days advances by a full week", () => {
    const base = new Date("2025-05-25T00:00:00Z");
    const weekLater = addDaysTehran(base, 7);
    expect(weekLater.getTime() - base.getTime()).toBeGreaterThan(6 * 24 * 60 * 60 * 1000);
    expect(weekLater.getTime() - base.getTime()).toBeLessThanOrEqual(8 * 24 * 60 * 60 * 1000);
  });
});
