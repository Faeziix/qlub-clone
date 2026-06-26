/**
 * CSRF / origin check for public POST routes.
 *
 * Strategy: compare the `Origin` request header against the request host. A
 * same-origin request (browser) and a no-Origin request (server-to-server,
 * curl, Postman) are both allowed. A cross-origin `Origin` is rejected.
 *
 * This is a defense-in-depth layer that mitigates naive CSRF attacks where a
 * third-party page posts a form or XHR to our API. It is not a full CSRF-token
 * scheme; the cookie is already `SameSite: lax`, which covers most cases.
 *
 * Allowed origins are resolved from:
 *   1. NEXT_PUBLIC_APP_URL env var (explicit production URL).
 *   2. The Host header on the incoming request.
 *   3. localhost (always, for local dev).
 */

const LOCALHOST_ORIGINS = new Set([
  "http://localhost:3000",
  "http://localhost",
  "http://127.0.0.1:3000",
  "http://127.0.0.1",
]);

function allowedOrigins(request: Request): Set<string> {
  const allowed = new Set<string>(LOCALHOST_ORIGINS);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl) allowed.add(appUrl.replace(/\/$/, ""));

  const host = request.headers.get("host");
  if (host) {
    const isLocalhost =
      host.startsWith("localhost") || host.startsWith("127.0.0.1");
    const scheme = isLocalhost ? "http" : "https";
    allowed.add(`${scheme}://${host}`);
  }

  return allowed;
}

export function checkOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin === null) return true;
  if (origin === "") return false;
  return allowedOrigins(request).has(origin);
}
