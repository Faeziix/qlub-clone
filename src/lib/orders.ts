import "server-only";
import { db } from "./db";
import { computeBill, lineTotal } from "./pricing";
import { nanoid } from "nanoid";
import { Prisma, OrderStatus } from "@prisma/client";
import type { CartLine, PaymentMethod, SplitType } from "./types";
import type { SubChargeChunk } from "./payment/ceiling-split";

const LEG_RESERVATION_TTL_MS = 15 * 60 * 1000;

type TxClient = Parameters<Parameters<typeof db.$transaction>[0]>[0];

async function nextVendorOrderNumber(tx: TxClient, vendorId: string): Promise<string> {
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

async function resolveLinePricesInsideTx(
  tx: TxClient,
  vendorId: string,
  lines: CartLine[]
): Promise<ResolvedLine[]> {
  const itemIds = [...new Set(lines.map((l) => l.itemId))];
  const modifierOptionIds = [
    ...new Set(lines.flatMap((l) => l.modifiers.map((m) => m.optionId))),
  ];

  const [dbItems, dbOptions] = await Promise.all([
    tx.menuItem.findMany({
      where: { id: { in: itemIds }, vendorId },
      select: { id: true, price: true },
    }),
    modifierOptionIds.length
      ? tx.modifierOption.findMany({
          where: { id: { in: modifierOptionIds }, group: { item: { vendorId } } },
          select: { id: true, priceDelta: true },
        })
      : Promise.resolve([] as { id: string; priceDelta: bigint }[]),
  ]);

  const itemPriceById = new Map(dbItems.map((i) => [i.id, i.price]));
  const optionDeltaById = new Map(dbOptions.map((o) => [o.id, o.priceDelta]));

  return lines.map((line) => {
    const dbPrice = itemPriceById.get(line.itemId);
    if (dbPrice === undefined) {
      throw new Error(
        `MenuItem ${line.itemId} not found for vendor ${vendorId} — cannot trust client price`
      );
    }
    const resolvedUnitPrice = dbPrice;

    const resolvedModifiers = line.modifiers.map((mod) => {
      const dbDelta = optionDeltaById.get(mod.optionId);
      if (dbDelta === undefined) {
        throw new Error(
          `ModifierOption ${mod.optionId} not found for vendor ${vendorId} — cannot trust client delta`
        );
      }
      return { ...mod, priceDelta: dbDelta };
    });

    return { ...line, unitPrice: resolvedUnitPrice, modifiers: resolvedModifiers, resolvedUnitPrice };
  });
}

function detectPriceChange(original: CartLine[], resolved: ResolvedLine[]): boolean {
  return resolved.some((resolvedLine, idx) => {
    const originalLine = original[idx];
    if (resolvedLine.resolvedUnitPrice !== originalLine.unitPrice) return true;
    return resolvedLine.modifiers.some((rmod, midx) => {
      const omod = originalLine.modifiers[midx];
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
  if (!vendor.active) throw new Error("Vendor is suspended");
  if (!input.lines.length) throw new Error("Cart is empty");

  const table = input.tableCode
    ? await db.diningTable.findFirst({
        where: { vendorId: vendor.id, code: input.tableCode },
      })
    : null;

  const order = await db.$transaction(async (tx) => {
    const resolvedLines = await resolveLinePricesInsideTx(tx, vendor.id, input.lines);
    const priceChanged = detectPriceChange(input.lines, resolvedLines);

    const bill = computeBill(resolvedLines, {
      serviceChargePct: vendor.serviceChargePct,
      taxPct: vendor.taxPct,
      taxInclusive: vendor.taxInclusive,
    });

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

    return { ...created, priceChanged };
  });

  return { order, priceChanged: order.priceChanged };
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
  return db.$transaction(async (tx) => {
    const existingRows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Payment"
      WHERE "idempotencyKey" = ${input.idempotencyKey}
      LIMIT 1
    `;
    if (existingRows.length > 0) {
      const existing = await tx.payment.findUnique({ where: { id: existingRows[0].id } });
      if (existing) return existing;
    }

    const orderRows = await tx.$queryRaw<
      {
        id: string;
        "vendorId": string;
        "currency": string;
        "total": bigint;
        "amountPaid": bigint;
        "tableId": string | null;
      }[]
    >`
      SELECT id, "vendorId", currency, total, "amountPaid", "tableId"
      FROM "Order"
      WHERE id = ${input.orderId}
      FOR UPDATE
    `;
    if (!orderRows.length) throw new Error("Order not found");
    const orderRow = orderRows[0];

    const pendingPayments = await tx.$queryRaw<{ amount: bigint }[]>`
      SELECT amount FROM "Payment"
      WHERE "orderId" = ${input.orderId}
        AND status = 'pending'
        AND "expiresAt" > NOW()
    `;

    const reservedBalance = pendingPayments.reduce((s, p) => s + p.amount, 0n);
    const remaining = orderRow.total - orderRow.amountPaid - reservedBalance;

    if (remaining <= 0n) {
      throw new Error("Order is already fully paid or reserved");
    }
    if (input.amount > remaining) {
      throw new Error(`Requested amount exceeds remaining balance (${remaining})`);
    }

    const expiresAt = new Date(Date.now() + LEG_RESERVATION_TTL_MS);

    return tx.payment.create({
      data: {
        vendorId: orderRow.vendorId,
        orderId: orderRow.id,
        amount: input.amount,
        tipAmount: input.tipAmount,
        total: input.amount + input.tipAmount,
        currency: orderRow.currency,
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

/**
 * Creates multiple pending Payment rows for a ceiling-split leg (PRD §6.4).
 * Each chunk becomes a separate Payment row linked via parentPaymentId.
 * parentPaymentId is a synthetic group key (not a FK to Payment) — it links
 * all sub-charges in a split group so the sweep and fullyPaid check can
 * enumerate them.
 *
 * The order is not credited until ALL sub-charge callbacks verify (each call
 * to recordPaymentVerified increments amountPaid by that chunk's amount).
 *
 * Idempotent: repeated calls with the same baseIdempotencyKey return the
 * existing sub-charge rows without creating duplicates.
 *
 * Returns sub-charge Payment rows in chunk order. The caller sends each
 * one to the gateway sequentially (first immediately; subsequent ones after
 * each prior sub-charge succeeds).
 */
export async function initiateSubChargeLegs(input: {
  orderId: string;
  chunks: SubChargeChunk[];
  method: PaymentMethod;
  baseIdempotencyKey: string;
  splitType?: SplitType;
  splitMeta?: Record<string, unknown> | null;
  payerName?: string;
  payerEmail?: string;
}) {
  return db.$transaction(async (tx) => {
    const firstSubKey = `${input.baseIdempotencyKey}_sub0`;
    const existingFirst = await tx.$queryRaw<{ id: string; parentPaymentId: string | null }[]>`
      SELECT id, "parentPaymentId" FROM "Payment"
      WHERE "idempotencyKey" = ${firstSubKey}
      LIMIT 1
    `;
    if (existingFirst.length > 0 && existingFirst[0].parentPaymentId) {
      const subCharges = await tx.payment.findMany({
        where: { parentPaymentId: existingFirst[0].parentPaymentId },
        orderBy: { createdAt: "asc" },
      });
      if (subCharges.length > 0) return subCharges;
    }

    const orderRows = await tx.$queryRaw<
      { id: string; vendorId: string; currency: string; total: bigint; amountPaid: bigint }[]
    >`
      SELECT id, "vendorId", currency, total, "amountPaid"
      FROM "Order"
      WHERE id = ${input.orderId}
      FOR UPDATE
    `;
    if (!orderRows.length) throw new Error("Order not found");
    const orderRow = orderRows[0];

    const pendingPayments = await tx.$queryRaw<{ amount: bigint }[]>`
      SELECT amount FROM "Payment"
      WHERE "orderId" = ${input.orderId}
        AND status = 'pending'
        AND "expiresAt" > NOW()
    `;

    const reservedBalance = pendingPayments.reduce((s, p) => s + p.amount, 0n);
    const remaining = orderRow.total - orderRow.amountPaid - reservedBalance;
    const totalSplitAmount = input.chunks.reduce((s, c) => s + c.amount, 0n);

    if (remaining <= 0n) throw new Error("Order is already fully paid or reserved");
    if (totalSplitAmount > remaining) {
      throw new Error(`Split amount exceeds remaining balance (${remaining})`);
    }

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const groupId = `csg_${nanoid(16)}`;

    const subCharges = await Promise.all(
      input.chunks.map((chunk, idx) =>
        tx.payment.create({
          data: {
            vendorId: orderRow.vendorId,
            orderId: orderRow.id,
            amount: chunk.amount,
            tipAmount: chunk.tipAmount,
            total: chunk.gatewayTotal,
            currency: orderRow.currency,
            method: input.method,
            status: "pending",
            splitType: input.splitType ?? "full",
            splitMeta: input.splitMeta
              ? (input.splitMeta as Prisma.InputJsonValue)
              : Prisma.DbNull,
            payerName: input.payerName,
            payerEmail: input.payerEmail,
            reference: `pay_${nanoid(16)}`,
            idempotencyKey: `${input.baseIdempotencyKey}_sub${idx}`,
            parentPaymentId: groupId,
            expiresAt,
          },
        })
      )
    );

    return subCharges;
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
  const result = await db.$transaction(async (tx) => {
    if (input.idempotencyKey) {
      const existingRows = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Payment"
        WHERE "idempotencyKey" = ${input.idempotencyKey}
        LIMIT 1
      `;
      if (existingRows.length > 0) {
        const existing = await tx.payment.findUnique({ where: { id: existingRows[0].id } });
        if (existing) {
          const order = await tx.order.findUnique({ where: { id: input.orderId } });
          return {
            payment: existing,
            fullyPaid: order ? order.amountPaid >= order.total : false,
            amountPaid: order?.amountPaid ?? 0n,
            idempotent: true,
          };
        }
      }
    }

    const orderRows = await tx.$queryRaw<
      {
        id: string;
        vendorId: string;
        currency: string;
        total: bigint;
        amountPaid: bigint;
        tipAmount: bigint;
        tableId: string | null;
        status: OrderStatus;
      }[]
    >`
      SELECT id, "vendorId", currency, total, "amountPaid", "tipAmount", "tableId", status
      FROM "Order"
      WHERE id = ${input.orderId}
      FOR UPDATE
    `;
    if (!orderRows.length) throw new Error("Order not found");
    const orderRow = orderRows[0];

    const tip = input.tipAmount ?? 0n;
    const total = input.amount + tip;

    const payment = await tx.payment.create({
      data: {
        vendorId: orderRow.vendorId,
        orderId: orderRow.id,
        amount: input.amount,
        tipAmount: tip,
        total,
        currency: orderRow.currency,
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

    const amountPaid = orderRow.amountPaid + input.amount;
    const fullyPaid = amountPaid >= orderRow.total;

    await tx.order.update({
      where: { id: orderRow.id },
      data: {
        amountPaid,
        tipAmount: orderRow.tipAmount + tip,
        status: fullyPaid ? "paid" : orderRow.status,
      },
    });

    if (fullyPaid && orderRow.tableId) {
      await tx.diningTable.update({
        where: { id: orderRow.tableId },
        data: { status: "available" },
      });
    }

    return { payment, fullyPaid, amountPaid, idempotent: false };
  });

  return result;
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
  if (!vendor.active) throw new Error("Vendor is suspended");

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
