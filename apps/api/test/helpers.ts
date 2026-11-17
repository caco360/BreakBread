import type { FastifyInstance } from "fastify";
import type pg from "pg";
import type { Redis } from "ioredis";
import { buildApp } from "../src/app.js";
import type { EmailSender } from "../src/auth/email-sender.js";
import { loadConfig } from "../src/config.js";
import { createDbPool } from "../src/db.js";
import { createRedis } from "../src/redis.js";

// Stands in for a real email provider in tests. It sends nothing; it just
// remembers each code so the test can read it, like opening the inbox.
export class FakeEmailSender implements EmailSender {
  private codes = new Map<string, string>();
  private sent = 0;
  private shouldFail = false;

  async sendLoginCode(email: string, code: string): Promise<void> {
    if (this.shouldFail) {
      this.shouldFail = false;
      throw new Error("fake email provider is down");
    }
    this.codes.set(email, code);
    this.sent += 1;
  }

  // The most recent code "emailed" to this address, if any.
  lastCodeFor(email: string): string | undefined {
    return this.codes.get(email);
  }

  // How many emails were sent since the last clear().
  sentCount(): number {
    return this.sent;
  }

  // Makes the next send throw, to simulate the email provider being down.
  failNext(): void {
    this.shouldFail = true;
  }

  clear(): void {
    this.codes.clear();
    this.sent = 0;
    this.shouldFail = false;
  }
}

// Everything a test needs: the app, direct access to Postgres and Redis so
// the test can look at what the app stored, and the fake inbox.
export interface TestContext {
  app: FastifyInstance;
  db: pg.Pool;
  redis: Redis;
  emails: FakeEmailSender;
}

// Builds the app against the test Postgres and Redis.
// Call app.close() when the test file is done; that also closes db and redis.
export async function createTestApp(): Promise<TestContext> {
  // vitest.config.ts provides the environment variables for tests.
  const config = loadConfig(process.env);
  const db = createDbPool(config.databaseUrl);
  const redis = createRedis(config.redisUrl);
  const emails = new FakeEmailSender();
  const app = buildApp({ db, redis, config, emailSender: emails });
  // ready() finishes Fastify's setup without opening a port.
  await app.ready();
  return { app, db, redis, emails };
}

// Empties everything tests write, so each test starts from the same state.
// The institutions table is kept: its rows come from a migration, not tests.
export async function resetState(db: pg.Pool, redis: Redis): Promise<void> {
  // CASCADE also empties tables that point at users through a foreign key.
  await db.query("TRUNCATE users, login_codes CASCADE");
  await redis.flushdb();
}

// Logs in as the given email the same way the app would: ask for a code,
// read it from the fake inbox, send it back. Returns the login token.
export async function loginAs(
  ctx: TestContext,
  email: string,
): Promise<{ token: string; userId: string }> {
  const requested = await ctx.app.inject({
    method: "POST",
    url: "/auth/request-code",
    payload: { email },
  });
  const code = ctx.emails.lastCodeFor(email);
  if (requested.statusCode !== 200 || code === undefined) {
    throw new Error(`loginAs: could not request a code (status ${requested.statusCode})`);
  }

  const verified = await ctx.app.inject({
    method: "POST",
    url: "/auth/verify-code",
    payload: { email, code },
  });
  if (verified.statusCode !== 200) {
    throw new Error(`loginAs: could not verify the code (status ${verified.statusCode})`);
  }

  const body = verified.json<{ token: string; user: { id: string } }>();
  return { token: body.token, userId: body.user.id };
}
