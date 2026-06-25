import { afterEach, describe, expect, it, vi } from "vitest";
import { assertServerEnv, isDemoSeedingEnabled, requireAuthSecret } from "./env";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("requireAuthSecret", () => {
  it("throws when AUTH_SECRET is unset", () => {
    vi.stubEnv("AUTH_SECRET", undefined);
    expect(() => requireAuthSecret()).toThrowError(/AUTH_SECRET/);
  });

  it("throws when AUTH_SECRET is an empty string", () => {
    vi.stubEnv("AUTH_SECRET", "");
    expect(() => requireAuthSecret()).toThrowError(/AUTH_SECRET/);
  });

  it("returns the configured secret when present", () => {
    vi.stubEnv("AUTH_SECRET", "a-real-strong-secret-value");
    expect(requireAuthSecret()).toBe("a-real-strong-secret-value");
  });

  it("never falls back to a hardcoded development secret", () => {
    vi.stubEnv("AUTH_SECRET", undefined);
    expect(() => requireAuthSecret()).toThrow();
    vi.stubEnv("AUTH_SECRET", "configured");
    expect(requireAuthSecret()).not.toContain("dev-secret-change-me");
  });
});

describe("assertServerEnv", () => {
  it("throws at startup when AUTH_SECRET is missing", () => {
    vi.stubEnv("AUTH_SECRET", undefined);
    expect(() => assertServerEnv()).toThrowError(/AUTH_SECRET/);
  });

  it("passes when AUTH_SECRET is set", () => {
    vi.stubEnv("AUTH_SECRET", "configured");
    expect(() => assertServerEnv()).not.toThrow();
  });
});

describe("isDemoSeedingEnabled", () => {
  it("is disabled in production even when SEED_DEMO is true", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SEED_DEMO", "true");
    expect(isDemoSeedingEnabled()).toBe(false);
  });

  it("is disabled outside production when SEED_DEMO is not set", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("SEED_DEMO", undefined);
    expect(isDemoSeedingEnabled()).toBe(false);
  });

  it("is enabled only outside production with SEED_DEMO=true", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("SEED_DEMO", "true");
    expect(isDemoSeedingEnabled()).toBe(true);
  });
});
