import { NextResponse } from "next/server";
import { z } from "zod";
import { createOrderFromCart } from "@/lib/orders";
import { serializeOrder } from "@/lib/api-serializers";

const schema = z.object({
  vendorSlug: z.string(),
  tableCode: z.string().nullable().optional(),
  type: z.enum(["qsr", "dinein"]).optional(),
  guestName: z.string().optional(),
  guestPhone: z.string().optional(),
  notes: z.string().optional(),
  lines: z
    .array(
      z.object({
        lineId: z.string(),
        itemId: z.string(),
        name: z.string(),
        unitPrice: z.number(),
        quantity: z.number().int().positive(),
        notes: z.string().optional(),
        imageUrl: z.string().nullable().optional(),
        modifiers: z.array(
          z.object({
            groupId: z.string(),
            groupName: z.string(),
            optionId: z.string(),
            optionName: z.string(),
            priceDelta: z.number(),
          })
        ),
      })
    )
    .min(1),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const data = schema.parse(body);
    const order = await createOrderFromCart(data);
    return NextResponse.json({ ok: true, order: serializeOrder(order) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bad request";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
