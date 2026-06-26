import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkOrigin } from "@/lib/csrf";

export async function GET(request: NextRequest) {
  if (!checkOrigin(request)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { searchParams } = request.nextUrl;
  const vendorSlug = searchParams.get("vendor");
  const rawOrderNumber = searchParams.get("order");

  if (!vendorSlug || !rawOrderNumber) {
    return NextResponse.json({ error: "missing_params" }, { status: 400 });
  }

  const normalizedOrderNumber = rawOrderNumber.trim();
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
