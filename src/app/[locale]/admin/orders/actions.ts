"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole, assertRole } from "@/lib/rbac";
import { recordAuditEvent } from "@/lib/audit";
import { checkAdminActionLimit } from "@/lib/admin-rate-limit";

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

/**
 * Transitions only staff may advance (kitchen/floor workflow).
 * All roles at or above "staff" may perform these.
 */
const STAFF_PERMITTED_TRANSITIONS: ReadonlySet<OrderStatus> = new Set([
  "placed",
  "preparing",
  "ready",
  "served",
]);

/** Find an order, asserting it belongs to the current session's vendor scope. */
async function scopedOrder(orderId: string) {
  const session = await requireRole("staff");
  await checkAdminActionLimit(session.id);
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { id: true, vendorId: true, tableId: true, status: true },
  });
  if (!order) throw new Error("Order not found.");
  if (session.vendorId && order.vendorId !== session.vendorId) {
    throw new Error("Not authorized for this order.");
  }
  if (session.role !== "superadmin") {
    const vendor = await db.vendor.findUnique({
      where: { id: order.vendorId },
      select: { active: true },
    });
    if (!vendor?.active) {
      throw new Error("VendorSuspended: this tenant is currently suspended.");
    }
  }
  return { order, session };
}

export async function updateOrderStatus(orderId: string, status: string) {
  if (!ALLOWED_STATUSES.includes(status as OrderStatus)) {
    throw new Error(`Invalid status: ${status}`);
  }

  const { order, session } = await scopedOrder(orderId);

  if (!STAFF_PERMITTED_TRANSITIONS.has(status as OrderStatus)) {
    assertRole(session, "manager");
  }

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
  assertRole(session, "manager");

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
