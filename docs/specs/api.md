# docs/specs/api.md: API (v1)

## 6. API sketch

REST for actions, WebSocket for realtime.

- `POST /auth/request-code`, `POST /auth/verify-code` → returns JWT
- `GET/PUT /me/profile` (food profile)
- `POST /live` (go live: location, radius, window), `DELETE /live` (go offline)
- `GET /matches/current`
- `POST /matches/:id/decline`, `POST /matches/:id/confirm`
- `POST /blocks`, `POST /reports`
- **WebSocket events:** `match.proposed`, `match.updated`, `chat.message`, `chat.send`
