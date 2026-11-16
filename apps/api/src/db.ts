import pg from "pg";

// A Pool keeps a few Postgres connections open and lends one out per query.
export function createDbPool(connectionString: string): pg.Pool {
  return new pg.Pool({
    connectionString,
    // Give up after 2 seconds instead of hanging when Postgres is unreachable.
    connectionTimeoutMillis: 2000,
  });
}
