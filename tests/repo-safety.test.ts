import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function trackedFiles() {
  return execFileSync("git", ["ls-files"], { cwd: repoRoot, encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
}

function read(relativePath: string) {
  return readFileSync(resolve(repoRoot, relativePath), "utf8");
}

describe("repository safety hardening", () => {
  it("does not track a committed .env file", () => {
    expect(trackedFiles()).not.toContain(".env");
  });

  it("ignores .env via .gitignore", () => {
    expect(read(".gitignore")).toMatch(/^\.env$/m);
  });

  it("has deleted the token-forging mint-token script", () => {
    expect(existsSync(resolve(repoRoot, "scripts/mint-token.ts"))).toBe(false);
  });

  const scannableSourceFiles = () =>
    trackedFiles().filter(
      (file) => !file.startsWith("docs/") && !file.endsWith(".test.ts")
    );

  it("contains no hardcoded dev auth-secret fallback anywhere", () => {
    for (const file of scannableSourceFiles()) {
      expect(read(file), file).not.toContain("dev-secret-change-me");
    }
  });

  it("contains no password123 anywhere in tracked source", () => {
    for (const file of scannableSourceFiles()) {
      expect(read(file), file).not.toContain("password123");
    }
  });

  it("ships no pre-filled credentials on the admin login form", () => {
    const loginForm = read(
      "src/app/[locale]/admin/login/_components/LoginForm.tsx"
    );
    expect(loginForm).not.toMatch(/defaultValue=/);
  });

  it("gates the demo-account list behind a non-prod flag", () => {
    const loginPage = read("src/app/[locale]/admin/login/page.tsx");
    expect(loginPage).toContain("isDemoSeedingEnabled");
  });

  it("seeds cryptographically-random table passcodes and staff passwords", () => {
    const seed = read("prisma/seed.ts");
    expect(seed).toContain("randomInt");
    expect(seed).toContain("randomBytes");
  });
});
