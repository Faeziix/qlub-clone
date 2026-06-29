import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkOrigin } from "@/lib/csrf";
import { getLimiter } from "@/lib/limiters";
import { normalizeTablePublicId, isValidTablePublicId } from "@/lib/table-code";

const TERMINAL_STATUSES = ["paid", "cancelled"] as const;

export async function GET(request: NextRequest) {
  if (!checkOrigin(request)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  const limiter = await getLimiter("publicApi");
  const limit = await limiter.check(`order-active:${ip}`);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) },
      }
    );
  }

  const { searchParams } = request.nextUrl;
  const vendorSlug = searchParams.get("vendor");
  const rawTablePublicId = searchParams.get("tablePublicId");

  if (!vendorSlug || !rawTablePublicId) {
    return NextResponse.json({ error: "missing_params" }, { status: 400 });
  }

  const tablePublicId = normalizeTablePublicId(rawTablePublicId);
  if (!isValidTablePublicId(tablePublicId)) {
    return NextResponse.json({ error: "invalid_table_id" }, { status: 400 });
  }

  const vendor = await db.vendor.findUnique({
    where: { slug: vendorSlug },
    select: { id: true, active: true },
  });
  if (!vendor || !vendor.active) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const table = await db.diningTable.findUnique({
    where: { publicId: tablePublicId },
    select: { id: true, vendorId: true },
  });
  if (!table || table.vendorId !== vendor.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const order = await db.order.findFirst({
    where: {
      vendorId: vendor.id,
      tableId: table.id,
      status: { notIn: [...TERMINAL_STATUSES] },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, orderNumber: true },
  });

  if (!order) {
    return NextResponse.json({ error: "no_open_bill" }, { status: 404 });
  }

  return NextResponse.json({
    id: order.id,
    status: order.status,
    orderNumber: order.orderNumber,
  });
}
