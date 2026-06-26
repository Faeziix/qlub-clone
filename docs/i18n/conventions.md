# i18n Conventions

## Locales

Only `fa` (Persian/Farsi) and `en` (English) are supported. All other locales have been removed.
Default locale is `fa` (RTL). See ADR-0010.

## Translation Catalogs (Issue #13)

All user-facing strings (customer + admin) are stored in `messages/fa.json` and `messages/en.json`.
The catalogs use a nested structure with two top-level namespaces:

- `customer.*` — customer-facing strings used via `makeT()` in `src/lib/i18n.ts`
- `admin.*` — admin dashboard strings used via `useTranslations()` (client) / `getTranslations()` (server) from next-intl

### Admin usage
- Server components: `const t = await getTranslations("admin.<section>")`
- Client components: `const t = useTranslations("admin.<section>")`

### Customer usage
- `makeT(locale)` from `src/lib/i18n.ts` returns a synchronous translator backed by the same dictionaries
- No hardcoded strings in JSX — use `t("key")` always

## Menu Content Bilingual Editing

Menu items, categories, and modifier groups store translations in dedicated DB tables:
- `MenuItemTranslation { menuItemId, locale, name, description }`
- `CategoryTranslation { categoryId, locale, name }`
- `ModifierGroupTranslation { modifierGroupId, locale, name }`

The admin menu editor (`MenuManager`) exposes fa + en name/description fields for every item.
Actions in `src/app/[locale]/admin/menu/actions.ts` upsert `MenuItemTranslation` records
alongside the canonical `MenuItem` row.

The customer-facing query resolves the translation for the active locale and falls back to the
canonical `MenuItem.name`/`description` if no translation exists.

## CI Gates (Issue #13)

### Key completeness check
`bun run check:i18n` (or `scripts/check-i18n-keys.ts`) verifies every key in `en.json` exists
in `fa.json` with a non-empty value. Runs in CI (`typecheck-and-lint` job). Exit 1 on failure.

### Raw JSX string ban (lint)
The local ESLint rule `local/no-raw-jsx-strings` (in `eslint-local-rules/no-raw-jsx-strings.js`)
flags natural-language string literals appearing directly in JSX nodes or translatable attributes
(`placeholder`, `title`, `label`, etc.). Currently set to `warn`; treat as error by running
`bun run lint -- --max-warnings 0` once the codebase is fully clean.

## Text Direction

- Farsi (`fa`): RTL. `<html dir="rtl" lang="fa">` set server-side in `[locale]/layout.tsx`.
- English (`en`): LTR. `<html dir="ltr" lang="en">`.
- Never mutate `document.documentElement.dir` imperatively (causes hydration flash).
- Use logical CSS properties everywhere: `ms/me`, `ps/pe`, `start/end` (not `left/right`).

## Persian Numerals

All user-facing numbers in Persian locale use Persian numerals (۰-۹).

- Display: `latinDigitsToPersian()` from `src/lib/toman-formatter.ts`
- Input normalization (before validation): `normalizeDigits()` from `src/lib/digit-normalizer.ts`
- Both Persian (U+06F0–U+06F9) and Arabic-Indic (U+0660–U+0669) code-point families are normalized

## Money Formatting

- Canonical storage: integer rial in BigInt. See `src/lib/money.ts` and ADR-0002.
- Display: `formatRialAsTomanPersian()` from `src/lib/toman-formatter.ts`
  - Below 10,000 toman: `۵۰۰۰ تومان`
  - At or above 10,000 toman (exact thousands): `۱۵۰ هزار تومان`
- **Never use `Intl.NumberFormat` with `style: 'currency'` and `currency: 'IRR'`.**

## Jalali Dates

- All Jalali date operations use `src/lib/jalali.ts`
- All operations are performed in `Asia/Tehran` timezone via `@date-fns/tz` TZDate
- Month names are Farsi: فروردین, اردیبهشت, خرداد, تیر, مرداد, شهریور, مهر, آبان, آذر, دی, بهمن, اسفند
- Format: `۱ فروردین ۱۴۰۴` (day monthName year)

## Phone Number Normalization

1. `normalizeDigits()` — convert Persian/Arabic-Indic digits to ASCII
2. Strip spaces and dashes with `normalizePhoneForValidation()`
3. Validate with `libphonenumber-js` for E.164 (`+989XXXXXXXXX`)

Iranian mobile numbers: 09XXXXXXXXX (11 digits) or +989XXXXXXXXX (E.164)

## Banking Holidays

Settlement date math uses `src/lib/banking-holidays.ts`.
Iranian banking weekend: Thursday (پنجشنبه) and Friday (جمعه).
See `docs/i18n/banking-holiday-calendar.md` for the full holiday list and maintenance guide.

## Typography

- Font: Vazirmatn (OFL-licensed, self-hosted). See ADR-0005.
- Line height: ~1.85 for Persian text
- `hyphens: none` for Persian
- `font-variant-numeric: tabular-nums` on price displays
- Never use proprietary IRANSans or IRANYekan fonts.
