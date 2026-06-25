import path from "node:path";
import { defineConfig } from "prisma/config";

// Prisma stops auto-loading .env once a config file exists, so load it
// ourselves (Node 20.12+/22 built-in — no extra dependency).
// Try .env first; fall back to .env.local (Next.js convention).
for (const envFile of [".env", ".env.local"]) {
  try {
    process.loadEnvFile(path.join(process.cwd(), envFile));
  } catch {
    // file not present — continue
  }
}

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
