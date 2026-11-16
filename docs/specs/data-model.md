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
- `active_match_participants` (user_id UNIQUE, match_id): one row per user in a non-terminal match. The unique constraint is what guarantees a user is never in two matches. Rows are deleted in the same transaction that moves the match to `CONFIRMED`, `DECLINED` or `EXPIRED`. See `architecture.md` section 5.

**Redis (ephemeral), partitioned by institution:**
- `live:session:{userId}`: JSON {radius, windowEnd, institutionId, locationUpdatedAt}, with TTL equal to the time window.
- `live:geo:{institutionId}`: geo set of live users, queried with `GEOSEARCH`. Members do not expire on their own: they are removed on go-offline and match confirmation, and the matcher sweep removes members whose session key has expired.
- `claim:{userId}`: random token, TTL ~15 s. Short lock taken while proposing a pair.
- `lock:matcher:{institutionId}`: random token, TTL ~5 s. Only one matcher run per institution at a time.
