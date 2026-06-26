# DESIGN.md — Qlub Iran Design Foundation

## Design Principles

1. **Farsi-first**: every UI element reads naturally RTL from the first paint. Logical CSS properties everywhere (`ms/me`, `ps/pe`, `start/end`).
2. **Mobile-native feel**: the customer shell is sized for 375–480 px. Tap targets ≥ 44 px. Generous padding, no accidental overflow.
3. **Calm hierarchy**: brand color anchors CTAs; surface/ink/muted carry content weight. No decoration for decoration's sake.
4. **Speed perception**: skeleton shimmer shows during data fetch. Empty states use icons and copy, never blank gaps.
5. **Iran context**: red (`--cta`) is a positive, trust-building CTA color (as used by Iranian banks). Keep it separate from `--danger` (error red).

## Typography

- **Font**: Vazirmatn (OFL, self-hosted via `next/font/local`) — variable font (wght 100–900)
- **Why self-hosted**: Google Fonts CDN may be blocked inside Iran (filternet)
- **Persian line-height**: `1.85` (on `[dir="rtl"], :lang(fa)`)
- **Hyphens**: `none` for Persian text
- **Tabular numbers**: `font-variant-numeric: tabular-nums` on `[data-money]` and `.tabular-nums`
- **Letter-spacing**: `0` for Persian script

### Font variables

| CSS var | Value |
|---|---|
| `--font-sans` | Vazirmatn variable, injected via `next/font/local` |
| `--font-display` | `var(--font-sans)` |

## Color Tokens (HSL CSS Variables)

All tokens are defined in `src/app/globals.css :root` and consumed by Tailwind.

### Surface tokens
| Token | Variable | Default value | Purpose |
|---|---|---|---|
| `bg` | `--bg` | `0 0% 97%` | Page background |
| `surface` | `--surface` | `0 0% 100%` | Card / sheet surface |
| `surface-2` | `--surface-2` | `220 14% 96%` | Muted surface, inputs, desktop frame |
| `ink` | `--ink` | `222 22% 12%` | Primary text |
| `muted` | `--muted` | `220 9% 46%` | Secondary text, icons, placeholders |
| `line` | `--line` | `220 13% 91%` | Borders, dividers |

### Brand tokens (per-restaurant, overrideable via inline CSS vars)
| Token | Variable | Default | Purpose |
|---|---|---|---|
| `brand` | `--brand` | `38 52% 38%` (warm gold) | Primary brand color |
| `brand-fg` | `--brand-fg` | `40 30% 98%` | Text on brand background |
| `brand-soft` | `--brand-soft` | `40 45% 92%` | Tinted brand surface |

### CTA token — positive red (distinct from danger)
| Token | Variable | Default | Purpose |
|---|---|---|---|
| `cta` | `--cta` | `4 86% 52%` | Call-to-action buttons (red = positive in Iran) |
| `cta-fg` | `--cta-fg` | `0 0% 100%` | Text on CTA background |
| `cta-soft` | `--cta-soft` | `4 86% 95%` | Tinted CTA surface |

**Rule**: `--cta` ≠ `--danger`. Iranian banking UX uses red for primary actions. Never conflate CTA with error states.

### Semantic tokens
| Token | Variable | Default | Purpose |
|---|---|---|---|
| `success` | `--success` | `142 60% 38%` | Success, paid, confirmed |
| `danger` | `--danger` | `0 72% 51%` | Error, destructive, failed |
| `warning` | `--warning` | `35 92% 50%` | Warning, pending, hold |

## Theme Presets

Five named presets override brand tokens. Applied via `TenantThemeProvider` with `theme={{ preset }}`.

| Preset | Brand | Typical use |
|---|---|---|
| `darkgold` | Warm gold | Default |
| `classic` | Navy blue | Traditional/formal restaurants |
| `emerald` | Green | Fresh/healthy/vegetarian |
| `rose` | Rose pink | Modern/upscale/café |
| `midnight` | Dark bg + amber | Evening/bar/low-light |

