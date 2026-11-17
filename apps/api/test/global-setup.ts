import pg from "pg";
import { loadConfig } from "../src/config.js";
import { runMigrations } from "../src/migrations.js";
import { TEST_DATABASE_NAME, testEnv } from "./test-env.js";

// Creates the test database the first time tests run on a machine.
async function createTestDatabaseIfMissing(testDatabaseUrl: string): Promise<void> {
  // You cannot create a database while connected to it, so connect to
  // "postgres", the maintenance database every Postgres server has.
  const adminUrl = new URL(testDatabaseUrl);
  adminUrl.pathname = "/postgres";

  const client = new pg.Client({ connectionString: adminUrl.toString() });
  await client.connect();
  try {
    const existing = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [TEST_DATABASE_NAME],
    );
    if (existing.rowCount === 0) {
      // CREATE DATABASE does not accept $1 parameters. This is safe only
      // because the name is a constant from our own code, never user input.
      await client.query(`CREATE DATABASE ${TEST_DATABASE_NAME}`);
    }
  } finally {
    await client.end();
  }
}

// Vitest runs this once, before any test file.
export default async function setup(): Promise<void> {
  // The "env" setting in vitest.config.ts is not applied here yet,
  // so the test variables are passed in directly.
  const config = loadConfig(testEnv);
  await createTestDatabaseIfMissing(config.databaseUrl);
  await runMigrations(config.databaseUrl);
}
