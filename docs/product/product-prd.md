# Product PRD — Qlub Iran (Product-First Rewrite)

> **Status:** Active · **Owner:** Product · **Last updated:** 2026-06-26
> **Supersedes (for this review):** the systems-led PRD in issue #1. That PRD leads with payments/fintech/infra. This document deliberately inverts the order: **product, UX, and design first**, then derives technical work from it.
>
> **Why this rewrite exists:** an independent synthesis of 20 critiques concluded the prior PRD over-invested in backend correctness (payments, ceiling-split math, reconciliation, BigInt money, Redis OTP, RBAC, audit, DR) and under-specified the surfaces owners and operators actually touch. The diner/menu side is genuinely good; **the admin dashboard is the weak point and is not presentation-ready.** This PRD fixes that bias.

---

## 1. Product vision & the quality bar

### 1.1 Vision

Qlub Iran lets a restaurant owner go from "I just heard about this" to "my menu is live and I'm taking orders at the table" **inside a single sitting, on a phone, in Farsi, without anyone holding their hand.** A platform operator can, at a glance, see the health of every restaurant on the platform and act on it.

### 1.2 The quality bar for THIS review

We are building a **presentation-ready MVP**. The single governing principle:

> **Product transcends everything. If the product is not good and good-looking, the backend, devops, and security do not matter for this review.**

Concretely, "presentation-ready" means a stranger can be handed a phone and:

1. **Sign up** for a new restaurant and land inside a working dashboard — no manual provisioning.
2. **Build a real menu in detail** from an empty database: categories, items, variants, modifiers, photos, prices, availability, and fa/en translations.
3. **Generate and print** QR table cards good enough to put on an actual table.
4. **Manage live orders** with clear status, alerts, and safe controls.
5. As a **super-admin**, open a platform console that shows meaningful cross-restaurant stats and offers real tools to manage restaurants.

…and at **no point** does the product show: a US dollar icon, Latin-digit money, English status labels inside Farsi text, a sidebar that never highlights the current page, a white flash on navigation, a silent failed save, or an empty screen with no way forward. Any one of those reads as "beginner app" to an Iranian viewer in the first 30 seconds.

### 1.3 What "good-looking" means here (non-negotiable)

- **Design-system-driven**, not ad hoc: shadcn/ui primitives + CVA, **design tokens only** (no hardcoded colors, spacing, or money strings). The token system already exists in `globals.css` / `DESIGN.md` — the admin must actually use it.
- **Farsi-first / RTL** on every label, number, control, and chart axis. Logical CSS properties (`ms/me`, `ps/pe`, `start/end`).
- **Toman, Persian numerals**, Jalali dates — using the formatters that already exist (`toman-formatter.ts`, `jalali.ts`, `digit-normalizer.ts`), which today sit largely unused in the admin.
- **Professional data-viz**: formatted axes, meaningful KPIs, period selectors — not a single unformatted line chart.
- **Perceived performance & safety**: skeleton loading on every route, toast feedback on every mutation, confirmation on destructive actions.

### 1.4 Current state (honest baseline)

| Surface | State | Verdict |
|---|---|---|
| Diner: landing, menu browse, item sheet, cart, RTL shell (M7) | Solid, demos well | **Keep; minor polish only** |
| Admin: visual foundation (tokens, StatCards, RevenueChart, sidebar) | Exists | Credible shell |
| Admin: **menu builder** | Can only edit items in pre-existing categories. No menu/category CRUD, no modifier editor, no image field. ~40% complete | **Blocker** |
| Admin: **owner signup / first-run** | No signup route; owners only exist via super-admin back-channel; new owner lands on all-zeros | **Blocker** |
| Admin: **super-admin console** | 2–3 raw counts + nav cards; leaks into a random tenant's data via `vendorId`-null fallback | **Blocker** |
| Admin: **Farsi/RTL/Toman correctness** | English status pills, `$` icon, Latin-digit money, broken sidebar active-state | **Blocker (credibility)** |
| Admin: QR print, loading/toast states, mobile ergonomics, data-viz depth, settings/reviews | Partial / missing | **Major** |

