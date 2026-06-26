/**
 * POST /api/admin/otp-override
 *
 * Operator override for the optional pre-fire OTP gate. A waiter (staff role
 * or above) may vouch for a table when SMS is unavailable, bypassing OTP
 * verification for a specific order. This sets `phoneVerifiedAt` on the Order
 * to indicate a verified state was granted by an operator, not an OTP code.
 *
 * Tenant-isolated: the order must belong to the session user's vendor.
 * Audited: every override is written to the AuditLog.
 *
 * Acceptance criterion from PRD user story #17:
 *   "As a waiter, I want an operator override for the optional pre-fire OTP
 *   gate, so that I can vouch for a table when SMS is unavailable."
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { recordAuditEvent } from "@/lib/audit";
import { checkAdminActionLimit } from "@/lib/admin-rate-limit";

const schema = z.object({
  orderId: z.string().min(1).max(100),
  reason: z.string().max(500).optional(),
});

export async function POST(req: Request) {
  const session = await requireRole("staff");

  await checkAdminActionLimit(session.id);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  }

  const { orderId, reason } = parsed.data;

  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { id: true, vendorId: true, phoneVerifiedAt: true },
  });

  if (!order) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  if (session.role !== "superadmin" && order.vendorId !== session.vendorId) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const now = new Date();
  await db.order.update({
    where: { id: orderId },
    data: { phoneVerifiedAt: now },
  });

  await recordAuditEvent({
    actorId: session.id,
    vendorId: order.vendorId,
    action: "otp_override",
    entity: "Order",
    entityId: orderId,
    before: { phoneVerifiedAt: order.phoneVerifiedAt },
    after: { phoneVerifiedAt: now, reason: reason ?? "operator_override" },
  });

  return NextResponse.json({ ok: true, phoneVerifiedAt: now.toISOString() });
}
