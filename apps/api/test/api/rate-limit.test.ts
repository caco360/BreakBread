import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createTestApp, resetState, type TestContext } from "../helpers.js";

// All test requests come from the same address (this machine), so they all
// count against the same limit, like one person hammering the API.
describe("rate limiting on auth endpoints", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  beforeEach(async () => {
    // resetState empties Redis, where the counters live, so each test starts at zero.
    await resetState(ctx.db, ctx.redis);
    ctx.emails.clear();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it("allows 10 code requests per hour from one address, then answers 429", async () => {
    // A different email each time, so the 60-second per-email wait is not what stops us.
    for (let i = 1; i <= 10; i++) {
      const response = await request(ctx.app.server)
        .post("/auth/request-code")
        .send({ email: `student${i}@live.concordia.ca` });
      expect(response.status).toBe(200);
    }

    const blocked = await request(ctx.app.server)
      .post("/auth/request-code")
      .send({ email: "student11@live.concordia.ca" });

    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({
      error: { code: "rate_limited", message: expect.any(String) },
    });
    // The 11th request was stopped before it did anything.
    expect(ctx.emails.sentCount()).toBe(10);
  });

  it("allows 20 code checks per 10 minutes from one address, then answers 429", async () => {
    for (let i = 1; i <= 20; i++) {
      const response = await request(ctx.app.server)
        .post("/auth/verify-code")
        .send({ email: `student${i}@live.concordia.ca`, code: "123456" });
      // Wrong code, but not rate limited.
      expect(response.status).toBe(401);
    }

    const blocked = await request(ctx.app.server)
      .post("/auth/verify-code")
      .send({ email: "student21@live.concordia.ca", code: "123456" });

    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe("rate_limited");
  });

  it("counts the two endpoints separately", async () => {
    for (let i = 1; i <= 10; i++) {
      await request(ctx.app.server)
        .post("/auth/request-code")
        .send({ email: `student${i}@live.concordia.ca` });
    }

    // request-code is now exhausted, but verify-code still works.
    const response = await request(ctx.app.server)
      .post("/auth/verify-code")
      .send({ email: "student1@live.concordia.ca", code: "123456" });

    expect(response.status).not.toBe(429);
  });

  it("does not limit /health", async () => {
    for (let i = 1; i <= 30; i++) {
      const response = await request(ctx.app.server).get("/health");
      expect(response.status).toBe(200);
    }
  });
});
