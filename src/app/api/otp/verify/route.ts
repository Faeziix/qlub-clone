import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyOtp, OtpInvalidError, OtpMaxAttemptsError } from "@/lib/otp";
import { db } from "@/lib/db";
import { checkOrigin } from "@/lib/csrf";
import { getLimiter } from "@/lib/limiters";
import { PhoneNormalizationError } from "@/lib/phone";

const schema = z.object({
  phone: z.string().min(8).max(20),
  code: z.string().min(4).max(8),
  orderId: z.string().min(1).max(100).optional(),
});

export async function POST(req: Request) {
  if (!checkOrigin(req)) {
    return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  const limiter = await getLimiter("publicApi");
  const limit = await limiter.check(`otp-verify:${ip}`);
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many requests" },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) },
      }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  }

  try {
    const result = await verifyOtp({
      rawPhone: parsed.data.phone,
      code: parsed.data.code,
    });

    if (parsed.data.orderId) {
      await db.order.updateMany({
        where: {
          id: parsed.data.orderId,
          guestPhone: result.phoneE164,
        },
        data: { phoneVerifiedAt: new Date() },
      });
    }

    return NextResponse.json({ ok: true, phoneE164: result.phoneE164 });
  } catch (err) {
    if (err instanceof PhoneNormalizationError) {
      return NextResponse.json(
        { ok: false, error: "Invalid phone number" },
        { status: 400 }
      );
    }
    if (err instanceof OtpInvalidError) {
      return NextResponse.json(
        { ok: false, error: "invalid_otp" },
        { status: 422 }
      );
    }
    if (err instanceof OtpMaxAttemptsError) {
      return NextResponse.json(
        { ok: false, error: "max_attempts_exceeded" },
        { status: 429 }
      );
    }
    return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  }
}
