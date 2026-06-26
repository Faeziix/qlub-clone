const MISSING_AUTH_SECRET_MESSAGE =
  "AUTH_SECRET is not set. Refusing to start: a signing secret is required to issue and verify admin sessions.";

export function requireAuthSecret() {
  const configuredSecret = process.env.AUTH_SECRET;
  if (!configuredSecret) {
    throw new Error(MISSING_AUTH_SECRET_MESSAGE);
  }
  return configuredSecret;
}

export function assertServerEnv() {
  requireAuthSecret();
}

export function isDemoSeedingEnabled() {
  return process.env.NODE_ENV !== "production" && process.env.SEED_DEMO === "true";
}

export function redisUrl(): string | undefined {
  return process.env.REDIS_URL || undefined;
}
