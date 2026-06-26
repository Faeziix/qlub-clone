import { NextResponse } from "next/server";
import { z } from "zod";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { bigintToNumber } from "@/lib/money";
import type { SessionUser } from "@/lib/types";

const COOKIE = "qlub_admin_session";
const PAGE_SIZE = 40;

function signingKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(secret);
}

async function resolveAdminSession(req: Request): Promise<SessionUser | null> {
  const authHeader = req.headers.get("authorization");
  let token: string | undefined;

  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.slice(7);
  } else {
    const jar = await cookies();
    token = jar.get(COOKIE)?.value;
  }

  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, signingKey());
    return {
      id: payload.id as string,
      email: payload.email as string,
      name: payload.name as string,
      role: payload.role as SessionUser["role"],
      vendorId: (payload.vendorId as string | null) ?? null,
    };
  } catch {
    return null;
  }
}

const querySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(PAGE_SIZE),
  status: z
    .enum(["open", "placed", "preparing", "ready", "served", "paid", "cancelled"])
    .optional(),
  vendorId: z.string().optional(),
});

export async function GET(req: Request) {
  const session = await resolveAdminSession(req);
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid query params" }, { status: 400 });
  }

  const { cursor, limit, status, vendorId: queriedVendorId } = parsed.data;

  const effectiveVendorId =
    session.role === "superadmin"
      ? (queriedVendorId ?? undefined)
      : (session.vendorId ?? undefined);

  if (session.role !== "superadmin" && !effectiveVendorId) {
    return NextResponse.json({ ok: false, error: "No vendor scope" }, { status: 403 });
  }

  const where = {
    ...(effectiveVendorId ? { vendorId: effectiveVendorId } : {}),
    ...(status ? { status } : {}),
    ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
  };

  const orders = await db.order.findMany({
    where,
    include: {
      items: true,
      payments: true,
      table: { select: { label: true, code: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
  });

  const hasMore = orders.length > limit;
  const page = hasMore ? orders.slice(0, limit) : orders;
  const nextCursor = hasMore ? page[page.length - 1]?.createdAt.toISOString() : null;

  const serialized = page.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    type: o.type,
    status: o.status,
    source: o.source,
    guestName: o.guestName,
    guestPhone: o.guestPhone,
    notes: o.notes,
    currency: o.currency,
    subtotal: bigintToNumber(o.subtotal),
    serviceCharge: bigintToNumber(o.serviceCharge),
    tax: bigintToNumber(o.tax),
    discount: bigintToNumber(o.discount),
    tipAmount: bigintToNumber(o.tipAmount),
    total: bigintToNumber(o.total),
    amountPaid: bigintToNumber(o.amountPaid),
    createdAt: o.createdAt.toISOString(),
    tableLabel: o.table?.label ?? null,
    tableCode: o.table?.code ?? null,
    items: o.items.map((it) => ({
      id: it.id,
      name: it.name,
      unitPrice: bigintToNumber(it.unitPrice),
      quantity: it.quantity,
      modifiers: it.modifiers,
      notes: it.notes,
      lineTotal: bigintToNumber(it.lineTotal),
    })),
    payments: o.payments.map((p) => ({
      id: p.id,
      amount: bigintToNumber(p.amount),
      tipAmount: bigintToNumber(p.tipAmount),
      total: bigintToNumber(p.total),
      method: p.method,
      status: p.status,
      payerName: p.payerName,
      reference: p.reference,
      parentPaymentId: p.parentPaymentId,
    })),
  }));

  return NextResponse.json({ ok: true, orders: serialized, nextCursor, hasMore });
}
