import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppDependencies } from "../app.js";
import { sendError } from "../errors.js";
import { toAccountJson, type UserRow } from "../profile/account.js";
import {
  CODE_TTL_MS,
  MAX_ATTEMPTS,
  RESEND_WAIT_MS,
  emailDomain,
  generateCode,
  hashCode,
  hashesMatch,
  normalizeEmail,
} from "./codes.js";

// strictObject rejects any field we did not list.
// 254 is the longest an email address is allowed to be.
const requestCodeBody = z.strictObject({
  email: z.string().max(254),
});

// The code must be text made of exactly 6 digits. Text, not a number, because
// a code like "042917" would lose its leading zero as a number.
const verifyCodeBody = z.strictObject({
  email: z.string().max(254),
  code: z.string().regex(/^\d{6}$/),
});

export function registerAuthRoutes(app: FastifyInstance, deps: AppDependencies): void {
  const { db, config, emailSender } = deps;

  // Step 1 of login: "send a code to this email".
  app.post("/auth/request-code", async (request, reply) => {
    // 1. Check the shape of the body.
    const body = requestCodeBody.safeParse(request.body);
    if (!body.success) {
      return sendError(reply, 400, "invalid_request", "Send a JSON body like { \"email\": \"...\" }.");
    }

    const email = normalizeEmail(body.data.email);
    if (!z.email().safeParse(email).success) {
      return sendError(reply, 400, "invalid_request", "That is not a valid email address.");
    }

    // 2. Only emails from a supported school may continue. "= ANY(...)" is an
    //    exact match against each domain in the array, so look-alike domains fail.
    const institution = await db.query(
      "SELECT id FROM institutions WHERE $1 = ANY(email_domains)",
      [emailDomain(email)],
    );
    if (institution.rowCount === 0) {
      return sendError(
        reply,
        400,
        "unsupported_email_domain",
        "Use your school email address. Only supported schools can sign up.",
      );
    }

    // 3. Resend wait: refuse if a code for this email was created under 60 seconds ago.
    const existing = await db.query<{ created_at: Date }>(
      "SELECT created_at FROM login_codes WHERE email = $1",
      [email],
    );
    const previous = existing.rows[0];
    if (previous && Date.now() - previous.created_at.getTime() < RESEND_WAIT_MS) {
      return sendError(reply, 429, "resend_too_soon", "Please wait a minute before asking for another code.");
    }

    // 4. Make a new code and store only its hash. If a row already exists for
    //    this email, replace it: the old code stops working and attempts restart.
    const code = generateCode();
    const codeHash = hashCode(code, email, config.loginCodeSecret);
    const expiresAt = new Date(Date.now() + CODE_TTL_MS);
    await db.query(
      `INSERT INTO login_codes (email, code_hash, expires_at, attempts, created_at)
       VALUES ($1, $2, $3, 0, now())
       ON CONFLICT (email) DO UPDATE
         SET code_hash = EXCLUDED.code_hash,
             expires_at = EXCLUDED.expires_at,
             attempts = 0,
             created_at = now()`,
      [email, codeHash, expiresAt],
    );

    // 5. Deliver the code. If that fails, remove the row so the user can try
    //    again at once instead of being stuck behind the resend wait.
    try {
      await emailSender.sendLoginCode(email, code);
    } catch {
      await db.query("DELETE FROM login_codes WHERE email = $1", [email]);
      return sendError(reply, 503, "email_unavailable", "We could not send the email. Please try again.");
    }

    return reply.status(200).send({ ok: true });
  });

  // Step 2 of login: "here is the code I received". On success the user is
  // logged in, and their account is created if this is their first time.
  app.post("/auth/verify-code", async (request, reply) => {
    const body = verifyCodeBody.safeParse(request.body);
    if (!body.success) {
      return sendError(reply, 400, "invalid_request", "Send a JSON body like { \"email\": \"...\", \"code\": \"123456\" }.");
    }

    const email = normalizeEmail(body.data.email);

    // 1. Count this attempt BEFORE checking the code, in a single statement.
    //    If we checked first and counted after, two guesses sent at the same
    //    instant could both be checked while the counter still said "4".
    //    RETURNING gives back the row as it is after the update.
    const updated = await db.query<{ code_hash: string; expires_at: Date; attempts: number }>(
      `UPDATE login_codes SET attempts = attempts + 1
       WHERE email = $1
       RETURNING code_hash, expires_at, attempts`,
      [email],
    );
    const pending = updated.rows[0];

    // 2. The code is accepted only if all four of these are true.
    const codeIsValid =
      pending !== undefined &&
      pending.attempts <= MAX_ATTEMPTS &&
      pending.expires_at.getTime() > Date.now() &&
      hashesMatch(hashCode(body.data.code, email, config.loginCodeSecret), pending.code_hash);

    if (!codeIsValid) {
      // One message for every failure (no code, wrong, expired, too many
      // tries), so the answer never tells an attacker which one it was.
      return sendError(reply, 401, "invalid_code", "That code is wrong or has expired. Request a new one.");
    }

    // 3. A code works once: remove it.
    await db.query("DELETE FROM login_codes WHERE email = $1", [email]);

    // 4. Create the user on their first login. If the email already has an
    //    account, ON CONFLICT DO NOTHING leaves it untouched.
    await db.query(
      `INSERT INTO users (email, institution_id, verified_at)
       SELECT $1, id, now() FROM institutions WHERE $2 = ANY(email_domains)
       ON CONFLICT (email) DO NOTHING`,
      [email, emailDomain(email)],
    );
    const found = await db.query<UserRow>(
      `SELECT id, email, first_name, last_name, bio, age_confirmed_at
       FROM users WHERE email = $1`,
      [email],
    );
    const user = found.rows[0];
    if (user === undefined) {
      // Only possible if the school was removed after the code was sent.
      return sendError(reply, 400, "unsupported_email_domain", "This school is no longer supported.");
    }

    // 5. Give the app a signed token that says "this is user <id>".
    //    "sub" (subject) is the standard JWT field for who the token is about.
    const token = await reply.jwtSign({ sub: user.id });

    return reply.status(200).send({ token, user: toAccountJson(user) });
  });
}
