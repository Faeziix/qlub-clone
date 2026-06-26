# ADR-0024: Mobile-First Shell, Farsi Routing Fix, Category i18n, Product/Design Docs

**Status:** Accepted
**Date:** 2026-06-26
**Issue:** #36

## Context

Four gaps remained after M3–M6:

1. **Routing**: `localeDetection: true` in `src/i18n/routing.ts` caused the next-intl middleware to detect `Accept-Language: en-US` on the request and redirect `/qr/ir/<slug>` to `/en/qr/ir/<slug>`. This violated the Farsi-first mandate: any visit to the canonical QR URL should render Farsi.

2. **Category i18n**: The category chip buttons in `MenuExperience.tsx` rendered `c.name` (the database default locale name, always set in Farsi for seeded vendors) rather than `localizedName(c, lang)`. This broke the English locale view and was inconsistent with item name rendering which already used `localizedName`.

3. **Missing i18n keys in `makeT` dicts**: `MenuExperience` used `t("back")`, `t("language")`, and `t("noSearchResults")` but those keys existed only in `messages/en.json` / `messages/fa.json` (next-intl admin files), not in the `en`/`fa` dicts in `src/lib/i18n.ts`. The `makeT` fallback returned the raw key string.

4. **Desktop appearance**: The customer shell used `max-w-app` (480 px) centered on `bg-bg`. On a desktop monitor the content appeared as a narrow column on a same-color blank canvas — no visual boundary, no intentional frame.

5. **Loading states**: No `loading.tsx` existed for the vendor menu page. Force-dynamic server components showed a blank white page during the DB fetch.

6. **Product/Design docs**: `PRODUCT.md` and `DESIGN.md` were absent at the repo root, as required by the project CLAUDE.md doc-maintenance rule and issue #36.

## Decisions

### 1. Disable locale auto-detection

Set `localeDetection: false` in `src/i18n/routing.ts`.

Consequence: The middleware no longer redirects based on `Accept-Language`. Users hitting `/qr/ir/<slug>` always receive the Farsi locale. English is reached only via the explicit `/en` prefix. The language-switcher sheet inside `MenuExperience` still allows in-app locale switching (which today updates `lang` state without a full navigation; a full `/en/...` navigation would be the long-term upgrade).

### 2. Fix category chip rendering

Replace `{c.name}` with `{localizedName(c, lang)}` in the category chips section of `MenuExperience.tsx`. This is consistent with how item names and section headers are already rendered.

### 3. Add missing customer i18n keys

Add `back`, `language`, and `noSearchResults` to both the `en` and `fa` dicts in `src/lib/i18n.ts`. These were the only keys used in `MenuExperience` that were absent from the customer dict; all other used keys were present.

### 4. Desktop frame via Tailwind responsive utilities

Outer shell: `md:bg-surface-2` on the full-bleed wrapper.
Inner column: `md:shadow-float` on the `max-w-app` container.

This creates a "phone in browser" visual frame on md+ screens without any media-query JS, layout shift, or separate component. The customer UI remains purely mobile-first — the 480 px column is unchanged on mobile.

### 5. Skeleton loading state

Create `src/components/customer/_components/MenuSkeleton.tsx` with `MenuSkeleton` (for the menu browse view) and `LandingSkeleton` (for the landing screen, available for future use).

Add `src/app/[locale]/qr/[country]/[vendor]/loading.tsx` which renders `<MenuSkeleton />`. Next.js App Router will display this automatically during the server component's async data fetch.

The skeleton mirrors the header + category chips + item card structure using the `.skeleton` shimmer class from `globals.css`.

### 6. PRODUCT.md and DESIGN.md

Add `PRODUCT.md` and `DESIGN.md` at the repo root capturing users/flows and the design foundation (tokens, breakpoints, RTL rules, accessibility, component registry, money display, i18n patterns).

## Consequences

- `/qr/ir/<slug>` always renders `<html lang="fa" dir="rtl">` regardless of the browser's preferred language.
- `/en/qr/ir/<slug>` renders English/LTR as before.
- Category chips now show Farsi names in Farsi mode and English names (where translated) in English mode.
- The three missing string keys no longer fall back to the raw key string.
- Desktop view of the customer shell has a visually distinct frame, not a blank canvas.
- Loading state shows a shimmer skeleton instead of a blank page.
- Repo now has PRODUCT.md and DESIGN.md at root per the doc-maintenance rule.
