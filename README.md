# qlub clone — QR pay-at-table & restaurant management

A production-ready clone of [qlub.io](https://qlub.io): a contactless **scan → order → split → tip → pay** experience for diners, plus a full **restaurant management dashboard**. The customer menu is modelled on and verified against the live **Paul — UAE** venue.

## Stack

- **Next.js 16** (App Router, React 19, Server Actions, Route Handlers)
- **TypeScript** (strict) · **Tailwind CSS** (themeable design tokens)
- **Prisma** + **SQLite** (zero-config dev; swap `provider` to `postgresql` for prod)
- **Zustand** (cart) · **Recharts** (analytics) · **jose**/**bcryptjs** (admin auth)

**Runtime requirements:** Node ≥ 20, [bun](https://bun.sh) ≥ 1.0 (bun is the only package manager used in this project).

## Quick start

```bash
cp .env.example .env   # then set AUTH_SECRET (e.g. openssl rand -base64 48)
bun install
bun run setup          # prisma generate + db push + seed
bun run dev            # http://localhost:3000
```

`AUTH_SECRET` is required — the app refuses to start without it. `.env` is
gitignored and must never be committed.

## What to open

| Surface | URL | Notes |
| --- | --- | --- |
| Marketing landing | `/` | Product overview |
| **Guest app** (Paul UAE) | `/qr/ae/paul-uae` | Full scan→pay flow |
| Guest app (2nd venue) | `/qr/ae/olive-bistro` | Multi-tenant demo |
| Table-scoped entry | `/qr/ae/paul-uae?table=5&theme=darkgold` | Dine-in mode |
| **Admin dashboard** | `/admin/login` | Use a seeded staff account (see below) |

Demo staff accounts (`admin@qlub.io`, `owner@paul.ae`, `manager@paul.ae`, `owner@olive.ae`) are created only when seeding. Each is assigned a unique, cryptographically-random password printed once by `bun run db:seed` — copy it from that output to sign in. There is no shared/static password. The login page only lists these accounts when `SEED_DEMO=true` in a non-production environment.

## Customer features

- Multi-menu QR experience (Breakfast / Lunch / Desserts / Beverages / Boxes)
- Category navigation, search, item photos, dietary badges, calories
- Item modifiers (required/optional groups, min/max select, price deltas)
- Persistent cart (per-venue) with live bill breakdown (service charge + VAT)
- Place order → **split the bill** (full / evenly / by item / custom)
- **Tipping** (presets + custom) and multiple payment methods
- Post-payment **review** capture (overall + food/service/ambience)
- 8 languages incl. Arabic **RTL**, 5 selectable themes

## Restaurant management

- **Dashboard** — revenue trend, orders, avg order, tips, rating, top items
- **Orders** — live board, status workflow, order detail, payments
- **Menu** — CRUD menus/categories/items, prices, availability toggles
- **Tables & QR** — generate per-table QR codes, status, seating
- **Reviews** — rating distribution & feedback
- **Settings** — profile, branding/theme, service charge, VAT, tipping

## Architecture

```
src/
  app/
    qr/[country]/[vendor]/        # guest app (menu + pay flow)
    admin/                         # dashboard (auth-guarded layout)
    api/{orders,payments,reviews}/ # backend route handlers
  components/{customer,admin,ui}/  # feature + design-system components
  lib/                             # db, auth, pricing, i18n, queries, cart store
prisma/{schema.prisma, seed.ts}    # data model + verified Paul-UAE seed
```

Bill math (service charge, inclusive/exclusive VAT, even-split remainder
handling) lives in `src/lib/pricing.ts`; order/payment/review services in
`src/lib/orders.ts`.

## CI

Pull requests run typecheck and lint automatically. The `eslint.ignoreDuringBuilds` flag is not set — ESLint failures block the build and must be resolved. See `.github/workflows/ci.yml`.

> Payments are simulated (no real gateway) — `recordPayment` writes a succeeded
> transaction so the end-to-end flow is fully demonstrable.
