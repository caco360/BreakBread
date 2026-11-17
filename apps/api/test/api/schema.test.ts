import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, resetState, type TestContext } from "../helpers.js";

describe("database schema", () => {
  let ctx: TestContext;
  let concordiaId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  beforeEach(async () => {
    await resetState(ctx.db, ctx.redis);
    const result = await ctx.db.query(
      "SELECT id FROM institutions WHERE name = $1",
      ["Concordia University"],
    );
    concordiaId = result.rows[0].id;
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  // Inserts a user with the given email and optional bio.
  function insertUser(email: string, bio: string | null = null) {
    return ctx.db.query(
      "INSERT INTO users (email, institution_id, bio, verified_at) VALUES ($1, $2, $3, now())",
      [email, concordiaId, bio],
    );
  }

  it("seeds Concordia with only the student email domain", async () => {
    const result = await ctx.db.query(
      "SELECT email_domains FROM institutions WHERE name = $1",
      ["Concordia University"],
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].email_domains).toEqual(["live.concordia.ca"]);
  });

  it("rejects two users with the same email", async () => {
    await insertUser("a@live.concordia.ca");

    // 23505 is Postgres's code for "unique constraint violated".
    await expect(insertUser("a@live.concordia.ca")).rejects.toMatchObject({
      code: "23505",
    });
  });

  it("accepts a 200-character bio and rejects 201", async () => {
    await insertUser("ok@live.concordia.ca", "x".repeat(200));

    // 23514 is Postgres's code for "check constraint violated".
    await expect(
      insertUser("long@live.concordia.ca", "x".repeat(201)),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("rejects a user whose institution does not exist", async () => {
    // 23503 is Postgres's code for "foreign key violated".
    await expect(
      ctx.db.query(
        "INSERT INTO users (email, institution_id, verified_at) VALUES ($1, $2, now())",
        ["b@live.concordia.ca", "00000000-0000-0000-0000-000000000000"],
      ),
    ).rejects.toMatchObject({ code: "23503" });
  });
});
