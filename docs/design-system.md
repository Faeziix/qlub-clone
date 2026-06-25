# Design System

Farsi-first, tokenized, RTL design system for the Qlub Iran product.

## Typography

### Font: Vazirmatn (self-hosted, OFL)

Self-hosted via `next/font/local` from `public/fonts/`. Variable font (wght 100–900).

**Source:** `@fontsource-variable/vazirmatn` npm package — woff2 files copied to `public/fonts/` at install time.

**Why self-hosted:** Google Fonts CDN may be blocked inside Iran (filternet). OFL license permits self-hosting.

**Font variables:**
- `--font-sans` — Vazirmatn variable, resolved by `next/font/local`, applied on `<html className={vazirmatn.variable}`
- `--font-display` — set to `var(--font-sans)` in `globals.css :root`, so both font families resolve to Vazirmatn

**Persian type scale (set in `globals.css` on `[dir="rtl"], :lang(fa)`):**
- `line-height: 1.85` — Persian script needs more line height than Latin
- `hyphens: none` — Persian does not use hyphenation
- `letter-spacing: 0` — Persian script does not use letter-spacing

## Color Tokens

All tokens are HSL CSS variables defined in `globals.css :root` and consumed by Tailwind.

### Surface tokens
| Token | Variable | Purpose |
|---|---|---|
| `bg` | `--bg` | Page background |
| `surface` | `--surface` | Card/sheet surface |
| `surface-2` | `--surface-2` | Muted surface, inputs |
| `ink` | `--ink` | Primary text |
| `muted` | `--muted` | Secondary text, icons |
| `line` | `--line` | Borders, dividers |

### Brand tokens (per-restaurant, overrideable)
| Token | Variable | Purpose |
|---|---|---|
| `brand` | `--brand` | Primary brand color |
| `brand-fg` | `--brand-fg` | Text on brand background |
| `brand-soft` | `--brand-soft` | Tinted brand surface |

### CTA token (distinct from danger)
| Token | Variable | Purpose |
|---|---|---|
| `cta` | `--cta` | Red call-to-action (positive in Iran) |
| `cta-fg` | `--cta-fg` | Text on CTA background |
| `cta-soft` | `--cta-soft` | Tinted CTA surface |

**Important:** `--cta` is separate from `--danger`. In Iran, red is a positive call-to-action color used by banks and payment UIs, not a warning/error signal.

### Semantic tokens
| Token | Variable | Purpose |
|---|---|---|
| `success` | `--success` | Success states |
| `danger` | `--danger` | Error, destructive actions |
| `warning` | `--warning` | Warning states |

## Theme Presets

Five named presets are defined in `globals.css` and `src/lib/design-tokens.ts`:

| Preset | Brand color | Use case |
|---|---|---|
| `darkgold` | Gold | Default |
| `classic` | Navy blue | Traditional restaurants |
| `emerald` | Green | Fresh/healthy |
| `rose` | Rose | Modern/upscale |
| `midnight` | Dark + amber | Evening/bar atmosphere |

Applied via `TenantThemeProvider` component with `theme={{ preset: "darkgold" }}`.

## Per-Restaurant Theming

`TenantThemeProvider` (`src/components/ui/TenantThemeProvider.tsx`) supports two layers:

1. **Named preset**: `theme={{ preset: "darkgold" }}` applies `.theme-darkgold` class
2. **Arbitrary brand override**: `theme={{ brandHsl: "200 60% 40%" }}` injects inline CSS vars

```tsx
<TenantThemeProvider theme={{ preset: "classic", brandHsl: "220 50% 35%" }} dir="rtl">
  {children}
</TenantThemeProvider>
```

The server sets the theme before rendering by wrapping the page in `TenantThemeProvider` at the server-component level. The `preset` class is rendered into the HTML string on first paint — no client-side DOM mutation needed.

## Primitives

### Button (`src/components/ui/Button.tsx`)

Built with CVA + Radix Slot. Type-safe variants.

