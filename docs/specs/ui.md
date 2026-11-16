# docs/spec/ui.md: UI design (v1)
 
Status: first draft from the author's vision. Details marked **TBD** are intentionally open.
 
## 1. Feel
 
Uber-like: clean, bold, and fast to use with one hand. Big tap targets, little text, one obvious primary action per screen. Mostly white and near-black, with the brand orange used sparingly to draw attention to what matters.
 
## 2. Colors
 
| Role | Value | Use |
|---|---|---|
| Brand orange | `#FD5907` | Primary buttons (Go Live), active nav tab, key highlights, the radius circle on the map |
| White | `#FFFFFF` | Backgrounds, cards |
| Near-black | `#111111` (TBD) | Main text, secondary buttons |
| Light grey | `#F4F4F4` (TBD) | Card and input backgrounds, dividers |
| Mid grey | `#6B6B6B` (TBD) | Secondary text |
 
Accessibility note: white text on `#FD5907` has a contrast ratio of about 3.2:1. That is acceptable for large or bold text (button labels, headings) but too low for small body text. Rules: orange is for fills and accents, not for small text on white; button labels on orange are large and bold; use near-black text for anything small. Keep all colors as named constants in one theme file, never hard-coded in screens.
 
## 3. Navigation
 
Bottom tab bar with three tabs: **Home**, **History**, **Profile**. The active tab uses the brand orange.
 
The match flow (searching, proposal, chat, confirmed) is **not** a tab. It is a full-screen flow that opens on top of Home once the user goes live, and closes when the session ends.
 
## 4. Screens
 
### Home
- Greeting with the user's first name ("Hi, Sara").
- Map showing the user's own location and, once chosen, the search radius as an orange circle.
- Large orange **Go Live** button.
- Tapping Go Live opens a small sheet to pick the radius and time window, then starts the live session.
- Other users are never shown on the map. Matching is automatic, and showing people would expose where they are.
### Match flow (full screen, over Home)
1. **Searching:** status screen with a Cancel / Go Offline button and time remaining.
2. **Proposal:** the candidate's first name, description and food tastes, with Accept and Decline.
3. **Chat:** short chat to agree on place and time, with a Confirm button, plus Block / Report in a menu.
4. **Confirmed:** summary of the plan and a button to finish.
### History
- A simple list of past sessions, newest first.
- Each row: date, who you matched with (first name), and the outcome (met, declined, expired).
- Tapping a row opens a read-only detail screen (**TBD**; may be skipped in v1).
### Profile
- Shows the user's own profile: name, short description, food preferences (cuisines), dietary restrictions.
- An **Edit** button switches the screen into edit mode. Save and Cancel.
- Budget range and "happy to share dishes" (from the matching spec) are also edited here; their placement is **TBD**.
## 5. Implications for the rest of the spec
 
- `users` needs a short `bio` / description field.
- History is built from the `matches` table (and sessions that expired without a match), so those need to record an outcome.
- The Home map needs location permission and a map library.
- First-run screens (sign-up with school email and code, then profile setup) sit before the tab bar. Their design is **TBD**.
## 6. How to build it
 
Build the screens with mock data first, so the look and navigation can be judged early. Wire them to the real API afterward. Create a shared theme (colors, spacing, type) and a few reusable components (primary button, card, list row) before building individual screens.
 
## 7. Open questions
 
- Profile photos? (v1: no, name and description only.)
- App name and logo.
- Dark mode (v1: no).
- Empty and error states (no matches found, location denied, offline).
 