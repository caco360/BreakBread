# docs/specs/data-model.md: Data model (v1)

## 5. Data model

**PostgreSQL (durable):**
- `institutions` (id, name, email_domains text[])
- `users` (id, email, institution_id, first_name, verified_at, created_at)
- `food_profiles` (user_id, cuisines text[], dietary text[], budget_min, budget_max, likes_sharing bool)
- `matches` (id, user_a, user_b, score, status, created_at, expires_at, confirmed_a_at, confirmed_b_at)
- `messages` (id, match_id, sender_id, body, created_at)
- `blocks` (blocker_id, blocked_id, created_at)
- `reports` (id, reporter_id, reported_id, match_id, reason, created_at)
- `login_codes` (email, code_hash, expires_at, attempts)

**Redis (ephemeral):**
- `live:session:{userId}`: JSON {radius, windowEnd}, with TTL equal to the time window.
- `live:geo`: geo set of live users, queried with `GEOSEARCH`. Members removed when a session ends or expires.
