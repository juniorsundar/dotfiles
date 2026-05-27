import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    conditions: ["node"],
  },
  test: {
    include: ["extensions/**/*.test.ts"],
    testTimeout: 15000,
  },
});
