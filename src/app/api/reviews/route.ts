import { NextResponse } from "next/server";
import { z } from "zod";
import { createReview } from "@/lib/orders";
import { checkOrigin } from "@/lib/csrf";
import { getLimiter } from "@/lib/limiters";
import { sanitizeFreeText } from "@/lib/sanitize";

const schema = z.object({
  vendorSlug: z.string().min(1).max(100),
  paymentId: z.string().min(1).max(100),
  rating: z.number().int().min(1).max(5),
  foodRating: z.number().int().min(1).max(5).optional(),
  serviceRating: z.number().int().min(1).max(5).optional(),
  ambienceRating: z.number().int().min(1).max(5).optional(),
  comment: z.string().max(2000).optional(),
  guestName: z.string().max(100).optional(),
});

export async function POST(req: Request) {
  if (!checkOrigin(req)) {
    return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const limiter = await getLimiter("publicApi");
  const limit = await limiter.check(`reviews:${ip}`);
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
    const data = schema.parse(await req.json());
    const review = await createReview({
      ...data,
      comment: data.comment ? sanitizeFreeText(data.comment) : undefined,
      guestName: data.guestName ? sanitizeFreeText(data.guestName, 100) : undefined,
    });
    return NextResponse.json({ ok: true, review });
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  }
}
