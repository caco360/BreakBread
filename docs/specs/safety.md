# docs/specs/safety.md: Safety and privacy (v1)

## 7. Safety and privacy (required before any real user)

- Verified school email only.
- Block and report, available from the match screen and chat.
- Exact location is never shown to other users. Server stores the live location only in Redis for the session's lifetime; coordinates are not written to Postgres.
- Meeting guidance in-app: meet in a public place; tell a friend.
- Users must confirm they are 18+ at signup.
- Rate limit the code request and verification endpoints; hash login codes; expire them quickly.
