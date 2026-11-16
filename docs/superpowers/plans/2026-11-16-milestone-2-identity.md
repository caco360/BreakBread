# Milestone 2 (Identity) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Concordia student can log in with an emailed one-time code, fill in their account details, and save a food profile, all through the API.

**Architecture:** Fastify app built by `buildApp(deps)` with dependencies passed in (db, redis, config, email sender). One folder per feature (`src/auth/`, `src/profile/`). Pure logic (codes, domain check, tags, completeness) sits in files with no database or Redis imports; routes are thin wiring around them.

**Tech Stack:** Node + TypeScript (strict, ESM, `.js` import suffixes), Fastify 5, Zod 4, `pg` with parameterized SQL, `node-pg-migrate` 9 (SQL files), `@fastify/jwt` 10, `@fastify/rate-limit` 11, Vitest + Supertest against Docker Postgres and Redis.

**Spec:** `docs/superpowers/specs/2026-11-16-milestone-2-identity-design.md`. Also read `CLAUDE.md` and `docs/specs/architecture.md` sections 9 and 14.

## Global Constraints

- Project name is "Break Bread". Never write "Lunch Now".
- The author must understand every line: plain code, a short comment wherever a line is not obvious, no clever abstractions.
- Per task (from `CLAUDE.md`): test first, tests pass, then give a short "how this works" explanation, ask one understanding question, commit. Stop after each task for the author.
- Never invent library facts. Before using `node-pg-migrate`, `@fastify/jwt`, `@fastify/rate-limit` or a Zod 4 feature, read the installed package's README or types in `node_modules`. Where this plan names a library option, treat it as "expected, verify".
- Every SQL query uses `$1, $2` parameters. No string-built SQL.
- Never log emails, codes, tokens or coordinates. Only exception: the development console email sender.
- Schema changes only through new migration files in `apps/api/migrations/`.
- No `any` without a comment explaining why.
- Validate every request body with Zod. Object schemas are strict: unknown fields are a 400.
- Error body shape everywhere: `{ "error": { "code": string, "message": string } }`.
- A user id always comes from the verified token, never from a body or URL.
- Dependencies approved: `zod`, `node-pg-migrate`, `@fastify/jwt`, `@fastify/rate-limit`. Anything else needs the author's yes first.
- Commands: `docker compose up -d --wait`, `npm test`, `npm run typecheck` (run from the repo root). Both must pass before every commit.
- Commit messages end with the attribution lines the session provides.

## Review Focus

1. **Email typed with capitals or spaces** (`" Carl@Live.Concordia.CA "`): must be the same account as `carl@live.concordia.ca`. Tests in Tasks 4 and 5.
2. **Look-alike domains** (`a@live.concordia.ca.evil.com`, `a@notlive.concordia.ca`, `a@concordia.ca`): must be rejected; only an exact domain match counts. Test in Task 4.
3. **Email sender fails**: the user gets a 503 and can retry at once, not be stuck behind the 60 second resend wait. Test in Task 4.
4. **Valid token whose user no longer exists**: 401, never a 500 or an empty 200. Test in Task 5.
5. **Blank or smuggled fields on `PATCH /me`** (`firstName: "   "`, or extra fields like `email`, `institutionId`): 400, and email and institution never change. Test in Task 7.

## File map

```
apps/api/
  .env.example                      Task 2
  vitest.config.ts                  Task 2  test env vars, one file at a time, global setup
  migrations/*.sql                  Tasks 3, 4, 8
  src/
    config.ts                       Task 2  loadConfig(env) + config
    app.ts                          Tasks 2-8  buildApp wires plugins and routes
    server.ts                       Tasks 2, 4  passes config and the email sender
    errors.ts                       Task 4  sendError helper
    auth/
      codes.ts                      Task 4  pure: normalize, generate, hash, compare
      email-sender.ts               Task 4  EmailSender interface + console sender
      routes.ts                     Tasks 4, 5, 6
      require-auth.ts               Task 5
    profile/
      account.ts                    Task 7  pure: isAccountComplete, toAccountJson
      account-routes.ts             Task 7  GET/PATCH /me
      tags.ts                       Task 8  CUISINES, DIETARY
      food-profile-routes.ts        Task 8  GET/PUT /me/profile
  test/
    global-setup.ts                 Task 3  runs migrations once before all tests
    helpers.ts                      Tasks 3-5  createTestApp, resetState, FakeEmailSender, loginAs
    unit/*.test.ts                  config, codes, account, tags
    api/*.test.ts                   health, auth, rate-limit, account, food-profile
```

