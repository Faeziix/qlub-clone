# ADR-0013: Full fa+en Catalogs, Bilingual Menu Editors, and CI Key Check

**Status:** Accepted  
**Date:** 2026-06-26  
**Issue:** #13

## Context

The admin surfaces were 0% i18n — all strings were hardcoded in English.
`ItemSheet` and `PaymentFlow` had a mix: some strings translated via `makeT()`,
others still hardcoded. Menu content had no bilingual editing UI even though the
DB schema (from issue #8) already included `MenuItemTranslation`,
`CategoryTranslation`, and `ModifierGroupTranslation` tables.

There was no mechanism to catch missing translation keys in CI, and no lint
rule to prevent developers from introducing new hardcoded literals.

## Decisions

### 1. next-intl JSON catalogs

Create `messages/fa.json` and `messages/en.json` with 258 keys organized in two
top-level namespaces:

- `customer.*` — all customer-facing strings (same keys as the existing `makeT`
  dictionaries in `src/lib/i18n.ts`)
- `admin.*` — all admin dashboard strings (nav, auth, dashboard, orders, menu,
  tables, reviews, settings, common)

`src/i18n/request.ts` now loads the JSON files so next-intl can serve them to
server and client admin components.

### 2. Admin component migration

Admin server components use `getTranslations("admin.<section>")` from
`next-intl/server`. Admin client components use `useTranslations("admin.<section>")`.

The customer components continue to use `makeT(locale)` from `src/lib/i18n.ts`
(same dictionaries, compatible interface). The `src/lib/i18n.ts` dictionaries are
kept in sync with the JSON files.

### 3. Bilingual menu editors

`MenuManager` edit/create sheets now expose four bilingual fields:
- Name (Farsi) — `dir="rtl"` input
- Name (English) — `dir="ltr"` input
- Description (Farsi) — `dir="rtl"` textarea
- Description (English) — `dir="ltr"` textarea

On save, `updateItem` / `createItem` server actions call `upsertItemTranslations`
which calls `db.menuItemTranslation.upsert` for each locale that has a non-empty
name. Empty names are skipped (allowing partial bilingual authoring).

The menu page server component includes `MenuItemTranslation` in the Prisma query
and serializes translations as `{ locale, name, description }[]` onto `MenuItemNode`.

### 4. CI key completeness check

`scripts/check-i18n-keys.ts` flattens both JSON catalogs to dot-notation key maps
and asserts that:
- Every key present in `en.json` exists in `fa.json`
- Every key present in `fa.json` exists in `en.json`
- No value in `fa.json` is empty or whitespace-only

Added as `bun run check:i18n` script and as a CI step in `.github/workflows/ci.yml`
after the lint step. Exit 1 on any mismatch.

### 5. ESLint rule banning raw JSX string literals

A local plugin rule `eslint-local-rules/no-raw-jsx-strings.js` is registered as
`local/no-raw-jsx-strings` and applied to `src/**/*.tsx`. It flags:
- JSX text nodes that contain natural-language content (> 2 characters, not
  purely punctuation/numeric)
- JSX attribute values on translatable attributes (`placeholder`, `title`, `label`,
  `hint`, `alt`, `subtitle`, etc.)

Currently set to `warn` to avoid blocking on pre-existing violations. Run with
`--max-warnings 0` for hard blocking.

## Alternatives Considered

- **Keep makeT everywhere for admin too**: rejected because it requires passing
  `lang` as a prop through every component tree. next-intl's context-based approach
  is cleaner for server components.
- **Use `@formatjs/eslint-plugin-react-intl`**: not installed, and the project does
  not use react-intl. A custom inline rule is simpler and has no external dependency.

## Consequences

- 258 keys verified across both catalogs on every CI run.
- Admin surfaces render in Farsi (RTL) by default with `useTranslations`.
- Menu content is authored bilingually (fa + en) in the admin editor.
- Raw JSX string literals are flagged (warn) on every lint run.
- `makeT` / `getDict` from `src/lib/i18n.ts` remain available for customer
  components that need a synchronous, non-hook translator.
