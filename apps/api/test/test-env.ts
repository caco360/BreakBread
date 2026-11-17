// Environment variables for the test run, shared by vitest.config.ts (which
// gives them to the tests) and global-setup.ts (which runs before the tests).

// Tests get their own database so that emptying tables between tests never
// touches the data you create while trying the app in development.
export const TEST_DATABASE_NAME = "break_bread_test";

export const testEnv = {
  NODE_ENV: "test",
  DATABASE_URL: `postgres://breakbread:breakbread@localhost:5432/${TEST_DATABASE_NAME}`,
  // The "/1" picks Redis database number 1. Development uses number 0,
  // so flushing Redis in tests leaves development data alone.
  REDIS_URL: "redis://localhost:6379/1",
  // Fake secrets that only exist so loadConfig accepts the environment.
  JWT_SECRET: "test-only-jwt-secret-0123456789abcdef",
  LOGIN_CODE_SECRET: "test-only-code-secret-0123456789abcdef",
};
