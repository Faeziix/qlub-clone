import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    alias: {
      "@/": new URL("./src/", import.meta.url).pathname,
      "server-only": resolve(__dirname, "src/__mocks__/server-only.ts"),
    },
  },
});
