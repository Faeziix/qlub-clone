import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { z } from "zod";

const QR_DEFAULT_SIZE = 256;
const QR_MAX_SIZE = 512;
const QR_MIN_SIZE = 64;

const querySchema = z.object({
  data: z.string().min(1).max(2000),
  size: z.coerce
    .number()
    .int()
    .min(QR_MIN_SIZE)
    .max(QR_MAX_SIZE)
    .optional()
    .default(QR_DEFAULT_SIZE),
});

/**
 * GET /api/qr?data=<url>&size=<px>
 *
 * Generates a QR code PNG image server-side using the local `qrcode` library.
 * No third-party image service is involved — the code works entirely within Iran.
 *
 * - `data` (required): the URL or text to encode.
 * - `size` (optional, default 256): output image dimension in pixels (64–512).
 *
 * Returns: `image/png` with aggressive cache headers (QR content is stable).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const raw = {
    data: url.searchParams.get("data") ?? undefined,
    size: url.searchParams.get("size") ?? undefined,
  };

  const parsed = querySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid parameters" },
      { status: 400 }
    );
  }

  const { data, size } = parsed.data;

  try {
    const pngBuffer = await QRCode.toBuffer(data, {
      type: "png",
      width: size,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#000000", light: "#ffffff" },
    });

    return new Response(new Uint8Array(pngBuffer), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Length": String(pngBuffer.length),
      },
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "QR generation failed" },
      { status: 500 }
    );
  }
}
