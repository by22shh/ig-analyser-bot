import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    restoreMocks: true,
    // Keep test output pristine: suppress expected info/warn logs (e.g. the
    // retention resilience test deliberately triggers a handled cleanup failure).
    env: { LOG_LEVEL: "error" },
    include: ["tests/**/*.test.ts"],
    coverage: {
      reporter: ["text", "lcov"]
    }
  }
});
