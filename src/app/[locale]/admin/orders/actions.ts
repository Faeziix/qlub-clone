"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { recordAuditEvent } from "@/lib/audit";

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
  const session = await requireRole("staff");
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { id: true, vendorId: true, tableId: true, status: true },
  });
  if (!order) throw new Error("Order not found.");
  if (session.vendorId && order.vendorId !== session.vendorId) {
    throw new Error("Not authorized for this order.");
  }
  return { order, session };
}

export async function updateOrderStatus(orderId: string, status: string) {
  if (!ALLOWED_STATUSES.includes(status as OrderStatus)) {
    throw new Error(`Invalid status: ${status}`);
  }
  const { order, session } = await scopedOrder(orderId);

  await db.order.update({
    where: { id: orderId },
    data: { status: status as OrderStatus, updatedAt: new Date() },
  });

  await recordAuditEvent({
    actorId: session.id,
    vendorId: order.vendorId,
    action: "UPDATE_ORDER_STATUS",
    entity: "Order",
    entityId: orderId,
    before: { status: order.status },
    after: { status },
  });

  revalidatePath("/admin/orders");
}

export async function cancelOrder(orderId: string) {
  const { order, session } = await scopedOrder(orderId);

  await db.order.update({
    where: { id: orderId },
    data: { status: "cancelled", updatedAt: new Date() },
  });

  if (order.tableId) {
    await db.diningTable.update({
      where: { id: order.tableId },
      data: { status: "available" },
    });
  }

  await recordAuditEvent({
    actorId: session.id,
    vendorId: order.vendorId,
    action: "CANCEL_ORDER",
    entity: "Order",
    entityId: orderId,
    before: { status: order.status },
    after: { status: "cancelled" },
  });

  revalidatePath("/admin/orders");
}
