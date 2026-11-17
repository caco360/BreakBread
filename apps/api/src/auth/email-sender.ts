// The one thing the login flow needs from "email": deliver a code.
// The routes only know this interface, so the real provider, the development
// printer and the test fake can be swapped without touching the routes.
export interface EmailSender {
  sendLoginCode(email: string, code: string): Promise<void>;
}

// DEVELOPMENT ONLY. Prints the code in the API terminal instead of emailing it.
//
// This is the single exception to the "never log codes" rule. It is acceptable
// only because the terminal is the developer's own machine. On a real server,
// logs are stored and readable by other people and tools, and a logged code
// would let them log in as that user. loadConfig refuses to start in
// production for exactly this reason (see config.ts).
export function createConsoleEmailSender(): EmailSender {
  return {
    async sendLoginCode(email: string, code: string): Promise<void> {
      console.log(`[dev only] login code for ${email}: ${code}`);
    },
  };
}
