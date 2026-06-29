/**
 * Tests for issue #54 — Customer phone menu becomes view-only.
 *
 * Acceptance criteria verified here:
 * 1. POST /api/orders route file is removed — customers cannot create orders via HTTP.
 * 2. PATCH handler is removed from /api/orders/[orderId] — append endpoint closed.
 * 3. GET /api/orders/[orderId] (order status polling) is preserved.
 * 4. Cart / add-to-cart / quantity-stepper / place-order code removed from customer UI.
 * 5. MyOrderSheet no longer has an "add more items" affordance.
 * 6. ItemCard no longer shows the "+" add indicator.
 */

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const root = path.resolve(__dirname, "..");

function readSrc(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf-8");
}

describe("Customer order-creation API — endpoints removed", () => {
  it("POST /api/orders route file no longer exists", () => {
    const routePath = path.join(root, "src/app/api/orders/route.ts");
    expect(fs.existsSync(routePath)).toBe(false);
  });

  it("/api/orders/[orderId] route does not export PATCH", () => {
    const content = readSrc("src/app/api/orders/[orderId]/route.ts");
    expect(content).not.toMatch(/export\s+async\s+function\s+PATCH/);
  });

  it("/api/orders/[orderId] route still exports GET for status polling", () => {
    const content = readSrc("src/app/api/orders/[orderId]/route.ts");
    expect(content).toMatch(/export\s+async\s+function\s+GET/);
  });
});

describe("MenuExperience — cart and order-placement UI removed", () => {
  it("does not import useCart or CartSheet", () => {
    const content = readSrc("src/components/customer/MenuExperience.tsx");
    expect(content).not.toMatch(/useCart/);
    expect(content).not.toMatch(/CartSheet/);
  });

  it("does not manage cartOpen state or show cart FAB button", () => {
    const content = readSrc("src/components/customer/MenuExperience.tsx");
    expect(content).not.toMatch(/cartOpen/);
    expect(content).not.toMatch(/viewOrder/);
  });

  it("does not have an handleOrderPlaced callback (customers no longer place orders)", () => {
    const content = readSrc("src/components/customer/MenuExperience.tsx");
    expect(content).not.toMatch(/handleOrderPlaced/);
  });
});

describe("ItemSheet — transformed to read-only item detail", () => {
  it("does not import useCart or call addLine", () => {
    const content = readSrc("src/components/customer/ItemSheet.tsx");
    expect(content).not.toMatch(/useCart/);
    expect(content).not.toMatch(/addLine/);
  });

  it("does not render a QuantityStepper", () => {
    const content = readSrc("src/components/customer/ItemSheet.tsx");
    expect(content).not.toMatch(/QuantityStepper/);
  });

  it("does not render an Add to order button", () => {
    const content = readSrc("src/components/customer/ItemSheet.tsx");
    expect(content).not.toMatch(/addToOrder/);
    expect(content).not.toMatch(/handleAdd/);
  });

  it("does not render a notes textarea for special instructions", () => {
    const content = readSrc("src/components/customer/ItemSheet.tsx");
    expect(content).not.toMatch(/<textarea/);
  });
});

describe("ItemCard — add indicator removed", () => {
  it("does not render the brand-colored + add badge", () => {
    const content = readSrc("src/components/customer/_components/ItemCard.tsx");
    expect(content).not.toMatch(/rounded-full bg-brand text-brand-fg.*\+/s);
  });
});

describe("MyOrderSheet — Add more items removed", () => {
  it("does not render the Add more items button or accept onAddMoreItems prop", () => {
    const content = readSrc("src/components/customer/MyOrderSheet.tsx");
    expect(content).not.toMatch(/addMoreItems/);
    expect(content).not.toMatch(/onAddMoreItems/);
  });
});