---

## 2. Target users & jobs-to-be-done

### 2.1 Restaurant owner / manager (primary)

A non-technical operator of a small-to-mid Iranian restaurant or café. Works mostly from a **phone**, sometimes a laptop. Reads Farsi. Has zero patience for setup friction.

**Jobs-to-be-done:**

- *When I first hear about Qlub,* I want to **sign up and try it myself** so I can decide if it's worth adopting — without a sales call.
- *When I'm setting up,* I want to **build my full menu** (the way my real menu is structured: sections, dishes, sizes, add-ons, photos, prices, what's vegetarian/spicy) so the diner-facing page actually represents my restaurant.
- *When I open the dashboard each morning,* I want to **know how I'm doing** (revenue, orders, top items, trends) in a way I trust and can read at a glance.
- *During service,* I want to **see and advance orders** quickly and safely from my phone, and be **alerted** when a new one arrives.
- *When I deploy,* I want to **generate and print QR codes** for my tables that actually scan.
- *When I brand my page,* I want to **set my logo, cover, and theme** and see what it looks like.
- *When guests review me,* I want to **read and moderate** those reviews.

### 2.2 Super-admin / platform operator (primary)

Runs the Qlub Iran platform. Onboards restaurants, monitors health, intervenes when something is wrong.

**Jobs-to-be-done:**

- *When I open the console,* I want a **platform overview** — total orders today/this week across all restaurants, platform-wide volume, growth, new signups, recent activity — so I know the platform's pulse.
- *When I manage restaurants,* I want a **searchable list with health signals** (last order, days since signup, 30-day volume, status) and the ability to **drill into any one restaurant**, suspend/reactivate it, and provision owners.
- *When I act,* I want **real tools, not placeholder counters**, and I must **never accidentally edit a random restaurant's data**.

### 2.3 Diner (secondary, already served)

Scans a QR at the table, browses the menu in Farsi, builds an order. **Already good (M7).** In scope here only for: ensuring menu-builder output renders correctly on the diner side, and that owner branding/theme choices are reflected. No diner-side redesign in this phase.

---

## 3. Core MVP user stories with acceptance criteria

> Acceptance criteria are framed around **UX quality and look-and-feel**, not just data correctness. Each story is demoable from a **clean database**. "DoD" = Definition of Done.

### Story A — Owner can sign up and test the app

**As a** prospective restaurant owner, **I want** to sign up and immediately be inside a working dashboard, **so that** I can evaluate Qlub without anyone provisioning me.

**Acceptance criteria:**

- A `/admin/signup` route exists (gated by `ALLOW_SELF_SIGNUP` env flag) collecting: restaurant name, owner name, email, password. Farsi-first, RTL, design-system inputs with associated labels.
- On submit, one transaction creates the tenant + owner and **auto-logs in**; the owner lands on their own dashboard. (Super-admin approval gate is optional and off by default for demo.)
- If self-signup is disabled, the login page shows a visible **"Request access"** affordance — never a dead end.
- The login form has **label↔input association** (`htmlFor`/`id`), visible focus states, and inline error feedback.
- **First-run experience:** when `orders === 0 && menus === 0`, the dashboard shows a **getting-started checklist card** — "Build your menu → Add tables → Print QR → Preview diner page" — each linking to the relevant section. It dismisses after the first real order.
- Zero-value stat cards and empty charts are replaced with **contextual empty states that link to the next action**, never a bare "0" or "noData".

**DoD:** A stranger creates an account and reaches a guided dashboard in under 60 seconds with no manual steps.

### Story B — Owner can build a detailed menu (THE core story)

**As an** owner, **I want** to build my full menu from scratch, **so that** the diner page represents my real restaurant.

This is the single most-cited gap. It must be **fully demonstrable from an empty DB.**

**B1. Menus**
- Create / rename / delete a **Menu** (e.g. "Main", "Breakfast", "Drinks"). "New menu" is reachable from the sidebar/menu area.
- Each action is a vendor-scoped, audited server action (same pattern as item create).

