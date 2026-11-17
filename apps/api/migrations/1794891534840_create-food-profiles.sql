-- Up Migration

-- A user's food tastes. At most one row per user; no row until they save one.
CREATE TABLE food_profiles (
  -- The user this profile belongs to. Being the PRIMARY KEY makes it unique,
  -- which is what guarantees one profile per user.
  -- ON DELETE CASCADE: if the user is deleted, their profile is deleted too.
  user_id uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  -- Tags from the fixed lists in src/profile/tags.ts, for example {japanese,pizza}.
  cuisines text[] NOT NULL,
  dietary text[] NOT NULL,
  -- "Happy to share dishes".
  likes_sharing boolean NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Down Migration

DROP TABLE food_profiles;
