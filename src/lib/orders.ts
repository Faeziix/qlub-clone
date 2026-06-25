import "server-only";
import { db } from "./db";
import { computeBill, lineTotal } from "./pricing";
import { nanoid } from "nanoid";
import { Prisma } from "@prisma/client";
import type { CartLine, PaymentMethod, SplitType } from "./types";

async function nextVendorOrderNumber(vendorId: string): Promise<string> {
  const updated = await db.$queryRaw<{ seq: number }[]>`
    UPDATE "Vendor"
    SET "vendorOrderSeq" = "vendorOrderSeq" + 1
    WHERE "id" = ${vendorId}
    RETURNING "vendorOrderSeq" AS seq
  `;
  const seq = updated[0]?.seq;
  if (seq === undefined) throw new Error(`Vendor ${vendorId} not found during order number generation`);
  return `Q-${String(seq).padStart(6, "0")}`;
}

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

  const orderNumber = await nextVendorOrderNumber(vendor.id);

  const order = await db.order.create({
    data: {
      vendorId: vendor.id,
      tableId: table?.id,
      orderNumber,
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
        create: input.lines.map((l) => ({
          itemId: l.itemId,
          name: l.name,
          unitPrice: l.unitPrice,
          quantity: l.quantity,
          modifiers: l.modifiers.map((m) => ({
            ...m,
            priceDelta: m.priceDelta.toString(),
          })) as unknown as import("@prisma/client").Prisma.InputJsonValue,
          notes: l.notes,
          lineTotal: lineTotal(l),
        })),
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
  amount: bigint;
  tipAmount?: bigint;
  method: PaymentMethod;
  splitType?: SplitType;
  splitMeta?: Record<string, unknown> | null;
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
      status: "succeeded",
      splitType: input.splitType ?? "full",
      splitMeta: input.splitMeta
        ? (input.splitMeta as Prisma.InputJsonValue)
        : Prisma.DbNull,
      payerName: input.payerName,
      payerEmail: input.payerEmail,
      reference: `pay_${nanoid(16)}`,
    },
  });

  const prevAmountPaid = order.amountPaid;
  const prevTipAmount = order.tipAmount;
  const prevTotal = order.total;

  const amountPaid = prevAmountPaid + input.amount;
  const fullyPaid = amountPaid >= prevTotal;

  await db.order.update({
    where: { id: order.id },
    data: {
      amountPaid,
      tipAmount: prevTipAmount + tip,
      total: prevTotal + tip,
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
