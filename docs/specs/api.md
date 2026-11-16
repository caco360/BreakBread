# docs/specs/api.md: API (v1)

## 6. API sketch

REST for actions, WebSocket for realtime.

- `POST /auth/request-code`, `POST /auth/verify-code` → returns JWT
- `GET/PATCH /me` (own account: first name, last name, description, 18+ confirmation)
- `GET/PUT /me/profile` (food profile: cuisines, dietary needs, happy to share dishes)
- `POST /live` (go live: location, radius, window, budget), `DELETE /live` (go offline)
- `GET /matches/current`
- `POST /matches/:id/decline`, `POST /matches/:id/confirm`
- `POST /blocks`, `POST /reports`
- **WebSocket events:** `match.proposed`, `match.updated`, `chat.message`, `chat.send`
