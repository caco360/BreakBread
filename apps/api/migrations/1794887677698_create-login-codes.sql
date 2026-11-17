-- Up Migration

-- One row per email that is currently waiting to type in a login code.
-- The row is deleted as soon as the code is used.
CREATE TABLE login_codes (
  -- PRIMARY KEY on email means at most one active code per email.
  email text PRIMARY KEY,
  -- A keyed hash of the code. The code itself is never stored.
  code_hash text NOT NULL,
  -- After this moment the code no longer works.
  expires_at timestamptz NOT NULL,
  -- How many times someone has tried a code for this email.
  attempts integer NOT NULL DEFAULT 0,
  -- When this code was requested. Used for the 60-second resend wait.
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Down Migration

DROP TABLE login_codes;
