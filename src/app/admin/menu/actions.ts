"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/app/admin/actions";
import { round2 } from "@/lib/utils";

/** Ensure the current session is allowed to mutate the given vendor's data. */
async function assertVendorAccess(vendorId: string) {
  const session = await requireSession();
  // superadmin (vendorId null) may touch any vendor.
  if (session.vendorId && session.vendorId !== vendorId) {
    throw new Error("Forbidden: item belongs to another vendor.");
  }
}

export async function toggleItemAvailability(itemId: string, available: boolean) {
  const item = await db.menuItem.findUnique({
    where: { id: itemId },
    select: { vendorId: true },
  });
  if (!item) throw new Error("Item not found.");
  await assertVendorAccess(item.vendorId);

  await db.menuItem.update({
    where: { id: itemId },
    data: { available },
  });
  revalidatePath("/admin/menu");
}

export async function updateItemPrice(itemId: string, price: number) {
  const item = await db.menuItem.findUnique({
    where: { id: itemId },
    select: { vendorId: true },
  });
  if (!item) throw new Error("Item not found.");
  await assertVendorAccess(item.vendorId);

  const safePrice = Number.isFinite(price) ? Math.max(0, round2(price)) : 0;
  await db.menuItem.update({
    where: { id: itemId },
    data: { price: safePrice },
  });
  revalidatePath("/admin/menu");
}

export async function updateItem(
  itemId: string,
  data: {
    name: string;
    description: string;
    price: number;
    available: boolean;
  }
) {
  const item = await db.menuItem.findUnique({
    where: { id: itemId },
    select: { vendorId: true },
  });
  if (!item) throw new Error("Item not found.");
  await assertVendorAccess(item.vendorId);

  const name = data.name.trim();
  if (!name) throw new Error("Name is required.");
  const safePrice = Number.isFinite(data.price)
    ? Math.max(0, round2(data.price))
    : 0;

  await db.menuItem.update({
    where: { id: itemId },
    data: {
      name,
      description: data.description.trim(),
      price: safePrice,
      available: data.available,
    },
  });
  revalidatePath("/admin/menu");
}

export async function createItem(
  categoryId: string,
  vendorId: string,
  data: { name: string; price: number; description: string }
) {
  await assertVendorAccess(vendorId);

  const category = await db.category.findUnique({
    where: { id: categoryId },
    select: { id: true, menu: { select: { vendorId: true } } },
  });
  if (!category) throw new Error("Category not found.");
  if (category.menu.vendorId !== vendorId) {
    throw new Error("Category does not belong to this vendor.");
  }

  const name = data.name.trim();
  if (!name) throw new Error("Name is required.");
  const safePrice = Number.isFinite(data.price)
    ? Math.max(0, round2(data.price))
    : 0;

  // place new item at the end of the category.
  const last = await db.menuItem.findFirst({
    where: { categoryId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  await db.menuItem.create({
    data: {
      vendorId,
      categoryId,
      name,
      description: data.description.trim(),
      price: safePrice,
      sortOrder: (last?.sortOrder ?? 0) + 1,
      available: true,
      tags: "[]",
    },
  });
  revalidatePath("/admin/menu");
}

export async function deleteItem(itemId: string) {
  const item = await db.menuItem.findUnique({
    where: { id: itemId },
    select: { vendorId: true },
  });
  if (!item) throw new Error("Item not found.");
  await assertVendorAccess(item.vendorId);

  // remove dependent modifier groups/options first (SQLite has no cascade here).
  const groups = await db.modifierGroup.findMany({
    where: { itemId },
    select: { id: true },
  });
  if (groups.length) {
    const groupIds = groups.map((g) => g.id);
    await db.modifierOption.deleteMany({
      where: { groupId: { in: groupIds } },
    });
    await db.modifierGroup.deleteMany({ where: { itemId } });
  }
  await db.menuItem.delete({ where: { id: itemId } });
  revalidatePath("/admin/menu");
}
