import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp } from "../src/app.js";

describe("GET /health", () => {
  const app = buildApp();

  // ready() finishes Fastify's setup (routes, plugins) without opening a port.
  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns 200 and status ok", async () => {
    // app.server is the plain Node HTTP server that Fastify wraps.
    const response = await request(app.server).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });
});