---

### Task 1: Spec sync (docs only)

**Files:** Modify `SPEC.md`, `docs/specs/data-model.md`, `docs/specs/api.md`, `docs/specs/matching.md`, `docs/specs/ui.md`.

- [ ] **Step 1:** Apply exactly the changes in the design's section 3 table.
  - `SPEC.md` section 2: step 2 lists cuisines, dietary needs, "happy to share dishes", short description (no budget). Step 3 adds "budget (`$`, `$$` or `$$$`)".
  - `SPEC.md` section 11: mark as settled: code login built in-house; student domain `live.concordia.ca` only; email provider still open (development prints the code).
  - `SPEC.md` section 12: add passwords, profile picture, date of birth, major, year of study, "shared meals" count on the profile.
  - `data-model.md`: `users` (id, email, institution_id, first_name, last_name, bio, age_confirmed_at, verified_at, created_at); `food_profiles` (user_id, cuisines text[], dietary text[], likes_sharing bool, updated_at); `login_codes` (email, code_hash, expires_at, attempts, created_at); `live:session` JSON adds `budget`.
  - `api.md`: add `GET/PATCH /me` (own account); `POST /live` takes location, radius, window, budget.
  - `matching.md`: "budget overlap: 0.25" now compares the two live sessions' budget levels; exact formula is decided in Milestone 4.
  - `ui.md`: Profile section no longer edits budget; the Go Live sheet picks radius, time window and budget. Fix the file's first heading path (`docs/spec/ui.md` → `docs/specs/ui.md`).
- [ ] **Step 2:** `git grep -n -i "budget_min\|budget_max\|lunch now"` returns nothing.
- [ ] **Step 3:** Commit: `Sync specs with Milestone 2 design decisions`.

---

### Task 2: Config that fails fast

**Files:** Modify `apps/api/src/config.ts`, `src/app.ts`, `src/server.ts`, `apps/api/package.json`; create `apps/api/.env.example`, `apps/api/vitest.config.ts`, `test/unit/config.test.ts`; move `test/health.test.ts` → `test/api/health.test.ts`.

**Interfaces — Produces:**
```ts
export interface Config {
  nodeEnv: "development" | "test" | "production";
  port: number;
  databaseUrl: string;
  redisUrl: string;
  jwtSecret: string;        // min 32 characters, no default anywhere
  loginCodeSecret: string;  // min 32 characters, no default anywhere
}
export function loadConfig(env: NodeJS.ProcessEnv): Config; // throws Error naming every bad variable
export const config: Config; // loadConfig(process.env)
// app.ts
export interface AppDependencies { db: pg.Pool; redis: Redis; config: Config; }
```

- [ ] **Step 0:** Run `node -v`. The repo requires Node 24; if it prints less, tell the author before continuing (npm only warns, CI uses 24).
- [ ] **Step 1:** Install: `npm install zod --workspace apps/api`.
- [ ] **Step 2: Failing tests** in `test/unit/config.test.ts` for `loadConfig`:
  - valid development env with only the two secrets set → `port === 3000`, `databaseUrl === "postgres://breakbread:breakbread@localhost:5432/break_bread"`, `redisUrl === "redis://localhost:6379"`.
  - missing `JWT_SECRET` → throws, message contains `JWT_SECRET`.
  - `LOGIN_CODE_SECRET` of 10 characters → throws, message contains `LOGIN_CODE_SECRET`.
  - `NODE_ENV=production` without `DATABASE_URL` → throws, message contains `DATABASE_URL` (same for `REDIS_URL`).
  - `NODE_ENV=production` with everything set → throws with a message saying no production email sender exists yet (removed when a real sender is added).
  - `PORT=abc` → throws, message contains `PORT`.
  - `NODE_ENV` unset → `"development"`.
