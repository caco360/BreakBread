import type { FastifyInstance } from "fastify";
import type pg from "pg";
import type { Redis } from "ioredis";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { createDbPool } from "../src/db.js";
import { createRedis } from "../src/redis.js";

// Everything a test needs: the app, plus direct access to Postgres and Redis
// so the test can look at what the app stored.
export interface TestContext {
  app: FastifyInstance;
  db: pg.Pool;
  redis: Redis;
}

// Builds the app against the real local Postgres and Redis.
// Call app.close() when the test file is done; that also closes db and redis.
export async function createTestApp(): Promise<TestContext> {
  // vitest.config.ts provides the environment variables for tests.
  const config = loadConfig(process.env);
  const db = createDbPool(config.databaseUrl);
  const redis = createRedis(config.redisUrl);
  const app = buildApp({ db, redis, config });
  // ready() finishes Fastify's setup without opening a port.
  await app.ready();
  return { app, db, redis };
}

// Empties everything tests write, so each test starts from the same state.
// The institutions table is kept: its rows come from a migration, not tests.
export async function resetState(db: pg.Pool, redis: Redis): Promise<void> {
  // CASCADE also empties tables that point at users through a foreign key.
  await db.query("TRUNCATE users CASCADE");
  await redis.flushdb();
}
