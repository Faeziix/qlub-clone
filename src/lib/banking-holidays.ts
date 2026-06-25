/**
 * banking-holidays.ts — Iranian banking-holiday calendar + settlement-day math.
 *
 * Iranian banking days: شنبه (Saturday) through چهارشنبه (Wednesday).
 * پنجشنبه (Thursday) and جمعه (Friday) are always off — the Iranian weekend.
 * Additionally, official public holidays (listed below) are banking holidays.
 *
 * Holiday data: official Iranian public holidays for Jalali years 1403–1405,
 * cross-referenced with published Iranian government calendar announcements.
 * The list covers Nowruz (عید نوروز / Sizdah Be-dar), lunar religious holidays
 * (تاسوعا, عاشورا, عید فطر, عید قربان, عید غدیر, مبعث, and Imam birth/death
 * anniversaries), and fixed national holidays (انقلاب, ارتش, etc.). Dates are
 * expressed in Jalali YYYY-MM-DD format.
 *
 * IMPORTANT: Religious holidays (based on the lunar Hijri calendar) shift by
 * ~10-11 days each Jalali year. The dates below are derived from the official
 * Iranian government calendar publications for 1403–1404 and estimated from
 * the ~10-day annual regression for 1405 (published official dates for 1405
 * must be substituted when the government releases the 1405 calendar at Nowruz).
 * The `jalaliDate` key makes each entry predictable and testable against
 * getJalaliParts(). Dates marked [estimated] are computed by subtracting ~10-11
 * days from the 1404 official date; verify against official 1405 release.
 *
 * Included lunar holidays: عید فطر (2 days), عید قربان (2 days), عید غدیر,
 * مبعث, تاسوعا, عاشورا, اربعین, رحلت پیامبر/شهادت امام حسن, شهادت امام رضا,
 * شهادت امام محمد تقی, شهادت امام علی النقی, میلاد پیامبر/امام جعفر صادق,
 * شهادت حضرت فاطمه زهرا.
 *
 * For settlement projection, use addBankingDays() which skips both weekends
 * and official holidays. The exact facilitator settlement cadence (T+1, T+2,
 * or batch) is a per-provider concern — this module provides the calendar
 * arithmetic; the caller decides the delay.
 */

import { getJalaliParts, isTehranFriday, isTehranThursday, addDaysTehran } from "./jalali";

export interface BankingHolidayEntry {
  jalaliDate: string;
  name: string;
}

