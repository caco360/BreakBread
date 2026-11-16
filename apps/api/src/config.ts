import { z } from "zod";

// The settings the rest of the app uses. Built once at startup by loadConfig.
export interface Config {
  nodeEnv: "development" | "test" | "production";
  port: number;
  databaseUrl: string;
  redisUrl: string;
  // Signs login tokens (JWT). Anyone who knows it can forge a login.
  jwtSecret: string;
  // Mixed into login-code hashes so a leaked table cannot be reversed.
  loginCodeSecret: string;
}

// These match docker-compose.yml. They are used in development and tests only.
const LOCAL_DATABASE_URL = "postgres://breakbread:breakbread@localhost:5432/break_bread";
const LOCAL_REDIS_URL = "redis://localhost:6379";

// Environment variables are always strings (or missing). This schema says
// what each one must look like and converts it to the type we want.
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  // z.coerce.number() turns the string "3000" into the number 3000.
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().min(1).optional(),
  REDIS_URL: z.string().min(1).optional(),
  // Secrets have no default on purpose: a default secret is a public secret.
  JWT_SECRET: z.string().min(32),
  LOGIN_CODE_SECRET: z.string().min(32),
});

// Reads and checks the environment. Throws one Error that lists every problem,
// so a misconfigured server stops at startup instead of failing later.
export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const parsed = envSchema.safeParse(env);

  if (!parsed.success) {
    // Each issue has a path (the variable name) and a message.
    const problems = parsed.error.issues.map(
      (issue) => `${issue.path.join(".")}: ${issue.message}`,
    );
    throw new Error(`Invalid configuration:\n- ${problems.join("\n- ")}`);
  }

  const values = parsed.data;

  if (values.NODE_ENV === "production") {
    // Local defaults must never be used on a real server.
    const missing: string[] = [];
    if (values.DATABASE_URL === undefined) missing.push("DATABASE_URL");
    if (values.REDIS_URL === undefined) missing.push("REDIS_URL");
    if (missing.length > 0) {
      throw new Error(
        `Invalid configuration:\n- ${missing.join(", ")}: required in production`,
      );
    }

    // The only email sender so far prints login codes to the terminal.
    // That is safe on a developer's machine and unsafe on a server, where
    // logs are stored. Remove this check when a real email sender is added.
    throw new Error(
      "Invalid configuration:\n- no production email sender exists yet, so the API cannot run in production",
    );
  }

  return {
    nodeEnv: values.NODE_ENV,
    port: values.PORT,
    databaseUrl: values.DATABASE_URL ?? LOCAL_DATABASE_URL,
    redisUrl: values.REDIS_URL ?? LOCAL_REDIS_URL,
    jwtSecret: values.JWT_SECRET,
    loginCodeSecret: values.LOGIN_CODE_SECRET,
  };
}
