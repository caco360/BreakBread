import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createTestApp, resetState, type TestContext } from "../helpers.js";

const EMAIL = "student@live.concordia.ca";
const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;

describe("POST /auth/verify-code", () => {
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

  function verifyCode(body: object) {
    return request(ctx.app.server).post("/auth/verify-code").send(body);
  }

  // Asks for a code and returns the one that was "emailed".
  async function requestCodeFor(email: string): Promise<string> {
    await request(ctx.app.server).post("/auth/request-code").send({ email });
    const code = ctx.emails.lastCodeFor(email);
    if (code === undefined) {
      throw new Error("no code was sent");
    }
    return code;
  }

  // A 6-digit code that is guaranteed to differ from the real one.
  function wrongCodeFor(realCode: string): string {
    return realCode === "000000" ? "000001" : "000000";
  }

  async function countRows(table: "users" | "login_codes"): Promise<number> {
    const result = await ctx.db.query(`SELECT count(*)::int AS n FROM ${table}`);
    return result.rows[0].n;
  }

  it("logs in with the right code, creates the user and uses up the code", async () => {
    const code = await requestCodeFor(EMAIL);

    const response = await verifyCode({ email: EMAIL, code });

    expect(response.status).toBe(200);
    expect(typeof response.body.token).toBe("string");
    expect(response.body.user).toEqual({
      id: expect.any(String),
      email: EMAIL,
      firstName: null,
      lastName: null,
      bio: null,
      isAdult: false,
      complete: false,
    });

    // The user exists, belongs to Concordia, and is marked as verified.
    const users = await ctx.db.query(
      `SELECT users.id, users.verified_at, institutions.name
       FROM users JOIN institutions ON institutions.id = users.institution_id
       WHERE users.email = $1`,
      [EMAIL],
    );
    expect(users.rows).toHaveLength(1);
    expect(users.rows[0].id).toBe(response.body.user.id);
    expect(users.rows[0].name).toBe("Concordia University");
    expect(users.rows[0].verified_at).toBeInstanceOf(Date);

    expect(await countRows("login_codes")).toBe(0);
  });

  it("returns a token that names the user and lasts 30 days", async () => {
    const code = await requestCodeFor(EMAIL);

    const response = await verifyCode({ email: EMAIL, code });

    // app.jwt.verify checks the signature and returns what is inside the token.
    const payload = ctx.app.jwt.verify<{ sub: string; iat: number; exp: number }>(
      response.body.token,
    );
    expect(payload.sub).toBe(response.body.user.id);
    expect(payload.exp - payload.iat).toBe(THIRTY_DAYS_SECONDS);
    // The token holds the user id and two timestamps, nothing personal.
    expect(Object.keys(payload).sort()).toEqual(["exp", "iat", "sub"]);
  });

  it("refuses a code that was already used", async () => {
    const code = await requestCodeFor(EMAIL);
    await verifyCode({ email: EMAIL, code });

    const again = await verifyCode({ email: EMAIL, code });

    expect(again.status).toBe(401);
    expect(again.body.error.code).toBe("invalid_code");
  });

  it("logs the same person into the same account the second time", async () => {
    const first = await verifyCode({ email: EMAIL, code: await requestCodeFor(EMAIL) });
    // Skip the 60-second resend wait.
    await ctx.db.query("DELETE FROM login_codes");
    const second = await verifyCode({ email: EMAIL, code: await requestCodeFor(EMAIL) });

    expect(second.status).toBe(200);
    expect(second.body.user.id).toBe(first.body.user.id);
    expect(await countRows("users")).toBe(1);
  });

  it("treats capitals and spaces in the email as the same account", async () => {
    const code = await requestCodeFor(EMAIL);

    const response = await verifyCode({ email: " Student@Live.Concordia.CA ", code });

    expect(response.status).toBe(200);
    expect(response.body.user.email).toBe(EMAIL);
  });

  it("counts a wrong code as an attempt, then still accepts the right one", async () => {
    const code = await requestCodeFor(EMAIL);

    const wrong = await verifyCode({ email: EMAIL, code: wrongCodeFor(code) });

    expect(wrong.status).toBe(401);
    expect(wrong.body.error.code).toBe("invalid_code");
    const row = await ctx.db.query("SELECT attempts FROM login_codes WHERE email = $1", [EMAIL]);
    expect(row.rows[0].attempts).toBe(1);
    expect(await countRows("users")).toBe(0);

    const right = await verifyCode({ email: EMAIL, code });
    expect(right.status).toBe(200);
  });

  it("kills the code after 5 wrong attempts, even for the right code", async () => {
    const code = await requestCodeFor(EMAIL);
    for (let i = 0; i < 5; i++) {
      await verifyCode({ email: EMAIL, code: wrongCodeFor(code) });
    }

    const response = await verifyCode({ email: EMAIL, code });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("invalid_code");
    expect(await countRows("users")).toBe(0);
  });

  it("refuses the right code once it has expired", async () => {
    const code = await requestCodeFor(EMAIL);
    await ctx.db.query(
      "UPDATE login_codes SET expires_at = now() - interval '1 second' WHERE email = $1",
      [EMAIL],
    );

    const response = await verifyCode({ email: EMAIL, code });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("invalid_code");
  });

  it("refuses when no code was ever requested", async () => {
    const response = await verifyCode({ email: EMAIL, code: "123456" });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("invalid_code");
  });

  it("gives the same answer for every kind of failure", async () => {
    // No code requested at all.
    const noCode = await verifyCode({ email: EMAIL, code: "123456" });
    // A wrong code for a real pending code.
    const code = await requestCodeFor(EMAIL);
    const wrongCode = await verifyCode({ email: EMAIL, code: wrongCodeFor(code) });

    // Identical bodies: the response must not reveal which case happened.
    expect(wrongCode.body).toEqual(noCode.body);
  });

  it.each([
    ["a number instead of text", { email: EMAIL, code: 123456 }],
    ["5 digits", { email: EMAIL, code: "12345" }],
    ["letters", { email: EMAIL, code: "abcdef" }],
    ["a missing code", { email: EMAIL }],
    ["a missing email", { code: "123456" }],
    ["an extra field", { email: EMAIL, code: "123456", extra: 1 }],
  ])("rejects %s as a malformed request", async (_label, body) => {
    const response = await verifyCode(body);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("invalid_request");
  });

  it("does not count a malformed request as an attempt", async () => {
    await requestCodeFor(EMAIL);

    await verifyCode({ email: EMAIL, code: "12345" });

    const row = await ctx.db.query("SELECT attempts FROM login_codes WHERE email = $1", [EMAIL]);
    expect(row.rows[0].attempts).toBe(0);
  });
});
