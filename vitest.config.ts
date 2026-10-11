import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    // Integration files share one disposable database and some tests flush the
    // global outbox. Keep DB files serial so each fixture owns its rows.
    fileParallelism: process.env.PRONTO_RUN_DB_TESTS !== "1",
    globals: true,
    setupFiles: ["./tests/setup/safety.ts"],
    include: ["tests/unit/**/*.test.ts", "tests/unit/**/*.test.tsx", "tests/integration/**/*.test.ts", "tests/integration/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      thresholds: {
        lines: 54,
        branches: 45,
      },
    },
  },
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
      "server-only": new URL("./node_modules/server-only/empty.js", import.meta.url).pathname,
    },
  },
});
