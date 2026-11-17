import type { FastifyReply } from "fastify";

// Every error the API returns has the same shape, so the mobile app can
// handle all of them the same way:
//   { "error": { "code": "resend_too_soon", "message": "Please wait..." } }
// "code" is for the app's logic. "message" is for a person to read.
export function sendError(
  reply: FastifyReply,
  status: number,
  code: string,
  message: string,
): FastifyReply {
  return reply.status(status).send({ error: { code, message } });
}
