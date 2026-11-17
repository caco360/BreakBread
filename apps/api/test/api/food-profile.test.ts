import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createTestApp, loginAs, resetState, type TestContext } from "../helpers.js";

const EMAIL = "student@live.concordia.ca";

describe("GET /me/profile and PUT /me/profile", () => {
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

  function getProfile(token: string) {
    return request(ctx.app.server).get("/me/profile").set("Authorization", `Bearer ${token}`);
  }

  function putProfile(token: string, body: object) {
    return request(ctx.app.server)
      .put("/me/profile")
      .set("Authorization", `Bearer ${token}`)
      .send(body);
  }

  async function profileRowCount(): Promise<number> {
    const result = await ctx.db.query("SELECT count(*)::int AS n FROM food_profiles");
    return result.rows[0].n;
  }

  const validProfile = {
    cuisines: ["japanese", "fast_food"],
    dietary: ["halal"],
    likesSharing: true,
  };

  it("refuses both routes without a token", async () => {
    const get = await request(ctx.app.server).get("/me/profile");
    const put = await request(ctx.app.server).put("/me/profile").send(validProfile);

    expect(get.status).toBe(401);
    expect(put.status).toBe(401);
    expect(await profileRowCount()).toBe(0);
  });

  it("answers 404 when the user has not created a profile yet", async () => {
    const { token } = await loginAs(ctx, EMAIL);

    const response = await getProfile(token);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("profile_not_found");
  });

  it("saves a profile and returns it", async () => {
    const { token } = await loginAs(ctx, EMAIL);

    const saved = await putProfile(token, validProfile);

    expect(saved.status).toBe(200);
    expect(saved.body).toEqual(validProfile);
    const fetched = await getProfile(token);
    expect(fetched.status).toBe(200);
    expect(fetched.body).toEqual(validProfile);
  });

  it("replaces the whole profile on a second save", async () => {
    const { token } = await loginAs(ctx, EMAIL);
    await putProfile(token, validProfile);

    const replaced = await putProfile(token, {
      cuisines: ["pizza"],
      dietary: [],
      likesSharing: false,
    });

    expect(replaced.status).toBe(200);
    expect((await getProfile(token)).body).toEqual({
      cuisines: ["pizza"],
      dietary: [],
      likesSharing: false,
    });
    expect(await profileRowCount()).toBe(1);
  });

  it("accepts a profile with no cuisines and no dietary needs", async () => {
    const { token } = await loginAs(ctx, EMAIL);

    const response = await putProfile(token, { cuisines: [], dietary: [], likesSharing: false });

    expect(response.status).toBe(200);
  });

  it.each([
    ["a cuisine that is not in the list", { ...validProfile, cuisines: ["klingon"] }],
    ["the same cuisine twice", { ...validProfile, cuisines: ["pizza", "pizza"] }],
    ["a dietary need that is not in the list", { ...validProfile, dietary: ["carnivore"] }],
    ["the same dietary need twice", { ...validProfile, dietary: ["vegan", "vegan"] }],
    ["a cuisine written with capitals", { ...validProfile, cuisines: ["Japanese"] }],
    ["cuisines that is not a list", { ...validProfile, cuisines: "pizza" }],
    ["a missing likesSharing", { cuisines: ["pizza"], dietary: [] }],
    ["likesSharing as text", { ...validProfile, likesSharing: "yes" }],
    ["a missing cuisines list", { dietary: [], likesSharing: true }],
    ["an extra field", { ...validProfile, budget: "$$" }],
    ["an attempt to set the owner", { ...validProfile, userId: "00000000-0000-0000-0000-000000000000" }],
  ])("rejects %s and saves nothing", async (_label, body) => {
    const { token } = await loginAs(ctx, EMAIL);

    const response = await putProfile(token, body);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("invalid_request");
    expect(await profileRowCount()).toBe(0);
  });

  it("keeps each user's profile separate", async () => {
    const a = await loginAs(ctx, "student.a@live.concordia.ca");
    const b = await loginAs(ctx, "student.b@live.concordia.ca");

    await putProfile(a.token, validProfile);

    // B has no profile, and cannot see A's.
    expect((await getProfile(b.token)).status).toBe(404);

    await putProfile(b.token, { cuisines: ["pizza"], dietary: ["vegan"], likesSharing: false });

    // A's profile is unchanged by B's save.
    expect((await getProfile(a.token)).body).toEqual(validProfile);
    expect(await profileRowCount()).toBe(2);
  });

  it("deletes the profile when its user is deleted", async () => {
    const { token, userId } = await loginAs(ctx, EMAIL);
    await putProfile(token, validProfile);

    await ctx.db.query("DELETE FROM users WHERE id = $1", [userId]);

    expect(await profileRowCount()).toBe(0);
    // The token is still genuine, but there is no account behind it any more.
    expect((await getProfile(token)).status).toBe(401);
    expect((await putProfile(token, validProfile)).status).toBe(401);
  });
});
