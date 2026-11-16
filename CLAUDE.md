# CLAUDE.md

Project: "Break Bread", an app that matches nearby people who want to eat right now. Read `SPEC.md` for the full design before making any change.

Spec files by area: matching rules and match state machine → `docs/specs/matching.md`; database tables and Redis keys → `docs/specs/data-model.md`; REST endpoints and WebSocket events → `docs/specs/api.md`; auth, location privacy, block/report → `docs/specs/safety.md`; screens, colors, navigation → `docs/specs/ui.md`; components, Redis design, atomic matching, deployment, code layout → `docs/specs/architecture.md`. Goals, user flow, non-goals, milestones, assumptions and testing stay in `SPEC.md`.

## About the person you're working with

A computer engineering student, new to building with AI. This is a learning project. The goal is for them to **understand every line**, not just to get a working app. Prefer clear, simple code over clever code.

## Working rules

1. **Plan before code.** For any new feature, first explain what you will build and which files you will touch. Wait for approval before editing.
2. **Small vertical slices.** One feature at a time, each runnable and tested. No big-bang changes.
3. **Explain as you go.** After each slice, give a short "how this works" explanation and ask one question to check understanding.
4. **Tests alongside every feature.** Write the test first when practical. A slice isn't done until its tests pass.
5. **Don't add anything not in `SPEC.md`.** If you think something is missing, suggest it and ask.
6. **Never invent facts about libraries.** If unsure about an API, check the docs or the installed package source.
7. **Ask before installing a new dependency**, and say why it's needed.
8. **Commit after each working slice** with a clear message. Do not commit secrets or `.env` files.
9. **Be honest, not agreeable. Then fix it** I value accuracy over comfort. If something is broken, say it's broken. If my idea has flaw, say the flaw. Skip long justifications and apologies - state the problem and propose a solution

## Stack

- Mobile: React Native + Expo, TypeScript
- API: Node.js + TypeScript, Fastify, Zod for validation
- Database: PostgreSQL via `pg`, plain SQL migrations (`node-pg-migrate`)
- Live state: Redis (`ioredis`), including geo queries
- Realtime: Socket.IO
- Tests: Vitest + Supertest, real Postgres and Redis through Docker Compose
- CI: GitHub Actions

## Repo layout (target)

```
apps/api/      Node backend
apps/mobile/   Expo app
docs/          Notes and decisions
SPEC.md
CLAUDE.md
```

## Conventions

- TypeScript `strict` mode. No `any` without a comment explaining why.
- Validate all external input (HTTP bodies, WebSocket messages) with Zod.
- Keep business logic (matching score, state machine) in pure functions separate from HTTP and database code so it can be unit tested.
- Never log emails, codes, tokens or coordinates.
- Never write user coordinates to Postgres; live location lives only in Redis with a TTL.
- Database changes always go through a new migration file, never by editing an old one.

## Commands

Fill these in as soon as they exist (ask me to update this section after each setup step):

- Start dependencies: `docker compose up -d --wait` (Docker Desktop must be running)
- Run API: `npm run dev:api`
- Run tests: `npm test` (type-check: `npm run typecheck`)
- Run mobile app: _TBD_

## Security reminders

Login codes are hashed and short-lived with an attempt limit. Rate limit auth endpoints. Check authorization on every endpoint (a user may only access their own matches and chats). Flag anything security-sensitive for my review before moving on.