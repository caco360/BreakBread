// Tells TypeScript what is inside our login tokens, so that
// reply.jwtSign({ sub: ... }) and request.user.sub are type-checked.
import "@fastify/jwt";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    // What we put in when signing: only the user id.
    payload: { sub: string };
    // What request.user holds after a token has been verified.
    user: { sub: string };
  }
}
