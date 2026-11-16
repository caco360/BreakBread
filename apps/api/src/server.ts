import { buildApp } from "./app.js";
import { config } from "./config.js";
import { createDbPool } from "./db.js";
import { createRedis } from "./redis.js";

const app = buildApp({
  db: createDbPool(config.databaseUrl),
  redis: createRedis(config.redisUrl),
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
