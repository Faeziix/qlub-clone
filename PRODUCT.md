# PRODUCT.md — Qlub Iran

## Product Overview

Qlub Iran is a Farsi-first, mobile-web pay-at-table and restaurant management platform for the Iranian market.

Diners scan a QR code on their table to browse the menu, place an order, split the bill, and pay through a domestic Iranian payment gateway — no app install, no login.

Restaurant staff get a live order board with status transitions. Owners manage menus, tables, analytics, and payouts from an admin dashboard.

## Users

### Diner (Guest)
- Scans QR at the table, lands on the vendor menu at `/qr/ir/<slug>`
- Anonymous; optional phone+OTP identity for receipt/review
- Expects Farsi UI, Persian numerals, toman amounts, RTL layout
- Primarily on mobile (phone 375–428 px); occasional tablet (768 px)
- Device: mid-range Android + Safari iOS; slow 4G common

### Restaurant Staff / Waiter
- Uses the live order board on `/admin/orders`
- Advances order status (placed → preparing → ready → served → paid)
- May trigger OTP override when SMS is down

### Restaurant Owner / Manager
- Manages menus, categories, items, prices, availability in Farsi and English
- Views revenue dashboard (Jalali buckets, Asia/Tehran)
- Configures tables, QR codes, service charge, VAT, branding
- Tracks pending vs settled balances with Iranian banking-day settlement dates

### Platform Operator (Superadmin)
- Creates and suspends vendors (tenants)
- Reviews reconciliation queue and issues refunds from platform wallet
- Manages staff roles and audits

## Core User Flows

### 1. QR → Menu → Order → Pay

```
Scan QR  →  /qr/ir/<slug>  →  Browse menu (Farsi/RTL)
  →  Select items + modifiers  →  Cart  →  Place Order (server prices)
  →  Bill summary  →  Choose split / tip / method
  →  IPG redirect (domestic gateway)
  →  Callback  →  Server verify  →  Payment confirmed
  →  Optional: leave review (one per payer per bill)
```

### 2. Split-Bill Flow

Diner chooses:
- **Pay full**: single IPG charge for total
- **Split evenly**: choose number of people; each pays ceiling-split amount
- **Pay for items**: select specific line items
- **Custom amount**: enter any amount up to remaining balance

Each leg goes through the same verify → confirm cycle. Order is fully paid only when `sum(succeeded legs) >= order.total`.

### 3. Admin Order Board

Live polling (8 s interval) on `/api/admin/orders`. Staff see incoming orders and advance status. Manager+ can cancel or mark as paid.

### 4. Menu Management

Owner creates menus → categories → items with Farsi + English translations, images, dietary tags, modifier groups (required/optional, min/max choices, price deltas).

## Key Constraints

- **Farsi-first**: `/qr/ir/<slug>` always renders Farsi regardless of browser language. English only at `/en/qr/ir/<slug>`.
- **Mobile-first**: the customer shell is 375–480 px. Desktop shows the same column centered with a framed appearance.
- **No app install**: service worker or native app are out of scope.
- **Integer rial only**: all money is integer rial (BigInt). Display in toman via `toman-formatter.ts`.
- **Server-authoritative pricing**: bill computed from DB prices at order creation, never from client-supplied values.
- **Domestic infrastructure (Track B)**: production must be inside Iran (domestic Postgres, Redis, `.ir` domain, domestic CDN). Vercel + Neon are Track A (staging/marketing, synthetic data only).

## Out of Scope (v1)

- Foreign card networks (Visa/Mastercard)
- Real-time refund reversals to card
- Staff-level tip routing
- Native mobile apps
- Multi-country expansion

## Acceptance Gates

All customer routes return 200 with `<html lang="fa" dir="rtl">` on first paint for unauthenticated requests hitting `/qr/ir/<slug>` regardless of `Accept-Language`.

No hydration errors on any customer route (`/qr`, `/qr/.../pay`).
