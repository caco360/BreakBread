import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { config } from "../src/config.js";
import { createDbPool } from "../src/db.js";
import { createRedis } from "../src/redis.js";

// Nothing listens on port 1, so connecting to it fails immediately.
// That lets us simulate "Postgres is down" or "Redis is down".
const DEAD_POSTGRES_URL = "postgres://lunch:lunch@localhost:1/lunch_now";
const DEAD_REDIS_URL = "redis://localhost:1";

describe("GET /health", () => {
  let app: FastifyInstance;

  // Each test builds its own app with different connections.
  async function startApp(databaseUrl: string, redisUrl: string): Promise<void> {
    app = buildApp({
      db: createDbPool(databaseUrl),
      redis: createRedis(redisUrl),
    });
    // ready() finishes Fastify's setup without opening a port.
    await app.ready();
  }

  // Closing the app also closes its Postgres and Redis connections.
  afterEach(async () => {
    await app.close();
  });

  it("returns 200 when Postgres and Redis are both reachable", async () => {
    await startApp(config.databaseUrl, config.redisUrl);

    // app.server is the plain Node HTTP server that Fastify wraps.
    const response = await request(app.server).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok", postgres: "up", redis: "up" });
  });

  it("returns 503 when Postgres is unreachable", async () => {
    await startApp(DEAD_POSTGRES_URL, config.redisUrl);

    const response = await request(app.server).get("/health");

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      status: "unavailable",
      postgres: "down",
      redis: "up",
    });
  });

  it("returns 503 when Redis is unreachable", async () => {
    await startApp(config.databaseUrl, DEAD_REDIS_URL);

    const response = await request(app.server).get("/health");

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      status: "unavailable",
      postgres: "up",
      redis: "down",
    });
  });
});