**B2. Categories**
- Per menu: **Add category**, inline **rename**, **delete** (with confirm). Categories show their item count.
- Category **reordering** (drag or up/down) — stretch within this story but specified.

**B3. Items**
- Create / edit / delete items inside a category, with fields: **name (fa + en)**, **description (fa + en)**, **price**, **image**, **availability toggle**, **dietary tags**, **calories**.
- **Price input:** `type="text"`, accepts **Persian/Arabic-Indic digits** (normalized via `digit-normalizer.ts`), shows a **"تومان" suffix** and a **live formatted preview** (`formatRialAsTomanPersian`). It must be impossible to mis-enter by 10× because Persian digits were silently rejected.
- **Image:** an `imageUrl` field with a **live `<img>` preview** (URL is enough for MVP; a file-upload stub is acceptable). It must be editable in both create and edit, not just rendered read-only.
- **Dietary tags:** multi-select (veg / vegan / spicy / halal / gluten-free), editable, rendered as badges.
- **Calories:** editable number input.

**B4. Variants**
- An item can have **variants** (e.g. size: small/medium/large) each with its own price delta, editable in the item sheet.

**B5. Modifiers**
- A **modifier-group editor** (today the UI shows "2 groups · 5 options" as a read-only dead end). Per group: **name (fa/en)**, **required toggle**, **min/max selection**. Per option: **name (fa/en)** + **price delta**.
- Full CRUD server actions for groups and options, vendor-scoped + audited. The Prisma `ModifierGroup`/`ModifierOption` models (already present, UI-unreachable) become reachable.

**B6. Empty & feedback states**
- A freshly provisioned vendor sees an **EmptyState CTA ("Create your first menu")**, never a bare `noItems` row with no path forward.
- Every mutation (create/edit/delete/toggle/inline-price) returns `{ ok, error }` and fires a **toast**. No silently swallowed errors.

**B7. Architecture**
- Decompose the ~708-line `MenuManager.tsx` monolith into route-local `_components` (`ItemRow`, `EditItemSheet`, `CreateItemSheet`, `CategorySheet`, `ModifierGroupPanel`, `Toggle`, `Field`). The monolith is itself a blocker to adding the above.

**Acceptance gate (the demo script):**
> *An owner, starting from an empty database, builds a **3-category, 10-item menu** with **photos, two variants, and at least one modifier group**, all priced in Toman with Persian digits, and previews it correctly on the diner page — without leaving the admin and without a developer.*

**DoD:** the gate above passes end-to-end; all fields editable; all states (empty/loading/success/error) present; fully RTL/Farsi.

### Story C — Owner can manage incoming orders

**As an** owner/waiter, **I want** to see and advance live orders safely from my phone, **so that** service runs smoothly.

**Acceptance criteria:**
- Order status labels are **localized Farsi** (placed/preparing/ready/served/paid/cancelled/bill-requested all map through the existing orders message bag) — never raw English enums.
- The polling hook (8s) **detects new orders** by diffing incoming IDs and fires a **toast + optional chime / Web Notification**, and flashes the filter badge. Orders are not missed under load.
- Each order row shows an **aging/urgency chip** (e.g. yellow > 10 min, red > 20 min) for triage.
- **Cancel** is a **two-step inline confirm**, visually separated from the advance button (not 8px adjacent). Native `window.confirm` is replaced with the design-system inline-confirm / shadcn `AlertDialog`.
- Order totals render in **Toman + Persian numerals** (`data-money`), order type and "+N more" are localized, `timeAgo` is localized (e.g. "۵ دقیقه پیش").
- A visually-hidden **`aria-live="polite"`** region announces new-order arrivals for assistive tech. The order-row chevron points the correct RTL direction.
- RBAC-gated transitions preserved (staff = workflow only; manager+ = all).

**DoD:** new orders are impossible to miss, cancel is impossible to mis-tap, every string is Farsi.

### Story D — Owner can generate and print QR codes

**As an** owner, **I want** print-quality QR table cards, **so that** I can physically deploy Qlub on my tables.

