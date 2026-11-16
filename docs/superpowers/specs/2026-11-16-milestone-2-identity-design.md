# Milestone 2 (Identity): design

Date: 2026-11-16. Status: waiting for approval.

Lines marked **(decided)** are what the author chose in the brainstorm. Lines marked **(my call)** are defaults picked by Claude that the author has not explicitly agreed to; change any of them.

## 1. Intent

After this milestone a Concordia student can prove they own a school email, get logged in, fill in who they are, and save a food profile. Everything later (Go Live, matching, chat) needs a logged-in user with a profile, so this is the foundation.

This is a learning project: every slice must be small enough that the author can read and explain every line.

## 2. Scope

**In scope: the API only (my call).** The milestone text says "then the Expo screens". The screens get their own design conversation right after this one, because `ui.md` marks the first-run screens as TBD and they are best decided by looking at mockups. Nothing in `apps/mobile/` is created here.

**Goals**
- Login with a one-time code sent to a school email. No passwords. **(decided)**
- Signup and login are the same flow: the first successful code creates the account.
- Account details: first name, last name, 18+ confirmation, short description. **(decided)**
- Food profile: cuisines, dietary needs, "happy to share dishes". **(decided)**
- Config that fails fast, migrations, and `.env.example` (required by `architecture.md` section 9).

**Non-goals (written into `SPEC.md` "Notes for v1.1")**
- Passwords (possible later: nullable `password_hash` column, code login stays as the reset path).
- Profile picture, date of birth, major, year of study. No columns are created for them now.
- Username. Dropped.
- "Number of shared meals" on the profile: computed from `matches` once Milestone 5 exists.
- Really sending email. See section 6.

**Anti-goals (a failure even if it works)**
- Code the author cannot explain. Prefer the plain version over the clever one.
- A login code, token, email or coordinate appearing in a log on a deployed server.
- SQL built by joining strings. Every query uses `$1, $2` parameters.
- Last name or email returned to any other user.

## 3. Spec changes (first slice, docs only)

| File | Change |
|---|---|
| `SPEC.md` | Flow step 2: profile has no budget. Step 3: Go Live also takes a budget. Section 11: resolve the assumptions settled here. Section 12: add the v1.1 items above. |
| `data-model.md` | `users` gains `last_name`, `bio`, `age_confirmed_at`. `food_profiles` loses `budget_min`/`budget_max`. `login_codes` gains `created_at`. `live:session` JSON gains `budget`. |
| `api.md` | Add `GET /me`, `PATCH /me`. Note the budget field on `POST /live`. |
| `matching.md` | Budget comes from the two live sessions, not from profiles. Weights unchanged. |
| `ui.md` | Budget moves from the Profile screen to the Go Live sheet. |

Budget is `$`, `$$` or `$$$` chosen per live session **(decided)**; it is stored and scored in Milestone 3 and 4, not here.

## 4. Data (new migrations in `apps/api/migrations/`)

```
institutions   id, name, email_domains text[]
users          id, email UNIQUE, institution_id, first_name NULL, last_name NULL,
               bio NULL (max 200), age_confirmed_at NULL, verified_at, created_at
food_profiles  user_id PK -> users, cuisines text[], dietary text[], likes_sharing bool, updated_at
login_codes    email PK, code_hash, expires_at, attempts, created_at
```

- Seed row: Concordia University with the domain `live.concordia.ca` only **(my call:** students only, so `concordia.ca` staff addresses are rejected; adding a domain later is one migration).
- Emails are trimmed and lowercased before any check or storage.
- `first_name`, `last_name` and `age_confirmed_at` are empty between "code verified" and "details filled in". An account is **complete** when all three are set.

## 5. Endpoints

All bodies are validated with Zod. Errors use one shape: `{ "error": { "code": "...", "message": "..." } }`.

| Endpoint | Auth | Behavior |
|---|---|---|
| `POST /auth/request-code` `{email}` | none | Rejects unsupported domains with 400. Otherwise creates a code, stores its hash, calls the email sender, returns 200. |
| `POST /auth/verify-code` `{email, code}` | none | On success: deletes the code, creates the user if new, returns `{token, user}`. On failure: counts the attempt, returns 401 with one generic message. |
| `GET /me` | JWT | Own account, including `complete: true/false`. |
| `PATCH /me` `{firstName, lastName, bio, isAdult}` | JWT | Updates own account. `isAdult` must be `true` to set `age_confirmed_at`; it cannot be unset. |
| `GET /me/profile` | JWT | Own food profile, or 404 if not created yet. |
| `PUT /me/profile` `{cuisines, dietary, likesSharing}` | JWT | Creates or replaces own food profile. |

The profile step is skippable **(decided)**, so `PUT /me/profile` is never required. Whether a user without a food profile may go live is an open question for Milestone 3.

