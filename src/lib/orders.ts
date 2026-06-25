import "server-only";
import { db } from "./db";
import { isFullyPaid } from "./money";
import { nextOrderNumber } from "./schema-types";
import { nanoid } from "nanoid";
import {
  computeServerBill,
  detectPriceChanges,
  validatePaymentLegsAgainstSnapshot,
} from "./pricing-authority";
import type { PaymentMethod, SplitType } from "./types";
import type { PriceChangeNotice } from "./pricing-authority";

const SPLIT_LEG_TTL_MS = 15 * 60 * 1000;

export type { PriceChangeNotice };

export async function createOrderFromCart(input: {
  vendorSlug: string;
  tableCode?: string | null;
  type?: "qsr" | "dinein";
  lines: Array<{
    itemId: string;
    quantity: number;
    unitPrice: bigint;
    modifiers: Array<{ optionId: string; priceDelta: bigint }>;
    name: string;
    notes?: string;
  }>;
  guestName?: string;
  guestPhone?: string;
  notes?: string;
}) {
  const vendor = await db.vendor.findUnique({
    where: { slug: input.vendorSlug },
  });
  if (!vendor) throw new Error("Vendor not found");
  if (!input.lines.length) throw new Error("Cart is empty");

  const itemIds = [...new Set(input.lines.map((l) => l.itemId))];
  const optionIds = [
    ...new Set(input.lines.flatMap((l) => l.modifiers.map((m) => m.optionId))),
  ];

  const [dbItems, dbOptions] = await Promise.all([
    db.menuItem.findMany({
      where: { id: { in: itemIds }, vendorId: vendor.id },
      select: { id: true, price: true, name: true, available: true },
    }),
    optionIds.length
      ? db.modifierOption.findMany({
          where: {
            id: { in: optionIds },
            group: { item: { vendorId: vendor.id } },
          },
          select: { id: true, priceDelta: true, name: true },
        })
      : Promise.resolve([]),
  ]);

  const unavailable = dbItems.filter((i) => !i.available).map((i) => i.id);
  if (unavailable.length) {
    throw new Error(`Items no longer available: ${unavailable.join(", ")}`);
  }

  const dbItemPrices = dbItems.map((i) => ({
    itemId: i.id,
    price: i.price,
    name: i.name,
  }));
  const dbModPrices = dbOptions.map((o) => ({
    optionId: o.id,
    priceDelta: o.priceDelta,
    name: o.name,
  }));

  const priceChanges = detectPriceChanges(input.lines, dbItemPrices, dbModPrices);

  const bill = computeServerBill(input.lines, dbItemPrices, dbModPrices, {
    serviceChargePct: vendor.serviceChargePct,
    taxPct: vendor.taxPct,
    taxInclusive: vendor.taxInclusive,
  });

  const itemMap = new Map(dbItems.map((i) => [i.id, i.price]));
  const modMap = new Map(dbOptions.map((o) => [o.id, o.priceDelta]));

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
            const serverUnitPrice = itemMap.get(l.itemId) ?? l.unitPrice;
            const modifierSum = l.modifiers.reduce((s, m) => {
              return s + (modMap.get(m.optionId) ?? m.priceDelta);
            }, 0n);
            return {
              itemId: l.itemId,
              name: l.name,
              unitPrice: serverUnitPrice,
              quantity: l.quantity,
              modifiers: l.modifiers as unknown as object[],
              notes: l.notes,
              lineTotal: (serverUnitPrice + modifierSum) * BigInt(l.quantity),
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

  return { order, priceChanges };
}

/**
 * Initiates a payment leg and reserves it with a TTL before any gateway redirect.
 * This is the correct entry point for split-bill flows — it acquires a
 * row-level lock on the order, checks the remaining balance against already-
 * succeeded and still-active reserved legs, then creates a pending Payment
 * with an expiry. The client should confirm via recordPayment after the
 * gateway callback.
 *
 * FOR UPDATE is issued via $queryRaw to prevent concurrent requests from both
 * reading the same payments set and both passing the remaining check (the
 * cross-gateway double-settlement scenario).
 */
export async function initiatePayment(input: {
  orderId: string;
  amount: bigint;
  tipAmount?: bigint;
  method: PaymentMethod;
  splitType?: SplitType;
  splitMeta?: unknown;
  payerName?: string;
  payerEmail?: string;
  idempotencyKey: string;
}) {
  const existingByKey = await db.payment.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
  });
  if (existingByKey) {
    return { payment: existingByKey, deduplicated: true };
  }

  const tip = input.tipAmount ?? 0n;

  const payment = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${input.orderId} FOR UPDATE`;

    const order = await tx.order.findUniqueOrThrow({
      where: { id: input.orderId },
      include: { items: true, payments: true },
    });

    const succeededLegs = order.payments.filter((p) => p.status === "succeeded");
    const reservedLegs = order.payments.filter(
      (p) =>
        p.status === "pending" &&
        p.expiresAt !== null &&
        p.expiresAt > new Date()
    );

    const alreadyPaid = succeededLegs.reduce((s, p) => s + p.amount, 0n);
    const reserved = reservedLegs.reduce((s, p) => s + p.amount, 0n);
    const committedOrReserved = alreadyPaid + reserved;

    const remaining =
      order.total > committedOrReserved
        ? order.total - committedOrReserved
        : 0n;

    if (input.amount > remaining) {
      throw new Error(
        `Payment amount ${input.amount} exceeds remaining balance ${remaining}`
      );
    }

    const allActiveLegs = [
      ...succeededLegs.map((p) => ({ amount: p.amount, tipAmount: p.tipAmount })),
      ...reservedLegs.map((p) => ({ amount: p.amount, tipAmount: p.tipAmount })),
      { amount: input.amount, tipAmount: tip },
    ];

    const invariantCheck = validatePaymentLegsAgainstSnapshot(
      order.total,
      allActiveLegs
    );

    if (!invariantCheck.valid) {
      throw new Error(
        `Payment legs exceed order snapshot. ` +
          `Snapshot total: ${invariantCheck.snapshotTotal}, ` +
          `would-be paid total: ${invariantCheck.paidTotal}, ` +
          `overpayment: ${invariantCheck.discrepancy} rial`
      );
    }

    const expiresAt = new Date(Date.now() + SPLIT_LEG_TTL_MS);

    return tx.payment.create({
      data: {
        vendorId: order.vendorId,
        orderId: order.id,
        amount: input.amount,
        tipAmount: tip,
        total: input.amount + tip,
        currency: order.currency,
        method: input.method,
        status: "pending",
        splitType: input.splitType ?? "full",
        splitMeta: input.splitMeta ?? undefined,
        payerName: input.payerName,
        payerEmail: input.payerEmail,
        reference: `pay_${nanoid(16)}`,
        idempotencyKey: input.idempotencyKey,
        expiresAt,
      },
    });
  });

  return { payment, deduplicated: false };
}

/**
 * Records a confirmed (succeeded) payment leg.
 *
 * Acquires a row-level lock (FOR UPDATE) on the order inside the transaction
 * to prevent concurrent settlement races. Validates that the new leg does
 * not cause the cumulative succeeded total to exceed the order snapshot.
 *
 * For split-bill flows the invariant allows partial legs: a single leg
 * paying 1/3 of the total is valid. Only overpayment (cumulative > snapshot)
 * is rejected. Use isFullyPaid to determine order closure.
 */
export async function recordPayment(input: {
  orderId: string;
  amount: bigint;
  tipAmount?: bigint;
  method: PaymentMethod;
  splitType?: SplitType;
  splitMeta?: unknown;
  payerName?: string;
  payerEmail?: string;
  idempotencyKey?: string;
}) {
  if (input.idempotencyKey) {
    const existingByKey = await db.payment.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existingByKey) {
      const order = await db.order.findUniqueOrThrow({
        where: { id: input.orderId },
      });
      return {
        payment: existingByKey,
        fullyPaid: isFullyPaid(order.amountPaid, order.total),
        amountPaid: order.amountPaid,
        deduplicated: true,
      };
    }
  }

  const tip = input.tipAmount ?? 0n;

  const result = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${input.orderId} FOR UPDATE`;

    const order = await tx.order.findUniqueOrThrow({
      where: { id: input.orderId },
      include: { items: true, payments: true },
    });

    const succeededLegs = order.payments.filter((p) => p.status === "succeeded");
    const alreadyPaid = succeededLegs.reduce((s, p) => s + p.amount, 0n);

    const remaining =
      order.total > alreadyPaid ? order.total - alreadyPaid : 0n;

    if (input.amount > remaining) {
      throw new Error(
        `Payment amount ${input.amount} exceeds remaining balance ${remaining}`
      );
    }

    const allLegs = [
      ...succeededLegs.map((p) => ({ amount: p.amount, tipAmount: p.tipAmount })),
      { amount: input.amount, tipAmount: tip },
    ];

    const invariantCheck = validatePaymentLegsAgainstSnapshot(order.total, allLegs);

    if (!invariantCheck.valid) {
      throw new Error(
        `Payment legs exceed order snapshot. ` +
          `Snapshot total: ${invariantCheck.snapshotTotal}, ` +
          `cumulative paid: ${invariantCheck.paidTotal}, ` +
          `overpayment: ${invariantCheck.discrepancy} rial`
      );
    }

    const payment = await tx.payment.create({
      data: {
        vendorId: order.vendorId,
        orderId: order.id,
        amount: input.amount,
        tipAmount: tip,
        total: input.amount + tip,
        currency: order.currency,
        method: input.method,
        status: "succeeded",
        splitType: input.splitType ?? "full",
        splitMeta: input.splitMeta ?? undefined,
        payerName: input.payerName,
        payerEmail: input.payerEmail,
        reference: `pay_${nanoid(16)}`,
        idempotencyKey: input.idempotencyKey,
        verifiedAt: new Date(),
      },
    });

    const newAmountPaid = alreadyPaid + input.amount;
    const fullyPaid = isFullyPaid(newAmountPaid, order.total);

    await tx.order.update({
      where: { id: order.id },
      data: {
        amountPaid: newAmountPaid,
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

    return { payment, fullyPaid, amountPaid: newAmountPaid };
  });

  return { ...result, deduplicated: false };
}

