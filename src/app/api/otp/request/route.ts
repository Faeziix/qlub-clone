import { NextResponse } from "next/server";
import { z } from "zod";
import { requestOtp, SmsUnavailableError, OtpRateLimitError } from "@/lib/otp";
import { checkOrigin } from "@/lib/csrf";
import { getLimiter } from "@/lib/limiters";
import { sanitizeFreeText } from "@/lib/sanitize";
import { PhoneNormalizationError } from "@/lib/phone";

const schema = z.object({
  phone: z.string().min(8).max(20),
});

export async function POST(req: Request) {
  if (!checkOrigin(req)) {
    return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  const limiter = await getLimiter("publicApi");
  const limit = await limiter.check(`otp:${ip}`);
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

  const rawPhone = sanitizeFreeText(parsed.data.phone, 20);

  try {
    const result = await requestOtp({ rawPhone, ip });
    return NextResponse.json({ ok: true, phoneE164: result.phoneE164 });
  } catch (err) {
    if (err instanceof PhoneNormalizationError) {
      return NextResponse.json(
        { ok: false, error: "Invalid phone number" },
        { status: 400 }
      );
    }
    if (err instanceof OtpRateLimitError) {
      return NextResponse.json(
        { ok: false, error: "Too many requests" },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil(err.retryAfterMs / 1000)),
          },
        }
      );
    }
    if (err instanceof SmsUnavailableError) {
      return NextResponse.json(
        { ok: false, error: "sms_unavailable", degraded: true },
        { status: 503 }
      );
    }
    return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  }
}
