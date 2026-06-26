import { NextResponse } from "next/server";
import { z } from "zod";
import { createOrderFromCart } from "@/lib/orders";
import { serializeOrder } from "@/lib/api-serializers";
import { bigintFromJson } from "@/lib/money";
import { checkOrigin } from "@/lib/csrf";
import { getLimiter } from "@/lib/limiters";
import { sanitizeFreeText } from "@/lib/sanitize";

const moneyField = z.union([z.string(), z.number()]);

const schema = z.object({
  vendorSlug: z.string().min(1).max(100),
  tableCode: z.string().max(50).nullable().optional(),
  type: z.enum(["qsr", "dinein"]).optional(),
  guestName: z.string().max(100).optional(),
  guestPhone: z.string().max(20).optional(),
  notes: z.string().max(2000).optional(),
  lines: z
    .array(
      z.object({
        lineId: z.string().max(100),
        itemId: z.string().max(100),
        name: z.string().max(200),
        unitPrice: moneyField,
        quantity: z.number().int().positive().max(99),
        notes: z.string().max(500).optional(),
        imageUrl: z.string().url().nullable().optional(),
        modifiers: z.array(
          z.object({
            groupId: z.string().max(100),
            groupName: z.string().max(200),
            optionId: z.string().max(100),
            optionName: z.string().max(200),
            priceDelta: moneyField,
          })
        ),
      })
    )
    .min(1)
    .max(50),
});

export async function POST(req: Request) {
  if (!checkOrigin(req)) {
    return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const limiter = await getLimiter("publicApi");
  const limit = await limiter.check(`orders:${ip}`);
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many requests" },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)),
        },
      }
    );
  }

  try {
    const body = await req.json();
    const data = schema.parse(body);

    const sanitizedData = {
      ...data,
      guestName: data.guestName ? sanitizeFreeText(data.guestName, 100) : undefined,
      notes: data.notes ? sanitizeFreeText(data.notes) : undefined,
      lines: data.lines.map((l) => ({
        ...l,
        unitPrice: bigintFromJson(l.unitPrice),
        notes: l.notes ? sanitizeFreeText(l.notes, 500) : undefined,
        modifiers: l.modifiers.map((m) => ({
          ...m,
          priceDelta: bigintFromJson(m.priceDelta),
        })),
      })),
    };

    const { order, priceChanged } = await createOrderFromCart(sanitizedData);
    return NextResponse.json({ ok: true, order: serializeOrder(order), priceChanged });
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  }
}
