import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { z } from "zod";
import type { AppDependencies } from "../app.js";
import { requireAuth } from "../auth/require-auth.js";
import { sendError } from "../errors.js";
import { CUISINES, DIETARY } from "./tags.js";

// True when no value appears twice. A Set drops duplicates, so if the Set is
// as large as the list, there were none.
function hasNoDuplicates(values: string[]): boolean {
  return new Set(values).size === values.length;
}

// PUT replaces the whole profile, so all three fields are required.
// z.enum(CUISINES) accepts only the exact words in the list.
const putProfileBody = z.strictObject({
  cuisines: z.array(z.enum(CUISINES)).refine(hasNoDuplicates),
  dietary: z.array(z.enum(DIETARY)).refine(hasNoDuplicates),
  likesSharing: z.boolean(),
});

// The food_profiles columns the API reads, as Postgres returns them.
interface FoodProfileRow {
  cuisines: string[];
  dietary: string[];
  likes_sharing: boolean;
}

// Converts a database row (snake_case) to the JSON the app receives (camelCase).
function toFoodProfileJson(row: FoodProfileRow) {
  return {
    cuisines: row.cuisines,
    dietary: row.dietary,
    likesSharing: row.likes_sharing,
  };
}

// A token stays valid for 30 days even if the account behind it is deleted,
// so each route checks that the user still exists.
async function userExists(db: pg.Pool, userId: string): Promise<boolean> {
  const result = await db.query("SELECT 1 FROM users WHERE id = $1", [userId]);
  return result.rowCount === 1;
}

export function registerFoodProfileRoutes(app: FastifyInstance, deps: AppDependencies): void {
  const { db } = deps;

  // As in account-routes.ts: the user id always comes from the verified token.

  app.get("/me/profile", { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.user.sub;
    if (!(await userExists(db, userId))) {
      return sendError(reply, 401, "unauthorized", "Log in to continue.");
    }

    const result = await db.query<FoodProfileRow>(
      "SELECT cuisines, dietary, likes_sharing FROM food_profiles WHERE user_id = $1",
      [userId],
    );
    const profile = result.rows[0];
    if (profile === undefined) {
      // Not an error in the app: it just means "show the empty profile form".
      return sendError(reply, 404, "profile_not_found", "You have not created a food profile yet.");
    }

    return reply.status(200).send(toFoodProfileJson(profile));
  });

  app.put("/me/profile", { preHandler: requireAuth }, async (request, reply) => {
    const body = putProfileBody.safeParse(request.body);
    if (!body.success) {
      return sendError(
        reply,
        400,
        "invalid_request",
        "Send cuisines and dietary as lists of allowed tags with no repeats, and likesSharing as true or false.",
      );
    }

    const userId = request.user.sub;
    if (!(await userExists(db, userId))) {
      return sendError(reply, 401, "unauthorized", "Log in to continue.");
    }

    // Insert the profile, or replace it if this user already has one.
    // EXCLUDED means "the row we just tried to insert".
    const result = await db.query<FoodProfileRow>(
      `INSERT INTO food_profiles (user_id, cuisines, dietary, likes_sharing, updated_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (user_id) DO UPDATE
         SET cuisines = EXCLUDED.cuisines,
             dietary = EXCLUDED.dietary,
             likes_sharing = EXCLUDED.likes_sharing,
             updated_at = now()
       RETURNING cuisines, dietary, likes_sharing`,
      [userId, body.data.cuisines, body.data.dietary, body.data.likesSharing],
    );
    const saved = result.rows[0];
    if (saved === undefined) {
      // INSERT ... RETURNING always returns the row; this only satisfies TypeScript.
      throw new Error("food profile was not saved");
    }

    return reply.status(200).send(toFoodProfileJson(saved));
  });
}