export const IRANIAN_BANKING_HOLIDAYS: BankingHolidayEntry[] = [
  // ─── 1403 Jalali (March 20, 2024 – March 19, 2025) ───────────────────────
  // Fixed solar holidays
  { jalaliDate: "1403-01-01", name: "عید نوروز" },
  { jalaliDate: "1403-01-02", name: "عید نوروز" },
  { jalaliDate: "1403-01-03", name: "عید نوروز" },
  { jalaliDate: "1403-01-04", name: "عید نوروز" },
  { jalaliDate: "1403-01-12", name: "روز جمهوری اسلامی" },
  { jalaliDate: "1403-01-13", name: "سیزده به‌در" },
  { jalaliDate: "1403-02-14", name: "رحلت امام خمینی" },
  { jalaliDate: "1403-02-15", name: "قیام ۱۵ خرداد" },
  { jalaliDate: "1403-11-22", name: "پیروزی انقلاب اسلامی" },
  { jalaliDate: "1403-12-29", name: "روز ملی شدن صنعت نفت" },

  // Lunar religious holidays 1403 — from official Iranian calendar announcements
  { jalaliDate: "1403-01-22", name: "عید فطر" },
  { jalaliDate: "1403-01-23", name: "عید فطر (تعطیل)" },
  { jalaliDate: "1403-03-14", name: "تاسوعای حسینی" },
  { jalaliDate: "1403-03-15", name: "عاشورای حسینی" },
  { jalaliDate: "1403-03-28", name: "عید قربان" },
  { jalaliDate: "1403-03-29", name: "عید قربان (تعطیل)" },
  { jalaliDate: "1403-04-05", name: "عید غدیر" },
  { jalaliDate: "1403-04-24", name: "اربعین حسینی" },
  { jalaliDate: "1403-05-05", name: "رحلت پیامبر و شهادت امام حسن" },
  { jalaliDate: "1403-05-15", name: "شهادت امام رضا" },
  { jalaliDate: "1403-06-29", name: "شهادت امام محمد تقی" },
  { jalaliDate: "1403-07-07", name: "شهادت امام علی النقی" },
  { jalaliDate: "1403-08-15", name: "میلاد پیامبر و امام جعفر صادق" },
  { jalaliDate: "1403-09-26", name: "شهادت حضرت فاطمه زهرا" },
  { jalaliDate: "1403-10-22", name: "دهه فجر / پیروزی انقلاب اسلامی" },
  { jalaliDate: "1403-11-08", name: "مبعث" },

  // ─── 1404 Jalali (March 20, 2025 – March 19, 2026) ───────────────────────
  // Fixed solar holidays
  { jalaliDate: "1404-01-01", name: "عید نوروز" },
  { jalaliDate: "1404-01-02", name: "عید نوروز" },
  { jalaliDate: "1404-01-03", name: "عید نوروز" },
  { jalaliDate: "1404-01-04", name: "عید نوروز" },
  { jalaliDate: "1404-01-12", name: "روز جمهوری اسلامی" },
  { jalaliDate: "1404-01-13", name: "سیزده به‌در" },
  { jalaliDate: "1404-02-14", name: "رحلت امام خمینی" },
  { jalaliDate: "1404-02-15", name: "قیام ۱۵ خرداد" },
  { jalaliDate: "1404-11-22", name: "پیروزی انقلاب اسلامی" },
  { jalaliDate: "1404-12-29", name: "روز ملی شدن صنعت نفت" },

  // Lunar religious holidays 1404 — from official Iranian calendar announcements
  { jalaliDate: "1404-01-10", name: "عید فطر" },
  { jalaliDate: "1404-01-11", name: "عید فطر (تعطیل)" },
  { jalaliDate: "1404-03-03", name: "تاسوعای حسینی" },
  { jalaliDate: "1404-03-04", name: "عاشورای حسینی" },
  { jalaliDate: "1404-03-16", name: "عید قربان" },
  { jalaliDate: "1404-03-17", name: "عید قربان (تعطیل)" },
  { jalaliDate: "1404-03-24", name: "عید غدیر" },
  { jalaliDate: "1404-04-13", name: "اربعین حسینی" },
  { jalaliDate: "1404-04-23", name: "رحلت پیامبر و شهادت امام حسن" },
  { jalaliDate: "1404-05-02", name: "شهادت امام رضا" },
  { jalaliDate: "1404-06-18", name: "شهادت امام محمد تقی" },
  { jalaliDate: "1404-06-26", name: "شهادت امام علی النقی" },
  { jalaliDate: "1404-08-04", name: "میلاد پیامبر و امام جعفر صادق" },
  { jalaliDate: "1404-09-14", name: "شهادت حضرت فاطمه زهرا" },
  { jalaliDate: "1404-10-22", name: "دهه فجر / پیروزی انقلاب اسلامی" },
  { jalaliDate: "1404-10-26", name: "مبعث" },

  // ─── 1405 Jalali (March 20, 2026 – March 19, 2027) ───────────────────────
  // Fixed solar holidays
  { jalaliDate: "1405-01-01", name: "عید نوروز" },
  { jalaliDate: "1405-01-02", name: "عید نوروز" },
  { jalaliDate: "1405-01-03", name: "عید نوروز" },
  { jalaliDate: "1405-01-04", name: "عید نوروز" },
  { jalaliDate: "1405-01-12", name: "روز جمهوری اسلامی" },
  { jalaliDate: "1405-01-13", name: "سیزده به‌در" },
  { jalaliDate: "1405-02-14", name: "رحلت امام خمینی" },
  { jalaliDate: "1405-02-15", name: "قیام ۱۵ خرداد" },
  { jalaliDate: "1405-11-22", name: "پیروزی انقلاب اسلامی" },
  { jalaliDate: "1405-12-29", name: "روز ملی شدن صنعت نفت" },

  // Lunar religious holidays 1405 — estimated from ~10-day annual regression from 1404
  // official dates; must be verified against the government's 1405 Nowruz announcement.
  // Note: Eid al-Fitr 1447 AH falls on 1405-01-01 (Nowruz) and is already covered above.
  { jalaliDate: "1405-02-24", name: "تاسوعای حسینی" },
  { jalaliDate: "1405-02-25", name: "عاشورای حسینی" },
  { jalaliDate: "1405-03-06", name: "عید قربان" },
  { jalaliDate: "1405-03-07", name: "عید قربان (تعطیل)" },
  { jalaliDate: "1405-03-14", name: "عید غدیر" },
  { jalaliDate: "1405-04-03", name: "اربعین حسینی" },
  { jalaliDate: "1405-04-12", name: "رحلت پیامبر و شهادت امام حسن" },
  { jalaliDate: "1405-04-22", name: "شهادت امام رضا" },
  { jalaliDate: "1405-06-08", name: "شهادت امام محمد تقی" },
  { jalaliDate: "1405-06-15", name: "شهادت امام علی النقی" },
  { jalaliDate: "1405-07-24", name: "میلاد پیامبر و امام جعفر صادق" },
  { jalaliDate: "1405-09-03", name: "شهادت حضرت فاطمه زهرا" },
  { jalaliDate: "1405-10-22", name: "دهه فجر / پیروزی انقلاب اسلامی" },
  { jalaliDate: "1405-10-15", name: "مبعث" },
];

const holidayJalaliDateSet: Set<string> = new Set(
  IRANIAN_BANKING_HOLIDAYS.map((h) => h.jalaliDate)
);

function toJalaliDateKey(date: Date | number): string {
  const { year, month, day } = getJalaliParts(date);
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

export function isOfficialHoliday(date: Date | number): boolean {
  return holidayJalaliDateSet.has(toJalaliDateKey(date));
}

export function isIranianWeekend(date: Date | number): boolean {
  return isTehranThursday(date) || isTehranFriday(date);
}

export function isBankingHoliday(date: Date | number): boolean {
  return isIranianWeekend(date) || isOfficialHoliday(date);
}

export function nextBankingDay(date: Date | number): Date {
  let candidate = addDaysTehran(date, 1);
  while (isBankingHoliday(candidate)) {
    candidate = addDaysTehran(candidate, 1);
  }
  return candidate;
}

export function addBankingDays(date: Date | number, days: number): Date {
  let current: Date = typeof date === "number" ? new Date(date) : date;
  let remaining = days;
  while (remaining > 0) {
    current = nextBankingDay(current);
    remaining--;
  }
  if (remaining === 0 && days === 0) {
    if (isBankingHoliday(current)) {
      current = nextBankingDay(current);
    }
  }
  return current;
}

export function settlementDueDate(paymentTimestamp: Date | number): Date {
  return nextBankingDay(paymentTimestamp);
}
