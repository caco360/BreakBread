import { Redis } from "ioredis";

export function createRedis(url: string): Redis {
  const redis = new Redis(url, {
    // By default ioredis retries a command 20 times while disconnected.
    // One retry makes commands fail fast when Redis is down.
    maxRetriesPerRequest: 1,
  });

  // Without a listener, a connection error would crash the process as an
  // unhandled "error" event. ioredis reconnects by itself, and /health
  // reports the outage, so there is nothing more to do here.
  redis.on("error", () => {});

  return redis;
}