## Breakpoints

| Name | Min-width | Usage |
|---|---|---|
| `sm` | 640 px | Mostly unused — design is mobile-first |
| `md` | 768 px | Desktop frame activates; desktop admin layouts |
| `lg` | 1024 px | Admin dashboard multi-column |
| `xl` | 1280 px | Wide admin tables |

### Customer shell width
The customer experience is constrained to `max-w-app` (480 px) centered on the page.
- **Mobile (< 768 px)**: full-width, no surrounding decoration
- **Desktop (≥ 768 px)**: `bg-surface-2` outer frame; center column at 480 px with `shadow-float` — intentional "phone in browser" frame

## Spacing Scale

Tailwind's default spacing scale applies. Key project values:

| Token | Value | Common use |
|---|---|---|
| `px-4` | 1 rem (16 px) | Card / section horizontal padding |
| `px-5` | 1.25 rem (20 px) | Sheet / modal horizontal padding |
| `py-3` | 0.75 rem (12 px) | Header row padding |
| `gap-3` | 0.75 rem (12 px) | Card internal gap |
| `gap-4` | 1 rem (16 px) | Grid column gap |
| `rounded-2xl` | 1.75 rem | Cards, sheets |
| `rounded-full` | 9999 px | Pills, avatars, chip buttons |

## Radius Scale

| CSS var | Value | Tailwind |
|---|---|---|
| `--radius-sm` | 0.5 rem | `rounded-sm` |
| `--radius-md` | 0.75 rem | `rounded-md` |
| `--radius-lg` | 1 rem | `rounded-lg` |
| `--radius-xl` | 1.25 rem | `rounded-xl` |
| `--radius-2xl` | 1.75 rem | `rounded-2xl` |
| `--radius-full` | 9999 px | `rounded-full` |

## Shadow Scale

| Name | Value | Use |
|---|---|---|
| `shadow-card` | `0 1px 2px …0.04, 0 1px 3px …0.06` | Item cards, thumbnails |
| `shadow-float` | `0 8px 30px …0.12` | Floating cart bar, desktop frame |
| `shadow-sheet` | `0 -8px 40px …0.16` | Bottom sheet / modal |

## Motion Tokens

| CSS var | Value | Use |
|---|---|---|
| `--duration-fast` | 150 ms | Hover, chip press |
| `--duration-normal` | 250 ms | Sheet open/close |
| `--duration-slow` | 350 ms | Page transitions |
| `--ease-spring` | `cubic-bezier(0.32, 0.72, 0, 1)` | Sheet open spring |
| `--ease-out` | `cubic-bezier(0, 0, 0.2, 1)` | Fade out |

Animations:
- `slide-up` — cart bar entrance, sheet entrance
- `slide-down` — sheet exit
- `fade-in` / `fade-out` — overlays
- `shimmer` — skeleton loading (100% translateX in 1.5 s loop)

## RTL Rules

- Use logical CSS properties in Tailwind: `ms-*`, `me-*`, `ps-*`, `pe-*`, `start-*`, `end-*`
- Never use `ml/mr/pl/pr/left/right` in customer-facing components
- `[dir="rtl"]` and `:lang(fa)` on the HTML element set text direction server-side
- No imperative `document.documentElement.setAttribute("dir", ...)` in React effects
- The `ChevronLeft` icon in the back button is direction-aware via RTL auto-mirror in SVG; use `aria-label` from the i18n dict

## Skeleton / Loading States

Loading states use the `.skeleton` CSS class from `globals.css`:
- Background: `hsl(var(--surface-2))`
- Shimmer overlay: white gradient sweeping left to right at 1.5 s
- Never use blank gaps or zero-height containers as loading placeholders

### Customer route loading

`src/app/[locale]/qr/[country]/[vendor]/loading.tsx` renders `<MenuSkeleton>` which mirrors the header + category chips + item card structure.

`<LandingSkeleton>` mirrors the hero cover + vendor card + menu grid.

