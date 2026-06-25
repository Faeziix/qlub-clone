import path from "node:path";
import { defineConfig } from "prisma/config";

// Prisma stops auto-loading .env once a config file exists, so load it
// ourselves (Node 20.12+/22 built-in — no extra dependency).
try {
  process.loadEnvFile(path.join(process.cwd(), ".env"));
} catch {
  // .env is optional (e.g. when DATABASE_URL is already in the environment)
}

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
