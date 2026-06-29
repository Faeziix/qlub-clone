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

function isSuperadminPath(pathname: string): boolean {
  return /^(\/[a-z]{2})?\/admin\/superadmin(\/.*)?$/.test(pathname);
}

function isVendorAdminPath(pathname: string): boolean {
  return (
    /^(\/[a-z]{2})?\/admin\/(orders|order-entry|menu|tables|reviews|settings)(\/.*)?$/.test(pathname) ||
    /^(\/[a-z]{2})?\/admin$/.test(pathname)
  );
}

function edgeSigningKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

type EdgeSessionPayload = { role?: string };

async function verifyAdminSession(
  request: NextRequest
): Promise<{ authenticated: boolean; payload: EdgeSessionPayload }> {
  const authSecret = process.env.AUTH_SECRET;
  if (!authSecret) return { authenticated: false, payload: {} };

  const cookie = request.cookies.get("qlub_admin_session")?.value;
  if (!cookie) return { authenticated: false, payload: {} };

  try {
    const { payload } = await jwtVerify(cookie, edgeSigningKey(authSecret));
    return { authenticated: true, payload: payload as EdgeSessionPayload };
  } catch {
    return { authenticated: false, payload: {} };
  }
}

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isAdminPath(pathname) && !isAdminLoginPath(pathname)) {
    const { authenticated, payload } = await verifyAdminSession(request);
    if (!authenticated) {
      const loginUrl = new URL("/admin/login", request.url);
      return NextResponse.redirect(loginUrl);
    }

    if (isSuperadminPath(pathname) && payload.role !== "superadmin") {
      return NextResponse.redirect(new URL("/admin", request.url));
    }

    if (isVendorAdminPath(pathname) && payload.role === "superadmin") {
      return NextResponse.redirect(new URL("/admin/superadmin", request.url));
    }
  }

  return intlMiddleware(request);
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon\\.svg|.*\\..*).*)",
  ],
};
