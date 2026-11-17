import { fileURLToPath } from "node:url";
import { runner } from "node-pg-migrate";

// Absolute path of apps/api/migrations, worked out from this file's location
// so it is correct no matter which folder the command is run from.
const MIGRATIONS_DIR = fileURLToPath(new URL("../migrations", import.meta.url));

// Applies every migration that has not been applied yet, in filename order.
// node-pg-migrate remembers what it has run in a table called "pgmigrations",
// so calling this twice is safe: the second call finds nothing to do.
export async function runMigrations(databaseUrl: string): Promise<void> {
  await runner({
    databaseUrl,
    dir: MIGRATIONS_DIR,
    direction: "up",
    migrationsTable: "pgmigrations",
    // Do not print every SQL statement.
    verbose: false,
    log: () => {},
  });
}
