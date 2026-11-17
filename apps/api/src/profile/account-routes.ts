import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppDependencies } from "../app.js";
import { requireAuth } from "../auth/require-auth.js";
import { sendError } from "../errors.js";
import { toAccountJson, type UserRow } from "./account.js";

// What a user may change about their own account. Every field is optional,
// so the app can send only what changed.
//
// strictObject rejects unknown fields. That is what makes it impossible to
// change your email, id or school through this route: those fields are not
// listed, so a request containing them is refused.
const patchMeBody = z
  .strictObject({
    // trim() removes surrounding spaces first, so "   " becomes "" and fails min(1).
    firstName: z.string().trim().min(1).max(50).optional(),
    lastName: z.string().trim().min(1).max(50).optional(),
    // null means "remove my bio".
    bio: z.string().trim().max(200).nullable().optional(),
    // Only the value true is accepted. You can confirm you are 18+; you cannot un-confirm.
    isAdult: z.literal(true).optional(),
  })
  // An empty body {} would change nothing, so treat it as a mistake.
  .refine((body) => Object.keys(body).length > 0);

// The columns every query here returns, in one place so they stay in sync.
const USER_COLUMNS = "id, email, first_name, last_name, bio, age_confirmed_at";

export function registerAccountRoutes(app: FastifyInstance, deps: AppDependencies): void {
  const { db } = deps;

  // "preHandler: requireAuth" runs the token check before each handler below.
  // Inside the handlers, request.user.sub is the logged-in user's id. It comes
  // from the verified token, never from the body or the URL, so a user can
  // only ever read or change their own account.

  app.get("/me", { preHandler: requireAuth }, async (request, reply) => {
    const result = await db.query<UserRow>(
      `SELECT ${USER_COLUMNS} FROM users WHERE id = $1`,
      [request.user.sub],
    );
    const user = result.rows[0];
    if (user === undefined) {
      // The token is genuine but the account has been deleted since.
      return sendError(reply, 401, "unauthorized", "Log in to continue.");
    }

    return reply.status(200).send(toAccountJson(user));
  });

  app.patch("/me", { preHandler: requireAuth }, async (request, reply) => {
    const body = patchMeBody.safeParse(request.body);
    if (!body.success) {
      return sendError(
        reply,
        400,
        "invalid_request",
        "Send at least one of firstName, lastName, bio, isAdult. Names are 1 to 50 characters, bio at most 200.",
      );
    }
    const { firstName, lastName, bio, isAdult } = body.data;

    // A bio of only spaces was trimmed to "", which means the same as null.
    const newBio = bio === "" ? null : bio;

    // One UPDATE that changes only the fields that were sent:
    // - COALESCE($2, first_name) means "use $2, or keep first_name if $2 is NULL".
    // - bio needs a separate yes/no flag ($4), because NULL is itself a valid
    //   new value for it ("remove my bio").
    // - age_confirmed_at is set once and never overwritten.
    // The "::text" and "::boolean" tell Postgres the type of a NULL parameter.
    const result = await db.query<UserRow>(
      `UPDATE users SET
         first_name = COALESCE($2::text, first_name),
         last_name = COALESCE($3::text, last_name),
         bio = CASE WHEN $4::boolean THEN $5::text ELSE bio END,
         age_confirmed_at = CASE
           WHEN $6::boolean AND age_confirmed_at IS NULL THEN now()
           ELSE age_confirmed_at
         END
       WHERE id = $1
       RETURNING ${USER_COLUMNS}`,
      [
        request.user.sub,
        firstName ?? null,
        lastName ?? null,
        newBio !== undefined,
        newBio ?? null,
        isAdult === true,
      ],
    );
    const user = result.rows[0];
    if (user === undefined) {
      return sendError(reply, 401, "unauthorized", "Log in to continue.");
    }

    return reply.status(200).send(toAccountJson(user));
  });
}
