import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createTestApp, resetState, type TestContext } from "../helpers.js";

describe("POST /auth/request-code", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  beforeEach(async () => {
    await resetState(ctx.db, ctx.redis);
    ctx.emails.clear();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  function requestCode(body: object) {
    return request(ctx.app.server).post("/auth/request-code").send(body);
  }

  async function storedCode(email: string) {
    const result = await ctx.db.query(
      "SELECT code_hash, attempts, expires_at, created_at FROM login_codes WHERE email = $1",
      [email],
    );
    return result.rows[0];
  }

  it("sends a 6-digit code and stores only its hash", async () => {
    const email = "student@live.concordia.ca";

    const response = await requestCode({ email });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });

    const code = ctx.emails.lastCodeFor(email);
    expect(code).toMatch(/^\d{6}$/);

    const row = await storedCode(email);
    expect(row.code_hash).not.toContain(code);
    expect(row.attempts).toBe(0);

    // The code expires about 10 minutes from now (allow 5 seconds either way).
    const lifetimeMs = row.expires_at.getTime() - Date.now();
    expect(lifetimeMs).toBeGreaterThan(10 * 60 * 1000 - 5000);
    expect(lifetimeMs).toBeLessThan(10 * 60 * 1000 + 5000);
  });

  it("treats capitals and surrounding spaces as the same email", async () => {
    const response = await requestCode({ email: " Student@Live.Concordia.CA " });

    expect(response.status).toBe(200);
    expect(await storedCode("student@live.concordia.ca")).toBeDefined();
    expect(ctx.emails.lastCodeFor("student@live.concordia.ca")).toMatch(/^\d{6}$/);
  });

  it.each([
    "a@gmail.com",
    "a@concordia.ca",
    "a@notlive.concordia.ca",
    "a@live.concordia.ca.evil.com",
  ])("rejects the unsupported address %s", async (email) => {
    const response = await requestCode({ email });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("unsupported_email_domain");
    expect(ctx.emails.sentCount()).toBe(0);
  });

  it.each([
    ["an empty body", {}],
    ["a number as email", { email: 5 }],
    ["text that is not an email", { email: "nope" }],
    ["an extra field", { email: "a@live.concordia.ca", extra: 1 }],
  ])("rejects %s", async (_label, body) => {
    const response = await requestCode(body);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("invalid_request");
    expect(ctx.emails.sentCount()).toBe(0);
  });

  it("answers broken JSON with the normal error shape", async () => {
    const response = await request(ctx.app.server)
      .post("/auth/request-code")
      .set("Content-Type", "application/json")
      .send('{"email": ');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("invalid_request");
  });

  it("refuses a second code within 60 seconds and keeps the first", async () => {
    const email = "student@live.concordia.ca";
    await requestCode({ email });
    const first = await storedCode(email);

    const response = await requestCode({ email });

    expect(response.status).toBe(429);
    expect(response.body.error.code).toBe("resend_too_soon");
    expect((await storedCode(email)).code_hash).toBe(first.code_hash);
    expect(ctx.emails.sentCount()).toBe(1);
  });

  it("replaces the code and resets attempts once 60 seconds have passed", async () => {
    const email = "student@live.concordia.ca";
    await requestCode({ email });
    const first = await storedCode(email);
    // Pretend the first code was requested 61 seconds ago and guessed wrong 3 times.
    await ctx.db.query(
      "UPDATE login_codes SET created_at = now() - interval '61 seconds', attempts = 3 WHERE email = $1",
      [email],
    );

    const response = await requestCode({ email });

    expect(response.status).toBe(200);
    const second = await storedCode(email);
    expect(second.code_hash).not.toBe(first.code_hash);
    expect(second.attempts).toBe(0);
    expect(ctx.emails.sentCount()).toBe(2);
  });

  it("returns 503 when the email cannot be sent, and allows an immediate retry", async () => {
    const email = "student@live.concordia.ca";
    ctx.emails.failNext();

    const failed = await requestCode({ email });

    expect(failed.status).toBe(503);
    expect(failed.body.error.code).toBe("email_unavailable");
    expect(await storedCode(email)).toBeUndefined();

    const retry = await requestCode({ email });
    expect(retry.status).toBe(200);
  });
});
