# ADR-0012: Design System — Vazirmatn Self-Hosted, CVA + Radix Primitives, RTL Logical Properties, Hybrid Theming

**Status:** Accepted  
**Date:** 2026-06-26  
**Issue:** #12

## Context

The Iran-facing product requires a Farsi-first design system that:
- Renders correctly at first paint in RTL without JavaScript
- Uses an open-source Farsi font (OFL license — no proprietary IRANSans/IRANYekan)
- Provides accessible, keyboard-navigable interactive primitives
- Supports per-restaurant brand theming driven by server-set CSS variables
- Keeps a brand-red CTA token distinct from semantic danger (red is positive/brand in Iran)

The existing codebase had:
- `next/font/google` loading Vazirmatn from Google Fonts CDN (not self-hosted, not Iran-reachable)
- Custom Button/Badge/Sheet components without CVA or Radix
- Physical CSS properties (`ml-`, `mr-`, `pl-`, `pr-`, `left-`, `right-`) that break RTL layouts
- No CTA token — only a `--brand` token shared between primary actions and the brand identity
- No formal theme preset registry

## Decisions

### 1. Vazirmatn: self-hosted via `next/font/local` (fontsource-variable)

**Rationale:** Google Fonts CDN may be unreliable or blocked inside Iran (filternet). The fontsource-variable npm package (`@fontsource-variable/vazirmatn`) ships woff2 files with OFL license that can be copied to `public/fonts/` and served via `next/font/local`. Variable font format (wght 100–900) replaces the fixed-weight subset.

The woff2 files are copied from `node_modules/@fontsource-variable/vazirmatn/files/` to `public/fonts/` as a build-time artifact, keeping them version-locked to the package. Two files are used:
- `vazirmatn-arabic-wght-normal.woff2` — covers Persian/Arabic script (U+0600–U+06FF)
- `vazirmatn-latin-wght-normal.woff2` — covers ASCII/Latin fallback

`next/font/local` is configured with `variable: "--font-sans"` and `display: "swap"`, and applied as `className={vazirmatn.variable}` on `<html>`. In `globals.css :root`, `--font-display` is set to `var(--font-sans)`, ensuring both `font-sans` and `font-display` Tailwind utilities resolve to Vazirmatn.

### 2. CVA (class-variance-authority) + Radix UI for primitives

Button and Badge are re-implemented using CVA, giving type-safe variant APIs that replace the hand-rolled `Record<Variant, string>` pattern. Benefits:
- Type inference on variant props at the call site
- Centralized variant logic that is easy to extend
- Consistent `cn` composition with callerClassNames

Sheet is re-implemented on top of `@radix-ui/react-dialog`, gaining:
- **Focus trap**: keyboard focus stays within the dialog when open
- **Esc to close**: handled natively by Radix
- **Return-focus**: Radix restores focus to the trigger on close
- **`aria-modal` and role**: `dialog` role and `aria-labelledby` wired via `Dialog.Title`
- **Portal**: rendered outside the DOM tree to avoid z-index/stacking-context conflicts; receives `dir` prop to ensure RTL text inside portals

`@radix-ui/react-slot` is included for the Button `asChild` pattern (links styled as buttons, etc.).

### 3. Logical properties throughout

All physical directional CSS is replaced with logical equivalents:
- `ml-` / `mr-` → `ms-` / `me-`
- `pl-` / `pr-` → `ps-` / `pe-`
- `left-` / `right-` (for anchored/absolute positioning) → `start-` / `end-`
- `text-left` / `text-right` → `text-start` / `text-end`
- `border-r` / `border-l` (for sidebars) → `border-e` / `border-s`

Tailwind v3 supports logical property utilities natively. This ensures the RTL layout is correct without direction-specific overrides.

Portal elements (Sheet/Dialog) receive an explicit `dir` prop so that RTL text rendering is correct inside the portal, which exists outside the `[dir]` attribute chain of the main document.