**Tags (decided: fixed lists, tapped, not typed).** Lists live in one file, `src/profile/tags.ts`, and the API rejects anything not in them. Starting lists **(my call)**:
- Cuisines: `lebanese, italian, japanese, chinese, indian, mexican, korean, thai, vietnamese, greek, french, fast_food, pizza, burgers, sushi, sandwiches, salads, breakfast, desserts, coffee`
- Dietary: `vegetarian, vegan, halal, kosher, gluten_free, dairy_free, nut_allergy`

## 6. Login code rules

| Rule | Value (my call unless noted) |
|---|---|
| Format | 6 digits from `crypto.randomInt` |
| Lifetime | 10 minutes |
| Wrong attempts allowed | 5, then the code is dead and a new one must be requested |
| Codes per email | One at a time; a new request replaces the old code |
| Resend wait | 60 seconds per email (checked with `login_codes.created_at`) |
| Storage | HMAC-SHA256 of the code with a server secret (`LOGIN_CODE_SECRET`), compared with `timingSafeEqual`. Built into Node, no dependency. A plain hash of 6 digits can be reversed in milliseconds by anyone who reads the table; the secret prevents that. |
| IP rate limit | On both auth endpoints, backed by Redis |

**Email sender (decided).** One interface, `sendLoginCode(email, code)`, three versions:
1. Tests: a fake that records the code so the test can read it.
2. Development: prints the code to the API terminal. This is the single written exception to "never log codes". The app refuses to start with this sender when `NODE_ENV=production`.
3. Production: a real provider. **Not built in this milestone.** It needs a provider account and a verified domain, which the author will get later. Switching is configuration plus one small file.

## 7. Sessions

- `@fastify/jwt`, signed with `JWT_SECRET`, payload is only the user id.
- Token lasts 30 days, no refresh token **(my call)**. Logging out means the app deletes its token.
- Known limit: a stolen token cannot be cancelled before it expires. Acceptable for the pilot; noted for later.
- One `requireAuth` hook guards every `/me` route. A user id always comes from the token, never from the request body or URL.

## 8. Config and layout

- `config.ts` validates environment variables with Zod at startup and exits with a clear message if one is missing or malformed.
- `DATABASE_URL`, `REDIS_URL`, `PORT` keep local defaults in development and test only. `JWT_SECRET` and `LOGIN_CODE_SECRET` have no default anywhere; tests set them in the Vitest setup.
- `apps/api/.env.example` is committed. `.env` stays git-ignored.
- Folders: `src/auth/`, `src/profile/`, `migrations/`, `test/unit/`, `test/api/` (move `health.test.ts` to `test/api/`).
- Pure logic (code generation and hashing, email-domain check, tag validation, "is account complete") lives in files that never import `db.ts` or `redis.ts`.

## 9. Slices, in order

Each slice: plan shown and approved, test first, tests pass, short explanation, one understanding question, commit.

1. Spec sync (section 3). Docs only.
2. Config fail-fast with Zod, `.env.example`, test folders.
3. Migrations tooling plus the `institutions` and `users` tables; migrations run before tests locally and in CI.
4. `POST /auth/request-code` with the code rules and the email sender interface.
5. `POST /auth/verify-code`, JWT, `requireAuth`.
6. Rate limiting on the auth endpoints.
7. `GET /me` and `PATCH /me`.
8. `food_profiles` table, `GET /me/profile`, `PUT /me/profile`.

## 10. Testing

- Unit: code generation and hashing, domain check, tag validation, account completeness.
- API (real Postgres and Redis): happy path, wrong code, expired code, 5 failed attempts, replaced code, unsupported domain, resend wait, missing or bad token, one user cannot read another's data, invalid tags, bio too long.
- Tables are emptied between tests so tests do not depend on each other.

## 11. New dependencies (each needs the author's yes before install)

| Package | Why |
|---|---|
| `zod` | Input and config validation. Already the stack choice in `CLAUDE.md`. |
| `node-pg-migrate` | SQL migrations. Already the stack choice. |
| `@fastify/jwt` | Sign and verify login tokens; the official Fastify plugin. |
| `@fastify/rate-limit` | IP rate limiting with a Redis store; the official Fastify plugin. |

Exact options of each library are to be read from the installed package or its docs during the slice, not assumed.

## 12. Flag for review (security-sensitive)

Code hashing and comparison, attempt limit, rate limits, JWT secret handling and lifetime, the development-only code printing, and the authorization check on `/me` routes.

## 13. Left to the builder

File names inside each feature folder, exact error codes, rate-limit numbers, how tests reset tables, and how migrations are triggered in the test setup.

## 14. Open items outside this milestone

- Local Node is v20; the repo now requires Node 24. Install Node 24 before slice 2.
- Email provider and domain (before the pilot).
- Can a user with no food profile go live? (Milestone 3.)
- Expo screens for signup, code entry, details and profile: next design.
