"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/app/[locale]/admin/actions";

const ALLOWED_STATUSES = [
  "open",
  "placed",
  "preparing",
  "ready",
  "served",
  "paid",
  "cancelled",
] as const;

type OrderStatus = (typeof ALLOWED_STATUSES)[number];

/** Find an order, asserting it belongs to the current session's vendor scope. */
async function scopedOrder(orderId: string) {
  const session = await requireSession();
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { id: true, vendorId: true, tableId: true },
  });
  if (!order) throw new Error("Order not found.");
  // Non-superadmins may only touch their own vendor's orders.
  if (session.vendorId && order.vendorId !== session.vendorId) {
    throw new Error("Not authorized for this order.");
  }
  return order;
}

export async function updateOrderStatus(orderId: string, status: string) {
  if (!ALLOWED_STATUSES.includes(status as OrderStatus)) {
    throw new Error(`Invalid status: ${status}`);
  }
  await scopedOrder(orderId);

  await db.order.update({
    where: { id: orderId },
    data: { status: status as OrderStatus, updatedAt: new Date() },
  });

  revalidatePath("/admin/orders");
}

export async function cancelOrder(orderId: string) {
  const order = await scopedOrder(orderId);

  await db.order.update({
    where: { id: orderId },
    data: { status: "cancelled", updatedAt: new Date() },
  });

  // Free up the table if the cancelled order was holding one.
  if (order.tableId) {
    await db.diningTable.update({
      where: { id: order.tableId },
      data: { status: "available" },
    });
  }

  revalidatePath("/admin/orders");
}
