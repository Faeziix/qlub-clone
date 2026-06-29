import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkOrigin } from "@/lib/csrf";
import { getLimiter } from "@/lib/limiters";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  if (!checkOrigin(request)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const limiter = await getLimiter("publicApi");
  const limit = await limiter.check(`order-status:${ip}`);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) },
      }
    );
  }

  const { orderId } = await params;
  if (!orderId) {
    return NextResponse.json({ error: "missing_order_id" }, { status: 400 });
  }

  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { items: true, table: true },
  });

  if (!order) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    subtotal: order.subtotal.toString(),
    serviceCharge: order.serviceCharge.toString(),
    tax: order.tax.toString(),
    total: order.total.toString(),
    amountPaid: order.amountPaid.toString(),
    tipAmount: order.tipAmount.toString(),
    tableLabel: order.table?.label ?? null,
    items: order.items.map((item) => ({
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      lineTotal: item.lineTotal.toString(),
      modifiers: Array.isArray(item.modifiers) ? item.modifiers : [],
    })),
  });
}

