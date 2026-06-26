import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { checkOrigin } from "@/lib/csrf";
import { getLimiter } from "@/lib/limiters";
import { bigintFromJson } from "@/lib/money";
import { serializeOrder } from "@/lib/api-serializers";
import { appendItemsToOrder } from "@/lib/orders";
import { sanitizeFreeText } from "@/lib/sanitize";

const moneyField = z.union([z.string(), z.number()]);

const appendSchema = z.object({
  vendorSlug: z.string().min(1).max(100),
  lines: z
    .array(
      z.object({
        lineId: z.string().max(100),
        itemId: z.string().max(100),
        name: z.string().max(200),
        unitPrice: moneyField,
        quantity: z.number().int().positive().max(99),
        notes: z.string().max(500).optional(),
        imageUrl: z.string().url().nullable().optional(),
        modifiers: z.array(
          z.object({
            groupId: z.string().max(100),
            groupName: z.string().max(200),
            optionId: z.string().max(100),
            optionName: z.string().max(200),
            priceDelta: moneyField,
          })
        ),
      })
    )
    .min(1)
    .max(50),
});

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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  if (!checkOrigin(request)) {
    return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const limiter = await getLimiter("publicApi");
  const limit = await limiter.check(`order-append:${ip}`);
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many requests" },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) },
      }
    );
  }

  const { orderId } = await params;
  if (!orderId) {
    return NextResponse.json({ ok: false, error: "missing_order_id" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const data = appendSchema.parse(body);

    const sanitizedLines = data.lines.map((l) => ({
      ...l,
      unitPrice: bigintFromJson(l.unitPrice),
      notes: l.notes ? sanitizeFreeText(l.notes, 500) : undefined,
      modifiers: l.modifiers.map((m) => ({
        ...m,
        priceDelta: bigintFromJson(m.priceDelta),
      })),
    }));

    const { order, priceChanged } = await appendItemsToOrder({
      orderId,
      vendorSlug: data.vendorSlug,
      lines: sanitizedLines,
    });

    return NextResponse.json({
      ok: true,
      order: serializeOrder(order),
      priceChanged,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Bad request";
    const knownClientErrors = [
      "Order cannot be modified",
      "Cannot modify order while a payment is in progress",
      "Order does not belong to this vendor",
      "Order not found",
      "Vendor not found",
      "No items to add",
    ];
    const isClientError = knownClientErrors.some((m) => message.includes(m));
    if (isClientError) {
      return NextResponse.json({ ok: false, error: message }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  }
}
