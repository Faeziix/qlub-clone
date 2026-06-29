"use server";

import { requireRole } from "@/lib/rbac";
import { db } from "@/lib/db";
import { createOrderFromCart, appendItemsToOrder } from "@/lib/orders";
import { bigintToNumber } from "@/lib/money";
import { checkAdminActionLimit } from "@/lib/admin-rate-limit";
import type { CartLine } from "@/lib/types";

export interface TableRow {
  id: string;
  code: string;
  label: string;
  area: string | null;
  seats: number;
  status: string;
}

export interface OpenOrderRow {
  id: string;
  orderNumber: string;
  status: string;
  subtotal: number;
  serviceCharge: number;
  tax: number;
  total: number;
  itemCount: number;
}

export interface MenuCategoryRow {
  id: string;
  name: string;
  items: MenuItemRow[];
}

export interface MenuItemRow {
  id: string;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  available: boolean;
  tags: string[];
  modifierGroups: ModifierGroupRow[];
}

export interface ModifierGroupRow {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  required: boolean;
  options: ModifierOptionRow[];
}

export interface ModifierOptionRow {
  id: string;
  name: string;
  priceDelta: number;
  isDefault: boolean;
}

export async function getWaiterPageData(): Promise<{
  tables: TableRow[];
  menuCategories: MenuCategoryRow[];
  vendorSlug: string;
}> {
  const session = await requireRole("staff");
  if (!session.vendorId) throw new Error("No vendor assigned");

  const [tables, menus] = await Promise.all([
    db.diningTable.findMany({
      where: { vendorId: session.vendorId },
      orderBy: { code: "asc" },
      select: { id: true, code: true, label: true, area: true, seats: true, status: true },
    }),
    db.menu.findMany({
      where: { vendorId: session.vendorId, active: true },
      orderBy: { sortOrder: "asc" },
      include: {
        categories: {
          orderBy: { sortOrder: "asc" },
          include: {
            items: {
              where: { available: true, vendorId: session.vendorId },
              orderBy: { sortOrder: "asc" },
              include: {
                modifierGroups: {
                  orderBy: { sortOrder: "asc" },
                  include: {
                    options: {
                      orderBy: { sortOrder: "asc" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    }),
  ]);

  const vendor = await db.vendor.findUnique({
    where: { id: session.vendorId },
    select: { slug: true },
  });
  if (!vendor) throw new Error("Vendor not found");

  const tableRows: TableRow[] = tables.map((t) => ({
    id: t.id,
    code: t.code,
    label: t.label ?? t.code,
    area: t.area,
    seats: t.seats,
    status: t.status,
  }));

  const allCategories = menus.flatMap((m) => m.categories);
  const seenCategoryIds = new Set<string>();
  const uniqueCategories = allCategories.filter((cat) => {
    if (seenCategoryIds.has(cat.id)) return false;
    seenCategoryIds.add(cat.id);
    return true;
  });

  const menuCategories: MenuCategoryRow[] = uniqueCategories
    .filter((cat) => cat.items.length > 0)
    .map((cat) => ({
      id: cat.id,
      name: cat.name,
      items: cat.items.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        price: bigintToNumber(item.price),
        imageUrl: item.imageUrl,
        available: item.available,
        tags: item.tags as string[],
        modifierGroups: item.modifierGroups.map((group) => ({
          id: group.id,
          name: group.name,
          minSelect: group.minSelect,
          maxSelect: group.maxSelect,
          required: group.required,
          options: group.options.map((opt) => ({
            id: opt.id,
            name: opt.name,
            priceDelta: bigintToNumber(opt.priceDelta),
            isDefault: opt.isDefault,
          })),
        })),
      })),
    }));

  return { tables: tableRows, menuCategories, vendorSlug: vendor.slug };
}

export async function getOpenOrderForTable(tableId: string): Promise<OpenOrderRow | null> {
  const session = await requireRole("staff");
  if (!session.vendorId) throw new Error("No vendor assigned");

  const order = await db.order.findFirst({
    where: {
      vendorId: session.vendorId,
      tableId,
      status: { notIn: ["paid", "cancelled"] },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      subtotal: true,
      serviceCharge: true,
      tax: true,
      total: true,
      items: { select: { id: true } },
    },
  });

  if (!order) return null;

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    subtotal: bigintToNumber(order.subtotal),
    serviceCharge: bigintToNumber(order.serviceCharge),
    tax: bigintToNumber(order.tax),
    total: bigintToNumber(order.total),
    itemCount: order.items.length,
  };
}

export async function createOrAppendWaiterOrder(input: {
  tableId: string | null;
  lines: CartLine[];
}): Promise<{ orderId: string; orderNumber: string; appended: boolean }> {
  const session = await requireRole("staff");
  if (!session.vendorId) throw new Error("No vendor assigned");
  await checkAdminActionLimit(session.id);

  const vendor = await db.vendor.findUnique({
    where: { id: session.vendorId },
    select: { slug: true, active: true },
  });
  if (!vendor) throw new Error("Vendor not found");
  if (!vendor.active) throw new Error("Vendor is suspended");

  if (input.tableId) {
    const table = await db.diningTable.findUnique({
      where: { id: input.tableId },
      select: { id: true, vendorId: true, code: true },
    });
    if (!table) throw new Error("Table not found");
    if (table.vendorId !== session.vendorId) throw new Error("Table does not belong to this vendor");

    const existingOrder = await db.order.findFirst({
      where: {
        vendorId: session.vendorId,
        tableId: input.tableId,
        status: { notIn: ["paid", "cancelled"] },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, orderNumber: true },
    });

    if (existingOrder) {
      await appendItemsToOrder({
        orderId: existingOrder.id,
        vendorSlug: vendor.slug,
        lines: input.lines,
      });
      return { orderId: existingOrder.id, orderNumber: existingOrder.orderNumber, appended: true };
    }

    const { order } = await createOrderFromCart({
      vendorSlug: vendor.slug,
      tableCode: table.code,
      type: "dinein",
      lines: input.lines,
    });
    return { orderId: order.id, orderNumber: order.orderNumber, appended: false };
  }

  const { order } = await createOrderFromCart({
    vendorSlug: vendor.slug,
    type: "qsr",
    lines: input.lines,
  });
  return { orderId: order.id, orderNumber: order.orderNumber, appended: false };
}