**Acceptance criteria:**
- Each table card has a **"Download QR"** action producing a high-resolution PNG (`/api/qr?data=<url>&size=512`, `download="table-<code>.png"`). The `/api/qr` route already supports an arbitrary `size`.
- A **"Print"** action (per-table and **"print all"**) opens a `@media print` layout rendering each QR at **≥ 400px** with the table label, venue name, and URL — a card an owner can cut out and place on a table.
- Table delete uses the design-system inline confirm (not `window.confirm`).

**DoD:** an owner produces a scannable, print-ready table card without right-click-saving a 120px thumbnail.

### Story E — Super-admin platform stats dashboard

**As a** platform operator, **I want** a real cross-restaurant console, **so that** I understand and act on platform health.

**Acceptance criteria:**
- Super-admin has its **own layout + nav** (Platform Overview, Restaurants, Staff, Audit Log) — it no longer shares the owner sidebar.
- **All `vendorId`-null first-vendor fallbacks are removed.** A super-admin session with no `vendorId` is redirected to Platform Overview and can **never** silently edit a random tenant's menu/settings/tables.
- **Platform stat cards** (reusing `StatCard`): total orders today / this week **across tenants**, platform volume, active vs suspended tenants, new tenants this month. Computed by running the dashboard-stats logic **without** a `vendorId` filter via `Promise.all`. No empty grid slots (the `sm:grid-cols-3` rendering only 2 cards is fixed).
- A **platform growth chart** (reuse `RevenueChart`) and a **recent-activity / recently-joined feed** (reuse `AuditLog` + the recent-orders pattern).
- **Restaurants table** enriched with: **last-order date**, **30-day order/volume columns**, **search**, a **status pill** for tenant state, and a **"View dashboard" drill-in** per restaurant. Built with the `Button` primitive + shadcn `DropdownMenu` (not inline-styled links + a hand-rolled popover).

**DoD:** the console answers "how is the platform doing and which restaurants need attention?" at a glance, with zero data-leak paths.

### Story F — Owner tools: settings, branding, reviews

**As an** owner, **I want** to brand my page and moderate reviews, **so that** my Qlub presence is complete.

**Acceptance criteria:**
- **Branding:** logo and cover inputs show a **live `<img>` preview** (file-upload stub acceptable). Theme presets render **48×32 brand/brand-fg swatches** with an optional live preview — branding is not a guessing game.
- Settings has a **sticky in-page section nav** for the long form.
- **Reviews:** per-review action menu — **hide / delete** (manager+), backed by an `updateReview` action; **reply** is a stretch. Reviews are no longer fully read-only.

> **Note:** any "Payout & Compliance / IBAN / eNamad" section is **deferred** (see §5). Owner tools in this phase stop at branding, settings structure, and review moderation. Do not build payout fields for this review.

**DoD:** an owner sets a recognizable brand with visual confirmation and can moderate a review.

---

## 4. Design & UX requirements — the admin redesign mandate

The admin must become a **genuinely good-looking, design-system-driven product surface**, on par with the diner side. `DESIGN.md` today documents only the customer shell; it must be **extended to cover the admin** (layout, data-viz, admin typography, plane hierarchy). These are requirements, not suggestions.

### 4.1 Design-system discipline (no hardcoded values)

- **Tokens only.** `StatusPill` must stop hardcoding raw Tailwind palette classes (`bg-blue-100/text-blue-700`, amber/purple/teal) and use token equivalents (`bg-brand-soft/text-brand`, `bg-warning/10`, `bg-success/10`, etc.).
- **Shared CVA primitives.** Replace `MenuManager`'s manual `inputClass` string with a shared `AdminInput` / shadcn `Input` (CVA). Replace inline-styled `<Link>`/`<button>` in super-admin with `Button` (`asChild` for links) and shadcn `DropdownMenu`.
- **Plane hierarchy.** The admin layout must read with depth: `bg-surface-2` page plane, `shadow-card`/`border` separating sidebar from content. Constrain wide stat grids (`max-w-5xl`) so cards don't stretch to 300px on large monitors.
- Replace the `qlub_` ASCII wordmark with a proper **SVG logomark**.

