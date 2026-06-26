# ADR-0025: Item Detail Sheet Redesign — Modifiers / Quantity / Instructions UX

**Status:** Accepted
**Date:** 2026-06-26
**Issue:** #39

## Context

The existing `ItemSheet` component provided functional modifier selection, quantity control, and special-instructions input, but had several UX and accessibility gaps that became critical once real-money ordering was in scope:

1. **Header gap**: The component used the generic `Sheet` wrapper, whose header (drag handle + close button) created a visible white gap above the item hero image. A `-mt-2` hack partially compensated but still looked unpolished.

2. **Touch targets**: Modifier option buttons had `py-3` height but no explicit `min-height`, falling below the 44 px minimum for mobile touch targets. The `QuantityStepper` buttons (`h-9 w-9` = 36 px) were also below the threshold.

3. **Missing RTL hierarchy**: The modifier group header area placed the required/optional badge in-flow after the name with no visual separation. In RTL the layout was correct but visually noisy.

4. **No character limit on instructions**: Free-text notes were unbounded, which could produce very long strings stored in `OrderItem.notes`.

5. **CTA layout**: The "Add to order" footer button showed `addToOrder · price` as a single string, making the price feel like an afterthought rather than a live total.

6. **Image fallback**: Items without images showed a blank `bg-surface-2` block with no affordance — looks broken.

## Decisions

### 1. Bypass the generic `Sheet` wrapper; use Radix Dialog directly

`ItemSheet` now constructs its own `Dialog.Root/Portal/Overlay/Content` so the hero image spans the full top edge of the sheet. The accessible `Dialog.Title` and `Dialog.Description` are provided via `VisuallyHidden` — both remain in the DOM for screen readers while the visual hero image shows above.

The floating close button (`h-11 w-11` = 44 px) is positioned `absolute end-4 top-4 z-10` on the dialog content, overlaying the hero image. A white drag handle sits above it via another `absolute` element.

### 2. 44 px touch targets throughout

- Modifier option rows: `min-h-[52px]` — 52 px tall, comfortably above 44 px.
- `QuantityStepper` gains a `size="lg"` variant with `h-11 w-11` (44 px) buttons.
- The close button in the ItemSheet is `h-11 w-11` (44 px).
- The "Add to order" CTA button retains `size="lg"` (56 px = `h-14`).

### 3. `QuantityStepper` size variants

`size` extended from `"sm" | "md"` to `"sm" | "md" | "lg"`:
| Size | Button | Icon | Use case |
|------|--------|------|----------|
| `sm` | `h-7 w-7` (28 px) | 14 px | Cart sidebar line items |
| `md` | `h-9 w-9` (36 px) | 16 px | Compact contexts |
| `lg` | `h-11 w-11` (44 px) | 18 px | Item sheet footer |

### 4. Character limit on special instructions

`INSTRUCTIONS_MAX = 160` chars (same ceiling as an SMS segment, reasonable for kitchen notes). A live `charsLeft` counter renders end-aligned above the textarea, turning `text-warning` when fewer than 20 characters remain.

### 5. "Add to order" footer split into label + price

```tsx
<span>{t("addToOrder")}</span>
<span className="tabular-nums opacity-90">{displayPrice(lineTotal, lang)}</span>
```

`justify-between` on the button separates these visually. The price is always the server-authoritative computed total (`unitWithMods × qty`), never trusted from the client.

### 6. Hero image fallback with icon

Items without `imageUrl` now show a `ChefHat` icon centered on a branded gradient, replacing the featureless blank block.

### 7. Modifier visual redesign

- Each group shows its `name` + helper text (`chooseOne` / `chooseUpTo N`) plus a required/optional pill.
- Radio groups (single-select) use a circle indicator; checkbox groups use a rounded-square indicator.
- `modifierOptionVariants` CVA handles the `border-brand bg-brand-soft` ↔ `border-line bg-surface` state transitions.

### 8. New i18n keys in customer dict

| Key | English | Farsi |
|-----|---------|-------|
| `close` | Close | بستن |
| `chooseOne` | Choose 1 | یکی انتخاب کنید |

## Consequences

- `ItemSheet` no longer uses `Sheet` from `@/components/ui/Sheet` — it builds its own Dialog layout for full image-bleed control. The `Sheet` component remains unchanged for `CartSheet`, `LanguageSheet`, and `PayBillSheet`.
- All modifier option buttons meet the 44 px mobile touch target requirement (52 px).
- All footer controls meet the 44 px requirement (close = 44 px, stepper = 44 px, CTA = 56 px).
- Notes are capped at 160 chars server-side validation should also be enforced at the order creation layer (existing zod schema).
- The `chooseExactly` key for `minSelect === maxSelect` groups is rendered using the existing `chooseUpTo` key for now; a dedicated key can be added if product decides to differentiate.
