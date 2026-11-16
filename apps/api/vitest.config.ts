import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Environment variables for the test run. These secrets are fake and
    // only exist so loadConfig accepts the environment.
    env: {
      NODE_ENV: "test",
      JWT_SECRET: "test-only-jwt-secret-0123456789abcdef",
      LOGIN_CODE_SECRET: "test-only-code-secret-0123456789abcdef",
    },
    // All test files share one Postgres and one Redis, so run one file at a
    // time. Otherwise two files could change the same rows at once.
    fileParallelism: false,
  },
});
