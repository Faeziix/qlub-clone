import "server-only";
import { db } from "./db";
import { bigintToNumber } from "./money";
import {
  aggregateRevenueStats,
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

/** Admin: dashboard metrics for a vendor (or all, for superadmin). */
export async function getDashboardStats(vendorId: string | null) {
  const where = vendorId ? { vendorId } : {};
  const WINDOW_DAYS = 30;
  const now = new Date();
  const { windowStart, prevWindowStart, prevWindowEnd } = buildTehranWindowBounds(
    WINDOW_DAYS,
    now
  );

  const succeededWhere = { ...where, status: "succeeded" as const };

  const [orders, currentPayments, prevPayments, reviews, items, tables] =
    await Promise.all([
      db.order.findMany({
        where: { ...where, createdAt: { gte: windowStart } },
        orderBy: { createdAt: "desc" },
      }),
      db.payment.findMany({
        where: { ...succeededWhere, createdAt: { gte: windowStart } },
        select: { orderId: true, amount: true, tipAmount: true, total: true, createdAt: true },
      }),
      db.payment.findMany({
        where: {
          ...succeededWhere,
          createdAt: { gte: prevWindowStart, lt: prevWindowEnd },
        },
        select: { orderId: true, amount: true, tipAmount: true, total: true, createdAt: true },
      }),
      db.review.findMany({ where, orderBy: { createdAt: "desc" } }),
      db.menuItem.count({ where }),
      db.diningTable.count({ where }),
    ]);

  const currentStats = aggregateRevenueStats(currentPayments);
  const prevStats = aggregateRevenueStats(prevPayments);

  const revenueDelta = computePeriodDelta(currentStats.revenueRial, prevStats.revenueRial);
  const orderCountDelta = computePeriodDelta(
    BigInt(currentStats.distinctOrderCount),
    BigInt(prevStats.distinctOrderCount)
  );

  const avgRating = reviews.length
    ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
    : 0;

  return {
    revenue: bigintToNumber(currentStats.revenueRial),
    tips: bigintToNumber(currentStats.tipsRial),
    orderCount: orders.length,
    paidCount: currentPayments.length,
    avgOrder: bigintToNumber(currentStats.avgOrderRial),
    revenueDelta,
    orderCountDelta,
    avgRating,
    reviewCount: reviews.length,
    itemCount: items,
    tableCount: tables,
    orders,
    payments: currentPayments,
    reviews,
  };
}

export async function listVendors() {
  return db.vendor.findMany({ orderBy: { createdAt: "asc" } });
}