### 4.2 Farsi-first / RTL correctness (highest visibility per effort)

- **Localize everything:** `StatusPill` (translated label prop + status→Farsi map), `timeAgo` (locale param + `latinDigitsToPersian`, e.g. "۲ ساعت پیش"), order-type ("QSR"/"Dine-in"), "+N more", "min", "% live", "kcal", payment/eNamad/role enums, "Table X" → "میز X", and the filtered-empty-state status injection.
- **Chart i18n:** thread a `revenueLabel` prop into `RevenueChart` from the server page's `t()` so it works in **both** fa and en (the hardcoded "درآمد (تومان)" currently breaks `/en`). Add the key to both message bags.
- **Sidebar active-state:** fix the locale-prefix mismatch — `usePathname()` returns `/fa/admin/...` but items match bare `/admin/...`, so the current page never highlights. Use next-intl's `usePathname` or strip the locale prefix before matching.
- **RTL primitives:** the `Toggle` thumb must anchor with logical `start-0.5` and use `aria-checked`-driven logical translate (`rtl:-translate-x`) so it doesn't disappear in Farsi. The order chevron gets `rtl:rotate-180`.

### 4.3 Money & currency presentation (credibility)

- **Remove the `DollarSign` ($) icon** on the revenue StatCard — replace with `Banknote`/`Coins` or a styled ﷼/ت glyph. A dollar sign on a Toman platform is an instant "foreign reskin" tell.
- **Replace `formatMoney`** (bare Latin integers like `1500000`) with **`formatRialAsTomanPersian`** across dashboard, orders board, and chart — rendering `۱٬۵۰۰٬۰۰۰ تومان`. Add `data-money` attributes (tabular-nums).
- **Chart axes:** Y-axis `tickFormatter` runs values through the Toman formatter; X-axis labels via `formatJalaliDate` + Persian digits. No mixed scripts within one chart.

### 4.4 Professional data-viz & honest KPIs

- `RevenueChart` renders **orders alongside revenue** (dual-axis or bar overlay), with a **7/14/30-day period selector** and formatted axes.
- **Top Items** ranks by **revenue** (or a by-orders / by-revenue toggle) — not raw quantity, so a 150,000T steak isn't outranked by 5,000T bread.
- **Avg-order** card gets a **delta** (both inputs exist).
- **Prep-time metric:** the misleading `updatedAt − createdAt` (which for paid orders includes all pre-kitchen wait) is fixed — track `preparingAt`/`readyAt` and measure `readyAt − preparingAt`, **or** relabel to "order cycle time" with a tooltip. Add an in-status aging chip to order rows.
- Recent-orders widget: **"View all" link** + clickable/navigable rows.

### 4.5 Perceived performance & feedback

- **`loading.tsx`** at the admin layout and key routes, rendering an `AdminSkeleton` built on the existing `.skeleton`/shimmer CSS — no white flash on navigation.
- **Toasts:** install `sonner` (or shadcn Toast), mount `<Toaster/>` in the admin layout; every mutation returns `{ ok, error }` and toasts the result.
- New-order alert (Story C) and destructive-action confirms (Stories C/D).

### 4.6 Mobile-first ergonomics (staff use phones during service)

- Menu `ItemRow` becomes a **two-row card on mobile** (`sm:flex-row` restores desktop); enlarge the toggle (`≥ h-8 w-14`) and icon buttons (`h-11 w-11`) to clear the 44px minimum.
- Orders board: **split filter chips** (horizontal-scroll, no-wrap) from controls into two rows; bump `OrderActions` to `size="md"` on mobile.
- Dashboard recent-orders: **card list on mobile** (`hidden md:table` + `md:hidden` card stack) — no forced horizontal scroll on the primary widget.

### 4.7 Accessibility

- Label↔input association on the login form and all forms (WCAG 1.3.1).
- `aria-label` on every icon-only action button (title attributes are ignored by mobile screen readers).
- `aria-live="polite"` region on the live order board.
- Visible focus states on all interactive primitives.

