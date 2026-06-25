# ADR-0011: Persian Formatting Deep Modules

**Status:** Accepted
**Date:** 2026-06-26
**Issue:** #11 — [AFK] Persian formatting deep modules — toman, digit-normalizer, Jalali + bank holidays

## Context

The Qlub Iran product is Farsi-first and deals with real Toman amounts, Iranian phone numbers,
and Jalali dates. Several formatting concerns must be isolated in tested deep modules to prevent
silent bugs that scatter formatting logic across components. The PRD (issue #1) mandates:

- Never use `Intl style:'currency'` with `IRR` — it does not render correctly for Iranian users
- Always normalize Persian (U+06F0–U+06F9, ۰-۹) and Arabic-Indic (U+0660–U+0669, ٠-٩) digits
  to ASCII before any phone/postal/numeric validation
- All Jalali date operations must use `timeZone: 'Asia/Tehran'` consistently
- Settlement-date math must skip پنجشنبه and جمعه (Iranian banking weekend) and official holidays

## Decision

Four deep modules were created under `src/lib/`:

### 1. `toman-formatter.ts`

Owns the toman display decision:
- `formatRialAsTomanPersian(rial: bigint)` — converts rial → toman, applies هزار تومان shorthand
  for amounts ≥ 10,000 toman (100,000 rial) when the amount is an exact multiple of 1,000 toman
- `formatTomanAmountPersian(toman: bigint)` — same logic from a pre-computed toman bigint
- `latinDigitsToPersian(str)` / `persianDigitsToLatin(str)` — digit display/normalization
- `TOMAN_HEZAR_THRESHOLD_RIAL = 100_000n` — named threshold constant for the implied-thousands display

The implied-thousands convention (showing ۱۵۰ هزار تومان for 150,000 toman) is common on Iranian
menus and POS displays. The threshold is intentionally conservative (exact multiple of 1,000 toman
required) to avoid misleading rounding of non-round prices.

**Never use `Intl.NumberFormat` with `style: 'currency'` and `currency: 'IRR'`.**

### 2. `digit-normalizer.ts`

Normalizes both Persian and Arabic-Indic digit code-point families to ASCII before any validation:
- `normalizeDigits(str)` — replaces both U+06F0–U+06F9 and U+0660–U+0669 with ASCII 0-9
- `normalizePhoneForValidation(phone)` — normalizes digits + strips spaces and dashes
- `isPersianDigit(char)` / `isArabicIndicDigit(char)` — single-char helpers

Callers: OTP code comparison, phone number validation, postal code validation, any numeric input
from Iranian users who may type in Persian or Arabic-Indic digits.

### 3. `jalali.ts`

Jalali calendar formatting and arithmetic, always in Asia/Tehran:
- Uses `date-fns-jalali` for Jalali calendar arithmetic
- Uses `@date-fns/tz` `TZDate` so all date-part extraction respects Tehran's UTC+3:30/+4:30 offset
- `toTehranDate(date)` — wraps a JS Date in a TZDate for Tehran
- `getJalaliParts(date)` — returns `{ year, month, day }` in Jalali calendar
- `formatJalaliDate(date)` — `۱ فروردین ۱۴۰۴` style Persian output
- `formatJalaliDateTime(date)` — date + `HH:MM` in Tehran time, all Persian numerals
- `isTehranFriday(date)` / `isTehranThursday(date)` — day-of-week helpers
- `addDaysTehran(date, n)` — adds calendar days in Tehran frame

### 4. `banking-holidays.ts`

Iranian banking calendar for settlement-day math:
- `IRANIAN_BANKING_HOLIDAYS` — static array of `{ jalaliDate, name }` for years 1403–1405
  (Jalali YYYY-MM-DD keys). Includes all major lunar and solar holidays:
  - Fixed solar: Nowruz (4 days), Islamic Republic Day, Sizdah Be-dar, Imam Khomeini anniversary,
    15 Khordad, 22 Bahman, 29 Esfand
  - Lunar (shift ~10-11 days/year): عید فطر (2 days), عید قربان (2 days), عید غدیر, مبعث,
    تاسوعا, عاشورا, اربعین, رحلت پیامبر/شهادت امام حسن, شهادت امام رضا,
    شهادت امام محمد تقی, شهادت امام علی النقی, میلاد پیامبر/امام جعفر صادق,
    شهادت حضرت فاطمه زهرا
  - 1403 and 1404 entries are from official Iranian government calendar announcements.
  - 1405 lunar entries are estimated from the ~10-day annual regression and must be
    verified against the government's official 1405 Nowruz announcement.
- `isIranianWeekend(date)` — true for Thursday (پنجشنبه) and Friday (جمعه)
- `isOfficialHoliday(date)` — true for dates in the static calendar
- `isBankingHoliday(date)` — combined check
- `nextBankingDay(date)` — next day that is not a banking holiday
- `addBankingDays(date, n)` — add N banking days
- `settlementDueDate(paymentTimestamp)` — first banking day after payment (T+1)

## Consequences

- All Toman display goes through `toman-formatter.ts` — no inline `÷10 + "تومان"` anywhere else
- All digit normalization for validation goes through `digit-normalizer.ts`
- All Jalali date operations use `jalali.ts` which enforces `Asia/Tehran` by construction
- Settlement projection uses `banking-holidays.ts`; the exact facilitator T+N delay is the caller's concern
- The holiday calendar must be updated at each Nowruz: 1403 and 1404 lunar entries reflect
  official Iranian government announcements; 1405 lunar entries are estimated and must be
  replaced with the official 1405 release (March 2026).
- 369 unit tests cover these modules across all 14 test files.
