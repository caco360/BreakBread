import Fastify, { type FastifyInstance } from "fastify";
import type pg from "pg";
import type { Redis } from "ioredis";

// The connections the app needs. They are passed in rather than created here,
// so tests can decide what the app connects to.
export interface AppDependencies {
  db: pg.Pool;
  redis: Redis;
}

type ServiceStatus = "up" | "down";

// Runs a check and turns "it threw an error" into "down".
async function checkService(check: () => Promise<unknown>): Promise<ServiceStatus> {
  try {
    await check();
    return "up";
  } catch {
    return "down";
  }
}

// Builds the app but does not start listening on a port.
// Tests call this directly; server.ts calls it and then listens.
export function buildApp({ db, redis }: AppDependencies): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get("/health", async (_request, reply) => {
    // Check both at the same time rather than one after the other.
    const [postgres, redisStatus] = await Promise.all([
      checkService(() => db.query("SELECT 1")),
      checkService(() => redis.ping()),
    ]);

    const allUp = postgres === "up" && redisStatus === "up";

    // 503 Service Unavailable tells monitoring tools the API cannot do its job.
    return reply.status(allUp ? 200 : 503).send({
      status: allUp ? "ok" : "unavailable",
      postgres,
      redis: redisStatus,
    });
  });

  // When the app closes, close its connections too so the process can exit.
  app.addHook("onClose", async () => {
    await db.end();
    redis.disconnect();
  });

  return app;
}
