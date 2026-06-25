import "server-only";
import { db } from "./db";
import { computeBill, lineTotal } from "./pricing";
import { nanoid } from "nanoid";
import { Prisma } from "@prisma/client";
import type { CartLine, PaymentMethod, SplitType } from "./types";

const LEG_RESERVATION_TTL_MS = 15 * 60 * 1000;

async function nextVendorOrderNumber(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  vendorId: string
): Promise<string> {
  const updated = await tx.$queryRaw<{ seq: number }[]>`
    UPDATE "Vendor"
    SET "vendorOrderSeq" = "vendorOrderSeq" + 1
    WHERE "id" = ${vendorId}
    RETURNING "vendorOrderSeq" AS seq
  `;
  const seq = updated[0]?.seq;
  if (seq === undefined)
    throw new Error(`Vendor ${vendorId} not found during order number generation`);
  return `Q-${String(seq).padStart(6, "0")}`;
}

type ResolvedLine = CartLine & {
  resolvedUnitPrice: bigint;
};

async function resolveLinePricesFromDb(lines: CartLine[]): Promise<ResolvedLine[]> {
  return Promise.all(
    lines.map(async (line) => {
      const dbItem = await db.menuItem.findUnique({ where: { id: line.itemId } });
      const resolvedUnitPrice = dbItem?.price ?? line.unitPrice;

      const resolvedModifiers = await Promise.all(
        line.modifiers.map(async (mod) => {
          const dbOpt = await db.modifierOption.findUnique({ where: { id: mod.optionId } });
          return { ...mod, priceDelta: dbOpt?.priceDelta ?? mod.priceDelta };
        })
      );

      return { ...line, unitPrice: resolvedUnitPrice, modifiers: resolvedModifiers, resolvedUnitPrice };
    })
  );
}

function detectPriceChange(original: CartLine[], resolved: ResolvedLine[]): boolean {
  return resolved.some((resolved, idx) => {
    const original_ = original[idx];
    if (resolved.resolvedUnitPrice !== original_.unitPrice) return true;
    return resolved.modifiers.some((rmod, midx) => {
      const omod = original_.modifiers[midx];
      return omod && rmod.priceDelta !== omod.priceDelta;
    });
  });
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

  const resolvedLines = await resolveLinePricesFromDb(input.lines);
  const priceChanged = detectPriceChange(input.lines, resolvedLines);

  const bill = computeBill(resolvedLines, {
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
    const orderNumber = await nextVendorOrderNumber(tx, vendor.id);

    const created = await tx.order.create({
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
          create: resolvedLines.map((l) => ({
            itemId: l.itemId,
            name: l.name,
            unitPrice: l.unitPrice,
            quantity: l.quantity,
            modifiers: l.modifiers.map((m) => ({
              ...m,
              priceDelta: m.priceDelta.toString(),
            })) as unknown as Prisma.InputJsonValue,
            notes: l.notes,
            lineTotal: lineTotal(l),
          })),
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

    return created;
  });

  return { order: { ...order, priceChanged }, priceChanged };
}

export async function initiatePaymentLeg(input: {
  orderId: string;
  amount: bigint;
  tipAmount: bigint;
  method: PaymentMethod;
  idempotencyKey: string;
  splitType?: SplitType;
  splitMeta?: Record<string, unknown> | null;
  payerName?: string;
  payerEmail?: string;
}) {
  const existing = await db.payment.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
  });
  if (existing) return existing;

  return db.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: input.orderId },
      include: { payments: true },
    });
    if (!order) throw new Error("Order not found");

    const reservedBalance = order.payments
      .filter((p) => p.status === "pending" && p.expiresAt && p.expiresAt > new Date())
      .reduce((s, p) => s + p.amount, 0n);

    const remaining = order.total - order.amountPaid - reservedBalance;

    if (remaining <= 0n) {
      throw new Error("Order is already fully paid or reserved");
    }
    if (input.amount > remaining) {
      throw new Error(`Requested amount exceeds remaining balance (${remaining})`);
    }

    const expiresAt = new Date(Date.now() + LEG_RESERVATION_TTL_MS);

    return tx.payment.create({
      data: {
        vendorId: order.vendorId,
        orderId: order.id,
        amount: input.amount,
        tipAmount: input.tipAmount,
        total: input.amount + input.tipAmount,
        currency: order.currency,
        method: input.method,
        status: "pending",
        splitType: input.splitType ?? "full",
        splitMeta: input.splitMeta
          ? (input.splitMeta as Prisma.InputJsonValue)
          : Prisma.DbNull,
        payerName: input.payerName,
        payerEmail: input.payerEmail,
        reference: `pay_${nanoid(16)}`,
        idempotencyKey: input.idempotencyKey,
        expiresAt,
      },
    });
  });
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
  idempotencyKey?: string;
}) {
  if (input.idempotencyKey) {
    const existing = await db.payment.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      const order = await db.order.findUnique({ where: { id: input.orderId } });
      return {
        payment: existing,
        fullyPaid: order ? order.amountPaid >= order.total : false,
        amountPaid: order?.amountPaid ?? 0n,
        idempotent: true,
      };
    }
  }

  const result = await db.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: input.orderId },
      include: { payments: true },
    });
    if (!order) throw new Error("Order not found");

    const tip = input.tipAmount ?? 0n;
    const total = input.amount + tip;

    const payment = await tx.payment.create({
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
        idempotencyKey: input.idempotencyKey,
      },
    });

    const amountPaid = order.amountPaid + input.amount;
    const fullyPaid = amountPaid >= order.total;

    await tx.order.update({
      where: { id: order.id },
      data: {
        amountPaid,
        tipAmount: order.tipAmount + tip,
        status: fullyPaid ? "paid" : order.status,
      },
    });

    if (fullyPaid && order.tableId) {
      await tx.diningTable.update({
        where: { id: order.tableId },
        data: { status: "available" },
      });
    }

    return { payment, fullyPaid, amountPaid };
  });

  return { ...result, idempotent: false };
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
