/**
 * jalali.ts — deep module for Jalali (Solar Hijri) date formatting and arithmetic.
 *
 * All operations are performed in the Asia/Tehran timezone — never UTC or local
 * system time. The caller never needs to manage timezone conversion manually;
 * every exported function accepts a plain JS Date (UTC-based) and converts it
 * internally.
 *
 * Uses date-fns-jalali (Jalali calendar arithmetic) with @date-fns/tz (TZDate)
 * to ensure consistent Asia/Tehran date framing on any server or CI environment.
 *
 * Persian numeral rendering: all output strings use ۰-۹ via toman-formatter's
 * latinDigitsToPersian (shared helper).
 */

import { TZDate } from "@date-fns/tz";
import {
  getYear as jalaliGetYear,
  getMonth as jalaliGetMonth,
  getDate as jalaliGetDate,
  getDay as jalaliGetDay,
  addDays as jalaliAddDays,
} from "date-fns-jalali";
import { latinDigitsToPersian } from "./toman-formatter";

export const TEHRAN_TIMEZONE = "Asia/Tehran";

export function toTehranDate(date: Date | number): TZDate {
  if (typeof date === "number") {
    return new TZDate(date, TEHRAN_TIMEZONE);
  }
  return new TZDate(date, TEHRAN_TIMEZONE);
}

export interface JalaliParts {
  year: number;
  month: number;
  day: number;
}

export function getJalaliParts(date: Date | number): JalaliParts {
  const tehranDate = toTehranDate(date);
  return {
    year: jalaliGetYear(tehranDate),
    month: jalaliGetMonth(tehranDate) + 1,
    day: jalaliGetDate(tehranDate),
  };
}

const JALALI_MONTH_NAMES_FA = [
  "فروردین",
  "اردیبهشت",
  "خرداد",
  "تیر",
  "مرداد",
  "شهریور",
  "مهر",
  "آبان",
  "آذر",
  "دی",
  "بهمن",
  "اسفند",
] as const;

export function formatJalaliDate(date: Date | number): string {
  const tehranDate = toTehranDate(date);
  const { year, month, day } = getJalaliParts(tehranDate);
  const monthName = JALALI_MONTH_NAMES_FA[month - 1];
  const persianDay = latinDigitsToPersian(String(day));
  const persianYear = latinDigitsToPersian(String(year));
  return `${persianDay} ${monthName} ${persianYear}`;
}

export function formatJalaliDateTime(date: Date | number): string {
  const tehranDate = toTehranDate(date);
  const datePart = formatJalaliDate(tehranDate);
  const hours = latinDigitsToPersian(String(tehranDate.getHours()).padStart(2, "0"));
  const minutes = latinDigitsToPersian(String(tehranDate.getMinutes()).padStart(2, "0"));
  return `${datePart}، ${hours}:${minutes}`;
}

export function isTehranFriday(date: Date | number): boolean {
  const tehranDate = toTehranDate(date);
  return jalaliGetDay(tehranDate) === 5;
}

export function isTehranThursday(date: Date | number): boolean {
  const tehranDate = toTehranDate(date);
  return jalaliGetDay(tehranDate) === 4;
}

export function addDaysTehran(date: Date | number, days: number): Date {
  const tehranDate = toTehranDate(date);
  return jalaliAddDays(tehranDate, days);
}
