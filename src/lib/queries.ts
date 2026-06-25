import "server-only";
import { db } from "./db";
import { bigintToNumber } from "./money";

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
              items: {
                where: { available: true },
                orderBy: { sortOrder: "asc" },
                include: {
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
      categories: menu.categories.map((cat) => ({
        ...cat,
        items: cat.items.map((item) => ({
          ...item,
          price: bigintToNumber(item.price),
          tags: Array.isArray(item.tags) ? (item.tags as string[]) : [],
          modifierGroups: item.modifierGroups.map((group) => ({
            ...group,
            options: group.options.map((opt) => ({
              ...opt,
              priceDelta: bigintToNumber(opt.priceDelta),
            })),
          })),
        })),
      })),
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
  const since = new Date(Date.now() - 30 * 86400000);

  const [orders, payments, reviews, items, tables] = await Promise.all([
    db.order.findMany({
      where: { ...where, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
    }),
    db.payment.findMany({
      where: { ...where, status: "succeeded", createdAt: { gte: since } },
    }),
    db.review.findMany({ where, orderBy: { createdAt: "desc" } }),
    db.menuItem.count({ where }),
    db.diningTable.count({ where }),
  ]);

  const revenueRial = payments.reduce((s, p) => s + p.total, 0n);
  const tipsRial = payments.reduce((s, p) => s + p.tipAmount, 0n);
  const avgOrderRial =
    payments.length > 0 ? revenueRial / BigInt(payments.length) : 0n;
  const avgRating = reviews.length
    ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
    : 0;

  return {
    revenue: bigintToNumber(revenueRial),
    tips: bigintToNumber(tipsRial),
    orderCount: orders.length,
    paidCount: payments.length,
    avgOrder: bigintToNumber(avgOrderRial),
    avgRating,
    reviewCount: reviews.length,
    itemCount: items,
    tableCount: tables,
    orders,
    payments,
    reviews,
  };
}

export async function listVendors() {
  return db.vendor.findMany({ orderBy: { createdAt: "asc" } });
}
