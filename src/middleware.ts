import createIntlMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { jwtVerify } from "jose";
import { type NextRequest, NextResponse } from "next/server";

const intlMiddleware = createIntlMiddleware(routing);

/**
 * Login paths for all supported locales.
 * When localePrefix is "as-needed", the default locale ("fa") renders without a
 * prefix, so both `/admin/login` and `/fa/admin/login` (if ever used) must be
 * allowed through.
 */
function isAdminLoginPath(pathname: string): boolean {
  return /^(\/[a-z]{2})?\/admin\/login(\/.*)?$/.test(pathname);
}

function isAdminPath(pathname: string): boolean {
  return /^(\/[a-z]{2})?\/admin(\/.*)?$/.test(pathname);
}

function edgeSigningKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

async function verifyAdminSession(request: NextRequest): Promise<boolean> {
  const authSecret = process.env.AUTH_SECRET;
  if (!authSecret) return false;

  const cookie = request.cookies.get("qlub_admin_session")?.value;
  if (!cookie) return false;

  try {
    await jwtVerify(cookie, edgeSigningKey(authSecret));
    return true;
  } catch {
    return false;
  }
}

export default async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isAdminPath(pathname) && !isAdminLoginPath(pathname)) {
    const authenticated = await verifyAdminSession(request);
    if (!authenticated) {
      const loginUrl = new URL("/admin/login", request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  return intlMiddleware(request);
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon\\.svg|.*\\..*).*)",
  ],
};
