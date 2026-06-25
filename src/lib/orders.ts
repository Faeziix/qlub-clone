import "server-only";
import { db } from "./db";
import { computeBill } from "./pricing";
import { isFullyPaid } from "./money";
import { nextOrderNumber } from "./schema-types";
import { nanoid } from "nanoid";
import type { CartLine, PaymentMethod, SplitType } from "./types";

export async function createOrderFromCart(input: {
  vendorSlug: string;
  tableCode?: string | null;
  type?: "qsr" | "dinein";
  lines: CartLine[];
  guestName?: string;
  guestPhone?: string;
  notes?: string;
}) {
  const vendor = await db.vendor.findUnique({
    where: { slug: input.vendorSlug },
  });
  if (!vendor) throw new Error("Vendor not found");
  if (!input.lines.length) throw new Error("Cart is empty");

  const bill = computeBill(input.lines, {
    serviceChargePct: vendor.serviceChargePct,
    taxPct: vendor.taxPct,
    taxInclusive: vendor.taxInclusive,
  });

  const table = input.tableCode
    ? await db.diningTable.findFirst({
        where: { vendorId: vendor.id, code: input.tableCode },
      })
    : null;

  const order = await db.$transaction(async (tx) => {
    const freshVendor = await tx.vendor.findUniqueOrThrow({
      where: { id: vendor.id },
      select: { vendorOrderSeq: true },
    });

    const { seq, formatted } = nextOrderNumber(vendor.id, freshVendor.vendorOrderSeq);

    await tx.vendor.update({
      where: { id: vendor.id },
      data: { vendorOrderSeq: seq },
    });

    const newOrder = await tx.order.create({
      data: {
        vendorId: vendor.id,
        tableId: table?.id,
        orderNumber: formatted,
        type: input.type ?? "qsr",
        status: "placed",
        guestName: input.guestName,
        guestPhone: input.guestPhone,
        notes: input.notes,
        currency: vendor.currency,
        subtotal: bill.subtotal,
        serviceCharge: bill.serviceCharge,
        tax: bill.tax,
        total: bill.total,
        items: {
          create: input.lines.map((l) => {
            const modifierSum = l.modifiers.reduce((s, m) => s + m.priceDelta, 0n);
            return {
              itemId: l.itemId,
              name: l.name,
              unitPrice: l.unitPrice,
              quantity: l.quantity,
              modifiers: l.modifiers as unknown as object[],
              notes: l.notes,
              lineTotal: (l.unitPrice + modifierSum) * BigInt(l.quantity),
            };
          }),
        },
      },
      include: { items: true, vendor: true, table: true },
    });

    if (table) {
      await tx.diningTable.update({
        where: { id: table.id },
        data: { status: "occupied" },
      });
    }

    return newOrder;
  });

  return order;
}

export async function recordPayment(input: {
  orderId: string;
  amount: bigint;
  tipAmount?: bigint;
  method: PaymentMethod;
  splitType?: SplitType;
  splitMeta?: unknown;
  payerName?: string;
  payerEmail?: string;
}) {
  const order = await db.order.findUnique({
    where: { id: input.orderId },
    include: { payments: true },
  });
  if (!order) throw new Error("Order not found");

  const tip = input.tipAmount ?? 0n;
  const total = input.amount + tip;

  const payment = await db.payment.create({
    data: {
      vendorId: order.vendorId,
      orderId: order.id,
      amount: input.amount,
      tipAmount: tip,
      total,
      currency: order.currency,
      method: input.method,
      status: "pending",
      splitType: input.splitType ?? "full",
      splitMeta: input.splitMeta ?? undefined,
      payerName: input.payerName,
      payerEmail: input.payerEmail,
      reference: `pay_${nanoid(16)}`,
    },
  });

  const amountPaid = order.amountPaid + input.amount;
  const fullyPaid = isFullyPaid(amountPaid, order.total);
  await db.order.update({
    where: { id: order.id },
    data: {
      amountPaid,
      tipAmount: order.tipAmount + tip,
      total: order.total + tip,
      status: fullyPaid ? "paid" : order.status,
    },
  });

  if (fullyPaid && order.tableId) {
    await db.diningTable.update({
      where: { id: order.tableId },
      data: { status: "available" },
    });
  }

  return { payment, fullyPaid, amountPaid };
}

export async function createReview(input: {
  vendorSlug: string;
  paymentId: string;
  rating: number;
  foodRating?: number;
  serviceRating?: number;
  ambienceRating?: number;
  comment?: string;
  guestName?: string;
}) {
  const vendor = await db.vendor.findUnique({
    where: { slug: input.vendorSlug },
  });
  if (!vendor) throw new Error("Vendor not found");

  return db.review.create({
    data: {
      vendorId: vendor.id,
      paymentId: input.paymentId,
      rating: input.rating,
      foodRating: input.foodRating,
      serviceRating: input.serviceRating,
      ambienceRating: input.ambienceRating,
      comment: input.comment,
      guestName: input.guestName,
    },
  });
}
