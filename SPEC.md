# SPEC.md: "Break Bread"

A mobile app where people nearby who want to eat right now tap **Go Live**, get matched with someone whose food tastes are close to theirs, chat briefly, confirm, and meet at a restaurant within ~10-20 minutes.

Goal of the project: personal learning project and resume piece, not a business. Success means a working pilot with real users, a codebase the author understands end to end, and real numbers (matches, meetups, repeat use) to talk about.

---

## 1. Decisions made

| Decision | Choice |
|---|---|
| Matching | Automatic. The system proposes the closest-taste match among people live nearby; both can chat, then both confirm. |
| Audience at launch | Concordia students only (school-email verification). Must be designed so adding other universities is configuration, not a rewrite. |
| Backend | Custom: Node.js + TypeScript, PostgreSQL, Redis, WebSockets. |
| Mobile | React Native + Expo (TypeScript). |
| v1 scope | Food-interest profiles, Go Live, taste-based matching within a radius, chat, mutual confirm. Nothing else. |

## 2. Core user flow

1. **Sign up / log in** (same flow, no password): enter school email, receive a one-time code, enter it. New users then give first name, last name (never shown to others) and confirm they are 18+. Account is verified if the email domain belongs to a supported institution.
2. **Build profile** (once, editable, can be skipped at signup): short description, cuisines liked, dietary needs, "happy to share dishes" yes/no. Cuisines and dietary needs are picked from fixed lists.
3. **Go Live**: choose radius (e.g. 500 m / 1 km / 2 km), time window (e.g. next 20 / 30 / 45 min) and budget (`$`, `$$` or `$$$`). App sends current location. User is now "live".
4. **Get matched**: the server finds other live users within the radius, scores taste similarity, and proposes the best candidate. The user sees the candidate's first name and food profile (never exact location).
5. **Chat**: both users get a match chat to agree on where and when.
6. **Confirm**: each user taps Confirm. When both have confirmed, the match is `CONFIRMED` and both leave "live" mode.
7. **Expire**: live sessions and unconfirmed matches expire automatically. Nobody stays live by accident.

## Detailed specs

- Sections 3-4, matching rules and match state machine: [docs/specs/matching.md](docs/specs/matching.md)
- Section 5, data model: [docs/specs/data-model.md](docs/specs/data-model.md)
- Section 6, API sketch: [docs/specs/api.md](docs/specs/api.md)
- Section 7, safety and privacy: [docs/specs/safety.md](docs/specs/safety.md)
- UI design: [docs/specs/ui.md](docs/specs/ui.md)
- System architecture (components, Redis design, atomic matching, deployment, scaling): [docs/specs/architecture.md](docs/specs/architecture.md)

## 8. Non-goals for v1

Saved favorite spots and restaurant search, group matches, ratings, payments, push notifications (in-app realtime only), recommendation AI, admin dashboard. A **Notes for v1.1** list is kept at the bottom.

## 9. Testing and delivery

- Unit tests (Vitest) for the scoring function and state machine.
- API tests (Vitest + Supertest) against a real Postgres and Redis in Docker.
- One end-to-end test of the full flow with two simulated users.
- CI (GitHub Actions) from the first passing test. Automatic backend deploy once the first vertical slice works end to end. Mobile releases stay manual until the pilot.
- Error tracking (Sentry) and anonymous product metrics (PostHog) before the pilot, with no personal data in either.

## 10. Milestones

1. **Skeleton:** API with `/health`, Postgres and Redis in Docker, one test, CI.
2. **Identity:** email code login, institutions table, food profile endpoints with tests, then the Expo screens.
3. **Live:** Go Live and Go Offline, Redis session with TTL, geo lookup.
4. **Matching:** scoring, state machine, proposals over WebSocket.
5. **Chat and confirm:** messages, mutual confirm, expiry.
6. **Safety and pilot:** block, report, deploy, TestFlight, small Concordia pilot.

## 11. Assumptions to confirm

- Pairs (2 people) in v1, not groups.
- Settled: only the student domain `live.concordia.ca` is allowed. Staff addresses (`concordia.ca`) are rejected.
- Email delivery provider for login codes: still open. Needs a provider account and a verified domain before the pilot. Until then, development prints the code in the API terminal.
- Settled: email-code login is built in-house, with no passwords.
- Plain SQL migrations with `pg`, rather than an ORM.
- Concordia email format is : netname@live.concordia.ca

## 12. Notes for v1.1

- Saved favorite spots, and suggesting restaurants that match both profiles (this is where PostGIS and a places API come in).
- Push notifications.
- Groups of 3-4.
- Ratings after a meetup.
- Additional universities.
- Optional password login (the email code stays as the reset path).
- Profile picture, date of birth, major, year of study.
- "Shared meals" count on the profile, computed from confirmed matches.