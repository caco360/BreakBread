import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppDependencies } from "../app.js";
import { sendError } from "../errors.js";
import {
  CODE_TTL_MS,
  RESEND_WAIT_MS,
  emailDomain,
  generateCode,
  hashCode,
  normalizeEmail,
} from "./codes.js";

// strictObject rejects any field we did not list.
// 254 is the longest an email address is allowed to be.
const requestCodeBody = z.strictObject({
  email: z.string().max(254),
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
}