### 4. Brand-red CTA token distinct from `--danger`

A new `--cta` CSS variable (HSL) is introduced alongside `--brand`. In Iran, red is a positive call-to-action color (used by banks, payment UIs), not a warning or error signal. The existing `--danger` token is reserved for error states.

Token mapping in `globals.css`:
```css
--cta: 4 86% 52%;     /* red CTA — positive in Iran */
--cta-fg: 0 0% 100%;
--cta-soft: 4 86% 95%;

--danger: 0 72% 51%;  /* semantic error — kept separate */
```

In Tailwind config, `cta` is a sibling color to `brand` and `danger`:
```ts
cta: {
  DEFAULT: "hsl(var(--cta))",
  fg: "hsl(var(--cta-fg))",
  soft: "hsl(var(--cta-soft))",
}
```

The Button `cta` variant uses `bg-cta text-cta-fg`, distinct from `bg-danger text-white`.

### 5. Hybrid theming via `TenantThemeProvider` and `design-tokens.ts`

Per-restaurant theming works at two levels:
1. **Named presets** (5): `darkgold`, `classic`, `emerald`, `rose`, `midnight` — CSS classes applied via `TenantThemeProvider`
2. **Arbitrary brand overrides**: HSL values for `--brand`, `--brand-fg`, `--brand-soft` injected as inline CSS vars on the tenant wrapper, overriding the preset values

The preset list and the `buildTenantInlineVars` function live in `src/lib/design-tokens.ts` (a non-JSX module) so they are testable in the node vitest environment without JSX parsing.

The direction (`dir`) is server-set on `<html dir>` via `next-intl`. The theme preset is server-set by wrapping the vendor page (`qr/.../page.tsx`) and pay page (`qr/.../pay/page.tsx`) in `<TenantThemeProvider>` at the server-component level, rendering the `data-tenant-theme` attribute and preset class in the initial HTML. The client components `MenuExperience` and `PaymentFlow` no longer carry an `initialTheme` prop or `useEffect` DOM mutations.

### 6. Persian type scale

In `globals.css`:
- `[dir="rtl"], :lang(fa)`: `line-height: 1.85`, `hyphens: none`, `letter-spacing: 0`
- Price/number elements use `font-variant-numeric: tabular-nums` via `[data-money]` selector and the `.tabular-nums` utility class
- `lineHeight: { persian: "1.85", heading: "1.45" }` added to Tailwind for semantic use

### 7. New primitive components

| Component | File | Purpose |
|---|---|---|
| `MoneyText` | `src/components/ui/MoneyText.tsx` | Renders a rial bigint as toman/هزار-تومان with `data-money` attr, dir=rtl, tabular-nums |
| `PersianDate` | `src/components/ui/PersianDate.tsx` | Renders a Date as Jalali string in a `<time>` element with correct `dateTime` ISO attribute |
| `BidiWrapper` | `src/components/ui/BidiWrapper.tsx` | Explicit `dir` wrapper for mixed-direction content regions |
| `TenantThemeProvider` | `src/components/ui/TenantThemeProvider.tsx` | Server-driven theme preset + inline CSS var injection |

## Consequences

- No proprietary font shipped; Vazirmatn OFL is self-hosted and Iran-reachable.
- All interactive primitives (Sheet) have focus trap, Esc, return-focus, and correct aria attributes.
- Layout is RTL-correct by default without direction-specific overrides.
- Payment CTAs use `--cta` (red/positive) not `--danger` (error/warning), matching Iranian UX conventions.
- Per-restaurant theming is server-driven: `TenantThemeProvider` is rendered on the server at the page level, setting `data-tenant-theme` and the preset class in the initial HTML without client-side DOM mutation.
- `@fontsource-variable/vazirmatn` must be kept as a devDependency and the woff2 files re-copied on update.
- `@radix-ui/react-dialog` and `class-variance-authority` are production dependencies.