### 4.8 Patterns / products to emulate

- **Linear** — calm plane hierarchy, restrained color, crisp empty states, keyboard-friendly.
- **Stripe Dashboard / Vercel** — KPI cards with deltas, formatted axis charts with period selectors, trustworthy data-viz.
- **shadcn/ui dashboard blocks** — the canonical structure for cards, tables, sheets, dropdowns we are already mandated to use.
- **Notion** — friendly, guided first-run and empty states.
- All adapted to **Farsi-first RTL + Toman/Jalali** — emulate the *structure and restraint*, not the LTR/Latin specifics.

---

## 5. Explicit non-goals for this phase (deferred)

These are **out of scope for this review** and must not be raised, specified, or built here. The backend for most already exists; it is simply **not what this review judges**.

- **Payments, IPG, gateways, ceiling-split, reconciliation, refunds, wallet/ledger.**
- **Fintech / money-movement / payout / IBAN / settlement / banking-holiday logic.**
- **Sanctions, compliance, eNamad verification flows** (an eNamad *status badge* may render as read-only data in the restaurants table, but no verification workflow).
- **Security hardening, RBAC depth, audit-log expansion, OTP/SMS** beyond what already exists.
- **Infrastructure, scale, DR/RTO/RPO, dual-track deployment.**
- **Diner-side redesign** — it's already good; only ensure menu-builder output and branding render correctly.

> If a task can't be seen on screen by an owner or operator during the demo, it does not belong in this phase.

---

## 6. Technical requirements (DERIVED from the product spec)

These exist **only** to deliver §3–§4. Ordered by the story they serve.

### 6.1 Server actions (same auth + audit + vendor-scope pattern as `createItem`)

- **Menus:** `createMenu`, `updateMenu`, `deleteMenu`.
- **Categories:** `createCategory`, `updateCategory`, `deleteCategory` (+ optional `reorderCategories`).
- **Items:** extend `createItem`/`updateItem` to accept `imageUrl`, `tags[]`, `calories`, and variant data; add `reorderItems` (stretch).
- **Modifiers:** `createModifierGroup`/`updateModifierGroup`/`deleteModifierGroup`; `createModifierOption`/`updateModifierOption`/`deleteModifierOption`.
- **Reviews:** `updateReview` (hide/delete; manager+).
- All return `{ ok, error }` so the UI can toast. All vendor-scoped; cross-tenant access is a defect.

### 6.2 Signup & onboarding

- `/admin/signup` route behind `ALLOW_SELF_SIGNUP`; on submit runs `createTenant` + `provisionOwner` in one transaction, then auto-login.
- Login page gains label associations and a "Request access" fallback link.
- Dashboard first-run checklist component, conditional on `orderCount === 0 && menus === 0`.

### 6.3 Super-admin separation

- Dedicated super-admin layout + nav; remove `db.vendor.findFirst()` first-vendor fallbacks from `menu/settings/tables` pages; redirect `vendorId`-null sessions to Platform Overview.
- Platform-stats query: reuse `getDashboardStats` logic with **no** `vendorId` filter (`Promise.all`).
- Enrich `TenantTable` query with last-order date and 30-day aggregates; add search.

### 6.4 Formatting & i18n wiring

- Route admin money through `formatRialAsTomanPersian`; chart axes through the Toman formatter + `formatJalaliDate`.
- `StatusPill` gains a translated-label prop + status→Farsi map; `timeAgo` gains a locale param + Persian digits.
- `RevenueChart` gains a `revenueLabel` prop (and an `ordersLabel`); add all missing keys to **both** `messages/fa.json` and `messages/en.json` (and to `src/lib/i18n.ts` dicts if consumed by `makeT()` components) — keep both bags structurally parallel to avoid `MISSING_MESSAGE`.
- Fix sidebar active-state via next-intl `usePathname` / locale-prefix strip.

### 6.5 Components & primitives

