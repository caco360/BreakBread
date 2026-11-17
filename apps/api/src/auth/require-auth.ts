import type { FastifyReply, FastifyRequest } from "fastify";
import { sendError } from "../errors.js";

// Runs before the handler of every route that needs a logged-in user.
//
// The app sends its token in a header:  Authorization: Bearer <token>
// request.jwtVerify() reads that header, checks the signature with our
// secret and checks the expiry date. If anything is wrong it throws.
// If all is well it stores the token's contents in request.user, so the
// handler can read the user id from request.user.sub.
export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply | undefined> {
  try {
    await request.jwtVerify();
  } catch {
    // Missing, malformed, forged or expired: the answer is the same.
    // Returning the reply stops the request here; the handler never runs.
    return sendError(reply, 401, "unauthorized", "Log in to continue.");
  }
}
