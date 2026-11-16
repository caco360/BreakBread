import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config.js";

// A secret long enough to pass the 32-character minimum.
const SECRET = "x".repeat(32);

// The smallest set of variables that is valid in development.
const validEnv = { JWT_SECRET: SECRET, LOGIN_CODE_SECRET: SECRET };

describe("loadConfig", () => {
  it("uses local defaults in development when only the secrets are set", () => {
    const config = loadConfig(validEnv);

    expect(config.nodeEnv).toBe("development");
    expect(config.port).toBe(3000);
    expect(config.databaseUrl).toBe(
      "postgres://breakbread:breakbread@localhost:5432/break_bread",
    );
    expect(config.redisUrl).toBe("redis://localhost:6379");
    expect(config.jwtSecret).toBe(SECRET);
    expect(config.loginCodeSecret).toBe(SECRET);
  });

  it("rejects a missing JWT_SECRET and names it", () => {
    expect(() => loadConfig({ LOGIN_CODE_SECRET: SECRET })).toThrow(/JWT_SECRET/);
  });

  it("rejects a LOGIN_CODE_SECRET shorter than 32 characters", () => {
    expect(() =>
      loadConfig({ JWT_SECRET: SECRET, LOGIN_CODE_SECRET: "x".repeat(10) }),
    ).toThrow(/LOGIN_CODE_SECRET/);
  });

  it("rejects a PORT that is not a number", () => {
    expect(() => loadConfig({ ...validEnv, PORT: "abc" })).toThrow(/PORT/);
  });

  it("names every bad variable in one message", () => {
    expect(() => loadConfig({ PORT: "abc" })).toThrow(
      /JWT_SECRET[\s\S]*LOGIN_CODE_SECRET[\s\S]*PORT|PORT[\s\S]*JWT_SECRET[\s\S]*LOGIN_CODE_SECRET/,
    );
  });

  it("requires DATABASE_URL in production", () => {
    expect(() =>
      loadConfig({ ...validEnv, NODE_ENV: "production", REDIS_URL: "redis://r:6379" }),
    ).toThrow(/DATABASE_URL/);
  });

  it("requires REDIS_URL in production", () => {
    expect(() =>
      loadConfig({ ...validEnv, NODE_ENV: "production", DATABASE_URL: "postgres://d/db" }),
    ).toThrow(/REDIS_URL/);
  });

  it("refuses to run in production until a real email sender exists", () => {
    expect(() =>
      loadConfig({
        ...validEnv,
        NODE_ENV: "production",
        DATABASE_URL: "postgres://d/db",
        REDIS_URL: "redis://r:6379",
      }),
    ).toThrow(/email sender/);
  });
});
