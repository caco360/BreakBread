import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createTestApp, loginAs, resetState, type TestContext } from "../helpers.js";

const EMAIL = "student@live.concordia.ca";

describe("GET /me and PATCH /me", () => {
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

  function getMe(token: string) {
    return request(ctx.app.server).get("/me").set("Authorization", `Bearer ${token}`);
  }

  function patchMe(token: string, body: object) {
    return request(ctx.app.server)
      .patch("/me")
      .set("Authorization", `Bearer ${token}`)
      .send(body);
  }

  async function userRow(userId: string) {
    const result = await ctx.db.query("SELECT * FROM users WHERE id = $1", [userId]);
    return result.rows[0];
  }

  describe("who is allowed in", () => {
    it("refuses a request with no token", async () => {
      const response = await request(ctx.app.server).get("/me");

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("unauthorized");
    });

    it("refuses a token that is not a real token", async () => {
      const response = await getMe("garbage");

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("unauthorized");
    });

    it("refuses a token signed with a different secret", async () => {
      const { userId } = await loginAs(ctx, EMAIL);
      // A forged token: correct user id, but signed by someone who does not know our secret.
      const forged = ctx.app.jwt.sign({ sub: userId }, { key: "a-different-secret-0123456789abcdef" });

      const response = await getMe(forged);

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("unauthorized");
    });

    it("refuses an expired token", async () => {
      const { userId } = await loginAs(ctx, EMAIL);
      // Issued 100 seconds ago with a 10-second lifetime, so it expired 90 seconds ago.
      const issuedAt = Math.floor(Date.now() / 1000) - 100;
      const expired = ctx.app.jwt.sign({ sub: userId, iat: issuedAt }, { expiresIn: "10s" });

      const response = await getMe(expired);

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("unauthorized");
    });

    it("refuses a valid token whose user no longer exists", async () => {
      const { token, userId } = await loginAs(ctx, EMAIL);
      await ctx.db.query("DELETE FROM users WHERE id = $1", [userId]);

      const get = await getMe(token);
      const patch = await patchMe(token, { firstName: "Sam" });

      expect(get.status).toBe(401);
      expect(get.body.error.code).toBe("unauthorized");
      expect(patch.status).toBe(401);
    });

    it("refuses PATCH with no token and changes nothing", async () => {
      const { userId } = await loginAs(ctx, EMAIL);

      const response = await request(ctx.app.server).patch("/me").send({ firstName: "Sam" });

      expect(response.status).toBe(401);
      expect((await userRow(userId)).first_name).toBeNull();
    });
  });

  describe("GET /me", () => {
    it("returns the logged-in user's own account", async () => {
      const { token, userId } = await loginAs(ctx, EMAIL);

      const response = await getMe(token);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        id: userId,
        email: EMAIL,
        firstName: null,
        lastName: null,
        bio: null,
        isAdult: false,
        complete: false,
      });
    });
  });

  describe("PATCH /me", () => {
    it("saves name and 18+ confirmation, and the account becomes complete", async () => {
      const { token, userId } = await loginAs(ctx, EMAIL);

      const response = await patchMe(token, {
        firstName: " Sam ",
        lastName: "Tester",
        isAdult: true,
      });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        id: userId,
        email: EMAIL,
        firstName: "Sam",
        lastName: "Tester",
        bio: null,
        isAdult: true,
        complete: true,
      });
      // A later GET agrees with what PATCH returned.
      expect((await getMe(token)).body).toEqual(response.body);
    });

    it("changes only the fields that were sent", async () => {
      const { token } = await loginAs(ctx, EMAIL);
      await patchMe(token, { firstName: "Sam", lastName: "Tester", bio: "Always hungry." });

      const response = await patchMe(token, { firstName: "Samira" });

      expect(response.body.firstName).toBe("Samira");
      expect(response.body.lastName).toBe("Tester");
      expect(response.body.bio).toBe("Always hungry.");
    });

    it("accepts a bio of 200 characters and rejects 201", async () => {
      const { token } = await loginAs(ctx, EMAIL);

      const ok = await patchMe(token, { bio: "x".repeat(200) });
      const tooLong = await patchMe(token, { bio: "x".repeat(201) });

      expect(ok.status).toBe(200);
      expect(ok.body.bio).toHaveLength(200);
      expect(tooLong.status).toBe(400);
      expect(tooLong.body.error.code).toBe("invalid_request");
    });

    it("clears the bio when sent null or only spaces", async () => {
      const { token } = await loginAs(ctx, EMAIL);
      await patchMe(token, { bio: "Always hungry." });

      const cleared = await patchMe(token, { bio: null });
      expect(cleared.status).toBe(200);
      expect(cleared.body.bio).toBeNull();

      await patchMe(token, { bio: "Back again." });
      const blank = await patchMe(token, { bio: "   " });
      expect(blank.body.bio).toBeNull();
    });

    it("keeps the first 18+ confirmation time when confirmed twice", async () => {
      const { token, userId } = await loginAs(ctx, EMAIL);
      await patchMe(token, { isAdult: true });
      const first = (await userRow(userId)).age_confirmed_at;

      await patchMe(token, { isAdult: true });

      expect((await userRow(userId)).age_confirmed_at).toEqual(first);
    });

    it.each([
      ["a name that is only spaces", { firstName: "   " }],
      ["an empty last name", { lastName: "" }],
      ["a name longer than 50 characters", { firstName: "x".repeat(51) }],
      ["an empty body", {}],
      ["isAdult set to false", { isAdult: false }],
      ["a number as a name", { firstName: 5 }],
      ["an attempt to change the email", { email: "other@live.concordia.ca" }],
      ["an attempt to change the school", { firstName: "Sam", institutionId: "00000000-0000-0000-0000-000000000000" }],
      ["an attempt to change the id", { id: "00000000-0000-0000-0000-000000000000" }],
    ])("rejects %s and changes nothing", async (_label, body) => {
      const { token, userId } = await loginAs(ctx, EMAIL);
      const before = await userRow(userId);

      const response = await patchMe(token, body);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("invalid_request");
      expect(await userRow(userId)).toEqual(before);
    });

    it("only ever changes the caller's own account", async () => {
      const a = await loginAs(ctx, "student.a@live.concordia.ca");
      const b = await loginAs(ctx, "student.b@live.concordia.ca");
      const bBefore = await userRow(b.userId);

      await patchMe(a.token, { firstName: "Sam", lastName: "Tester", bio: "A's bio" });

      expect(await userRow(b.userId)).toEqual(bBefore);
      expect((await getMe(b.token)).body.email).toBe("student.b@live.concordia.ca");
      expect((await getMe(a.token)).body.email).toBe("student.a@live.concordia.ca");
    });
  });
});
