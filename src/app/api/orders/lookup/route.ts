import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkOrigin } from "@/lib/csrf";
import { getLimiter } from "@/lib/limiters";
import { normalizeDigits } from "@/lib/digit-normalizer";

export async function GET(request: NextRequest) {
  if (!checkOrigin(request)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  const limiter = await getLimiter("publicApi");
  const limit = await limiter.check(`order-lookup:${ip}`);
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
  const rawOrderNumber = searchParams.get("order");

  if (!vendorSlug || !rawOrderNumber) {
    return NextResponse.json({ error: "missing_params" }, { status: 400 });
  }

  const normalizedOrderNumber = normalizeDigits(rawOrderNumber.trim()).toUpperCase();
  if (!normalizedOrderNumber) {
    return NextResponse.json({ error: "invalid_order_number" }, { status: 400 });
  }

  const vendor = await db.vendor.findUnique({
    where: { slug: vendorSlug },
    select: { id: true, active: true },
  });
  if (!vendor || !vendor.active) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const order = await db.order.findUnique({
    where: {
      vendorId_orderNumber: {
        vendorId: vendor.id,
        orderNumber: normalizedOrderNumber,
      },
    },
    select: { id: true, status: true },
  });

  if (!order) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ id: order.id, status: order.status });
}