| Variant | Use case |
|---|---|
| `primary` | Default brand action |
| `secondary` | Secondary action |
| `ghost` | Inline actions |
| `outline` | Bordered action |
| `danger` | Destructive/error action |
| `cta` | Red call-to-action (payment, confirm) |

| Size | Height |
|---|---|
| `sm` | 36px |
| `md` | 44px (default) |
| `lg` | 56px |
| `icon` | 40×40px square |

`asChild` prop renders the variant classes on a child element (e.g. a `<Link>`).

### Badge (`src/components/ui/Badge.tsx`)

CVA-based variants: `default`, `brand`, `success`, `danger`, `warning`, `cta`.

`DietBadge` renders diet/dietary labels in Farsi (گیاهی, وگان, حلال, etc.).

### Sheet (`src/components/ui/Sheet.tsx`)

Bottom-sheet drawer built on `@radix-ui/react-dialog`.

- **Focus trap**: keyboard focus stays inside when open
- **Esc key**: closes the sheet
- **Return-focus**: focus returns to the trigger on close
- **`aria-modal`**: correct screen-reader semantics
- **`Dialog.Title`**: required for aria-labelling; hidden visually if no title provided
- **Portal**: rendered outside DOM tree; receives `dir` prop for RTL

### MoneyText (`src/components/ui/MoneyText.tsx`)

Renders a rial `bigint` as Toman with `data-money` attribute and tabular numerals.

```tsx
<MoneyText rial={150_000n} size="lg" />
// renders: ۱۵ هزار تومان
```

### PersianDate (`src/components/ui/PersianDate.tsx`)

Renders a `Date` as Jalali string in a `<time>` element.

```tsx
<PersianDate date={new Date()} withTime />
// renders: ۶ تیر ۱۴۰۵ ۱۵:۳۰
```

### BidiWrapper (`src/components/ui/BidiWrapper.tsx`)

Explicit `dir` wrapper for mixed-direction content regions. Use when a sub-region needs a direction different from its parent.

### TenantThemeProvider (`src/components/ui/TenantThemeProvider.tsx`)

Server-driven theme wrapper. See "Per-Restaurant Theming" above.

## RTL Logical Properties

All layout uses CSS logical properties — no physical directional CSS.

| Physical (avoid) | Logical (use) |
|---|---|
| `ml-` / `mr-` | `ms-` / `me-` |
| `pl-` / `pr-` | `ps-` / `pe-` |
| `left-` / `right-` (absolute) | `start-` / `end-` |
| `text-left` / `text-right` | `text-start` / `text-end` |
| `border-l` / `border-r` | `border-s` / `border-e` |

Portal elements (Sheet, dialogs) receive an explicit `dir` prop because they render outside the `[dir]` attribute chain.

## Spacing Scale

CSS variables `--space-1` through `--space-12` defined in `:root`. Prefer Tailwind's spacing utilities which reference these indirectly.

## Z-index Scale

| Token | Value | Use |
|---|---|---|
| `--z-sticky` | 100 | Sticky headers |
| `--z-overlay` | 200 | Overlays, backdrops |
| `--z-modal` | 300 | Modals, sheets |
| `--z-toast` | 400 | Toast notifications |

## Motion Tokens

| Token | Value |
|---|---|
| `--duration-fast` | 150ms |
| `--duration-normal` | 250ms |
| `--duration-slow` | 350ms |
| `--ease-spring` | `cubic-bezier(0.32, 0.72, 0, 1)` |
| `--ease-out` | `cubic-bezier(0, 0, 0.2, 1)` |

## Conventions

- **No hardcoded color values** — always use token variables
- **No ambient glow** decorations
- **No `overflow: hidden` on sticky containers** — breaks sticky positioning
- **Logical properties only** — never physical `left`/`right` for layout
- **Price displays** — always use `tabular-nums` and `MoneyText` component
- **Dates** — always use `PersianDate` component (Jalali, Asia/Tehran)
- **Font changes** — update `public/fonts/` when upgrading `@fontsource-variable/vazirmatn`
