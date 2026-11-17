-- Up Migration

-- A school whose students may sign up. Adding a school later is one new row.
CREATE TABLE institutions (
  -- gen_random_uuid() is built into Postgres and makes a random, unguessable id.
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  -- Every email domain that belongs to this school, for example {live.concordia.ca}.
  email_domains text[] NOT NULL
);

-- Students only: staff addresses (@concordia.ca) are deliberately not listed.
INSERT INTO institutions (name, email_domains)
VALUES ('Concordia University', ARRAY['live.concordia.ca']);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Stored trimmed and lowercased by the API. UNIQUE means one account per email.
  email text NOT NULL UNIQUE,
  -- REFERENCES means this must be the id of a real row in institutions.
  institution_id uuid NOT NULL REFERENCES institutions (id),
  -- These three are empty between "email verified" and "details filled in".
  first_name text,
  last_name text,
  age_confirmed_at timestamptz,
  -- Short description shown to a match. The database enforces the limit too,
  -- so a bug in the API can never store a longer one.
  bio text CHECK (char_length(bio) <= 200),
  -- When the user proved they own the email (their first successful code).
  verified_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Down Migration

DROP TABLE users;
DROP TABLE institutions;