/**
 * Confirms a pending (reserved) payment leg as succeeded.
 *
 * Called after the IPG gateway callback confirms the charge. Acquires a
 * FOR UPDATE lock on the order, re-validates the invariant, marks the
 * Payment row as succeeded, and updates Order.amountPaid atomically.
 *
 * M2 stub: the payment API calls this immediately after initiatePayment
 * (no real gateway redirect). M6 will wire the real IPG callback URL.
 */
export async function confirmPendingPayment(paymentId: string) {
  const pending = await db.payment.findUniqueOrThrow({
    where: { id: paymentId },
  });

  if (pending.status === "succeeded") {
    const order = await db.order.findUniqueOrThrow({
      where: { id: pending.orderId },
    });
    return {
      payment: pending,
      fullyPaid: isFullyPaid(order.amountPaid, order.total),
      amountPaid: order.amountPaid,
      alreadyConfirmed: true,
    };
  }

  const result = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${pending.orderId} FOR UPDATE`;

    const order = await tx.order.findUniqueOrThrow({
      where: { id: pending.orderId },
      include: { payments: true },
    });

    const succeededLegs = order.payments.filter((p) => p.status === "succeeded");
    const alreadyPaid = succeededLegs.reduce((s, p) => s + p.amount, 0n);

    const allLegs = [
      ...succeededLegs.map((p) => ({ amount: p.amount, tipAmount: p.tipAmount })),
      { amount: pending.amount, tipAmount: pending.tipAmount },
    ];

    const invariantCheck = validatePaymentLegsAgainstSnapshot(order.total, allLegs);
    if (!invariantCheck.valid) {
      throw new Error(
        `Invariant violation on confirm: paidTotal ${invariantCheck.paidTotal} ` +
          `exceeds snapshotTotal ${invariantCheck.snapshotTotal}`
      );
    }

    const payment = await tx.payment.update({
      where: { id: paymentId },
      data: { status: "succeeded", verifiedAt: new Date(), expiresAt: null },
    });

    const newAmountPaid = alreadyPaid + pending.amount;
    const fullyPaid = isFullyPaid(newAmountPaid, order.total);

    await tx.order.update({
      where: { id: order.id },
      data: {
        amountPaid: newAmountPaid,
        tipAmount: order.tipAmount + pending.tipAmount,
        status: fullyPaid ? "paid" : order.status,
      },
    });

    if (fullyPaid && order.tableId) {
      await tx.diningTable.update({
        where: { id: order.tableId },
        data: { status: "available" },
      });
    }

    return { payment, fullyPaid, amountPaid: newAmountPaid };
  });

  return { ...result, alreadyConfirmed: false };
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