- [ ] **Step 3:** Run `npm test`; the new tests fail.
- [ ] **Step 4:** Implement `loadConfig` with a Zod schema. Create `vitest.config.ts` with `test.env` = `{ NODE_ENV: "test", JWT_SECRET: <32+ char test value>, LOGIN_CODE_SECRET: <32+ char test value> }` and `test.fileParallelism: false` (test files share one database). Add `config` to `AppDependencies`; update `server.ts` and the health test to pass it. `server.ts` must print the config error message and exit with code 1, without a stack trace.
- [ ] **Step 5:** `.env.example` lists all six variables with comments and placeholder secrets, plus how to generate one (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`). Change the `dev` script to load `.env` (expected: `tsx watch --env-file=.env src/server.ts`; verify in the tsx docs). Create the author's local `apps/api/.env` with generated secrets; confirm `git status` does not show it.
- [ ] **Step 6:** `npm test` and `npm run typecheck` pass. `npm run dev:api` starts; with `JWT_SECRET` removed from `.env` it exits naming `JWT_SECRET`.
- [ ] **Step 7:** Update the Commands section of `CLAUDE.md` if a command changed. Commit: `Validate config at startup; add .env.example and test folders`.

---

### Task 3: Migrations, institutions and users

**Files:** Create `apps/api/migrations/<timestamp>_create-institutions-and-users.sql`, `test/global-setup.ts`, `test/helpers.ts`, `test/api/schema.test.ts`; modify `apps/api/package.json`, root `package.json`, `vitest.config.ts`, `CLAUDE.md`.

**Interfaces — Produces:**
```ts
// test/helpers.ts
export async function createTestApp(): Promise<{ app: FastifyInstance; db: pg.Pool; redis: Redis }>; // app.ready() already awaited
export async function resetState(db: pg.Pool, redis: Redis): Promise<void>; // empties users (and later tables), keeps institutions, flushes Redis
```
Scripts: `npm run migrate` (root → workspace) applies pending migrations using `DATABASE_URL`; `npm run migrate:create -- <name>` creates a new SQL migration file.

Schema:
```sql
institutions(id uuid PK DEFAULT gen_random_uuid(), name text NOT NULL, email_domains text[] NOT NULL)
users(id uuid PK DEFAULT gen_random_uuid(), email text NOT NULL UNIQUE,
      institution_id uuid NOT NULL REFERENCES institutions(id),
      first_name text, last_name text,
      bio text CHECK (char_length(bio) <= 200),
      age_confirmed_at timestamptz,
      verified_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now())
-- seed: ('Concordia University', ARRAY['live.concordia.ca'])
```

- [ ] **Step 1:** Install: `npm install node-pg-migrate --workspace apps/api`. Read its README for: SQL-file migrations (up/down markers), the CLI flags for the migrations directory and SQL language, and the programmatic runner export.
- [ ] **Step 2: Failing test** `test/api/schema.test.ts`: `SELECT email_domains FROM institutions WHERE name = 'Concordia University'` returns exactly `["live.concordia.ca"]`; inserting two users with the same email rejects with a unique violation (Postgres code `23505`); inserting a 201-character `bio` rejects.
- [ ] **Step 3:** Write the migration (up and down). Write `test/global-setup.ts` to run all pending migrations against `config.databaseUrl` once before the test run, and register it in `vitest.config.ts` (`test.globalSetup`). Write `helpers.ts`.
- [ ] **Step 4:** `npm test` passes twice in a row (migrations are skipped the second time). `npm run migrate` on the dev database reports nothing to do or applies cleanly.
- [ ] **Step 5:** Add `npm run migrate` to `CLAUDE.md` Commands. Commit: `Add migrations with institutions and users tables`.

---

### Task 4: `POST /auth/request-code`

**Files:** Create `src/errors.ts`, `src/auth/codes.ts`, `src/auth/email-sender.ts`, `src/auth/routes.ts`, a `create-login-codes` migration, `test/unit/codes.test.ts`, `test/api/auth-request-code.test.ts`; modify `src/app.ts`, `src/server.ts`, `test/helpers.ts`.

**Interfaces — Produces:**
```ts
// errors.ts
export function sendError(reply: FastifyReply, status: number, code: string, message: string): FastifyReply;
// auth/codes.ts (pure, no db/redis imports)
export const CODE_TTL_MS = 10 * 60 * 1000;
export const MAX_ATTEMPTS = 5;
export const RESEND_WAIT_MS = 60 * 1000;
export function normalizeEmail(raw: string): string;          // trim + lowercase
export function emailDomain(email: string): string;            // text after the last "@"
export function generateCode(): string;                        // 6 digits via crypto.randomInt, zero-padded
export function hashCode(code: string, email: string, secret: string): string; // HMAC-SHA256 hex of `${email}:${code}`
export function hashesMatch(a: string, b: string): boolean;    // crypto.timingSafeEqual; false if lengths differ
// auth/email-sender.ts
export interface EmailSender { sendLoginCode(email: string, code: string): Promise<void>; }
export function createConsoleEmailSender(): EmailSender;       // prints the code; development only
// app.ts
export interface AppDependencies { db; redis; config; emailSender: EmailSender; }
// auth/routes.ts
export function registerAuthRoutes(app: FastifyInstance, deps: AppDependencies): void;
// test/helpers.ts
export class FakeEmailSender implements EmailSender { lastCodeFor(email: string): string | undefined; failNext(): void; }
// createTestApp() now also returns { emails: FakeEmailSender }; resetState also empties login_codes
```
Table: `login_codes(email text PK, code_hash text NOT NULL, expires_at timestamptz NOT NULL, attempts int NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now())`.

Behavior of `POST /auth/request-code` with body `{ email: string }`:

| Case | Response |
|---|---|
| Body fails Zod (missing, not an email, extra fields) | 400 `invalid_request` |
| Domain matches no `institutions.email_domains` entry exactly | 400 `unsupported_email_domain` |
| A code for this email was created under 60 s ago | 429 `resend_too_soon` |
| Sender throws | delete the row, 503 `email_unavailable` |
| Otherwise | upsert the row (new hash, `attempts = 0`, new `created_at`, `expires_at` = now + 10 min), send, 200 `{ "ok": true }` |

`server.ts` passes `createConsoleEmailSender()`. The console sender is safe only because `loadConfig` refuses `production` (Task 2); say so in a comment there.

- [ ] **Step 1: Failing unit tests** (`codes.test.ts`): `normalizeEmail(" Carl@Live.Concordia.CA ") === "carl@live.concordia.ca"`; `emailDomain("a@live.concordia.ca.evil.com") === "live.concordia.ca.evil.com"`; `generateCode()` matches `/^\d{6}$/` over 1000 calls; `hashCode` is deterministic, differs for another code, another email and another secret, and never contains the code; `hashesMatch` true for equal, false for different, false for different lengths.
- [ ] **Step 2: Failing API tests** (`auth-request-code.test.ts`, `resetState` in `beforeEach`):
  - valid email → 200 `{ok:true}`; `emails.lastCodeFor(email)` matches `/^\d{6}$/`; the `login_codes` row's `code_hash` is not the code and `attempts` is 0.
  - `" Carl@Live.Concordia.CA "` → 200 and the row's email is `carl@live.concordia.ca`.
  - each of `a@gmail.com`, `a@concordia.ca`, `a@notlive.concordia.ca`, `a@live.concordia.ca.evil.com` → 400 `unsupported_email_domain`, no email sent.
  - `{}`, `{email: 5}`, `{email: "nope"}`, `{email: valid, extra: 1}` → 400 `invalid_request`.
  - second request for the same email at once → 429 `resend_too_soon`; the stored code is unchanged.
  - after setting the row's `created_at` 61 s into the past, a new request → 200 with a different hash and `attempts` back to 0.
  - `emails.failNext()` then request → 503 `email_unavailable`; an immediate retry → 200.
- [ ] **Step 3:** Run; they fail. Implement. Run; all pass, typecheck passes.
- [ ] **Step 4:** Start the dev server, `POST` a `@live.concordia.ca` address with curl, see the code printed in the terminal.
- [ ] **Step 5:** Flag for the author's review: `hashCode`, `hashesMatch`, the console sender. Commit: `Add POST /auth/request-code with hashed, expiring login codes`.

---

### Task 5: `POST /auth/verify-code`, tokens and `requireAuth`

**Files:** Create `src/auth/require-auth.ts`, `test/api/auth-verify-code.test.ts`; modify `src/auth/routes.ts`, `src/app.ts`, `test/helpers.ts`.

**Interfaces — Consumes:** everything from Task 4.
**Produces:**
```ts
// auth/require-auth.ts
export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void>; // preHandler; 401 `unauthorized` on a missing, malformed, expired or wrongly signed token
// After it runs, the user id is at request.user.sub (type declared by extending @fastify/jwt's FastifyJWT interface; verify the name in its types)
// Account JSON returned to its owner (also used by Task 7):
type AccountJson = { id: string; email: string; firstName: string | null; lastName: string | null; bio: string | null; isAdult: boolean; complete: boolean };
// test/helpers.ts
export async function loginAs(ctx, email: string): Promise<{ token: string; userId: string }>; // request-code, read the fake, verify-code
```
Token: `@fastify/jwt` registered with `config.jwtSecret`; payload `{ sub: userId }`; expires in 30 days.

Behavior of `POST /auth/verify-code` with body `{ email: string, code: string }` (code must match `/^\d{6}$/` as a string):

1. Zod failure → 400 `invalid_request`.
2. Atomically `UPDATE login_codes SET attempts = attempts + 1 WHERE email = $1 RETURNING ...`. No row → 401 `invalid_code`.
3. If returned `attempts > 5`, or `expires_at` is past, or the hash does not match → 401 `invalid_code`. One message for all three, so the response never reveals which.
4. Success: delete the code row; insert the user if the email is new (`institution_id` from the domain, `verified_at = now()`; `ON CONFLICT (email) DO NOTHING`); return 200 `{ token, user: AccountJson }`.

Incrementing before comparing is deliberate: two guesses sent at the same instant still each use up an attempt.

- [ ] **Step 1: Failing API tests:**
  - correct code → 200; `user.email` normalized, `firstName` null, `complete` false; a `users` row exists with the Concordia `institution_id`; the `login_codes` row is gone.
  - the same code again → 401 `invalid_code`.
  - second login for the same email → same `user.id`, still one `users` row.
  - request with `"carl@live.concordia.ca"`, verify with `" Carl@Live.Concordia.CA "` → 200.
  - wrong code → 401 and `attempts` is 1; the right code afterwards → 200.
  - 5 wrong codes, then the right code → 401.
  - `expires_at` set to the past → 401 with the right code.
  - no code ever requested → 401.
  - `code: 123456` (number), `"12345"`, `"abcdef"` → 400 `invalid_request`.
  - a temporary test-only route guarded by `requireAuth` is not needed: assert through `GET /me` in Task 7. Here, decode the returned token with `app.jwt.verify` and expect `sub === user.id` and an expiry about 30 days ahead (within 1 minute).
- [ ] **Step 2:** Run; fail. Install `npm install @fastify/jwt --workspace apps/api`, read its README, implement. Run; pass, typecheck passes.
- [ ] **Step 3:** Flag for review: attempt counting, the single 401 message, token lifetime and secret. Commit: `Add POST /auth/verify-code, JWT sessions and requireAuth`.

---

### Task 6: Rate limiting on auth endpoints

**Files:** Modify `src/app.ts`, `src/auth/routes.ts`; create `test/api/rate-limit.test.ts`.

Limits per client IP, counted in Redis: `request-code` 10 per hour; `verify-code` 20 per 10 minutes. Not global: `/health` and other routes are unlimited. Over the limit → 429 with our error shape, code `rate_limited`.

- [ ] **Step 1:** Install `npm install @fastify/rate-limit --workspace apps/api`; read its README for per-route config, the Redis store option, and customizing the error response.
- [ ] **Step 2: Failing tests:** 10 `request-code` calls with 10 different valid emails → all 200, the 11th → 429 `rate_limited`; 20 `verify-code` calls → none are 429, the 21st → 429 `rate_limited`; 30 `GET /health` calls → all 200. `resetState` flushes Redis, so counters start at zero in every test.
- [ ] **Step 3:** Implement; all tests pass (including earlier ones), typecheck passes.
- [ ] **Step 4:** Add to `architecture.md` section 15: "Before deploy: configure Fastify `trustProxy` for the hosting platform, or every user shares the proxy's IP and one rate limit." Commit: `Rate limit auth endpoints per IP`.

---

### Task 7: `GET /me` and `PATCH /me`

**Files:** Create `src/profile/account.ts`, `src/profile/account-routes.ts`, `test/unit/account.test.ts`, `test/api/account.test.ts`; modify `src/app.ts`, `src/auth/routes.ts` (reuse `toAccountJson`).

**Interfaces — Consumes:** `requireAuth`, `request.user.sub`, `AccountJson`, `loginAs`.
**Produces:**
```ts
// profile/account.ts (pure)
export interface UserRow { id: string; email: string; first_name: string | null; last_name: string | null; bio: string | null; age_confirmed_at: Date | null; }
export function isAccountComplete(user: UserRow): boolean; // first_name, last_name and age_confirmed_at all set
export function toAccountJson(user: UserRow): AccountJson;
// profile/account-routes.ts
export function registerAccountRoutes(app: FastifyInstance, deps: AppDependencies): void;
```
`PATCH /me` body, strict, every field optional, at least one present: `firstName` and `lastName` trimmed, 1 to 50 characters after trimming; `bio` trimmed, at most 200 characters, or `null` to clear; `isAdult` only the literal `true` (sets `age_confirmed_at = now()` if it is still empty; never cleared). Returns 200 with the updated `AccountJson`. Both routes: token valid but user row missing → 401 `unauthorized`.

- [ ] **Step 1: Failing unit tests:** `isAccountComplete` is false when any one of the three is null and true when all are set; `toAccountJson` maps names to camelCase, `isAdult` is `age_confirmed_at !== null`, and the result has exactly the seven `AccountJson` keys.
- [ ] **Step 2: Failing API tests:**
  - `GET /me` with no header, with `Bearer garbage`, and with a token signed by a different secret → 401 `unauthorized`.
  - `GET /me` after `loginAs` → 200, own email, `complete: false`.
  - `PATCH {firstName:" Carl ", lastName:"Nasr", isAdult:true}` → 200, `firstName: "Carl"`, `complete: true`; `GET /me` agrees.
  - `PATCH {bio:"x".repeat(201)}` → 400; `"x".repeat(200)` → 200; `{bio:null}` → 200 with `bio: null`.
  - `PATCH {firstName:"   "}`, `{}`, `{isAdult:false}`, `{email:"b@live.concordia.ca"}`, `{firstName:"A", institutionId:"..."}` → 400 `invalid_request`; email and `institution_id` in the database are unchanged.
  - `isAdult:true` sent twice → `age_confirmed_at` keeps its first value.
  - two users: A's `PATCH` does not change B's row.
  - delete the user row, then `GET /me` with the still-valid token → 401.
- [ ] **Step 3:** Implement; all pass; typecheck passes.
- [ ] **Step 4:** Flag for review: authorization on `/me`. Commit: `Add GET and PATCH /me for account details`.

---

### Task 8: Food profile

**Files:** Create a `create-food-profiles` migration, `src/profile/tags.ts`, `src/profile/food-profile-routes.ts`, `test/unit/tags.test.ts`, `test/api/food-profile.test.ts`; modify `src/app.ts`, `test/helpers.ts` (`resetState`).

**Interfaces — Produces:**
```ts
// profile/tags.ts
export const CUISINES = ["lebanese","italian","japanese","chinese","indian","mexican","korean","thai","vietnamese","greek","french","fast_food","pizza","burgers","sushi","sandwiches","salads","breakfast","desserts","coffee"] as const;
export const DIETARY = ["vegetarian","vegan","halal","kosher","gluten_free","dairy_free","nut_allergy"] as const;
// profile/food-profile-routes.ts
export function registerFoodProfileRoutes(app: FastifyInstance, deps: AppDependencies): void;
```
Table: `food_profiles(user_id uuid PK REFERENCES users(id) ON DELETE CASCADE, cuisines text[] NOT NULL, dietary text[] NOT NULL, likes_sharing boolean NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`.

`PUT /me/profile` body, strict, all three required: `cuisines` (values from `CUISINES`, no duplicates, may be empty), `dietary` (values from `DIETARY`, no duplicates, may be empty), `likesSharing` boolean. Upsert; 200 with `{ cuisines, dietary, likesSharing }`. `GET /me/profile` → the same shape, or 404 `profile_not_found`. Both need `requireAuth`.

- [ ] **Step 1: Failing unit test:** `CUISINES` and `DIETARY` contain no duplicates and every value matches `/^[a-z_]+$/`.
- [ ] **Step 2: Failing API tests:**
  - both routes without a token → 401.
  - `GET` before any `PUT` → 404 `profile_not_found`.
  - `PUT {cuisines:["japanese","fast_food"], dietary:["halal"], likesSharing:true}` → 200; `GET` returns the same.
  - a second `PUT` with different values replaces the first; still one row.
  - `PUT {cuisines:[], dietary:[], likesSharing:false}` → 200.
  - `cuisines:["klingon"]`, `cuisines:["pizza","pizza"]`, `dietary:["carnivore"]`, missing `likesSharing`, `likesSharing:"yes"`, an extra field → 400 `invalid_request`.
  - two users: each `GET` returns only their own profile.
- [ ] **Step 3:** Implement; all pass; typecheck passes.
- [ ] **Step 4:** Tick Milestone 2's API part in `SPEC.md` section 10 ("Expo screens: next design"). Commit: `Add food profile endpoints with fixed tag lists`.
