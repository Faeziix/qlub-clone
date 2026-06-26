import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    alias: {
      "@/": new URL("./src/", import.meta.url).pathname,
      "server-only": new URL("./tests/__mocks__/server-only.ts", import.meta.url).pathname,
    },
  },
});
