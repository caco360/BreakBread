import { buildApp } from "./app.js";
import { loadConfig, type Config } from "./config.js";
import { createDbPool } from "./db.js";
import { createRedis } from "./redis.js";

// Check the configuration before anything else. If it is wrong, print what
// is wrong and stop: a server that starts half-configured fails later in
// confusing ways.
let config: Config;
try {
  config = loadConfig(process.env);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

const app = buildApp({
  db: createDbPool(config.databaseUrl),
  redis: createRedis(config.redisUrl),
  config,
});

try {
  // 0.0.0.0 accepts connections from outside this machine too,
  // which a phone on the same network will need later.
  await app.listen({ port: config.port, host: "0.0.0.0" });
  console.log(`API listening on port ${config.port}`);
} catch (error) {
  console.error(error);
  process.exit(1);
}
