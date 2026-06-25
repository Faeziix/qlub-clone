import "server-only";
import { db } from "./db";
import { parseJSON } from "./utils";

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
    supportedLangs: parseJSON<string[]>(vendor.supportedLangs, ["en"]),
    tipPresets: parseJSON<number[]>(vendor.tipPresets, [10, 15, 20]),
  };
}

export type VendorWithMenus = NonNullable<
  Awaited<ReturnType<typeof getVendorBySlug>>
>;
export type MenuWithCategories = VendorWithMenus["menus"][number];
export type ItemWithModifiers =
  MenuWithCategories["categories"][number]["items"][number];

export async function getItem(itemId: string) {
  return db.menuItem.findUnique({
    where: { id: itemId },
    include: {
      modifierGroups: {
        orderBy: { sortOrder: "asc" },
        include: { options: { orderBy: { sortOrder: "asc" } } },
      },
    },
  });
}

export async function getOrder(orderId: string) {
  return db.order.findUnique({
    where: { id: orderId },
    include: { items: true, payments: true, table: true, vendor: true },
  });
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

  const revenue = payments.reduce((s, p) => s + p.total, 0n);
  const tips = payments.reduce((s, p) => s + p.tipAmount, 0n);
  const avgOrder = orders.length && payments.length ? revenue / BigInt(payments.length) : 0n;
  const avgRating = reviews.length
    ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
    : 0;

  return {
    revenue,
    tips,
    orderCount: orders.length,
    paidCount: payments.length,
    avgOrder,
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
