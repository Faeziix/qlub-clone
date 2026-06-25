# ADR-0010: next-intl Farsi-First RTL Foundation

**Status:** Accepted  
**Date:** 2026-06-26  
**Issue:** #10

## Context

The original codebase had eight locale constants (`en`, `ar`, `fr`, `es`, `tr`, `pt`, `ru`, `zh`) but only English and Arabic dictionaries. Six locales silently fell back to English. There was no Farsi locale at all, despite Persian being the target language for the Iran market.

The root `<html>` element was hardcoded `lang="en"` in the root layout, causing every first paint to render as English/LTR regardless of the user's language. Two client components (`MenuExperience`, `PaymentFlow`) used imperative `document.documentElement.setAttribute("dir", ...)` in `useEffect` to switch direction after hydration, causing a visible LTR flash on every Farsi page load.

There was no routing-level locale infrastructure — no middleware, no locale path segment, no cookie/Accept-Language negotiation.

## Decision

1. **Install next-intl** and adopt its App Router locale-segment pattern with `localePrefix: 'as-needed'`.

2. **Reduce locales to two**: `fa` (default, RTL) and `en` (LTR). Remove all 6 dead demo locales. Remove the Arabic dictionary (was a GCC-era remnant; no Arabic-speaking market is being targeted).

3. **Restructure `app/` under `[locale]`** so Next.js passes the resolved locale to every server component via params. The `[locale]/layout.tsx` sets `<html lang dir>` server-side from the resolved locale on every request — eliminating the LTR flash.

4. **Remove imperative `document.documentElement.setAttribute("dir", ...)`** from `MenuExperience` and `PaymentFlow`. Theme class management (`.theme-*`) stays in `useEffect` because it is a client-side concern.

5. **Create `src/i18n/routing.ts`** as the single source of truth for supported locales and the default. Export `dirForLocale` from there.

6. **Create `src/middleware.ts`** using `createMiddleware(routing)` to handle locale detection from cookie and `Accept-Language` header, and redirect/rewrite accordingly.

7. **Switch font from Inter to Vazirmatn** (OFL, available via `next/font/google`, supports Farsi script) per ADR-0005 direction (avoid proprietary IRANSans/IRANYekan).

8. **API routes** (`/api/*`) remain outside the `[locale]` segment — the middleware matcher already excludes them.

## Locale URL shape

With `localePrefix: 'as-needed'`:
- `/` → Farsi (default, no prefix)
- `/qr/ir/venue-slug` → Farsi menu
- `/admin` → Farsi admin
- `/en/qr/ir/venue-slug` → English menu
- `/en/admin` → English admin

## Consequences

- **First paint is always `<html lang="fa" dir="rtl">`** for Farsi requests — no FOUC.
- **Zero LTR flash** — direction is part of the initial HTML, not a JS patch.
- **Client-side language switching** still updates the UI via the existing `lang` state in `MenuExperience`, but a full locale change should navigate to the `/en/*` URL prefix for the `dir` to update on `<html>`. In-component `dir` props on wrapper divs remain valid for the transition period.
- **All existing path-based tests** updated to reference `src/app/[locale]/admin/...`.
- **17 new tests** cover locale config, dirFor, makeT fallback chain, and dictionary completeness.
