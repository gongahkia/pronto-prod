import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    environment: "node", fileParallelism: false, maxWorkers: 1,
    setupFiles: ["./tests/setup/safety.ts"], include: ["tests/evals/**/*.test.ts"],
    testTimeout: 30000, hookTimeout: 30000,
  },
  resolve: { alias: {
    "@": new URL("./src", import.meta.url).pathname,
    "server-only": new URL("./node_modules/server-only/empty.js", import.meta.url).pathname,
  } },
});
