"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { parseRialFromInput } from "@/lib/money";
import { recordAuditEvent } from "@/lib/audit";
import { checkAdminActionLimit } from "@/lib/admin-rate-limit";

interface TranslationInput {
  locale: string;
  name: string;
  description: string;
}

async function assertVendorAccess(vendorId: string) {
  const session = await requireRole("manager");
  await checkAdminActionLimit(session.id);
  if (session.vendorId && session.vendorId !== vendorId) {
    throw new Error("Forbidden: item belongs to another vendor.");
  }
  if (session.role !== "superadmin") {
    const vendor = await db.vendor.findUnique({
      where: { id: vendorId },
      select: { active: true },
    });
    if (!vendor?.active) {
      throw new Error("VendorSuspended: this tenant is currently suspended.");
    }
  }
  return session;
}

async function upsertItemTranslations(
  menuItemId: string,
  translations: TranslationInput[]
) {
  for (const tx of translations) {
    if (!tx.name.trim()) continue;
    await db.menuItemTranslation.upsert({
      where: { menuItemId_locale: { menuItemId, locale: tx.locale } },
      create: {
        menuItemId,
        locale: tx.locale,
        name: tx.name.trim(),
        description: tx.description.trim() || null,
      },
      update: {
        name: tx.name.trim(),
        description: tx.description.trim() || null,
      },
    });
  }
}

export async function toggleItemAvailability(itemId: string, available: boolean) {
  const item = await db.menuItem.findUnique({
    where: { id: itemId },
    select: { vendorId: true, available: true },
  });
  if (!item) throw new Error("Item not found.");
  const session = await assertVendorAccess(item.vendorId);

  await db.menuItem.update({
    where: { id: itemId },
    data: { available },
  });

  await recordAuditEvent({
    actorId: session.id,
    vendorId: item.vendorId,
    action: "TOGGLE_ITEM_AVAILABILITY",
    entity: "MenuItem",
    entityId: itemId,
    before: { available: item.available },
    after: { available },
  });

  revalidatePath("/admin/menu");
}

export async function updateItemPrice(itemId: string, tomanInput: string) {
  const item = await db.menuItem.findUnique({
    where: { id: itemId },
    select: { vendorId: true, price: true },
  });
  if (!item) throw new Error("Item not found.");
  const session = await assertVendorAccess(item.vendorId);

  const priceRial = parseRialFromInput(tomanInput);
  await db.menuItem.update({
    where: { id: itemId },
    data: { price: priceRial },
  });

  await recordAuditEvent({
    actorId: session.id,
    vendorId: item.vendorId,
    action: "UPDATE_ITEM_PRICE",
    entity: "MenuItem",
    entityId: itemId,
    before: { price: String(item.price) },
    after: { price: String(priceRial) },
  });

  revalidatePath("/admin/menu");
}

export async function updateItem(
  itemId: string,
  data: {
    name: string;
    description: string;
    tomanInput: string;
    available: boolean;
    translations?: TranslationInput[];
  }
) {
  const item = await db.menuItem.findUnique({
    where: { id: itemId },
    select: { vendorId: true, name: true, price: true },
  });
  if (!item) throw new Error("Item not found.");
  const session = await assertVendorAccess(item.vendorId);

  const name = data.name.trim();
  if (!name) throw new Error("Name is required.");
  const priceRial = parseRialFromInput(data.tomanInput);

  await db.menuItem.update({
    where: { id: itemId },
    data: {
      name,
      description: data.description.trim(),
      price: priceRial,
      available: data.available,
    },
  });

  if (data.translations?.length) {
    await upsertItemTranslations(itemId, data.translations);
  }

  await recordAuditEvent({
    actorId: session.id,
    vendorId: item.vendorId,
    action: "UPDATE_MENU_ITEM",
    entity: "MenuItem",
    entityId: itemId,
    before: { name: item.name, price: String(item.price) },
    after: { name, price: String(priceRial) },
  });

  revalidatePath("/admin/menu");
}

export async function createItem(
  categoryId: string,
  vendorId: string,
  data: {
    name: string;
    tomanInput: string;
    description: string;
    translations?: TranslationInput[];
  }
) {
  const session = await assertVendorAccess(vendorId);

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
  const priceRial = parseRialFromInput(data.tomanInput);

  const last = await db.menuItem.findFirst({
    where: { categoryId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  const created = await db.menuItem.create({
    data: {
      vendorId,
      categoryId,
      name,
      description: data.description.trim(),
      price: priceRial,
      sortOrder: (last?.sortOrder ?? 0) + 1,
      available: true,
      tags: [],
    },
  });

  if (data.translations?.length) {
    await upsertItemTranslations(created.id, data.translations);
  }

  await recordAuditEvent({
    actorId: session.id,
    vendorId,
    action: "CREATE_MENU_ITEM",
    entity: "MenuItem",
    entityId: created.id,
    after: { name, price: String(priceRial) },
  });

  revalidatePath("/admin/menu");
}

export async function deleteItem(itemId: string) {
  const item = await db.menuItem.findUnique({
    where: { id: itemId },
    select: { vendorId: true, name: true },
  });
  if (!item) throw new Error("Item not found.");
  const session = await assertVendorAccess(item.vendorId);

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

  await recordAuditEvent({
    actorId: session.id,
    vendorId: item.vendorId,
    action: "DELETE_MENU_ITEM",
    entity: "MenuItem",
    entityId: itemId,
    before: { name: item.name },
  });

  revalidatePath("/admin/menu");
}
