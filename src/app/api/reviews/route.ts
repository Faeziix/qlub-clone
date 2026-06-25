import { NextResponse } from "next/server";
import { z } from "zod";
import { createReview } from "@/lib/orders";

const schema = z.object({
  vendorSlug: z.string(),
  paymentId: z.string(),
  rating: z.number().int().min(1).max(5),
  foodRating: z.number().int().min(1).max(5).optional(),
  serviceRating: z.number().int().min(1).max(5).optional(),
  ambienceRating: z.number().int().min(1).max(5).optional(),
  comment: z.string().max(2000).optional(),
  guestName: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const data = schema.parse(await req.json());
    const review = await createReview(data);
    return NextResponse.json({ ok: true, review });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bad request";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
