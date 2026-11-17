import Fastify, { type FastifyInstance } from "fastify";
import fastifyJwt from "@fastify/jwt";
import fastifyRateLimit from "@fastify/rate-limit";
import type pg from "pg";
import type { Redis } from "ioredis";
import type { EmailSender } from "./auth/email-sender.js";
import { registerAuthRoutes } from "./auth/routes.js";
import type { Config } from "./config.js";
import { sendError } from "./errors.js";
import { registerAccountRoutes } from "./profile/account-routes.js";
import { registerFoodProfileRoutes } from "./profile/food-profile-routes.js";

// Everything the app needs from outside. It is passed in rather than created
// here, so tests can decide what the app connects to and how emails are "sent".
export interface AppDependencies {
  db: pg.Pool;
  redis: Redis;
  config: Config;
  emailSender: EmailSender;
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

// Anything can be thrown in JavaScript, so a caught error has the type
// "unknown". Fastify and its plugins put a statusCode on what they throw (for
// example 400 for a body that is not valid JSON, 429 for a rate limit).
// Everything else counts as 500.
function errorStatus(error: unknown): number {
  if (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    typeof error.statusCode === "number"
  ) {
    return error.statusCode;
  }
  return 500;
}

// Builds the app but does not start listening on a port.
// Tests call this directly; server.ts calls it and then listens.
export function buildApp(deps: AppDependencies): FastifyInstance {
  const { db, redis, config } = deps;
  const app = Fastify({ logger: false });

  // Adds reply.jwtSign() and request.jwtVerify() for login tokens.
  // Every token is signed with our secret and stops working after 30 days.
  app.register(fastifyJwt, {
    secret: config.jwtSecret,
    sign: { expiresIn: "30d" },
  });

  // Called when a route throws, or when Fastify itself rejects a request
  // (for example a body that is not valid JSON). It makes those errors use
  // the same { error: { code, message } } shape as every other error.
  app.setErrorHandler((error, _request, reply) => {
    const status = errorStatus(error);

    // 429 Too Many Requests comes from the rate limiter.
    if (status === 429) {
      return sendError(reply, 429, "rate_limited", "Too many requests. Please try again later.");
    }

    // Any other 4xx means the client sent something wrong.
    if (status >= 400 && status < 500) {
      return sendError(reply, status, "invalid_request", "The request could not be understood.");
    }

    // Anything else is a bug or an outage on our side. Print the stack so it
    // can be fixed, but tell the client nothing about our internals.
    // (The stack holds the error message and code locations, not request data.)
    console.error(error instanceof Error ? error.stack : "Unknown error");
    return sendError(reply, 500, "internal_error", "Something went wrong on our side.");
  });

  // Called when no route matches the address or method of a request.
  app.setNotFoundHandler((_request, reply) => {
    return sendError(reply, 404, "not_found", "There is nothing at this address.");
  });

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

  // Rate limiting: counts requests per client IP address in Redis.
  // "global: false" means no route is limited unless it asks to be; the auth
  // routes set their own limits in auth/routes.ts.
  app.register(fastifyRateLimit, { global: false, redis });

  // app.register does not finish immediately. app.after runs once the plugins
  // above are loaded, which the rate limiter needs: it can only attach itself
  // to routes that are added after it.
  app.after(() => {
    registerAuthRoutes(app, deps);
    registerAccountRoutes(app, deps);
    registerFoodProfileRoutes(app, deps);
  });

  // When the app closes, close its connections too so the process can exit.
  app.addHook("onClose", async () => {
    await db.end();
    redis.disconnect();
  });

  return app;
}
