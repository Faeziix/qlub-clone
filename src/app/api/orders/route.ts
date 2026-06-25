import { NextResponse } from "next/server";
import { z } from "zod";
import { createOrderFromCart } from "@/lib/orders";
import { serializeOrder } from "@/lib/api-serializers";
import { bigintFromJson } from "@/lib/money";

const moneyField = z.union([z.string(), z.number()]);

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
        unitPrice: moneyField,
        quantity: z.number().int().positive(),
        notes: z.string().optional(),
        imageUrl: z.string().nullable().optional(),
        modifiers: z.array(
          z.object({
            groupId: z.string(),
            groupName: z.string(),
            optionId: z.string(),
            optionName: z.string(),
            priceDelta: moneyField,
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
    const normalizedLines = data.lines.map((l) => ({
      ...l,
      unitPrice: Number(bigintFromJson(l.unitPrice)),
      modifiers: l.modifiers.map((m) => ({
        ...m,
        priceDelta: Number(bigintFromJson(m.priceDelta)),
      })),
    }));
    const order = await createOrderFromCart({ ...data, lines: normalizedLines });
    return NextResponse.json({ ok: true, order: serializeOrder(order) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bad request";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
