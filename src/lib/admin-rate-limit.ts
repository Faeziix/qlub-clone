import { getLimiter } from "./limiters";

/**
 * Guard every authenticated admin mutation against the `adminAction` limiter.
 *
 * The limiter is keyed by `admin:<userId>` so each staff member has an
 * independent 120-req/min window.  Exceeding the cap throws so callers can
 * rely on a simple `await checkAdminActionLimit(session.id)` guard without
 * an `if/else` branch at every call site.
 *
 * Production uses the Redis adapter (shared across all app instances) when
 * `REDIS_URL` is set; in-memory fallback is used for local dev.
 * See docs/adr/0015-rate-limiting-csrf-zod-sanitization.md.
 */
export async function checkAdminActionLimit(userId: string): Promise<void> {
  const limiter = await getLimiter("adminAction");
  const result = await limiter.check(`admin:${userId}`);
  if (!result.allowed) {
    throw new Error("Too many requests — please slow down.");
  }
}
