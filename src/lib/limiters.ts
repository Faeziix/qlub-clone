/**
 * Singleton rate-limiter instances shared across the process lifetime.
 *
 * Each limiter is lazily initialized the first time it is accessed. Production
 * uses the Redis adapter (when REDIS_URL is set); the in-memory adapter is the
 * fallback for dev/single-instance.
 *
 * Windows and caps are aligned with the PRD §11 (Auth & Security):
 *
 *   - Public API endpoints (orders, payments, reviews):
 *       60 requests per 60 s per IP.
 *   - Admin actions (any authenticated mutation):
 *       120 requests per 60 s per user id.
 *   - Login attempts:
 *       5 attempts per 5 min per email — locks out the account key.
 */

import { buildRateLimiter, type RateLimiter } from "./rate-limiter";

type LimiterName = "publicApi" | "adminAction" | "login";

const configs: Record<LimiterName, { windowMs: number; maxRequests: number }> =
  {
    publicApi: { windowMs: 60_000, maxRequests: 60 },
    adminAction: { windowMs: 60_000, maxRequests: 120 },
    login: { windowMs: 5 * 60_000, maxRequests: 5 },
  };

const cache = new Map<LimiterName, RateLimiter>();

export async function getLimiter(name: LimiterName): Promise<RateLimiter> {
  const cached = cache.get(name);
  if (cached) return cached;
  const limiter = await buildRateLimiter(configs[name]);
  cache.set(name, limiter);
  return limiter;
}
