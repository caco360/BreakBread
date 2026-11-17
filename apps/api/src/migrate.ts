// Run with: npm run migrate
// Applies pending database migrations, then exits.
import { loadConfig } from "./config.js";
import { runMigrations } from "./migrations.js";

try {
  const config = loadConfig(process.env);
  await runMigrations(config.databaseUrl);
  console.log("Migrations are up to date.");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
