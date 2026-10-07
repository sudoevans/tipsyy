ALTER TABLE users ADD COLUMN username citext UNIQUE;
ALTER TABLE users DROP CONSTRAINT user_identity_present;
ALTER TABLE users ADD CONSTRAINT user_identity_present CHECK (
  phone IS NOT NULL OR email IS NOT NULL OR google_subject IS NOT NULL OR username IS NOT NULL
);

CREATE TABLE admin_credentials (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  password_hash text NOT NULL,
  failed_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  password_changed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE admin_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE INDEX admin_sessions_user_idx ON admin_sessions(user_id, expires_at DESC);