## Accessibility

- Minimum contrast: `--ink` on `--surface` passes WCAG AA for body text
- Focus ring: `outline: 2px solid hsl(var(--brand)); outline-offset: 2px`
- RTL focus ring offset flows `inline-end → inline-start`
- Tap targets: minimum 44 × 44 px for all interactive elements
- Aria labels on icon-only buttons use the i18n dict (never hardcoded English)
- Empty states always include a title; icons are decorative (no aria on the SVG)

## Component Patterns

### Primitives (shadcn/ui + CVA)
- `Button` — `src/components/ui/Button.tsx` — variants: `primary`, `secondary`, `ghost`, `danger`
- `Sheet` — `src/components/ui/Sheet.tsx` — bottom sheet with spring animation
- `EmptyState` — `src/components/ui/EmptyState.tsx` — icon + title + optional description + action
- `DietBadge` — `src/components/ui/Badge.tsx` — dietary tag pills (vegetarian, vegan, spicy…)
- `MoneyText` — `src/components/ui/MoneyText.tsx` — toman display with `[data-money]` attribute
- `StarRating` — `src/components/ui/StarRating.tsx` — 1–5 star input

### Customer-specific
- `MenuExperience` — stateful shell with three internal states:
  - **Landing main**: hero + two entry points (View Menu / Pay the bill)
  - **Menu picker**: card grid for selecting among multiple menus (only when vendor has > 1 menu)
  - **Browsing**: full menu browsing with sticky header, category chips, item list
- `VenueHero` (sub-component of MenuExperience) — cover photo with gradient fallback; logo with initials fallback
- `MenuTile` (sub-component of MenuExperience) — menu picker card with image or branded gradient fallback
- `PayBillSheet` — bottom sheet for looking up an existing order by its vendor-scoped order number; navigates to `/pay?order=<id>` on success
- `ItemSheet` — item detail + modifier picker bottom sheet
- `CartSheet` — cart review + bill summary + place order
- `PaymentFlow` — bill split → tip → method → IPG redirect → confirmation
- `LanguageSheet` — locale switcher bottom sheet
- `MenuSkeleton` / `LandingSkeleton` — shimmer loading placeholders

### Landing entry points

The venue landing presents two primary CTAs below the hero section:

| CTA | Color | Action |
|---|---|---|
| مشاهده منو / View Menu | `--brand` (primary) | If 1 menu → enters browsing directly; if multiple → shows MenuPicker panel |
| پرداخت صورتحساب / Pay the bill | `--cta` (red, positive) | Opens `PayBillSheet` for order number lookup |

**Hero fallbacks (no blank boxes):**
- Cover image missing → diagonal gradient from `--brand` to `--brand-soft`
- Logo missing → rounded square with restaurant name initials on `--brand` background
- Menu tile image missing → gradient from `--brand-soft` to `--surface-2` with menu name text overlay

### RTL-aware icon usage
- `ChevronLeft` — back navigation (mirrors in RTL)
- `ShoppingBag` — cart icon
- `Search` — search field
- `Globe` — language switcher

## Money Display

- **Always Toman**, never raw Rial or Rial with `Intl.NumberFormat` currency style
- Use `toman-formatter.ts`: `formatRialAsTomanPersian`, `formatTomanAmountPersian`
- Large amounts: "هزار تومان" suffix above `TOMAN_HEZAR_THRESHOLD_RIAL`
- Prices display with `[data-money]` attribute to activate tabular-nums
- Persian numeral digits (U+06F0–U+06F9) via `latinDigitsToPersian`

## i18n Keys

Customer UI uses `makeT(locale)` from `src/lib/i18n.ts`. All string keys must exist in both `en` and `fa` dictionaries. Admin/landing pages use next-intl `useTranslations()` backed by `messages/{locale}.json`.

Key rule: `t("back")`, `t("language")`, `t("noSearchResults")` and all other component-level keys must be in the `src/lib/i18n.ts` dicts, NOT only in the `messages/*.json` files.
