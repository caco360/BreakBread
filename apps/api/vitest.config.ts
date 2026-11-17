import { defineConfig } from "vitest/config";
import { testEnv } from "./test/test-env.js";

export default defineConfig({
  test: {
    // Environment variables every test sees.
    env: testEnv,
    // All test files share one Postgres and one Redis, so run one file at a
    // time. Otherwise two files could change the same rows at once.
    fileParallelism: false,
    // Runs once before all tests: creates the test database and applies migrations.
    globalSetup: "./test/global-setup.ts",
  },
});