- Decompose `MenuManager.tsx` into route-local `_components` (§3 B7).
- Shared `AdminInput` (CVA) / shadcn `Input`; `Button` + shadcn `DropdownMenu` in super-admin; `AlertDialog` / inline-confirm primitive for destructive actions.
- `AdminSkeleton` + `loading.tsx` files; `<Toaster/>` (sonner) mounted in the admin layout.
- QR `DownloadButton` + print layout (`@media print`) reusing `/api/qr`.
- Fix `Toggle` RTL thumb; chevron `rtl:rotate-180`; `aria-live` region; `aria-label`s.

### 6.6 Data model touchpoints (no money/payment work)

- Confirm Prisma `Menu`, `Category`, `Item` (`imageUrl`, `tags`, `calories`, variants), `ModifierGroup`, `ModifierOption` support all editable fields; add migrations only where a field is missing for the editors above.
- (Optional, for honest prep-time) add `preparingAt`/`readyAt` timestamps to orders.

> **Not derived here on purpose:** anything in §5. No payment, wallet, OTP, or infra tasks are created by this PRD.

---

## 7. Prioritized, demo-oriented milestone slice

Built so each milestone **demos better than the last**. Earlier = higher leverage for the presentation.

### M-A — Unblock the core story (menu builder) · *highest priority*
Menu/category CRUD, modifier-group/option editor, item image field (URL + preview), tags + calories editing, Persian-digit Toman price input with live preview, EmptyState CTA, `MenuManager` decomposition.
**Demo win:** build a full menu from an empty DB live on stage. *(Cited by all 20 critiques.)*

### M-B — Farsi/RTL/Toman correctness sweep · *highest visibility per effort*
Localize `StatusPill`/`timeAgo`/order-type/"+N more"/payment/eNamad/role; fix chart tooltip for `/en`; fix sidebar active-state; fix RTL toggle + chevron; swap `DollarSign` and `formatMoney` → Toman formatter; format chart axes (Toman + Jalali).
**Demo win:** the admin instantly reads as a real Iranian product, not a reskin.

### M-C — Signup + first-run onboarding
`/admin/signup` behind the flag, auto-login, first-run checklist, contextual empty states.
**Demo win:** "watch me sign up a brand-new restaurant from scratch."

### M-D — Super-admin platform console
Separate layout/nav, remove vendor-null fallbacks, cross-tenant stat cards + growth chart + activity feed, enriched restaurants table with drill-in.
**Demo win:** "here's the whole platform at a glance," with no data-leak embarrassment.

### M-E — Perceived quality & safety states
`loading.tsx` skeletons, sonner toasts on every mutation, new-order alert in the polling hook, two-step cancel confirm.
**Demo win:** the admin feels finished and safe under live use.

### M-F — QR generate/print
Per-table download + print-ready `@media print` layout.
**Demo win:** "and here's the physical table card I'd print" — the first thing the audience asks about.

### M-G — Data-viz depth & mobile ergonomics
Orders-vs-revenue dual series + period selector, revenue-weighted Top Items, avg-order delta, fixed/relabeled prep-time + aging chips; mobile two-row ItemRow, split orders filter/action rows, recent-orders card list.
**Demo win:** trustworthy KPIs and a clean phone experience for service staff.

### M-H — Settings, branding & review moderation
Logo/cover live preview, theme swatches/preview, sticky section nav, review hide/delete.
**Demo win:** a fully branded restaurant presence, end to end.

### M-I — Design-system hardening (cross-cutting, fold into each milestone)
`StatusPill` tokens, shared CVA `Input`, `Button`/`DropdownMenu` primitives, layout plane hierarchy, SVG logomark. Extend `DESIGN.md` with the admin layout/data-viz/typography guidance so the discipline persists.

---

### Acceptance for "presentation-ready"

The phase is done when, from a **clean database**, a single uninterrupted demo can: **sign up → build a 3-category/10-item menu with photos, variants, and a modifier group → print a QR card → take and advance a live order with an alert → switch to the super-admin and show real platform stats** — entirely in Farsi, in Toman, with Persian numerals and Jalali dates, with loading and toast feedback throughout, and **no English label, dollar sign, dead-end empty state, or unhighlighted nav anywhere on screen.**
