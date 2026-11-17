import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createTestApp, type TestContext } from "../helpers.js";

describe("error responses", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it("answers an unknown address with the normal error shape", async () => {
    const response = await request(ctx.app.server).get("/no-such-route");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: { code: "not_found", message: expect.any(String) },
    });
  });

  it("answers a known address with the wrong method the same way", async () => {
    const response = await request(ctx.app.server).delete("/me");

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("not_found");
  });
});
