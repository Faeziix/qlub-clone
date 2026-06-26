/**
 * Rate-limiting abstraction with two adapters:
 *
 *  - InMemoryRateLimiter  — fixed-window counter in process memory.
 *    Default for local dev and single-instance deployments when REDIS_URL is
 *    absent. State is lost on restart and not shared across processes.
 *
 *  - RedisRateLimiter     — the same fixed-window algorithm backed by Redis
 *    via INCR + EXPIRE. Survives restarts, shared across all app instances.
 *    Active when REDIS_URL is set in the environment.
 *
 * The `buildRateLimiter` factory selects the adapter at runtime from env.
 *
 * Production MUST set REDIS_URL (e.g. Upstash) for multi-instance correctness.
 * See docs/adr/0015-rate-limiting-csrf-zod-sanitization.md.
 */

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs: number;
}

export interface RateLimiter {
  check(key: string): Promise<RateLimitResult>;
  reset(key: string): Promise<void>;
}

interface WindowOptions {
  windowMs: number;
  maxRequests: number;
}

interface WindowEntry {
  count: number;
  windowStart: number;
}

export class InMemoryRateLimiter implements RateLimiter {
  private readonly windowMs: number;
  private readonly maxRequests: number;
  private readonly store = new Map<string, WindowEntry>();

  constructor({ windowMs, maxRequests }: WindowOptions) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
  }

  async check(key: string): Promise<RateLimitResult> {
    const now = Date.now();
    const entry = this.store.get(key);

    if (!entry || now - entry.windowStart >= this.windowMs) {
      this.store.set(key, { count: 1, windowStart: now });
      return { allowed: true, retryAfterMs: 0 };
    }

    if (entry.count >= this.maxRequests) {
      const retryAfterMs = this.windowMs - (now - entry.windowStart);
      return { allowed: false, retryAfterMs };
    }

    entry.count += 1;
    return { allowed: true, retryAfterMs: 0 };
  }

  async reset(key: string): Promise<void> {
    this.store.delete(key);
  }
}

export class RedisRateLimiter implements RateLimiter {
  private readonly windowMs: number;
  private readonly maxRequests: number;
  private client: unknown;

  constructor({ windowMs, maxRequests }: WindowOptions, client: unknown) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
    this.client = client;
  }

  async check(key: string): Promise<RateLimitResult> {
    const redis = this.client as {
      incr: (k: string) => Promise<number>;
      pexpire: (k: string, ms: number) => Promise<number>;
      pttl: (k: string) => Promise<number>;
    };

    const count = await redis.incr(key);
    if (count === 1) {
      await redis.pexpire(key, this.windowMs);
    }
    if (count > this.maxRequests) {
      const ttlMs = await redis.pttl(key);
      return { allowed: false, retryAfterMs: Math.max(ttlMs, 0) };
    }
    return { allowed: true, retryAfterMs: 0 };
  }

  async reset(key: string): Promise<void> {
    const redis = this.client as { del: (k: string) => Promise<number> };
    await redis.del(key);
  }
}

export async function buildRateLimiter(
  options: WindowOptions
): Promise<RateLimiter> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    return new InMemoryRateLimiter(options);
  }

  try {
    const redisModule = await import(
      /* webpackIgnore: true */ "redis" as string
    );
    const { createClient } = redisModule as {
      createClient: (opts: { url: string }) => {
        connect(): Promise<void>;
        incr(key: string): Promise<number>;
        pexpire(key: string, ms: number): Promise<number>;
        pttl(key: string): Promise<number>;
        del(key: string): Promise<number>;
      };
    };
    const client = createClient({ url: redisUrl });
    await client.connect();
    return new RedisRateLimiter(options, client);
  } catch {
    return new InMemoryRateLimiter(options);
  }
}
