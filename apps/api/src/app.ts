import Fastify, { type FastifyInstance } from "fastify";

// Builds the app but does not start listening on a port.
// Tests call this directly; server.ts calls it and then listens.
export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get("/health", async () => {
    // Returning an object makes Fastify send it as JSON with status 200.
    return { status: "ok" };
  });

  return app;
}
