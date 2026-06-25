import "server-only";
import { db } from "./db";
import { computeBill } from "./pricing";
import { round2 } from "./utils";
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

  const order = await db.order.create({
    data: {
      vendorId: vendor.id,
      tableId: table?.id,
      orderNumber: `Q-${Date.now().toString().slice(-6)}-${nanoid(3)}`,
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
          const modSum = l.modifiers.reduce((s, m) => s + m.priceDelta, 0);
          return {
            itemId: l.itemId,
            name: l.name,
            unitPrice: l.unitPrice,
            quantity: l.quantity,
            modifiers: JSON.stringify(l.modifiers),
            notes: l.notes,
            lineTotal: round2((l.unitPrice + modSum) * l.quantity),
          };
        }),
      },
    },
    include: { items: true, vendor: true, table: true },
  });

  if (table) {
    await db.diningTable.update({
      where: { id: table.id },
      data: { status: "occupied" },
    });
  }
  return order;
}

export async function recordPayment(input: {
  orderId: string;
  amount: number;
  tipAmount?: number;
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

  const tip = round2(input.tipAmount ?? 0);
  const total = round2(input.amount + tip);

  const payment = await db.payment.create({
    data: {
      vendorId: order.vendorId,
      orderId: order.id,
      amount: round2(input.amount),
      tipAmount: tip,
      total,
      currency: order.currency,
      method: input.method,
      status: "succeeded",
      splitType: input.splitType ?? "full",
      splitMeta: input.splitMeta ? JSON.stringify(input.splitMeta) : null,
      payerName: input.payerName,
      payerEmail: input.payerEmail,
      reference: `pay_${nanoid(16)}`,
    },
  });

  const amountPaid = round2(order.amountPaid + input.amount);
  const fullyPaid = amountPaid >= order.total - 0.01;
  await db.order.update({
    where: { id: order.id },
    data: {
      amountPaid,
      tipAmount: round2(order.tipAmount + tip),
      total: round2(order.total + tip),
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
  orderId?: string;
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
      orderId: input.orderId,
      rating: input.rating,
      foodRating: input.foodRating,
      serviceRating: input.serviceRating,
      ambienceRating: input.ambienceRating,
      comment: input.comment,
      guestName: input.guestName,
    },
  });
}
