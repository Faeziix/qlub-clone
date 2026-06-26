import "server-only";
import { db } from "./db";
import { bigintToNumber } from "./money";
import {
  computePeriodDelta,
  buildTehranWindowBounds,
} from "./dashboard-analytics";

function localesToMap<T extends { locale: string }>(
  rows: T[],
  pick: (row: T) => { name?: string | null; description?: string | null }
): Record<string, { name?: string | null; description?: string | null }> {
  const map: Record<string, { name?: string | null; description?: string | null }> = {};
  for (const row of rows) map[row.locale] = pick(row);
  return map;
}

/** Full vendor + menu tree for the customer app. */
export async function getVendorBySlug(slug: string) {
  const vendor = await db.vendor.findUnique({
    where: { slug },
    include: {
      menus: {
        where: { active: true },
        orderBy: { sortOrder: "asc" },
        include: {
          categories: {
            orderBy: { sortOrder: "asc" },
            include: {
              CategoryTranslation: true,
              items: {
                where: { available: true },
                orderBy: { sortOrder: "asc" },
                include: {
                  MenuItemTranslation: true,
                  modifierGroups: {
                    orderBy: { sortOrder: "asc" },
                    include: { options: { orderBy: { sortOrder: "asc" } } },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!vendor) return null;
  return {
    ...vendor,
    supportedLangs: Array.isArray(vendor.supportedLangs)
      ? (vendor.supportedLangs as string[])
      : ["fa", "en"],
    tipPresets: Array.isArray(vendor.tipPresets)
      ? (vendor.tipPresets as number[])
      : [5, 10, 15],
    menus: vendor.menus.map((menu) => ({
      ...menu,
      categories: menu.categories.map((cat) => {
        const { CategoryTranslation, ...catRest } = cat;
        return {
        ...catRest,
        i18n: localesToMap(CategoryTranslation, (t) => ({ name: t.name })),
        items: cat.items.map((item) => {
          const { MenuItemTranslation, ...itemRest } = item;
          return {
          ...itemRest,
          i18n: localesToMap(MenuItemTranslation, (t) => ({
            name: t.name,
            description: t.description,
          })),
          price: bigintToNumber(item.price),
          tags: Array.isArray(item.tags) ? (item.tags as string[]) : [],
          modifierGroups: item.modifierGroups.map((group) => ({
            ...group,
            options: group.options.map((opt) => ({
              ...opt,
              priceDelta: bigintToNumber(opt.priceDelta),
            })),
          })),
          };
        }),
        };
      }),
    })),
  };
}

export type VendorWithMenus = NonNullable<
  Awaited<ReturnType<typeof getVendorBySlug>>
>;
export type MenuWithCategories = VendorWithMenus["menus"][number];
export type ItemWithModifiers =
  MenuWithCategories["categories"][number]["items"][number];

export async function getItem(itemId: string) {
  const item = await db.menuItem.findUnique({
    where: { id: itemId },
    include: {
      modifierGroups: {
        orderBy: { sortOrder: "asc" },
        include: { options: { orderBy: { sortOrder: "asc" } } },
      },
    },
  });
  if (!item) return null;
  return {
    ...item,
    price: bigintToNumber(item.price),
    tags: item.tags as string,
    modifierGroups: item.modifierGroups.map((group) => ({
      ...group,
      options: group.options.map((opt) => ({
        ...opt,
        priceDelta: bigintToNumber(opt.priceDelta),
      })),
    })),
  };
}

export async function getOrder(orderId: string) {
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { items: true, payments: true, table: true, vendor: true },
  });
  if (!order) return null;
  return {
    ...order,
    subtotal: bigintToNumber(order.subtotal),
    serviceCharge: bigintToNumber(order.serviceCharge),
    tax: bigintToNumber(order.tax),
    discount: bigintToNumber(order.discount),
    tipAmount: bigintToNumber(order.tipAmount),
    total: bigintToNumber(order.total),
    amountPaid: bigintToNumber(order.amountPaid),
    items: order.items.map((item) => ({
      ...item,
      unitPrice: bigintToNumber(item.unitPrice),
      lineTotal: bigintToNumber(item.lineTotal),
      modifiers: Array.isArray(item.modifiers) ? item.modifiers : [],
    })),
    payments: order.payments.map((payment) => ({
      ...payment,
      amount: bigintToNumber(payment.amount),
      tipAmount: bigintToNumber(payment.tipAmount),
      total: bigintToNumber(payment.total),
    })),
    vendor: {
      ...order.vendor,
      supportedLangs: Array.isArray(order.vendor.supportedLangs)
        ? (order.vendor.supportedLangs as string[])
        : ["fa", "en"],
      tipPresets: Array.isArray(order.vendor.tipPresets)
        ? (order.vendor.tipPresets as number[])
        : [5, 10, 15],
    },
  };
}

/**
 * Aggregates revenue, tips, and distinct-order count for a set of succeeded
 * payments entirely in the database via Prisma aggregate + groupBy. No JS loop
 * touches the monetary sums; the database engine does the arithmetic.
 *
 * Returns plain bigint values so callers can use money.ts helpers on them.
 */
async function sqlAggregatePayments(
  vendorFilter: { vendorId?: string },
  from: Date,
  to: Date
): Promise<{ revenueRial: bigint; tipsRial: bigint; distinctOrderCount: number }> {
  const where = {
    ...vendorFilter,
    status: "succeeded" as const,
    createdAt: { gte: from, lt: to },
  };

  const [sums, distinctOrders] = await Promise.all([
    db.payment.aggregate({
      where,
      _sum: { amount: true, tipAmount: true },
    }),
    db.payment.groupBy({
      by: ["orderId"],
      where,
    }),
  ]);

  const revenueRial = sums._sum.amount ?? 0n;
  const tipsRial = sums._sum.tipAmount ?? 0n;
  const distinctOrderCount = distinctOrders.length;

  return { revenueRial, tipsRial, distinctOrderCount };
}

/** Admin: dashboard metrics for a vendor (or all, for superadmin). */
export async function getDashboardStats(vendorId: string | null) {
  const vendorFilter = vendorId ? { vendorId } : {};
  const STATS_WINDOW_DAYS = 30;
  const CHART_WINDOW_DAYS = 14;
  const now = new Date();
  const { windowStart, prevWindowStart, prevWindowEnd } = buildTehranWindowBounds(
    STATS_WINDOW_DAYS,
    now
  );
  const chartWindowStart = buildTehranWindowBounds(CHART_WINDOW_DAYS, now).windowStart;

  const [
    orders,
    currentAgg,
    prevAgg,
    chartPayments,
    reviews,
    items,
    tables,
  ] = await Promise.all([
    db.order.findMany({
      where: { ...vendorFilter, createdAt: { gte: windowStart } },
      orderBy: { createdAt: "desc" },
    }),
    sqlAggregatePayments(vendorFilter, windowStart, now),
    sqlAggregatePayments(vendorFilter, prevWindowStart, prevWindowEnd),
    db.payment.findMany({
      where: {
        ...vendorFilter,
        status: "succeeded",
        createdAt: { gte: chartWindowStart },
      },
      select: { orderId: true, amount: true, tipAmount: true, total: true, createdAt: true },
    }),
    db.review.findMany({ where: vendorFilter, orderBy: { createdAt: "desc" } }),
    db.menuItem.count({ where: vendorFilter }),
    db.diningTable.count({ where: vendorFilter }),
  ]);

  const avgOrderRial =
    currentAgg.distinctOrderCount > 0
      ? currentAgg.revenueRial / BigInt(currentAgg.distinctOrderCount)
      : 0n;

  const revenueDelta = computePeriodDelta(currentAgg.revenueRial, prevAgg.revenueRial);
  const orderCountDelta = computePeriodDelta(
    BigInt(currentAgg.distinctOrderCount),
    BigInt(prevAgg.distinctOrderCount)
  );

  const avgRating = reviews.length
    ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
    : 0;

  return {
    revenue: bigintToNumber(currentAgg.revenueRial),
    tips: bigintToNumber(currentAgg.tipsRial),
    orderCount: orders.length,
    paidCount: currentAgg.distinctOrderCount,
    avgOrder: bigintToNumber(avgOrderRial),
    revenueDelta,
    orderCountDelta,
    avgRating,
    reviewCount: reviews.length,
    itemCount: items,
    tableCount: tables,
    orders,
    payments: chartPayments,
    reviews,
  };
}

export async function listVendors() {
  return db.vendor.findMany({ orderBy: { createdAt: "asc" } });
}
